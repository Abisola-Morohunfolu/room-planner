import type { Opening } from '../../domain/model';
export function OpeningMesh({
  opening,
  wallLength,
  inwardSign,
}: {
  opening: Opening;
  wallLength: number;
  inwardSign: number;
}) {
  const width = opening.widthMm / 1000,
    height = opening.heightMm / 1000,
    start = opening.offsetMm / 1000 - wallLength / 2,
    sill = opening.type === 'window' ? opening.sillHeightMm / 1000 : 0;
  const frame = 0.045;
  return (
    <group position={[start + width / 2, sill + height / 2, 0]}>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[(side * (width - frame)) / 2, 0, 0]}>
            <boxGeometry args={[frame, height, 0.13]} />
            <meshStandardMaterial color="#f1efe6" />
          </mesh>
          <mesh position={[0, (side * (height - frame)) / 2, 0]}>
            <boxGeometry args={[width, frame, 0.13]} />
            <meshStandardMaterial color="#f1efe6" />
          </mesh>
        </group>
      ))}
      {opening.type === 'window' ? (
        <>
          <mesh>
            <boxGeometry args={[width - frame, height - frame, 0.012]} />
            <meshStandardMaterial color="#b4cfce" transparent opacity={0.24} roughness={0.12} />
          </mesh>
          <mesh>
            <boxGeometry args={[frame, height, 0.07]} />
            <meshStandardMaterial color="#f1efe6" />
          </mesh>
          <mesh position={[0, 0, inwardSign * 0.005]}>
            <boxGeometry args={[width, frame, 0.07]} />
            <meshStandardMaterial color="#f1efe6" />
          </mesh>
          <mesh position={[0, -height / 2, inwardSign * 0.08]} receiveShadow>
            <boxGeometry args={[width + 0.06, 0.035, 0.22]} />
            <meshStandardMaterial color="#e2ded1" />
          </mesh>
        </>
      ) : (
        <group
          position={[opening.hinge === 'left' ? -width / 2 : width / 2, 0, 0]}
          rotation={[
            0,
            ((opening.hinge === 'left' ? -1 : 1) *
              (opening.swing === 'inward' ? inwardSign : -inwardSign) *
              Math.PI) /
              2,
            0,
          ]}
        >
          <mesh position={[opening.hinge === 'left' ? width / 2 : -width / 2, 0, 0]} castShadow>
            <boxGeometry args={[width - 0.04, height - 0.04, 0.035]} />
            <meshStandardMaterial color="#c8b795" roughness={0.72} />
          </mesh>
          <mesh
            position={[
              opening.hinge === 'left' ? width * 0.9 : -width * 0.9,
              -height * 0.05,
              -0.035,
            ]}
          >
            <sphereGeometry args={[0.025, 12, 8]} />
            <meshStandardMaterial color="#a98b51" metalness={0.5} roughness={0.35} />
          </mesh>
        </group>
      )}
    </group>
  );
}
