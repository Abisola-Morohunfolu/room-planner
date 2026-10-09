import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
export type TextureKind = 'wood' | 'fabric' | 'rug' | 'stone';
export function createSurfaceTexture(kind: TextureKind) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = kind === 'wood' ? '#eee5d7' : kind === 'stone' ? '#efefec' : '#f1eee6';
  context.fillRect(0, 0, 256, 256);
  // Deterministic first-party texture, so exports and different views retain the same finish.
  for (let index = 0; index < 256; index++) {
    const variation = Math.sin(index * 13.19) * 0.5 + 0.5;
    context.strokeStyle = `rgba(60,46,28,${kind === 'wood' ? 0.015 + variation * 0.065 : 0.02 + variation * 0.03})`;
    context.lineWidth = kind === 'wood' ? 1 + variation * 2 : 0.7;
    context.beginPath();
    if (kind === 'wood') {
      const offset = index + Math.sin(index * 0.13) * 4;
      context.moveTo(offset, 0);
      context.bezierCurveTo(offset + 7, 70, offset - 6, 160, offset + 3, 256);
    } else {
      context.moveTo(index, 0);
      context.lineTo(index, 256);
      context.moveTo(0, index);
      context.lineTo(256, index);
    }
    context.stroke();
  }
  if (kind === 'wood') {
    context.strokeStyle = 'rgba(77,51,28,0.2)';
    context.lineWidth = 1;
    for (let plank = 0; plank < 8; plank++) {
      context.beginPath();
      context.moveTo(plank * 32, 0);
      context.lineTo(plank * 32, 256);
      const seam = (plank * 79) % 256;
      context.moveTo(plank * 32, seam);
      context.lineTo((plank + 1) * 32, seam);
      context.stroke();
    }
  }
  if (kind === 'rug') {
    context.strokeStyle = '#d3cab7';
    context.lineWidth = 4;
    context.strokeRect(16, 16, 224, 224);
    context.strokeRect(24, 24, 208, 208);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
