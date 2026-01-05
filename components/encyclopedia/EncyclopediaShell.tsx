'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  convertToTreeData,
  findItemById,
  findFirstSlide,
  type EncyclopediaData,
  type TreeItem,
} from '@/lib/encyclopedia';
import { SlideViewer } from '@/components/encyclopedia/SlideViewer';

const DATA_URL = '/encyclopedia/encyclopedia_complete.json';
const STORAGE_KEY = 'kunge-encyclopedia-state';

function getSavedState(): { selectedItemId?: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function EncyclopediaShell() {
  const [data, setData] = React.useState<EncyclopediaData | null>(null);
  const [treeData, setTreeData] = React.useState<TreeItem[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<TreeItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const searchParams = useSearchParams();

  React.useEffect(() => {
    document.body.classList.add('encyclopedia-view');
    return () => {
      document.body.classList.remove('encyclopedia-view');
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error('Failed to load encyclopedia');
        const json = (await response.json()) as EncyclopediaData;
        if (cancelled) return;

        const tree = convertToTreeData(json);
        setData(json);
        setTreeData(tree);

        const savedId = getSavedState()?.selectedItemId;
        const restored = savedId ? findItemById(tree, savedId) : null;
        const initial = restored ?? null;
        setSelectedItem(initial);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError('百科全书数据加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const urlItemId = searchParams.get('item');

  React.useEffect(() => {
    if (treeData.length === 0) return;
    const urlItem = urlItemId ? findItemById(treeData, urlItemId) : null;
    const fallback = selectedItem ?? findFirstSlide(treeData);
    const nextItem = urlItem ?? fallback;

    if (nextItem && nextItem.id !== selectedItem?.id) {
      setSelectedItem(nextItem);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedItemId: nextItem.id }));
      } catch (err) {
        console.warn('Failed to save encyclopedia state', err);
      }
    }
  }, [treeData, urlItemId, selectedItem]);

  const resolvedItem = React.useMemo(() => {
    if (!selectedItem) return null;
    if (selectedItem.slideNum) return selectedItem;
    const queue = [...(selectedItem.children ?? [])];
    while (queue.length > 0) {
      const next = queue.shift()!;
      if (next.slideNum) return next;
      if (next.children) queue.push(...next.children);
    }
    return null;
  }, [selectedItem]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-4 border-fd-foreground/20 border-t-fd-foreground" />
          <p className="text-sm text-fd-muted-foreground">正在加载百科全书...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <div className="text-center">
          <p className="text-base text-red-600">加载失败</p>
          <p className="text-sm text-fd-muted-foreground">{error || '无法读取百科全书数据'}</p>
        </div>
      </div>
    );
  }

  if (!resolvedItem) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <p className="text-sm text-fd-muted-foreground">未找到可展示的幻灯片。</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[60vh]">
      <SlideViewer item={resolvedItem} />
    </div>
  );
}
