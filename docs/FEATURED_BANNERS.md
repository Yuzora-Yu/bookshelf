# Featured Book Banners

The Worker selects a public book for each home-page HTML response and streams its
complete introduction, reading links and artwork into the document using
HTMLRewriter. The browser retains that selection instead of shuffling it again.
Home HTML is not cached or conditionally reused. Static-only previews retain a
client-side fallback. These images appear in the featured slot. Library cards,
individual book pages, reader pages and social cards use their own artwork.

## Assets

Each current book's `book.json` may set `featuredBanner` to a filename under
`public/assets/books/<id>/`. The build checks that the file exists and has no
path components. A book without this field uses its usual cover and book layout,
so a newly published book joins the random selection without needing a banner.

The current banners are 1200 × 630 WebP images and display in full.
The four designs were updated on 2026-11-13 in place at their existing URLs.
[The HTML artwork](../scripts/featured-banner-artwork.html) defines the shared
layout and the Canvas drawings for 雨を閉じこめる and 迎えのない朝. The other
two designs use the original illustrations embedded in their covers.

Run `node scripts/render-featured-banners.mjs <existing-preview-directory>` to
review new exports. Omit the directory to write the four files named in
`book.json`. The exporter needs Chrome, Yu Mincho for the original typography,
and Playwright available to Node. Set `FEATURED_BANNER_PLAYWRIGHT` to the path
to a Playwright package installed elsewhere if needed. The site build uses the
committed WebP files directly.

The book-content activity hash excludes `featuredBanner`. Usual cover,
illustration and manuscript changes continue to be detected by the activity feed.
