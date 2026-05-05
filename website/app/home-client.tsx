"use client";

import { Download } from "./components/download";
import { Flow } from "./components/flow";
import { Hero } from "./components/hero";
import { Scenes } from "./components/scenes";
import { TopNav } from "./components/top-nav";
import { LanguageProvider, type Language } from "./lib/i18n";

export function HomePageClient({ initialLang }: { initialLang: Language }) {
  return (
    <LanguageProvider initialLang={initialLang}>
      <TopNav />
      <main className="page-bg relative">
        <Hero />
        <Scenes />
        <Flow />
        <Download />
      </main>
    </LanguageProvider>
  );
}
