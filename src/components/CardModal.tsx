import { useLayoutEffect, useRef } from 'react';
import type { PublicItem } from '../../shared/types.ts';
import { formatPrice } from '../../shared/types.ts';
import { gsap, mailtoHref, reducedMotion, subtitle } from '../lib.ts';
import { useDeviceTilt } from '../useDeviceTilt.ts';
import { ItemArt, StatusTape, TradeSticker } from './ItemArt.tsx';
import { useDialog } from './useDialog.ts';

interface Props {
  item: PublicItem;
  from: HTMLElement | null;
  inPile: boolean;
  email: string;
  tableName: string;
  onAdd: (item: PublicItem, from: HTMLElement) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

/** You picked something up off the table. */
export function CardModal({ item, from, inPile, email, tableName, onAdd, onRemove, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose);

  // Lift the card from where it sat on the table into your hand.
  useLayoutEffect(() => {
    const el = holder.current;
    const root = ref.current;
    if (!el || !root) return;
    const tl = gsap.timeline();
    tl.from(root.querySelector('.overlay-backdrop'), { opacity: 0, duration: 0.25 }, 0);
    tl.from(root.querySelector('.modal-details'), { opacity: 0, x: 24, duration: 0.35, ease: 'power2.out' }, 0.12);
    if (from?.isConnected && !reducedMotion()) {
      const a = from.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      tl.from(
        el,
        {
          x: a.left + a.width / 2 - (b.left + b.width / 2),
          y: a.top + a.height / 2 - (b.top + b.height / 2),
          scale: Math.max(0.15, a.width / b.width),
          rotation: -4,
          duration: 0.5,
          ease: 'power3.out',
        },
        0,
      );
    }
    // revert(), not kill(): kill leaves the from() start state (shrunk card,
    // hidden details) on the elements, so React StrictMode's dev re-run then
    // animated from hidden to hidden and the card stayed tiny with no details.
    return () => {
      tl.revert();
    };
  }, [from]);

  // Tilt toward the pointer (desktop) or with the phone itself (mobile),
  // with a holo glare that follows it.
  const motionOk = !reducedMotion();
  const tilt = useRef<{ rx: gsap.QuickToFunc; ry: gsap.QuickToFunc } | null>(null);
  useLayoutEffect(() => {
    if (!art.current || !motionOk) return;
    gsap.set(art.current, { transformPerspective: 900 });
    tilt.current = {
      rx: gsap.quickTo(art.current, 'rotationX', { duration: 0.4, ease: 'power3' }),
      ry: gsap.quickTo(art.current, 'rotationY', { duration: 0.4, ease: 'power3' }),
    };
  }, [motionOk]);

  const applyTilt = (px: number, py: number, glare: number) => {
    const el = art.current;
    if (!el) return;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.setProperty('--glare', String(glare));
    tilt.current?.ry((px - 0.5) * 22);
    tilt.current?.rx((0.5 - py) * 22);
  };

  const device = useDeviceTilt(motionOk, applyTilt);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !art.current) return;
    const r = art.current.getBoundingClientRect();
    applyTilt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, 1);
  };
  const onLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    art.current?.style.setProperty('--glare', '0');
    tilt.current?.rx(0);
    tilt.current?.ry(0);
  };

  const sold = item.status === 'sold';
  const facts: [string, string][] = [
    ['Set', [item.set, item.setCode && `(${item.setCode})`].filter(Boolean).join(' ')],
    ['Number', item.number],
    ['Rarity', item.rarity],
    [item.graded ? 'Grade' : 'Condition', item.graded || item.condition],
    ['Released', item.releaseDate],
    ['Quantity', item.qty > 1 ? `${item.qty} available` : ''],
  ];

  return (
    <div className="overlay overlay-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}>
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal-art" ref={holder} onPointerMove={onMove} onPointerLeave={onLeave}>
          <div className={`held${item.sealed ? ' held-sealed' : ''}`} ref={art}>
            <ItemArt item={item} large />
            {!item.sealed && <span className="holo" aria-hidden />}
            <StatusTape status={item.status} />
          </div>
          {device.needsTap && (
            <button type="button" className="tilt-prompt" onClick={device.request}>
              ✨ Tilt to see the shine
            </button>
          )}
        </div>

        <div className="modal-details">
          <button type="button" className="btn-close" onClick={onClose} aria-label="Put it back">
            ×
          </button>
          <p className="eyebrow">{item.sealed ? item.productType || 'Sealed product' : item.graded ? 'Graded card' : 'Single'}</p>
          <h2 id="modal-title">{item.name}</h2>
          <p className="modal-sub">{subtitle(item)}</p>

          <div className="modal-price">
            <span className="big-price">{formatPrice(item.price)}</span>
            {item.trade && !sold && <TradeSticker />}
          </div>

          <dl className="facts">
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>

          {item.notes && <p className="notes">“{item.notes}”</p>}

          <div className="modal-actions">
            {sold ? (
              <p className="sold-note">This one’s already sold.</p>
            ) : inPile ? (
              <button type="button" className="btn btn-ghost" onClick={() => onRemove(item.id)}>
                ✓ In your pile · remove
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                data-autofocus
                onClick={() => onAdd(item, art.current?.querySelector('img') ?? art.current!)}
              >
                Add to pile
              </button>
            )}
            {email && !sold && (
              <a className="btn btn-ghost" href={mailtoHref(email, [item], tableName)}>
                Ask about this
              </a>
            )}
          </div>
          {item.status === 'pending' && <p className="hint">Someone has this on hold. Add it to your pile and I’ll let you know if it frees up.</p>}
        </div>
      </div>
    </div>
  );
}
