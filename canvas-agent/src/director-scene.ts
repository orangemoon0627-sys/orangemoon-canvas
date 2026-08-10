import crypto from "node:crypto";

import type { DirectorCamera, DirectorKeyframe, DirectorObject, DirectorScene, DirectorVector3 } from "./types.js";

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
        ],
        cameras: [{ id: "camera-wide", name: "全景机位", position: [7, 4.5, 9], target: [0, 1, 0], fov: 42 }],
        shots: [{ id: "shot-wide", name: "建立空间", cameraId: "camera-wide", start: 0, end: 10, movement: "push-in", description: "交代人物关系与空间" }],
        keyframes: [],
    };
}

export function mergeDirectorScene(current: unknown, patch: unknown, replace = false) {
    const base = normalizeDirectorScene(current);
    const next = patch && typeof patch === "object" && !Array.isArray(patch) ? patch as Partial<DirectorScene> : {};
    return normalizeDirectorScene(replace ? next : { ...base, ...next });
}

export function normalizeDirectorScene(value: unknown): DirectorScene {
    const fallback = createDefaultDirectorScene();
    const scene = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<DirectorScene> : {};
    const duration = clamp(numberValue(scene.duration, fallback.duration), 1, 120);
    const objects = Array.isArray(scene.objects) ? scene.objects.slice(0, 80).map(normalizeObject) : fallback.objects;
    const cameras = Array.isArray(scene.cameras) && scene.cameras.length ? scene.cameras.slice(0, 24).map(normalizeCamera) : fallback.cameras;
    const objectIds = new Set(objects.map((object) => object.id));
    const cameraIds = new Set(cameras.map((camera) => camera.id));
    const shots = Array.isArray(scene.shots)
        ? scene.shots.slice(0, 80).flatMap((shot) => {
              if (!shot || !cameraIds.has(String(shot.cameraId || ""))) return [];
              const start = clamp(numberValue(shot.start, 0), 0, duration);
              const end = clamp(numberValue(shot.end, duration), 0, duration);
              if (end <= start) return [];
              return [{ ...shot, id: stringValue(shot.id, makeId("shot")), name: stringValue(shot.name, "镜头"), start, end }];
          })
        : fallback.shots;
    const keyframes = Array.isArray(scene.keyframes)
        ? scene.keyframes.slice(0, 800).flatMap((keyframe) => normalizeKeyframe(keyframe, duration, objectIds, cameraIds))
        : fallback.keyframes;
    return {
        version: 1,
        name: stringValue(scene.name, fallback.name),
        duration,
        fps: Math.round(clamp(numberValue(scene.fps, fallback.fps), 12, 60)),
        aspectRatio: includes(["16:9", "9:16", "1:1", "4:3", "3:4"] as const, scene.aspectRatio) ? scene.aspectRatio : fallback.aspectRatio,
        environment: includes(["studio", "courtyard", "mountain", "desert", "space"] as const, scene.environment) ? scene.environment : fallback.environment,
        background: /^#[0-9a-f]{6}$/i.test(String(scene.background || "")) ? String(scene.background) : fallback.background,
        objects,
        cameras,
        shots,
        keyframes,
    };
}

export function buildSeedanceDirectorPrompt(sceneInput: unknown) {
    const scene = normalizeDirectorScene(sceneInput);
    const objectText = scene.objects.filter((object) => object.visible !== false).map((object) => `${object.name}位于(${formatVector(object.position)})，朝向(${formatVector(object.rotation)})`).join("；");
    const shots = [...scene.shots].sort((left, right) => left.start - right.start).map((shot, index) => {
        const camera = scene.cameras.find((item) => item.id === shot.cameraId);
        return `镜头${index + 1} [${formatTime(shot.start)}-${formatTime(shot.end)}] ${shot.name}：${movementLabel(shot.movement)}，${camera ? `${camera.name}，FOV ${camera.fov}°，机位(${formatVector(camera.position)})看向(${formatVector(camera.target)})` : "保持当前机位"}${shot.description ? `，${shot.description}` : ""}`;
    });
    const targets = [...scene.objects, ...scene.cameras];
    const animated = [...new Set(scene.keyframes.map((keyframe) => targets.find((item) => item.id === keyframe.targetId)?.name).filter(Boolean))].join("、");
    return [
        `${scene.duration}秒，${scene.aspectRatio}，${scene.fps}fps，${environmentLabel(scene.environment)}。`,
        objectText ? `空间调度：${objectText}。` : "",
        ...shots,
        animated ? `连续性要求：${animated}按关键帧平滑运动，人物身份、服装、空间方位和光线方向保持一致；镜头切换动作连续，不跳轴。` : "人物身份、空间方位和光线方向保持一致，镜头切换不跳轴。",
        "画面要求：电影级真实材质与体积光，动作清晰，主体轮廓稳定，无文字、无水印、无多余肢体、无闪烁。",
    ].filter(Boolean).join("\n");
}

function normalizeObject(object: DirectorObject): DirectorObject {
    return {
        ...object,
        id: stringValue(object.id, makeId("object")),
        name: stringValue(object.name, "未命名对象"),
        position: vectorValue(object.position, [0, 0, 0]),
        rotation: vectorValue(object.rotation, [0, 0, 0]),
        scale: vectorValue(object.scale, [1, 1, 1]),
        color: /^#[0-9a-f]{6}$/i.test(String(object.color || "")) ? object.color : "#e9583e",
    };
}

function normalizeCamera(camera: DirectorCamera): DirectorCamera {
    return { ...camera, id: stringValue(camera.id, makeId("camera")), name: stringValue(camera.name, "未命名机位"), position: vectorValue(camera.position, [6, 4, 8]), target: vectorValue(camera.target, [0, 1, 0]), fov: clamp(numberValue(camera.fov, 42), 15, 100) };
}

function normalizeKeyframe(keyframe: DirectorKeyframe, duration: number, objectIds: Set<string>, cameraIds: Set<string>): DirectorKeyframe[] {
    if (!keyframe) return [];
    const targetId = String(keyframe.targetId || "");
    const validTarget = keyframe.targetType === "object" ? objectIds.has(targetId) : keyframe.targetType === "camera" && cameraIds.has(targetId);
    if (!validTarget || !Array.isArray(keyframe.value) || !keyframe.value.length) return [];
    const value = keyframe.value.map(Number).filter(Number.isFinite).slice(0, 3);
    const scalar = keyframe.property === "fov";
    if ((scalar && value.length !== 1) || (!scalar && value.length !== 3)) return [];
    return [{ ...keyframe, id: stringValue(keyframe.id, makeId("key")), targetId, time: clamp(numberValue(keyframe.time, 0), 0, duration), value }];
}

function includes<const T extends readonly string[]>(values: T, value: unknown): value is T[number] { return values.includes(value as T[number]); }
function makeId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function vectorValue(value: unknown, fallback: DirectorVector3): DirectorVector3 { return Array.isArray(value) && value.length >= 3 ? [numberValue(value[0], fallback[0]), numberValue(value[1], fallback[1]), numberValue(value[2], fallback[2])] : fallback; }
function numberValue(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function stringValue(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function formatVector(value: DirectorVector3) { return value.map((item) => Number(item.toFixed(2))).join(","); }
function formatTime(value: number) { return `${Number(value.toFixed(2))}s`; }
function movementLabel(value: DirectorScene["shots"][number]["movement"]) { return ({ static: "固定机位", "push-in": "缓慢推近", "pull-out": "缓慢拉远", "pan-left": "向左摇摄", "pan-right": "向右摇摄", orbit: "环绕主体", follow: "跟随主体" } as const)[value]; }
function environmentLabel(value: DirectorScene["environment"]) { return ({ studio: "摄影棚布光", courtyard: "东方院落", mountain: "山地云海", desert: "荒漠风沙", space: "太空场景" } as const)[value]; }
