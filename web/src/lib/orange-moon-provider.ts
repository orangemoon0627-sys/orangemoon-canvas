export const ORANGE_MOON_PROVIDER = "orangemoon" as const;
export const ORANGE_MOON_CHANNEL_ID = "orangemoon-official";
export const ORANGE_MOON_GATEWAY_URL = "canvas-agent://providers";

export type OrangeMoonModelCapability = "image" | "video" | "audio";
export type OrangeMoonModel = { name: string; capability: OrangeMoonModelCapability };
export type OrangeMoonVideoProductName = "seedance-2.0" | "seedance-2.0-fast" | "seedance-2.0-mini";
export type OrangeMoonVideoResolution = "480p" | "720p" | "1080p";
export type OrangeMoonVideoTier = "mini" | "fast" | "pro";
export type OrangeMoonVideoModel = {
    name: string;
    label: string;
    product: OrangeMoonVideoProductName;
    tier: OrangeMoonVideoTier;
    resolution: OrangeMoonVideoResolution;
    minDuration: number;
    maxDuration: number;
    fixedDuration?: number;
    allowedDurations?: number[];
    durations: number[];
    aspectRatios: string[];
    references: { images: number; videos: number; audios: number; imageMaxBytes: number; videoMaxBytes: number; audioMaxBytes: number };
    price: { unit: "second" | "generation"; usd: number };
};
export type OrangeMoonVideoProduct = {
    name: OrangeMoonVideoProductName;
    label: string;
    resolutions: OrangeMoonVideoResolution[];
    defaultResolution: OrangeMoonVideoResolution;
    variants: Partial<Record<OrangeMoonVideoResolution, string>>;
};

const MB = 1024 * 1024;
const fullReferences = { images: 9, videos: 3, audios: 3, imageMaxBytes: 12 * MB, videoMaxBytes: 48 * MB, audioMaxBytes: 16 * MB };
const proReferences = { ...fullReferences, images: 4, audios: 1 };
const wideRatios = ["16:9", "9:16"];

function videoModel(
    name: string,
    label: string,
    product: OrangeMoonVideoProductName,
    tier: OrangeMoonVideoTier,
    resolution: OrangeMoonVideoResolution,
    usd: number,
    references: OrangeMoonVideoModel["references"],
): OrangeMoonVideoModel {
    return {
        name,
        label,
        product,
        tier,
        resolution,
        minDuration: 5,
        maxDuration: 15,
        allowedDurations: [5, 10, 15],
        durations: [5, 10, 15],
        aspectRatios: wideRatios,
        references,
        price: { unit: "second", usd },
    };
}

const VIDEO_VARIANTS: OrangeMoonVideoModel[] = [
    videoModel("seedance-2.0-480p-pro", "Seedance 2.0", "seedance-2.0", "pro", "480p", 0.268, proReferences),
    videoModel("seedance-2.0-720p-pro", "Seedance 2.0", "seedance-2.0", "pro", "720p", 0.4, proReferences),
    videoModel("seedance-2.0-1080p-standard", "Seedance 2.0", "seedance-2.0", "pro", "1080p", 0.67, fullReferences),
    videoModel("seedance-2.0-480p-fast", "Seedance 2.0 Fast", "seedance-2.0-fast", "fast", "480p", 0.165, proReferences),
    videoModel("seedance-2.0-720p-fast", "Seedance 2.0 Fast", "seedance-2.0-fast", "fast", "720p", 0.298, proReferences),
    videoModel("seedance-2.0-480p-mini", "Seedance 2.0 Mini", "seedance-2.0-mini", "mini", "480p", 0.158, proReferences),
    videoModel("seedance-2.0-720p-mini", "Seedance 2.0 Mini", "seedance-2.0-mini", "mini", "720p", 0.228, proReferences),
];

export const ORANGE_MOON_VIDEO_MODELS: OrangeMoonVideoProduct[] = [
    {
        name: "seedance-2.0",
        label: "Seedance 2.0",
        resolutions: ["480p", "720p", "1080p"],
        defaultResolution: "720p",
        variants: { "480p": "seedance-2.0-480p-pro", "720p": "seedance-2.0-720p-pro", "1080p": "seedance-2.0-1080p-standard" },
    },
    {
        name: "seedance-2.0-fast",
        label: "Seedance 2.0 Fast",
        resolutions: ["480p", "720p"],
        defaultResolution: "720p",
        variants: { "480p": "seedance-2.0-480p-fast", "720p": "seedance-2.0-720p-fast" },
    },
    {
        name: "seedance-2.0-mini",
        label: "Seedance 2.0 Mini",
        resolutions: ["480p", "720p"],
        defaultResolution: "720p",
        variants: { "480p": "seedance-2.0-480p-mini", "720p": "seedance-2.0-720p-mini" },
    },
];

export const ORANGE_MOON_MODELS: OrangeMoonModel[] = [
    { name: "gpt-image-2", capability: "image" },
    ...ORANGE_MOON_VIDEO_MODELS.map((model) => ({ name: model.name, capability: "video" as const })),
    { name: "speech-2.8-hd", capability: "audio" },
    { name: "speech-2.8-turbo", capability: "audio" },
];

const LEGACY_TO_PRODUCT: Record<string, OrangeMoonVideoProductName> = {
    "seedance-2.0-480p-mini": "seedance-2.0-mini",
    "seedance-2.0-720p-mini": "seedance-2.0-mini",
    "seedance-2.0-480p-fast": "seedance-2.0-fast",
    "seedance-2.0-720p-fast": "seedance-2.0-fast",
    "seedance-2.0-720p-economy": "seedance-2.0-fast",
    "seedance-2.0-480p-standard": "seedance-2.0",
    "seedance-2.0-720p-standard": "seedance-2.0",
    "seedance-2.0-1080p-standard": "seedance-2.0",
    "seedance-2.0-480p-pro": "seedance-2.0",
    "seedance-2.0-720p-pro": "seedance-2.0",
    "qy-seedance-2.0-480p": "seedance-2.0",
    "qy-seedance-2.0-720p": "seedance-2.0",
    "qy-seedance-2.0-1080p": "seedance-2.0",
    "qy-seedance-2.0-fast-480p": "seedance-2.0-fast",
    "qy-seedance-2.0-fast-720p": "seedance-2.0-fast",
    "Seedance 2.0-fast-720p": "seedance-2.0-fast",
    "cc-seedance2.0 480p-fast-nsp": "seedance-2.0-fast",
    "cc-seedance2.0 480p-nsp": "seedance-2.0",
    "mg-seedance2.0 -1080p": "seedance-2.0",
    "mg-seedance2.0 -480p": "seedance-2.0",
    "mg-seedance2.0 -480p fast": "seedance-2.0-fast",
    "mg-seedance2.0 -480p mini": "seedance-2.0-mini",
    "mg-seedance2.0 -720p fast": "seedance-2.0-fast",
    "mg-seedance2.0 -720p mini": "seedance-2.0-mini",
    "mg-seedance2.0 -720p pro": "seedance-2.0",
    "mg-seedance2.0 -480p-fast-gz-15s": "seedance-2.0-fast",
    "mg-seedance2.0 -480p-gz-15s": "seedance-2.0",
    "mg-seedance2.0 -480p-mini-gz-15s": "seedance-2.0-mini",
    "mg-seedance2.0 -720p-fast-gz-15s": "seedance-2.0-fast",
    "mg-seedance2.0 -720p-gz-15s": "seedance-2.0",
    "mg-seedance2.0 -720p-mini-gz-15s": "seedance-2.0-mini",
};

export function canonicalOrangeMoonVideoModel(name: string) {
    if (isVideoProductName(name)) return name;
    const direct = LEGACY_TO_PRODUCT[name];
    if (direct) return direct;
    const normalized = normalizeModelName(name);
    const product = ORANGE_MOON_VIDEO_MODELS.find((item) => normalizeModelName(item.name) === normalized || normalizeModelName(item.label) === normalized);
    if (product) return product.name;
    if (!normalized.includes("seedance")) return name;
    if (normalized.includes("mini")) return "seedance-2.0-mini";
    if (normalized.includes("fast") || normalized.includes("economy")) return "seedance-2.0-fast";
    return "seedance-2.0";
}

export function getOrangeMoonVideoProduct(name: string) {
    const canonical = canonicalOrangeMoonVideoModel(name);
    return ORANGE_MOON_VIDEO_MODELS.find((item) => item.name === canonical);
}

export function getOrangeMoonVideoModel(name: string, requestedResolution?: string) {
    const product = getOrangeMoonVideoProduct(name);
    if (!product) return undefined;
    const resolution = normalizeResolution(requestedResolution) || inferResolution(name) || product.defaultResolution;
    const variantName = product.variants[product.resolutions.includes(resolution) ? resolution : product.defaultResolution];
    return VIDEO_VARIANTS.find((item) => item.name === variantName);
}

export function resolveOrangeMoonVideoVariantName(name: string, requestedResolution?: string) {
    return getOrangeMoonVideoModel(name, requestedResolution)?.name || name;
}

export function getOrangeMoonModelLabel(name: string) {
    if (name === "gpt-image-2") return "Image 2";
    if (name === "speech-2.8-hd") return "MiniMax Speech 2.8 HD";
    if (name === "speech-2.8-turbo") return "MiniMax Speech 2.8 Turbo";
    return getOrangeMoonVideoProduct(name)?.label || name;
}

function normalizeResolution(value?: string): OrangeMoonVideoResolution | undefined {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "480" || normalized === "480p") return "480p";
    if (normalized === "720" || normalized === "720p" || normalized === "auto" || normalized === "high" || normalized === "medium") return "720p";
    if (normalized === "1080" || normalized === "1080p") return "1080p";
    return undefined;
}

function inferResolution(name: string) {
    const match = name.toLowerCase().match(/(480|720|1080)p?/);
    return normalizeResolution(match?.[1]);
}

function isVideoProductName(value: string): value is OrangeMoonVideoProductName {
    return value === "seedance-2.0" || value === "seedance-2.0-fast" || value === "seedance-2.0-mini";
}

function normalizeModelName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}
