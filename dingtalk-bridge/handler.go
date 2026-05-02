package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/open-dingtalk/dingtalk-stream-sdk-go/chatbot"
)

// handleMessage 解析 BotCallbackDataModel，按消息类型 emit JSON Lines。
// P1：仅支持 text。图片 / richText / audio / file 留 P2。
func handleMessage(ctx context.Context, data *chatbot.BotCallbackDataModel) ([]byte, error) {
	if data == nil {
		return []byte(""), nil
	}

	ts := fmt.Sprintf("%d", data.CreateAt)
	sender := data.SenderStaffId
	if sender == "" {
		sender = data.SenderNick
	}

	switch data.Msgtype {
	case "text":
		text := strings.TrimSpace(data.Text.Content)
		out, _ := json.Marshal(map[string]interface{}{
			"type":       "message",
			"channel":    "dingtalk",
			"message_id": data.MsgId,
			"sender":     sender,
			"text":       text,
			"ts":         ts,
		})
		fmt.Println(string(out))

	default:
		// P1 不处理的消息类型先静默跳过，emit 一条 error 便于调试
		emitError(fmt.Sprintf("unsupported msgtype: %s (msgId=%s)", data.Msgtype, data.MsgId))
	}

	return []byte(""), nil
}
