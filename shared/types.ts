// Types shared by the sync script, the API server and the frontend.

export type Section = 'sealed' | 'showcase' | 'bulk';
export type Status = 'available' | 'pending' | 'sold';

export interface SiteInfo {
  name: string;
  tagline: string;
  email: string;
}

/** Everything we know about an item. Lives in data/catalog.json (server side only). */
export interface CatalogItem {
  id: string;
  productId: number;
  tcgUrl: string;
  section: Section;
  name: string;
  number: string;
  set: string;
  setCode: string;
  rarity: string;
  productType: string;
  sealed: boolean;
  releaseDate: string;
  energyType: string[];
  image: string;
  imageSmall: string;
  condition: string;
  graded: string;
  trade: boolean;
  qty: number;
  status: Status;
  notes: string;
  /** Your asking price from inventory.yaml. */
  myPrice: number | null;
  /** TCGplayer market price at sync time (the server refreshes this daily). */
  marketPrice: number | null;
  /** If true, always use myPrice and ignore the market. */
  lockPrice: boolean;
}

/** Something you're looking to buy (the "Buying" sign). */
export interface WantedItem {
  id: string;
  kind: 'single' | 'sealed';
  name: string;
  /** Set · number, when we know it from TCGplayer. */
  detail: string;
  image: string;
  tcgUrl: string;
  note: string;
}

export interface Catalog {
  site: SiteInfo;
  syncedAt: string;
  items: CatalogItem[];
  wanted: WantedItem[];
}

/** What the browser receives: one price, no breakdown. */
export type PublicItem = Omit<CatalogItem, 'myPrice' | 'marketPrice' | 'lockPrice'> & {
  price: number | null;
};

export interface PublicCatalog {
  site: SiteInfo;
  items: PublicItem[];
  wanted: WantedItem[];
}

/** cash/trade/either: they want your stuff. sell: they have something you want. */
export type Intent = 'cash' | 'trade' | 'either' | 'sell';

export interface InquiryRequest {
  name: string;
  contact: string;
  intent: Intent;
  message: string;
  itemIds: string[];
  /** Honeypot: real people leave this empty. */
  website?: string;
}

/** The single displayed price: the higher of your price and the market price. */
export function finalPrice(myPrice: number | null, marketPrice: number | null, lockPrice = false): number | null {
  if (lockPrice && myPrice != null) return roundPrice(myPrice);
  const candidates = [myPrice, marketPrice].filter((p): p is number => typeof p === 'number' && p > 0);
  if (!candidates.length) return null;
  return roundPrice(Math.max(...candidates));
}

function roundPrice(p: number): number {
  // Whole dollars read like a sticker at a show; keep cents under $5.
  return p >= 5 ? Math.round(p) : Math.round(p * 100) / 100;
}

export function formatPrice(p: number | null): string {
  if (p == null) return 'Make offer';
  return p >= 5 ? `$${p.toLocaleString('en-US')}` : `$${p.toFixed(2)}`;
}
