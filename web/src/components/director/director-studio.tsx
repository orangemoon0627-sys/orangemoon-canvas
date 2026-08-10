import { ArrowLeft, Box, Camera, Circle, Clapperboard, Cone, Cuboid, Diamond, Download, Film, Image as ImageIcon, KeyRound, Menu, Move3d, Pause, Play, Plus, Rotate3d, Save, Scaling, Settings2, SlidersHorizontal, Sparkles, Trash2, Upload, UserRound, Video } from "lucide-react";
import { App, Button, Divider, Drawer, Dropdown, Input, InputNumber, Select, Tooltip } from "antd";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DirectorTimeline } from "@/components/director/director-timeline";
import { DirectorViewport, type DirectorTransformMode } from "@/components/director/director-viewport";
import { buildSeedanceDirectorPrompt, normalizeDirectorScene, sceneAtTime, upsertTransformKeyframes } from "@/lib/director/director-scene";
import { uploadMediaFile } from "@/services/file-storage";
import type { DirectorCamera, DirectorKeyframe, DirectorObject, DirectorPrimitive, DirectorScene, DirectorShot, DirectorVector3 } from "@/types/director";

type Selection = { kind: "object" | "camera" | "shot" | "keyframe"; id: string };

export function DirectorStudio({ initialScene, onClose, onSave, onExportImage, onExportPrompt }: {
    initialScene: unknown;
    onClose: () => void;
    onSave: (scene: DirectorScene) => void;
    onExportImage: (scene: DirectorScene, blob: Blob) => Promise<void>;
    onExportPrompt: (scene: DirectorScene, prompt: string) => void;
}) {
    const { message } = App.useApp();
    const [scene, setScene] = useState(() => normalizeDirectorScene(initialScene));
    const [playhead, setPlayhead] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [selection, setSelection] = useState<Selection>(() => ({ kind: "object", id: normalizeDirectorScene(initialScene).objects[0]?.id || "" }));
    const [transformMode, setTransformMode] = useState<DirectorTransformMode>("translate");
    const [leftDrawer, setLeftDrawer] = useState(false);
    const [rightDrawer, setRightDrawer] = useState(false);
    const [exporting, setExporting] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const sceneRef = useRef(scene);

    useEffect(() => { sceneRef.current = scene; }, [scene]);

    const changeScene = useCallback((next: DirectorScene | ((current: DirectorScene) => DirectorScene)) => {
        setScene((current) => typeof next === "function" ? next(current) : next);
        setDirty(true);
    }, []);

    useEffect(() => {
        if (!dirty) return;
        const timer = window.setTimeout(() => {
            onSave(sceneRef.current);
            setDirty(false);
        }, 800);
        return () => window.clearTimeout(timer);
    }, [dirty, onSave, scene]);

    useEffect(() => {
        if (!playing) return;
        const startedAt = performance.now() - playhead * 1000;
        let frame = 0;
        const tick = (now: number) => {
            const next = (now - startedAt) / 1000;
            if (next >= scene.duration) {
                setPlayhead(scene.duration);
                setPlaying(false);
                return;
            }
            setPlayhead(next);
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [playing, scene.duration]);

    const close = () => {
        if (dirty) onSave(scene);
        onClose();
    };

    const save = () => {
        onSave(scene);
        setDirty(false);
        message.success("导演台已保存到画布");
    };

    const capture = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setExporting(true);
        try {
            const blob = await canvasBlob(canvas);
            await onExportImage(scene, blob);
            message.success("当前机位已输出为图片节点");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "截图失败");
        } finally { setExporting(false); }
    };

    const exportPrompt = () => {
        onExportPrompt(scene, buildSeedanceDirectorPrompt(scene));
        message.success("Seedance 运镜提示词已输出到画布");
    };

    const selectedObject = selection.kind === "object" ? scene.objects.find((item) => item.id === selection.id) : undefined;
    const selectedCamera = selection.kind === "camera" ? scene.cameras.find((item) => item.id === selection.id) : undefined;
    const selectedShot = selection.kind === "shot" ? scene.shots.find((item) => item.id === selection.id) : undefined;
    const selectedKeyframe = selection.kind === "keyframe" ? scene.keyframes.find((item) => item.id === selection.id) : undefined;
    const evaluatedCamera = sceneAtTime(scene, playhead).camera;

    const updateObject = (id: string, patch: Partial<DirectorObject>, recordMotion = false) => changeScene((current) => {
        const updated = { ...current, objects: current.objects.map((object) => object.id === id ? { ...object, ...patch } : object) };
        return recordMotion && (playhead > 0 || current.keyframes.some((keyframe) => keyframe.targetType === "object" && keyframe.targetId === id)) ? upsertTransformKeyframes(updated, "object", id, playhead) : updated;
    });
    const updateCamera = (id: string, patch: Partial<DirectorCamera>, recordMotion = false) => changeScene((current) => {
        const updated = { ...current, cameras: current.cameras.map((camera) => camera.id === id ? { ...camera, ...patch } : camera) };
        return recordMotion && (playhead > 0 || current.keyframes.some((keyframe) => keyframe.targetType === "camera" && keyframe.targetId === id)) ? upsertTransformKeyframes(updated, "camera", id, playhead) : updated;
    });

    const updateCurrentShotCamera = (camera: DirectorCamera) => updateCamera(camera.id, camera, true);
    const addObject = (primitive: DirectorPrimitive) => {
        const id = `object-${nanoid()}`;
        const object: DirectorObject = { id, name: primitive === "character" ? `人物 ${scene.objects.filter((item) => item.primitive === "character").length + 1}` : `道具 ${scene.objects.length + 1}`, primitive, position: [0, primitive === "character" ? 1 : 0.65, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: primitive === "character" ? "#e9583e" : "#558b82" };
        changeScene({ ...scene, objects: [...scene.objects, object] });
        setSelection({ kind: "object", id });
    };

    const uploadModel = async (file?: File) => {
        if (!file) return;
        if (!/\.(?:glb|gltf)$/i.test(file.name)) return void message.error("请选择 GLB 或 GLTF 模型，建议使用单文件 GLB");
        try {
            const model = await uploadMediaFile(file, "model");
            const id = `object-${nanoid()}`;
            const object: DirectorObject = { id, name: file.name.replace(/\.(?:glb|gltf)$/i, ""), primitive: "model", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#c1c7c8", modelUrl: model.url, storageKey: model.storageKey };
            changeScene({ ...scene, objects: [...scene.objects, object] });
            setSelection({ kind: "object", id });
        } catch (error) { message.error(error instanceof Error ? error.message : "模型读取失败"); }
    };

    const addCamera = () => {
        const id = `camera-${nanoid()}`;
        const camera: DirectorCamera = { ...evaluatedCamera, id, name: `机位 ${scene.cameras.length + 1}` };
        changeScene({ ...scene, cameras: [...scene.cameras, camera] });
        setSelection({ kind: "camera", id });
    };

    const addShot = () => {
        const start = Math.min(playhead, Math.max(0, scene.duration - 1));
        const id = `shot-${nanoid()}`;
        const shot: DirectorShot = { id, name: `镜头 ${scene.shots.length + 1}`, cameraId: evaluatedCamera.id, start, end: Math.min(scene.duration, start + Math.min(3, scene.duration)), movement: "static" };
        changeScene({ ...scene, shots: [...scene.shots, shot].sort((left, right) => left.start - right.start) });
        setSelection({ kind: "shot", id });
    };

    const recordKeys = () => {
        if (selection.kind !== "object" && selection.kind !== "camera") return;
        changeScene(upsertTransformKeyframes(scene, selection.kind, selection.id, playhead));
        message.success(`已在 ${playhead.toFixed(2)}s 记录关键帧`);
    };

    const deleteSelection = () => {
        if (selection.kind === "object") changeScene({ ...scene, objects: scene.objects.filter((item) => item.id !== selection.id), keyframes: scene.keyframes.filter((item) => item.targetId !== selection.id) });
        if (selection.kind === "camera") {
            if (scene.cameras.length <= 1) return void message.warning("至少保留一个机位");
            const fallback = scene.cameras.find((item) => item.id !== selection.id)!;
            changeScene({ ...scene, cameras: scene.cameras.filter((item) => item.id !== selection.id), shots: scene.shots.map((shot) => shot.cameraId === selection.id ? { ...shot, cameraId: fallback.id } : shot), keyframes: scene.keyframes.filter((item) => item.targetId !== selection.id) });
        }
        if (selection.kind === "shot") changeScene({ ...scene, shots: scene.shots.filter((item) => item.id !== selection.id) });
        if (selection.kind === "keyframe") changeScene({ ...scene, keyframes: scene.keyframes.filter((item) => item.id !== selection.id) });
        setSelection({ kind: "object", id: scene.objects.find((item) => item.id !== selection.id)?.id || "" });
    };

    const leftPanel = <ScenePanel scene={scene} selection={selection} onSelect={setSelection} onSceneChange={changeScene} onAddObject={addObject} onUploadModel={uploadModel} onAddCamera={addCamera} onAddShot={addShot} />;
    const inspector = <Inspector scene={scene} selection={selection} object={selectedObject} camera={selectedCamera} shot={selectedShot} keyframe={selectedKeyframe} playhead={playhead} onSceneChange={changeScene} onUpdateObject={updateObject} onUpdateCamera={updateCamera} onRecordKeys={recordKeys} onDelete={deleteSelection} />;

    return (
        <div className="fixed inset-0 z-[1000] grid grid-rows-[52px_minmax(0,1fr)_168px] overflow-hidden bg-[#202124] text-white" data-canvas-no-zoom>
            <header className="flex min-w-0 items-center gap-2 border-b border-white/10 bg-[#191a1c] px-2 sm:px-3">
                <Tooltip title="返回画布"><Button type="text" shape="circle" className="!text-white/75 hover:!text-white" icon={<ArrowLeft className="size-4" />} onClick={close} /></Tooltip>
                <Clapperboard className="size-4 shrink-0 text-[#ff8066]" />
                <Input variant="borderless" value={scene.name} className="!min-w-24 !max-w-60 !text-sm !font-medium !text-white" onChange={(event) => changeScene({ ...scene, name: event.target.value })} />
                <span className="hidden text-[11px] text-white/35 sm:inline">{dirty ? "未保存" : "已保存"}</span>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    <div className="hidden items-center gap-1 lg:flex"><Select size="small" value={scene.aspectRatio} popupMatchSelectWidth={false} options={["16:9", "9:16", "1:1", "4:3", "3:4"].map((value) => ({ value, label: value }))} onChange={(aspectRatio) => changeScene({ ...scene, aspectRatio })} /><InputNumber size="small" min={1} max={120} value={scene.duration} addonAfter="s" className="w-24" onChange={(duration) => duration && changeScene({ ...scene, duration })} /></div>
                    <Tooltip title="场景与对象"><Button type="text" className="!text-white/75 lg:!hidden" icon={<Menu className="size-4" />} onClick={() => setLeftDrawer(true)} /></Tooltip>
                    <Tooltip title="属性"><Button type="text" className="!text-white/75 lg:!hidden" icon={<SlidersHorizontal className="size-4" />} onClick={() => setRightDrawer(true)} /></Tooltip>
                    <Tooltip title="输出当前机位"><Button type="text" className="!text-white/75" loading={exporting} icon={<ImageIcon className="size-4" />} onClick={() => void capture()} /></Tooltip>
                    <Tooltip title="输出 Seedance 运镜提示词"><Button type="text" className="!text-white/75" icon={<Sparkles className="size-4" />} onClick={exportPrompt} /></Tooltip>
                    <Button type="primary" size="small" icon={<Save className="size-3.5" />} onClick={save}>保存</Button>
                </div>
            </header>

            <div className="grid min-h-0 lg:grid-cols-[240px_minmax(0,1fr)_288px]">
                <aside className="hidden min-h-0 overflow-y-auto border-r border-white/10 bg-[#1c1d1f] lg:block">{leftPanel}</aside>
                <main className="relative min-h-0 overflow-hidden bg-[#111214]">
                    <DirectorViewport scene={scene} playhead={playhead} playing={playing} selectedObjectId={selection.kind === "object" ? selection.id : ""} transformMode={transformMode} onSelectObject={(id) => id && setSelection({ kind: "object", id })} onObjectTransform={(id, transform) => updateObject(id, transform, true)} onCameraChange={updateCurrentShotCamera} onCanvasReady={(canvas) => { canvasRef.current = canvas; }} />
                    <div className="absolute left-3 top-3 flex gap-1 bg-black/45 p-1 backdrop-blur-sm"><ToolButton title="移动" active={transformMode === "translate"} onClick={() => setTransformMode("translate")}><Move3d /></ToolButton><ToolButton title="旋转" active={transformMode === "rotate"} onClick={() => setTransformMode("rotate")}><Rotate3d /></ToolButton><ToolButton title="缩放" active={transformMode === "scale"} onClick={() => setTransformMode("scale")}><Scaling /></ToolButton></div>
                    <div className="pointer-events-none absolute inset-x-0 top-3 text-center"><span className="bg-black/45 px-2 py-1 text-[10px] text-white/70 backdrop-blur-sm">{sceneAtTime(scene, playhead).shot?.name || "自由机位"} · {playhead.toFixed(2)}s</span></div>
                </main>
                <aside className="hidden min-h-0 overflow-y-auto border-l border-white/10 bg-[#1c1d1f] lg:block">{inspector}</aside>
            </div>

            <section className="min-h-0 bg-[#18191b]">
                <div className="flex h-[42px] items-center gap-2 border-t border-white/10 px-3">
                    <ToolButton title={playing ? "暂停" : "播放"} active={playing} onClick={() => { if (playhead >= scene.duration) setPlayhead(0); setPlaying((value) => !value); }}>{playing ? <Pause /> : <Play />}</ToolButton>
                    <span className="w-20 font-mono text-[11px] text-white/70">{playhead.toFixed(2)} / {scene.duration.toFixed(2)}</span>
                    <Button type="text" size="small" className="!text-white/65" icon={<Diamond className="size-3.5" />} disabled={selection.kind !== "object" && selection.kind !== "camera"} onClick={recordKeys}>记录关键帧</Button>
                    <Button type="text" size="small" className="!ml-auto !text-white/65" icon={<Film className="size-3.5" />} onClick={addShot}>新增镜头</Button>
                </div>
                <div className="h-[126px]"><DirectorTimeline scene={scene} playhead={playhead} selectedId={selection.id} onPlayheadChange={(time) => { setPlaying(false); setPlayhead(time); }} onSceneChange={changeScene} onSelect={(kind, id) => setSelection({ kind, id })} /></div>
            </section>

            <Drawer title="场景与对象" placement="left" width={280} open={leftDrawer} onClose={() => setLeftDrawer(false)} styles={{ body: { padding: 0, background: "#1c1d1f", color: "white" }, header: { background: "#191a1c", color: "white", borderColor: "rgba(255,255,255,.1)" } }}>{leftPanel}</Drawer>
            <Drawer title="属性" placement="right" width={300} open={rightDrawer} onClose={() => setRightDrawer(false)} styles={{ body: { padding: 0, background: "#1c1d1f", color: "white" }, header: { background: "#191a1c", color: "white", borderColor: "rgba(255,255,255,.1)" } }}>{inspector}</Drawer>
        </div>
    );
}

function ScenePanel({ scene, selection, onSelect, onSceneChange, onAddObject, onUploadModel, onAddCamera, onAddShot }: { scene: DirectorScene; selection: Selection; onSelect: (selection: Selection) => void; onSceneChange: (scene: DirectorScene) => void; onAddObject: (primitive: DirectorPrimitive) => void; onUploadModel: (file?: File) => void; onAddCamera: () => void; onAddShot: () => void }) {
    const modelInput = useRef<HTMLInputElement>(null);
    const addMenu = { items: [
        { key: "character", icon: <UserRound className="size-4" />, label: "人物占位", onClick: () => onAddObject("character") },
        { key: "box", icon: <Box className="size-4" />, label: "方体道具", onClick: () => onAddObject("box") },
        { key: "sphere", icon: <Circle className="size-4" />, label: "球体道具", onClick: () => onAddObject("sphere") },
        { key: "cylinder", icon: <Cuboid className="size-4" />, label: "柱体道具", onClick: () => onAddObject("cylinder") },
        { key: "cone", icon: <Cone className="size-4" />, label: "锥体道具", onClick: () => onAddObject("cone") },
        { type: "divider" as const },
        { key: "model", icon: <Upload className="size-4" />, label: "导入 GLB 模型", onClick: () => modelInput.current?.click() },
    ] };
    return <div className="p-3 text-white"><PanelHeading title="场景" icon={<Settings2 />} /><Select className="w-full" value={scene.environment} options={[{ value: "courtyard", label: "东方院落" }, { value: "studio", label: "摄影棚" }, { value: "mountain", label: "山地云海" }, { value: "desert", label: "荒漠" }, { value: "space", label: "太空" }]} onChange={(environment) => onSceneChange({ ...scene, environment })} /><label className="mt-3 flex items-center justify-between text-xs text-white/55"><span>背景色</span><input type="color" value={scene.background} onChange={(event) => onSceneChange({ ...scene, background: event.target.value })} className="h-7 w-10 cursor-pointer border-0 bg-transparent" /></label>
        <Divider className="!border-white/10" />
        <PanelHeading title="人物与道具" icon={<Cuboid />} action={<Dropdown menu={addMenu} trigger={["click"]}><Button type="text" size="small" className="!text-white/70" icon={<Plus className="size-4" />} /></Dropdown>} />
        <input ref={modelInput} hidden type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(event) => { void onUploadModel(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        <div className="space-y-0.5">{scene.objects.map((object) => <ListRow key={object.id} active={selection.kind === "object" && selection.id === object.id} icon={object.primitive === "character" ? <UserRound /> : object.primitive === "model" ? <Download /> : <Box />} title={object.name} meta={object.primitive === "model" ? "GLB" : object.primitive} onClick={() => onSelect({ kind: "object", id: object.id })} />)}</div>
        <Divider className="!border-white/10" />
        <PanelHeading title="机位" icon={<Camera />} action={<Button type="text" size="small" className="!text-white/70" icon={<Plus className="size-4" />} onClick={onAddCamera} />} />
        <div className="space-y-0.5">{scene.cameras.map((camera) => <ListRow key={camera.id} active={selection.kind === "camera" && selection.id === camera.id} icon={<Camera />} title={camera.name} meta={`${camera.fov}°`} onClick={() => onSelect({ kind: "camera", id: camera.id })} />)}</div>
        <Divider className="!border-white/10" />
        <PanelHeading title="镜头" icon={<Video />} action={<Button type="text" size="small" className="!text-white/70" icon={<Plus className="size-4" />} onClick={onAddShot} />} />
        <div className="space-y-0.5">{[...scene.shots].sort((a, b) => a.start - b.start).map((shot) => <ListRow key={shot.id} active={selection.kind === "shot" && selection.id === shot.id} icon={<Film />} title={shot.name} meta={`${shot.start.toFixed(1)}-${shot.end.toFixed(1)}s`} onClick={() => onSelect({ kind: "shot", id: shot.id })} />)}</div>
    </div>;
}

function Inspector({ scene, selection, object, camera, shot, keyframe, playhead, onSceneChange, onUpdateObject, onUpdateCamera, onRecordKeys, onDelete }: { scene: DirectorScene; selection: Selection; object?: DirectorObject; camera?: DirectorCamera; shot?: DirectorShot; keyframe?: DirectorKeyframe; playhead: number; onSceneChange: (scene: DirectorScene) => void; onUpdateObject: (id: string, patch: Partial<DirectorObject>) => void; onUpdateCamera: (id: string, patch: Partial<DirectorCamera>) => void; onRecordKeys: () => void; onDelete: () => void }) {
    if (!object && !camera && !shot && !keyframe) return <div className="p-5 text-sm text-white/45">选择对象、机位、镜头或关键帧进行编辑。</div>;
    const updateShot = (patch: Partial<DirectorShot>) => shot && onSceneChange({ ...scene, shots: scene.shots.map((item) => item.id === shot.id ? { ...item, ...patch } : item) });
    const updateKeyframe = (patch: Partial<DirectorKeyframe>) => keyframe && onSceneChange({ ...scene, keyframes: scene.keyframes.map((item) => item.id === keyframe.id ? { ...item, ...patch } : item) });
    return <div className="p-4 text-white"><PanelHeading title="属性" icon={<SlidersHorizontal />} />
        {object ? <><FieldLabel>名称</FieldLabel><Input value={object.name} onChange={(event) => onUpdateObject(object.id, { name: event.target.value })} /><div className="mt-4 grid grid-cols-[1fr_44px] items-end gap-2"><div><FieldLabel>颜色</FieldLabel><Input value={object.color} onChange={(event) => onUpdateObject(object.id, { color: event.target.value })} /></div><input type="color" value={object.color} onChange={(event) => onUpdateObject(object.id, { color: event.target.value })} className="h-8 w-11" /></div><VectorField label="位置" value={object.position} onChange={(position) => onUpdateObject(object.id, { position })} /><VectorField label="旋转（弧度）" value={object.rotation} step={0.05} onChange={(rotation) => onUpdateObject(object.id, { rotation })} /><VectorField label="缩放" value={object.scale} step={0.1} min={0.01} onChange={(scale) => onUpdateObject(object.id, { scale })} /></> : null}
        {camera ? <><FieldLabel>名称</FieldLabel><Input value={camera.name} onChange={(event) => onUpdateCamera(camera.id, { name: event.target.value })} /><VectorField label="机位" value={camera.position} onChange={(position) => onUpdateCamera(camera.id, { position })} /><VectorField label="看向" value={camera.target} onChange={(target) => onUpdateCamera(camera.id, { target })} /><FieldLabel>视场角</FieldLabel><InputNumber className="w-full" min={15} max={100} value={camera.fov} addonAfter="°" onChange={(fov) => fov && onUpdateCamera(camera.id, { fov })} /></> : null}
        {shot ? <><FieldLabel>镜头名称</FieldLabel><Input value={shot.name} onChange={(event) => updateShot({ name: event.target.value })} /><FieldLabel>使用机位</FieldLabel><Select className="w-full" value={shot.cameraId} options={scene.cameras.map((item) => ({ value: item.id, label: item.name }))} onChange={(cameraId) => updateShot({ cameraId })} /><div className="grid grid-cols-2 gap-2"><div><FieldLabel>开始</FieldLabel><InputNumber className="w-full" min={0} max={scene.duration} step={1 / scene.fps} value={shot.start} onChange={(start) => start !== null && updateShot({ start })} /></div><div><FieldLabel>结束</FieldLabel><InputNumber className="w-full" min={0} max={scene.duration} step={1 / scene.fps} value={shot.end} onChange={(end) => end !== null && updateShot({ end })} /></div></div><FieldLabel>运镜</FieldLabel><Select className="w-full" value={shot.movement} options={[{ value: "static", label: "固定" }, { value: "push-in", label: "推近" }, { value: "pull-out", label: "拉远" }, { value: "pan-left", label: "左摇" }, { value: "pan-right", label: "右摇" }, { value: "orbit", label: "环绕" }, { value: "follow", label: "跟随" }]} onChange={(movement) => updateShot({ movement })} /><FieldLabel>镜头意图</FieldLabel><Input.TextArea rows={4} value={shot.description} onChange={(event) => updateShot({ description: event.target.value })} /></> : null}
        {keyframe ? <><FieldLabel>时间</FieldLabel><InputNumber className="w-full" min={0} max={scene.duration} step={1 / scene.fps} value={keyframe.time} onChange={(time) => time !== null && updateKeyframe({ time })} /><FieldLabel>属性</FieldLabel><Input value={`${keyframe.targetType} / ${keyframe.property}`} disabled /><FieldLabel>数值</FieldLabel><Input value={keyframe.value.join(", ")} onChange={(event) => updateKeyframe({ value: event.target.value.split(",").map(Number).filter(Number.isFinite) })} /></> : null}
        <Divider className="!border-white/10" />
        {(selection.kind === "object" || selection.kind === "camera") ? <Button block icon={<KeyRound className="size-4" />} onClick={onRecordKeys}>在 {playhead.toFixed(2)}s 记录关键帧</Button> : null}
        <Button block danger type="text" className="!mt-2" icon={<Trash2 className="size-4" />} onClick={onDelete}>删除{selection.kind === "shot" ? "镜头" : selection.kind === "keyframe" ? "关键帧" : "对象"}</Button>
    </div>;
}

function PanelHeading({ title, icon, action }: { title: string; icon: React.ReactNode; action?: React.ReactNode }) { return <div className="mb-3 flex h-7 items-center gap-2 text-xs font-medium text-white/70 [&_svg]:size-3.5">{icon}<span>{title}</span><span className="ml-auto">{action}</span></div>; }
function FieldLabel({ children }: { children: React.ReactNode }) { return <div className="mb-1.5 mt-4 text-[11px] text-white/45">{children}</div>; }
function ListRow({ active, icon, title, meta, onClick }: { active: boolean; icon: React.ReactNode; title: string; meta: string; onClick: () => void }) { return <button type="button" onClick={onClick} className={`flex h-9 w-full items-center gap-2 px-2 text-left text-xs transition ${active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}><span className="[&_svg]:size-3.5">{icon}</span><span className="min-w-0 flex-1 truncate">{title}</span><span className="text-[9px] text-white/30">{meta}</span></button>; }
function VectorField({ label, value, step = 0.1, min, onChange }: { label: string; value: DirectorVector3; step?: number; min?: number; onChange: (value: DirectorVector3) => void }) { return <div><FieldLabel>{label}</FieldLabel><div className="grid grid-cols-3 gap-1">{value.map((item, index) => <InputNumber key={index} controls={false} min={min} step={step} value={Number(item.toFixed(3))} prefix={["X", "Y", "Z"][index]} onChange={(next) => { if (next === null) return; const vector = [...value] as DirectorVector3; vector[index] = next; onChange(vector); }} />)}</div></div>; }
function ToolButton({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: React.ReactNode }) { return <Tooltip title={title}><button type="button" onClick={onClick} className={`grid size-8 place-items-center transition [&_svg]:size-4 ${active ? "bg-[#e9583e] text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}>{children}</button></Tooltip>; }

function canvasBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("浏览器未能导出当前画面")), "image/png", 0.94));
}
