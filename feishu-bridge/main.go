package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	lark "github.com/larksuite/oapi-sdk-go/v3"
	larkws "github.com/larksuite/oapi-sdk-go/v3/ws"
)

// 建立连接后 2 秒内没失败即视作"已连接"。larkws.Client 未暴露
// OnConnected 回调，且 Start() 是阻塞调用，故用宽限窗口兜底。
const connectGracePeriod = 2 * time.Second

func main() {
	appID := os.Getenv("FEISHU_APP_ID")
	appSecret := os.Getenv("FEISHU_APP_SECRET")

	if appID == "" || appSecret == "" {
		emitError("FEISHU_APP_ID or FEISHU_APP_SECRET not set")
		os.Exit(1)
	}

	client := lark.NewClient(appID, appSecret)
	eventHandler := newEventDispatcher(client)

	wsClient := larkws.NewClient(appID, appSecret,
		larkws.WithEventHandler(eventHandler),
	)

	emitStatus(false)

	// 启动 stdin 命令读取协程：Rust → Go 单向命令通道（reaction / reply）
	go startCommandLoop(client)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 把阻塞的 Start 放到 goroutine，主协程用 select 在宽限期后广播 connected
	errCh := make(chan error, 1)
	go func() {
		errCh <- wsClient.Start(ctx)
	}()

	select {
	case err := <-errCh:
		// 宽限期内就返回 = 启动失败
		emitStatus(false)
		if err != nil {
			emitError(fmt.Sprintf("ws start failed: %v", err))
		} else {
			emitError("ws terminated immediately")
		}
		os.Exit(1)
	case <-time.After(connectGracePeriod):
		// 宽限期内没失败，视作连接已建立
		emitStatus(true)
	}

	// 继续阻塞等待 ws 终止
	err := <-errCh
	emitStatus(false)
	if err != nil {
		emitError(fmt.Sprintf("ws terminated: %v", err))
		os.Exit(1)
	}
}

func emitStatus(connected bool) {
	b, _ := json.Marshal(map[string]interface{}{"type": "status", "connected": connected})
	fmt.Println(string(b))
}

func emitError(msg string) {
	b, _ := json.Marshal(map[string]interface{}{"type": "error", "msg": msg})
	fmt.Println(string(b))
}

// emitFeedbackError 发送结构化的回调（reaction / reply）失败事件。
// Rust 侧据此更新对应消息的历史条目，而不是把它当成全局连接错误处理。
func emitFeedbackError(msgID, kind string, code int, msg string) {
	b, _ := json.Marshal(map[string]interface{}{
		"type":       "feedback_error",
		"message_id": msgID,
		"kind":       kind,
		"code":       code,
		"msg":        msg,
	})
	fmt.Println(string(b))
}
