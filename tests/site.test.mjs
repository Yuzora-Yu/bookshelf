import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadBooks,
  normalizeBase,
  renderMarkdown,
} from "../scripts/content.mjs";
import {
  preferences,
  progress,
  progressKey,
  resumeUrl,
  searchable,
} from "../public/assets/storage.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("all 30 original chapters and their manuscript are retained as an edition", async () => {
  const book = (await loadBooks(root, "content/editions")).find(
    (b) => b.id === "ame-wo-tojikomeru",
  );
  assert.equal(book.chapters.length, 30);
  assert.equal(book.charCount, 80684);
  assert.match(book.chapters[0].title, /箱の底/);
  assert.match(book.chapters[29].title, /返却口/);
  assert.equal(book.status, "completed");
});
test("the revised first novel has independent reading progress and correct diagram placement", async () => {
  const book = (await loadBooks(root)).find((b) => b.id === "ame-wo-tojikomeru");
  assert.equal(book.edition, "revised-20260918");
  assert.equal(book.chapters.length, 19);
  assert.match(book.chapters[0].title, /^序　/);
  assert.match(book.chapters.at(-1).body, /了$/);
  assert.equal(progressKey(book.id), `yuzora:bookshelf:progress:v1:${book.id}`);
  assert.notEqual(progressKey(book.id, book.edition), progressKey(book.id));
  const catalog = JSON.parse(await fs.readFile(path.join(root, "dist/assets/catalog.json"), "utf8"));
  const versions = catalog.filter((b) => b.id === book.id);
  assert.equal(versions.length, 2);
  assert.equal(new Set(versions.map((b) => b.readBase)).size, 2);
  const saved = progress({ chapter: 20, anchor: "p004", updatedAt: 123 }, 30);
  const legacy = versions.find((b) => !b.edition);
  assert.equal(resumeUrl(legacy, saved), "/bookshelf/books/ame-wo-tojikomeru/read/20.html#p004");
  for (const [chapter, asset, anchor] of [["03", "campus.svg", "保管室の床は廊下より一段高い"], ["13", "north.svg", "平屋の一室で、外へ出る戸は一つ"]]) {
    const html = await fs.readFile(path.join(root, `dist/books/${book.id}/read/${book.edition}/${chapter}.html`), "utf8");
    assert.ok(html.indexOf(asset) > html.indexOf(anchor));
    assert.ok(html.indexOf(asset) < html.indexOf("</article>"));
    assert.match(html, /data-edition="revised-20260918"/);
  }
  const oldChapter = await fs.readFile(path.join(root, `dist/books/${book.id}/read/02.html`), "utf8");
  assert.match(oldChapter, /旧版を表示しています/);
  assert.match(oldChapter, /data-edition=""/);
});
test("mount paths are explicit and cannot escape the site", () => {
  for (const base of ["/", "/bookshelf/", "/stories/books/"])
    assert.equal(normalizeBase(base), base);
  for (const invalid of [
    "//evil/",
    "/../",
    "bookshelf",
    "/bookshelf",
    "/<script>/",
  ])
    assert.throws(() => normalizeBase(invalid));
});
test("vol.002 is complete, and its opening is preserved in the later scene", async () => {
  const book = (await loadBooks(root)).find((b) => b.id === "mukae-no-nai-asa");
  assert.equal(book.number, "002");
  assert.equal(book.status, "completed");
  assert.equal(book.chapters.length, 25);
  assert.match(book.chapters[0].title, /^序章/);
  assert.match(book.chapters.at(-1).title, /^終章/);
  assert.match(book.chapters.at(-1).body, /了$/);
  assert.ok(book.chapters[18].body.includes(book.chapters[0].body));
  const detail = await fs.readFile(path.join(root, "dist/books/mukae-no-nai-asa/index.html"), "utf8");
  assert.match(detail, /序章から読む/);
  assert.match(detail, /序章・本編23章・終章/);
  assert.match(detail, /characters-pencil\.png/);
  assert.match(detail, /人物画は画像生成/);
  for (const [chapter, asset] of [["02", "studio-pencil.png"], ["15", "factory-pencil.png"]]) {
    const html = await fs.readFile(path.join(root, `dist/books/mukae-no-nai-asa/read/${chapter}.html`), "utf8");
    assert.ok(html.indexOf(asset) > html.indexOf('</article>'));
  }
  const opening = await fs.readFile(path.join(root, "dist/books/mukae-no-nai-asa/read/01.html"), "utf8");
  assert.ok(!opening.includes("factory-pencil.png"));
});
test("vol.003 retains its complete sequence and introduces diagrams only with their prose", async () => {
  const books = await loadBooks(root);
  const book = books.find((b) => b.id === "hako-no-soto-de-machiawase");
  assert.equal(book.number, "003");
  assert.equal(book.status, "completed");
  assert.equal(book.chapters.length, 22);
  assert.equal(book.charCount, 31491);
  assert.match(book.chapters[0].title, /^序章/);
  assert.match(book.chapters.at(-1).title, /^終章/);
  assert.match(book.chapters.at(-1).body, /了$/);
  for (const quote of ["「僕が運びました」", "「東倉庫まで。頼まれたとおりに」", "「中は見た？」"])
    assert.ok(book.chapters[15].body.includes(quote));
  assert.equal(books.filter((b) => b.featured).length, 1);
  assert.ok(books.indexOf(book) < books.findIndex((b) => b.number === "002"));
  const opening = await fs.readFile(path.join(root, `dist/books/${book.id}/read/01.html`), "utf8");
  assert.ok(!opening.includes("cases.svg"));
  assert.ok(!opening.includes("folding-wall.svg"));
  for (const [key, file, anchor] of [["04", "cases.svg", "積込みに使うフォルダへ保存した"], ["05", "folding-wall.svg", "横幅が三分の一になった"]]) {
    const html = await fs.readFile(path.join(root, `dist/books/${book.id}/read/${key}.html`), "utf8");
    assert.ok(html.indexOf(file) > html.indexOf(anchor));
    assert.ok(html.indexOf(file) < html.indexOf("</article>"));
    assert.match(html, /class="reader-figure inline-figure" open/);
  }
  const detail = await fs.readFile(path.join(root, `dist/books/${book.id}/index.html`), "utf8");
  assert.match(detail, /小劇場に集う八人の鉛筆画/);
});
test("vol.004 preserves the rescue opening and introduces its inn before using its layout", async () => {
  const books = await loadBooks(root);
  const book = books.find((b) => b.number === "004");
  assert.equal(book.id, "yama-wo-oriru-niwa-mada-hayai");
  assert.equal(book.status, "completed");
  assert.equal(book.chapters.length, 23);
  assert.equal(book.charCount, 35910);
  assert.equal(books[0].id, book.id);
  assert.equal(books.filter((b) => b.featured).length, 1);
  assert.ok(book.featured);
  assert.match(book.chapters[0].title, /^序章/);
  assert.match(book.chapters.at(-1).title, /^終章/);
  assert.match(book.chapters.at(-1).body, /了$/);
  const repeated = book.chapters[0].body.split(/\n\s*\n/).slice(2).join("\n\n");
  assert.ok(book.chapters[20].body.includes(repeated));
  const diagram = await fs.readFile(path.join(root, `dist/books/${book.id}/read/03.html`), "utf8");
  assert.ok(diagram.indexOf("inn.svg") > diagram.indexOf("建物の外の坂を上がる"));
  assert.ok(diagram.indexOf("inn.svg") < diagram.indexOf("</article>"));
  const opening = await fs.readFile(path.join(root, `dist/books/${book.id}/read/01.html`), "utf8");
  assert.ok(!opening.includes("inn.svg"));
  assert.ok(!opening.includes("guests-pencil.png"));
});
test("prose preserves paragraphs and quotes without allowing HTML injection", () => {
  const html = renderMarkdown(
    "一段目。\n続き。\n\n> **記録**\n\n<script>alert(1)</script>\n\n＊",
  );
  assert.match(html, /<p>一段目。<br>続き。<\/p>/);
  assert.match(html, /<blockquote><p><strong>記録<\/strong>/);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /role="separator"/);
});
test("bad or obsolete bookmarks cannot create unsafe links", () => {
  assert.equal(progress(null, 30), null);
  assert.equal(progress({ chapter: 31, updatedAt: 1 }, 30), null);
  assert.equal(progress({ chapter: 1, updatedAt: "bad" }, 30), null);
  const p = progress(
    { chapter: 2, anchor: "javascript:bad", updatedAt: 1, finished: true },
    30,
  );
  assert.equal(p.anchor, "p000");
  assert.equal(p.finished, false);
  assert.equal(
    resumeUrl({ readBase: "/books/x/read/" }, p),
    "/books/x/read/02.html#p000",
  );
  assert.equal(
    progress({ chapter: 30, updatedAt: 1, finished: true }, 30).finished,
    true,
  );
});
test("preferences recover from malformed stored data; search supports kana variants", () => {
  assert.deepEqual(preferences(null), { font: 20, theme: "paper" });
  assert.deepEqual(preferences({ font: 999, theme: "url(bad)" }), {
    font: 20,
    theme: "paper",
  });
  assert.deepEqual(preferences({ font: 26, theme: "night" }), {
    font: 26,
    theme: "night",
  });
  assert.equal(searchable("ミステリー Ａ"), searchable("みすてりー a"));
});
async function files(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    result.push(...(entry.isDirectory() ? await files(name) : [name]));
  }
  return result;
}
test("every generated internal page, asset and fragment resolves", async () => {
  const dist = path.join(root, "dist");
  const info = JSON.parse(
    await fs.readFile(path.join(dist, "build-info.json"), "utf8"),
  );
  const all = await files(dist);
  const htmlFiles = all.filter((f) => f.endsWith(".html"));
  assert.equal(
    htmlFiles.length,
    2 + [...info.books, ...(info.archives || [])].reduce((n, b) => n + 1 + b.chapters, 0),
  );
  for (const file of htmlFiles) {
    const html = await fs.readFile(file, "utf8");
    for (const match of html.matchAll(/(?:href|src)="([^"<>]+)"/g)) {
      const ref = match[1];
      if (/^(https?:|mailto:)/.test(ref)) continue;
      let [local, fragment] = ref.split("#");
      let target = file;
      if (local) {
        assert.ok(local.startsWith(info.base), `${file}: wrong mount ${ref}`);
        target = path.join(dist, local.slice(info.base.length));
        if (local.endsWith("/")) target = path.join(target, "index.html");
      }
      await fs.access(target);
      if (fragment && target.endsWith(".html")) {
        const destination = await fs.readFile(target, "utf8");
        assert.ok(
          destination.includes(`id="${fragment}"`),
          `${file}: missing fragment ${ref}`,
        );
      }
    }
  }
  assert.ok(!all.some((f) => /制作資料|検証|プロット/.test(f)));
  const chapter2 = await fs.readFile(
    path.join(dist, "books/ame-wo-tojikomeru/read/02.html"),
    "utf8",
  );
  assert.match(chapter2, /campus\.svg/);
  assert.ok(!chapter2.includes("north.svg"));
  assert.match(chapter2, /class="reader-figure inline-figure" open/);
  assert.ok(chapter2.indexOf('campus.svg') > chapter2.indexOf('保管室は廊下より一段高く'));
  assert.ok(chapter2.indexOf('campus.svg') < chapter2.indexOf('航がよく座るのは'));
  const chapter20 = await fs.readFile(path.join(dist, 'books/ame-wo-tojikomeru/read/20.html'), 'utf8');
  assert.match(chapter20, /class="reader-figure inline-figure" open/);
  assert.ok(chapter20.indexOf('north.svg') > chapter20.indexOf('瀬川は北町の資料室の見取り図を見せた'));
});
