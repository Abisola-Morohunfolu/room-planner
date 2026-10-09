import { useMemo, useEffect } from 'react';
import { BoxGeometry, CylinderGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toThreeTransform } from '../../domain/geometry';
import type { FurnitureItem } from '../../domain/model';
import { buildFurnitureParts, type FurniturePart } from './furnitureParts';
import { useSurfaceTexture } from './SurfaceMaterials';
export function FurnitureMesh({
  item,
  selected,
  onSelect,
}: {
  item: FurnitureItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const transform = toThreeTransform(item),
    parts = useMemo(() => buildFurnitureParts(item), [item]);
  return (
    <group
      position={transform.position}
      rotation={transform.rotation}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {parts.map((part, index) => (
        <Part key={index} part={part} />
      ))}
      {selected && (
        <mesh position={[0, -transform.size[1] / 2 + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[
              Math.max(transform.size[0], transform.size[2]) * 0.55,
              Math.max(transform.size[0], transform.size[2]) * 0.55 + 0.025,
              48,
            ]}
          />
          <meshBasicMaterial color="#365d49" side={2} />
        </mesh>
      )}
    </group>
  );
}
function Part({ part }: { part: FurniturePart }) {
  const geometry = useMemo(
    () =>
      part.disc
        ? new CylinderGeometry(part.size[0] / 2, part.size[0] / 2, part.size[2], 32)
            .rotateX(Math.PI / 2)
            .scale(1, part.size[1] / part.size[0], 1)
        : part.round
          ? new CylinderGeometry(part.size[0] / 2, part.size[0] / 2, part.size[1], 32).scale(
              1,
              1,
              part.size[2] / part.size[0],
            )
          : part.radius
            ? new RoundedBoxGeometry(
                ...part.size,
                3,
                Math.min(part.radius, ...part.size.map((dimension) => dimension / 3)),
              )
            : new BoxGeometry(...part.size),
    [part],
  );
  const texture = useSurfaceTexture(part.texture);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  return (
    <mesh
      geometry={geometry}
      position={part.position}
      castShadow={part.material !== 'glass'}
      receiveShadow
    >
      <meshPhysicalMaterial
        color={part.colour}
        map={texture}
        roughness={
          part.material === 'glass'
            ? 0.08
            : part.material === 'metal'
              ? 0.3
              : part.material === 'screen'
                ? 0.18
                : part.texture === 'wood'
                  ? 0.58
                  : 0.9
        }
        metalness={part.material === 'metal' ? 0.7 : 0}
        transmission={part.material === 'glass' ? 0.85 : 0}
        thickness={part.material === 'glass' ? Math.min(...part.size) : 0}
        ior={1.5}
        clearcoat={part.material === 'glass' || part.material === 'screen' ? 1 : 0}
      />
    </mesh>
  );
}
