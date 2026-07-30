export const PROVIDER_CATALOG_VERSION = "orangemoon-provider-v4";
export const DEFAULT_PROVIDER_USD_TO_CNY = { metajing: 1, minimax: 7.3 } as const;
export const DEFAULT_RETAIL_MULTIPLIER = 1.65;

export type ProviderCapability = "image" | "video" | "audio";
export type ProviderModelVisibility = "public" | "legacy";
export type ProviderVideoTier = "economy" | "mini" | "fast" | "standard" | "pro";
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
    description: string;
    resolution?: "480p" | "720p" | "1080p";
    tier?: ProviderVideoTier;
    upstreamModel?: string;
    upstreamSource?: "web";
    minDuration?: number;
    maxDuration?: number;
    fixedDuration?: number;
    allowedDurations?: number[];
    recommendedDurations?: number[];
    aspectRatios?: string[];
    references?: { images: number; videos: number; audios: number; imageMaxBytes: number; videoMaxBytes: number; audioMaxBytes: number };
};

const MB = 1024 * 1024;
const METAJING_DEFAULT_REFERENCES = { images: 9, videos: 3, audios: 3, imageMaxBytes: 12 * MB, videoMaxBytes: 48 * MB, audioMaxBytes: 16 * MB };
const METAJING_PRO_REFERENCES = { ...METAJING_DEFAULT_REFERENCES, images: 4, audios: 1 };
const METAJING_CC_REFERENCES = { ...METAJING_DEFAULT_REFERENCES, videos: 0 };
const WIDE_RATIOS = ["16:9", "9:16"];
const QY_RATIOS = ["16:9", "9:16", "21:9", "4:3", "1:1", "3:4"];

function videoModel(
    id: string,
    label: string,
    resolution: ProviderModel["resolution"],
    billing: ProviderBilling,
    references: NonNullable<ProviderModel["references"]>,
    options: { fixedDuration?: number; allowedDurations?: number[]; aspectRatios?: string[]; description?: string; upstreamModel?: string; upstreamSource?: "web"; visibility?: ProviderModelVisibility; tier?: ProviderVideoTier } = {},
): ProviderModel {
    const fixedDuration = options.fixedDuration;
    return {
        id,
        label,
        provider: "metajing",
        capability: "video",
        visibility: options.visibility || "legacy",
        billing,
        resolution,
        tier: options.tier,
        upstreamModel: options.upstreamModel,
        upstreamSource: options.upstreamSource,
        minDuration: fixedDuration || 5,
        maxDuration: fixedDuration || 15,
        fixedDuration,
        allowedDurations: options.allowedDurations,
        recommendedDurations: fixedDuration ? [fixedDuration] : options.allowedDurations || [5, 10, 15],
        aspectRatios: options.aspectRatios || WIDE_RATIOS,
        references,
        description: options.description || `${resolution} Seedance 2.0 视频生成`,
    };
}

export const PROVIDER_MODELS: ProviderModel[] = [
    { id: "gpt-image-2", label: "Image 2", provider: "metajing", capability: "image", visibility: "public", billing: { unit: "image", usd: 0.06 }, description: "文生图与单张参考图图生图，支持最长边 3840px，一次最多 4 张" },
    videoModel("seedance-2.0-480p-mini", "Seedance 2.0 480P Mini", "480p", { unit: "second", usd: 0.158 }, METAJING_PRO_REFERENCES, { upstreamModel: "mg-seedance2.0 -480p mini", upstreamSource: "web", visibility: "public", tier: "mini", description: "轻量档，支持最多 4 张图片、3 段视频和 1 段音频参考" }),
    videoModel("seedance-2.0-480p-fast", "Seedance 2.0 480P Fast", "480p", { unit: "second", usd: 1 / 6 }, METAJING_DEFAULT_REFERENCES, { upstreamModel: "qy-seedance-2.0-fast", allowedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, visibility: "public", tier: "fast", description: "快速档，支持图片、视频与音频参考，可生成声音" }),
    videoModel("seedance-2.0-480p-standard", "Seedance 2.0 480P 标准", "480p", { unit: "second", usd: 0.2 }, METAJING_DEFAULT_REFERENCES, { upstreamModel: "qy-seedance-2.0", allowedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, visibility: "public", tier: "standard", description: "标准档，支持图片、视频与音频参考，可生成声音" }),
    videoModel("seedance-2.0-480p-pro", "Seedance 2.0 480P Pro", "480p", { unit: "second", usd: 0.268 }, METAJING_PRO_REFERENCES, { upstreamModel: "mg-seedance2.0 -480p", upstreamSource: "web", visibility: "public", tier: "pro", description: "高质量档，支持最多 4 张图片、3 段视频和 1 段音频参考" }),
    videoModel("seedance-2.0-720p-economy", "Seedance 2.0 720P 经济", "720p", { unit: "second", usd: 0.1 }, { ...METAJING_DEFAULT_REFERENCES, videos: 0, audios: 0 }, { upstreamModel: "Seedance 2.0-fast-720p", allowedDurations: [5, 10, 15], aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"], visibility: "public", tier: "economy", description: "低成本预览档，支持图片参考，不支持视频或音频参考" }),
    videoModel("seedance-2.0-720p-fast", "Seedance 2.0 720P Fast", "720p", { unit: "second", usd: 0.2 }, METAJING_DEFAULT_REFERENCES, { upstreamModel: "qy-seedance-2.0-fast", allowedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, visibility: "public", tier: "fast", description: "快速档，支持图片、视频与音频参考，可生成声音" }),
    videoModel("seedance-2.0-720p-mini", "Seedance 2.0 720P Mini", "720p", { unit: "second", usd: 0.228 }, METAJING_PRO_REFERENCES, { upstreamModel: "mg-seedance2.0 -720p mini", upstreamSource: "web", visibility: "public", tier: "mini", description: "轻量档，支持最多 4 张图片、3 段视频和 1 段音频参考" }),
    videoModel("seedance-2.0-720p-standard", "Seedance 2.0 720P 标准", "720p", { unit: "second", usd: 4 / 15 }, METAJING_DEFAULT_REFERENCES, { upstreamModel: "qy-seedance-2.0", allowedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, visibility: "public", tier: "standard", description: "标准档，支持图片、视频与音频参考，可生成声音" }),
    videoModel("seedance-2.0-720p-pro", "Seedance 2.0 720P Pro", "720p", { unit: "second", usd: 0.4 }, METAJING_PRO_REFERENCES, { upstreamModel: "mg-seedance2.0 -720p pro", upstreamSource: "web", visibility: "public", tier: "pro", description: "高质量档，15 秒售价 9.9 积分" }),
    videoModel("seedance-2.0-1080p-standard", "Seedance 2.0 1080P 标准", "1080p", { unit: "second", usd: 0.6 }, METAJING_DEFAULT_REFERENCES, { upstreamModel: "qy-seedance-2.0", allowedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, visibility: "public", tier: "standard", description: "1080P 标准档，支持图片、视频与音频参考，可生成声音" }),
    videoModel("qy-seedance-2.0-480p", "Seedance 2.0 480P 标准（旧配置）", "480p", { unit: "second", usd: 0.2 }, METAJING_DEFAULT_REFERENCES, { upstreamModel: "qy-seedance-2.0", allowedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, tier: "standard" }),
    videoModel("qy-seedance-2.0-720p", "Seedance 2.0 720P 标准（旧配置）", "720p", { unit: "second", usd: 4 / 15 }, METAJING_DEFAULT_REFERENCES, { upstreamModel: "qy-seedance-2.0", allowedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, tier: "standard" }),
    videoModel("qy-seedance-2.0-1080p", "Seedance 2.0 1080P 标准（旧配置）", "1080p", { unit: "second", usd: 0.6 }, METAJING_DEFAULT_REFERENCES, { upstreamModel: "qy-seedance-2.0", allowedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, tier: "standard" }),
    videoModel("qy-seedance-2.0-fast-480p", "Seedance 2.0 480P Fast（旧配置）", "480p", { unit: "second", usd: 1 / 6 }, METAJING_DEFAULT_REFERENCES, { upstreamModel: "qy-seedance-2.0-fast", allowedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, tier: "fast" }),
    videoModel("qy-seedance-2.0-fast-720p", "Seedance 2.0 720P Fast（旧配置）", "720p", { unit: "second", usd: 0.2 }, METAJING_DEFAULT_REFERENCES, { upstreamModel: "qy-seedance-2.0-fast", allowedDurations: [5, 10, 15], aspectRatios: QY_RATIOS, tier: "fast" }),
    videoModel("Seedance 2.0-fast-720p", "Seedance 2.0 720P 经济（旧配置）", "720p", { unit: "second", usd: 0.1 }, { ...METAJING_DEFAULT_REFERENCES, videos: 0, audios: 0 }, { aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"], tier: "economy" }),
    videoModel("cc-seedance2.0 480p-fast-nsp", "Seedance 2.0 480P Fast（旧配置）", "480p", { unit: "second", usd: 0.33 }, METAJING_CC_REFERENCES, { upstreamSource: "web", tier: "fast" }),
    videoModel("cc-seedance2.0 480p-nsp", "Seedance 2.0 480P 标准（旧配置）", "480p", { unit: "second", usd: 0.36 }, METAJING_CC_REFERENCES, { upstreamSource: "web", tier: "standard" }),
    videoModel("mg-seedance2.0 -1080p", "Seedance 2.0 1080P 标准（旧配置）", "1080p", { unit: "second", usd: 0.67 }, METAJING_DEFAULT_REFERENCES, { upstreamSource: "web", tier: "standard" }),
    videoModel("mg-seedance2.0 -480p", "Seedance 2.0 480P Pro（旧配置）", "480p", { unit: "second", usd: 0.268 }, METAJING_PRO_REFERENCES, { upstreamSource: "web", tier: "pro" }),
    videoModel("mg-seedance2.0 -480p fast", "Seedance 2.0 480P Fast（旧配置）", "480p", { unit: "second", usd: 0.165 }, METAJING_PRO_REFERENCES, { upstreamSource: "web", tier: "fast" }),
    videoModel("mg-seedance2.0 -480p mini", "Seedance 2.0 480P Mini（旧配置）", "480p", { unit: "second", usd: 0.158 }, METAJING_PRO_REFERENCES, { upstreamSource: "web", tier: "mini" }),
    videoModel("mg-seedance2.0 -720p fast", "Seedance 2.0 720P Fast（旧配置）", "720p", { unit: "second", usd: 0.298 }, METAJING_PRO_REFERENCES, { upstreamSource: "web", tier: "fast" }),
    videoModel("mg-seedance2.0 -720p mini", "Seedance 2.0 720P Mini（旧配置）", "720p", { unit: "second", usd: 0.228 }, METAJING_PRO_REFERENCES, { upstreamSource: "web", tier: "mini" }),
    videoModel("mg-seedance2.0 -720p pro", "Seedance 2.0 720P Pro（旧配置）", "720p", { unit: "second", usd: 0.4 }, METAJING_PRO_REFERENCES, { upstreamSource: "web", tier: "pro" }),
    videoModel("mg-seedance2.0 -480p-fast-gz-15s", "Seedance 2.0 480P Fast（15 秒旧配置）", "480p", { unit: "generation", usd: 3.98 }, METAJING_DEFAULT_REFERENCES, { fixedDuration: 15, upstreamSource: "web", tier: "fast" }),
    videoModel("mg-seedance2.0 -480p-gz-15s", "Seedance 2.0 480P 标准（15 秒旧配置）", "480p", { unit: "generation", usd: 5.4 }, METAJING_DEFAULT_REFERENCES, { fixedDuration: 15, upstreamSource: "web", tier: "standard" }),
    videoModel("mg-seedance2.0 -480p-mini-gz-15s", "Seedance 2.0 480P Mini（15 秒旧配置）", "480p", { unit: "generation", usd: 2.95 }, METAJING_DEFAULT_REFERENCES, { fixedDuration: 15, upstreamSource: "web", tier: "mini" }),
    videoModel("mg-seedance2.0 -720p-fast-gz-15s", "Seedance 2.0 720P Fast（15 秒旧配置）", "720p", { unit: "generation", usd: 5 }, METAJING_DEFAULT_REFERENCES, { fixedDuration: 15, upstreamSource: "web", tier: "fast" }),
    videoModel("mg-seedance2.0 -720p-gz-15s", "Seedance 2.0 720P 标准（15 秒旧配置）", "720p", { unit: "generation", usd: 6.3 }, METAJING_DEFAULT_REFERENCES, { fixedDuration: 15, upstreamSource: "web", tier: "standard" }),
    videoModel("mg-seedance2.0 -720p-mini-gz-15s", "Seedance 2.0 720P Mini（15 秒旧配置）", "720p", { unit: "generation", usd: 2.88 }, METAJING_DEFAULT_REFERENCES, { fixedDuration: 15, upstreamSource: "web", tier: "mini" }),
    { id: "speech-2.8-hd", label: "MiniMax Speech 2.8 HD", provider: "minimax", capability: "audio", visibility: "public", billing: { unit: "million_characters", usd: 100 }, description: "高保真语音合成，支持停顿、情绪和语气标签" },
    { id: "speech-2.8-turbo", label: "MiniMax Speech 2.8 Turbo", provider: "minimax", capability: "audio", visibility: "public", billing: { unit: "million_characters", usd: 60 }, description: "低成本语音合成，支持停顿、情绪和语气标签" },
];

export const PUBLIC_PROVIDER_MODELS = PROVIDER_MODELS.filter((model) => model.visibility === "public").sort((left, right) => publicModelOrder(left) - publicModelOrder(right));

export const METAJING_IMAGE_SIZES = [
    "1024x1024",
    "2048x2048",
    "2880x2880",
    "1536x1024",
    "2016x1344",
    "3520x2352",
    "1024x1536",
    "1344x2016",
    "2352x3520",
    "1280x720",
    "2048x1152",
    "3840x2160",
    "720x1280",
    "1152x2048",
    "2160x3840",
];

export function findProviderModel(id: string) {
    return PROVIDER_MODELS.find((model) => model.id === id);
}

export function estimateProviderCost(model: ProviderModel, quantity = 1) {
    const normalizedQuantity = Math.max(0, quantity);
    const upstreamUsd = model.billing.unit === "million_characters" ? (model.billing.usd * normalizedQuantity) / 1_000_000 : model.billing.usd * normalizedQuantity;
    const upstreamCny = upstreamUsd * providerUsdToCny(model.provider);
    return {
        upstreamUsd: round(upstreamUsd, 6),
        upstreamCny: round(upstreamCny, 4),
        suggestedCredits: Math.ceil((upstreamCny * DEFAULT_RETAIL_MULTIPLIER * 1_000) - 1e-9) / 1_000,
    };
}

export function providerUsdToCny(provider: ProviderModel["provider"]) {
    const configured = provider === "metajing"
        ? process.env.PLATFORM_METAJING_USD_TO_CNY
        : process.env.PLATFORM_MINIMAX_USD_TO_CNY || process.env.PLATFORM_USD_TO_CNY;
    const parsed = Number(configured || DEFAULT_PROVIDER_USD_TO_CNY[provider]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROVIDER_USD_TO_CNY[provider];
}

function round(value: number, digits: number) {
    const factor = 10 ** digits;
    return Math.round((value + 1e-12) * factor) / factor;
}

function publicModelOrder(model: ProviderModel) {
    if (model.capability === "image") return 0;
    if (model.capability === "audio") return 10_000 + model.billing.usd;
    const resolution = model.resolution === "480p" ? 100 : model.resolution === "720p" ? 200 : 300;
    return resolution + model.billing.usd;
}
