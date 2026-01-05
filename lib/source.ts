import fs from 'node:fs';
import path from 'node:path';
import { docs } from 'fumadocs-mdx:collections/server';
import { type InferPageType, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import type { Folder, Item, Node, Root } from 'fumadocs-core/page-tree';
import { convertToTreeData, type EncyclopediaData, type TreeItem } from './encyclopedia';

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const ENCYCLOPEDIA_BASE = '/docs/brooks-encyclopedia';
const ENCYCLOPEDIA_JSON = path.join(
  process.cwd(),
  'public',
  'encyclopedia',
  'encyclopedia_complete.json',
);

function loadEncyclopediaData(): EncyclopediaData | null {
  try {
    const raw = fs.readFileSync(ENCYCLOPEDIA_JSON, 'utf8');
    return JSON.parse(raw) as EncyclopediaData;
  } catch (err) {
    console.warn('[encyclopedia] failed to load data', err);
    return null;
  }
}

function getEncyclopediaNodes(): Node[] | null {
  const data = loadEncyclopediaData();
  if (!data) return null;
  const treeItems = convertToTreeData(data);
  return buildEncyclopediaNodes(treeItems);
}

function buildEncyclopediaNodes(items: TreeItem[]): Node[] {
  return items.map((item) => {
    const url = `${ENCYCLOPEDIA_BASE}?item=${encodeURIComponent(item.id)}`;
    const id = `encyc-${item.id}`;
    if (item.children && item.children.length > 0) {
      const index: Item = {
        type: 'page',
        name: item.label,
        url,
        $id: `${id}-index`,
      };
      return {
        type: 'folder',
        name: item.label,
        index,
        children: buildEncyclopediaNodes(item.children),
        collapsible: true,
        $id: id,
      };
    }
    return {
      type: 'page',
      name: item.label,
      url,
      $id: id,
    };
  });
}

function findFolderByIndexUrl(node: Root | Folder, url: string): Folder | null {
  for (const child of node.children) {
    if (child.type === 'folder') {
      if (child.index?.url === url) return child;
      const found = findFolderByIndexUrl(child, url);
      if (found) return found;
    }
  }
  return null;
}

function findFolderByName(node: Root | Folder, name: string): Folder | null {
  for (const child of node.children) {
    if (child.type === 'folder') {
      if (typeof child.name === 'string' && child.name === name) return child;
      const found = findFolderByName(child, name);
      if (found) return found;
    }
  }
  return null;
}

function findPageByUrl(node: Root | Folder, url: string): Item | null {
  for (const child of node.children) {
    if (child.type === 'page' && child.url === url) return child;
    if (child.type === 'folder') {
      if (child.index?.url === url) return child.index;
      const found = findPageByUrl(child, url);
      if (found) return found;
    }
  }
  return null;
}

function replacePageWithFolder(
  node: Root | Folder,
  url: string,
  children: Node[],
): boolean {
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === 'page' && child.url === url) {
      const folder: Folder = {
        type: 'folder',
        name: child.name,
        description: child.description,
        icon: child.icon,
        root: true,
        defaultOpen: true,
        collapsible: true,
        index: child,
        children,
        $id: `encyc-root`,
      };
      node.children[i] = folder;
      return true;
    }
    if (child.type === 'folder') {
      const replaced = replacePageWithFolder(child, url, children);
      if (replaced) return true;
    }
  }
  return false;
}

function injectEncyclopediaTree() {
  const encyclopediaNodes = getEncyclopediaNodes();
  if (!encyclopediaNodes) return;
  const tree = source.pageTree;
  const targetFolder =
    findFolderByIndexUrl(tree, ENCYCLOPEDIA_BASE) ?? findFolderByName(tree, '百科全书');

  if (targetFolder) {
    targetFolder.children = encyclopediaNodes;
    targetFolder.defaultOpen = true;
  } else {
    replacePageWithFolder(tree, ENCYCLOPEDIA_BASE, encyclopediaNodes);
  }
  source.pageTree = tree;
}

injectEncyclopediaTree();

export function getEncyclopediaTree(): Root {
  const encyclopediaNodes = getEncyclopediaNodes();
  if (!encyclopediaNodes) return source.pageTree;
  const tree = source.pageTree;
  const targetFolder =
    findFolderByIndexUrl(tree, ENCYCLOPEDIA_BASE) ?? findFolderByName(tree, '百科全书');

  if (!targetFolder) {
    const page =
      findPageByUrl(tree, ENCYCLOPEDIA_BASE) ??
      ({
        type: 'page',
        name: '百科全书',
        url: ENCYCLOPEDIA_BASE,
        $id: 'encyc-root-index',
      } as Item);

    return {
      name: tree.name,
      children: [
        {
          type: 'folder',
          name: page.name,
          index: page,
          children: encyclopediaNodes,
          collapsible: true,
          defaultOpen: true,
          root: true,
          $id: 'encyc-root',
        },
      ],
      $id: 'encyc-only-root',
    };
  }

  return {
    name: tree.name,
    children: [
      {
        ...targetFolder,
        children: encyclopediaNodes,
        defaultOpen: true,
      },
    ],
    $id: `encyc-only-${targetFolder.$id ?? 'root'}`,
  };
}

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, 'image.png'];

  return {
    segments,
    url: `/og/docs/${segments.join('/')}`,
  };
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title}

${processed}`;
}
