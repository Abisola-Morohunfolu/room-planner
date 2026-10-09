import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  Armchair,
  DoorOpen,
  Square,
  Pencil,
  Copy,
  Trash2,
  RotateCw,
  RotateCcw,
  ArrowLeft,
  Palette,
} from 'lucide-react';
import { catalog, customCatalog } from '../domain/catalog';

export interface PlanMenuTarget {
  screen: { x: number; y: number };
  point: { x: number; y: number };
  itemId?: string;
  openingId?: string;
  wallId?: string;
}
export function PlanContextMenu({
  target,
  label,
  onClose,
  onAction,
  onFurniture,
}: {
  target: PlanMenuTarget;
  label: string;
  onClose: () => void;
  onAction: (action: 'edit' | 'door' | 'window' | 'copy' | 'remove' | 'left' | 'right') => void;
  onFurniture: (catalogId: string) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [furniture, setFurniture] = useState(false);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<CSSProperties>({
    left: target.screen.x,
    top: target.screen.y,
  });
  useLayoutEffect(() => {
    const bounds = menu.current?.getBoundingClientRect();
    if (!bounds) return;
    setPosition({
      left: Math.max(8, Math.min(target.screen.x, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(target.screen.y, window.innerHeight - bounds.height - 8)),
    });
    menu.current?.querySelector<HTMLElement>(furniture ? 'input' : '[role="menuitem"]')?.focus();
  }, [target.screen.x, target.screen.y, furniture]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  const action = (value: Parameters<typeof onAction>[0]) => {
    onAction(value);
    onClose();
  };
  return createPortal(
    <div
      ref={menu}
      className="plan-context-menu"
      style={position}
      role="menu"
      aria-label={`${label} quick actions`}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          window.document.querySelector<HTMLElement>('.floor-plan')?.focus();
        }
        if (
          ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) &&
          !(event.target instanceof HTMLInputElement)
        ) {
          event.preventDefault();
          const items = Array.from(
            menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
          );
          const current = items.indexOf(window.document.activeElement as HTMLButtonElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}
    >
      {furniture ? (
        <>
          <button role="menuitem" onClick={() => setFurniture(false)}>
            <ArrowLeft size={16} />
            Back
          </button>
          <input
            aria-label="Find furniture to add here"
            placeholder="Find furniture…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[1]?.focus();
              }
            }}
          />
          {[...catalog, ...customCatalog]
            .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
            .map((item) => (
              <button
                role="menuitem"
                key={item.id}
                onClick={() => {
                  onFurniture(item.id);
                  onClose();
                }}
              >
                <Armchair size={16} />
                {item.name}
              </button>
            ))}
          {![...catalog, ...customCatalog].some((item) =>
            item.name.toLowerCase().includes(search.toLowerCase()),
          ) && <p>No matching pieces.</p>}
        </>
      ) : (
        <>
          <p>{label}</p>
          <button role="menuitem" onClick={() => action('edit')}>
            {target.itemId || target.openingId ? <Pencil size={16} /> : <Palette size={16} />}{' '}
            {target.itemId || target.openingId
              ? 'Edit dimensions & details'
              : 'Edit finishes & details'}
          </button>
          {target.wallId && !target.openingId && (
            <>
              <button role="menuitem" onClick={() => action('door')}>
                <DoorOpen size={16} />
                Add door here
              </button>
              <button role="menuitem" onClick={() => action('window')}>
                <Square size={16} />
                Add window here
              </button>
            </>
          )}
          <button role="menuitem" aria-haspopup="menu" onClick={() => setFurniture(true)}>
            <Armchair size={16} />
            Add furniture here
          </button>
          {target.itemId && (
            <>
              <div className="context-menu-rule" />
              <button role="menuitem" onClick={() => action('left')}>
                <RotateCcw size={16} />
                Turn left 15°
              </button>
              <button role="menuitem" onClick={() => action('right')}>
                <RotateCw size={16} />
                Turn right 15°
              </button>
              <button role="menuitem" onClick={() => action('copy')}>
                <Copy size={16} />
                Duplicate
              </button>
            </>
          )}
          {(target.itemId || target.openingId) && (
            <>
              <div className="context-menu-rule" />
              <button role="menuitem" className="danger" onClick={() => action('remove')}>
                <Trash2 size={16} />
                Remove {target.openingId ? 'opening' : 'furniture'}
              </button>
            </>
          )}
        </>
      )}
    </div>,
    window.document.body,
  );
}
