import { useEffect } from "react";
import MainWindow from "./components/MainWindow";
import AccessibilityGate from "./components/AccessibilityGate";
import LanguagePicker from "./components/LanguagePicker";

function App() {
  useEffect(() => {
    // React 首次渲染完成后移除隐藏，避免 WKWebView 绘制前的白屏闪烁
    document.documentElement.style.opacity = "1";
  }, []);

  return (
    <>
      <MainWindow />
      <AccessibilityGate />
      <LanguagePicker />
    </>
  );
}

export default App;
