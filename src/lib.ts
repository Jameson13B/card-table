import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import type { InquiryRequest, PublicCatalog, PublicItem } from '../shared/types.ts';
import { formatPrice } from '../shared/types.ts';

gsap.registerPlugin(Flip);
export { gsap, Flip };

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── API ──────────────────────────────────────────────────────────────────
export async function loadCatalog(): Promise<PublicCatalog> {
  const res = await fetch('/api/catalog');
  if (!res.ok) throw new Error(`Catalog HTTP ${res.status}`);
  return res.json();
}

export async function sendInquiry(req: InquiryRequest): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'Couldn’t reach the table. Please use email instead.' };
  }
}

// ── Display helpers ──────────────────────────────────────────────────────
export function subtitle(item: PublicItem): string {
  return [item.number && `#${item.number}`, item.set].filter(Boolean).join(' · ');
}

export function conditionLabel(item: PublicItem): string {
  return item.graded || item.condition;
}

export function itemLine(item: PublicItem): string {
  const bits = [subtitle(item), conditionLabel(item)].filter(Boolean).join(' · ');
  return `${item.name}${bits ? ` (${bits})` : ''}: ${formatPrice(item.price)}`;
}

export function mailtoHref(email: string, items: PublicItem[], tableName: string): string {
  const subject = items.length === 1 ? `${tableName}: ${items[0].name}` : `${tableName}: ${items.length} items`;
  const total = items.reduce((s, i) => s + (i.price ?? 0), 0);
  const body = [
    'Hi! I’m interested in:',
    '',
    ...items.map((i) => `• ${itemLine(i)}`),
    '',
    items.length > 1 && total ? `Pile total: ${formatPrice(total)}` : '',
    '',
    'Looking to: buy / trade (circle one)',
    '',
  ].join('\n');
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ── Filters ──────────────────────────────────────────────────────────────
export type Kind = 'all' | 'sealed' | 'singles';
export type PriceBand = 'any' | 'u25' | '25-100' | '100+';
export type Sort = 'featured' | 'price-desc' | 'price-asc' | 'newest';

export interface Filters {
  q: string;
  kind: Kind;
  price: PriceBand;
  tradeOnly: boolean;
  sort: Sort;
}

export const DEFAULT_FILTERS: Filters = { q: '', kind: 'all', price: 'any', tradeOnly: false, sort: 'featured' };

export function isFiltering(f: Filters): boolean {
  return Boolean(f.q.trim()) || f.kind !== 'all' || f.price !== 'any' || f.tradeOnly;
}

export function matches(item: PublicItem, f: Filters): boolean {
  if (f.kind === 'sealed' && !item.sealed) return false;
  if (f.kind === 'singles' && item.sealed) return false;
  if (f.tradeOnly && !item.trade) return false;
  const p = item.price;
  if (f.price === 'u25' && !(p != null && p < 25)) return false;
  if (f.price === '25-100' && !(p != null && p >= 25 && p <= 100)) return false;
  if (f.price === '100+' && !(p != null && p > 100)) return false;
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = [item.name, item.set, item.setCode, item.number, item.rarity, item.graded, ...item.energyType]
      .join(' ')
      .toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** Sold items sink to the end; while filtering, matches rise to the front. */
export function sortItems(items: PublicItem[], sort: Sort, isMatch?: (i: PublicItem) => boolean): PublicItem[] {
  const sold = (i: PublicItem) => (i.status === 'sold' ? 1 : 0);
  const miss = (i: PublicItem) => (isMatch && !isMatch(i) ? 1 : 0);
  const out = [...items];
  const by: Record<Sort, (a: PublicItem, b: PublicItem) => number> = {
    featured: () => 0,
    'price-desc': (a, b) => (b.price ?? -1) - (a.price ?? -1),
    'price-asc': (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    newest: (a, b) => b.releaseDate.localeCompare(a.releaseDate),
  };
  return out.sort((a, b) => miss(a) - miss(b) || sold(a) - sold(b) || by[sort](a, b));
}
