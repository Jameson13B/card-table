// Reads inventory.yaml, pulls product info + images from TCGplayer, and writes
// data/catalog.json. Results are cached in data/tcg-cache.json, so a failed
// fetch (or no network) falls back to the last good data.
//
//   npm run sync               refresh anything older than a day
//   npm run sync -- --refresh  refetch everything (and redo image cutouts)
//   npm run sync -- --offline  never hit the network (cache only)
//   npm run sync -- --strict   exit non-zero if anything had a problem

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Catalog, CatalogItem, Section, SiteInfo, Status, WantedItem } from '../shared/types.ts';
import { IMAGE_URL, downloadTo, fetchDetails, productIdFromUrl, sleep, type TcgDetails } from '../server/tcg.ts';
import { cutout } from './cutout.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY = join(ROOT, 'inventory.yaml');
const CACHE = join(ROOT, 'data', 'tcg-cache.json');
const CATALOG = join(ROOT, 'data', 'catalog.json');
const IMG_DIR = join(ROOT, 'public', 'img', 'products');

const args = new Set(process.argv.slice(2));
const OFFLINE = args.has('--offline');
const REFRESH = args.has('--refresh');
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type RawEntry = string | Record<string, unknown>;

interface Inventory {
  site?: Partial<SiteInfo>;
  defaults?: Record<string, unknown>;
  sealed?: RawEntry[];
  showcase?: RawEntry[];
  bulk?: RawEntry[];
  wanted?: { singles?: RawEntry[]; sealed?: RawEntry[] };
}

const STATUSES: Status[] = ['available', 'pending', 'sold'];

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v).trim();
}
function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function bool(v: unknown, fallback: boolean): boolean {
  if (v == null) return fallback;
  if (typeof v === 'boolean') return v;
  return /^(true|yes|y|1)$/i.test(String(v));
}

/**
 * The number is shown separately, so drop it from the name:
 *   "Charizard ex - 199/165"                          -> "Charizard ex"
 *   "Primarina - 020/084 (What's Your Favorite Stamp)" -> "Primarina (What's Your Favorite Stamp)"
 */
function cleanName(productName: string, number: string): string {
  let name = productName;
  if (number) name = name.replace(` - ${number}`, '');
  return name.replace(/ - [A-Z]{0,4}\d+[a-z]?(\/[A-Z]{0,4}\d+)?(?=$| \()/, '').trim();
}

async function main() {
  const inv = (parse(await readFile(INVENTORY, 'utf8')) ?? {}) as Inventory;
  const defaults = inv.defaults ?? {};
  const cache: Record<string, TcgDetails> = existsSync(CACHE) ? JSON.parse(await readFile(CACHE, 'utf8')) : {};
  await mkdir(IMG_DIR, { recursive: true });

  const entries: { section: Section; raw: Record<string, unknown>; line: string }[] = [];
  for (const section of ['sealed', 'showcase', 'bulk'] as const) {
    for (const e of inv[section] ?? []) {
      const raw = typeof e === 'string' || typeof e === 'number' ? { url: e } : (e ?? {});
      entries.push({ section, raw, line: str(raw.url ?? raw.id) });
    }
  }

  const problems: string[] = [];
  const items: CatalogItem[] = [];
  const seen = new Map<number, number>();
  let fetched = 0;

  /** Product details, from the cache unless stale. Problems are noted, not thrown. */
  async function getDetails(productId: number, label: string): Promise<TcgDetails | undefined> {
    let details = cache[productId];
    const stale = !details || REFRESH || details.sellers === undefined || Date.now() - Date.parse(details.fetchedAt) > MAX_AGE_MS;
    if (stale && !OFFLINE) {
      try {
        if (fetched++) await sleep(1000);
        details = await fetchDetails(productId);
        cache[productId] = details;
        process.stdout.write(`  ok ${details.productName}\n`);
      } catch (err) {
        problems.push(`[${label}] ${productId}: ${(err as Error).message}${details ? ' (using cached data)' : ''}`);
      }
    }
    return details;
  }

  for (const { section, raw, line } of entries) {
    if (bool(raw.hide, false)) continue;
    const productId = productIdFromUrl(line);
    if (!productId) {
      problems.push(`[${section}] no TCGplayer product id in: ${line || JSON.stringify(raw)}`);
      continue;
    }

    // 1. Product details (cached).
    const details = await getDetails(productId, section);
    if (!details && !raw.name) {
      problems.push(`[${section}] ${productId}: no data yet and no name override; skipped`);
      continue;
    }

    // 2. Images (downloaded once and served by us, so we never hotlink).
    const large = join(IMG_DIR, `${productId}.jpg`);
    const small = join(IMG_DIR, `${productId}_sm.jpg`);
    if (!OFFLINE && !raw.image) {
      for (const [file, size] of [[large, 'large'], [small, 'small']] as const) {
        if (existsSync(file)) continue;
        try {
          await downloadTo(IMAGE_URL(productId, size), file);
        } catch (err) {
          problems.push(`[${section}] ${productId}: ${(err as Error).message}`);
        }
      }
    }

    // 3. Sealed product gets its white background removed (transparent WebP).
    const sealed = details?.sealed ?? section === 'sealed';
    let ext = 'jpg';
    if (sealed && !raw.image && existsSync(large)) {
      ext = 'webp';
      const outputs = [
        [join(IMG_DIR, `${productId}.webp`), 1000],
        [join(IMG_DIR, `${productId}_sm.webp`), 420],
      ] as const;
      for (const [dest, size] of outputs) {
        if (existsSync(dest) && !REFRESH) continue;
        try {
          await cutout(large, dest, size);
        } catch (err) {
          ext = 'jpg';
          problems.push(`[${section}] ${productId}: background cutout failed: ${(err as Error).message}`);
        }
      }
    }

    const count = (seen.get(productId) ?? 0) + 1;
    seen.set(productId, count);
    const number = str(raw.number, details?.number ?? '');
    const status = str(raw.status, 'available').toLowerCase() as Status;

    items.push({
      id: count === 1 ? String(productId) : `${productId}-${count}`,
      productId,
      tcgUrl: line.startsWith('http') ? line : `https://www.tcgplayer.com/product/${productId}`,
      section,
      name: str(raw.name) || cleanName(details?.productName ?? '', number),
      number,
      set: str(raw.set, details?.setName ?? ''),
      setCode: details?.setCode ?? '',
      rarity: str(raw.rarity, details?.rarity ?? ''),
      productType: details?.productType ?? '',
      sealed,
      releaseDate: details?.releaseDate ?? '',
      sellers: details?.sellers ?? null,
      energyType: details?.energyType ?? [],
      image: str(raw.image) || `/img/products/${productId}.${ext}`,
      imageSmall: str(raw.image) || `/img/products/${productId}_sm.${ext}`,
      condition: sealed ? 'Sealed' : str(raw.condition, str(defaults.condition, 'NM')),
      graded: str(raw.graded),
      trade: bool(raw.trade, bool(defaults.trade, true)),
      qty: Math.max(1, Math.floor(num(raw.qty) ?? num(defaults.qty) ?? 1)),
      status: STATUSES.includes(status) ? status : 'available',
      notes: str(raw.notes),
      myPrice: num(raw.price),
      marketPrice: details?.marketPrice ?? null,
      lockPrice: bool(raw.lockPrice, false),
    });
  }

  // The "Buying" sign: free text, or a TCGplayer link to pull the name and picture.
  const wanted: WantedItem[] = [];
  for (const kind of ['singles', 'sealed'] as const) {
    for (const [n, e] of (inv.wanted?.[kind] ?? []).entries()) {
      const raw =
        typeof e === 'number' ? { url: e }
        : typeof e === 'string' ? (/^https?:/.test(e.trim()) ? { url: e } : { name: e })
        : (e ?? {});
      if (bool(raw.hide, false)) continue;
      const url = str(raw.url ?? raw.id);
      const productId = url ? productIdFromUrl(url) : null;
      if (url && !productId) problems.push(`[wanted] no TCGplayer product id in: ${url}`);
      const details = productId ? await getDetails(productId, 'wanted') : undefined;
      let image = '';
      if (productId && details && !raw.image) {
        const small = join(IMG_DIR, `${productId}_sm.jpg`);
        if (!existsSync(small) && !OFFLINE) {
          try {
            await downloadTo(IMAGE_URL(productId, 'small'), small);
          } catch (err) {
            problems.push(`[wanted] ${productId}: ${(err as Error).message}`);
          }
        }
        if (existsSync(small)) image = `/img/products/${productId}_sm.jpg`;
      }
      const number = details?.number ?? '';
      const name = str(raw.name) || (details ? cleanName(details.productName, number) : '');
      if (!name) {
        problems.push(`[wanted] ${url || JSON.stringify(raw)}: no name yet; skipped`);
        continue;
      }
      wanted.push({
        id: `w-${kind}-${n}`,
        kind: kind === 'singles' ? 'single' : 'sealed',
        name,
        detail: str(raw.detail, [details?.setName, number && `#${number}`].filter(Boolean).join(' · ')),
        image: str(raw.image) || image,
        tcgUrl: productId ? (url.startsWith('http') ? url : `https://www.tcgplayer.com/product/${productId}`) : '',
        note: str(raw.note ?? raw.notes),
      });
    }
  }

  const catalog: Catalog = {
    site: {
      name: str(inv.site?.name, 'The Card Table'),
      tagline: str(inv.site?.tagline),
      email: str(inv.site?.email),
    },
    syncedAt: new Date().toISOString(),
    items,
    wanted,
  };

  // Clean up after items that left the table: their images and cache entries.
  const used = new Set(items.map((i) => String(i.productId)));
  for (const kind of ['singles', 'sealed'] as const)
    for (const e of inv.wanted?.[kind] ?? []) {
      const id = productIdFromUrl(typeof e === 'string' ? e : str(e?.url));
      if (id) used.add(String(id));
    }
  let pruned = 0;
  for (const file of await readdir(IMG_DIR)) {
    const m = /^(\d+)(_sm)?\.(jpg|webp)$/.exec(file);
    if (m && !used.has(m[1])) {
      await unlink(join(IMG_DIR, file));
      pruned++;
    }
  }
  for (const id of Object.keys(cache)) if (!used.has(id)) delete cache[id];
  if (pruned) console.log(`  removed ${pruned} image file(s) for items no longer in the inventory`);

  await writeFile(CACHE, JSON.stringify(cache, null, 2) + '\n');
  await writeFile(CATALOG, JSON.stringify(catalog, null, 2) + '\n');

  const by = (s: Section) => items.filter((i) => i.section === s).length;
  console.log(`\nCatalog: ${items.length} items (sealed ${by('sealed')}, showcase ${by('showcase')}, bulk ${by('bulk')}) · buying ${wanted.length}`);
  if (problems.length) {
    console.warn(`\n${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
    if (args.has('--strict')) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
