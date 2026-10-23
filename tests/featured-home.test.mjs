import test from 'node:test';
import assert from 'node:assert/strict';
import { featuredHomeResponse } from '../worker/featured-home.js';
import books from '../worker/generated/featured-books.json' with { type: 'json' };
import worker from '../worker/index.js';

class RecordingRewriter {
  on(selector, handler) {
    assert.equal(selector, '#featured-book');
    this.handler = handler;
    return this;
  }
  transform(response) {
    let markup;
    this.handler.element({ replace(html, options) { assert.deepEqual(options, { html: true }); markup = html; } });
    return new Response(markup, response);
  }
}
const response = () => new Response('initial document', {
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600',
    ETag: '"static"', 'Last-Modified': 'Wed, 21 Oct 2026 00:00:00 GMT', 'Content-Length': '16', 'Accept-Ranges': 'bytes' },
});

test('each public book can be selected into the initial response before JavaScript runs', async () => {
  assert(books.length > 0);
  for (const [index, book] of books.entries()) {
    const actual = featuredHomeResponse(response(), 'GET', RecordingRewriter, () => (index + 0.5) / books.length);
    const html = await actual.text();
    assert.equal(html, book.html);
    assert.match(html, /data-featured-source="server"/);
    assert(html.includes(`data-book="${book.id}"`));
    assert.match(html, /data-featured="read" href="[^"]+01.html"/);
    assert.match(html, /data-featured="cover" src="[^"]+"/);
    assert.doesNotMatch(html, /cold-sleep|private-access|_sealed/);
    assert.equal(actual.headers.get('cache-control'), 'private, no-store');
    assert.equal(actual.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(actual.headers.get('cloudflare-cdn-cache-control'), 'no-store');
    for (const name of ['etag', 'last-modified', 'content-length', 'accept-ranges']) assert.equal(actual.headers.get(name), null);
  }
});

test('concurrent selections are isolated; HEAD has no body or static validators', async () => {
  const first = featuredHomeResponse(response(), 'GET', RecordingRewriter, () => 0);
  const last = featuredHomeResponse(response(), 'GET', RecordingRewriter, () => 0.99);
  assert.equal(await first.text(), books[0].html);
  assert.equal(await last.text(), books.at(-1).html);
  const head = featuredHomeResponse(response(), 'HEAD', class { constructor() { throw new Error('HEAD cannot rewrite a body'); } });
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('etag'), null);
  assert.equal(head.headers.get('cache-control'), 'private, no-store');
});

test('non-HTML and unsuccessful responses are untouched', () => {
  for (const original of [new Response('body'), new Response('missing', { status: 404 }), Response.redirect('https://yu-zora.com/bookshelf/')]) {
    assert.equal(featuredHomeResponse(original, 'GET'), original);
  }
});

test('only the home page strips conditions and ranges so every navigation receives fresh HTML', async () => {
  for (const route of ['/bookshelf/', '/bookshelf/index.html?q=test', '/bookshelf/assets/styles.css']) {
    let upstream;
    const env = { ASSETS: { async fetch(request) { upstream = request; return new Response('asset', { headers: { 'Content-Type': 'text/plain', ETag: '"asset"' } }); } } };
    const request = new Request(`https://yu-zora.com${route}`, { headers: {
      'If-None-Match': '"old"', 'If-Modified-Since': 'Wed, 21 Oct 2026 00:00:00 GMT', Range: 'bytes=0-9', 'If-Range': '"old"',
    } });
    const actual = await worker.fetch(request, env);
    assert.equal(actual.status, 200);
    const home = !route.includes('styles.css');
    for (const name of ['if-none-match', 'if-modified-since', 'range', 'if-range']) assert.equal(upstream.headers.has(name), !home);
    assert.equal(new URL(upstream.url).search, new URL(request.url).search);
    assert.equal(actual.headers.get('etag'), '"asset"');
  }
});
