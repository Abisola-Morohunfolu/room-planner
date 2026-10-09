import { roomPolygon, footprint, walls } from '../domain/geometry';
import { floorColours } from '../domain/finishes';
import type { Layout } from '../domain/model';
export function PlanPreview({ layout }: { layout: Layout }) {
  const polygon = roomPolygon(layout.room),
    width = Math.max(...polygon.map((point) => point.x)),
    depth = Math.max(...polygon.map((point) => point.y));
  return (
    <svg
      viewBox={`-250 -250 ${width + 500} ${depth + 500}`}
      aria-label={`Floor-plan preview for ${layout.name}`}
      role="img"
    >
      <polygon
        points={polygon.map((point) => `${point.x},${point.y}`).join(' ')}
        fill={floorColours[layout.room.floorFinish]}
        stroke="#7c876f"
        strokeWidth="50"
      />
      {walls(layout.room).map((wall) => (
        <line
          key={wall.id}
          x1={wall.a.x}
          y1={wall.a.y}
          x2={wall.b.x}
          y2={wall.b.y}
          stroke={layout.room.wallColours[wall.id] ?? '#e6e3d8'}
          strokeWidth="70"
        />
      ))}
      {[...layout.items]
        .sort((left, right) => Number(right.nonblocking) - Number(left.nonblocking))
        .map((item) => (
          <polygon
            key={item.id}
            points={footprint(item)
              .map((point) => `${point.x},${point.y}`)
              .join(' ')}
            fill={item.colour}
            stroke="#857965"
            strokeWidth="15"
          />
        ))}
    </svg>
  );
}
