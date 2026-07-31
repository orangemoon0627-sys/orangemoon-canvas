import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { MissingCanvasMediaDto } from "./canvas-media.dto";
import { CanvasMediaService, serializeCanvasMedia } from "./canvas-media.service";

@Controller("canvas-media")
@UseGuards(SessionAuthGuard)
export class CanvasMediaController {
    constructor(private readonly media: CanvasMediaService) {}

    @Post("missing")
    @HttpCode(200)
    async missing(@CurrentUser() user: AuthenticatedUser, @Body() input: MissingCanvasMediaDto) {
        return { ok: true, missing: await this.media.missing(user.id, input.keys) };
    }

    @Put(":storageKey")
    async upload(@CurrentUser() user: AuthenticatedUser, @Param("storageKey") storageKey: string, @Req() request: FastifyRequest) {
        const file = await request.file();
        if (!file) throw new BadRequestException("请选择媒体文件");
        return { ok: true, media: serializeCanvasMedia(await this.media.save(user.id, storageKey, file.mimetype, file.file)) };
    }

    @Get(":storageKey")
    async content(@CurrentUser() user: AuthenticatedUser, @Param("storageKey") storageKey: string, @Res() reply: FastifyReply) {
        const result = await this.media.open(user.id, storageKey);
        reply.header("Content-Type", result.media.mimeType);
        reply.header("Content-Length", result.media.bytes.toString());
        reply.header("Cache-Control", "private, max-age=31536000, immutable");
        return reply.send(result.stream);
    }
}
