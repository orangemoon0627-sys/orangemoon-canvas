import assert from "node:assert/strict";
import test from "node:test";

import { AgentPricingService } from "./agent-pricing.service";

test("Agent 计价区分普通输入、缓存输入和输出并向上取整到 0.001 积分", () => {
    const previous = captureRates();
    process.env.PLATFORM_AGENT_INPUT_CREDITS_PER_MILLION = "18.563";
    process.env.PLATFORM_AGENT_CACHED_INPUT_CREDITS_PER_MILLION = "1.857";
    process.env.PLATFORM_AGENT_OUTPUT_CREDITS_PER_MILLION = "111.375";
    try {
        const quote = new AgentPricingService().quote({ inputTokens: 1_000_000, cachedInputTokens: 250_000, outputTokens: 100_001 });
        assert.equal(quote.retailMilliCredits, 25_525n);
        assert.equal(quote.retailCredits, "25.525");
        assert.deepEqual(quote.usage, { inputTokens: 1_000_000, cachedInputTokens: 250_000, outputTokens: 100_001, totalTokens: 1_100_001 });
    } finally {
        restoreRates(previous);
    }
});

test("Agent 极小用量最低结算 0.001 积分", () => {
    assert.equal(new AgentPricingService().quote({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 }).retailMilliCredits, 1n);
});

test("Agent 缓存输入不能超过总输入", () => {
    assert.throws(() => new AgentPricingService().quote({ inputTokens: 10, cachedInputTokens: 11, outputTokens: 0 }));
});

test("Agent 结算沿用预授权时的价格快照", () => {
    const pricing = new AgentPricingService();
    const snapshot = pricing.priceSnapshot();
    const previous = process.env.PLATFORM_AGENT_OUTPUT_CREDITS_PER_MILLION;
    process.env.PLATFORM_AGENT_OUTPUT_CREDITS_PER_MILLION = "999";
    try {
        assert.equal(pricing.quote({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 1_000_000 }, snapshot).retailCredits, "111.375");
    } finally {
        restore("PLATFORM_AGENT_OUTPUT_CREDITS_PER_MILLION", previous);
    }
});

function captureRates() {
    return {
        input: process.env.PLATFORM_AGENT_INPUT_CREDITS_PER_MILLION,
        cached: process.env.PLATFORM_AGENT_CACHED_INPUT_CREDITS_PER_MILLION,
        output: process.env.PLATFORM_AGENT_OUTPUT_CREDITS_PER_MILLION,
    };
}

function restoreRates(previous: ReturnType<typeof captureRates>) {
    restore("PLATFORM_AGENT_INPUT_CREDITS_PER_MILLION", previous.input);
    restore("PLATFORM_AGENT_CACHED_INPUT_CREDITS_PER_MILLION", previous.cached);
    restore("PLATFORM_AGENT_OUTPUT_CREDITS_PER_MILLION", previous.output);
}

function restore(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}
