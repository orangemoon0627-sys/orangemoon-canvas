import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  Readable,
  Transform,
  type Readable as ReadableStream,
} from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { CanvasMedia } from "@prisma/client";
import { WorkspaceRole } from "@prisma/client";

import {
  platformMediaDir,
  platformMediaMaxFileBytes,
} from "../common/environment";
import { PrismaService } from "../prisma/prisma.service";
import { WorkspaceService } from "../workspaces/workspace.service";

const STORAGE_KEY_PATTERN =
  /^[A-Za-z][A-Za-z0-9_-]{0,31}:[A-Za-z0-9_-]{8,120}$/;
const ALLOWED_MIME_TYPE =
  /^(?:image|video|audio)\/[A-Za-z0-9.+-]+$|^model\/gltf(?:\+json|-binary)$|^application\/(?:gltf-buffer|octet-stream)$/;
// Keep the playback asset below the bandwidth available on typical client
// connections so a single video can play without chasing its buffer.
export const PLAYBACK_VIDEO_MAX_BITRATE = 2_400_000;
const execFileAsync = promisify(execFile);

@Injectable()
export class CanvasMediaService {
  private readonly logger = new Logger(CanvasMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
  ) {}

  async missing(
    userId: string,
    workspacePublicId: string | undefined,
    keys: string[],
  ) {
    const workspace = await this.workspaces.resolve(userId, workspacePublicId);
    const uniqueKeys = [...new Set(keys)];
    uniqueKeys.forEach(validateStorageKey);
    const records = await this.prisma.canvasMedia.findMany({
      where: { workspaceId: workspace.id, storageKey: { in: uniqueKeys } },
    });
    const available = new Set<string>();
    await Promise.all(
      records.map(async (record) => {
        if (await fileExists(mediaPath(record.userId, record.storageKey)))
          available.add(record.storageKey);
      }),
    );
    return uniqueKeys.filter((key) => !available.has(key));
  }

  async save(
    userId: string,
    workspacePublicId: string | undefined,
    storageKey: string,
    mimeType: string,
    stream: Readable & { truncated?: boolean },
  ) {
    const workspace = await this.workspaces.resolve(
      userId,
      workspacePublicId,
      WorkspaceRole.EDITOR,
    );
    return this.saveForWorkspace(
      userId,
      workspace.id,
      storageKey,
      mimeType,
      stream,
    );
  }

  async saveBufferForWorkspace(
    userId: string,
    workspaceId: string,
    storageKey: string,
    mimeType: string,
    buffer: Buffer,
    options?: { replaceExisting?: boolean },
  ) {
    const stream = Readable.from(buffer) as ReadableStream & {
      truncated?: boolean;
    };
    return this.saveForWorkspace(
      userId,
      workspaceId,
      storageKey,
      mimeType,
      stream,
      options?.replaceExisting === true,
    );
  }

  async saveVideoBufferForWorkspace(
    userId: string,
    workspaceId: string,
    storageKey: string,
    mimeType: string,
    buffer: Buffer,
  ) {
    const optimized = await optimizeVideoForPlayback(
      buffer,
      mimeType,
      this.logger,
    );
    return this.saveBufferForWorkspace(
      userId,
      workspaceId,
      storageKey,
      optimized.mimeType,
      optimized.buffer,
      { replaceExisting: true },
    );
  }

  private async saveForWorkspace(
    userId: string,
    workspaceId: string,
    storageKey: string,
    mimeType: string,
    stream: ReadableStream & { truncated?: boolean },
    replaceExisting = false,
  ) {
    validateStorageKey(storageKey);
    validateMimeType(mimeType);
    const existing = await this.prisma.canvasMedia.findUnique({
      where: { workspaceId_storageKey: { workspaceId, storageKey } },
    });
    const target = mediaPath(userId, storageKey);
    if (existing && (await fileExists(target)) && !replaceExisting)
      return existing;
    const temporary = `${target}.${randomUUID()}.partial`;
    await mkdir(dirname(target), { recursive: true });
    const hash = createHash("sha256");
    const maxBytes = platformMediaMaxFileBytes();
    let bytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > maxBytes)
          return callback(
            new PayloadTooLargeException(
              `单个媒体文件不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`,
            ),
          );
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        stream,
        meter,
        createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
      );
      if (stream.truncated)
        throw new PayloadTooLargeException(
          `单个媒体文件不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`,
        );
      if (!bytes) throw new BadRequestException("媒体文件不能为空");
      await rename(temporary, target);
      const checksum = hash.digest("hex");
      const media = await this.prisma.canvasMedia.upsert({
        where: { workspaceId_storageKey: { workspaceId, storageKey } },
        create: { userId, workspaceId, storageKey, mimeType, bytes, checksum },
        update: { userId, mimeType, bytes, checksum },
      });
      if (existing?.userId && existing.userId !== userId)
        await rm(mediaPath(existing.userId, storageKey), { force: true }).catch(
          () => undefined,
        );
      return media;
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async open(
    userId: string,
    workspacePublicId: string | undefined,
    storageKey: string,
  ) {
    const workspace = await this.workspaces.resolve(userId, workspacePublicId);
    validateStorageKey(storageKey);
    const media = await this.prisma.canvasMedia.findUnique({
      where: {
        workspaceId_storageKey: { workspaceId: workspace.id, storageKey },
      },
    });
    if (!media) throw new NotFoundException("媒体文件不存在");
    const path = mediaPath(media.userId, storageKey);
    if (!(await fileExists(path)))
      throw new NotFoundException("媒体文件不存在");
    return { media, path };
  }

  async composeWithAudio(
    userId: string,
    workspacePublicId: string | undefined,
    videoStorageKey: string,
    audioStorageKey: string,
  ) {
    const workspace = await this.workspaces.resolve(
      userId,
      workspacePublicId,
      WorkspaceRole.EDITOR,
    );
    validateStorageKey(videoStorageKey);
    validateStorageKey(audioStorageKey);
    if (
      !videoStorageKey.startsWith("video:") ||
      !audioStorageKey.startsWith("audio:")
    )
      throw new BadRequestException("音视频存储编号类型不匹配");

    const [video, audio] = await Promise.all([
      this.prisma.canvasMedia.findUnique({
        where: {
          workspaceId_storageKey: {
            workspaceId: workspace.id,
            storageKey: videoStorageKey,
          },
        },
      }),
      this.prisma.canvasMedia.findUnique({
        where: {
          workspaceId_storageKey: {
            workspaceId: workspace.id,
            storageKey: audioStorageKey,
          },
        },
      }),
    ]);
    if (!video || !audio) throw new NotFoundException("待合成的音视频不存在");
    if (!video.mimeType.startsWith("video/"))
      throw new BadRequestException("视频媒体类型无效");
    if (!audio.mimeType.startsWith("audio/"))
      throw new BadRequestException("音频媒体类型无效");

    const outputStorageKey = `video:mix_${createHash("sha256").update(`${workspace.id}\0${videoStorageKey}\0${audioStorageKey}`).digest("hex").slice(0, 32)}`;
    const existing = await this.prisma.canvasMedia.findUnique({
      where: {
        workspaceId_storageKey: {
          workspaceId: workspace.id,
          storageKey: outputStorageKey,
        },
      },
    });
    if (
      existing &&
      (await fileExists(mediaPath(existing.userId, outputStorageKey)))
    )
      return serializedComposedMedia(existing);

    const videoPath = mediaPath(video.userId, videoStorageKey);
    const audioPath = mediaPath(audio.userId, audioStorageKey);
    if (!(await fileExists(videoPath)) || !(await fileExists(audioPath)))
      throw new NotFoundException("待合成的音视频文件不存在");

    const temporaryDirectory = await mkdtemp(
      join(platformMediaDir(), ".compose-"),
    );
    const outputPath = join(temporaryDirectory, "output.mp4");
    try {
      await runAudioMux(videoPath, audioPath, outputPath);
      const outputStat = await stat(outputPath);
      const maxBytes = platformMediaMaxFileBytes();
      if (!outputStat.size)
        throw new BadGatewayException("音视频合成没有产生有效文件");
      if (outputStat.size > maxBytes)
        throw new PayloadTooLargeException(
          `合成视频不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`,
        );
      const stored = await this.saveBufferForWorkspace(
        userId,
        workspace.id,
        outputStorageKey,
        "video/mp4",
        await readFile(outputPath),
      );
      return serializedComposedMedia(stored);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }
}

export function serializeCanvasMedia(media: CanvasMedia) {
  return {
    storageKey: media.storageKey,
    mimeType: media.mimeType,
    bytes: media.bytes.toString(),
    checksum: media.checksum,
    updatedAt: media.updatedAt,
  };
}

export function canvasMediaUrl(storageKey: string, checksum?: string) {
  const path = `/platform-api/canvas-media/${encodeURIComponent(storageKey)}`;
  const version = checksum?.trim().slice(0, 16);
  return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}

export function validateStorageKey(storageKey: string) {
  if (!STORAGE_KEY_PATTERN.test(storageKey))
    throw new BadRequestException("媒体存储编号格式无效");
}

export function validateMimeType(mimeType: string) {
  if (!ALLOWED_MIME_TYPE.test(mimeType) || mimeType.length > 120)
    throw new BadRequestException("媒体文件类型无效");
}

export type VideoPlaybackProbe = {
  codecName?: string;
  pixelFormat?: string;
  bitRate?: number;
};

export function needsVideoPlaybackOptimization(probe: VideoPlaybackProbe) {
  return (
    probe.codecName?.toLowerCase() !== "h264" ||
    probe.pixelFormat?.toLowerCase() !== "yuv420p" ||
    !Number.isFinite(probe.bitRate) ||
    Number(probe.bitRate) > PLAYBACK_VIDEO_MAX_BITRATE
  );
}

export function buildVideoPlaybackArguments(
  inputPath: string,
  outputPath: string,
) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    ...videoPlaybackEncodingArguments(),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

export function buildAudioMuxArguments(
  videoPath: string,
  audioPath: string,
  outputPath: string,
) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
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
    ...videoPlaybackEncodingArguments(),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-af",
    "aresample=async=1:first_pts=0",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

function videoPlaybackEncodingArguments() {
  return [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-threads",
    "2",
    "-b:v",
    "1.8M",
    "-maxrate",
    "2M",
    "-bufsize",
    "4M",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-tag:v",
    "avc1",
    "-fps_mode",
    "cfr",
    "-g",
    "48",
    "-keyint_min",
    "1",
    "-sc_threshold",
    "0",
    "-force_key_frames",
    "expr:gte(t,n_forced*2)",
  ];
}

async function optimizeVideoForPlayback(
  buffer: Buffer,
  mimeType: string,
  logger: Logger,
) {
  const fallback = { buffer, mimeType: mimeType || "video/mp4" };
  if (!mimeType.startsWith("video/") && mimeType !== "application/octet-stream")
    return fallback;

  await mkdir(platformMediaDir(), { recursive: true });
  const temporaryDirectory = await mkdtemp(
    join(platformMediaDir(), ".video-optimize-"),
  );
  const inputPath = join(temporaryDirectory, "input");
  const outputPath = join(temporaryDirectory, "output.mp4");
  try {
    await writeFile(inputPath, buffer, { mode: 0o600 });
    const probe = await probeVideo(inputPath);
    if (
      probe &&
      mimeType === "video/mp4" &&
      !needsVideoPlaybackOptimization(probe)
    )
      return fallback;
    await runVideoOptimization(inputPath, outputPath);
    const optimized = await readFile(outputPath);
    if (!optimized.length) throw new Error("FFmpeg 没有产生有效视频");
    return { buffer: optimized, mimeType: "video/mp4" };
  } catch (error) {
    logger.warn(
      `视频播放优化跳过：${error instanceof Error ? error.message : "FFmpeg 处理失败"}`,
    );
    return fallback;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

async function probeVideo(
  inputPath: string,
): Promise<VideoPlaybackProbe | null> {
  const executable =
    String(process.env.PLATFORM_FFPROBE_BIN || "ffprobe").trim() || "ffprobe";
  try {
    const result = await execFileAsync(
      executable,
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        inputPath,
      ],
      { timeout: 30_000, maxBuffer: 256 * 1024 },
    );
    const payload = JSON.parse(result.stdout) as {
      streams?: Array<Record<string, unknown>>;
      format?: Record<string, unknown>;
    };
    const stream =
      payload.streams?.find((item) => item.codec_type === "video") || {};
    const streamBitRate = numberValue(stream.bit_rate);
    const formatBitRate = numberValue(payload.format?.bit_rate);
    return {
      codecName: stringValue(stream.codec_name),
      pixelFormat: stringValue(stream.pix_fmt),
      bitRate: streamBitRate ?? formatBitRate,
    };
  } catch {
    return null;
  }
}

async function runVideoOptimization(inputPath: string, outputPath: string) {
  const executable =
    String(process.env.PLATFORM_FFMPEG_BIN || "ffmpeg").trim() || "ffmpeg";
  await execFileAsync(
    executable,
    buildVideoPlaybackArguments(inputPath, outputPath),
    { timeout: 180_000, maxBuffer: 64 * 1024 },
  );
}

async function runAudioMux(
  videoPath: string,
  audioPath: string,
  outputPath: string,
) {
  const executable =
    String(process.env.PLATFORM_FFMPEG_BIN || "ffmpeg").trim() || "ffmpeg";
  try {
    await execFileAsync(
      executable,
      buildAudioMuxArguments(videoPath, audioPath, outputPath),
      { timeout: 180_000, maxBuffer: 64 * 1024 },
    );
  } catch (error) {
    const details =
      error && typeof error === "object"
        ? String((error as { stderr?: unknown }).stderr || "")
        : "";
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      throw new ServiceUnavailableException(
        "服务器未安装 FFmpeg，暂时无法合成成片音频",
      );
    throw new BadGatewayException(
      details.trim().slice(-800) || "音视频合成失败",
    );
  }
}

function serializedComposedMedia(media: CanvasMedia) {
  return {
    url: canvasMediaUrl(media.storageKey, media.checksum),
    storageKey: media.storageKey,
    bytes: Number(media.bytes),
    mimeType: media.mimeType,
  };
}

function mediaPath(userId: string, storageKey: string) {
  const digest = createHash("sha256")
    .update(`${userId}\0${storageKey}`)
    .digest("hex");
  return join(platformMediaDir(), digest.slice(0, 2), digest);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function fileExists(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
