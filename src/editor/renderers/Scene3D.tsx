import { Component, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEditor, activeLayout } from '../../state/editor';
import { roomPolygon } from '../../domain/geometry';
import { FurnitureMesh } from './FurnitureMesh';
import { SurfaceMaterials } from './SurfaceMaterials';
import { RoomMesh } from './RoomMesh';
export default function Scene3D() {
  const { document, selection, select } = useEditor();
  const [exportRequest, setExportRequest] = useState(false);
  if (!document) return null;
  const layout = activeLayout(document),
    polygon = roomPolygon(layout.room),
    width = Math.max(...polygon.map((point) => point.x)) / 1000,
    depth = Math.max(...polygon.map((point) => point.y)) / 1000,
    maxExtent = Math.max(width, depth);
  return (
    <SceneBoundary>
      <div className="scene-3d">
        <Canvas
          shadows
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={{
            position: [
              width / 2 + maxExtent * 1.15,
              maxExtent * 1.155,
              depth / 2 + maxExtent * 1.155,
            ],
            fov: 40,
            near: 0.1,
            far: 250,
          }}
          onPointerMissed={() => select(null)}
          gl={{ antialias: true }}
        >
          <color attach="background" args={['#f5f3ec']} />
          <hemisphereLight args={['#fff7e7', '#a2af99', 1.4]} />
          <directionalLight
            position={[width, 10, -depth]}
            intensity={2}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-maxExtent}
            shadow-camera-right={maxExtent}
            shadow-camera-top={maxExtent}
            shadow-camera-bottom={-maxExtent}
          />
          <SurfaceMaterials>
            <RoomMesh layout={layout} />
            {layout.items.map((item) => (
              <FurnitureMesh
                key={item.id}
                item={item}
                selected={selection === item.id}
                onSelect={() => select(item.id)}
              />
            ))}
          </SurfaceMaterials>{' '}
          <OrbitControls
            makeDefault
            target={[width / 2, 0.65, depth / 2]}
            minDistance={1}
            maxDistance={maxExtent * 5}
            maxPolarAngle={Math.PI * 0.48}
          />
          <FitCamera width={width} depth={depth} />
          <SceneExport requested={exportRequest} onDone={() => setExportRequest(false)} />
        </Canvas>
        <p className="scene-instruction">
          Drag to orbit · Scroll or pinch to zoom · Tap a piece to inspect
        </p>
        <button className="scene-export" onClick={() => setExportRequest(true)}>
          Save this view as PNG
        </button>
      </div>
    </SceneBoundary>
  );
}
function FitCamera({ width, depth }: { width: number; depth: number }) {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const extent = Math.max(width, depth) * Math.max(1, 0.95 / aspect);
    camera.position.set(width / 2 + extent * 1.15, extent * 1.155, depth / 2 + extent * 1.155);
    camera.lookAt(width / 2, 0.65, depth / 2);
    invalidate();
  }, [camera, size.width, size.height, width, depth, invalidate]);
  return null;
}
function SceneExport({ requested, onDone }: { requested: boolean; onDone: () => void }) {
  const { gl, scene, camera, size } = useThree();
  useEffect(() => {
    if (!requested) return;
    const originalSize = { ...size },
      originalRatio = gl.getPixelRatio();
    const ratio = Math.min(2048 / Math.max(size.width, size.height), 2);
    try {
      gl.setPixelRatio(ratio);
      gl.setSize(size.width, size.height, false);
      gl.render(scene, camera);
      gl.domElement.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob),
            anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = 'room-view.png';
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else
          useEditor.setState({
            error: 'The 3D image could not be exported. Try the floor-plan PNG.',
          });
        gl.setPixelRatio(originalRatio);
        gl.setSize(originalSize.width, originalSize.height, false);
        onDone();
      });
    } catch {
      gl.setPixelRatio(originalRatio);
      gl.setSize(originalSize.width, originalSize.height, false);
      onDone();
      useEditor.setState({ error: 'The 3D image could not be exported. Try the floor-plan PNG.' });
    }
  }, [requested, gl, scene, camera, size, onDone]);
  return null;
}
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        <h2>3D is unavailable in this browser.</h2>
        <p>Your floor plan, saves, and exports are still available.</p>
        <button className="primary" onClick={() => useEditor.getState().setView('2d')}>
          Return to floor plan
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
