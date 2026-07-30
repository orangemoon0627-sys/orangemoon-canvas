import { BadRequestException, Injectable } from "@nestjs/common";

import { environmentText } from "../common/environment";
import { formatMilliCredits } from "../common/money";

const TOKENS_PER_MILLION = 1_000_000n;
const PRICE_VERSION = "orangemoon-agent-gpt-5.6-v1";
const DEFAULT_RATES = {
    input: "18.563",
    cachedInput: "1.857",
    output: "111.375",
    reserve: "2",
} as const;

export type AgentTokenUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number; totalTokens?: number };

@Injectable()
export class AgentPricingService {
    reservationMilliCredits() {
        return rateMilli("PLATFORM_AGENT_RESERVE_CREDITS", DEFAULT_RATES.reserve);
    }

    quote(input: AgentTokenUsage, priceSnapshot?: unknown) {
        const usage = normalizeUsage(input);
        const rates = priceSnapshot ? snapshotRates(priceSnapshot) : this.rates();
        const uncachedInputTokens = usage.inputTokens - usage.cachedInputTokens;
        const numerator = BigInt(uncachedInputTokens) * rates.input + BigInt(usage.cachedInputTokens) * rates.cachedInput + BigInt(usage.outputTokens) * rates.output;
        const retailMilliCredits = numerator ? ((numerator + TOKENS_PER_MILLION - 1n) / TOKENS_PER_MILLION) : 0n;
        return {
            version: priceVersion(rates),
            usage,
            rates,
            retailMilliCredits,
            retailCredits: formatMilliCredits(retailMilliCredits),
            priceSnapshot: this.priceSnapshot(rates),
        };
    }

    catalog() {
        const rates = this.rates();
        return {
            version: priceVersion(rates),
            model: "gpt-5.6-terra",
            unit: "million_tokens",
            inputCreditsPerMillion: formatMilliCredits(rates.input),
            cachedInputCreditsPerMillion: formatMilliCredits(rates.cachedInput),
            outputCreditsPerMillion: formatMilliCredits(rates.output),
            reserveCredits: formatMilliCredits(this.reservationMilliCredits()),
            rounding: "up_to_0.001_credit",
        };
    }

    priceSnapshot(rates = this.rates()) {
        return {
            ...this.catalogWithoutRecursion(rates),
            inputMilliCreditsPerMillion: rates.input.toString(),
            cachedInputMilliCreditsPerMillion: rates.cachedInput.toString(),
            outputMilliCreditsPerMillion: rates.output.toString(),
        };
    }

    private rates() {
        return {
            input: rateMilli("PLATFORM_AGENT_INPUT_CREDITS_PER_MILLION", DEFAULT_RATES.input),
            cachedInput: rateMilli("PLATFORM_AGENT_CACHED_INPUT_CREDITS_PER_MILLION", DEFAULT_RATES.cachedInput),
            output: rateMilli("PLATFORM_AGENT_OUTPUT_CREDITS_PER_MILLION", DEFAULT_RATES.output),
        };
    }

    private catalogWithoutRecursion(rates: ReturnType<AgentPricingService["rates"]>) {
        return {
            version: priceVersion(rates),
            model: "gpt-5.6-terra",
            unit: "million_tokens",
            inputCreditsPerMillion: formatMilliCredits(rates.input),
            cachedInputCreditsPerMillion: formatMilliCredits(rates.cachedInput),
            outputCreditsPerMillion: formatMilliCredits(rates.output),
            rounding: "up_to_0.001_credit",
        };
    }
}

function normalizeUsage(input: AgentTokenUsage) {
    const inputTokens = integer(input.inputTokens);
    const cachedInputTokens = integer(input.cachedInputTokens);
    const outputTokens = integer(input.outputTokens);
    if (cachedInputTokens > inputTokens) throw new BadRequestException("缓存输入 token 不能超过总输入 token");
    return { inputTokens, cachedInputTokens, outputTokens, totalTokens: Math.max(integer(input.totalTokens || 0), inputTokens + outputTokens) };
}

function integer(value: number) {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function rateMilli(name: string, fallback: string) {
    const value = environmentText(name, fallback);
    const match = value.match(/^(0|[1-9]\d{0,5})(?:\.(\d{1,3}))?$/);
    if (!match) throw new Error(`${name} 必须是最多三位小数的正数`);
    const milli = BigInt(match[1] || "0") * 1_000n + BigInt((match[2] || "").padEnd(3, "0") || "0");
    if (milli <= 0n) throw new Error(`${name} 必须大于零`);
    return milli;
}

function snapshotRates(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Agent 价格快照无效");
    const snapshot = value as Record<string, unknown>;
    return {
        input: positiveBigInt(snapshot.inputMilliCreditsPerMillion, "普通输入"),
        cachedInput: positiveBigInt(snapshot.cachedInputMilliCreditsPerMillion, "缓存输入"),
        output: positiveBigInt(snapshot.outputMilliCreditsPerMillion, "输出"),
    };
}

function positiveBigInt(value: unknown, label: string) {
    try {
        const result = BigInt(String(value || ""));
        if (result > 0n) return result;
    } catch {}
    throw new Error(`Agent ${label}价格快照无效`);
}

function priceVersion(rates: { input: bigint; cachedInput: bigint; output: bigint }) {
    return `${PRICE_VERSION}:input-${rates.input}:cached-${rates.cachedInput}:output-${rates.output}:round-milli`;
}
