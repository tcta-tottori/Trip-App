#!/usr/bin/env bash
# Wikimedia から画像を取得して images/ 配下に保存する Python スクリプトの薄いラッパ。
# 実体は scripts/fetch_images.py（依存: Python 3.9+ / Pillow）。
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 が見つかりません。" >&2
  exit 1
fi

if ! python3 -c 'import PIL' >/dev/null 2>&1; then
  echo "Pillow が必要です。次のいずれかでインストールしてください。" >&2
  echo "  pip install Pillow" >&2
  echo "  python3 -m pip install --user Pillow" >&2
  exit 1
fi

exec python3 "$ROOT/scripts/fetch_images.py" "$@"
