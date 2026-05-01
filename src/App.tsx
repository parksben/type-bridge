import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import ConfigWindow from "./components/ConfigWindow";
import LogWindow from "./components/LogWindow";
import ConfirmOverlay from "./components/ConfirmOverlay";
import "./App.css";

function App() {
  const isLogWindow =
    typeof window !== "undefined" &&
    window.location.pathname === "/log";

  return isLogWindow ? <LogWindow /> : (
    <>
      <ConfigWindow />
      <ConfirmOverlay />
    </>
  );
}

export default App;
