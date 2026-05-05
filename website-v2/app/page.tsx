import { Flow } from "./components/flow";
import { Hero } from "./components/hero";
import { Scenes } from "./components/scenes";
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
        <Scenes />
        <Flow />
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
