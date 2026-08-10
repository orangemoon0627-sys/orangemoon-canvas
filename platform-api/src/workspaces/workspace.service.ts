import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus, WorkspaceKind, WorkspaceRole, type Workspace, type WorkspaceMember } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import type { AddWorkspaceMemberDto, CreateWorkspaceInviteDto, CreateWorkspaceDto, RenameWorkspaceDto, UpdateWorkspaceMemberDto } from "./workspace.dto";

export type WorkspaceAccess = {
    id: string;
    publicId: string;
    name: string;
    kind: WorkspaceKind;
    role: WorkspaceRole;
};

const ROLE_RANK: Record<WorkspaceRole, number> = {
    [WorkspaceRole.VIEWER]: 0,
    [WorkspaceRole.EDITOR]: 1,
    [WorkspaceRole.ADMIN]: 2,
    [WorkspaceRole.OWNER]: 3,
};

@Injectable()
export class WorkspaceService {
    constructor(private readonly prisma: PrismaService) {}

    async list(userId: string) {
        return this.prisma.workspaceMember.findMany({
            where: { userId },
            include: { workspace: { include: { _count: { select: { members: true, canvasProjects: { where: { deletedAt: null } }, assets: true } } } } },
            orderBy: [{ workspace: { kind: "asc" } }, { workspace: { updatedAt: "desc" } }],
        });
    }

    async resolve(userId: string, requestedPublicId?: string, requiredRole: WorkspaceRole = WorkspaceRole.VIEWER): Promise<WorkspaceAccess> {
        const member = requestedPublicId
            ? await this.prisma.workspaceMember.findFirst({ where: { userId, workspace: { publicId: requestedPublicId } }, include: { workspace: true } })
            : await this.prisma.workspaceMember.findFirst({ where: { userId }, include: { workspace: true }, orderBy: [{ workspace: { kind: "asc" } }, { createdAt: "asc" }] });
        if (!member) throw new ForbiddenException(requestedPublicId ? "你不是这个团队空间的成员" : "账户尚未分配创作空间");
        requireRole(member.role, requiredRole);
        return { id: member.workspace.id, publicId: member.workspace.publicId, name: member.workspace.name, kind: member.workspace.kind, role: member.role };
    }

    async create(userId: string, input: CreateWorkspaceDto) {
        const publicId = `team_${randomBytes(12).toString("base64url")}`;
        return this.prisma.$transaction(async (tx) => {
            const workspace = await tx.workspace.create({ data: { publicId, name: input.name.trim(), kind: WorkspaceKind.TEAM, createdById: userId } });
            await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId, role: WorkspaceRole.OWNER } });
            await tx.auditLog.create({ data: { actorId: userId, action: "workspace.create", targetType: "Workspace", targetId: workspace.id, details: { publicId, name: workspace.name } } });
            return workspace;
        });
    }

    async rename(userId: string, publicId: string, input: RenameWorkspaceDto) {
        const access = await this.resolve(userId, publicId, WorkspaceRole.ADMIN);
        const workspace = await this.prisma.workspace.update({ where: { id: access.id }, data: { name: input.name.trim() } });
        await this.audit(userId, "workspace.rename", workspace.id, { name: workspace.name });
        return workspace;
    }

    async members(userId: string, publicId: string) {
        const access = await this.resolve(userId, publicId);
        const members = await this.prisma.workspaceMember.findMany({
            where: { workspaceId: access.id },
            include: { user: { select: { id: true, email: true, displayName: true, status: true, createdAt: true } } },
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        });
        return { access, members };
    }

    async addMember(userId: string, publicId: string, input: AddWorkspaceMemberDto) {
        const access = await this.resolve(userId, publicId, WorkspaceRole.ADMIN);
        this.assertTeam(access);
        const role = assignableRole(input.role);
        const target = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
        if (!target || target.status !== UserStatus.ACTIVE) throw new NotFoundException("该邮箱尚未注册或账户不可用");
        const existing = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: access.id, userId: target.id } } });
        if (existing) throw new ConflictException("该用户已经在团队中");
        const member = await this.prisma.workspaceMember.create({ data: { workspaceId: access.id, userId: target.id, role, invitedById: userId }, include: { user: true } });
        await this.audit(userId, "workspace.member.add", access.id, { memberId: target.id, role });
        return member;
    }

    async updateMember(userId: string, publicId: string, memberUserId: string, input: UpdateWorkspaceMemberDto) {
        const access = await this.resolve(userId, publicId, WorkspaceRole.ADMIN);
        this.assertTeam(access);
        const role = assignableRole(input.role);
        const current = await this.requireMember(access.id, memberUserId);
        if (current.role === WorkspaceRole.OWNER) throw new BadRequestException("空间所有者不能在这里降级");
        if (access.role === WorkspaceRole.ADMIN && current.role === WorkspaceRole.ADMIN) throw new ForbiddenException("管理员不能修改其他管理员");
        const member = await this.prisma.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: access.id, userId: memberUserId } }, data: { role }, include: { user: true } });
        await this.audit(userId, "workspace.member.role", access.id, { memberId: memberUserId, role });
        return member;
    }

    async removeMember(userId: string, publicId: string, memberUserId: string) {
        const access = await this.resolve(userId, publicId, WorkspaceRole.ADMIN);
        this.assertTeam(access);
        const current = await this.requireMember(access.id, memberUserId);
        if (current.role === WorkspaceRole.OWNER) throw new BadRequestException("不能移除空间所有者");
        if (access.role === WorkspaceRole.ADMIN && current.role === WorkspaceRole.ADMIN) throw new ForbiddenException("管理员不能移除其他管理员");
        await this.prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: access.id, userId: memberUserId } } });
        await this.audit(userId, "workspace.member.remove", access.id, { memberId: memberUserId });
    }

    async createInvite(userId: string, publicId: string, input: CreateWorkspaceInviteDto) {
        const access = await this.resolve(userId, publicId, WorkspaceRole.ADMIN);
        this.assertTeam(access);
        const role = assignableRole(input.role);
        const token = randomBytes(32).toString("base64url");
        const tokenHash = hashToken(token);
        const invite = await this.prisma.workspaceInvite.create({
            data: {
                publicId: `invite_${randomBytes(10).toString("base64url")}`,
                tokenHash,
                workspaceId: access.id,
                email: input.email.toLowerCase(),
                role,
                createdById: userId,
                expiresAt: new Date(Date.now() + 7 * 86_400_000),
            },
        });
        await this.audit(userId, "workspace.invite.create", access.id, { inviteId: invite.publicId, email: invite.email, role });
        return { invite, token };
    }

    async listInvites(userId: string, publicId: string) {
        const access = await this.resolve(userId, publicId, WorkspaceRole.ADMIN);
        return this.prisma.workspaceInvite.findMany({ where: { workspaceId: access.id }, orderBy: { createdAt: "desc" }, take: 100 });
    }

    async previewInvite(userId: string, token: string) {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        const invite = await this.prisma.workspaceInvite.findUnique({ where: { tokenHash: hashToken(token) }, include: { workspace: true, createdBy: { select: { displayName: true } } } });
        validateInvite(invite, user.email);
        return invite!;
    }

    async acceptInvite(userId: string, token: string) {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        const invite = await this.prisma.workspaceInvite.findUnique({ where: { tokenHash: hashToken(token) }, include: { workspace: true } });
        validateInvite(invite, user.email);
        return this.prisma.$transaction(async (tx) => {
            await tx.workspaceMember.upsert({
                where: { workspaceId_userId: { workspaceId: invite!.workspaceId, userId } },
                create: { workspaceId: invite!.workspaceId, userId, role: invite!.role, invitedById: invite!.createdById },
                update: {},
            });
            await tx.workspaceInvite.update({ where: { id: invite!.id }, data: { acceptedById: userId, acceptedAt: new Date() } });
            await tx.auditLog.create({ data: { actorId: userId, action: "workspace.invite.accept", targetType: "Workspace", targetId: invite!.workspaceId, details: { inviteId: invite!.publicId } } });
            return invite!.workspace;
        });
    }

    async revokeInvite(userId: string, publicId: string, invitePublicId: string) {
        const access = await this.resolve(userId, publicId, WorkspaceRole.ADMIN);
        const result = await this.prisma.workspaceInvite.updateMany({ where: { publicId: invitePublicId, workspaceId: access.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
        if (!result.count) throw new NotFoundException("邀请不存在或已经失效");
        await this.audit(userId, "workspace.invite.revoke", access.id, { inviteId: invitePublicId });
    }

    private assertTeam(access: WorkspaceAccess) {
        if (access.kind !== WorkspaceKind.TEAM) throw new BadRequestException("个人空间不能添加团队成员");
    }

    private async requireMember(workspaceId: string, userId: string) {
        const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
        if (!member) throw new NotFoundException("团队成员不存在");
        return member;
    }

    private audit(actorId: string, action: string, targetId: string, details: Prisma.InputJsonValue) {
        return this.prisma.auditLog.create({ data: { actorId, action, targetType: "Workspace", targetId, details } });
    }
}

export function serializeWorkspaceMembership(member: WorkspaceMember & { workspace: Workspace & { _count?: { members: number; canvasProjects: number; assets: number } } }) {
    return {
        id: member.workspace.publicId,
        name: member.workspace.name,
        kind: member.workspace.kind,
        role: member.role,
        memberCount: member.workspace._count?.members || 0,
        projectCount: member.workspace._count?.canvasProjects || 0,
        assetCount: member.workspace._count?.assets || 0,
        createdAt: member.workspace.createdAt,
        updatedAt: member.workspace.updatedAt,
    };
}

export function serializeWorkspaceMember(member: WorkspaceMember & { user: { id: string; email: string; displayName: string; status: UserStatus; createdAt: Date } }) {
    return { userId: member.user.id, email: member.user.email, displayName: member.user.displayName, status: member.user.status, role: member.role, joinedAt: member.createdAt };
}

function requireRole(actual: WorkspaceRole, required: WorkspaceRole) {
    if (ROLE_RANK[actual] < ROLE_RANK[required]) throw new ForbiddenException(required === WorkspaceRole.VIEWER ? "你无权访问这个空间" : required === WorkspaceRole.EDITOR ? "你在这个空间中只有查看权限" : "只有空间管理员可以执行此操作");
}

function assignableRole(role: WorkspaceRole) {
    if (role === WorkspaceRole.OWNER) throw new BadRequestException("不能通过邀请直接转移空间所有权");
    return role;
}

function hashToken(token: string) {
    if (!/^[A-Za-z0-9_-]{32,160}$/.test(token)) throw new BadRequestException("邀请链接无效");
    return createHash("sha256").update(token).digest("hex");
}

function validateInvite(invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date; email: string } | null, userEmail: string) {
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt.getTime() <= Date.now()) throw new NotFoundException("邀请不存在或已经失效");
    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) throw new ForbiddenException("请使用受邀邮箱登录后接受邀请");
}
