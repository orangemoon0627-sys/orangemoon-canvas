import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";

import type { PrismaService } from "../prisma/prisma.service";
import type { WorkspaceService } from "../workspaces/workspace.service";
import { buildAudioMuxArguments, CanvasMediaService, validateMimeType, validateStorageKey } from "./canvas-media.service";

const workspaces = { resolve: async () => ({ id: "workspace-a" }) } as unknown as WorkspaceService;

test("媒体缺失检查始终附带当前空间", async () => {
    let capturedWhere: unknown;
    const prisma = {
        canvasMedia: {
            findMany: async ({ where }: { where: unknown }) => { capturedWhere = where; return []; },
        },
    } as unknown as PrismaService;
    const missing = await new CanvasMediaService(prisma, workspaces).missing("user-a", "team-a", ["image:abcdefgh"]);
    assert.deepEqual(capturedWhere, { workspaceId: "workspace-a", storageKey: { in: ["image:abcdefgh"] } });
    assert.deepEqual(missing, ["image:abcdefgh"]);
});

test("媒体存储编号拒绝路径穿越", () => {
    assert.throws(() => validateStorageKey("image:../../secret"), BadRequestException);
    assert.doesNotThrow(() => validateStorageKey("video:Abcdefgh_123"));
});

test("导演台允许 GLB 和 GLTF 模型媒体", () => {
    assert.doesNotThrow(() => validateMimeType("model/gltf-binary"));
    assert.doesNotThrow(() => validateMimeType("model/gltf+json"));
    assert.throws(() => validateMimeType("text/html"), BadRequestException);
});

test("音视频合成保留视频画面并让音频覆盖视频时长", () => {
    assert.deepEqual(buildAudioMuxArguments("/tmp/input.mp4", "/tmp/music.mp3", "/tmp/output.mp4"), [
        "-hide_banner",
        "-loglevel",
        "error",
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
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-af",
        "aresample=async=1:first_pts=0",
        "-shortest",
        "-movflags",
        "+faststart",
        "/tmp/output.mp4",
    ]);
});
