import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";

import type { PrismaService } from "../prisma/prisma.service";
import { CanvasMediaService, validateStorageKey } from "./canvas-media.service";

test("媒体缺失检查始终附带当前账户", async () => {
    let capturedWhere: unknown;
    const prisma = {
        canvasMedia: {
            findMany: async ({ where }: { where: unknown }) => { capturedWhere = where; return []; },
        },
    } as unknown as PrismaService;
    const missing = await new CanvasMediaService(prisma).missing("user-a", ["image:abcdefgh"]);
    assert.deepEqual(capturedWhere, { userId: "user-a", storageKey: { in: ["image:abcdefgh"] } });
    assert.deepEqual(missing, ["image:abcdefgh"]);
});

test("媒体存储编号拒绝路径穿越", () => {
    assert.throws(() => validateStorageKey("image:../../secret"), BadRequestException);
    assert.doesNotThrow(() => validateStorageKey("video:Abcdefgh_123"));
});
