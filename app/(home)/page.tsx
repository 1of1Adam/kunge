import Link from 'next/link';

const bookIcon = (
  <svg className="w-5 h-5 md:w-6 md:h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5a10.5 10.5 0 00-3 .45v13.5A10.5 10.5 0 017.5 18c1.746 0 3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5a10.5 10.5 0 013 .45v13.5A10.5 10.5 0 0016.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const roadmapIcon = (
  <svg className="w-5 h-5 md:w-6 md:h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v16m0-16h12l-2 4 2 4H4" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 14h8l-2 4 2 4H4" />
  </svg>
);

const courses = [
  {
    title: 'TradingView',
    description: '私人定制项目，内部用户专享。',
    href: '/tradingview',
    tag: '项目',
    icon: (
      <svg className="w-5 h-5 md:w-6 md:h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3v18h18" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 15l3-3 3 3 4-6" />
      </svg>
    ),
  },
  {
    title: '成为专业价格行为交易员',
    description: '学习路线图与刻意练习指南',
    href: '/docs/professional-price-action-trader',
    tag: '路线图',
    icon: roadmapIcon,
  },
  {
    title: '百科全书',
    description: '10,000+ 张图表模式资料，支持搜索与分级浏览。',
    href: '/docs/brooks-encyclopedia',
    tag: '10,000+ PPT',
    icon: bookIcon,
  },
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
  {
    title: '突破研究白皮书',
    description: '突破与反转的统计研究与交易启发。',
    href: '/docs/breakouts-whitepaper',
    tag: '研究报告',
    icon: bookIcon,
  },
  {
    title: '价格行为三部曲·趋势',
    description: '第一卷：基础与趋势。已上线前言与总体框架。',
    href: '/docs/al-brooks-trends',
    tag: '已上线',
    icon: bookIcon,
  },
  {
    title: '价格行为三部曲·交易区间',
    description: '第二卷：聚焦交易区间、订单管理与交易数学，系统讲解突破、回调与交易者方程。',
    href: '/docs/al-brooks-trading-ranges',
    tag: '书籍简介',
    icon: bookIcon,
  },
  {
    title: '价格行为三部曲·反转',
    description: '第三卷：聚焦趋势反转、日内交易、日线图与期权，提炼最佳入场与风控框架。',
    href: '/docs/al-brooks-reversals',
    tag: '书籍简介',
    icon: bookIcon,
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
