
import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Stars, ContactShadows, Environment } from '@react-three/drei';
import { Bloom, EffectComposer, Noise, Vignette, Scanline } from '@react-three/postprocessing';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { WorldObject, ConstructionPlan } from '../src/types';
import { WorldAsset } from './WorldAssets';
import { Avatar } from './Avatar';

interface SimulationCanvasProps {
  objects: WorldObject[];
  avatarPos: [number, number, number];
  avatarTarget: [number, number, number] | null;
  activePlan?: ConstructionPlan;
}

const Terrain: React.FC = () => {
  const meshRef = React.useRef<THREE.Mesh>(null);
  
  // Create a vertex-based terrain that matches getTerrainHeight logic
  // Vast world scale: 1000x1000
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(1000, 1000, 128, 128);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getY(i);
      // Multi-layered noise for more "vast" look
      const h = (Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2.0) +
                (Math.sin(x * 0.02) * Math.cos(z * 0.02) * 5.0);
      pos.setZ(i, h);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh ref={meshRef} geometry={geom} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial
        color="#0f172a"
        roughness={0.8}
        metalness={0.2}
        flatShading
        emissive="#0c4a6e"
        emissiveIntensity={0.05}
      />
    </mesh>
  );
};

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ objects, avatarPos, avatarTarget, activePlan }) => {
  const ghostObjects = useMemo(() => {
    if (!activePlan) return [];
    return activePlan.steps.filter(step => step.status !== 'completed');
  }, [activePlan]);

  return (
    <div className="w-full h-full bg-black">
      <Canvas camera={{ position: [20, 20, 20], fov: 45, far: 2000 }} shadows>
        <color attach="background" args={['#020617']} />
        <fogExp2 attach="fog" args={['#020617', 0.008]} />
        
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 15, 10]} intensity={1.5} color="#00f2ff" />
        <directionalLight 
          position={[-50, 100, 50]}
          intensity={1} 
          castShadow 
          shadow-mapSize={[4096, 4096]}
        />

        <Sky sunPosition={[100, 10, 100]} />
        <Stars radius={300} depth={60} count={10000} factor={6} saturation={0} fade speed={1} />
        <Environment preset="night" />

        <Terrain />
        <gridHelper args={[1000, 100, '#1e293b', '#0f172a']} position={[0, -0.05, 0]} />

        <Sparkles count={500} scale={50} size={2} speed={0.4} color="#38bdf8" />
        <Sparkles count={100} scale={30} size={4} speed={0.8} color="#f43f5e" opacity={0.4} />

        {/* Existing Real Objects */}
        {objects.map((obj) => (
          <WorldAsset 
            key={obj.id} 
            type={obj.type} 
            position={obj.position} 
            rotation={obj.rotation} 
            scale={obj.scale} 
            variant="real"
          />
        ))}

        {/* Planned Ghost Objects */}
        {ghostObjects.map((step, idx) => (
          <WorldAsset 
            key={`ghost-${idx}`} 
            type={step.type} 
            position={step.position} 
            variant="ghost"
          />
        ))}

        <Avatar position={avatarPos} targetPosition={avatarTarget} isThinking={activePlan === undefined} />

        <ContactShadows opacity={0.4} scale={100} blur={2.5} far={20} />
        <OrbitControls
          makeDefault
          target={[avatarPos[0], avatarPos[1], avatarPos[2]]}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.1}
        />

        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={1} mipmapBlur intensity={0.5} radius={0.4} />
          <Noise opacity={0.05} />
          <Vignette eskil={false} offset={0.1} darkness={1.1} />
          <Scanline density={1.2} opacity={0.05} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

export default SimulationCanvas;
