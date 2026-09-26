# Baseline accessibility audit: automated pass

- **Site:** https://rocmakers.org
- **Date:** 2026-09-26
- **Engine:** axe-core 4.13.0, WCAG 2.0/2.1/2.2 A and AA rules, plus a 320px reflow check
- **Scope:** 9 pages

> Automated tools find only part of the real issues. Keyboard, screen reader, zoom and motion checks are still manual; add those rows to `findings.csv` with `how_found` set to `manual: keyboard`, `manual: NVDA`, etc.

## Totals

| Severity | Issue groups |
|---|---|
| critical | 0 |
| serious | 9 |
| moderate | 0 |
| minor | 0 |
| **Total** | **9** |

## By page

| Page | Issue groups | Needs review | Overflow at 320px |
|---|---|---|---|
| home | 1 | 1 | none |
| facilities | 1 | 1 | none |
| reservations | 1 | 1 | none |
| faq | 1 | 1 | none |
| become-a-member | 1 | 1 | none |
| mission-vision | 1 | 1 | none |
| leadership | 1 | 1 | none |
| contacting-us | 1 | 1 | none |
| support-us | 1 | 1 | none |

## Site-wide patterns

Issues sorted by how many pages they appear on. These point to shared templates (header, footer, theme styles) and are the best candidates for design system fixes.

| Rule | WCAG | Severity | Pages |
|---|---|---|---|
| Elements must meet minimum color contrast ratio thresholds | 1.4.3 | serious | 9 of 9 |

## Lighthouse scores (fill in by hand)

Run Chrome DevTools > Lighthouse > Accessibility on each page.

| Page | Score |
|---|---|
| home | |
| facilities | |
| reservations | |
| faq | |
| become-a-member | |
| mission-vision | |
| leadership | |
| contacting-us | |
| support-us | |
