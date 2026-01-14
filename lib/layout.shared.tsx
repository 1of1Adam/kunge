import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { ThemeAuthEntry } from '@/components/clerk-auth-entry';
import Image from 'next/image';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image src="/logo.png" alt="Logo" width={24} height={24} />
          <span>价格行为交易</span>
        </>
      ),
    },
    themeSwitch: {
      component: <ThemeAuthEntry />,
    },
  };
}
