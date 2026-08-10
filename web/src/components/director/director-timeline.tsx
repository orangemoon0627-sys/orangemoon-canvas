import { Diamond, Film } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Timeline, type TimelineState } from "@xzdarcy/react-timeline-editor";
import type { TimelineAction, TimelineEffect, TimelineRow } from "@xzdarcy/timeline-engine";
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";

import type { DirectorScene } from "@/types/director";

export function DirectorTimeline({ scene, playhead, selectedId, onPlayheadChange, onSceneChange, onSelect }: {
    scene: DirectorScene;
    playhead: number;
    selectedId: string;
    onPlayheadChange: (time: number) => void;
    onSceneChange: (scene: DirectorScene) => void;
    onSelect: (kind: "shot" | "keyframe", id: string) => void;
}) {
    const timelineRef = useRef<TimelineState>(null);
    const effects = useMemo<Record<string, TimelineEffect>>(() => Object.fromEntries([...scene.shots.map((shot) => [`shot:${shot.id}`, { id: `shot:${shot.id}` }]), ...scene.keyframes.map((keyframe) => [`key:${keyframe.id}`, { id: `key:${keyframe.id}` }])]), [scene.keyframes, scene.shots]);
    const data = useMemo<TimelineRow[]>(() => [
        {
            id: "shots",
            actions: scene.shots.map((shot) => ({ id: `shot:${shot.id}`, start: shot.start, end: shot.end, effectId: `shot:${shot.id}`, flexible: true, movable: true, selected: shot.id === selectedId })),
        },
        {
            id: "keyframes",
            actions: scene.keyframes.map((keyframe) => ({ id: `key:${keyframe.id}`, start: keyframe.time, end: Math.min(scene.duration, keyframe.time + Math.max(0.06, 1 / scene.fps)), effectId: `key:${keyframe.id}`, flexible: false, movable: true, selected: keyframe.id === selectedId })),
        },
    ], [scene.duration, scene.fps, scene.keyframes, scene.shots, selectedId]);

    useEffect(() => { timelineRef.current?.setTime(playhead); }, [playhead]);

    const updateData = (rows: TimelineRow[]) => {
        const actions = rows.flatMap((row) => row.actions);
        const byId = new Map(actions.map((action) => [action.id, action]));
        onSceneChange({
            ...scene,
            shots: scene.shots.map((shot) => {
                const action = byId.get(`shot:${shot.id}`);
                return action ? { ...shot, start: roundTime(action.start, scene.fps), end: roundTime(Math.max(action.start + 1 / scene.fps, action.end), scene.fps) } : shot;
            }),
            keyframes: scene.keyframes.map((keyframe) => {
                const action = byId.get(`key:${keyframe.id}`);
                return action ? { ...keyframe, time: roundTime(action.start, scene.fps) } : keyframe;
            }),
        });
    };

    return (
        <div className="director-timeline grid h-full grid-cols-[118px_minmax(0,1fr)] overflow-hidden border-t border-white/10 bg-[#18191b] text-white">
            <div className="border-r border-white/10 pt-[42px] text-[11px] text-white/65">
                <div className="flex h-[42px] items-center gap-2 border-b border-white/10 px-3"><Film className="size-3.5 text-[#ff8066]" />镜头段</div>
                <div className="flex h-[42px] items-center gap-2 px-3"><Diamond className="size-3.5 text-[#54b6a6]" />关键帧</div>
            </div>
            <Timeline
                ref={timelineRef}
                editorData={data}
                effects={effects}
                scale={1}
                scaleSplitCount={Math.max(1, scene.fps / 6)}
                scaleWidth={92}
                minScaleCount={Math.ceil(scene.duration) + 1}
                maxScaleCount={Math.ceil(scene.duration) + 1}
                rowHeight={42}
                startLeft={10}
                gridSnap
                dragLine
                style={{ width: "100%", height: 126 }}
                getScaleRender={(scale) => <span className="text-[10px] text-white/50">{scale}s</span>}
                getActionRender={(action) => <ActionContent action={action} scene={scene} />}
                onChange={(rows) => updateData(rows)}
                onClickAction={(_event, { action }) => {
                    const [kind, id] = action.id.split(":", 2);
                    onSelect(kind === "shot" ? "shot" : "keyframe", id);
                }}
                onClickTimeArea={(time) => { onPlayheadChange(Math.max(0, Math.min(scene.duration, time))); return true; }}
                onCursorDrag={(time) => onPlayheadChange(Math.max(0, Math.min(scene.duration, time)))}
            />
        </div>
    );
}

function ActionContent({ action, scene }: { action: TimelineAction; scene: DirectorScene }) {
    const [kind, id] = action.id.split(":", 2);
    if (kind === "key") {
        const keyframe = scene.keyframes.find((item) => item.id === id);
        return <div className="flex size-full items-center justify-center" title={keyframe ? `${keyframe.property} · ${keyframe.time.toFixed(2)}s` : "关键帧"}><span className="size-2.5 rotate-45 bg-[#54b6a6] shadow-[0_0_0_2px_#18191b]" /></div>;
    }
    const shot = scene.shots.find((item) => item.id === id);
    return <div className="flex h-full items-center truncate border-l-2 border-[#ff8066] bg-[#7f3328] px-2 text-[10px] text-white">{shot?.name || "镜头"}</div>;
}

function roundTime(value: number, fps: number) { return Math.max(0, Math.round(value * fps) / fps); }
