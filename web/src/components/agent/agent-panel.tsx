import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { History, PanelRightClose, PlugZap, Sparkles, Terminal } from "lucide-react";
import { Button, Switch, Tooltip } from "antd";
import { motion } from "motion/react";

import { CanvasLocalAgentPanel } from "@/components/canvas/canvas-local-agent-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { CANVAS_AGENT_PANEL_MOTION_MS, useAgentStore, type AgentPanelTab } from "@/stores/use-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";

const PANEL_MOTION_SECONDS = CANVAS_AGENT_PANEL_MOTION_MS / 1000;

const TAB_LABELS: Record<AgentPanelTab, string> = {
    chat: "新对话",
    history: "历史对话",
    setup: "Agent 设置",
    log: "运行日志",
};

export function AgentPanel() {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const width = useAgentStore((state) => state.width);
    const [resizing, setResizing] = useState(false);
    const panelMounted = useAgentStore((state) => state.panelMounted);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const panelClosing = useAgentStore((state) => state.panelClosing);
    const confirmTools = useAgentStore((state) => state.confirmTools);
    const activeTab = useAgentStore((state) => state.activeTab);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const closePanel = useAgentStore((state) => state.closePanel);

    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        let nextWidth = startWidth;
        const onMove = (moveEvent: PointerEvent) => {
            nextWidth = Math.min(760, Math.max(360, startWidth + startX - moveEvent.clientX));
            setAgentState({ width: nextWidth });
        };
        const onUp = () => {
            localStorage.setItem("canvas-agent-panel-width", String(nextWidth));
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setResizing(false);
        };
        setResizing(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    if (!panelMounted) return null;

    return (
        <>
            <motion.button
                type="button"
                className="fixed inset-0 z-[80] bg-black/35 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: panelOpen ? 1 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ pointerEvents: panelOpen && !panelClosing ? "auto" : "none" }}
                onClick={closePanel}
                aria-label="关闭 Agent 面板"
            />
            <motion.div
                className="fixed inset-y-0 right-0 z-[90] flex h-full max-w-full lg:relative lg:inset-auto lg:z-[70] lg:shrink-0"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: panelOpen ? width + 1 : 0, opacity: panelOpen ? 1 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ maxWidth: "100vw", overflow: "clip", pointerEvents: panelClosing ? "none" : undefined }}
            >
                <motion.aside
                    className="relative flex h-full max-w-full shrink-0 flex-col border-l"
                    initial={{ x: 48 }}
                    animate={{ x: panelClosing ? 28 : 0 }}
                    transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                    style={{ width, maxWidth: "100vw", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
                >
                    <button type="button" className="absolute inset-y-0 left-0 z-40 hidden w-4 -translate-x-1/2 cursor-col-resize lg:block" onPointerDown={startResize} aria-label="调整右侧面板宽度" />
                    <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-3" style={{ borderColor: theme.node.stroke }}>
                        <div className="min-w-0 truncate text-sm font-medium">{TAB_LABELS[activeTab]}</div>
                        <div className="flex shrink-0 items-center gap-0.5">
                            <AgentTabButton label="创作" active={activeTab === "chat"} onClick={() => setAgentState({ activeTab: "chat" })}><Sparkles className="size-3.5" /></AgentTabButton>
                            <AgentTabButton label="历史对话" active={activeTab === "history"} onClick={() => setAgentState({ activeTab: "history" })}><History className="size-3.5" /></AgentTabButton>
                            <AgentTabButton label="Agent 设置" active={activeTab === "setup"} onClick={() => setAgentState({ activeTab: "setup" })}><PlugZap className="size-3.5" /></AgentTabButton>
                            <AgentTabButton label="运行日志" active={activeTab === "log"} onClick={() => setAgentState({ activeTab: "log" })}><Terminal className="size-3.5" /></AgentTabButton>
                            <Tooltip title={confirmTools ? "执行前审核已开启" : "执行前审核已关闭"}>
                                <span className="ml-1 hidden items-center lg:inline-flex"><Switch size="small" checked={confirmTools} onChange={(confirmTools) => setAgentState({ confirmTools })} aria-label="执行前审核" /></span>
                            </Tooltip>
                            <Tooltip title="收起 Agent">
                                <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={{ color: theme.node.muted }} icon={<PanelRightClose className="size-4" />} onClick={closePanel} aria-label="收起 Agent" />
                            </Tooltip>
                        </div>
                    </header>
                    <CanvasLocalAgentPanel embedded compact />
                </motion.aside>
            </motion.div>
        </>
    );
}

function AgentTabButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <Tooltip title={label}>
            <button type="button" className={`grid size-8 place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10 ${active ? "bg-black/5 dark:bg-white/10" : "opacity-55 hover:opacity-100"}`} onClick={onClick} aria-label={label}>
                {children}
            </button>
        </Tooltip>
    );
}
