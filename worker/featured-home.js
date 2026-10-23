import books from './generated/featured-books.json' with { type: 'json' };
import { chooseFeaturedBook } from '../public/assets/featured.js';

export function featuredHomeResponse(response, method, Rewriter = globalThis.HTMLRewriter, random = Math.random) {
  if (response.status !== 200 || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')) return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  for (const name of ['etag', 'last-modified', 'content-length', 'accept-ranges']) headers.delete(name);
  const output = new Response(method === 'HEAD' ? null : response.body, { status: response.status, headers });
  if (method === 'HEAD') return output;
  const selected = chooseFeaturedBook(books, random);
  if (!selected) return output;
  // Selection belongs to this response, never to an isolate-wide cache.
  return new Rewriter().on('#featured-book', {
    element(element) { element.replace(selected.html, { html: true }); },
  }).transform(output);
}
