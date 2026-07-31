import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaService } from "../prisma/prisma.service";
import { findProviderModel } from "./provider-catalog";
import { PricingService } from "./pricing.service";

const pricing = new PricingService({} as PrismaService);

process.env.PLATFORM_METAJING_USD_TO_CNY = "1";
process.env.PLATFORM_MINIMAX_USD_TO_CNY = "7.3";
process.env.PLATFORM_PRICE_MARKUP = "1.65";

test("MetaJing 按额度 1:1、MiniMax 按 7.3 汇率分别计价", () => {
    const image = pricing.quote(findProviderModel("gpt-image-2")!, 1);
    const audio = pricing.quote(findProviderModel("speech-2.8-turbo")!, 1_000);
    assert.equal(image.upstreamCny, 0.06);
    assert.equal(image.usdToCny, 1);
    assert.equal(image.retailMilliCredits, 99n);
    assert.equal(image.retailCredits, "0.099");
    assert.equal(image.grossMargin, 0.3939);
    assert.equal(audio.upstreamCny, 0.438);
    assert.equal(audio.usdToCny, 7.3);
    assert.equal(audio.retailMilliCredits, 723n);
});

test("Seedance 按时长计费，固定条目不重复乘时长", () => {
    const fast = pricing.quote(findProviderModel("seedance-2.0-720p-economy")!, 5);
    const fixed = pricing.quote(findProviderModel("mg-seedance2.0 -720p-mini-gz-15s")!, 15);
    assert.equal(fast.retailCredits, "0.825");
    assert.equal(fixed.retailCredits, "4.752");
    assert.equal(fixed.quantity, 1);
});

test("旧清衍模型保持可计价，公开 Fast 档使用当前 MetaJing 费率", () => {
    const standard720 = findProviderModel("seedance-2.0-720p-standard")!;
    const fast480 = findProviderModel("seedance-2.0-480p-fast")!;
    assert.equal(standard720.upstreamModel, "qy-seedance-2.0");
    assert.equal(pricing.quote(standard720, 15).retailCredits, "6.6");
    assert.equal(pricing.quote(fast480, 5).retailCredits, "1.362");
});

test("720P Pro 15 秒售价固定在 9.9 积分并反推统一毛利率", () => {
    const pro720 = pricing.quote(findProviderModel("seedance-2.0-720p-pro")!, 15);
    assert.equal(pro720.upstreamCny, 6);
    assert.equal(pro720.retailCredits, "9.9");
    assert.equal(pro720.grossMargin, 0.3939);
    assert.equal(pricing.targetGrossMargin(), 0.3939);
});
