import assert from "node:assert/strict";
import test from "node:test";

import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "./ledger.service";

function knownRequestError(code: string, databaseCode?: string) {
    return new Prisma.PrismaClientKnownRequestError("transaction failed", {
        code,
        clientVersion: "6.19.0",
        ...(databaseCode ? { meta: { code: databaseCode } } : {}),
    });
}

function ledgerWithTransaction(transaction: (...args: unknown[]) => Promise<unknown>) {
    return new LedgerService({ $transaction: transaction } as unknown as PrismaService);
}

test("P2010 包装的 PostgreSQL 40001 冲突会重试并成功", async () => {
    let attempts = 0;
    const ledger = ledgerWithTransaction(async () => {
        attempts += 1;
        if (attempts === 1) throw knownRequestError("P2010", "40001");
        return "ok";
    });

    assert.equal(await ledger.runSerializable(async () => "unused"), "ok");
    assert.equal(attempts, 2);
});

test("Prisma P2034 事务冲突保持重试", async () => {
    let attempts = 0;
    const ledger = ledgerWithTransaction(async () => {
        attempts += 1;
        if (attempts === 1) throw knownRequestError("P2034");
        return "ok";
    });

    assert.equal(await ledger.runSerializable(async () => "unused"), "ok");
    assert.equal(attempts, 2);
});

test("非序列化 P2010 错误不会重试", async () => {
    let attempts = 0;
    const upstreamError = knownRequestError("P2010", "23505");
    const ledger = ledgerWithTransaction(async () => {
        attempts += 1;
        throw upstreamError;
    });

    await assert.rejects(ledger.runSerializable(async () => "unused"), (error) => error === upstreamError);
    assert.equal(attempts, 1);
});

test("可重试冲突最多执行三次并返回明确错误", async () => {
    let attempts = 0;
    const ledger = ledgerWithTransaction(async () => {
        attempts += 1;
        throw knownRequestError("P2010", "40P01");
    });

    await assert.rejects(ledger.runSerializable(async () => "unused"), ConflictException);
    assert.equal(attempts, 3);
});
