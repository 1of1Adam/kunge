import { getPageImage, source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/notebook/page';
import { notFound, redirect } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import ReadingPosition from './ReadingPosition';
import VideoHeader from '@/components/VideoHeader';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;

  // Redirect /docs to first page
  if (!params.slug || params.slug.length === 0) {
    redirect('/docs/al-brooks/price-action-fundamentals/01-terminology');
  }

  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  const slugKey = params.slug?.join('/') ?? '';
  const isEncyclopedia = slugKey === 'brooks-encyclopedia';

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={{ enabled: !isEncyclopedia }}
      tableOfContentPopover={{ enabled: !isEncyclopedia }}
    >
      {!isEncyclopedia && <VideoHeader slug={slugKey} />}
      {!isEncyclopedia && (
        <>
          <DocsTitle>{page.data.pageTitle || page.data.title}</DocsTitle>
          <DocsDescription>{page.data.description}</DocsDescription>
        </>
      )}
      <DocsBody className={isEncyclopedia ? 'max-w-none' : undefined}>
        {isEncyclopedia ? (
          <MDX
            components={getMDXComponents({
              a: createRelativeLink(source, page),
            })}
          />
        ) : (
          <ReadingPosition>
            <MDX
              components={getMDXComponents({
                // this allows you to link to other pages with relative file paths
                a: createRelativeLink(source, page),
              })}
            />
          </ReadingPosition>
        )}
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: PageProps<'/docs/[[...slug]]'>,
): Promise<Metadata> {
  const params = await props.params;

  // Skip metadata for root /docs (will redirect)
  if (!params.slug || params.slug.length === 0) {
    return { title: '价格行为交易' };
  }

  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImage(page).url,
    },
  };
}
