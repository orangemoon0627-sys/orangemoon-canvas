import { CanvasNodeType, type CanvasAssistantSession, type CanvasNodeData } from "@/types/canvas";
import type { CanvasProject, DeletedCanvasProject } from "@/stores/canvas/use-canvas-store";
import { deleteCanvasProject, fetchCanvasProjects, type PlatformCanvasProject, upsertCanvasProject } from "@/services/api/platform";
import { ensureAccountMediaUploaded } from "@/services/account-media";
import { collectMediaStorageKeys, getMediaBlob, uploadMediaFile } from "@/services/file-storage";
import { getImageBlob, uploadImage } from "@/services/image-storage";

export async function fetchAndMergeCanvasProjects(localProjects: CanvasProject[], localDeletedProjects: DeletedCanvasProject[]) {
    const remote = await fetchCanvasProjects();
    return mergeCanvasProjects(remote.projects.map(platformCanvasProjectToLocal), remote.deletedProjects.map(platformCanvasProjectToDeleted), localProjects, localDeletedProjects);
}

export async function uploadCanvasProject(project: CanvasProject) {
    await ensureProjectMediaUploaded(project);
    const result = await upsertCanvasProject(project.id, {
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        data: portableProjectData(project),
    });
    return result.project.deletedAt ? null : platformCanvasProjectToLocal(result.project);
}

export function removeCanvasProjectFromCloud(project: DeletedCanvasProject) {
    return deleteCanvasProject(project.id, project.deletedAt);
}

export async function normalizeLegacyProjectMedia(project: CanvasProject): Promise<CanvasProject> {
    const nodes = await Promise.all(project.nodes.map(normalizeNodeMedia));
    const chatSessions = await Promise.all(project.chatSessions.map(normalizeSessionMedia));
    return nodes === project.nodes && chatSessions === project.chatSessions ? project : { ...project, nodes, chatSessions };
}

export function mergeCanvasProjects(remoteProjects: CanvasProject[], remoteDeletedProjects: DeletedCanvasProject[], localProjects: CanvasProject[], localDeletedProjects: DeletedCanvasProject[]) {
    type Candidate = { kind: "project"; project: CanvasProject; source: "remote" | "local" } | { kind: "deleted"; project: DeletedCanvasProject; source: "remote" | "local" };
    const merged = new Map<string, Candidate>();
    const add = (candidate: Candidate) => {
        const id = candidate.project.id;
        const current = merged.get(id);
        const candidateTime = projectTime(candidate);
        const currentTime = current ? projectTime(current) : 0;
        if (!current || candidateTime > currentTime || (candidateTime === currentTime && candidate.kind === "deleted" && current.kind === "project")) merged.set(id, candidate);
    };
    remoteProjects.forEach((project) => add({ kind: "project", project, source: "remote" }));
    remoteDeletedProjects.forEach((project) => add({ kind: "deleted", project, source: "remote" }));
    localProjects.forEach((project) => add({ kind: "project", project, source: "local" }));
    localDeletedProjects.forEach((project) => add({ kind: "deleted", project, source: "local" }));

    const projects: CanvasProject[] = [];
    const deletedProjects: DeletedCanvasProject[] = [];
    const uploadProjects: CanvasProject[] = [];
    const uploadDeletions: DeletedCanvasProject[] = [];
    merged.forEach((candidate) => {
        if (candidate.kind === "project") {
            projects.push(candidate.project);
            if (candidate.source === "local") uploadProjects.push(candidate.project);
        } else {
            deletedProjects.push(candidate.project);
            if (candidate.source === "local") uploadDeletions.push(candidate.project);
        }
    });
    projects.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return { projects, deletedProjects, uploadProjects, uploadDeletions };
}

async function ensureProjectMediaUploaded(project: CanvasProject) {
    const keys = [...collectMediaStorageKeys(project)];
    const items = await Promise.all(keys.map(async (storageKey) => ({ storageKey, blob: storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey) })));
    const unresolved = await ensureAccountMediaUploaded(items);
    if (unresolved.length) throw new Error(`画布“${project.title}”有 ${unresolved.length} 个本地媒体文件缺失，已保留本地项目并等待恢复后重试`);
}

async function normalizeNodeMedia(node: CanvasNodeData): Promise<CanvasNodeData> {
    if (!node.metadata) return node;
    let metadata = node.metadata;
    const content = metadata.content || "";
    if (!metadata.storageKey && isLocalMediaUrl(content)) {
        try {
            const stored = node.type === CanvasNodeType.Image
                ? await uploadImage(content)
                : node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio
                  ? await uploadMediaFile(content, node.type)
                  : null;
            if (stored) metadata = { ...metadata, content: stored.url, storageKey: stored.storageKey, mimeType: stored.mimeType, bytes: stored.bytes };
        } catch {
            // Keep the original local project intact; sync will surface a missing-media error instead of discarding it.
        }
    }
    if (metadata.references?.length) {
        const references = await Promise.all(metadata.references.map(async (reference) => {
            if (!isLocalMediaUrl(reference)) return reference;
            try {
                return (await uploadImage(reference)).storageKey;
            } catch {
                return reference;
            }
        }));
        if (references.some((reference, index) => reference !== metadata.references?.[index])) metadata = { ...metadata, references };
    }
    return metadata === node.metadata ? node : { ...node, metadata };
}

async function normalizeSessionMedia(session: CanvasAssistantSession): Promise<CanvasAssistantSession> {
    let changed = false;
    const messages = await Promise.all(session.messages.map(async (message) => {
        if (!message.references?.length) return message;
        const references = await Promise.all(message.references.map(async (reference) => {
            if (reference.storageKey || !isLocalMediaUrl(reference.dataUrl || "")) return reference;
            try {
                const image = await uploadImage(reference.dataUrl || "");
                changed = true;
                return { ...reference, dataUrl: image.url, storageKey: image.storageKey };
            } catch {
                return reference;
            }
        }));
        return references === message.references ? message : { ...message, references };
    }));
    return changed ? { ...session, messages } : session;
}

export function portableProjectData(project: CanvasProject) {
    return portableValue({
        nodes: project.nodes,
        connections: project.connections,
        chatSessions: project.chatSessions,
        activeChatId: project.activeChatId,
        backgroundMode: project.backgroundMode,
        showImageInfo: project.showImageInfo,
        viewport: project.viewport,
    }) as Record<string, unknown>;
}

function portableValue(value: unknown, hasStoredMedia = false): unknown {
    if (typeof value === "string") {
        if (hasStoredMedia && isLocalMediaUrl(value)) return undefined;
        if (isLocalMediaUrl(value)) throw new Error("画布仍包含未完成存储的本地媒体，已保留本地项目并等待恢复后重试");
        return value;
    }
    if (Array.isArray(value)) return value.map((item) => portableValue(item, hasStoredMedia)).filter((item) => item !== undefined);
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    const objectHasStoredMedia = hasStoredMedia || (typeof record.storageKey === "string" && record.storageKey.length > 0);
    return Object.fromEntries(
        Object.entries(record)
            .map(([key, item]) => [key, portableValue(item, objectHasStoredMedia)] as const)
            .filter(([, item]) => item !== undefined),
    );
}

function platformCanvasProjectToLocal(project: PlatformCanvasProject): CanvasProject {
    const data = project.data || {};
    return {
        id: project.id,
        title: project.title || "未命名画布",
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        nodes: arrayValue<CanvasNodeData>(data.nodes),
        connections: arrayValue(data.connections),
        chatSessions: arrayValue<CanvasAssistantSession>(data.chatSessions),
        activeChatId: typeof data.activeChatId === "string" ? data.activeChatId : null,
        backgroundMode: data.backgroundMode === "dots" || data.backgroundMode === "blank" ? data.backgroundMode : "lines",
        showImageInfo: data.showImageInfo === true,
        viewport: isViewport(data.viewport) ? data.viewport : { x: 0, y: 0, k: 1 },
    };
}

function platformCanvasProjectToDeleted(project: PlatformCanvasProject): DeletedCanvasProject {
    return { id: project.id, deletedAt: project.deletedAt || project.updatedAt };
}

function projectTime(candidate: { kind: "project"; project: CanvasProject } | { kind: "deleted"; project: DeletedCanvasProject }) {
    return Date.parse(candidate.kind === "project" ? candidate.project.updatedAt : candidate.project.deletedAt) || 0;
}

function arrayValue<T>(value: unknown) {
    return Array.isArray(value) ? value as T[] : [];
}

function isViewport(value: unknown): value is CanvasProject["viewport"] {
    if (!value || typeof value !== "object") return false;
    const viewport = value as Record<string, unknown>;
    return [viewport.x, viewport.y, viewport.k].every((item) => typeof item === "number" && Number.isFinite(item));
}

function isLocalMediaUrl(value: string) {
    return /^(?:blob:|data:(?:image|video|audio)\/)/i.test(value);
}
