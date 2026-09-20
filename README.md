# 夕空の本棚 / YU-ZORA BOOKSHELF

オリジナル小説のための、スマートフォン・PC対応の静的Web本棚です。『雨を閉じこめる』『迎えのない朝』『箱の外で待ち合わせ』『山を下りるにはまだ早い』を収録しています。

## 起動

Node.js 22以上（推奨24）。外部パッケージのインストールは不要です。

```sh
npm run dev
```

表示先：<http://127.0.0.1:8787/bookshelf/>

原稿・CSSなどの変更後は `npm run build` を実行してブラウザを再読み込みします。自動監視はありません。サーバーだけ起動する場合は `npm run preview`。ポートは環境変数 `PORT` で変更できます。

```sh
npm run check
npm run build
npm test
```

## 収録機能

- 本棚、キーワード・ジャンル検索、作品紹介、登場人物、全章の目次
- 章ごとの固定URL。JavaScriptなしでも全編を読めます
- 作品ごとの読書位置保存と「続きから読む」
- 文字サイズ4段階、背景3種類（生成り・白・夜）
- 配置図は該当章で展開。人物画は作品紹介で展開
- 全文テキストのダウンロード
- キーボード操作、スキップリンク、ダイアログのフォーカス管理、動きを減らす設定への対応

読書位置と表示設定は端末のlocalStorageにのみ保存します。アカウント・解析・外部フォント・外部APIは使いません。別端末への同期はありません。ブラウザのデータを消すと読書位置も消えます。

## 作品を増やす

[原稿の追加方法](content/README.md)を参照。`content/books/<作品ID>/book.json` と `chapters/*.md`、画像を追加してビルドすると、本棚・検索・作品紹介・読書ページ・目次に反映されます。ページの複製作業は不要です。

## 公開とポータルへの組込み

`npm run build` の成果物は `dist/`。通常の静的ホスティングに配置できます。`dist/` は再生成可能なのでGit管理しません。

標準の配置先は `/bookshelf/`。将来の `https://yu-zora.com/bookshelf/` に合わせた設定です。ポータルからこのURLへリンクし、`dist/` の**中身**を公開領域の `bookshelf/` に配置してください。既存サイト全体への上書きやiframe埋込みは不要です。ヘッダーのポータルリンクは `site.config.json` の `portalUrl` で設定します。

PowerShellで本番用に生成する例：

```powershell
$env:BASE_PATH='/bookshelf/'
$env:SITE_URL='https://yu-zora.com'
npm run build
```

`BASE_PATH` は先頭・末尾の `/` が必須。独立ドメインのルートなら `/`。`SITE_URL` は公開先のオリジン（パスを含めない）で、指定するとcanonical URL・OG URL・sitemap.xmlを生成します。未指定なら誤った公開URLを出しません。配置先を変えたら必ず再ビルドしてください。

GitHub Pages用に手動実行の [Deploy Pages](.github/workflows/pages.yml) も用意しています。リポジトリの Settings → Pages → Source を GitHub Actions に設定し、Actionsから実行します。標準URLは `https://yuzora-yu.github.io/bookshelf/`。カスタムドメインなどで変更する場合は、実行時の入力を変更してください。このPagesワークフローはpushでは実行されません。本番CloudflareのGit連携は、これとは別の公開経路です。

参考：[GitHub公式・カスタムワークフローでのPages公開](https://docs.github.com/ja/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 構成

```text
content/books/       作品情報と章原稿（正本）
public/assets/       共通CSS/JS、表紙、人物画、配置図
scripts/             静的生成・ローカルサーバー
site.config.json     配置先・ポータルURL
 tests/              原稿・内部リンク・保存値の検証
 dist/               生成結果（編集しない）
```

設計理由は [docs/DECISIONS.md](docs/DECISIONS.md)、確認内容は [docs/QA.md](docs/QA.md) に記録しています。原稿や挿絵に再配布ライセンスは付与していません。

## Cloudflare本番公開（2026-09-18）

本番： https://yu-zora.com/bookshelf/

本棚専用Worker `yu-zora-bookshelf` を使用し、`yu-zora.com/bookshelf` と `yu-zora.com/bookshelf/*` のみを割り当てています。ポータル本体・他コンテンツ・トップのリンクは変更していません。DNS変更も不要でした。

認証済みのローカル環境から更新する場合：

```sh
npm run deploy:cloudflare
```

構文確認→本番URLでの生成→テスト→Wrangler 4.120.0でのデプロイを実行します。Cloudflareの認証情報はリポジトリに含めません。通常の本番公開は、Cloudflare側のGit連携でmainへのpushを起点に実行します。GitHub Actionsの検証CIと、Cloudflare側のビルド・公開は別の処理です。公開完了は本番URLの内容で確認します。Pagesのワークフローは別の公開先を使う場合の予備です。

Workerは公開URLの `/bookshelf` 接頭辞を静的アセット取得時に除きます。章の `.html` URLはそのまま維持し、フォルダーの末尾スラッシュだけを補完します。存在しないページは本棚の404ページを返します。

## vol.002と序章・終章のある作品

『迎えのない朝』を収録。序章＋本編23章＋終章、本文47,840字。制作中の調査・プロット・検証資料はリポジトリ外で管理し、完成原稿だけを収録しています。一作目の本文30章は変更していません。

`book.json` の任意項目 `startLabel`（例：`序章から読む`）と `contentsLabel`（例：`序章・本編23章・終章`）で、章構成に合わせた案内を指定できます。ファイル番号は目次順の連番で、本文の章番号と別です。未指定時は「はじめから読む」「全N章」。`featured: true` は本棚で大きく紹介する一冊にだけ付けます。

## vol.003

『箱の外で待ち合わせ』を収録。序章＋本編20章＋終章、本文31,491字。人物画8人と表紙原画は画像生成、本文の構造図2点はSVGです。図は対応する説明の直後に表示します。任意項目 `portraitAlt` で作品ごとの人物画の代替テキストを指定できます。同じ掲載日の作品は巻番号の新しい順に並びます。
