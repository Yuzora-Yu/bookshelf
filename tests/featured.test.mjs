import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chooseFeaturedBook, applyFeaturedBook } from "../public/assets/featured.js";

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
  assert.deepEqual(node('[data-featured="cover"]').attributes, { src: selected.cover, alt: `${selected.title}の表紙` });
});

test("BOOKS initial HTML remains a complete reading entry without JavaScript", async () => {
  const html = await fs.readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<h1>BOOKS<\/h1>/);
  assert.match(html, /<title>BOOKS - 小説・読みもの \| YU-ZORA<\/title>/);
  assert.doesNotMatch(html, /夕空の本棚/);
  assert.match(html, /ChatGPT/);
  assert.match(html, /data-featured="read" href="[^"]+read\/[^"]+01.html"/);
  assert.match(html, /data-featured="cover" src="[^"]+"[^>]+alt="[^"]+の表紙"/);
  const pool = JSON.parse(html.match(/<script type="application\/json" id="featured-books-data">([^<]*)<\/script>/)[1]);
  const activity = JSON.parse(await fs.readFile(new URL("../dist/activity.json", import.meta.url), "utf8"));
  assert.deepEqual(pool.map((book) => book.id).sort(), activity.books.map((book) => book.id).sort());
  assert.doesNotMatch(JSON.stringify(pool), /cold-sleep|private-access|_sealed/);
});
