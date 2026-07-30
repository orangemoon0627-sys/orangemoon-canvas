import { create } from "zustand";

import { MANAGED_CANVAS_AGENT_URL } from "@/constant/runtime-config";
import type { CanvasAgentOp, CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";

export type AgentChatRole = "user" | "assistant" | "system" | "tool" | "error";
export type AgentAttachment = { id: string; name: string; type: string; size: number; width: number; height: number; url: string; dataUrl: string };
export type AgentChatItem = { id: string; role: AgentChatRole; title?: string; text: string; meta?: string; detail?: unknown; attachments?: AgentAttachment[]; streamId?: string };
export type AgentEventLog = { id: string; time: string; title: string; text: string; raw?: unknown };
export type AgentPendingToolCall = { requestId: string; name: string; projectId?: string; input?: { ops?: CanvasAgentOp[]; path?: string } & Record<string, unknown> };
export type AgentCanvasContext = { snapshot: CanvasAgentSnapshot; applyOps: (ops?: CanvasAgentOp[]) => CanvasAgentSnapshot; undoOps: () => CanvasAgentSnapshot | null; canUndo: boolean };
export type AgentThreadSummary = { id: string; preview: string; name?: string | null; cwd?: string; status?: string; source?: unknown; createdAt?: number; updatedAt?: number };
export type AgentPanelTab = "chat" | "setup" | "history" | "log";
export type AgentCreativeMode = "vibe" | "direct";

const CONNECT_TIMEOUT_MS = 6000;
let agentSource: EventSource | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
const MANAGED_AGENT_TOKEN = "platform-session";

function initialAgentPanelWidth() {
    if (typeof window === "undefined") return 440;
    const stored = Number(localStorage.getItem("canvas-agent-panel-width"));
    if (stored) return Math.min(760, Math.max(360, stored));
    return window.innerWidth < 1180 ? 380 : 440;
}

function initialAgentPanelOpen() {
    return typeof window !== "undefined" && window.innerWidth >= 1024;
}

type AgentStore = {
    width: number;
    panelOpen: boolean;
    panelMounted: boolean;
    panelClosing: boolean;
    canvasContext: AgentCanvasContext | null;
    url: string;
    token: string;
    connected: boolean;
    enabled: boolean;
    silentConnect: boolean;
    prompt: string;
    attachments: AgentAttachment[];
    sending: boolean;
    waiting: boolean;
    messages: AgentChatItem[];
    eventLogs: AgentEventLog[];
    threads: AgentThreadSummary[];
    activeThreadId: string;
    workspacePath: string;
    loadingThreads: boolean;
    activeTab: AgentPanelTab;
    creativeMode: AgentCreativeMode;
    confirmTools: boolean;
    activity: string;
    connectError: string;
    pendingTool: AgentPendingToolCall | null;
    setAgentState: (patch: Partial<Omit<AgentStore, "setAgentState" | "connectAgent" | "disconnectAgent" | "addMessage" | "addEventLog" | "clearEventLogs" | "openPanel" | "closePanel" | "togglePanel" | "setCanvasContext">>) => void;
    openPanel: () => void;
    closePanel: () => void;
    togglePanel: () => void;
    setCanvasContext: (context: AgentCanvasContext | null) => void;
    connectAgent: (options?: { silent?: boolean }) => void;
    disconnectAgent: (patch?: Partial<Omit<AgentStore, "setAgentState" | "connectAgent" | "disconnectAgent" | "addMessage" | "addEventLog" | "clearEventLogs" | "openPanel" | "closePanel" | "togglePanel" | "setCanvasContext">>) => void;
    addMessage: (item: AgentChatItem) => void;
    addEventLog: (item: AgentEventLog) => void;
    clearEventLogs: () => void;
};

export const CANVAS_AGENT_PANEL_MOTION_MS = 500;
const INITIAL_AGENT_PANEL_OPEN = initialAgentPanelOpen();

export const useAgentStore = create<AgentStore>((set, get) => ({
    width: initialAgentPanelWidth(),
    panelOpen: INITIAL_AGENT_PANEL_OPEN,
    panelMounted: INITIAL_AGENT_PANEL_OPEN,
    panelClosing: false,
    canvasContext: null,
    url: MANAGED_CANVAS_AGENT_URL || (typeof window === "undefined" ? "http://127.0.0.1:17371" : localStorage.getItem("canvas-agent-url") || "http://127.0.0.1:17371"),
    token: MANAGED_CANVAS_AGENT_URL ? MANAGED_AGENT_TOKEN : typeof window === "undefined" ? "" : localStorage.getItem("canvas-agent-token") || "",
    connected: false,
    enabled: Boolean(MANAGED_CANVAS_AGENT_URL),
    silentConnect: false,
    prompt: "",
    attachments: [],
    sending: false,
    waiting: false,
    messages: [],
    eventLogs: [],
    threads: [],
    activeThreadId: "",
    workspacePath: "",
    loadingThreads: false,
    activeTab: "chat",
    creativeMode: typeof window === "undefined" ? "vibe" : localStorage.getItem("canvas-agent-creative-mode") === "direct" ? "direct" : "vibe",
    confirmTools: true,
    activity: "就绪",
    connectError: "",
    pendingTool: null,
    setAgentState: (patch) => set(patch),
    openPanel: () => set({ panelOpen: true, panelMounted: true, panelClosing: false }),
    closePanel: () => {
        if (!get().panelMounted || get().panelClosing) return;
        set({ panelOpen: false, panelClosing: true });
        setTimeout(() => {
            if (get().panelClosing) set({ panelMounted: false, panelClosing: false });
        }, CANVAS_AGENT_PANEL_MOTION_MS);
    },
    togglePanel: () => (get().panelOpen ? get().closePanel() : get().openPanel()),
    setCanvasContext: (canvasContext) => set({ canvasContext }),
    connectAgent: (options) => {
        const silent = options?.silent ?? false;
        const endpoint = (MANAGED_CANVAS_AGENT_URL || get().url).trim().replace(/\/$/, "");
        const token = MANAGED_CANVAS_AGENT_URL ? MANAGED_AGENT_TOKEN : get().token.trim();
        if (!endpoint || !token) return set({ connectError: silent ? "" : "请填写 Local URL 和 Connect token" });
        try {
            const parsed = new URL(endpoint, typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin);
            if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
        } catch {
            return set({ connectError: silent ? "" : "Local URL 格式不正确" });
        }
        if (!MANAGED_CANVAS_AGENT_URL) {
            localStorage.setItem("canvas-agent-url", endpoint);
            localStorage.setItem("canvas-agent-token", token);
        }
        // 只设 enabled=true，由 CanvasLocalAgentPanel 的 useEffect 统一负责开 SSE
        set({ url: endpoint, token, enabled: true, silentConnect: silent, activity: "连接中", connectError: "" });
    },
    disconnectAgent: (patch = {}) => {
        agentSource?.close();
        agentSource = null;
        if (connectTimer) clearTimeout(connectTimer);
        connectTimer = null;
        set({ enabled: false, connected: false, silentConnect: false, activity: "离线", ...patch });
    },
    addMessage: (item) => set((state) => ({ messages: [...state.messages.slice(-120), item] })),
    addEventLog: (item) => set((state) => ({ eventLogs: [...state.eventLogs.slice(-160), item] })),
    clearEventLogs: () => set({ eventLogs: [] }),
}));
