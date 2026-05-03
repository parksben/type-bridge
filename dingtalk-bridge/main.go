// dingtalk-bridge — Tauri sidecar for DingTalk Stream Mode
//
// 与 feishu-bridge 架构对称：
//   - 环境变量传凭据（DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET）
//   - stdout 输出 JSON Lines 事件（每条自带 channel:"dingtalk"）
//   - stdin 接收 JSON Lines 命令（目前只有 selftest；P2 起加 feedback_*）
//   - 连接成功用 2s 宽限窗口（larkws 风格）兜底 emit status:true

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/open-dingtalk/dingtalk-stream-sdk-go/client"
)

const connectGracePeriod = 2 * time.Second

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

	// 把阻塞的 Start 放到 goroutine，主协程用 select 在宽限期后广播 connected
	errCh := make(chan error, 1)
	go func() {
		errCh <- cli.Start(ctx)
	}()

	select {
	case err := <-errCh:
		// 宽限期内就返回 = 启动失败（凭据错误 / 网络不通）
		emitStatus(false)
		if err != nil {
			emitError(fmt.Sprintf("stream start failed: %v", err))
		} else {
			emitError("stream terminated immediately")
		}
		os.Exit(1)
	case <-time.After(connectGracePeriod):
		emitStatus(true)
	}

	// 继续阻塞等 stream 终止
	err := <-errCh
	emitStatus(false)
	if err != nil {
		emitError(fmt.Sprintf("stream terminated: %v", err))
		os.Exit(1)
	}
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
