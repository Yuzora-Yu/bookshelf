import manifest from './private-books.json' with { type: 'json' };
import { protectResponse as protectBaseResponse, readPassword } from './archive-access.js';

function protectResponse(response, method = 'GET') {
  const result = protectBaseResponse(response, method);
  result.headers.set('Cache-Control', 'private, no-store, no-transform');
  return result;
}

const PREFIX = '/bookshelf';
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();
const escape = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cookieName = (id) => `__Secure-bookshelf_private_${id}`;
const cookie = (id, value, age) => `${cookieName(id)}=${value}; Path=/bookshelf/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
const hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((b) => parseInt(b, 16)));

export function privateBookFor(pathname) {
  const relative = pathname.slice(PREFIX.length);
  return Object.keys(manifest.books).find((id) =>
    [`/books/${id}`, `/assets/books/${id}`].some((p) => relative === p || relative.startsWith(p + '/')));
}

function gate(request, status, message = '') {
  const form = status !== 503 ? `<form method="post"><label for="password">閲覧パスワード</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="128" required autofocus><button type="submit">作品を読む</button></form><p class="note">このブラウザでは、8時間は再入力せずに読めます。</p>` : '';
  const body = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,noarchive"><title>作品の閲覧 | BOOKS</title><link rel="stylesheet" href="/bookshelf/assets/archive-access.css"></head><body><main><p class="brand">YU-ZORA BOOKS</p><h1>限定閲覧</h1><p>作品を読むには、閲覧パスワードを入力してください。</p>${message ? `<p class="message" role="alert">${escape(message)}</p>` : ''}${form}<a href="/bookshelf/">BOOKSへ戻る →</a></main></body></html>`;
  const response = new Response(body, { status, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    ...(status === 429 ? { 'Retry-After': '60' } : {}),
  } });
  return protectResponse(response, request.method);
}

async function sessionKey(env, id) {
  return crypto.subtle.importKey('raw', encoder.encode(`private:${id}:${env.PRIVATE_BOOK_KEY}:${env.PRIVATE_BOOK_PASSWORD}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const sign = (key, text) => crypto.subtle.sign('HMAC', key, encoder.encode(text));
async function validSession(request, key, id) {
  const name = cookieName(id) + '=';
  const value = (request.headers.get('cookie') || '').split(';').map((v) => v.trim()).find((v) => v.startsWith(name))?.slice(name.length) || '';
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(value);
  if (!match) return false;
  const expires = Number(match[1]), now = Math.floor(Date.now() / 1000);
  if (expires <= now || expires > now + SESSION_SECONDS) return false;
  return crypto.subtle.verify('HMAC', key, unhex(match[2]), encoder.encode(`private:${id}:${match[1]}`));
}

export function privateLogout(request, id) {
  if (!Object.hasOwn(manifest.books, id)) return new Response('Not found', { status: 404 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin) return new Response('Forbidden', { status: 403 });
  return protectResponse(new Response(null, { status: 303, headers: {
    Location: '/bookshelf/', 'Set-Cookie': cookie(id, '', 0),
  } }));
}

export async function servePrivateBook(request, env, url, id) {
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
    return protectResponse(new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, POST' } }));
  }
  if (!env.PRIVATE_BOOK_PASSWORD || !/^[A-Za-z0-9+/]{43}=$/.test(env.PRIVATE_BOOK_KEY || '')) {
    return gate(request, 503, '作品は一時的に閲覧できません。時間をおいてお試しください。');
  }
  const key = await sessionKey(env, id);
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin) return gate(request, 403, 'このページを開き直して入力してください。');
    if (!env.PRIVATE_BOOK_LOGIN_LIMITER?.limit) return gate(request, 503, '作品は一時的に閲覧できません。');
    const actor = request.headers.get('cf-connecting-ip') || 'local';
    const limitKey = hex(await sign(key, `login:${actor}`));
    const { success } = await env.PRIVATE_BOOK_LOGIN_LIMITER.limit({ key: limitKey });
    if (!success) return gate(request, 429, '少し時間をおいて、もう一度お試しください。');
    const password = await readPassword(request);
    const expected = await sign(key, `password:${env.PRIVATE_BOOK_PASSWORD}`);
    if (password === null || !await crypto.subtle.verify('HMAC', key, expected, encoder.encode(`password:${password}`))) {
      return gate(request, 401, 'パスワードが違います。もう一度入力してください。');
    }
    const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
    return protectResponse(new Response(null, { status: 303, headers: {
      Location: url.pathname + url.search,
      'Set-Cookie': cookie(id, `${expires}.${hex(await sign(key, `private:${id}:${expires}`))}`, SESSION_SECONDS),
    } }));
  }
  if (!await validSession(request, key, id)) return gate(request, 401);
  let relative = url.pathname.slice(PREFIX.length);
  if (relative === `/books/${id}` || relative === `/assets/books/${id}`) {
    const target = new URL(url); target.pathname += '/';
    return protectResponse(Response.redirect(target, 308), request.method);
  }
  if (relative.endsWith('/index.html')) relative = relative.slice(0, -10);
  const entry = manifest.books[id].routes[relative];
  if (!entry) return protectResponse(new Response(request.method === 'HEAD' ? null : 'Not found', { status: 404 }), request.method);
  try {
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 2_000_000) throw new Error('Invalid asset size');
    const target = new URL(url); target.pathname = entry.asset;
    const sealed = await env.ASSETS.fetch(new Request(target));
    if (!sealed.ok) throw new Error('Asset unavailable');
    const data = new Uint8Array(await sealed.arrayBuffer());
    if (data.length !== entry.bytes + 29 || data[0] !== 1) throw new Error('Invalid envelope');
    const rawKey = Uint8Array.from(atob(env.PRIVATE_BOOK_KEY), (c) => c.charCodeAt(0));
    const decryptKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(1, 13), additionalData: encoder.encode(relative), tagLength: 128 }, decryptKey, data.slice(13));
    const headers = new Headers({ 'Content-Type': entry.contentType, 'Content-Length': String(clear.byteLength), 'Referrer-Policy': 'same-origin' });
    if (relative.endsWith('/full.txt')) headers.set('Content-Disposition', `attachment; filename="${id}.txt"`);
    if (entry.contentType.startsWith('text/html')) headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    return protectResponse(new Response(request.method === 'HEAD' ? null : clear, { headers }), request.method);
  } catch {
    console.error(JSON.stringify({ event: 'private_asset_unavailable', book: id }));
    return gate(request, 503, '作品を読み込めませんでした。時間をおいてお試しください。');
  }
}
