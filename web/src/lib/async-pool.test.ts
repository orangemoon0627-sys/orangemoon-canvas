import assert from "node:assert/strict";
import test from "node:test";

import { allSettledWithConcurrency, mapWithConcurrency } from "./async-pool";

test("并发池限制峰值并保持结果顺序", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 5, 20, 1], 2, async (delay, index) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, delay));
        active -= 1;
        return index;
    });

    assert.equal(peak, 2);
    assert.deepEqual(results, [0, 1, 2, 3]);
});

test("受限并发的 settled 模式保留部分成功结果", async () => {
    const results = await allSettledWithConcurrency(
        [async () => "first", async () => { throw new Error("failed"); }, async () => "third"],
        2,
    );

    assert.equal(results[0]?.status, "fulfilled");
    assert.equal(results[1]?.status, "rejected");
    assert.equal(results[2]?.status, "fulfilled");
});
