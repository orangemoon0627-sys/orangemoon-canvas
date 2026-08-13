import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, InputNumber, Select, Tooltip } from "antd";
import { ArrowUp, AudioLines, CheckCircle2, CircleAlert, Coins, Image, ImagePlus, Link2, LoaderCircle, PencilRuler, Sparkles, Square, UserRound, Video, Workflow, Wrench, X, XCircle } from "lucide-react";
import { Streamdown } from "streamdown";

import { isPlainEnterKey } from "@/lib/keyboard-event";
import { canvasThemes } from "@/lib/canvas-theme";
import { getOrangeMoonModelLabel, removeOrangeMoonInternalModelPrefix } from "@/lib/orange-moon-provider";
import type { LocalUser } from "@/stores/use-user-store";
import type { AgentWorkflowPreview, AgentWorkflowPreviewStage } from "@/lib/agent/agent-workflow-preview";
import type { AgentGenerationPlanItem } from "@/lib/agent/agent-generation-plan";
import type { ProviderBundleQuote, ProviderCatalog } from "@/services/api/platform";
import type { CanvasNodeMetadata } from "@/types/canvas";

export type CanvasAgentChatAttachment = { id: string; name: string; url?: string };
export type CanvasAgentChatMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    attachments?: CanvasAgentChatAttachment[];
    /** Present while the message is actively streaming; cleared on completion. */
    streamId?: string;
};

export type AgentGenerationReview = {
    items: AgentGenerationPlanItem[];
    catalog: ProviderCatalog | null;
    quote: ProviderBundleQuote | null;
    quoteLoading: boolean;
    quoteError: string;
    walletCredits: string;
    insufficient: boolean;
    onChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onRecharge: () => void;
};

const WORKING_TEXT = "正在处理...";

export function AgentChatMessage({
    item,
    theme,
    user,
    onRejectTool,
    onApproveTool,
}: {
    item: CanvasAgentChatMessage;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    user: LocalUser | null;
    onRejectTool?: (id: string) => void;
    onApproveTool?: (id: string) => void;
}) {
    const isUser = item.role === "user";
    const isSystem = item.role === "system";
    const color = item.role === "error" ? "#dc2626" : item.role === "tool" ? "#2563eb" : theme.node.text;
    const displayText = isUser ? item.text : removeOrangeMoonInternalModelPrefix(item.text);
    if (isSystem) {
        return (
            <div className="flex justify-center text-xs">
                <div className="max-w-[88%] px-3 py-1.5 text-center" style={{ color: theme.node.muted }}>
                    {displayText}
                    {item.meta ? <span className="ml-2 opacity-60">{item.meta}</span> : null}
                </div>
            </div>
        );
    }
    if (item.role === "tool") {
        if (objectField(item.detail, "status") === "pending") return <AgentPendingToolCard summary={item.text} detail={item.detail} theme={theme} onReject={() => onRejectTool?.(item.id)} onApprove={() => onApproveTool?.(item.id)} />;
        return (
            <div className="flex items-start gap-3">
                <AgentAvatar theme={theme} />
                <AgentToolCard title={item.title || "工具调用"} text={displayText} detail={item.detail} theme={theme} />
            </div>
        );
    }
    return (
        <div className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
            {!isUser ? <AgentAvatar theme={theme} /> : null}
            <div
                className={isUser ? "min-w-0 max-w-[82%] rounded-xl rounded-br-sm border px-3.5 py-2.5 text-left text-sm leading-6" : "min-w-0 flex-1 text-left text-sm leading-6"}
                style={
                    isUser
                        ? {
                              color,
                              background: `color-mix(in srgb, ${theme.node.text} 7%, ${theme.toolbar.panel})`,
                              borderColor: `color-mix(in srgb, ${theme.node.text} 14%, transparent)`,
                          }
                        : { color }
                }
            >
                {isUser ? (
                    <div className="whitespace-pre-wrap break-words">{item.text}</div>
                ) : (
                    <Streamdown animated isAnimating={!!item.streamId}>
                        {displayText}
                    </Streamdown>
                )}
                {item.attachments?.length ? <AgentMessageAttachments attachments={item.attachments} /> : null}
                {item.meta ? <div className={`mt-1 text-[11px] opacity-45 ${isUser ? "text-right" : ""}`}>{item.meta}</div> : null}
            </div>
            {isUser ? <AgentUserAvatar user={user} theme={theme} /> : null}
        </div>
    );
}

export function AgentPendingToolCard({
    summary,
    detail,
    preview,
    generationReview,
    approveDisabled,
    approveLoading,
    theme,
    onReject,
    onApprove,
}: {
    summary: string;
    detail?: unknown;
    preview?: AgentWorkflowPreview | null;
    generationReview?: AgentGenerationReview | null;
    approveDisabled?: boolean;
    approveLoading?: boolean;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onReject?: () => void;
    onApprove?: () => void;
}) {
    const displaySummary = removeOrangeMoonInternalModelPrefix(summary);
    return (
        <div className="flex items-start gap-3">
            <AgentAvatar theme={theme} />
            <div className="min-w-0 flex-1 rounded-lg border p-4" style={{ borderColor: preview?.destructive ? "rgba(220,38,38,.30)" : theme.node.stroke, background: "transparent", color: theme.node.text }}>
                <details>
                    <summary className="cursor-pointer list-none">
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border" style={{ borderColor: "rgba(217,119,6,.24)", color: "#d97706", background: "rgba(217,119,6,.04)" }}>
                                {preview ? <Workflow className="size-4" /> : <CircleAlert className="size-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-5">
                                    <span>{removeOrangeMoonInternalModelPrefix(preview?.title || "确认工具调用")}</span>
                                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: "rgba(217,119,6,.22)", color: "#d97706", background: "rgba(217,119,6,.04)" }}>
                                        待审核
                                    </span>
                                    {detail ? (
                                        <span className="ml-auto text-xs font-normal" style={{ color: theme.node.muted }}>
                                            详情
                                        </span>
                                    ) : null}
                                </div>
                                <div className="mt-2 text-sm leading-6" style={{ color: theme.node.text }}>
                                    {removeOrangeMoonInternalModelPrefix(preview?.summary || displaySummary)}
                                </div>
                            </div>
                        </div>
                    </summary>
                    {detail ? <AgentDetailBlock detail={detail} theme={theme} /> : null}
                </details>
                {preview?.stats.length ? (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-y py-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                        {preview.stats.map((stat) => (
                            <span key={stat.label} className="inline-flex items-baseline gap-1">
                                <strong className="text-sm" style={{ color: theme.node.text }}>
                                    {stat.value}
                                </strong>
                                {stat.label}
                            </span>
                        ))}
                    </div>
                ) : null}
                {generationReview?.items.length ? <AgentGenerationReviewPanel review={generationReview} theme={theme} /> : null}
                {preview?.stages.length ? (
                    <div className="mt-3 space-y-3">
                        {preview.stages.map((stage) => (
                            <div key={`${stage.kind}-${stage.label}`} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5">
                                <span className="mt-0.5" style={{ color: theme.node.muted }}>
                                    {workflowStageIcon(stage)}
                                </span>
                                <div className="min-w-0">
                                    <div className="text-xs font-medium" style={{ color: theme.node.muted }}>
                                        {stage.label}
                                    </div>
                                    <div className="mt-1 space-y-0.5 text-sm leading-5">
                                        {stage.items.map((item) => (
                                            <div key={item} className="truncate" title={removeOrangeMoonInternalModelPrefix(item)}>
                                                {removeOrangeMoonInternalModelPrefix(item)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}
                {preview?.destructive ? <div className="mt-3 text-xs leading-5 text-red-600">方案包含删除操作，请确认现有画布内容。</div> : null}
                {onReject || onApprove ? (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button danger className="!h-9" icon={<XCircle className="size-4" />} onClick={() => onReject?.()}>
                            {preview ? "退回修改" : "拒绝执行"}
                        </Button>
                        <Button className="!h-9" loading={approveLoading} disabled={approveDisabled} icon={<CheckCircle2 className="size-4" />} style={{ borderColor: "rgba(22,163,74,.42)", color: approveDisabled ? theme.node.muted : "#16a34a", background: "transparent" }} onClick={() => onApprove?.()}>
                            {preview ? "确认并执行" : "批准执行"}
                        </Button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function AgentGenerationReviewPanel({ review, theme }: { review: AgentGenerationReview; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const quoteById = new Map(review.quote?.items.map((item) => [item.id, item]));
    return (
        <div className="mt-3 border-y" style={{ borderColor: theme.node.stroke }}>
            <div className="flex items-center justify-between gap-3 py-2.5">
                <div className="inline-flex items-center gap-2 text-xs font-medium"><Workflow className="size-3.5" />生成配置</div>
                <span className="text-[11px]" style={{ color: theme.node.muted }}>确认后才会扣积分并生成</span>
            </div>
            <div className="divide-y" style={{ borderColor: theme.node.stroke }}>
                {review.items.map((item) => (
                    <AgentGenerationReviewRow key={item.id} item={item} quoteCredits={quoteById.get(item.id)?.retailCredits} catalog={review.catalog} theme={theme} onChange={review.onChange} />
                ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span style={{ color: theme.node.muted }}>可用 <strong style={{ color: theme.node.text }}>{review.walletCredits || "0"}</strong> 积分</span>
                        <span>本次预计 <strong className={review.insufficient ? "text-red-600" : ""}>{review.quoteLoading ? "计算中" : review.quote?.totalCredits || "0"}</strong> 积分</span>
                    </div>
                                    {review.quoteError ? <div className="mt-1 text-red-600">{removeOrangeMoonInternalModelPrefix(review.quoteError)}</div> : review.insufficient ? <div className="mt-1 text-red-600">积分不足，方案不会执行。可更换低价模型或充值。</div> : null}
                </div>
                <Button size="small" type="text" icon={<Coins className="size-3.5" />} onClick={review.onRecharge}>充值</Button>
            </div>
        </div>
    );
}

function AgentGenerationReviewRow({ item, quoteCredits, catalog, theme, onChange }: { item: AgentGenerationPlanItem; quoteCredits?: string; catalog: ProviderCatalog | null; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: AgentGenerationReview["onChange"] }) {
    const models = (catalog?.models || []).filter((model) => model.capability === item.mode);
    const selectedModel = models.find((model) => model.id === item.model);
    const modelOptions = [...(selectedModel || !item.model ? [] : [{ value: item.model, label: getOrangeMoonModelLabel(item.model) }]), ...models.map((model) => ({ value: model.id, label: model.label }))];
    const ratios = item.mode === "video" ? selectedModel?.aspectRatios || ["16:9", "9:16"] : ["1:1", "16:9", "9:16", "4:3", "3:4"];
    const durations = selectedModel?.fixedDuration
        ? [selectedModel.fixedDuration]
        : selectedModel?.allowedDurations?.length
          ? selectedModel.allowedDurations
          : selectedModel?.minDuration && selectedModel?.maxDuration
            ? Array.from({ length: selectedModel.maxDuration - selectedModel.minDuration + 1 }, (_, index) => selectedModel.minDuration! + index)
            : selectedModel?.recommendedDurations || [5, 10, 15];
    const changeModel = (model: string) => {
        const next = models.find((entry) => entry.id === model);
        const nextSeconds = next?.fixedDuration
            || (next?.allowedDurations?.includes(item.seconds) ? item.seconds : next?.allowedDurations?.[0])
            || Math.min(next?.maxDuration || item.seconds, Math.max(next?.minDuration || item.seconds, item.seconds));
        const nextSize = next?.aspectRatios?.includes(item.size) ? item.size : next?.aspectRatios?.[0] || item.size;
        const resolutions = next?.resolutions || (next?.resolution ? [next.resolution] : []);
        const nextResolution = resolutions.includes(item.resolution as "480p" | "720p" | "1080p") ? item.resolution : next?.defaultResolution || next?.resolution || item.resolution;
        onChange(item.nodeId, { model: next?.id || model, ...(item.mode === "video" ? { seconds: String(nextSeconds), size: nextSize, vquality: nextResolution.replace("p", ""), videoReferenceMode: next?.supportsFrames ? item.videoReferenceMode : "ref" } : {}) });
    };
    const resolutionOptions = item.mode === "video" ? (selectedModel?.resolutions || (selectedModel?.resolution ? [selectedModel.resolution] : [])).map((resolution) => ({ value: resolution, label: resolution.toUpperCase() })) : [];
    return (
        <div className="py-3 first:border-t" style={{ borderColor: theme.node.stroke }}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-xs font-medium" title={item.title}>{item.title}</div>
                <div className="shrink-0 text-[11px]" style={{ color: theme.node.muted }}>{quoteCredits ? `${quoteCredits} 积分` : item.mode === "image" ? `${item.count} 张` : item.mode === "video" ? `${item.seconds} 秒` : "音频"}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <LabeledControl label="模型">
                    <Select size="small" className="w-full" value={selectedModel?.id || item.model} options={modelOptions} onChange={changeModel} />
                </LabeledControl>
                {item.mode === "audio" ? (
                    <LabeledControl label="计费文本"><div className="flex h-6 items-center text-xs">约 {item.promptLength} 字符</div></LabeledControl>
                ) : (
                    <LabeledControl label="画幅">
                        <Select size="small" className="w-full" value={item.size} options={ratios.map((ratio) => ({ value: ratio, label: ratio }))} onChange={(size) => onChange(item.nodeId, { size })} />
                    </LabeledControl>
                )}
                {item.mode === "image" ? (
                    <>
                        <LabeledControl label="质量"><Select size="small" className="w-full" value={item.quality} options={["auto", "high", "medium", "low"].map((quality) => ({ value: quality, label: quality === "auto" ? "自动" : quality === "high" ? "高" : quality === "medium" ? "中" : "低" }))} onChange={(quality) => onChange(item.nodeId, { quality })} /></LabeledControl>
                        <LabeledControl label="张数"><InputNumber size="small" className="w-full" min={1} max={4} precision={0} value={item.count} onChange={(count) => onChange(item.nodeId, { count: Number(count) || 1 })} /></LabeledControl>
                    </>
                ) : item.mode === "video" ? (
                    <>
                        <LabeledControl label="时长"><Select size="small" className="w-full" value={item.seconds} options={durations.map((seconds) => ({ value: seconds, label: `${seconds} 秒` }))} onChange={(seconds) => onChange(item.nodeId, { seconds: String(seconds) })} /></LabeledControl>
                        <LabeledControl label="清晰度"><Select size="small" className="w-full" value={item.resolution} options={resolutionOptions} onChange={(resolution) => onChange(item.nodeId, { vquality: resolution.replace("p", "") })} /></LabeledControl>
                        {selectedModel?.supportsFrames ? (
                            <LabeledControl label="图片参考">
                                <Select
                                    size="small"
                                    className="w-full"
                                    value={item.videoReferenceMode}
                                    options={[
                                        { value: "ref", label: "全能参考" },
                                        { value: "first", label: "首帧" },
                                        ...(selectedModel.supportsEndFrame ? [{ value: "firstlast", label: "首尾帧" }] : []),
                                    ]}
                                    onChange={(videoReferenceMode) => onChange(item.nodeId, { videoReferenceMode })}
                                />
                            </LabeledControl>
                        ) : null}
                    </>
                ) : null}
            </div>
        </div>
    );
}

function LabeledControl({ label, children }: { label: string; children: ReactNode }) {
    return <label className="min-w-0"><span className="mb-1 block text-[10px] opacity-55">{label}</span>{children}</label>;
}

export function AgentToolCard({ title, text, detail, theme }: { title: string; text: string; detail?: unknown; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const state = toolCardState(title, text, detail);
    return (
        <details className="min-w-0 flex-1 rounded-xl border px-4 py-3.5 text-left" style={{ borderColor: theme.node.stroke, background: "transparent", color: theme.node.text }}>
            <summary className="cursor-pointer list-none">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border" style={{ borderColor: state.softBorder, color: state.color, background: state.softBg }}>
                        {state.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-5">
                            <span className="min-w-0 truncate">{removeOrangeMoonInternalModelPrefix(title)}</span>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: state.softBorder, color: state.color, background: state.softBg }}>
                                {state.label}
                            </span>
                            {detail ? (
                                <span className="ml-auto text-xs font-normal" style={{ color: theme.node.muted }}>
                                    详情
                                </span>
                            ) : null}
                        </div>
                        <div className="mt-2 text-sm leading-6" style={{ color: state.isError ? state.color : theme.node.muted }}>
                            {text}
                        </div>
                    </div>
                </div>
            </summary>
            {detail ? <AgentDetailBlock detail={detail} theme={theme} /> : null}
        </details>
    );
}

export function AgentWorkingMessage({ theme }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const [length, setLength] = useState(1);
    useEffect(() => {
        const timer = window.setInterval(() => setLength((value) => (value >= WORKING_TEXT.length + 4 ? 1 : value + 1)), 120);
        return () => window.clearInterval(timer);
    }, [setLength]);
    return (
        <div className="flex items-start gap-2.5">
            <AgentAvatar theme={theme} />
            <div className="min-w-0 max-w-[82%]">
                <div className="font-mono text-sm" style={{ color: theme.node.muted }} aria-label={WORKING_TEXT}>
                    <span className="inline-block w-[76px]">{WORKING_TEXT.slice(0, Math.min(length, WORKING_TEXT.length))}</span>
                </div>
            </div>
        </div>
    );
}

export function AgentChatComposer({
    prompt,
    attachments = [],
    disabled,
    sending,
    placeholder,
    theme,
    onPromptChange,
    onSubmit,
    onStop,
    onAddFiles,
    onRemoveAttachment,
    left,
    plain,
}: {
    prompt: string;
    attachments?: CanvasAgentChatAttachment[];
    disabled?: boolean;
    sending?: boolean;
    placeholder: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onPromptChange: (value: string) => void;
    onSubmit: () => void;
    onStop?: () => void;
    onAddFiles?: (files: FileList | File[] | null) => void | Promise<void>;
    onRemoveAttachment?: (id: string) => void;
    left?: ReactNode;
    plain?: boolean;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canSubmit = !disabled && !sending && Boolean(prompt.trim() || attachments.length);
    return (
        <div className={plain ? "px-3 pb-3 pt-2" : "px-2 pb-2 pt-2"} onWheelCapture={(event) => event.stopPropagation()}>
            <div className={plain ? "rounded-lg border px-3 pb-2 pt-2" : "rounded-[24px] border px-3 pb-3 pt-3 shadow-lg"} style={{ background: plain ? "transparent" : theme.toolbar.panel, borderColor: theme.node.stroke }}>
                {attachments.length ? (
                    <div className="thin-scrollbar mb-2 flex gap-2 overflow-x-auto pb-1">
                        {attachments.map((item) => (
                            <div key={item.id} className="group relative size-14 shrink-0 overflow-hidden rounded-xl border" style={{ borderColor: theme.node.stroke }} title={item.name}>
                                <img src={item.url} alt={item.name} className="size-full object-cover" />
                                {onRemoveAttachment ? (
                                    <button
                                        type="button"
                                        className="absolute right-1 top-1 grid size-5 place-items-center rounded-full border opacity-0 shadow-sm transition group-hover:opacity-100"
                                        style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}
                                        onClick={() => onRemoveAttachment(item.id)}
                                        aria-label="移除图片"
                                    >
                                        <X className="size-3" />
                                    </button>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : null}
                <textarea
                    value={prompt}
                    onChange={(event) => onPromptChange(event.target.value)}
                    onPaste={(event) => {
                        if (!onAddFiles) return;
                        const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                        if (!images.length) return;
                        event.preventDefault();
                        void onAddFiles(images);
                    }}
                    onKeyDown={(event) => {
                        if (!isPlainEnterKey(event)) return;
                        event.preventDefault();
                        void onSubmit();
                    }}
                    className={`thin-scrollbar max-h-32 w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 outline-none placeholder:opacity-45 ${plain ? "min-h-16" : "min-h-20"}`}
                    style={{ color: theme.node.text }}
                    placeholder={placeholder}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1">
                        {onAddFiles ? (
                            <>
                                <input
                                    ref={fileInputRef}
                                    hidden
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(event) => {
                                        void onAddFiles(event.target.files);
                                        event.target.value = "";
                                    }}
                                />
                                <Tooltip title="上传图片">
                                    <Button type="text" shape="circle" className="!h-9 !w-9 !min-w-9" disabled={sending} style={{ color: theme.node.muted }} icon={<ImagePlus className="size-4" />} onClick={() => fileInputRef.current?.click()} />
                                </Tooltip>
                            </>
                        ) : null}
                        {left}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {sending && onStop ? (
                            <Button danger shape="circle" className="!h-10 !w-10 !min-w-10" icon={<Square className="size-4" />} onClick={() => void onStop()} aria-label="停止" />
                        ) : (
                            <Button
                                type="primary"
                                shape="circle"
                                className="!h-10 !w-10 !min-w-10"
                                disabled={!canSubmit}
                                icon={sending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                                onClick={() => void onSubmit()}
                                aria-label="发送"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function AgentPanelTabs<T extends string>({
    value,
    items,
    theme,
    right,
    onChange,
}: {
    value: T;
    items: { value: T; label: string; icon?: ReactNode; count?: number }[];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    right?: ReactNode;
    onChange: (value: T) => void;
}) {
    return (
        <div className="border-b px-3" style={{ borderColor: theme.node.stroke }}>
            <div className="flex min-h-11 items-center justify-between gap-3">
                <nav className="thin-scrollbar flex min-w-0 flex-1 items-center gap-3 overflow-x-auto text-sm" role="tablist" aria-label="Agent 面板">
                    {items.map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            role="tab"
                            aria-selected={value === item.value}
                            className={`inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-0.5 transition ${value === item.value ? "font-medium" : "font-normal"}`}
                            style={{ borderColor: value === item.value ? theme.node.text : "transparent", color: value === item.value ? theme.node.text : theme.node.muted }}
                            onClick={() => onChange(item.value)}
                        >
                            {item.icon}
                            {item.label}
                            {item.count ? ` ${item.count}` : ""}
                        </button>
                    ))}
                </nav>
                {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
            </div>
        </div>
    );
}

function AgentDetailBlock({ detail, theme }: { detail: unknown; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const serialized = JSON.stringify(detail, null, 2) || "";
    return (
        <pre className="thin-scrollbar mt-3 max-h-64 overflow-auto rounded-lg border p-3 text-[11px] leading-4" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.muted }}>
            {removeOrangeMoonInternalModelPrefix(serialized)}
        </pre>
    );
}

function AgentAvatar({ theme }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border" style={{ borderColor: theme.node.stroke, color: theme.node.text }} role="img" aria-label="创作导演">
            <Sparkles className="size-4" />
        </span>
    );
}

function workflowStageIcon(stage: AgentWorkflowPreviewStage) {
    if (stage.kind === "image") return <Image className="size-4" />;
    if (stage.kind === "video") return <Video className="size-4" />;
    if (stage.kind === "audio") return <AudioLines className="size-4" />;
    if (stage.kind === "connection") return <Link2 className="size-4" />;
    if (stage.kind === "change") return <PencilRuler className="size-4" />;
    return <Sparkles className="size-4" />;
}

function AgentUserAvatar({ user, theme }: { user: LocalUser | null; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const avatarUrl = user?.avatarUrl?.trim();
    return (
        <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full" style={{ color: theme.node.text }}>
            {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : <UserRound className="size-4" />}
        </span>
    );
}

function AgentMessageAttachments({ attachments }: { attachments: CanvasAgentChatAttachment[] }) {
    return (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
            {attachments.map((item) => (
                item.url ? (
                    <img key={item.id} src={item.url} alt={item.name} className="aspect-square w-full rounded-lg object-cover" />
                ) : (
                    <div key={item.id} className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1 text-center text-[10px] opacity-60">
                        <Image className="size-4" />
                        <span className="w-full truncate">{item.name}</span>
                    </div>
                )
            ))}
        </div>
    );
}

function toolCardState(title: string, text: string, detail?: unknown) {
    const raw = `${title} ${text} ${normalizeText(objectField(detail, "error"))}`;
    const approvalState = `${raw} ${normalizeText(objectField(detail, "result"))}`;
    const lower = raw.toLowerCase();
    const tool = String(objectField(detail, "name") || objectField(detail, "tool") || "");
    if (approvalState.toLowerCase().includes("awaiting_user_approval") || /等待用户(?:审核|确认)/.test(approvalState))
        return { label: "等待用户确认", color: "#d97706", softBorder: "rgba(217,119,6,.22)", softBg: "rgba(217,119,6,.04)", icon: <CircleAlert className="size-4" />, isError: false };
    if (objectField(detail, "status") === "noop" || /未生效|无需|没有找到|没有.*可|已存在/.test(raw))
        return { label: "未生效", color: "#d97706", softBorder: "rgba(217,119,6,.22)", softBg: "rgba(217,119,6,.04)", icon: <CircleAlert className="size-4" />, isError: false };
    if (/拒绝|取消/.test(raw) || lower.includes("rejected")) return { label: "拒绝执行", color: "#dc2626", softBorder: "rgba(220,38,38,.20)", softBg: "rgba(220,38,38,.04)", icon: <XCircle className="size-4" />, isError: true };
    if (/失败|错误/.test(raw) || lower.includes("failed") || lower.includes("error")) return { label: "执行失败", color: "#dc2626", softBorder: "rgba(220,38,38,.20)", softBg: "rgba(220,38,38,.04)", icon: <XCircle className="size-4" />, isError: true };
    if (/完成|成功/.test(raw) || lower.includes("completed") || lower.includes("succeeded"))
        return { label: tool === "canvas_apply_ops" || /画布操作/.test(title) ? "已批准执行" : "工具完成", color: "#16a34a", softBorder: "rgba(22,163,74,.20)", softBg: "rgba(22,163,74,.04)", icon: <CheckCircle2 className="size-4" />, isError: false };
    return { label: "工具调用", color: "#2563eb", softBorder: "rgba(37,99,235,.20)", softBg: "rgba(37,99,235,.04)", icon: <Wrench className="size-4" />, isError: false };
}

function normalizeText(value: unknown) {
    if (typeof value === "string") return value.trim();
    if (value instanceof Error) return value.message;
    if (value == null) return "";
    return JSON.stringify(value, null, 2);
}

function objectField(value: unknown, key: string) {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}
