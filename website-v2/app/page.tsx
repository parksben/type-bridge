export default function HomePage() {
  return (
    <main className="page-bg relative min-h-screen">
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-[var(--muted)]">
            TypeBridge · website-v2
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            手机<span className="text-accent-gradient">即键盘</span>。
          </h1>
          <p className="mt-4 text-[var(--muted)]">
            新版落地页开发中 · 脚手架就绪
          </p>
        </div>
      </div>
    </main>
  );
}
