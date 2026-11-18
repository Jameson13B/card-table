import { useEffect, useRef, useState } from 'react';
import type { PublicItem } from '../../shared/types.ts';
import { PriceSticker, StatusTape, TradeSticker, itemAria, tiltFor } from './ItemArt.tsx';
import { useDialog } from './useDialog.ts';

interface Props {
  items: PublicItem[];
  total: number;
  filtering: boolean;
  inPile: (id: string) => boolean;
  onPick: (item: PublicItem, from: HTMLElement) => void;
  onClose: () => void;
  covered: boolean;
}

const VISIBLE = 4; // cards shown on each side of the one you're looking at

/** The hits box, opened: thumb through the cards like a real box. */
export function BulkFlip({ items, total, filtering, inPile, onPick, onClose, covered }: Props) {
  const [current, setCurrent] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  useDialog(ref, onClose, !covered);

  const clamp = (n: number) => Math.max(0, Math.min(items.length - 1, n));
  useEffect(() => setCurrent((c) => clamp(c)), [items.length]);

  useEffect(() => {
    if (covered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrent((c) => clamp(c + 1));
      if (e.key === 'ArrowLeft') setCurrent((c) => clamp(c - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const wheelLock = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 8 || Date.now() - wheelLock.current < 140) return;
    wheelLock.current = Date.now();
    setCurrent((c) => clamp(c + Math.sign(d)));
  };

  return (
    <div className="overlay overlay-bulk" role="dialog" aria-modal="true" aria-label="Hits box" ref={ref}>
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="bulk-flip">
        <header className="bulk-flip-head">
          <h2>Hits box</h2>
          <p>
            {filtering ? `${items.length} of ${total} cards match your filters` : `${total} cards`} · swipe, scroll or use ← →
          </p>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close hits box">
            ×
          </button>
        </header>

        {items.length === 0 ? (
          <p className="empty">Nothing in the box matches. Try clearing your filters.</p>
        ) : (
          <>
            <div
              className="fan"
              onWheel={onWheel}
              onPointerDown={(e) => (drag.current = { x: e.clientX, moved: false })}
              onPointerMove={(e) => {
                if (!drag.current) return;
                const dx = e.clientX - drag.current.x;
                if (Math.abs(dx) > 50) {
                  setCurrent((c) => clamp(c - Math.sign(dx)));
                  drag.current = { x: e.clientX, moved: true };
                }
              }}
              onPointerUp={() => setTimeout(() => (drag.current = null))}
              onPointerLeave={() => (drag.current = null)}
            >
              {items.map((item, i) => {
                const offset = i - current;
                if (Math.abs(offset) > VISIBLE) return null;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`fan-card${offset === 0 ? ' is-current' : ''}${item.status === 'sold' ? ' is-sold' : ''}`}
                    style={{ '--o': offset, '--abs': Math.abs(offset) } as React.CSSProperties}
                    aria-label={offset === 0 ? `Pick up ${itemAria(item)}` : `Go to ${item.name}`}
                    tabIndex={offset === 0 ? 0 : -1}
                    onClick={(e) => {
                      if (drag.current?.moved) return;
                      if (offset === 0) onPick(item, e.currentTarget.querySelector('img') ?? e.currentTarget);
                      else setCurrent(i);
                    }}
                  >
                    <img src={item.imageSmall} alt="" draggable={false} />
                    <StatusTape status={item.status} />
                    {offset === 0 && (
                      <span className="stickers">
                        <PriceSticker price={item.price} tilt={tiltFor(item.id)} />
                        {item.trade && item.status !== 'sold' && <TradeSticker />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="fan-caption" aria-live="polite">
              <strong>{items[current]?.name}</strong>
              <span>
                {items[current]?.number && `#${items[current].number} · `}
                {items[current]?.set}
                {items[current] && inPile(items[current].id) ? ' · in your pile' : ''}
              </span>
              <span className="fan-count">
                {current + 1} / {items.length}
              </span>
            </div>

            <div className="fan-controls">
              <button type="button" className="btn" onClick={() => setCurrent((c) => clamp(c - 1))} disabled={current === 0}>
                ← Prev
              </button>
              <input
                type="range"
                min={0}
                max={items.length - 1}
                value={current}
                onChange={(e) => setCurrent(Number(e.target.value))}
                aria-label="Position in box"
              />
              <button
                type="button"
                className="btn"
                onClick={() => setCurrent((c) => clamp(c + 1))}
                disabled={current === items.length - 1}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
