import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Shape, DoubleSide, type Group } from 'three';
import { roomPolygon, walls, type Wall } from '../../domain/geometry';
import type { Layout } from '../../domain/model';
import { OpeningMesh } from './OpeningMesh';
import { useSurfaceTexture } from './SurfaceMaterials';
import { floorColours } from '../../domain/finishes';
export function RoomMesh({ layout }: { layout: Layout }) {
  const floorTexture = useSurfaceTexture(
    layout.room.floorFinish === 'carpet'
      ? 'fabric'
      : layout.room.floorFinish === 'stone'
        ? 'stone'
        : 'wood',
  );
  const shape = useMemo(() => {
    const polygon = roomPolygon(layout.room),
      shape = new Shape();
    shape.moveTo(polygon[0].x / 1000, -polygon[0].y / 1000);
    polygon.slice(1).forEach((point) => shape.lineTo(point.x / 1000, -point.y / 1000));
    shape.closePath();
    return shape;
  }, [layout.room]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial
          color={floorColours[layout.room.floorFinish]}
          roughness={0.85}
          map={floorTexture}
          side={DoubleSide}
        />
      </mesh>
      {walls(layout.room).map((wall) => (
        <CutawayWall key={wall.id} wall={wall} layout={layout} />
      ))}
    </>
  );
}
function CutawayWall({ wall, layout }: { wall: Wall; layout: Layout }) {
  const group = useRef<Group>(null);
  const length = wall.length / 1000,
    height = layout.room.ceilingHeightMm / 1000,
    thickness = 0.1;
  const centre = {
    x: (wall.a.x + wall.b.x) / 2000 - (wall.inward.x * thickness) / 2,
    z: (wall.a.y + wall.b.y) / 2000 - (wall.inward.y * thickness) / 2,
  };
  useFrame(({ camera }) => {
    if (group.current)
      group.current.visible =
        (camera.position.x - centre.x) * wall.inward.x +
          (camera.position.z - centre.z) * wall.inward.y >=
        0;
  });
  const openings = layout.openings
    .filter((opening) => opening.wallId === wall.id)
    .sort((left, right) => left.offsetMm - right.offsetMm);
  const segments: { offset: number; width: number; bottom: number; top: number }[] = [];
  let cursor = 0;
  for (const opening of openings) {
    const offset = opening.offsetMm / 1000,
      width = opening.widthMm / 1000,
      bottom = opening.type === 'window' ? opening.sillHeightMm / 1000 : 0,
      top = bottom + opening.heightMm / 1000;
    if (offset > cursor)
      segments.push({ offset: cursor, width: offset - cursor, bottom: 0, top: height });
    if (bottom > 0) segments.push({ offset, width, bottom: 0, top: bottom });
    if (top < height) segments.push({ offset, width, bottom: top, top: height });
    cursor = offset + width;
  }
  if (cursor < length)
    segments.push({ offset: cursor, width: length - cursor, bottom: 0, top: height });
  const angle = -Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
  return (
    <group ref={group} position={[centre.x, 0, centre.z]} rotation={[0, angle, 0]}>
      {segments.map((segment, index) => (
        <mesh
          key={index}
          position={[
            segment.offset + segment.width / 2 - length / 2,
            (segment.bottom + segment.top) / 2,
            0,
          ]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[segment.width, segment.top - segment.bottom, thickness]} />
          <meshStandardMaterial color={layout.room.wallColours[wall.id] ?? '#e6e3d8'} />
        </mesh>
      ))}
      {segments
        .filter((segment) => segment.bottom === 0)
        .map((segment, index) => (
          <mesh
            key={`skirting-${index}`}
            position={[segment.offset + segment.width / 2 - length / 2, 0.04, 0]}
          >
            <boxGeometry args={[segment.width, 0.08, 0.12]} />
            <meshStandardMaterial color="#e4e0d3" />
          </mesh>
        ))}
      {openings.map((opening) => (
        <OpeningMesh
          key={opening.id}
          opening={opening}
          wallLength={length}
          inwardSign={Math.sign(wall.inward.x * Math.sin(angle) + wall.inward.y * Math.cos(angle))}
        />
      ))}
    </group>
  );
}
