export function Footer() {
  return (
    <footer className="relative mt-8 border-t border-[var(--border)] bg-[var(--surface)]/30 backdrop-blur-sm">
      <p className="mx-auto max-w-5xl px-6 py-6 text-center text-xs text-[var(--muted)]">
        TypeBridge © {new Date().getFullYear()}
        <span className="mx-1.5 text-[var(--subtle)]">·</span>
        手机即键盘
      </p>
    </footer>
  );
}
