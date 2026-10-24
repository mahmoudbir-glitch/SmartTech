# Brand logo sources

Logo files for the brands SmartTech is an authorised distributor for.
Every file in this folder is hosted in our own repository — nothing is hotlinked
and no external CDN is loaded at runtime.

All seven are SVG. All are the plain wordmark / brand lockup on a transparent
background: no screenshots, no cards, no coloured tiles, no baked-in shadows.
Each file has been stripped of comments, editor metadata and `<style>` blocks,
has no `<script>`, no embedded raster and no embedded base64 data, and carries a
`viewBox` with **no hard-coded `width`/`height`** so it scales freely.
Each `viewBox` was re-cut to the artwork's true bounding box (measured with
`getBBox()`) so empty margins are gone and the marks align optically in a row.

Retrieved 2026-09-23.

| Brand | File | Format | viewBox (trimmed) | Size |
|---|---|---|---|---|
| Anker | `anker.svg` | SVG | `0 4.615 81.742 14.769` | 1.0 KB |
| eufy | `eufy.svg` | SVG | `0.02 0.427 657.103 313.143` | 3.9 KB |
| soundcore | `soundcore.svg` | SVG | `0 0 200 34` | 10.7 KB |
| Nebula | `nebula.svg` | SVG | `0 12 122 17` | 2.5 KB |
| Anker SOLIX | `anker-solix.svg` | SVG | `0 2.857 144.905 17.164` | 5.5 KB |
| PITAKA | `pitaka.svg` | SVG | `0 0.002 657.43 119.998` | 4.4 KB |
| Kingston | `kingston.svg` | SVG | `0 0 244.8 50.1` | 7.5 KB |

Largest file is 10.7 KB, well under the 40 KB limit.

---

## Per-brand provenance

### Anker — `anker.svg`
- **Source URL:** https://www.anker.com/ — the wordmark is an inline `<svg>` in the
  site header markup (not a separate asset file), extracted verbatim from the page.
- **Format / size:** SVG, original `viewBox="0 0 82 24"`, re-cut to the artwork
  bounding box `0 4.615 81.742 14.769`.
- **Colour:** `#080A0F` (near-black, exactly as the brand site serves it).
- **Licence / provenance:** Official brand site. Used under our authorised
  distributor rights.

### eufy — `eufy.svg`
- **Source URL:** https://www.eufy.com/ — inline `<svg>` in the site header markup.
- **Format / size:** SVG, original `viewBox="0 0 658 314"`, re-cut to
  `0.02 0.427 657.103 313.143`.
- **Colour:** `#1D1D1F`. The live site paints the paths with CSS `currentColor`
  (Tailwind class `text-[#1D1D1F]`); since a standalone file has nothing to inherit
  from, the fill was pinned to that same `#1D1D1F` the site itself applies.
- **Licence / provenance:** Official brand site (eufy is an Anker brand).
- **Note:** eufy.com's header actually carries a combined **"ANKER eufy"** lockup
  (`viewBox="0 0 143 25"`). That lockup was *not* used — this file is the
  standalone eufy wordmark the same page also ships.

### soundcore — `soundcore.svg`
- **Source URL:** https://cdn.shopify.com/s/files/1/0512/8568/8505/files/logo.svg
  (the header logo asset referenced by https://www.soundcore.com/)
- **Format / size:** SVG, `viewBox="0 0 200 34"` — already tight, unchanged.
- **Colour:** `#17BBEF`, the official soundcore cyan as published.
- **Licence / provenance:** Official brand site asset (soundcore is an Anker brand).

### Nebula — `nebula.svg`
- **Source URL:** https://www.ankersolix.com/icons/sprite-1bSuBiYhD3.svg —
  `<symbol id="nebulaFooter">` inside Anker's own official SVG icon sprite.
- **Format / size:** SVG, symbol `viewBox="0 0 122 40"`, re-cut to `0 12 122 17`.
- **Colour:** **Recoloured.** The official artwork in the sprite is `fill="white"`
  because it is the footer variant, meant for Anker's dark footer. The geometry is
  untouched; only the fill was changed from white to `#000000` so the mark is
  visible on our white cards. Nothing was redrawn.
- **Licence / provenance:** Official Anker Innovations asset (Nebula is an Anker
  projector brand).
- **Note:** Nebula's own storefronts (seenebula.com / us.seenebula.com) no longer
  ship a wordmark asset — seenebula.com now redirects to
  soundcore.com/collections/nebula-projector, and the remaining store pages contain
  only UI and payment icons. Anker's official sprite was the only clean source.

### Anker SOLIX — `anker-solix.svg`
- **Source URL:** https://www.ankersolix.com/icons/sprite-1bSuBiYhD3.svg —
  `<symbol id="ankersolix">` in the same official Anker sprite.
- **Format / size:** SVG, symbol `viewBox="0 0 145 20"`, re-cut to
  `0 2.857 144.905 17.164`.
- **Colour:** Official colour lockup, `#00A9E0` (blue) with a `#00CE7C` green accent
  in the "O" of SOLIX. Not recoloured.
- **Licence / provenance:** Official brand site (ankersolix.com).
- **Note:** The lightning bolt in the "A" and the counters are transparent holes,
  not white fills, so the mark sits correctly on any background colour. (The single
  `fill="white"` in the original sprite was on the `<clipPath>` rectangle, which is
  never painted; it was dropped.)

### PITAKA — `pitaka.svg`
- **Source URL:** https://static.ipitaka.com/images/logo_black.svg
  (linked from https://www.ipitaka.com/, PITAKA's official store)
- **Format / size:** SVG, original `viewBox="0 0 657.43 120"`, re-cut to
  `0 0.002 657.43 119.998` (the artwork already filled its box).
- **Colour:** `#000000`.
- **Licence / provenance:** Official brand site.
- **Cleanup:** The downloaded file contained a stray Figma guide line
  (`<line stroke="#F694FF">` at x −48→2) left in by the exporter, plus an unused
  `<clipPath>`/`<defs>` wrapper. Both were removed; the four letterform paths are
  untouched.
- **Note:** The horizontal bar running through the letters **is** part of the PITAKA
  mark, not an artifact — verified against the identical logo served from PITAKA's
  Shopify CDN (`cdn.shopify.com/s/files/1/1036/4113/files/logo.svg`), which renders
  the same.
- **Careful:** `pitaka.com` is **not** PITAKA — it is a parked domain listed for sale.
  PITAKA's real site is **ipitaka.com**.

### Kingston — `kingston.svg`
- **Source URL:** https://en.wikipedia.org/wiki/Special:FilePath/Kingston%20Technology%20Corporation%20logo.svg
- **File page:** https://en.wikipedia.org/wiki/File:Kingston_Technology_Corporation_logo.svg
- **Format / size:** SVG, `viewBox="0 0 244.8 50.1"` — already tight, unchanged.
- **Colour:** `#010101` (wordmark), `#E21D38` (the red king figure), `#FFFFFF`
  (3 detail shapes inside the king figure).
- **Licence / provenance:** Wikipedia file page states **Public domain**, credited to
  https://www.kingston.com. This is the full Kingston Technology lockup: king figure
  + "Kingston" + "TECHNOLOGY" + ®.
- **Why not the official site:** kingston.com is behind a Cloudflare challenge and
  returns HTTP 403 to every non-interactive request (plain fetch, and headless
  browser). Several likely official asset paths were probed and all returned 404.
  Falling back to Wikimedia was the documented second choice.
- **Note:** The 3 white shapes are interior details of the king figure. On our white
  cards they correctly read as background. On a dark or coloured background they
  would show as solid white — see the caveat below.

---

## Display notes for the shop

- **All seven are intended for white / very light cards.** Anker, eufy, Nebula,
  PITAKA and Kingston are dark marks and will be invisible or near-invisible on a
  dark background. soundcore (`#17BBEF`) and Anker SOLIX (`#00A9E0`) are cyan and
  stay legible on dark, but Kingston additionally has white interior detail that
  only looks right on light backgrounds.
  **If a dark theme is ever added, these files must not simply be inverted** —
  Anker publishes proper white footer variants in the sprite listed above.
- **Aspect ratios differ a lot** (eufy ≈ 2.1:1 up to Anker SOLIX ≈ 8.4:1). Constrain
  by *both* `max-height` and `max-width` rather than height alone, e.g.
  `max-height: 34px; max-width: 130px; object-fit: contain;`. Verified: at that
  sizing all seven read at consistent visual weight.
- Two marks carry brand colour by design (soundcore cyan, Anker SOLIX cyan+green).
  These are the official colour lockups, not a styling choice.

## Trademark note

These logos are the trademarks of their respective owners. SmartTech displays them
as an authorised distributor of these brands, to identify the products it sells.
They are not modified beyond the colour change explicitly recorded for Nebula above,
and must not be restyled, recoloured further, stretched or combined with other
marks.
