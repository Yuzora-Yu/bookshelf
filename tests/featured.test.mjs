import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chooseFeaturedBook, applyFeaturedBook, initializeFeaturedBook } from "../public/assets/featured.js";
import { loadBooks } from "../scripts/content.mjs";

const now = new Date("2026-10-23T03:00:00Z");
const books = ["first", "second", "third"].map((id) => ({
  id, title: id, publishedAt: "2026-10-01", cover: `${id}.png`,
  read: `/books/${id}/read/01.html`, detail: `/books/${id}/`,
  description: `About ${id}`, label: "Novel", number: id, note: id, meta: "Complete",
}));

test("a fresh load can select every published book without a fixed featured registry", () => {
  assert.equal(chooseFeaturedBook(books, () => 0, now).id, "first");
  assert.equal(chooseFeaturedBook(books, () => 0.5, now).id, "second");
  assert.equal(chooseFeaturedBook(books, () => 0.99, now).id, "third");
  assert.equal(chooseFeaturedBook([], () => 0, now), null);
});

test("random selection excludes future, archived and nonpublic works", () => {
  const hidden = [{ publishedAt: "2026-10-24" }, { archived: true },
    { private: true }, { published: false }, { draft: true }, { visibility: "private" }, { unlisted: true }]
    .map((flags, index) => ({ ...books[0], id: `hidden-${index}`, ...flags }));
  assert.equal(chooseFeaturedBook([...hidden, books[2]], () => 0, now).id, "third");
  assert.equal(chooseFeaturedBook(hidden, () => 0.99, now), null);
});

test("the browser never replaces a server-selected featured book", () => {
  const section = { dataset: { featuredSource: "server" } };
  const source = { get textContent() { throw new Error("Client selection must not run"); } };
  assert.doesNotThrow(() => initializeFeaturedBook({ querySelector: selector => selector === "#featured-book" ? section : source }));
});

test("cover, title, copy, alt and all actions always belong to one selected book", () => {
  const fields = new Map();
  const node = (name) => {
    if (!fields.has(name)) fields.set(name, { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } });
    return fields.get(name);
  };
  const section = {
    dataset: {},
    querySelector: (selector) => node(selector),
    querySelectorAll: (selector) => [node(selector)],
  };
  const selected = books[1];
  applyFeaturedBook(section, selected);
  assert.equal(section.dataset.book, selected.id);
  for (const name of ["title", "description", "label", "number", "note", "meta"])
    assert.equal(node(`[data-featured="${name}"]`).textContent, selected[name]);
  assert.equal(node('[data-featured="read"]').attributes.href, selected.read);
  assert.equal(node('[data-featured="detail"]').attributes.href, selected.detail);
  assert.equal(node('[data-featured="art"]').attributes.href, selected.detail);
  assert.equal(node('[data-featured="art"]').attributes["aria-label"], `${selected.title}の作品紹介`);
  assert.equal(node('[data-featured="art"]').attributes["data-artwork"], "cover");
  assert.deepEqual(node('[data-featured="cover"]').attributes, { src: selected.cover, alt: `${selected.title}の表紙`, width: "480", height: "680" });
  applyFeaturedBook(section, { ...selected, banner: "introduction.webp" });
  assert.equal(node('[data-featured="art"]').attributes["data-artwork"], "banner");
  assert.deepEqual(node('[data-featured="cover"]').attributes, { src: "introduction.webp", alt: `${selected.title}の紹介イラスト`, width: "1200", height: "630" });
  applyFeaturedBook(section, books[0]);
  assert.equal(node('[data-featured="art"]').attributes["data-artwork"], "cover");
  assert.deepEqual(node('[data-featured="cover"]').attributes, { src: books[0].cover, alt: `${books[0].title}の表紙`, width: "480", height: "680" });
});

test("BOOKS initial HTML remains a complete reading entry without JavaScript", async () => {
  const html = await fs.readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<main id="main"><h1 class="sr-only">BOOKS<\/h1><p class="home-trial-notice wrap">[^<]+<\/p><section class="hero wrap"/);
  assert.doesNotMatch(html, /books-heading/);
  assert.match(html, /<title>BOOKS - 小説・読みもの \| YU-ZORA<\/title>/);
  assert.doesNotMatch(html, /夕空の本棚/);
  assert.match(html, /ChatGPT/);
  assert.match(html, /data-featured="read" href="[^"]+read\/[^"]+01.html"/);
  assert.match(html, /data-featured="cover" src="[^"]+featured-banner-20261023\.webp" width="1200" height="630" alt="[^"]+の紹介イラスト"/);
  const pool = JSON.parse(html.match(/<script type="application\/json" id="featured-books-data">([^<]*)<\/script>/)[1]);
  const activity = JSON.parse(await fs.readFile(new URL("../dist/activity.json", import.meta.url), "utf8"));
  assert.deepEqual(pool.map((book) => book.id).sort(), activity.books.map((book) => book.id).sort());
  assert.doesNotMatch(JSON.stringify(pool), /cold-sleep|private-access|_sealed/);
});

test("only the featured illustration uses a banner; catalog and individual covers stay separate", async () => {
  const dist = new URL("../dist/", import.meta.url);
  const html = await fs.readFile(new URL("index.html", dist), "utf8");
  const pool = JSON.parse(html.match(/<script type="application\/json" id="featured-books-data">([^<]*)<\/script>/)[1]);
  assert(pool.some((book) => book.banner));
  assert.doesNotMatch(html, /揺らぐ友情/);
  for (const book of pool) {
    if (book.banner) {
      assert.match(book.banner, new RegExp(`/assets/books/${book.id}/[^/]+\\.webp$`));
      assert.notEqual(book.banner, book.cover);
    }
    const card = html.match(new RegExp(`<article class="book-card" data-book="${book.id}".*?</article>`))[0];
    assert(card.includes(`src="${book.cover}"`));
    assert(!card.includes(book.banner));
    const detail = await fs.readFile(new URL(`books/${book.id}/index.html`, dist), "utf8");
    assert(detail.includes(`<div class="detail-cover"><img src="${book.cover}"`));
    assert(!detail.includes(book.banner));
  }
});

test("featured banners are optional and their asset paths are checked", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "featured-book-assets-"));
  const directory = path.join(root, "content/books/sample");
  const assets = path.join(root, "public/assets/books/sample");
  const book = { id: "sample", title: "Sample", description: "Text", publishedAt: "2026-10-01", updatedAt: "2026-10-01", cover: "cover.svg", genres: ["Mystery"], tags: [], status: "completed" };
  const save = flags => fs.writeFile(path.join(directory, "book.json"), JSON.stringify({ ...book, ...flags }));
  try {
    await fs.mkdir(path.join(directory, "chapters"), { recursive: true });
    await fs.mkdir(assets, { recursive: true });
    await fs.writeFile(path.join(directory, "chapters/01_first.md"), "# First\n\nText");
    await fs.writeFile(path.join(assets, "cover.svg"), "<svg/>");
    await save({});
    assert.equal((await loadBooks(root))[0].featuredBanner, undefined);
    await save({ featuredBanner: "missing.webp" });
    await assert.rejects(() => loadBooks(root), { code: "ENOENT" });
    await save({ featuredBanner: "../outside.webp" });
    await assert.rejects(() => loadBooks(root), /must not contain a path/);
    await fs.writeFile(path.join(assets, "banner.webp"), "example");
    await save({ featuredBanner: "banner.webp" });
    assert.equal((await loadBooks(root))[0].featuredBanner, "banner.webp");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
