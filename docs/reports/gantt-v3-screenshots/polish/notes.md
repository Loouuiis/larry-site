# Polish verification — PR #78 preview (commit 64391fd)

**Preview:** https://ailarry-git-feat-gantt-v3-polish-loouuiis-projects.vercel.app/workspace/timeline
**Tenant:** larry@larry.com (seed: 3 QA Test projects under Uncategorised)

## Screenshots
- `polish-zoom-M.png` — default M zoom
- `polish-zoom-W.png` — **W zoom (was broken)**
- `polish-zoom-Q.png` — Q zoom
- `polish-new-category-modal.png` — New-category modal showing 8-swatch palette

## No-overlap verdict

### M zoom (polish-zoom-M.png)
- Month labels: APR / MAY / JUN visible, clean separation by 1px dividers
- Day numbers: 6, 13, 20, 27, 4, 11, 18, 25, 1, 8, 15 — all tabular, no touching
- Tick marks align with labels; no crowding

### W zoom (polish-zoom-W.png) — **the previously-broken case**
- Day numbers: 4, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 — **every single day visible, zero overlap**
- Month labels APR/MAY visible
- Bars proportionally wider (matches the stretched axis)
- Grid scrolls horizontally (expected at W zoom for daily granularity)

### Q zoom (polish-zoom-Q.png)
- Month labels: MAR, APR, MAY, JUN, JUL — all clean
- Biweekly ticks: 1, 15, 29, 13, 27, 10, 24, 8, 22 — well-spaced
- Bars more compact (range expanded by zoom)

## Other polish items

### + CATEGORY button in outline header
Visible in all zoom screenshots next to "TASK / GROUPS" label. Purple uppercase pill with + icon. Labelled "+ CATEGORY" (11px weight 600).

### 8-swatch palette (polish-new-category-modal.png)
The New Category modal now renders the 8-swatch picker instead of the native `<input type="color">`:
- Larry purple (selected, outer ring)
- Sky, Green, Amber, Red, Pink, Violet, Slate

All 8 circles 24px, well-spaced, hoverable.

## Verdict

**All three fixes shipped and verified. Zero overlap at any zoom. Ready for Fergus sign-off + merge.**
