import {
  preferences,
  preferencesKey,
  progressKey,
  read,
  save,
} from "./storage.js";
let settings = preferences(read(preferencesKey));
function apply() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty(
    "--reading-size",
    settings.font + "px",
  );
  for (const radio of document.querySelectorAll('input[name="font"]'))
    radio.checked = Number(radio.value) === settings.font;
  for (const radio of document.querySelectorAll('input[name="theme"]'))
    radio.checked = radio.value === settings.theme;
}
apply();
for (const button of document.querySelectorAll("[data-dialog]"))
  button.addEventListener("click", () =>
    document.getElementById(button.dataset.dialog).showModal(),
  );
for (const button of document.querySelectorAll("[data-close]"))
  button.addEventListener("click", () => button.closest("dialog").close());
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  });
function persistSettings() {
  apply();
  if (!save(preferencesKey, settings))
    document.querySelector(".settings-note").textContent =
      "このブラウザでは保存できません。設定はこのページを開いている間だけ適用されます。";
}
for (const radio of document.querySelectorAll(
  'input[name="font"],input[name="theme"]',
))
  radio.addEventListener("change", () => {
    settings = preferences({
      ...settings,
      [radio.name]: radio.name === "font" ? Number(radio.value) : radio.value,
    });
    persistSettings();
  });
document.querySelector("#reset-preferences").addEventListener("click", () => {
  settings = preferences(null);
  persistSettings();
});
const chapter = Number(document.body.dataset.chapter),
  total = Number(document.body.dataset.total),
  key = progressKey(document.body.dataset.book, document.body.dataset.edition);
const prose = document.querySelector("#prose"),
  paragraphs = [...prose.querySelectorAll("p[id]")],
  bar = document.querySelector("#progress-bar");
let timer,
  ready = false;
function position() {
  if (!ready) return;
  let anchor = paragraphs[0]?.id || "p000";
  for (const p of paragraphs) {
    if (p.getBoundingClientRect().top <= 125) anchor = p.id;
    else break;
  }
  const rect = prose.getBoundingClientRect();
  const fraction = Math.min(
    1,
    Math.max(0, (innerHeight - rect.top) / rect.height),
  );
  bar.style.width = fraction * 100 + "%";
  const finished = chapter === total && rect.bottom <= innerHeight;
  const ok = save(key, { chapter, anchor, finished, updatedAt: Date.now() });
  if (!ok)
    document.querySelector("#save-notice").textContent =
      "このブラウザでは読んだ位置を保存できません。ページをブックマークしてご利用ください。";
}
// Let the browser restore the scroll position / paragraph fragment before saving it.
addEventListener("pageshow", () => {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ready = true;
      position();
    }),
  );
});
addEventListener(
  "scroll",
  () => {
    clearTimeout(timer);
    timer = setTimeout(position, 180);
  },
  { passive: true },
);
addEventListener("resize", () => {
  clearTimeout(timer);
  timer = setTimeout(position, 180);
});
addEventListener("pagehide", position);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") position();
});
