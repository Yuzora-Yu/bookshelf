import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';
import policy from '../worker/generated/edition-policy.json' with { type: 'json' };
import { loadBooks, loadArchivedBooks } from '../scripts/content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://yu-zora.com';
const prefix = '/bookshelf';
const target = prefix + '/books/mukae-no-nai-asa/read/01.html';
const secrets = { ARCHIVE_PASSWORD: 'test-pass', ARCHIVE_SESSION_SECRET: 'a-random-test-only-session-secret' };
const env = { ...secrets, ASSETS: { async fetch(request) {
  const pathname = new URL(request.url).pathname;
  return new Response(request.method === 'HEAD' ? null : pathname, { headers: { ETag: '"old"', 'Cache-Control': 'public, max-age=86400' } });
} } };
const get = (pathname, cookie, extra = {}) => worker.fetch(new Request(origin + pathname,
  { ...extra, headers: { ...(cookie ? { cookie } : {}), ...(extra.headers || {}) } }), env);
const post = (pathname, password, extra = {}) => worker.fetch(new Request(origin + pathname, {
  method: 'POST', headers: { origin, 'Content-Type': 'application/x-www-form-urlencoded', ...extra },
  body: new URLSearchParams({ password }),
}), env);
const login = async () => {
  const response = await post(target, secrets.ARCHIVE_PASSWORD);
  assert.equal(response.status, 303);
  return response.headers.get('set-cookie').split(';')[0];
};

test('all archived chapters, details, downloads and exclusive illustrations require authentication', async () => {
  const archives = await loadArchivedBooks(root);
  assert.equal(archives.length, 16);
  let reads = 0;
  const closed = { ...env, ASSETS: { fetch() { reads++; throw new Error('Unauthorized asset read'); } } };
  for (const book of archives) {
    const base = `/books/${book.id}/`;
    const paths = [
      `${base}editions/${book.edition || 'original'}/`,
      `${base}editions/${book.edition || 'original'}/index.html`,
      `${base}editions/${book.edition || 'original'}/full.txt`,
      ...book.chapters.map((c) => `${base}read/${book.edition ? book.edition + '/' : ''}${c.key}.html`),
    ];
    for (const p of paths) {
      const response = await worker.fetch(new Request(origin + prefix + p), closed);
      assert.equal(response.status, 401, p);
      assert.match(response.headers.get('cache-control'), /no-store/);
      const text = await response.text();
      assert.match(text, /閲覧パスワード/);
      assert.ok(!text.includes(book.chapters[0].body.slice(0, 40)));
    }
  }
  for (const p of policy.protectedAssets) assert.equal((await worker.fetch(new Request(origin + prefix + p), closed)).status, 401);
  assert.equal(reads, 0);
});

test('every current chapter and full text stays public even without secrets', async () => {
  for (const book of await loadBooks(root)) {
    for (const p of [`/books/${book.id}/`, `/books/${book.id}/full.txt`,
      ...book.chapters.map((c) => `/books/${book.id}/read/${book.edition ? book.edition + '/' : ''}${c.key}.html`)]) {
      assert.equal((await worker.fetch(new Request(origin + prefix + p), { ASSETS: env.ASSETS })).status, 200, p);
    }
  }
});

test('correct password unlocks other works and downloads; wrong passwords and forged cookies do not', async () => {
  const wrong = await post(target, 'wrong');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('set-cookie'), null);
  assert.equal((await get(target, '__Secure-bookshelf_archive=1')).status, 401);
  const response = await post(target + '?from=bookmark', secrets.ARCHIVE_PASSWORD);
  assert.equal(response.headers.get('location'), target + '?from=bookmark');
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(cookie, /Max-Age=28800/);
  for (const p of [target, '/bookshelf/books/ame-wo-tojikomeru/editions/original/full.txt']) {
    const opened = await get(p, cookie.split(';')[0]);
    assert.equal(opened.status, 200);
    assert.match(opened.headers.get('cache-control'), /private, no-store/);
    assert.equal(opened.headers.get('etag'), null);
    assert.match(await opened.text(), /books\//);
  }
  const token = cookie.split(';')[0];
  const forged = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  assert.equal((await get(target, forged)).status, 401);
});

test('expired and password-rotated sessions are rejected, including HEAD requests', async () => {
  const cookie = await login();
  const expired = cookie.replace(/=\d{10}\./, '=1000000000.');
  assert.equal((await get(target, expired)).status, 401);
  assert.equal((await worker.fetch(new Request(origin + target, { headers: { cookie } }), { ...env, ARCHIVE_PASSWORD: 'new-pass' })).status, 401);
  const denied = await get(target, '', { method: 'HEAD' });
  assert.equal(denied.status, 401);
  assert.equal(await denied.text(), '');
  const allowed = await get(target, cookie, { method: 'HEAD' });
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), '');
});

test('encoded paths, repeated slashes, nested encoding and conditional requests cannot bypass the gate', async () => {
  for (const p of [target.replace('/books/', '/%62ooks/'), target.replace('/read/', '/%72ead/'), target.replace('/read/', '%2fread%2f')]) {
    assert.equal((await get(p)).status, 401, p);
  }
  for (const p of [target.replace('/read/', '//read/'), target.replace('/read/', '/%2572ead/'), target.replace('/read/', '/%5cread/')]) {
    assert.equal((await get(p)).status, 400, p);
  }
  assert.equal((await get(target, '', { headers: { 'if-none-match': '"old"', range: 'bytes=0-100' } })).status, 401);
});

test('missing secrets fail closed; cross-origin, malformed and oversized submissions cannot log in', async () => {
  assert.equal((await worker.fetch(new Request(origin + target), { ASSETS: env.ASSETS })).status, 503);
  assert.equal((await post(target, secrets.ARCHIVE_PASSWORD, { origin: 'https://other.example' })).status, 403);
  assert.equal((await post(target, secrets.ARCHIVE_PASSWORD, { 'Content-Type': 'text/plain' })).status, 401);
  assert.equal((await post(target, 'x'.repeat(3000))).status, 401);
  assert.equal((await get(target, '', { method: 'PUT' })).status, 405);
});

test('logout clears the session cookie and does not permit cross-origin submission', async () => {
  const response = await post('/bookshelf/archive-access/logout', '');
  assert.equal(response.status, 303);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(response.headers.get('location'), '/bookshelf/');
  assert.equal((await post('/bookshelf/archive-access/logout', '', { origin: 'https://other.example' })).status, 403);
});

test('generated access policy matches current editions and never puts credentials in static output', async () => {
  const books = await loadBooks(root);
  assert.deepEqual(policy.latestReadPrefixes, books.map((b) => `/books/${b.id}/read/${b.edition ? b.edition + '/' : ''}`));
  const gate = await get(target);
  assert.equal(gate.headers.get('referrer-policy'), 'same-origin');
  const body = await gate.text();
  assert.ok(!body.includes(secrets.ARCHIVE_PASSWORD));
  assert.ok(!body.includes(secrets.ARCHIVE_SESSION_SECRET));
  const html = await fs.readFile(path.join(root, 'dist/books/mukae-no-nai-asa/index.html'), 'utf8');
  assert.equal((html.match(/旧版の閲覧にはパスワードが必要です。/g) || []).length, 1);
  assert.doesNotMatch(html, /（要パスワード）/);
});
