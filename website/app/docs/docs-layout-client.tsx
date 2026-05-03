"use client";

import { usePathname } from "next/navigation";
import { LeftSidebar } from "./left-sidebar";
import { RightSidebar } from "./right-sidebar";

export function DocsLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isTutorial = /^\/docs\/(feishu|dingtalk|wecom)/.test(pathname);

  if (!isTutorial) {
    return <>{children}</>;
  }

  return (
    <div className="flex max-w-screen-xl mx-auto px-6 pt-16">
      <LeftSidebar currentPath={pathname} />
      <main className="flex-1 min-w-0 py-16 md:py-24">{children}</main>
      <RightSidebar />
    </div>
  );
}
