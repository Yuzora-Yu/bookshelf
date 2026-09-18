import {
  read,
  progress,
  progressKey,
  resumeUrl,
  searchable,
} from "./storage.js";
const search = document.querySelector("#search"),
  genre = document.querySelector("#genre");
if (search && genre) {
  const cards = [...document.querySelectorAll(".book-card")];
  const clear = document.querySelector("#clear-search");
  function filter(update = true) {
    const terms = searchable(search.value.trim()).split(/\s+/).filter(Boolean);
    let count = 0;
    for (const card of cards) {
      const matches =
        terms.every((t) => searchable(card.dataset.search).includes(t)) &&
        (!genre.value || card.dataset.genres.split("|").includes(genre.value));
      card.hidden = !matches;
      if (matches) count++;
    }
    document.querySelector("#result-count").textContent = `${count}作品`;
    document.querySelector("#empty-state").hidden = count !== 0;
    clear.hidden = !search.value;
    if (update) {
      const u = new URL(location.href);
      search.value.trim()
        ? u.searchParams.set("q", search.value.trim())
        : u.searchParams.delete("q");
      genre.value
        ? u.searchParams.set("genre", genre.value)
        : u.searchParams.delete("genre");
      history.replaceState(null, "", u);
    }
  }
  function fromUrl() {
    const params = new URL(location.href).searchParams;
    search.value = params.get("q") || "";
    genre.value = params.get("genre") || "";
    filter(false);
  }
  search.addEventListener("input", () => filter());
  genre.addEventListener("change", () => filter());
  document.querySelector(".search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    filter();
  });
  clear.addEventListener("click", () => {
    search.value = "";
    filter();
    search.focus();
  });
  document.querySelector("#reset-search").addEventListener("click", () => {
    search.value = "";
    genre.value = "";
    filter();
    search.focus();
  });
  addEventListener("popstate", fromUrl);
  fromUrl();
}
async function bookmarks() {
  if (!document.body.dataset.base) return;
  try {
    const response = await fetch(
      document.body.dataset.base + "assets/catalog.json",
    );
    if (!response.ok) return;
    const books = await response.json();
    let latest = null;
    for (const book of books) {
      const p = progress(read(progressKey(book.id, book.edition)), book.chapters.length);
      if (!p) continue;
      const link = document.querySelector(`[data-resume="${book.id}:${book.edition || ""}"]`);
      if (link) {
        link.hidden = false;
        link.href = p.finished ? book.readBase + "01.html" : resumeUrl(book, p);
        link.textContent = p.finished
          ? "読了済み · もう一度読む →"
          : `${book.chapters[p.chapter - 1].title}の続きから →`;
      }
      if (!p.finished && (!latest || p.updatedAt > latest.p.updatedAt))
        latest = { book, p };
    }
    const section = document.querySelector("#continue-reading");
    if (section && latest) {
      const { book, p } = latest;
      section.hidden = false;
      document.querySelector("#continue-title").textContent = book.title;
      document.querySelector("#continue-position").textContent =
        book.chapters[p.chapter - 1].title;
      document.querySelector("#continue-link").href = resumeUrl(book, p);
    }
  } catch {
    /* Reading remains available when storage or catalog loading is unavailable. */
  }
}
bookmarks();
