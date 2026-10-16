import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBooks } from '../scripts/content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

test('every generated book page has a usable PNG social card, including chapters and editions', async () => {
  const { base } = JSON.parse(await fs.readFile(path.join(dist, 'build-info.json'), 'utf8'));
  const files = await fs.readdir(dist, { recursive:true });
  const images = new Set();
  for (const file of files.filter(file => file.endsWith('.html'))) {
    const html = await fs.readFile(path.join(dist, file), 'utf8');
    const matches = [...html.matchAll(/<meta property="og:image" content="([^"]+)">/g)];
    assert.equal(matches.length, 1, `${file}: one social image`);
    const image = new URL(matches[0][1]);
    assert.equal(image.protocol, 'https:');
    assert(image.pathname.startsWith(`${base}assets/social/`), `${file}: public social image`);
    assert(html.includes(`<meta name="twitter:image" content="${image.href}">`));
    assert(html.includes('name="twitter:card" content="summary_large_image"'));
    images.add(image.pathname.slice(base.length));
  }
  for (const image of images) {
    const png = await fs.readFile(path.join(dist, image));
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
  }
});

test('current book details offer reading before edition selection and share the correct book card', async () => {
  for (const book of await loadBooks(root)) {
    const html = await fs.readFile(path.join(dist, `books/${book.id}/index.html`), 'utf8');
    const actions = html.match(/<div class="detail-reading-actions">([\s\S]*?)<\/div>/)?.[1];
    assert(actions?.includes(book.startLabel || 'はじめから読む'));
    assert(actions.includes(`data-resume="${book.id}:${book.edition || ''}"`));
    assert(actions.includes(' hidden>続きから読む'));
    assert(html.indexOf('detail-reading-actions') < html.indexOf('id="editions"'));
    assert(html.includes(`/assets/social/${book.id}.png`));
    const firstChapter = await fs.readFile(path.join(dist, `books/${book.id}/read/${book.edition ? book.edition + '/' : ''}01.html`), 'utf8');
    assert(firstChapter.includes(`/assets/social/${book.id}.png`));
  }
});
