import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Group, Rect, Ellipse, Text, Circle } from 'react-konva';
import type Konva from 'konva';
import { Minus, Plus, Scan, Ruler, Magnet, RotateCw, RotateCcw, Copy, Trash2 } from 'lucide-react';
import { useEditor, activeLayout } from '../../state/editor';
import {
  roomPolygon,
  walls,
  doorSector,
  snapPosition,
  distance,
  footprint,
  openingOffsetAtPoint,
  normalizeAngle,
  roundMm,
  type Wall,
  type Point,
} from '../../domain/geometry';
import { newItem, type FurnitureItem } from '../../domain/model';
import { formatLength } from '../../domain/units';
import { floorColours } from '../../domain/finishes';
import { PlanContextMenu, type PlanMenuTarget } from '../PlanContextMenu';
function FurnitureShape({
  item,
  selected,
  scale,
  units,
}: {
  item: FurnitureItem;
  selected: boolean;
  scale: number;
  units: 'metric' | 'imperial';
}) {
  const width = item.widthMm,
    depth = item.depthMm;
  const isSofa = item.catalogId.startsWith('sofa') || item.catalogId === 'armchair',
    isBed = item.catalogId.startsWith('bed-'),
    isTable = item.catalogId.includes('table') || item.catalogId.includes('desk');
  return (
    <>
      <Group x={-width / 2} y={-depth / 2}>
        {item.shape === 'ellipse' ? (
          <Ellipse
            x={width / 2}
            y={depth / 2}
            radiusX={width / 2}
            radiusY={depth / 2}
            fill={item.colour}
            fillOpacity={item.finishId === 'glass' ? 0.45 : 1}
            stroke={selected ? '#365d49' : '#716a5e'}
            strokeWidth={1 / scale}
          />
        ) : (
          <Rect
            width={width}
            height={depth}
            fill={item.colour}
            fillOpacity={item.finishId === 'glass' ? 0.45 : 1}
            cornerRadius={isSofa ? 70 : isTable ? 25 : 8}
            stroke={selected ? '#365d49' : '#716a5e'}
            strokeWidth={1 / scale}
          />
        )}
        {isSofa && (
          <>
            <Rect
              x={width * 0.06}
              y={depth * 0.05}
              width={width * 0.88}
              height={depth * 0.2}
              fill="#ffffff"
              opacity={0.22}
              cornerRadius={40}
            />
            <Rect
              x={width * 0.06}
              y={depth * 0.28}
              width={width * 0.41}
              height={Math.max(1, depth * 0.65)}
              fill="#ffffff"
              opacity={0.15}
              cornerRadius={40}
            />
            <Rect
              x={width * 0.53}
              y={depth * 0.28}
              width={width * 0.41}
              height={Math.max(1, depth * 0.65)}
              fill="#ffffff"
              opacity={0.15}
              cornerRadius={40}
            />
          </>
        )}
        {isBed && (
          <>
            <Rect
              x={30}
              y={30}
              width={Math.max(1, width - 60)}
              height={Math.max(1, depth - 60)}
              fill="#e9e5db"
              cornerRadius={30}
            />
            <Rect
              x={80}
              y={90}
              width={Math.max(1, width - 160)}
              height={300}
              fill="#f7f5ef"
              cornerRadius={40}
            />
            <Line
              points={[40, depth * 0.7, width - 40, depth * 0.7]}
              stroke="#c6bda9"
              strokeWidth={20}
            />
          </>
        )}
        {item.nonblocking && (
          <Rect
            x={70}
            y={70}
            width={Math.max(0, width - 140)}
            height={Math.max(0, depth - 140)}
            stroke="#f9f5eb"
            strokeWidth={10}
            opacity={0.5}
          />
        )}
      </Group>
      {selected && (
        <>
          <Rect
            x={-width / 2 - 30}
            y={-depth / 2 - 30}
            width={width + 60}
            height={depth + 60}
            stroke="#365d49"
            strokeWidth={2 / scale}
            dash={[6 / scale, 4 / scale]}
            cornerRadius={8}
          />
          <Group rotation={-item.rotationDeg} listening={false}>
            <Text
              x={-90 / scale}
              y={
                (Math.abs(Math.sin((item.rotationDeg * Math.PI) / 180)) * width +
                  Math.abs(Math.cos((item.rotationDeg * Math.PI) / 180)) * depth) /
                  2 +
                14 / scale
              }
              text={`${formatLength(width, units)} × ${formatLength(depth, units)}`}
              fontSize={11 / scale}
              fill="#365d49"
              width={180 / scale}
              align="center"
              wrap="none"
            />
          </Group>
        </>
      )}
    </>
  );
}
function RotationHandle({
  item,
  scale,
  stage,
}: {
  item: FurnitureItem;
  scale: number;
  stage: React.RefObject<Konva.Stage | null>;
}) {
  const handle = useRef<Konva.Circle>(null);
  const group = useRef<Konva.Group>(null);
  const cancelled = useRef(false);
  const radius = item.depthMm / 2 + 32 / scale;
  useEffect(() => {
    const cancel = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (!handle.current?.isDragging()) return;
      cancelled.current = true;
      handle.current.stopDrag();
      handle.current.position({ x: 0, y: -radius });
      group.current?.rotation(item.rotationDeg);
      stage.current?.findOne(`#${item.id}`)?.rotation(item.rotationDeg);
    };
    window.addEventListener('keydown', cancel);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchcancel', cancel);
    return () => {
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchcancel', cancel);
    };
  }, [item.id, item.rotationDeg, radius, stage]);
  return (
    <Group ref={group} x={item.xMm} y={item.yMm} rotation={item.rotationDeg}>
      <Line
        points={[0, -item.depthMm / 2, 0, -radius]}
        stroke="#365d49"
        strokeWidth={1.5 / scale}
        listening={false}
      />
      <Circle
        ref={handle}
        name="rotation-handle"
        x={0}
        y={-radius}
        radius={10 / scale}
        hitStrokeWidth={12 / scale}
        fill="#fcfbf6"
        stroke="#365d49"
        strokeWidth={2 / scale}
        draggable
        onMouseEnter={() => {
          if (stage.current) stage.current.container().style.cursor = 'grab';
        }}
        onMouseLeave={() => {
          if (stage.current) stage.current.container().style.cursor = '';
        }}
        onClick={(event) => {
          event.cancelBubble = true;
        }}
        onTap={(event) => {
          event.cancelBubble = true;
        }}
        onDragStart={(event) => {
          event.cancelBubble = true;
          cancelled.current = false;
        }}
        onDragMove={(event) => {
          event.cancelBubble = true;
          const point = stage.current?.getRelativePointerPosition();
          if (!point) return;
          const angle = normalizeAngle(
            (Math.atan2(point.y - item.yMm, point.x - item.xMm) * 180) / Math.PI + 90,
          );
          const snap = !('altKey' in event.evt && event.evt.altKey);
          const rotation = snap
            ? normalizeAngle(Math.round(angle / 15) * 15)
            : Math.round(angle * 10) / 10;
          group.current?.rotation(rotation);
          stage.current?.findOne(`#${item.id}`)?.rotation(rotation);
          event.target.position({ x: 0, y: -radius });
        }}
        onDragEnd={(event) => {
          event.cancelBubble = true;
          event.target.position({ x: 0, y: -radius });
          if (!cancelled.current)
            useEditor
              .getState()
              .updateItem(item.id, { rotationDeg: group.current?.rotation() ?? item.rotationDeg });
        }}
      />
    </Group>
  );
}
export function FloorPlan() {
  const state = useEditor(),
    document = state.document!;
  const layout = activeLayout(document),
    polygon = roomPolygon(layout.room),
    selectedItem = layout.items.find((item) => item.id === state.selection),
    selectedOpening = layout.openings.find((opening) => opening.id === state.selection);
  const container = useRef<HTMLDivElement>(null),
    stage = useRef<Konva.Stage>(null),
    dragCancelled = useRef(false),
    dragStart = useRef<Point | null>(null);
  const [size, setSize] = useState({ width: 700, height: 600 }),
    [camera, setCamera] = useState({ x: 90, y: 70, scale: 0.09 }),
    [placementPoint, setPlacementPoint] = useState<Point | null>(null),
    [grid, setGrid] = useState(true),
    [wallSnap, setWallSnap] = useState(true),
    [ruler, setRuler] = useState(false),
    [rulerPoints, setRulerPoints] = useState<Point[]>([]),
    [contextMenu, setContextMenu] = useState<PlanMenuTarget | null>(null);
  const roomWidth = Math.max(...polygon.map((point) => point.x)),
    roomDepth = Math.max(...polygon.map((point) => point.y));
  const fit = () => {
    const scale = Math.max(
      0.001,
      Math.min(
        (size.width - 130) / roomWidth,
        (size.height - (size.width > 600 ? 210 : 195)) / roomDepth,
      ),
    );
    setCamera({
      scale: Math.max(0.001, scale),
      x: (size.width - roomWidth * scale) / 2,
      y: (size.height - roomDepth * scale) / 2 - (size.width > 600 ? 5 : 12.5),
    });
  };
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const bounds = entries[0].contentRect;
      setSize({ width: bounds.width, height: bounds.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const scale = Math.max(
      0.001,
      Math.min(
        (size.width - 130) / roomWidth,
        (size.height - (size.width > 600 ? 210 : 195)) / roomDepth,
      ),
    );
    setCamera({
      scale: Math.max(0.001, scale),
      x: (size.width - roomWidth * scale) / 2,
      y: (size.height - roomDepth * scale) / 2 - (size.width > 600 ? 5 : 12.5),
    });
  }, [size.width, size.height, roomWidth, roomDepth]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        useEditor.getState().setPlacement(null);
        setRulerPoints([]);
        setRuler(false);
        dragCancelled.current = true;
        const node = stage.current?.findOne('.dragging-item');
        if (node && dragStart.current) {
          node.stopDrag();
          node.position(dragStart.current);
        }
      }
    };
    const cancelPointer = () => {
      dragCancelled.current = true;
      const node = stage.current?.findOne('.dragging-item');
      if (node && dragStart.current) {
        node.stopDrag();
        node.position(dragStart.current);
      }
    };
    window.addEventListener('keydown', cancel);
    window.addEventListener('pointercancel', cancelPointer);
    window.addEventListener('touchcancel', cancelPointer);
    return () => {
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('pointercancel', cancelPointer);
      window.removeEventListener('touchcancel', cancelPointer);
    };
  }, [state.setPlacement]);
  const zoom = (factor: number, anchor = { x: size.width / 2, y: size.height / 2 }) =>
    setCamera((previous) => {
      const scale = Math.max(0.003, Math.min(2, previous.scale * factor));
      return {
        scale,
        x: anchor.x - ((anchor.x - previous.x) * scale) / previous.scale,
        y: anchor.y - ((anchor.y - previous.y) * scale) / previous.scale,
      };
    });
  const placeOnWall = (wall: Wall) => {
    const pointer = stage.current?.getRelativePointerPosition();
    if (!pointer) return;
    if (ruler || state.placement) {
      place(pointer);
      return;
    }
    if (state.openingPlacement) {
      state.addOpening(state.openingPlacement, wall.id, openingOffsetAtPoint(wall, pointer, 900));
    } else state.selectSurface(wall.id);
  };
  const place = (point: Point) => {
    if (state.openingPlacement) {
      useEditor.setState({
        error:
          'Tap a wall to place this opening, or choose its wall and offset in the placement controls.',
      });
      return;
    }
    if (state.placement) {
      const item = newItem(state.placement, point.x, point.y);
      const snapped = snapPosition(
        item,
        point.x,
        point.y,
        layout.room,
        grid,
        wallSnap,
        1 / camera.scale,
      );
      item.xMm = snapped.x;
      item.yMm = snapped.y;
      if (
        state.command('Place furniture', (_document, layout) => {
          layout.items.push(item);
        })
      ) {
        state.select(item.id);
        state.setPlacement(null);
      }
    } else if (ruler)
      setRulerPoints((previous) => (previous.length === 2 ? [point] : [...previous, point]));
    else state.selectSurface('floor');
  };
  const previewItem = state.placement
    ? newItem(
        state.placement,
        placementPoint?.x ?? roomWidth / 2,
        placementPoint?.y ?? roomDepth / 2,
      )
    : null;
  const pinch = useRef<{ distance: number; centre: Point } | null>(null);
  const openContextMenu = (target: PlanMenuTarget) => {
    state.setPlacement(null);
    state.setOpeningPlacement(null);
    setRuler(false);
    if (target.itemId || target.openingId) state.select(target.itemId ?? target.openingId!);
    else state.selectSurface(target.wallId ?? 'floor');
    setContextMenu(target);
  };
  return (
    <div
      className="floor-plan"
      ref={container}
      role="region"
      aria-label="Interactive floor plan"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const wall = walls(layout.room).find(
            (wall) => wall.id === (selectedOpening?.wallId ?? state.surface),
          );
          const point = selectedItem
            ? { x: selectedItem.xMm, y: selectedItem.yMm }
            : wall
              ? { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
              : { x: roomWidth / 2, y: roomDepth / 2 };
          const bounds = container.current!.getBoundingClientRect();
          openContextMenu({
            point,
            screen: {
              x: bounds.left + camera.x + point.x * camera.scale,
              y: bounds.top + camera.y + point.y * camera.scale,
            },
            itemId: selectedItem?.id,
            openingId: selectedOpening?.id,
            wallId: wall?.id,
          });
        }
      }}
    >
      <Stage
        ref={stage}
        width={size.width}
        height={size.height}
        x={camera.x}
        y={camera.y}
        scaleX={camera.scale}
        scaleY={camera.scale}
        draggable={!state.placement && !state.openingPlacement && !ruler}
        onContextMenu={(event) => {
          event.evt.preventDefault();
          const point = stage.current?.getRelativePointerPosition();
          if (!point) return;
          let node: Konva.Node | null = event.target;
          const target: PlanMenuTarget = {
            point,
            screen: { x: event.evt.clientX, y: event.evt.clientY },
          };
          while (node && node !== stage.current) {
            const id = node.id();
            if (layout.items.some((item) => item.id === id)) {
              target.itemId = id;
              break;
            }
            const opening = layout.openings.find((opening) => opening.id === id);
            if (opening) {
              target.openingId = id;
              target.wallId = opening.wallId;
              break;
            }
            if (id.startsWith('wall-')) {
              target.wallId = id.slice(5);
              break;
            }
            node = node.getParent();
          }
          openContextMenu(target);
        }}
        onDragEnd={(event) => {
          if (event.target === stage.current)
            setCamera((previous) => ({ ...previous, x: event.target.x(), y: event.target.y() }));
        }}
        onWheel={(event) => {
          event.evt.preventDefault();
          zoom(event.evt.deltaY > 0 ? 0.9 : 1.1, stage.current?.getPointerPosition() ?? undefined);
        }}
        onMouseMove={() => {
          if (state.placement)
            setPlacementPoint(stage.current?.getRelativePointerPosition() ?? null);
        }}
        onTouchMove={(event) => {
          const touches = event.evt.touches;
          if (touches.length === 2) {
            event.evt.preventDefault();
            dragCancelled.current = true;
            const draggingItem = stage.current?.findOne('.dragging-item');
            if (draggingItem && dragStart.current) {
              draggingItem.stopDrag();
              draggingItem.position(dragStart.current);
            }
            stage.current?.stopDrag();
            const first = { x: touches[0].clientX, y: touches[0].clientY },
              second = { x: touches[1].clientX, y: touches[1].clientY },
              bounds = container.current!.getBoundingClientRect(),
              centre = {
                x: (first.x + second.x) / 2 - bounds.left,
                y: (first.y + second.y) / 2 - bounds.top,
              },
              currentDistance = distance(first, second);
            if (pinch.current) {
              const previous = pinch.current;
              setCamera((camera) => {
                const scale = Math.max(
                  0.003,
                  Math.min(2, (camera.scale * currentDistance) / previous.distance),
                );
                return {
                  scale,
                  x: centre.x - ((previous.centre.x - camera.x) * scale) / camera.scale,
                  y: centre.y - ((previous.centre.y - camera.y) * scale) / camera.scale,
                };
              });
            }
            pinch.current = { distance: currentDistance, centre };
          }
        }}
        onTouchEnd={() => {
          pinch.current = null;
        }}
        onClick={(event) => {
          if (event.target === stage.current || event.target.name() === 'room-floor') {
            const pointer = stage.current!.getRelativePointerPosition();
            if (pointer) {
              if (
                event.target === stage.current &&
                !state.placement &&
                !state.openingPlacement &&
                !ruler
              ) {
                state.select(null);
                state.selectSurface(null);
              } else place(pointer);
            }
          }
        }}
        onTap={(event) => {
          if (event.target === stage.current || event.target.name() === 'room-floor') {
            const pointer = stage.current!.getRelativePointerPosition();
            if (pointer) {
              if (
                event.target === stage.current &&
                !state.placement &&
                !state.openingPlacement &&
                !ruler
              ) {
                state.select(null);
                state.selectSurface(null);
              } else place(pointer);
            }
          }
        }}
      >
        <Layer>
          <Line
            name="room-floor"
            points={polygon.flatMap((point) => [point.x, point.y])}
            closed
            fill={floorColours[layout.room.floorFinish]}
          />
          {grid && (
            <Group
              listening={false}
              clipFunc={(context) => {
                context.beginPath();
                polygon.forEach((point, index) =>
                  index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
                );
                context.closePath();
              }}
            >
              {['x', 'y'].flatMap((axis) =>
                Array.from(
                  {
                    length: Math.min(
                      501,
                      Math.ceil((axis === 'x' ? roomWidth : roomDepth) / 100) + 1,
                    ),
                  },
                  (_, index) => (
                    <Line
                      key={`${axis}${index}`}
                      points={
                        axis === 'x'
                          ? [index * 100, 0, index * 100, roomDepth]
                          : [0, index * 100, roomWidth, index * 100]
                      }
                      stroke="#ffffff"
                      opacity={0.13}
                      strokeWidth={0.5 / camera.scale}
                    />
                  ),
                ),
              )}
            </Group>
          )}
          {walls(layout.room).map((wall) => (
            <Group key={wall.id} id={`wall-${wall.id}`}>
              {(state.surface === wall.id ||
                selectedOpening?.wallId === wall.id ||
                state.openingPlacement) && (
                <Circle
                  x={wall.a.x}
                  y={wall.a.y}
                  radius={4 / camera.scale}
                  fill="#365d49"
                  listening={false}
                />
              )}
              <Line
                points={[
                  wall.a.x - wall.inward.x * 55,
                  wall.a.y - wall.inward.y * 55,
                  wall.b.x - wall.inward.x * 55,
                  wall.b.y - wall.inward.y * 55,
                ]}
                stroke={
                  state.surface === wall.id || selectedOpening?.wallId === wall.id
                    ? '#96b29f'
                    : (layout.room.wallColours[wall.id] ?? '#e6e3d8')
                }
                strokeWidth={110}
                hitStrokeWidth={Math.max(110, 20 / camera.scale)}
                onClick={(event) => {
                  event.cancelBubble = true;
                  placeOnWall(wall);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  placeOnWall(wall);
                }}
                onMouseEnter={() => {
                  if (stage.current)
                    stage.current.container().style.cursor = state.openingPlacement
                      ? 'crosshair'
                      : 'pointer';
                }}
                onMouseLeave={() => {
                  if (stage.current) stage.current.container().style.cursor = '';
                }}
              />
              <Line
                points={[wall.a.x, wall.a.y, wall.b.x, wall.b.y]}
                stroke="#6e7366"
                strokeWidth={2 / camera.scale}
                listening={false}
              />
              <Text
                x={(wall.a.x + wall.b.x) / 2 - (wall.inward.x === 0 ? 200 : 400)}
                y={
                  (wall.a.y + wall.b.y) / 2 -
                  (wall.inward.y > 0 ? 380 : wall.inward.y < 0 ? -220 : 40)
                }
                text={formatLength(wall.length, document.displayUnits, true)}
                fontSize={12 / camera.scale}
                fill="#676c5e"
                onClick={(event) => {
                  event.cancelBubble = true;
                  placeOnWall(wall);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  placeOnWall(wall);
                }}
              />
            </Group>
          ))}
          {layout.openings.map((opening) => {
            const wall = walls(layout.room).find((wall) => wall.id === opening.wallId)!;
            const unit = {
              x: (wall.b.x - wall.a.x) / wall.length,
              y: (wall.b.y - wall.a.y) / wall.length,
            };
            const start = {
                x: wall.a.x + unit.x * opening.offsetMm,
                y: wall.a.y + unit.y * opening.offsetMm,
              },
              end = {
                x: start.x + unit.x * opening.widthMm,
                y: start.y + unit.y * opening.widthMm,
              };
            return (
              <Group
                key={opening.id}
                id={opening.id}
                x={0}
                y={0}
                draggable={
                  !state.placement &&
                  !state.openingPlacement &&
                  !ruler &&
                  (size.width > 600 || state.selection === opening.id)
                }
                onClick={(event) => {
                  event.cancelBubble = true;
                  if (state.openingPlacement || state.placement || ruler) placeOnWall(wall);
                  else state.select(opening.id);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  if (state.openingPlacement || state.placement || ruler) placeOnWall(wall);
                  else state.select(opening.id);
                }}
                onDragStart={(event) => {
                  event.cancelBubble = true;
                  state.select(opening.id);
                  dragStart.current = { x: 0, y: 0 };
                  dragCancelled.current = false;
                  event.target.name('dragging-item');
                }}
                onDragMove={(event) => {
                  event.cancelBubble = true;
                  const offset = roundMm(
                    Math.max(
                      0,
                      Math.min(
                        wall.length - opening.widthMm,
                        opening.offsetMm + event.target.x() * unit.x + event.target.y() * unit.y,
                      ),
                    ),
                  );
                  event.target.position({
                    x: unit.x * (offset - opening.offsetMm),
                    y: unit.y * (offset - opening.offsetMm),
                  });
                }}
                onDragEnd={(event) => {
                  event.cancelBubble = true;
                  event.target.name('opening');
                  const offsetMm = roundMm(
                    opening.offsetMm + event.target.x() * unit.x + event.target.y() * unit.y,
                  );
                  if (!dragCancelled.current) state.updateOpening(opening.id, { offsetMm });
                  event.target.position({ x: 0, y: 0 });
                }}
              >
                {state.selection === opening.id && (
                  <Line
                    points={[start.x, start.y, end.x, end.y]}
                    stroke="#365d49"
                    strokeWidth={12 / camera.scale}
                    opacity={0.5}
                    listening={false}
                  />
                )}
                <Line
                  points={[start.x, start.y, end.x, end.y]}
                  stroke={
                    opening.type === 'window' ? '#c2d7d4' : floorColours[layout.room.floorFinish]
                  }
                  strokeWidth={100}
                  hitStrokeWidth={Math.max(100, 22 / camera.scale)}
                />
                {opening.type === 'door' ? (
                  <Line
                    points={doorSector(layout.room, opening).flatMap((point) => [point.x, point.y])}
                    closed
                    fill="#ffffff"
                    opacity={0.3}
                    stroke="#557664"
                    strokeWidth={1 / camera.scale}
                  />
                ) : (
                  <Line
                    points={[start.x, start.y, end.x, end.y]}
                    stroke="#749694"
                    strokeWidth={3 / camera.scale}
                  />
                )}
              </Group>
            );
          })}
          {[...layout.items]
            .sort((left, right) => Number(right.nonblocking) - Number(left.nonblocking))
            .map((item) => (
              <Group
                key={item.id}
                id={item.id}
                name="furniture-item"
                x={item.xMm}
                y={item.yMm}
                rotation={item.rotationDeg}
                draggable={
                  !state.placement &&
                  !state.openingPlacement &&
                  !ruler &&
                  (size.width > 600 || state.selection === item.id)
                }
                onClick={(event) => {
                  event.cancelBubble = true;
                  if (state.placement || state.openingPlacement || ruler) {
                    place(
                      stage.current?.getRelativePointerPosition() ?? { x: item.xMm, y: item.yMm },
                    );
                    return;
                  }
                  state.select(item.id);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  if (state.placement || state.openingPlacement || ruler) {
                    place(
                      stage.current?.getRelativePointerPosition() ?? { x: item.xMm, y: item.yMm },
                    );
                    return;
                  }
                  state.select(item.id);
                }}
                onDragStart={(event) => {
                  event.cancelBubble = true;
                  state.select(item.id);
                  dragStart.current = { x: item.xMm, y: item.yMm };
                  dragCancelled.current = false;
                  event.target.name('dragging-item');
                }}
                onDragMove={(event) => {
                  event.cancelBubble = true;
                  const bypass = 'altKey' in event.evt && event.evt.altKey;
                  const position = snapPosition(
                    item,
                    event.target.x(),
                    event.target.y(),
                    layout.room,
                    grid && !bypass,
                    wallSnap && !bypass,
                    1 / camera.scale,
                  );
                  event.target.position(position);
                }}
                onDragEnd={(event) => {
                  event.cancelBubble = true;
                  event.target.name('furniture-item');
                  if (!dragCancelled.current)
                    state.updateItem(item.id, { xMm: event.target.x(), yMm: event.target.y() });
                  else event.target.position({ x: item.xMm, y: item.yMm });
                }}
              >
                <FurnitureShape
                  item={item}
                  selected={state.selection === item.id}
                  scale={camera.scale}
                  units={document.displayUnits}
                />
              </Group>
            ))}
          {selectedItem && !state.placement && !ruler && (
            <RotationHandle item={selectedItem} scale={camera.scale} stage={stage} />
          )}
          {previewItem && (
            <Line
              points={footprint(previewItem).flatMap((point) => [point.x, point.y])}
              closed
              fill={previewItem.colour}
              opacity={0.5}
              stroke="#365d49"
              strokeWidth={2 / camera.scale}
              dash={[6 / camera.scale, 4 / camera.scale]}
              listening={false}
            />
          )}
          {rulerPoints.map((point, index) => (
            <Circle key={index} x={point.x} y={point.y} radius={5 / camera.scale} fill="#365d49" />
          ))}
          {rulerPoints.length === 2 && (
            <>
              <Line
                points={rulerPoints.flatMap((point) => [point.x, point.y])}
                stroke="#365d49"
                strokeWidth={2 / camera.scale}
                dash={[5 / camera.scale, 4 / camera.scale]}
              />
              <Text
                x={(rulerPoints[0].x + rulerPoints[1].x) / 2}
                y={(rulerPoints[0].y + rulerPoints[1].y) / 2 - 100}
                text={formatLength(distance(rulerPoints[0], rulerPoints[1]), document.displayUnits)}
                fontSize={12 / camera.scale}
                fill="#365d49"
              />
            </>
          )}
        </Layer>
      </Stage>
      {contextMenu && (
        <PlanContextMenu
          key={`${contextMenu.screen.x}-${contextMenu.screen.y}`}
          target={contextMenu}
          label={
            contextMenu.itemId
              ? (layout.items.find((item) => item.id === contextMenu.itemId)?.name ?? 'Furniture')
              : contextMenu.openingId
                ? (layout.openings.find((opening) => opening.id === contextMenu.openingId)?.type ??
                  'Opening')
                : contextMenu.wallId
                  ? `${contextMenu.wallId.replaceAll('-', ' ')} wall`
                  : 'Floor'
          }
          onClose={() => setContextMenu(null)}
          onAction={(action) => {
            const id = contextMenu.itemId ?? contextMenu.openingId;
            const wall = walls(layout.room).find((wall) => wall.id === contextMenu.wallId);
            if ((action === 'door' || action === 'window') && wall)
              state.addOpening(action, wall.id, openingOffsetAtPoint(wall, contextMenu.point, 900));
            if (action === 'edit') {
              if (id) state.select(id);
              else state.selectSurface(contextMenu.wallId ?? 'floor');
            }
            if (action === 'remove' && id) state.removeItem(id);
            if (action === 'copy' && contextMenu.itemId) state.duplicateItem(contextMenu.itemId);
            const item = layout.items.find((item) => item.id === contextMenu.itemId);
            if ((action === 'left' || action === 'right') && item)
              state.updateItem(item.id, {
                rotationDeg: item.rotationDeg + (action === 'left' ? -15 : 15),
              });
          }}
          onFurniture={(catalogId) => {
            const item = newItem(catalogId, contextMenu.point.x, contextMenu.point.y);
            const point = snapPosition(
              item,
              item.xMm,
              item.yMm,
              layout.room,
              grid,
              wallSnap,
              1 / camera.scale,
            );
            item.xMm = point.x;
            item.yMm = point.y;
            if (
              state.command('Place furniture', (_document, layout) => {
                layout.items.push(item);
              })
            )
              state.select(item.id);
          }}
        />
      )}
      {selectedItem && !state.placement && !ruler && (
        <div className="selection-toolbar" aria-label="Selected furniture actions">
          <strong>{selectedItem.name}</strong>
          <span>{Math.round(selectedItem.rotationDeg)}°</span>
          <button
            aria-label="Turn left 15 degrees"
            title="Turn left 15° (Shift + R)"
            onClick={() =>
              state.updateItem(selectedItem.id, { rotationDeg: selectedItem.rotationDeg - 15 })
            }
          >
            <RotateCcw size={17} />
          </button>
          <button
            aria-label="Turn right 15 degrees"
            title="Turn right 15° (R)"
            onClick={() =>
              state.updateItem(selectedItem.id, { rotationDeg: selectedItem.rotationDeg + 15 })
            }
          >
            <RotateCw size={17} />
          </button>
          <button
            aria-label="Turn 90 degrees"
            onClick={() =>
              state.updateItem(selectedItem.id, { rotationDeg: selectedItem.rotationDeg + 90 })
            }
          >
            90°
          </button>
          <button
            aria-label="Copy furniture"
            title="Copy"
            onClick={() => state.duplicateItem(selectedItem.id)}
          >
            <Copy size={17} />
          </button>
          <button
            aria-label="Remove furniture"
            title="Delete"
            onClick={() => state.removeItem(selectedItem.id)}
          >
            <Trash2 size={17} />
          </button>
        </div>
      )}
      {!state.selection &&
        !state.surface &&
        !state.placement &&
        !state.openingPlacement &&
        !ruler && (
          <p className="plan-instruction">Tap a part to edit. Right-click for quick actions.</p>
        )}
      <div className="canvas-tools">
        <button title="Zoom out" aria-label="Zoom out" onClick={() => zoom(0.8)}>
          <Minus size={18} />
        </button>
        <span>{Math.round(camera.scale * 1000)}%</span>
        <button title="Zoom in" aria-label="Zoom in" onClick={() => zoom(1.25)}>
          <Plus size={18} />
        </button>
        <i />
        <button title="Fit room" aria-label="Fit room" onClick={fit}>
          <Scan size={18} />
        </button>
        <button
          title="Measure between two points"
          aria-label="Point-to-point ruler"
          aria-pressed={ruler}
          onClick={() => {
            state.setPlacement(null);
            state.setOpeningPlacement(null);
            setRuler(!ruler);
            setRulerPoints([]);
          }}
        >
          <Ruler size={18} />
        </button>
        <button
          title="Snap furniture to 100 mm grid"
          aria-label="Grid snapping"
          aria-pressed={grid}
          onClick={() => setGrid(!grid)}
        >
          Grid
        </button>
        <button
          title="Snap furniture to nearby walls"
          aria-label="Wall snapping"
          aria-pressed={wallSnap}
          onClick={() => setWallSnap(!wallSnap)}
        >
          <Magnet size={18} />
        </button>
      </div>
      {(state.placement || state.openingPlacement || ruler) && (
        <div className="placement-hint">
          {state.placement
            ? 'Tap the room to place your piece'
            : state.openingPlacement
              ? `Tap a wall to place one ${state.openingPlacement}`
              : 'Tap two points to measure'}
          <button
            onClick={() => {
              state.setPlacement(null);
              state.setOpeningPlacement(null);
              setRuler(false);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      <span className="canvas-caption">
        INTERIOR MEASUREMENTS · {document.displayUnits === 'metric' ? 'METRIC' : 'IMPERIAL'}
      </span>
    </div>
  );
}
