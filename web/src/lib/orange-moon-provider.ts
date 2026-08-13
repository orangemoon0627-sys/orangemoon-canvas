export const ORANGE_MOON_PROVIDER = "orangemoon" as const;
export const ORANGE_MOON_CHANNEL_ID = "orangemoon-official";
export const ORANGE_MOON_GATEWAY_URL = "canvas-agent://providers";

export const ORANGE_MOON_VIDEO_MODEL_IDS = [
    "431-Seedream-2.0-fast",
    "431-Seedream-2.0",
    "qy-seedance-2.5",
    "qy-seedance-2.0-fast",
    "qy-seedance-2.0",
] as const;

export type OrangeMoonModelCapability = "image" | "video" | "audio";
export type OrangeMoonModel = { name: string; capability: OrangeMoonModelCapability };
export type OrangeMoonVideoProductName = (typeof ORANGE_MOON_VIDEO_MODEL_IDS)[number];
export type OrangeMoonVideoResolution = "480p" | "720p" | "1080p";
export type OrangeMoonVideoTier = "fast" | "standard";
export type OrangeMoonVideoModel = {
    name: OrangeMoonVideoProductName;
    label: string;
    tier: OrangeMoonVideoTier;
    resolution: OrangeMoonVideoResolution;
    minDuration: number;
    maxDuration: number;
    fixedDuration?: number;
    allowedDurations?: number[];
    durations: number[];
    recommendedDurations?: number[];
    aspectRatios: string[];
    references: {
        images: number;
        videos: number;
        audios: number;
        imageMaxBytes: number;
        videoMaxBytes: number;
        audioMaxBytes: number;
        videoMinItemSeconds?: number;
        videoMaxItemSeconds?: number;
        videoMinTotalSeconds?: number;
        videoMaxTotalSeconds?: number;
        audioMaxTotalSeconds?: number;
        videoMinShortEdge?: number;
        videoMaxShortEdge?: number;
        videoMaxLongEdge?: number;
    };
    videoReferenceMultiplier?: number;
    supportsFrames?: boolean;
    supportsEndFrame?: boolean;
    framesConflictWithImages?: boolean;
    price: { unit: "second" | "generation"; usd: number };
};
export type OrangeMoonVideoProduct = {
    name: OrangeMoonVideoProductName;
    label: string;
    tier: OrangeMoonVideoTier;
    resolutions: OrangeMoonVideoResolution[];
    defaultResolution: OrangeMoonVideoResolution;
    rates: Partial<Record<OrangeMoonVideoResolution, number>>;
    minDuration: number;
    maxDuration: number;
    allowedDurations?: number[];
    durations: number[];
    recommendedDurations?: number[];
    aspectRatios: string[];
    references: OrangeMoonVideoModel["references"];
    videoReferenceMultiplier?: number;
    supportsFrames?: boolean;
    supportsEndFrame?: boolean;
    framesConflictWithImages?: boolean;
};

const qyReferences = { images: 9, videos: 3, audios: 3, imageMaxBytes: 15_000_000, videoMaxBytes: 50_000_000, audioMaxBytes: 15_000_000, videoMinItemSeconds: 2, videoMaxItemSeconds: 15, videoMinTotalSeconds: 2, videoMaxTotalSeconds: 15, audioMaxTotalSeconds: 15 };
const qy25References = { images: 30, videos: 10, audios: 10, imageMaxBytes: 30_000_000, videoMaxBytes: 200_000_000, audioMaxBytes: 15_000_000, videoMinItemSeconds: 3, videoMaxItemSeconds: 10, audioMaxTotalSeconds: 150, videoMinShortEdge: 720, videoMaxShortEdge: 2160, videoMaxLongEdge: 2160 };
const references431 = { images: 4, videos: 3, audios: 1, imageMaxBytes: 30_000_000, videoMaxBytes: 50_000_000, audioMaxBytes: 15_000_000, videoMinItemSeconds: 3, videoMaxItemSeconds: 10, videoMaxTotalSeconds: 15, audioMaxTotalSeconds: 15 };
const qyRatios = ["16:9", "9:16", "21:9", "4:3", "1:1", "3:4"];
const ratios431 = ["16:9", "1:1", "9:16"];

export const ORANGE_MOON_VIDEO_MODELS: OrangeMoonVideoProduct[] = [
    {
        name: "431-Seedream-2.0-fast",
        label: "Seedance 2.0 Fast（431）",
        tier: "fast",
        resolutions: ["480p", "720p"],
        defaultResolution: "720p",
        rates: { "480p": 0.136, "720p": 0.189 },
        minDuration: 5,
        maxDuration: 14,
        allowedDurations: [5, 10, 14],
        durations: [5, 10, 14],
        aspectRatios: ratios431,
        references: references431,
        supportsFrames: true,
        supportsEndFrame: true,
    },
    {
        name: "431-Seedream-2.0",
        label: "Seedance 2.0（431）",
        tier: "standard",
        resolutions: ["480p", "720p"],
        defaultResolution: "720p",
        rates: { "480p": 0.148, "720p": 0.215 },
        minDuration: 5,
        maxDuration: 14,
        allowedDurations: [5, 10, 14],
        durations: [5, 10, 14],
        aspectRatios: ratios431,
        references: references431,
        supportsFrames: true,
        supportsEndFrame: true,
    },
    {
        name: "qy-seedance-2.5",
        label: "Seedance 2.5",
        tier: "standard",
        resolutions: ["480p", "720p"],
        defaultResolution: "720p",
        rates: { "480p": 0.19, "720p": 0.24 },
        minDuration: 4,
        maxDuration: 29,
        durations: Array.from({ length: 26 }, (_, index) => index + 4),
        recommendedDurations: [5, 10, 15, 29],
        aspectRatios: ratios431,
        references: qy25References,
        videoReferenceMultiplier: 1.6,
        supportsFrames: true,
        supportsEndFrame: true,
        framesConflictWithImages: true,
    },
    {
        name: "qy-seedance-2.0-fast",
        label: "Seedance 2.0 Fast",
        tier: "fast",
        resolutions: ["480p", "720p"],
        defaultResolution: "720p",
        rates: { "480p": 1 / 6, "720p": 0.2 },
        minDuration: 5,
        maxDuration: 15,
        allowedDurations: [5, 10, 15],
        durations: [5, 10, 15],
        aspectRatios: qyRatios,
        references: qyReferences,
    },
    {
        name: "qy-seedance-2.0",
        label: "Seedance 2.0",
        tier: "standard",
        resolutions: ["480p", "720p", "1080p"],
        defaultResolution: "720p",
        rates: { "480p": 0.2, "720p": 4 / 15, "1080p": 0.6 },
        minDuration: 5,
        maxDuration: 15,
        allowedDurations: [5, 10, 15],
        durations: [5, 10, 15],
        aspectRatios: qyRatios,
        references: qyReferences,
    },
];

export const ORANGE_MOON_MODELS: OrangeMoonModel[] = [
    { name: "gpt-image-2", capability: "image" },
    ...ORANGE_MOON_VIDEO_MODELS.map((model) => ({ name: model.name, capability: "video" as const })),
    { name: "speech-2.8-hd", capability: "audio" },
    { name: "speech-2.8-turbo", capability: "audio" },
];

const LEGACY_TO_CURRENT: Record<string, OrangeMoonVideoProductName> = {
    "Seedance 2.0（431 独家）": "431-Seedream-2.0",
    "seedance-2.0": "qy-seedance-2.0",
    "seedance-2.0-fast": "qy-seedance-2.0-fast",
    "seedance-2.0-mini": "qy-seedance-2.0-fast",
    "seedance-2.0-480p-mini": "qy-seedance-2.0-fast",
    "seedance-2.0-720p-mini": "qy-seedance-2.0-fast",
    "seedance-2.0-480p-fast": "qy-seedance-2.0-fast",
    "seedance-2.0-720p-fast": "qy-seedance-2.0-fast",
    "seedance-2.0-720p-economy": "qy-seedance-2.0-fast",
    "Seedance 2.0-fast-720p": "qy-seedance-2.0-fast",
    "seedance 2.0-fast-720p": "qy-seedance-2.0-fast",
    "seedance-2.0-480p-standard": "qy-seedance-2.0",
    "seedance-2.0-720p-standard": "qy-seedance-2.0",
    "seedance-2.0-1080p-standard": "qy-seedance-2.0",
    "seedance-2.0-480p-pro": "qy-seedance-2.0",
    "seedance-2.0-720p-pro": "qy-seedance-2.0",
    "qy-seedance-2.0-480p": "qy-seedance-2.0",
    "qy-seedance-2.0-720p": "qy-seedance-2.0",
    "qy-seedance-2.0-1080p": "qy-seedance-2.0",
    "qy-seedance-2.0-fast-480p": "qy-seedance-2.0-fast",
    "qy-seedance-2.0-fast-720p": "qy-seedance-2.0-fast",
    "cc-seedance2.0 480p-fast-nsp": "qy-seedance-2.0-fast",
    "cc-seedance2.0 480p-nsp": "qy-seedance-2.0",
    "mg-seedance2.0 -1080p": "qy-seedance-2.0",
    "mg-seedance2.0 -480p": "qy-seedance-2.0",
    "mg-seedance2.0 -480p fast": "qy-seedance-2.0-fast",
    "mg-seedance2.0 -480p mini": "qy-seedance-2.0-fast",
    "mg-seedance2.0 -720p fast": "qy-seedance-2.0-fast",
    "mg-seedance2.0 -720p mini": "qy-seedance-2.0-fast",
    "mg-seedance2.0 -720p pro": "qy-seedance-2.0",
    "mg-seedance2.0 -480p-fast-gz-15s": "qy-seedance-2.0-fast",
    "mg-seedance2.0 -480p-gz-15s": "qy-seedance-2.0",
    "mg-seedance2.0 -480p-mini-gz-15s": "qy-seedance-2.0-fast",
    "mg-seedance2.0 -720p-fast-gz-15s": "qy-seedance-2.0-fast",
    "mg-seedance2.0 -720p-gz-15s": "qy-seedance-2.0",
    "mg-seedance2.0 -720p-mini-gz-15s": "qy-seedance-2.0-fast",
};

const CURRENT_BY_NORMALIZED_NAME = new Map<string, OrangeMoonVideoProductName>();
for (const model of ORANGE_MOON_VIDEO_MODELS) {
    CURRENT_BY_NORMALIZED_NAME.set(normalizeModelName(model.name), model.name);
    CURRENT_BY_NORMALIZED_NAME.set(normalizeModelName(model.label), model.name);
}

export function canonicalOrangeMoonVideoModel(name: string) {
    if (isVideoProductName(name)) return name;
    const direct = LEGACY_TO_CURRENT[name];
    if (direct) return direct;
    return CURRENT_BY_NORMALIZED_NAME.get(normalizeModelName(name)) || name;
}

export function getOrangeMoonVideoProduct(name: string) {
    const canonical = canonicalOrangeMoonVideoModel(name);
    return ORANGE_MOON_VIDEO_MODELS.find((item) => item.name === canonical);
}

export function getOrangeMoonVideoModel(name: string, requestedResolution?: string): OrangeMoonVideoModel | undefined {
    const product = getOrangeMoonVideoProduct(name);
    if (!product) return undefined;
    const requested = normalizeResolution(requestedResolution);
    const resolution = requested && product.resolutions.includes(requested) ? requested : product.defaultResolution;
    return {
        name: product.name,
        label: product.label,
        tier: product.tier,
        resolution,
        minDuration: product.minDuration,
        maxDuration: product.maxDuration,
        allowedDurations: product.allowedDurations,
        durations: product.durations,
        aspectRatios: product.aspectRatios,
        references: product.references,
        videoReferenceMultiplier: product.videoReferenceMultiplier,
        supportsFrames: product.supportsFrames,
        supportsEndFrame: product.supportsEndFrame,
        framesConflictWithImages: product.framesConflictWithImages,
        price: { unit: "second" as const, usd: product.rates[resolution]! },
    } satisfies OrangeMoonVideoModel;
}

export function resolveOrangeMoonVideoVariantName(name: string) {
    return canonicalOrangeMoonVideoModel(name);
}

export function getOrangeMoonModelLabel(name: string) {
    if (name === "gpt-image-2") return "Image 2";
    if (name === "speech-2.8-hd") return "MiniMax Speech 2.8 HD";
    if (name === "speech-2.8-turbo") return "MiniMax Speech 2.8 Turbo";
    return getOrangeMoonVideoProduct(name)?.label || name;
}

/** 用户可见的模型名不暴露供应商内部的 qy- 前缀。 */
export function getOrangeMoonModelPublicName(name: string) {
    const product = getOrangeMoonVideoProduct(name);
    return removeOrangeMoonInternalModelPrefix(product?.name || name);
}

export function removeOrangeMoonInternalModelPrefix(value: string) {
    return value.replace(/\bqy-(?=seedance-2\.(?:0(?:-fast)?|5)(?:[-:]|\b))/gi, "");
}

function normalizeResolution(value?: string): OrangeMoonVideoResolution | undefined {
    const normalized = String(value || "").trim().toLowerCase().replace(/p$/, "");
    if (normalized === "480" || normalized === "720" || normalized === "1080") return `${normalized}p` as OrangeMoonVideoResolution;
    if (normalized === "auto" || normalized === "high" || normalized === "medium") return "720p";
    if (normalized === "low") return "480p";
    return undefined;
}

function isVideoProductName(value: string): value is OrangeMoonVideoProductName {
    return ORANGE_MOON_VIDEO_MODEL_IDS.some((model) => model === value);
}

function normalizeModelName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}
