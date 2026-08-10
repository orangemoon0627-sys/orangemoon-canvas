export type Position = { x: number; y: number };
export type Viewport = { x: number; y: number; k: number };
export type CanvasNodeType = "image" | "text" | "config" | "video" | "audio" | "director";
export type CanvasNode = { id: string; type: CanvasNodeType; title?: string; position: Position; width: number; height: number; metadata?: Record<string, unknown> };
export type CanvasConnection = { id: string; fromNodeId: string; toNodeId: string };
export type CanvasSnapshot = { projectId?: string; title?: string; nodes?: CanvasNode[]; connections?: CanvasConnection[]; selectedNodeIds?: string[]; viewport?: Viewport; clientId?: string };
export type AgentEmit = (type: string, payload: unknown) => void;
export type AgentAttachment = { id?: string; name?: string; type?: string; size?: number; width?: number; height?: number; dataUrl?: string };

export type DirectorVector3 = [number, number, number];
export type DirectorObject = { id: string; name: string; primitive: "character" | "box" | "sphere" | "cylinder" | "cone" | "model"; position: DirectorVector3; rotation: DirectorVector3; scale: DirectorVector3; color: string; modelUrl?: string; storageKey?: string; visible?: boolean };
export type DirectorCamera = { id: string; name: string; position: DirectorVector3; target: DirectorVector3; fov: number };
export type DirectorShot = { id: string; name: string; cameraId: string; start: number; end: number; movement: "static" | "push-in" | "pull-out" | "pan-left" | "pan-right" | "orbit" | "follow"; description?: string };
export type DirectorKeyframe = { id: string; targetType: "object" | "camera"; targetId: string; property: "position" | "rotation" | "scale" | "target" | "fov"; time: number; value: number[] };
export type DirectorScene = { version: 1; name: string; duration: number; fps: number; aspectRatio: "16:9" | "9:16" | "1:1" | "4:3" | "3:4"; environment: "studio" | "courtyard" | "mountain" | "desert" | "space"; background: string; objects: DirectorObject[]; cameras: DirectorCamera[]; shots: DirectorShot[]; keyframes: DirectorKeyframe[] };
