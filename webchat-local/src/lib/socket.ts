// socket.io 客户端封装。
//
// 与 Rust 侧 webchat_server.rs 的协议对齐：
//   connect → emit("hello", {otp, clientId, ua}) with ack → {ok, userToken, sessionId} 或 {ok:false, reason}
//   emit("text", {userToken, clientMessageId, text}) with ack → {success, reason?}
//   emit("image", {userToken, clientMessageId, data, mime}) with ack → {success, reason?}
//
// 内置：重连（io-client 默认指数退避）、心跳（engine.io 协议自带）、断开回调。

import { io, Socket } from "socket.io-client";
import { simplifyDeviceLabel } from "./ua";
import { t } from "@/i18n";

export type HelloAck =
  | { ok: true; userToken: string; sessionId: string }
  | { ok: false; reason: string };

export type MessageAck = { success: boolean; reason?: string };

export type ClientStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

export interface ConnectOptions {
  /** socket.io server 绝对地址；默认同源（空字符串让 client 连 window.location） */
  url?: string;
  onStatusChange?: (s: ClientStatus) => void;
}

export class WebChatClient {
  private socket: Socket;
  private userToken: string | null = null;

  constructor(opts: ConnectOptions = {}) {
    // 空 url = io() 默认连 window.location.host，同源无跨域问题
    this.socket = io(opts.url ?? "", {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      transports: ["websocket", "polling"],
    });

    if (opts.onStatusChange) {
      const s = opts.onStatusChange;
      this.socket.on("connect", () => s("connected"));
      this.socket.on("disconnect", () => s("disconnected"));
      this.socket.io.on("reconnect_attempt", () => s("reconnecting"));
      this.socket.io.on("reconnect", () => s("connected"));
    }
  }

  connect() {
    this.socket.connect();
  }

  disconnect() {
    this.socket.disconnect();
  }

  /**
   * 监听 server 推送的 OTP 轮换通知（每 60s 一次）。
   * 回调接收新 OTP 明文，调用方负责更新 URL。
   * 仅认证成功（hello ok）的连接才会收到此事件。
   */
  onOtpRefresh(callback: (newOtp: string) => void): () => void {
    const handler = (payload: { otp: string }) => {
      if (payload?.otp) callback(payload.otp);
    };
    this.socket.on("otp-refresh", handler);
    return () => this.socket.off("otp-refresh", handler);
  }

  /** 握手：送 OTP 给 server 校验，返回 userToken */
  async hello(otp: string, clientId: string): Promise<HelloAck> {
    return new Promise((resolve) => {
      const payload = {
        otp,
        clientId,
        ua: simplifyDeviceLabel(),
      };
      this.socket
        .timeout(8000)
        .emit("hello", payload, (err: unknown, ack: HelloAck) => {
          if (err) {
            resolve({ ok: false, reason: t("socket.helloTimeout") });
            return;
          }
          if (ack && ack.ok) {
            this.userToken = ack.userToken;
          }
          resolve(ack);
        });
    });
  }

  /** 发文本消息。需要已完成 hello */
  async sendText(clientMessageId: string, text: string): Promise<MessageAck> {
    if (!this.userToken) {
      return { success: false, reason: t("socket.notHandshaked") };
    }
    return new Promise((resolve) => {
      this.socket
        .timeout(15000)
        .emit(
          "text",
          {
            userToken: this.userToken,
            clientMessageId,
            text,
          },
          (err: unknown, ack: MessageAck) => {
            if (err) {
              resolve({ success: false, reason: t("socket.timeout") });
              return;
            }
            resolve(ack ?? { success: false, reason: t("socket.serverNoResponse") });
          },
        );
    });
  }

  /** 发图片（base64，不带 data:mime 前缀） */
  async sendImage(
    clientMessageId: string,
    base64Data: string,
    mime: string,
  ): Promise<MessageAck> {
    if (!this.userToken) {
      return { success: false, reason: t("socket.notHandshaked") };
    }
    return new Promise((resolve) => {
      this.socket
        .timeout(30000)
        .emit(
          "image",
          {
            userToken: this.userToken,
            clientMessageId,
            data: base64Data,
            mime,
          },
          (err: unknown, ack: MessageAck) => {
            if (err) {
              resolve({ success: false, reason: t("socket.timeout") });
              return;
            }
            resolve(ack ?? { success: false, reason: t("socket.serverNoResponse") });
          },
        );
    });
  }

  /** 已握手 token（用于持久化） */
  getUserToken(): string | null {
    return this.userToken;
  }

  /** 恢复已持久化的 token（刷新页面时用） */
  setUserToken(token: string) {
    this.userToken = token;
  }

  /**
   * 发送控制键事件（Enter / Backspace / Space / Arrow*）。
   * code 是 W3C KeyboardEvent.code 字面量，server 侧白名单约束（详见
   * TECH_DESIGN §35.11.3）。
   * 与 text/image 共用同一 FIFO 队列，严格按用户点击顺序串行注入。
   */
  async sendKey(clientMessageId: string, code: string): Promise<MessageAck> {
    if (!this.userToken) {
      return { success: false, reason: t("socket.notHandshaked") };
    }
    return new Promise((resolve) => {
      this.socket
        .timeout(10000)
        .emit(
          "key",
          {
            userToken: this.userToken,
            clientMessageId,
            code,
          },
          (err: unknown, ack: MessageAck) => {
            if (err) {
              resolve({ success: false, reason: t("socket.timeout") });
              return;
            }
            resolve(ack ?? { success: false, reason: t("socket.serverNoResponse") });
          },
        );
    });
  }

  /** 发送快捷键组合（Undo/Redo/SelectAll/Copy/Cut/Paste）。server 直接模拟 Cmd+* */
  async sendKeyCombo(clientMessageId: string, combo: string): Promise<MessageAck> {
    if (!this.userToken) {
      return { success: false, reason: t("socket.notHandshaked") };
    }
    return new Promise((resolve) => {
      this.socket
        .timeout(10000)
        .emit(
          "key_combo",
          { userToken: this.userToken, clientMessageId, combo },
          (err: unknown, ack: MessageAck) => {
            if (err) {
              resolve({ success: false, reason: t("socket.timeout") });
              return;
            }
            resolve(ack ?? { success: false, reason: t("socket.serverNoResponse") });
          },
        );
    });
  }

  /** 鼠标移动（相对位移）。fire-and-forget，无 ack。 */
  sendMouseMove(dx: number, dy: number): void {
    if (!this.userToken) return;
    this.socket.emit("mouse_move", { userToken: this.userToken, dx, dy });
  }

  /** 双指滚动。fire-and-forget，无 ack。dx/dy 为像素量（负=向上/左）。 */
  sendMouseScroll(dx: number, dy: number): void {
    if (!this.userToken) return;
    this.socket.emit("mouse_scroll", { userToken: this.userToken, dx, dy });
  }

  /** 鼠标按键事件（down / up）。fire-and-forget，无 ack。 */
  sendMouseClick(button: "left" | "right", action: "down" | "up"): void {
    if (!this.userToken) return;
    this.socket.emit("mouse_click", { userToken: this.userToken, button, action });
  }

  /** 双指缩放。delta 为归一化量（正=放大，负=缩小）。fire-and-forget。 */
  sendMouseZoom(delta: number): void {
    if (!this.userToken) return;
    this.socket.emit("mouse_zoom", { userToken: this.userToken, delta });
  }
}