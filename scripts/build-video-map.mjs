import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const REPORT_PATH = '/Users/adampeng/112/video-report.md';
const DOCS_ROOT = path.join(PROJECT_ROOT, 'content', 'docs');
const AL_BROOKS_ROOT = path.join(DOCS_ROOT, 'al-brooks');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'data', 'video-map.json');

function readFileSafe(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = match[1];
  const get = (key) => {
    const regex = new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, 'm');
    const found = fm.match(regex);
    return found ? found[1].trim() : undefined;
  };
  return {
    title: get('title'),
    pageTitle: get('pageTitle'),
    description: get('description'),
  };
}

function normalizeKey(value) {
  return value ? value.toUpperCase().replace(/\s+/g, '') : undefined;
}

function parseKeyFromPageTitle(pageTitle) {
  if (!pageTitle) return undefined;
  const match = pageTitle.match(/^(\d{1,3}[A-Z]?)/i);
  return match ? normalizeKey(match[1]) : undefined;
}

function parseKeyFromTitle(title) {
  if (!title) return undefined;
  const match = title.match(/^(\d{1,3}[A-Z]?)/i);
  return match ? normalizeKey(match[1]) : undefined;
}

function parseKeyFromFilename(filename) {
  const base = path.basename(filename, '.mdx');
  const bonusMatch = base.match(/^bonus-(\d{1,3})/i);
  if (bonusMatch) return `BONUS-${bonusMatch[1].padStart(2, '0')}`;
  const numMatch = base.match(/^(\d{1,3}[a-z]?)/i);
  return numMatch ? normalizeKey(numMatch[1]) : undefined;
}

function parseReport(report) {
  const entries = [];
  const regex = /##\s+\d+\.\s+([^\n]+)\n([\s\S]*?)(?=\n##\s+\d+\.|\n?$)/g;
  let match;
  while ((match = regex.exec(report)) !== null) {
    const header = match[1].trim();
    const body = match[2];

    const bonusMatch = header.match(/^Bonus Video\s+(\d{1,3})/i);
    const videoMatch = header.match(/^Video\s+(\d{1,3}[A-Z]?)/i);
    const key = bonusMatch
      ? `BONUS-${bonusMatch[1].padStart(2, '0')}`
      : videoMatch
        ? normalizeKey(videoMatch[1])
        : undefined;

    const pageLink = body.match(/页面链接：(https?:\/\/\S+)/)?.[1];
    const hls = body.match(/主播放清单（HLS）：(https?:\/\/\S+)/)?.[1];

    let captions = [];
    const captionBlock = body.split('字幕文件：')[1];
    if (captionBlock) {
      const lines = captionBlock.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith('-')) break;
        const urlMatch = trimmed.match(/https?:\/\/\S+/);
        if (urlMatch) captions.push(urlMatch[0]);
      }
    }

    entries.push({
      header,
      key,
      pageLink,
      hls,
      captions,
    });
  }
  return entries;
}

function listMdxFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listMdxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      results.push(fullPath);
    }
  }
  return results;
}

function captionMeta(url) {
  const match = url.match(/\/captions\/([^./?]+)\.vtt/i);
  const code = match ? match[1].toUpperCase() : 'CC';
  const langMap = {
    EN: 'en',
    ES: 'es',
    PT: 'pt',
    CN: 'zh',
    HK: 'zh-HK',
  };
  return {
    code,
    lang: langMap[code] || code.toLowerCase(),
    label: code,
    src: url,
  };
}

function main() {
  const reportText = readFileSafe(REPORT_PATH);
  const reportEntries = parseReport(reportText);

  const videosByKey = new Map();
  for (const entry of reportEntries) {
    if (!entry.key) continue;
    videosByKey.set(entry.key, entry);
  }

  const mdxFiles = listMdxFiles(AL_BROOKS_ROOT);
  const pagesByKey = new Map();
  const pageMeta = new Map();

  for (const file of mdxFiles) {
    const relative = path.relative(DOCS_ROOT, file).replace(/\\/g, '/');
    const slug = relative.replace(/\.mdx$/, '');
    const content = readFileSafe(file);
    const fm = parseFrontmatter(content);

    let key;
    if (slug.includes('/bonus-videos/')) {
      key = parseKeyFromFilename(file);
    } else {
      key = parseKeyFromPageTitle(fm.pageTitle);
      if (!key) key = parseKeyFromTitle(fm.title);
      if (!key) key = parseKeyFromFilename(file);
    }

    if (key) {
      pagesByKey.set(key, slug);
      pageMeta.set(slug, { key, ...fm, file });
    }
  }

  const output = {};
  const missingPages = [];
  const matchedVideoKeys = new Set();

  for (const [key, slug] of pagesByKey.entries()) {
    const video = videosByKey.get(key);
    if (!video) {
      missingPages.push({ key, slug });
      continue;
    }
    matchedVideoKeys.add(key);

    const captionList = video.captions.map(captionMeta);
    const orderedCaptions = [
      ...captionList.filter((c) => c.code === 'CN'),
      ...captionList.filter((c) => c.code === 'EN'),
      ...captionList.filter((c) => c.code !== 'CN' && c.code !== 'EN'),
    ];

    output[slug] = {
      key,
      title: video.header,
      pageLink: video.pageLink,
      hls: video.hls,
      captions: orderedCaptions,
    };
  }

  const unmatchedVideos = [];
  for (const [key, entry] of videosByKey.entries()) {
    if (!matchedVideoKeys.has(key)) unmatchedVideos.push({ key, header: entry.header });
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');

  console.log(`Video entries: ${reportEntries.length}`);
  console.log(`Mapped pages: ${Object.keys(output).length}`);
  console.log(`Missing pages: ${missingPages.length}`);
  console.log(`Unmatched videos: ${unmatchedVideos.length}`);

  if (missingPages.length) {
    console.log('Missing page keys (no video match):');
    for (const item of missingPages) {
      console.log(`- ${item.key} -> ${item.slug}`);
    }
  }

  if (unmatchedVideos.length) {
    console.log('Unmatched video keys (no page match):');
    for (const item of unmatchedVideos) {
      console.log(`- ${item.key}: ${item.header}`);
    }
  }
}

main();
