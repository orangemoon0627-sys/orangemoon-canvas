import { modelOptionName, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import { getOrangeMoonVideoModel, getOrangeMoonVideoProduct } from "@/lib/orange-moon-provider";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { VideoReferenceMode } from "@/types/media";

export const SEEDANCE_REFERENCE_LIMITS = {
    images: 9,
    videos: 3,
    audios: 3,
    imageMaxBytes: 30 * 1024 * 1024,
    videoMaxBytes: 50 * 1024 * 1024,
    audioMaxBytes: 15 * 1024 * 1024,
};

export const seedanceResolutionOptions = [
    { value: "480p", label: "480p" },
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
] as const;

export const seedanceRatioOptions = [
    { value: "16:9", label: "横屏" },
    { value: "9:16", label: "竖屏" },
    { value: "1:1", label: "方形" },
    { value: "4:3", label: "标准横屏" },
    { value: "3:4", label: "标准竖屏" },
    { value: "21:9", label: "宽银幕" },
    { value: "adaptive", label: "自适应" },
] as const;

export const seedanceDurationOptions = [-1, 4, 5, 6, 8, 10, 12, 15] as const;

const seedancePixels = {
    "480p": {
        "16:9": "864x496",
        "4:3": "752x560",
        "1:1": "640x640",
        "3:4": "560x752",
        "9:16": "496x864",
        "21:9": "992x432",
    },
    "720p": {
        "16:9": "1280x720",
        "4:3": "1112x834",
        "1:1": "960x960",
        "3:4": "834x1112",
        "9:16": "720x1280",
        "21:9": "1470x630",
    },
    "1080p": {
        "16:9": "1920x1080",
        "4:3": "1664x1248",
        "1:1": "1440x1440",
        "3:4": "1248x1664",
        "9:16": "1080x1920",
        "21:9": "2206x946",
    },
} as const;

export function isSeedanceVideoConfig(config: AiConfig | Pick<AiConfig, "model" | "videoModel" | "baseUrl">) {
    const requestConfig = "channels" in config ? resolveModelRequestConfig(config, config.model || config.videoModel) : config;
    return isSeedanceVideoModel(modelOptionName(requestConfig.model || requestConfig.videoModel)) || isArkPlanBaseUrl(requestConfig.baseUrl);
}

export function isSeedanceVideoModel(model: string) {
    const value = model.toLowerCase();
    return Boolean(getOrangeMoonVideoProduct(model)) || value.includes("seedance") || value.includes("doubao-seedance");
}

export function isSeedanceFastModel(model: string) {
    const value = model.toLowerCase();
    return isSeedanceVideoModel(value) && value.includes("fast");
}

export function isArkPlanBaseUrl(baseUrl: string) {
    return baseUrl.toLowerCase().includes("ark.cn-beijing.volces.com/api/plan/v3") || baseUrl.toLowerCase().includes("/api/plan/v3");
}

export function normalizeSeedanceResolution(value: string, model = "") {
    const normalized = normalizeResolutionToken(value);
    const product = getOrangeMoonVideoProduct(modelOptionName(model));
    if (product && !product.resolutions.includes(normalized as (typeof product.resolutions)[number])) return product.defaultResolution;
    if (isSeedanceFastModel(model) && normalized === "1080p") return "720p";
    return seedanceResolutionOptions.some((item) => item.value === normalized) ? normalized : "720p";
}

export function normalizeResolutionToken(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = String(value || "").replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

export function normalizeSeedanceDuration(value: string) {
    if (String(value).trim() === "-1") return -1;
    const seconds = Math.floor(Number(value) || 5);
    return Math.max(4, Math.min(15, seconds));
}

export function normalizeSeedanceDurationForModel(model: string, value: string) {
    const orangeMoonModel = getOrangeMoonVideoModel(modelOptionName(model));
    const duration = orangeMoonModel
        ? Math.max(orangeMoonModel.minDuration, Math.min(orangeMoonModel.maxDuration, Math.floor(Number(value) || orangeMoonModel.minDuration)))
        : normalizeSeedanceDuration(value);
    if (!orangeMoonModel?.fixedDuration && !orangeMoonModel?.allowedDurations?.length) return duration;
    return orangeMoonModel.durations.reduce((best, current) => (Math.abs(current - duration) < Math.abs(best - duration) ? current : best), orangeMoonModel.durations[0]);
}

export function normalizeSeedanceRatio(value: string) {
    if (!value || value === "auto" || value === "adaptive") return "adaptive";
    if (seedanceRatioOptions.some((item) => item.value === value)) return value;
    const match = value.match(/^(\d+)x(\d+)$/);
    if (!match) return "adaptive";
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return "adaptive";
    const ratio = width / height;
    const options = [
        ["16:9", 16 / 9],
        ["4:3", 4 / 3],
        ["1:1", 1],
        ["3:4", 3 / 4],
        ["9:16", 9 / 16],
        ["21:9", 21 / 9],
    ] as const;
    return options.reduce((best, item) => (Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best), options[0])[0];
}

export function seedancePixelLabel(resolution: string, ratio: string) {
    const normalizedResolution = normalizeSeedanceResolution(resolution) as keyof typeof seedancePixels;
    const normalizedRatio = normalizeSeedanceRatio(ratio) as keyof (typeof seedancePixels)[typeof normalizedResolution] | "adaptive";
    if (normalizedRatio === "adaptive") return "自动匹配";
    return seedancePixels[normalizedResolution][normalizedRatio] || "";
}

export function boolConfig(value: string | undefined, fallback: boolean) {
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
}

export function seedanceReferenceLabel(kind: "image" | "video" | "audio", index: number) {
    if (kind === "image") return `图片${index + 1}`;
    if (kind === "video") return `视频${index + 1}`;
    return `音频${index + 1}`;
}

export function buildSeedancePromptText(prompt: string, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[], referenceMode: VideoReferenceMode = "ref") {
    const labels = [
        ...images.map((_, index) => referenceMode === "firstlast" && index < 2 ? (index === 0 ? "首帧图片1" : "尾帧图片2") : referenceMode === "first" && index === 0 ? "首帧图片1" : seedanceReferenceLabel("image", index)),
        ...videos.map((_, index) => seedanceReferenceLabel("video", index)),
        ...audios.map((_, index) => seedanceReferenceLabel("audio", index)),
    ];
    const text = prompt.trim();
    if (!labels.length) return text;
    return `参考资产编号：${labels.join("、")}。请按这些编号理解提示词中的图片、视频和音频引用。\n\n${text}`;
}

export function seedanceVideoReferenceError(videos: ReferenceVideo[]) {
    let totalDurationMs = 0;
    for (let index = 0; index < videos.length; index += 1) {
        const video = videos[index];
        const label = seedanceReferenceLabel("video", index);
        if (video.bytes && video.bytes > SEEDANCE_REFERENCE_LIMITS.videoMaxBytes) return `${label} 超过 50MB，请压缩后再上传`;
        if (video.durationMs) {
            if (video.durationMs < 2000 || video.durationMs > 15000) return `${label} 时长需要在 2-15 秒之间`;
            totalDurationMs += video.durationMs;
        }
        if (video.width && video.height) {
            if (video.width < 300 || video.width > 6000 || video.height < 300 || video.height > 6000) return `${label} 宽高需要在 300-6000px 之间`;
            const ratio = video.width / video.height;
            if (ratio < 0.4 || ratio > 2.5) return `${label} 宽高比需要在 0.4-2.5 之间`;
            const pixels = video.width * video.height;
            if (pixels < 640 * 640 || pixels > 2206 * 946) return `${label} 像素总量不符合 Seedance 要求，请转成 480p/720p/1080p 后再上传`;
        }
    }
    if (totalDurationMs > 15000) return "Seedance 参考视频总时长不能超过 15 秒";
    return "";
}

export function seedanceReferenceLimitsForModel(model: string): NonNullable<ReturnType<typeof getOrangeMoonVideoModel>>["references"] {
    return getOrangeMoonVideoModel(modelOptionName(model))?.references || SEEDANCE_REFERENCE_LIMITS;
}

export function seedanceReferenceSetError(model: string, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[], referenceMode: VideoReferenceMode = "ref") {
    const orangeMoonModel = getOrangeMoonVideoModel(modelOptionName(model));
    if (!orangeMoonModel) return seedanceVideoReferenceError(videos);
    const frameError = seedanceFrameReferenceError(orangeMoonModel, referenceMode, images.length);
    if (frameError) return frameError;
    const limits = orangeMoonModel.references;
    if (images.length > limits.images) return `当前模型最多支持 ${limits.images} 张参考图`;
    if (videos.length > limits.videos) return limits.videos ? `当前模型最多支持 ${limits.videos} 段参考视频` : "当前模型不支持参考视频";
    if (audios.length > limits.audios) return limits.audios ? `当前模型最多支持 ${limits.audios} 段参考音频` : "当前模型不支持参考音频";
    let totalDurationMs = 0;
    for (const video of videos) {
        if (orangeMoonModel.name === "qy-seedance-2.5" && video.type && !isMp4OrMov(video.type, video.name)) return `${video.name} 需要使用 MP4 或 MOV 格式`;
        if (video.bytes && video.bytes > limits.videoMaxBytes) return `${video.name} 超过 ${Math.round(limits.videoMaxBytes / 1024 / 1024)}MB，请压缩后再上传`;
        if (video.width && video.height && limits.videoMinShortEdge) {
            const shortEdge = Math.min(video.width, video.height);
            const longEdge = Math.max(video.width, video.height);
            if (shortEdge < limits.videoMinShortEdge || shortEdge > (limits.videoMaxShortEdge || Number.POSITIVE_INFINITY) || longEdge > (limits.videoMaxLongEdge || Number.POSITIVE_INFINITY)) {
                return `${video.name} 分辨率不符合当前模型要求：短边 ${limits.videoMinShortEdge}-${limits.videoMaxShortEdge}px，长边不超过 ${limits.videoMaxLongEdge}px`;
            }
        }
        if (!video.durationMs) continue;
        const minItemMs = (limits.videoMinItemSeconds || 0) * 1000;
        const maxItemMs = (limits.videoMaxItemSeconds || 15) * 1000;
        if (video.durationMs < minItemMs || video.durationMs > maxItemMs) return `${video.name} 时长需要在 ${limits.videoMinItemSeconds || 0}-${limits.videoMaxItemSeconds || 15} 秒之间`;
        totalDurationMs += video.durationMs;
    }
    if (totalDurationMs && totalDurationMs < (limits.videoMinTotalSeconds || 0) * 1000) return `参考视频总时长不能少于 ${limits.videoMinTotalSeconds} 秒`;
    if (limits.videoMaxTotalSeconds && totalDurationMs > limits.videoMaxTotalSeconds * 1000) return `参考视频总时长不能超过 ${limits.videoMaxTotalSeconds} 秒`;
    let audioDurationMs = 0;
    const maxAudioItemSeconds = limits.audioMaxItemSeconds || limits.audioMaxTotalSeconds || 15;
    for (const audio of audios) {
        if (orangeMoonModel.name === "qy-seedance-2.5" && audio.type && !isMp3OrWav(audio.type, audio.name)) return `${audio.name} 需要使用 MP3 或 WAV 格式`;
        if (audio.bytes && audio.bytes > limits.audioMaxBytes) return `${audio.name} 超过 ${Math.round(limits.audioMaxBytes / 1_000_000)}MB，请压缩后再上传`;
        if (audio.durationMs && audio.durationMs > maxAudioItemSeconds * 1000) return `${audio.name} 时长不能超过 ${maxAudioItemSeconds} 秒`;
        audioDurationMs += audio.durationMs || 0;
    }
    if (limits.audioMaxTotalSeconds && audioDurationMs > limits.audioMaxTotalSeconds * 1000) return `参考音频总时长不能超过 ${limits.audioMaxTotalSeconds} 秒`;
    return "";
}

export function seedanceFrameReferenceError(model: NonNullable<ReturnType<typeof getOrangeMoonVideoModel>>, mode: VideoReferenceMode, imageCount: number) {
    if (mode === "ref") return "";
    if (!model.supportsFrames) return "当前模型不支持首尾帧参考";
    const required = mode === "firstlast" ? 2 : 1;
    if (mode === "firstlast" && !model.supportsEndFrame) return "当前模型不支持尾帧参考";
    if (imageCount < required) return mode === "firstlast" ? "首尾帧模式需要按顺序连接 2 张图片" : "首帧模式需要连接 1 张图片";
    if (model.framesConflictWithImages && imageCount > required) return `${mode === "firstlast" ? "首尾帧" : "首帧"}模式不能再连接普通参考图`;
    return "";
}

export function partitionSeedanceReferenceImages<T>(images: T[], mode: VideoReferenceMode) {
    if (mode === "ref") return { images };
    if (mode === "firstlast") return { images: images.slice(2), startFrame: images[0], endFrame: images[1] };
    return { images: images.slice(1), startFrame: images[0] };
}

function isMp4OrMov(type: string, name: string) {
    return type === "video/mp4" || type === "video/quicktime" || /\.(mp4|mov)$/i.test(name);
}

function isMp3OrWav(type: string, name: string) {
    return ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"].includes(type) || /\.(mp3|wav)$/i.test(name);
}

export const seedanceVideoReferenceHint = "参考视频需为 mp4/mov，H.264/H.265，FPS 24-60；含真人人脸资产请使用火山授权 asset:// 资产。";
