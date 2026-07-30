import { Clapperboard, Images, Music2, ScrollText } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

const QUICK_STARTS = [
    {
        label: "故事脚本生成",
        icon: ScrollText,
        prompt: "请先为一支 25 秒短片设计完整故事脚本，再搭建人物、场景、故事板与视频节点，提交方案让我审核。",
    },
    {
        label: "角色三视图",
        icon: Images,
        prompt: "请为当前创意生成角色三视图，保持正面、侧面、背面的脸部、服装和比例一致，并搭建后续工作流。",
    },
    {
        label: "首帧图生视频",
        icon: Clapperboard,
        prompt: "请搭建首帧图生视频工作流：先生成电影感首帧，再用首帧创建视频，执行前提交方案审核。",
    },
    {
        label: "音频生视频",
        icon: Music2,
        prompt: "请搭建音频驱动视频工作流：先准备音频，再生成与节奏和情绪匹配的视频，执行前提交方案审核。",
    },
] as const;

export function CanvasEmptyQuickStart({ onSelect }: { onSelect: (prompt: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="pointer-events-none absolute inset-x-5 top-1/2 z-20 -translate-y-1/2" data-canvas-no-zoom>
            <div className="pointer-events-auto mx-auto flex max-w-[860px] flex-wrap justify-center gap-2">
                {QUICK_STARTS.map(({ label, icon: Icon, prompt }) => (
                    <button
                        key={label}
                        type="button"
                        className="flex h-14 w-[190px] items-center gap-2.5 rounded-md border px-3 text-left text-xs font-medium transition hover:-translate-y-px hover:bg-black/5 dark:hover:bg-white/5"
                        style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }}
                        onClick={() => onSelect(prompt)}
                    >
                        <Icon className="size-4 shrink-0" />
                        <span>{label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
