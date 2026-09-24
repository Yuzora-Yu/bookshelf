import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  loadBooks,
  loadArchivedBooks,
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
  assert.equal(book.edition, "revised-20260920-3");
  assert.equal(book.chapters.length, 24);
  assert.match(book.chapters[0].title, /^第一章　返却済み/);
  assert.match(book.chapters.at(-1).body, /了$/);
  assert.equal(progressKey(book.id), `yuzora:bookshelf:progress:v1:${book.id}`);
  assert.notEqual(progressKey(book.id, book.edition), progressKey(book.id));
  const buildInfo = JSON.parse(await fs.readFile(path.join(root, "dist/build-info.json"), "utf8"));
  const catalog = JSON.parse(await fs.readFile(path.join(root, "dist/assets/catalog.json"), "utf8"));
  const versions = catalog.filter((b) => b.id === book.id);
  assert.equal(versions.length, 4);
  assert.equal(new Set(versions.map((b) => b.readBase)).size, 4);
  const saved = progress({ chapter: 20, anchor: "p004", updatedAt: 123 }, 30);
  const legacy = versions.find((b) => !b.edition);
  assert.equal(
    resumeUrl(legacy, saved),
    `${buildInfo.base}books/ame-wo-tojikomeru/read/20.html#p004`,
  );
  for (const [chapter, asset, anchor] of [["07", "campus-20260920.svg", "私も廊下までついていった"], ["06", "north-20260920.svg", "北町の戸は普通の鍵"]]) {
    const html = await fs.readFile(path.join(root, `dist/books/${book.id}/read/${book.edition}/${chapter}.html`), "utf8");
    assert.ok(html.indexOf(asset) > html.indexOf(anchor));
    assert.ok(html.indexOf(asset) < html.indexOf("</article>"));
    assert.match(html, /data-edition="revised-20260920-3"/);
  }
  const oldChapter = await fs.readFile(path.join(root, `dist/books/${book.id}/read/02.html`), "utf8");
  assert.match(oldChapter, /edition-chip archive">旧版/);
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
test("vol.002 ninth revision is complete and keeps every earlier edition separate", async () => {
  const book = (await loadBooks(root)).find((b) => b.id === "mukae-no-nai-asa");
  assert.equal(book.number, "002");
  assert.equal(book.status, "completed");
  assert.equal(book.edition, "revised-20260925-9");
  assert.equal(book.chapters.length, 28);
  assert.match(book.chapters[0].title, /^序章/);
  assert.match(book.chapters[1].title, /^第一章　工具箱/);
  assert.match(book.chapters[2].title, /^第二章　面識/);
  assert.match(book.chapters[3].title, /^第三章　撮影室/);
  assert.match(book.chapters[14].title, /^第十四章　片方の補助輪/);
  assert.match(book.chapters[15].title, /^第十五章　空の椅子/);
  assert.match(book.chapters[22].title, /^第二十二章　返す日/);
  assert.match(book.chapters.at(-2).title, /^第二十六章　向かいの席/);
  assert.match(book.chapters.at(-1).title, /^終章/);
  assert.match(book.chapters.at(-1).body, /次の話を聞いた。$/);
  const detail = await fs.readFile(path.join(root, "dist/books/mukae-no-nai-asa/index.html"), "utf8");
  assert.match(detail, /序章から読む/);
  assert.match(detail, /序章・本編26章・終章/);
  assert.match(detail, /第四改稿版/);
  assert.match(detail, /第五改稿版/);
  assert.match(detail, /第六改稿版/);
  assert.match(detail, /第七改稿版/);
  assert.match(detail, /第八改稿版/);
  assert.match(detail, /最新版/);
  assert.match(detail, /第三改稿版/);
  assert.match(detail, /第二改稿版/);
  assert.match(detail, /第一改稿版/);
  assert.match(detail, /箱二つと、ミシン一台/);
  assert.doesNotMatch(detail, /characters-revised6-pencil\.png/);
  assert.match(detail, /characters-revised8-20260924\.png/);
  for (const chapter of book.chapters) {
    const number = String(chapter.number).padStart(2, "0");
    const html = await fs.readFile(path.join(root, `dist/books/mukae-no-nai-asa/read/${book.edition}/${number}.html`), "utf8");
    assert.doesNotMatch(html, /class="reader-figure/);
  }
  const opening = await fs.readFile(path.join(root, `dist/books/mukae-no-nai-asa/read/${book.edition}/01.html`), "utf8");
  assert.ok(!opening.includes("factory-pencil.png"));
  const factory = await fs.readFile(path.join(root, `dist/books/mukae-no-nai-asa/read/${book.edition}/08.html`), "utf8");
  assert.ok(!factory.includes("factory-pencil.png"));
});
test("vol.003 retains its complete sequence and introduces diagrams only with their prose", async () => {
  const books = await loadBooks(root);
  const book = books.find((b) => b.id === "hako-no-soto-de-machiawase");
  assert.equal(book.number, "003");
  assert.equal(book.edition, "revised-20260920-3");
  assert.equal(book.characters.length, 9);
  assert.equal(book.status, "completed");
  assert.equal(book.chapters.length, 27);
  assert.ok(book.charCount > 20000);
  assert.match(book.chapters[0].title, /^序章/);
  assert.match(book.chapters.at(-1).title, /^終章/);
  assert.match(book.chapters.at(-1).body, /了$/);
  for (const quote of ["「僕が運びました」", "「東倉庫まで。頼まれたとおりに」", "「中は見た？」"])
    assert.ok(book.chapters[19].body.includes(quote));
  assert.equal(books.filter((b) => b.featured).length, 1);
  assert.ok(books.indexOf(book) < books.findIndex((b) => b.number === "002"));
  const opening = await fs.readFile(path.join(root, `dist/books/${book.id}/read/${book.edition}/01.html`), "utf8");
  assert.ok(!opening.includes("cases.svg"));
  assert.ok(!opening.includes("folding-wall.svg"));
  for (const [key, file, anchor] of [["06", "cases.svg", "積込みに使うフォルダへ保存した"], ["07", "folding-wall.svg", "横幅が三分の一になった"]]) {
    const html = await fs.readFile(path.join(root, `dist/books/${book.id}/read/${book.edition}/${key}.html`), "utf8");
    assert.ok(html.indexOf(file) > html.indexOf(anchor));
    assert.ok(html.indexOf(file) < html.indexOf("</article>"));
    assert.match(html, /class="reader-figure inline-figure" open/);
  }
  const detail = await fs.readFile(path.join(root, `dist/books/${book.id}/index.html`), "utf8");
  assert.match(detail, /小劇場に集う九人の鉛筆画/);
});
test("vol.004 keeps all thirty chapters and introduces its inn before using its layout", async () => {
  const books = await loadBooks(root);
  const book = books.find((b) => b.number === "004");
  assert.equal(book.id, "yama-wo-oriru-niwa-mada-hayai");
  assert.equal(book.status, "completed");
  assert.equal(book.chapters.length, 30);
  assert.ok(book.charCount > 20000);
  assert.equal(books[0].id, book.id);
  assert.equal(books.filter((b) => b.featured).length, 1);
  assert.ok(book.featured);
  assert.match(book.chapters[0].title, /^序章/);
  assert.match(book.chapters.at(-1).title, /^終章/);
  assert.equal(book.edition, "revised-20260921");
  const diagram = await fs.readFile(path.join(root, `dist/books/${book.id}/read/${book.edition}/05.html`), "utf8");
  assert.ok(diagram.indexOf("inn.svg") > diagram.indexOf("庭から右へ、玄関へ上がる坂が延びていた。"));
  assert.ok(diagram.indexOf("inn.svg") < diagram.indexOf("</article>"));
  const opening = await fs.readFile(path.join(root, `dist/books/${book.id}/read/${book.edition}/01.html`), "utf8");
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

// Hashes normalize line endings only; editing any archived prose must fail.
test("all four originals remain intact and each edition has independent URLs and progress", async () => {
  const originals = await loadBooks(root, "content/editions");
  const current = await loadBooks(root);
  const expected = JSON.parse(await fs.readFile(path.join(root, "docs/archived-manuscripts.json"), "utf8"));
  assert.equal(originals.length, 4);
  assert.equal(current.length, 4);
  const catalog = JSON.parse(await fs.readFile(path.join(root, "dist/assets/catalog.json"), "utf8"));
  assert.equal(catalog.length, 20);
  const counts = { "001": [30, 80684], "002": [25, 47840], "003": [22, 31491], "004": [23, 35910] };
  for (const book of originals) {
    assert.deepEqual([book.chapters.length, book.charCount], counts[book.number.padStart(3, "0")]);
    const dir = path.join(root, "content/editions", book.id, "chapters");
    assert.deepEqual((await fs.readdir(dir)).sort(), Object.keys(expected[book.id]).sort());
    for (const [file, hash] of Object.entries(expected[book.id])) {
      const prose = (await fs.readFile(path.join(dir, file), "utf8")).replaceAll("\r\n", "\n");
      assert.equal(crypto.createHash("sha256").update(prose).digest("hex"), hash, book.id + "/" + file);
    }
    const editions = catalog.filter(b => b.id === book.id);
    assert.equal(new Set(editions.map(b => b.readBase)).size, book.id === "mukae-no-nai-asa" ? 10 : book.id === "ame-wo-tojikomeru" ? 4 : 3);
    const revised = current.find(b => b.id === book.id);
    assert.equal(revised.edition, book.id === "mukae-no-nai-asa" ? "revised-20260925-9" : ["ame-wo-tojikomeru", "hako-no-soto-de-machiawase"].includes(book.id) ? "revised-20260920-3" : "revised-20260921");
    assert.notEqual(progressKey(book.id), progressKey(book.id, revised.edition));
    const oldHtml = await fs.readFile(path.join(root, "dist/books", book.id, "read/01.html"), "utf8");
    assert.match(oldHtml, /edition-chip archive">旧版/);
    const newHtml = await fs.readFile(path.join(root, "dist/books", book.id, "read", revised.edition, "01.html"), "utf8");
    assert.ok(newHtml.includes(`data-edition="${revised.edition}"`));
  }
});


test("archived revisions preserve prose, metadata and saved reading locations", async () => {
  const hashes = JSON.parse(await fs.readFile(path.join(root, "docs/archived-revised-manuscripts.json"), "utf8"));
  for (const [edition, files] of Object.entries(hashes)) {
    for (const [name, hash] of Object.entries(files)) {
      const text = (await fs.readFile(path.join(root, "content/revisions", edition, name), "utf8")).replaceAll("\r\n", "\n");
      assert.equal(crypto.createHash("sha256").update(text).digest("hex"), hash, edition + "/" + name);
    }
  }
  const id = "mukae-no-nai-asa";
  const archives = await loadArchivedBooks(root);
  const firstRevision = archives.find(b => b.id === id && b.edition === "revised-20260918");
  const secondRevision = archives.find(b => b.id === id && b.edition === "revised-20260918-2");
  const thirdRevision = archives.find(b => b.id === id && b.edition === "revised-20260919-3");
  const fourthRevision = archives.find(b => b.id === id && b.edition === "revised-20260919-4");
  const fifthRevision = archives.find(b => b.id === id && b.edition === "revised-20260920-5");
  const sixthRevision = archives.find(b => b.id === id && b.edition === "revised-20260920-6");
  const eighthRevision = archives.find(b => b.id === id && b.edition === "revised-20260923-8");
  assert.equal(firstRevision.chapters.length, 25);
  assert.equal(secondRevision.chapters.length, 21);
  assert.equal(thirdRevision.chapters.length, 22);
  assert.equal(fourthRevision.chapters.length, 24);
  assert.equal(fifthRevision.chapters.length, 24);
  assert.equal(sixthRevision.chapters.length, 25);
  assert.equal(eighthRevision.chapters.length, 27);
  assert.match(eighthRevision.chapters[2].title, /^第二章　四分/);
  const buildInfo = JSON.parse(await fs.readFile(path.join(root, "dist/build-info.json"), "utf8"));
  const catalog = JSON.parse(await fs.readFile(path.join(root, "dist/assets/catalog.json"), "utf8"));
  const versions = catalog.filter(b => b.id === id);
  assert.equal(versions.length, 10);
  assert.equal(new Set(versions.map(b => progressKey(id, b.edition))).size, 10);
  const old = versions.find(b => b.edition === firstRevision.edition);
  assert.equal(
    resumeUrl(old, progress({ chapter: 25, anchor: "p004", updatedAt: 1 }, 25)),
    `${buildInfo.base}books/${id}/read/revised-20260918/25.html#p004`,
  );
  const detailPath = old.href.startsWith(buildInfo.base)
    ? old.href.slice(buildInfo.base.length)
    : old.href.replace(/^\/+/, "");
  const detail = await fs.readFile(path.join(root, "dist", detailPath, "index.html"), "utf8");
  assert.ok(detail.includes("最新版へ戻る"));
  assert.ok(detail.includes("第九改稿版（最新版）"));
  const firstChapter = await fs.readFile(path.join(root, "dist/books", id, "read/revised-20260918/02.html"), "utf8");
  assert.ok(firstChapter.includes("studio-pencil.png"));
  assert.ok(!firstChapter.includes("studio-interior-revised2-pencil.png"));
  const secondChapter = await fs.readFile(path.join(root, "dist/books", id, "read/revised-20260918-2/02.html"), "utf8");
  assert.ok(secondChapter.includes("studio-interior-revised2-pencil.png"));
  const thirdOpening = await fs.readFile(path.join(root, "dist/books", id, "read/revised-20260919-3/01.html"), "utf8");
  assert.ok(thirdOpening.includes('data-edition="revised-20260919-3"'));
  assert.ok(thirdOpening.includes("宮下が最初にしたのは、通報ではなかった"));
  const fourth = versions.find(b => b.edition === fourthRevision.edition);
  assert.equal(resumeUrl(fourth, progress({ chapter: 20, anchor: "p004", updatedAt: 1 }, 24)), `${buildInfo.base}books/${id}/read/revised-20260919-4/20.html#p004`);
  const fourthFactory = await fs.readFile(path.join(root, "dist/books", id, "read/revised-20260919-4/08.html"), "utf8");
  assert.ok(fourthFactory.includes("factory-pencil.png"));
  const fifth = versions.find(b => b.edition === fifthRevision.edition);
  assert.equal(resumeUrl(fifth, progress({ chapter: 15, anchor: "p004", updatedAt: 1 }, 24)), `${buildInfo.base}books/${id}/read/revised-20260920-5/15.html#p004`);
  const fifthChapter = await fs.readFile(path.join(root, "dist/books", id, "read/revised-20260920-5/15.html"), "utf8");
  assert.match(fifthChapter, /第十四章　金曜十時/);
  const sixth = versions.find(b => b.edition === sixthRevision.edition);
  assert.equal(resumeUrl(sixth, progress({ chapter: 15, anchor: "p004", updatedAt: 1 }, 25)), `${buildInfo.base}books/${id}/read/revised-20260920-6/15.html#p004`);
  const sixthChapter = await fs.readFile(path.join(root, "dist/books", id, "read/revised-20260920-6/15.html"), "utf8");
  assert.match(sixthChapter, /第十四章　片方の補助輪/);
  const newChapter = await fs.readFile(path.join(root, "dist/books", id, "read/revised-20260921-7/16.html"), "utf8");
  assert.match(newChapter, /第十五章　空の椅子/);
  const currentOpening = await fs.readFile(path.join(root, "dist/books", id, "read/revised-20260921-7/01.html"), "utf8");
  assert.ok(currentOpening.includes('data-edition="revised-20260921-7"'));
});
