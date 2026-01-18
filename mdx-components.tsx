import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import Image from 'next/image';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    img: (props: React.ImgHTMLAttributes<HTMLImageElement> & { src?: string | { src: string; width: number; height: number } }) => {
      const { src, alt, ...rest } = props;

      const imageClass = "rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-md my-6";

      // 处理静态导入的图片（对象形式）
      if (typeof src === 'object' && src !== null) {
        return (
          <Image
            src={src}
            alt={alt || ''}
            className={imageClass}
          />
        );
      }

      // 处理普通字符串路径
      return (
        <img
          src={src}
          alt={alt}
          {...rest}
          className={imageClass}
        />
      );
    },
    ...components,
  };
}
