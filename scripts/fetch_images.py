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


def fetch_summary_image(titles_by_lang: list[tuple[str, str]]) -> tuple[str, str] | None:
    """titles_by_lang = [(lang, title), ...] tried in order.
    Returns (image_url, "lang:title") of the first match, or None."""
    for lang, title in titles_by_lang:
        q = urllib.parse.quote(title, safe="")
        body = http_get(ACTION_TMPL.format(lang=lang, title=q))
        if body:
            src = extract_action_image(body)
            if src:
                return src, f"{lang}:{title}"
        body = http_get(SUMMARY_TMPL.format(lang=lang, title=q))
        if body:
            src = extract_summary_image(body)
            if src:
                return src, f"{lang}:{title}"
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


def fetch(titles_by_lang: list[tuple[str, str]], output: Path, label: str, credits: list[str]) -> bool:
    rel = output.relative_to(ROOT)
    result = fetch_summary_image(titles_by_lang)
    if not result:
        tried = ", ".join(f"{l}:{t}" for l, t in titles_by_lang)
        print(f"✗ {rel} (no image — tried {tried})")
        return False
    src, hit = result
    raw = download_image(src)
    if not raw:
        print(f"✗ {rel} (download failed: {src[:80]})")
        return False
    if not resize_cover(raw, output):
        print(f"✗ {rel} (resize failed)")
        return False
    print(f"✓ {rel}  via {hit}")
    credits.append(f"- **{label}** ({hit}) — {src}")
    return True


# Each target: (titles_by_lang, output filename, credits label)
# titles_by_lang is tried in order. Provide both ja and en candidates so that
# attractions without a ja article still resolve via en.wikipedia.org.
TARGETS_LAND = [
    ([("ja", "イッツ・ア・スモールワールド"),
      ("en", "It's a Small World")],
     "small-world.jpg", "Small World"),
    ([("ja", "ジャングルクルーズ"),
      ("en", "Jungle Cruise (attraction)"),
      ("en", "Jungle Cruise")],
     "jungle-cruise.jpg", "Jungle Cruise"),
    ([("ja", "蒸気船マークトウェイン号"),
      ("en", "Mark Twain Riverboat")],
     "mark-twain.jpg", "Mark Twain"),
    ([("ja", "アリスのティーパーティー"),
      ("en", "Mad Tea Party"),
      ("en", "Alice's Tea Party")],
     "tea-party.jpg", "Tea Party"),
    ([("ja", "キャッスルカルーセル"),
      ("en", "Castle Carrousel"),
      ("en", "King Arthur Carrousel")],
     "carrousel.jpg", "Castle Carrousel"),
    ([("ja", "トムソーヤ島"),
      ("en", "Tom Sawyer Island")],
     "tom-sawyer.jpg", "Tom Sawyer"),
    ([("ja", "ウエスタンリバー鉄道"),
      ("en", "Western River Railroad")],
     "western-river.jpg", "Western River RR"),
    ([("ja", "ロジャーラビットのカートゥーンスピン"),
      ("en", "Roger Rabbit's Car Toon Spin")],
     "roger-rabbit.jpg", "Roger Rabbit"),
    ([("ja", "プーさんのハニーハント"),
      ("en", "Pooh's Hunny Hunt"),
      ("en", "The Many Adventures of Winnie the Pooh (attraction)")],
     "pooh.jpg", "Pooh's Hunny Hunt"),
    ([("ja", '美女と野獣 "魔法のものがたり"'),
      ("ja", "美女と野獣 魔法のものがたり"),
      ("en", "Enchanted Tale of Beauty and the Beast"),
      ("en", "Beauty and the Beast: Magic Lasts Forever")],
     "beauty-beast.jpg", "Beauty and the Beast"),
    ([("ja", "バズ・ライトイヤーのアストロブラスター"),
      ("en", "Buzz Lightyear's Space Ranger Spin"),
      ("en", "Buzz Lightyear Astro Blasters")],
     "buzz.jpg", "Buzz Lightyear"),
    ([("ja", "ベイマックスのハッピーライド"),
      ("en", "The Happy Ride with Baymax")],
     "baymax.jpg", "Baymax"),
    ([("ja", 'モンスターズ・インク "ライド&ゴーシーク!"'),
      ("ja", "モンスターズ・インク ライド&ゴーシーク!"),
      ("en", "Monsters, Inc. Ride & Go Seek!"),
      ("en", "Monsters, Inc. Ride & Go Seek")],
     "monsters-inc.jpg", "Monsters Inc"),
    ([("ja", "ピーターパン空の旅"),
      ("en", "Peter Pan's Flight")],
     "peter-pan.jpg", "Peter Pan"),
    ([("ja", "白雪姫と七人のこびと"),
      ("en", "Snow White's Scary Adventures"),
      ("en", "Snow White's Adventures")],
     "snow-white.jpg", "Snow White"),
    ([("ja", "ホーンテッドマンション"),
      ("en", "Haunted Mansion")],
     "haunted-mansion.jpg", "Haunted Mansion"),
    ([("ja", "スペース・マウンテン"),
      ("en", "Space Mountain")],
     "space-mountain.jpg", "Space Mountain"),
    ([("ja", "スター・ツアーズ"),
      ("en", "Star Tours – The Adventures Continue"),
      ("en", "Star Tours")],
     "star-tours.jpg", "Star Tours"),
    ([("ja", "スプラッシュ・マウンテン"),
      ("en", "Splash Mountain")],
     "splash-mountain.jpg", "Splash Mountain"),
]
TARGETS_SEA = [
    ([("ja", "マーメイドラグーン"),
      ("en", "Mermaid Lagoon")],
     "mermaid-lagoon.jpg", "Mermaid Lagoon"),
    ([("ja", "ジャンピン・ジェリーフィッシュ"),
      ("en", "Jumpin' Jellyfish")],
     "jellyfish.jpg", "Jellyfish"),
    ([("ja", "ブローフィッシュ・バルーンレース"),
      ("en", "Blowfish Balloon Race")],
     "blowfish.jpg", "Blowfish"),
    ([("ja", "アリエルのプレイグラウンド"),
      ("en", "Ariel's Playground")],
     "ariel-playground.jpg", "Ariel Playground"),
    ([("ja", "ジャスミンのフライングカーペット"),
      ("en", "Jasmine's Flying Carpets"),
      ("en", "The Magic Carpets of Aladdin")],
     "jasmine-carpet.jpg", "Jasmine Carpet"),
    ([("ja", "ヴェネツィアン・ゴンドラ"),
      ("en", "Venetian Gondolas")],
     "gondola.jpg", "Gondola"),
    ([("ja", "ビッグシティ・ヴィークル"),
      ("en", "Big City Vehicles")],
     "big-city.jpg", "Big City Vehicles"),
    ([("ja", "ディズニーシー・トランジットスチーマーライン"),
      ("en", "DisneySea Transit Steamer Line")],
     "transit-steamer.jpg", "Transit Steamer"),
    ([("ja", "トイ・ストーリー・マニア!"),
      ("ja", "トイ・ストーリー・マニア！"),
      ("en", "Toy Story Midway Mania!"),
      ("en", "Toy Story Mania!")],
     "toy-story-mania.jpg", "Toy Story Mania"),
    ([("ja", "ファンタジースプリングス"),
      ("en", "Fantasy Springs")],
     "rapunzel.jpg", "Fantasy Springs"),
    ([("ja", "アナとエルサのフローズンジャーニー"),
      ("en", "Anna and Elsa's Frozen Journey"),
      ("en", "Frozen Ever After")],
     "frozen-journey.jpg", "Frozen Journey"),
    ([("ja", "シンドバッド・ストーリーブック・ヴォヤッジ"),
      ("en", "Sindbad's Storybook Voyage")],
     "sindbad.jpg", "Sindbad"),
    ([("ja", "ニモ&フレンズ・シーライダー"),
      ("ja", "ニモ＆フレンズ・シーライダー"),
      ("en", "Nemo & Friends SeaRider")],
     "nemo.jpg", "Nemo"),
    ([("ja", "タワー・オブ・テラー (東京ディズニーシー)"),
      ("ja", "タワー・オブ・テラー"),
      ("en", "The Twilight Zone Tower of Terror (Tokyo DisneySea)"),
      ("en", "The Twilight Zone Tower of Terror")],
     "tower-terror.jpg", "Tower of Terror"),
    ([("ja", "ソアリン:ファンタスティック・フライト"),
      ("ja", "ソアリン:ファンタスティック・フライト"),
      ("en", "Soarin' (attraction)"),
      ("en", "Soarin'")],
     "soaring.jpg", "Soaring"),
    ([("ja", "ピーターパンのネバーランドアドベンチャー"),
      ("en", "Peter Pan's Never Land Adventure")],
     "peter-pan-neverland.jpg", "Peter Pan Neverland"),
]
TARGETS_PARKS = [
    ([("ja", "シンデレラ城"),
      ("en", "Cinderella Castle")],
     "cinderella-castle.jpg", "Cinderella Castle"),
    ([("ja", "プロメテウス火山"),
      ("en", "Mount Prometheus"),
      ("ja", "東京ディズニーシー")],
     "prometheus.jpg", "Mt. Prometheus"),
    ([("ja", "ワールドバザール"),
      ("en", "World Bazaar"),
      ("ja", "東京ディズニーランド")],
     "world-bazaar.jpg", "World Bazaar"),
    ([("ja", "メディテレーニアンハーバー"),
      ("en", "Mediterranean Harbor")],
     "mediterranean-harbor.jpg", "Med Harbor"),
]
TARGETS_HOTELS = [
    ([("ja", "浦安ブライトンホテル"),
      ("en", "Urayasu Brighton Hotel")],
     "brighton.jpg", "Brighton Hotel"),
    ([("ja", "舞浜ユーラシア"),
      ("ja", "ホテルエミオン東京ベイ")],
     "eurasia.jpg", "Eurasia"),
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
    for titles, fname, label in TARGETS_LAND + TARGETS_SEA:
        if fetch(titles, ATTR_DIR / fname, label, credits):
            ok += 1
        else:
            miss += 1
    for titles, fname, label in TARGETS_PARKS:
        if fetch(titles, PARK_DIR / fname, label, credits):
            ok += 1
        else:
            miss += 1
    for titles, fname, label in TARGETS_HOTELS:
        if fetch(titles, HOTEL_DIR / fname, label, credits):
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
