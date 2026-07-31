import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { AssetKind, GenerationStatus, Prisma, type GenerationJob } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../wallet/ledger.service";
import { findProviderModel } from "./provider-catalog";
import { PricingService, serializeQuote } from "./pricing.service";
import { ProviderUpstreamService } from "./provider-upstream.service";
import { imageRequestSchema, minimaxSpeechSchema, videoRequestSchema, type ImageRequest, type SpeechRequest, type VideoRequest } from "./provider-schemas";

@Injectable()
export class GenerationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly ledger: LedgerService,
        private readonly pricing: PricingService,
        private readonly upstream: ProviderUpstreamService,
    ) {}

    parseImage(body: unknown) { return parseSchema(imageRequestSchema, body); }
    parseVideo(body: unknown) { return parseSchema(videoRequestSchema, body); }
    parseSpeech(body: unknown) { return parseSchema(minimaxSpeechSchema, body); }

    async image(userId: string, idempotencyKey: string, input: ImageRequest) {
        const model = findProviderModel(input.model)!;
        this.upstream.assertConfigured(model.provider);
        const quote = this.pricing.quote(model, input.n);
        const reservation = await this.reserve(userId, idempotencyKey, "image", input.model, quote, summarizeImage(input));
        this.assertFreshSyncReservation(reservation);
        try {
            const result = await this.upstream.image(input);
            await this.settle(reservation.job, quote.retailMilliCredits);
            const assets = await this.registerImageAssets(reservation.job, result, input.output_format);
            return { result: rewriteGeneratedImageUrls(result, assets), jobId: reservation.job.publicId, chargedCredits: quote.retailCredits };
        } catch (error) {
            await this.release(reservation.job, error);
            throw error;
        }
    }

    async createVideo(userId: string, idempotencyKey: string, input: VideoRequest) {
        const model = findProviderModel(input.model)!;
        this.upstream.assertConfigured(model.provider);
        const quote = this.pricing.quote(model, input.duration);
        const reservation = await this.reserve(userId, idempotencyKey, "video", input.model, quote, summarizeVideo(input));
        if (!reservation.created) {
            if (reservation.job.status === GenerationStatus.SUBMITTED || reservation.job.status === GenerationStatus.SUCCEEDED) return { id: reservation.job.publicId, state: reservation.job.providerState || "submitted" };
            throw new ConflictException("这个幂等请求已经处理且不能再次提交");
        }
        try {
            const result = asRecord(await this.upstream.createVideo(input));
            const providerTaskId = providerVideoTaskId(result);
            if (!providerTaskId) throw new ConflictException("Seedance 2.0 没有返回任务号");
            const job = await this.prisma.generationJob.update({ where: { id: reservation.job.id }, data: { providerTaskId, status: GenerationStatus.SUBMITTED, providerState: String(result.state || result.status || "submitted").slice(0, 100) } });
            const outputUrl = videoResultUrl(result);
            if (outputUrl) {
                await this.settle(job, quote.retailMilliCredits);
                await this.registerVideoAsset(job, outputUrl);
            }
            return publicVideoTaskResult(result, job.publicId);
        } catch (error) {
            await this.release(reservation.job, error);
            throw publicVideoGenerationError(error, input);
        }
    }

    async pollVideo(userId: string, publicId: string) {
        const job = await this.prisma.generationJob.findFirst({ where: { publicId, userId, capability: "video" } });
        if (!job) throw new NotFoundException("视频任务不存在");
        if (job.status === GenerationStatus.FAILED || job.status === GenerationStatus.RELEASED) return { id: job.publicId, state: "failed", is_final: true, error: job.error || "视频生成失败" };
        if (!job.providerTaskId) throw new ConflictException("视频任务尚未提交到供应商");
        const result = asRecord(await this.upstream.pollVideo(job.providerTaskId));
        const state = String(result.state || result.status || "processing").toLowerCase();
        const withPublicId = { ...result, id: job.publicId };
        if (videoResultUrl(result)) {
            await this.settle(job, job.reservedMilliCredits);
            await this.registerVideoAsset(job, videoResultUrl(result));
            return withPublicId;
        }
        if (videoFailed(result, state)) {
            await this.release(job, new Error(readResultError(result) || "Seedance 2.0 视频生成失败"));
            return { ...withPublicId, state: state || "failed", is_final: true };
        }
        await this.prisma.generationJob.updateMany({ where: { id: job.id, status: GenerationStatus.SUBMITTED }, data: { providerState: state.slice(0, 100) } });
        return withPublicId;
    }

    async speech(userId: string, idempotencyKey: string, input: SpeechRequest) {
        const model = findProviderModel(input.model)!;
        this.upstream.assertConfigured(model.provider);
        const reserveQuote = this.pricing.quote(model, input.input.length);
        const reservation = await this.reserve(userId, idempotencyKey, "audio", input.model, reserveQuote, summarizeSpeech(input));
        this.assertFreshSyncReservation(reservation);
        try {
            const output = await this.upstream.speech(input);
            const actualQuote = this.pricing.quote(model, output.usageCharacters);
            await this.settle(reservation.job, actualQuote.retailMilliCredits);
            return { ...output, jobId: reservation.job.publicId, chargedCredits: actualQuote.retailCredits };
        } catch (error) {
            await this.release(reservation.job, error);
            throw error;
        }
    }

    async listJobs(userId: string, limit = 30) {
        return this.prisma.generationJob.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: Math.max(1, Math.min(100, limit)) });
    }

    async imageAsset(userId: string, publicId: string) {
        const asset = await this.prisma.asset.findFirst({ where: { publicId, userId, kind: AssetKind.IMAGE }, select: { data: true } });
        if (!asset) throw new NotFoundException("生成图片不存在");
        const sourceUrl = String(asRecord(asset.data).dataUrl || "").trim();
        if (!/^https?:\/\//i.test(sourceUrl)) throw new NotFoundException("生成图片没有可读取的源地址");
        return this.upstream.imageMedia(sourceUrl);
    }

    private async reserve(userId: string, idempotencyKey: string, capability: string, model: string, quote: ReturnType<PricingService["quote"]>, requestSummary: Prisma.InputJsonValue) {
        validateIdempotencyKey(idempotencyKey);
        return this.ledger.runSerializable(async (tx) => {
            const existing = await tx.generationJob.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
            if (existing) return { job: existing, created: false };
            const publicId = `GEN${randomBytes(12).toString("hex").toUpperCase()}`;
            await this.ledger.reserveInTransaction(tx, {
                userId,
                amountMilli: quote.retailMilliCredits,
                idempotencyKey: `generation:reserve:${userId}:${idempotencyKey}`,
                description: `${model} 生成预授权`,
                metadata: { publicId, capability, model, priceVersion: quote.version },
            });
            const job = await tx.generationJob.create({
                data: {
                    publicId,
                    userId,
                    capability,
                    model,
                    idempotencyKey,
                    reservedMilliCredits: quote.retailMilliCredits,
                    requestSummary,
                    priceSnapshot: serializeQuote(quote) as unknown as Prisma.InputJsonValue,
                },
            });
            return { job, created: true };
        });
    }

    private assertFreshSyncReservation(reservation: { job: GenerationJob; created: boolean }) {
        if (!reservation.created) throw new ConflictException(`请求 ${reservation.job.publicId} 已处理；同步生成结果不会被重复返回`);
    }

    private async settle(job: GenerationJob, chargedMilli: bigint) {
        await this.ledger.runSerializable(async (tx) => {
            const current = await tx.generationJob.findUniqueOrThrow({ where: { id: job.id } });
            if (current.status === GenerationStatus.SUCCEEDED) return;
            if (current.status === GenerationStatus.FAILED || current.status === GenerationStatus.RELEASED) throw new ConflictException("任务已退款，不能再次结算");
            await this.ledger.settleInTransaction(tx, {
                userId: current.userId,
                reservedMilli: current.reservedMilliCredits,
                chargedMilli,
                idempotencyKey: `generation:settle:${current.id}`,
                description: `${current.model} 生成结算`,
                metadata: { jobId: current.id, publicId: current.publicId, model: current.model },
            });
            await tx.generationJob.update({ where: { id: current.id }, data: { status: GenerationStatus.SUCCEEDED, chargedMilliCredits: chargedMilli, providerState: "succeeded", settledAt: new Date(), error: null } });
        });
    }

    private async release(job: GenerationJob, error: unknown) {
        const message = error instanceof Error ? error.message.slice(0, 1_000) : "供应商生成失败";
        await this.ledger.runSerializable(async (tx) => {
            const current = await tx.generationJob.findUniqueOrThrow({ where: { id: job.id } });
            if (current.status === GenerationStatus.FAILED || current.status === GenerationStatus.RELEASED || current.status === GenerationStatus.SUCCEEDED) return;
            await this.ledger.releaseInTransaction(tx, {
                userId: current.userId,
                amountMilli: current.reservedMilliCredits,
                idempotencyKey: `generation:release:${current.id}`,
                description: `${current.model} 生成失败退款`,
                metadata: { jobId: current.id, publicId: current.publicId, model: current.model },
            });
            await tx.generationJob.update({ where: { id: current.id }, data: { status: GenerationStatus.FAILED, chargedMilliCredits: 0n, providerState: "failed", error: message, settledAt: new Date() } });
        });
    }

    private async registerImageAssets(job: GenerationJob, result: unknown, outputFormat: string) {
        const record = asRecord(result);
        const items = Array.isArray(record.data) ? record.data : Array.isArray(record.images) ? record.images : [];
        const urls = items.map((item) => String(asRecord(item).url || "").trim()).filter((url) => /^https?:\/\//i.test(url));
        return this.registerAssets(job, urls.map((url, index) => ({
            kind: AssetKind.IMAGE,
            title: `Image 2 生成图 ${index + 1}`,
            data: { dataUrl: url, width: 0, height: 0, bytes: 0, mimeType: imageMimeType(outputFormat) },
        })));
    }

    private async registerVideoAsset(job: GenerationJob, url: string) {
        if (!/^https?:\/\//i.test(url)) return;
        await this.registerAssets(job, [{ kind: AssetKind.VIDEO, title: "Seedance 2.0 生成视频", data: { url, width: 0, height: 0, bytes: 0, mimeType: "video/mp4" } }]);
    }

    private async registerAssets(job: GenerationJob, outputs: Array<{ kind: AssetKind; title: string; data: Prisma.InputJsonValue }>) {
        try {
            return await Promise.all(outputs.map((output, ordinal) => this.prisma.asset.upsert({
                where: { generationJobId_ordinal: { generationJobId: job.id, ordinal } },
                create: {
                    publicId: `AST${randomBytes(12).toString("hex").toUpperCase()}`,
                    userId: job.userId,
                    generationJobId: job.id,
                    ordinal,
                    kind: output.kind,
                    title: output.title,
                    source: "官方模型生成",
                    tags: [job.capability, job.model],
                    data: output.data,
                    metadata: { model: job.model, generationJob: job.publicId },
                },
                update: { data: output.data, title: output.title },
            })));
        } catch {
            // Asset indexing must not turn an already-paid successful generation into a failed request.
            return [];
        }
    }
}

export function rewriteGeneratedImageUrls(result: unknown, assets: Array<{ publicId: string; ordinal: number }>) {
    const record = asRecord(result);
    const proxyByOrdinal = new Map(assets.map((asset) => [asset.ordinal, `/platform-api/providers/assets/${asset.publicId}/content`]));
    const rewrite = (items: unknown[]) => items.map((item, index) => {
        const proxyUrl = proxyByOrdinal.get(index);
        const value = asRecord(item);
        return proxyUrl && typeof value.url === "string" ? { ...value, url: proxyUrl } : item;
    });
    return {
        ...record,
        ...(Array.isArray(record.data) ? { data: rewrite(record.data) } : {}),
        ...(Array.isArray(record.images) ? { images: rewrite(record.images) } : {}),
    };
}

function parseSchema<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
    const result = schema.safeParse(body);
    if (!result.success) throw new BadRequestException(result.error.issues.map((issue) => issue.message).join("；"));
    return result.data;
}

function validateIdempotencyKey(value: string) {
    if (!/^[A-Za-z0-9._:-]{8,160}$/.test(value)) throw new BadRequestException("Idempotency-Key 缺失或格式无效");
}

function summarizeImage(input: ImageRequest): Prisma.InputJsonValue {
    return { promptHash: hashText(input.prompt), promptLength: input.prompt.length, size: input.size, count: input.n, hasReference: Boolean(input.image), outputFormat: input.output_format };
}

function summarizeVideo(input: VideoRequest): Prisma.InputJsonValue {
    return { promptHash: hashText(input.prompt), promptLength: input.prompt.length, duration: input.duration, aspectRatio: input.aspect_ratio, imageReferences: input.images.length, videoReferences: input.videos.length, audioReferences: input.audios.length };
}

function summarizeSpeech(input: SpeechRequest): Prisma.InputJsonValue {
    return { textHash: hashText(input.input), characterCount: input.input.length, responseFormat: input.response_format, voiceConfigured: Boolean(input.voice), speed: input.speed };
}

function hashText(value: string) { return createHash("sha256").update(value).digest("hex"); }
function asRecord(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
export function providerVideoTaskId(result: Record<string, unknown>) {
    const data = asRecord(result.data);
    const taskId = [result.id, result.task_id, result.taskId, data.id, data.task_id, data.taskId]
        .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
    return taskId?.trim() || "";
}
function publicVideoTaskResult(result: Record<string, unknown>, publicId: string) {
    const { id: _id, task_id: _taskId, taskId: _camelTaskId, ...publicResult } = result;
    return { ...publicResult, id: publicId };
}
function videoResultUrl(result: Record<string, unknown>) { return String(result.result_url || result.video_url || "").trim(); }
function videoFailed(result: Record<string, unknown>, state: string) { return ["failed", "failure", "cancelled", "canceled", "expired"].includes(state) || (Boolean(result.is_final) && !videoResultUrl(result)); }
function readResultError(result: Record<string, unknown>) { const error = result.error; return typeof error === "string" ? error : error && typeof error === "object" ? String((error as Record<string, unknown>).message || "") : ""; }
function imageMimeType(format: string) { return format === "jpg" ? "image/jpeg" : `image/${format || "png"}`; }

export function publicVideoGenerationError(error: unknown, input: Pick<VideoRequest, "model" | "videos" | "audios">) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (!/no available channel for model/i.test(message)) return error;
    const selected = findProviderModel(input.model);
    const fallback = input.videos.length || input.audios.length ? "Seedance 2.0 720P 标准" : "Seedance 2.0 720P 经济";
    return new ServiceUnavailableException(`MetaJing 当前没有为「${selected?.label || input.model}」开放生成通道。本次未扣费，预授权已自动退回；请切换到「${fallback}」后重试。`);
}
