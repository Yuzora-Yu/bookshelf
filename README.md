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

標準の配置先は `https://yu-zora.com/bookshelf/`。旧版の閲覧認証を行うCloudflare Worker経由で公開します。`dist/` 単体の静的ホスティングは認証を実行できないため、公開先には使用しません。ヘッダーのポータルリンクは `site.config.json` の `portalUrl` で設定します。

PowerShellで本番用に生成する例：

```powershell
$env:BASE_PATH='/bookshelf/'
$env:SITE_URL='https://yu-zora.com'
npm run build
```

`BASE_PATH` は先頭・末尾の `/` が必須。独立ドメインのルートなら `/`。`SITE_URL` は公開先のオリジン（パスを含めない）で、指定するとcanonical URL・OG URL・sitemap.xmlを生成します。未指定なら誤った公開URLを出しません。配置先を変えたら必ず再ビルドしてください。

GitHub Pagesへの静的公開ワークフローは使用しません。本番の認証はWorkerの実行が必要です。ローカルの静的プレビューは原稿確認専用です。

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

構文確認→本番URLでの生成→テスト→Wrangler 4.135.0でのデプロイを実行します。Cloudflareの認証情報はリポジトリに含めません。通常の本番公開は、Cloudflare側のGit連携でmainへのpushを起点に実行します。GitHub Actionsの検証CIと、Cloudflare側のビルド・公開は別の処理です。公開完了は本番URLの内容で確認します。

Workerは公開URLの `/bookshelf` 接頭辞を静的アセット取得時に除きます。章の `.html` URLはそのまま維持し、フォルダーの末尾スラッシュだけを補完します。存在しないページは本棚の404ページを返します。

## vol.002と序章・終章のある作品

『迎えのない朝』の第九改稿版を収録。序章＋本編26章＋終章の全28編。初版から第八改稿版までの本文・URL・版ごとの読書位置を保持しています。制作中の調査・プロット・検証資料はリポジトリ外で管理し、完成原稿だけを収録しています。

`book.json` の任意項目 `startLabel`（例：`序章から読む`）と `contentsLabel`（例：`序章・本編23章・終章`）で、章構成に合わせた案内を指定できます。ファイル番号は目次順の連番で、本文の章番号と別です。未指定時は「はじめから読む」「全N章」。`featured: true` は本棚で大きく紹介する一冊にだけ付けます。

## vol.003

『箱の外で待ち合わせ』を収録。序章＋本編20章＋終章、本文31,491字。人物画8人と表紙原画は画像生成、本文の構造図2点はSVGです。図は対応する説明の直後に表示します。任意項目 `portraitAlt` で作品ごとの人物画の代替テキストを指定できます。同じ掲載日の作品は巻番号の新しい順に並びます。


## 旧版の閲覧認証

最新版の本文・紹介・全文テキストは公開。旧版の紹介ページ、章ページ、全文テキスト、旧版だけで使用する図版はWorkerで認証する。`worker/generated/edition-policy.json` はビルド時に現行の原稿情報から生成し、改稿時に保護対象が自動で切り替わる。

CloudflareのSecretに `ARCHIVE_PASSWORD` と `ARCHIVE_SESSION_SECRET`（十分に長い乱数）を設定する。値をGit、HTML、JavaScript、設定ファイルへ書かない。パスワード変更時は既存セッションも失効する。8時間有効の署名付きCookieはHttpOnly / Secure / SameSite=Lax、旧版の応答はprivate, no-store。本文や版別の読書位置は変更しない。

ローカル認証確認には `npm ci` 後、Git対象外の `.dev.vars` に二つのSecretを設定し、`npm run dev:worker` を使う。静的プレビューは原稿の確認用であり、公開・認証確認には使わない。認証設定が欠けている場合、旧版は503として閉じ、最新版だけを公開する。

本番のSecret設定は `npx wrangler secret bulk <Git対象外の環境変数ファイル>`。通常のPushによるデプロイは既存Secretを保持する。旧版ページの「旧版の閲覧を終了する」でこのブラウザの認証を解除できる。
