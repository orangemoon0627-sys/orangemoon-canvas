import { downloadCanvasMedia, findMissingCanvasMedia, uploadCanvasMedia } from "@/services/api/platform";

let ownerId = "";
const uploadedKeys = new Set<string>();
const uploadQueue = new Map<string, Promise<void>>();
const downloadQueue = new Map<string, Promise<Blob>>();

export function bindAccountMediaOwner(userId: string) {
    if (ownerId === userId) return;
    ownerId = userId;
    uploadedKeys.clear();
    uploadQueue.clear();
    downloadQueue.clear();
}

export function queueAccountMediaUpload(storageKey: string, blob: Blob) {
    const requestedOwner = ownerId;
    if (!requestedOwner || uploadedKeys.has(storageKey)) return Promise.resolve();
    const existing = uploadQueue.get(storageKey);
    if (existing) return existing;
    const task = uploadCanvasMedia(storageKey, blob)
        .then(() => {
            if (ownerId === requestedOwner) uploadedKeys.add(storageKey);
        })
        .finally(() => {
            if (uploadQueue.get(storageKey) === task) uploadQueue.delete(storageKey);
        });
    uploadQueue.set(storageKey, task);
    return task;
}

export async function ensureAccountMediaUploaded(items: Array<{ storageKey: string; blob: Blob | null }>) {
    const requestedOwner = ownerId;
    if (!requestedOwner || !items.length) return [];
    const unique = [...new Map(items.map((item) => [item.storageKey, item])).values()];
    const unchecked = unique.filter((item) => !uploadedKeys.has(item.storageKey));
    if (!unchecked.length) return [];
    const unresolved: string[] = [];
    for (let offset = 0; offset < unchecked.length; offset += 300) {
        const batch = unchecked.slice(offset, offset + 300);
        const { missing } = await findMissingCanvasMedia(batch.map((item) => item.storageKey));
        assertOwner(requestedOwner);
        const missingSet = new Set(missing);
        batch.forEach((item) => {
            if (!missingSet.has(item.storageKey)) uploadedKeys.add(item.storageKey);
        });
        for (const item of batch) {
            if (!missingSet.has(item.storageKey)) continue;
            if (!item.blob) {
                unresolved.push(item.storageKey);
                continue;
            }
            await queueAccountMediaUpload(item.storageKey, item.blob);
            assertOwner(requestedOwner);
        }
    }
    return unresolved;
}

export function downloadAccountMedia(storageKey: string) {
    const requestedOwner = ownerId;
    if (!requestedOwner) return Promise.reject(new Error("尚未绑定媒体所属账户"));
    const queueKey = `${requestedOwner}:${storageKey}`;
    const existing = downloadQueue.get(queueKey);
    if (existing) return existing;
    const task = downloadCanvasMedia(storageKey)
        .then((blob) => {
            assertOwner(requestedOwner);
            return blob;
        })
        .finally(() => {
            if (downloadQueue.get(queueKey) === task) downloadQueue.delete(queueKey);
        });
    downloadQueue.set(queueKey, task);
    return task;
}

function assertOwner(requestedOwner: string) {
    if (ownerId !== requestedOwner) throw new Error("账户已切换，已取消旧账户的媒体同步");
}
