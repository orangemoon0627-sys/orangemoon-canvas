export const ORANGE_MOON_PROVIDER = "orangemoon" as const;
export const ORANGE_MOON_CHANNEL_ID = "orangemoon-official";
export const ORANGE_MOON_GATEWAY_URL = "canvas-agent://providers";

export type OrangeMoonModelCapability = "image" | "video" | "audio";
export type OrangeMoonModel = { name: string; capability: OrangeMoonModelCapability };
export type OrangeMoonVideoTier = "economy" | "mini" | "fast" | "standard" | "pro";
export type OrangeMoonVideoModel = {
    name: string;
    label: string;
    visibility: "public" | "legacy";
    tier: OrangeMoonVideoTier;
    resolution: "480p" | "720p" | "1080p";
    minDuration: number;
    maxDuration: number;
    fixedDuration?: number;
    allowedDurations?: number[];
    durations: number[];
    aspectRatios: string[];
    references: { images: number; videos: number; audios: number; imageMaxBytes: number; videoMaxBytes: number; audioMaxBytes: number };
    price: { unit: "second" | "generation"; usd: number };
};

const MB = 1024 * 1024;
const fullReferences = { images: 9, videos: 3, audios: 3, imageMaxBytes: 12 * MB, videoMaxBytes: 48 * MB, audioMaxBytes: 16 * MB };
const proReferences = { ...fullReferences, images: 4, audios: 1 };
const ccReferences = { ...fullReferences, videos: 0 };
const wideRatios = ["16:9", "9:16"];
const qyRatios = ["16:9", "9:16", "21:9", "4:3", "1:1", "3:4"];

function videoModel(
    name: string,
    label: string,
    resolution: OrangeMoonVideoModel["resolution"],
    usd: number,
    references: OrangeMoonVideoModel["references"],
    options: { fixedDuration?: number; allowedDurations?: number[]; aspectRatios?: string[]; visibility?: "public" | "legacy"; tier: OrangeMoonVideoTier },
): OrangeMoonVideoModel {
    const fixedDuration = options.fixedDuration;
    return {
        name,
        label,
        visibility: options.visibility || "legacy",
        tier: options.tier,
        resolution,
        minDuration: fixedDuration || 5,
        maxDuration: fixedDuration || 15,
        fixedDuration,
        allowedDurations: options.allowedDurations,
        durations: fixedDuration ? [fixedDuration] : options.allowedDurations || [5, 10, 15],
        aspectRatios: options.aspectRatios || wideRatios,
        references,
        price: { unit: fixedDuration ? "generation" : "second", usd },
    };
}

const ALL_ORANGE_MOON_VIDEO_MODELS: OrangeMoonVideoModel[] = [
    videoModel("seedance-2.0-480p-mini", "Seedance 2.0 480P Mini", "480p", 0.158, proReferences, { visibility: "public", tier: "mini" }),
    videoModel("seedance-2.0-480p-fast", "Seedance 2.0 480P Fast", "480p", 1 / 6, fullReferences, { allowedDurations: [5, 10, 15], aspectRatios: qyRatios, visibility: "public", tier: "fast" }),
    videoModel("seedance-2.0-480p-standard", "Seedance 2.0 480P 标准", "480p", 0.2, fullReferences, { allowedDurations: [5, 10, 15], aspectRatios: qyRatios, visibility: "public", tier: "standard" }),
    videoModel("seedance-2.0-480p-pro", "Seedance 2.0 480P Pro", "480p", 0.268, proReferences, { visibility: "public", tier: "pro" }),
    videoModel("seedance-2.0-720p-economy", "Seedance 2.0 720P 经济", "720p", 0.1, { ...fullReferences, videos: 0, audios: 0 }, { allowedDurations: [5, 10, 15], aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"], visibility: "public", tier: "economy" }),
    videoModel("seedance-2.0-720p-fast", "Seedance 2.0 720P Fast", "720p", 0.2, fullReferences, { allowedDurations: [5, 10, 15], aspectRatios: qyRatios, visibility: "public", tier: "fast" }),
    videoModel("seedance-2.0-720p-mini", "Seedance 2.0 720P Mini", "720p", 0.228, proReferences, { visibility: "public", tier: "mini" }),
    videoModel("seedance-2.0-720p-standard", "Seedance 2.0 720P 标准", "720p", 4 / 15, fullReferences, { allowedDurations: [5, 10, 15], aspectRatios: qyRatios, visibility: "public", tier: "standard" }),
    videoModel("seedance-2.0-720p-pro", "Seedance 2.0 720P Pro", "720p", 0.4, proReferences, { visibility: "public", tier: "pro" }),
    videoModel("seedance-2.0-1080p-standard", "Seedance 2.0 1080P 标准", "1080p", 0.6, fullReferences, { allowedDurations: [5, 10, 15], aspectRatios: qyRatios, visibility: "public", tier: "standard" }),
    videoModel("qy-seedance-2.0-480p", "Seedance 2.0 480P 标准（旧配置）", "480p", 0.2, fullReferences, { allowedDurations: [5, 10, 15], aspectRatios: qyRatios, tier: "standard" }),
    videoModel("qy-seedance-2.0-720p", "Seedance 2.0 720P 标准（旧配置）", "720p", 4 / 15, fullReferences, { allowedDurations: [5, 10, 15], aspectRatios: qyRatios, tier: "standard" }),
    videoModel("qy-seedance-2.0-1080p", "Seedance 2.0 1080P 标准（旧配置）", "1080p", 0.6, fullReferences, { allowedDurations: [5, 10, 15], aspectRatios: qyRatios, tier: "standard" }),
    videoModel("qy-seedance-2.0-fast-480p", "Seedance 2.0 480P Fast（旧配置）", "480p", 1 / 6, fullReferences, { allowedDurations: [5, 10, 15], aspectRatios: qyRatios, tier: "fast" }),
    videoModel("qy-seedance-2.0-fast-720p", "Seedance 2.0 720P Fast（旧配置）", "720p", 0.2, fullReferences, { allowedDurations: [5, 10, 15], aspectRatios: qyRatios, tier: "fast" }),
    videoModel("Seedance 2.0-fast-720p", "Seedance 2.0 720P 经济（旧配置）", "720p", 0.1, { ...fullReferences, videos: 0, audios: 0 }, { aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"], tier: "economy" }),
    videoModel("cc-seedance2.0 480p-fast-nsp", "Seedance 2.0 480P Fast（旧配置）", "480p", 0.33, ccReferences, { tier: "fast" }),
    videoModel("cc-seedance2.0 480p-nsp", "Seedance 2.0 480P 标准（旧配置）", "480p", 0.36, ccReferences, { tier: "standard" }),
    videoModel("mg-seedance2.0 -1080p", "Seedance 2.0 1080P 标准（旧配置）", "1080p", 0.67, fullReferences, { tier: "standard" }),
    videoModel("mg-seedance2.0 -480p", "Seedance 2.0 480P Pro（旧配置）", "480p", 0.268, proReferences, { tier: "pro" }),
    videoModel("mg-seedance2.0 -480p fast", "Seedance 2.0 480P Fast（旧配置）", "480p", 0.165, proReferences, { tier: "fast" }),
    videoModel("mg-seedance2.0 -480p mini", "Seedance 2.0 480P Mini（旧配置）", "480p", 0.158, proReferences, { tier: "mini" }),
    videoModel("mg-seedance2.0 -720p fast", "Seedance 2.0 720P Fast（旧配置）", "720p", 0.298, proReferences, { tier: "fast" }),
    videoModel("mg-seedance2.0 -720p mini", "Seedance 2.0 720P Mini（旧配置）", "720p", 0.228, proReferences, { tier: "mini" }),
    videoModel("mg-seedance2.0 -720p pro", "Seedance 2.0 720P Pro（旧配置）", "720p", 0.4, proReferences, { tier: "pro" }),
    videoModel("mg-seedance2.0 -480p-fast-gz-15s", "Seedance 2.0 480P Fast（15 秒旧配置）", "480p", 3.98, fullReferences, { fixedDuration: 15, tier: "fast" }),
    videoModel("mg-seedance2.0 -480p-gz-15s", "Seedance 2.0 480P 标准（15 秒旧配置）", "480p", 5.4, fullReferences, { fixedDuration: 15, tier: "standard" }),
    videoModel("mg-seedance2.0 -480p-mini-gz-15s", "Seedance 2.0 480P Mini（15 秒旧配置）", "480p", 2.95, fullReferences, { fixedDuration: 15, tier: "mini" }),
    videoModel("mg-seedance2.0 -720p-fast-gz-15s", "Seedance 2.0 720P Fast（15 秒旧配置）", "720p", 5, fullReferences, { fixedDuration: 15, tier: "fast" }),
    videoModel("mg-seedance2.0 -720p-gz-15s", "Seedance 2.0 720P 标准（15 秒旧配置）", "720p", 6.3, fullReferences, { fixedDuration: 15, tier: "standard" }),
    videoModel("mg-seedance2.0 -720p-mini-gz-15s", "Seedance 2.0 720P Mini（15 秒旧配置）", "720p", 2.88, fullReferences, { fixedDuration: 15, tier: "mini" }),
];

export const ORANGE_MOON_VIDEO_MODELS = ALL_ORANGE_MOON_VIDEO_MODELS
    .filter((model) => model.visibility === "public")
    .sort((left, right) => videoModelOrder(left) - videoModelOrder(right));

export const ORANGE_MOON_MODELS: OrangeMoonModel[] = [
    { name: "gpt-image-2", capability: "image" },
    ...ORANGE_MOON_VIDEO_MODELS.map((model) => ({ name: model.name, capability: "video" as const })),
    { name: "speech-2.8-hd", capability: "audio" },
    { name: "speech-2.8-turbo", capability: "audio" },
];

const LEGACY_TO_PUBLIC_VIDEO_MODEL: Record<string, string> = {
    "qy-seedance-2.0-480p": "seedance-2.0-480p-standard",
    "qy-seedance-2.0-720p": "seedance-2.0-720p-standard",
    "qy-seedance-2.0-1080p": "seedance-2.0-1080p-standard",
    "qy-seedance-2.0-fast-480p": "seedance-2.0-480p-fast",
    "qy-seedance-2.0-fast-720p": "seedance-2.0-720p-fast",
    "Seedance 2.0-fast-720p": "seedance-2.0-720p-economy",
    "cc-seedance2.0 480p-fast-nsp": "seedance-2.0-480p-fast",
    "cc-seedance2.0 480p-nsp": "seedance-2.0-480p-standard",
    "mg-seedance2.0 -1080p": "seedance-2.0-1080p-standard",
    "mg-seedance2.0 -480p": "seedance-2.0-480p-pro",
    "mg-seedance2.0 -480p fast": "seedance-2.0-480p-fast",
    "mg-seedance2.0 -480p mini": "seedance-2.0-480p-mini",
    "mg-seedance2.0 -720p fast": "seedance-2.0-720p-fast",
    "mg-seedance2.0 -720p mini": "seedance-2.0-720p-mini",
    "mg-seedance2.0 -720p pro": "seedance-2.0-720p-pro",
    "mg-seedance2.0 -480p-fast-gz-15s": "seedance-2.0-480p-fast",
    "mg-seedance2.0 -480p-gz-15s": "seedance-2.0-480p-standard",
    "mg-seedance2.0 -480p-mini-gz-15s": "seedance-2.0-480p-mini",
    "mg-seedance2.0 -720p-fast-gz-15s": "seedance-2.0-720p-fast",
    "mg-seedance2.0 -720p-gz-15s": "seedance-2.0-720p-standard",
    "mg-seedance2.0 -720p-mini-gz-15s": "seedance-2.0-720p-mini",
};

export function canonicalOrangeMoonVideoModel(name: string) {
    const legacy = LEGACY_TO_PUBLIC_VIDEO_MODEL[name];
    if (legacy) return legacy;
    const normalized = normalizeModelName(name);
    return ORANGE_MOON_VIDEO_MODELS.find((model) => normalizeModelName(model.name) === normalized || normalizeModelName(model.label) === normalized)?.name || name;
}

export function getOrangeMoonModelLabel(name: string) {
    if (name === "gpt-image-2") return "Image 2";
    if (name === "speech-2.8-hd") return "MiniMax Speech 2.8 HD";
    if (name === "speech-2.8-turbo") return "MiniMax Speech 2.8 Turbo";
    return getOrangeMoonVideoModel(name)?.label || name;
}

export function getOrangeMoonVideoModel(name: string) {
    return ALL_ORANGE_MOON_VIDEO_MODELS.find((model) => model.name === name);
}

function videoModelOrder(model: OrangeMoonVideoModel) {
    const resolution = model.resolution === "480p" ? 100 : model.resolution === "720p" ? 200 : 300;
    return resolution + model.price.usd;
}

function normalizeModelName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}
