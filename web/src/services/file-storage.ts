import localforage from "localforage";
import { nanoid } from "nanoid";
import { downloadAccountMedia, queueAccountMediaUpload } from "@/services/account-media";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

// 编码策略升级后，避免继续读取旧的高码率视频 Blob。
const store = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files_v2" });
const cacheVersionStore = localforage.createInstance({ name: "infinite-canvas", storeName: "media_cache_versions_v1" });
const objectUrls = new Map<string, string>();
const cacheVersions = new Map<string, string>();

export async function uploadMediaFile(input: string | Blob, prefix = "file"): Promise<UploadedFile> {
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    const storageKey = `${prefix}:${nanoid()}`;
    await store.setItem(storageKey, blob);
    void queueAccountMediaUpload(storageKey, blob).catch(() => undefined);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    const meta = blob.type.startsWith("video/") ? await readVideoMeta(url) : blob.type.startsWith("audio/") ? await readAudioMeta(url) : {};
    return { url, storageKey, bytes: blob.size, mimeType: blob.type || "application/octet-stream", ...meta };
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const version = mediaVersion(fallback);
    const cached = objectUrls.get(storageKey);
    if (cached && (!version || (await readCacheVersion(storageKey)) === version)) return cached;
    if (cached) {
        URL.revokeObjectURL(cached);
        objectUrls.delete(storageKey);
    }
    const blob = await loadMediaBlob(storageKey, version);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    if (version) await writeCacheVersion(storageKey, version);
    return url;
}

export async function getMediaBlob(storageKey: string) {
    return loadMediaBlob(storageKey);
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    void queueAccountMediaUpload(storageKey, blob).catch(() => undefined);
    const previous = objectUrls.get(storageKey);
    if (previous) URL.revokeObjectURL(previous);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    await clearCacheVersion(storageKey);
    return url;
}

async function loadMediaBlob(storageKey: string, version?: string) {
    const local = await store.getItem<Blob>(storageKey);
    if (local && (!version || (await readCacheVersion(storageKey)) === version)) return local;
    try {
        const cloud = await downloadAccountMedia(storageKey);
        await store.setItem(storageKey, cloud);
        if (version) await writeCacheVersion(storageKey, version);
        return cloud;
    } catch {
        // 带版本的媒体不能回退到旧本地 Blob，否则会把已经替换的高码率视频重新播出来。
        return version ? null : local;
    }
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await clearCacheVersion(key);
            await store.removeItem(key);
        }),
    );
}

async function readCacheVersion(storageKey: string) {
    if (cacheVersions.has(storageKey)) return cacheVersions.get(storageKey);
    const version = await cacheVersionStore.getItem<string>(storageKey);
    if (version) cacheVersions.set(storageKey, version);
    return version || "";
}

async function writeCacheVersion(storageKey: string, version: string) {
    cacheVersions.set(storageKey, version);
    await cacheVersionStore.setItem(storageKey, version);
}

async function clearCacheVersion(storageKey: string) {
    cacheVersions.delete(storageKey);
    await cacheVersionStore.removeItem(storageKey);
}

function mediaVersion(value: string) {
    if (!value || value.startsWith("blob:") || value.startsWith("data:")) return "";
    try {
        return new URL(value, window.location.origin).searchParams.get("v") || "";
    } catch {
        return "";
    }
}

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await Promise.all(unused.map((key) => store.removeItem(key)));
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (typeof value === "string") {
        if (/^(?:image|video|audio|file|model)(?:-reference)?:[A-Za-z0-9_-]{8,120}$/.test(value)) keys.add(value);
        return keys;
    }
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && /^(?:image|video|audio|file|model)(?:-reference)?:[A-Za-z0-9_-]{8,120}$/.test(value.storageKey)) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done;
        video.onerror = done;
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}
