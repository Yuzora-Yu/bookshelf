import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FEATURED_BANNER_PLAYWRIGHT || 'playwright');
const sharp = require('sharp');
const artwork = new URL('./featured-banner-artwork.html', import.meta.url);
const books = [
  { id: 'ame-wo-tojikomeru', firstLine: '雨を' },
  { id: 'mukae-no-nai-asa', firstLine: '迎えのない' },
  { id: 'hako-no-soto-de-machiawase', firstLine: '箱の外で', reuseCoverArt: true },
  { id: 'yama-wo-oriru-niwa-mada-hayai', firstLine: '山を下りるには', reuseCoverArt: true },
];

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const rendered = [];
  for (const { id, firstLine, reuseCoverArt } of books) {
    const metadata = new URL('../content/books/' + id + '/book.json', import.meta.url);
    const assets = new URL('../public/assets/books/' + id + '/', import.meta.url);
    const { title, number, subtitle, cover, featuredBanner } = JSON.parse(await readFile(metadata, 'utf8'));
    if (!title.startsWith(firstLine) || title === firstLine) {
      throw new Error(id + ': choose a line break for the current title');
    }
    let coverArt;
    if (reuseCoverArt) {
      const coverSvg = await readFile(new URL(cover, assets), 'utf8');
      coverArt = /<image\b[^>]*\bhref="(data:image\/[^"]+)"/.exec(coverSvg)?.[1];
      if (!coverArt) throw new Error(id + ': cover has no embedded illustration');
    }
    if (!featuredBanner || !/^[\w-]+\.webp$/.test(featuredBanner)) {
      throw new Error(id + ': expected a WebP banner filename in book.json');
    }

    await page.goto(artwork.href);
    await page.evaluate(data => window.renderBanner(data), {
      id, number, firstLine, secondLine: title.slice(firstLine.length), subtitle, coverArt,
    });
    const png = await page.locator('.banner').screenshot();
    const webp = await sharp(png).webp({ quality: 91 }).toBuffer();
    const target = process.argv[2]
      ? pathToFileURL(resolve(process.argv[2], id + '.webp'))
      : new URL(featuredBanner, assets);
    rendered.push({ target, webp });
  }
  for (const { target, webp } of rendered) await writeFile(target, webp);
} finally {
  await browser.close();
}
