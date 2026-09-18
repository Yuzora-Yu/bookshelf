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
  resumeUrl,
  searchable,
} from "../public/assets/storage.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("all 30 chapters and the complete manuscript are retained", async () => {
  const book = (await loadBooks(root)).find(
    (b) => b.id === "ame-wo-tojikomeru",
  );
  assert.equal(book.chapters.length, 30);
  assert.equal(book.charCount, 80684);
  assert.match(book.chapters[0].title, /箱の底/);
  assert.match(book.chapters[29].title, /返却口/);
  assert.equal(book.status, "completed");
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
    2 + info.books.reduce((n, b) => n + 1 + b.chapters, 0),
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
});
