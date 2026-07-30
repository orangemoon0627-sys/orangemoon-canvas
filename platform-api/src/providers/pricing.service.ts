import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { platformMetaJingUsdToCny, platformMiniMaxUsdToCny, platformPriceMarkup, platformProviderUsdToCny } from "../common/environment";
import { formatMilliCredits } from "../common/money";
import { PrismaService } from "../prisma/prisma.service";
import { PROVIDER_CATALOG_VERSION, PROVIDER_MODELS, providerQuantity, type ProviderModel } from "./provider-catalog";

export const PRICE_ROUNDING = "up_to_0.001_credit";

@Injectable()
export class PricingService implements OnModuleInit {
    constructor(private readonly prisma: PrismaService) {}

    async onModuleInit() {
        const providerUsdToCny = this.exchangeRates();
        const markup = platformPriceMarkup();
        const version = this.version(providerUsdToCny, markup);
        await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(71420260728)`;
            await tx.priceVersion.updateMany({ where: { active: true, version: { not: version } }, data: { active: false } });
            await tx.priceVersion.upsert({
                where: { version },
                create: {
                    version,
                    active: true,
                    // Legacy column stores the primary MetaJing quota conversion. The complete provider map is preserved in rules.
                    usdToCnyMicros: BigInt(Math.round(providerUsdToCny.metajing * 1_000_000)),
                    markupBps: Math.round(markup * 10_000),
                    rules: { catalogVersion: PROVIDER_CATALOG_VERSION, providerUsdToCny, models: PROVIDER_MODELS } as unknown as Prisma.InputJsonValue,
                },
                update: { active: true },
            });
        });
    }

    quote(model: ProviderModel, requestedQuantity: number) {
        const providerUsdToCny = this.exchangeRates();
        const usdToCny = platformProviderUsdToCny(model.provider);
        const markup = platformPriceMarkup();
        const quantity = providerQuantity(model, requestedQuantity);
        const upstreamUsd = model.billing.unit === "million_characters" ? (model.billing.usd * quantity) / 1_000_000 : model.billing.usd * quantity;
        const upstreamCny = upstreamUsd * usdToCny;
        const retailMilliCredits = BigInt(Math.ceil((upstreamCny * markup * 1_000) - 1e-9));
        const retailCny = Number(retailMilliCredits) / 1_000;
        return {
            version: this.version(providerUsdToCny, markup),
            model: model.id,
            provider: model.provider,
            billingUnit: model.billing.unit,
            quantity,
            upstreamUsd: round(upstreamUsd, 6),
            upstreamCny: round(upstreamCny, 4),
            usdToCny,
            markup,
            grossMargin: retailCny > 0 ? round((retailCny - upstreamCny) / retailCny, 4) : 0,
            retailMilliCredits,
            retailCredits: formatMilliCredits(retailMilliCredits),
        };
    }

    examples(model: ProviderModel) {
        if (model.capability === "image") return [{ requestedQuantity: 1, unit: "张", ...serializeQuote(this.quote(model, 1)) }];
        if (model.capability === "audio") return [{ requestedQuantity: 1_000, unit: "字符", ...serializeQuote(this.quote(model, 1_000)) }];
        return (model.recommendedDurations || [5, 10, 15]).map((duration) => ({ requestedQuantity: duration, unit: model.billing.unit === "generation" ? "秒/条" : "秒", ...serializeQuote(this.quote(model, duration)) }));
    }

    exchangeRates() {
        return { metajing: platformMetaJingUsdToCny(), minimax: platformMiniMaxUsdToCny() };
    }

    markup() {
        return platformPriceMarkup();
    }

    targetGrossMargin() {
        return round(1 - (1 / this.markup()), 4);
    }

    private version(providerUsdToCny: ReturnType<PricingService["exchangeRates"]>, markup: number) {
        return `${PROVIDER_CATALOG_VERSION}:fx-metajing-${providerUsdToCny.metajing.toFixed(4)}:minimax-${providerUsdToCny.minimax.toFixed(4)}:markup-${markup.toFixed(4)}:round-milli`;
    }
}

export function serializeQuote(quote: ReturnType<PricingService["quote"]>) {
    return { ...quote, retailMilliCredits: quote.retailMilliCredits.toString() };
}

function round(value: number, digits: number) {
    const factor = 10 ** digits;
    return Math.round((value + 1e-12) * factor) / factor;
}
