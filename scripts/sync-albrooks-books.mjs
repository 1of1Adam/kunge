#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = '/Users/adampeng/Developer/apps/kunge';

const BOOKS = [
  {
    key: 'book1',
    title: '价格行为交易·趋势',
    description: 'Al Brooks 价格行为三部曲第一卷（已补齐第9章及之后章节）',
    sourceDir: '/Users/adampeng/Focus/albrooks/book1-trends/translated/chapters',
    imagesDir: '/Users/adampeng/Focus/albrooks/book1-trends/translated/Images',
    targetDir: '/Users/adampeng/Developer/apps/kunge/content/docs/al-brooks-trends',
    minOrder: 5,
    maxOrder: 37,
    expectedCount: 33,
    indexIntro: '第一卷目录：前8章保持不变，已补齐第9章及之后章节。',
  },
  {
    key: 'book2',
    title: '价格行为交易·交易区间',
    description: 'Al Brooks 价格行为三部曲第二卷',
    sourceDir: '/Users/adampeng/Focus/albrooks/book2-trading-ranges/translated/chapters',
    imagesDir: '/Users/adampeng/Focus/albrooks/book2-trading-ranges/images',
    targetDir: '/Users/adampeng/Developer/apps/kunge/content/docs/al-brooks-trading-ranges',
    expectedCount: 41,
    indexIntro: '第二卷整本目录：交易区间、订单管理与交易数学。',
  },
  {
    key: 'book3',
    title: '价格行为交易·反转',
    description: 'Al Brooks 价格行为三部曲第三卷',
    sourceDir: '/Users/adampeng/Focus/albrooks/book3-reversals/translated/chapters',
    imagesDir: '/Users/adampeng/Focus/albrooks/book3-reversals/images',
    targetDir: '/Users/adampeng/Developer/apps/kunge/content/docs/al-brooks-reversals',
    expectedCount: 33,
    indexIntro: '第三卷整本目录：趋势反转、日内交易、日线图与期权。',
  },
];

const CHAPTER_FILE_RE = /^(\d{2})_(.+)\.md$/;
const SOURCE_IMAGE_PREFIX_RE = /^\.\.\/(?:images|Images)\//;
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|svg)$/i;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseChapterFilename(fileName) {
  const match = fileName.match(CHAPTER_FILE_RE);
  if (!match) return null;
  return {
    order: Number.parseInt(match[1], 10),
    orderText: match[1],
    slug: match[2],
  };
}

function readSourceChapters(book) {
  const fileNames = fs.readdirSync(book.sourceDir)
    .filter((name) => CHAPTER_FILE_RE.test(name))
    .filter((name) => {
      const parsed = parseChapterFilename(name);
      if (!parsed) return false;
      if (Number.isInteger(book.minOrder) && parsed.order < book.minOrder) return false;
      if (Number.isInteger(book.maxOrder) && parsed.order > book.maxOrder) return false;
      return true;
    })
    .sort((a, b) => {
      const left = parseChapterFilename(a);
      const right = parseChapterFilename(b);
      return left.order - right.order;
    });

  assert(
    fileNames.length === book.expectedCount,
    `[${book.key}] 源章节数异常，期望 ${book.expectedCount}，实际 ${fileNames.length}`,
  );

  return fileNames.map((name) => {
    const parsed = parseChapterFilename(name);
    return {
      ...parsed,
      sourceFileName: name,
      sourcePath: path.join(book.sourceDir, name),
      targetFileName: `${parsed.orderText}-${parsed.slug}.md`,
    };
  });
}

function extractFirstHeading(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (!match) return fallback;
  return match[1].trim();
}

function extractImageUrls(markdown) {
  const urls = [];
  const imageRe = /!\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(imageRe)) {
    let raw = match[1].trim();
    if (raw.startsWith('<') && raw.endsWith('>')) {
      raw = raw.slice(1, -1).trim();
    }
    const firstToken = raw.split(/\s+/)[0];
    urls.push(firstToken);
  }
  return urls;
}

function isSourceImageUrl(url) {
  return SOURCE_IMAGE_PREFIX_RE.test(url);
}

function normalizeImageRelativePath(relPath) {
  return relPath.replace(IMAGE_EXT_RE, (matched) => matched.toLowerCase());
}

function sourceImageUrlToOutputUrl(url) {
  const inside = toImageRelativePath(url);
  return `./images/${normalizeImageRelativePath(inside)}`;
}

function rewriteSourceImagePaths(markdown) {
  return markdown.replace(/\.\.\/(?:images|Images)\/[^\s)]+/g, (matched) => sourceImageUrlToOutputUrl(matched));
}

function toImageRelativePath(relPath) {
  return relPath.replace(SOURCE_IMAGE_PREFIX_RE, '');
}

function stripLeadingH1(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length && lines[index].trim() === '') {
    index += 1;
  }

  const firstNonEmpty = lines[index] ? lines[index].replace(/^\uFEFF/, '').trimStart() : '';
  if (!/^#(?:\s|$)/.test(firstNonEmpty)) {
    return markdown;
  }

  lines.splice(index, 1);
  while (index < lines.length && lines[index].trim() === '') {
    lines.splice(index, 1);
  }

  return lines.join('\n');
}

function escapeYamlDoubleQuoted(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"');
}

function cleanTargetDirectory(targetDir) {
  ensureDir(targetDir);

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    const entryPath = path.join(targetDir, entry.name);
    if (entry.isDirectory() && entry.name === 'images') {
      fs.rmSync(entryPath, { recursive: true, force: true });
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.mdx') {
      fs.rmSync(entryPath, { force: true });
    }
  }
}

function buildIndexContent(book, chapters) {
  const lines = [
    '---',
    'title: 目录',
    `description: ${book.title}整本目录`,
    '---',
    '',
    '# 目录',
    '',
    `> ${book.indexIntro}`,
    '',
  ];

  for (const chapter of chapters) {
    lines.push(`- [${chapter.title}](./${chapter.targetFileName})`);
  }

  lines.push('');
  return lines.join('\n');
}

function buildMetaContent(book, chapters) {
  const pages = ['index', ...chapters.map((chapter) => chapter.targetFileName.replace(/\.md$/, ''))];
  return JSON.stringify(
    {
      title: book.title,
      description: book.description,
      root: true,
      pages,
    },
    null,
    2,
  ) + '\n';
}

function copyReferencedImages(book, imageRefs) {
  const missing = [];

  for (const relPath of imageRefs) {
    const relativeInsideImages = toImageRelativePath(relPath);
    const normalizedRelativeInsideImages = normalizeImageRelativePath(relativeInsideImages);
    const srcPath = path.join(book.imagesDir, relativeInsideImages);
    const dstPath = path.join(book.targetDir, 'images', normalizedRelativeInsideImages);

    if (!fs.existsSync(srcPath)) {
      missing.push({
        from: relPath,
        srcPath,
      });
      continue;
    }

    ensureDir(path.dirname(dstPath));
    fs.copyFileSync(srcPath, dstPath);
  }

  return missing;
}

function verifyChapterImageLinks(book, chapters) {
  const broken = [];

  for (const chapter of chapters) {
    const fileContent = fs.readFileSync(chapter.targetPath, 'utf8');
    const urls = extractImageUrls(fileContent)
      .filter((url) => url.startsWith('./images/'));

    for (const url of urls) {
      const absPath = path.join(book.targetDir, url.replace(/^\.\//, ''));
      if (!fs.existsSync(absPath)) {
        broken.push({
          file: chapter.targetFileName,
          url,
          absPath,
        });
      }
    }
  }

  return broken;
}

function syncBook(book) {
  cleanTargetDirectory(book.targetDir);

  const sourceChapters = readSourceChapters(book);
  const uniqueImageRefs = new Set();
  const syncedChapters = [];

  for (const chapter of sourceChapters) {
    const sourceMarkdown = fs.readFileSync(chapter.sourcePath, 'utf8');
    const title = extractFirstHeading(sourceMarkdown, chapter.slug);

    const sourceImageUrls = extractImageUrls(sourceMarkdown)
      .filter(isSourceImageUrl);

    for (const url of sourceImageUrls) {
      uniqueImageRefs.add(url);
    }

    const rewrittenBody = rewriteSourceImagePaths(sourceMarkdown);
    const cleanedBody = stripLeadingH1(rewrittenBody);
    const withFrontmatter = [
      '---',
      `title: "${escapeYamlDoubleQuoted(title)}"`,
      '---',
      '',
      cleanedBody,
    ].join('\n');

    const targetPath = path.join(book.targetDir, chapter.targetFileName);
    fs.writeFileSync(targetPath, withFrontmatter, 'utf8');

    syncedChapters.push({
      ...chapter,
      title,
      targetPath,
    });
  }

  const missingCopySourceImages = copyReferencedImages(book, uniqueImageRefs);

  assert(
    missingCopySourceImages.length === 0,
    `[${book.key}] 存在源图片缺失:\n${missingCopySourceImages
      .map((item) => `- ${item.from} -> ${item.srcPath}`)
      .join('\n')}`,
  );

  const brokenLinks = verifyChapterImageLinks(book, syncedChapters);
  assert(
    brokenLinks.length === 0,
    `[${book.key}] 存在目标图片链接缺失:\n${brokenLinks
      .map((item) => `- ${item.file}: ${item.url} -> ${item.absPath}`)
      .join('\n')}`,
  );

  const indexPath = path.join(book.targetDir, 'index.mdx');
  const metaPath = path.join(book.targetDir, 'meta.json');

  fs.writeFileSync(indexPath, buildIndexContent(book, syncedChapters), 'utf8');
  fs.writeFileSync(metaPath, buildMetaContent(book, syncedChapters), 'utf8');

  return {
    key: book.key,
    chapters: syncedChapters.length,
    images: uniqueImageRefs.size,
    indexPath,
    metaPath,
  };
}

function main() {
  process.chdir(PROJECT_ROOT);

  const results = BOOKS.map(syncBook);

  console.log('同步完成：');
  for (const result of results) {
    console.log(
      `- ${result.key}: 章节 ${result.chapters}，图片 ${result.images}`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
