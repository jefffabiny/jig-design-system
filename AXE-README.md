# Accessibility audit

Jig's accessibility work is measured against a baseline audit of rocmakers.org, done before any design system changes. The same audit is re-run in Phase 6 so the case study can show before and after.

- **Target:** WCAG 2.2 Level AA
- **Scope:** Home, Facilities, Reservations, FAQ, Become a Member, Mission & Vision, Leadership, Contacting Us, Support Us
- **Out of scope:** Classes (Corsizio), Store, Maker Faire site

## Folder layout

```
audit/
├── scripts/run-baseline.mjs   # automated pass (axe-core + reflow + brand inventory)
├── baseline/                  # before: findings.csv, needs-review.csv, summary.md, screenshots/
└── after/                     # Phase 6 re-run, same format
```

## 1. Automated pass

One-time setup from the repo root:

```bash
pnpm add -Dw playwright @axe-core/playwright
pnpm exec playwright install chromium
```

Run it:

```bash
pnpm audit:baseline
```

`node audit/scripts/run-baseline.mjs` does the same thing.

It writes:

| File | What it holds |
|---|---|
| `audit/baseline/findings.csv` | One row per failed axe rule per page, mapped to WCAG criterion and level |
| `audit/baseline/needs-review.csv` | Checks axe couldn't decide on; review each one by hand |
| `audit/baseline/summary.md` | Totals, per-page counts, and issues shared across pages |
| `audit/baseline/screenshots/` | Full-page captures at 1280px and 320px |
| `docs/brand-inventory.md` | Colors, contrast pairs, fonts, CSS custom properties, logo |

For the Phase 6 re-run: `OUT=audit/after pnpm audit:baseline`

## 2. Manual pass

Automated tools catch only part of the real issues. Do these on every page and add each problem as a row in `findings.csv`, continuing the ID sequence, with `how_found` set to e.g. `manual: keyboard` or `manual: NVDA + Firefox`.

### Keyboard (WCAG 2.1.1, 2.1.2, 2.4.1, 2.4.3, 2.4.7, 2.4.11)
- [ ] First Tab press reveals a skip link that works
- [ ] Every link, button, and field can be reached and used with Tab, Shift+Tab, Enter, Space
- [ ] Focus is always visible and not hidden behind sticky headers
- [ ] Tab order follows the visual order
- [ ] Mobile menu opens, closes with Escape, and returns focus to its button
- [ ] No keyboard traps (embeds, maps, calendars)

### Screen reader (NVDA + Firefox or Chrome; VoiceOver + Safari)
- [ ] Page has a unique, descriptive `<title>`
- [ ] Exactly one `h1`; heading levels don't skip
- [ ] Landmarks present: header/banner, nav, main, footer/contentinfo
- [ ] Link text makes sense out of context (no bare "Click here" or "Learn more")
- [ ] Images: meaningful ones have useful alt text, decorative ones are hidden
- [ ] Form fields announce a label, required state, and errors
- [ ] Email signup confirms success or failure to the screen reader (status message, 4.1.3)
- [ ] Embedded content (maps, videos, booking widgets) is labeled and usable

### Zoom and reflow (1.4.4, 1.4.10, 1.4.12)
- [ ] 200% browser zoom: nothing cut off or overlapping
- [ ] 400% zoom (or 320px wide): no horizontal scroll, all content reachable
- [ ] Text spacing bookmarklet: no clipped text

### Other
- [ ] Target size: controls at least 24x24px or spaced apart (2.5.8)
- [ ] With reduced motion turned on, nothing animates that shouldn't (2.3.3 is AAA, but it's a Jig principle)
- [ ] Color is never the only way information is shown (1.4.1)
- [ ] Lighthouse accessibility score recorded in `summary.md`

## Severity scale

Uses axe's impact levels so automated and manual rows sort together:

| Severity | Meaning |
|---|---|
| critical | Blocks a task entirely for some users |
| serious | Major barrier; task is very hard |
| moderate | Causes friction or confusion |
| minor | Annoyance; low impact |
