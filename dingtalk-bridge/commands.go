package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/open-dingtalk/dingtalk-stream-sdk-go/chatbot"
	"github.com/open-dingtalk/dingtalk-stream-sdk-go/client"
)

// Rust → Go 命令协议：JSON Lines 通过 stdin。
//
// P2：selftest + reply（失败反馈文字）。
// feedback_received / feedback_sent 在钉钉上暂不实现（协议无 reaction，
// 卡片流式更新需要用户在后台注册模板，MVP 略过；失败时发一条 text reply
// 足以给用户可见的反馈）。

type command struct {
	Cmd       string `json:"cmd"`
	MessageID string `json:"message_id,omitempty"`
	Text      string `json:"text,omitempty"`
}

// sessionWebhook 有效期短（由 SessionWebhookExpiredTime 指定），过期后
// 就无法用 SimpleReplyText 回复。本地用 msgID→(webhook, expireAt) 映射
// 记住，失败反馈时查出来用。没命中就吞掉，不阻塞主流程。
type sessionEntry struct {
	webhook  string
	expireAt time.Time
}

var (
	sessionsMu sync.Mutex
	sessions   = map[string]sessionEntry{}
)

// rememberSession 被 handleMessage 调用，记下每条消息的 sessionWebhook。
func rememberSession(data *chatbot.BotCallbackDataModel) {
	if data == nil || data.MsgId == "" || data.SessionWebhook == "" {
		return
	}
	sessionsMu.Lock()
	defer sessionsMu.Unlock()
	// SessionWebhookExpiredTime 是 Unix ms；做下 sanity check
	var expireAt time.Time
	if data.SessionWebhookExpiredTime > 0 {
		expireAt = time.Unix(0, data.SessionWebhookExpiredTime*int64(time.Millisecond))
	} else {
		expireAt = time.Now().Add(1 * time.Hour)
	}
	sessions[data.MsgId] = sessionEntry{
		webhook:  data.SessionWebhook,
		expireAt: expireAt,
	}
	// 随手 GC 一下过期的 entry
	now := time.Now()
	for k, v := range sessions {
		if now.After(v.expireAt) {
			delete(sessions, k)
		}
	}
}

func lookupSession(msgID string) (string, bool) {
	sessionsMu.Lock()
	defer sessionsMu.Unlock()
	entry, ok := sessions[msgID]
	if !ok {
		return "", false
	}
	if time.Now().After(entry.expireAt) {
		delete(sessions, msgID)
		return "", false
	}
	return entry.webhook, true
}

func startCommandLoop(_ *client.StreamClient) {
	decoder := json.NewDecoder(os.Stdin)
	ctx := context.Background()

	for {
		var cmd command
		if err := decoder.Decode(&cmd); err != nil {
			// stdin 关闭即退出循环
			return
		}

		switch cmd.Cmd {
		case "selftest":
			runSelftest()

		case "reply":
			if err := handleReply(ctx, cmd.MessageID, cmd.Text); err != nil {
				// Reply 失败常见原因：sessionWebhook 过期、网络抖。不抛 fatal，
				// 只 emit error 便于日志定位
				emitError(fmt.Sprintf("reply on %s failed: %v", cmd.MessageID, err))
			}

		default:
			emitError(fmt.Sprintf("unknown command: %s", cmd.Cmd))
		}
	}
}

// runSelftest: 钉钉没有 scope 概念，只要 sidecar 已经启动并在跑
// stream loop，就说明凭据能换到 access_token 且 WSS 握手通过。
// 直接返回 ok + 空 probes 数组。UI 端会在清单上展示"凭据可用 ✓"+
// Stream Mode 静态引导。
func runSelftest() {
	b, _ := json.Marshal(map[string]interface{}{
		"type":               "selftest_result",
		"channel":            "dingtalk",
		"credentials_ok":     true,
		"credentials_reason": "",
		"probes":             []any{},
	})
	fmt.Println(string(b))
}

func handleReply(ctx context.Context, msgID, text string) error {
	if msgID == "" || text == "" {
		return fmt.Errorf("missing message_id or text")
	}
	webhook, ok := lookupSession(msgID)
	if !ok {
		return fmt.Errorf("sessionWebhook expired or not found (msgId=%s)", msgID)
	}
	replier := chatbot.NewChatbotReplier()
	return replier.SimpleReplyText(ctx, webhook, []byte(text))
}
