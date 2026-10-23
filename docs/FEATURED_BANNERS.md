# Featured Book Banners

The Worker selects a public book for each home-page HTML response and streams its
complete introduction, reading links and artwork into the document using
HTMLRewriter. The browser retains that selection instead of shuffling it again.
Home HTML is not cached or conditionally reused; image and script caching is
unchanged. Static-only previews retain a client-side fallback. The four approved
introduction banners were
installed on 2026-10-23. Only the featured artwork uses these images: library
cards, individual book pages, reader pages and social cards retain their covers.

## Assets

Each current book's `book.json` may set `featuredBanner` to a filename under
`public/assets/books/<id>/`. The build checks that the file exists and has no
path components. A book without this field uses its usual cover and book layout,
so a newly published book joins the random selection without needing a banner.

The current banners are `featured-banner-20261023.webp` (1200 x 630). They are
displayed in full, with no rotation, cover mockup or cropping. Artwork files were
generated with the built-in image_gen tool and exported to WebP using Sharp.

Approved source images:

| Book | Source |
| --- | --- |
| ame-wo-tojikomeru | workspace `output/book-banner-previews/001-ame-wo-tojikomeru.png` |
| mukae-no-nai-asa | workspace `output/book-banner-previews/002-mukae-no-nai-asa-v3.png` |
| hako-no-soto-de-machiawase | generated image `exec-329b96b3-e7b4-4ccb-ae83-930f7fc82e8e.png` |
| yama-wo-oriru-niwa-mada-hayai | workspace `output/book-banner-previews/004-yama-wo-oriru-niwa-mada-hayai-v2.png` |

Prompt records are retained in workspace `output/book-banner-previews/PROMPTS.md`,
`PROMPTS-v2.md` and `PROMPTS-v3.md`. The third book's original record is also in
the main portal repository's `docs/BOOKS_ANNOUNCEMENT_ARTWORK.md`.

Changing a featured-only banner is presentation work, not a manuscript revision:
`featuredBanner` is excluded from the book-content activity hash. Usual cover,
illustration and manuscript changes continue to be detected by the activity feed.
