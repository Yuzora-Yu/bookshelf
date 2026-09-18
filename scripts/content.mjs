import fs from "node:fs/promises";
import path from "node:path";

export const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function normalizeBase(value) {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(value))
    throw new Error(
      "BASE_PATH must be / or a slash-delimited path such as /bookshelf/",
    );
  return value;
}
export function renderMarkdown(text) {
  const inline = (s) =>
    escape(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      if (/^\s*＊\s*$/.test(block))
        return '<div class="scene-break" role="separator">＊</div>';
      if (/^\s*了\s*$/.test(block)) return '<p class="fin">了</p>';
      if (block.startsWith(">"))
        return `<blockquote><p>${inline(block.replace(/^> ?/gm, "")).replace(/\n/g, "<br>")}</p></blockquote>`;
      return `<p>${inline(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}
export async function loadBooks(root) {
  const entries = await fs.readdir(path.join(root, "content/books"), {
    withFileTypes: true,
  });
  const books = [];
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const directory = path.join(root, "content/books", entry.name);
    const book = JSON.parse(
      await fs.readFile(path.join(directory, "book.json"), "utf8"),
    );
    if (book.id !== entry.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(book.id))
      throw new Error(`Invalid book id: ${book.id}`);
    for (const key of [
      "title",
      "description",
      "publishedAt",
      "updatedAt",
      "cover",
    ])
      if (typeof book[key] !== "string" || !book[key].trim())
        throw new Error(`${book.id}: missing ${key}`);
    if (!["completed", "ongoing"].includes(book.status))
      throw new Error(`${book.id}: invalid status`);
    if (
      !Array.isArray(book.genres) ||
      !book.genres.length ||
      !Array.isArray(book.tags)
    )
      throw new Error(`${book.id}: genres/tags required`);
    for (const date of [book.publishedAt, book.updatedAt])
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      )
        throw new Error(`${book.id}: invalid date`);
    const names = (await fs.readdir(path.join(directory, "chapters")))
      .filter((f) => f.endsWith(".md"))
      .sort((a, b) => Number(a.split("_")[0]) - Number(b.split("_")[0]));
    if (!names.length) throw new Error(`${book.id}: no chapters`);
    book.chapters = await Promise.all(
      names.map(async (name, i) => {
        if (!name.startsWith(String(i + 1).padStart(2, "0") + "_"))
          throw new Error(`${book.id}: chapter sequence error at ${name}`);
        const raw = (
          await fs.readFile(path.join(directory, "chapters", name), "utf8")
        )
          .replace(/\r\n/g, "\n")
          .trim();
        const [heading, ...rest] = raw.split("\n");
        if (!heading.startsWith("# "))
          throw new Error(`${name}: missing heading`);
        const body = rest.join("\n").trim();
        for (const [a, b] of [
          ["「", "」"],
          ["『", "』"],
          ["〈", "〉"],
        ])
          if (body.split(a).length !== body.split(b).length)
            throw new Error(`${name}: unbalanced ${a}${b}`);
        return {
          number: i + 1,
          key: String(i + 1).padStart(2, "0"),
          title: heading.slice(2),
          body,
        };
      }),
    );
    for (const image of [
      book.cover,
      book.portrait,
      ...(book.illustrations || []).map((i) => i.file),
    ].filter(Boolean)) {
      if (path.basename(image) !== image)
        throw new Error("Image file must not contain a path");
      await fs.access(path.join(root, "public/assets/books", book.id, image));
    }
    for (const figure of book.illustrations || [])
      if (!book.chapters[figure.chapter - 1])
        throw new Error("Invalid illustration chapter");
    book.characters ||= [];
    book.intro ||= [book.description];
    book.charCount = [
      ...book.chapters
        .map((c) => c.body.replace(/^> ?/gm, "").replace(/\*\*/g, ""))
        .join("")
        .replace(/\s/g, ""),
    ].length;
    books.push(book);
  }
  return books.sort(
    (a, b) =>
      b.publishedAt.localeCompare(a.publishedAt) ||
      (Number(b.number) || 0) - (Number(a.number) || 0) ||
      a.id.localeCompare(b.id),
  );
}
