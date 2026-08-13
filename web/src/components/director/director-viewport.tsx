import { Edges, GizmoHelper, GizmoViewport, Grid, Html, Line, OrbitControls, TransformControls, useGLTF } from "@react-three/drei";
import { Canvas, events as createPointerEvents, useThree } from "@react-three/fiber";
import type { RootStore } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackSide, CanvasTexture, DoubleSide, Group as ThreeGroup, LinearFilter, SRGBColorSpace, Texture, Vector3, VideoTexture } from "three";
import type { Mesh as ThreeMesh, OrthographicCamera, PerspectiveCamera } from "three";
import { SkeletonUtils } from "three/examples/jsm/Addons.js";

import { directorCameraAtTime, isDirectorAssetObject, sceneAtTime } from "@/lib/director/director-scene";
import { resolveImageUrl } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import type { DirectorCamera, DirectorCharacterJoint, DirectorCharacterRig, DirectorObject, DirectorScene, DirectorVector3 } from "@/types/director";

export type DirectorTransformMode = "translate" | "rotate" | "scale";
export type DirectorViewMode = "director" | "camera";

type DirectorViewportProps = {
    scene: DirectorScene;
    playhead: number;
    playing: boolean;
    selectedObjectId: string;
    selectedCameraId: string;
    selectedCharacterJoint: DirectorCharacterJoint | null;
    viewMode: DirectorViewMode;
    viewResetKey: number;
    transformMode: DirectorTransformMode;
    onSelectObject: (id: string) => void;
    onSelectCamera: (id: string) => void;
    onSelectCharacterJoint: (joint: DirectorCharacterJoint | null) => void;
    onObjectTransform: (id: string, transform: Pick<DirectorObject, "position" | "rotation" | "scale">) => void;
    onCameraTransform: (id: string, camera: Pick<DirectorCamera, "position" | "target">) => void;
    onCharacterJointTransform: (id: string, joint: DirectorCharacterJoint, rotation: DirectorVector3) => void;
    onCameraChange: (camera: DirectorCamera) => void;
    onCanvasReady: (canvas: HTMLCanvasElement | null) => void;
};

function createDirectorPointerEvents(store: RootStore) {
    const manager = createPointerEvents(store);
    const connect = manager.connect;
    return {
        ...manager,
        connect(target: HTMLElement) {
            if (!target) return;
            connect?.(target);
        },
    };
}

export function DirectorViewport(props: DirectorViewportProps & { preview?: boolean }) {
    return <SpaceViewport {...props} />;
}

function SpaceViewport({ scene, playhead, playing, selectedObjectId, selectedCameraId, selectedCharacterJoint, viewMode, viewResetKey, transformMode, onSelectObject, onSelectCamera, onSelectCharacterJoint, onObjectTransform, onCameraTransform, onCharacterJointTransform, onCameraChange, onCanvasReady, preview = false }: DirectorViewportProps & { preview?: boolean }) {
    const evaluated = useMemo(() => sceneAtTime(scene, playhead), [playhead, scene]);
    const [transforming, setTransforming] = useState(false);
    const panoramaObjects = evaluated.objects.filter((object) => object.role === "background" && object.backgroundProjection === "panorama" && isDirectorAssetObject(object));
    const stageObjects = evaluated.objects.filter((object) => !panoramaObjects.some((panorama) => panorama.id === object.id));
    const hasVisibleBackgroundAsset = evaluated.objects.some((object) => object.visible !== false && object.role === "background" && isDirectorAssetObject(object));

    return (
        <Canvas
            shadows={preview ? false : "basic"}
            events={preview ? undefined : createDirectorPointerEvents}
            dpr={preview ? 1 : [1, 2]}
            gl={{ antialias: true, preserveDrawingBuffer: true }}
            camera={{ position: evaluated.camera.position, fov: evaluated.camera.fov, near: 0.05, far: 500 }}
            onCreated={({ gl }) => onCanvasReady(gl.domElement)}
            onPointerMissed={preview ? undefined : () => { onSelectCharacterJoint(null); onSelectObject(""); }}
        >
            <color attach="background" args={[scene.background]} />
            <fog attach="fog" args={[scene.background, 28, 82]} />
            <ambientLight intensity={0.65 * scene.stage.ambientIntensity} />
            <hemisphereLight args={["#e9f3ff", "#35383d", 1.35 * scene.stage.ambientIntensity]} />
            <directionalLight castShadow position={[7, 12, 6]} intensity={2.3} shadow-mapSize={[2048, 2048]} shadow-camera-far={45} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} />
            <CameraRig camera={evaluated.camera} objects={evaluated.objects} stage={scene.stage} playing={playing || preview} transforming={transforming} viewMode={viewMode} viewResetKey={viewResetKey} onChange={onCameraChange} />
            <Suspense fallback={null}>
                <group position={scene.stage.scenePosition} rotation={scene.stage.sceneRotation} scale={scene.stage.sceneScale}>
                    <StageEnvironment environment={scene.environment} stage={scene.stage} showSet={!hasVisibleBackgroundAsset} />
                    {panoramaObjects.filter((object) => object.visible !== false).map((object) => <PanoramaEnvironment key={object.id} object={object} rotation={scene.stage.panoramaRotation} radius={scene.stage.panoramaRadius} />)}
                    {stageObjects.filter((object) => object.visible !== false).map((object) => (
                        <SceneObject key={object.id} object={object} selected={object.id === selectedObjectId} selectedJoint={object.id === selectedObjectId ? selectedCharacterJoint : null} showLabel={scene.stage.showLabels} mode={transformMode} onSelect={onSelectObject} onSelectJoint={onSelectCharacterJoint} onTransform={onObjectTransform} onJointTransform={onCharacterJointTransform} onTransforming={setTransforming} />
                    ))}
                </group>
                {!preview && viewMode === "director" ? scene.cameras.map((camera) => <DirectorCameraObject key={camera.id} camera={camera} aspectRatio={scene.aspectRatio} selected={camera.id === selectedCameraId} onSelect={onSelectCamera} onTransform={onCameraTransform} onTransforming={setTransforming} />) : null}
            </Suspense>
            {!preview && viewMode === "director" ? <GizmoHelper alignment="top-right" margin={[72, 72]}><GizmoViewport axisColors={["#ef5350", "#66bb6a", "#42a5f5"]} labelColor="#f5f5f5" /></GizmoHelper> : null}
        </Canvas>
    );
}

function CameraRig({ camera: shotCamera, objects, stage, playing, transforming, viewMode, viewResetKey, onChange }: { camera: DirectorCamera; objects: DirectorObject[]; stage: DirectorScene["stage"]; playing: boolean; transforming: boolean; viewMode: DirectorViewMode; viewResetKey: number; onChange: (camera: DirectorCamera) => void }) {
    const { camera, size } = useThree();
    const controlsRef = useRef<React.ElementRef<typeof OrbitControls>>(null);
    const previousViewMode = useRef<DirectorViewMode>("camera");
    const previousResetKey = useRef(viewResetKey);
    const hasDirectorView = useRef(false);
    const defaultDirectorView = useMemo(() => frameDirectorObjects(objects, stage, size.width / Math.max(1, size.height)), [objects, size.height, size.width, stage]);
    const directorView = useRef<{ position: DirectorVector3; target: DirectorVector3 }>(defaultDirectorView);

    useEffect(() => {
        const resetRequested = previousResetKey.current !== viewResetKey;
        if (viewMode === "camera") {
            if (previousViewMode.current === "director") {
                directorView.current = { position: camera.position.toArray() as DirectorVector3, target: controlsRef.current?.target.toArray() as DirectorVector3 || [0, 1, 0] };
                hasDirectorView.current = true;
            }
            camera.position.set(...shotCamera.position);
            controlsRef.current?.target.set(...shotCamera.target);
        } else {
            if (resetRequested || !hasDirectorView.current) {
                directorView.current = defaultDirectorView;
                hasDirectorView.current = true;
            }
            if (previousViewMode.current === "camera" || resetRequested) {
                camera.position.set(...directorView.current.position);
                controlsRef.current?.target.set(...directorView.current.target);
            }
        }
        if ((camera as OrthographicCamera).isOrthographicCamera) {
            (camera as OrthographicCamera).zoom = 1;
        } else {
            const perspective = camera as PerspectiveCamera;
            perspective.fov = viewMode === "camera" ? shotCamera.fov : 46;
        }
        camera.updateProjectionMatrix();
        controlsRef.current?.update();
        previousViewMode.current = viewMode;
        previousResetKey.current = viewResetKey;
    }, [camera, defaultDirectorView, shotCamera, viewMode, viewResetKey]);

    const commit = useCallback(() => {
        const controls = controlsRef.current;
        if (!controls) return;
        if (viewMode === "director") {
            directorView.current = { position: camera.position.toArray() as DirectorVector3, target: controls.target.toArray() as DirectorVector3 };
            return;
        }
        onChange({ ...shotCamera, position: camera.position.toArray() as DirectorVector3, target: controls.target.toArray() as DirectorVector3, fov: (camera as PerspectiveCamera).fov });
    }, [camera, onChange, shotCamera, viewMode]);

    return <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} enabled={!playing && !transforming} minDistance={0.8} maxDistance={80} maxPolarAngle={Math.PI * 0.495} onEnd={commit} />;
}

function SceneObject({ object, selected, selectedJoint, showLabel = false, mode, onSelect, onSelectJoint, onTransform, onJointTransform, onTransforming }: { object: DirectorObject; selected: boolean; selectedJoint: DirectorCharacterJoint | null; showLabel?: boolean; mode: DirectorTransformMode; onSelect: (id: string) => void; onSelectJoint: (joint: DirectorCharacterJoint | null) => void; onTransform: (id: string, transform: Pick<DirectorObject, "position" | "rotation" | "scale">) => void; onJointTransform: (id: string, joint: DirectorCharacterJoint, rotation: DirectorVector3) => void; onTransforming: (active: boolean) => void }) {
    const groupRef = useRef<ThreeGroup>(null);
    const content = <group ref={groupRef} position={object.position} rotation={object.rotation} scale={object.scale} onClick={(event) => { event.stopPropagation(); onSelect(object.id); }}>
        <ObjectGeometry object={object} selected={selected} selectedJoint={selectedJoint} onSelectJoint={onSelectJoint} onJointTransform={(joint, rotation) => onJointTransform(object.id, joint, rotation)} onTransforming={onTransforming} />
        {showLabel && object.role !== "background" ? <Html center position={[0, object.primitive === "character" ? 2.55 : 1.2, 0]} style={{ pointerEvents: "none" }}><div className={`whitespace-nowrap border px-2 py-1 text-[10px] ${selected ? "border-[#ff8066]/70 bg-[#25130f]/90 text-white" : "border-white/15 bg-black/65 text-white/75"}`}>{object.name}</div></Html> : null}
    </group>;
    if (!selected || object.locked || selectedJoint) return content;
    return <TransformControls mode={mode} size={0.72} onMouseDown={() => onTransforming(true)} onMouseUp={() => {
        onTransforming(false);
        const group = groupRef.current;
        if (!group) return;
        onTransform(object.id, { position: group.position.toArray() as DirectorVector3, rotation: [group.rotation.x, group.rotation.y, group.rotation.z], scale: group.scale.toArray() as DirectorVector3 });
    }}>{content}</TransformControls>;
}

function ObjectGeometry({ object, selected, selectedJoint, onSelectJoint, onJointTransform, onTransforming }: { object: DirectorObject; selected: boolean; selectedJoint: DirectorCharacterJoint | null; onSelectJoint: (joint: DirectorCharacterJoint | null) => void; onJointTransform: (joint: DirectorCharacterJoint, rotation: DirectorVector3) => void; onTransforming: (active: boolean) => void }) {
    if (object.primitive === "character") return <ArticulatedCharacter object={object} selected={selected} selectedJoint={selectedJoint} onSelectJoint={onSelectJoint} onJointTransform={onJointTransform} onTransforming={onTransforming} />;
    if (object.assetKind || object.primitive === "image" || object.primitive === "video") return <DirectorAssetPlane object={object} selected={selected} />;
    const material = { color: object.color, roughness: 0.62, metalness: object.primitive === "model" ? 0.15 : 0.05, emissive: selected ? object.color : "#000000", emissiveIntensity: selected ? 0.16 : 0 };
    if (object.primitive === "model") return <DirectorModel object={object} selected={selected} />;
    if (object.primitive === "sphere") return <mesh castShadow receiveShadow><sphereGeometry args={[0.65, 32, 20]} /><meshStandardMaterial {...material} /></mesh>;
    if (object.primitive === "cylinder") return <mesh castShadow receiveShadow><cylinderGeometry args={[0.55, 0.65, 1.2, 24]} /><meshStandardMaterial {...material} /></mesh>;
    if (object.primitive === "cone") return <mesh castShadow receiveShadow><coneGeometry args={[0.7, 1.4, 24]} /><meshStandardMaterial {...material} /></mesh>;
    return <mesh castShadow receiveShadow><boxGeometry args={[1.2, 1.2, 1.2]} /><meshStandardMaterial {...material} /></mesh>;
}

function ArticulatedCharacter({ object, selected, selectedJoint, onSelectJoint, onJointTransform, onTransforming }: { object: DirectorObject; selected: boolean; selectedJoint: DirectorCharacterJoint | null; onSelectJoint: (joint: DirectorCharacterJoint | null) => void; onJointTransform: (joint: DirectorCharacterJoint, rotation: DirectorVector3) => void; onTransforming: (active: boolean) => void }) {
    const rig = object.characterRig || fallbackCharacterRig();
    const proportions = bodyPresetProportions(rig);
    const material = { color: object.color, roughness: 0.68, metalness: 0.02, emissive: selected ? object.color : "#000000", emissiveIntensity: selected ? 0.13 : 0 };
    const skin = { color: object.color, roughness: 0.72, emissive: selected ? object.color : "#000000", emissiveIntensity: selected ? 0.1 : 0 };
    return <CharacterJointGroup joint="body" position={[0, 0.72, 0]} scale={[rig.width, rig.height, rig.width]} rotation={rig.joints.body} selected={selectedJoint === "body"} showHandle={selected} onSelect={onSelectJoint} onTransform={onJointTransform} onTransforming={onTransforming}>
        <mesh castShadow receiveShadow position={[0, 0.84, 0]} scale={[proportions.hip, 0.28, proportions.depth]}><sphereGeometry args={[0.48, 24, 16]} /><meshStandardMaterial {...material} /></mesh>
        <mesh castShadow receiveShadow position={[0, 1.33, 0]} scale={[proportions.shoulder, 0.78, proportions.depth]}><capsuleGeometry args={[0.34, 0.5, 10, 20]} /><meshStandardMaterial {...material} /></mesh>
        <mesh castShadow receiveShadow position={[0, 1.78, 0]} scale={[0.42, 0.22, 0.4]}><capsuleGeometry args={[0.16, 0.1, 8, 16]} /><meshStandardMaterial {...skin} /></mesh>
        <CharacterJointGroup joint="head" position={[0, 1.98, 0]} rotation={rig.joints.head} selected={selectedJoint === "head"} showHandle={selected} onSelect={onSelectJoint} onTransform={onJointTransform} onTransforming={onTransforming}>
            <mesh castShadow position={[0, 0.2, 0]} scale={[proportions.head, 1.08, proportions.head]}><sphereGeometry args={[0.29, 28, 20]} /><meshStandardMaterial {...skin} /></mesh>
            <mesh position={[0, 0.18, 0.285]} scale={[0.72, 0.5, 0.65]}><sphereGeometry args={[0.045, 12, 10]} /><meshStandardMaterial color="#16202b" /></mesh>
        </CharacterJointGroup>
        <CharacterArm side="left" rig={rig} material={material} shoulder={proportions.shoulder} selectedJoint={selectedJoint} showHandles={selected} onSelectJoint={onSelectJoint} onJointTransform={onJointTransform} onTransforming={onTransforming} />
        <CharacterArm side="right" rig={rig} material={material} shoulder={proportions.shoulder} selectedJoint={selectedJoint} showHandles={selected} onSelectJoint={onSelectJoint} onJointTransform={onJointTransform} onTransforming={onTransforming} />
        <CharacterLeg side="left" rig={rig} material={material} hip={proportions.hip} selectedJoint={selectedJoint} showHandles={selected} onSelectJoint={onSelectJoint} onJointTransform={onJointTransform} onTransforming={onTransforming} />
        <CharacterLeg side="right" rig={rig} material={material} hip={proportions.hip} selectedJoint={selectedJoint} showHandles={selected} onSelectJoint={onSelectJoint} onJointTransform={onJointTransform} onTransforming={onTransforming} />
        {selected ? <pointLight color={object.color} intensity={0.45} distance={3.5} position={[0, 1.4, 0.8]} /> : null}
    </CharacterJointGroup>;
}

function CharacterArm({ side, rig, material, shoulder, selectedJoint, showHandles, onSelectJoint, onJointTransform, onTransforming }: { side: "left" | "right"; rig: DirectorCharacterRig; material: Record<string, unknown>; shoulder: number; selectedJoint: DirectorCharacterJoint | null; showHandles: boolean; onSelectJoint: (joint: DirectorCharacterJoint | null) => void; onJointTransform: (joint: DirectorCharacterJoint, rotation: DirectorVector3) => void; onTransforming: (active: boolean) => void }) {
    const sign = side === "left" ? -1 : 1;
    const upperJoint: DirectorCharacterJoint = side === "left" ? "leftUpperArm" : "rightUpperArm";
    const lowerJoint: DirectorCharacterJoint = side === "left" ? "leftForearm" : "rightForearm";
    const upper = side === "left" ? rig.joints.leftUpperArm : rig.joints.rightUpperArm;
    const lower = side === "left" ? rig.joints.leftForearm : rig.joints.rightForearm;
    return <CharacterJointGroup joint={upperJoint} position={[sign * (0.39 + shoulder * 0.13), 1.58, 0]} rotation={upper} selected={selectedJoint === upperJoint} showHandle={showHandles} onSelect={onSelectJoint} onTransform={onJointTransform} onTransforming={onTransforming}>
        <mesh castShadow><sphereGeometry args={[0.16, 18, 12]} /><meshStandardMaterial {...material} /></mesh>
        <mesh castShadow position={[0, -0.3, 0]}><capsuleGeometry args={[0.115, 0.38, 7, 12]} /><meshStandardMaterial {...material} /></mesh>
        <CharacterJointGroup joint={lowerJoint} position={[0, -0.62, 0]} rotation={lower} selected={selectedJoint === lowerJoint} showHandle={showHandles} onSelect={onSelectJoint} onTransform={onJointTransform} onTransforming={onTransforming}>
            <mesh castShadow><sphereGeometry args={[0.125, 16, 10]} /><meshStandardMaterial {...material} /></mesh>
            <mesh castShadow position={[0, -0.27, 0]}><capsuleGeometry args={[0.1, 0.34, 7, 12]} /><meshStandardMaterial {...material} /></mesh>
            <mesh castShadow position={[0, -0.56, 0]} scale={[0.8, 1.12, 0.62]}><sphereGeometry args={[0.14, 16, 12]} /><meshStandardMaterial {...material} /></mesh>
        </CharacterJointGroup>
    </CharacterJointGroup>;
}

function CharacterLeg({ side, rig, material, hip, selectedJoint, showHandles, onSelectJoint, onJointTransform, onTransforming }: { side: "left" | "right"; rig: DirectorCharacterRig; material: Record<string, unknown>; hip: number; selectedJoint: DirectorCharacterJoint | null; showHandles: boolean; onSelectJoint: (joint: DirectorCharacterJoint | null) => void; onJointTransform: (joint: DirectorCharacterJoint, rotation: DirectorVector3) => void; onTransforming: (active: boolean) => void }) {
    const sign = side === "left" ? -1 : 1;
    const upperJoint: DirectorCharacterJoint = side === "left" ? "leftThigh" : "rightThigh";
    const lowerJoint: DirectorCharacterJoint = side === "left" ? "leftCalf" : "rightCalf";
    const thigh = side === "left" ? rig.joints.leftThigh : rig.joints.rightThigh;
    const calf = side === "left" ? rig.joints.leftCalf : rig.joints.rightCalf;
    return <CharacterJointGroup joint={upperJoint} position={[sign * (0.18 + hip * 0.04), 0.86, 0]} rotation={thigh} selected={selectedJoint === upperJoint} showHandle={showHandles} onSelect={onSelectJoint} onTransform={onJointTransform} onTransforming={onTransforming}>
        <mesh castShadow><sphereGeometry args={[0.17, 18, 12]} /><meshStandardMaterial {...material} /></mesh>
        <mesh castShadow position={[0, -0.36, 0]}><capsuleGeometry args={[0.14, 0.48, 7, 12]} /><meshStandardMaterial {...material} /></mesh>
        <CharacterJointGroup joint={lowerJoint} position={[0, -0.74, 0]} rotation={calf} selected={selectedJoint === lowerJoint} showHandle={showHandles} onSelect={onSelectJoint} onTransform={onJointTransform} onTransforming={onTransforming}>
            <mesh castShadow><sphereGeometry args={[0.14, 16, 10]} /><meshStandardMaterial {...material} /></mesh>
            <mesh castShadow position={[0, -0.34, 0]}><capsuleGeometry args={[0.12, 0.46, 7, 12]} /><meshStandardMaterial {...material} /></mesh>
            <mesh castShadow position={[0, -0.72, 0]}><sphereGeometry args={[0.125, 14, 10]} /><meshStandardMaterial {...material} /></mesh>
            <mesh castShadow position={[0, -0.78, 0.14]}><boxGeometry args={[0.26, 0.14, 0.52]} /><meshStandardMaterial {...material} /></mesh>
        </CharacterJointGroup>
    </CharacterJointGroup>;
}

function CharacterJointGroup({ joint, position, rotation, scale, selected, showHandle, onSelect, onTransform, onTransforming, children }: { joint: DirectorCharacterJoint; position: DirectorVector3; rotation: DirectorVector3; scale?: DirectorVector3; selected: boolean; showHandle: boolean; onSelect: (joint: DirectorCharacterJoint | null) => void; onTransform: (joint: DirectorCharacterJoint, rotation: DirectorVector3) => void; onTransforming: (active: boolean) => void; children: React.ReactNode }) {
    const groupRef = useRef<ThreeGroup>(null);
    const content = <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
        {children}
        {showHandle ? <mesh renderOrder={80} onClick={(event) => { event.stopPropagation(); onSelect(joint); }}>
            <sphereGeometry args={[selected ? 0.11 : 0.075, 16, 12]} />
            <meshBasicMaterial color={selected ? "#ffd08a" : "#7bc8ff"} transparent opacity={selected ? 1 : 0.72} depthTest={false} />
        </mesh> : null}
    </group>;
    if (!selected) return content;
    return <TransformControls mode="rotate" size={0.52} onMouseDown={() => onTransforming(true)} onMouseUp={() => {
        onTransforming(false);
        const group = groupRef.current;
        if (!group) return;
        onTransform(joint, [group.rotation.x, group.rotation.y, group.rotation.z]);
    }}>{content}</TransformControls>;
}

export function DirectorCameraPreview({ scene, cameraId, playhead }: { scene: DirectorScene; cameraId: string; playhead: number }) {
    const previewScene = useMemo(() => ({
        ...scene,
        stage: { ...scene.stage, showLabels: false },
        cameras: [directorCameraAtTime(scene, cameraId, playhead)],
        shots: [{ id: "preview-shot", name: "当前机位", cameraId, start: 0, end: scene.duration, movement: "static" as const }],
    }), [cameraId, playhead, scene]);
    const noop = useCallback(() => undefined, []);
    return <DirectorViewport scene={previewScene} playhead={playhead} playing selectedObjectId="" selectedCameraId="" selectedCharacterJoint={null} viewMode="camera" viewResetKey={0} transformMode="translate" onSelectObject={noop} onSelectCamera={noop} onSelectCharacterJoint={noop} onObjectTransform={noop} onCameraTransform={noop} onCharacterJointTransform={noop} onCameraChange={noop} onCanvasReady={noop} preview />;
}

function fallbackCharacterRig(): DirectorCharacterRig {
    const zero: DirectorVector3 = [0, 0, 0];
    return { bodyPreset: "male", posePreset: "stand", height: 1, width: 1, joints: { body: zero, head: zero, leftUpperArm: zero, leftForearm: zero, rightUpperArm: zero, rightForearm: zero, leftThigh: zero, leftCalf: zero, rightThigh: zero, rightCalf: zero } };
}

function frameDirectorObjects(objects: DirectorObject[], stage: DirectorScene["stage"], viewportAspect: number) {
    const visible = objects.filter((object) => object.visible !== false && object.backgroundProjection !== "panorama");
    if (!visible.length) return { position: [8, 5.5, 10] as DirectorVector3, target: [0, 1, 0] as DirectorVector3 };
    const points = visible.map((object) => {
        const role = object.role || (object.primitive === "character" ? "character" : "prop");
        const displayHeight = object.displaySize?.[1] || (object.primitive === "character" ? 3.2 : 1.2);
        const centerY = role === "background" ? object.position[1] : object.position[1] + displayHeight * Math.abs(object.scale[1]) * 0.45;
        const position = new Vector3(object.position[0], centerY, object.position[2]);
        position.multiplyScalar(stage.sceneScale).applyEuler(new ThreeGroup().rotation.set(...stage.sceneRotation)).add(new Vector3(...stage.scenePosition));
        return { position, size: Math.max(0.8, displayHeight * Math.abs(object.scale[1]) * stage.sceneScale) };
    });
    const center = points.reduce((sum, point) => sum.add(point.position), new Vector3()).multiplyScalar(1 / points.length);
    const radius = Math.max(2.8, ...points.map((point) => point.position.distanceTo(center) + point.size * 0.65));
    const narrowFactor = viewportAspect < 0.8 ? 1.65 : viewportAspect < 1.15 ? 1.28 : 1;
    const distance = Math.min(65, Math.max(8, radius * 2.15 * narrowFactor));
    const position = center.clone().add(new Vector3(distance * 0.72, distance * 0.48, distance));
    return { position: position.toArray() as DirectorVector3, target: center.toArray() as DirectorVector3 };
}

function bodyPresetProportions(rig: DirectorCharacterRig) {
    if (rig.bodyPreset === "female") return { shoulder: 0.92, hip: 1.04, depth: 0.86, head: 0.96 };
    if (rig.bodyPreset === "strong") return { shoulder: 1.28, hip: 1.08, depth: 1.2, head: 1.02 };
    if (rig.bodyPreset === "slim") return { shoulder: 0.84, hip: 0.82, depth: 0.78, head: 0.96 };
    if (rig.bodyPreset === "child") return { shoulder: 0.78, hip: 0.82, depth: 0.8, head: 1.2 };
    if (rig.bodyPreset === "broad") return { shoulder: 1.42, hip: 1.24, depth: 1.32, head: 1.04 };
    if (rig.bodyPreset === "teen") return { shoulder: 0.86, hip: 0.88, depth: 0.82, head: 1.08 };
    if (rig.bodyPreset === "chibi") return { shoulder: 0.7, hip: 0.76, depth: 0.78, head: 1.55 };
    return { shoulder: 1.05, hip: 0.95, depth: 1, head: 1 };
}

function DirectorAssetPlane({ object, selected }: { object: DirectorObject; selected: boolean }) {
    const [url, setUrl] = useState(object.assetUrl || object.modelUrl || "");
    useEffect(() => {
        let active = true;
        const resolver = object.assetKind === "image" || object.primitive === "image" ? resolveImageUrl : resolveMediaUrl;
        void resolver(object.storageKey, object.assetUrl || object.modelUrl || "").then((value) => { if (active) setUrl(value); });
        return () => { active = false; };
    }, [object.assetUrl, object.assetKind, object.modelUrl, object.primitive, object.storageKey]);
    const dimensions = object.displaySize || [4, 4] as [number, number];
    if (!url) return <AssetPlaceholder object={object} selected={selected} dimensions={dimensions} />;
    return object.assetKind === "video" || object.primitive === "video" ? <LoadedVideoPlane url={url} object={object} selected={selected} dimensions={dimensions} /> : <LoadedImagePlane url={url} object={object} selected={selected} dimensions={dimensions} />;
}

function PanoramaEnvironment({ object, rotation, radius }: { object: DirectorObject; rotation: number; radius: number }) {
    const [url, setUrl] = useState(object.assetUrl || "");
    useEffect(() => {
        let active = true;
        const resolver = object.assetKind === "video" || object.primitive === "video" ? resolveMediaUrl : resolveImageUrl;
        void resolver(object.storageKey, object.assetUrl || "").then((value) => { if (active) setUrl(value); });
        return () => { active = false; };
    }, [object.assetKind, object.assetUrl, object.primitive, object.storageKey]);
    const texture = useDirectorTexture(url, object.assetKind === "video" || object.primitive === "video" ? "video" : "image");
    if (!texture) return null;
    texture.center.set(0.5, 0.5);
    texture.rotation = rotation;
    texture.needsUpdate = true;
    return <mesh>
        <sphereGeometry args={[radius, 72, 40]} />
        <meshBasicMaterial map={texture} side={BackSide} toneMapped={false} />
    </mesh>;
}

function DirectorCameraObject({ camera, aspectRatio, selected, onSelect, onTransform, onTransforming }: { camera: DirectorCamera; aspectRatio: DirectorScene["aspectRatio"]; selected: boolean; onSelect: (id: string) => void; onTransform: (id: string, camera: Pick<DirectorCamera, "position" | "target">) => void; onTransforming: (active: boolean) => void }) {
    const groupRef = useRef<ThreeGroup>(null);
    const targetRef = useRef<ThreeGroup>(null);
    const direction = useMemo(() => new Vector3(...camera.target).sub(new Vector3(...camera.position)), [camera.position, camera.target]);
    const distance = Math.max(0.1, direction.length());
    const frameDepth = Math.min(distance, 6);
    const [aspectWidth, aspectHeight] = aspectRatio.split(":").map(Number);
    const frameHeight = Math.tan(camera.fov * Math.PI / 360) * frameDepth * 2;
    const frameWidth = frameHeight * aspectWidth / Math.max(1, aspectHeight);
    const frustumPoints = useMemo(() => {
        const origin = new Vector3(...camera.position);
        const forward = new Vector3(...camera.target).sub(origin).normalize();
        const right = forward.clone().cross(new Vector3(0, 1, 0));
        if (right.lengthSq() < 0.001) right.set(1, 0, 0);
        right.normalize();
        const up = right.clone().cross(forward).normalize();
        const center = origin.clone().add(forward.multiplyScalar(frameDepth));
        const halfRight = right.multiplyScalar(frameWidth / 2);
        const halfUp = up.multiplyScalar(frameHeight / 2);
        const bottomLeft = center.clone().sub(halfRight).sub(halfUp);
        const bottomRight = center.clone().add(halfRight).sub(halfUp);
        const topRight = center.clone().add(halfRight).add(halfUp);
        const topLeft = center.clone().sub(halfRight).add(halfUp);
        return { origin: origin.toArray() as DirectorVector3, bottomLeft: bottomLeft.toArray() as DirectorVector3, bottomRight: bottomRight.toArray() as DirectorVector3, topRight: topRight.toArray() as DirectorVector3, topLeft: topLeft.toArray() as DirectorVector3 };
    }, [camera.position, camera.target, frameDepth, frameHeight, frameWidth]);
    const cameraRotation = useMemo(() => {
        const helper = new ThreeGroup();
        helper.position.set(...camera.position);
        helper.lookAt(...camera.target);
        return [helper.rotation.x, helper.rotation.y, helper.rotation.z] as DirectorVector3;
    }, [camera.position, camera.target]);
    const content = <group ref={groupRef} position={camera.position} rotation={cameraRotation} onClick={(event) => { event.stopPropagation(); onSelect(camera.id); }}>
        <group rotation={[0, Math.PI, 0]} scale={0.2}>
            <mesh castShadow><boxGeometry args={[0.52, 0.34, 0.58]} /><meshStandardMaterial color={selected ? "#ff9b45" : "#d9822b"} metalness={0.15} roughness={0.48} /></mesh>
            <mesh position={[0, 0, -0.43]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.24, 0.42, 20]} /><meshStandardMaterial color={selected ? "#ffd08a" : "#b8611f"} /></mesh>
        </group>
        <Html center position={[0, 0.62, 0]} style={{ pointerEvents: "none" }}><div className={`whitespace-nowrap border px-2 py-1 text-[10px] ${selected ? "border-[#ff9b45]/70 bg-[#2a180a]/90 text-white" : "border-white/15 bg-black/65 text-white/70"}`}>{camera.name} · {camera.fov}°</div></Html>
    </group>;
    const line = <Line points={[camera.position, camera.target]} color={selected ? "#ff9b45" : "#8a929b"} opacity={selected ? 0.9 : 0.45} transparent lineWidth={selected ? 1.6 : 1} />;
    const target = <group ref={targetRef} position={camera.target} onClick={(event) => { event.stopPropagation(); onSelect(camera.id); }}>
        <mesh>
            <sphereGeometry args={[selected ? 0.12 : 0.08, 16, 12]} />
            <meshBasicMaterial color={selected ? "#ffd08a" : "#a4adb7"} transparent opacity={selected ? 0.95 : 0.65} />
        </mesh>
        {selected ? <Html center position={[0, 0.32, 0]} style={{ pointerEvents: "none" }}><div className="whitespace-nowrap border border-[#ff9b45]/50 bg-black/75 px-1.5 py-0.5 text-[9px] text-white/75">注视点</div></Html> : null}
    </group>;
    const frustum = selected ? <>
        <Line points={[frustumPoints.bottomLeft, frustumPoints.bottomRight, frustumPoints.topRight, frustumPoints.topLeft, frustumPoints.bottomLeft]} color="#ff9b45" opacity={0.55} transparent lineWidth={1} />
        {[frustumPoints.bottomLeft, frustumPoints.bottomRight, frustumPoints.topRight, frustumPoints.topLeft].map((corner, index) => <Line key={index} points={[frustumPoints.origin, corner]} color="#ff9b45" opacity={0.35} transparent lineWidth={1} />)}
    </> : null;
    const targetControl = selected ? <TransformControls mode="translate" size={0.58} onMouseDown={() => onTransforming(true)} onMouseUp={() => {
        onTransforming(false);
        const group = targetRef.current;
        if (!group) return;
        onTransform(camera.id, { position: camera.position, target: group.position.toArray() as DirectorVector3 });
    }}>{target}</TransformControls> : target;
    if (!selected) return <>{line}{target}{content}</>;
    return <>{line}{frustum}{targetControl}<TransformControls mode="translate" size={0.72} onMouseDown={() => onTransforming(true)} onMouseUp={() => {
        onTransforming(false);
        const group = groupRef.current;
        if (!group) return;
        const nextPosition = group.position.toArray() as DirectorVector3;
        const delta: DirectorVector3 = [nextPosition[0] - camera.position[0], nextPosition[1] - camera.position[1], nextPosition[2] - camera.position[2]];
        onTransform(camera.id, { position: nextPosition, target: [camera.target[0] + delta[0], camera.target[1] + delta[1], camera.target[2] + delta[2]] });
    }}>{content}</TransformControls></>;
}

function LoadedImagePlane({ url, object, selected, dimensions }: { url: string; object: DirectorObject; selected: boolean; dimensions: [number, number] }) {
    const texture = useDirectorTexture(url, "image");
    return <PlaneMaterial texture={texture} object={object} selected={selected} dimensions={dimensions} />;
}

function LoadedVideoPlane({ url, object, selected, dimensions }: { url: string; object: DirectorObject; selected: boolean; dimensions: [number, number] }) {
    const texture = useDirectorTexture(url, "video");
    return <PlaneMaterial texture={texture} object={object} selected={selected} dimensions={dimensions} />;
}

function useDirectorTexture(url: string, kind: "image" | "video") {
    const [texture, setTexture] = useState<Texture | null>(null);
    useEffect(() => {
        let active = true;
        let media: HTMLImageElement | HTMLVideoElement | null = null;
        let next: Texture | null = null;
        setTexture(null);
        if (!url) return () => undefined;
        if (kind === "video") {
            const video = document.createElement("video");
            if (/^https?:\/\//i.test(url)) video.crossOrigin = "anonymous";
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.preload = "auto";
            media = video;
            const ready = () => {
                if (!active || next) return;
                next = new VideoTexture(video);
                next.colorSpace = SRGBColorSpace;
                setTexture(next);
                void video.play().catch(() => undefined);
            };
            video.addEventListener("loadeddata", ready, { once: true });
            video.src = url;
            video.load();
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) ready();
        } else {
            const image = new window.Image();
            if (/^https?:\/\//i.test(url)) image.crossOrigin = "anonymous";
            image.decoding = "async";
            media = image;
            const ready = () => {
                if (!active || next || image.naturalWidth < 1) return;
                next = createDirectorImageTexture(image);
                setTexture(next);
            };
            image.addEventListener("load", ready, { once: true });
            image.src = url;
            if (image.complete) ready();
        }
        return () => {
            active = false;
            if (next) next.dispose();
            if (media instanceof HTMLVideoElement) {
                media.pause();
                media.removeAttribute("src");
                media.load();
            }
        };
    }, [kind, url]);
    return texture;
}

function createDirectorImageTexture(image: HTMLImageElement) {
    const maxEdge = 2048;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("浏览器无法创建导演台图片纹理");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}

function PlaneMaterial({ texture, object, selected, dimensions }: { texture: Texture | null; object: DirectorObject; selected: boolean; dimensions: [number, number] }) {
    return <mesh castShadow={false} receiveShadow={false}>
        <planeGeometry args={dimensions} />
        {texture ? <meshBasicMaterial map={texture} color="#ffffff" transparent opacity={object.opacity ?? 1} side={DoubleSide} depthWrite toneMapped={false} /> : <meshBasicMaterial color={object.color} transparent opacity={0.18} side={DoubleSide} wireframe />}
        {selected ? <Edges color="#ff8066" scale={1.015} threshold={15} /> : null}
    </mesh>;
}

function AssetPlaceholder({ object, selected, dimensions }: { object: DirectorObject; selected: boolean; dimensions: [number, number] }) {
    return <mesh>
        <planeGeometry args={dimensions} />
        <meshBasicMaterial color={selected ? "#ff8066" : object.color} transparent opacity={selected ? 0.35 : 0.16} wireframe side={DoubleSide} />
    </mesh>;
}

function DirectorModel({ object, selected }: { object: DirectorObject; selected: boolean }) {
    const [url, setUrl] = useState(object.modelUrl || "");
    useEffect(() => {
        let active = true;
        void resolveMediaUrl(object.storageKey, object.modelUrl || "").then((value) => { if (active) setUrl(value); });
        return () => { active = false; };
    }, [object.modelUrl, object.storageKey]);
    if (!url) return <mesh castShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={object.color} wireframe /></mesh>;
    return <LoadedModel url={url} selected={selected} />;
}

function LoadedModel({ url, selected }: { url: string; selected: boolean }) {
    const gltf = useGLTF(url);
    const model = useMemo(() => {
        const clone = SkeletonUtils.clone(gltf.scene);
        clone.traverse((child) => {
            const mesh = child as ThreeMesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        });
        return clone;
    }, [gltf.scene]);
    return <group><primitive object={model} />{selected ? <pointLight color="#ff8066" intensity={0.7} distance={4} /> : null}</group>;
}

function StageEnvironment({ environment, stage, showSet }: { environment: DirectorScene["environment"]; stage: DirectorScene["stage"]; showSet: boolean }) {
    const ground = environment === "desert" ? "#b79668" : environment === "space" ? "#242733" : environment === "mountain" ? "#667568" : environment === "studio" ? "#777b80" : "#7b856f";
    return <group>
        {stage.showGround ? <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}><planeGeometry args={[120, 120]} /><meshStandardMaterial color={ground} roughness={0.96} /></mesh> : null}
        {stage.showGrid ? <Grid position={[0, 0.005, 0]} args={[60, 60]} cellSize={1} cellThickness={0.45} cellColor="#ffffff" sectionSize={5} sectionThickness={0.8} sectionColor="#ffffff" fadeDistance={35} fadeStrength={1.5} infiniteGrid /> : null}
        {showSet && environment === "courtyard" ? <Courtyard /> : null}
        {showSet && environment === "mountain" ? <Mountains /> : null}
        {showSet && environment === "desert" ? <Desert /> : null}
        {showSet && environment === "studio" ? <StudioCyclorama /> : null}
        {showSet && environment === "space" ? <SpaceSet /> : null}
    </group>;
}

function Courtyard() { return <group position={[0, 0, -5]}>
    <mesh receiveShadow position={[0, 1.7, 0]}><boxGeometry args={[11, 3.4, 0.35]} /><meshStandardMaterial color="#c8c0ae" roughness={0.9} /></mesh>
    <mesh castShadow position={[0, 3.45, 0.2]}><boxGeometry args={[11.8, 0.24, 1.2]} /><meshStandardMaterial color="#4e5c58" roughness={0.74} /></mesh>
    {[-4.25, 4.25].map((x) => <mesh key={x} castShadow position={[x, 1.55, 0.35]}><cylinderGeometry args={[0.18, 0.22, 3.1, 16]} /><meshStandardMaterial color="#5b3a32" roughness={0.82} /></mesh>)}
    <mesh castShadow position={[0, 1.25, 0.24]}><boxGeometry args={[2.3, 2.5, 0.42]} /><meshStandardMaterial color="#4c302a" roughness={0.82} /></mesh>
    <mesh position={[0, 2.3, 0.48]}><boxGeometry args={[1.25, 0.22, 0.08]} /><meshStandardMaterial color="#c9a768" roughness={0.65} /></mesh>
</group>; }
function Mountains() { return <group position={[0, 0, -12]}>{[-7, -2, 4, 9].map((x, index) => <mesh key={x} castShadow position={[x, 2 + index % 2, index]}><coneGeometry args={[4 + index * 0.5, 7 + index, 7]} /><meshStandardMaterial color={index % 2 ? "#53695e" : "#46584f"} roughness={1} /></mesh>)}</group>; }
function Desert() { return <group position={[0, 0, -8]}>{[-6, 1, 7].map((x, index) => <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.15, index * 2]}><sphereGeometry args={[4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#c9a273" roughness={1} /></mesh>)}</group>; }
function StudioCyclorama() { return <mesh receiveShadow position={[0, 4, -8]}><planeGeometry args={[24, 12]} /><meshStandardMaterial color="#9da1a5" roughness={0.8} /></mesh>; }
function SpaceSet() { return <group position={[0, 0, -7]}><mesh><sphereGeometry args={[24, 32, 16]} /><meshBasicMaterial color="#11141e" side={1} /></mesh>{Array.from({ length: 45 }, (_, index) => <mesh key={index} position={[Math.sin(index * 9.7) * 14, 2 + Math.cos(index * 4.3) * 8, -4 - (index % 8)]}><sphereGeometry args={[0.025 + (index % 3) * 0.012, 6, 6]} /><meshBasicMaterial color="#ffffff" /></mesh>)}</group>; }
