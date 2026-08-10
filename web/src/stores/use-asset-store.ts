import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { cleanupUnusedImages, getImageBlob, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, getMediaBlob, resolveMediaUrl } from "@/services/file-storage";
import { bindAccountMediaOwner, ensureAccountMediaUploaded } from "@/services/account-media";
import { deleteAccountAsset, fetchAccountAssets, upsertAccountAsset, type PlatformAsset } from "@/services/api/platform";

export type AssetKind = "text" | "image" | "video";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    ownerId: string | null;
    syncing: boolean;
    syncError: string;
    assets: Asset[];
    workspaceCache: Record<string, Asset[]>;
    bindOwner: (scopeId: string, legacyOwnerId?: string) => Promise<void>;
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

const ASSET_STORE_KEY = "infinite-canvas:asset_store";
const syncQueue = new Map<string, Promise<void>>();

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        parsed.state.assets = await Promise.all((parsed.state.assets || []).map(hydrateAsset));
        parsed.state.workspaceCache ||= {};
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            ownerId: null,
            syncing: false,
            syncError: "",
            assets: [],
            workspaceCache: {},
            bindOwner: async (scopeId, legacyOwnerId) => {
                await waitForHydration();
                bindAccountMediaOwner(scopeId);
                const previous = get();
                const workspaceCache = { ...previous.workspaceCache };
                if (previous.ownerId) workspaceCache[previous.ownerId] = previous.assets;
                const legacyAssets = previous.ownerId === null || previous.ownerId === legacyOwnerId ? previous.assets : [];
                const cachedAssets = previous.ownerId === scopeId ? previous.assets : workspaceCache[scopeId] || legacyAssets;
                const localAssets = await Promise.all(cachedAssets.map(hydrateAsset));
                set({ ownerId: scopeId, workspaceCache, assets: localAssets, syncing: true, syncError: "" });
                try {
                    const remote = await fetchAccountAssets();
                    const remoteAssets = await Promise.all(remote.assets.filter(isSupportedPlatformAsset).map(platformAssetToLocal));
                    if (get().ownerId !== scopeId) return;
                    const uploads = localAssets.filter((asset) => {
                        const remoteAsset = remoteAssets.find((item) => item.id === asset.id);
                        return !remoteAsset || Date.parse(asset.updatedAt) > Date.parse(remoteAsset.updatedAt);
                    });
                    const merged = mergeAssets(remoteAssets, localAssets);
                    set({ assets: merged, syncing: false });
                    uploads.forEach((asset) => queueSync(scopeId, asset.id, () => syncAsset(asset)));
                } catch (error) {
                    if (get().ownerId === scopeId) set({ syncing: false, syncError: error instanceof Error ? error.message : "资产同步失败" });
                }
            },
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const created = { ...asset, id, createdAt: now, updatedAt: now } as Asset;
                set((state) => ({ assets: [created, ...state.assets] }));
                const scopeId = get().ownerId;
                if (scopeId) queueSync(scopeId, id, () => syncAsset(created));
                return id;
            },
            updateAsset: (id, patch) => {
                let updated: Asset | undefined;
                set((state) => ({
                    assets: state.assets.map((asset) => {
                        if (asset.id !== id) return asset;
                        updated = { ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset;
                        return updated;
                    }),
                }));
                const scopeId = get().ownerId;
                if (updated && scopeId) queueSync(scopeId, id, () => syncAsset(updated!));
            },
            removeAsset: (id) => {
                set((state) => {
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    get().cleanupImages({ assets });
                    return { assets };
                });
                const scopeId = get().ownerId;
                if (scopeId) queueSync(scopeId, id, async () => { await deleteAccountAsset(id); });
            },
            replaceAssets: (assets) => {
                set({ assets });
                const scopeId = get().ownerId;
                if (scopeId) assets.forEach((asset) => queueSync(scopeId, asset.id, () => syncAsset(asset)));
            },
            cleanupImages: (extra) => {
                window.setTimeout(async () => {
                    const { useCanvasStore } = await import("@/stores/canvas/use-canvas-store");
                    await cleanupUnusedImages({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                    await cleanupUnusedMedia({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                }, 0);
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ ownerId: state.ownerId, assets: state.assets, workspaceCache: state.ownerId ? { ...state.workspaceCache, [state.ownerId]: state.assets } : state.workspaceCache }) as StorageValue<AssetStore>["state"],
            onRehydrateStorage: () => () => {
                useAssetStore.setState({ hydrated: true });
            },
        },
    ),
);

async function waitForHydration() {
    if (useAssetStore.getState().hydrated) return;
    await new Promise<void>((resolve) => {
        const unsubscribe = useAssetStore.subscribe((state) => {
            if (!state.hydrated) return;
            unsubscribe();
            resolve();
        });
    });
}

function queueSync(scopeId: string, id: string, task: () => Promise<void>) {
    const key = `${scopeId}:${id}`;
    const previous = syncQueue.get(key) || Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
        if (useAssetStore.getState().ownerId !== scopeId) return;
        await task();
    }).catch((error) => {
        if (useAssetStore.getState().ownerId === scopeId) useAssetStore.setState({ syncError: error instanceof Error ? error.message : "资产同步失败" });
    }).finally(() => {
        if (syncQueue.get(key) === next) syncQueue.delete(key);
    });
    syncQueue.set(key, next);
}

async function syncAsset(asset: Asset) {
    if (asset.kind !== "text" && asset.data.storageKey) {
        const blob = asset.kind === "image" ? await getImageBlob(asset.data.storageKey) : await getMediaBlob(asset.data.storageKey);
        const unresolved = await ensureAccountMediaUploaded([{ storageKey: asset.data.storageKey, blob }]);
        if (unresolved.length) throw new Error(`素材“${asset.title}”的本地文件缺失，已保留本地记录并等待恢复后重试`);
    }
    await upsertAccountAsset(asset.id, localAssetToPlatform(asset));
}

function localAssetToPlatform(asset: Asset) {
    const data = asset.kind === "text"
        ? asset.data
        : asset.kind === "image"
          ? { ...asset.data, dataUrl: portableUrl(asset.data.dataUrl) }
          : { ...asset.data, url: portableUrl(asset.data.url) };
    return {
        kind: asset.kind,
        title: asset.title,
        coverUrl: portableUrl(asset.coverUrl),
        tags: asset.tags || [],
        source: asset.source || null,
        note: asset.note || null,
        data,
        metadata: asset.metadata || null,
    };
}

function portableUrl(value: string) {
    return /^(?:blob:|data:)/i.test(value || "") ? "" : value || "";
}

function isSupportedPlatformAsset(asset: PlatformAsset): asset is PlatformAsset & { kind: AssetKind } {
    return asset.kind === "text" || asset.kind === "image" || asset.kind === "video";
}

async function platformAssetToLocal(asset: PlatformAsset & { kind: AssetKind }): Promise<Asset> {
    const base = {
        id: asset.id,
        kind: asset.kind,
        title: asset.title,
        coverUrl: asset.coverUrl || "",
        tags: asset.tags || [],
        source: asset.source || undefined,
        note: asset.note || undefined,
        metadata: asset.metadata || undefined,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
    };
    if (asset.kind === "text") return { ...base, kind: "text", data: { content: String(asset.data.content || "") } };
    if (asset.kind === "image") {
        const storageKey = stringValue(asset.data.storageKey);
        const dataUrl = await resolveImageUrl(storageKey, stringValue(asset.data.dataUrl));
        return { ...base, kind: "image", coverUrl: base.coverUrl || dataUrl, data: { dataUrl, storageKey: storageKey || undefined, width: numberValue(asset.data.width), height: numberValue(asset.data.height), bytes: numberValue(asset.data.bytes), mimeType: stringValue(asset.data.mimeType) || "image/png" } };
    }
    const storageKey = stringValue(asset.data.storageKey);
    const url = await resolveMediaUrl(storageKey, stringValue(asset.data.url));
    return { ...base, kind: "video", data: { url, storageKey: storageKey || undefined, width: numberValue(asset.data.width), height: numberValue(asset.data.height), bytes: numberValue(asset.data.bytes), mimeType: stringValue(asset.data.mimeType) || "video/mp4" } };
}

async function hydrateAsset(asset: Asset): Promise<Asset> {
    if (asset.kind === "video" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
    if (asset.kind !== "image") return asset;
    if (asset.data.storageKey) {
        const dataUrl = await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl);
        return { ...asset, coverUrl: asset.coverUrl.startsWith("blob:") ? dataUrl : asset.coverUrl, data: { ...asset.data, dataUrl } };
    }
    if (!asset.data.dataUrl.startsWith("data:image/")) return asset;
    const image = await uploadImage(asset.data.dataUrl);
    return { ...asset, coverUrl: asset.coverUrl.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
}

function mergeAssets(remote: Asset[], local: Asset[]) {
    const merged = new Map(remote.map((asset) => [asset.id, asset]));
    for (const asset of local) {
        const current = merged.get(asset.id);
        if (!current || new Date(asset.updatedAt).getTime() > new Date(current.updatedAt).getTime()) merged.set(asset.id, asset);
    }
    return [...merged.values()].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : 0; }
