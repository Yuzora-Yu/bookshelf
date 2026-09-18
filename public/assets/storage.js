export const preferencesKey = "yuzora:bookshelf:preferences:v1";
export const progressKey = (id, edition) => edition
  ? `yuzora:bookshelf:progress:v2:${id}:${edition}`
  : `yuzora:bookshelf:progress:v1:${id}`;
export function preferences(value) {
  return {
    font: [18, 20, 23, 26].includes(value?.font) ? value.font : 20,
    theme: ["paper", "white", "night"].includes(value?.theme)
      ? value.theme
      : "paper",
  };
}
export function progress(value, total) {
  if (
    !value ||
    !Number.isInteger(value.chapter) ||
    value.chapter < 1 ||
    value.chapter > total ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt < 0
  )
    return null;
  return {
    chapter: value.chapter,
    anchor: /^p\d{3,5}$/.test(value.anchor) ? value.anchor : "p000",
    updatedAt: value.updatedAt,
    finished: value.finished === true && value.chapter === total,
  };
}
export function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function resumeUrl(book, p) {
  return (
    book.readBase + String(p.chapter).padStart(2, "0") + ".html#" + p.anchor
  );
}
export function searchable(value) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
