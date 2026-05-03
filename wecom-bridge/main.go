// wecom-bridge — Tauri sidecar for WeCom (企业微信) AI Bot long connection.
//
// 与 feishu-bridge / dingtalk-bridge 架构对称：
//   - 环境变量传凭据（WECOM_BOT_ID / WECOM_SECRET）
//   - stdout 输出 JSON Lines 事件（每条自带 channel:"wecom"）
//   - stdin 接收 JSON Lines 命令（selftest / streaming_reply / reply legacy）
//
// 关键差异：WeCom 没有官方 Go SDK，WSS 协议完全手写
// 协议参考：https://developer.work.weixin.qq.com/document/path/101463（2026/04/15 更新）
//
//   - 端点 wss://openws.work.weixin.qq.com
//   - 订阅 cmd=aibot_subscribe 带 bot_id/secret
//   - 消息回调 cmd=aibot_msg_callback（含 req_id，后续 reply 必须透传）
//   - 反馈 cmd=aibot_respond_msg 带 stream.id+finish（同 stream.id 原地更新）
//   - 心跳 cmd=ping 每 30s，超时断连
//   - 单连接约束：新订阅踢旧连接（服务端发 disconnected_event）

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	botID := os.Getenv("WECOM_BOT_ID")
	secret := os.Getenv("WECOM_SECRET")

	if botID == "" || secret == "" {
		emitError("WECOM_BOT_ID or WECOM_SECRET not set")
		os.Exit(1)
	}

	cli := NewClient(botID, secret)

	emitStatus(false)

	// stdin 命令读取协程（selftest / streaming_reply）
	go startCommandLoop(cli)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 信号 → 取消 ctx → Run 返回
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		cancel()
	}()

	// Run 阻塞：
	//   - 订阅失败 / 心跳超时 / 读循环错误 → 返回 err
	//   - disconnected_event 被踢 → 返回特定 err（Rust 侧指数退避重连）
	if err := cli.Run(ctx); err != nil {
		emitError(fmt.Sprintf("run failed: %v", err))
		emitStatus(false)
		os.Exit(1)
	}

	emitStatus(false)
}

func emitStatus(connected bool) {
	b, _ := json.Marshal(map[string]interface{}{
		"type":      "status",
		"channel":   "wecom",
		"connected": connected,
	})
	fmt.Println(string(b))
}

func emitError(msg string) {
	b, _ := json.Marshal(map[string]interface{}{
		"type":    "error",
		"channel": "wecom",
		"msg":     msg,
	})
	fmt.Println(string(b))
}
