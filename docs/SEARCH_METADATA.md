# 本棚の検索メタデータ

- 全ページのタブタイトルは `ページの内容 | YU-ZORA`。トップは本棚名とミステリー執筆実験、作品は書名、章は章名と書名を先頭に置く。
- `scripts/build.mjs` が title / OG / Twitter / canonical をまとめて生成する。作品・章の説明文は原稿メタデータから作り、本文の先の展開を抜き出さない。
- 公開作品は `Book`、章は `Chapter`、一覧は `CollectionPage` / `ItemList`、ページの位置は `BreadcrumbList` で表す。書名、章の順序、原稿の日付、公開URL、共有画像を使用する。
- 本文がChatGPTの執筆実験であることは既存の説明文に沿って記載する。評価・レビュー数・著者・ISBNなど、登録のない情報は追加しない。
- 最新版だけをサイトマップに含め、作品の `updatedAt` / `publishedAt` をlastmodに用いる。旧版と404は静的出力でもnoindex。旧版の閲覧制限とレスポンスヘッダーは既存のWorkerが管理する。
- 旧版のタブには版名を付け、複数版を開いても区別できるようにする。
- `npm run check`、`npm run build`、`npm test` でリンク・閲覧制限・タイトルの一意性・構造化データを確認する。
