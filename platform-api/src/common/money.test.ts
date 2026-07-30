import assert from "node:assert/strict";
import test from "node:test";

import { formatMilliCredits, milliCreditsToFen, parseCredits } from "./money";

test("积分金额使用整数厘并保留两位充值精度", () => {
    assert.equal(parseCredits("25.50"), 25_500n);
    assert.equal(parseCredits("-1.25", { signed: true }), -1_250n);
    assert.equal(milliCreditsToFen(25_500n), 2_550);
    assert.equal(formatMilliCredits(25_500n), "25.5");
    assert.equal(formatMilliCredits(-1_250n), "-1.25");
});

test("积分金额拒绝浮点精度和范围错误", () => {
    assert.throws(() => parseCredits("1.001"));
    assert.throws(() => parseCredits("-1"));
    assert.throws(() => parseCredits("1000000"));
    assert.throws(() => milliCreditsToFen(1_001n));
});

test("管理员调账可精确到一厘，充值仍限制为分", () => {
    assert.equal(parseCredits("0.099", { signed: true, minimumMilli: 1n, decimalPlaces: 3 }), 99n);
    assert.equal(parseCredits("-0.001", { signed: true, minimumMilli: 1n, decimalPlaces: 3 }), -1n);
    assert.throws(() => parseCredits("0.099"));
});
