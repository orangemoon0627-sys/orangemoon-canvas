import { create } from "zustand";

import { createWorkspace, fetchWorkspaces, type PlatformWorkspace } from "@/services/api/platform";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "@/services/workspace-session";

type WorkspaceState = {
    userId: string;
    workspaces: PlatformWorkspace[];
    activeWorkspaceId: string;
    loading: boolean;
    error: string;
    initialize: (userId: string, force?: boolean) => Promise<void>;
    refresh: () => Promise<void>;
    select: (workspaceId: string) => void;
    createTeam: (name: string) => Promise<PlatformWorkspace>;
    reset: () => void;
};

let initialization: Promise<void> | null = null;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
    userId: "",
    workspaces: [],
    activeWorkspaceId: "",
    loading: false,
    error: "",
    initialize: async (userId, force = false) => {
        if (!force && get().userId === userId && get().activeWorkspaceId) return;
        if (!initialization) {
            set({ loading: true, error: "" });
            initialization = fetchWorkspaces()
                .then(({ workspaces }) => {
                    const remembered = getActiveWorkspaceId();
                    const active = workspaces.find((workspace) => workspace.id === remembered) || workspaces.find((workspace) => workspace.kind === "PERSONAL") || workspaces[0];
                    if (!active) throw new Error("账户尚未分配创作空间");
                    setActiveWorkspaceId(active.id);
                    set({ userId, workspaces, activeWorkspaceId: active.id, loading: false, error: "" });
                })
                .catch((error) => {
                    set({ loading: false, error: error instanceof Error ? error.message : "空间加载失败" });
                    throw error;
                })
                .finally(() => { initialization = null; });
        }
        await initialization;
    },
    refresh: async () => {
        const userId = get().userId;
        if (!userId) return;
        await get().initialize(userId, true);
    },
    select: (workspaceId) => {
        if (!get().workspaces.some((workspace) => workspace.id === workspaceId)) return;
        setActiveWorkspaceId(workspaceId);
        set({ activeWorkspaceId: workspaceId, error: "" });
    },
    createTeam: async (name) => {
        const { workspace } = await createWorkspace(name);
        setActiveWorkspaceId(workspace.id);
        set((state) => ({ workspaces: [workspace, ...state.workspaces], activeWorkspaceId: workspace.id }));
        return workspace;
    },
    reset: () => {
        setActiveWorkspaceId("");
        set({ userId: "", workspaces: [], activeWorkspaceId: "", loading: false, error: "" });
    },
}));

export function activeWorkspace() {
    const state = useWorkspaceStore.getState();
    return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) || null;
}
