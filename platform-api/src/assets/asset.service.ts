import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AssetKind, Prisma, type Asset } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import type { AssetListQueryDto, UpsertAssetDto } from "./asset.dto";

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_JSON_BYTES = 100 * 1024;

@Injectable()
export class AssetService {
    constructor(private readonly prisma: PrismaService) {}

    async list(userId: string, query: AssetListQueryDto) {
        const search = query.search?.trim();
        const where: Prisma.AssetWhereInput = {
            userId,
            ...(query.kind ? { kind: query.kind } : {}),
            ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { source: { contains: search, mode: "insensitive" } }, { note: { contains: search, mode: "insensitive" } }] } : {}),
        };
        const [total, assets] = await Promise.all([
            this.prisma.asset.count({ where }),
            this.prisma.asset.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
        ]);
        return { total, assets };
    }

    async upsert(userId: string, publicId: string, input: UpsertAssetDto) {
        validatePublicId(publicId);
        validatePayloadSize(input);
        const existing = await this.prisma.asset.findUnique({ where: { publicId }, select: { id: true, userId: true } });
        if (existing && existing.userId !== userId) throw new ConflictException("资产编号已被占用");
        const data = toAssetData(input);
        const asset = existing
            ? await this.prisma.asset.update({ where: { id: existing.id }, data })
            : await this.prisma.asset.create({ data: { publicId, userId, ...data } });
        return asset;
    }

    async remove(userId: string, publicId: string) {
        validatePublicId(publicId);
        const result = await this.prisma.asset.deleteMany({ where: { publicId, userId } });
        if (result.count !== 1) throw new NotFoundException("资产不存在");
    }
}

export function serializeAsset(asset: Asset) {
    const storedData = asset.data && typeof asset.data === "object" && !Array.isArray(asset.data) ? asset.data as Record<string, unknown> : {};
    const generatedImageProxy = asset.kind === AssetKind.IMAGE && asset.generationJobId && /^https?:\/\//i.test(String(storedData.dataUrl || ""))
        ? `/platform-api/providers/assets/${asset.publicId}/content`
        : "";
    return {
        id: asset.publicId,
        kind: asset.kind.toLowerCase(),
        title: asset.title,
        coverUrl: generatedImageProxy || asset.coverUrl || "",
        tags: asset.tags,
        source: asset.source,
        note: asset.note,
        data: generatedImageProxy ? { ...storedData, dataUrl: generatedImageProxy } : asset.data,
        metadata: asset.metadata,
        generationJobId: asset.generationJobId,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
    };
}

function toAssetData(input: UpsertAssetDto) {
    return {
        kind: input.kind,
        title: input.title,
        coverUrl: input.coverUrl || null,
        tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))],
        source: input.source || null,
        note: input.note || null,
        data: input.data as Prisma.InputJsonValue,
        metadata: input.metadata ? input.metadata as Prisma.InputJsonValue : Prisma.JsonNull,
    } satisfies Prisma.AssetUncheckedUpdateInput;
}

function validatePublicId(publicId: string) {
    if (!PUBLIC_ID_PATTERN.test(publicId)) throw new BadRequestException("资产编号格式无效");
}

function validatePayloadSize(input: UpsertAssetDto) {
    const size = Buffer.byteLength(JSON.stringify({ data: input.data, metadata: input.metadata || null }), "utf8");
    if (size > MAX_JSON_BYTES) throw new BadRequestException("资产元数据不能超过 100KB，请勿把媒体文件写入数据库");
}

export function providerAssetKind(capability: string) {
    if (capability === "image") return AssetKind.IMAGE;
    if (capability === "video") return AssetKind.VIDEO;
    if (capability === "audio") return AssetKind.AUDIO;
    return AssetKind.TEXT;
}
