#!/usr/bin/env python3
"""Generate decorative gradient JPG placeholders for attractions/parks/hotels.

These are intentionally generic art (not photos) so the app looks finished even
when the Wikimedia fetcher hasn't run. `fetch_images.py` will overwrite any of
these files with real photos when it succeeds.

Usage:
    python3 scripts/generate_placeholders.py [--force]
"""
from __future__ import annotations
import json
import sys
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ATTR_JSON = ROOT / "data" / "attractions.json"
IMG_ROOT = ROOT / "images"
FONT_PATH = "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"

W, H = 600, 400

LV_PALETTE = {
    1: ((196, 226, 196), (110, 168, 130)),
    2: ((184, 211, 232), (96, 138, 188)),
    3: ((244, 211, 145), (210, 161, 80)),
    4: ((232, 158, 109), (190, 96, 56)),
    5: ((196, 110, 122), (132, 50, 64)),
}
PARK_TINT = {
    "land": (255, 240, 245, 30),
    "sea":  (220, 240, 255, 35),
}
EXTRA_LANDMARKS = {
    # park overview / hotels — keyed by stem
    "cinderella-castle":     {"emoji": "🏰", "palette": 2},
    "prometheus":            {"emoji": "🌋", "palette": 5},
    "world-bazaar":          {"emoji": "🛍️", "palette": 3},
    "mediterranean-harbor":  {"emoji": "⚓", "palette": 2},
    "brighton":              {"emoji": "🏨", "palette": 3},
    "eurasia":               {"emoji": "🏨", "palette": 2},
}


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(c1, c2):
    img = Image.new("RGB", (W, H), c1)
    px = img.load()
    for y in range(H):
        row = lerp(c1, c2, y / (H - 1))
        for x in range(W):
            px[x, y] = row
    return img


def add_radial_highlight(img, center, radius, color=(255, 255, 255), alpha=70):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    cx, cy = center
    steps = 24
    for i in range(steps, 0, -1):
        a = int(alpha * (i / steps) ** 2)
        r = int(radius * (i / steps))
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*color, a))
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=12))
    img.paste(overlay, (0, 0), overlay)
    return img


def add_decor_shapes(img, seed, park):
    """Sprinkle soft circles / waves to add variety."""
    rng = random.Random(seed)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    if park == "sea":
        # gentle wave bands
        for i in range(3):
            y = H - 60 - i * 28
            amp = 16 + i * 6
            pts = []
            for x in range(0, W + 20, 8):
                pts.append((x, y + int(math.sin(x / 36 + i) * amp)))
            d.line(pts, fill=(255, 255, 255, 38 - i * 8), width=6)
    else:
        # floating bubbles / sparkles
        for _ in range(rng.randint(6, 10)):
            r = rng.randint(8, 28)
            cx = rng.randint(0, W)
            cy = rng.randint(0, H - 80)
            d.ellipse((cx - r, cy - r, cx + r, cy + r),
                      fill=(255, 255, 255, rng.randint(18, 42)))
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=2))
    img.paste(overlay, (0, 0), overlay)
    return img


def add_vignette(img):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    # darken edges
    for i in range(40):
        a = int(70 * (i / 40) ** 2)
        d.rectangle((i, i, W - i, H - i), outline=(0, 0, 0, 60 - a), width=1)
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=8))
    img.paste(overlay, (0, 0), overlay)
    return img


def draw_theme_motif(img, park, seed=0):
    """Park-themed silhouette in the middle distance."""
    rng = random.Random(seed)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if park == "sea":
        # stylized sun/moon — position varies with seed
        cx = W // 2 + rng.randint(-60, 60)
        cy = 130 + rng.randint(-20, 20)
        r = 60 + rng.randint(-10, 20)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 245, 220, 180))
        # horizon waves
        base_y = 240 + rng.randint(-15, 15)
        for i, dy in enumerate((0, 30, 60)):
            y = base_y + dy
            pts = []
            amp = 14 - i * 2
            phase = rng.uniform(0, 3.14)
            for x in range(-10, W + 20, 6):
                pts.append((x, y + int(math.sin(x / 28 + i * 1.4 + phase) * amp)))
            d.line(pts, fill=(255, 255, 255, 130 - i * 30), width=4)
    else:
        # castle silhouette with seeded variation
        cx = W // 2 + rng.randint(-30, 30)
        base_y = 280 + rng.randint(-10, 10)
        central_h = rng.randint(110, 150)
        side_h = rng.randint(85, 110)
        wall_h = rng.randint(60, 80)
        side_x = rng.randint(70, 95)
        wall_x = rng.randint(135, 165)

        d.rectangle((cx - 32, base_y - central_h, cx + 32, base_y), fill=(255, 255, 255, 170))
        d.polygon([(cx - 38, base_y - central_h), (cx + 38, base_y - central_h),
                   (cx, base_y - central_h - 70)],
                  fill=(255, 255, 255, 200))
        for sgn in (-1, 1):
            x = cx + sgn * side_x
            d.rectangle((x - 22, base_y - side_h, x + 22, base_y), fill=(255, 255, 255, 150))
            d.polygon([(x - 26, base_y - side_h), (x + 26, base_y - side_h),
                       (x, base_y - side_h - 50)],
                      fill=(255, 255, 255, 180))
        for sgn in (-1, 1):
            x = cx + sgn * wall_x
            d.rectangle((x - 26, base_y - wall_h, x + 26, base_y), fill=(255, 255, 255, 130))
            d.polygon([(x - 30, base_y - wall_h), (x + 30, base_y - wall_h),
                       (x, base_y - wall_h - 40)],
                      fill=(255, 255, 255, 160))
        # flag on central spire
        flag_top = base_y - central_h - 80
        d.polygon([(cx, flag_top), (cx + 16, flag_top + 10), (cx, flag_top + 20)],
                  fill=(255, 245, 200, 220))
    layer = layer.filter(ImageFilter.GaussianBlur(radius=1))
    img.paste(layer, (0, 0), layer)
    return img


def draw_name_plate(img, name):
    draw = ImageDraw.Draw(img)
    name_font = ImageFont.truetype(FONT_PATH, 28)

    def wrap(s, max_chars=11):
        lines, cur = [], ""
        for ch in s:
            cur += ch
            if len(cur) >= max_chars:
                lines.append(cur); cur = ""
        if cur:
            lines.append(cur)
        return lines[:2]

    lines = wrap(name)
    text = "\n".join(lines)
    bbox = draw.multiline_textbbox((0, 0), text, font=name_font, spacing=4)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (W - tw) // 2
    ty = H - th - 32

    pad = 14
    plate = Image.new("RGBA", img.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate)
    pd.rounded_rectangle(
        (tx - pad, ty - pad, tx + tw + pad, ty + th + pad),
        radius=14, fill=(0, 0, 0, 120),
    )
    img.paste(plate, (0, 0), plate)
    draw.multiline_text((tx, ty), text, font=name_font, fill=(255, 255, 255),
                        spacing=4, align="center")
    return img


def park_emoji(a):
    fear = a.get("fearLevel", 1)
    if fear >= 4:
        return "⚠️"
    if a.get("darkness") == "完全暗闇":
        return "🌑"
    if a.get("park") == "sea":
        return "🌊"
    return "🎢"


def render(path: Path, name: str, palette_lv: int, park: str | None):
    c1, c2 = LV_PALETTE.get(palette_lv, LV_PALETTE[2])
    seed = hash(path.stem) & 0xFFFF
    img = gradient(c1, c2).convert("RGBA")
    img = add_radial_highlight(img, (W // 2, 110), 280)
    img = draw_theme_motif(img, park or "land", seed=seed)
    img = add_decor_shapes(img, seed, park or "land")
    img = add_vignette(img)
    out = img.convert("RGB")
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, "JPEG", quality=82, optimize=True)


def main(force=False):
    data = json.loads(ATTR_JSON.read_text(encoding="utf-8"))
    made = skipped = 0
    for a in data["attractions"]:
        rel = a.get("image")
        if not rel:
            continue
        out = ROOT / rel
        if out.exists() and not force:
            skipped += 1
            continue
        render(out, a["name"], a.get("fearLevel", 1), a.get("park"))
        made += 1
        print(f"✓ {rel}")
    # parks + hotels
    for stem, meta in EXTRA_LANDMARKS.items():
        for sub in ("parks", "hotels"):
            cand = IMG_ROOT / sub / f"{stem}.jpg"
            if cand.parent.exists() or sub == "parks":
                pass
        # We don't know which subdir each lives in by data; render both expected paths if requested via attractions config (none here). Skip extras for now.
    print(f"\nDone. {made} rendered / {skipped} skipped.")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
