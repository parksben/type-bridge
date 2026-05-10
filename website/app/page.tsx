import { headers } from "next/headers";
import { HomePageClient } from "./home-client";
import type { Language } from "./lib/i18n";

async function detectLanguageFromHeaders(): Promise<Language> {
  try {
    const headersList = await headers();
    const acceptLang = headersList.get("accept-language") || "";
    const trimmed = acceptLang.trim().toLowerCase();
    if (trimmed.startsWith("zh")) return "zh";
  } catch {}
  return "en";
}

export default async function HomePage() {
  const initialLang = await detectLanguageFromHeaders();
  return <HomePageClient initialLang={initialLang} />;
}
