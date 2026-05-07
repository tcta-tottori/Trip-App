#!/usr/bin/env python3
"""Wikimedia から各アトラクション画像を取得し 600x400 にリサイズして保存。

依存: Python 3.9+ / Pillow (`pip install Pillow`)
実行: `python3 scripts/fetch_images.py`

外部ツール（curl, jq, ImageMagick）は不要。
"""
from __future__ import annotations
import io
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow が見つかりません。`pip install Pillow` してから再実行してください。", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
ATTR_DIR = ROOT / "images" / "attractions"
PARK_DIR = ROOT / "images" / "parks"
HOTEL_DIR = ROOT / "images" / "hotels"
CRED = ROOT / "images" / "_credits.md"

UA = "disney-trip-2026/1.0 (personal project)"
SUMMARY_ENDPOINTS = (
    "https://ja.wikipedia.org/api/rest_v1/page/summary/{}",
    "https://en.wikipedia.org/api/rest_v1/page/summary/{}",
)


def fetch_summary_image(title: str) -> str | None:
    quoted = urllib.parse.quote(title, safe="")
    for tmpl in SUMMARY_ENDPOINTS:
        url = tmpl.format(quoted)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.load(r)
        except Exception:
            continue
        src = (data.get("originalimage") or {}).get("source") \
            or (data.get("thumbnail") or {}).get("source")
        if src:
            return src
    return None


def download_image(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    except Exception as e:
        print(f"  download failed: {e}", file=sys.stderr)
        return None


def resize_cover(raw: bytes, out: Path, w: int = 600, h: int = 400, quality: int = 85) -> bool:
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as e:
        print(f"  open failed: {e}", file=sys.stderr)
        return False
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    sw, sh = img.size
    if sw == 0 or sh == 0:
        return False
    scale = max(w / sw, h / sh)
    nw, nh = int(round(sw * scale)), int(round(sh * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    img = img.crop((left, top, left + w, top + h))
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=quality, optimize=True)
    return True


def fetch(title: str, output: Path, label: str, credits: list[str]) -> bool:
    src = fetch_summary_image(title)
    if not src:
        print(f"✗ {output.relative_to(ROOT)} (no source for '{title}')")
        return False
    raw = download_image(src)
    if not raw:
        print(f"✗ {output.relative_to(ROOT)} (download failed)")
        return False
    if not resize_cover(raw, output):
        print(f"✗ {output.relative_to(ROOT)} (resize failed)")
        return False
    print(f"✓ {output.relative_to(ROOT)}")
    credits.append(f"- **{label}** — {src}")
    return True


TARGETS_LAND = [
    ("イッツ・ア・スモールワールド", "small-world.jpg", "Small World"),
    ("ジャングルクルーズ", "jungle-cruise.jpg", "Jungle Cruise"),
    ("蒸気船マークトウェイン号", "mark-twain.jpg", "Mark Twain"),
    ("アリスのティーパーティー", "tea-party.jpg", "Tea Party"),
    ("キャッスルカルーセル", "carrousel.jpg", "Castle Carrousel"),
    ("トムソーヤ島", "tom-sawyer.jpg", "Tom Sawyer"),
    ("ウエスタンリバー鉄道", "western-river.jpg", "Western River RR"),
    ("ロジャーラビットのカートゥーンスピン", "roger-rabbit.jpg", "Roger Rabbit"),
    ("プーさんのハニーハント", "pooh.jpg", "Pooh's Hunny Hunt"),
    ('美女と野獣 "魔法のものがたり"', "beauty-beast.jpg", "Beauty and the Beast"),
    ("バズ・ライトイヤーのアストロブラスター", "buzz.jpg", "Buzz Lightyear"),
    ("ベイマックスのハッピーライド", "baymax.jpg", "Baymax"),
    ('モンスターズ・インク "ライド&ゴーシーク!"', "monsters-inc.jpg", "Monsters Inc"),
    ("ピーターパン空の旅", "peter-pan.jpg", "Peter Pan"),
    ("白雪姫と七人のこびと", "snow-white.jpg", "Snow White"),
    ("ホーンテッドマンション", "haunted-mansion.jpg", "Haunted Mansion"),
    ("スペース・マウンテン", "space-mountain.jpg", "Space Mountain"),
    ("スター・ツアーズ", "star-tours.jpg", "Star Tours"),
    ("スプラッシュ・マウンテン", "splash-mountain.jpg", "Splash Mountain"),
]
TARGETS_SEA = [
    ("マーメイドラグーン", "mermaid-lagoon.jpg", "Mermaid Lagoon"),
    ("ジャンピン・ジェリーフィッシュ", "jellyfish.jpg", "Jellyfish"),
    ("ブローフィッシュ・バルーンレース", "blowfish.jpg", "Blowfish"),
    ("アリエルのプレイグラウンド", "ariel-playground.jpg", "Ariel Playground"),
    ("ジャスミンのフライングカーペット", "jasmine-carpet.jpg", "Jasmine Carpet"),
    ("ヴェネツィアン・ゴンドラ", "gondola.jpg", "Gondola"),
    ("ビッグシティ・ヴィークル", "big-city.jpg", "Big City Vehicles"),
    ("ディズニーシー・トランジットスチーマーライン", "transit-steamer.jpg", "Transit Steamer"),
    ("トイ・ストーリー・マニア!", "toy-story-mania.jpg", "Toy Story Mania"),
    ("ファンタジースプリングス", "rapunzel.jpg", "Fantasy Springs"),
    ("アナとエルサのフローズンジャーニー", "frozen-journey.jpg", "Frozen Journey"),
    ("シンドバッド・ストーリーブック・ヴォヤッジ", "sindbad.jpg", "Sindbad"),
    ("ニモ&フレンズ・シーライダー", "nemo.jpg", "Nemo"),
    ("タワー・オブ・テラー (東京ディズニーシー)", "tower-terror.jpg", "Tower of Terror"),
    ("ソアリン:ファンタスティック・フライト", "soaring.jpg", "Soaring"),
    ("ピーターパンのネバーランドアドベンチャー", "peter-pan-neverland.jpg", "Peter Pan Neverland"),
]
TARGETS_PARKS = [
    ("シンデレラ城", "cinderella-castle.jpg", "Cinderella Castle"),
    ("プロメテウス火山", "prometheus.jpg", "Mt. Prometheus"),
    ("ワールドバザール", "world-bazaar.jpg", "World Bazaar"),
    ("メディテレーニアンハーバー", "mediterranean-harbor.jpg", "Med Harbor"),
]
TARGETS_HOTELS = [
    ("浦安ブライトンホテル", "brighton.jpg", "Brighton Hotel"),
    ("舞浜ユーラシア", "eurasia.jpg", "Eurasia"),
]


def main() -> int:
    ATTR_DIR.mkdir(parents=True, exist_ok=True)
    PARK_DIR.mkdir(parents=True, exist_ok=True)
    HOTEL_DIR.mkdir(parents=True, exist_ok=True)

    credits: list[str] = [
        "# Image credits",
        "",
        "All images sourced from Wikimedia Commons / Japanese Wikipedia under their respective licenses.",
        "Run `python3 scripts/fetch_images.py` to refresh.",
        "",
    ]

    ok = miss = 0
    for title, fname, label in TARGETS_LAND + TARGETS_SEA:
        if fetch(title, ATTR_DIR / fname, label, credits):
            ok += 1
        else:
            miss += 1
    for title, fname, label in TARGETS_PARKS:
        if fetch(title, PARK_DIR / fname, label, credits):
            ok += 1
        else:
            miss += 1
    for title, fname, label in TARGETS_HOTELS:
        if fetch(title, HOTEL_DIR / fname, label, credits):
            ok += 1
        else:
            miss += 1

    CRED.write_text("\n".join(credits) + "\n", encoding="utf-8")
    print(f"\nDone. {ok} ok / {miss} missing. Missing images use the fallback UI.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
