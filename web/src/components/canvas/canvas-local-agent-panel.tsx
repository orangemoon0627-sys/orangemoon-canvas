import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Button, Input, Segmented, Tooltip } from "antd";
import copyToClipboard from "copy-to-clipboard";
import { ChevronDown, Copy, FolderOpen, History, KeyRound, Link2, LoaderCircle, MousePointer2, PlugZap, Plus, RefreshCw, Sparkles, Square, Terminal, Trash2 } from "lucide-react";

import { MANAGED_CANVAS_AGENT_MODEL, MANAGED_CANVAS_AGENT_URL } from "@/constant/runtime-config";
import { RechargeModal } from "@/components/account/recharge-modal";
import { canvasThemes } from "@/lib/canvas-theme";
import { imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { readImageMeta } from "@/lib/image-utils";
import { randomId } from "@/lib/utils";
import { canonicalOrangeMoonVideoModel } from "@/lib/orange-moon-provider";
import { uploadImage } from "@/services/image-storage";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { useShallow } from "zustand/react/shallow";
import { useAgentStore, type AgentAttachment, type AgentCanvasContext, type AgentChatItem, type AgentCreativeMode, type AgentEventLog, type AgentPanelTab, type AgentPendingToolCall, type AgentThreadSummary } from "@/stores/use-agent-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { modelOptionName, useEffectiveConfig } from "@/stores/use-config-store";
import { summarizeCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import { isSiteTool, runSiteTool, SITE_TOOL_LABELS } from "@/lib/agent/agent-site-tools";
import { buildAgentGenerationPlan, generationQuoteItems, synchronizeAgentGenerationOps, updateAgentGenerationOps } from "@/lib/agent/agent-generation-plan";
import { buildAgentWorkflowPreview } from "@/lib/agent/agent-workflow-preview";
import { fetchProviderCatalog, quoteProviderBundle, type ProviderBundleQuote, type ProviderCatalog } from "@/services/api/platform";
import { AgentChatComposer, AgentChatMessage, AgentPanelTabs, AgentPendingToolCard, AgentWorkingMessage, type AgentGenerationReview, type CanvasAgentChatAttachment } from "./canvas-agent-chat-ui";

const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_PAYLOAD_BYTES = 28 * 1024 * 1024;
const SCROLL_BOTTOM_THRESHOLD = 48;
const AGENT_REQUEST_TIMEOUT_MS = 12_000;
const MANAGED_AGENT = Boolean(MANAGED_CANVAS_AGENT_URL);
const DEFAULT_AGENT_URL = MANAGED_CANVAS_AGENT_URL || "http://127.0.0.1:17371";
const AGENT_ASSISTANT_TITLE = MANAGED_CANVAS_AGENT_MODEL ? "Terra" : "Codex";
const VIBE_STARTERS = ["做一支 25 秒的中国神话斗法短片", "把参考图改成三镜头电影预告", "生成商品主视觉和竖屏广告视频"];
const AGENT_CONNECT_STEPS = [
    { title: "方式一：在 Codex 中使用插件", text: "在 Codex app 安装橙月画布兼容的 Infinite Canvas 插件后，插件会自动启动本地 Agent 并带上连接信息。" },
    { title: "方式二：直接运行 Agent", text: "不使用 Codex 插件时，在终端运行下面命令，再回到网页里连接或手动填入 Local URL 和 Connect token。", command: "npx -y @basketikun/canvas-agent" },
];
const AGENT_PLUGIN_REMOVE_COMMAND = "codex plugin remove infinite-canvas";
const AGENT_MCP_REMOVE_COMMAND = "codex mcp remove infinite-canvas";

type AgentEventPayload = {
    agent?: string;
    type?: string;
    threadId?: string;
    thread_id?: string;
    turn_id?: string;
    item?: AgentEventItem;
    error?: { message?: string };
    message?: string;
    usage?: Record<string, unknown>;
    chargedCredits?: string;
    chargedMilliCredits?: string;
    reservedCredits?: string;
};
type AgentEventItem = { id?: string; type?: string; text?: unknown; message?: unknown; server?: string; tool?: string; status?: string; arguments?: unknown; result?: unknown; error?: { message?: string } };

type AgentLogContext = { endpoint: string; connected: boolean; enabled: boolean; activity: string; waiting: boolean; sending: boolean; messages: number; pendingTool?: string };
type AgentWorkspace = { workspacePath: string; activeThreadId?: string };
type AgentThreadsResponse = { ok?: boolean; workspace?: AgentWorkspace; data?: AgentThreadSummary[] };
type AgentThreadResponse = { ok?: boolean; workspace?: AgentWorkspace; thread?: AgentThreadSummary; messages?: AgentChatItem[] };
type AgentConfigResponse = { ok?: boolean; url?: string; token?: string; hasToken?: boolean };
type AgentCodexState = { busy?: boolean; threadId?: string; turnId?: string };
type AgentHelloEvent = { ok?: boolean; clientId?: string; codex?: AgentCodexState };
type AgentWorkspaceEvent = { activeThreadId?: string; threadId?: string; emptyThread?: boolean; projectId?: string };
type AgentChatEvent = { threadId?: string; sourceClientId?: string; message?: AgentChatItem };

export function CanvasLocalAgentPanel({ embedded, headless, autoConnect, compact }: { embedded?: boolean; headless?: boolean; autoConnect?: boolean; compact?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const user = useUserStore((state) => state.user);
    const platformUser = useAuthStore((state) => state.user);
    const effectiveConfig = useEffectiveConfig();
    const { message, modal } = App.useApp();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    // 逐字段 selector + useShallow：只有这些字段变化时才重渲染。
    // 注意：canvasContext 不在此订阅内 —— 它在拖拽/resize 时会被 project 每帧写入，
    // 但面板只在 ref 同步与防抖 postState 中用到它、渲染层从不读它。若把它放进订阅，
    // 面板会随画布每帧重渲染（性能问题，也是 #185 崩溃的放大器）。改为下方 subscribe 命令式监听。
    const { width, url, token, connected, enabled, prompt, attachments, sending, waiting, messages, eventLogs, threads, activeThreadId, workspacePath, loadingThreads, activeTab, creativeMode, confirmTools, activity, connectError, pendingTool } =
        useAgentStore(
            useShallow((state) => ({
                width: state.width,
                url: state.url,
                token: state.token,
                connected: state.connected,
                enabled: state.enabled,
                prompt: state.prompt,
                attachments: state.attachments,
                sending: state.sending,
                waiting: state.waiting,
                messages: state.messages,
                eventLogs: state.eventLogs,
                threads: state.threads,
                activeThreadId: state.activeThreadId,
                workspacePath: state.workspacePath,
                loadingThreads: state.loadingThreads,
                activeTab: state.activeTab,
                creativeMode: state.creativeMode,
                confirmTools: state.confirmTools,
                activity: state.activity,
                connectError: state.connectError,
                pendingTool: state.pendingTool,
            })),
        );
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const pushMessage = useAgentStore((state) => state.addMessage);
    const pushEventLog = useAgentStore((state) => state.addEventLog);
    const clearEventLogs = useAgentStore((state) => state.clearEventLogs);
    const refreshWallet = useAuthStore((state) => state.refreshWallet);
    const listRef = useRef<HTMLDivElement>(null);
    const followMessagesRef = useRef(true);
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);
    const [historyLoadError, setHistoryLoadError] = useState("");
    const [providerCatalog, setProviderCatalog] = useState<ProviderCatalog | null>(null);
    const [catalogError, setCatalogError] = useState("");
    const [generationQuote, setGenerationQuote] = useState<ProviderBundleQuote | null>(null);
    const [generationQuoteLoading, setGenerationQuoteLoading] = useState(false);
    const [generationQuoteError, setGenerationQuoteError] = useState("");
    const [approvalLoading, setApprovalLoading] = useState(false);
    const [rechargeOpen, setRechargeOpen] = useState(false);
    const canvasContextRef = useRef<AgentCanvasContext | null>(useAgentStore.getState().canvasContext);
    const activeProjectIdRef = useRef(canvasContextRef.current?.snapshot.projectId || "default");
    const confirmToolsRef = useRef(confirmTools);
    const pendingToolRef = useRef<AgentPendingToolCall | null>(null);
    const autoConnectRef = useRef(false);
    const connectedRef = useRef(false);
    const errorLoggedRef = useRef(false);
    const attachmentUrlsRef = useRef(new Set<string>());
    const clientIdRef = useRef(randomId());
    const loadThreadsSequenceRef = useRef(0);
    const quoteSequenceRef = useRef(0);
    const endpoint = useMemo(() => url.trim().replace(/\/$/, ""), [url]);
    const generationPlan = useMemo(
        () =>
            buildAgentGenerationPlan(pendingTool?.input?.ops, canvasContextRef.current?.snapshot, {
                imageModel: modelOptionName(effectiveConfig.imageModel),
                videoModel: modelOptionName(effectiveConfig.videoModel),
                audioModel: modelOptionName(effectiveConfig.audioModel),
                imageSize: effectiveConfig.size || "1:1",
                imageQuality: effectiveConfig.quality || "auto",
                imageCount: Number(effectiveConfig.canvasImageCount || effectiveConfig.count) || 1,
                videoSize: effectiveConfig.size || "16:9",
                videoSeconds: Number(effectiveConfig.videoSeconds) || 5,
                videoResolution: effectiveConfig.vquality || "720",
            }),
        [effectiveConfig.audioModel, effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.quality, effectiveConfig.size, effectiveConfig.videoModel, effectiveConfig.videoSeconds, effectiveConfig.vquality, pendingTool],
    );
    const reviewGenerationPlan = useMemo(() => normalizeGenerationPlan(generationPlan, providerCatalog), [generationPlan, providerCatalog]);
    const billableQuoteItems = useMemo(() => officialQuoteItems(reviewGenerationPlan, providerCatalog), [providerCatalog, reviewGenerationPlan]);
    const pricingCoverageError = providerCatalog && reviewGenerationPlan.length !== billableQuoteItems.length ? "有生成任务未匹配官方计价模型，请重新选择模型后再执行" : "";
    const walletCredits = platformUser?.wallet?.availableCredits || "0";
    const insufficientCredits = Boolean(generationQuote && BigInt(generationQuote.totalMilliCredits) > BigInt(platformUser?.wallet?.availableMilliCredits || "0"));
    const loadThreads = useCallback(
        async (skipHistory = false) => {
            if (!connectedRef.current) return false;
            const sequence = ++loadThreadsSequenceRef.current;
            setAgentState({ loadingThreads: true });
            setHistoryLoadError("");
            try {
                const projectId = currentAgentProjectId(canvasContextRef.current);
                const data = await fetchAgentJson<AgentThreadsResponse>(endpoint, token, `/agent/codex/threads?projectId=${encodeURIComponent(projectId)}`);
                const nextThreadId = data.workspace?.activeThreadId || "";
                let nextMessages: AgentChatItem[] = [];
                if (nextThreadId && !skipHistory) {
                    const thread = await fetchAgentJson<AgentThreadResponse>(endpoint, token, `/agent/codex/threads/${encodeURIComponent(nextThreadId)}?projectId=${encodeURIComponent(projectId)}`);
                    nextMessages = normalizeHistoryMessages(thread.messages || []);
                }
                if (sequence !== loadThreadsSequenceRef.current || projectId !== currentAgentProjectId(canvasContextRef.current)) return false;
                const messages = nextThreadId ? nextMessages : useAgentStore.getState().messages;
                setAgentState({ threads: data.data || [], workspacePath: data.workspace?.workspacePath || "", activeThreadId: nextThreadId, messages });
                return true;
            } catch (error) {
                addEventLog("读取历史失败", error);
                if (sequence === loadThreadsSequenceRef.current) setHistoryLoadError(error instanceof Error ? error.message : "对话同步失败");
                return false;
            } finally {
                if (sequence === loadThreadsSequenceRef.current) setAgentState({ loadingThreads: false });
            }
        },
        [endpoint, setAgentState, token],
    );

    // canvasContext 命令式订阅：保持 ref 最新，并在快照变化时防抖上报，全程不触发面板重渲染。
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const unsubscribe = useAgentStore.subscribe((state) => {
            if (state.canvasContext === canvasContextRef.current) return;
            canvasContextRef.current = state.canvasContext;
            const projectId = currentAgentProjectId(state.canvasContext);
            if (projectId !== activeProjectIdRef.current) {
                activeProjectIdRef.current = projectId;
                pendingToolRef.current = null;
                setAgentState({ messages: [], threads: [], activeThreadId: "", pendingTool: null });
                if (useAgentStore.getState().connected) void loadThreads();
            }
            if (!useAgentStore.getState().connected) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void postState(endpoint, token, clientIdRef.current, canvasContextRef.current?.snapshot || null), 300);
        });
        return () => {
            unsubscribe();
            if (timer) clearTimeout(timer);
        };
    }, [endpoint, loadThreads, setAgentState, token]);
    useEffect(() => {
        confirmToolsRef.current = confirmTools;
    }, [confirmTools]);
    useEffect(() => {
        pendingToolRef.current = pendingTool;
    }, [pendingTool]);
    const updateScrollState = useCallback(() => {
        const list = listRef.current;
        if (!list) return;
        const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= SCROLL_BOTTOM_THRESHOLD;
        followMessagesRef.current = atBottom;
        setShowScrollToBottom(!atBottom);
    }, []);
    const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
        const list = listRef.current;
        if (!list) return;
        followMessagesRef.current = true;
        list.scrollTo({ top: list.scrollHeight, behavior });
        setShowScrollToBottom(false);
    }, []);
    useEffect(() => {
        if (activeTab !== "chat") return;
        const frame = requestAnimationFrame(() => scrollToBottom("auto"));
        return () => cancelAnimationFrame(frame);
    }, [activeTab, activeThreadId, scrollToBottom]);
    useEffect(() => {
        if (activeTab !== "chat") return;
        const frame = requestAnimationFrame(() => (followMessagesRef.current ? scrollToBottom("auto") : updateScrollState()));
        return () => cancelAnimationFrame(frame);
    }, [activeTab, messages, pendingTool, scrollToBottom, updateScrollState, waiting]);
    useEffect(() => () => attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

    useEffect(() => {
        if (!MANAGED_AGENT || (!sending && !waiting)) return;
        const refresh = () => void refreshWallet().catch(() => undefined);
        refresh();
        const timer = window.setInterval(refresh, 1500);
        return () => {
            window.clearInterval(timer);
            refresh();
        };
    }, [refreshWallet, sending, waiting]);

    useEffect(() => {
        let active = true;
        void fetchProviderCatalog()
            .then((catalog) => {
                if (!active) return;
                setProviderCatalog(catalog);
                setCatalogError("");
            })
            .catch((error) => {
                if (active) setCatalogError(error instanceof Error ? error.message : "模型价格目录读取失败");
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const sequence = ++quoteSequenceRef.current;
        setGenerationQuoteError("");
        if (!generationPlan.length) {
            setGenerationQuote(null);
            setGenerationQuoteLoading(false);
            return;
        }
        if (!providerCatalog) {
            setGenerationQuoteLoading(!catalogError);
            return;
        }
        if (!billableQuoteItems.length || billableQuoteItems.length !== reviewGenerationPlan.length) {
            setGenerationQuote(null);
            setGenerationQuoteLoading(false);
            return;
        }
        setGenerationQuoteLoading(true);
        const timer = window.setTimeout(() => {
            void quoteProviderBundle(billableQuoteItems)
                .then((quote) => {
                    if (sequence === quoteSequenceRef.current) setGenerationQuote(quote);
                })
                .catch((error) => {
                    if (sequence === quoteSequenceRef.current) {
                        setGenerationQuote(null);
                        setGenerationQuoteError(error instanceof Error ? error.message : "积分预估失败");
                    }
                })
                .finally(() => {
                    if (sequence === quoteSequenceRef.current) setGenerationQuoteLoading(false);
                });
        }, 180);
        return () => window.clearTimeout(timer);
    }, [billableQuoteItems, catalogError, generationPlan.length, providerCatalog, reviewGenerationPlan.length]);

    useEffect(() => {
        if (!enabled || !token.trim()) return;
        connectedRef.current = false;
        setAgentState({ connected: false, activity: "连接中", connectError: "" });
        if (!MANAGED_AGENT) {
            localStorage.setItem("canvas-agent-url", endpoint);
            localStorage.setItem("canvas-agent-token", token);
        }
        const clientId = clientIdRef.current;
        let eventQueue = Promise.resolve();
        const enqueueEvent = (task: () => void | Promise<void>) => {
            eventQueue = eventQueue.then(task).catch((error) => addEventLog("同步会话失败", error));
        };
        const source = new EventSource(`${endpoint}/events?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`, { withCredentials: true });
        source.addEventListener("hello", (event) => {
            const busy = Boolean(parseEventData<AgentHelloEvent>(event)?.codex?.busy);
            errorLoggedRef.current = false;
            connectedRef.current = true;
            setAgentState({
                connected: true,
                activity: busy ? "创作引擎正在运行" : "已连接",
                waiting: busy,
                sending: false,
                connectError: "",
                silentConnect: false,
                activeTab: "chat",
                loadingThreads: false,
                messages: useAgentStore.getState().messages.filter((item) => !isConnectionErrorMessage(item)),
            });
            if (!headless) message.success(MANAGED_AGENT ? `${AGENT_ASSISTANT_TITLE} 已连接` : "本地 Agent 已连接");
            void postState(endpoint, token, clientId, canvasContextRef.current?.snapshot || null).then(() => loadThreads());
            if (document.visibilityState === "visible" && document.hasFocus()) void activateAgentClient(endpoint, token, clientId);
        });
        source.addEventListener("codex_state", (event) => {
            const data = parseEventData<AgentCodexState>(event);
            if (!data) return;
            enqueueEvent(async () => {
                const busy = Boolean(data.busy);
                setAgentState({ activity: busy ? `${AGENT_ASSISTANT_TITLE} 正在运行` : "完成", waiting: busy, ...(busy ? {} : { sending: false }) });
                if (!busy) await loadThreads();
            });
        });
        source.addEventListener("tool_call", (event) => {
            const data = parseEventData<AgentPendingToolCall>(event);
            if (data) void handleToolCall(endpoint, token, data);
        });
        source.addEventListener("agent_event", (event) => {
            const data = parseEventData<AgentEventPayload>(event);
            if (data)
                enqueueEvent(() => {
                    if (isCurrentThreadEvent(data)) handleAgentEvent(data);
                });
        });
        source.addEventListener("workspace_changed", (event) => {
            const data = parseEventData<AgentWorkspaceEvent>(event);
            if (!data) return;
            enqueueEvent(async () => {
                if (data.projectId && data.projectId !== currentAgentProjectId(canvasContextRef.current)) return;
                const nextThreadId = data.activeThreadId ?? data.threadId ?? "";
                pendingToolRef.current = null;
                setAgentState({ activeThreadId: nextThreadId, messages: [], pendingTool: null });
                await loadThreads(data.emptyThread);
            });
        });
        source.addEventListener("chat_message", (event) => {
            const data = parseEventData<AgentChatEvent>(event);
            if (!data?.message) return;
            enqueueEvent(() => {
                if (!isCurrentThreadEvent(data)) return;
                addMessage(data.message!);
            });
        });
        source.addEventListener("agent_log", (event) => {
            const text = parseEventData<{ text?: unknown }>(event)?.text;
            addEventLog("日志", text, text);
        });
        source.addEventListener("agent_error", (event) => {
            const data = parseEventData<AgentEventPayload>(event);
            if (!data) return;
            enqueueEvent(() => {
                if (!isCurrentThreadEvent(data)) return;
                addMessage({ role: "error", title: "错误", text: normalizeText(data.message) });
                addEventLog("错误", data.message, data.message);
                void refreshWallet().catch(() => undefined);
            });
        });
        source.onerror = () => {
            const wasConnected = connectedRef.current;
            const silent = useAgentStore.getState().silentConnect && !wasConnected;
            const text = wasConnected ? `${MANAGED_AGENT ? "云端" : "本地"} Agent 连接失败或已断开` : MANAGED_AGENT ? "云端 Agent 暂时不可用" : "连接失败，请检查地址和 token";
            if (!errorLoggedRef.current || wasConnected) {
                addEventLog(wasConnected ? "连接断开" : "连接失败", { endpoint, error: text });
                if (!headless && !silent) message.error(text);
            }
            errorLoggedRef.current = true;
            connectedRef.current = false;
            clearAgentSession({ activity: wasConnected ? "连接断开" : "连接失败", connected: false, connectError: silent ? "" : text, silentConnect: false });
            if (!wasConnected) {
                source.close();
                setAgentState({ enabled: false });
            }
        };
        return () => {
            source.close();
            connectedRef.current = false;
            loadThreadsSequenceRef.current += 1;
            setAgentState({ connected: false, activity: useAgentStore.getState().enabled ? "连接中" : "离线" });
        };
    }, [enabled, endpoint, loadThreads, message, refreshWallet, setAgentState, token]);

    useEffect(() => {
        if (!connected) return;
        const activate = () => void activateAgentClient(endpoint, token, clientIdRef.current);
        const activateVisible = () => {
            if (document.visibilityState === "visible") activate();
        };
        window.addEventListener("focus", activate);
        document.addEventListener("visibilitychange", activateVisible);
        return () => {
            window.removeEventListener("focus", activate);
            document.removeEventListener("visibilitychange", activateVisible);
        };
    }, [connected, endpoint, token]);
    const sendPrompt = async () => {
        const text = prompt.trim();
        const files = attachments;
        const requestPrompt = promptWithAttachments(text, files);
        if (!connected || !connectedRef.current || !requestPrompt || sending || waiting) return;
        const context = canvasContextRef.current;
        const projectId = currentAgentProjectId(context);
        if (!context && /^\/canvas\/[^/]+/.test(window.location.pathname)) {
            addMessage({ role: "error", title: "画布未就绪", text: "当前画布还没有完成连接，请稍后重试。" });
            return;
        }
        if (attachmentPayloadBytes(files) > MAX_ATTACHMENT_PAYLOAD_BYTES) {
            addMessage({ role: "error", title: "图片过大", text: "图片附件超过 30MB，请删减后再发送。" });
            return;
        }
        if (useAgentStore.getState().loadingThreads || historyLoadError) {
            setAgentState({ activity: "同步当前画布对话" });
            if (!(await loadThreads())) {
                addMessage({ role: "error", title: "对话同步失败", text: "未能恢复这个画布的上下文，请点击重新同步后再发送。" });
                return;
            }
        }
        if (!(await postState(endpoint, token, clientIdRef.current, context?.snapshot || null))) {
            addMessage({ role: "error", title: "画布连接失败", text: "无法把当前画布状态同步给创作引擎，请重新连接后再试。" });
            return;
        }
        setAgentState({ activity: "发送中", sending: true });
        const messageId = createId();
        addMessage({ id: messageId, role: "user", text: text || "发送了图片", attachments: files });
        addEventLog("用户发送", { text, attachments: files.map(({ name, type, size }) => ({ name, type, size })) });
        try {
            const data = await fetchAgentJson<{ threadId?: string }>(endpoint, token, "/agent/codex/turn", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    prompt: requestPrompt,
                    messageText: text || `发送了 ${files.length} 张图片`,
                    messageId,
                    clientId: clientIdRef.current,
                    projectId,
                    threadId: useAgentStore.getState().activeThreadId || undefined,
                    creativeMode,
                    attachments: files.map(({ id, name, type, size, width, height, dataUrl }) => ({ id, name, type, size, width, height, dataUrl })),
                }),
            });
            if (data.threadId) setAgentState({ activeThreadId: data.threadId });
            addEventLog(`${MANAGED_AGENT ? "云端" : "本地"} Agent 已接收`, { threadId: data.threadId, model: MANAGED_CANVAS_AGENT_MODEL || undefined });
            files.forEach((item) => {
                URL.revokeObjectURL(item.url);
                attachmentUrlsRef.current.delete(item.url);
            });
            setAgentState({ prompt: "", attachments: [] });
        } catch (error) {
            const text = error instanceof Error ? error.message : "发送失败";
            const busy = text.includes("Codex 正在运行");
            setAgentState({ activity: busy ? "Codex 正在运行" : "发送失败" });
            addMessage({ role: "error", title: busy ? "任务仍在运行" : "发送失败", text });
            addEventLog("发送失败", error);
        } finally {
            setAgentState({ sending: false });
        }
    };

    const stopTurn = async () => {
        if (!connected || (!sending && !waiting)) return;
        setAgentState({ activity: "停止中" });
        try {
            await fetch(`${endpoint}/agent/codex/interrupt?token=${encodeURIComponent(token)}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: useAgentStore.getState().activeThreadId || undefined }) });
            addEventLog("用户停止", {});
        } catch {
            setAgentState({ activity: "停止失败" });
        }
    };

    const addAttachments = async (files: FileList | File[] | null) => {
        if (!files) return;
        const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
        const prev = useAgentStore.getState().attachments;
        try {
            const next = await Promise.all(
                images.slice(0, Math.max(0, MAX_ATTACHMENTS - prev.length)).map(async (file) => {
                    const dataUrl = await readDataUrl(file);
                    const meta = await readImageMeta(dataUrl);
                    const url = URL.createObjectURL(file);
                    attachmentUrlsRef.current.add(url);
                    return { id: createId(), name: file.name, type: file.type, size: file.size, width: meta.width, height: meta.height, url, dataUrl };
                }),
            );
            const merged = [...prev, ...next];
            if (attachmentPayloadBytes(merged) > MAX_ATTACHMENT_PAYLOAD_BYTES) {
                next.forEach((item) => {
                    URL.revokeObjectURL(item.url);
                    attachmentUrlsRef.current.delete(item.url);
                });
                addMessage({ role: "error", title: "图片过大", text: "图片附件最多约 30MB。" });
                return;
            }
            if (next.length) setAgentState({ attachments: merged });
        } catch (error) {
            addMessage({ role: "error", title: "图片读取失败", text: error instanceof Error ? error.message : "图片读取失败" });
        }
    };

    const removeAttachment = (id: string) => {
        const removed = attachments.find((item) => item.id === id);
        if (removed) {
            URL.revokeObjectURL(removed.url);
            attachmentUrlsRef.current.delete(removed.url);
        }
        setAgentState({ attachments: attachments.filter((item) => item.id !== id) });
    };

    const handleToolCall = async (endpoint: string, token: string, payload: AgentPendingToolCall) => {
        const currentProjectId = currentAgentProjectId(canvasContextRef.current);
        if ((payload.projectId && payload.projectId !== currentProjectId) || (currentProjectId !== "default" && isProjectEscapeTool(payload.name))) {
            const error = payload.projectId && payload.projectId !== currentProjectId ? `工具请求属于画布 ${payload.projectId}，当前画布是 ${currentProjectId}` : `当前对话已锁定画布 ${currentProjectId}，不允许自动跳转页面或改用独立工作台`;
            addEventLog("阻止跨画布操作", { ...payload, error });
            await postToolResult(endpoint, token, clientIdRef.current, { requestId: payload.requestId, error });
            return;
        }
        if (confirmToolsRef.current && isCanvasWriteTool(payload.name)) {
            if (pendingToolRef.current) {
                await postToolResult(endpoint, token, clientIdRef.current, { requestId: payload.requestId, error: "仍有待确认的画布工具调用" });
                return;
            }
            pendingToolRef.current = payload;
            setAgentState({ pendingTool: payload });
            addEventLog("等待确认", payload, payload);
            await postToolResult(endpoint, token, clientIdRef.current, {
                requestId: payload.requestId,
                result: {
                    ok: true,
                    status: "awaiting_user_approval",
                    message: "方案已显示在右侧等待用户审核。不要重复提交或假设已经执行；当前回合应在这里结束。",
                },
            });
            return;
        }
        await runToolCall(endpoint, token, payload);
    };

    const runToolCall = async (endpoint: string, token: string, payload: AgentPendingToolCall) => {
        if (isSiteTool(payload.name)) {
            try {
                addEventLog(toolName(payload.name), payload, payload);
                const result = await runSiteTool(payload.name, payload.input || {}, navigate, { canvasSnapshot: canvasContextRef.current?.snapshot || null });
                await postToolResult(endpoint, token, clientIdRef.current, { requestId: payload.requestId, result });
                addEventLog(`${toolName(payload.name)}完成`, result, result);
                addMessage({ role: "tool", title: `${toolName(payload.name)}完成`, text: siteToolSummary(payload.name, result), detail: { requestId: payload.requestId, name: payload.name, input: payload.input, result } });
            } catch (error) {
                const message = error instanceof Error ? error.message : "工具执行失败";
                addMessage({ role: "tool", title: "工具失败", text: message, detail: payload });
                await postToolResult(endpoint, token, clientIdRef.current, { requestId: payload.requestId, error: message });
            }
            return;
        }
        try {
            const input: { ops?: CanvasAgentOp[]; path?: string } = payload.input || {};
            addEventLog(toolName(payload.name), payload, payload);
            let result: unknown;
            let appliedOps = input.ops || [];
            if (payload.name === "site_navigate") {
                const path = input.path || "/";
                navigate(path);
                result = { ok: true, path };
            } else if (payload.name === "canvas_apply_ops") {
                const context = canvasContextRef.current;
                if (!context) throw new Error("当前不在画布页，请先用 site_navigate 打开画布");
                result = context.applyOps(appliedOps);
                void postState(endpoint, token, clientIdRef.current, result as CanvasAgentSnapshot);
            } else if (payload.name === "canvas_create_attachment_nodes") {
                const context = canvasContextRef.current;
                if (!context) throw new Error("当前不在画布页，请先用 site_navigate 打开画布");
                appliedOps = await attachmentNodeOps(endpoint, token, clientIdRef.current, payload.input?.nodes);
                result = context.applyOps(appliedOps);
                await postState(endpoint, token, clientIdRef.current, result as CanvasAgentSnapshot);
            } else {
                const snapshot = canvasContextRef.current?.snapshot;
                if (!snapshot) throw new Error("当前不在画布页，请先用 site_navigate 打开画布");
                result = snapshot;
            }
            await postToolResult(endpoint, token, clientIdRef.current, { requestId: payload.requestId, result });
            addEventLog(`${toolName(payload.name)}完成`, result, result);
            addMessage({
                role: "tool",
                title: `${toolName(payload.name)}完成`,
                text: appliedOps.length ? summarizeCanvasAgentOps(appliedOps) || "画布操作" : payload.name === "site_navigate" ? `已跳转到 ${input.path || "/"}` : "已完成",
                detail: { requestId: payload.requestId, name: payload.name, input, result },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "画布操作失败";
            addMessage({ role: "tool", title: "工具失败", text: message, detail: payload });
            await postToolResult(endpoint, token, clientIdRef.current, { requestId: payload.requestId, error: message });
        }
    };

    const rejectPendingTool = async () => {
        if (!pendingTool) return;
        await postToolResult(endpoint, token, clientIdRef.current, { requestId: pendingTool.requestId, error: "用户取消了画布工具调用" });
        addMessage({ role: "tool", title: "拒绝执行", text: toolName(pendingTool.name), detail: { requestId: pendingTool.requestId, name: pendingTool.name, input: pendingTool.input } });
        pendingToolRef.current = null;
        setAgentState({ pendingTool: null });
    };

    const updatePendingGenerationConfig = (nodeId: string, patch: Parameters<AgentGenerationReview["onChange"]>[1]) => {
        const tool = pendingToolRef.current;
        if (!tool?.input?.ops) return;
        const nextTool = { ...tool, input: { ...tool.input, ops: updateAgentGenerationOps(tool.input.ops, nodeId, patch) } };
        pendingToolRef.current = nextTool;
        setGenerationQuoteError("");
        setAgentState({ pendingTool: nextTool });
    };

    const approvePendingTool = async () => {
        const tool = pendingToolRef.current || pendingTool;
        if (!tool || approvalLoading) return;
        const currentProjectId = currentAgentProjectId(canvasContextRef.current);
        if (tool.projectId && tool.projectId !== currentProjectId) {
            setGenerationQuoteError(`当前已经切换到画布 ${currentProjectId}，原方案不会执行`);
            return;
        }
        setApprovalLoading(true);
        try {
            let catalog = providerCatalog;
            if (generationPlan.length && !catalog) {
                catalog = await fetchProviderCatalog();
                setProviderCatalog(catalog);
                setCatalogError("");
            }
            const latestRawPlan = buildAgentGenerationPlan(tool.input?.ops, canvasContextRef.current?.snapshot, {
                imageModel: modelOptionName(effectiveConfig.imageModel),
                videoModel: modelOptionName(effectiveConfig.videoModel),
                audioModel: modelOptionName(effectiveConfig.audioModel),
                imageSize: effectiveConfig.size || "1:1",
                imageQuality: effectiveConfig.quality || "auto",
                imageCount: Number(effectiveConfig.canvasImageCount || effectiveConfig.count) || 1,
                videoSize: effectiveConfig.size || "16:9",
                videoSeconds: Number(effectiveConfig.videoSeconds) || 5,
                videoResolution: effectiveConfig.vquality || "720",
            });
            const latestPlan = normalizeGenerationPlan(latestRawPlan, catalog);
            const executionOps = synchronizeAgentGenerationOps(tool.input?.ops, latestPlan);
            const executionTool = executionOps === tool.input?.ops ? tool : { ...tool, input: { ...tool.input, ops: executionOps } };
            const quoteItems = officialQuoteItems(latestPlan, catalog);
            if (latestPlan.length && quoteItems.length !== latestPlan.length) throw new Error("有生成任务未匹配官方计价模型，请重新选择模型后再执行");
            if (quoteItems.length) {
                const quote = await quoteProviderBundle(quoteItems);
                setGenerationQuote(quote);
                await refreshWallet();
                const availableMilliCredits = BigInt(useAuthStore.getState().user?.wallet?.availableMilliCredits || "0");
                if (availableMilliCredits < BigInt(quote.totalMilliCredits)) {
                    const error = `积分不足：本次需要 ${quote.totalCredits} 积分，当前可用 ${useAuthStore.getState().user?.wallet?.availableCredits || "0"} 积分`;
                    setGenerationQuoteError(error);
                    message.warning(error);
                    return;
                }
            }
            pendingToolRef.current = null;
            setAgentState({ pendingTool: null });
            await runToolCall(endpoint, token, executionTool);
        } catch (error) {
            const text = error instanceof Error ? error.message : "执行前积分校验失败";
            setGenerationQuoteError(text);
            addEventLog("执行前校验失败", error);
        } finally {
            setApprovalLoading(false);
        }
    };

    const toggleAgentConnection = async ({ silent = false }: { silent?: boolean } = {}) => {
        if (enabled) {
            clearAgentSession({ enabled: false, connected: false, activity: "离线", connectError: "" });
            return;
        }
        if (MANAGED_AGENT) {
            errorLoggedRef.current = false;
            setAgentState({ url: MANAGED_CANVAS_AGENT_URL, token: "platform-session", enabled: true, connected: false, silentConnect: silent, activity: "连接中", connectError: "", activeTab: "chat" });
            return;
        }
        const urlToken = searchParams.get("agentToken") || "";
        const urlEndpoint = searchParams.get("agentUrl") || "";
        const discovered = urlToken ? null : await discoverAgentConfig(endpoint || DEFAULT_AGENT_URL);
        const nextEndpoint = (urlEndpoint || discovered?.url || endpoint || DEFAULT_AGENT_URL).trim().replace(/\/$/, "");
        const nextToken = (urlToken || token.trim() || discovered?.token || "").trim();
        if (!nextEndpoint) {
            const text = "请填写本地 Agent 地址";
            if (!silent) {
                setAgentState({ connectError: text });
                if (!headless) message.warning(text);
            }
            return;
        }
        if (!nextToken) {
            const text = "没有发现本地 Agent，请先在 Codex 使用插件或手动启动 Canvas Agent";
            if (!silent) {
                setAgentState({ connectError: text });
                if (!headless) message.warning(text);
            }
            return;
        }
        try {
            const parsed = new URL(nextEndpoint);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid protocol");
        } catch {
            const text = "本地 Agent 地址格式不正确";
            if (!silent) {
                setAgentState({ connectError: text });
                if (!headless) message.warning(text);
            }
            return;
        }
        errorLoggedRef.current = false;
        setAgentState({ url: nextEndpoint, token: nextToken, enabled: true, connected: false, silentConnect: silent, activity: "连接中", connectError: "", activeTab: "setup" });
    };

    useEffect(() => {
        if (!autoConnect || autoConnectRef.current || enabled || connected) return;
        autoConnectRef.current = true;
        void toggleAgentConnection({ silent: true });
    }, [autoConnect, connected, enabled]);

    function clearAgentSession(patch: Parameters<typeof setAgentState>[0] = {}) {
        loadThreadsSequenceRef.current += 1;
        setAgentState({
            messages: [],
            threads: [],
            activeThreadId: "",
            workspacePath: "",
            loadingThreads: false,
            waiting: false,
            sending: false,
            pendingTool: null,
            ...patch,
        });
        pendingToolRef.current = null;
    }

    const startNewThread = async () => {
        if (!connected || sending || waiting) return;
        setAgentState({ loadingThreads: true });
        try {
            const data = await fetchAgentJson<AgentThreadResponse>(endpoint, token, "/agent/codex/threads/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: currentAgentProjectId(canvasContextRef.current) }) });
            setAgentState({ activeThreadId: data.thread?.id || data.workspace?.activeThreadId || "", messages: [], activeTab: "chat", activity: "新对话" });
        } catch (error) {
            addEventLog("新建对话失败", error);
            message.error(error instanceof Error ? error.message : "新建对话失败");
        } finally {
            setAgentState({ loadingThreads: false });
        }
    };

    const resumeThread = async (threadId: string) => {
        if (!connected || !threadId || sending || waiting) return;
        setAgentState({ loadingThreads: true });
        try {
            const data = await fetchAgentJson<AgentThreadResponse>(endpoint, token, `/agent/codex/threads/${encodeURIComponent(threadId)}/resume`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: currentAgentProjectId(canvasContextRef.current) }) });
            setAgentState({ activeThreadId: data.thread?.id || threadId, messages: normalizeHistoryMessages(data.messages || []), activeTab: "chat", activity: "已恢复会话" });
        } catch (error) {
            addEventLog("恢复对话失败", error);
            message.error(error instanceof Error ? error.message : "恢复对话失败");
        } finally {
            setAgentState({ loadingThreads: false });
        }
    };

    const deleteThread = async (threadId: string) => {
        if (!connected || !threadId || sending || waiting) return;
        setAgentState({ loadingThreads: true });
        try {
            await fetchAgentJson(endpoint, token, `/agent/codex/threads/${encodeURIComponent(threadId)}/delete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: currentAgentProjectId(canvasContextRef.current) }) });
            const current = useAgentStore.getState();
            setAgentState({
                threads: current.threads.filter((thread) => thread.id !== threadId),
                activeThreadId: current.activeThreadId === threadId ? "" : current.activeThreadId,
                messages: current.activeThreadId === threadId ? [] : current.messages,
            });
            message.success("记录已删除");
        } catch (error) {
            addEventLog("删除对话失败", error);
            message.error(error instanceof Error ? error.message : "删除对话失败");
        } finally {
            setAgentState({ loadingThreads: false });
        }
    };

    const confirmDeleteThread = (thread: AgentThreadSummary) => {
        const label = thread.name || thread.preview || "未命名对话";
        modal.confirm({
            title: "删除对话记录",
            content: `确定删除「${label.length > 48 ? `${label.slice(0, 48)}...` : label}」吗？`,
            okText: "删除",
            okType: "danger",
            cancelText: "取消",
            onOk: () => deleteThread(thread.id),
        });
    };

    const addMessage = (item: Omit<AgentChatItem, "id"> & { id?: string }) => {
        const text = normalizeText(item.text);
        if (!text && !item.attachments?.length) return;
        const next = { ...item, id: item.id || `${Date.now()}-${Math.random()}`, text } as AgentChatItem;
        const currentMessages = useAgentStore.getState().messages;
        if (currentMessages.some((message) => message.id === next.id)) return;
        if (next.streamId) {
            const index = currentMessages.findIndex((message) => message.streamId === next.streamId);
            if (index >= 0) {
                setAgentState({ messages: currentMessages.map((message, i) => (i === index ? { ...message, ...next, id: message.id, text: next.text || message.text } : message)) });
                return;
            }
        }
        const last = currentMessages.at(-1);
        if (last?.role === "assistant" && next.role === "assistant" && last.title === next.title) {
            const merged = mergeAgentText(last.text, next.text);
            if (merged === last.text) return;
            setAgentState({ messages: [...useAgentStore.getState().messages.slice(0, -1), { ...last, text: merged, meta: next.meta || last.meta }] });
            return;
        }
        pushMessage(next);
    };

    const addEventLog = (title: string, text: unknown, raw?: unknown) => {
        pushEventLog({ id: `${Date.now()}-${Math.random()}`, time: new Date().toLocaleTimeString(), title, text: normalizeText(text) || title, raw });
    };

    const handleAgentEvent = (event: AgentEventPayload) => {
        if (shouldLogAgentEvent(event)) addEventLog(eventTitle(event), event, event);
        if (event.type === "thread.started" && event.thread_id) setAgentState({ activeThreadId: event.thread_id });
        if (event.type === "turn.started" || event.type === "turn.completed" || event.type === "turn.failed") void refreshWallet().catch(() => undefined);
        const item = formatAgentEvent(event, AGENT_ASSISTANT_TITLE);
        if (item) addMessage(item);
    };

    const generationReview: AgentGenerationReview | null = reviewGenerationPlan.length
        ? {
              items: reviewGenerationPlan,
              catalog: providerCatalog,
              quote: generationQuote,
              quoteLoading: generationQuoteLoading,
              quoteError: generationQuoteError || catalogError || pricingCoverageError,
              walletCredits,
              insufficient: insufficientCredits,
              onChange: updatePendingGenerationConfig,
              onRecharge: () => setRechargeOpen(true),
          }
        : null;
    const generationApprovalBlocked = Boolean(generationReview && (insufficientCredits || pricingCoverageError));

    const content = (
        <>
            {compact ? null : (
                <AgentPanelTabs
                    value={activeTab}
                    theme={theme}
                    items={[
                        { value: "chat", label: "创作", icon: <Sparkles className="size-3.5" /> },
                        { value: "history", label: "记录", icon: <History className="size-3.5" />, count: threads.length },
                        { value: "setup", label: "引擎", icon: <PlugZap className="size-3.5" /> },
                        { value: "log", label: "日志", icon: <Terminal className="size-3.5" />, count: eventLogs.length },
                    ]}
                    onChange={(activeTab) => {
                        setAgentState({ activeTab });
                        if (activeTab === "history") void loadThreads();
                    }}
                    right={
                        <Button size="small" type="text" disabled={!connected || loadingThreads || sending || waiting} icon={<Plus className="size-3.5" />} onClick={startNewThread}>
                            新对话
                        </Button>
                    }
                />
            )}

            {activeTab === "setup" ? (
                <AgentConnectView
                    theme={theme}
                    managed={MANAGED_AGENT}
                    model={MANAGED_CANVAS_AGENT_MODEL}
                    url={url}
                    token={token}
                    enabled={enabled}
                    connected={connected}
                    activity={activity}
                    connectError={connectError}
                    onUrlChange={(url) => setAgentState({ url, connectError: "" })}
                    onTokenChange={(token) => setAgentState({ token, connectError: "" })}
                    onToggleEnabled={toggleAgentConnection}
                />
            ) : activeTab === "history" ? (
                <AgentHistoryView
                    theme={theme}
                    threads={threads}
                    activeThreadId={activeThreadId}
                    workspacePath={workspacePath}
                    loading={loadingThreads}
                    busy={sending || waiting}
                    connected={connected}
                    onRefresh={() => void loadThreads()}
                    onNewThread={() => void startNewThread()}
                    onResumeThread={(threadId) => void resumeThread(threadId)}
                    onDeleteThread={confirmDeleteThread}
                />
            ) : activeTab === "log" ? (
                <AgentLogView
                    logs={eventLogs}
                    theme={theme}
                    context={{ endpoint, connected, enabled, activity, waiting, sending, messages: messages.length, pendingTool: pendingTool?.name }}
                    onClear={clearEventLogs}
                    onCopied={(text) => message.success(text)}
                    onCopyBlocked={(text) => message.warning(text)}
                />
            ) : (
                <>
                    {!compact ? <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-4" style={{ borderColor: theme.node.stroke }}>
                        <Segmented
                            size="small"
                            value={creativeMode}
                            options={[
                                {
                                    value: "vibe",
                                    label: (
                                        <span className="inline-flex items-center gap-1.5">
                                            <Sparkles className="size-3.5" />
                                            导演模式
                                        </span>
                                    ),
                                },
                                {
                                    value: "direct",
                                    label: (
                                        <span className="inline-flex items-center gap-1.5">
                                            <MousePointer2 className="size-3.5" />
                                            节点模式
                                        </span>
                                    ),
                                },
                            ]}
                            onChange={(value) => {
                                const nextMode = value as AgentCreativeMode;
                                localStorage.setItem("canvas-agent-creative-mode", nextMode);
                                setAgentState({ creativeMode: nextMode });
                            }}
                        />
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px]" style={{ color: connected ? "#16a34a" : theme.node.muted }}>
                            <span className="size-1.5 shrink-0 rounded-full" style={{ background: connected ? "#22c55e" : theme.node.faint }} />
                            <span className="truncate">{connected ? activity : "未连接"}</span>
                        </span>
                    </div> : null}
                    <div className="relative min-h-0 flex-1">
                        <div ref={listRef} className="thin-scrollbar h-full space-y-4 overflow-y-auto px-4 pb-12 pt-4" onScroll={updateScrollState}>
                            {!messages.length && !pendingTool && !waiting ? (
                                connected && (loadingThreads || historyLoadError) ? (
                                    <AgentConversationRestoreState compact={compact} error={historyLoadError} theme={theme} onRetry={() => void loadThreads()} />
                                ) : (
                                    <AgentCreativeEmptyState compact={compact} connected={connected} mode={creativeMode} theme={theme} onSelectPrompt={(prompt) => setAgentState({ prompt })} onOpenSetup={() => setAgentState({ activeTab: "setup" })} />
                                )
                            ) : null}
                            {messages.map((item) => (
                                <AgentChatMessage key={item.id} item={agentMessageToChatMessage(item)} theme={theme} user={user} />
                            ))}
                            {pendingTool ? (
                                <AgentPendingToolCard
                                    summary={summarizeCanvasAgentOps(pendingTool.input?.ops || []) || toolName(pendingTool.name)}
                                    detail={{ requestId: pendingTool.requestId, name: pendingTool.name, input: pendingTool.input }}
                                    preview={buildAgentWorkflowPreview(pendingTool.name, pendingTool.input?.ops)}
                                    generationReview={generationReview}
                                    approveDisabled={approvalLoading || generationApprovalBlocked}
                                    approveLoading={approvalLoading}
                                    theme={theme}
                                    onReject={rejectPendingTool}
                                    onApprove={approvePendingTool}
                                />
                            ) : null}
                            {waiting && !pendingTool ? <AgentWorkingMessage theme={theme} /> : null}
                        </div>
                        {showScrollToBottom ? (
                            <Tooltip title="滚动到底部" placement="left">
                                <Button
                                    type="text"
                                    shape="circle"
                                    aria-label="滚动到底部"
                                    className="!absolute bottom-3 left-1/2 z-10 !h-8 !w-8 !min-w-8 -translate-x-1/2 backdrop-blur transition hover:-translate-y-0.5"
                                    style={{ background: theme.toolbar.panel, border: `1px solid ${theme.node.stroke}`, color: theme.node.text }}
                                    icon={<ChevronDown className="size-4" />}
                                    onClick={() => scrollToBottom()}
                                />
                            </Tooltip>
                        ) : null}
                    </div>
                    <AgentChatComposer
                        prompt={prompt}
                        attachments={attachments.map(agentAttachmentToChatAttachment)}
                        disabled={!connected}
                        sending={sending || waiting}
                        placeholder={compact ? "开始你的创作，或者 @ 引用工作流 / 节点 / 资源" : creativeMode === "vibe" ? "描述你想完成的内容" : "直接修改选中节点或画布"}
                        theme={theme}
                        plain={compact}
                        onPromptChange={(prompt) => setAgentState({ prompt })}
                        onSubmit={sendPrompt}
                        onStop={stopTurn}
                        onAddFiles={addAttachments}
                        onRemoveAttachment={removeAttachment}
                        left={
                            <>
                                {compact ? (
                                    <Segmented
                                        size="small"
                                        value={creativeMode}
                                        options={[
                                            { value: "vibe", label: <span className="inline-flex items-center gap-1"><Sparkles className="size-3" />导演</span> },
                                            { value: "direct", label: <span className="inline-flex items-center gap-1"><MousePointer2 className="size-3" />节点</span> },
                                        ]}
                                        onChange={(value) => {
                                            const nextMode = value as AgentCreativeMode;
                                            localStorage.setItem("canvas-agent-creative-mode", nextMode);
                                            setAgentState({ creativeMode: nextMode });
                                        }}
                                    />
                                ) : null}
                                {attachments.length ? (
                                    <span className="text-[11px]" style={{ color: theme.node.muted }}>
                                        {formatBytes(attachmentPayloadBytes(attachments))} / 30MB
                                    </span>
                                ) : null}
                            </>
                        }
                    />
                </>
            )}
            <RechargeModal open={rechargeOpen} onClose={() => setRechargeOpen(false)} />
        </>
    );

    if (headless) return null;
    return embedded ? content : null;
}

function AgentConversationRestoreState({ compact, error, theme, onRetry }: { compact?: boolean; error?: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onRetry: () => void }) {
    return (
        <div role="status" aria-live="polite" className={`flex min-h-full flex-col items-center justify-center px-5 text-center ${compact ? "pb-16" : "py-12"}`} style={{ color: theme.node.muted }}>
            <span className="grid size-10 place-items-center rounded-lg border" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                {error ? <RefreshCw className="size-5" /> : <LoaderCircle className="size-5 animate-spin" />}
            </span>
            <div className="mt-3 text-sm font-medium" style={{ color: theme.node.text }}>
                {error ? "对话同步未完成" : "正在恢复上次对话"}
            </div>
            <div className="mt-1 max-w-64 text-xs leading-5">{error || "正在同步此画布的创作上下文"}</div>
            {error ? (
                <Button className="mt-4" size="small" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
                    重新同步
                </Button>
            ) : (
                <div className="mt-4 h-1 w-32 overflow-hidden rounded-full" style={{ background: theme.node.faint }}>
                    <span className="block h-full w-1/2 animate-pulse rounded-full" style={{ background: theme.node.activeStroke }} />
                </div>
            )}
        </div>
    );
}

function AgentCreativeEmptyState({
    compact,
    connected,
    mode,
    theme,
    onSelectPrompt,
    onOpenSetup,
}: {
    compact?: boolean;
    connected: boolean;
    mode: AgentCreativeMode;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onSelectPrompt: (prompt: string) => void;
    onOpenSetup: () => void;
}) {
    if (compact) {
        return (
            <div className="flex min-h-full flex-col justify-end px-1 pb-2">
                <div>
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4" />从 Skill 出发，抵达成片</div>
                    <div className="grid grid-cols-2 gap-2">
                        {VIBE_STARTERS.concat("搭建人物、场景、故事板与视频工作流").map((item) => (
                            <button key={item} type="button" className="min-h-14 rounded-lg border px-3 py-2 text-left text-xs leading-5 transition hover:bg-black/5 dark:hover:bg-white/5" style={{ borderColor: theme.node.stroke }} onClick={() => onSelectPrompt(item)}>
                                {item}
                            </button>
                        ))}
                    </div>
                    {!connected ? (
                        <button
                            type="button"
                            className="mt-3 flex h-9 w-full items-center justify-between rounded-md border px-2.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/5"
                            style={{ borderColor: theme.node.stroke, color: theme.node.muted }}
                            onClick={onOpenSetup}
                        >
                            <span className="inline-flex items-center gap-2"><PlugZap className="size-3.5" />连接创作引擎后执行</span>
                            <span style={{ color: theme.node.text }}>去连接</span>
                        </button>
                    ) : null}
                </div>
            </div>
        );
    }
    return (
        <div className="flex min-h-[340px] flex-col items-center justify-center px-4 py-10 text-center">
            <span className="grid size-10 place-items-center rounded-lg border" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                {mode === "vibe" ? <Sparkles className="size-5" /> : <MousePointer2 className="size-5" />}
            </span>
            <div className="mt-3 text-base font-semibold">{mode === "vibe" ? "创作导演" : "节点助手"}</div>
            {connected ? (
                <div className="mt-5 grid w-full max-w-sm gap-2">
                    {(mode === "vibe" ? VIBE_STARTERS : ["整理并对齐当前节点", "检查断开的连线", "修改选中节点的提示词"]).map((item) => (
                        <button
                            key={item}
                            type="button"
                            className="min-h-10 rounded-lg border px-3 py-2 text-left text-sm leading-5 transition hover:-translate-y-px"
                            style={{ borderColor: theme.node.stroke, color: theme.node.text, background: "transparent" }}
                            onClick={() => onSelectPrompt(item)}
                        >
                            {item}
                        </button>
                    ))}
                </div>
            ) : (
                <Button className="mt-5" type="primary" icon={<PlugZap className="size-4" />} onClick={onOpenSetup}>
                    连接创作引擎
                </Button>
            )}
        </div>
    );
}

function AgentLogView({
    logs,
    theme,
    context,
    onClear,
    onCopied,
    onCopyBlocked,
}: {
    logs: AgentEventLog[];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    context: AgentLogContext;
    onClear: () => void;
    onCopied: (text: string) => void;
    onCopyBlocked: (text: string) => void;
}) {
    const [mode, setMode] = useState<"text" | "json">("text");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const content = mode === "text" ? formatLogText(logs, context) : formatLogJson(logs, context);
    const lastError = [...logs].reverse().find((item) => /错误|失败|error/i.test(`${item.title}\n${item.text}`));
    const copy = async (value = content, tip = "日志已复制") => {
        if (await copyToClipboard(value)) {
            onCopied(tip);
            return;
        }
        textareaRef.current?.focus();
        textareaRef.current?.select();
        onCopyBlocked("已选中日志，请手动复制");
    };
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex min-h-full flex-col gap-3">
                <div>
                    <div className="text-base font-semibold leading-6">运行日志</div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Segmented
                        size="small"
                        value={mode}
                        onChange={(value) => setMode(value as "text" | "json")}
                        options={[
                            { label: "排查日志", value: "text" },
                            { label: "原始 JSON", value: "json" },
                        ]}
                    />
                    <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: theme.node.muted }}>
                            {logs.length} 条
                        </span>
                        <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => void copy()}>
                            复制
                        </Button>
                        <Button size="small" disabled={!lastError} onClick={() => lastError && void copy(formatLogText([lastError], context), "最近错误已复制")}>
                            最近错误
                        </Button>
                        <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} disabled={!logs.length} onClick={onClear}>
                            清空
                        </Button>
                    </div>
                </div>
                <textarea
                    ref={textareaRef}
                    readOnly
                    value={content}
                    className="thin-scrollbar min-h-[360px] flex-1 resize-none rounded-lg border bg-transparent p-3 font-mono text-xs leading-5 outline-none"
                    style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                    onFocus={(event) => event.currentTarget.select()}
                />
            </div>
        </div>
    );
}

function AgentConnectView({
    theme,
    managed,
    model,
    url,
    token,
    enabled,
    connected,
    activity,
    connectError,
    onUrlChange,
    onTokenChange,
    onToggleEnabled,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    managed: boolean;
    model: string;
    url: string;
    token: string;
    enabled: boolean;
    connected: boolean;
    activity: string;
    connectError: string;
    onUrlChange: (value: string) => void;
    onTokenChange: (value: string) => void;
    onToggleEnabled: () => void;
}) {
    const { message } = App.useApp();
    const statusText = connectError ? "连接失败" : connected ? activity : enabled ? "连接中" : "未连接";
    const statusColor = connectError ? "#dc2626" : connected ? "#16a34a" : enabled ? "#d97706" : theme.node.muted;
    if (managed) {
        return (
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                    <div>
                        <div className="text-base font-semibold leading-6">云端创作引擎</div>
                        <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>随橙月画布账户连接</div>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: theme.node.stroke }}>
                        <div className="flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: theme.node.stroke }}>
                            <div>
                                <div className="text-xs" style={{ color: theme.node.muted }}>模型</div>
                                <div className="mt-1 text-sm font-medium">{model || "GPT-5.6 Terra"}</div>
                            </div>
                            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: statusColor }}>
                                <span className="size-1.5 rounded-full" style={{ background: statusColor }} />
                                {statusText}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 pt-3">
                            <span className="truncate text-xs" style={{ color: connectError ? "#dc2626" : theme.node.muted }}>{connectError || "账户会话鉴权"}</span>
                            <Button className="!h-8 !px-3" type={enabled ? "default" : "primary"} icon={<PlugZap className="size-4" />} onClick={onToggleEnabled}>
                                {enabled ? "断开" : "连接"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    const copyCommand = (command: string) => {
        copyToClipboard(command);
        message.success("命令已复制");
    };
    const codexPluginReminder = (
        <div className="rounded-lg border px-3 py-2.5 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
            <div className="font-medium" style={{ color: theme.node.text }}>
                Codex 插件提醒
            </div>
            <div className="mt-1">只有安装 Codex 插件或手动添加 MCP 后，工具列表才会进入 Codex 上下文并增加 token 消耗；仅运行 `npx -y @basketikun/canvas-agent` 启动本地 Agent 不会安装 MCP。</div>
            <div className="mt-2 grid gap-1.5">
                {[
                    ["移除插件", AGENT_PLUGIN_REMOVE_COMMAND],
                    ["移除手动 MCP", AGENT_MCP_REMOVE_COMMAND],
                ].map(([label, command]) => (
                    <div key={command} className="flex items-center gap-2 rounded-md border bg-transparent px-2 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                        <span className="shrink-0 text-[11px]" style={{ color: theme.node.muted }}>
                            {label}
                        </span>
                        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px] leading-5">{command}</code>
                        <Tooltip title="复制命令">
                            <Button size="small" type="text" className="!h-6 !w-6 !min-w-6" icon={<Copy className="size-3.5" />} onClick={() => copyCommand(command)} />
                        </Tooltip>
                    </div>
                ))}
            </div>
        </div>
    );
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
                <div>
                    <div className="text-base font-semibold leading-6">连接本地 Agent</div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        按使用场景选择一种连接方式。
                    </div>
                </div>
                <div className="space-y-2">
                    {AGENT_CONNECT_STEPS.map((step, index) => {
                        const command = "command" in step ? step.command : "";
                        return (
                            <Fragment key={step.title}>
                                <div className="rounded-lg px-3 py-2.5">
                                    <div className="text-sm font-medium leading-5">{step.title}</div>
                                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                        {step.text}
                                    </div>
                                    {command ? (
                                        <div className="mt-2 flex items-center gap-2 rounded-md border bg-transparent px-2 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                                            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px] leading-5">{command}</code>
                                            <Tooltip title="复制命令">
                                                <Button size="small" type="text" className="!h-6 !w-6 !min-w-6" icon={<Copy className="size-3.5" />} onClick={() => copyCommand(command)} />
                                            </Tooltip>
                                        </div>
                                    ) : null}
                                </div>
                                {index === 0 ? codexPluginReminder : null}
                            </Fragment>
                        );
                    })}
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 text-sm font-medium leading-5">网页连接</span>
                                <span
                                    className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-4"
                                    style={{ borderColor: connected || enabled || connectError ? statusColor : theme.node.stroke, color: statusColor }}
                                >
                                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: statusColor }} />
                                    <span className="truncate">{statusText}</span>
                                </span>
                            </div>
                            <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                默认自动读取 Local URL 和 Connect token，失败时再手动填写。
                            </div>
                        </div>
                        <Button className="!h-8 !px-3" type={enabled ? "default" : "primary"} icon={<PlugZap className="size-4" />} onClick={onToggleEnabled}>
                            {enabled ? "断开" : "连接"}
                        </Button>
                    </div>
                    <div className="mt-3 grid gap-2.5">
                        <label className="grid gap-1.5">
                            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.node.muted }}>
                                <Link2 className="size-3.5" />
                                本地地址
                                <span className="font-normal opacity-70">Local URL</span>
                            </span>
                            <Input size="large" prefix={<Link2 className="mr-1 size-4" style={{ color: theme.node.faint }} />} value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder="例如 http://127.0.0.1:17371" />
                        </label>
                        <label className="grid gap-1.5">
                            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.node.muted }}>
                                <KeyRound className="size-3.5" />
                                连接 Token
                                <span className="font-normal opacity-70">Connect token</span>
                            </span>
                            <Input.Password
                                size="large"
                                prefix={<KeyRound className="mr-1 size-4" style={{ color: theme.node.faint }} />}
                                value={token}
                                onChange={(event) => onTokenChange(event.target.value)}
                                placeholder="自动发现，或手动填入 Connect token"
                            />
                        </label>
                        {connectError ? (
                            <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: "rgba(220,38,38,.35)", color: "#dc2626" }}>
                                {connectError}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

function AgentHistoryView({
    theme,
    threads,
    activeThreadId,
    workspacePath,
    loading,
    busy,
    connected,
    onRefresh,
    onNewThread,
    onResumeThread,
    onDeleteThread,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    threads: AgentThreadSummary[];
    activeThreadId: string;
    workspacePath: string;
    loading: boolean;
    busy: boolean;
    connected: boolean;
    onRefresh: () => void;
    onNewThread: () => void;
    onResumeThread: (threadId: string) => void;
    onDeleteThread: (thread: AgentThreadSummary) => void;
}) {
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-3">
                <div className="flex min-w-0 items-center gap-2 text-xs" style={{ color: theme.node.muted }}>
                    <FolderOpen className="size-3.5 shrink-0" />
                    <span className="shrink-0">工作空间</span>
                    <span className="min-w-0 truncate" title={workspacePath}>
                        {workspacePath || "默认画布目录"}
                    </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm" style={{ color: theme.node.muted }}>
                        {threads.length ? `${threads.length} 条历史` : connected ? "暂无历史" : "未连接"}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="small" icon={<RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />} disabled={!connected || loading} onClick={onRefresh}>
                            刷新
                        </Button>
                        <Button size="small" type="primary" icon={<Plus className="size-3.5" />} disabled={!connected || loading || busy} onClick={onNewThread}>
                            新对话
                        </Button>
                    </div>
                </div>
                <div className="space-y-2">
                    {threads.map((thread) => {
                        const active = thread.id === activeThreadId;
                        return (
                            <div key={thread.id} className="rounded-lg border px-2.5 py-1.5 transition" style={{ borderColor: active ? theme.node.text : theme.node.stroke, background: "transparent", color: theme.node.text }}>
                                <div className="flex items-center gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            {active ? (
                                                <span className="shrink-0 text-[10px] font-medium" style={{ color: theme.node.text }}>
                                                    当前
                                                </span>
                                            ) : null}
                                            <div className="truncate text-sm font-medium leading-5">{thread.name || thread.preview || "未命名对话"}</div>
                                        </div>
                                        <div className="truncate text-[11px] leading-4 opacity-65">{thread.preview || thread.id}</div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <span className="text-[10px] opacity-55">{formatThreadTime(thread.updatedAt || thread.createdAt)}</span>
                                        <Button size="small" className="!h-6 !px-2" disabled={loading || busy} onClick={() => onResumeThread(thread.id)}>
                                            进入
                                        </Button>
                                        <Tooltip title="删除记录">
                                            <Button size="small" danger type="text" className="!h-6 !w-6 !min-w-6" disabled={loading || busy} icon={<Trash2 className="size-3.5" />} onClick={() => onDeleteThread(thread)} />
                                        </Tooltip>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {!threads.length ? (
                        <div className="px-3 py-8 text-center text-sm" style={{ color: theme.node.muted }}>
                            {connected ? "当前工作空间还没有对话记录" : `连接${MANAGED_AGENT ? "云端" : "本地"} Agent 后显示历史记录`}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

async function postState(endpoint: string, token: string, clientId: string, snapshot: CanvasAgentSnapshot | null) {
    try {
        const response = await fetch(`${endpoint}/canvas/state?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(snapshot ? { ...snapshot, hasCanvas: true } : { hasCanvas: false }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

async function activateAgentClient(endpoint: string, token: string, clientId: string) {
    try {
        await fetch(`${endpoint}/canvas/activate?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`, { method: "POST", credentials: "include" });
    } catch {}
}

async function postToolResult(endpoint: string, token: string, clientId: string, body: { requestId: string; result?: unknown; error?: string }) {
    await fetch(`${endpoint}/canvas/result?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function agentMessageToChatMessage(item: AgentChatItem) {
    return { ...item, attachments: item.attachments?.map(agentAttachmentToChatAttachment) };
}

function agentAttachmentToChatAttachment(item: AgentAttachment): CanvasAgentChatAttachment {
    return { id: item.id, name: item.name, url: item.dataUrl || item.url };
}

function formatAgentEvent(event: AgentEventPayload, assistantTitle = "Codex"): Omit<AgentChatItem, "id"> | null {
    const item = event.item;
    if (event.type === "item.completed" && item?.type === "error") return { role: "error", title: "错误", text: normalizeText(item.message), detail: item };
    if ((event.type === "item.updated" || event.type === "item.completed") && item?.type === "agent_message") return { role: "assistant", title: assistantTitle, text: stringText(item.text), meta: usageText(event), streamId: item.id };
    if (event.type === "item.completed" && isMcpToolItem(item) && isReadTool(String(item?.tool || ""))) return { role: "tool", title: `${toolName(String(item?.tool || ""))}完成`, text: item?.error?.message || toolSummary(item), detail: toolDetail(item) };
    const text = eventText(event);
    if (text) return { role: "assistant", title: assistantTitle, text, meta: usageText(event) };
    return null;
}

function parseEventData<T>(event: Event) {
    try {
        return JSON.parse((event as MessageEvent).data) as T;
    } catch {
        return null;
    }
}

function isCurrentThreadEvent(event: { threadId?: string; thread_id?: string }) {
    const threadId = event.threadId || event.thread_id || "";
    return Boolean(threadId) && threadId === useAgentStore.getState().activeThreadId;
}

function formatLogText(logs: AgentEventLog[], context: AgentLogContext) {
    const head = [
        "橙月画布 Agent 诊断日志",
        `Canvas Agent: ${context.endpoint}`,
        `连接: ${context.connected ? "在线" : context.enabled ? "连接中" : "未启用"}`,
        `状态: ${context.activity}`,
        `waiting: ${context.waiting}`,
        `sending: ${context.sending}`,
        `messages: ${context.messages}`,
        `pendingTool: ${context.pendingTool ? toolName(context.pendingTool) : "none"}`,
        `logs: ${logs.length}`,
    ].join("\n");
    const body = logs
        .map((item, index) => {
            const detail = item.raw == null ? item.text : JSON.stringify(item.raw, null, 2);
            return [`#${index + 1} ${item.time} ${item.title}`, detail].filter(Boolean).join("\n");
        })
        .join("\n\n---\n\n");
    return [head, body || "暂无事件日志"].join("\n\n");
}

function formatLogJson(logs: AgentEventLog[], context: AgentLogContext) {
    return JSON.stringify({ context, logs: logs.map(({ time, title, text, raw }) => ({ time, title, text, raw })) }, null, 2);
}

function eventText(event: AgentEventPayload) {
    return event.type === "item.completed" && event.item?.type === "agent_message" ? stringText(event.item.text) : "";
}

function usageText(event: AgentEventPayload) {
    const usage = event.usage;
    if (!usage || typeof usage !== "object") return undefined;
    const total = numberField(usage, "total_tokens");
    const input = numberField(usage, "input_tokens");
    const output = numberField(usage, "output_tokens");
    const cached = numberField(usage, "cached_input_tokens");
    const tokenText = total ? `${total} tok${cached ? `（缓存 ${cached}）` : ""}` : input || output ? `${input || 0}/${output || 0} tok` : "";
    const chargedText = event.chargedCredits ? `${event.chargedCredits} 积分` : "";
    return [tokenText, chargedText].filter(Boolean).join(" · ") || undefined;
}

function eventTitle(event: AgentEventPayload) {
    const item = event.item;
    if (event.type === "thread.started") return "已创建 Codex 会话";
    if (event.type === "turn.started") return "开始处理";
    if (event.type === "turn.completed") return "本轮完成";
    if (event.type === "stream.summary") return "流式摘要";
    if (event.type === "turn.failed" || event.type === "error") return "本轮失败";
    if (event.type === "item.started" && isMcpToolItem(item)) return `调用工具：${toolName(String(item?.tool || ""))}`;
    if (event.type === "item.completed" && isMcpToolItem(item)) return `工具完成：${toolName(String(item?.tool || ""))}`;
    if (event.type === "item.completed" && item?.type === "agent_message") return "Codex 回复";
    return event.type || "Codex 事件";
}

function shouldLogAgentEvent(event: AgentEventPayload) {
    const itemType = event.item?.type || "";
    return !["item.updated"].includes(event.type || "") && !["reasoning"].includes(itemType) && !(event.type === "item.started" && itemType === "agent_message");
}

function isConnectionErrorMessage(item: AgentChatItem) {
    return item.role === "error" && /连接失败|无法连接(?:本地|云端) Agent|(?:本地|云端) Agent 连接失败/.test(item.text);
}

function toolName(name: string) {
    if (name === "canvas_apply_ops") return "画布操作";
    if (name === "canvas_get_state") return "读取画布";
    if (name === "canvas_get_selection") return "读取选区";
    if (name === "canvas_get_node") return "读取节点";
    if (name === "canvas_export_snapshot") return "导出快照";
    if (name === "canvas_create_node") return "创建节点";
    if (name === "canvas_create_attachment_nodes") return "添加附件图片";
    if (name === "canvas_create_text_node") return "创建文本";
    if (name === "canvas_create_text_nodes") return "批量创建文本";
    if (name === "canvas_create_config_node") return "创建生成配置";
    if (name === "canvas_create_image_prompt_flow") return "创建生图流程";
    if (name === "canvas_create_generation_flow") return "创建生成流程";
    if (name === "canvas_generate_text") return "生成文本";
    if (name === "canvas_generate_image") return "生成图片";
    if (name === "canvas_generate_video") return "生成视频";
    if (name === "canvas_generate_audio") return "生成音频";
    if (name === "canvas_update_node") return "更新节点";
    if (name === "canvas_update_node_text") return "更新文本";
    if (name === "canvas_move_nodes") return "移动节点";
    if (name === "canvas_resize_node") return "调整节点尺寸";
    if (name === "canvas_delete_nodes") return "删除节点";
    if (name === "canvas_connect_nodes") return "连接节点";
    if (name === "canvas_select_nodes") return "选择节点";
    if (name === "canvas_set_viewport") return "调整视口";
    if (name === "canvas_run_generation") return "触发生成";
    if (name === "site_navigate") return "网站跳转";
    if (isSiteTool(name)) return SITE_TOOL_LABELS[name];
    return name;
}

function siteToolSummary(name: string, result: unknown) {
    const data = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
    if (name === "canvas_list_projects") return `共 ${numberField(data, "total")} 个画布`;
    if (name === "prompts_search") return `找到 ${numberField(data, "total")} 条提示词`;
    if (name === "assets_list") return `共 ${numberField(data, "total")} 个资产`;
    if (name === "assets_add") return "已加入我的资产";
    if (name === "generation_get_status") {
        const summary = data.summary && typeof data.summary === "object" ? (data.summary as Record<string, unknown>) : {};
        return `共 ${numberField(data, "total")} 个任务，排队 ${numberField(summary, "queued")}，运行中 ${numberField(summary, "running")}，成功 ${numberField(summary, "succeeded")}，失败 ${numberField(summary, "failed")}`;
    }
    if (name === "workbench_image_generate" || name === "workbench_video_generate") return typeof data.note === "string" ? data.note : "已在工作台执行";
    if (name === "workbench_image_get_config" || name === "workbench_video_get_config") return "已读取工作台配置";
    return "已完成";
}

function isReadTool(name: string) {
    return name === "canvas_get_state" || name === "canvas_get_selection" || name === "canvas_get_node" || name === "canvas_export_snapshot";
}

function isMcpToolItem(item?: AgentEventItem) {
    return item?.type === "mcp_tool_call";
}

function toolDetail(item?: AgentEventItem) {
    return { server: item?.server, tool: item?.tool, status: item?.status, arguments: item?.arguments, result: parseToolResult(item?.result), error: item?.error };
}

function toolSummary(item?: AgentEventItem) {
    const result = parseToolResult(item?.result);
    const nodeField = objectField(result, "nodes");
    const connectionField = objectField(result, "connections");
    const nodes = Array.isArray(nodeField) ? nodeField : [];
    const connections = Array.isArray(connectionField) ? connectionField : [];
    if (Array.isArray(nodeField) || Array.isArray(connectionField)) return `读取到 ${nodes.length} 个节点，${connections.length} 条连线`;
    return "工具调用完成";
}

function parseToolResult(result: unknown) {
    const content = objectField(result, "content");
    const text = Array.isArray(content)
        ? content
              .map((item) => objectField(item, "text"))
              .filter((item): item is string => typeof item === "string")
              .join("\n")
        : "";
    try {
        return text ? JSON.parse(text) : result;
    } catch {
        return text || result;
    }
}

function normalizeText(value: unknown) {
    if (typeof value === "string") return value.trim();
    if (value instanceof Error) return value.message;
    if (value == null) return "";
    return JSON.stringify(value, null, 2);
}

function stringText(value: unknown) {
    return typeof value === "string" ? value : "";
}

function objectField(value: unknown, key: string) {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function numberField(value: unknown, key: string) {
    const field = objectField(value, key);
    return typeof field === "number" ? field : 0;
}

function mergeAgentText(prev: string, next: string) {
    if (!next || prev === next || prev.endsWith(next)) return prev;
    if (next.startsWith(prev)) return next;
    for (let size = Math.min(prev.length, next.length); size > 0; size--) {
        if (prev.endsWith(next.slice(0, size))) return `${prev}${next.slice(size)}`;
    }
    const half = Math.floor(prev.length / 2);
    if (prev.length > 12 && next.length > 12 && prev.slice(half) === next.slice(0, prev.length - half)) return prev;
    return `${prev}${next}`;
}

function promptWithAttachments(text: string, attachments: AgentAttachment[]) {
    return text || (attachments.length ? "请处理上传的图片附件。" : "");
}

function currentAgentProjectId(context: AgentCanvasContext | null) {
    return context?.snapshot.projectId?.trim() || "default";
}

function attachmentPayloadBytes(attachments: AgentAttachment[]) {
    return attachments.reduce((total, item) => total + item.dataUrl.length, 0);
}

function formatBytes(bytes: number) {
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(bytes / 1024)}KB`;
}

function isCanvasWriteTool(name: string) {
    return name === "canvas_apply_ops" || name === "canvas_create_attachment_nodes";
}

function isProjectEscapeTool(name: string) {
    return name === "site_navigate" || name === "canvas_list_projects" || name === "workbench_image_generate" || name === "workbench_video_generate";
}

function officialQuoteItems(plan: ReturnType<typeof buildAgentGenerationPlan>, catalog: ProviderCatalog | null) {
    if (!catalog) return [];
    const officialModels = new Set(catalog.models.map((model) => model.id));
    return generationQuoteItems(plan).filter((item) => officialModels.has(item.model));
}

function normalizeGenerationPlan(plan: ReturnType<typeof buildAgentGenerationPlan>, catalog: ProviderCatalog | null) {
    if (!catalog) return plan;
    return plan.map((item) => {
        const product = item.mode === "video" ? canonicalOrangeMoonVideoModel(item.model) : "";
        const model = catalog.models.find((candidate) =>
            candidate.capability === item.mode
            && (candidate.id === item.model
                || candidate.label.toLowerCase() === item.model.toLowerCase()
                || (item.mode === "video" && candidate.product === product && candidate.resolution === item.resolution)),
        );
        if (!model) return item;
        if (item.mode !== "video") return { ...item, model: model.id };
        const durations = model.fixedDuration ? [model.fixedDuration] : model.allowedDurations || model.recommendedDurations || [];
        return {
            ...item,
            model: model.id,
            resolution: model.resolution || item.resolution,
            size: model.aspectRatios?.includes(item.size) ? item.size : model.aspectRatios?.[0] || item.size,
            seconds: durations.includes(item.seconds) ? item.seconds : durations[0] || Math.min(model.maxDuration || 15, Math.max(model.minDuration || 5, item.seconds)),
        };
    });
}

async function attachmentNodeOps(endpoint: string, token: string, clientId: string, value: unknown): Promise<CanvasAgentOp[]> {
    const nodes = Array.isArray(value) ? value : [];
    if (!nodes.length) throw new Error("没有可添加的图片附件");
    return await Promise.all(
        nodes.map(async (value) => {
            const item = value as { id?: unknown; attachmentId?: unknown; title?: unknown; position?: unknown };
            const id = String(item.id || "");
            const attachmentId = String(item.attachmentId || "");
            if (!id || !attachmentId) throw new Error("图片附件节点参数无效");
            const res = await fetch(`${endpoint}/agent/attachments/${encodeURIComponent(attachmentId)}?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`, { credentials: "include" });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error || "读取图片附件失败");
            }
            const image = await uploadImage(await res.blob());
            const size = fitNodeSize(image.width, image.height);
            const position = item.position && typeof item.position === "object" ? (item.position as { x?: unknown; y?: unknown }) : {};
            return {
                type: "add_node" as const,
                id,
                nodeType: "image" as const,
                title: String(item.title || "参考图"),
                position: { x: Number(position.x) || 0, y: Number(position.y) || 0 },
                width: size.width,
                height: size.height,
                metadata: imageMetadata(image),
            };
        }),
    );
}

async function fetchAgentJson<T>(endpoint: string, token: string, path: string, init?: RequestInit, timeoutMs = AGENT_REQUEST_TIMEOUT_MS) {
    const url = `${endpoint}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init?.signal?.aborted) controller.abort();
    else init?.signal?.addEventListener("abort", abort, { once: true });
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { credentials: "include", ...init, signal: controller.signal });
        const data = (await res.json().catch(() => ({}))) as T & { error?: string; msg?: string };
        if (!res.ok) throw new Error(data.error || data.msg || "本地 Agent 请求失败");
        return data;
    } catch (error) {
        if (controller.signal.aborted && !init?.signal?.aborted) throw new Error("创作上下文同步超时，请重新同步");
        throw error;
    } finally {
        window.clearTimeout(timer);
        init?.signal?.removeEventListener("abort", abort);
    }
}

async function discoverAgentConfig(endpoint: string) {
    try {
        const res = await fetch(`${endpoint}/config`, { credentials: "include" });
        if (!res.ok) return null;
        const data = (await res.json()) as AgentConfigResponse;
        return data.ok ? data : null;
    } catch {
        return null;
    }
}

function normalizeHistoryMessages(messages: AgentChatItem[]) {
    return messages
        .map((item, index) => ({
            ...item,
            id: item.id || `history-${index}`,
            text: normalizeText(item.text),
        }))
        .filter((item) => item.text);
}

function formatThreadTime(value?: number) {
    if (!value) return "";
    return new Date(value * 1000).toLocaleString();
}

function createId() {
    return randomId();
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function readDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
        reader.readAsDataURL(file);
    });
}
