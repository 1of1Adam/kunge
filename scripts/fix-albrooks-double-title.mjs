#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = [
  '/Users/adampeng/Developer/apps/kunge/content/docs/al-brooks-trends',
  '/Users/adampeng/Developer/apps/kunge/content/docs/al-brooks-trading-ranges',
  '/Users/adampeng/Developer/apps/kunge/content/docs/al-brooks-reversals',
];

const CHAPTER_RE = /^\d{2}.*\.md$/;

function stripLeadingH1(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length && lines[index].trim() === '') {
    index += 1;
  }

  const firstNonEmpty = lines[index] ? lines[index].replace(/^\uFEFF/, '').trimStart() : '';
  if (!/^#(?:\s|$)/.test(firstNonEmpty)) {
    return { changed: false, content: markdown };
  }

  lines.splice(index, 1);
  while (index < lines.length && lines[index].trim() === '') {
    lines.splice(index, 1);
  }

  return { changed: true, content: lines.join('\n') };
}

function splitFrontmatter(raw) {
  const match = raw.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match) {
    return null;
  }

  return {
    frontmatter: match[0],
    body: raw.slice(match[0].length),
  };
}

function processRoot(root) {
  const files = fs.readdirSync(root).filter((name) => CHAPTER_RE.test(name)).sort();
  let changed = 0;

  for (const file of files) {
    const filePath = path.join(root, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const split = splitFrontmatter(raw);
    if (!split) continue;

    const result = stripLeadingH1(split.body);
    if (!result.changed) continue;

    fs.writeFileSync(filePath, `${split.frontmatter}${result.content}`, 'utf8');
    changed += 1;
  }

  return { files: files.length, changed };
}

try {
  for (const root of ROOTS) {
    const result = processRoot(root);
    console.log(`${path.basename(root)}: files=${result.files}, changed=${result.changed}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
