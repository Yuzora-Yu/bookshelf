import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBooks, loadArchivedBooks } from '../scripts/content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const read = route => fs.readFile(path.join(dist, route), 'utf8');
const graphs = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(match => JSON.parse(match[1])['@graph'] || []);

test('searchable pages have distinct branded titles and consistent canonical and social metadata', async () => {
  const sitemap = await read('sitemap.xml');
  const { base } = JSON.parse(await read('build-info.json'));
  const titles = new Set();
  for (const [, location] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const route = new URL(location).pathname.slice(base.length);
    const html = await read(route.endsWith('/') || !route ? `${route}index.html` : route);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert(title?.endsWith(' | YU-ZORA'), location);
    assert(!titles.has(title), `duplicate searchable title: ${title}`);
    titles.add(title);
    assert(html.includes(`<meta property="og:title" content="${title}">`));
    assert(html.includes(`<meta name="twitter:title" content="${title}">`));
    assert(html.includes(`<link rel="canonical" href="${location}">`));
    assert(html.includes('name="robots" content="index,follow"'));
    const data = graphs(html);
    assert(data.some(item => item['@type'] === 'BreadcrumbList'));
    assert(data.some(item => ['CollectionPage', 'WebPage'].includes(item['@type'])));
  }
  assert(sitemap.includes('<lastmod>'));
  assert(!sitemap.includes('/editions/'));
});

test('book and chapter structured data identify the correct public novel', async () => {
  for (const book of await loadBooks(root)) {
    const detail = graphs(await read(`books/${book.id}/index.html`));
    const entity = detail.find(item => item['@type'] === 'Book');
    assert.equal(entity.name, book.title);
    assert.equal(entity.isAccessibleForFree, true);
    const chapterData = graphs(await read(`books/${book.id}/read/${book.edition ? book.edition + '/' : ''}01.html`));
    const chapter = chapterData.find(item => item['@type'] === 'Chapter');
    assert.equal(chapter.name, book.chapters[0].title);
    assert.equal(chapter.position, 1);
    assert.equal(chapter.isPartOf['@id'], entity['@id']);
  }
});

test('archives and the error page are excluded from search in static output as well', async () => {
  const error = await read('404.html');
  assert(error.includes('name="robots" content="noindex,follow,noarchive"'));
  assert(!error.includes('rel="canonical"'));
  for (const book of await loadArchivedBooks(root)) {
    const html = await read(`books/${book.id}/editions/${book.edition || 'original'}/index.html`);
    assert(html.includes('name="robots" content="noindex,follow,noarchive"'));
    assert(!html.includes('rel="canonical"'));
    assert.equal(graphs(html).length, 0);
  }
});
