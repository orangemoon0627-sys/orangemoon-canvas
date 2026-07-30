import { BadRequestException } from "@nestjs/common";

const DEFAULT_ALLOWED_ORIGINS = ["http://127.0.0.1:4311", "http://localhost:4311", "http://127.0.0.1:3000", "http://localhost:3000"];

export function validateEnvironment(input: Record<string, unknown>) {
    const databaseUrl = textValue(input.DATABASE_URL);
    if (!databaseUrl || !databaseUrl.startsWith("postgresql://")) throw new Error("DATABASE_URL 必须是 PostgreSQL 连接地址");
    parseInteger(input.PLATFORM_PORT, 17400, 1, 65535, "PLATFORM_PORT");
    parseInteger(input.PLATFORM_BODY_LIMIT_MB, 128, 1, 128, "PLATFORM_BODY_LIMIT_MB");
    parseInteger(input.PLATFORM_MAX_CONCURRENT_GENERATIONS, 4, 1, 32, "PLATFORM_MAX_CONCURRENT_GENERATIONS");
    parseInteger(input.PLATFORM_SESSION_DAYS, 30, 1, 365, "PLATFORM_SESSION_DAYS");
    parseNumber(input.PLATFORM_METAJING_USD_TO_CNY, 1, 0.01, 100, "PLATFORM_METAJING_USD_TO_CNY");
    parseNumber(input.PLATFORM_MINIMAX_USD_TO_CNY ?? input.PLATFORM_USD_TO_CNY, 7.3, 0.01, 100, "PLATFORM_MINIMAX_USD_TO_CNY");
    parseNumber(input.PLATFORM_PRICE_MARKUP, 1.65, 1, 20, "PLATFORM_PRICE_MARKUP");
    parseNumber(input.PLATFORM_AGENT_INPUT_CREDITS_PER_MILLION, 18.563, 0.001, 1_000_000, "PLATFORM_AGENT_INPUT_CREDITS_PER_MILLION");
    parseNumber(input.PLATFORM_AGENT_CACHED_INPUT_CREDITS_PER_MILLION, 1.857, 0.001, 1_000_000, "PLATFORM_AGENT_CACHED_INPUT_CREDITS_PER_MILLION");
    parseNumber(input.PLATFORM_AGENT_OUTPUT_CREDITS_PER_MILLION, 111.375, 0.001, 1_000_000, "PLATFORM_AGENT_OUTPUT_CREDITS_PER_MILLION");
    parseNumber(input.PLATFORM_AGENT_RESERVE_CREDITS, 2, 0.001, 100, "PLATFORM_AGENT_RESERVE_CREDITS");
    if (booleanValue(input.PLATFORM_COOKIE_SECURE, false) && textValue(input.CANVAS_AGENT_INTERNAL_SECRET).length < 32) throw new Error("生产环境 CANVAS_AGENT_INTERNAL_SECRET 至少需要 32 个字符");
    return input;
}

export function platformPort() {
    return parseInteger(process.env.PLATFORM_PORT, 17400, 1, 65535, "PLATFORM_PORT");
}

export function platformBodyLimitBytes() {
    return parseInteger(process.env.PLATFORM_BODY_LIMIT_MB, 128, 1, 128, "PLATFORM_BODY_LIMIT_MB") * 1024 * 1024;
}

export function platformMaxConcurrentGenerations() {
    return parseInteger(process.env.PLATFORM_MAX_CONCURRENT_GENERATIONS, 4, 1, 32, "PLATFORM_MAX_CONCURRENT_GENERATIONS");
}

export function sessionDays() {
    return parseInteger(process.env.PLATFORM_SESSION_DAYS, 30, 1, 365, "PLATFORM_SESSION_DAYS");
}

export function cookieSecure() {
    return booleanValue(process.env.PLATFORM_COOKIE_SECURE, false);
}

export function allowFirstUserAdmin() {
    return booleanValue(process.env.PLATFORM_ALLOW_FIRST_USER_ADMIN, false);
}

export function allowedOrigins() {
    const configured = textValue(process.env.PLATFORM_ALLOWED_ORIGINS)
        .split(",")
        .map((value) => value.trim().replace(/\/+$/, ""))
        .filter(Boolean);
    return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

export function platformUsdToCny() {
    return platformMiniMaxUsdToCny();
}

export function platformMetaJingUsdToCny() {
    return parseNumber(process.env.PLATFORM_METAJING_USD_TO_CNY, 1, 0.01, 100, "PLATFORM_METAJING_USD_TO_CNY");
}

export function platformMiniMaxUsdToCny() {
    return parseNumber(process.env.PLATFORM_MINIMAX_USD_TO_CNY || process.env.PLATFORM_USD_TO_CNY, 7.3, 0.01, 100, "PLATFORM_MINIMAX_USD_TO_CNY");
}

export function platformProviderUsdToCny(provider: "metajing" | "minimax") {
    return provider === "metajing" ? platformMetaJingUsdToCny() : platformMiniMaxUsdToCny();
}

export function platformPriceMarkup() {
    return parseNumber(process.env.PLATFORM_PRICE_MARKUP, 1.65, 1, 20, "PLATFORM_PRICE_MARKUP");
}

export function canvasAgentInternalSecret() {
    const secret = environmentText("CANVAS_AGENT_INTERNAL_SECRET");
    if (secret) return secret;
    if (cookieSecure()) throw new Error("CANVAS_AGENT_INTERNAL_SECRET 尚未配置");
    return "orangemoon-local-agent-billing-secret";
}

export function environmentText(name: string, fallback = "") {
    return textValue(process.env[name]) || fallback;
}

export function environmentBoolean(name: string, fallback = false) {
    return booleanValue(process.env[name], fallback);
}

export function assertSafeExternalUrl(value: string) {
    if (!value) return "";
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new BadRequestException("收款码地址不是有效 URL");
    }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) {
        throw new BadRequestException("收款码地址必须使用 HTTPS");
    }
    return url.toString();
}

function textValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function booleanValue(value: unknown, fallback: boolean) {
    const normalized = textValue(value).toLowerCase();
    if (!normalized) return fallback;
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    throw new Error(`布尔环境变量值无效: ${String(value)}`);
}

function parseInteger(value: unknown, fallback: number, min: number, max: number, name: string) {
    const normalized = textValue(value);
    const parsed = normalized ? Number(normalized) : fallback;
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} 必须是 ${min}-${max} 的整数`);
    return parsed;
}

function parseNumber(value: unknown, fallback: number, min: number, max: number, name: string) {
    const normalized = textValue(value);
    const parsed = normalized ? Number(normalized) : fallback;
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${name} 必须是 ${min}-${max} 的数字`);
    return parsed;
}
