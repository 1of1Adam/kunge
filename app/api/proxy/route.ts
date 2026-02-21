const REQUIRED_HEADERS: Record<string, string> = {
  Referer: 'https://iframe.mediadelivery.net/',
  Origin: 'https://iframe.mediadelivery.net',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

function proxyUrl(url: string) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function shouldProxyUri(uri: string) {
  return !/^(data:|skd:|urn:|blob:|about:)/i.test(uri);
}

function rewriteAttributeUris(line: string, baseUrl: URL) {
  let updated = line.replace(/URI="([^"]+)"/g, (match, uri) => {
    if (!shouldProxyUri(uri) || uri.startsWith('/api/proxy?url=')) return match;
    const absolute = new URL(uri, baseUrl).toString();
    return `URI="${proxyUrl(absolute)}"`;
  });

  updated = updated.replace(/URI=([^",\s]+)/g, (match, uri) => {
    if (!shouldProxyUri(uri) || uri.startsWith('/api/proxy?url=')) return match;
    const absolute = new URL(uri, baseUrl).toString();
    return `URI=${proxyUrl(absolute)}`;
  });

  return updated;
}

function rewriteM3U8(text: string, baseUrl: URL) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!line) return line;
      if (line.startsWith('#')) return rewriteAttributeUris(line, baseUrl);
      const absolute = new URL(line, baseUrl).toString();
      return proxyUrl(absolute);
    })
    .join('\n');
}

async function handleProxy(req: Request) {
  const requestUrl = new URL(req.url);
  const target = requestUrl.searchParams.get('url');

  if (!target) {
    return new Response('Missing url parameter', { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response('Invalid url parameter', { status: 400 });
  }

  const headers = new Headers(REQUIRED_HEADERS);
  const range = req.headers.get('range');
  if (range) headers.set('Range', range);
  const accept = req.headers.get('accept');
  if (accept) headers.set('Accept', accept);
  const acceptLanguage = req.headers.get('accept-language');
  if (acceptLanguage) headers.set('Accept-Language', acceptLanguage);

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
    });
  } catch {
    return new Response('Upstream fetch failed', { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') || '';
  const isM3U8 =
    contentType.includes('application/vnd.apple.mpegurl') ||
    contentType.includes('application/x-mpegurl') ||
    targetUrl.pathname.endsWith('.m3u8');

  if (isM3U8 && req.method !== 'HEAD') {
    const text = await upstream.text();
    const rewritten = rewriteM3U8(text, targetUrl);
    return new Response(rewritten, {
      status: upstream.status,
      headers: {
        'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    responseHeaders.set(key, value);
  });
  responseHeaders.set('cache-control', 'no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(req: Request) {
  return handleProxy(req);
}

export async function HEAD(req: Request) {
  return handleProxy(req);
}
