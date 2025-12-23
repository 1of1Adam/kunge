import Link from 'next/link';

const courses = [
  {
    title: 'Al Brooks 价格行为',
    description: '趋势、通道、交易区间。从裸K到完整交易系统。',
    href: '/docs/al-brooks',
    tag: '52 课时',
    icon: (
      <svg className="w-5 h-5 md:w-6 md:h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    title: '八种高胜率策略',
    description: '60-80% 胜率的入场策略。回调、突破、反转、楔形旗形。',
    href: '/docs/8-best-strategies',
    tag: '11 章节',
    icon: (
      <svg className="w-5 h-5 md:w-6 md:h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-col items-center px-4 py-16 md:py-24">
      <div className="max-w-2xl w-full">
        <div className="mb-12 md:mb-16 text-center">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">价格行为</h1>
          <p className="mt-2 md:mt-3 text-sm md:text-base text-fd-muted-foreground">
            读懂市场语言
          </p>
        </div>

        <div className="space-y-2 md:space-y-4">
          {courses.map((course) => (
            <Link
              key={course.href}
              href={course.href}
              className="group flex items-center gap-3 md:gap-4 p-3 md:p-4 -mx-3 md:-mx-4 rounded-lg hover:bg-fd-accent/50 active:bg-fd-accent/70 transition-colors"
            >
              <div className="text-fd-muted-foreground group-hover:text-fd-foreground transition-colors">
                {course.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="text-sm md:text-base font-medium group-hover:text-fd-primary transition-colors">
                    {course.title}
                  </h2>
                  <span className="text-xs text-fd-muted-foreground">
                    {course.tag}
                  </span>
                </div>
                <p className="text-xs md:text-sm text-fd-muted-foreground mt-1 line-clamp-2">
                  {course.description}
                </p>
              </div>
              <svg className="w-4 h-4 shrink-0 text-fd-muted-foreground group-hover:text-fd-foreground group-hover:translate-x-0.5 transition-all hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
