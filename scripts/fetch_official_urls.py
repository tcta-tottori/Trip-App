#!/usr/bin/env python3
"""Tokyo Disney Resort 公式サイトの一覧ページから、各アトラクションの
公式詳細ページ URL を取得して `data/attractions.json` に `url` を書き込む。

Wikipedia から画像を引いてくる `fetch_images.py` と組み合わせて使う。

ネットワーク制限のある環境では tokyodisneyresort.jp が弾かれることがある。
その場合は CI (GitHub Actions) 上で動かす。
"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ATTR_JSON = ROOT / "data" / "attractions.json"

LIST_URLS = {
    "land": "https://www.tokyodisneyresort.jp/tdl/attraction.html",
    "sea": "https://www.tokyodisneyresort.jp/tds/attraction.html",
}
SEARCH_BASE = "https://search.tokyodisneyresort.jp/?q="

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

DETAIL_HREF = re.compile(
    r'href="(?P<path>/(?:tdl|tds)/attraction/detail/\d+/?)"[^>]*>(?P<inner>.*?)</a>',
    re.S,
)
TAG = re.compile(r"<[^>]+>")
SPACE = re.compile(r"\s+")


def fetch_html(url: str) -> str | None:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ja,en;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"! failed to fetch {url}: {e}", file=sys.stderr)
        return None


def normalize(s: str) -> str:
    """名前マッチング用に記号と空白を落とす。"""
    s = TAG.sub("", s)
    s = s.replace("　", " ")
    s = SPACE.sub("", s)
    for ch in '"“”\'\'：:!！?？・、，,()（）「」『』&＆-ー―〜～':
        s = s.replace(ch, "")
    return s.lower()


def parse_list_page(html: str) -> dict[str, str]:
    """{normalized_name: full_url} を返す。"""
    out: dict[str, str] = {}
    for m in DETAIL_HREF.finditer(html):
        path = m.group("path")
        inner = m.group("inner")
        text = SPACE.sub(" ", TAG.sub(" ", inner)).strip()
        if not text:
            continue
        key = normalize(text)
        if not key:
            continue
        url = f"https://www.tokyodisneyresort.jp{path}"
        out.setdefault(key, url)
    return out


def find_url(name: str, table: dict[str, str]) -> str | None:
    key = normalize(name)
    if key in table:
        return table[key]
    # 部分一致で救う
    for k, v in table.items():
        if k and (k in key or key in k):
            return v
    return None


def search_url(name: str) -> str:
    return SEARCH_BASE + urllib.parse.quote(name, safe="")


def main() -> int:
    data = json.loads(ATTR_JSON.read_text(encoding="utf-8"))
    attractions = data["attractions"]

    tables: dict[str, dict[str, str]] = {}
    for park, url in LIST_URLS.items():
        html = fetch_html(url)
        tables[park] = parse_list_page(html) if html else {}
        print(f"[{park}] parsed {len(tables[park])} detail links")

    matched = fallback = 0
    for a in attractions:
        park = a.get("park")
        table = tables.get(park, {})
        url = find_url(a["name"], table)
        if url:
            a["url"] = url
            matched += 1
        else:
            a["url"] = search_url(a["name"])
            fallback += 1
            print(f"  fallback: {a['name']}")

    ATTR_JSON.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"\nDone. matched={matched} fallback={fallback} total={len(attractions)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
