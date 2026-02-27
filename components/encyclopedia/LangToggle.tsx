'use client';

interface LangToggleProps {
  lang: 'en' | 'zh';
  onToggle: () => void;
}

export function LangToggle({ lang, onToggle }: LangToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="inline-flex items-center gap-1 rounded-md border border-fd-border bg-fd-background px-2.5 py-1 text-sm font-medium transition-colors hover:bg-fd-accent"
      title={lang === 'en' ? '切换为中文' : 'Switch to English'}
    >
      <span
        className={
          lang === 'en'
            ? 'text-fd-primary font-semibold'
            : 'text-fd-muted-foreground'
        }
      >
        EN
      </span>
      <span className="text-fd-muted-foreground">/</span>
      <span
        className={
          lang === 'zh'
            ? 'text-fd-primary font-semibold'
            : 'text-fd-muted-foreground'
        }
      >
        中
      </span>
    </button>
  );
}
