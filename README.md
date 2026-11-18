# Card Table

A Pokémon vendor table as a website. Sealed product stands on a shelf, singles sit in a glass showcase, and cheaper hits go in a box people can flip through. Visitors pick items up, add them to a pile and send it to you. There's no checkout.

## Updating your inventory

1. Edit **`inventory.yaml`**. Add a TCGplayer link per item, plus your price, condition, trade status and notes if you like. The comments at the top of the file explain every field.
2. Run `npm run sync`. This pulls the name, set, number, rarity, image and market price from TCGplayer, and cuts the white background out of sealed-product photos.
3. Run `npm run deploy` (builds, pushes and updates tcg.atomic10.studio).

**Pricing:** each item shows one price, the higher of your `price` and the TCGplayer market price. The server re-checks market prices once a day, so the higher-of-the-two rule stays current between deploys. Add `lockPrice: true` to an item to always use your own price (for example, a played card).

**Buying sign:** the `wanted:` section (with `singles:` and `sealed:` lists) fills the cardboard "Buying!" sign below the table. Each entry is plain text or a TCGplayer link (which pulls in the name and picture), with an optional `note:`. Visitors tap an entry to send you a "selling to you" message in Campfire. Empty the lists to take the sign down.

## Inquiries go to Campfire

The pile drawer's form posts to `/api/inquiry`. The server looks the items up itself (so names and prices can't be faked), formats a message and posts it to a Campfire room through a bot. Set this in ONCE:

```
CAMPFIRE_POST_URL=https://chat.atomic10.studio/rooms/<room-id>/<bot-key>/messages
```

To get it: in Campfire, open Account → Bots, create a bot and copy its key. The room ID is in the room's URL. The server rate-limits to 5 messages per 10 minutes per IP and has a hidden honeypot field for bots. If the URL isn't set or Campfire is down, visitors are offered the email link instead.

## Development

```
npm install
npm run sync          # once, to fetch images
npm run dev           # Vite on :5173, API on :8787
```

| Path | What |
| --- | --- |
| `inventory.yaml` | your stock (the only file you normally edit) |
| `scripts/sync-tcg.ts` | TCGplayer fetch, image download, sealed cutouts → `data/catalog.json` |
| `server/index.ts` | Hono: static site, `/up`, `/api/catalog`, `/api/inquiry`, daily price refresh |
| `shared/types.ts` | types + the `finalPrice` rule |
| `src/` | React frontend (GSAP for the pick-up, fly-to-pile and re-sort animations) |

## Deploying with ONCE

First time:

```
docker login ghcr.io          # GitHub token with write:packages
./deploy.sh                   # builds + pushes ghcr.io/jameson13b/card-table:latest
once deploy ghcr.io/jameson13b/card-table:latest \
  --host cards.example.com \
  --env CAMPFIRE_POST_URL='https://chat.atomic10.studio/rooms/<id>/<bot-key>/messages'
```

After that, just run `npm run deploy`. It updates tcg.atomic10.studio by default; use `HOST=other.example.com ./deploy.sh` for a different host.

The container listens on :80, answers `/up` for ONCE's health check, and keeps its price cache in `/storage`.

TCGplayer's endpoints are public but undocumented. If they change, the site keeps serving the last synced data and `npm run sync` lists what failed.
