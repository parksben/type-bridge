package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	lark "github.com/larksuite/oapi-sdk-go/v3"
	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
)

// Rust → Go 命令协议：JSON Lines 通过 stdin
//
// 命令枚举：
//   {"cmd":"reaction","message_id":"om_xxx","emoji_type":"EYES"}
//   {"cmd":"reply","message_id":"om_xxx","text":"..."}
//   {"cmd":"selftest"}
//
// 错误处理：失败仅打 emitError，不影响主流程。

type Command struct {
	Cmd       string `json:"cmd"`
	MessageID string `json:"message_id,omitempty"`
	EmojiType string `json:"emoji_type,omitempty"`
	Text      string `json:"text,omitempty"`
}

func startCommandLoop(client *lark.Client) {
	decoder := json.NewDecoder(os.Stdin)
	ctx := context.Background()

	for {
		var cmd Command
		if err := decoder.Decode(&cmd); err != nil {
			// stdin 关闭即退出循环
			return
		}

		switch cmd.Cmd {
		case "reaction":
			if err := addReaction(ctx, client, cmd.MessageID, cmd.EmojiType); err != nil {
				emitError(fmt.Sprintf("reaction(%s) on %s failed: %v", cmd.EmojiType, cmd.MessageID, err))
			}

		case "reply":
			if err := replyInThread(ctx, client, cmd.MessageID, cmd.Text); err != nil {
				emitError(fmt.Sprintf("reply on %s failed: %v", cmd.MessageID, err))
			}

		case "selftest":
			// 异步执行，避免阻塞命令循环；结果通过 stdout JSON Lines 回传
			go runSelftest(ctx, client)

		default:
			emitError(fmt.Sprintf("unknown command: %s", cmd.Cmd))
		}
	}
}

// runSelftest 调用 Im.Chat.List 作为"上行能力 ping"——走通意味着：
//  1. app_id / app_secret 能换到 tenant_access_token
//  2. 网络到 open.feishu.cn 可达
//  3. 应用权限包含 im:chat（或兼容的只读范围）
//
// 结果通过 stdout 输出 selftest_result 事件。
func runSelftest(ctx context.Context, client *lark.Client) {
	req := larkim.NewListChatReqBuilder().PageSize(1).Build()
	resp, err := client.Im.Chat.List(ctx, req)

	ok := true
	reason := ""
	if err != nil {
		ok = false
		reason = fmt.Sprintf("网络请求失败: %v", err)
	} else if !resp.Success() {
		ok = false
		reason = fmt.Sprintf("code=%d msg=%s", resp.Code, resp.Msg)
	}

	b, _ := json.Marshal(map[string]interface{}{
		"type":   "selftest_result",
		"ok":     ok,
		"reason": reason,
	})
	fmt.Println(string(b))
}

func addReaction(ctx context.Context, client *lark.Client, msgID, emojiType string) error {
	if msgID == "" || emojiType == "" {
		return fmt.Errorf("missing message_id or emoji_type")
	}

	req := larkim.NewCreateMessageReactionReqBuilder().
		MessageId(msgID).
		Body(larkim.NewCreateMessageReactionReqBodyBuilder().
			ReactionType(larkim.NewEmojiBuilder().
				EmojiType(emojiType).
				Build()).
			Build()).
		Build()

	resp, err := client.Im.MessageReaction.Create(ctx, req)
	if err != nil {
		return err
	}
	if !resp.Success() {
		return fmt.Errorf("api error code=%d msg=%s", resp.Code, resp.Msg)
	}
	return nil
}

func replyInThread(ctx context.Context, client *lark.Client, msgID, text string) error {
	if msgID == "" || text == "" {
		return fmt.Errorf("missing message_id or text")
	}

	contentJSON, _ := json.Marshal(map[string]string{"text": text})
	replyInThreadFlag := true

	req := larkim.NewReplyMessageReqBuilder().
		MessageId(msgID).
		Body(larkim.NewReplyMessageReqBodyBuilder().
			MsgType("text").
			Content(string(contentJSON)).
			ReplyInThread(replyInThreadFlag).
			Build()).
		Build()

	resp, err := client.Im.Message.Reply(ctx, req)
	if err != nil {
		return err
	}
	if !resp.Success() {
		// 某些群/单聊不支持 thread reply，退化为普通 reply
		if strings.Contains(resp.Msg, "thread") || resp.Code == 230020 {
			return replyDirect(ctx, client, msgID, text)
		}
		return fmt.Errorf("api error code=%d msg=%s", resp.Code, resp.Msg)
	}
	return nil
}

// 不带 reply_in_thread 的兜底回复
func replyDirect(ctx context.Context, client *lark.Client, msgID, text string) error {
	contentJSON, _ := json.Marshal(map[string]string{"text": text})

	req := larkim.NewReplyMessageReqBuilder().
		MessageId(msgID).
		Body(larkim.NewReplyMessageReqBodyBuilder().
			MsgType("text").
			Content(string(contentJSON)).
			Build()).
		Build()

	resp, err := client.Im.Message.Reply(ctx, req)
	if err != nil {
		return err
	}
	if !resp.Success() {
		return fmt.Errorf("api error code=%d msg=%s", resp.Code, resp.Msg)
	}
	return nil
}
