import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { ThemeAuthEntry } from '@/components/clerk-auth-entry';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: '价格行为交易',
    },
    themeSwitch: {
      component: <ThemeAuthEntry />,
    },
  };
}
