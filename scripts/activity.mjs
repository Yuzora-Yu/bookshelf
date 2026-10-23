import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const contentFields = [
  "title", "reading", "subtitle", "description", "intro", "genres", "tags",
  "status", "characters", "readingGuide", "contentsLabel", "startLabel",
  "featureLabel", "featureNote",
  "cover", "portrait", "portraitAlt", "portraitCaption", "illustrations",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => {
  if (typeof value === "string") return value.replace(/\r\n/g, "\n");
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().filter((key) => value[key] !== undefined)
      .map((key) => [key, stable(value[key])]),
  );
  return value;
};
export const isPublicBook = (book, today) =>
  !book.archived && !book.private && !book.draft && !book.unlisted &&
  book.published !== false && (!book.visibility || book.visibility === "public") &&
  ["completed", "ongoing"].includes(book.status) &&
  typeof book.publishedAt === "string" && book.publishedAt <= today;

export async function buildActivity(books, { root, base, siteUrl, now = new Date() }) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const entries = [];
  for (const book of books.filter((item) => isPublicBook(item, today))) {
    const filenames = [...new Set([
      book.cover, book.portrait, ...(book.illustrations || []).map((item) => item.file),
    ].filter(Boolean))].sort();
    const artwork = [];
    for (const file of filenames) {
      if (path.basename(file) !== file) throw new Error("Invalid book artwork path");
      const bytes = await fs.readFile(path.join(root, "public/assets/books", book.id, file));
      const normalized = file.endsWith(".svg") ? bytes.toString("utf8").replace(/\r\n/g, "\n") : bytes;
      artwork.push({ file, hash: sha256(normalized) });
    }
    const content = {
      ...Object.fromEntries(contentFields.map((key) => [key, book[key]])),
      chapters: book.chapters.map(({ number, title, body }) => ({ number, title, body })),
      artwork,
    };
    entries.push({
      id: book.id,
      title: book.title,
      url: new URL(`${base}books/${book.id}/`, siteUrl).href,
      publishedAt: book.publishedAt,
      updatedAt: book.updatedAt <= today ? book.updatedAt : book.publishedAt,
      edition: book.edition || "",
      contentHash: sha256(JSON.stringify(stable(content))),
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id, "en"));
  return {
    schemaVersion: 1,
    hashAlgorithm: "sha256",
    hashScope: "book-content-v1",
    count: entries.length,
    latestPublishedAt: entries.map((book) => book.publishedAt).sort().at(-1) || null,
    latestUpdatedAt: entries.map((book) => book.updatedAt).sort().at(-1) || null,
    books: entries,
  };
}
