# Jig design principles

Jig's principles come from the baseline accessibility audit of rocmakers.org (`audit/baseline/`). Each one answers a pattern found in the audit and says what the system does about it.

## 1. Build it once

A jig exists so the same cut comes out right every time. Jig components work the same way: one component per job, reused everywhere, so a fix made once reaches every page.

**Why:** The same contrast failure shows up on all 9 pages because buttons are restyled separately in each section of the site. The audit found at least six separate button implementations: `.front-btn`, `.newsletter-form__submit`, `.join-paypal__button`, `.donate-paypal__button`, `.contact-discord__button`, and the highlighted nav link (`#menu-item-2080`). All six fail in the same way.

**In practice:**

- One Button component covers every call to action, including wrappers around third-party buttons (PayPal, Discord)
- Components are styled only through tokens; no one-off colors in page templates
- A new variant is added to the system, never patched into a page

**Tradeoff we accept:** Less freedom to style a single page differently.

## 2. Contrast is built in, not checked after

Color tokens are published as tested pairs, so it isn't possible to pick a text color and background that fail.

**Why:** 46 elements across 9 of 9 pages fail WCAG 1.4.3 (Contrast, Minimum). It's the only automated failure on the site, and nearly all of it traces back to a small number of brand color pairings.

**In practice:**

- Semantic tokens come in pairs (`action.primary.background` + `action.primary.text`) and are only used together
- Every pair is tested in CI: 4.5:1 for text, 3:1 for UI components and focus indicators
- Brand colors that fail get accessible variants; the change is recorded in an ADR

**Tradeoff we accept:** Some brand colors shift slightly darker or lighter than the originals.

## 3. The most important actions are the easiest to use

Join, subscribe, donate, and reserve are the reasons the site exists. They get the highest contrast, the largest targets, and the clearest focus states.

**Why:** The failing elements are almost all calls to action: the highlighted nav link `#menu-item-2080` (9 of 9 pages), the newsletter Subscribe button (at least 7 of 9), the primary hero and visit buttons, the membership and donation PayPal buttons, and the Discord button. Today, the site's most important actions are its hardest to read.

**In practice:**

- Primary actions meet AA contrast with room to spare (aim for 7:1 text where the brand allows)
- Targets are at least 44x44px for primary actions (above the 24px WCAG 2.2 minimum)
- Button labels say what happens ("Become a member," not "Submit")

**Tradeoff we accept:** Primary buttons may be visually heavier than the current design.

## 4. (Pending the manual audit)

The automated pass only covers what axe can detect. The fourth principle should come from the keyboard, screen reader, and zoom findings. Likely candidates, depending on what turns up:

- **Every interaction is visible:** if focus indicators are missing or weak
- **Works without seeing it:** if headings, landmarks, labels, or status messages are missing
- **Holds up at any size:** if zoom or 320px reflow breaks layouts
