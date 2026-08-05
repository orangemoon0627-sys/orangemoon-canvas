export const ORANGE_MOON_PROVIDER = "orangemoon" as const;
export const ORANGE_MOON_CHANNEL_ID = "orangemoon-official";
export const ORANGE_MOON_GATEWAY_URL = "canvas-agent://providers";

export const ORANGE_MOON_VIDEO_MODEL_IDS = [
    "qy-seedance-2.0-fast",
    "qy-seedance-2.0",
    "431-Seedream-2.0",
] as const;

export type OrangeMoonModelCapability = "image" | "video" | "audio";
export type OrangeMoonModel = { name: string; capability: OrangeMoonModelCapability };
export type OrangeMoonVideoProductName = (typeof ORANGE_MOON_VIDEO_MODEL_IDS)[number];
export type OrangeMoonVideoResolution = "480p" | "720p" | "1080p";
export type OrangeMoonVideoTier = "fast" | "standard" | "pro";
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
    aspectRatios: string[];
    references: { images: number; videos: number; audios: number; imageMaxBytes: number; videoMaxBytes: number; audioMaxBytes: number };
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
    aspectRatios: string[];
    references: OrangeMoonVideoModel["references"];
};

const MB = 1024 * 1024;
const qyReferences = { images: 9, videos: 3, audios: 3, imageMaxBytes: 12 * MB, videoMaxBytes: 50_000_000, audioMaxBytes: 16 * MB };
const model431References = { images: 4, videos: 3, audios: 1, imageMaxBytes: 20_000_000, videoMaxBytes: 200_000_000, audioMaxBytes: 15_000_000 };
const qyRatios = ["16:9", "9:16", "21:9", "4:3", "1:1", "3:4"];

export const ORANGE_MOON_VIDEO_MODELS: OrangeMoonVideoProduct[] = [
    {
        name: "qy-seedance-2.0-fast",
        label: "Seedance 2.0 Fast（清衍独家）",
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
        label: "Seedance 2.0（清衍独家）",
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
    {
        name: "431-Seedream-2.0",
        label: "Seedance 2.0（431 独家）",
        tier: "pro",
        resolutions: ["480p", "720p", "1080p"],
        defaultResolution: "720p",
        rates: { "480p": 0.148, "720p": 0.215, "1080p": 0.37 },
        minDuration: 4,
        maxDuration: 15,
        durations: Array.from({ length: 12 }, (_, index) => index + 4),
        aspectRatios: [...qyRatios, "9:21"],
        references: model431References,
    },
];

export const ORANGE_MOON_MODELS: OrangeMoonModel[] = [
    { name: "gpt-image-2", capability: "image" },
    ...ORANGE_MOON_VIDEO_MODELS.map((model) => ({ name: model.name, capability: "video" as const })),
    { name: "speech-2.8-hd", capability: "audio" },
    { name: "speech-2.8-turbo", capability: "audio" },
];

const LEGACY_TO_CURRENT: Record<string, OrangeMoonVideoProductName> = {
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
