#!/usr/bin/env python3
"""東京ディズニーリゾート公式サイトの各アトラクション詳細ページから
og:image / twitter:image / hero画像 を取得し、`images/attractions/<id>.jpg`
を上書きする。

`fetch_official_urls.py` の後に実行する想定:
  1. fetch_official_urls.py  -> attractions.json の url を公式詳細URLに更新
  2. fetch_official_images.py -> その url から OGP 画像を取得

検索URL（`search.tokyodisneyresort.jp/...`）になっているものはスキップする。
依存: Pillow（リサイズ用）。
"""
from __future__ import annotations

import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow が必要です: pip install Pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
ATTR_JSON = ROOT / "data" / "attractions.json"
ATTR_DIR = ROOT / "images" / "attractions"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# 詳細ページの公式 URL のみ対象（検索URLは除外）
DETAIL_HOSTS = ("www.tokyodisneyresort.jp", "tokyodisneyresort.jp")

META_PATTERNS = [
    re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', re.I),
    re.compile(r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']', re.I),
]
# Fallback: <img class="..."> within the main visual area
IMG_FALLBACK = re.compile(
    r'<img[^>]+src=["\']([^"\']+/(?:attraction|tdl|tds)/[^"\']+\.(?:jpg|jpeg|png))["\']',
    re.I,
)

TARGET_SIZE = (600, 400)


def fetch(url: str, *, accept: str = "*/*") -> bytes | None:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": accept,
            "Accept-Language": "ja,en;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    except Exception as e:
        print(f"  ! fetch failed {url}: {e}", file=sys.stderr)
        return None


def extract_image_url(html: str, base_url: str) -> str | None:
    for pat in META_PATTERNS:
        m = pat.search(html)
        if m:
            return urllib.parse.urljoin(base_url, m.group(1))
    m = IMG_FALLBACK.search(html)
    if m:
        return urllib.parse.urljoin(base_url, m.group(1))
    return None


def save_resized(raw: bytes, dest: Path) -> bool:
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        print(f"  ! decode failed: {e}", file=sys.stderr)
        return False
    # center-crop to target aspect, then resize
    tw, th = TARGET_SIZE
    iw, ih = img.size
    target_ratio = tw / th
    cur_ratio = iw / ih
    if cur_ratio > target_ratio:
        new_w = int(ih * target_ratio)
        x0 = (iw - new_w) // 2
        img = img.crop((x0, 0, x0 + new_w, ih))
    else:
        new_h = int(iw / target_ratio)
        y0 = (ih - new_h) // 2
        img = img.crop((0, y0, iw, y0 + new_h))
    img = img.resize(TARGET_SIZE, Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "JPEG", quality=82, optimize=True)
    return True


def is_official_url(url: str) -> bool:
    try:
        p = urllib.parse.urlparse(url)
        return p.netloc in DETAIL_HOSTS and "/attraction/detail/" in p.path
    except Exception:
        return False


def main() -> int:
    data = json.loads(ATTR_JSON.read_text(encoding="utf-8"))
    attractions = data["attractions"]
    ok = skipped = failed = 0

    for a in attractions:
        url = a.get("url")
        if not url or not is_official_url(url):
            skipped += 1
            continue
        print(f"[{a['id']}] {url}")
        html_bytes = fetch(url, accept="text/html,application/xhtml+xml")
        if not html_bytes:
            failed += 1
            continue
        html = html_bytes.decode("utf-8", errors="ignore")
        img_url = extract_image_url(html, url)
        if not img_url:
            print(f"  ! no og:image found")
            failed += 1
            continue
        print(f"  -> {img_url}")
        img_bytes = fetch(img_url, accept="image/*")
        if not img_bytes:
            failed += 1
            continue
        dest = ATTR_DIR / f"{a['id']}.jpg"
        if save_resized(img_bytes, dest):
            ok += 1
        else:
            failed += 1
        time.sleep(0.5)  # be polite

    print(f"\nDone. fetched={ok} skipped={skipped} failed={failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
