# Clubmuur backgrounds

Three master artworks made with built-in imagegen from the user's landmark photos and the existing Clubmuur wall style. Exact prompts and reference inputs are preserved in `prompts.json`.

- Houtrust: canteen and entrance gate.
- De wijk: Meeuwenhof arch and church.
- Aan zee: harbor light and aerial neighborhood.

Native output: 1672 × 941 pixels per PNG. A 3840 × 2160 output was requested but was not returned by the generator. The originals have not been enlarged. Architecture was visually compared with the source photos; the illustrations preserve the characteristic structures, but are artistic interpretations, not exact photographic tracings.

Web variants in `public/assets/clubmuur-scenes`: AVIF quality 57 / 4:4:4, WebP quality 83, with 960, 1280 and 1672-pixel landscape widths. Portrait variants are crops of the left 836 × 941 pixels, resized to 480 and 800 pixels wide without enlargement. `manifest.json` records actual dimensions and byte sizes. No geometrical stretching is used.

The first picture is present in server-rendered HTML and has high fetch priority. Only the next picture is requested after the active image has decoded and initial loading has settled. A slide is not shown until decoding is complete. Automatic changes occur every 10 seconds; the 1.6-second crossfade and 1.8% scale settling animate only opacity and transform. Autoplay stops for reduced motion, data saving, hidden documents, an offscreen hero, control focus, and manual image selection. A failed background retains the existing wall fallback.
