import { roomPolygon, footprint, doorSector, walls } from '../domain/geometry';
import { floorColours } from '../domain/finishes';
import type { Layout } from '../domain/model';
import { formatLength } from '../domain/units';
export function drawPlan(
  context: CanvasRenderingContext2D,
  layout: Layout,
  width: number,
  height: number,
  units: 'metric' | 'imperial',
) {
  const polygon = roomPolygon(layout.room),
    roomWidth = Math.max(...polygon.map((point) => point.x)),
    roomDepth = Math.max(...polygon.map((point) => point.y)),
    scale = Math.min((width - 160) / roomWidth, (height - 160) / roomDepth),
    offsetX = (width - roomWidth * scale) / 2,
    offsetY = (height - roomDepth * scale) / 2;
  context.fillStyle = '#f5f3ec';
  context.fillRect(0, 0, width, height);
  context.save();
  context.translate(offsetX, offsetY);
  context.scale(scale, scale);
  const path = (points: { x: number; y: number }[]) => {
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
  };
  path(polygon);
  context.fillStyle = floorColours[layout.room.floorFinish];
  context.fill();
  context.strokeStyle = '#657160';
  context.lineWidth = 3 / scale;
  context.stroke();
  for (const wall of walls(layout.room)) {
    context.beginPath();
    context.moveTo(wall.a.x - wall.inward.x * 55, wall.a.y - wall.inward.y * 55);
    context.lineTo(wall.b.x - wall.inward.x * 55, wall.b.y - wall.inward.y * 55);
    context.strokeStyle = layout.room.wallColours[wall.id] ?? '#e6e3d8';
    context.lineWidth = 110;
    context.stroke();
  }
  for (const opening of layout.openings) {
    const wall = walls(layout.room).find((wall) => wall.id === opening.wallId)!;
    const unit = { x: (wall.b.x - wall.a.x) / wall.length, y: (wall.b.y - wall.a.y) / wall.length };
    context.beginPath();
    context.moveTo(wall.a.x + unit.x * opening.offsetMm, wall.a.y + unit.y * opening.offsetMm);
    context.lineTo(
      wall.a.x + unit.x * (opening.offsetMm + opening.widthMm),
      wall.a.y + unit.y * (opening.offsetMm + opening.widthMm),
    );
    context.strokeStyle = opening.type === 'window' ? '#80a5a4' : '#f5f3ec';
    context.lineWidth = 6 / scale;
    context.stroke();
    if (opening.type === 'door') {
      path(doorSector(layout.room, opening));
      context.strokeStyle = '#819786';
      context.lineWidth = 1 / scale;
      context.stroke();
    }
  }
  for (const item of [...layout.items].sort(
    (left, right) => Number(right.nonblocking) - Number(left.nonblocking),
  )) {
    path(footprint(item));
    context.fillStyle = item.colour;
    context.fill();
    context.strokeStyle = '#716a5e';
    context.lineWidth = 1 / scale;
    context.stroke();
  }
  context.font = `${14 / scale}px sans-serif`;
  context.fillStyle = '#384738';
  context.textAlign = 'center';
  for (const wall of walls(layout.room))
    context.fillText(
      formatLength(wall.length, units, true),
      (wall.a.x + wall.b.x) / 2 - (wall.inward.x * 38) / scale,
      (wall.a.y + wall.b.y) / 2 - (wall.inward.y * 30) / scale,
    );
  context.restore();
}
export async function exportPng(layout: Layout, units: 'metric' | 'imperial', aspect = 1.3) {
  const canvas = document.createElement('canvas');
  canvas.width = aspect >= 1 ? 2048 : Math.round(2048 * aspect);
  canvas.height = aspect >= 1 ? Math.round(2048 / aspect) : 2048;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image export is unavailable. Download the plan file instead.');
  drawPlan(context, layout, canvas.width, canvas.height, units);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error('Image export failed. Try again or download the plan file.'));
    }, 'image/png'),
  );
}
