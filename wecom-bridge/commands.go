// commands.go — stdin JSON Lines 命令循环
//
// Rust → Go 命令：
//   {"cmd":"selftest"}
//   {"cmd":"streaming_reply","message_id":"...","content":"...","finish":true|false}
//   {"cmd":"reply","message_id":"...","text":"..."}   // legacy 兼容 → 转 streaming_reply finish:true

package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type command struct {
	Cmd       string `json:"cmd"`
	MessageID string `json:"message_id,omitempty"`
	Content   string `json:"content,omitempty"`
	Text      string `json:"text,omitempty"`
	Finish    bool   `json:"finish,omitempty"`
}

func startCommandLoop(cli *Client) {
	decoder := json.NewDecoder(os.Stdin)
	for {
		var cmd command
		if err := decoder.Decode(&cmd); err != nil {
			// stdin 关闭即退出循环（父进程终止会触发）
			return
		}
		switch cmd.Cmd {
		case "selftest":
			runSelftest(cli)

		case "streaming_reply":
			if err := cli.sendStreamingReply(cmd.MessageID, cmd.Content, cmd.Finish); err != nil {
				emitError(fmt.Sprintf("streaming_reply on %s failed: %v", cmd.MessageID, err))
			}

		case "reply":
			// legacy：Rust 侧失败路径兜底，转成一次性关闭流式的 respond_msg
			if err := cli.sendStreamingReply(cmd.MessageID, cmd.Text, true); err != nil {
				emitError(fmt.Sprintf("reply(legacy) on %s failed: %v", cmd.MessageID, err))
			}

		default:
			emitError(fmt.Sprintf("unknown command: %s", cmd.Cmd))
		}
	}
}

// runSelftest: 只要订阅成功就视为 OK。企微没有 scope 概念，probes 留空。
func runSelftest(cli *Client) {
	ok := cli.isSubscribed()
	reason := ""
	if !ok {
		reason = "长连接尚未完成订阅（aibot_subscribe 鉴权未通过或连接已断）"
	}
	b, _ := json.Marshal(map[string]interface{}{
		"type":               "selftest_result",
		"channel":            "wecom",
		"credentials_ok":     ok,
		"credentials_reason": reason,
		"probes":             []any{},
	})
	fmt.Println(string(b))
}
