#!/usr/bin/env node
/**
 * Jig baseline accessibility audit for rocmakers.org
 *
 * Runs axe-core (WCAG 2.0/2.1/2.2 A + AA rules) on each in-scope page,
 * checks reflow at 320px, takes screenshots, and inventories the brand
 * (colors, fonts, CSS custom properties, logo).
 *
 * Usage (from repo root):
 *   pnpm audit:baseline
 *   node audit/scripts/run-baseline.mjs            # writes to audit/baseline/
 *   OUT=audit/after pnpm audit:baseline            # Phase 6 re-run
 *   BASE_URL=http://localhost:8080 node audit/scripts/run-baseline.mjs
 *
 * Automated checks find only part of the real issues. Keyboard and
 * screen reader findings get added to findings.csv by hand.
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = (process.env.BASE_URL || 'https://rocmakers.org').replace(/\/$/, '');
const OUT = process.env.OUT || 'audit/baseline';
const SHOTS = path.join(OUT, 'screenshots');

const PAGES = [
  { slug: 'home', path: '/' },
  { slug: 'facilities', path: '/facilities/' },
  { slug: 'reservations', path: '/reservations/' },
  { slug: 'faq', path: '/faq/' },
  { slug: 'become-a-member', path: '/become-a-member/' },
  { slug: 'mission-vision', path: '/mission-vision/' },
  { slug: 'leadership', path: '/leadership/' },
  { slug: 'contacting-us', path: '/contacting-us/' },
  { slug: 'support-us', path: '/support-us/' },
];

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

// ---------- helpers ----------
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols) =>
  [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';

// axe tags like "wcag143" -> "1.4.3", "wcag2411" -> "2.4.11"
function wcagCriteria(tags) {
  return tags
    .filter((t) => /^wcag\d{3,4}$/.test(t))
    .map((t) => {
      const d = t.slice(4);
      return `${d[0]}.${d[1]}.${d.slice(2)}`;
    });
}
function wcagLevel(tags) {
  if (tags.some((t) => /^wcag2(1|2)?aa$/.test(t))) return 'AA';
  if (tags.some((t) => /^wcag2(1|2)?a$/.test(t))) return 'A';
  return 'best-practice';
}

// WCAG relative luminance + contrast
function parseRgb(str) {
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
}
const toHex = ({ r, g, b }) =>
  '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
function luminance({ r, g, b }) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// ---------- in-page brand collection ----------
function collectBrand() {
  const tally = (map, key, n = 1) => key && map.set(key, (map.get(key) || 0) + n);
  const text = new Map(), bg = new Map(), border = new Map();
  const fonts = new Map(), sizes = new Map(), weights = new Map();
  const pairs = new Map();

  const effectiveBg = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
    }
    return 'rgb(255, 255, 255)';
  };

  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) {
      tally(text, cs.color);
      tally(fonts, cs.fontFamily);
      tally(sizes, cs.fontSize);
      tally(weights, cs.fontWeight);
      tally(pairs, `${cs.color}|${effectiveBg(el)}`);
    }
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') tally(bg, cs.backgroundColor);
    if (parseFloat(cs.borderTopWidth) > 0) tally(border, cs.borderTopColor);
  }

  // CSS custom properties on :root (WordPress presets live here)
  const vars = {};
  const rootCs = getComputedStyle(document.documentElement);
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules || []) {
      if (rule.selectorText && /(:root|body)/.test(rule.selectorText)) {
        for (const prop of rule.style) {
          if (prop.startsWith('--')) vars[prop] = rootCs.getPropertyValue(prop).trim() || rule.style.getPropertyValue(prop).trim();
        }
      }
    }
  }

  const logo = [...document.querySelectorAll('header img, .custom-logo, [class*="logo"] img, header svg')]
    .slice(0, 3)
    .map((el) => ({ tag: el.tagName.toLowerCase(), src: el.currentSrc || el.getAttribute('src') || '(inline svg)', alt: el.getAttribute('alt') }));

  const obj = (m) => Object.fromEntries(m);
  return { text: obj(text), bg: obj(bg), border: obj(border), fonts: obj(fonts), sizes: obj(sizes), weights: obj(weights), pairs: obj(pairs), vars, logo };
}

// ---------- main ----------
await fs.mkdir(SHOTS, { recursive: true });
const findings = [];
const review = [];
const summary = [];
const brand = { text: {}, bg: {}, border: {}, fonts: {}, sizes: {}, weights: {}, pairs: {}, vars: {}, logo: [] };
const merge = (into, from) => { for (const [k, v] of Object.entries(from)) into[k] = (into[k] || 0) + v; };
let axeVersion = '';
let n = 0;

async function writeReports() {
  const COLS = ['id', 'page', 'wcag_sc', 'level', 'severity', 'issue', 'how_found', 'screenshot', 'elements', 'rule', 'help_url'];
  await fs.writeFile(path.join(OUT, 'findings.csv'), toCsv(findings, COLS));
  await fs.writeFile(path.join(OUT, 'needs-review.csv'), toCsv(review, ['page', 'rule', 'wcag_sc', 'issue', 'elements', 'help_url']));
  await fs.writeFile(path.join(OUT, 'raw-brand.json'), JSON.stringify(brand, null, 2));

  const sevOrder = ['critical', 'serious', 'moderate', 'minor'];
  const bySev = Object.fromEntries(sevOrder.map((s) => [s, findings.filter((f) => f.severity === s).length]));
  const byRule = {};
  for (const f of findings) {
    byRule[f.rule] ??= { issue: f.issue.replace(/ \(\d+ elements?\)$/, ''), sc: f.wcag_sc, pages: new Set(), sev: f.severity };
    byRule[f.rule].pages.add(f.page);
  }
  const date = new Date().toISOString().slice(0, 10);
  let md = `# Baseline accessibility audit: automated pass\n\n`;
  md += `- **Site:** ${BASE_URL}\n- **Date:** ${date}\n- **Engine:** axe-core ${axeVersion}, WCAG 2.0/2.1/2.2 A and AA rules, plus a 320px reflow check\n`;
  md += `- **Scope:** ${PAGES.length} pages\n\n`;
  md += `> Automated tools find only part of the real issues. Keyboard, screen reader, zoom and motion checks are still manual; add those rows to \`findings.csv\` with \`how_found\` set to \`manual: keyboard\`, \`manual: NVDA\`, etc.\n\n`;
  md += `## Totals\n\n| Severity | Issue groups |\n|---|---|\n${sevOrder.map((s) => `| ${s} | ${bySev[s]} |`).join('\n')}\n| **Total** | **${findings.length}** |\n\n`;
  md += `## By page\n\n| Page | Issue groups | Needs review | Overflow at 320px |\n|---|---|---|---|\n`;
  md += summary.map((s) => (s.error ? `| ${s.page} | failed: ${s.error} | | |` : `| ${s.page} | ${s.violations} | ${s.needs_review} | ${s.reflow_overflow_px > 1 ? s.reflow_overflow_px + 'px' : 'none'} |`)).join('\n');
  md += `\n\n## Site-wide patterns\n\nIssues sorted by how many pages they appear on. These point to shared templates (header, footer, theme styles) and are the best candidates for design system fixes.\n\n| Rule | WCAG | Severity | Pages |\n|---|---|---|---|\n`;
  md += Object.entries(byRule)
    .sort((a, b) => b[1].pages.size - a[1].pages.size)
    .map(([, r]) => `| ${r.issue} | ${r.sc} | ${r.sev} | ${r.pages.size} of ${PAGES.length} |`)
    .join('\n');
  md += `\n\n## Lighthouse scores (fill in by hand)\n\nRun Chrome DevTools > Lighthouse > Accessibility on each page.\n\n| Page | Score |\n|---|---|\n${PAGES.map((p) => `| ${p.slug} | |`).join('\n')}\n`;
  await fs.writeFile(path.join(OUT, 'summary.md'), md);

  const top = (obj, k = 12) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, k);
  const colorRow = ([c, count]) => {
    const p = parseRgb(c);
    return p ? `| \`${toHex(p)}\` | ${c} | ${count} |` : `| | ${c} | ${count} |`;
  };
  let bi = `# Brand inventory: rocmakers.org\n\nGenerated ${date} by \`audit/scripts/run-baseline.mjs\` from computed styles across ${PAGES.length} pages. Counts are element counts. Review and annotate by hand.\n\n`;
  bi += `## Logo\n\n${brand.logo.map((l) => `- \`${l.tag}\` ${l.src} (alt: ${l.alt === null ? '**missing**' : `"${l.alt}"`})`).join('\n') || '- Not detected; add manually.'}\n\n`;
  bi += `## Text colors\n\n| Hex | Computed | Uses |\n|---|---|---|\n${top(brand.text).map(colorRow).join('\n')}\n\n`;
  bi += `## Background colors\n\n| Hex | Computed | Uses |\n|---|---|---|\n${top(brand.bg).map(colorRow).join('\n')}\n\n`;
  bi += `## Border colors\n\n| Hex | Computed | Uses |\n|---|---|---|\n${top(brand.border, 8).map(colorRow).join('\n')}\n\n`;
  bi += `## Text / background pairs and contrast\n\nWCAG AA: 4.5:1 for normal text, 3:1 for large text (24px, or 18.66px bold). Semi-transparent colors are approximated.\n\n| Text | Background | Ratio | AA normal | AA large | Uses |\n|---|---|---|---|---|---|\n`;
  bi += top(brand.pairs, 20)
    .map(([k, count]) => {
      const [fg, bgc] = k.split('|').map(parseRgb);
      if (!fg || !bgc) return `| ${k} | | | | | ${count} |`;
      const r = contrast(fg, bgc);
      return `| \`${toHex(fg)}\` | \`${toHex(bgc)}\` | ${r.toFixed(2)}:1 | ${r >= 4.5 ? 'pass' : '**fail**'} | ${r >= 3 ? 'pass' : '**fail**'} | ${count} |`;
    })
    .join('\n');
  bi += `\n\n## Font families\n\n| Stack | Uses |\n|---|---|\n${top(brand.fonts, 8).map(([f, c]) => `| ${f} | ${c} |`).join('\n')}\n\n`;
  bi += `## Font sizes\n\n| Size | Uses |\n|---|---|\n${top(brand.sizes, 15).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0])).map(([s, c]) => `| ${s} | ${c} |`).join('\n')}\n\n`;
  bi += `## Font weights\n\n| Weight | Uses |\n|---|---|\n${top(brand.weights, 8).map(([w, c]) => `| ${w} | ${c} |`).join('\n')}\n\n`;
  const colorVars = Object.entries(brand.vars).filter(([k]) => /color|palette/i.test(k));
  const otherVars = Object.entries(brand.vars).filter(([k]) => !/color|palette/i.test(k));
  bi += `## CSS custom properties\n\nWordPress theme presets (\`--wp--preset--*\`) are the closest thing the site has to tokens today.\n\n### Color\n\n| Property | Value |\n|---|---|\n${colorVars.map(([k, v]) => `| \`${k}\` | \`${v}\` |`).join('\n') || '| (none found) | |'}\n\n`;
  bi += `### Other\n\n<details><summary>${otherVars.length} properties</summary>\n\n| Property | Value |\n|---|---|\n${otherVars.map(([k, v]) => `| \`${k}\` | \`${String(v).replace(/\|/g, '\\|')}\` |`).join('\n')}\n\n</details>\n\n`;
  bi += `## Photography\n\n_Describe by hand: subjects, tone, treatment, how alt text is handled._\n`;
  await fs.mkdir('docs', { recursive: true });
  await fs.writeFile(path.join(OUT === 'audit/baseline' ? 'docs' : OUT, 'brand-inventory.md'), bi);

  console.log(`\nDone. ${findings.length} issue groups written to ${OUT}/findings.csv`);
  console.log(`Summary: ${OUT}/summary.md  Brand: ${OUT === 'audit/baseline' ? 'docs' : OUT}/brand-inventory.md`);
}

let browser;
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const pg of PAGES) {
    const url = BASE_URL + pg.path;
    process.stdout.write(`Auditing ${url} ... `);
    let context;
    try {
      context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });

      const desktopShot = path.join(SHOTS, `${pg.slug}-desktop.png`);
      await page.screenshot({ path: desktopShot, fullPage: true });

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      axeVersion = results.testEngine.version;

      for (const v of results.violations) {
        n += 1;
        findings.push({
          id: `B${String(n).padStart(3, '0')}`,
          page: pg.slug,
          wcag_sc: wcagCriteria(v.tags).join(' ') || '(best practice)',
          level: wcagLevel(v.tags),
          severity: v.impact,
          issue: `${v.help} (${v.nodes.length} element${v.nodes.length === 1 ? '' : 's'})`,
          how_found: `axe-core ${axeVersion}`,
          screenshot: path.relative(OUT, desktopShot),
          elements: v.nodes.slice(0, 5).map((nd) => nd.target.join(' ')).join(' | '),
          rule: v.id,
          help_url: v.helpUrl,
        });
      }
      for (const v of results.incomplete) {
        review.push({
          page: pg.slug,
          rule: v.id,
          wcag_sc: wcagCriteria(v.tags).join(' '),
          issue: v.help,
          elements: v.nodes.length,
          help_url: v.helpUrl,
        });
      }

      const b = await page.evaluate(collectBrand);
      for (const k of ['text', 'bg', 'border', 'fonts', 'sizes', 'weights', 'pairs']) merge(brand[k], b[k]);
      Object.assign(brand.vars, b.vars);
      if (!brand.logo.length) brand.logo = b.logo;

      // Reflow check (WCAG 1.4.10): 320 CSS px wide, no horizontal scroll
      await page.setViewportSize({ width: 320, height: 640 });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const mobileShot = path.join(SHOTS, `${pg.slug}-320px.png`);
      await page.screenshot({ path: mobileShot, fullPage: true });
      if (overflow > 1) {
        n += 1;
        findings.push({
          id: `B${String(n).padStart(3, '0')}`,
          page: pg.slug,
          wcag_sc: '1.4.10',
          level: 'AA',
          severity: 'serious',
          issue: `Page scrolls horizontally at 320px wide (${overflow}px overflow)`,
          how_found: 'script: reflow check',
          screenshot: path.relative(OUT, mobileShot),
          elements: '',
          rule: 'reflow-320',
          help_url: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
        });
      }

      const count = findings.filter((f) => f.page === pg.slug).length;
      summary.push({ page: pg.slug, url, violations: count, needs_review: results.incomplete.length, reflow_overflow_px: overflow });
      console.log(`${count} issue groups`);
    } catch (e) {
      const message = e.message.split('\n')[0];
      console.log(`FAILED (${message})`);
      summary.push({ page: pg.slug, url, error: message });
    } finally {
      await context?.close();
    }
  }
} finally {
  await browser?.close();
  await writeReports();
}
