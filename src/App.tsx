import ConfigWindow from "./components/ConfigWindow";
import LogWindow from "./components/LogWindow";
import ConfirmOverlay from "./components/ConfirmOverlay";

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
