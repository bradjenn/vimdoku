# Vimdoku

A vim-first Sudoku app built with React, Vite, Tailwind CSS, TanStack Router, IndexedDB, and an optional Convex backend.

## Local Development

```sh
npm install
npm run dev
```

## Cloudflare Workers

The app is configured for Cloudflare Workers static assets with Wrangler.

```sh
npm run deploy
```

That command builds the app and deploys `dist/` to the `vimdoku` Worker. To upload a preview Worker version without shifting production traffic:

```sh
npm run deploy:preview
```

If Wrangler is not already authenticated, create a Cloudflare API token and run the deploy with:

```sh
CLOUDFLARE_API_TOKEN=... npm run deploy
```

Cloudflare Workers build settings for a Git-connected deploy:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Environment variable: `VITE_CONVEX_URL=https://compassionate-cricket-778.eu-west-1.convex.cloud`

`wrangler.toml` uses Workers assets with `not_found_handling = "single-page-application"` so deep links such as `/play/daily/easy/2026-05-19` load the React app.

## Routes

- `/` dashboard
- `/play` board
- `/new` new puzzle menu
- `/games` puzzle finder
- `/leaderboards` live/local leaderboards
- `/profile` player profile and stats
- `/settings` settings
- `/commands` command help

## Convex

Convex is optional until a deployment is configured. Without it, the app keeps working locally with IndexedDB and local leaderboards.

To connect Convex:

```sh
npx convex dev
```

The Convex CLI will create or connect a deployment, generate local Convex metadata, and populate `.env.local` with `VITE_CONVEX_URL`.

The backend lives in `convex/`:

- `schema.ts` defines profiles, games, and scores.
- `profiles.ts` upserts guest/player profiles.
- `games.ts` syncs current game snapshots.
- `leaderboards.ts` accepts completed scores and serves live best times.

`VITE_LEADERBOARD_ENDPOINT` is still supported as a simple HTTP fallback, but Convex is the intended global backend.
