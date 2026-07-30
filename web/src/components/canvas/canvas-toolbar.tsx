import type { ReactNode } from "react";
import { useState } from "react";
import { Popover, Segmented, Switch, Tooltip } from "antd";
import {
    Clapperboard,
    CircleDot,
    Eraser,
    FileText,
    Grid2x2,
    Group,
    History,
    Image as ImageIcon,
    Info,
    Layers3,
    Library,
    Moon,
    MousePointer2,
    Music2,
    Palette,
    Plus,
    Puzzle,
    Redo2,
    Scissors,
    Square,
    Sun,
    Trash2,
    Type,
    Undo2,
    Upload,
    Video,
    Workflow,
    X,
} from "lucide-react";

import { canvasThemes, type CanvasBackgroundMode, type CanvasTheme } from "@/lib/canvas-theme";
import { getNodePluginId, listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasToolbar({
    selectedCount,
    canUndo,
    canRedo,
    backgroundMode,
    showImageInfo,
    onAddImage,
    onAddVideo,
    onAddAudio,
    onAddText,
    onAddConfig,
    onAddVideoComposer,
    onAddScript,
    onAddGroup,
    onAddExtensionNode,
    onOpenDirector,
    onOpenAssetPicker,
    onUndo,
    onRedo,
    onUpload,
    onDelete,
    onClear,
    onDeselect,
    onBackgroundModeChange,
    onShowImageInfoChange,
}: {
    selectedCount: number;
    canUndo: boolean;
    canRedo: boolean;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddConfig: () => void;
    onAddVideoComposer: () => void;
    onAddScript: () => void;
    onAddGroup: () => void;
    onAddExtensionNode: (type: string) => void;
    onOpenDirector: () => void;
    onOpenAssetPicker: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onUpload: () => void;
    onDelete: () => void;
    onClear: () => void;
    onDeselect: () => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const sidePanelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const toggleSidePanel = useCanvasSidePanelStore((state) => state.togglePanel);
    const [createOpen, setCreateOpen] = useState(false);
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    useNodeRegistryVersion();
    const extensionDefs = listNodeDefinitions().filter((def) => def.showInCreateMenu !== false && getNodePluginId(def.type) !== "builtin");

    const runCreate = (action: () => void) => {
        action();
        setCreateOpen(false);
    };

    const createMenu = (
        <div className="w-[196px] p-1" data-canvas-no-zoom>
            <PanelLabel>添加节点</PanelLabel>
            <div className="grid grid-cols-1 gap-0.5">
                <MenuButton icon={<Type className="size-4" />} label="文本" onClick={() => runCreate(onAddText)} />
                <MenuButton icon={<ImageIcon className="size-4" />} label="图片" onClick={() => runCreate(onAddImage)} />
                <MenuButton icon={<Video className="size-4" />} label="视频" onClick={() => runCreate(onAddVideo)} />
                <MenuButton icon={<Scissors className="size-4" />} label="视频合成" badge="Beta" onClick={() => runCreate(onAddVideoComposer)} />
                <MenuButton icon={<Clapperboard className="size-4" />} label="导演台" badge="NEW" onClick={() => runCreate(onOpenDirector)} />
                <MenuButton icon={<Music2 className="size-4" />} label="音频" onClick={() => runCreate(onAddAudio)} />
                <MenuButton icon={<FileText className="size-4" />} label="脚本" onClick={() => runCreate(onAddScript)} />
                <MenuButton icon={<Library className="size-4" />} label="素材库" onClick={() => runCreate(toggleSidePanel)} />
                <MenuButton icon={<Group className="size-4" />} label="分组" onClick={() => runCreate(onAddGroup)} />
                {extensionDefs.map((def) => (
                    <MenuButton key={def.type} icon={def.icon || <Puzzle className="size-4" />} label={def.title} onClick={() => runCreate(() => onAddExtensionNode(def.type))} />
                ))}
            </div>
            <div className="my-2 h-px bg-border" />
            <PanelLabel>添加资源</PanelLabel>
            <MenuButton icon={<Upload className="size-4" />} label="上传素材" onClick={() => runCreate(onUpload)} />
            <MenuButton icon={<History className="size-4" />} label="从资产库选择" onClick={() => runCreate(onOpenAssetPicker)} />
            <div className="my-2 h-px bg-border" />
            <MenuButton icon={<Eraser className="size-4" />} label="清空画布" danger onClick={() => runCreate(onClear)} />
        </div>
    );

    const appearanceMenu = (
        <div className="w-[252px] p-1" data-canvas-no-zoom>
            <PanelLabel>画布外观</PanelLabel>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/5 p-1 dark:bg-white/5">
                <ThemeButton active={colorTheme === "light"} onClick={() => setTheme("light")}>
                    <Sun className="size-4" />浅色
                </ThemeButton>
                <ThemeButton active={colorTheme === "dark"} onClick={() => setTheme("dark")}>
                    <Moon className="size-4" />深色
                </ThemeButton>
            </div>
            <div className="mt-3 px-1 pb-1.5 text-[11px] font-medium opacity-50">背景网格</div>
            <Segmented
                block
                size="small"
                value={backgroundMode}
                onChange={(value) => onBackgroundModeChange(value as CanvasBackgroundMode)}
                options={[
                    { value: "dots", label: <span className="inline-flex items-center gap-1"><CircleDot className="size-3.5" />点</span> },
                    { value: "lines", label: <span className="inline-flex items-center gap-1"><Grid2x2 className="size-3.5" />线</span> },
                    { value: "blank", label: <span className="inline-flex items-center gap-1"><Square className="size-3.5" />空白</span> },
                ]}
            />
            <label className="mt-3 flex h-9 items-center justify-between rounded-lg px-2 text-xs">
                <span className="inline-flex items-center gap-2"><Info className="size-3.5" />显示图片信息</span>
                <Switch size="small" checked={showImageInfo} onChange={onShowImageInfoChange} />
            </label>
        </div>
    );

    return (
        <>
            <div className="pointer-events-none absolute bottom-5 left-5 z-[65]" data-canvas-no-zoom>
                <button
                    type="button"
                    className="pointer-events-auto flex h-10 items-center gap-2 rounded-md px-2.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: sidePanelOpen ? theme.node.text : theme.toolbar.item }}
                    onClick={toggleSidePanel}
                >
                    <Layers3 className="size-4" />
                    <span>资产管理</span>
                </button>
            </div>
            <div className="pointer-events-none absolute bottom-5 right-12 z-[65]" data-canvas-no-zoom>
            <div
                className="pointer-events-auto flex h-12 items-center gap-1 rounded-lg border p-1.5 shadow-2xl backdrop-blur-xl"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <PopoverShell open={createOpen} onOpenChange={setCreateOpen} content={createMenu}>
                    <RailButton label="创建节点" prominent active={createOpen} theme={theme}>
                        {createOpen ? <X className="size-5" /> : <Plus className="size-5" />}
                    </RailButton>
                </PopoverShell>
                <RailButton label="选择工具" active={!selectedCount} theme={theme} onClick={onDeselect}>
                    <MousePointer2 className="size-[18px]" />
                </RailButton>
                <RailButton label="生成配置" theme={theme} onClick={onAddConfig}>
                    <Workflow className="size-[18px]" />
                </RailButton>
                <RailButton label="图片节点" theme={theme} onClick={onAddImage}>
                    <ImageIcon className="size-[18px]" />
                </RailButton>
                <RailButton label="上传素材" theme={theme} onClick={onUpload}>
                    <Upload className="size-[18px]" />
                </RailButton>
                <div className="mx-1 h-7 w-px" style={{ background: theme.toolbar.border }} />
                <RailButton label="撤销" disabled={!canUndo} theme={theme} onClick={onUndo}>
                    <Undo2 className="size-[18px]" />
                </RailButton>
                <RailButton label="重做" disabled={!canRedo} theme={theme} onClick={onRedo}>
                    <Redo2 className="size-[18px]" />
                </RailButton>
                <PopoverShell open={appearanceOpen} onOpenChange={setAppearanceOpen} content={appearanceMenu}>
                    <RailButton label="画布外观" active={appearanceOpen} theme={theme}>
                        <Palette className="size-[18px]" />
                    </RailButton>
                </PopoverShell>
                {selectedCount ? (
                    <RailButton label={`删除选中的 ${selectedCount} 个节点`} danger theme={theme} onClick={onDelete}>
                        <Trash2 className="size-[18px]" />
                    </RailButton>
                ) : null}
            </div>
        </div>
        </>
    );
}

function PopoverShell({ open, onOpenChange, content, children }: { open: boolean; onOpenChange: (open: boolean) => void; content: ReactNode; children: ReactNode }) {
    return (
        <Popover placement="topLeft" trigger="click" open={open} onOpenChange={onOpenChange} content={content} styles={{ container: { padding: 6, borderRadius: 8 } }}>
            <span>{children}</span>
        </Popover>
    );
}

function RailButton({ label, theme, active, prominent, danger, disabled, onClick, children }: { label: string; theme: CanvasTheme; active?: boolean; prominent?: boolean; danger?: boolean; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
    const style = prominent
        ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText }
        : active
          ? { background: theme.toolbar.itemHover, color: theme.node.text }
          : danger
            ? { color: "#ef4444" }
            : { color: theme.toolbar.item };
    return (
        <Tooltip title={label} placement="right">
            <button
                type="button"
                className="grid size-9 place-items-center rounded-md transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-25 dark:hover:bg-white/10"
                style={style}
                disabled={disabled}
                onClick={onClick}
                aria-label={label}
            >
                {children}
            </button>
        </Tooltip>
    );
}

function PanelLabel({ children }: { children: ReactNode }) {
    return <div className="px-2 pb-2 pt-1 text-xs font-medium opacity-55">{children}</div>;
}

function MenuButton({ icon, label, badge, danger, onClick }: { icon: ReactNode; label: string; badge?: string; danger?: boolean; onClick: () => void }) {
    return (
        <button type="button" className={`flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs transition hover:bg-black/5 dark:hover:bg-white/10 ${danger ? "text-red-500" : ""}`} onClick={onClick}>
            <span className="grid size-5 shrink-0 place-items-center">{icon}</span>
            <span className="truncate">{label}</span>
            {badge ? <span className="ml-auto rounded border px-1 py-0.5 text-[9px] leading-none opacity-55">{badge}</span> : null}
        </button>
    );
}

function ThemeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-xs transition ${active ? "bg-background shadow-sm" : "opacity-55 hover:opacity-100"}`}>
            {children}
        </button>
    );
}
