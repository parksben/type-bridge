package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/open-dingtalk/dingtalk-stream-sdk-go/client"
)

// Rust → Go 命令协议：JSON Lines 通过 stdin。
//
// P1 MVP：仅 selftest。P2 起加 feedback_received / feedback_sent /
// feedback_failed（互动卡片 + StreamingUpdate 实现状态反馈）。

type command struct {
	Cmd string `json:"cmd"`
}

func startCommandLoop(_ *client.StreamClient) {
	decoder := json.NewDecoder(os.Stdin)

	for {
		var cmd command
		if err := decoder.Decode(&cmd); err != nil {
			// stdin 关闭即退出循环
			return
		}

		switch cmd.Cmd {
		case "selftest":
			runSelftest()
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
