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

type CaptionTrack = {
  code?: string;
  lang?: string;
  label?: string;
  src?: string;
};

const SUBTITLE_GROUP_ID = 'proxy-subs';

function isProxyUri(uri: string) {
  return uri.startsWith('/api/proxy?');
}

function parseClockToSeconds(value: string) {
  const normalized = value.replace(',', '.').trim();
  const [hh = '0', mm = '0', ss = '0'] = normalized.split(':');
  const hours = Number.parseInt(hh, 10);
  const minutes = Number.parseInt(mm, 10);
  const seconds = Number.parseFloat(ss);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return 0;
  }
  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}

function inferVttDurationSeconds(vttText: string) {
  const regex =
    /(\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*(\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)/g;
  let maxEnd = 0;
  let matched = false;
  for (const match of vttText.matchAll(regex)) {
    matched = true;
    const end = parseClockToSeconds(match[2]);
    if (end > maxEnd) maxEnd = end;
  }
  if (!matched || maxEnd <= 0) return 3600;
  return Math.ceil(maxEnd + 1);
}

function decodeCaptions(raw: string | null): CaptionTrack[] {
  if (!raw || raw.length > 12000) return [];

  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const track = item as Record<string, unknown>;
        return {
          code: typeof track.code === 'string' ? track.code : undefined,
          lang: typeof track.lang === 'string' ? track.lang : undefined,
          label: typeof track.label === 'string' ? track.label : undefined,
          src: typeof track.src === 'string' ? track.src : undefined,
        };
      })
      .filter((track) => Boolean(track.src));
  } catch {
    return [];
  }
}

function normalizeLanguage(track: CaptionTrack) {
  const lang = track.lang?.trim();
  if (lang) return lang;

  const code = track.code?.trim().toLowerCase();
  if (!code) return 'und';
  if (code === 'cn') return 'zh';
  if (code === 'hk') return 'zh-HK';
  return code;
}

function escapeAttr(value: string) {
  return value.replace(/"/g, "'").trim();
}

function isMasterPlaylist(lines: string[]) {
  return lines.some((line) => line.startsWith('#EXT-X-STREAM-INF:'));
}

function hasSubtitleRenditions(lines: string[]) {
  return lines.some(
    (line) => line.startsWith('#EXT-X-MEDIA:') && /TYPE=SUBTITLES/i.test(line),
  );
}

function withSubtitlesAttr(line: string) {
  if (!line.startsWith('#EXT-X-STREAM-INF:')) return line;
  if (/SUBTITLES=/i.test(line)) return line;
  return `${line},SUBTITLES="${SUBTITLE_GROUP_ID}"`;
}

function buildSubtitleMediaTags(captions: CaptionTrack[], baseUrl: URL) {
  return captions
    .map((track, index) => {
      if (!track.src) return null;

      let absoluteSrc: string;
      try {
        absoluteSrc = new URL(track.src, baseUrl).toString();
      } catch {
        return null;
      }

      const uri = `/api/proxy?kind=vtt-playlist&url=${encodeURIComponent(absoluteSrc)}`;
      const name = escapeAttr(track.label || track.code || `Subtitle ${index + 1}`);
      const language = escapeAttr(normalizeLanguage(track));
      const isDefault =
        index === 0 || track.code?.toUpperCase() === 'CN' || track.lang === 'zh';

      return `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="${SUBTITLE_GROUP_ID}",NAME="${name}",LANGUAGE="${language}",DEFAULT=${isDefault ? 'YES' : 'NO'},AUTOSELECT=YES,FORCED=NO,URI="${uri}"`;
    })
    .filter((line): line is string => Boolean(line));
}

function injectSubtitleTracks(text: string, captions: CaptionTrack[], baseUrl: URL) {
  if (!captions.length) return text;

  const lines = text.split(/\r?\n/);
  if (!isMasterPlaylist(lines)) return text;
  if (hasSubtitleRenditions(lines)) return text;

  const tags = buildSubtitleMediaTags(captions, baseUrl);
  if (!tags.length) return text;

  const updated = lines.map(withSubtitlesAttr);
  const firstStreamInf = updated.findIndex((line) => line.startsWith('#EXT-X-STREAM-INF:'));
  if (firstStreamInf < 0) return text;

  updated.splice(firstStreamInf, 0, ...tags);
  return updated.join('\n');
}

function proxyUrl(url: string) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function shouldProxyUri(uri: string) {
  return !isProxyUri(uri) && !/^(data:|skd:|urn:|blob:|about:)/i.test(uri);
}

function rewriteAttributeUris(line: string, baseUrl: URL) {
  let updated = line.replace(/URI="([^"]+)"/g, (match, uri) => {
    if (!shouldProxyUri(uri)) return match;
    const absolute = new URL(uri, baseUrl).toString();
    return `URI="${proxyUrl(absolute)}"`;
  });

  updated = updated.replace(/URI=([^",\s]+)/g, (match, uri) => {
    if (!shouldProxyUri(uri)) return match;
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
      if (isProxyUri(line)) return line;
      const absolute = new URL(line, baseUrl).toString();
      return proxyUrl(absolute);
    })
    .join('\n');
}

async function fetchUpstream(req: Request, targetUrl: URL) {
  const headers = new Headers(REQUIRED_HEADERS);
  const range = req.headers.get('range');
  if (range) headers.set('Range', range);
  const accept = req.headers.get('accept');
  if (accept) headers.set('Accept', accept);
  const acceptLanguage = req.headers.get('accept-language');
  if (acceptLanguage) headers.set('Accept-Language', acceptLanguage);
  return fetch(targetUrl, {
    method: req.method,
    headers,
  });
}

async function handleGeneratedVttPlaylist(req: Request, requestUrl: URL) {
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

  if (req.method === 'HEAD') {
    return new Response(null, {
      headers: {
        'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstream(req, targetUrl);
  } catch {
    return new Response('Upstream fetch failed', { status: 502 });
  }
  if (!upstream.ok) {
    return new Response('Upstream subtitle fetch failed', { status: upstream.status });
  }

  const vttText = await upstream.text();
  const duration = inferVttDurationSeconds(vttText);
  const vttUri = proxyUrl(targetUrl.toString());
  const playlist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-TARGETDURATION:' + String(Math.max(1, Math.ceil(duration))),
    '#EXT-X-MEDIA-SEQUENCE:0',
    `#EXTINF:${duration.toFixed(3)},`,
    vttUri,
    '#EXT-X-ENDLIST',
    '',
  ].join('\n');

  return new Response(playlist, {
    headers: {
      'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function handleProxy(req: Request) {
  const requestUrl = new URL(req.url);
  const kind = requestUrl.searchParams.get('kind');
  if (kind === 'vtt-playlist') {
    return handleGeneratedVttPlaylist(req, requestUrl);
  }

  const captions = decodeCaptions(requestUrl.searchParams.get('captions'));
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

  let upstream: Response;
  try {
    upstream = await fetchUpstream(req, targetUrl);
  } catch {
    return new Response('Upstream fetch failed', { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') || '';
  const isM3U8 =
    contentType.includes('application/vnd.apple.mpegurl') ||
    contentType.includes('application/x-mpegurl') ||
    targetUrl.pathname.endsWith('.m3u8');
  const lowerPath = targetUrl.pathname.toLowerCase();
  const isVtt =
    contentType.includes('text/vtt') ||
    contentType.includes('application/x-subrip') ||
    lowerPath.endsWith('.vtt') ||
    lowerPath.endsWith('.webvtt');

  if (isM3U8 && req.method !== 'HEAD') {
    const text = await upstream.text();
    const rewritten = rewriteM3U8(text, targetUrl);
    const withInjectedSubtitles = injectSubtitleTracks(rewritten, captions, targetUrl);
    return new Response(withInjectedSubtitles, {
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
  if (isVtt) {
    responseHeaders.set('content-type', 'text/vtt; charset=utf-8');
  }
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
