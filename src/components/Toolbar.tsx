import type { Filters, Kind, PriceBand, Sort } from '../lib.ts';
import { DEFAULT_FILTERS, isFiltering } from '../lib.ts';

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  matching: number;
  total: number;
}

const KINDS: [Kind, string][] = [
  ['all', 'Everything'],
  ['sealed', 'Sealed'],
  ['singles', 'Singles'],
];
const BANDS: [PriceBand, string][] = [
  ['any', 'Any price'],
  ['u25', 'Under $25'],
  ['25-100', '$25–100'],
  ['100+', '$100+'],
];

export function Toolbar({ filters, onChange, matching, total }: Props) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  const active = isFiltering(filters);

  return (
    <div className="toolbar" role="search">
      <label className="search">
        <span className="sr-only">Search the table</span>
        <svg viewBox="0 0 24 24" aria-hidden width="18" height="18">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search: charizard, 151, PSA…"
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
        />
      </label>

      <div className="seg" role="group" aria-label="Show">
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filters.kind === k} onClick={() => set('kind', k)}>
            {label}
          </button>
        ))}
      </div>

      <label className="select">
        <span className="sr-only">Price</span>
        <select value={filters.price} onChange={(e) => set('price', e.target.value as PriceBand)}>
          {BANDS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="select">
        <span className="sr-only">Sort</span>
        <select value={filters.sort} onChange={(e) => set('sort', e.target.value as Sort)}>
          <option value="featured">Featured</option>
          <option value="price-desc">Price: high → low</option>
          <option value="price-asc">Price: low → high</option>
          <option value="newest">Newest sets</option>
        </select>
      </label>

      <label className="toggle">
        <input type="checkbox" checked={filters.tradeOnly} onChange={(e) => set('tradeOnly', e.target.checked)} />
        <span>Trade only</span>
      </label>

      <p className={`match-count${active ? ' is-on' : ''}`} aria-live="polite">
        {active ? (
          <>
            {matching} of {total} match{' '}
            <button type="button" className="link" onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })}>
              clear
            </button>
          </>
        ) : (
          `${total} items on the table`
        )}
      </p>
    </div>
  );
}
