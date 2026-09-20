import policy from './generated/edition-policy.json' with { type: 'json' };
import { authorizeArchive, protectResponse, logout } from './archive-access.js';

const PREFIX = '/bookshelf';
export function protectedPath(pathname) {
  const relative = pathname.slice(PREFIX.length);
  if (policy.protectedAssets.includes(relative)) return true;
  if (/^\/books\/[^/]+\/editions(?:\/|$)/.test(relative)) return true;
  if (/^\/books\/[^/]+\/read(?:\/|$)/.test(relative)) {
    return !policy.latestReadPrefixes.some((prefix) => relative.startsWith(prefix));
  }
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return new Response('Bad request', { status: 400 }); }
    // Reject ambiguous forms before both classification and asset lookup.
    if (/[\\%\u0000-\u0020\u007f]/.test(pathname) || pathname.includes('//') ||
        pathname.split('/').some((part) => part === '.' || part === '..')) {
      return new Response('Bad request', { status: 400 });
    }
    url.pathname = pathname;
    if (pathname === PREFIX) {
      url.pathname += '/';
      return Response.redirect(url, 308);
    }
    if (!pathname.startsWith(PREFIX + '/')) return new Response('Not found', { status: 404 });
    if (pathname === PREFIX + '/archive-access/logout') return logout(request);
    const locked = protectedPath(pathname);
    if (locked) {
      const result = await authorizeArchive(request, env, url);
      if (result) return result;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const assetUrl = new URL(url);
    assetUrl.pathname = pathname.slice(PREFIX.length);
    if (assetUrl.pathname.endsWith('/')) assetUrl.pathname += 'index.html';
    const headers = new Headers(request.headers);
    if (locked) {
      headers.delete('if-none-match');
      headers.delete('if-modified-since');
    }
    const assetRequest = (target) => new Request(target, { method: request.method, headers });
    const finish = (response) => locked ? protectResponse(response, request.method) : response;
    const response = await env.ASSETS.fetch(assetRequest(assetUrl));
    if (response.status !== 404) return finish(response);
    if (!pathname.endsWith('/') && !pathname.split('/').pop().includes('.')) {
      const directoryUrl = new URL(assetUrl);
      directoryUrl.pathname += '/index.html';
      const directory = await env.ASSETS.fetch(assetRequest(directoryUrl));
      if (directory.ok) {
        url.pathname += '/';
        return finish(Response.redirect(url, 308));
      }
    }
    assetUrl.pathname = '/404.html';
    const notFound = await env.ASSETS.fetch(assetRequest(assetUrl));
    return finish(new Response(request.method === 'HEAD' ? null : notFound.body,
      { status: 404, headers: notFound.headers }));
  },
};
