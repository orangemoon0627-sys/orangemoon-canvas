import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import { createReadStream } from "node:fs";
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
    async missing(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId: string | undefined, @Body() input: MissingCanvasMediaDto) {
        return { ok: true, missing: await this.media.missing(user.id, workspaceId, input.keys) };
    }

    @Put(":storageKey")
    async upload(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId: string | undefined, @Param("storageKey") storageKey: string, @Req() request: FastifyRequest) {
        const file = await request.file();
        if (!file) throw new BadRequestException("请选择媒体文件");
        return { ok: true, media: serializeCanvasMedia(await this.media.save(user.id, workspaceId, storageKey, file.mimetype, file.file)) };
    }

    @Get(":storageKey")
    async content(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceHeader: string | undefined, @Query("workspaceId") workspaceQuery: string | undefined, @Param("storageKey") storageKey: string, @Req() request: FastifyRequest, @Res() reply: FastifyReply) {
        const result = await this.media.open(user.id, workspaceHeader || workspaceQuery, storageKey);
        const total = Number(result.media.bytes);
        const range = parseByteRange(request.headers.range, total);
        reply
            .header("Content-Type", result.media.mimeType)
            .header("Accept-Ranges", "bytes")
            .header("Cache-Control", "private, max-age=31536000, immutable")
            .header("X-Content-Type-Options", "nosniff");
        if (!range) {
            reply.header("Content-Length", String(total));
            return reply.send(createReadStream(result.path));
        }
        if (range.invalid) return reply.code(416).header("Content-Range", `bytes */${total}`).send();
        reply
            .code(206)
            .header("Content-Length", String(range.end - range.start + 1))
            .header("Content-Range", `bytes ${range.start}-${range.end}/${total}`);
        return reply.send(createReadStream(result.path, { start: range.start, end: range.end }));
    }
}

export function parseByteRange(value: string | undefined, total: number): { start: number; end: number; invalid?: false } | { invalid: true } | null {
    if (!value) return null;
    const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
    if (!match || total <= 0) return { invalid: true };
    const requestedStart = match[1] ? Number(match[1]) : NaN;
    const requestedEnd = match[2] ? Number(match[2]) : NaN;
    if (Number.isFinite(requestedStart)) {
        if (requestedStart >= total) return { invalid: true };
        if (Number.isFinite(requestedEnd) && requestedEnd < requestedStart) return { invalid: true };
        return { start: requestedStart, end: Number.isFinite(requestedEnd) ? Math.min(requestedEnd, total - 1) : total - 1 };
    }
    if (!Number.isFinite(requestedEnd) || requestedEnd <= 0) return { invalid: true };
    return { start: Math.max(0, total - requestedEnd), end: total - 1 };
}
