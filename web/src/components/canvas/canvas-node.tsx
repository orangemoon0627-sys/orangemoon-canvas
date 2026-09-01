import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, FileText, Group, Image as ImageIcon, Images, LoaderCircle, Music2, Plus, Puzzle, RefreshCw, Star, Video, Wrench } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { buildNodeContext } from "@/lib/canvas/plugin-node-context";
import { estimateGenerationProgress, formatGenerationEta } from "@/lib/canvas/canvas-generation-progress";
import { resolveMediaUrl } from "@/services/file-storage";
import { getActiveWorkspaceId } from "@/services/workspace-session";
import { canvasVideoPreload } from "@/lib/canvas/video-playback";
import { playableCanvasVideoUrl } from "@/lib/canvas/video-url";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasNodeType, type CanvasNodeData, type Position } from "@/types/canvas";
import type { CanvasNodeContext, CanvasPluginHost } from "@/types/canvas-plugin";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type CanvasNodeProps = {
    data: CanvasNodeData;
    scale: number;
    isSelected: boolean;
    isRelated: boolean;
    isFocusRelated: boolean;
    isConnectionTarget: boolean;
    isConnecting: boolean;
    editRequestNonce?: number;
    showPanel: boolean;
    showImageInfo: boolean;
    mentionReferences?: CanvasResourceReference[];
    pluginHost?: CanvasPluginHost;
    registryVersion?: number;
    renderPanel?: (node: CanvasNodeData) => ReactNode;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    batchCount?: number;
    groupChildCount?: number;
    isGroupDropTarget?: boolean;
    batchExpanded?: boolean;
    batchClosing?: boolean;
    batchOpening?: boolean;
    batchRecovering?: boolean;
    batchMotion?: { x: number; y: number; index: number };
    onMouseDown: (event: React.MouseEvent, nodeId: string) => void;
    onSelectCapture?: (event: React.MouseEvent, nodeId: string) => void;
    onHoverStart: (nodeId: string) => void;
    onHoverEnd: (nodeId: string) => void;
    onConnectStart: (event: React.MouseEvent, nodeId: string, handleType: "source" | "target") => void;
    onResize: (nodeId: string, width: number, height: number, position?: Position) => void;
    onContentChange: (nodeId: string, content: string) => void;
    onTitleChange: (nodeId: string, title: string) => void;
    onToggleBatch?: (nodeId: string) => void;
    onSetBatchPrimary?: (node: CanvasNodeData) => void;
    onRetry?: (node: CanvasNodeData) => void;
    onRepairVideo?: (node: CanvasNodeData) => Promise<void>;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onOpenPanel?: (node: CanvasNodeData) => void;
    onViewImage?: (node: CanvasNodeData) => void;
    onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
};

type NodeContentRendererProps = {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    isSelected: boolean;
    isEditingContent: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    pluginContext?: CanvasNodeContext | null;
    onContentChange: (nodeId: string, content: string) => void;
    onStopEditing: () => void;
    mentionReferences: CanvasResourceReference[];
    onRetry?: (node: CanvasNodeData) => void;
    onRepairVideo?: (node: CanvasNodeData) => Promise<void>;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onOpenPanel?: (node: CanvasNodeData) => void;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
    groupChildCount: number;
};

export const CanvasNode = React.memo(function CanvasNode({
    data,
    scale,
    isSelected,
    isRelated,
    isFocusRelated,
    isConnectionTarget,
    isConnecting,
    editRequestNonce = 0,
    showPanel,
    showImageInfo,
    mentionReferences = [],
    pluginHost,
    renderPanel,
    renderNodeContent,
    batchCount = 0,
    groupChildCount = 0,
    isGroupDropTarget = false,
    batchExpanded = false,
    batchClosing = false,
    batchOpening = false,
    batchRecovering = false,
    batchMotion,
    onMouseDown,
    onSelectCapture,
    onHoverStart,
    onHoverEnd,
    onConnectStart,
    onResize,
    onContentChange,
    onTitleChange,
    onToggleBatch,
    onSetBatchPrimary,
    onRetry,
    onRepairVideo,
    onGenerateImage,
    onOpenPanel,
    onViewImage,
    onContextMenu,
}: CanvasNodeProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [hovered, setHovered] = useState(false);
    const definition = getNodeDefinition(data.type);
    const pluginContext = useMemo<CanvasNodeContext | null>(() => (pluginHost ? buildNodeContext(pluginHost, data, theme, scale, isSelected) : null), [pluginHost, data, theme, scale, isSelected]);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(data.title || "");
    const hasImageContent = data.type === CanvasNodeType.Image && Boolean(data.metadata?.content);
    const hasVideoContent = data.type === CanvasNodeType.Video && Boolean(data.metadata?.content);
    const isGroup = data.type === CanvasNodeType.Group;
    const isBatchRoot = data.type === CanvasNodeType.Image && Boolean(data.metadata?.isBatchRoot) && batchCount > 1;
    // 支持「交互/移动」开关的节点:移动态(默认)内容不吃指针,拖动整块;交互态内容可操作。
    // forceInteractive(如编辑态)强制可交互;空态(无内容)始终可交互,避免上传/生成按钮点不动。
    const supportsInteractionToggle = Boolean(definition?.interactionToggle);
    const forceInteractive = supportsInteractionToggle ? Boolean(definition?.forceInteractive?.(data)) : false;
    const contentInteractive = !supportsInteractionToggle || forceInteractive || !data.metadata?.content ? true : Boolean(data.metadata?.interactive);
    const isBatchChild = data.type === CanvasNodeType.Image && Boolean(data.metadata?.batchRootId);
    // 透明背景节点(如 SVG):卡片背景/边框透明,直接融入画布;选中/关联态仍显示描边以便定位
    const transparentBg = Boolean(definition?.transparentBackground);
    const isActive = isConnectionTarget || isSelected || isFocusRelated;
    const imageBorderColor = isActive ? theme.node.activeStroke : isRelated && !isBatchChild ? theme.node.muted : theme.node.stroke;
    const mediaSizeLabel = getMediaSizeLabel(data);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const resizeRef = useRef({
        isResizing: false,
        corner: "bottom-right" as ResizeCorner,
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0,
        startWidth: 0,
        startHeight: 0,
        keepRatio: false,
        ratio: 1,
    });

    useEffect(() => {
        setTitleDraft(data.title || "");
    }, [data.title]);

    useEffect(() => {
        if (!isEditingTitle) return;
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
    }, [isEditingTitle]);

    const finishTitleEditing = useCallback(() => {
        const title = titleDraft.trim() || data.title || "未命名节点";
        setTitleDraft(title);
        setIsEditingTitle(false);
        if (title !== data.title) onTitleChange(data.id, title);
    }, [data.id, data.title, onTitleChange, titleDraft]);

    useEffect(() => {
        if (!isEditingTitle) return;
        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && titleInputRef.current?.contains(target)) return;
            finishTitleEditing();
        };
        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [finishTitleEditing, isEditingTitle]);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const handleWheel = (event: WheelEvent) => event.stopPropagation();
        textarea.addEventListener("wheel", handleWheel, { passive: false });
        return () => textarea.removeEventListener("wheel", handleWheel);
    }, [data.type, isEditingContent]);

    useEffect(() => {
        if (!isEditingContent) return;
        const textarea = textareaRef.current;
        textarea?.focus();
        textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    }, [isEditingContent]);

    useEffect(() => {
        if (!editRequestNonce || data.type !== CanvasNodeType.Text) return;
        setIsEditingContent(true);
    }, [data.type, editRequestNonce]);

    useEffect(() => {
        if (!isEditingContent) return;

        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (isEditingContent && textareaRef.current?.contains(target)) return;

            setIsEditingContent(false);
        };

        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [isEditingContent]);

    const handleResizeMove = useCallback(
        (event: MouseEvent) => {
            if (!resizeRef.current.isResizing) return;

            const dx = (event.clientX - resizeRef.current.startX) / scale;
            const dy = (event.clientY - resizeRef.current.startY) / scale;
            const minWidth = 220;
            const minHeight = 160;
            const startRight = resizeRef.current.startLeft + resizeRef.current.startWidth;
            const startBottom = resizeRef.current.startTop + resizeRef.current.startHeight;
            const fromLeft = resizeRef.current.corner.includes("left");
            const fromTop = resizeRef.current.corner.includes("top");
            const rawWidth = Math.max(minWidth, resizeRef.current.startWidth + (fromLeft ? -dx : dx));
            const rawHeight = Math.max(minHeight, resizeRef.current.startHeight + (fromTop ? -dy : dy));
            let width = rawWidth;
            let height = rawHeight;
            if (resizeRef.current.keepRatio) {
                const ratio = resizeRef.current.ratio;
                if (Math.abs(dx) >= Math.abs(dy)) {
                    height = width / ratio;
                } else {
                    width = height * ratio;
                }
                if (height < minHeight) {
                    height = minHeight;
                    width = height * ratio;
                }
                if (width < minWidth) {
                    width = minWidth;
                    height = width / ratio;
                }
            }

            onResize(data.id, width, height, {
                x: fromLeft ? startRight - width : resizeRef.current.startLeft,
                y: fromTop ? startBottom - height : resizeRef.current.startTop,
            });
        },
        [data.id, onResize, scale],
    );

    const handleResizeUp = useCallback(() => {
        resizeRef.current.isResizing = false;
        window.removeEventListener("mousemove", handleResizeMove);
        window.removeEventListener("mouseup", handleResizeUp);
    }, [handleResizeMove]);

    const handleResizeMouseDown = (event: React.MouseEvent, corner: ResizeCorner) => {
        event.stopPropagation();
        event.preventDefault();
        resizeRef.current = {
            isResizing: true,
            corner,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: data.position.x,
            startTop: data.position.y,
            startWidth: data.width,
            startHeight: data.height,
            keepRatio: (data.type === CanvasNodeType.Image && !data.metadata?.freeResize) || data.type === CanvasNodeType.Video || Boolean(definition?.keepAspectRatio?.(data)),
            ratio: (data.metadata?.naturalWidth || data.width) / (data.metadata?.naturalHeight || data.height || 1),
        };
        window.addEventListener("mousemove", handleResizeMove);
        window.addEventListener("mouseup", handleResizeUp);
    };

    useEffect(() => {
        return () => {
            window.removeEventListener("mousemove", handleResizeMove);
            window.removeEventListener("mouseup", handleResizeUp);
        };
    }, [handleResizeMove, handleResizeUp]);

    return (
        <div
            data-node-id={data.id}
            className={`node-element absolute flex select-none flex-col transition-shadow duration-200 ${isGroup ? "z-[5]" : isSelected ? "z-50" : "z-10"}`}
            style={{
                transform: `translate(${data.position.x}px, ${data.position.y}px)`,
                width: data.width,
                height: data.height,
                transition: "box-shadow 200ms ease",
                contain: "layout style",
            }}
            onMouseEnter={() => {
                setHovered(true);
                onHoverStart(data.id);
            }}
            onMouseLeave={() => {
                setHovered(false);
                onHoverEnd(data.id);
            }}
            onMouseDownCapture={(event) => onSelectCapture?.(event, data.id)}
            onContextMenu={(event) => onContextMenu(event, data.id)}
        >
            {!isGroup ? (
                <div className="absolute left-0 top-[-24px] z-[65] flex h-5 w-full min-w-0 items-center gap-1.5" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    <span className="grid size-3.5 shrink-0 place-items-center opacity-60 [&>svg]:size-3">{definition?.icon || (data.type === CanvasNodeType.Text ? <FileText className="size-3" /> : null)}</span>
                    {isEditingTitle ? (
                        <input
                            ref={titleInputRef}
                            value={titleDraft}
                            maxLength={64}
                            className="h-5 min-w-0 flex-1 border-0 border-b border-dashed bg-transparent px-0 text-left text-[11px] font-medium outline-none"
                            style={{ borderColor: theme.node.muted, color: theme.node.text }}
                            onChange={(event) => setTitleDraft(event.target.value)}
                            onBlur={finishTitleEditing}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") finishTitleEditing();
                                if (event.key === "Escape") {
                                    setTitleDraft(data.title || "");
                                    setIsEditingTitle(false);
                                }
                            }}
                        />
                    ) : (
                        <button
                            type="button"
                            className="block min-w-0 flex-1 truncate border-b border-dashed border-transparent px-0 py-0.5 text-left text-[11px] font-medium opacity-75 transition hover:border-current hover:opacity-100"
                            style={{ color: theme.node.text }}
                            title="双击修改节点名称"
                            onDoubleClick={(event) => {
                                event.stopPropagation();
                                setIsEditingTitle(true);
                            }}
                        >
                            {data.title || "未命名节点"}
                        </button>
                    )}
                    {mediaSizeLabel ? <span className="ml-auto shrink-0 text-[10px] opacity-45">{mediaSizeLabel}</span> : null}
                </div>
            ) : null}

            <div
                className="relative h-full w-full overflow-visible rounded-md border"
                style={{
                    background: isGroup ? `${theme.toolbar.panel}66` : hasImageContent || hasVideoContent || transparentBg ? "transparent" : theme.node.fill,
                    borderColor: isGroup
                        ? isGroupDropTarget || isActive
                            ? theme.node.activeStroke
                            : theme.node.stroke
                        : hasImageContent
                          ? imageBorderColor
                          : isActive
                            ? theme.node.activeStroke
                            : isRelated
                              ? theme.node.muted
                              : transparentBg
                                ? "transparent"
                                : theme.node.stroke,
                    borderStyle: isGroup ? "dashed" : "solid",
                    boxShadow: isGroupDropTarget
                        ? `0 0 0 2px ${theme.node.activeStroke}55, inset 0 0 0 999px ${theme.node.activeStroke}0d`
                        : isActive
                          ? `0 0 0 1px ${theme.node.activeStroke}44, 0 8px 22px rgba(0,0,0,.10)`
                          : isRelated && !isBatchChild
                            ? `0 0 0 1px ${theme.node.muted}44`
                            : undefined,
                }}
                onMouseDown={(event) => onMouseDown(event, data.id)}
                onDoubleClick={(event) => {
                    if (isBatchRoot) {
                        event.stopPropagation();
                        onToggleBatch?.(data.id);
                        return;
                    }
                    if (definition?.onDoubleClick && pluginContext) {
                        if (definition.onDoubleClick(pluginContext)) event.stopPropagation();
                        return;
                    }
                    if (data.type === CanvasNodeType.Image && hasImageContent) {
                        event.stopPropagation();
                        onViewImage?.(data);
                        return;
                    }
                    if (data.type !== CanvasNodeType.Text) return;
                    event.stopPropagation();
                    setIsEditingContent(true);
                }}
            >
                <div
                    className={`relative flex h-full w-full items-center justify-center rounded-[inherit] ${isBatchRoot ? "overflow-visible" : "overflow-hidden"}`}
                    style={
                        {
                            background: isGroup ? "transparent" : hasImageContent || hasVideoContent || transparentBg ? "transparent" : theme.node.fill,
                            pointerEvents: contentInteractive ? undefined : "none",
                            "--batch-from-x": `${batchMotion?.x || 0}px`,
                            "--batch-from-y": `${batchMotion?.y || 0}px`,
                            "--batch-from-rotate": `${6 + (batchMotion?.index || 0) * 4}deg`,
                            animation: data.metadata?.batchRootId ? (batchClosing ? "canvas-batch-child-out 260ms cubic-bezier(.4,0,.2,1) both" : "canvas-batch-child-in 340ms cubic-bezier(.2,.85,.18,1) both") : undefined,
                            animationDelay: data.metadata?.batchRootId ? `${batchClosing ? 0 : 45 + (batchMotion?.index || 0) * 24}ms` : undefined,
                        } as React.CSSProperties
                    }
                >
                    <NodeContent
                        node={data}
                        theme={theme}
                        isSelected={isSelected}
                        isEditingContent={isEditingContent}
                        textareaRef={textareaRef}
                        isBatchRoot={isBatchRoot}
                        batchCount={batchCount}
                        batchExpanded={batchExpanded}
                        batchOpening={batchOpening}
                        batchRecovering={batchRecovering}
                        renderNodeContent={renderNodeContent}
                        pluginContext={pluginContext}
                        mentionReferences={mentionReferences}
                        onContentChange={onContentChange}
                        onStopEditing={() => setIsEditingContent(false)}
                        onRetry={onRetry}
                        onRepairVideo={onRepairVideo}
                        onGenerateImage={onGenerateImage}
                        onOpenPanel={onOpenPanel}
                        onToggleBatch={() => onToggleBatch?.(data.id)}
                        onSetBatchPrimary={() => onSetBatchPrimary?.(data)}
                        groupChildCount={groupChildCount}
                    />
                </div>

                {showImageInfo && hasImageContent ? <ImageInfoBar node={data} /> : null}

                <ResizeHandle corner="top-left" onMouseDown={handleResizeMouseDown} />
                <ResizeHandle corner="top-right" onMouseDown={handleResizeMouseDown} />
                <ResizeHandle corner="bottom-left" onMouseDown={handleResizeMouseDown} />
                <ResizeHandle corner="bottom-right" onMouseDown={handleResizeMouseDown} />
            </div>

            {!isGroup ? <ConnectionHandleDot side="left" visible={hovered || isSelected || isConnecting} onMouseDown={(event) => onConnectStart(event, data.id, "target")} /> : null}
            {!isGroup ? (
                <ConnectionHandleDot side="right" visible={(definition?.hasSourceHandle ?? true) && data.type !== CanvasNodeType.Config && (hovered || isSelected || isConnecting)} onMouseDown={(event) => onConnectStart(event, data.id, "source")} />
            ) : null}

            {showPanel && !isGroup && renderPanel ? (
                <div className="absolute left-1/2 top-full z-[70] -translate-x-1/2 pt-2.5" style={{ width: Math.max(420, Math.min(620, data.width * 1.28)) }}>
                    {renderPanel(data)}
                </div>
            ) : null}
        </div>
    );
});

function NodeContent(props: NodeContentRendererProps) {
    if (props.node.type === CanvasNodeType.Config && props.renderNodeContent) return props.renderNodeContent(props.node);
    if (props.isBatchRoot) return <ImageNodeContent {...props} />;
    if (props.node.metadata?.status === "loading") return <LoadingContent node={props.node} theme={props.theme} />;
    if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />;

    const Renderer = nodeContentRenderers[props.node.type as CanvasNodeType];
    if (Renderer) return <Renderer {...props} />;

    // 插件节点:有注册渲染器则渲染,否则展示缺少插件占位
    const definition = getNodeDefinition(props.node.type);
    if (definition?.Content && props.pluginContext) {
        const PluginContent = definition.Content;
        return <PluginContent ctx={props.pluginContext} />;
    }
    return <MissingPluginContent theme={props.theme} type={props.node.type} />;
}

const nodeContentRenderers: Partial<Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>> = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
    [CanvasNodeType.Group]: GroupNodeContent,
};

function GroupNodeContent({ node, theme, groupChildCount }: NodeContentRendererProps) {
    return (
        <div className="pointer-events-none flex h-full w-full flex-col p-4">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.node.text }}>
                <span className="grid size-8 place-items-center rounded-xl" style={{ background: theme.toolbar.activeBg, color: theme.node.muted }}>
                    <Group className="size-4" />
                </span>
                <span>组</span>
                <span className="ml-auto rounded-full px-2 py-1 text-[11px] font-medium" style={{ background: theme.node.fill, color: theme.node.muted }}>
                    {groupChildCount} 个节点
                </span>
            </div>
            <div className="mt-3 flex-1 rounded-lg border border-dashed" style={{ borderColor: theme.node.stroke, background: `${theme.node.fill}55` }} />
        </div>
    );
}

function LoadingContent({ node, theme }: Pick<NodeContentRendererProps, "node" | "theme">) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    const progress = estimateGenerationProgress(node.metadata, now);

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ color: theme.node.activeStroke }}>
            <div className="relative grid size-14 place-items-center">
                <div className="absolute inset-0 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.activeStroke }} />
                <span className="text-[11px] font-semibold tabular-nums">{progress.progress}%</span>
            </div>
            <div className="w-full max-w-52 space-y-2">
                <div className="text-xs font-medium" style={{ color: theme.node.text }}>
                    {progress.stage}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}>
                    <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${progress.progress}%`, background: theme.node.activeStroke }} />
                </div>
                <div className="text-[10px] leading-4" style={{ color: theme.node.muted }}>
                    {formatGenerationEta(progress.etaSeconds, progress.overdue)} · 预计进度
                </div>
            </div>
        </div>
    );
}

function ErrorContent({ node, theme, onRetry }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry">) {
    return (
        <div className="flex max-w-[260px] flex-col items-center gap-3 px-5 text-center">
            <div className="text-xs leading-5 text-red-300">{node.metadata?.errorDetails || "生成失败"}</div>
            <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:scale-[1.02]"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <RefreshCw className="size-3.5" />
                重试
            </button>
        </div>
    );
}

function MissingPluginContent({ theme, type }: Pick<NodeContentRendererProps, "theme"> & { type: string }) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center" style={{ color: theme.node.placeholder }}>
            <Puzzle className="size-7 opacity-40" />
            <span className="text-sm">缺少插件</span>
            <span className="text-[11px] opacity-70">节点类型 “{type}” 的插件未安装或未启用</span>
        </div>
    );
}

function TextContent({ node, theme, isEditingContent, textareaRef, mentionReferences, onContentChange, onStopEditing, onGenerateImage }: NodeContentRendererProps) {
    const fontSize = node.metadata?.fontSize || 14;
    const textStyle = { fontSize: `${fontSize}px`, lineHeight: `${Math.round(fontSize * 1.65)}px`, color: theme.node.text, boxSizing: "border-box" } as React.CSSProperties;

    return (
        <div className="flex h-full w-full flex-col overflow-hidden pt-8">
            <button
                type="button"
                className="absolute right-2 top-2 z-20 grid size-7 place-items-center rounded-md border opacity-75 backdrop-blur-md transition hover:opacity-100"
                style={{ background: `${theme.toolbar.panel}dd`, borderColor: theme.node.stroke, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onGenerateImage?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title="用文本生图"
                aria-label="用文本生图"
            >
                <ImageIcon className="size-3.5" />
            </button>
            {isEditingContent ? (
                <CanvasResourceMentionTextarea
                    ref={textareaRef}
                    className="thin-scrollbar block h-full w-full resize-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent pl-4 pr-14 pt-0 pb-4 m-0 font-mono outline-none select-text appearance-none"
                    style={textStyle}
                    value={node.metadata?.content || ""}
                    references={mentionReferences}
                    highlightLabels={false}
                    onChange={(value) => onContentChange(node.id, value)}
                    onBlur={onStopEditing}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") onStopEditing();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                />
            ) : (
                <div className="thin-scrollbar block h-full w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent pl-4 pr-14 pt-0 pb-4 font-mono" style={textStyle} onWheel={(event) => event.stopPropagation()}>
                    {node.metadata?.content || <span style={{ color: theme.node.placeholder }}>双击编辑文字</span>}
                </div>
            )}
        </div>
    );
}

function ImageNodeContent(props: NodeContentRendererProps) {
    if (!props.node.metadata?.content && props.isBatchRoot) {
        const content =
            props.node.metadata?.status === "loading" ? (
                <LoadingContent node={props.node} theme={props.theme} />
            ) : props.node.metadata?.status === "error" ? (
                <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />
            ) : (
                <EmptyImageContent {...props} isBatchRoot={false} />
            );
        return (
            <BatchFrame batchCount={props.batchCount} batchExpanded={props.batchExpanded} batchOpening={props.batchOpening} batchRecovering={props.batchRecovering} onToggleBatch={props.onToggleBatch}>
                {content}
            </BatchFrame>
        );
    }
    if (!props.node.metadata?.content) return <EmptyImageContent {...props} />;

    return (
        <ImageContent
            node={props.node}
            isBatchRoot={props.isBatchRoot}
            batchCount={props.batchCount}
            batchExpanded={props.batchExpanded}
            batchOpening={props.batchOpening}
            batchRecovering={props.batchRecovering}
            onToggleBatch={props.onToggleBatch}
            onSetBatchPrimary={props.onSetBatchPrimary}
        />
    );
}

function EmptyImageContent({ theme, isBatchRoot, batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch }: NodeContentRendererProps) {
    const content = (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
            <div className="flex size-9 items-center justify-center rounded-md border" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
                <ImageIcon className="size-4 opacity-45" />
            </div>
            <span className="text-[11px] opacity-65">图片生成</span>
        </div>
    );
    if (isBatchRoot)
        return (
            <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
                {content}
            </BatchFrame>
        );
    return content;
}

function VideoNodeContent({ node, theme, isSelected, onOpenPanel, onRepairVideo }: NodeContentRendererProps) {
    const [source, setSource] = useState("");
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [repairing, setRepairing] = useState(false);
    const [reloadNonce, setReloadNonce] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const content = node.metadata?.content || "";
    const storageKey = node.metadata?.storageKey || "";

    useEffect(() => {
        let active = true;
        setLoadState("loading");
        setIsPlaying(false);
        if (content) {
            setSource(
                playableCanvasVideoUrl(
                    content,
                    getActiveWorkspaceId(),
                    window.location.origin,
                ),
            );
            return () => {
                active = false;
            };
        }
        if (!storageKey) {
            setSource("");
            return () => {
                active = false;
            };
        }
        void resolveMediaUrl(storageKey).then((url) => {
            if (!active) return;
            setSource(url);
            if (!url) setLoadState("error");
        });
        return () => {
            active = false;
        };
    }, [content, reloadNonce, storageKey]);

    if (!content && !storageKey)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 px-5" style={{ color: theme.node.placeholder }}>
                <Video className="size-5 opacity-50" />
                <div className="grid w-full max-w-[250px] grid-cols-2 gap-2">
                    <EmptyVideoAction icon={<ImageIcon className="size-3.5" />} label="首帧生成视频" theme={theme} onClick={() => onOpenPanel?.(node)} />
                    <EmptyVideoAction icon={<Images className="size-3.5" />} label="首尾帧生成视频" theme={theme} onClick={() => onOpenPanel?.(node)} />
                </div>
            </div>
        );
    const canRepair = /^https?:\/\//i.test(content) && !content.includes("/platform-api/canvas-media/") && Boolean(onRepairVideo);
    return (
        <div className="relative h-full w-full overflow-hidden rounded-md bg-black">
            {source ? (
                <video
                    key={`${source}:${reloadNonce}`}
                    src={source}
                    controls
                    preload={canvasVideoPreload(isSelected, isPlaying)}
                    className="h-full w-full object-contain"
                    data-canvas-no-zoom
                    onLoadedMetadata={() => setLoadState("ready")}
                    onCanPlay={() => setLoadState("ready")}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    onError={() => setLoadState("error")}
                />
            ) : null}
            {loadState === "loading" ? (
                <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/65 text-white">
                    <div className="flex items-center gap-2 text-xs">
                        <LoaderCircle className="size-4 animate-spin" />
                        正在载入视频
                    </div>
                </div>
            ) : null}
            {loadState === "error" ? (
                <div className="absolute inset-0 grid place-items-center bg-black/80 px-5 text-center text-white">
                    <div className="space-y-3">
                        <div>
                            <div className="text-xs font-medium">视频无法加载</div>
                            <div className="mt-1 text-[10px] text-white/55">{canRepair ? "可迁移到橙月媒体库后继续播放" : "请检查网络后重新载入"}</div>
                        </div>
                        <button
                            type="button"
                            disabled={repairing}
                            className="mx-auto flex h-8 items-center gap-1.5 border border-white/20 px-3 text-xs transition hover:bg-white/10 disabled:opacity-50"
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={async (event) => {
                                event.stopPropagation();
                                if (!canRepair) {
                                    setLoadState("loading");
                                    setReloadNonce((value) => value + 1);
                                    return;
                                }
                                setRepairing(true);
                                try {
                                    await onRepairVideo?.(node);
                                } catch {
                                    setLoadState("error");
                                } finally {
                                    setRepairing(false);
                                }
                            }}
                        >
                            {repairing ? <LoaderCircle className="size-3.5 animate-spin" /> : canRepair ? <Wrench className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                            {repairing ? "正在修复" : canRepair ? "修复媒体" : "重新载入"}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function EmptyVideoAction({ icon, label, theme, onClick }: { icon: ReactNode; label: string; theme: NodeContentRendererProps["theme"]; onClick: () => void }) {
    return (
        <button
            type="button"
            className="flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border px-1.5 text-[10px] transition hover:brightness-110"
            style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
        >
            {icon}
            <span className="truncate">{label}</span>
        </button>
    );
}

function AudioNodeContent({ node, theme }: NodeContentRendererProps) {
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
                <Music2 className="size-7 opacity-35" />
                <span className="text-sm">空音频节点</span>
            </div>
        );
    return (
        <div className="flex h-full w-full flex-col justify-center gap-3 px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2 text-sm opacity-70">
                <Music2 className="size-4 shrink-0" />
                <span className="truncate">音频</span>
            </div>
            <audio src={node.metadata.content} controls className="w-full" data-canvas-no-zoom />
        </div>
    );
}

function ImageContent({
    node,
    isBatchRoot,
    batchCount,
    batchExpanded,
    batchOpening,
    batchRecovering,
    onToggleBatch,
    onSetBatchPrimary,
}: {
    node: CanvasNodeData;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchChild = Boolean(node.metadata?.batchRootId);

    return (
        <BatchFrame batchCount={isBatchRoot ? batchCount : 0} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
            <div className="h-full w-full overflow-hidden rounded-md">
                <img
                    src={node.metadata!.content!}
                    alt={node.title}
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
                />
            </div>
            {isBatchRoot ? (
                <button
                    type="button"
                    className="absolute right-2.5 top-2.5 z-30 flex h-8 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-semibold shadow-[0_6px_18px_rgba(15,23,42,.10)] backdrop-blur-md transition hover:scale-[1.02]"
                    style={{ background: `${theme.toolbar.panel}d9`, borderColor: `${theme.toolbar.border}cc`, color: theme.node.text }}
                    aria-label={batchExpanded ? "图片组已展开" : "图片组已收起"}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none" style={{ color: theme.node.activeStroke }}>
                        {batchCount}
                    </span>
                    <ChevronRight className={`size-3.5 opacity-55 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </button>
            ) : null}
            {isBatchChild ? (
                <button
                    type="button"
                    className="absolute right-3 top-3 z-30 flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium opacity-0 shadow-[0_8px_20px_rgba(68,64,60,.13)] backdrop-blur-md transition group-hover/batch:opacity-100 hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSetBatchPrimary?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <Star className="size-3.5" style={{ color: theme.node.activeStroke }} />
                    设为主图
                </button>
            ) : null}
        </BatchFrame>
    );
}

function ImageInfoBar({ node }: { node: CanvasNodeData }) {
    const width = Math.round(node.metadata?.naturalWidth || node.width);
    const height = Math.round(node.metadata?.naturalHeight || node.height);
    const size = formatBytes(node.metadata?.bytes || 0);
    return (
        <div className="pointer-events-none absolute bottom-3 right-3 z-40 max-w-[calc(100%-24px)]">
            <span className="max-w-full truncate rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">
                {width} x {height}
                {size ? ` · ${size}` : ""}
            </span>
        </div>
    );
}

function BatchFrame({ batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch, children }: { batchCount: number; batchExpanded: boolean; batchOpening: boolean; batchRecovering: boolean; onToggleBatch?: () => void; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchRoot = batchCount > 1;
    return (
        <div
            className="group/batch relative h-full w-full overflow-visible"
            onDoubleClick={
                isBatchRoot
                    ? (event) => {
                          event.stopPropagation();
                          onToggleBatch?.();
                      }
                    : undefined
            }
        >
            {isBatchRoot ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {Array.from({ length: Math.min(batchCount - 1, 5) }).map((_, index) => (
                        <div
                            key={index}
                            className="absolute rounded-[inherit] border shadow-[0_14px_34px_rgba(68,64,60,.16)] transition-all duration-300 group-hover/batch:translate-x-2"
                            style={{
                                inset: 0,
                                background: `linear-gradient(135deg, ${theme.node.panel}, ${theme.node.fill})`,
                                borderColor: theme.node.stroke,
                                opacity: batchExpanded && !batchOpening ? 0.34 : 1,
                                transform:
                                    batchOpening || batchRecovering ? `translate(${54 + index * 22}px, ${20 + index * 12}px) rotate(${8 + index * 5}deg) scale(.98)` : `translate(${34 + index * 18}px, ${14 + index * 10}px) rotate(${6 + index * 4}deg)`,
                                zIndex: -index - 1,
                            }}
                        />
                    ))}
                </div>
            ) : null}
            {children}
        </div>
    );
}
function ResizeHandle({ corner, onMouseDown }: { corner: ResizeCorner; onMouseDown: (event: React.MouseEvent, corner: ResizeCorner) => void }) {
    const positionClass = {
        "top-left": "-left-[14px] -top-[14px] cursor-nwse-resize",
        "top-right": "-right-[14px] -top-[14px] cursor-nesw-resize",
        "bottom-left": "-bottom-[14px] -left-[14px] cursor-nesw-resize",
        "bottom-right": "-bottom-[14px] -right-[14px] cursor-nwse-resize",
    }[corner];

    return <div className={`absolute z-50 size-7 ${positionClass}`} onMouseDown={(event) => onMouseDown(event, corner)} />;
}

function ConnectionHandleDot({ side, visible, onMouseDown }: { side: "left" | "right"; visible: boolean; onMouseDown: (event: React.MouseEvent) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div
            className={`absolute top-1/2 z-30 flex size-8 -translate-y-1/2 cursor-crosshair items-center justify-center transition-opacity duration-150 ${side === "left" ? "-left-4" : "-right-4"} ${visible ? "opacity-100" : "opacity-35"}`}
            onMouseDown={onMouseDown}
        >
            <div
                className="grid size-3.5 place-items-center rounded-full border transition-all hover:scale-125"
                style={{ background: theme.node.panel, borderColor: visible ? theme.node.activeStroke : theme.node.muted, color: visible ? theme.node.activeStroke : theme.node.muted }}
            >
                <Plus className="size-2.5" strokeWidth={2.5} />
            </div>
        </div>
    );
}

function getMediaSizeLabel(node: CanvasNodeData) {
    if (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video) return "";
    if (node.metadata?.naturalWidth && node.metadata?.naturalHeight) return `${Math.round(node.metadata.naturalWidth)} x ${Math.round(node.metadata.naturalHeight)}`;
    return node.metadata?.size && node.metadata.size !== "auto" ? node.metadata.size : "";
}
