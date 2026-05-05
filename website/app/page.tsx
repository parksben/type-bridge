"use client";

import { Download } from "./components/download";
import { Flow } from "./components/flow";
import { Footer } from "./components/footer";
import { Hero } from "./components/hero";
import { Scenes } from "./components/scenes";
import { TopNav } from "./components/top-nav";
import { LanguageProvider } from "./lib/i18n";

export default function HomePage() {
  return (
    <LanguageProvider>
      <TopNav />
      <main className="page-bg relative">
        <Hero />
        <Scenes />
        <Flow />
        <Download />
      </main>
      <Footer />
    </LanguageProvider>
  );
}
