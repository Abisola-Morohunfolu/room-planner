import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { CanvasTexture } from 'three';
import { createSurfaceTexture, type TextureKind } from './materials';
const SurfaceContext = createContext<Partial<Record<TextureKind, CanvasTexture>>>({});
export function SurfaceMaterials({ children }: { children: ReactNode }) {
  const textures = useMemo(
    () => ({
      wood: createSurfaceTexture('wood'),
      fabric: createSurfaceTexture('fabric'),
      rug: createSurfaceTexture('rug'),
      stone: createSurfaceTexture('stone'),
    }),
    [],
  );
  useEffect(
    () => () => Object.values(textures).forEach((texture) => texture.dispose()),
    [textures],
  );
  return <SurfaceContext.Provider value={textures}>{children}</SurfaceContext.Provider>;
}
export function useSurfaceTexture(kind?: TextureKind) {
  const textures = useContext(SurfaceContext);
  return kind ? (textures[kind] ?? null) : null;
}
