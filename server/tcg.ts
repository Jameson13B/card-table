// TCGplayer's public (undocumented) marketplace endpoints. No key needed, but
// they can change without notice, so every caller keeps cached data on failure.

const DETAILS_URL = (id: number) => `https://mp-search-api.tcgplayer.com/v2/product/${id}/details`;
export const IMAGE_URL = (id: number, size: 'large' | 'small') =>
  `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_${size === 'large' ? '1000x1000' : '400x400'}.jpg`;

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (card-table catalog sync)', Accept: 'application/json' };

export interface TcgDetails {
  productId: number;
  productName: string;
  setName: string;
  setCode: string;
  number: string;
  rarity: string;
  productType: string;
  sealed: boolean;
  releaseDate: string;
  energyType: string[];
  marketPrice: number | null;
  fetchedAt: string;
}

export function productIdFromUrl(url: string): number | null {
  const m = /\/product\/(\d+)/.exec(url) ?? /^(\d+)$/.exec(url.trim());
  return m ? Number(m[1]) : null;
}

export async function fetchDetails(id: number): Promise<TcgDetails> {
  const res = await fetch(DETAILS_URL(id), { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`TCGplayer details ${id}: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error(`TCGplayer details ${id}: empty response`);
  const d = JSON.parse(text);
  const attrs = d.customAttributes ?? {};
  return {
    productId: id,
    productName: String(d.productName ?? ''),
    setName: String(d.setName ?? ''),
    setCode: String(d.setCode ?? ''),
    number: String(attrs.number ?? ''),
    rarity: String(d.rarityName ?? ''),
    productType: String(d.productTypeName ?? ''),
    sealed: Boolean(d.sealed),
    releaseDate: String(attrs.releaseDate ?? '').slice(0, 10),
    energyType: Array.isArray(attrs.energyType) ? attrs.energyType.map(String) : [],
    marketPrice: typeof d.marketPrice === 'number' && d.marketPrice > 0 ? d.marketPrice : null,
    fetchedAt: new Date().toISOString(),
  };
}

export async function downloadTo(url: string, dest: string): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  const res = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`image ${url}: HTTP ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
