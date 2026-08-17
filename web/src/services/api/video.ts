import axios from "axios";
import { nanoid } from "nanoid";

import { dataUrlToFile } from "@/lib/image-utils";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildSeedancePromptText, isSeedanceVideoConfig, normalizeSeedanceDuration, normalizeSeedanceDurationForModel, normalizeSeedanceRatio, normalizeSeedanceResolution, partitionSeedanceReferenceImages, seedanceFrameReferenceError, seedanceVideoReferenceError, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { canonicalOrangeMoonVideoModel, getOrangeMoonVideoModel } from "@/lib/orange-moon-provider";
import { prepareReferenceImagesForJson } from "@/lib/reference-image-upload";
import { buildApiUrl, isOrangeMoonManagedConfig, modelOptionName, normalizeVideoReferenceMode, resolveModelRequestConfig, resolveModelScript, type AiConfig } from "@/stores/use-config-store";
import { runModelPlugin } from "./model-plugin";
import { orangeMoonGet, orangeMoonPost } from "./orange-moon-gateway";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = { id: string; status?: string; error?: { message?: string }; url?: string; result_url?: string; video_url?: string; content?: { video_url?: string; url?: string } | null };
type ApiVideoResponse = VideoResponse | { code?: number | string; data?: VideoResponse | null; msg?: string; message?: string; error?: { message?: string } };
type SeedanceTask = {
    id: string;
    status?: "queued" | "running" | "succeeded" | "completed" | "failed" | "cancelled" | "expired";
    error?: { code?: string; message?: string } | null;
    content?: { video_url?: string; url?: string; last_frame_url?: string } | null;
    url?: string;
    result_url?: string;
    video_url?: string;
};
type MetaJingTask = {
    id?: string;
    task_id?: string;
    state?: string;
    status?: string;
    is_final?: boolean;
    result_url?: string;
    video_url?: string;
    mp4_url?: string;
    data?: Array<{ url?: string; video_url?: string; mp4_url?: string; result_url?: string }> | { url?: string; video_url?: string; mp4_url?: string; result_url?: string };
    error?: string | { message?: string } | null;
    price_usd?: number;
};
type ApiEnvelope<T> = T | { code?: number | string; data?: T | null; msg?: string; message?: string; error?: { message?: string } };
type RequestOptions = { signal?: AbortSignal; onTaskCreated?: (task: VideoGenerationTask) => void };

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; provider: "openai" | "seedance" | "metajing" | "plugin"; model: string };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

/** Results for scripted (plugin) video models, which run their own create+poll in one shot at task creation. */
const pluginVideoResults = new Map<string, VideoGenerationResult>();

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationResult> {
    const task = await createVideoGenerationTask(config, prompt, references, videoReferences, audioReferences, options);
    options?.onTaskCreated?.(task);
    return waitForVideoGenerationTask(config, task, options);
}

export async function waitForVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: Pick<RequestOptions, "signal">): Promise<VideoGenerationResult> {
    for (let attempt = 0; attempt < 720; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, options);
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw new Error(state.error);
        if (attempt === 719) throw new Error(`${task.provider === "seedance" || task.provider === "metajing" ? "Seedance " : ""}视频任务已超过 6 小时，请在资产记录中查看最终状态`);
        await delay(videoPollDelayMs(task, attempt), options?.signal);
    }
    throw new Error("视频生成超时，请稍后重试");
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const script = resolveModelScript(config, selectedModel);
    if (script) return createPluginVideoTask(requestConfig, selectedModel, script, prompt, references, options);
    if (isOrangeMoonManagedConfig(requestConfig)) return createMetaJingVideoTask(requestConfig, selectedModel, prompt, references, videoReferences, audioReferences, options);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (isSeedanceVideoConfig(requestConfig)) {
        return createSeedanceTask(requestConfig, selectedModel, prompt, references, videoReferences, audioReferences, options);
    }
    if (videoReferences.length || audioReferences.length) {
        throw new Error("当前视频接口不支持参考视频或参考音频，请切换到 Seedance 2.0 / 火山 Agent Plan 模型，或移除参考资产");
    }
    return createOpenAIVideoTask(requestConfig, selectedModel, prompt, references, options);
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    if (task.provider === "plugin") {
        const result = pluginVideoResults.get(task.id);
        return result ? { status: "completed", result } : { status: "failed", error: "插件视频任务已失效，请重新生成" };
    }
    const requestConfig = resolveModelRequestConfig(config, task.model);
    if (task.provider === "metajing") return pollMetaJingVideoTask(task, options);
    assertVideoConfig(requestConfig, requestConfig.model);
    return task.provider === "seedance" ? pollSeedanceTask(requestConfig, task, options) : pollOpenAIVideoTask(requestConfig, task, options);
}

export function videoPollDelayMs(task: VideoGenerationTask, attempt: number) {
    if (task.provider !== "metajing") return task.provider === "seedance" ? 5000 : 2500;
    const normalizedAttempt = Math.max(0, attempt);
    return Math.min(12_000, 3000 + Math.floor(normalizedAttempt / 5) * 1000);
}

async function createPluginVideoTask(config: AiConfig, model: string, script: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (!config.apiKey.trim()) throw new Error("请先配置 API Key");
    const refs = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const result = videoPluginResult(
        await runModelPlugin({
            capability: "video",
            script,
            config,
            prompt,
            images: refs,
            params: {
                seconds: normalizeVideoSeconds(config.videoSeconds),
                size: normalizeVideoSize(config.size),
                resolution: normalizeVideoResolution(config.vquality),
                ratio: config.size,
                generateAudio: boolConfig(config.videoGenerateAudio, true),
                watermark: boolConfig(config.videoWatermark, false),
            },
            signal: options?.signal,
        }),
    );
    const id = nanoid();
    pluginVideoResults.set(id, result);
    return { id, provider: "plugin", model };
}

function videoPluginResult(result: unknown): VideoGenerationResult {
    if (result instanceof Blob) return { blob: result };
    if (typeof result === "string") return { url: result, mimeType: "video/mp4" };
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.blob instanceof Blob) return { blob: record.blob };
        const url = [record.url, record.video_url, record.result_url].find((value) => typeof value === "string" && value) as string | undefined;
        if (url) return { url, mimeType: "video/mp4" };
    }
    throw new Error("模型调用脚本没有返回视频");
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) {
        const storageKey = platformCanvasMediaStorageKey(result.url);
        if (storageKey) return { url: result.url, storageKey, bytes: 0, mimeType: result.mimeType || "video/mp4" };
        return uploadMediaFile(result.url, "video");
    }
    throw new Error("视频接口没有返回可播放的视频");
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const body = new FormData();
    body.append("model", modelOptionName(model));
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append("input_reference[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config), signal: options?.signal })).data);
        if (!created.id) throw new Error("视频接口没有返回任务 ID");
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务创建失败"));
    }
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        const url = videoResultUrl(video);
        if (url) return { status: "completed", result: await videoResultFromUrl(url, options) };
        if (video.status === "completed") {
            const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${task.id}/content`), { headers: aiHeaders(config), responseType: "blob", signal: options?.signal });
            await assertVideoBlob(content.data);
            return { status: "completed", result: { blob: content.data } };
        }
        if (video.status === "failed" || video.status === "cancelled") return { status: "failed", error: readApiErrorMessage(video.error?.message) || "视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务查询失败"));
    }
}

async function createMetaJingVideoTask(config: AiConfig, selectedModel: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const modelName = canonicalOrangeMoonVideoModel(modelOptionName(selectedModel));
    const model = getOrangeMoonVideoModel(modelName, config.vquality);
    if (!model) throw new Error("橙月官方渠道没有登记这个视频模型");
    const referenceMode = model.supportsFrames ? normalizeVideoReferenceMode(config.videoReferenceMode) : "ref";
    assertOrangeMoonReferences(model, references, videoReferences, audioReferences, referenceMode);
    const declaredLocalMediaBytes = [...videoReferences, ...audioReferences]
        .filter((reference) => !isPublicMediaUrl(reference.url))
        .reduce((total, reference) => total + (reference.bytes || 0), 0);
    if (declaredLocalMediaBytes > 20_000_000) throw new Error("本地参考视频和音频合计不能超过 20MB；更大的参考素材请使用公网 URL");
    const ratio = normalizeSeedanceRatio(config.size);
    const aspectRatio = model.aspectRatios.includes(ratio) ? ratio : model.aspectRatios[0];
    const duration = normalizeSeedanceDurationForModel(modelName, config.videoSeconds);
    const text = buildSeedancePromptText(prompt, references, videoReferences, audioReferences, referenceMode);
    const [videos, audios] = await Promise.all([
        Promise.all(videoReferences.map((video) => resolveOrangeMoonVideoUrl(video))),
        Promise.all(audioReferences.map((audio) => resolveOrangeMoonAudioUrl(audio))),
    ]);
    const localMediaBytes = [...videos, ...audios].reduce((total, value) => total + dataUrlBinaryBytes(value), 0);
    const localBinaryBudget = 20_000_000;
    if (localMediaBytes >= localBinaryBudget) throw new Error("本地参考视频和音频合计不能超过 20MB；更大的参考素材请使用公网 URL");
    const preparedImages = await prepareReferenceImagesForJson(references, model.references.imageMaxBytes, 3072, localBinaryBudget - localMediaBytes);
    const frameImages = partitionSeedanceReferenceImages(preparedImages, referenceMode);
    try {
        const created = await orangeMoonPost<MetaJingTask>(
            "/metajing/v1/video/generations",
            {
                model: model.name,
                prompt: text,
                duration,
                resolution: model.resolution,
                aspect_ratio: aspectRatio,
                images: frameImages.images,
                videos,
                audios,
                ...(frameImages.startFrame ? { start_frame_url: frameImages.startFrame } : {}),
                ...(frameImages.endFrame ? { end_frame_url: frameImages.endFrame } : {}),
            },
            { signal: options?.signal },
        );
        const taskId = created.id || created.task_id;
        if (!taskId) throw new Error("橙月平台没有返回视频任务 ID");
        return { id: taskId, provider: "metajing", model: selectedModel };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务创建失败"));
    }
}

async function pollMetaJingVideoTask(task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = await orangeMoonGet<MetaJingTask>(`/metajing/v1/video/generations/${encodeURIComponent(task.id)}`, { signal: options?.signal });
        const resultUrl = metaJingVideoResultUrl(state);
        if (resultUrl) return { status: "completed", result: await videoResultFromUrl(resultUrl, options) };
        const normalizedState = String(state.state || "").toLowerCase();
        if (["failed", "failure", "cancelled", "canceled", "expired"].includes(normalizedState) || state.is_final) {
            return { status: "failed", error: readApiErrorMessage(typeof state.error === "string" ? state.error : state.error?.message) || state.status || "Seedance 视频生成失败" };
        }
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务查询失败"));
    }
}

function metaJingVideoResultUrl(state: MetaJingTask) {
    const data = Array.isArray(state.data) ? state.data : state.data ? [state.data] : [];
    return [state.result_url, state.video_url, state.mp4_url, ...data.flatMap((item) => [item.result_url, item.video_url, item.mp4_url, item.url])]
        .find((value): value is string => typeof value === "string" && isPlayableVideoResultUrl(value.trim()))
        ?.trim() || "";
}

function isPlayableVideoResultUrl(value: string) {
    return /^https?:\/\//i.test(value) || value.startsWith("/platform-api/canvas-media/");
}

function platformCanvasMediaStorageKey(value: string) {
    const match = /^(?:https?:\/\/[^/]+)?\/platform-api\/canvas-media\/([^?#]+)/i.exec(value.trim());
    if (!match?.[1]) return "";
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return "";
    }
}

function assertOrangeMoonReferences(model: NonNullable<ReturnType<typeof getOrangeMoonVideoModel>>, references: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[], referenceMode: ReturnType<typeof normalizeVideoReferenceMode>) {
    const limits = model.references;
    const frameError = seedanceFrameReferenceError(model, referenceMode, references.length);
    if (frameError) throw new Error(frameError);
    if (references.length > limits.images) throw new Error(`当前模型最多支持 ${limits.images} 张参考图`);
    if (videos.length > limits.videos) throw new Error(limits.videos ? `当前模型最多支持 ${limits.videos} 段参考视频` : "当前模型不支持参考视频");
    if (audios.length > limits.audios) throw new Error(limits.audios ? `当前模型最多支持 ${limits.audios} 段参考音频` : "当前模型不支持参考音频");
    if (audios.length && !references.length && !videos.length) throw new Error("参考音频不能单独使用，请同时添加参考图或参考视频");
    let videoDurationMs = 0;
    for (const video of videos) {
        if (model.name === "qy-seedance-2.5" && video.type && !isMp4OrMovReference(video.type, video.name)) throw new Error(`参考视频 ${video.name} 需要使用 MP4 或 MOV 格式`);
        if (video.bytes && video.bytes > limits.videoMaxBytes) throw new Error(`参考视频 ${video.name} 超过 ${Math.round(limits.videoMaxBytes / 1024 / 1024)}MB`);
        if (video.width && video.height && limits.videoMinShortEdge) {
            const shortEdge = Math.min(video.width, video.height);
            const longEdge = Math.max(video.width, video.height);
            if (shortEdge < limits.videoMinShortEdge || shortEdge > (limits.videoMaxShortEdge || Number.POSITIVE_INFINITY) || longEdge > (limits.videoMaxLongEdge || Number.POSITIVE_INFINITY)) {
                throw new Error(`参考视频 ${video.name} 分辨率需满足短边 ${limits.videoMinShortEdge}-${limits.videoMaxShortEdge}px、长边不超过 ${limits.videoMaxLongEdge}px`);
            }
        }
        if (video.durationMs) {
            const minItemMs = (limits.videoMinItemSeconds || 0) * 1000;
            const maxItemMs = (limits.videoMaxItemSeconds || 15) * 1000;
            if (video.durationMs < minItemMs || video.durationMs > maxItemMs) throw new Error(`参考视频 ${video.name} 时长需要在 ${limits.videoMinItemSeconds || 0}-${limits.videoMaxItemSeconds || 15} 秒之间`);
            videoDurationMs += video.durationMs;
        }
    }
    if (videoDurationMs && videoDurationMs < (limits.videoMinTotalSeconds || 0) * 1000) throw new Error(`参考视频总时长不能少于 ${limits.videoMinTotalSeconds} 秒`);
    if (limits.videoMaxTotalSeconds && videoDurationMs > limits.videoMaxTotalSeconds * 1000) throw new Error(`参考视频总时长不能超过 ${limits.videoMaxTotalSeconds} 秒`);
    let audioDurationMs = 0;
    for (const audio of audios) {
        if (model.name === "qy-seedance-2.5" && audio.type && !isMp3OrWavReference(audio.type, audio.name)) throw new Error(`参考音频 ${audio.name} 需要使用 MP3 或 WAV 格式`);
        if (audio.bytes && audio.bytes > limits.audioMaxBytes) throw new Error(`参考音频 ${audio.name} 超过 ${Math.round(limits.audioMaxBytes / 1_000_000)}MB`);
        if (audio.durationMs && audio.durationMs > (limits.audioMaxTotalSeconds || 15) * 1000) throw new Error(`参考音频 ${audio.name} 时长不能超过 ${limits.audioMaxTotalSeconds || 15} 秒`);
        audioDurationMs += audio.durationMs || 0;
    }
    if (limits.audioMaxTotalSeconds && audioDurationMs > limits.audioMaxTotalSeconds * 1000) throw new Error(`参考音频总时长不能超过 ${limits.audioMaxTotalSeconds} 秒`);
}

function isMp4OrMovReference(type: string, name: string) {
    return type === "video/mp4" || type === "video/quicktime" || /\.(mp4|mov)$/i.test(name);
}

function isMp3OrWavReference(type: string, name: string) {
    return ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"].includes(type) || /\.(mp3|wav)$/i.test(name);
}

async function resolveOrangeMoonVideoUrl(video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url)) return video.url;
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("参考视频必须是公网 URL 或本地已保存的视频");
    return blobToDataUrl(blob);
}

async function resolveOrangeMoonAudioUrl(audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url)) return audio.url;
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("参考音频必须是公网 URL 或本地已保存的音频");
    return blobToDataUrl(blob);
}

async function createSeedanceTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (audioReferences.length && !references.length && !videoReferences.length) {
        throw new Error("Seedance 参考音频不能单独使用，请同时添加参考图或参考视频");
    }
    assertSeedanceVideoReferences(videoReferences);
    assertSeedanceAudioReferences(audioReferences);
    const content = await buildSeedanceContent(config, prompt, references, videoReferences, audioReferences);
    if (!content.length) throw new Error("请输入视频提示词，或连接参考图片/视频/音频");
    const payload = {
        model: modelOptionName(model),
        content,
        ratio: normalizeSeedanceRatio(config.size),
        resolution: normalizeSeedanceResolution(config.vquality, modelOptionName(model)),
        duration: normalizeSeedanceDuration(config.videoSeconds),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
    };

    try {
        const created = unwrapSeedanceTask((await axios.post<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config), payload, { headers: aiHeaders(config, "application/json"), signal: options?.signal })).data);
        if (!created.id) throw new Error("Seedance 接口没有返回任务 ID");
        return { id: created.id, provider: "seedance", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务创建失败"));
    }
}

async function pollSeedanceTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = unwrapSeedanceTask((await axios.get<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, task.id), { headers: aiHeaders(config), signal: options?.signal })).data);
        const url = videoResultUrl(state);
        if (url) return { status: "completed", result: await videoResultFromUrl(url, options) };
        if (state.status === "succeeded" || state.status === "completed") return { status: "failed", error: "Seedance 任务成功但没有返回视频 URL" };
        if (state.status === "failed" || state.status === "cancelled" || state.status === "expired") return { status: "failed", error: readApiErrorMessage(state.error?.message) || `Seedance 视频生成${state.status === "expired" ? "超时" : "失败"}` };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务查询失败"));
    }
}

function assertSeedanceVideoReferences(videoReferences: ReferenceVideo[]) {
    const error = seedanceVideoReferenceError(videoReferences);
    if (error) throw new Error(error);
    let total = 0;
    for (const video of videoReferences) {
        if (!video.durationMs) continue;
        if (video.durationMs < 2000 || video.durationMs > 15000) throw new Error("Seedance 参考视频单个时长需要在 2-15 秒之间");
        total += video.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考视频总时长不能超过 15 秒");
}

function assertSeedanceAudioReferences(audioReferences: ReferenceAudio[]) {
    let total = 0;
    for (const audio of audioReferences) {
        if (!audio.durationMs) continue;
        if (audio.durationMs < 2000 || audio.durationMs > 15000) throw new Error("Seedance 参考音频单个时长需要在 2-15 秒之间");
        total += audio.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考音频总时长不能超过 15 秒");
}

function seedanceApiUrl(config: AiConfig, taskId?: string) {
    return buildApiUrl(config.baseUrl, `/contents/generations/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ""}`);
}

async function buildSeedanceContent(config: AiConfig, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    const content: Array<Record<string, unknown>> = [];
    const text = buildSeedancePromptText(prompt, references, videoReferences, audioReferences);
    if (text) content.push({ type: "text", text });
    for (const image of references.slice(0, SEEDANCE_REFERENCE_LIMITS.images)) {
        content.push({ type: "image_url", image_url: { url: await resolveSeedanceImageUrl(config, image) }, role: "reference_image" });
    }
    for (const video of videoReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.videos)) {
        content.push({ type: "video_url", video_url: { url: await resolveSeedanceVideoUrl(video) }, role: "reference_video" });
    }
    for (const audio of audioReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.audios)) {
        content.push({ type: "audio_url", audio_url: { url: await resolveSeedanceAudioUrl(audio) }, role: "reference_audio" });
    }
    return content;
}

async function resolveSeedanceImageUrl(config: AiConfig, image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl) || directUrl.startsWith("asset://")) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    return dataUrl;
}

async function resolveSeedanceVideoUrl(video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url) || video.url.startsWith("asset://")) return video.url;
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("参考视频必须是公网 URL、资产 ID，或本地已保存的视频");
    return blobToDataUrl(blob);
}

async function resolveSeedanceAudioUrl(audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url) || audio.url.startsWith("asset://")) return audio.url;
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("参考音频必须是公网 URL、资产 ID，或本地已保存的音频");
    return blobToDataUrl(blob);
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    if (platformCanvasMediaStorageKey(url)) return { url, mimeType: "video/mp4" };
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先配置视频模型");
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (!config.apiKey.trim()) throw new Error("请先配置 API Key");
    if (config.apiFormat === "gemini") throw new Error("Gemini 调用格式暂不支持视频生成，请使用 OpenAI 格式渠道");
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, "接口没有返回视频任务");
}

function unwrapSeedanceTask(payload: ApiEnvelope<SeedanceTask>) {
    return unwrapEnvelope(payload, "Seedance 接口没有返回任务");
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && payload.code !== undefined) {
        if (payload.code !== 0 && payload.code !== "0") throw new Error(readApiErrorMessage(payload) || "请求失败");
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function videoResultUrl(payload: VideoResponse | SeedanceTask) {
    return [payload.video_url, payload.result_url, payload.url, payload.content?.video_url, payload.content?.url].find((url) => typeof url === "string" && (isPublicMediaUrl(url) || /\.mp4(\?|#|$)/i.test(url)));
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            return readApiErrorMessage(JSON.parse(value)) || value;
        } catch {
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown };
    return readApiErrorMessage(payload.msg) || readApiErrorMessage(payload.message) || readApiErrorMessage(payload.error);
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError<{ error?: string | { message?: string }; msg?: string; message?: string; code?: number | string }>(error)) {
        const responseData = error.response?.data;
        return readApiErrorMessage(responseData) || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(readApiErrorMessage(payload) || "视频下载失败");
    if (payload.error?.message) throw new Error(readApiErrorMessage(payload.error.message) || payload.error.message);
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function dataUrlBinaryBytes(value: string) {
    if (!value.startsWith("data:")) return 0;
    const body = value.split(",", 2)[1] || "";
    const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取本地资产失败"));
        reader.readAsDataURL(blob);
    });
}
