import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, WorkspaceRole, type CanvasProject } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import type { DeleteCanvasProjectDto, UpsertCanvasProjectDto } from "./canvas-project.dto";
import { WorkspaceService } from "../workspaces/workspace.service";

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{8,160}$/;
const MAX_PROJECT_JSON_BYTES = 8 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CanvasProjectService {
    constructor(private readonly prisma: PrismaService, private readonly workspaces: WorkspaceService) {}

    async list(userId: string, workspacePublicId?: string) {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId);
        return this.prisma.canvasProject.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ clientUpdatedAt: "desc" }, { id: "desc" }], take: 500 });
    }

    async get(userId: string, workspacePublicId: string | undefined, publicId: string) {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId);
        validatePublicId(publicId);
        const project = await this.prisma.canvasProject.findUnique({ where: { workspaceId_publicId: { workspaceId: workspace.id, publicId } } });
        if (!project) throw new NotFoundException("画布不存在");
        return project;
    }

    async upsert(userId: string, workspacePublicId: string | undefined, publicId: string, input: UpsertCanvasProjectDto): Promise<CanvasProject> {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId, WorkspaceRole.EDITOR);
        validatePublicId(publicId);
        validatePayloadSize(input.data);
        const clientCreatedAt = parseClientDate(input.createdAt, "创建时间");
        const clientUpdatedAt = parseClientDate(input.updatedAt, "更新时间");
        if (clientCreatedAt.getTime() > clientUpdatedAt.getTime()) throw new BadRequestException("画布创建时间不能晚于更新时间");

        const where = { workspaceId_publicId: { workspaceId: workspace.id, publicId } };
        const data = {
            title: input.title.trim() || "未命名画布",
            data: input.data as Prisma.InputJsonValue,
            clientCreatedAt,
            clientUpdatedAt,
            deletedAt: null,
        };
        const updated = await this.prisma.canvasProject.updateMany({
            where: { workspaceId: workspace.id, publicId, clientUpdatedAt: { lt: clientUpdatedAt } },
            data,
        });
        if (updated.count) return this.requireProject(where);

        const existing = await this.prisma.canvasProject.findUnique({ where });
        if (existing) return existing;
        try {
            return await this.prisma.canvasProject.create({ data: { userId, workspaceId: workspace.id, publicId, ...data } });
        } catch (error) {
            if (isUniqueConstraintError(error)) return this.upsert(userId, workspacePublicId, publicId, input);
            throw error;
        }
    }

    async remove(userId: string, workspacePublicId: string | undefined, publicId: string, input: DeleteCanvasProjectDto): Promise<CanvasProject> {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId, WorkspaceRole.EDITOR);
        validatePublicId(publicId);
        const deletedAt = parseClientDate(input.deletedAt, "删除时间");
        const where = { workspaceId_publicId: { workspaceId: workspace.id, publicId } };
        const updated = await this.prisma.canvasProject.updateMany({
            where: { workspaceId: workspace.id, publicId, clientUpdatedAt: { lte: deletedAt } },
            data: { clientUpdatedAt: deletedAt, deletedAt },
        });
        if (updated.count) return this.requireProject(where);

        const existing = await this.prisma.canvasProject.findUnique({ where });
        if (existing) return existing;
        try {
            return await this.prisma.canvasProject.create({
                data: { userId, workspaceId: workspace.id, publicId, title: "已删除画布", data: {}, clientCreatedAt: deletedAt, clientUpdatedAt: deletedAt, deletedAt },
            });
        } catch (error) {
            if (isUniqueConstraintError(error)) return this.remove(userId, workspacePublicId, publicId, input);
            throw error;
        }
    }

    private async requireProject(where: { workspaceId_publicId: { workspaceId: string; publicId: string } }) {
        const project = await this.prisma.canvasProject.findUnique({ where });
        if (!project) throw new Error("画布原子更新后未能读回记录");
        return project;
    }
}

export function serializeCanvasProject(project: CanvasProject) {
    return {
        id: project.publicId,
        title: project.title,
        createdAt: project.clientCreatedAt,
        updatedAt: project.clientUpdatedAt,
        deletedAt: project.deletedAt,
        ...(project.deletedAt ? {} : { data: project.data }),
    };
}

function validatePublicId(publicId: string) {
    if (!PUBLIC_ID_PATTERN.test(publicId)) throw new BadRequestException("画布编号格式无效");
}

function validatePayloadSize(data: Record<string, unknown>) {
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > MAX_PROJECT_JSON_BYTES) {
        throw new BadRequestException("单个画布数据不能超过 8MB，请勿把图片或视频内容直接写入画布 JSON");
    }
}

function parseClientDate(value: string, label: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${label}无效`);
    if (date.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) throw new BadRequestException(`${label}超出允许范围`);
    return date;
}

function isUniqueConstraintError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
