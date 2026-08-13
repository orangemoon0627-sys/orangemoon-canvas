export type DirectorVector3 = [number, number, number];
export type DirectorAspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
export type DirectorEnvironment = "studio" | "courtyard" | "mountain" | "desert" | "space";
/** `layers` is accepted only while migrating legacy scenes; saved scenes use `space3d`. */
export type DirectorCompositionMode = "layers" | "space3d";
export type DirectorLayerRole = "background" | "character" | "prop" | "foreground" | "effect";
export type DirectorAssetKind = "image" | "video";
export type DirectorAssetFit = "cover" | "contain";
export type DirectorPrimitive = "character" | "box" | "sphere" | "cylinder" | "cone" | "model" | DirectorAssetKind;
export type DirectorCharacterBodyPreset = "male" | "female" | "strong" | "slim" | "child" | "broad" | "teen" | "chibi";
export type DirectorCharacterPosePreset = "stand" | "t-pose" | "walk" | "run" | "sit" | "crouch" | "kneel" | "double-kneel" | "fight" | "hands-hips" | "hook-punch" | "kick" | "think" | "kick-ball" | "throw" | "bow" | "wave" | "arms-crossed" | "phone" | "point" | "reach" | "custom";
export type DirectorCharacterJoint = "body" | "head" | "leftUpperArm" | "leftForearm" | "rightUpperArm" | "rightForearm" | "leftThigh" | "leftCalf" | "rightThigh" | "rightCalf";
export type DirectorBackgroundProjection = "backdrop" | "panorama";

export type DirectorCharacterRig = {
    bodyPreset: DirectorCharacterBodyPreset;
    posePreset: DirectorCharacterPosePreset;
    height: number;
    width: number;
    joints: Record<DirectorCharacterJoint, DirectorVector3>;
};

export type DirectorStageSettings = {
    showGrid: boolean;
    showGround: boolean;
    showLabels: boolean;
    scenePosition: DirectorVector3;
    sceneRotation: DirectorVector3;
    sceneScale: number;
    panoramaRotation: number;
    panoramaRadius: number;
    ambientIntensity: number;
};

/** A canvas asset that can be staged as a reference, backdrop, prop, or effect. */
export type DirectorAsset = {
    id: string;
    nodeId: string;
    title: string;
    kind: DirectorAssetKind;
    url?: string;
    storageKey?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    suggestedRole?: DirectorLayerRole;
};

export type DirectorObject = {
    id: string;
    name: string;
    primitive: DirectorPrimitive;
    position: DirectorVector3;
    rotation: DirectorVector3;
    scale: DirectorVector3;
    color: string;
    modelUrl?: string;
    storageKey?: string;
    sourceNodeId?: string;
    assetUrl?: string;
    assetKind?: DirectorAssetKind;
    assetMimeType?: string;
    assetWidth?: number;
    assetHeight?: number;
    displaySize?: [number, number];
    fit?: DirectorAssetFit;
    role?: DirectorLayerRole;
    layerOrder?: number;
    opacity?: number;
    visible?: boolean;
    locked?: boolean;
    characterRig?: DirectorCharacterRig;
    backgroundProjection?: DirectorBackgroundProjection;
};

export type DirectorCamera = {
    id: string;
    name: string;
    position: DirectorVector3;
    target: DirectorVector3;
    fov: number;
};

export type DirectorShot = {
    id: string;
    name: string;
    cameraId: string;
    start: number;
    end: number;
    movement: "static" | "push-in" | "pull-out" | "pan-left" | "pan-right" | "orbit" | "follow";
    description?: string;
};

export type DirectorKeyframe = {
    id: string;
    targetType: "object" | "camera";
    targetId: string;
    property: "position" | "rotation" | "scale" | "target" | "fov";
    time: number;
    value: number[];
};

export type DirectorScene = {
    version: 2;
    name: string;
    duration: number;
    fps: number;
    aspectRatio: DirectorAspectRatio;
    compositionMode: DirectorCompositionMode;
    environment: DirectorEnvironment;
    background: string;
    stage: DirectorStageSettings;
    objects: DirectorObject[];
    cameras: DirectorCamera[];
    shots: DirectorShot[];
    keyframes: DirectorKeyframe[];
};
