const COOKIE = '__Secure-bookshelf_archive';
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();
const escape = (text) => text.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function protectResponse(response, method = 'GET') {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Vary', 'Cookie');
  headers.set('X-Robots-Tag', 'noindex, noarchive');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.delete('ETag');
  headers.delete('Last-Modified');
  return new Response(method === 'HEAD' ? null : response.body, { status: response.status, headers });
}

function gate(request, url, status, message = '') {
  const id = url.pathname.match(/^\/bookshelf\/(?:books|assets\/books)\/([a-z0-9-]+)\//)?.[1];
  const latest = id ? `/bookshelf/books/${id}/` : '/bookshelf/';
  const available = status !== 503;
  const body = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,noarchive"><title>旧版の閲覧 | 夕空の本棚</title><link rel="stylesheet" href="/bookshelf/assets/archive-access.css"></head><body><main><p class="brand">YU-ZORA BOOKSHELF</p><h1>旧版の閲覧</h1><p>旧版を読むには、閲覧パスワードを入力してください。</p>${message ? `<p class="message" role="alert">${escape(message)}</p>` : ''}${available ? `<form method="post"><label for="password">閲覧パスワード</label><input id="password" name="password" type="password" autocomplete="current-password" inputmode="numeric" maxlength="128" required autofocus><button type="submit">旧版を読む</button></form><p class="note">このブラウザでは、8時間は再入力せずに旧版を読めます。</p>` : ''}<a href="${latest}">最新版へ戻る →</a></main></body></html>`;
  return protectResponse(new Response(body, { status, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'same-origin',
  } }), request.method);
}

async function keyFor(env) {
  return crypto.subtle.importKey('raw', encoder.encode(`${env.ARCHIVE_SESSION_SECRET}:${env.ARCHIVE_PASSWORD}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const sign = (key, text) => crypto.subtle.sign('HMAC', key, encoder.encode(text));
const hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (text) => new Uint8Array(text.match(/../g).map((b) => parseInt(b, 16)));
const cookie = (value, age) => `${COOKIE}=${value}; Path=/bookshelf/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;

async function validSession(request, key) {
  const cookies = (request.headers.get('cookie') || '').split(';').map((s) => s.trim());
  const value = cookies.find((s) => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(value);
  if (!match) return false;
  const expires = Number(match[1]), now = Math.floor(Date.now() / 1000);
  if (expires <= now || expires > now + SESSION_SECONDS) return false;
  return crypto.subtle.verify('HMAC', key, unhex(match[2]), encoder.encode(`archive:${match[1]}`));
}

async function readPassword(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  let total = 0, text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 2048) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const values = new URLSearchParams(text).getAll('password');
    return values.length === 1 && values[0].length <= 128 ? values[0] : null;
  } finally { reader.releaseLock(); }
}

export async function authorizeArchive(request, env, url) {
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
    return protectResponse(new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, POST' } }));
  }
  if (!env.ARCHIVE_PASSWORD || !env.ARCHIVE_SESSION_SECRET) {
    return gate(request, url, 503, '旧版は一時的に閲覧できません。時間をおいてお試しください。');
  }
  const key = await keyFor(env);
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin) return gate(request, url, 403, 'このページを開き直して入力してください。');
    const password = await readPassword(request);
    const expected = await sign(key, `password:${env.ARCHIVE_PASSWORD}`);
    if (password === null || !await crypto.subtle.verify('HMAC', key, expected, encoder.encode(`password:${password}`))) {
      return gate(request, url, 401, 'パスワードが違います。もう一度入力してください。');
    }
    const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
    const token = `${expires}.${hex(await sign(key, `archive:${expires}`))}`;
    return protectResponse(new Response(null, { status: 303, headers: {
      Location: url.pathname + url.search,
      'Set-Cookie': cookie(token, SESSION_SECONDS),
    } }));
  }
  return await validSession(request, key) ? null : gate(request, url, 401);
}

export function logout(request) {
  const url = new URL(request.url);
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (request.headers.get('origin') !== url.origin) return new Response('Forbidden', { status: 403 });
  return protectResponse(new Response(null, { status: 303, headers: {
    Location: '/bookshelf/', 'Set-Cookie': cookie('', 0),
  } }));
}
