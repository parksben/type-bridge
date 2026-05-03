// dingtalk-bridge — Tauri sidecar for DingTalk Stream Mode
//
// 与 feishu-bridge 架构对称：
//   - 环境变量传凭据（DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET）
//   - stdout 输出 JSON Lines 事件（每条自带 channel:"dingtalk"）
//   - stdin 接收 JSON Lines 命令（P2：selftest + reply）
//
// !!! 注意：和 larkws 不同，dingtalk-stream-sdk-go 的 StreamClient.Start() 是
// 非阻塞的——同步完成 HTTP gettoken + WSS 握手后立即 return nil，真正的读循环
// 跑在 SDK 内部 goroutine（processLoop）。SDK 官方 example 就是 Start + select{}。
// 所以这里不能照抄 feishu 的"宽限期 errCh select"模式，否则 nil 会在宽限期内
// 就被当成"stream terminated immediately"误伤退出（详见 TECH_DESIGN §30.2）。

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/open-dingtalk/dingtalk-stream-sdk-go/client"
)

func main() {
	clientID := os.Getenv("DINGTALK_CLIENT_ID")
	clientSecret := os.Getenv("DINGTALK_CLIENT_SECRET")

	if clientID == "" || clientSecret == "" {
		emitError("DINGTALK_CLIENT_ID or DINGTALK_CLIENT_SECRET not set")
		os.Exit(1)
	}

	cli := client.NewStreamClient(
		client.WithAppCredential(client.NewAppCredentialConfig(clientID, clientSecret)),
	)
	cli.RegisterChatBotCallbackRouter(handleMessage)

	// 记住凭据供后续图片下载（需要换 access token）
	initTokenCache(clientID, clientSecret)

	emitStatus(false)

	// 启动 stdin 命令读取协程
	go startCommandLoop(cli)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start 同步返回：
	//   err != nil → 启动失败（凭据错 / 网络不通 / WSS 握手失败）
	//   err == nil → 建连成功，内部 processLoop 已起，SDK AutoReconnect=true
	if err := cli.Start(ctx); err != nil {
		emitError(fmt.Sprintf("stream start failed: %v", err))
		os.Exit(1)
	}
	defer cli.Close()

	emitStatus(true)

	// 阻塞等信号或 stdin EOF。内部 processLoop 跑在 SDK 自己的 goroutine，
	// WSS 中断由 SDK 自动重连；只有父进程下发 SIGTERM / SIGINT 时才退出。
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	emitStatus(false)
}

func emitStatus(connected bool) {
	b, _ := json.Marshal(map[string]interface{}{
		"type":      "status",
		"channel":   "dingtalk",
		"connected": connected,
	})
	fmt.Println(string(b))
}

func emitError(msg string) {
	b, _ := json.Marshal(map[string]interface{}{
		"type":    "error",
		"channel": "dingtalk",
		"msg":     msg,
	})
	fmt.Println(string(b))
}
