import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  escape as e,
  loadBooks,
  loadArchivedBooks,
  normalizeBase,
  renderMarkdown,
} from "./content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  await fs.readFile(path.join(root, "site.config.json"), "utf8"),
);
const base = normalizeBase(process.env.BASE_PATH || config.basePath);
const origin = process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : "";
const dist = path.join(root, "dist");
// Only the generated, fixed-name output folder is replaced.
if (path.dirname(dist) !== root || path.basename(dist) !== "dist")
  throw new Error("Unsafe output directory");
await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await fs.cp(path.join(root, "public"), dist, { recursive: true });
const books = await loadBooks(root);
const archivedBooks = await loadArchivedBooks(root);
const allEditions = [...books, ...archivedBooks];
const currentImages = new Set(books.flatMap((b) =>
  [b.cover, b.portrait, ...(b.illustrations || []).map((f) => f.file)]
    .filter(Boolean).map((name) => `/assets/books/${b.id}/${name}`)));
const archiveImages = [...new Set(archivedBooks.flatMap((b) =>
  [b.cover, b.portrait, ...(b.illustrations || []).map((f) => f.file)]
    .filter(Boolean).map((name) => `/assets/books/${b.id}/${name}`)))];
await fs.mkdir(path.join(root, "worker/generated"), { recursive: true });
await fs.writeFile(path.join(root, "worker/generated/edition-policy.json"), JSON.stringify({
  latestReadPrefixes: books.map((b) => `/books/${b.id}/read/${b.edition ? b.edition + "/" : ""}`),
  protectedAssets: archiveImages.filter((name) => !currentImages.has(name)),
}, null, 2) + "\n");
const editionKeys = allEditions.map((b) => `${b.id}:${b.edition || ""}`);
if (new Set(editionKeys).size !== editionKeys.length) throw new Error("Duplicate book edition");
const url = (s) => base + s;
const bookPath = (b) => `books/${b.id}/${b.archived ? `editions/${b.edition || "original"}/` : ""}`;
const bookUrl = (b) => url(bookPath(b));
const readPath = (b) => `books/${b.id}/read/${b.edition ? b.edition + "/" : ""}`;
const readUrl = (b, n = 1) =>
  url(`${readPath(b)}${String(n).padStart(2, "0")}.html`);
const asset = (b, name) => url(`assets/books/${b.id}/${name}`);
const status = (b) => (b.status === "completed" ? "完結" : "連載中");
const contentsLabel = (b) => e(b.contentsLabel || `全${b.chapters.length}章`);
const icon =
  '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M4 6q6-2 12 2 6-4 12-2v20q-6-2-12 2-6-4-12-2zM16 8v20" stroke="currentColor" stroke-width="1.5"/></svg>';
const tags = (b) =>
  `<span class="status-tag">${status(b)}</span>${b.genres.map((g) => `<span class="genre-tag">${e(g)}</span>`).join("")}`;
const dateLabel = (date) => date.replaceAll("-", ".");
const editionOrder = (id) =>
  allEditions
    .filter((book) => book.id === id)
    .sort((a, b) => {
      if (!a.edition) return -1;
      if (!b.edition) return 1;
      return a.edition.localeCompare(b.edition);
    });
const revisionName = (book, versions = editionOrder(book.id)) => {
  if (!book.edition) return "初版";
  const revisions = versions.filter((version) => version.edition);
  const index = revisions.findIndex((version) => version.edition === book.edition);
  const labels = ["第一", "第二", "第三", "第四", "第五", "第六", "第七", "第八", "第九", "第十"];
  return index >= 0 && index < labels.length
    ? `${labels[index]}改稿版`
    : book.editionLabel || "改稿版";
};
const editionSwitcher = (book, compact = false) => {
  const versions = editionOrder(book.id);
  if (versions.length < 2) return "";
  const latest = versions.find((version) => !version.archived) || versions.at(-1);
  const name = revisionName(book, versions);
  const lock = book.archived ? `<form class="archive-lock" method="post" action="${url("archive-access/logout")}"><button type="submit">旧版の閲覧を終了する</button></form>` : "";
  if (compact) {
    return `<p class="reader-edition"><span class="edition-chip ${book.archived ? "archive" : "latest"}">${book.archived ? "旧版" : "最新版"}</span><strong>${e(name)}</strong><a href="${bookUrl(book)}#editions">版を確認する →</a></p>${lock}`;
  }
  const links = versions
    .filter((version) => version !== book)
    .map((version) => {
      const targetName = revisionName(version, versions);
      const suffix = version === latest ? "（最新版）" : "（要パスワード）";
      return `<a href="${bookUrl(version)}"><span>${e(targetName)}${suffix}</span><small>${e(dateLabel(version.updatedAt || version.publishedAt))}</small></a>`;
    })
    .join("");
  return `<nav class="edition-switcher" id="editions" aria-label="版を選ぶ"><div class="edition-current"><span class="edition-chip ${book.archived ? "archive" : "latest"}">${book.archived ? "旧版" : "最新版"}</span><div><strong>${e(name)}</strong><small>${e(dateLabel(book.updatedAt || book.publishedAt))}</small></div>${book.archived && latest ? `<a class="edition-latest-link" href="${bookUrl(latest)}">最新版へ戻る →</a>` : ""}</div><div class="edition-links"><span>別の版を読む</span>${links}</div>${lock}</nav>`;
};
const footer = () =>
  `<footer class="site-footer wrap"><a class="footer-brand" href="${url("")}">${icon}<span>夕空の本棚<small>YU-ZORA BOOKSHELF</small></span></a><p>日常を少し離れて、物語の中へ。</p><a href="${e(config.portalUrl)}">YU-ZORA PORTAL <span aria-hidden="true">↗</span></a><small>© YU-ZORA · 作品の無断転載はご遠慮ください。</small></footer>`;
const header = () =>
  `<header class="site-header"><div class="wrap header-inner"><a class="brand" href="${url("")}">${icon}<span>YU-ZORA <b>BOOKSHELF</b></span></a><nav aria-label="メインナビゲーション"><a href="${url("#library")}">作品一覧</a><a href="${url("#about")}">この本棚について</a><a class="portal-link" href="${e(config.portalUrl)}">ポータルへ <span aria-hidden="true">↗</span></a></nav></div></header>`;
function page({
  title,
  description = config.description,
  content,
  route = "",
  reader = false,
  attributes = "",
}) {
  return `<!doctype html><html lang="ja"${reader ? ' data-reader="true"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${e(description)}"><meta name="theme-color" content="#111b2c"><title>${e(title)} | 夕空の本棚</title><meta property="og:title" content="${e(title)} | 夕空の本棚"><meta property="og:description" content="${e(description)}"><meta property="og:type" content="${reader ? "article" : "website"}">${origin ? `<link rel="canonical" href="${origin}${url(route)}"><meta property="og:url" content="${origin}${url(route)}">` : ""}<link rel="icon" href="${url("assets/favicon.svg")}" type="image/svg+xml">${reader ? `<script>try{const s=JSON.parse(localStorage.getItem('yuzora:bookshelf:preferences:v1')||'{}');if(['paper','white','night'].includes(s.theme))document.documentElement.dataset.theme=s.theme;if([18,20,23,26].includes(s.font))document.documentElement.style.setProperty('--reading-size',s.font+'px')}catch{}</script>` : ""}<link rel="stylesheet" href="${url("assets/styles.css")}"><script type="module" src="${url(reader ? "assets/reader.js" : "assets/site.js")}"></script></head><body ${attributes}><a class="skip-link" href="#main">本文へ移動</a>${content}</body></html>`;
}
async function write(name, text) {
  const f = path.join(dist, name);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, text, "utf8");
}
const featured = books.find((b) => b.featured) || books[0];
const allGenres = [...new Set(books.flatMap((b) => b.genres))];
const hero = featured
  ? `<section class="hero wrap" aria-labelledby="hero-title"><div class="hero-copy"><p class="eyebrow"><span></span> YU-ZORA ORIGINAL STORIES</p><h1 id="hero-title">余白に、<br>物語を。</h1><p class="hero-lead">いつもの画面から、まだ知らない場所へ。<br>あなたのペースで、一章ずつ。</p><div class="hero-book-meta"><span>${e(featured.featureLabel || "おすすめの一冊")}</span><i></i><span>VOL. ${e(featured.number || "01")}</span></div><h2>${e(featured.title)}</h2><p class="hero-description">${e(featured.description)}</p><div class="hero-actions"><a class="button button-dark" href="${readUrl(featured)}">物語を読む <span aria-hidden="true">→</span></a><a class="text-link" href="${bookUrl(featured)}">作品について</a></div><p class="micro-meta">${status(featured)} <span>／</span> ${contentsLabel(featured)} <span>／</span> 約${(featured.charCount / 10000).toFixed(1)}万字</p></div><a class="hero-art" href="${bookUrl(featured)}" aria-label="${e(featured.title)}の作品紹介"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><span class="vertical-note">${e(featured.featureNote || "日常を少し離れて、物語の中へ。")}</span><div class="book-object"><img src="${asset(featured, featured.cover)}" width="480" height="680" alt="${e(featured.title)}の表紙" fetchpriority="high"></div><div class="art-caption"><span>YU-ZORA ORIGINAL</span><span>VOL. ${e(featured.number || "01")}</span></div></a></section>`
  : "";
const cards = books
  .map(
    (b) =>
      `<article class="book-card" data-book="${b.id}" data-search="${e([b.title, b.reading, b.description, ...b.genres, ...b.tags].join(" "))}" data-genres="${e(b.genres.join("|"))}" data-status="${b.status}"><a class="card-cover" href="${bookUrl(b)}" tabindex="-1" aria-hidden="true"><img src="${asset(b, b.cover)}" width="480" height="680" alt="" loading="lazy"></a><div class="card-body"><div class="tags">${tags(b)}</div><h3><a href="${bookUrl(b)}">${e(b.title)}</a></h3><p>${e(b.description)}</p><div class="card-bottom"><span>${contentsLabel(b)} · 約${(b.charCount / 10000).toFixed(1)}万字</span><a href="${bookUrl(b)}" class="card-link" aria-label="${e(b.title)}の作品紹介へ">作品をひらく <span aria-hidden="true">↗</span></a></div></div></article>`,
  )
  .join("");
await write(
  "index.html",
  page({
    title: "余白に、物語を。",
    content: `${header()}<main id="main">${hero}<section class="continue-section wrap" id="continue-reading" hidden aria-label="読みかけの本"><div class="continue-mark" aria-hidden="true">▱</div><div><span class="eyebrow">YOUR BOOKMARK</span><h2 id="continue-title"></h2><p id="continue-position"></p></div><a class="button button-outline" id="continue-link" href="${url("#library")}">続きを読む →</a></section><section class="library wrap" id="library" aria-labelledby="library-title"><div class="section-heading"><div><p class="eyebrow">THE COLLECTION</p><h2 id="library-title">本棚を眺める<span class="count">${String(books.length).padStart(2, "0")}</span></h2></div><p>気になる一冊を、ここから。</p></div><form class="search-form" role="search"><label class="search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg><input type="search" id="search" name="q" placeholder="タイトル・キーワードで探す" aria-label="タイトル・キーワードで探す" autocomplete="off"><button type="button" id="clear-search" aria-label="検索をクリア" hidden>×</button></label><label class="filter-select"><span>ジャンル</span><select id="genre" name="genre"><option value="">すべて</option>${allGenres.map((g) => `<option>${e(g)}</option>`).join("")}</select></label></form><div class="result-meta"><span id="result-count" role="status" aria-live="polite">${books.length}作品</span><span>すべて無料で読めます</span></div><div class="book-grid">${cards}</div><div class="empty-state" id="empty-state" hidden><h3>その言葉の本は、まだ本棚にありません。</h3><p>別のキーワードで探してみてください。</p><button class="button button-outline" id="reset-search" type="button">検索条件をリセット</button></div></section><section class="about-section" id="about"><div class="wrap about-grid"><div><p class="eyebrow">ABOUT THIS SHELF</p><h2>一冊ずつ、<br>増えていく本棚。</h2></div><div><p>ここは、YU-ZORAのオリジナル小説を集めた場所。<br>静かな物語も、眠れなくなる謎も。<br>その日の気分で、気軽に手に取ってください。</p><p class="about-note">登録なしで、すぐに読めます。読んだ位置はこのブラウザに保存されるので、途中で閉じても、続きから。文字の大きさや背景の色も、読みやすいものを選べます。</p></div></div></section></main>${footer()}`,
    attributes: `data-base="${base}"`,
  }),
);
for (const b of allEditions) {
  const editionNotice = editionSwitcher(b);
  const readerEditionNotice = editionSwitcher(b, true);
  const toc = b.chapters
    .map(
      (c) =>
        `<li><a href="${readUrl(b, c.number)}"><span class="toc-number">${c.key}</span><span>${e(c.title.replace(/^第.+?章　/, ""))}</span><span aria-hidden="true">→</span></a></li>`,
    )
    .join("");
  const detail = `${header()}<main id="main" class="wrap detail-main"><nav class="breadcrumb" aria-label="パンくず"><a href="${url("")}">本棚</a><span aria-hidden="true">／</span><span>${e(b.title)}</span></nav><section class="detail-hero"><div class="detail-cover"><img src="${asset(b, b.cover)}" width="480" height="680" alt="${e(b.title)}の表紙"></div><div class="detail-copy"><p class="eyebrow">VOLUME ${e(b.number || "")} · YU-ZORA ORIGINAL</p><div class="tags">${tags(b)}</div><h1>${e(b.title)}</h1><p class="subtitle">${e(b.subtitle || "")}</p>${editionNotice}<p>${e(b.description)}</p><dl class="book-facts"><div><dt>長さ</dt><dd>${b.charCount.toLocaleString("ja-JP")}字</dd></div><div><dt>収録</dt><dd>${contentsLabel(b)}</dd></div><div><dt>初回掲載</dt><dd><time datetime="${b.publishedAt}">${dateLabel(b.publishedAt)}</time></dd></div>${b.updatedAt !== b.publishedAt ? `<div><dt>最終更新</dt><dd><time datetime="${b.updatedAt}">${dateLabel(b.updatedAt)}</time></dd></div>` : ""}</dl><a class="button button-dark" href="${readUrl(b)}">${e(b.startLabel || "はじめから読む")} <span aria-hidden="true">→</span></a><a class="button button-outline detail-resume" data-resume="${b.id}:${b.edition || ""}" href="${readUrl(b)}" hidden>続きから読む →</a><div class="book-keywords">${b.tags.map((t) => `<span>#${e(t)}</span>`).join("")}</div></div></section><div class="detail-columns"><div><section class="synopsis"><p class="eyebrow">STORY</p><h2>この物語について</h2>${b.intro.map((p) => `<p>${e(p)}</p>`).join("")}</section><section class="cast-section"><details><summary>登場人物を見る<span>ネタバレなし ＋</span></summary>${b.portrait ? `<figure><img src="${asset(b, b.portrait)}" width="1536" height="1024" alt="${e(b.portraitAlt || "登場人物六人のモノクロ線画")}" loading="lazy"><figcaption>${e(b.portraitCaption)} <a href="${asset(b, b.portrait)}" target="_blank" rel="noopener">大きな画像を開く ↗</a></figcaption></figure>` : ""}<dl class="cast-list">${b.characters.map((c) => `<div><dt>${e(c.name)}<small>${e(c.reading)}</small></dt><dd>${e(c.description)}</dd></div>`).join("")}</dl></details></section><p class="fiction-note">本作はフィクションです。人物・団体・事件は架空です。${b.portrait ? "<br>人物画は画像生成を使用しています。" : ""}</p><a class="download-link" href="${bookUrl(b)}full.txt" download>全文をテキストで保存 ↓</a></div><section class="detail-toc" aria-labelledby="toc-title"><div class="section-heading"><h2 id="toc-title">目次</h2><span>${contentsLabel(b)}</span></div><ol class="toc-list">${toc}</ol></section></div></main>${footer()}`;
  await write(
    `${bookPath(b)}index.html`,
    page({
      title: b.title,
      description: b.description,
      route: bookPath(b),
      content: detail,
      attributes: `data-base="${base}"`,
    }),
  );
  await write(
    `${bookPath(b)}full.txt`,
    b.title +
      "\n\n" +
      b.chapters
        .map(
          (c) =>
            c.title +
            "\n\n" +
            c.body.replace(/^> ?/gm, "").replace(/\*\*/g, ""),
        )
        .join("\n\n\n") +
      "\n",
  );
  for (const c of b.chapters) {
    const next = b.chapters[c.number],
      prev = b.chapters[c.number - 2];
    let paragraph = 0;
    let body = renderMarkdown(c.body).replace(
      /<p>/g,
      () => `<p id="p${String(paragraph++).padStart(3, "0")}">`,
    );
    for (const f of (b.illustrations || []).filter((f) => f.chapter === c.number && f.position === "inline")) {
      const paragraphs = [...body.matchAll(/<p id="p\d+">[\s\S]*?<\/p>/g)].filter((m) => m[0].includes(e(f.afterParagraph)));
      if (!f.afterParagraph || paragraphs.length !== 1) throw new Error(`${b.id}: illustration anchor must match one paragraph`);
      const markup = `<details class="reader-figure inline-figure" open><summary>${e(f.alt)} <span aria-hidden="true">（開く／閉じる）</span></summary><figure><img src="${asset(b, f.file)}" alt="${e(f.alt)}" loading="lazy"><figcaption>${e(f.caption)} <a href="${asset(b, f.file)}" target="_blank" rel="noopener">大きな画像を開く ↗</a></figcaption></figure></details>`;
      body = body.replace(paragraphs[0][0], paragraphs[0][0] + markup);
    }
    const images = (position) => (b.illustrations || [])
      .filter((f) => f.chapter === c.number && (f.position || "before") === position)
      .map(
        (f) =>
          `<details class="reader-figure"><summary>${e(f.alt)}を見る <span aria-hidden="true">＋</span></summary><figure><img src="${asset(b, f.file)}" alt="${e(f.alt)}" loading="lazy"><figcaption>${e(f.caption)} <a href="${asset(b, f.file)}" target="_blank" rel="noopener">大きな画像を開く ↗</a></figcaption></figure></details>`,
      )
      .join("");
    const content = `<header class="reader-header"><a class="reader-back" href="${bookUrl(b)}"><span aria-hidden="true">←</span><span>${e(b.title)}</span></a><div class="reader-tools"><button data-dialog="contents" type="button">目次</button><button data-dialog="preferences" type="button" aria-label="文字サイズと配色の設定"><span aria-hidden="true">Aa</span><span class="tool-label">表示設定</span></button></div></header><div class="reading-progress" aria-hidden="true"><span id="progress-bar"></span></div><main id="main" class="reading-main"><div class="chapter-heading">${readerEditionNotice}<p class="eyebrow">CHAPTER ${c.key} <span>／ ${b.chapters.length}</span></p><h1>${e(c.title)}</h1></div>${images("before")}<article class="prose" id="prose">${body}</article>${images("after")}<nav class="reader-next" aria-label="前後の章">${next ? `<span class="eyebrow">NEXT CHAPTER</span><a class="next-chapter" href="${readUrl(b, next.number)}"><span>${e(next.title)}</span><span aria-hidden="true">→</span></a>` : `<p class="finished-message">${b.status === "completed" ? `『${e(b.title)}』を、最後まで。<br>お読みいただき、ありがとうございました。` : "公開中の章はここまでです。<br>次の更新をお待ちください。"}</p><a class="button button-dark" href="${url("")}">本棚に戻る →</a>`}<div class="reader-secondary">${prev ? `<a href="${readUrl(b, prev.number)}">← 前の章</a>` : "<span></span>"}<a href="${bookUrl(b)}">作品紹介に戻る</a><span>${c.number} / ${b.chapters.length}</span></div></nav><p class="reading-notice" id="save-notice" aria-live="polite">読んだ位置は、このブラウザに自動で保存されます。</p></main><dialog id="contents" aria-labelledby="contents-title"><div class="dialog-heading"><h2 id="contents-title">目次</h2><button data-close type="button" aria-label="目次を閉じる">×</button></div><p class="dialog-book">${e(b.title)}</p><ol class="toc-list">${b.chapters.map((ch) => `<li><a ${ch.number === c.number ? 'aria-current="page"' : ""} href="${readUrl(b, ch.number)}"><span class="toc-number">${ch.key}</span><span>${e(ch.title.replace(/^第.+?章　/, ""))}</span>${ch.number === c.number ? '<span class="current-label">読書中</span>' : '<span aria-hidden="true">→</span>'}</a></li>`).join("")}</ol></dialog><dialog id="preferences" aria-labelledby="preferences-title"><div class="dialog-heading"><h2 id="preferences-title">読みやすく整える</h2><button data-close type="button" aria-label="表示設定を閉じる">×</button></div><fieldset><legend>文字の大きさ</legend><div class="setting-options">${[
      [18, "小"],
      [20, "標準"],
      [23, "大"],
      [26, "特大"],
    ]
      .map(
        ([v, l]) =>
          `<label><input type="radio" name="font" value="${v}"${v === 20 ? " checked" : ""}><span>${l}</span></label>`,
      )
      .join(
        "",
      )}</div></fieldset><fieldset><legend>背景の色</legend><div class="setting-options">${[
      ["paper", "生成り"],
      ["white", "白"],
      ["night", "夜"],
    ]
      .map(
        ([v, l]) =>
          `<label><input type="radio" name="theme" value="${v}"${v === "paper" ? " checked" : ""}><span class="theme-swatch theme-${v}">${l}</span></label>`,
      )
      .join(
        "",
      )}</div></fieldset><p class="settings-note">設定と読んだ位置はこのブラウザだけに保存されます。別の端末には同期されません。</p><button class="button button-outline" type="button" id="reset-preferences">表示設定を初期値に戻す</button></dialog>`;
    await write(
      `${readPath(b)}${c.key}.html`,
      page({
        title: `${c.title} — ${b.title}`,
        description: `${b.title} ${c.title}`,
        route: `${readPath(b)}${c.key}.html`,
        content,
        reader: true,
        attributes: `data-base="${base}" data-book="${b.id}" data-edition="${b.edition || ""}" data-chapter="${c.key}" data-total="${b.chapters.length}"`,
      }),
    );
  }
}
await write(
  "assets/catalog.json",
  JSON.stringify(
    allEditions.map((b) => ({
      id: b.id,
      edition: b.edition || "",
      title: b.title + (b.archived ? `（${b.editionLabel || "初版"}）` : ""),
      chapters: b.chapters.map((c) => ({ key: c.key, title: c.title })),
      href: bookUrl(b),
      readBase: url(readPath(b)),
    })),
  ),
);
await write(
  "404.html",
  page({
    title: "ページが見つかりません",
    content: `${header()}<main id="main" class="wrap not-found"><p class="eyebrow">404 / PAGE NOT FOUND</p><h1>そのページは、<br>見つかりませんでした。</h1><p>アドレスが変わったか、まだ本棚に並んでいないようです。</p><a href="${url("")}" class="button button-dark">本棚に戻る →</a></main>${footer()}`,
  }),
);
if (origin) {
  const paths = [
    "",
    ...books.flatMap((b) => [
      `books/${b.id}/`,
      ...b.chapters.map((c) => `${readPath(b)}${c.key}.html`),
    ]),
  ];
  await write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${e(origin + url(p))}</loc></url>`).join("")}</urlset>`,
  );
}
await write(
  "build-info.json",
  JSON.stringify(
    {
      base,
      archives: archivedBooks.map((b) => ({ id: b.id, chapters: b.chapters.length })),
      books: books.map((b) => ({
        id: b.id,
        chapters: b.chapters.length,
        characters: b.charCount,
      })),
    },
    null,
    2,
  ),
);
console.log(
  `Built ${books.length} book(s), ${books.reduce((n, b) => n + b.chapters.length, 0)} chapters → dist${base === "/" ? " (root)" : ` (mount ${base})`}`,
);
