import assert from "node:assert/strict";
import test from "node:test";

import { platformBodyLimitBytes, platformMaxConcurrentGenerations, validateEnvironment } from "./environment";

test("生产资源限制接受有效范围", () => {
    assert.doesNotThrow(() => validateEnvironment({
        DATABASE_URL: "postgresql://user:password@postgres:5432/orangemoon",
        PLATFORM_BODY_LIMIT_MB: "32",
        PLATFORM_MAX_CONCURRENT_GENERATIONS: "2",
    }));
});

test("生产资源限制拒绝越界值", () => {
    assert.throws(() => validateEnvironment({ DATABASE_URL: "postgresql://user:password@postgres:5432/orangemoon", PLATFORM_BODY_LIMIT_MB: "256" }));
    assert.throws(() => validateEnvironment({ DATABASE_URL: "postgresql://user:password@postgres:5432/orangemoon", PLATFORM_MAX_CONCURRENT_GENERATIONS: "0" }));
});

test("生产模式要求独立的 Agent 内部密钥", () => {
    assert.throws(() => validateEnvironment({ DATABASE_URL: "postgresql://user:password@postgres:5432/orangemoon", PLATFORM_COOKIE_SECURE: "true" }));
    assert.doesNotThrow(() => validateEnvironment({
        DATABASE_URL: "postgresql://user:password@postgres:5432/orangemoon",
        PLATFORM_COOKIE_SECURE: "true",
        CANVAS_AGENT_INTERNAL_SECRET: "a-secure-agent-secret-with-32-characters",
    }));
});

test("资源限制从环境变量转换为运行时值", () => {
    const previousBodyLimit = process.env.PLATFORM_BODY_LIMIT_MB;
    const previousConcurrency = process.env.PLATFORM_MAX_CONCURRENT_GENERATIONS;
    process.env.PLATFORM_BODY_LIMIT_MB = "32";
    process.env.PLATFORM_MAX_CONCURRENT_GENERATIONS = "2";
    try {
        assert.equal(platformBodyLimitBytes(), 32 * 1024 * 1024);
        assert.equal(platformMaxConcurrentGenerations(), 2);
    } finally {
        restoreEnvironment("PLATFORM_BODY_LIMIT_MB", previousBodyLimit);
        restoreEnvironment("PLATFORM_MAX_CONCURRENT_GENERATIONS", previousConcurrency);
    }
});

function restoreEnvironment(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}
