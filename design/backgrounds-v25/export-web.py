"""Prepare generated native masters: DPI metadata and responsive web encodings.

No generative editing, retouching, recoloring or enlargement is done here.
Run from any directory with Pillow's AVIF and WebP encoders installed.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
from PIL import Image, PngImagePlugin

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / "public/assets/clubmuur-brush-v25"
OUT.mkdir(parents=True, exist_ok=True)
SCENES = ("houtrust", "de-wijk", "aan-zee")
credits = "Beacon reference: © Dennis Nijhuis — www.nederlandsevuurtorens.nl"
masters = []
jobs = []
for scene in SCENES:
    for shape in ("wide", "portrait"):
        name = f"{scene}{'-portrait' if shape == 'portrait' else ''}-original.png"
        path = HERE / name
        with Image.open(path) as image:
            image.load()
            original_pixels = image.tobytes()
            metadata = PngImagePlugin.PngInfo()
            for key, value in image.text.items():
                metadata.add_text(key, value)
            metadata.add_text("Description", "Duindorp SV brush/paint/grunge artwork. Native generated dimensions; no upscale.")
            if scene == "aan-zee":
                metadata.add_text("Reference attribution", credits)
            image.save(path, dpi=(300, 300), pnginfo=metadata)
            width, height = image.size
        with Image.open(path) as check:
            assert check.tobytes() == original_pixels, "Metadata must not change pixels"
            assert abs(check.info["dpi"][0] - 300) < .01
        masters.append({"file": name, "width": width, "height": height, "dpi": 300})
        sizes = (960, 1280, 1672) if shape == "wide" else (480, 800, 941)
        for size in sizes:
            assert size <= width, "Do not upscale"
            jobs.append((path, f"{scene}-{shape}", size))
for name, scene in (("houtrust", "houtrust"), ("wijkpanorama", "aan-zee")):
    for size in (800, 1600):
        jobs.append((HERE / f"{scene}-original.png", f"section-{name}", size))

def export(job):
    path, prefix, width = job
    with Image.open(path) as source:
        image = source.convert("RGB")
        height = round(image.height * width / image.width)
        if image.size != (width, height):
            image = image.resize((width, height), Image.Resampling.LANCZOS)
        results = []
        for extension, settings in (("avif", {"quality": 55, "speed": 6, "max_threads": 2}), ("webp", {"quality": 80, "method": 6})):
            destination = OUT / f"{prefix}-{width}.{extension}"
            image.save(destination, **settings)
            results.append({"file": destination.name, "width": width, "height": height, "bytes": destination.stat().st_size})
        return results

with ThreadPoolExecutor(max_workers=3) as pool:
    exports = [result for group in pool.map(export, jobs) for result in group]
manifest = {"mode": "Built-in image_gen reference-based edit", "masters": masters,
    "requested_native_size": "3840 × 2160 / 2160 × 3840", "actual_native_long_edge": 1672,
    "upscaled": False, "reference_attribution": credits,
    "note": "300 DPI is print metadata, not added detail. Small generated architectural details can differ from reference photographs.",
    "exports": exports}
(HERE / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"masters": masters, "web_files": len(exports), "largest_avif_kb": round(max(x["bytes"] for x in exports if x["file"].endswith(".avif")) / 1024)}, indent=2))
