# Social Images

Installed 2026-10-23. The library uses a stable 1200 x 630 PNG containing the
four approved introduction banners in reading order. Individual current works
and their chapters use a PNG export of that work's banner. The `socialImage`
filename in `site.config.json` or `book.json` selects the image under
`public/assets/social/`; absent fields retain the previous social card.

OGP, Twitter Card and Book structured data use the same image. The home page's
random featured selection does not randomize the shared collection image.
Existing archive cards, in-page covers, manuscripts and publication/revision
dates are retained. Social-only image metadata does not change activity hashes.

Images are deterministic exports of the approved artwork, with no new image
generation. Individual PNGs were converted with Sharp. The collection PNG was
rendered from a two-by-two HTML grid using Playwright. Local reproducible source:
`output/ogp-assets-20261023/render-social-images.cjs` in this task's workspace.

Versioned filenames keep the updated images distinct from previously shared
cards. Search and social platforms still control recrawl timing and preview
caches; a new meta image does not force an immediate external refresh.
