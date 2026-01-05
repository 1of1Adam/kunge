export interface EncyclopediaMetadata {
  title: string;
  version: string;
  source: string;
  totalParts: number;
  totalSections: number;
  totalSlides: number;
}

export interface SlideChild {
  slideNum: number;
  title: string;
}

export interface Section {
  slideNum: number;
  title: string;
  childCount: number;
  children: SlideChild[];
}

export interface Part {
  partNum: number;
  sectionCount: number;
  slideCount: number;
  sections: Section[];
}

export interface EncyclopediaData {
  metadata: EncyclopediaMetadata;
  parts: Record<string, Part>;
}

export type TreeItem = {
  id: string;
  label: string;
  slideNum?: number;
  children?: TreeItem[];
  type: 'part' | 'section' | 'slide';
};

export function toTitleCase(text: string): string {
  const lowercaseWords = new Set(['to', 'of', 'and', 'the', 'a', 'an', 'in', 'on', 'at', 'for']);
  const preserveAbbreviations = new Set([
    'GD',
    'GU',
    'LL',
    'HH',
    'LH',
    'HL',
    'EMA',
    'MTR',
    'PB',
    'AIL',
    'AIS',
    'TR',
    'DB',
    'DT',
    'MM',
    'BO',
    'FOMC',
  ]);

  return text
    .split(' ')
    .map((word, index) => {
      if (/^Part$/i.test(word)) return 'Part';
      if (/^[A-Z]$/.test(word)) return word;

      const upperWord = word.toUpperCase();
      if (preserveAbbreviations.has(upperWord)) return upperWord;

      if (word.includes('-')) {
        return word
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join('-');
      }

      if (index > 0 && lowercaseWords.has(word.toLowerCase())) {
        return word.toLowerCase();
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export function convertToTreeData(data: EncyclopediaData): TreeItem[] {
  const parts = Object.entries(data.parts).sort(([a], [b]) => {
    const numA = parseInt(a.replace('part', ''), 10);
    const numB = parseInt(b.replace('part', ''), 10);
    return numA - numB;
  });

  return parts.map(([partKey, part]) => ({
    id: partKey,
    label: `Part ${part.partNum}`,
    type: 'part' as const,
    children: part.sections.map((section, idx) => ({
      id: `${partKey}-section-${idx}`,
      label: section.title,
      slideNum: section.slideNum,
      type: 'section' as const,
      children: section.children.map((child, childIdx) => ({
        id: `${partKey}-section-${idx}-slide-${childIdx}`,
        label: child.title,
        slideNum: child.slideNum,
        type: 'slide' as const,
      })),
    })),
  }));
}

export function findItemById(items: TreeItem[], id: string): TreeItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findItemById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findFirstSlide(items: TreeItem[]): TreeItem | null {
  for (const item of items) {
    if (item.slideNum) return item;
    if (item.children) {
      const found = findFirstSlide(item.children);
      if (found) return found;
    }
  }
  return null;
}

export function buildParentMap(
  items: TreeItem[],
  parentId: string | null = null,
  map: Map<string, string | null> = new Map(),
): Map<string, string | null> {
  for (const item of items) {
    map.set(item.id, parentId);
    if (item.children?.length) {
      buildParentMap(item.children, item.id, map);
    }
  }
  return map;
}

export function buildItemMap(
  items: TreeItem[],
  map: Map<string, TreeItem> = new Map(),
): Map<string, TreeItem> {
  for (const item of items) {
    map.set(item.id, item);
    if (item.children?.length) {
      buildItemMap(item.children, map);
    }
  }
  return map;
}

export function getAncestorIds(
  itemId: string,
  parentMap: Map<string, string | null>,
): Set<string> {
  const ancestors = new Set<string>();
  let currentId: string | null = parentMap.get(itemId) ?? null;

  while (currentId) {
    ancestors.add(currentId);
    currentId = parentMap.get(currentId) ?? null;
  }

  return ancestors;
}
