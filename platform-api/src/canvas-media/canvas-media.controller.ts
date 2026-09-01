import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { createReadStream } from "node:fs";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import {
  ComposeCanvasMediaDto,
  MissingCanvasMediaDto,
} from "./canvas-media.dto";
import {
  CanvasMediaService,
  serializeCanvasMedia,
} from "./canvas-media.service";

@Controller("canvas-media")
@UseGuards(SessionAuthGuard)
export class CanvasMediaController {
  constructor(private readonly media: CanvasMediaService) {}

  @Post("missing")
  @HttpCode(200)
  async missing(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-workspace-id") workspaceId: string | undefined,
    @Body() input: MissingCanvasMediaDto,
  ) {
    return {
      ok: true,
      missing: await this.media.missing(user.id, workspaceId, input.keys),
    };
  }

  @Post("compose")
  async compose(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-workspace-id") workspaceId: string | undefined,
    @Body() input: ComposeCanvasMediaDto,
  ) {
    return {
      ok: true,
      media: await this.media.composeWithAudio(
        user.id,
        workspaceId,
        input.videoStorageKey,
        input.audioStorageKey,
      ),
    };
  }

  @Put(":storageKey")
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-workspace-id") workspaceId: string | undefined,
    @Param("storageKey") storageKey: string,
    @Req() request: FastifyRequest,
  ) {
    const file = await request.file();
    if (!file) throw new BadRequestException("请选择媒体文件");
    return {
      ok: true,
      media: serializeCanvasMedia(
        await this.media.save(
          user.id,
          workspaceId,
          storageKey,
          file.mimetype,
          file.file,
        ),
      ),
    };
  }

  @Get(":storageKey")
  async content(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Query("workspaceId") workspaceQuery: string | undefined,
    @Param("storageKey") storageKey: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const result = await this.media.open(
      user.id,
      workspaceHeader || workspaceQuery,
      storageKey,
    );
    const currentVersion = result.media.checksum.trim().slice(0, 16);
    const requestVersion = mediaRequestVersion(request.url);
    if (requestVersion !== currentVersion) {
      return reply
        .code(307)
        .header(
          "Location",
          canonicalMediaRequestUrl(request.url, storageKey, result.media.checksum),
        )
        .header("Cache-Control", "no-store")
        .send();
    }
    const total = Number(result.media.bytes);
    const range = parseByteRange(request.headers.range, total);
    const etag = `"${result.media.checksum}"`;
    reply
      .header("Content-Type", result.media.mimeType)
      .header("Accept-Ranges", "bytes")
      .header("Cache-Control", "private, max-age=86400")
      .header("ETag", etag)
      .header("X-Accel-Buffering", "no")
      .header("X-Content-Type-Options", "nosniff");
    const ifNoneMatch = request.headers["if-none-match"];
    if (
      !range &&
      typeof ifNoneMatch === "string" &&
      ifNoneMatch.split(",").some((value) => value.trim() === etag)
    )
      return reply.code(304).send();
    if (!range) {
      reply.header("Content-Length", String(total));
      return reply.send(createReadStream(result.path));
    }
    if (range.invalid)
      return reply.code(416).header("Content-Range", `bytes */${total}`).send();
    reply
      .code(206)
      .header("Content-Length", String(range.end - range.start + 1))
      .header("Content-Range", `bytes ${range.start}-${range.end}/${total}`);
    return reply.send(
      createReadStream(result.path, { start: range.start, end: range.end }),
    );
  }
}

/**
 * Return the canonical, checksum-versioned media URL while preserving the
 * workspace and any future query parameters used by the media endpoint.
 *
 * The URL is intentionally built from the storage key rather than the
 * incoming pathname: old snapshots may contain a differently escaped key,
 * while the route must always emit one safe, stable encoding.
 */
export function canonicalMediaRequestUrl(
  requestUrl: string,
  storageKey: string,
  checksum: string,
) {
  const parsed = new URL(requestUrl || "/", "http://orangemoon.invalid");
  parsed.searchParams.delete("v");
  parsed.searchParams.set("v", checksum.trim().slice(0, 16));
  return `/platform-api/canvas-media/${encodeURIComponent(storageKey)}${parsed.search}`;
}

function mediaRequestVersion(requestUrl: string) {
  return (
    new URL(requestUrl || "/", "http://orangemoon.invalid").searchParams
      .get("v")
      ?.trim() || ""
  );
}

// 让浏览器一次预取更长的连续片段，降低公网播放时的请求间隙和缓冲抖动。
export const MAX_MEDIA_RANGE_BYTES = 16 * 1024 * 1024;

export function parseByteRange(
  value: string | undefined,
  total: number,
): { start: number; end: number; invalid?: false } | { invalid: true } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || total <= 0) return { invalid: true };
  const requestedStart = match[1] ? Number(match[1]) : NaN;
  const requestedEnd = match[2] ? Number(match[2]) : NaN;
  if (Number.isFinite(requestedStart)) {
    if (requestedStart >= total) return { invalid: true };
    if (Number.isFinite(requestedEnd) && requestedEnd < requestedStart)
      return { invalid: true };
    const end = Number.isFinite(requestedEnd)
      ? Math.min(requestedEnd, total - 1)
      : total - 1;
    return {
      start: requestedStart,
      end: Math.min(end, requestedStart + MAX_MEDIA_RANGE_BYTES - 1),
    };
  }
  if (!Number.isFinite(requestedEnd) || requestedEnd <= 0)
    return { invalid: true };
  const length = Math.min(requestedEnd, MAX_MEDIA_RANGE_BYTES);
  return { start: Math.max(0, total - length), end: total - 1 };
}
