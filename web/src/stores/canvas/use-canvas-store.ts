import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { localForageStorage } from "@/lib/localforage-storage";
import { bindAccountMediaOwner } from "@/services/account-media";
import { fetchAndMergeCanvasProjects, fetchCanvasProjectFromCloud, normalizeLegacyProjectMedia, removeCanvasProjectFromCloud, uploadCanvasProject } from "@/services/canvas-cloud-sync";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

export type DeletedCanvasProject = { id: string; deletedAt: string };

type CanvasStore = {
    hydrated: boolean;
    ownerId: string | null;
    syncing: boolean;
    syncError: string;
    projects: CanvasProject[];
    deletedProjects: DeletedCanvasProject[];
    workspaceCache: Record<string, { projects: CanvasProject[]; deletedProjects: DeletedCanvasProject[] }>;
    bindOwner: (scopeId: string, legacyOwnerId?: string) => Promise<void>;
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
    refreshProject: (id: string) => Promise<boolean>;
};

export const CANVAS_REMOTE_UPDATE_EVENT = "orangemoon:canvas-remote-update";
export type CanvasRemoteUpdateDetail = { projectId: string; project?: CanvasProject; deletedProject?: DeletedCanvasProject };

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
type PersistedCanvasState = Pick<CanvasStore, "ownerId" | "projects" | "deletedProjects" | "workspaceCache">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;
const cloudTimers = new Map<string, ReturnType<typeof setTimeout>>();
const cloudQueue = new Map<string, Promise<void>>();

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<CanvasStore>;
        const state = parsed.state as Partial<PersistedCanvasState>;
        state.ownerId ??= null;
        state.projects ??= [];
        state.deletedProjects ??= [];
        state.workspaceCache ??= {};
        queuedPersistState = state as PersistedCanvasState;
        return parsed;
    },
    setItem: (name, value) => {
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState?.ownerId === nextState.ownerId && queuedPersistState.projects === nextState.projects && queuedPersistState.deletedProjects === nextState.deletedProjects && queuedPersistState.workspaceCache === nextState.workspaceCache) return;
        queuedPersistState = nextState;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void localForageStorage.setItem(name, JSON.stringify(value));
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            ownerId: null,
            syncing: false,
            syncError: "",
            projects: [],
            deletedProjects: [],
            workspaceCache: {},
            bindOwner: async (scopeId, legacyOwnerId) => {
                await waitForHydration();
                bindAccountMediaOwner(scopeId);
                clearCloudTimers();
                const previous = get();
                const workspaceCache = { ...previous.workspaceCache };
                if (previous.ownerId) workspaceCache[previous.ownerId] = { projects: previous.projects, deletedProjects: previous.deletedProjects };
                const legacy = previous.ownerId === null || previous.ownerId === legacyOwnerId ? { projects: previous.projects, deletedProjects: previous.deletedProjects } : undefined;
                const cached = previous.ownerId === scopeId ? { projects: previous.projects, deletedProjects: previous.deletedProjects } : workspaceCache[scopeId] || legacy;
                const localProjects = await Promise.all((cached?.projects || []).map(normalizeLegacyProjectMedia));
                const localDeletedProjects = cached?.deletedProjects || [];
                set({ ownerId: scopeId, workspaceCache, projects: localProjects, deletedProjects: localDeletedProjects, syncing: true, syncError: "" });
                try {
                    const merged = await fetchAndMergeCanvasProjects(localProjects, localDeletedProjects);
                    if (get().ownerId !== scopeId) return;
                    set({ projects: merged.projects, deletedProjects: merged.deletedProjects, syncing: false });
                    merged.uploadProjects.forEach((project) => scheduleCloudUpsert(scopeId, project, 0));
                    merged.uploadDeletions.forEach((project) => queueCloudDelete(scopeId, project));
                } catch (error) {
                    if (get().ownerId === scopeId) set({ syncing: false, syncError: errorMessage(error, "画布云同步失败") });
                }
            },
            createProject: (title = "未命名画布") => {
                const now = new Date().toISOString();
                const project: CanvasProject = {
                    id: nanoid(),
                    title,
                    createdAt: now,
                    updatedAt: now,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects], deletedProjects: state.deletedProjects.filter((item) => item.id !== project.id) }));
                const ownerId = get().ownerId;
                if (ownerId) scheduleCloudUpsert(ownerId, project, 0);
                return project.id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const project: CanvasProject = {
                    id: nanoid(),
                    title: source.title || "导入画布",
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    chatSessions: source.chatSessions || [],
                    activeChatId: source.activeChatId || null,
                    backgroundMode: source.backgroundMode || "lines",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                const ownerId = get().ownerId;
                if (ownerId) scheduleCloudUpsert(ownerId, project, 0);
                return project.id;
            },
            openProject: (id) => get().projects.find((item) => item.id === id) || null,
            renameProject: (id, title) => {
                let updated: CanvasProject | undefined;
                set((state) => ({
                    projects: state.projects.map((project) => {
                        if (project.id !== id) return project;
                        updated = { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() };
                        return updated;
                    }),
                }));
                const ownerId = get().ownerId;
                if (ownerId && updated) scheduleCloudUpsert(ownerId, updated);
            },
            deleteProjects: (ids) => {
                const deletedAt = new Date().toISOString();
                const deleted = ids.map((id) => ({ id, deletedAt }));
                set((state) => ({
                    projects: state.projects.filter((project) => !ids.includes(project.id)),
                    deletedProjects: [...state.deletedProjects.filter((item) => !ids.includes(item.id)), ...deleted],
                }));
                const ownerId = get().ownerId;
                if (ownerId) deleted.forEach((project) => queueCloudDelete(ownerId, project));
            },
            replaceProjects: (projects) => {
                set((state) => ({ projects, deletedProjects: state.deletedProjects.filter((item) => !projects.some((project) => project.id === item.id)) }));
                const ownerId = get().ownerId;
                if (ownerId) projects.forEach((project) => scheduleCloudUpsert(ownerId, project, 0));
            },
            updateProject: (id, patch) => {
                let updated: CanvasProject | undefined;
                set((state) => ({
                    projects: state.projects.map((project) => {
                        if (project.id !== id) return project;
                        updated = { ...project, ...patch, updatedAt: new Date().toISOString() };
                        return updated;
                    }),
                }));
                const ownerId = get().ownerId;
                if (ownerId && updated) scheduleCloudUpsert(ownerId, updated);
            },
            refreshProject: async (id) => {
                const ownerId = get().ownerId;
                if (!ownerId || projectHasPending(ownerId, id)) return false;
                try {
                    const remote = await fetchCanvasProjectFromCloud(id);
                    if (get().ownerId !== ownerId || projectHasPending(ownerId, id)) return false;
                    set({ syncError: "" });
                    const local = get().projects.find((project) => project.id === id);
                    if (remote.deletedProject) {
                        if (!local || Date.parse(remote.deletedProject.deletedAt) < Date.parse(local.updatedAt)) return false;
                        set((state) => ({ projects: state.projects.filter((project) => project.id !== id), deletedProjects: [...state.deletedProjects.filter((project) => project.id !== id), remote.deletedProject!] }));
                        dispatchRemoteUpdate({ projectId: id, deletedProject: remote.deletedProject });
                        return true;
                    }
                    if (!remote.project || (local && Date.parse(remote.project.updatedAt) <= Date.parse(local.updatedAt))) return false;
                    set((state) => ({ projects: [remote.project!, ...state.projects.filter((project) => project.id !== id)], deletedProjects: state.deletedProjects.filter((project) => project.id !== id), syncError: "" }));
                    dispatchRemoteUpdate({ projectId: id, project: remote.project });
                    return true;
                } catch (error) {
                    if (get().ownerId === ownerId) set({ syncError: errorMessage(error, "团队画布刷新失败") });
                    return false;
                }
            },
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) => ({
                ownerId: state.ownerId,
                projects: state.projects,
                deletedProjects: state.deletedProjects,
                workspaceCache: state.ownerId ? { ...state.workspaceCache, [state.ownerId]: { projects: state.projects, deletedProjects: state.deletedProjects } } : state.workspaceCache,
            }) as StorageValue<CanvasStore>["state"],
            onRehydrateStorage: () => () => {
                useCanvasStore.setState({ hydrated: true });
            },
        },
    ),
);

async function waitForHydration() {
    if (useCanvasStore.getState().hydrated) return;
    await new Promise<void>((resolve) => {
        const unsubscribe = useCanvasStore.subscribe((state) => {
            if (!state.hydrated) return;
            unsubscribe();
            resolve();
        });
    });
}

function scheduleCloudUpsert(ownerId: string, project: CanvasProject, delay = 800) {
    const key = `${ownerId}:${project.id}`;
    const current = cloudTimers.get(key);
    if (current) clearTimeout(current);
    markCloudPending(ownerId);
    cloudTimers.set(key, setTimeout(() => {
        cloudTimers.delete(key);
        queueCloudTask(ownerId, project.id, async () => {
            const remote = await uploadCanvasProject(project);
            if (!remote || useCanvasStore.getState().ownerId !== ownerId) return;
            const local = useCanvasStore.getState().projects.find((item) => item.id === project.id);
            if (local && Date.parse(remote.updatedAt) > Date.parse(local.updatedAt)) {
                useCanvasStore.setState((state) => ({ projects: state.projects.map((item) => item.id === remote.id ? remote : item) }));
                dispatchRemoteUpdate({ projectId: remote.id, project: remote });
            }
        });
    }, delay));
}

function queueCloudDelete(ownerId: string, project: DeletedCanvasProject) {
    const key = `${ownerId}:${project.id}`;
    const timer = cloudTimers.get(key);
    if (timer) clearTimeout(timer);
    cloudTimers.delete(key);
    markCloudPending(ownerId);
    queueCloudTask(ownerId, project.id, async () => { await removeCanvasProjectFromCloud(project); });
}

function queueCloudTask(ownerId: string, projectId: string, task: () => Promise<void>) {
    const key = `${ownerId}:${projectId}`;
    const previous = cloudQueue.get(key) || Promise.resolve();
    const next = previous
        .catch(() => undefined)
        .then(async () => {
            if (useCanvasStore.getState().ownerId !== ownerId) return;
            await task();
            if (useCanvasStore.getState().ownerId === ownerId) useCanvasStore.setState({ syncError: "" });
        })
        .catch((error) => {
            if (useCanvasStore.getState().ownerId === ownerId) useCanvasStore.setState({ syncError: errorMessage(error, "画布保存失败") });
        })
        .finally(() => {
            if (cloudQueue.get(key) === next) cloudQueue.delete(key);
            refreshCloudPending(ownerId);
        });
    cloudQueue.set(key, next);
    return next;
}

function clearCloudTimers() {
    cloudTimers.forEach(clearTimeout);
    cloudTimers.clear();
}

function markCloudPending(ownerId: string) {
    if (useCanvasStore.getState().ownerId === ownerId) useCanvasStore.setState({ syncing: true });
}

function refreshCloudPending(ownerId: string) {
    if (useCanvasStore.getState().ownerId !== ownerId) return;
    const prefix = `${ownerId}:`;
    const pending = [...cloudTimers.keys(), ...cloudQueue.keys()].some((key) => key.startsWith(prefix));
    useCanvasStore.setState({ syncing: pending });
}

function projectHasPending(ownerId: string, projectId: string) {
    const key = `${ownerId}:${projectId}`;
    return cloudTimers.has(key) || cloudQueue.has(key);
}

function dispatchRemoteUpdate(detail: CanvasRemoteUpdateDetail) {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<CanvasRemoteUpdateDetail>(CANVAS_REMOTE_UPDATE_EVENT, { detail }));
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}
