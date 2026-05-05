import { Hero } from "./components/hero";
import { TopNav } from "./components/top-nav";

function SectionPlaceholder({
  id,
  eyebrow,
  title,
  subtitle,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <section
      id={id}
      className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-24"
    >
      <div className="max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-[var(--subtle)]">
          {eyebrow}
        </p>
        <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
          {title}
        </h2>
        <p className="mt-4 text-[var(--muted)]">{subtitle}</p>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <TopNav />
      <main className="page-bg relative">
        <Hero />
        <SectionPlaceholder
          id="scenes"
          eyebrow="场景"
          title="每一个场景，都是手机即键盘的一次验证。"
          subtitle="5 个使用场景轮播 tab 即将就位。"
        />
        <SectionPlaceholder
          id="flow"
          eyebrow="流程"
          title="看手机如何变成你的键盘。"
          subtitle="下载 → 打开 → 连接 → 注入，流程图即将就位。"
        />
        <SectionPlaceholder
          id="download"
          eyebrow="下载"
          title="马上把手机变成你的键盘。"
          subtitle="下载章节 + footer 即将就位。"
        />
      </main>
    </>
  );
}
