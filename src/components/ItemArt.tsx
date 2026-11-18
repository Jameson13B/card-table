import type { PublicItem } from '../../shared/types.ts';
import { formatPrice } from '../../shared/types.ts';

/** How an item physically sits on the table: sealed box, graded slab or toploader. */
export function ItemArt({ item, large = false }: { item: PublicItem; large?: boolean }) {
  const src = large ? item.image : item.imageSmall;
  if (item.sealed) {
    return <img className="art-sealed" src={src} alt="" loading="lazy" draggable={false} />;
  }
  if (item.graded) {
    const [company, ...grade] = item.graded.split(/\s+/);
    return (
      <div className="art-slab">
        <div className="slab-label">
          <span className="slab-co">{company}</span>
          <span className="slab-name">{item.name}</span>
          <span className="slab-grade">{grade.join(' ')}</span>
        </div>
        <div className="slab-well">
          <img src={src} alt="" loading="lazy" draggable={false} />
        </div>
      </div>
    );
  }
  return (
    <div className="art-toploader">
      <img src={src} alt="" loading="lazy" draggable={false} />
    </div>
  );
}

export function PriceSticker({ price, tilt = 0 }: { price: number | null; tilt?: number }) {
  return (
    <span className={`sticker-price${price == null ? ' is-offer' : ''}`} style={{ '--tilt': `${tilt}deg` } as React.CSSProperties}>
      {formatPrice(price)}
    </span>
  );
}

export function TradeSticker() {
  return (
    <span className="sticker-trade" title="Open to trades">
      TRADE <span aria-hidden>✓</span>
    </span>
  );
}

export function StatusTape({ status }: { status: PublicItem['status'] }) {
  if (status === 'available') return null;
  return <span className={`tape tape-${status}`}>{status === 'sold' ? 'SOLD' : 'ON HOLD'}</span>;
}

/** Small deterministic "hand-placed" tilt so stickers don't look machine-aligned. */
export function tiltFor(id: string, range = 6): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 2 * range;
}

export function itemAria(item: PublicItem): string {
  const status = item.status === 'sold' ? ', sold' : item.status === 'pending' ? ', on hold' : '';
  return `${item.name}${item.number ? ` ${item.number}` : ''}, ${formatPrice(item.price)}${item.trade ? ', open to trades' : ''}${status}`;
}
