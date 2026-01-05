'use client';

import * as React from 'react';
import { ChevronRight, Search } from 'lucide-react';
import type { TreeItem } from '@/lib/encyclopedia';
import { buildParentMap, getAncestorIds, toTitleCase } from '@/lib/encyclopedia';

const SEARCH_DELAY = 250;
const TITLE_CACHE = new Map<string, string>();

function getDisplayLabel(label: string) {
  if (!TITLE_CACHE.has(label)) {
    TITLE_CACHE.set(label, toTitleCase(label));
  }
  return TITLE_CACHE.get(label)!;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

interface EncyclopediaSidebarProps {
  treeData: TreeItem[];
  selectedItemId?: string;
  onSelect: (item: TreeItem) => void;
  className?: string;
}

export function EncyclopediaSidebar({
  treeData,
  selectedItemId,
  onSelect,
  className,
}: EncyclopediaSidebarProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());

  const debouncedQuery = useDebouncedValue(searchQuery, SEARCH_DELAY);
  const parentMap = React.useMemo(() => buildParentMap(treeData), [treeData]);

  React.useEffect(() => {
    if (!selectedItemId) return;
    const ancestors = getAncestorIds(selectedItemId, parentMap);
    if (ancestors.size === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      ancestors.forEach((id) => next.add(id));
      return next;
    });
  }, [selectedItemId, parentMap]);

  const { filteredTree, matchingIds } = React.useMemo(() => {
    if (!debouncedQuery.trim()) {
      return { filteredTree: treeData, matchingIds: new Set<string>() };
    }

    const query = debouncedQuery.toLowerCase();
    const matches = new Set<string>();

    const filterTree = (items: TreeItem[]): TreeItem[] => {
      return items.reduce<TreeItem[]>((acc, item) => {
        const label = getDisplayLabel(item.label);
        const matchesLabel = label.toLowerCase().includes(query);
        const filteredChildren = item.children ? filterTree(item.children) : [];

        if (matchesLabel || filteredChildren.length > 0) {
          if (matchesLabel) {
            matches.add(item.id);
          }
          acc.push({
            ...item,
            children: filteredChildren.length > 0 ? filteredChildren : item.children,
          });
        }

        return acc;
      }, []);
    };

    return { filteredTree: filterTree(treeData), matchingIds: matches };
  }, [treeData, debouncedQuery]);

  React.useEffect(() => {
    if (!debouncedQuery.trim() || matchingIds.size === 0) return;

    const idsToExpand = new Set<string>();
    matchingIds.forEach((id) => {
      const ancestors = getAncestorIds(id, parentMap);
      ancestors.forEach((ancestorId) => idsToExpand.add(ancestorId));
      idsToExpand.add(id);
    });

    setExpandedIds(idsToExpand);
  }, [debouncedQuery, matchingIds, parentMap]);

  const handleToggle = React.useCallback((itemId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  return (
    <aside
      className={`flex flex-col w-72 min-h-0 border-r border-fd-border bg-fd-background ${className ?? ''}`}
    >
      <div className="px-3 py-3 border-b border-fd-border">
        <label className="flex items-center gap-2 rounded-md bg-fd-accent/40 px-3 py-2 text-sm text-fd-muted-foreground">
          <Search className="h-4 w-4" />
          <input
            className="w-full bg-transparent outline-none placeholder:text-fd-muted-foreground"
            placeholder="搜索图表模式..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <div className="px-2 text-xs uppercase tracking-wide text-fd-muted-foreground mb-2">
          目录
        </div>
        <nav className="space-y-1">
          {filteredTree.map((item) => (
            <TreeNode
              key={item.id}
              item={item}
              level={0}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggle={handleToggle}
              selectedItemId={selectedItemId}
              highlight={debouncedQuery}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}

const HighlightText = React.memo(function HighlightText({
  text,
  highlight,
}: {
  text: string;
  highlight: string;
}) {
  if (!highlight.trim()) return <>{text}</>;

  const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <span
            key={index}
            className="rounded bg-fd-accent/70 px-1 text-fd-foreground"
          >
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
});

interface TreeNodeProps {
  item: TreeItem;
  level: number;
  onSelect: (item: TreeItem) => void;
  selectedItemId?: string;
  expandedIds: Set<string>;
  onToggle: (itemId: string) => void;
  highlight: string;
}

const TreeNode = React.memo(function TreeNode({
  item,
  level,
  onSelect,
  selectedItemId,
  expandedIds,
  onToggle,
  highlight,
}: TreeNodeProps) {
  const hasChildren = Boolean(item.children && item.children.length > 0);
  const isExpanded = expandedIds.has(item.id);
  const isSelected = selectedItemId === item.id;
  const displayLabel = getDisplayLabel(item.label);

  const handleClick = React.useCallback(() => {
    onSelect(item);
    if (hasChildren) {
      onToggle(item.id);
    }
  }, [onSelect, item, hasChildren, onToggle]);

  const paddingLeft = 12 + level * 14;

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className={`w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
          isSelected
            ? 'bg-fd-accent text-fd-foreground'
            : 'text-fd-muted-foreground hover:bg-fd-accent/50 hover:text-fd-foreground'
        }`}
        style={{ paddingLeft }}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        <span className="mt-0.5">
          {hasChildren ? (
            <ChevronRight
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          ) : (
            <span className="inline-block h-4 w-4" />
          )}
        </span>
        <span className="leading-snug">
          <HighlightText text={displayLabel} highlight={highlight} />
        </span>
      </button>

      {hasChildren && isExpanded && (
        <div className="mt-1 space-y-1">
          {item.children!.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              level={level + 1}
              onSelect={onSelect}
              selectedItemId={selectedItemId}
              expandedIds={expandedIds}
              onToggle={onToggle}
              highlight={highlight}
            />
          ))}
        </div>
      )}
    </div>
  );
}, areTreeNodePropsEqual);

function areTreeNodePropsEqual(prev: TreeNodeProps, next: TreeNodeProps) {
  return (
    prev.item.id === next.item.id &&
    prev.selectedItemId === next.selectedItemId &&
    prev.highlight === next.highlight &&
    prev.level === next.level &&
    prev.expandedIds.has(prev.item.id) === next.expandedIds.has(next.item.id)
  );
}
