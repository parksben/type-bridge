package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	lark "github.com/larksuite/oapi-sdk-go/v3"
	larkws "github.com/larksuite/oapi-sdk-go/v3/ws"
)

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

	ctx := context.Background()
	if err := wsClient.Start(ctx); err != nil {
		emitError(fmt.Sprintf("ws start failed: %v", err))
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
