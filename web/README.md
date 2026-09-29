# Kopi — web

Next.js (App Router, TypeScript, Tailwind v4, shadcn/ui on Base UI), statically
exported to `out/`. There is no server here; everything live comes from the Kopi API.

```bash
npm install
npm run dev          # mock mode: the backend's synthetic fixtures, in the browser
NEXT_PUBLIC_KOPI_API=http://127.0.0.1:8000 npm run dev   # against `make dev-api`
npm run build        # static export into out/
npm run types        # regenerate lib/api-types.ts from ../openapi.json
```

- `NEXT_PUBLIC_KOPI_API` is the API origin. Unset (or `mock`) serves `lib/mock.ts`
  over fixtures that `scripts/sync-fixtures.mjs` copies from `../backend` before
  `dev` and `build`; they are not committed twice.
- When the API reports `auth: true`, the app asks for an access code and keeps the
  token in `sessionStorage`.
- Pages that need an id read it from the query string (`/tender/?doc=…`), because a
  static export cannot render unknown dynamic routes.
- All dates are computed and shown in Singapore time (`lib/format.ts`).
