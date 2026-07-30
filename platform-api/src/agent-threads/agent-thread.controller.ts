import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { AgentThreadService, serializeAgentThread } from "./agent-thread.service";
import { AgentThreadQueryDto, OpenAgentThreadDto, UpsertAgentThreadDto } from "./agent-thread.dto";

@Controller("agent/threads")
@UseGuards(SessionAuthGuard)
export class AgentThreadController {
    constructor(private readonly threads: AgentThreadService) {}

    @Get()
    async list(@CurrentUser() user: AuthenticatedUser, @Query() query: AgentThreadQueryDto) {
        const result = await this.threads.list(user.id, query);
        return { ok: true, activeThreadId: result.activeThreadId, threads: result.threads.map((thread) => serializeAgentThread(thread)) };
    }

    @Get(":publicId")
    async get(@CurrentUser() user: AuthenticatedUser, @Param("publicId") publicId: string, @Query() query: AgentThreadQueryDto) {
        return { ok: true, thread: serializeAgentThread(await this.threads.get(user.id, publicId, query.projectId), true) };
    }

    @Put(":publicId")
    async upsert(@CurrentUser() user: AuthenticatedUser, @Param("publicId") publicId: string, @Body() input: UpsertAgentThreadDto) {
        return { ok: true, thread: serializeAgentThread(await this.threads.upsert(user.id, publicId, input), true) };
    }

    @Post(":publicId/open")
    @HttpCode(200)
    async open(@CurrentUser() user: AuthenticatedUser, @Param("publicId") publicId: string, @Body() input: OpenAgentThreadDto) {
        return { ok: true, thread: serializeAgentThread(await this.threads.open(user.id, publicId, input.projectId), true) };
    }

    @Delete(":publicId")
    async remove(@CurrentUser() user: AuthenticatedUser, @Param("publicId") publicId: string, @Query() query: AgentThreadQueryDto) {
        await this.threads.remove(user.id, publicId, query.projectId);
        return { ok: true };
    }
}
