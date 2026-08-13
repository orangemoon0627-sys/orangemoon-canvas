import { Camera, Clapperboard, Cuboid, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";

import { isDirectorAssetObject, normalizeDirectorScene, sortDirectorLayers } from "@/lib/director/director-scene";
import { resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl } from "@/services/image-storage";
import { useDirectorStudioStore } from "@/stores/use-director-studio-store";
import type { CanvasNodeContext } from "@/types/canvas-plugin";

export function DirectorNodeContent({ ctx }: { ctx: CanvasNodeContext }) {
    const scene = normalizeDirectorScene(ctx.node.metadata?.director);
    const [preview, setPreview] = useState(ctx.node.metadata?.content || "");
    const [backgroundPreview, setBackgroundPreview] = useState("");
    const background = sortDirectorLayers(scene.objects).find((object) => object.role === "background" && isDirectorAssetObject(object));
    const open = useDirectorStudioStore((state) => state.open);

    useEffect(() => {
        let active = true;
        void resolveImageUrl(ctx.node.metadata?.storageKey, ctx.node.metadata?.content || "").then((url) => { if (active) setPreview(url); });
        return () => { active = false; };
    }, [ctx.node.metadata?.content, ctx.node.metadata?.storageKey]);

    useEffect(() => {
        let active = true;
        if (!background) {
            setBackgroundPreview("");
            return () => { active = false; };
        }
        const resolver = background.assetKind === "video" || background.primitive === "video" ? resolveMediaUrl : resolveImageUrl;
        void resolver(background.storageKey, background.assetUrl || "").then((url) => { if (active) setBackgroundPreview(url); });
        return () => { active = false; };
    }, [background?.assetKind, background?.assetUrl, background?.id, background?.primitive, background?.storageKey]);

    return (
        <button type="button" className="group relative h-full w-full overflow-hidden text-left" onDoubleClick={(event) => { event.stopPropagation(); open(ctx.node.id); }}>
            {preview ? <img src={preview} alt="导演台场景预览" className="absolute inset-0 size-full object-cover" draggable={false} /> : backgroundPreview ? background?.assetKind === "video" || background?.primitive === "video" ? <video src={backgroundPreview} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" /> : <img src={backgroundPreview} alt="导演台背景预览" className="absolute inset-0 size-full object-cover" draggable={false} /> : <DirectorStagePlaceholder />}
            <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2.5 text-white backdrop-blur-sm">
                <div className="flex items-center gap-2"><Clapperboard className="size-4 text-[#ff8a6f]" /><span className="min-w-0 flex-1 truncate text-xs font-medium">{scene.name}</span><Maximize2 className="size-3.5 opacity-55 transition group-hover:opacity-100" /></div>
                <div className="mt-1.5 flex items-center gap-3 text-[10px] text-white/65"><span className="inline-flex items-center gap-1"><Cuboid className="size-3" />{scene.objects.length} 个对象</span><span className="inline-flex items-center gap-1"><Camera className="size-3" />{scene.shots.length} 个镜头</span><span>{scene.duration}s · {scene.aspectRatio}</span></div>
            </div>
        </button>
    );
}

function DirectorStagePlaceholder() {
    return <div className="absolute inset-0 overflow-hidden bg-[#b9c8cf]"><div className="absolute inset-x-0 bottom-0 h-[42%] bg-[#71806f]" /><div className="absolute left-[20%] top-[25%] h-[42%] w-[12%] rounded-t-full bg-[#e9583e] shadow-[20px_14px_0_-5px_#263a3d]" /><div className="absolute right-[22%] top-[31%] h-[36%] w-[11%] rounded-t-full bg-[#268f82]" /><div className="absolute left-[8%] right-[8%] top-[17%] h-px bg-white/35" /><div className="absolute left-1/2 top-[14%] h-[70%] w-px origin-bottom rotate-[68deg] bg-white/20" /></div>;
}
