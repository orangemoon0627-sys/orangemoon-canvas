import assert from "node:assert/strict";
import test from "node:test";

import { GenerationStatus, type GenerationJob } from "@prisma/client";

import type { PrismaService } from "../prisma/prisma.service";
import type { LedgerService } from "../wallet/ledger.service";
import { GenerationService } from "./generation.service";
import type { PricingService } from "./pricing.service";
import type { ProviderUpstreamService } from "./provider-upstream.service";
import type { WorkspaceService } from "../workspaces/workspace.service";

const workspaces = {} as WorkspaceService;

function submittedVideoJob(): GenerationJob {
    const now = new Date("2026-07-31T00:00:00.000Z");
    return {
        id: "job-1",
        publicId: "GEN-VIDEO-1",
        userId: "user-1",
        capability: "video",
        model: "qy-seedance-2.0",
        status: GenerationStatus.SUBMITTED,
        idempotencyKey: "video-request-1",
        reservedMilliCredits: 9900n,
        chargedMilliCredits: 0n,
        providerTaskId: "provider-task-1",
        providerState: "processing",
        error: null,
        requestSummary: {},
        priceSnapshot: {},
        createdAt: now,
        updatedAt: now,
        settledAt: null,
    };
}

test("后台对账在供应商成功后结算积分并登记视频资产", async () => {
    const job = submittedVideoJob();
    const updates: unknown[] = [];
    const assets: unknown[] = [];
    let settled = 0;
    const tx = {
        generationJob: {
            findUniqueOrThrow: async () => job,
            update: async (args: unknown) => {
                updates.push(args);
                return job;
            },
        },
    };
    const prisma = {
        generationJob: {
            findMany: async () => [job],
        },
        asset: {
            upsert: async (args: unknown) => {
                assets.push(args);
                return { publicId: "AST-VIDEO-1", ordinal: 0 };
            },
        },
    } as unknown as PrismaService;
    const ledger = {
        runSerializable: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
        settleInTransaction: async (_transaction: unknown, input: { reservedMilli: bigint; chargedMilli: bigint }) => {
            settled += 1;
            assert.equal(input.reservedMilli, 9900n);
            assert.equal(input.chargedMilli, 9900n);
        },
    } as unknown as LedgerService;
    const upstream = {
        pollVideo: async () => ({ state: "success", progress: "100%", result_url: "https://cdn.example.com/result.mp4" }),
    } as unknown as ProviderUpstreamService;
    const service = new GenerationService(prisma, ledger, {} as PricingService, upstream, workspaces);

    await service.reconcileSubmittedVideos();

    assert.equal(settled, 1);
    assert.equal(updates.length, 1);
    assert.equal((updates[0] as { data: { status: GenerationStatus } }).data.status, GenerationStatus.SUCCEEDED);
    assert.equal(assets.length, 1);
    assert.equal((assets[0] as { create: { data: { url: string } } }).create.data.url, "https://cdn.example.com/result.mp4");
});

test("后台查询暂时失败时保留预授权，不结算也不退款", async () => {
    const job = submittedVideoJob();
    let transactionAttempts = 0;
    const prisma = {
        generationJob: { findMany: async () => [job] },
        asset: { upsert: async () => assert.fail("查询失败时不应登记资产") },
    } as unknown as PrismaService;
    const ledger = {
        runSerializable: async () => {
            transactionAttempts += 1;
            assert.fail("查询失败时不应改动积分");
        },
    } as unknown as LedgerService;
    const upstream = {
        pollVideo: async () => {
            throw new Error("temporary upstream timeout");
        },
    } as unknown as ProviderUpstreamService;
    const service = new GenerationService(prisma, ledger, {} as PricingService, upstream, workspaces);

    await service.reconcileSubmittedVideos();

    assert.equal(transactionAttempts, 0);
});

test("视频资产暂时无法登记时保留任务待重试，不提前扣费", async () => {
    const job = submittedVideoJob();
    let transactionAttempts = 0;
    const prisma = {
        generationJob: { findMany: async () => [job] },
        asset: { upsert: async () => { throw new Error("temporary database error"); } },
    } as unknown as PrismaService;
    const ledger = {
        runSerializable: async () => {
            transactionAttempts += 1;
            assert.fail("资产尚未登记时不应结算积分");
        },
    } as unknown as LedgerService;
    const upstream = {
        pollVideo: async () => ({ state: "success", result_url: "https://cdn.example.com/result.mp4" }),
    } as unknown as ProviderUpstreamService;
    const service = new GenerationService(prisma, ledger, {} as PricingService, upstream, workspaces);

    await service.reconcileSubmittedVideos();

    assert.equal(transactionAttempts, 0);
});
