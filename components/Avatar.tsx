
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface WorldObject {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  type?: string;
  customMesh?: { parts?: Array<{ geometry: string; args: number[] }> };
}

interface AvatarProps {
  position: [number, number, number];
  targetPosition: [number, number, number] | null;
  isThinking?: boolean;
  objects?: WorldObject[];
  /** Collision radius — how close avatar can get to objects (default: 1.2) */
  collisionRadius?: number;
}

/** Simple bounding-box collision against all world objects */
function resolveCollision(
  desired: [number, number, number],
  objects: WorldObject[],
  radius: number
): [number, number, number] {
  for (const obj of objects) {
    const dx = desired[0] - obj.position[0];
    const dz = desired[2] - obj.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < radius) {
      // Push away from this object along the horizontal plane
      const pushDir = dist > 0.01
        ? [dx / dist, 0, dz / dist] as [number, number, number]
        : [1, 0, 0] as [number, number, number];
      const pushDist = radius - dist;
      return [
        desired[0] + pushDir[0] * pushDist,
        desired[1],
        desired[2] + pushDir[2] * pushDist,
      ];
    }
  }
  return desired;
}

export const Avatar: React.FC<AvatarProps> = ({ position, targetPosition, isThinking, objects = [], collisionRadius = 1.2 }) => {
  const meshRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const scannerRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  // Use refs to store the current visual position for smooth lerping
  const currentPos = useRef(new THREE.Vector3(...position));
  const targetVec = useMemo(() => new THREE.Vector3(...position), [position]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      // Update target vector from prop
      targetVec.set(...position);
      
      // Smoothly interpolate with collision resolution
      const desired: [number, number, number] = [
        THREE.MathUtils.lerp(currentPos.current.x, targetVec.x, 0.1),
        THREE.MathUtils.lerp(currentPos.current.y, targetVec.y, 0.1),
        THREE.MathUtils.lerp(currentPos.current.z, targetVec.z, 0.1),
      ];
      const resolved = resolveCollision(desired, objects, collisionRadius);
      currentPos.current.set(resolved[0], resolved[1], resolved[2]);
      meshRef.current.position.copy(currentPos.current);
      
      // Movement-based tilt
      const movement = new THREE.Vector3().subVectors(currentPos.current, prevPos);
      meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, movement.z * 5, 0.1);
      meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, -movement.x * 5, 0.1);

      // Hover effect on the visual Y
      meshRef.current.position.y += Math.sin(state.clock.elapsedTime * 2) * 0.15;
      
      if (targetPosition) {
        const lookTarget = new THREE.Vector3(...targetPosition);
        const direction = new THREE.Vector3().subVectors(lookTarget, meshRef.current.position).normalize();
        const targetRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
        meshRef.current.quaternion.slerp(targetRotation, 0.1);
      }
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += delta * (isThinking ? 12 : 3);
      const targetScale = isThinking ? 1.3 + Math.sin(state.clock.elapsedTime * 8) * 0.1 : 1;
      ringRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1);
    }

    if (scannerRef.current) {
      scannerRef.current.visible = !!isThinking;
      scannerRef.current.rotation.y += delta * 6;
      scannerRef.current.scale.y = 0.5 + Math.abs(Math.sin(state.clock.elapsedTime * 15)) * 1.5;
    }

    if (lightRef.current) {
      const pulse = isThinking ? 3 + Math.sin(state.clock.elapsedTime * 12) * 2 : 1.5;
      lightRef.current.intensity = pulse;
    }
  });

  return (
    <group ref={meshRef}>
      {/* Chassis */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.7, 0.5]} />
        <meshStandardMaterial color="#334155" roughness={0.05} metalness={0.9} />
      </mesh>
      
      {/* Eye / Core */}
      <mesh position={[0, 0.9, 0]}>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshStandardMaterial 
          color={isThinking ? "#f43f5e" : "#38bdf8"} 
          emissive={isThinking ? "#f43f5e" : "#38bdf8"} 
          emissiveIntensity={isThinking ? 5 : 2} 
        />
        <pointLight ref={lightRef} color={isThinking ? "#f43f5e" : "#38bdf8"} distance={5} />
      </mesh>

      {/* Holographic Scanner Beam */}
      <mesh ref={scannerRef} position={[0, 0.9, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.4, 1.8, 24, 1, true]} />
        <meshBasicMaterial color="#f43f5e" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>

      {/* Ground marker beneath avatar */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.25, 64]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.22} />
      </mesh>

      {/* Floating Status Ring */}
      <mesh ref={ringRef} position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.7, 0.02, 12, 48]} />
        <meshStandardMaterial 
          color={isThinking ? "#fb7185" : "#0ea5e9"} 
          emissive={isThinking ? "#fb7185" : "#0ea5e9"} 
          transparent 
          opacity={0.72} 
        />
      </mesh>
    </group>
  );
};
