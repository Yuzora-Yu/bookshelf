const PREFIX = '/bookshelf';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname += '/';
      return Response.redirect(url, 308);
    }
    if (!url.pathname.startsWith(PREFIX + '/')) return new Response('Not found', {status:404});
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD'}});
    const assetUrl = new URL(url);
    assetUrl.pathname = url.pathname.slice(PREFIX.length);
    if (assetUrl.pathname.endsWith('/')) assetUrl.pathname += 'index.html';
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (response.status !== 404) return response;
    if (!url.pathname.endsWith('/') && !url.pathname.split('/').pop().includes('.')) {
      const directoryUrl = new URL(assetUrl);
      directoryUrl.pathname += '/index.html';
      const directory = await env.ASSETS.fetch(new Request(directoryUrl, request));
      if (directory.ok) { url.pathname += '/'; return Response.redirect(url, 308); }
    }
    assetUrl.pathname = '/404.html';
    const notFound = await env.ASSETS.fetch(new Request(assetUrl, request));
    return new Response(request.method === 'HEAD' ? null : notFound.body, {status:404,headers:notFound.headers});
  }
};
