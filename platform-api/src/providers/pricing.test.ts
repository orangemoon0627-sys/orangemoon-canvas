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

test("四个独家视频 API 按官方每秒费率计费", () => {
    const fast431 = findProviderModel("431-Seedream-2.0-fast")!;
    const standard431 = findProviderModel("431-Seedream-2.0")!;
    const qyFast = findProviderModel("qy-seedance-2.0-fast")!;
    const qy = findProviderModel("qy-seedance-2.0")!;

    assert.equal(pricing.quote(qyFast, 1, "480p").retailCredits, "0.275");
    assert.equal(pricing.quote(qyFast, 1, "720p").retailCredits, "0.33");
    assert.equal(pricing.quote(qy, 1, "480p").retailCredits, "0.33");
    assert.equal(pricing.quote(qy, 1, "720p").retailCredits, "0.44");
    assert.equal(pricing.quote(qy, 1, "1080p").retailCredits, "0.99");
    assert.equal(pricing.quote(qyFast, 5, "480p").retailCredits, "1.375");
    assert.equal(pricing.quote(qyFast, 5, "720p").retailCredits, "1.65");
    assert.equal(pricing.quote(qy, 15, "720p").retailCredits, "6.6");
    assert.equal(pricing.quote(qy, 15, "1080p").retailCredits, "14.85");
    assert.equal(pricing.quote(fast431, 1, "480p").retailCredits, "0.225");
    assert.equal(pricing.quote(fast431, 1, "720p").retailCredits, "0.312");
    assert.equal(pricing.quote(standard431, 1, "480p").retailCredits, "0.245");
    assert.equal(pricing.quote(standard431, 1, "720p").retailCredits, "0.355");
    assert.equal(pricing.quote(fast431, 14, "720p").retailCredits, "4.366");
    assert.equal(pricing.quote(standard431, 14, "720p").retailCredits, "4.967");
});

test("不支持的分辨率不能报价", () => {
    const qyFast = findProviderModel("qy-seedance-2.0-fast")!;
    assert.throws(() => pricing.quote(qyFast, 5, "1080p"), /不支持 1080p 分辨率/);
});

test("平台统一使用 1.65 倍售价系数", () => {
    assert.equal(pricing.targetGrossMargin(), 0.3939);
});
