import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildActivity } from "../scripts/activity.mjs";
import { loadBooks } from "../scripts/content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date("2026-10-23T03:00:00Z");
const options = { root, base: "/bookshelf/", siteUrl: "https://yu-zora.com", now };
const example = (overrides = {}) => ({
  id: "sample", title: "A book", status: "completed",
  publishedAt: "2026-09-01", updatedAt: "2026-10-01",
  description: "Introduction", chapters: [{ number: 1, title: "First", body: "Text\nMore text" }],
  ...overrides,
});
const hash = async (book) => (await buildActivity([book], options)).books[0].contentHash;

test("activity aggregates only current public books and exports no manuscript", async () => {
  const books = await loadBooks(root);
  const actual = JSON.parse(await fs.readFile(path.join(root, "dist/activity.json"), "utf8"));
  const { base } = JSON.parse(await fs.readFile(path.join(root, "dist/build-info.json"), "utf8"));
  const expected = await buildActivity(books, { root, base, siteUrl: options.siteUrl });
  assert.deepEqual(actual, expected);
  assert.equal(actual.count, actual.books.length);
  assert.equal(actual.latestPublishedAt, actual.books.map((book) => book.publishedAt).sort().at(-1) || null);
  assert.equal(actual.latestUpdatedAt, actual.books.map((book) => book.updatedAt).sort().at(-1) || null);
  for (const book of actual.books) {
    assert.match(book.contentHash, /^[0-9a-f]{64}$/);
    assert.equal(book.url, `https://yu-zora.com${base}books/${book.id}/`);
    assert.deepEqual(Object.keys(book), ["id", "title", "url", "publishedAt", "updatedAt", "edition", "contentHash"]);
  }
  assert.doesNotMatch(JSON.stringify(actual), /cold-sleep|chapters|body|characters|_sealed|private-access/);
});

test("new books are discovered without a registry while drafts, private and future books stay out", async () => {
  const visible = example();
  const hidden = [
    { archived: true }, { published: false }, { draft: true }, { private: true },
    { unlisted: true }, { visibility: "private" }, { visibility: "unlisted" },
    { status: "draft" }, { publishedAt: "2026-10-24" },
  ].map((flags, index) => example({ id: `hidden-${index}`, ...flags }));
  const result = await buildActivity([visible, ...hidden, example({ id: "new-book", publishedAt: "2026-10-23", updatedAt: "2026-10-23" })], options);
  assert.deepEqual(result.books.map((book) => book.id), ["new-book", "sample"]);
  assert.equal(result.count, 2);
  assert.equal(result.latestPublishedAt, "2026-10-23");
  assert.equal(result.latestUpdatedAt, "2026-10-23");
});

test("only reader-facing content changes its stable hash, not dates, edition labels or build surroundings", async () => {
  const book = example({ readingGuide: { focus: "A", tone: "B" } });
  const original = await hash(book);
  assert.deepEqual(await buildActivity([book], options), await buildActivity([book], { ...options, now: new Date("2026-10-24T03:00:00Z") }));
  assert.equal(await hash({ ...book, updatedAt: "2026-10-22", edition: "new-edition", featured: true }), original);
  assert.equal(await hash({ ...book, readingGuide: { tone: "B", focus: "A" }, chapters: [{ number: 1, title: "First", body: "Text\r\nMore text" }] }), original);
  assert.equal(await hash({ ...book, buildTime: "2026-10-23", navigation: "TOOLS", styles: "new.css" }), original);
  assert.equal(await hash({ ...book, featuredBanner: "featured-banner.webp" }), original);
  assert.equal(await hash({ ...book, socialImage: "social-card.png" }), original);
  assert.notEqual(await hash({ ...book, chapters: [{ ...book.chapters[0], body: "Revised text" }] }), original);
  assert.notEqual(await hash({ ...book, description: "Revised introduction" }), original);
  assert.notEqual(await hash({ ...book, chapters: [...book.chapters, { number: 2, title: "Second", body: "Next" }] }), original);
});

test("JST publication boundary and future revision metadata cannot advance the feed early", async () => {
  const book = example({ publishedAt: "2026-10-24", updatedAt: "2026-10-24" });
  assert.equal((await buildActivity([book], { ...options, now: new Date("2026-10-23T14:59:59Z") })).count, 0);
  assert.equal((await buildActivity([book], { ...options, now: new Date("2026-10-23T15:00:00Z") })).count, 1);
  assert.equal((await buildActivity([example({ updatedAt: "2099-01-01" })], options)).latestUpdatedAt, "2026-09-01");
});

test("book artwork revisions change the hash even when the filename stays the same", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "books-activity-"));
  const asset = path.join(temp, "public/assets/books/sample/cover.png");
  try {
    await fs.mkdir(path.dirname(asset), { recursive: true });
    await fs.writeFile(asset, "first artwork");
    const before = await buildActivity([example({ cover: "cover.png" })], { ...options, root: temp });
    await fs.writeFile(asset, "revised artwork");
    const after = await buildActivity([example({ cover: "cover.png" })], { ...options, root: temp });
    assert.notEqual(before.books[0].contentHash, after.books[0].contentHash);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test("SVG checkout line endings do not create a false revision", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "books-activity-svg-"));
  const asset = path.join(temp, "public/assets/books/sample/cover.svg");
  try {
    await fs.mkdir(path.dirname(asset), { recursive: true });
    await fs.writeFile(asset, "<svg>\n</svg>\n");
    const before = await buildActivity([example({ cover: "cover.svg" })], { ...options, root: temp });
    await fs.writeFile(asset, "<svg>\r\n</svg>\r\n");
    const after = await buildActivity([example({ cover: "cover.svg" })], { ...options, root: temp });
    assert.equal(before.books[0].contentHash, after.books[0].contentHash);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
