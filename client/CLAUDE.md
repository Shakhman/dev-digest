# @devdigest/web — Next.js 15 studio

**Use when:** touching UI pages, components, data hooks, i18n strings, or the
review/findings/run display — anything under `client/`.

Stack: Next.js 15 App Router · React 19 · TanStack Query ·
next-intl · recharts · react-markdown

## Commands
```sh
pnpm dev        # :3000
pnpm test       # vitest + jsdom; fetch mocked — no API needed
pnpm typecheck
```

## Map
```
src/app/              — pages (thin shells; logic in _components/)
src/lib/api.ts        — typed fetch wrapper (NEXT_PUBLIC_API_BASE = :3001)
src/lib/hooks/        — all TanStack Query hooks
src/components/app-shell/ — nav, breadcrumbs, g→key shortcuts
src/vendor/ui/        — @devdigest/ui primitives (do not publish)
src/vendor/shared/    — @devdigest/shared Zod contracts (do not edit here)
messages/<locale>/    — i18n strings (never hardcode strings in components)
```

## Non-default
- Feature logic colocated: `_components/<Name>/<Name>.tsx` + `<Name>.test.tsx`
- All data fetching via hooks in `src/lib/hooks/*` — no direct fetch in pages/components
- Active runs poll every 4s (`refetchInterval: 4000`) while status = running
- SSE `/runs/:id/events` for live log; on completion invalidates reviews + runs cache

## Gotchas
- RSC/Client boundary: hooks require Client components — pages stay Server only
  if they don't use any hook
- Don't duplicate refetch — `useRunEvents` already invalidates on completion

## Further
README.md — full route map diagram
docs/     — UI architecture decisions (create when needed)
specs/    — feature specs (create when needed)
INSIGHTS.md — component gotchas and patterns (create when needed)
