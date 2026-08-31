import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable, Transform, type Readable as ReadableStream } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { BadGatewayException, BadRequestException, Injectable, NotFoundException, PayloadTooLargeException, ServiceUnavailableException } from "@nestjs/common";
import type { CanvasMedia } from "@prisma/client";
import { WorkspaceRole } from "@prisma/client";

import { platformMediaDir, platformMediaMaxFileBytes } from "../common/environment";
import { PrismaService } from "../prisma/prisma.service";
import { WorkspaceService } from "../workspaces/workspace.service";

const STORAGE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}:[A-Za-z0-9_-]{8,120}$/;
const ALLOWED_MIME_TYPE = /^(?:image|video|audio)\/[A-Za-z0-9.+-]+$|^model\/gltf(?:\+json|-binary)$|^application\/(?:gltf-buffer|octet-stream)$/;
const execFileAsync = promisify(execFile);

@Injectable()
export class CanvasMediaService {
    constructor(private readonly prisma: PrismaService, private readonly workspaces: WorkspaceService) {}

    async missing(userId: string, workspacePublicId: string | undefined, keys: string[]) {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId);
        const uniqueKeys = [...new Set(keys)];
        uniqueKeys.forEach(validateStorageKey);
        const records = await this.prisma.canvasMedia.findMany({ where: { workspaceId: workspace.id, storageKey: { in: uniqueKeys } } });
        const available = new Set<string>();
        await Promise.all(records.map(async (record) => {
            if (await fileExists(mediaPath(record.userId, record.storageKey))) available.add(record.storageKey);
        }));
        return uniqueKeys.filter((key) => !available.has(key));
    }

    async save(userId: string, workspacePublicId: string | undefined, storageKey: string, mimeType: string, stream: Readable & { truncated?: boolean }) {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId, WorkspaceRole.EDITOR);
        return this.saveForWorkspace(userId, workspace.id, storageKey, mimeType, stream);
    }

    async saveBufferForWorkspace(userId: string, workspaceId: string, storageKey: string, mimeType: string, buffer: Buffer) {
        const stream = Readable.from(buffer) as ReadableStream & { truncated?: boolean };
        return this.saveForWorkspace(userId, workspaceId, storageKey, mimeType, stream);
    }

    private async saveForWorkspace(userId: string, workspaceId: string, storageKey: string, mimeType: string, stream: ReadableStream & { truncated?: boolean }) {
        validateStorageKey(storageKey);
        validateMimeType(mimeType);
        const existing = await this.prisma.canvasMedia.findUnique({ where: { workspaceId_storageKey: { workspaceId, storageKey } } });
        const target = mediaPath(userId, storageKey);
        if (existing && await fileExists(target)) return existing;
        const temporary = `${target}.${randomUUID()}.partial`;
        await mkdir(dirname(target), { recursive: true });
        const hash = createHash("sha256");
        const maxBytes = platformMediaMaxFileBytes();
        let bytes = 0;
        const meter = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                bytes += chunk.length;
                if (bytes > maxBytes) return callback(new PayloadTooLargeException(`单个媒体文件不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`));
                hash.update(chunk);
                callback(null, chunk);
            },
        });
        try {
            await pipeline(stream, meter, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
            if (stream.truncated) throw new PayloadTooLargeException(`单个媒体文件不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`);
            if (!bytes) throw new BadRequestException("媒体文件不能为空");
            await rename(temporary, target);
            const checksum = hash.digest("hex");
            const media = await this.prisma.canvasMedia.upsert({
                where: { workspaceId_storageKey: { workspaceId, storageKey } },
                create: { userId, workspaceId, storageKey, mimeType, bytes, checksum },
                update: { userId, mimeType, bytes, checksum },
            });
            if (existing?.userId && existing.userId !== userId) await rm(mediaPath(existing.userId, storageKey), { force: true }).catch(() => undefined);
            return media;
        } catch (error) {
            await rm(temporary, { force: true }).catch(() => undefined);
            throw error;
        }
    }

    async open(userId: string, workspacePublicId: string | undefined, storageKey: string) {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId);
        validateStorageKey(storageKey);
        const media = await this.prisma.canvasMedia.findUnique({ where: { workspaceId_storageKey: { workspaceId: workspace.id, storageKey } } });
        if (!media) throw new NotFoundException("媒体文件不存在");
        const path = mediaPath(media.userId, storageKey);
        if (!(await fileExists(path))) throw new NotFoundException("媒体文件不存在");
        return { media, path };
    }

    async composeWithAudio(userId: string, workspacePublicId: string | undefined, videoStorageKey: string, audioStorageKey: string) {
        const workspace = await this.workspaces.resolve(userId, workspacePublicId, WorkspaceRole.EDITOR);
        validateStorageKey(videoStorageKey);
        validateStorageKey(audioStorageKey);
        if (!videoStorageKey.startsWith("video:") || !audioStorageKey.startsWith("audio:")) throw new BadRequestException("音视频存储编号类型不匹配");

        const [video, audio] = await Promise.all([
            this.prisma.canvasMedia.findUnique({ where: { workspaceId_storageKey: { workspaceId: workspace.id, storageKey: videoStorageKey } } }),
            this.prisma.canvasMedia.findUnique({ where: { workspaceId_storageKey: { workspaceId: workspace.id, storageKey: audioStorageKey } } }),
        ]);
        if (!video || !audio) throw new NotFoundException("待合成的音视频不存在");
        if (!video.mimeType.startsWith("video/")) throw new BadRequestException("视频媒体类型无效");
        if (!audio.mimeType.startsWith("audio/")) throw new BadRequestException("音频媒体类型无效");

        const outputStorageKey = `video:mix_${createHash("sha256").update(`${workspace.id}\0${videoStorageKey}\0${audioStorageKey}`).digest("hex").slice(0, 32)}`;
        const existing = await this.prisma.canvasMedia.findUnique({ where: { workspaceId_storageKey: { workspaceId: workspace.id, storageKey: outputStorageKey } } });
        if (existing && await fileExists(mediaPath(existing.userId, outputStorageKey))) return serializedComposedMedia(existing);

        const videoPath = mediaPath(video.userId, videoStorageKey);
        const audioPath = mediaPath(audio.userId, audioStorageKey);
        if (!(await fileExists(videoPath)) || !(await fileExists(audioPath))) throw new NotFoundException("待合成的音视频文件不存在");

        const temporaryDirectory = await mkdtemp(join(platformMediaDir(), ".compose-"));
        const outputPath = join(temporaryDirectory, "output.mp4");
        try {
            await runAudioMux(videoPath, audioPath, outputPath);
            const outputStat = await stat(outputPath);
            const maxBytes = platformMediaMaxFileBytes();
            if (!outputStat.size) throw new BadGatewayException("音视频合成没有产生有效文件");
            if (outputStat.size > maxBytes) throw new PayloadTooLargeException(`合成视频不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`);
            const stored = await this.saveBufferForWorkspace(userId, workspace.id, outputStorageKey, "video/mp4", await readFile(outputPath));
            return serializedComposedMedia(stored);
        } finally {
            await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
        }
    }
}

export function serializeCanvasMedia(media: CanvasMedia) {
    return { storageKey: media.storageKey, mimeType: media.mimeType, bytes: media.bytes.toString(), checksum: media.checksum, updatedAt: media.updatedAt };
}

export function validateStorageKey(storageKey: string) {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new BadRequestException("媒体存储编号格式无效");
}

export function validateMimeType(mimeType: string) {
    if (!ALLOWED_MIME_TYPE.test(mimeType) || mimeType.length > 120) throw new BadRequestException("媒体文件类型无效");
}

export function buildAudioMuxArguments(videoPath: string, audioPath: string, outputPath: string) {
    return [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        videoPath,
        "-stream_loop",
        "-1",
        "-i",
        audioPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-af",
        "aresample=async=1:first_pts=0",
        "-shortest",
        "-movflags",
        "+faststart",
        outputPath,
    ];
}

async function runAudioMux(videoPath: string, audioPath: string, outputPath: string) {
    const executable = String(process.env.PLATFORM_FFMPEG_BIN || "ffmpeg").trim() || "ffmpeg";
    try {
        await execFileAsync(executable, buildAudioMuxArguments(videoPath, audioPath, outputPath), { timeout: 180_000, maxBuffer: 64 * 1024 });
    } catch (error) {
        const details = error && typeof error === "object" ? String((error as { stderr?: unknown }).stderr || "") : "";
        if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") throw new ServiceUnavailableException("服务器未安装 FFmpeg，暂时无法合成成片音频");
        throw new BadGatewayException(details.trim().slice(-800) || "音视频合成失败");
    }
}

function serializedComposedMedia(media: CanvasMedia) {
    return { url: `/platform-api/canvas-media/${encodeURIComponent(media.storageKey)}`, storageKey: media.storageKey, bytes: Number(media.bytes), mimeType: media.mimeType };
}

function mediaPath(userId: string, storageKey: string) {
    const digest = createHash("sha256").update(`${userId}\0${storageKey}`).digest("hex");
    return join(platformMediaDir(), digest.slice(0, 2), digest);
}

async function fileExists(path: string) {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}
