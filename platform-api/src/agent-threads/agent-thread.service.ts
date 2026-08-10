import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, WorkspaceRole, type AgentThread } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import type { AgentThreadQueryDto, UpsertAgentThreadDto } from "./agent-thread.dto";
import { WorkspaceService } from "../workspaces/workspace.service";

const AGENT_ROLES = new Set(["user", "assistant", "tool", "error", "system"]);

@Injectable()
export class AgentThreadService {
    constructor(private readonly prisma: PrismaService, private readonly workspaces: WorkspaceService) {}

    async list(userId: string, workspacePublicId: string | undefined, query: AgentThreadQueryDto) {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId);
        const search = query.search?.trim();
        const where: Prisma.AgentThreadWhereInput = {
            workspaceId: workspace.id,
            projectId: query.projectId,
            ...(search ? { OR: [{ preview: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}),
        };
        const [threads, active] = await Promise.all([
            this.prisma.agentThread.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 40 }),
            this.prisma.agentThread.findFirst({ where: { workspaceId: workspace.id, projectId: query.projectId }, orderBy: [{ lastOpenedAt: "desc" }, { updatedAt: "desc" }] }),
        ]);
        return { threads, activeThreadId: active?.publicId || "" };
    }

    async get(userId: string, workspacePublicId: string | undefined, publicId: string, projectId: string, touch = true) {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId);
        const thread = await this.findAccessible(workspace.id, publicId, projectId);
        if (!touch) return thread;
        return this.prisma.agentThread.update({ where: { id: thread.id }, data: { lastOpenedAt: new Date() } });
    }

    async upsert(userId: string, workspacePublicId: string | undefined, publicId: string, input: UpsertAgentThreadDto) {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId, WorkspaceRole.EDITOR);
        const existing = await this.prisma.agentThread.findUnique({ where: { publicId } });
        if (existing && existing.workspaceId !== workspace.id) throw new ConflictException("对话编号已被占用");
        if (existing && existing.projectId !== input.projectId) throw new ConflictException("对话不属于当前画布");
        const data = {
            preview: input.preview?.trim().slice(0, 240) || "",
            name: input.name?.trim().slice(0, 160) || null,
            messages: normalizeMessages(input.messages) as Prisma.InputJsonValue,
            history: normalizeHistory(input.history) as Prisma.InputJsonValue,
            lastOpenedAt: new Date(),
        };
        return this.prisma.agentThread.upsert({
            where: { publicId },
            create: { publicId, userId, workspaceId: workspace.id, projectId: input.projectId, ...data },
            update: data,
        });
    }

    async open(userId: string, workspacePublicId: string | undefined, publicId: string, projectId: string) {
        return this.get(userId, workspacePublicId, publicId, projectId, true);
    }

    async remove(userId: string, workspacePublicId: string | undefined, publicId: string, projectId: string) {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId, WorkspaceRole.EDITOR);
        const thread = await this.findAccessible(workspace.id, publicId, projectId);
        await this.prisma.agentThread.delete({ where: { id: thread.id } });
    }

    private async findAccessible(workspaceId: string, publicId: string, projectId: string) {
        const thread = await this.prisma.agentThread.findUnique({ where: { publicId } });
        if (!thread || thread.workspaceId !== workspaceId || thread.projectId !== projectId) throw new NotFoundException("对话记录不存在");
        return thread;
    }
}

export function serializeAgentThread(thread: AgentThread, includeContent = false) {
    return {
        id: thread.publicId,
        preview: thread.preview,
        name: thread.name,
        status: "active",
        source: "orangemoon-cloud",
        createdAt: Math.floor(thread.createdAt.getTime() / 1000),
        updatedAt: Math.floor(thread.updatedAt.getTime() / 1000),
        ...(includeContent ? { messages: thread.messages, history: thread.history } : {}),
    };
}

export function normalizeMessages(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.slice(-120).map((item, index) => {
        if (!item || typeof item !== "object") throw new BadRequestException(`第 ${index + 1} 条对话消息格式无效`);
        const record = item as Record<string, unknown>;
        const role = String(record.role || "");
        if (!AGENT_ROLES.has(role)) throw new BadRequestException(`第 ${index + 1} 条对话消息角色无效`);
        const text = boundedText(record.text, 60_000);
        return {
            id: boundedText(record.id, 180) || `message-${index}`,
            role,
            ...(boundedText(record.title, 160) ? { title: boundedText(record.title, 160) } : {}),
            text,
            ...(boundedText(record.meta, 160) ? { meta: boundedText(record.meta, 160) } : {}),
            ...(Array.isArray(record.attachments) ? { attachments: normalizeAttachments(record.attachments) } : {}),
        };
    });
}

export function normalizeHistory(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.slice(-16).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
        const content = boundedText(record.content, 60_000);
        return role && content ? [{ role, content }] : [];
    });
}

function normalizeAttachments(value: unknown[]) {
    return value.slice(0, 6).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        return [{
            id: boundedText(record.id, 180),
            name: boundedText(record.name, 240) || "图片",
            type: boundedText(record.type, 120) || "image/png",
            size: boundedNumber(record.size),
            width: boundedNumber(record.width),
            height: boundedNumber(record.height),
        }];
    });
}

function boundedText(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function boundedNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
