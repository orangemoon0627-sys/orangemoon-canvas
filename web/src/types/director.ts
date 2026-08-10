export type DirectorVector3 = [number, number, number];
export type DirectorAspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
export type DirectorEnvironment = "studio" | "courtyard" | "mountain" | "desert" | "space";
export type DirectorPrimitive = "character" | "box" | "sphere" | "cylinder" | "cone" | "model";

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
    visible?: boolean;
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
    version: 1;
    name: string;
    duration: number;
    fps: number;
    aspectRatio: DirectorAspectRatio;
    environment: DirectorEnvironment;
    background: string;
    objects: DirectorObject[];
    cameras: DirectorCamera[];
    shots: DirectorShot[];
    keyframes: DirectorKeyframe[];
};
