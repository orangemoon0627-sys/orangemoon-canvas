import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { AddWorkspaceMemberDto, CreateWorkspaceDto, CreateWorkspaceInviteDto, RenameWorkspaceDto, UpdateWorkspaceMemberDto } from "./workspace.dto";
import { WorkspaceService, serializeWorkspaceMember, serializeWorkspaceMembership } from "./workspace.service";

@Controller("workspaces")
@UseGuards(SessionAuthGuard)
export class WorkspaceController {
    constructor(private readonly workspaces: WorkspaceService) {}

    @Get()
    async list(@CurrentUser() user: AuthenticatedUser) {
        return { ok: true, workspaces: (await this.workspaces.list(user.id)).map(serializeWorkspaceMembership) };
    }

    @Post()
    async create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateWorkspaceDto) {
        const workspace = await this.workspaces.create(user.id, input);
        return { ok: true, workspace: { id: workspace.publicId, name: workspace.name, kind: workspace.kind, role: "OWNER", memberCount: 1, projectCount: 0, assetCount: 0, createdAt: workspace.createdAt, updatedAt: workspace.updatedAt } };
    }

    @Get("invites/:token")
    async previewInvite(@CurrentUser() user: AuthenticatedUser, @Param("token") token: string) {
        const invite = await this.workspaces.previewInvite(user.id, token);
        return { ok: true, invite: { workspace: { id: invite.workspace.publicId, name: invite.workspace.name }, role: invite.role, email: invite.email, invitedBy: invite.createdBy.displayName, expiresAt: invite.expiresAt } };
    }

    @Post("invites/:token/accept")
    async acceptInvite(@CurrentUser() user: AuthenticatedUser, @Param("token") token: string) {
        const workspace = await this.workspaces.acceptInvite(user.id, token);
        return { ok: true, workspace: { id: workspace.publicId, name: workspace.name } };
    }

    @Patch(":workspaceId")
    async rename(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId") workspaceId: string, @Body() input: RenameWorkspaceDto) {
        const workspace = await this.workspaces.rename(user.id, workspaceId, input);
        return { ok: true, workspace: { id: workspace.publicId, name: workspace.name, kind: workspace.kind, updatedAt: workspace.updatedAt } };
    }

    @Get(":workspaceId/members")
    async members(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId") workspaceId: string) {
        const result = await this.workspaces.members(user.id, workspaceId);
        return { ok: true, role: result.access.role, members: result.members.map(serializeWorkspaceMember) };
    }

    @Post(":workspaceId/members")
    async addMember(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId") workspaceId: string, @Body() input: AddWorkspaceMemberDto) {
        return { ok: true, member: serializeWorkspaceMember(await this.workspaces.addMember(user.id, workspaceId, input)) };
    }

    @Patch(":workspaceId/members/:memberUserId")
    async updateMember(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId") workspaceId: string, @Param("memberUserId") memberUserId: string, @Body() input: UpdateWorkspaceMemberDto) {
        return { ok: true, member: serializeWorkspaceMember(await this.workspaces.updateMember(user.id, workspaceId, memberUserId, input)) };
    }

    @Delete(":workspaceId/members/:memberUserId")
    @HttpCode(200)
    async removeMember(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId") workspaceId: string, @Param("memberUserId") memberUserId: string) {
        await this.workspaces.removeMember(user.id, workspaceId, memberUserId);
        return { ok: true };
    }

    @Get(":workspaceId/invites")
    async invites(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId") workspaceId: string) {
        const invites = await this.workspaces.listInvites(user.id, workspaceId);
        return { ok: true, invites: invites.map((invite) => ({ id: invite.publicId, email: invite.email, role: invite.role, acceptedAt: invite.acceptedAt, revokedAt: invite.revokedAt, expiresAt: invite.expiresAt, createdAt: invite.createdAt })) };
    }

    @Post(":workspaceId/invites")
    async createInvite(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId") workspaceId: string, @Body() input: CreateWorkspaceInviteDto, @Headers("origin") origin?: string) {
        const result = await this.workspaces.createInvite(user.id, workspaceId, input);
        const base = String(origin || "").replace(/\/+$/, "");
        return { ok: true, invite: { id: result.invite.publicId, email: result.invite.email, role: result.invite.role, expiresAt: result.invite.expiresAt, url: `${base || ""}/team/invite/${result.token}` } };
    }

    @Delete(":workspaceId/invites/:inviteId")
    @HttpCode(200)
    async revokeInvite(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId") workspaceId: string, @Param("inviteId") inviteId: string) {
        await this.workspaces.revokeInvite(user.id, workspaceId, inviteId);
        return { ok: true };
    }
}
