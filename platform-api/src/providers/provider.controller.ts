import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { formatMilliCredits } from "../common/money";
import { findProviderModel, METAJING_IMAGE_SIZES, PROVIDER_CATALOG_VERSION, PUBLIC_PROVIDER_MODELS, type ProviderModel } from "./provider-catalog";
import { GenerationService } from "./generation.service";
import { PRICE_ROUNDING, PricingService } from "./pricing.service";
import { ProviderUpstreamService } from "./provider-upstream.service";

@Controller("providers")
@UseGuards(SessionAuthGuard)
export class ProviderController {
    constructor(private readonly generations: GenerationService, private readonly pricing: PricingService, private readonly upstream: ProviderUpstreamService) {}

    @Get("catalog")
    catalog(@CurrentUser() user: AuthenticatedUser) {
        const providerUsdToCny = this.pricing.exchangeRates();
        const showCost = user.role === "ADMIN";
        return {
            ok: true,
            version: PROVIDER_CATALOG_VERSION,
            currency: { creditToCny: 1, ...(showCost ? { usdToCny: providerUsdToCny.metajing, providerUsdToCny } : {}) },
            pricing: { markup: showCost ? this.pricing.markup() : undefined, targetGrossMargin: this.pricing.targetGrossMargin(), rounding: PRICE_ROUNDING },
            providers: this.upstream.status(),
            image: { maxCount: 4, maxReferences: 1, sizes: METAJING_IMAGE_SIZES },
            models: PUBLIC_PROVIDER_MODELS.map((model) => {
                const { upstreamModel: _upstreamModel, upstreamSource: _upstreamSource, ...publicModel } = model;
                return {
                    ...publicModel,
                    billing: showCost ? model.billing : { unit: model.billing.unit },
                    examples: this.pricing.examples(model).map((example) => showCost ? example : { requestedQuantity: example.requestedQuantity, quantity: example.quantity, unit: example.unit, billingUnit: example.billingUnit, retailMilliCredits: example.retailMilliCredits, retailCredits: example.retailCredits }),
                };
            }),
        };
    }

    @Post("quote")
    quote(@Body() body: unknown) {
        const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
        const rawItems = Array.isArray(input.items) ? input.items : [];
        if (!rawItems.length || rawItems.length > 50) throw new BadRequestException("报价项目需要在 1-50 项之间");
        const items = rawItems.map((raw, index) => {
            const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
            const model = findProviderModel(String(item.model || "").trim());
            if (!model) throw new BadRequestException(`第 ${index + 1} 项模型不在官方目录中`);
            const quantity = Number(item.quantity);
            validateQuoteQuantity(model, quantity, index);
            const quote = this.pricing.quote(model, quantity);
            return {
                id: String(item.id || index),
                model: model.id,
                label: model.label,
                capability: model.capability,
                resolution: model.resolution,
                requestedQuantity: quantity,
                quantity: quote.quantity,
                billingUnit: quote.billingUnit,
                retailMilliCredits: quote.retailMilliCredits.toString(),
                retailCredits: quote.retailCredits,
            };
        });
        const totalMilliCredits = items.reduce((total, item) => total + BigInt(item.retailMilliCredits), 0n);
        return { ok: true, version: PROVIDER_CATALOG_VERSION, items, totalMilliCredits: totalMilliCredits.toString(), totalCredits: formatMilliCredits(totalMilliCredits) };
    }

    @Post("metajing/v1/images/generations")
    async image(@CurrentUser() user: AuthenticatedUser, @Headers("idempotency-key") idempotencyKey: string, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
        const output = await this.generations.image(user.id, idempotencyKey, this.generations.parseImage(body));
        reply.header("X-Generation-Job", output.jobId).header("X-Charged-Credits", output.chargedCredits).header("Cache-Control", "no-store");
        return output.result;
    }

    @Get("assets/:assetId/content")
    async imageAsset(@CurrentUser() user: AuthenticatedUser, @Param("assetId") assetId: string, @Res() reply: FastifyReply) {
        const media = await this.generations.imageAsset(user.id, assetId);
        reply
            .header("Content-Type", media.contentType)
            .header("Content-Length", String(media.contentLength))
            .header("Cache-Control", "private, max-age=3600")
            .header("X-Content-Type-Options", "nosniff")
            .send(media.body);
    }

    @Post("metajing/v1/video/generations")
    async createVideo(@CurrentUser() user: AuthenticatedUser, @Headers("idempotency-key") idempotencyKey: string, @Body() body: unknown) {
        return this.generations.createVideo(user.id, idempotencyKey, this.generations.parseVideo(body));
    }

    @Get("metajing/v1/video/generations/:taskId")
    async pollVideo(@CurrentUser() user: AuthenticatedUser, @Param("taskId") taskId: string) {
        return this.generations.pollVideo(user.id, taskId);
    }

    @Post("minimax/v1/audio/speech")
    async speech(@CurrentUser() user: AuthenticatedUser, @Headers("idempotency-key") idempotencyKey: string, @Body() body: unknown, @Res() reply: FastifyReply) {
        const input = this.generations.parseSpeech(body);
        const output = await this.generations.speech(user.id, idempotencyKey, input);
        reply
            .header("Content-Type", audioMimeType(input.response_format))
            .header("Content-Length", String(output.audio.byteLength))
            .header("X-Provider-Usage-Characters", String(output.usageCharacters))
            .header("X-Generation-Job", output.jobId)
            .header("X-Charged-Credits", output.chargedCredits)
            .header("Cache-Control", "no-store")
            .send(output.audio);
    }

    @Get("jobs")
    async jobs(@CurrentUser() user: AuthenticatedUser, @Query("limit") rawLimit?: string) {
        const jobs = await this.generations.listJobs(user.id, Number(rawLimit || 30));
        return {
            ok: true,
            jobs: jobs.map((job) => ({
                ...usageDetails(job.priceSnapshot, job.requestSummary),
                id: job.publicId,
                capability: job.capability,
                model: job.model,
                status: job.status,
                reservedMilliCredits: job.reservedMilliCredits.toString(),
                reservedCredits: formatMilliCredits(job.reservedMilliCredits),
                chargedMilliCredits: job.chargedMilliCredits.toString(),
                chargedCredits: formatMilliCredits(job.chargedMilliCredits),
                error: job.error,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
            })),
        };
    }
}

function validateQuoteQuantity(model: ProviderModel, quantity: number, index: number) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new BadRequestException(`第 ${index + 1} 项数量无效`);
    if (model.capability === "image" && quantity > 4) throw new BadRequestException("Image 2 每个任务最多生成 4 张");
    if (model.capability === "audio" && quantity > 10_000) throw new BadRequestException("MiniMax 单次最多合成 10000 个字符");
    if (model.capability !== "video") return;
    if (model.fixedDuration && quantity !== model.fixedDuration) throw new BadRequestException(`${model.label} 固定生成 ${model.fixedDuration} 秒`);
    if (model.allowedDurations && !model.allowedDurations.includes(quantity)) throw new BadRequestException(`${model.label} 只支持 ${model.allowedDurations.join("、")} 秒`);
    if (!model.fixedDuration && (quantity < (model.minDuration || 5) || quantity > (model.maxDuration || 15))) throw new BadRequestException(`${model.label} 时长需要在 ${model.minDuration || 5}-${model.maxDuration || 15} 秒之间`);
}

function usageDetails(priceSnapshot: unknown, requestSummary: unknown) {
    const price = priceSnapshot && typeof priceSnapshot === "object" ? priceSnapshot as Record<string, unknown> : {};
    return {
        quantity: Number(price.quantity || 0),
        billingUnit: String(price.billingUnit || "generation"),
        requestSummary: requestSummary && typeof requestSummary === "object" ? requestSummary : null,
    };
}

function audioMimeType(format: string) {
    if (format === "wav") return "audio/wav";
    if (format === "flac") return "audio/flac";
    if (format === "pcm") return "audio/pcm";
    return "audio/mpeg";
}
