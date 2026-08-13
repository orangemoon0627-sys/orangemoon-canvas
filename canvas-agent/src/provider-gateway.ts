import { execFileSync } from "node:child_process";

import type { Express, Request, Response } from "express";
import { z } from "zod";

import { estimateProviderCost, findProviderModel, isExclusiveVideoModelId, METAJING_IMAGE_SIZES, providerBilling, providerUsdToCny, PROVIDER_CATALOG_VERSION, PROVIDER_MODELS, PUBLIC_PROVIDER_MODELS, resolveProviderVideoResolution, type ProviderVideoResolution } from "./provider-catalog.js";

const METAJING_BASE_URL = "https://metajing.cn";
const MINIMAX_BASE_URL = "https://api.minimax.io";
const METAJING_KEYCHAIN_SERVICE = "orangemoon-canvas-metajing-api-key";
const MINIMAX_KEYCHAIN_SERVICE = "minimax-audio-api-key";
const MINIMAX_VOICE_KEYCHAIN_SERVICE = "orangemoon-canvas-minimax-default-voice";
const OPENAI_VOICE_NAMES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "marin", "cedar"]);

const imageRequestSchema = z
    .object({
        model: z.literal("gpt-image-2"),
        prompt: z.string().trim().min(1).max(4000),
        size: z.string().trim().default("1024x1024"),
        n: z.coerce.number().int().min(1).max(4).default(1),
        images: z.array(z.string().trim()).default([]),
        image: z.string().trim().optional(),
        response_format: z.enum(["url", "b64_json"]).default("url"),
        quality: z.string().trim().max(64).optional(),
        output_format: z.enum(["png", "jpeg", "jpg", "webp"]).default("png"),
    })
    .strict()
    .superRefine((input, context) => {
        if (!validImageSize(input.size)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["size"], message: "图片尺寸不符合 Image 2 限制" });
        const images = [...input.images, ...(input.image ? [input.image] : [])];
        if (images.length > 4) context.addIssue({ code: z.ZodIssueCode.custom, path: ["images"], message: "Image 2 最多支持 4 张参考图" });
        images.forEach((value, index) => {
            if (!validMediaSource(value, "image")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["images", index], message: "参考图必须是 data:image 或 http(s) 地址" });
        });
    })
    .transform((input) => ({ ...input, images: Array.from(new Set([...input.images, ...(input.image ? [input.image] : [])])), image: undefined }));

const videoRequestSchema = z
    .object({
        model: z.string().trim().min(1),
        prompt: z.string().trim().min(1).max(10_000),
        duration: z.coerce.number().int(),
        resolution: z.enum(["480p", "720p", "1080p"]).optional(),
        aspect_ratio: z.string().trim(),
        images: z.array(z.string().trim()).default([]),
        videos: z.array(z.string().trim()).default([]),
        audios: z.array(z.string().trim()).default([]),
        start_frame_url: z.string().trim().optional(),
        end_frame_url: z.string().trim().optional(),
        bypass_face_check: z.boolean().optional(),
        grid_strength: z.number().min(0.01).max(0.5).optional(),
    })
    .strict()
    .superRefine((input, context) => {
        const model = findProviderModel(input.model);
        if (!model || model.provider !== "metajing" || model.capability !== "video" || !isExclusiveVideoModelId(input.model)) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["model"], message: "该视频模型已停用，橙月画布只支持已登记的 Seedance 独家通道" });
            return;
        }
        if (!resolveProviderVideoResolution(model, input.resolution)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["resolution"], message: `该模型只支持 ${(model.resolutions || []).join("、")}` });
        if (input.prompt.length > (model.maxPromptChars || 4_000)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["prompt"], message: `该模型提示词不能超过 ${model.maxPromptChars || 4_000} 个字符` });
        if (model.fixedDuration && input.duration !== model.fixedDuration) context.addIssue({ code: z.ZodIssueCode.custom, path: ["duration"], message: `该模型固定生成 ${model.fixedDuration} 秒` });
        if (!model.fixedDuration && (input.duration < (model.minDuration || 5) || input.duration > (model.maxDuration || 15))) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["duration"], message: `时长需要在 ${model.minDuration || 5}-${model.maxDuration || 15} 秒之间` });
        }
        if (model.allowedDurations && !model.allowedDurations.includes(input.duration)) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["duration"], message: `该模型只支持 ${model.allowedDurations.join("、")} 秒` });
        }
        if (!model.aspectRatios?.includes(input.aspect_ratio)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["aspect_ratio"], message: `该模型只支持 ${model.aspectRatios?.join("、")}` });
        if ((input.start_frame_url || input.end_frame_url) && !model.supportsFrames) context.addIssue({ code: z.ZodIssueCode.custom, path: ["start_frame_url"], message: "该模型不支持首尾帧" });
        if (input.end_frame_url && !input.start_frame_url) context.addIssue({ code: z.ZodIssueCode.custom, path: ["end_frame_url"], message: "尾帧必须同时提供首帧" });
        if (input.end_frame_url && !model.supportsEndFrame) context.addIssue({ code: z.ZodIssueCode.custom, path: ["end_frame_url"], message: "该模型不支持尾帧" });
        if (model.framesConflictWithImages && input.start_frame_url && input.images.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["images"], message: "该模型的首尾帧不能与普通参考图同时使用" });
        if (input.start_frame_url && !validMediaSource(input.start_frame_url, "image")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["start_frame_url"], message: "首帧必须是 data:image 或 http(s) 地址" });
        if (input.end_frame_url && !validMediaSource(input.end_frame_url, "image")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["end_frame_url"], message: "尾帧必须是 data:image 或 http(s) 地址" });
        const limits = model.references!;
        if (input.images.length > limits.images) context.addIssue({ code: z.ZodIssueCode.custom, path: ["images"], message: `该模型最多支持 ${limits.images} 张参考图` });
        if (input.videos.length > limits.videos) context.addIssue({ code: z.ZodIssueCode.custom, path: ["videos"], message: limits.videos ? `该模型最多支持 ${limits.videos} 段参考视频` : "该模型不支持参考视频" });
        if (input.audios.length > limits.audios) context.addIssue({ code: z.ZodIssueCode.custom, path: ["audios"], message: limits.audios ? `该模型最多支持 ${limits.audios} 段参考音频` : "该模型不支持参考音频" });
        input.images.forEach((value, index) => {
            if (!validMediaSource(value, "image")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["images", index], message: "参考图必须是 data:image 或 http(s) 地址" });
            if (dataUrlBytes(value) > limits.imageMaxBytes) context.addIssue({ code: z.ZodIssueCode.custom, path: ["images", index], message: `第 ${index + 1} 个参考图超过 ${formatMegabytes(limits.imageMaxBytes)}MB 上限` });
        });
        input.videos.forEach((value, index) => {
            if (!validMediaSource(value, "video")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["videos", index], message: "参考视频必须是 data:video 或 http(s) 地址" });
            if (dataUrlBytes(value) > limits.videoMaxBytes) context.addIssue({ code: z.ZodIssueCode.custom, path: ["videos", index], message: `第 ${index + 1} 个参考视频超过 ${formatMegabytes(limits.videoMaxBytes)}MB 上限` });
        });
        input.audios.forEach((value, index) => {
            if (!validMediaSource(value, "audio")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["audios", index], message: "参考音频必须是 data:audio 或 http(s) 地址" });
            if (dataUrlBytes(value) > limits.audioMaxBytes) context.addIssue({ code: z.ZodIssueCode.custom, path: ["audios", index], message: `第 ${index + 1} 个参考音频超过 ${formatMegabytes(limits.audioMaxBytes)}MB 上限` });
        });
    });

const minimaxSpeechSchema = z
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

export function registerProviderGateway(app: Express) {
    app.get("/providers/catalog", providerRoute(async (_req, res) => {
        const status = providerStatus();
        res.setHeader("Cache-Control", "no-store").json({
            ok: true,
            version: PROVIDER_CATALOG_VERSION,
            currency: {
                usdToCny: providerUsdToCny("metajing"),
                providerUsdToCny: { metajing: providerUsdToCny("metajing"), minimax: providerUsdToCny("minimax") },
                creditToCny: 1,
            },
            providers: status,
            image: { maxCount: 4, maxReferences: 4, sizes: METAJING_IMAGE_SIZES },
            models: PUBLIC_PROVIDER_MODELS.map((model) => {
                return {
                    ...model,
                    examples: providerCostExamples(model, model.defaultResolution),
                    ...(model.capability === "video" ? { resolutionExamples: Object.fromEntries((model.resolutions || []).map((resolution) => [resolution, providerCostExamples(model, resolution)])) } : {}),
                    ...(model.videoReferenceMultiplier ? { videoReferenceResolutionExamples: Object.fromEntries((model.resolutions || []).map((resolution) => [resolution, providerCostExamples(model, resolution, { hasVideoReferences: true })])) } : {}),
                };
            }),
        });
    }));

    app.post("/providers/metajing/v1/images/generations", providerRoute(async (req, res) => {
        const payload = imageRequestSchema.parse(req.body);
        const config = metaJingConfig();
        const result = await upstreamJson(`${config.baseUrl}/v1/images/generations`, { method: "POST", headers: providerHeaders(config.apiKey), body: JSON.stringify(payload) }, 310_000);
        res.setHeader("Cache-Control", "no-store").json(result);
    }));

    app.post("/providers/metajing/v1/video/generations", providerRoute(async (req, res) => {
        const payload = videoRequestSchema.parse(req.body);
        const config = metaJingConfig();
        const model = findProviderModel(payload.model);
        if (!model || model.capability !== "video" || !isExclusiveVideoModelId(payload.model)) throw new ProviderGatewayError(400, "该视频模型已停用，禁止调用上游");
        const resolution = resolveProviderVideoResolution(model, payload.resolution);
        if (!resolution) throw new ProviderGatewayError(400, `${model.label} 不支持 ${payload.resolution || "当前"} 分辨率`);
        const upstreamPayload = { ...payload, model: model.id, resolution };
        const headers = providerHeaders(config.apiKey);
        const result = await upstreamJson(`${config.baseUrl}/v1/video/generations`, { method: "POST", headers, body: JSON.stringify(upstreamPayload) }, 120_000);
        res.setHeader("Cache-Control", "no-store").json(result);
    }));

    app.get("/providers/metajing/v1/video/generations/:taskId", providerRoute(async (req, res) => {
        const taskId = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/).parse(routeParam(req.params.taskId));
        const config = metaJingConfig();
        const result = await upstreamJson(`${config.baseUrl}/v1/video/generations/${encodeURIComponent(taskId)}`, { headers: providerHeaders(config.apiKey) }, 60_000);
        res.setHeader("Cache-Control", "no-store").json(result);
    }));

    app.post("/providers/minimax/v1/audio/speech", providerRoute(async (req, res) => {
        const input = minimaxSpeechSchema.parse(req.body);
        const config = miniMaxConfig();
        const requestedVoice = input.voice && !OPENAI_VOICE_NAMES.has(input.voice.toLowerCase()) ? input.voice : "";
        const voiceId = requestedVoice || config.defaultVoiceId;
        if (!voiceId) throw new ProviderGatewayError(503, "MiniMax 默认音色尚未配置");
        const payload = {
            model: input.model,
            text: input.input,
            stream: false,
            output_format: "hex",
            language_boost: input.language_boost,
            voice_setting: { voice_id: voiceId, speed: input.speed, vol: 1, pitch: 0, ...(input.emotion ? { emotion: input.emotion } : {}) },
            audio_setting: { sample_rate: 32000, bitrate: 128000, format: input.response_format, channel: 1 },
        };
        const result = await upstreamJson(`${config.baseUrl}/v1/t2a_v2`, { method: "POST", headers: providerHeaders(config.apiKey), body: JSON.stringify(payload) }, 120_000) as MiniMaxSpeechResponse;
        if (result.base_resp?.status_code !== 0) throw new ProviderGatewayError(502, result.base_resp?.status_msg || "MiniMax 语音生成失败");
        if (!result.data?.audio || !/^[0-9a-f]+$/i.test(result.data.audio)) throw new ProviderGatewayError(502, "MiniMax 没有返回有效音频");
        const audio = Buffer.from(result.data.audio, "hex");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", audioMimeType(input.response_format));
        res.setHeader("Content-Length", String(audio.byteLength));
        if (result.extra_info?.usage_characters !== undefined) res.setHeader("X-Provider-Usage-Characters", String(result.extra_info.usage_characters));
        res.send(audio);
    }));
}

export function providerStatus() {
    const metaJingKey = readSecret("METAJING_API_KEY", process.env.METAJING_KEYCHAIN_SERVICE || METAJING_KEYCHAIN_SERVICE);
    const miniMaxKey = readSecret("MINIMAX_AUDIO_API_KEY", process.env.MINIMAX_AUDIO_KEYCHAIN_SERVICE || MINIMAX_KEYCHAIN_SERVICE);
    const defaultVoiceId = readSecret("MINIMAX_DEFAULT_VOICE_ID", process.env.MINIMAX_VOICE_KEYCHAIN_SERVICE || MINIMAX_VOICE_KEYCHAIN_SERVICE);
    return {
        metajing: { configured: Boolean(metaJingKey), auth: metaJingKey ? "server-managed" : "missing" },
        minimax: { configured: Boolean(miniMaxKey), defaultVoiceConfigured: Boolean(defaultVoiceId), auth: miniMaxKey ? "server-managed" : "missing" },
    };
}

function metaJingConfig() {
    const apiKey = readSecret("METAJING_API_KEY", process.env.METAJING_KEYCHAIN_SERVICE || METAJING_KEYCHAIN_SERVICE);
    if (!apiKey) throw new ProviderGatewayError(503, `MetaJing 密钥尚未配置（Keychain service: ${METAJING_KEYCHAIN_SERVICE}）`);
    return { apiKey, baseUrl: cleanBaseUrl(process.env.METAJING_API_BASE || METAJING_BASE_URL) };
}

function miniMaxConfig() {
    const apiKey = readSecret("MINIMAX_AUDIO_API_KEY", process.env.MINIMAX_AUDIO_KEYCHAIN_SERVICE || MINIMAX_KEYCHAIN_SERVICE);
    if (!apiKey) throw new ProviderGatewayError(503, `MiniMax 密钥尚未配置（Keychain service: ${MINIMAX_KEYCHAIN_SERVICE}）`);
    return {
        apiKey,
        baseUrl: cleanBaseUrl(process.env.MINIMAX_API_BASE || MINIMAX_BASE_URL),
        defaultVoiceId: readSecret("MINIMAX_DEFAULT_VOICE_ID", process.env.MINIMAX_VOICE_KEYCHAIN_SERVICE || MINIMAX_VOICE_KEYCHAIN_SERVICE),
    };
}

function readSecret(envName: string, keychainService: string) {
    const fromEnvironment = String(process.env[envName] || "").trim();
    if (fromEnvironment) return fromEnvironment;
    if (process.platform !== "darwin") return "";
    try {
        return execFileSync("security", ["find-generic-password", "-s", keychainService, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
        return "";
    }
}

function providerCostExamples(model: (typeof PROVIDER_MODELS)[number], resolution?: ProviderVideoResolution, options: { hasVideoReferences?: boolean } = {}) {
    if (model.capability === "image") return [{ quantity: 1, unit: "张", ...estimateProviderCost(model, 1) }];
    if (model.capability === "audio") return [{ quantity: 1000, unit: "字符", ...estimateProviderCost(model, 1000) }];
    const billing = providerBilling(model, resolution);
    return (model.recommendedDurations || [5, 10, 15]).map((duration) => ({ quantity: duration, unit: billing?.unit === "generation" ? "秒/条" : "秒", ...estimateProviderCost(model, duration, resolution, options) }));
}

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

function dataUrlBytes(value: string) {
    if (!value.startsWith("data:")) return 0;
    const body = value.split(",", 2)[1] || "";
    const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

function formatMegabytes(bytes: number) {
    return Number((bytes / 1_000_000).toFixed(1));
}

function providerHeaders(apiKey: string, extra?: Record<string, string>) {
    return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json", ...extra };
}

async function upstreamJson(url: string, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const text = await response.text();
        const body = parseJson(text);
        if (!response.ok) throw new ProviderGatewayError(response.status === 402 ? 402 : 502, upstreamMessage(body) || `上游请求失败（${response.status}）`);
        if (body === null) throw new ProviderGatewayError(502, "上游返回了无效 JSON");
        return body;
    } catch (error) {
        if (error instanceof ProviderGatewayError) throw error;
        if (error instanceof Error && error.name === "AbortError") throw new ProviderGatewayError(504, "上游请求超时");
        throw new ProviderGatewayError(502, error instanceof Error ? error.message : "上游请求失败");
    } finally {
        clearTimeout(timeout);
    }
}

function parseJson(text: string): unknown {
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return null;
    }
}

function upstreamMessage(body: unknown) {
    if (!body || typeof body !== "object") return "";
    const record = body as Record<string, unknown>;
    const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : null;
    const baseResp = record.base_resp && typeof record.base_resp === "object" ? record.base_resp as Record<string, unknown> : null;
    return [error?.message, record.message, record.msg, baseResp?.status_msg].find((value): value is string => typeof value === "string" && Boolean(value.trim())) || "";
}

function providerRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response) => void handler(req, res).catch((error) => {
        if (res.headersSent) return;
        if (error instanceof z.ZodError) return void res.status(400).json({ ok: false, error: error.issues.map((issue) => issue.message).join("；") });
        const status = error instanceof ProviderGatewayError ? error.status : 500;
        res.status(status).json({ ok: false, error: error instanceof Error ? error.message : "供应商网关请求失败" });
    });
}

function cleanBaseUrl(value: string) {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new ProviderGatewayError(500, "供应商 Base URL 必须使用 http(s)");
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
}

function audioMimeType(format: string) {
    if (format === "wav") return "audio/wav";
    if (format === "flac") return "audio/flac";
    if (format === "pcm") return "audio/pcm";
    return "audio/mpeg";
}

function routeParam(value: string | string[]) {
    return Array.isArray(value) ? value[0] || "" : value;
}

class ProviderGatewayError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

type MiniMaxSpeechResponse = {
    data?: { audio?: string };
    extra_info?: { usage_characters?: number };
    base_resp?: { status_code?: number; status_msg?: string };
};
