import { execFileSync } from "node:child_process";

import { BadGatewayException, BadRequestException, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from "@nestjs/common";

import type { ImageRequest, SpeechRequest, VideoRequest } from "./provider-schemas";
import { findProviderModel, isExclusiveVideoModelId, resolveProviderVideoResolution } from "./provider-catalog";

const METAJING_BASE_URL = "https://metajing.cn";
const MINIMAX_BASE_URL = "https://api.minimax.io";
const METAJING_KEYCHAIN_SERVICE = "orangemoon-canvas-metajing-api-key";
const MINIMAX_KEYCHAIN_SERVICE = "minimax-audio-api-key";
const MINIMAX_VOICE_KEYCHAIN_SERVICE = "orangemoon-canvas-minimax-default-voice";
const MAX_IMAGE_MEDIA_BYTES = 32 * 1024 * 1024;
const OPENAI_VOICE_NAMES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "marin", "cedar"]);

@Injectable()
export class ProviderUpstreamService {
    assertConfigured(provider: "metajing" | "minimax") {
        if (provider === "metajing") {
            this.metaJingConfig();
            return;
        }
        this.miniMaxConfig();
    }

    status() {
        const metajing = this.readSecret("METAJING_API_KEY", process.env.METAJING_KEYCHAIN_SERVICE || METAJING_KEYCHAIN_SERVICE);
        const minimax = this.readSecret("MINIMAX_AUDIO_API_KEY", process.env.MINIMAX_AUDIO_KEYCHAIN_SERVICE || MINIMAX_KEYCHAIN_SERVICE);
        const defaultVoice = this.readSecret("MINIMAX_DEFAULT_VOICE_ID", process.env.MINIMAX_VOICE_KEYCHAIN_SERVICE || MINIMAX_VOICE_KEYCHAIN_SERVICE);
        return {
            metajing: { configured: Boolean(metajing), auth: metajing ? "server-managed" : "missing" },
            minimax: { configured: Boolean(minimax), defaultVoiceConfigured: Boolean(defaultVoice), auth: minimax ? "server-managed" : "missing" },
        };
    }

    async image(input: ImageRequest) {
        const config = this.metaJingConfig();
        return this.upstreamJson(`${config.baseUrl}/v1/images/generations`, { method: "POST", headers: providerHeaders(config.apiKey), body: JSON.stringify(input) }, 310_000);
    }

    async imageMedia(sourceUrl: string) {
        const config = this.metaJingConfig();
        const source = new URL(sourceUrl);
        const base = new URL(config.baseUrl);
        if (!["http:", "https:"].includes(source.protocol) || (source.hostname !== base.hostname && !source.hostname.endsWith(`.${base.hostname}`))) {
            throw new BadGatewayException("生成图片地址不属于已配置的 MetaJing 域名");
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);
        try {
            const response = await fetch(source, { signal: controller.signal, headers: { Accept: "image/*" } });
            if (!response.ok) throw new BadGatewayException(`生成图片读取失败（${response.status}）`);
            const contentType = String(response.headers.get("content-type") || "").split(";", 1)[0]!.trim().toLowerCase();
            if (!contentType.startsWith("image/")) throw new BadGatewayException("生成图片源返回了非图片内容");
            const declaredLength = Number(response.headers.get("content-length") || 0);
            if (declaredLength > MAX_IMAGE_MEDIA_BYTES) throw new BadGatewayException("生成图片超过 32MB 限制");
            const body = Buffer.from(await response.arrayBuffer());
            if (body.byteLength > MAX_IMAGE_MEDIA_BYTES) throw new BadGatewayException("生成图片超过 32MB 限制");
            return { body, contentType, contentLength: body.byteLength };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            if (error instanceof Error && error.name === "AbortError") throw new HttpException("生成图片读取超时", HttpStatus.GATEWAY_TIMEOUT);
            throw new BadGatewayException(error instanceof Error ? error.message : "生成图片读取失败");
        } finally {
            clearTimeout(timeout);
        }
    }

    async createVideo(input: VideoRequest) {
        const config = this.metaJingConfig();
        const { payload, headers } = videoUpstreamRequest(input, config.apiKey);
        return this.upstreamJson(`${config.baseUrl}/v1/video/generations`, { method: "POST", headers, body: JSON.stringify(payload) }, 120_000);
    }

    async pollVideo(providerTaskId: string) {
        const config = this.metaJingConfig();
        return this.upstreamJson(`${config.baseUrl}/v1/video/generations/${encodeURIComponent(providerTaskId)}`, { headers: providerHeaders(config.apiKey) }, 60_000);
    }

    async speech(input: SpeechRequest) {
        const config = this.miniMaxConfig();
        const requestedVoice = input.voice && !OPENAI_VOICE_NAMES.has(input.voice.toLowerCase()) ? input.voice : "";
        const voiceId = requestedVoice || config.defaultVoiceId;
        if (!voiceId) throw new ServiceUnavailableException("MiniMax 默认音色尚未配置");
        const payload = {
            model: input.model,
            text: input.input,
            stream: false,
            output_format: "hex",
            language_boost: input.language_boost,
            voice_setting: { voice_id: voiceId, speed: input.speed, vol: 1, pitch: 0, ...(input.emotion ? { emotion: input.emotion } : {}) },
            audio_setting: { sample_rate: 32_000, bitrate: 128_000, format: input.response_format, channel: 1 },
        };
        const result = await this.upstreamJson(`${config.baseUrl}/v1/t2a_v2`, { method: "POST", headers: providerHeaders(config.apiKey), body: JSON.stringify(payload) }, 120_000) as MiniMaxSpeechResponse;
        if (result.base_resp?.status_code !== 0) throw new HttpException(result.base_resp?.status_msg || "MiniMax 语音生成失败", HttpStatus.BAD_GATEWAY);
        if (!result.data?.audio || !/^[0-9a-f]+$/i.test(result.data.audio)) throw new HttpException("MiniMax 没有返回有效音频", HttpStatus.BAD_GATEWAY);
        return { audio: Buffer.from(result.data.audio, "hex"), usageCharacters: result.extra_info?.usage_characters ?? input.input.length };
    }

    private metaJingConfig() {
        const apiKey = this.readSecret("METAJING_API_KEY", process.env.METAJING_KEYCHAIN_SERVICE || METAJING_KEYCHAIN_SERVICE);
        if (!apiKey) throw new ServiceUnavailableException("MetaJing 密钥尚未在服务端配置");
        return { apiKey, baseUrl: cleanBaseUrl(process.env.METAJING_API_BASE || METAJING_BASE_URL) };
    }

    private miniMaxConfig() {
        const apiKey = this.readSecret("MINIMAX_AUDIO_API_KEY", process.env.MINIMAX_AUDIO_KEYCHAIN_SERVICE || MINIMAX_KEYCHAIN_SERVICE);
        if (!apiKey) throw new ServiceUnavailableException("MiniMax 密钥尚未在服务端配置");
        return {
            apiKey,
            baseUrl: cleanBaseUrl(process.env.MINIMAX_API_BASE || MINIMAX_BASE_URL),
            defaultVoiceId: this.readSecret("MINIMAX_DEFAULT_VOICE_ID", process.env.MINIMAX_VOICE_KEYCHAIN_SERVICE || MINIMAX_VOICE_KEYCHAIN_SERVICE),
        };
    }

    private readSecret(envName: string, keychainService: string) {
        const value = String(process.env[envName] || "").trim();
        if (value) return value;
        if (process.platform !== "darwin") return "";
        try {
            return execFileSync("security", ["find-generic-password", "-s", keychainService, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        } catch {
            return "";
        }
    }

    private async upstreamJson(url: string, init: RequestInit, timeoutMs: number) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { ...init, signal: controller.signal });
            const text = await response.text();
            const body = parseJson(text);
            if (!response.ok) throw new HttpException(upstreamMessage(body) || `上游请求失败（${response.status}）`, response.status === 402 ? HttpStatus.PAYMENT_REQUIRED : HttpStatus.BAD_GATEWAY);
            if (body === null) throw new HttpException("上游返回了无效 JSON", HttpStatus.BAD_GATEWAY);
            return body;
        } catch (error) {
            if (error instanceof HttpException) throw error;
            if (error instanceof Error && error.name === "AbortError") throw new HttpException("上游请求超时", HttpStatus.GATEWAY_TIMEOUT);
            throw new HttpException(error instanceof Error ? error.message : "上游请求失败", HttpStatus.BAD_GATEWAY);
        } finally {
            clearTimeout(timeout);
        }
    }
}

function providerHeaders(apiKey: string, extra?: Record<string, string>) {
    return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json", ...extra };
}

export function videoUpstreamRequest(input: VideoRequest, apiKey: string) {
    const model = findProviderModel(input.model);
    if (!model || model.capability !== "video" || !isExclusiveVideoModelId(input.model)) throw new BadRequestException("该视频模型已停用，禁止调用上游");
    const resolution = resolveProviderVideoResolution(model, input.resolution);
    if (!resolution) throw new BadRequestException(`${model.label} 不支持 ${input.resolution || "当前"} 分辨率`);
    const payload = {
        ...input,
        model: model.id,
        resolution,
    };
    const headers = providerHeaders(apiKey);
    return { payload, headers };
}

function cleanBaseUrl(value: string) {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new Error("供应商 Base URL 必须使用 http(s)");
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
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

type MiniMaxSpeechResponse = { data?: { audio?: string }; extra_info?: { usage_characters?: number }; base_resp?: { status_code?: number; status_msg?: string } };
