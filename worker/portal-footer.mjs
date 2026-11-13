// Shared by the GAMES and BOOKS Workers. The main portal owns the footer and landing navigation.
export async function withPortalFooter(response, env, { selector, method, section, headerSelector }, Rewriter = globalThis.HTMLRewriter) {
  if (!env.YU_ZORA_ERROR_PAGES || !Rewriter || !['GET', 'HEAD'].includes(method) ||
      response.status !== 200 || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')) return response;

  const headers = new Headers(response.headers);
  // Static validators and byte lengths describe the original asset, not the assembled document.
  for (const name of ['content-length', 'etag', 'last-modified', 'accept-ranges']) headers.delete(name);
  if (method === 'HEAD') return new Response(null, { status: response.status, headers });

  let footer;
  let header;
  try {
    const fragment = await env.YU_ZORA_ERROR_PAGES.fetch(new Request('https://yu-zora.com/assets/portal-footer.json'));
    if (!fragment.ok || !/^application\/json\b/i.test(fragment.headers.get('content-type') || '')) return response;
    const { html, sectionHeaders } = await fragment.json();
    if (typeof html !== 'string' || !html.startsWith('<footer class="site-footer yuzora-footer">')) return response;
    footer = html;
    header = sectionHeaders?.[section];
  } catch {
    return response;
  }

  const rewriter = new Rewriter().on('head', {
    element(head) { head.append('<link rel="stylesheet" href="/assets/portal-footer.css">', { html: true }); },
  }).on(selector, {
    element(original) { original.replace(footer, { html: true }); },
  });
  if (headerSelector && typeof header === 'string' && header.startsWith('<header class="yu-section-header">')) {
    rewriter.on(headerSelector, { element(original) { original.replace(header, { html: true }); } });
  }
  return rewriter.transform(new Response(response.body, { status: response.status, headers }));
}
