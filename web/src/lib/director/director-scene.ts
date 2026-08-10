import { nanoid } from "nanoid";

import type { DirectorCamera, DirectorKeyframe, DirectorObject, DirectorScene, DirectorVector3 } from "@/types/director";

export function createDefaultDirectorScene(): DirectorScene {
    return {
        version: 1,
        name: "未命名场景",
        duration: 10,
        fps: 24,
        aspectRatio: "16:9",
        environment: "courtyard",
        background: "#b9c8cf",
        objects: [
            { id: "character-hero", name: "主角", primitive: "character", position: [-1.5, 1, 0], rotation: [0, 0.35, 0], scale: [1, 1, 1], color: "#e9583e" },
            { id: "character-rival", name: "对手", primitive: "character", position: [1.5, 1, -0.4], rotation: [0, -0.45, 0], scale: [1, 1, 1], color: "#268f82" },
            { id: "prop-pillar", name: "场景道具", primitive: "cylinder", position: [0, 0.6, -2.2], rotation: [0, 0, 0], scale: [0.7, 1.2, 0.7], color: "#8b8175" },
        ],
        cameras: [
            { id: "camera-wide", name: "全景机位", position: [7, 4.5, 9], target: [0, 1, 0], fov: 42 },
            { id: "camera-close", name: "近景机位", position: [3.2, 2.3, 4.2], target: [-0.7, 1.2, 0], fov: 36 },
        ],
        shots: [
            { id: "shot-wide", name: "建立空间", cameraId: "camera-wide", start: 0, end: 5, movement: "push-in", description: "交代人物关系与空间" },
            { id: "shot-close", name: "动作近景", cameraId: "camera-close", start: 5, end: 10, movement: "orbit", description: "绕至主角侧前方加强冲突" },
        ],
        keyframes: [
            { id: "key-hero-start", targetType: "object", targetId: "character-hero", property: "position", time: 0, value: [-1.5, 1, 0] },
            { id: "key-hero-end", targetType: "object", targetId: "character-hero", property: "position", time: 8, value: [-0.25, 1, 0.4] },
            { id: "key-close-start", targetType: "camera", targetId: "camera-close", property: "position", time: 5, value: [3.2, 2.3, 4.2] },
            { id: "key-close-end", targetType: "camera", targetId: "camera-close", property: "position", time: 10, value: [1.8, 2.1, 3] },
        ],
    };
}

export function normalizeDirectorScene(value: unknown): DirectorScene {
    const fallback = createDefaultDirectorScene();
    if (!value || typeof value !== "object") return fallback;
    const scene = value as Partial<DirectorScene>;
    const cameras = Array.isArray(scene.cameras) && scene.cameras.length ? scene.cameras.map(normalizeCamera) : fallback.cameras;
    const cameraIds = new Set(cameras.map((camera) => camera.id));
    const duration = clamp(numberValue(scene.duration, fallback.duration), 1, 120);
    return {
        ...fallback,
        ...scene,
        version: 1,
        name: stringValue(scene.name, fallback.name),
        duration,
        fps: Math.round(clamp(numberValue(scene.fps, fallback.fps), 12, 60)),
        objects: Array.isArray(scene.objects) ? scene.objects.map(normalizeObject) : fallback.objects,
        cameras,
        shots: Array.isArray(scene.shots)
            ? scene.shots.filter((shot) => shot && cameraIds.has(shot.cameraId)).map((shot) => ({ ...shot, start: clamp(numberValue(shot.start, 0), 0, duration), end: clamp(numberValue(shot.end, duration), 0, duration) })).filter((shot) => shot.end > shot.start)
            : fallback.shots,
        keyframes: Array.isArray(scene.keyframes) ? scene.keyframes.map((keyframe) => ({ ...keyframe, time: clamp(numberValue(keyframe.time, 0), 0, duration), value: Array.isArray(keyframe.value) ? keyframe.value.map(Number).filter(Number.isFinite) : [] })) : fallback.keyframes,
    };
}

export function sceneAtTime(scene: DirectorScene, time: number) {
    const currentTime = clamp(time, 0, scene.duration);
    const objects = scene.objects.map((object) => ({
        ...object,
        position: vectorAt(scene.keyframes, "object", object.id, "position", currentTime, object.position),
        rotation: vectorAt(scene.keyframes, "object", object.id, "rotation", currentTime, object.rotation),
        scale: vectorAt(scene.keyframes, "object", object.id, "scale", currentTime, object.scale),
    }));
    const shot = [...scene.shots].sort((left, right) => left.start - right.start).find((item) => currentTime >= item.start && currentTime <= item.end) || scene.shots[0];
    const baseCamera = scene.cameras.find((camera) => camera.id === shot?.cameraId) || scene.cameras[0];
    const camera = baseCamera ? {
        ...baseCamera,
        position: vectorAt(scene.keyframes, "camera", baseCamera.id, "position", currentTime, baseCamera.position),
        target: vectorAt(scene.keyframes, "camera", baseCamera.id, "target", currentTime, baseCamera.target),
        fov: scalarAt(scene.keyframes, baseCamera.id, "fov", currentTime, baseCamera.fov),
    } : fallbackCamera();
    return { objects, camera, shot };
}

export function upsertTransformKeyframes(scene: DirectorScene, targetType: "object" | "camera", targetId: string, time: number) {
    const target = targetType === "object" ? scene.objects.find((item) => item.id === targetId) : scene.cameras.find((item) => item.id === targetId);
    if (!target) return scene;
    const entries: Array<{ property: DirectorKeyframe["property"]; value: number[] }> = targetType === "object"
        ? [
              { property: "position", value: (target as DirectorObject).position },
              { property: "rotation", value: (target as DirectorObject).rotation },
              { property: "scale", value: (target as DirectorObject).scale },
          ]
        : [
              { property: "position", value: (target as DirectorCamera).position },
              { property: "target", value: (target as DirectorCamera).target },
              { property: "fov", value: [(target as DirectorCamera).fov] },
          ];
    const roundedTime = Math.round(clamp(time, 0, scene.duration) * scene.fps) / scene.fps;
    const keys = scene.keyframes.filter((keyframe) => !(keyframe.targetType === targetType && keyframe.targetId === targetId && entries.some((entry) => entry.property === keyframe.property) && Math.abs(keyframe.time - roundedTime) < 0.001));
    return { ...scene, keyframes: [...keys, ...entries.map((entry) => ({ id: `key-${nanoid()}`, targetType, targetId, property: entry.property, time: roundedTime, value: [...entry.value] }))] };
}

export function buildSeedanceDirectorPrompt(scene: DirectorScene) {
    const objectText = scene.objects.filter((object) => object.visible !== false).map((object) => `${object.name}位于(${formatVector(object.position)})，朝向(${formatVector(object.rotation)})`).join("；");
    const shots = [...scene.shots].sort((left, right) => left.start - right.start).map((shot, index) => {
        const camera = scene.cameras.find((item) => item.id === shot.cameraId);
        return `镜头${index + 1} [${formatTime(shot.start)}-${formatTime(shot.end)}] ${shot.name}：${movementLabel(shot.movement)}，${camera ? `${camera.name}，${camera.fov}mm感视场，机位(${formatVector(camera.position)})看向(${formatVector(camera.target)})` : "保持当前机位"}${shot.description ? `，${shot.description}` : ""}`;
    });
    const animated = [...new Set(scene.keyframes.map((keyframe) => [...scene.objects, ...scene.cameras].find((item) => item.id === keyframe.targetId)?.name).filter(Boolean))].join("、");
    return [
        `${scene.duration}秒，${scene.aspectRatio}，${scene.fps}fps，${environmentLabel(scene.environment)}。`,
        objectText ? `空间调度：${objectText}。` : "",
        ...shots,
        animated ? `连续性要求：${animated}按关键帧平滑运动，人物身份、服装、空间方位和光线方向保持一致；镜头切换动作连续，不跳轴。` : "人物身份、空间方位和光线方向保持一致，镜头切换不跳轴。",
        "画面要求：电影级真实材质与体积光，动作清晰，主体轮廓稳定，无文字、无水印、无多余肢体、无闪烁。",
    ].filter(Boolean).join("\n");
}

function normalizeObject(object: DirectorObject): DirectorObject {
    return { ...object, id: stringValue(object.id, `object-${nanoid()}`), name: stringValue(object.name, "未命名对象"), position: vectorValue(object.position, [0, 0, 0]), rotation: vectorValue(object.rotation, [0, 0, 0]), scale: vectorValue(object.scale, [1, 1, 1]), color: /^#[0-9a-f]{6}$/i.test(object.color || "") ? object.color : "#e9583e" };
}

function normalizeCamera(camera: DirectorCamera): DirectorCamera {
    return { ...camera, id: stringValue(camera.id, `camera-${nanoid()}`), name: stringValue(camera.name, "未命名机位"), position: vectorValue(camera.position, [6, 4, 8]), target: vectorValue(camera.target, [0, 1, 0]), fov: clamp(numberValue(camera.fov, 42), 15, 100) };
}

function vectorAt(keys: DirectorKeyframe[], targetType: DirectorKeyframe["targetType"], targetId: string, property: DirectorKeyframe["property"], time: number, fallback: DirectorVector3): DirectorVector3 {
    const values = keys.filter((key) => key.targetType === targetType && key.targetId === targetId && key.property === property && key.value.length >= 3).sort((left, right) => left.time - right.time);
    const pair = surrounding(values, time);
    if (!pair) return fallback;
    if (pair[0] === pair[1]) return vectorValue(pair[0].value, fallback);
    const ratio = (time - pair[0].time) / Math.max(0.0001, pair[1].time - pair[0].time);
    return [0, 1, 2].map((index) => lerp(pair[0].value[index], pair[1].value[index], ratio)) as DirectorVector3;
}

function scalarAt(keys: DirectorKeyframe[], targetId: string, property: DirectorKeyframe["property"], time: number, fallback: number) {
    const values = keys.filter((key) => key.targetType === "camera" && key.targetId === targetId && key.property === property && key.value.length).sort((left, right) => left.time - right.time);
    const pair = surrounding(values, time);
    if (!pair) return fallback;
    if (pair[0] === pair[1]) return pair[0].value[0] ?? fallback;
    return lerp(pair[0].value[0], pair[1].value[0], (time - pair[0].time) / Math.max(0.0001, pair[1].time - pair[0].time));
}

function surrounding(values: DirectorKeyframe[], time: number): [DirectorKeyframe, DirectorKeyframe] | null {
    if (!values.length) return null;
    const before = [...values].reverse().find((key) => key.time <= time) || values[0];
    const after = values.find((key) => key.time >= time) || values[values.length - 1];
    return [before, after];
}

function fallbackCamera(): DirectorCamera { return { id: "camera-default", name: "默认机位", position: [6, 4, 8], target: [0, 1, 0], fov: 42 }; }
function vectorValue(value: unknown, fallback: DirectorVector3): DirectorVector3 { return Array.isArray(value) && value.length >= 3 ? [numberValue(value[0], fallback[0]), numberValue(value[1], fallback[1]), numberValue(value[2], fallback[2])] : fallback; }
function numberValue(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function stringValue(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function lerp(from: number, to: number, amount: number) { return from + (to - from) * clamp(amount, 0, 1); }
function formatVector(value: DirectorVector3) { return value.map((item) => Number(item.toFixed(2))).join(","); }
function formatTime(value: number) { return `${Number(value.toFixed(2))}s`; }
function movementLabel(value: DirectorScene["shots"][number]["movement"]) { return ({ static: "固定机位", "push-in": "缓慢推近", "pull-out": "缓慢拉远", "pan-left": "向左摇摄", "pan-right": "向右摇摄", orbit: "环绕主体", follow: "跟随主体" } as const)[value]; }
function environmentLabel(value: DirectorScene["environment"]) { return ({ studio: "摄影棚布光", courtyard: "东方院落", mountain: "山地云海", desert: "荒漠风沙", space: "太空场景" } as const)[value]; }
