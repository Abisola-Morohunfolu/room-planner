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
      part.round
        ? new CylinderGeometry(part.size[0] / 2, part.size[0] / 2, part.size[1], 32)
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
    <mesh geometry={geometry} position={part.position} castShadow receiveShadow>
      <meshStandardMaterial
        color={part.colour}
        map={texture}
        roughness={part.texture === 'wood' ? 0.58 : 0.9}
      />
    </mesh>
  );
}
