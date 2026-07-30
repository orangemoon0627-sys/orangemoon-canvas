export type PlatformWallet = {
    availableMilliCredits: string;
    availableCredits: string;
    frozenMilliCredits: string;
    frozenCredits: string;
    updatedAt: string;
};

export type PlatformUser = {
    id: string;
    email: string;
    displayName: string;
    role: "USER" | "ADMIN";
    status: "ACTIVE" | "DISABLED";
    createdAt: string;
    wallet: PlatformWallet | null;
};

export type RechargeStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "EXPIRED";
export type PaymentProvider = "ALIPAY_MANUAL" | "WECHAT_MANUAL";

export type RechargeOrder = {
    publicId: string;
    provider: PaymentProvider;
    status: RechargeStatus;
    creditsMilli: string;
    credits: string;
    amountFen: number;
    amountCny: string;
    payerNote: string | null;
    externalReference: string | null;
    reviewNote: string | null;
    reviewedAt: string | null;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    user?: { email: string; displayName: string };
    reviewedBy?: { email: string; displayName: string } | null;
};

export type PaymentMethod = {
    provider: PaymentProvider;
    label: string;
    mode: "manual";
    enabled: boolean;
    ready: boolean;
    payee: string;
    qrUrl: string;
    instructions: string;
    updatedAt: string | null;
};

export type LedgerTransaction = {
    id: string;
    type: string;
    description: string;
    createdAt: string;
    entries: Array<{ account: string; amountMilli: string; amountCredits: string }>;
};

export type GenerationJob = {
    id: string;
    capability: "image" | "video" | "audio";
    model: string;
    status: "RESERVED" | "SUBMITTED" | "SUCCEEDED" | "FAILED" | "RELEASED";
    reservedMilliCredits: string;
    reservedCredits: string;
    chargedMilliCredits: string;
    chargedCredits: string;
    error: string | null;
    quantity: number;
    billingUnit: "image" | "second" | "generation" | "million_characters";
    requestSummary: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
};

export type AgentTurn = {
    id: string;
    projectId: string;
    threadId: string;
    model: string;
    status: "RESERVED" | "SUCCEEDED" | "FAILED";
    reservedMilliCredits: string;
    reservedCredits: string;
    chargedMilliCredits: string;
    chargedCredits: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
    error: string | null;
    createdAt: string;
    updatedAt: string;
    settledAt: string | null;
};

export type AgentPricing = {
    version: string;
    model: string;
    unit: "million_tokens";
    inputCreditsPerMillion: string;
    cachedInputCreditsPerMillion: string;
    outputCreditsPerMillion: string;
    reserveCredits: string;
    rounding: string;
};

export type PlatformAssetKind = "text" | "image" | "video" | "audio";

export type PlatformAsset = {
    id: string;
    kind: PlatformAssetKind;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string | null;
    note?: string | null;
    data: Record<string, unknown>;
    metadata?: Record<string, unknown> | null;
    generationJobId?: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ProviderPriceExample = {
    requestedQuantity: number;
    quantity: number;
    unit: string;
    billingUnit: "image" | "second" | "generation" | "million_characters";
    retailMilliCredits: string;
    retailCredits: string;
    upstreamUsd?: number;
    upstreamCny?: number;
    usdToCny?: number;
    markup?: number;
    grossMargin?: number;
};

export type ProviderCatalogModel = {
    id: string;
    label: string;
    provider: "metajing" | "minimax";
    capability: "image" | "video" | "audio";
    visibility: "public" | "legacy";
    description: string;
    resolution?: "480p" | "720p" | "1080p";
    tier?: "economy" | "mini" | "fast" | "standard" | "pro";
    minDuration?: number;
    maxDuration?: number;
    fixedDuration?: number;
    allowedDurations?: number[];
    recommendedDurations?: number[];
    aspectRatios?: string[];
    billing: { unit: ProviderPriceExample["billingUnit"]; usd?: number };
    examples: ProviderPriceExample[];
};

export type ProviderCatalog = {
    ok: true;
    version: string;
    currency: { creditToCny: number; providerUsdToCny?: { metajing: number; minimax: number } };
    pricing: { markup?: number; targetGrossMargin: number; rounding: string };
    image?: { maxCount: number; maxReferences: number; sizes: string[] };
    models: ProviderCatalogModel[];
};

export type ProviderBundleQuote = {
    ok: true;
    version: string;
    items: Array<{
        id: string;
        model: string;
        label: string;
        capability: "image" | "video" | "audio";
        resolution?: "480p" | "720p" | "1080p";
        requestedQuantity: number;
        quantity: number;
        billingUnit: ProviderPriceExample["billingUnit"];
        retailMilliCredits: string;
        retailCredits: string;
    }>;
    totalMilliCredits: string;
    totalCredits: string;
};

export class PlatformApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
    }
}

export async function platformRequest<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(`/platform-api${path.startsWith("/") ? path : `/${path}`}`, {
        ...init,
        credentials: "include",
        headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text().catch(() => "");
    if (!response.ok) {
        const message = readApiMessage(body) || `请求失败（${response.status}）`;
        if (response.status === 401) window.dispatchEvent(new CustomEvent("orangemoon:session-expired"));
        throw new PlatformApiError(response.status, message);
    }
    return body as T;
}

export function registerAccount(input: { email: string; password: string; displayName?: string }) {
    return platformRequest<{ ok: true; user: PlatformUser }>("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function loginAccount(input: { email: string; password: string }) {
    return platformRequest<{ ok: true; user: PlatformUser }>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function logoutAccount() {
    return platformRequest<{ ok: true }>("/auth/logout", { method: "POST" });
}

export function fetchCurrentUser() {
    return platformRequest<{ ok: true; user: PlatformUser }>("/auth/me");
}

export function fetchWallet() {
    return platformRequest<{ ok: true; wallet: PlatformWallet }>("/wallet");
}

export function fetchLedger(page = 1, limit = 30) {
    return platformRequest<{ ok: true; page: number; limit: number; total: number; transactions: LedgerTransaction[] }>(`/wallet/ledger?page=${page}&limit=${limit}`);
}

export function fetchPaymentConfig() {
    return platformRequest<{ ok: true; creditToCny: number; merchantPaymentsConfigured: boolean; methods: PaymentMethod[]; notice: string }>("/payments/config");
}

export function fetchRecharges(status?: RechargeStatus) {
    return platformRequest<{ ok: true; total: number; orders: RechargeOrder[] }>(`/recharges?limit=100${status ? `&status=${status}` : ""}`);
}

export function createRecharge(input: { provider: PaymentProvider; amountCredits: string; payerNote?: string }) {
    return platformRequest<{ ok: true; order: RechargeOrder }>("/recharges", { method: "POST", body: JSON.stringify(input) });
}

export function cancelRecharge(publicId: string) {
    return platformRequest<{ ok: true; order: RechargeOrder }>(`/recharges/${encodeURIComponent(publicId)}/cancel`, { method: "POST" });
}

export function fetchGenerationJobs() {
    return platformRequest<{ ok: true; jobs: GenerationJob[] }>("/providers/jobs?limit=100");
}

export function fetchAgentTurns() {
    return platformRequest<{ ok: true; turns: AgentTurn[] }>("/agent/turns?limit=100");
}

export function fetchAgentPricing() {
    return platformRequest<{ ok: true; pricing: AgentPricing }>("/agent/turns/pricing");
}

export function fetchProviderCatalog() {
    return platformRequest<ProviderCatalog>("/providers/catalog");
}

export function quoteProviderBundle(items: Array<{ id: string; model: string; quantity: number }>) {
    return platformRequest<ProviderBundleQuote>("/providers/quote", { method: "POST", body: JSON.stringify({ items }) });
}

export function fetchAccountAssets() {
    return platformRequest<{ ok: true; total: number; assets: PlatformAsset[] }>("/assets?limit=500");
}

export function upsertAccountAsset(publicId: string, input: Omit<PlatformAsset, "id" | "createdAt" | "updatedAt" | "generationJobId">) {
    return platformRequest<{ ok: true; asset: PlatformAsset }>(`/assets/${encodeURIComponent(publicId)}`, { method: "PUT", body: JSON.stringify({ ...input, kind: input.kind.toUpperCase() }) });
}

export function deleteAccountAsset(publicId: string) {
    return platformRequest<{ ok: true }>(`/assets/${encodeURIComponent(publicId)}`, { method: "DELETE" });
}

export type AdminUser = PlatformUser & { totalCredits: string };

export function fetchAdminUsers(search = "") {
    return platformRequest<{ ok: true; total: number; users: AdminUser[] }>(`/admin/users?limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}`);
}

export function updateAdminUserStatus(userId: string, status: PlatformUser["status"]) {
    return platformRequest<{ ok: true; user: AdminUser }>(`/admin/users/${encodeURIComponent(userId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function adjustAdminWallet(userId: string, input: { amountCredits: string; reason: string }) {
    return platformRequest<{ ok: true; wallet: PlatformWallet }>(`/admin/users/${encodeURIComponent(userId)}/wallet-adjustments`, { method: "POST", body: JSON.stringify(input) });
}

export function fetchAdminRecharges(status?: RechargeStatus) {
    return platformRequest<{ ok: true; total: number; orders: RechargeOrder[] }>(`/admin/recharges?limit=100${status ? `&status=${status}` : ""}`);
}

export function fetchAdminPaymentSettings() {
    return platformRequest<{ ok: true; methods: PaymentMethod[] }>("/admin/payment-settings");
}

export function updateAdminPaymentSetting(provider: PaymentProvider, input: { enabled: boolean; payee: string; instructions: string }) {
    return platformRequest<{ ok: true; method: PaymentMethod }>(`/admin/payment-settings/${encodeURIComponent(provider)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function uploadAdminPaymentQr(provider: PaymentProvider, input: { mimeType: "image/png" | "image/jpeg" | "image/webp"; dataBase64: string }) {
    return platformRequest<{ ok: true; method: PaymentMethod }>(`/admin/payment-settings/${encodeURIComponent(provider)}/qr`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteAdminPaymentQr(provider: PaymentProvider) {
    return platformRequest<{ ok: true; method: PaymentMethod }>(`/admin/payment-settings/${encodeURIComponent(provider)}/qr`, { method: "DELETE" });
}

export function confirmAdminRecharge(publicId: string, input: { externalReference: string; reviewNote?: string }) {
    return platformRequest<{ ok: true; order: RechargeOrder }>(`/admin/recharges/${encodeURIComponent(publicId)}/confirm`, { method: "POST", body: JSON.stringify(input) });
}

export function rejectAdminRecharge(publicId: string, reviewNote: string) {
    return platformRequest<{ ok: true; order: RechargeOrder }>(`/admin/recharges/${encodeURIComponent(publicId)}/reject`, { method: "POST", body: JSON.stringify({ reviewNote }) });
}

function readApiMessage(body: unknown) {
    if (typeof body === "string") return body.trim();
    if (!body || typeof body !== "object") return "";
    const record = body as Record<string, unknown>;
    if (Array.isArray(record.message)) return record.message.join("；");
    return [record.message, record.error].find((value): value is string => typeof value === "string" && Boolean(value.trim())) || "";
}
