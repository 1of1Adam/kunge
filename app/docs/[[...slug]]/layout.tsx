import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { baseOptions } from '@/lib/layout.shared';
import { getEncyclopediaTree, source } from '@/lib/source';
import { getSidebarTabs } from 'fumadocs-ui/utils/get-sidebar-tabs';
import type { CSSProperties, ReactNode } from 'react';

type LayoutParams = {
  slug?: string[];
};

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<LayoutParams>;
}) {
  const resolvedParams = await params;
  const isEncyclopedia = resolvedParams.slug?.[0] === 'brooks-encyclopedia';
  const tree = isEncyclopedia ? getEncyclopediaTree() : source.pageTree;
  const sidebar = isEncyclopedia
    ? {
        tabs: getSidebarTabs(source.pageTree, {
          transform: (option, node) => {
            if (typeof node.name === 'string' && node.name === '百科全书') {
              const urls = new Set(option.urls ?? []);
              urls.add('/docs/brooks-encyclopedia');
              return {
                ...option,
                url: '/docs/brooks-encyclopedia',
                urls,
              };
            }
            return option;
          },
        }),
      }
    : undefined;
  const containerProps = isEncyclopedia
    ? {
        style: {
          '--fd-layout-width': '100%',
          '--fd-toc-width': '0px',
        } as CSSProperties,
      }
    : undefined;

  return (
    <DocsLayout
      tree={tree}
      sidebar={sidebar}
      containerProps={containerProps}
      {...baseOptions()}
    >
      {children}
    </DocsLayout>
  );
}
