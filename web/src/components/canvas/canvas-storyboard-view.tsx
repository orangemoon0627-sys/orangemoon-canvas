import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";
import type { ReactNode } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function CanvasStoryboardView({ nodes, theme, onOpenNode }: { nodes: CanvasNodeData[]; theme: CanvasTheme; onOpenNode: (nodeId: string) => void }) {
    const textNodes = nodes.filter((node) => node.type === CanvasNodeType.Text);
    const imageNodes = nodes.filter((node) => node.type === CanvasNodeType.Image);
    const videoNodes = nodes.filter((node) => node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio);

    return (
        <div className="absolute inset-0 overflow-auto px-5 pb-6 pt-20" style={{ background: theme.canvas.background }} data-canvas-no-zoom>
            <div className="grid min-h-full min-w-[820px] grid-cols-3 gap-3">
                <StoryboardLane title="文本" icon={<FileText className="size-4" />} count={textNodes.length} theme={theme}>
                    {textNodes.length ? textNodes.map((node) => <TextStoryboardItem key={node.id} node={node} theme={theme} onOpen={() => onOpenNode(node.id)} />) : <LaneEmpty label="暂无文本" theme={theme} />}
                </StoryboardLane>
                <StoryboardLane title="图片" icon={<ImageIcon className="size-4" />} count={imageNodes.length} theme={theme}>
                    {imageNodes.length ? imageNodes.map((node) => <MediaStoryboardItem key={node.id} node={node} theme={theme} onOpen={() => onOpenNode(node.id)} />) : <LaneEmpty label="暂无图片" theme={theme} />}
                </StoryboardLane>
                <StoryboardLane title="视频与音频" icon={<Video className="size-4" />} count={videoNodes.length} theme={theme}>
                    {videoNodes.length ? videoNodes.map((node) => <MediaStoryboardItem key={node.id} node={node} theme={theme} onOpen={() => onOpenNode(node.id)} />) : <LaneEmpty label="暂无视频" theme={theme} />}
                </StoryboardLane>
            </div>
        </div>
    );
}

function StoryboardLane({ title, icon, count, theme, children }: { title: string; icon: ReactNode; count: number; theme: CanvasTheme; children: ReactNode }) {
    return (
        <section className="min-w-0 border-t" style={{ borderColor: theme.node.stroke }}>
            <header className="flex h-12 items-center gap-2 px-1 text-sm font-medium">
                {icon}
                <h2>{title}</h2>
                <span className="ml-auto text-xs tabular-nums" style={{ color: theme.node.faint }}>{count}</span>
            </header>
            <div className="space-y-2 pb-5">{children}</div>
        </section>
    );
}

function TextStoryboardItem({ node, theme, onOpen }: { node: CanvasNodeData; theme: CanvasTheme; onOpen: () => void }) {
    return (
        <button type="button" className="block w-full rounded-lg border p-3 text-left transition hover:-translate-y-px" style={{ borderColor: theme.node.stroke, background: theme.node.fill }} onClick={onOpen}>
            <div className="truncate text-xs font-medium">{node.title || "文本"}</div>
            <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-xs leading-5" style={{ color: theme.node.muted }}>{node.metadata?.content || node.metadata?.prompt || "空文本节点"}</p>
        </button>
    );
}

function MediaStoryboardItem({ node, theme, onOpen }: { node: CanvasNodeData; theme: CanvasTheme; onOpen: () => void }) {
    const isImage = node.type === CanvasNodeType.Image;
    const isAudio = node.type === CanvasNodeType.Audio;
    const content = node.metadata?.content;
    return (
        <button type="button" className="block w-full overflow-hidden rounded-lg border text-left transition hover:-translate-y-px" style={{ borderColor: theme.node.stroke, background: theme.node.fill }} onClick={onOpen}>
            <div className="flex aspect-video items-center justify-center overflow-hidden bg-black/30" style={{ color: theme.node.faint }}>
                {content && isImage ? <img src={content} alt="" className="size-full object-cover" /> : content && !isAudio ? <video src={content} muted className="size-full object-cover" /> : isAudio ? <Music2 className="size-7" /> : isImage ? <ImageIcon className="size-7" /> : <Video className="size-7" />}
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5">
                {isAudio ? <Music2 className="size-3.5 shrink-0" /> : isImage ? <ImageIcon className="size-3.5 shrink-0" /> : <Video className="size-3.5 shrink-0" />}
                <span className="truncate text-xs font-medium">{node.title}</span>
            </div>
        </button>
    );
}

function LaneEmpty({ label, theme }: { label: string; theme: CanvasTheme }) {
    return <div className="grid min-h-44 place-items-center rounded-lg border border-dashed text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.faint }}>{label}</div>;
}
