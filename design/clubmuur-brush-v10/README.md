# Clubmuur brushset v10

Seven original images generated from the user's Duindorp reference photographs, using the built-in image generator. Exact generation prompts and source references are recorded in `prompts.json`. Native files live in `masters/`; sizes and delivered web variants are recorded in `manifest.json`.

## Placement

| Original | Use | Native size |
| --- | --- | --- |
| 01-hero-houtrust.png | Hero: canteen and entrance | 1672 × 940 |
| 02-hero-meeuwenhof.png | Hero: Meeuwenhof and church | 1672 × 941 |
| 03-hero-havenhoofd.png | Hero: harbour light and neighbourhood | 1672 × 941 |
| 04-section-wijkpanorama.png | News & stories, Our club heading | 1672 × 941 |
| 05-section-houtrust.png | Your team / Our club | 1672 × 941 |
| 06-reserve-kerk.png | Reserved for later; not served to visitors | 1086 × 1448 |
| 07-reserve-meeuwenhof.png | Reserved for later; not served to visitors | 1672 × 941 |

The artwork is a stylized interpretation of the supplied photographs. Native originals are preserved without enlargement. The stronger dry-brush edges and ink splatter follow the original Clubmuur direction, using the site's #03438A blue as the reference palette.

## Delivery

Run `node design/clubmuur-brush-v10/prepare-assets.mjs <source-directory>` to reproduce web variants. AVIF is preferred, with WebP fallback. Hero widths are 960/1280/1672; the mobile compositions crop a 1000-pixel-wide region of each original (left positions 300, 140 and 0 respectively), preserve its full height, and export at 480/800 pixels. They use left/top object positioning below 1000 pixels. Section variants are 800/1600 pixels and loaded lazily. Only the first hero is initially requested; the next warms after decode and transitions never reveal an undecoded picture.

The background changes with a 1.6-second dissolve and restrained scale motion. Small dots and pause/play sit at the bottom right above the blue band. Manual selection pauses rotation. Reduced-motion, data-saving, hidden-page, offscreen, focus and hover conditions suspend automatic playback, including any pending automatic transition.

Section opacity: news 11%, teams 9% (8% on small screens), club heading 12%. Foreground text and images retain full opacity.

## Verification

TypeScript passed. In the local Sites preview, mobile (390 px) and desktop were visually checked, manual selection was verified, and both new section backgrounds loaded successfully. Pagination no longer overlaps the mobile headline. Desktop cards retain their 2 × 2 arrangement. Mobile and desktop use the new AVIF variants.
