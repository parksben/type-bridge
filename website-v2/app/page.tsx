import { Download } from "./components/download";
import { Flow } from "./components/flow";
import { Footer } from "./components/footer";
import { Hero } from "./components/hero";
import { Scenes } from "./components/scenes";
import { TopNav } from "./components/top-nav";

export default function HomePage() {
  return (
    <>
      <TopNav />
      <main className="page-bg relative">
        <Hero />
        <Scenes />
        <Flow />
        <Download />
      </main>
      <Footer />
    </>
  );
}
