import type { PublicItem } from '../../shared/types.ts';
import { formatPrice } from '../../shared/types.ts';
import { TableItem } from './TableItem.tsx';

interface Props {
  sealed: PublicItem[];
  showcase: PublicItem[];
  bulk: PublicItem[];
  bulkMatching: number;
  filtering: boolean;
  isMatch: (item: PublicItem) => boolean;
  inPile: (id: string) => boolean;
  onPick: (item: PublicItem, from: HTMLElement) => void;
  onOpenBulk: () => void;
  tableName: string;
}

export function Table(props: Props) {
  const { sealed, showcase, bulk, bulkMatching, filtering, isMatch, inPile, onPick, onOpenBulk, tableName } = props;
  // While filtering, a section with nothing matching folds down to a strip so
  // the matches aren't buried below a shelf of faded items.
  const folded = (items: PublicItem[]) => filtering && !items.some(isMatch);
  const renderItems = (items: PublicItem[]) =>
    items.map((item) => (
      <TableItem key={item.id} item={item} dimmed={!isMatch(item)} inPile={inPile(item.id)} onPick={onPick} />
    ));

  return (
    <section className="table" aria-label="The table">
      <div className="cloth">
        {sealed.length > 0 && (
          <div className="zone zone-sealed">
            <h2 className="zone-label">Sealed</h2>
            {folded(sealed) ? (
              <p className="zone-folded">No sealed product matches</p>
            ) : (
              <div className="riser">
                <div className="tier">{renderItems(sealed)}</div>
              </div>
            )}
          </div>
        )}

        <div className="zone-row">
          {showcase.length > 0 && (
            <div className="zone zone-showcase">
              <h2 className="zone-label">Showcase</h2>
              {folded(showcase) ? (
                <p className="zone-folded">Nothing in the case matches</p>
              ) : (
                <div className="glass-case">
                  <div className="case-grid">{renderItems(showcase)}</div>
                  <div className="glass-sheen" aria-hidden />
                </div>
              )}
            </div>
          )}

          {bulk.length > 0 && <BulkBox items={bulk} matching={bulkMatching} onOpen={onOpenBulk} />}
        </div>
      </div>
      <div className="cloth-drape" aria-hidden>
        <span>{tableName}</span>
      </div>
    </section>
  );
}

function BulkBox({ items, matching, onOpen }: { items: PublicItem[]; matching: number; onOpen: () => void }) {
  const prices = items.map((i) => i.price).filter((p): p is number => p != null);
  const low = prices.length ? Math.min(...prices) : null;
  const peeks = items.slice(0, 14);
  const filtered = matching < items.length;

  return (
    <div className="zone zone-bulk">
      <h2 className="zone-label">Hits box</h2>
      <button
        type="button"
        className={`bulk-box${matching === 0 ? ' is-dimmed' : ''}`}
        onClick={onOpen}
        aria-label={`Flip through the hits box: ${filtered ? `${matching} of ` : ''}${items.length} cards`}
      >
        <span className="bulk-cards" aria-hidden>
          {peeks.map((item, i) => (
            <span key={item.id} className="bulk-peek" style={{ '--i': i, '--n': peeks.length } as React.CSSProperties}>
              <img src={item.imageSmall} alt="" loading="lazy" draggable={false} />
            </span>
          ))}
        </span>
        <span className="bulk-front">
          <span className="bulk-label">
            <strong>HITS</strong>
            <span>{items.length} cards</span>
            {low != null && <span>from {formatPrice(low)}</span>}
          </span>
          <span className="bulk-cta">{filtered ? `${matching} match · flip through →` : 'Flip through →'}</span>
        </span>
      </button>
    </div>
  );
}
