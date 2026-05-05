import { BrandMark } from "./logo";

export function Footer() {
  return (
    <footer className="relative mt-8 border-t border-[var(--border)] bg-[var(--surface)]/30 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-10 md:flex-row">
        <div className="flex items-center gap-3">
          <BrandMark size={22} gradient gradientId="footer-grad" />
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight text-[var(--text)]">
              TypeBridge
            </p>
            <p className="text-xs text-[var(--muted)]">
              <span className="text-accent-gradient font-semibold">
                手机即键盘
              </span>
              <span className="mx-1.5 text-[var(--subtle)]">·</span>
              macOS 菜单栏应用
            </p>
          </div>
        </div>

        <p className="text-xs text-[var(--subtle)]">
          © {new Date().getFullYear()} TypeBridge · 让手机成为桌面输入设备
        </p>
      </div>
    </footer>
  );
}
