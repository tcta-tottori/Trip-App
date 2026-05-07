# Disney Trip 2026

2026年6月6日〜8日の東京ディズニーリゾート2泊3日旅行のための統合 Web アプリ。

## 構成

- **`docs/`** — 印刷／PDF対応の旅程資料（HTML）
- **`app/`** — 当日スマホで使う PWA 旅行アプリ（オフライン対応）
- **`data/`** — アトラクション・旅程・チェックリストの JSON データ
- **`images/`** — 画像アセット（取得は `scripts/fetch-images.sh`）
- **`scripts/`** — 画像取得スクリプト

## ローカル確認

```bash
# 簡易サーバ起動（任意のもの）
python3 -m http.server 8000
# → http://localhost:8000/docs/  旅程資料
# → http://localhost:8000/app/   PWA アプリ
```

PWA は `https://` または `localhost` でないと Service Worker が動きません。

## 画像取得

```bash
# imagemagick + jq + curl が必要
bash scripts/fetch-images.sh
```

取得失敗した画像は、フォールバック UI（絵文字 + グラデーション）で代替表示されます。

## デプロイ

`main` への push で GitHub Pages に自動デプロイ（`.github/workflows/deploy.yml`）。

- 旅程資料: `https://<owner>.github.io/<repo>/docs/`
- 旅行アプリ: `https://<owner>.github.io/<repo>/app/`

## 旅行情報

- 山本一家（夫婦 + 4歳児・身長 102cm）
- ANA292（往路）/ ANA297（復路）
- 1泊目: 浦安ブライトンホテル東京ベイ
- 2泊目: SPA&HOTEL 舞浜ユーラシア

## ライセンス

コード MIT。プライベート用途。
