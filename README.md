# Jig

Private design system workspace. Tokens are the only package so far.

## Build

From the repo root:

```sh
pnpm build
```

That runs Style Dictionary in `@jig/tokens` and writes `packages/tokens/dist/css/tokens.css`. `dist` is gitignored, so run the build after a fresh clone.

## Layout

- `packages/tokens/src/primitive/` — source tokens in DTCG JSON. The current file is a two-stop neutral color smoke test.
- `packages/tokens` publishes CSS as `@jig/tokens/css` once the build has run.
- `apps/` — reserved for a future consumer. Nothing lives here yet.

A future app depends on `"@jig/tokens": "workspace:*"` and imports `@jig/tokens/css`.

Semantic tokens and component packages are the next work. They are not part of this layout yet.
