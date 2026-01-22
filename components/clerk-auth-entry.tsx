'use client';

import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { cn } from '@fumadocs/ui/cn';
import { Airplay, Moon, Sun } from '@fumadocs/ui/icons';
import { cva } from 'class-variance-authority';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const itemVariants = cva('size-6.5 rounded-full p-1.5 text-fd-muted-foreground', {
  variants: {
    active: {
      true: 'bg-fd-accent text-fd-accent-foreground',
      false: 'text-fd-muted-foreground',
    },
  },
});

const themeItems = [
  ['light', Sun],
  ['dark', Moon],
  ['system', Airplay],
] as const;

type ThemeAuthEntryProps = {
  className?: string;
  mode?: 'light-dark' | 'light-dark-system';
};

function ThemeToggle({ className, mode = 'light-dark' }: ThemeAuthEntryProps) {
  const { setTheme, theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const container = cn('inline-flex items-center rounded-full border p-1', className);

  if (mode === 'light-dark') {
    const value = mounted ? resolvedTheme : null;
    return (
      <button
        className={container}
        aria-label="Toggle Theme"
        onClick={() => setTheme(value === 'light' ? 'dark' : 'light')}
        data-theme-toggle=""
      >
        {themeItems.map(([key, Icon]) =>
          key === 'system' ? null : (
            <Icon
              key={key}
              fill="currentColor"
              className={cn(itemVariants({ active: value === key }))}
            />
          )
        )}
      </button>
    );
  }

  const value = mounted ? theme : null;
  return (
    <div className={container} data-theme-toggle="">
      {themeItems.map(([key, Icon]) => (
        <button
          key={key}
          aria-label={key}
          className={cn(itemVariants({ active: value === key }))}
          onClick={() => setTheme(key)}
        >
          <Icon className="size-full" fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

export function ThemeAuthEntry({ className, mode }: ThemeAuthEntryProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <ThemeToggle mode={mode} />
      <SignedOut>
        <SignInButton>
          <button
            type="button"
            className={cn(
              buttonVariants({ color: 'ghost', size: 'sm' }),
              'text-xs'
            )}
          >
            登录
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton appearance={{ elements: { avatarBox: 'size-7' } }} />
      </SignedIn>
    </div>
  );
}
