export function chooseFeaturedBook(books, random = Math.random, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const visible = books.filter((book) =>
    book.publishedAt <= today && !book.archived && !book.private && !book.draft &&
    book.published !== false && !book.unlisted && (!book.visibility || book.visibility === "public"),
  );
  if (!visible.length) return null;
  const value = random();
  const index = Number.isFinite(value) ? Math.min(visible.length - 1, Math.max(0, Math.floor(value * visible.length))) : 0;
  return visible[index];
}

export function applyFeaturedBook(section, book) {
  for (const name of ["title", "description", "label", "number", "note", "meta"]) {
    for (const node of section.querySelectorAll(`[data-featured="${name}"]`)) node.textContent = book[name];
  }
  section.querySelector('[data-featured="read"]').setAttribute("href", book.read);
  section.querySelector('[data-featured="detail"]').setAttribute("href", book.detail);
  const art = section.querySelector('[data-featured="art"]');
  art.setAttribute("href", book.detail);
  art.setAttribute("aria-label", `${book.title}の作品紹介`);
  const cover = section.querySelector('[data-featured="cover"]');
  cover.setAttribute("src", book.cover);
  cover.setAttribute("alt", `${book.title}の表紙`);
  section.dataset.book = book.id;
}

export function initializeFeaturedBook(root = document) {
  const section = root.querySelector("#featured-book");
  const source = root.querySelector("#featured-books-data");
  if (!section || !source) return;
  try {
    const books = JSON.parse(source.textContent);
    if (!Array.isArray(books)) return;
    const selected = chooseFeaturedBook(books);
    if (selected) applyFeaturedBook(section, selected);
  } catch {
    // The initial HTML keeps a complete reading link when enhancement is unavailable.
  }
}
