# Image credits

このディレクトリには 2 種類の画像が含まれます。

## 1. 装飾プレースホルダー（リポジトリ同梱）
`scripts/generate_placeholders.py` で生成した、グラデーション + 城/海モチーフ
のオリジナル画像です。外部の権利物は含みません。アプリの初期表示用です。

```
python3 scripts/generate_placeholders.py [--force]
```

## 2. 実写写真（任意・上書き）
`scripts/fetch_images.py` を実行すると Wikimedia Commons / Wikipedia から
各アトラクションの写真を取得し、プレースホルダーを上書きします。GitHub
Actions ワークフロー "Fetch attraction images and URLs" から実行できます。

```
python3 scripts/fetch_images.py
```

実写を取得すると本ファイルが各画像のソース URL で自動的に上書きされます。
取得に失敗した項目はプレースホルダーのままになります。
