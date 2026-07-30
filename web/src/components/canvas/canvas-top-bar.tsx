import { useEffect, useRef, useState } from "react";
import {
    BookOpen,
    Download,
    HelpCircle,
    Home,
    Images,
    Menu,
    PanelsTopLeft,
    Plus,
    Redo2,
    Share2,
    Sparkles,
    Trash2,
    Undo2,
    Upload,
    WandSparkles,
    Workflow,
} from "lucide-react";
import { Button, Dropdown, Modal, Segmented, Tooltip } from "antd";

import { AccountCreditMenu } from "@/components/layout/account-credit-menu";
import { DOCS_URL } from "@/constant/env";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export type CanvasViewMode = "workflow" | "storyboard";

export function CanvasTopBar({
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    onHome,
    onProjects,
    onCreateProject,
    onDeleteProject,
    onExportProject,
    onImportImage,
    onOpenPlugins,
    onUndo,
    onRedo,
    agentOpen,
    compactAgentStatus,
    onToggleAgent,
    viewMode,
    onViewModeChange,
}: {
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onExportProject: () => void;
    onImportImage: () => void;
    onOpenPlugins: () => void;
    onUndo: () => void;
    onRedo: () => void;
    agentOpen: boolean;
    compactAgentStatus: { connected: boolean; enabled: boolean; activity: string };
    onToggleAgent: () => void;
    viewMode: CanvasViewMode;
    onViewModeChange: (mode: CanvasViewMode) => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    const menuItems = [
        { key: "home", icon: <Home className="size-4" />, label: "主页", onClick: onHome },
        { key: "projects", icon: <Images className="size-4" />, label: "我的画布", onClick: onProjects },
        { key: "new", icon: <Plus className="size-4" />, label: "新建画布", onClick: onCreateProject },
        { type: "divider" as const },
        { key: "import", icon: <Upload className="size-4" />, label: "导入素材", onClick: onImportImage },
        { key: "export", icon: <Download className="size-4" />, label: "导出画布", onClick: onExportProject },
        { key: "docs", icon: <BookOpen className="size-4" />, label: "文档", onClick: () => window.open(DOCS_URL, "_blank", "noopener,noreferrer") },
        { key: "shortcuts", icon: <HelpCircle className="size-4" />, label: "快捷键", onClick: () => setShortcutsOpen(true) },
        { type: "divider" as const },
        { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text="撤销" shortcut="⌘ Z" />, onClick: onUndo },
        { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text="重做" shortcut="⌘ ⇧ Z" />, onClick: onRedo },
        { type: "divider" as const },
        { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: "删除当前画布", onClick: onDeleteProject },
    ];

    return (
        <>
            <header className="pointer-events-none absolute left-0 right-0 top-0 z-[70] flex h-16 items-center justify-between gap-4 px-4">
                <div className="pointer-events-auto flex h-10 min-w-0 items-center gap-2 rounded-lg border px-2 shadow-lg backdrop-blur-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                    <button type="button" className="flex shrink-0 items-center text-sm font-semibold" onClick={onHome} aria-label="返回主页">
                        <span
                            className="size-6 shrink-0 bg-current"
                            style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }}
                        />
                    </button>
                    <span className="h-5 w-px" style={{ background: theme.toolbar.border }} />
                    <Dropdown trigger={["click"]} menu={{ items: menuItems }}>
                        <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10" aria-label="打开画布菜单">
                            <Menu className="size-4" />
                        </button>
                    </Dropdown>
                    <div ref={titleRef} className="min-w-0">
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                className="w-[clamp(120px,22vw,300px)] bg-transparent p-0 text-sm font-medium outline-none"
                            />
                        ) : (
                            <button type="button" className="max-w-[clamp(120px,22vw,300px)] truncate border-b border-dashed border-transparent text-left text-sm font-medium opacity-80 transition hover:border-current hover:opacity-100" onDoubleClick={onStartTitleEditing} title="双击修改画布名称">
                                {title}
                            </button>
                        )}
                    </div>
                </div>

                <div className="pointer-events-auto absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border p-0.5 shadow-lg backdrop-blur-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                    <Segmented
                        size="small"
                        value={viewMode}
                        onChange={(value) => onViewModeChange(value as CanvasViewMode)}
                        options={[
                            { value: "workflow", label: <span className="inline-flex items-center gap-1.5 px-1"><Workflow className="size-3.5" />工作流</span> },
                            { value: "storyboard", label: <span className="inline-flex items-center gap-1.5 px-1"><PanelsTopLeft className="size-3.5" />故事板</span> },
                        ]}
                    />
                </div>

                <div className="pointer-events-auto flex h-10 shrink-0 items-center gap-1 rounded-lg border px-1 shadow-lg backdrop-blur-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                    <AccountCreditMenu compact style={{ color: theme.node.text }} />
                    <span className="mx-0.5 h-5 w-px" style={{ background: theme.toolbar.border }} />
                    <Tooltip title="Skill 与节点插件">
                        <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={{ color: theme.node.text }} icon={<WandSparkles className="size-4" />} onClick={onOpenPlugins} aria-label="Skill 与节点插件" />
                    </Tooltip>
                    <Tooltip title="导出与分享">
                        <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={{ color: theme.node.text }} icon={<Share2 className="size-4" />} onClick={onExportProject} aria-label="导出与分享" />
                    </Tooltip>
                    <Tooltip title={agentOpen ? "收起创作导演" : "打开创作导演"}>
                        <Button
                            type="text"
                            shape="circle"
                            className="!relative !h-8 !w-8 !min-w-8"
                            style={{ background: agentOpen ? theme.toolbar.activeBg : "transparent", color: agentOpen ? theme.toolbar.activeText : theme.node.text }}
                            icon={<Sparkles className="size-4" />}
                            onClick={onToggleAgent}
                            aria-label="创作导演"
                        >
                            <span className="absolute right-1 top-1 size-1.5 rounded-full" style={{ background: compactAgentStatus.connected ? "#22c55e" : compactAgentStatus.enabled ? "#f59e0b" : theme.node.faint }} />
                        </Button>
                    </Tooltip>
                </div>
            </header>

            <Modal title="快捷键" open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-2 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut keys="拖动画布" value="平移视图" />
                    <Shortcut keys="滚轮" value="缩放画布" />
                    <Shortcut keys="Ctrl / Cmd + 拖动" value="框选节点" />
                    <Shortcut keys="Ctrl / Cmd + C / V" value="复制 / 粘贴" />
                    <Shortcut keys="Delete / Backspace" value="删除选中" />
                    <Shortcut keys="Esc" value="取消选择" />
                </div>
            </Modal>
        </>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return <span className="flex min-w-36 items-center justify-between gap-8"><span>{text}</span><span className="text-xs opacity-45">{shortcut}</span></span>;
}

function Shortcut({ keys, value }: { keys: string; value: string }) {
    return <div className="flex items-center justify-between gap-5 py-1.5"><kbd className="rounded-md border px-2 py-1 text-xs">{keys}</kbd><span className="opacity-55">{value}</span></div>;
}
