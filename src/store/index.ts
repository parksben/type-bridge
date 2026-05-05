import { create } from "zustand";

/// 渠道标识——与 Rust ChannelId enum 的 serde 键对齐（见 src-tauri/src/channel.rs）。
/// v0.6 P0 引入；P0 阶段历史消息全部来自飞书，新字段主要供前端类型兼容。
/// v0.7 起增加 webchat（TypeBridge 官方网页扫码渠道，不走 sidecar）。
export type ChannelId = "webchat" | "feishu" | "dingtalk" | "wecom";

export const CHANNEL_LABEL: Record<ChannelId, string> = {
  webchat: "WebChat",
  feishu: "飞书",
  dingtalk: "钉钉",
  wecom: "企微",
};

export interface LogEntry {
  time: string;
  kind: "connect" | "message" | "inject" | "error" | "notify";
  text: string;
  /// 可选渠道前缀。P1 起后端 emit log 时显式带渠道；P0 旧日志无此字段。
  channel?: ChannelId;
}

export type MessageStatus = "queued" | "processing" | "sent" | "failed";

export interface FeedbackError {
  kind: string;     // "reaction" | "reply"
  code: number;
  msg: string;
  help_url?: string | null;
}

export interface HistoryMessage {
  /// 复合 id `{channel}:{source_id}`，例：`feishu:om_xxx`。v0.5 之前是原始
  /// 飞书 id，Rust 启动时会自动迁移成复合格式（见 history::migrate_legacy）。
  id: string;
  /// 消息所属渠道。Rust 端通过 serde 默认值兼容旧记录（默认飞书）。
  channel: ChannelId;
  /// 平台原始 message_id——仅用于后端调平台 API；前端一般不关心。
  source_message_id: string;
  received_at: number;  // Unix seconds
  updated_at: number;
  sender: string;
  text: string;
  image_path: string | null;
  status: MessageStatus;
  failure_reason?: string | null;
  feedback_error?: FeedbackError | null;
  /// 非 reaction 渠道（钉钉 / 企微）的状态反馈卡片 id。P0 只占位，不消费。
  feedback_card_id?: string | null;
}

export type TabId =
  | "connection"  // 连接 TypeBridge（内容页再用横向子 tab 切渠道）
  | "input"       // 输入设置
  | "history"     // 历史消息
  | "logs"        // 系统日志
  | "about";      // 关于 TypeBridge（v0.7.x 起）

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

/// Settings 是 Rust `store::Settings` 的 TS 镜像。包含所有渠道凭据 + 输入设置。
/// 任一 tab 修改自己关心的字段时必须先 `get_settings` 再 merge 回写，避免
/// 清空其他渠道 / 其他 tab 拥有的字段。
export interface Settings {
  feishu_app_id: string;
  feishu_app_secret: string;
  dingtalk_client_id: string;
  dingtalk_client_secret: string;
  wecom_bot_id: string;
  wecom_secret: string;
  auto_submit: boolean;
  submit_key: SubmitKey;
}

interface AppStore {
  /// 每渠道独立的连接状态。仅"已配置凭据且启动过 sidecar"的渠道存在 key。
  channelConnected: Partial<Record<ChannelId, boolean>>;
  autoSubmit: boolean;
  submitKey: SubmitKey;
  logs: LogEntry[];
  history: HistoryMessage[];
  hiddenHistoryIds: Set<string>;
  activeTab: TabId;
  /// 「连接 TypeBridge」tab 内部横向子 tab 的选中渠道。切走 sidebar tab 再回来
  /// 保留选中——用户半途去改输入设置或看历史不会丢上下文。
  activeConnectionChannel: ChannelId;

  setChannelConnected: (channel: ChannelId, connected: boolean) => void;
  setAutoSubmit: (v: boolean) => void;
  setSubmitKey: (k: SubmitKey) => void;
  setActiveTab: (tab: TabId) => void;
  setActiveConnectionChannel: (ch: ChannelId) => void;
  addLog: (entry: Omit<LogEntry, "time">) => void;
  clearLogs: () => void;
  setHistory: (items: HistoryMessage[]) => void;
  upsertHistoryMessage: (msg: HistoryMessage) => void;
  updateHistoryStatus: (id: string, status: MessageStatus, reason?: string) => void;
  removeHistoryMessage: (id: string) => void;
  clearHistoryDisplay: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  channelConnected: {},
  autoSubmit: true,
  submitKey: DEFAULT_SUBMIT_KEY,
  logs: [],
  history: [],
  hiddenHistoryIds: new Set(),
  activeTab: "connection",
  activeConnectionChannel: "webchat",

  setChannelConnected: (channel, connected) =>
    set((state) => ({
      channelConnected: { ...state.channelConnected, [channel]: connected },
    })),
  setAutoSubmit: (autoSubmit) => set({ autoSubmit }),
  setSubmitKey: (submitKey) => set({ submitKey }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setActiveConnectionChannel: (activeConnectionChannel) =>
    set({ activeConnectionChannel }),

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
    set(() => ({
      history: [],
      hiddenHistoryIds: new Set<string>(),
    })),
}));

