import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Put, UseGuards } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { DeleteCanvasProjectDto, UpsertCanvasProjectDto } from "./canvas-project.dto";
import { CanvasProjectService, serializeCanvasProject } from "./canvas-project.service";

@Controller("canvas-projects")
@UseGuards(SessionAuthGuard)
export class CanvasProjectController {
    constructor(private readonly projects: CanvasProjectService) {}

    @Get()
    async list(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId?: string) {
        const projects = await this.projects.list(user.id, workspaceId);
        return { ok: true, projects: projects.filter((project) => !project.deletedAt).map(serializeCanvasProject), deletedProjects: projects.filter((project) => project.deletedAt).map(serializeCanvasProject) };
    }

    @Get(":publicId")
    async get(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId: string | undefined, @Param("publicId") publicId: string) {
        return { ok: true, project: serializeCanvasProject(await this.projects.get(user.id, workspaceId, publicId)) };
    }

    @Put(":publicId")
    async upsert(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId: string | undefined, @Param("publicId") publicId: string, @Body() input: UpsertCanvasProjectDto) {
        return { ok: true, project: serializeCanvasProject(await this.projects.upsert(user.id, workspaceId, publicId, input)) };
    }

    @Delete(":publicId")
    @HttpCode(200)
    async remove(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId: string | undefined, @Param("publicId") publicId: string, @Body() input: DeleteCanvasProjectDto) {
        return { ok: true, project: serializeCanvasProject(await this.projects.remove(user.id, workspaceId, publicId, input)) };
    }
}
