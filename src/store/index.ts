import { create } from "zustand";

export interface LogEntry {
  time: string;
  kind: "connect" | "message" | "inject" | "error" | "notify";
  text: string;
}

export type MessageStatus = "queued" | "processing" | "sent" | "failed";

export interface HistoryMessage {
  id: string;
  received_at: number;  // Unix seconds
  updated_at: number;
  sender: string;
  text: string;
  image_path: string | null;
  status: MessageStatus;
  failure_reason?: string | null;
}

export type TabId = "connection" | "history" | "logs";

export interface SubmitKey {
  key: string;      // KeyboardEvent.code (e.g. "Enter", "KeyA", "Space")
  cmd: boolean;
  shift: boolean;
  option: boolean;
  ctrl: boolean;
}

export const DEFAULT_SUBMIT_KEY: SubmitKey = {
  key: "Enter",
  cmd: false,
  shift: false,
  option: false,
  ctrl: false,
};

interface AppStore {
  connected: boolean;
  confirmBeforeInject: boolean;
  autoSubmit: boolean;
  submitKey: SubmitKey;
  logs: LogEntry[];
  history: HistoryMessage[];
  hiddenHistoryIds: Set<string>;
  activeTab: TabId;

  setConnected: (v: boolean) => void;
  setConfirmBeforeInject: (v: boolean) => void;
  setAutoSubmit: (v: boolean) => void;
  setSubmitKey: (k: SubmitKey) => void;
  setActiveTab: (tab: TabId) => void;
  addLog: (entry: Omit<LogEntry, "time">) => void;
  clearLogs: () => void;
  setHistory: (items: HistoryMessage[]) => void;
  upsertHistoryMessage: (msg: HistoryMessage) => void;
  updateHistoryStatus: (id: string, status: MessageStatus, reason?: string) => void;
  removeHistoryMessage: (id: string) => void;
  clearHistoryDisplay: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  connected: false,
  confirmBeforeInject: false,
  autoSubmit: true,
  submitKey: DEFAULT_SUBMIT_KEY,
  logs: [],
  history: [],
  hiddenHistoryIds: new Set(),
  activeTab: "connection",

  setConnected: (connected) => set({ connected }),
  setConfirmBeforeInject: (confirmBeforeInject) => set({ confirmBeforeInject }),
  setAutoSubmit: (autoSubmit) => set({ autoSubmit }),
  setSubmitKey: (submitKey) => set({ submitKey }),
  setActiveTab: (activeTab) => set({ activeTab }),

  addLog: (entry) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          ...entry,
          time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        },
      ].slice(-500),
    })),

  clearLogs: () => set({ logs: [] }),

  setHistory: (history) => set({ history }),

  upsertHistoryMessage: (msg) =>
    set((state) => {
      const idx = state.history.findIndex((m) => m.id === msg.id);
      if (idx >= 0) {
        const next = state.history.slice();
        next[idx] = msg;
        return { history: next };
      }
      return { history: [msg, ...state.history] };
    }),

  updateHistoryStatus: (id, status, reason) =>
    set((state) => ({
      history: state.history.map((m) =>
        m.id === id
          ? { ...m, status, failure_reason: reason ?? null, updated_at: Math.floor(Date.now() / 1000) }
          : m
      ),
    })),

  removeHistoryMessage: (id) =>
    set((state) => {
      // 真正删除后，从隐藏集合里也剔除（防止 id 复用产生幽灵状态）
      const nextHidden = new Set(state.hiddenHistoryIds);
      nextHidden.delete(id);
      return {
        history: state.history.filter((m) => m.id !== id),
        hiddenHistoryIds: nextHidden,
      };
    }),

  clearHistoryDisplay: () =>
    set((state) => ({
      hiddenHistoryIds: new Set(state.history.map((m) => m.id)),
    })),
}));

