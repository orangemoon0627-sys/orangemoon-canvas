import { Grid, OrbitControls, TransformControls, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Group as ThreeGroup, Mesh as ThreeMesh, PerspectiveCamera } from "three";
import { SkeletonUtils } from "three/examples/jsm/Addons.js";

import { sceneAtTime } from "@/lib/director/director-scene";
import { resolveMediaUrl } from "@/services/file-storage";
import type { DirectorCamera, DirectorObject, DirectorScene, DirectorVector3 } from "@/types/director";

export type DirectorTransformMode = "translate" | "rotate" | "scale";

export function DirectorViewport({ scene, playhead, playing, selectedObjectId, transformMode, onSelectObject, onObjectTransform, onCameraChange, onCanvasReady }: {
    scene: DirectorScene;
    playhead: number;
    playing: boolean;
    selectedObjectId: string;
    transformMode: DirectorTransformMode;
    onSelectObject: (id: string) => void;
    onObjectTransform: (id: string, transform: Pick<DirectorObject, "position" | "rotation" | "scale">) => void;
    onCameraChange: (camera: DirectorCamera) => void;
    onCanvasReady: (canvas: HTMLCanvasElement | null) => void;
}) {
    const evaluated = useMemo(() => sceneAtTime(scene, playhead), [playhead, scene]);
    return (
        <Canvas
            shadows
            dpr={[1, 2]}
            gl={{ antialias: true, preserveDrawingBuffer: true }}
            camera={{ position: evaluated.camera.position, fov: evaluated.camera.fov, near: 0.05, far: 500 }}
            onCreated={({ gl }) => onCanvasReady(gl.domElement)}
            onPointerMissed={() => onSelectObject("")}
        >
            <color attach="background" args={[scene.background]} />
            <fog attach="fog" args={[scene.background, 22, 65]} />
            <ambientLight intensity={0.85} />
            <hemisphereLight args={["#e9f3ff", "#49483f", 1.6]} />
            <directionalLight castShadow position={[7, 12, 6]} intensity={2.3} shadow-mapSize={[2048, 2048]} shadow-camera-far={45} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} />
            <CameraRig camera={evaluated.camera} playing={playing} onChange={onCameraChange} />
            <StageEnvironment environment={scene.environment} />
            <Suspense fallback={null}>
                {evaluated.objects.filter((object) => object.visible !== false).map((object) => (
                    <SceneObject key={object.id} object={object} selected={object.id === selectedObjectId} mode={transformMode} onSelect={onSelectObject} onTransform={onObjectTransform} />
                ))}
            </Suspense>
        </Canvas>
    );
}

function CameraRig({ camera: shotCamera, playing, onChange }: { camera: DirectorCamera; playing: boolean; onChange: (camera: DirectorCamera) => void }) {
    const { camera } = useThree();
    const controlsRef = useRef<React.ElementRef<typeof OrbitControls>>(null);

    useEffect(() => {
        camera.position.set(...shotCamera.position);
        const perspective = camera as PerspectiveCamera;
        perspective.fov = shotCamera.fov;
        perspective.updateProjectionMatrix();
        controlsRef.current?.target.set(...shotCamera.target);
        controlsRef.current?.update();
    }, [camera, shotCamera]);

    const commit = useCallback(() => {
        const controls = controlsRef.current;
        if (!controls) return;
        onChange({ ...shotCamera, position: camera.position.toArray() as DirectorVector3, target: controls.target.toArray() as DirectorVector3, fov: (camera as PerspectiveCamera).fov });
    }, [camera, onChange, shotCamera]);

    return <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} enabled={!playing} minDistance={1} maxDistance={80} maxPolarAngle={Math.PI * 0.49} onEnd={commit} />;
}

function SceneObject({ object, selected, mode, onSelect, onTransform }: { object: DirectorObject; selected: boolean; mode: DirectorTransformMode; onSelect: (id: string) => void; onTransform: (id: string, transform: Pick<DirectorObject, "position" | "rotation" | "scale">) => void }) {
    const groupRef = useRef<ThreeGroup>(null);
    const content = <group ref={groupRef} position={object.position} rotation={object.rotation} scale={object.scale} onClick={(event) => { event.stopPropagation(); onSelect(object.id); }}>
        <ObjectGeometry object={object} selected={selected} />
    </group>;
    if (!selected) return content;
    return <TransformControls mode={mode} size={0.72} onMouseUp={() => {
        const group = groupRef.current;
        if (!group) return;
        onTransform(object.id, { position: group.position.toArray() as DirectorVector3, rotation: [group.rotation.x, group.rotation.y, group.rotation.z], scale: group.scale.toArray() as DirectorVector3 });
    }}>{content}</TransformControls>;
}

function ObjectGeometry({ object, selected }: { object: DirectorObject; selected: boolean }) {
    const material = { color: object.color, roughness: 0.62, metalness: object.primitive === "model" ? 0.15 : 0.05, emissive: selected ? object.color : "#000000", emissiveIntensity: selected ? 0.16 : 0 };
    if (object.primitive === "character") return <group>
        <mesh castShadow receiveShadow position={[0, 0.15, 0]}><capsuleGeometry args={[0.38, 0.8, 8, 16]} /><meshStandardMaterial {...material} /></mesh>
        <mesh castShadow position={[0, 1.08, 0]}><sphereGeometry args={[0.31, 24, 16]} /><meshStandardMaterial color="#e5bda4" roughness={0.75} emissive={selected ? "#e5bda4" : "#000000"} emissiveIntensity={selected ? 0.12 : 0} /></mesh>
        <mesh castShadow position={[-0.47, 0.25, 0]} rotation={[0, 0, -0.18]}><capsuleGeometry args={[0.12, 0.55, 6, 10]} /><meshStandardMaterial {...material} /></mesh>
        <mesh castShadow position={[0.47, 0.25, 0]} rotation={[0, 0, 0.18]}><capsuleGeometry args={[0.12, 0.55, 6, 10]} /><meshStandardMaterial {...material} /></mesh>
    </group>;
    if (object.primitive === "model") return <DirectorModel object={object} selected={selected} />;
    if (object.primitive === "sphere") return <mesh castShadow receiveShadow><sphereGeometry args={[0.65, 32, 20]} /><meshStandardMaterial {...material} /></mesh>;
    if (object.primitive === "cylinder") return <mesh castShadow receiveShadow><cylinderGeometry args={[0.55, 0.65, 1.2, 24]} /><meshStandardMaterial {...material} /></mesh>;
    if (object.primitive === "cone") return <mesh castShadow receiveShadow><coneGeometry args={[0.7, 1.4, 24]} /><meshStandardMaterial {...material} /></mesh>;
    return <mesh castShadow receiveShadow><boxGeometry args={[1.2, 1.2, 1.2]} /><meshStandardMaterial {...material} /></mesh>;
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

function StageEnvironment({ environment }: { environment: DirectorScene["environment"] }) {
    const ground = environment === "desert" ? "#b79668" : environment === "space" ? "#242733" : environment === "mountain" ? "#667568" : environment === "studio" ? "#777b80" : "#7b856f";
    return <group>
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}><planeGeometry args={[120, 120]} /><meshStandardMaterial color={ground} roughness={0.96} /></mesh>
        <Grid position={[0, 0.005, 0]} args={[60, 60]} cellSize={1} cellThickness={0.45} cellColor="#ffffff" sectionSize={5} sectionThickness={0.8} sectionColor="#ffffff" fadeDistance={35} fadeStrength={1.5} infiniteGrid />
        {environment === "courtyard" ? <Courtyard /> : null}
        {environment === "mountain" ? <Mountains /> : null}
        {environment === "desert" ? <Desert /> : null}
        {environment === "studio" ? <StudioCyclorama /> : null}
        {environment === "space" ? <SpaceSet /> : null}
    </group>;
}

function Courtyard() { return <group position={[0, 0, -5]}><mesh castShadow position={[0, 1.7, 0]}><boxGeometry args={[10, 3.4, 0.35]} /><meshStandardMaterial color="#c8c0ae" roughness={0.9} /></mesh><mesh castShadow position={[0, 2.6, 0.2]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[7.8, 0.25, 1.2]} /><meshStandardMaterial color="#4e5c58" /></mesh><mesh position={[0, 1.25, 0.2]}><boxGeometry args={[2.3, 2.5, 0.42]} /><meshStandardMaterial color="#4c302a" /></mesh></group>; }
function Mountains() { return <group position={[0, 0, -12]}>{[-7, -2, 4, 9].map((x, index) => <mesh key={x} castShadow position={[x, 2 + index % 2, index]}><coneGeometry args={[4 + index * 0.5, 7 + index, 7]} /><meshStandardMaterial color={index % 2 ? "#53695e" : "#46584f"} roughness={1} /></mesh>)}</group>; }
function Desert() { return <group position={[0, 0, -8]}>{[-6, 1, 7].map((x, index) => <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.15, index * 2]}><sphereGeometry args={[4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#c9a273" roughness={1} /></mesh>)}</group>; }
function StudioCyclorama() { return <mesh receiveShadow position={[0, 4, -8]}><planeGeometry args={[24, 12]} /><meshStandardMaterial color="#9da1a5" roughness={0.8} /></mesh>; }
function SpaceSet() { return <group position={[0, 0, -7]}><mesh><sphereGeometry args={[24, 32, 16]} /><meshBasicMaterial color="#11141e" side={1} /></mesh>{Array.from({ length: 45 }, (_, index) => <mesh key={index} position={[Math.sin(index * 9.7) * 14, 2 + Math.cos(index * 4.3) * 8, -4 - (index % 8)]}><sphereGeometry args={[0.025 + (index % 3) * 0.012, 6, 6]} /><meshBasicMaterial color="#ffffff" /></mesh>)}</group>; }
