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
import time
import urllib.error
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

# Wikipedia User-Agent policy: include client + URL + contact.
# https://meta.wikimedia.org/wiki/User-Agent_policy
UA = (
    "Trip-App/1.0 "
    "(https://github.com/tcta-tottori/Trip-App; "
    "trip-app-bot@users.noreply.github.com) "
    "Python-urllib/3"
)

# Try the MediaWiki Action API first (more permissive than rest_v1),
# then fall back to the REST summary endpoint.
ACTION_TMPL = (
    "https://{lang}.wikipedia.org/w/api.php?"
    "action=query&format=json&prop=pageimages"
    "&piprop=original%7Cthumbnail&pithumbsize=900"
    "&redirects=1&titles={title}"
)
SUMMARY_TMPL = "https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}"

LANGS = ("ja", "en")


def http_get(url: str, accept: str = "application/json", retries: int = 3) -> bytes | None:
    """GET with backoff. Prints actual error reason on failure."""
    last_err = ""
    for attempt in range(retries):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Accept": accept, "Accept-Language": "ja,en;q=0.8"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code} {e.reason}"
            # 429 / 5xx: retry. 4xx other: give up.
            if e.code == 429 or 500 <= e.code < 600:
                time.sleep(1.5 * (attempt + 1))
                continue
            break
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(1.0 * (attempt + 1))
    print(f"  !! GET failed: {url[:90]}... -> {last_err}", file=sys.stderr)
    return None


def extract_action_image(body: bytes) -> str | None:
    try:
        data = json.loads(body)
    except Exception:
        return None
    pages = data.get("query", {}).get("pages", {})
    for pid, page in pages.items():
        if str(pid) == "-1":
            continue
        orig = (page.get("original") or {}).get("source")
        if orig:
            return orig
        thumb = (page.get("thumbnail") or {}).get("source")
        if thumb:
            return thumb
    return None


def extract_summary_image(body: bytes) -> str | None:
    try:
        data = json.loads(body)
    except Exception:
        return None
    src = (data.get("originalimage") or {}).get("source") \
        or (data.get("thumbnail") or {}).get("source")
    return src


def fetch_summary_image(title: str) -> str | None:
    q = urllib.parse.quote(title, safe="")
    for lang in LANGS:
        body = http_get(ACTION_TMPL.format(lang=lang, title=q))
        if body:
            src = extract_action_image(body)
            if src:
                return src
        body = http_get(SUMMARY_TMPL.format(lang=lang, title=q))
        if body:
            src = extract_summary_image(body)
            if src:
                return src
    return None


def download_image(url: str) -> bytes | None:
    return http_get(url, accept="image/*")


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
    rel = output.relative_to(ROOT)
    src = fetch_summary_image(title)
    if not src:
        print(f"✗ {rel} (no source for '{title}')")
        return False
    raw = download_image(src)
    if not raw:
        print(f"✗ {rel} (download failed: {src[:80]})")
        return False
    if not resize_cover(raw, output):
        print(f"✗ {rel} (resize failed)")
        return False
    print(f"✓ {rel}  <-  {src[:90]}")
    credits.append(f"- **{label}** — {src}")
    return True


TARGETS_LAND = [
    # (Wikipedia article title, output filename, credits label)
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

    print(f"User-Agent: {UA}\n")

    credits: list[str] = [
        "# Image credits",
        "",
        "Real photos fetched from Wikimedia Commons / Japanese Wikipedia by",
        "`scripts/fetch_images.py`. Missing entries fall back to the generated",
        "placeholders produced by `scripts/generate_placeholders.py`.",
        "",
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
    print(f"\nDone. {ok} ok / {miss} missing. Missing images keep their placeholders.")
    # Always exit 0 so the CI's follow-up steps (URL fetch, commit) still run
    # even if every Wikipedia request failed.
    return 0


if __name__ == "__main__":
    sys.exit(main())
