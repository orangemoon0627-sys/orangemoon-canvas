import { z } from "zod";

import { findProviderModel, isExclusiveVideoModelId, METAJING_IMAGE_SIZES, resolveProviderVideoResolution } from "./provider-catalog";

export const imageRequestSchema = z
    .object({
        model: z.literal("gpt-image-2"),
        prompt: z.string().trim().min(1).max(4000),
        size: z.string().trim().default("1024x1024"),
        n: z.coerce.number().int().min(1).max(4).default(1),
        image: z.string().trim().optional(),
        response_format: z.enum(["url", "b64_json"]).default("url"),
        quality: z.string().trim().max(64).optional(),
        output_format: z.enum(["png", "jpeg", "jpg", "webp"]).default("png"),
    })
    .strict()
    .superRefine((input, context) => {
        if (!validImageSize(input.size)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["size"], message: "图片尺寸不符合 Image 2 限制" });
        if (input.image && !validMediaSource(input.image, "image")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["image"], message: "参考图必须是 data:image 或 http(s) 地址" });
    });

export const videoRequestSchema = z
    .object({
        model: z.string().trim().min(1),
        prompt: z.string().trim().min(1).max(10_000),
        duration: z.coerce.number().int(),
        resolution: z.enum(["480p", "720p", "1080p"]).optional(),
        aspect_ratio: z.string().trim(),
        images: z.array(z.string().trim()).default([]),
        videos: z.array(z.string().trim()).default([]),
        audios: z.array(z.string().trim()).default([]),
        bypass_face_check: z.boolean().optional(),
        grid_strength: z.number().min(0.01).max(0.5).optional(),
    })
    .strict()
    .superRefine((input, context) => {
        const model = findProviderModel(input.model);
        if (!model || model.provider !== "metajing" || model.capability !== "video" || !isExclusiveVideoModelId(input.model)) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["model"], message: "该视频模型已停用，橙月画布只支持 Seedance 2.0 Fast 和 Seedance 2.0" });
            return;
        }
        if (!resolveProviderVideoResolution(model, input.resolution)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["resolution"], message: `该模型只支持 ${(model.resolutions || []).join("、")}` });
        if (input.prompt.length > (model.maxPromptChars || 4_000)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["prompt"], message: `该模型提示词不能超过 ${model.maxPromptChars || 4_000} 个字符` });
        if (model.fixedDuration && input.duration !== model.fixedDuration) context.addIssue({ code: z.ZodIssueCode.custom, path: ["duration"], message: `该模型固定生成 ${model.fixedDuration} 秒` });
        if (!model.fixedDuration && (input.duration < (model.minDuration || 5) || input.duration > (model.maxDuration || 15))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["duration"], message: `时长需要在 ${model.minDuration || 5}-${model.maxDuration || 15} 秒之间` });
        if (model.allowedDurations && !model.allowedDurations.includes(input.duration)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["duration"], message: `该模型只支持 ${model.allowedDurations.join("、")} 秒` });
        if (!model.aspectRatios?.includes(input.aspect_ratio)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["aspect_ratio"], message: `该模型只支持 ${model.aspectRatios?.join("、")}` });
        const limits = model.references!;
        if (input.images.length > limits.images) context.addIssue({ code: z.ZodIssueCode.custom, path: ["images"], message: `该模型最多支持 ${limits.images} 张参考图` });
        if (input.videos.length > limits.videos) context.addIssue({ code: z.ZodIssueCode.custom, path: ["videos"], message: limits.videos ? `该模型最多支持 ${limits.videos} 段参考视频` : "该模型不支持参考视频" });
        if (input.audios.length > limits.audios) context.addIssue({ code: z.ZodIssueCode.custom, path: ["audios"], message: limits.audios ? `该模型最多支持 ${limits.audios} 段参考音频` : "该模型不支持参考音频" });
        input.images.forEach((value, index) => validateMedia(context, value, "image", "images", index));
        input.videos.forEach((value, index) => validateMedia(context, value, "video", "videos", index));
        input.audios.forEach((value, index) => validateMedia(context, value, "audio", "audios", index));
    });

export const minimaxSpeechSchema = z
    .object({
        model: z.enum(["speech-2.8-hd", "speech-2.8-turbo"]),
        input: z.string().trim().min(1).max(10_000),
        voice: z.string().trim().max(128).optional(),
        response_format: z.enum(["mp3", "wav", "flac", "pcm"]).default("mp3"),
        speed: z.coerce.number().min(0.5).max(2).default(1),
        emotion: z.enum(["happy", "sad", "angry", "fearful", "disgusted", "surprised", "calm", "fluent"]).optional(),
        language_boost: z.string().trim().max(32).default("Chinese"),
    })
    .strict();

export type ImageRequest = z.infer<typeof imageRequestSchema>;
export type VideoRequest = z.infer<typeof videoRequestSchema>;
export type SpeechRequest = z.infer<typeof minimaxSpeechSchema>;

function validImageSize(value: string) {
    const normalized = value.toLowerCase().replace("×", "x");
    if (METAJING_IMAGE_SIZES.includes(normalized)) return true;
    const match = normalized.match(/^(\d+)x(\d+)$/);
    if (!match) return false;
    const width = Number(match[1]);
    const height = Number(match[2]);
    const longSide = Math.max(width, height);
    const shortSide = Math.min(width, height);
    return shortSide >= 256 && longSide <= 3840 && width % 16 === 0 && height % 16 === 0 && width * height <= 8_294_400 && longSide / shortSide <= 3;
}

function validMediaSource(value: string, kind: "image" | "video" | "audio") {
    return value.startsWith(`data:${kind}/`) || /^https?:\/\//i.test(value);
}

function validateMedia(context: z.RefinementCtx, value: string, kind: "image" | "video" | "audio", field: string, index: number) {
    if (!validMediaSource(value, kind)) context.addIssue({ code: z.ZodIssueCode.custom, path: [field, index], message: `${kind === "image" ? "参考图" : kind === "video" ? "参考视频" : "参考音频"}必须是 data:${kind} 或 http(s) 地址` });
}
