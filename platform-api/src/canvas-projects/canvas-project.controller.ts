import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from "@nestjs/common";

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
    async list(@CurrentUser() user: AuthenticatedUser) {
        const projects = await this.projects.list(user.id);
        return { ok: true, projects: projects.filter((project) => !project.deletedAt).map(serializeCanvasProject), deletedProjects: projects.filter((project) => project.deletedAt).map(serializeCanvasProject) };
    }

    @Put(":publicId")
    async upsert(@CurrentUser() user: AuthenticatedUser, @Param("publicId") publicId: string, @Body() input: UpsertCanvasProjectDto) {
        return { ok: true, project: serializeCanvasProject(await this.projects.upsert(user.id, publicId, input)) };
    }

    @Delete(":publicId")
    @HttpCode(200)
    async remove(@CurrentUser() user: AuthenticatedUser, @Param("publicId") publicId: string, @Body() input: DeleteCanvasProjectDto) {
        return { ok: true, project: serializeCanvasProject(await this.projects.remove(user.id, publicId, input)) };
    }
}
