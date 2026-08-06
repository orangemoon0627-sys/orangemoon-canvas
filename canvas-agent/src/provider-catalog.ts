export const PROVIDER_CATALOG_VERSION = "orangemoon-provider-v8-two-exclusive-video";
export const DEFAULT_PROVIDER_USD_TO_CNY = { metajing: 1, minimax: 7.3 } as const;
export const DEFAULT_RETAIL_MULTIPLIER = 1.65;

export type ProviderCapability = "image" | "video" | "audio";
export type ProviderModelVisibility = "public" | "legacy";
export type ProviderVideoResolution = "480p" | "720p" | "1080p";
export type ProviderVideoTier = "fast" | "standard";
export type ProviderBilling =
    | { unit: "image"; usd: number }
    | { unit: "second"; usd: number }
    | { unit: "generation"; usd: number }
    | { unit: "million_characters"; usd: number };

export type ProviderModel = {
    id: string;
    label: string;
    provider: "metajing" | "minimax";
    capability: ProviderCapability;
    visibility: ProviderModelVisibility;
    billing: ProviderBilling;
    billingByResolution?: Partial<Record<ProviderVideoResolution, ProviderBilling>>;
    description: string;
    resolution?: ProviderVideoResolution;
    resolutions?: ProviderVideoResolution[];
    defaultResolution?: ProviderVideoResolution;
    tier?: ProviderVideoTier;
    exclusive?: boolean;
    maxPromptChars?: number;
    minDuration?: number;
    maxDuration?: number;
    fixedDuration?: number;
    allowedDurations?: number[];
    recommendedDurations?: number[];
    aspectRatios?: string[];
    references?: { images: number; videos: number; audios: number; imageMaxBytes: number; videoMaxBytes: number; audioMaxBytes: number };
};

export const EXCLUSIVE_VIDEO_MODEL_IDS = [
    "qy-seedance-2.0-fast",
    "qy-seedance-2.0",
] as const;

const EXCLUSIVE_VIDEO_MODEL_ID_SET = new Set<string>(EXCLUSIVE_VIDEO_MODEL_IDS);
const MB = 1024 * 1024;
const QY_REFERENCES = { images: 9, videos: 3, audios: 3, imageMaxBytes: 12 * MB, videoMaxBytes: 50_000_000, audioMaxBytes: 16 * MB };
const QY_RATIOS = ["16:9", "9:16", "21:9", "4:3", "1:1", "3:4"];

function videoModel(
    id: (typeof EXCLUSIVE_VIDEO_MODEL_IDS)[number],
    label: string,
    rates: Partial<Record<ProviderVideoResolution, number>>,
    defaultResolution: ProviderVideoResolution,
    references: NonNullable<ProviderModel["references"]>,
    options: Pick<ProviderModel, "tier" | "maxPromptChars" | "minDuration" | "maxDuration" | "allowedDurations" | "recommendedDurations" | "aspectRatios" | "description">,
): ProviderModel {
    const resolutions = (Object.keys(rates) as ProviderVideoResolution[]).filter((resolution) => rates[resolution] !== undefined);
    const defaultRate = rates[defaultResolution];
    if (defaultRate === undefined) throw new Error(`${id} 缺少默认分辨率价格`);
    return {
        id,
        label,
        provider: "metajing",
        capability: "video",
        visibility: "public",
        billing: { unit: "second", usd: defaultRate },
        billingByResolution: Object.fromEntries(resolutions.map((resolution) => [resolution, { unit: "second", usd: rates[resolution]! }])) as Partial<Record<ProviderVideoResolution, ProviderBilling>>,
        resolution: resolutions.length === 1 ? resolutions[0] : undefined,
        resolutions,
        defaultResolution,
        exclusive: true,
        references,
        ...options,
    };
}

export const PROVIDER_MODELS: ProviderModel[] = [
    { id: "gpt-image-2", label: "Image 2", provider: "metajing", capability: "image", visibility: "public", billing: { unit: "image", usd: 0.06 }, description: "文生图与单张参考图图生图，支持最长边 3840px，一次最多 4 张" },
    videoModel("qy-seedance-2.0-fast", "Seedance 2.0 Fast（清衍独家）", { "480p": 1 / 6, "720p": 0.2 }, "720p", QY_REFERENCES, { tier: "fast", maxPromptChars: 2_500, minDuration: 5, maxDuration: 15, allowedDurations: [5, 10, 15], recommendedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, description: "清衍独家 Fast 通道，支持 480P/720P、原生声音及图片、视频、音频参考" }),
    videoModel("qy-seedance-2.0", "Seedance 2.0（清衍独家）", { "480p": 0.2, "720p": 4 / 15, "1080p": 0.6 }, "720p", QY_REFERENCES, { tier: "standard", maxPromptChars: 2_500, minDuration: 5, maxDuration: 15, allowedDurations: [5, 10, 15], recommendedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, description: "清衍独家标准通道，支持 480P/720P/1080P、原生声音及图片、视频、音频参考" }),
    { id: "speech-2.8-hd", label: "MiniMax Speech 2.8 HD", provider: "minimax", capability: "audio", visibility: "public", billing: { unit: "million_characters", usd: 100 }, description: "高保真语音合成，支持停顿、情绪和语气标签" },
    { id: "speech-2.8-turbo", label: "MiniMax Speech 2.8 Turbo", provider: "minimax", capability: "audio", visibility: "public", billing: { unit: "million_characters", usd: 60 }, description: "低成本语音合成，支持停顿、情绪和语气标签" },
];

export const PUBLIC_PROVIDER_MODELS = PROVIDER_MODELS.filter((model) => model.visibility === "public").sort((left, right) => publicModelOrder(left) - publicModelOrder(right));

export const METAJING_IMAGE_SIZES = [
    "1024x1024", "2048x2048", "2880x2880", "1536x1024", "2016x1344", "3520x2352", "1024x1536", "1344x2016", "2352x3520", "1280x720", "2048x1152", "3840x2160", "720x1280", "1152x2048", "2160x3840",
];

export function findProviderModel(id: string) {
    return PROVIDER_MODELS.find((model) => model.id === id);
}

export function isExclusiveVideoModelId(id: string) {
    return EXCLUSIVE_VIDEO_MODEL_ID_SET.has(id);
}

export function resolveProviderVideoResolution(model: ProviderModel, requested?: string) {
    if (model.capability !== "video") return undefined;
    const resolutions = model.resolutions || (model.resolution ? [model.resolution] : []);
    const normalized = normalizeVideoResolution(requested);
    if (normalized && resolutions.includes(normalized)) return normalized;
    if (requested) return undefined;
    return model.defaultResolution || model.resolution || resolutions[0];
}

export function providerBilling(model: ProviderModel, resolution?: string) {
    if (model.capability !== "video" || !model.billingByResolution) return model.billing;
    const resolved = resolveProviderVideoResolution(model, resolution);
    return resolved ? model.billingByResolution[resolved] : undefined;
}

export function estimateProviderCost(model: ProviderModel, quantity = 1, resolution?: string) {
    const billing = providerBilling(model, resolution);
    if (!billing) throw new Error(`${model.label} 不支持 ${resolution || "当前"} 分辨率`);
    const normalizedQuantity = billing.unit === "generation" ? 1 : Math.max(0, quantity);
    const upstreamUsd = billing.unit === "million_characters" ? (billing.usd * normalizedQuantity) / 1_000_000 : billing.usd * normalizedQuantity;
    const upstreamCny = upstreamUsd * providerUsdToCny(model.provider);
    return {
        upstreamUsd: round(upstreamUsd, 6),
        upstreamCny: round(upstreamCny, 4),
        suggestedCredits: Math.ceil((upstreamCny * DEFAULT_RETAIL_MULTIPLIER * 1_000) - 1e-9) / 1_000,
        resolution: resolveProviderVideoResolution(model, resolution),
    };
}

export function providerUsdToCny(provider: ProviderModel["provider"]) {
    const configured = provider === "metajing"
        ? process.env.PLATFORM_METAJING_USD_TO_CNY
        : process.env.PLATFORM_MINIMAX_USD_TO_CNY || process.env.PLATFORM_USD_TO_CNY;
    const parsed = Number(configured || DEFAULT_PROVIDER_USD_TO_CNY[provider]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROVIDER_USD_TO_CNY[provider];
}

function normalizeVideoResolution(value?: string): ProviderVideoResolution | undefined {
    const normalized = String(value || "").trim().toLowerCase().replace(/p$/, "");
    if (normalized === "480" || normalized === "720" || normalized === "1080") return `${normalized}p` as ProviderVideoResolution;
    return undefined;
}

function round(value: number, digits: number) {
    const factor = 10 ** digits;
    return Math.round((value + 1e-12) * factor) / factor;
}

function publicModelOrder(model: ProviderModel) {
    if (model.capability === "image") return 0;
    if (model.capability === "video") return 100 + EXCLUSIVE_VIDEO_MODEL_IDS.indexOf(model.id as (typeof EXCLUSIVE_VIDEO_MODEL_IDS)[number]);
    return 10_000 + model.billing.usd;
}
