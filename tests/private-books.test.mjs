import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createCipheriv, randomBytes, createHmac } from 'node:crypto';
import worker from '../worker/index.js';
import manifest from '../worker/private-books.json' with { type: 'json' };

const origin = 'https://yu-zora.com';
const prefix = '/bookshelf';
const id = 'cold-sleep';
const routes = manifest.books[id].routes;
const target = `/books/${id}/read/01.html`;
const key = Buffer.alloc(32, 91);
const credentials = { PRIVATE_BOOK_PASSWORD: 'private-fixture-pass', PRIVATE_BOOK_KEY: key.toString('base64') };
const marker = 'private-reader-fixture';
const requests = [];
const attempts = [];
function fixture(route) {
  const entry = routes[route];
  return Buffer.from(marker + ' '.repeat(entry.bytes - Buffer.byteLength(marker)));
}
function envelope(route) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(route));
  return Buffer.concat([Buffer.from([1]), iv, cipher.update(fixture(route)), cipher.final(), cipher.getAuthTag()]);
}
const env = { ...credentials,
  PRIVATE_BOOK_LOGIN_LIMITER: { async limit(value) { attempts.push(value.key); return { success: true }; } },
  ASSETS: { async fetch(request) {
    const pathname = new URL(request.url).pathname;
    requests.push(pathname);
    const route = Object.keys(routes).find((r) => routes[r].asset === pathname);
    assert.ok(route, 'Only a manifest ciphertext may be fetched');
    return new Response(envelope(route), { headers: { ETag: '"cipher"', 'Cache-Control': 'public' } });
  } },
};
const get = (route, cookie = '', options = {}, bindings = env) => worker.fetch(new Request(origin + prefix + route,
  { ...options, headers: { ...(cookie ? { cookie } : {}), ...(options.headers || {}) } }), bindings);
const post = (route, password = credentials.PRIVATE_BOOK_PASSWORD, options = {}, bindings = env) => get(route, '', {
  method: 'POST', body: new URLSearchParams({ password }), ...options,
  headers: { origin, 'content-type': 'application/x-www-form-urlencoded', ...(options.headers || {}) },
}, bindings);
async function login() {
  const response = await post(target);
  assert.equal(response.status, 303);
  return response.headers.get('set-cookie').split(';')[0];
}

test('private details, every chapter, download, catalog and artwork require a session before asset reads', async () => {
  assert.deepEqual(Object.keys(routes).filter((r) => /read\/\d+\.html$/.test(r)).sort(),
    Array.from({ length: 31 }, (_, i) => `/books/${id}/read/${String(i + 1).padStart(2, '0')}.html`));
  assert.equal(Object.keys(routes).length, 35);
  requests.length = 0;
  for (const route of Object.keys(routes)) {
    const response = await get(route);
    assert.equal(response.status, 401, route);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.match(await response.text(), /閲覧パスワード/);
  }
  assert.equal(requests.length, 0);
});

test('password opens authenticated pages and assets without public caches or conditional responses', async () => {
  const response = await post(target + '?from=bookmark');
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), prefix + target + '?from=bookmark');
  const header = response.headers.get('set-cookie');
  assert.match(header, /Max-Age=28800; HttpOnly; Secure; SameSite=Lax/);
  const cookie = header.split(';')[0];
  for (const route of Object.keys(routes)) {
    const opened = await get(route, cookie, { headers: { range: 'bytes=0-4', 'if-none-match': '"cipher"' } });
    assert.equal(opened.status, 200, route);
    assert.equal(opened.headers.get('content-type'), routes[route].contentType);
    assert.match(opened.headers.get('cache-control'), /private, no-store, no-transform/);
    assert.equal(opened.headers.get('etag'), null);
    assert.equal(opened.headers.get('last-modified'), null);
    assert.equal(await opened.text(), fixture(route).toString());
  }
  const head = await get(target, cookie, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await get(`/books/${id}/full.txt`, cookie)).headers.get('content-disposition'), `attachment; filename="${id}.txt"`);
});

test('incorrect, malformed, cross-origin and rate-limited submissions never create a session', async () => {
  assert.equal((await post(target, 'incorrect')).status, 401);
  assert.equal((await post(target, credentials.PRIVATE_BOOK_PASSWORD, { headers: { origin: 'https://other.example' } })).status, 403);
  assert.equal((await post(target, 'x'.repeat(3000))).status, 401);
  assert.equal((await post(target, 'irrelevant', { headers: { 'content-type': 'text/plain' } })).status, 401);
  const denied = await post(target, credentials.PRIVATE_BOOK_PASSWORD, {}, { ...env, PRIVATE_BOOK_LOGIN_LIMITER: { async limit() { return { success: false }; } } });
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('retry-after'), '60');
  assert.equal(denied.headers.get('set-cookie'), null);
  assert.ok(attempts.every((v) => /^[a-f0-9]{64}$/.test(v)));
});

test('forged, correctly signed expired, and password-rotated sessions are rejected', async () => {
  const cookie = await login();
  assert.equal((await get(target, cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a'))).status, 401);
  const expires = String(Math.floor(Date.now() / 1000) - 60);
  const secret = `private:${id}:${credentials.PRIVATE_BOOK_KEY}:${credentials.PRIVATE_BOOK_PASSWORD}`;
  const signature = createHmac('sha256', secret).update(`private:${id}:${expires}`).digest('hex');
  assert.equal((await get(target, `__Secure-bookshelf_private_${id}=${expires}.${signature}`)).status, 401);
  assert.equal((await get(target, cookie, {}, { ...env, PRIVATE_BOOK_PASSWORD: 'rotated-fixture' })).status, 401);
});

test('path aliases and downloads cannot bypass authentication, including encoded paths and HEAD', async () => {
  for (const route of [`/books/${id}`, `/books/${id}/index.html`, `/books/${id}/full.txt`, `/assets/books/${id}/cover.svg`, `/books/${id}/unknown.json`]) {
    assert.equal((await get(route)).status, 401, route);
  }
  for (const route of [target.replace('/books/', '/%62ooks/'), target.replace('/read/', '%2fread%2f')]) assert.equal((await get(route)).status, 401);
  for (const route of [target.replace('/read/', '//read/'), target.replace('/read/', '/%2572ead/'), target.replace('/read/', '/%5cread/')]) assert.equal((await get(route)).status, 400);
  assert.equal((await get(target, '', { method: 'HEAD' })).status, 401);
  assert.equal((await get(target, '', { method: 'PUT' })).status, 405);
  const cookie = await login();
  assert.equal((await get(`/books/${id}`, cookie)).status, 308);
  assert.equal((await get(`/books/${id}/index.html`, cookie)).status, 200);
  assert.equal((await get(`/books/${id}/unknown.json`, cookie)).status, 404);
});

test('ciphertext URLs stay inaccessible even with a session and failures stay closed', async () => {
  const cookie = await login();
  for (const entry of Object.values(routes)) {
    assert.equal((await get(entry.asset)).status, 404);
    assert.equal((await get(entry.asset, cookie)).status, 404);
  }
  assert.equal((await get(target, '', {}, { ASSETS: env.ASSETS })).status, 503);
  assert.equal((await post(target, credentials.PRIVATE_BOOK_PASSWORD, {}, { ...env, PRIVATE_BOOK_LOGIN_LIMITER: undefined })).status, 503);
  const corrupted = { ...env, ASSETS: { async fetch() {
    const data = envelope(target); data[data.length - 1] ^= 1; return new Response(data);
  } } };
  assert.equal((await get(target, cookie, {}, corrupted)).status, 503);
});

test('logout only accepts same-origin POST and clears the private session', async () => {
  const route = `/private-access/${id}/logout`;
  const response = await post(route);
  assert.equal(response.status, 303);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(response.headers.get('location'), '/bookshelf/');
  assert.equal((await post(route, '', { headers: { origin: 'https://other.example' } })).status, 403);
  assert.equal((await get(route)).status, 405);
});

test('the public build contains ciphertext but no private manuscript, catalog entry or sitemap URL', async () => {
  const root = new URL('../', import.meta.url);
  for (const entry of Object.values(routes)) {
    const data = await fs.readFile(new URL('dist' + entry.asset, root));
    assert.equal(data[0], 1);
    assert.equal(data.length, entry.bytes + 29);
  }
  for (const file of ['dist/assets/catalog.json', 'dist/sitemap.xml', 'dist/build-info.json', 'dist/index.html']) {
    assert.ok(!(await fs.readFile(new URL(file, root), 'utf8')).includes(id), file);
  }
  for (const folder of ['content/books/' + id, 'dist/books/' + id, 'public/assets/books/' + id]) {
    await assert.rejects(fs.access(new URL(folder, root)), { code: 'ENOENT' });
  }
});
