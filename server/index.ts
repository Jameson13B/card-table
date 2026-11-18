// Card Table server: serves the built site, the catalog API (with daily
// TCGplayer market-price refresh), and the inquiry form → Campfire.
//
// Env:
//   PORT               default 80 (ONCE expects 80)
//   STORAGE_DIR        default /storage (ONCE's persistent volume)
//   CAMPFIRE_POST_URL  https://chat.example.com/rooms/<id>/<bot-key>/messages
//   PRICE_REFRESH_HOURS default 24; 0 disables the refresh

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Catalog, InquiryRequest, Intent, PublicCatalog } from '../shared/types.ts';
import { finalPrice, formatPrice } from '../shared/types.ts';
import { fetchDetails, sleep } from './tcg.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 80);
const STORAGE = process.env.STORAGE_DIR ?? '/storage';
const PRICES_FILE = join(STORAGE, 'prices.json');
const CAMPFIRE_POST_URL = process.env.CAMPFIRE_POST_URL ?? '';
const REFRESH_MS = Number(process.env.PRICE_REFRESH_HOURS ?? 24) * 60 * 60 * 1000;

const catalog: Catalog = JSON.parse(await readFile(join(ROOT, 'data', 'catalog.json'), 'utf8'));

// ── Live market prices ─────────────────────────────────────────────────────
type PriceCache = { refreshedAt: string; prices: Record<string, number | null> };
let livePrices: PriceCache = { refreshedAt: catalog.syncedAt, prices: {} };

async function loadPrices() {
  try {
    const saved = JSON.parse(await readFile(PRICES_FILE, 'utf8')) as PriceCache;
    // Prices from before this catalog was built are older than the catalog's own.
    if (Date.parse(saved.refreshedAt) > Date.parse(catalog.syncedAt)) livePrices = saved;
  } catch {
    /* first boot */
  }
}

async function refreshPrices() {
  const ids = [...new Set(catalog.items.map((i) => i.productId))];
  const prices: Record<string, number | null> = { ...livePrices.prices };
  let ok = 0;
  for (const [n, id] of ids.entries()) {
    if (n) await sleep(1000);
    try {
      prices[id] = (await fetchDetails(id)).marketPrice;
      ok++;
    } catch (err) {
      console.warn('price refresh:', (err as Error).message);
    }
  }
  if (ok) {
    livePrices = { refreshedAt: new Date().toISOString(), prices };
    await mkdir(STORAGE, { recursive: true });
    await writeFile(PRICES_FILE, JSON.stringify(livePrices));
  }
  console.log(`price refresh: ${ok}/${ids.length} updated`);
}

function schedulePriceRefresh() {
  if (!(REFRESH_MS > 0)) return;
  const age = Date.now() - Date.parse(livePrices.refreshedAt);
  const firstIn = Math.max(10_000, REFRESH_MS - age);
  const run = () => refreshPrices().catch((e) => console.error('price refresh failed', e));
  setTimeout(() => {
    run();
    setInterval(run, REFRESH_MS);
  }, firstIn);
}

function priceOf(item: Catalog['items'][number]): number | null {
  const live = livePrices.prices[item.productId];
  const market = live !== undefined ? live : item.marketPrice;
  return finalPrice(item.myPrice, market ?? item.marketPrice, item.lockPrice);
}

function publicCatalog(): PublicCatalog {
  return {
    site: catalog.site,
    items: catalog.items.map((item) => {
      const { myPrice, marketPrice, lockPrice, ...rest } = item;
      return { ...rest, price: priceOf(item) };
    }),
  };
}

// ── Inquiry → Campfire ─────────────────────────────────────────────────────
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_MAX;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

const INTENT_LABEL: Record<Intent, string> = { cash: '💵 Buy (cash)', trade: '🔁 Trade', either: '💵/🔁 Cash or trade' };

function inquiryHtml(req: InquiryRequest): string {
  const items = req.itemIds
    .map((id) => catalog.items.find((i) => i.id === id))
    .filter((i) => i !== undefined);
  const total = items.reduce((sum, i) => sum + (priceOf(i) ?? 0), 0);
  const lines = items.map((i) => {
    const bits = [i.number && `#${i.number}`, i.set, i.graded || i.condition].filter(Boolean).join(' · ');
    return `<li><a href="${esc(i.tcgUrl)}">${esc(i.name)}</a> (${esc(bits)}): <strong>${esc(formatPrice(priceOf(i)))}</strong></li>`;
  });
  return [
    `<p>🃏 <strong>New table inquiry</strong> from <strong>${esc(req.name)}</strong></p>`,
    `<p>Contact: ${esc(req.contact)}<br>Wants: ${INTENT_LABEL[req.intent]}</p>`,
    items.length ? `<ul>${lines.join('')}</ul><p>Pile total: <strong>${esc(formatPrice(total || null))}</strong></p>` : '',
    req.message ? `<blockquote>${esc(req.message).replace(/\n/g, '<br>')}</blockquote>` : '',
  ].join('');
}

// ── App ────────────────────────────────────────────────────────────────────
const app = new Hono();

app.get('/up', (c) => c.text('OK'));

app.get('/api/catalog', (c) => {
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(publicCatalog());
});

app.post('/api/inquiry', async (c) => {
  let body: Partial<InquiryRequest>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'Bad request.' }, 400);
  }

  // Honeypot: pretend it worked.
  if (body.website) return c.json({ ok: true });

  // The ONCE proxy appends the real client IP last; earlier entries are client-supplied.
  const ip = c.req.header('x-forwarded-for')?.split(',').pop()?.trim() || getConnInfo(c).remote.address || 'unknown';
  if (rateLimited(ip)) return c.json({ ok: false, error: 'Too many messages. Try again in a few minutes.' }, 429);

  const intent: Intent = body.intent === 'cash' || body.intent === 'trade' ? body.intent : 'either';
  const req: InquiryRequest = {
    name: clip(body.name, 80),
    contact: clip(body.contact, 120),
    intent,
    message: clip(body.message, 2000),
    itemIds: Array.isArray(body.itemIds) ? body.itemIds.slice(0, 50).map((id) => clip(id, 20)) : [],
  };
  if (!req.name || !req.contact) return c.json({ ok: false, error: 'Please add your name and how to reach you.' }, 400);
  if (!req.message && !req.itemIds.length) return c.json({ ok: false, error: 'Add a message or some items.' }, 400);

  if (!CAMPFIRE_POST_URL) {
    console.warn('CAMPFIRE_POST_URL not set; inquiry not delivered:\n', inquiryHtml(req));
    return c.json({ ok: false, error: 'The message service isn’t set up yet. Please use email instead.' }, 503);
  }
  try {
    const res = await fetch(CAMPFIRE_POST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: inquiryHtml(req),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Campfire HTTP ${res.status}`);
  } catch (err) {
    console.error('inquiry delivery failed:', err);
    return c.json({ ok: false, error: 'Couldn’t send right now. Please use email instead.' }, 502);
  }
  return c.json({ ok: true });
});

if (existsSync(DIST)) {
  const root = relative(process.cwd(), DIST) || '.';
  app.use('/img/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=604800');
  });
  app.use('/assets/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('/*', serveStatic({ root }));
  // Missing files (images, scripts…) are a real 404, not the page.
  app.get('*', async (c, next) => {
    const path = c.req.path;
    if (/\.[a-z0-9]+$/i.test(path) || path.startsWith('/api/')) return c.notFound();
    return next();
  });
  app.get('*', serveStatic({ root, path: 'index.html' }));
}

await loadPrices();
schedulePriceRefresh();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`card-table on :${info.port} · ${catalog.items.length} items · campfire ${CAMPFIRE_POST_URL ? 'on' : 'OFF'}`);
});
