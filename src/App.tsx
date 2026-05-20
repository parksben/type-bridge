import { useEffect } from "react";
import MainWindow from "./components/MainWindow";
import AccessibilityGate from "./components/AccessibilityGate";
import LanguagePicker from "./components/LanguagePicker";

function App() {
  useEffect(() => {
    // React 首次渲染完成后移除隐藏，避免 WKWebView 绘制前的白屏闪烁
    document.documentElement.style.opacity = "1";
  }, []);

  // 全局禁用右键菜单，仅在表单输入控件 / 可编辑区里放行，
  // 这样输入框依然可以右键弹出系统的粘贴/拼写菜单。
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) {
        e.preventDefault();
        return;
      }
      const editable = target.closest(
        "input, textarea, [contenteditable='true'], [contenteditable=''], .tb-selectable",
      );
      if (!editable) {
        e.preventDefault();
      }
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
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

