import type { PublicItem } from '../../shared/types.ts';
import { ItemArt, PriceSticker, StatusTape, TradeSticker, itemAria, tiltFor } from './ItemArt.tsx';

interface Props {
  item: PublicItem;
  dimmed: boolean;
  inPile: boolean;
  onPick: (item: PublicItem, from: HTMLElement) => void;
}

/** One thing on the table you can pick up: used by the shelf and the showcase. */
export function TableItem({ item, dimmed, inPile, onPick }: Props) {
  const kind = item.sealed ? 'sealed' : item.graded ? 'slab' : 'single';
  return (
    <button
      type="button"
      className={`table-item kind-${kind}${dimmed ? ' is-dimmed' : ''}${item.status === 'sold' ? ' is-sold' : ''}`}
      data-flip-id={item.id}
      aria-label={itemAria(item)}
      tabIndex={dimmed ? -1 : 0}
      onClick={(e) => onPick(item, e.currentTarget.querySelector('img') ?? e.currentTarget)}
    >
      <span className="lift">
        <ItemArt item={item} />
        <StatusTape status={item.status} />
        {inPile && <span className="in-pile-tag">In your pile</span>}
      </span>
      <span className="stickers">
        <PriceSticker price={item.price} tilt={tiltFor(item.id)} />
        {item.trade && item.status !== 'sold' && <TradeSticker />}
        {item.qty > 1 && <span className="sticker-qty">×{item.qty}</span>}
      </span>
    </button>
  );
}
