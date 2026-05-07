#!/usr/bin/env bash
# fetch-images.sh — Wikimedia から各アトラクション画像を取得し
# 600x400 にリサイズして images/ 配下に保存します。
#
# 必要: curl, jq, imagemagick
#   brew install jq imagemagick    # macOS
#   apt-get install jq imagemagick # Debian/Ubuntu

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ATTR_DIR="$ROOT/images/attractions"
PARK_DIR="$ROOT/images/parks"
HOTEL_DIR="$ROOT/images/hotels"
CRED="$ROOT/images/_credits.md"

mkdir -p "$ATTR_DIR" "$PARK_DIR" "$HOTEL_DIR"
echo "# Image credits" > "$CRED"
echo "" >> "$CRED"
echo "All images sourced from Wikimedia Commons / Japanese Wikipedia under their respective licenses." >> "$CRED"
echo "Run \`bash scripts/fetch-images.sh\` to refresh." >> "$CRED"
echo "" >> "$CRED"

fetch_wiki_image() {
  local title="$1"
  local output="$2"
  local label="$3"

  # First try Japanese Wikipedia summary
  local url
  url=$(curl -s --max-time 15 \
    -H 'User-Agent: disney-trip-2026/1.0 (personal project)' \
    "https://ja.wikipedia.org/api/rest_v1/page/summary/$(printf %s "$title" | jq -sRr @uri)" \
    | jq -r '.originalimage.source // .thumbnail.source // empty')

  if [[ -z "$url" ]]; then
    # Try English
    url=$(curl -s --max-time 15 \
      -H 'User-Agent: disney-trip-2026/1.0' \
      "https://en.wikipedia.org/api/rest_v1/page/summary/$(printf %s "$title" | jq -sRr @uri)" \
      | jq -r '.originalimage.source // .thumbnail.source // empty')
  fi

  if [[ -n "$url" ]]; then
    if curl -s --max-time 30 -L \
        -H 'User-Agent: disney-trip-2026/1.0' \
        -o "${output}.tmp" "$url" && [[ -s "${output}.tmp" ]]; then
      if convert "${output}.tmp" -resize "600x400^" -gravity center -extent 600x400 -quality 85 "$output" 2>/dev/null; then
        rm -f "${output}.tmp"
        echo "✓ $output"
        echo "- **$label** — $url" >> "$CRED"
        return 0
      fi
    fi
    rm -f "${output}.tmp"
  fi
  echo "✗ $output (skipped — fallback UI will be used)"
}

# Land
fetch_wiki_image "イッツ・ア・スモールワールド" "$ATTR_DIR/small-world.jpg" "Small World"
fetch_wiki_image "ジャングルクルーズ" "$ATTR_DIR/jungle-cruise.jpg" "Jungle Cruise"
fetch_wiki_image "蒸気船マークトウェイン号" "$ATTR_DIR/mark-twain.jpg" "Mark Twain"
fetch_wiki_image "アリスのティーパーティー" "$ATTR_DIR/tea-party.jpg" "Tea Party"
fetch_wiki_image "キャッスルカルーセル" "$ATTR_DIR/carrousel.jpg" "Castle Carrousel"
fetch_wiki_image "トムソーヤ島" "$ATTR_DIR/tom-sawyer.jpg" "Tom Sawyer"
fetch_wiki_image "ウエスタンリバー鉄道" "$ATTR_DIR/western-river.jpg" "Western River RR"
fetch_wiki_image "ロジャーラビットのカートゥーンスピン" "$ATTR_DIR/roger-rabbit.jpg" "Roger Rabbit"
fetch_wiki_image "プーさんのハニーハント" "$ATTR_DIR/pooh.jpg" "Pooh's Hunny Hunt"
fetch_wiki_image "美女と野獣 \"魔法のものがたり\"" "$ATTR_DIR/beauty-beast.jpg" "Beauty and the Beast"
fetch_wiki_image "バズ・ライトイヤーのアストロブラスター" "$ATTR_DIR/buzz.jpg" "Buzz Lightyear"
fetch_wiki_image "ベイマックスのハッピーライド" "$ATTR_DIR/baymax.jpg" "Baymax"
fetch_wiki_image "モンスターズ・インク \"ライド&ゴーシーク!\"" "$ATTR_DIR/monsters-inc.jpg" "Monsters Inc"
fetch_wiki_image "ピーターパン空の旅" "$ATTR_DIR/peter-pan.jpg" "Peter Pan"
fetch_wiki_image "白雪姫と七人のこびと" "$ATTR_DIR/snow-white.jpg" "Snow White"
fetch_wiki_image "ホーンテッドマンション" "$ATTR_DIR/haunted-mansion.jpg" "Haunted Mansion"
fetch_wiki_image "スペース・マウンテン" "$ATTR_DIR/space-mountain.jpg" "Space Mountain"
fetch_wiki_image "スター・ツアーズ" "$ATTR_DIR/star-tours.jpg" "Star Tours"
fetch_wiki_image "スプラッシュ・マウンテン" "$ATTR_DIR/splash-mountain.jpg" "Splash Mountain"

# Sea
fetch_wiki_image "マーメイドラグーン" "$ATTR_DIR/mermaid-lagoon.jpg" "Mermaid Lagoon"
fetch_wiki_image "ジャンピン・ジェリーフィッシュ" "$ATTR_DIR/jellyfish.jpg" "Jellyfish"
fetch_wiki_image "ブローフィッシュ・バルーンレース" "$ATTR_DIR/blowfish.jpg" "Blowfish"
fetch_wiki_image "アリエルのプレイグラウンド" "$ATTR_DIR/ariel-playground.jpg" "Ariel Playground"
fetch_wiki_image "ジャスミンのフライングカーペット" "$ATTR_DIR/jasmine-carpet.jpg" "Jasmine Carpet"
fetch_wiki_image "ヴェネツィアン・ゴンドラ" "$ATTR_DIR/gondola.jpg" "Gondola"
fetch_wiki_image "ビッグシティ・ヴィークル" "$ATTR_DIR/big-city.jpg" "Big City Vehicles"
fetch_wiki_image "ディズニーシー・トランジットスチーマーライン" "$ATTR_DIR/transit-steamer.jpg" "Transit Steamer"
fetch_wiki_image "トイ・ストーリー・マニア!" "$ATTR_DIR/toy-story-mania.jpg" "Toy Story Mania"
fetch_wiki_image "ファンタジースプリングス" "$ATTR_DIR/rapunzel.jpg" "Fantasy Springs"
fetch_wiki_image "アナとエルサのフローズンジャーニー" "$ATTR_DIR/frozen-journey.jpg" "Frozen Journey"
fetch_wiki_image "シンドバッド・ストーリーブック・ヴォヤッジ" "$ATTR_DIR/sindbad.jpg" "Sindbad"
fetch_wiki_image "ニモ&フレンズ・シーライダー" "$ATTR_DIR/nemo.jpg" "Nemo"
fetch_wiki_image "タワー・オブ・テラー (東京ディズニーシー)" "$ATTR_DIR/tower-terror.jpg" "Tower of Terror"
fetch_wiki_image "ソアリン:ファンタスティック・フライト" "$ATTR_DIR/soaring.jpg" "Soaring"
fetch_wiki_image "ピーターパンのネバーランドアドベンチャー" "$ATTR_DIR/peter-pan-neverland.jpg" "Peter Pan Neverland"

# Parks
fetch_wiki_image "シンデレラ城" "$PARK_DIR/cinderella-castle.jpg" "Cinderella Castle"
fetch_wiki_image "プロメテウス火山" "$PARK_DIR/prometheus.jpg" "Mt. Prometheus"
fetch_wiki_image "ワールドバザール" "$PARK_DIR/world-bazaar.jpg" "World Bazaar"
fetch_wiki_image "メディテレーニアンハーバー" "$PARK_DIR/mediterranean-harbor.jpg" "Med Harbor"

# Hotels
fetch_wiki_image "浦安ブライトンホテル" "$HOTEL_DIR/brighton.jpg" "Brighton Hotel"
fetch_wiki_image "舞浜ユーラシア" "$HOTEL_DIR/eurasia.jpg" "Eurasia"

echo ""
echo "Done. Missing images will display the fallback UI (emoji + gradient)."
