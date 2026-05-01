import { create } from "zustand";

export interface LogEntry {
  time: string;
  kind: "connect" | "message" | "inject" | "error" | "notify";
  text: string;
}

interface AppStore {
  connected: boolean;
  confirmBeforeInject: boolean;
  logs: LogEntry[];
  setConnected: (v: boolean) => void;
  setConfirmBeforeInject: (v: boolean) => void;
  addLog: (entry: Omit<LogEntry, "time">) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  connected: false,
  confirmBeforeInject: false,
  logs: [],
  setConnected: (connected) => set({ connected }),
  setConfirmBeforeInject: (confirmBeforeInject) => set({ confirmBeforeInject }),
  addLog: (entry) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          ...entry,
          time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        },
      ].slice(-500), // cap at 500 entries
    })),
}));
