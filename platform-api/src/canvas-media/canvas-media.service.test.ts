import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";

import type { PrismaService } from "../prisma/prisma.service";
import type { WorkspaceService } from "../workspaces/workspace.service";
import {
  buildAudioMuxArguments,
  buildVideoPlaybackArguments,
  canvasMediaUrl,
  CanvasMediaService,
  needsVideoPlaybackOptimization,
  validateMimeType,
  validateStorageKey,
} from "./canvas-media.service";

const workspaces = {
  resolve: async () => ({ id: "workspace-a" }),
} as unknown as WorkspaceService;

test("媒体缺失检查始终附带当前空间", async () => {
  let capturedWhere: unknown;
  const prisma = {
    canvasMedia: {
      findMany: async ({ where }: { where: unknown }) => {
        capturedWhere = where;
        return [];
      },
    },
  } as unknown as PrismaService;
  const missing = await new CanvasMediaService(prisma, workspaces).missing(
    "user-a",
    "team-a",
    ["image:abcdefgh"],
  );
  assert.deepEqual(capturedWhere, {
    workspaceId: "workspace-a",
    storageKey: { in: ["image:abcdefgh"] },
  });
  assert.deepEqual(missing, ["image:abcdefgh"]);
});

test("媒体存储编号拒绝路径穿越", () => {
  assert.throws(
    () => validateStorageKey("image:../../secret"),
    BadRequestException,
  );
  assert.doesNotThrow(() => validateStorageKey("video:Abcdefgh_123"));
});

test("导演台允许 GLB 和 GLTF 模型媒体", () => {
  assert.doesNotThrow(() => validateMimeType("model/gltf-binary"));
  assert.doesNotThrow(() => validateMimeType("model/gltf+json"));
  assert.throws(() => validateMimeType("text/html"), BadRequestException);
});

test("音视频合成保留视频画面并让音频覆盖视频时长", () => {
  assert.deepEqual(
    buildAudioMuxArguments(
      "/tmp/input.mp4",
      "/tmp/music.mp3",
      "/tmp/output.mp4",
    ),
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-i",
      "/tmp/input.mp4",
      "-stream_loop",
      "-1",
      "-i",
      "/tmp/music.mp3",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-threads",
      "2",
      "-b:v",
      "4M",
      "-maxrate",
      "4.5M",
      "-bufsize",
      "9M",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-tag:v",
      "avc1",
      "-fps_mode",
      "cfr",
      "-g",
      "60",
      "-keyint_min",
      "1",
      "-sc_threshold",
      "0",
      "-force_key_frames",
      "expr:gte(t,n_forced*2)",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-af",
      "aresample=async=1:first_pts=0",
      "-shortest",
      "-movflags",
      "+faststart",
      "/tmp/output.mp4",
    ],
  );
});

test("在线播放转码使用低码率 H.264、CFR、短关键帧和受控线程", () => {
  assert.deepEqual(
    buildVideoPlaybackArguments("/tmp/input.mp4", "/tmp/output.mp4"),
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-i",
      "/tmp/input.mp4",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-threads",
      "2",
      "-b:v",
      "4M",
      "-maxrate",
      "4.5M",
      "-bufsize",
      "9M",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-tag:v",
      "avc1",
      "-fps_mode",
      "cfr",
      "-g",
      "60",
      "-keyint_min",
      "1",
      "-sc_threshold",
      "0",
      "-force_key_frames",
      "expr:gte(t,n_forced*2)",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-shortest",
      "-movflags",
      "+faststart",
      "/tmp/output.mp4",
    ],
  );
});

test("只有不适合在线播放的视频才需要转码", () => {
  assert.equal(
    needsVideoPlaybackOptimization({
      codecName: "h264",
      pixelFormat: "yuv420p",
      bitRate: 4_000_000,
    }),
    false,
  );
  assert.equal(
    needsVideoPlaybackOptimization({
      codecName: "h264",
      pixelFormat: "yuv420p",
      bitRate: 9_700_000,
    }),
    true,
  );
  assert.equal(
    needsVideoPlaybackOptimization({
      codecName: "hevc",
      pixelFormat: "yuv420p",
      bitRate: 2_000_000,
    }),
    true,
  );
  assert.equal(
    needsVideoPlaybackOptimization({
      codecName: "h264",
      pixelFormat: "yuv444p",
      bitRate: 2_000_000,
    }),
    true,
  );
  assert.equal(
    needsVideoPlaybackOptimization({
      codecName: "h264",
      pixelFormat: "yuv420p",
    }),
    true,
  );
});

test("媒体 URL 使用 checksum 版本避免旧缓存复用", () => {
  assert.equal(
    canvasMediaUrl("video:Abcdefgh_123", "abcdef0123456789fedcba98765432100"),
    "/platform-api/canvas-media/video%3AAbcdefgh_123?v=abcdef0123456789",
  );
  assert.equal(
    canvasMediaUrl("video:Abcdefgh_123"),
    "/platform-api/canvas-media/video%3AAbcdefgh_123",
  );
});

test("视频媒体可用同一存储编号替换旧的高码率文件", async () => {
  const previousMediaDir = process.env.PLATFORM_MEDIA_DIR;
  const mediaDir = await mkdtemp(join(tmpdir(), "orangemoon-media-test-"));
  const userId = "user-a";
  const storageKey = "video:replace_12345678";
  const digest = createHash("sha256")
    .update(`${userId}\0${storageKey}`)
    .digest("hex");
  const target = join(mediaDir, digest.slice(0, 2), digest);
  await mkdir(join(mediaDir, digest.slice(0, 2)), { recursive: true });
  await writeFile(target, "old-video");
  let upserted = false;
  const prisma = {
    canvasMedia: {
      findUnique: async () => ({
        userId,
        workspaceId: "workspace-a",
        storageKey,
        mimeType: "video/mp4",
        bytes: BigInt(9),
        checksum: "old-checksum",
      }),
      upsert: async ({ update }: { update: { bytes: number; checksum: string } }) => {
        upserted = true;
        return {
          userId,
          workspaceId: "workspace-a",
          storageKey,
          mimeType: "video/mp4",
          bytes: BigInt(update.bytes),
          checksum: update.checksum,
        };
      },
    },
  } as unknown as PrismaService;

  process.env.PLATFORM_MEDIA_DIR = mediaDir;
  try {
    await new CanvasMediaService(prisma, workspaces).saveBufferForWorkspace(
      userId,
      "workspace-a",
      storageKey,
      "video/mp4",
      Buffer.from("new-video"),
      { replaceExisting: true },
    );
    assert.equal(await readFile(target, "utf8"), "new-video");
    assert.equal(upserted, true);
  } finally {
    if (previousMediaDir === undefined) delete process.env.PLATFORM_MEDIA_DIR;
    else process.env.PLATFORM_MEDIA_DIR = previousMediaDir;
    await rm(mediaDir, { recursive: true, force: true });
  }
});
