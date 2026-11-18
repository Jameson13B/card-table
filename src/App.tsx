import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PublicCatalog, PublicItem, WantedItem } from '../shared/types.ts';
import { BulkFlip } from './components/BulkFlip.tsx';
import { CardModal } from './components/CardModal.tsx';
import { PileButton, PileDrawer } from './components/Pile.tsx';
import { Table } from './components/Table.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { WantedSign } from './components/WantedSign.tsx';
import type { Filters } from './lib.ts';
import { DEFAULT_FILTERS, Flip, gsap, isFiltering, loadCatalog, matches, reducedMotion, sortItems } from './lib.ts';
import { usePile } from './usePile.ts';

export function App() {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [picked, setPicked] = useState<{ item: PublicItem; from: HTMLElement } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pileOpen, setPileOpen] = useState(false);
  const [sell, setSell] = useState<{ message: string } | null>(null);
  const wantedRef = useRef<HTMLElement>(null);
  const pile = usePile();
  const pileButton = useRef<HTMLButtonElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);

  useEffect(() => {
    loadCatalog()
      .then((c) => {
        setCatalog(c);
        document.title = c.site.name;
        // Drop pile entries for items that are no longer on the table.
        pile.setIds((ids) => ids.filter((id) => c.items.some((i) => i.id === id)));
      })
      .catch(() => setError('The table isn’t set up right now. Check back soon!'));
  }, []);

  const items = catalog?.items ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const isMatch = useCallback((i: PublicItem) => matches(i, filters), [filters]);
  const filtering = isFiltering(filters);
  const section = (s: PublicItem['section']) =>
    sortItems(items.filter((i) => i.section === s), filters.sort, filtering ? isMatch : undefined);
  const sealed = section('sealed');
  const showcase = section('showcase');
  const bulk = section('bulk');
  const bulkMatches = bulk.filter(isMatch);
  const pileItems = pile.ids.map((id) => byId.get(id)).filter((i): i is PublicItem => Boolean(i));

  // Re-sorting and filtering slide items to their new spots instead of jumping.
  const changeFilters = (next: Filters) => {
    if (!reducedMotion()) flipState.current = Flip.getState('[data-flip-id]');
    setFilters(next);
  };
  useLayoutEffect(() => {
    if (!flipState.current) return;
    Flip.from(flipState.current, { duration: 0.45, ease: 'power2.inOut', stagger: 0.01 });
    flipState.current = null;
  }, [filters]);

  // Adding to the pile: a copy of the card flies into the stack.
  const addToPile = (item: PublicItem, from: HTMLElement) => {
    pile.add(item.id);
    const target = pileButton.current;
    if (!target || reducedMotion()) return;
    const a = from.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const ghost = (from instanceof HTMLImageElement ? from.cloneNode() : document.createElement('div')) as HTMLElement;
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${a.left}px`,
      top: `${a.top}px`,
      width: `${a.width}px`,
      height: `${a.height}px`,
      zIndex: '1000',
      pointerEvents: 'none',
      borderRadius: '4%',
      objectFit: 'contain',
    });
    document.body.appendChild(ghost);
    gsap
      .timeline({ onComplete: () => ghost.remove() })
      .to(ghost, {
        left: b.left + 10,
        top: b.top + 4,
        width: 34,
        height: 48,
        rotation: 12,
        duration: 0.6,
        ease: 'power2.in',
      })
      .to(ghost, { opacity: 0, duration: 0.1 })
      .fromTo(target, { scale: 1.12 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' }, '-=0.1');
  };

  const haveOne = (w: WantedItem | null) => {
    setSell({ message: w ? `Hi! I have: ${w.name}${w.detail ? ` (${w.detail})` : ''}\n\n` : '' });
    setPileOpen(true);
  };
  const closeDrawer = () => {
    setPileOpen(false);
    setSell(null);
  };

  if (error) return <div className="state-msg">{error}</div>;
  if (!catalog) return <div className="state-msg">Setting up the table…</div>;

  const site = catalog.site;
  const matching = items.filter(isMatch).length;
  const wanted = catalog.wanted ?? [];

  return (
    <div className="hall">
      <header className="banner-wrap">
        <div className="banner">
          <span className="grommet" aria-hidden />
          <span className="grommet" aria-hidden />
          <h1>{site.name}</h1>
          {site.tagline && <p>{site.tagline}</p>}
        </div>
        <div className="banner-actions">
          {wanted.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-buying"
              onClick={() => wantedRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })}
            >
              We’re buying
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setPileOpen(true)}>
            Contact
          </button>
        </div>
      </header>

      <Toolbar filters={filters} onChange={changeFilters} matching={matching} total={items.length} />

      <main>
        {items.length === 0 ? (
          <p className="state-msg">The table’s empty right now. New stuff coming soon!</p>
        ) : (
          <Table
            sealed={sealed}
            showcase={showcase}
            bulk={bulk}
            bulkMatching={bulkMatches.length}
            filtering={filtering}
            isMatch={isMatch}
            inPile={pile.has}
            onPick={(item, from) => setPicked({ item, from })}
            onOpenBulk={() => setBulkOpen(true)}
            tableName={site.name}
          />
        )}
        {wanted.length > 0 && <WantedSign wanted={wanted} onHaveOne={haveOne} ref={wantedRef} />}
        <p className="footnote">
          Prices are for cash. Trades welcome on anything with a <span className="mini-trade">TRADE ✓</span> sticker. No
          online checkout: build a pile and send it over.
        </p>
      </main>

      <PileButton ref={pileButton} items={pileItems} onOpen={() => setPileOpen(true)} />

      {bulkOpen && (
        <BulkFlip
          items={bulkMatches}
          total={bulk.length}
          filtering={filtering}
          inPile={pile.has}
          onPick={(item, from) => setPicked({ item, from })}
          onClose={() => setBulkOpen(false)}
          covered={Boolean(picked)}
        />
      )}

      {picked && (
        <CardModal
          key={picked.item.id}
          item={picked.item}
          from={picked.from}
          inPile={pile.has(picked.item.id)}
          email={site.email}
          tableName={site.name}
          onAdd={addToPile}
          onRemove={pile.remove}
          onClose={() => setPicked(null)}
        />
      )}

      {pileOpen && (
        <PileDrawer
          items={pileItems}
          email={site.email}
          tableName={site.name}
          onRemove={pile.remove}
          onClear={pile.clear}
          onClose={closeDrawer}
          sell={sell}
        />
      )}
    </div>
  );
}
