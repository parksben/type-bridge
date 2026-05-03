// handler.go — aibot_msg_callback / aibot_event_callback 帧处理
//
// 协议字段参考（官方 2026/04/15）：
//   msg_callback: body.{msgid, chatid?, chattype, from.userid, msgtype, text.content | image.{url,aeskey} | mixed...}
//   event_callback: body.{msgid, create_time, from.userid, msgtype:"event", event.eventtype}
//     eventtype: enter_chat | template_card_event | feedback_event | disconnected_event

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

type msgBody struct {
	MsgID    string `json:"msgid"`
	AibotID  string `json:"aibotid"`
	ChatID   string `json:"chatid"`
	ChatType string `json:"chattype"`
	From     struct {
		UserID string `json:"userid"`
	} `json:"from"`
	MsgType    string `json:"msgtype"`
	CreateTime int64  `json:"create_time"`
	Text       *struct {
		Content string `json:"content"`
	} `json:"text,omitempty"`
	Image *struct {
		URL    string `json:"url"`
		AESKey string `json:"aeskey"`
	} `json:"image,omitempty"`
	Mixed *struct {
		MsgItem []json.RawMessage `json:"msg_item"`
	} `json:"mixed,omitempty"`
	Event *struct {
		EventType string `json:"eventtype"`
	} `json:"event,omitempty"`
}

// handleMsgCallback: aibot_msg_callback 收用户消息
func (c *Client) handleMsgCallback(f *Frame) {
	var body msgBody
	if err := json.Unmarshal(f.Body, &body); err != nil {
		emitError(fmt.Sprintf("msg_callback unmarshal: %v", err))
		return
	}

	// 记住 reqID，供后续 streaming_reply 透传
	c.reqIDs.Store(body.MsgID, f.Headers.ReqID)

	ts := fmt.Sprintf("%d", body.CreateTime)
	if body.CreateTime == 0 {
		ts = fmt.Sprintf("%d", time.Now().Unix())
	}
	sender := body.From.UserID

	switch body.MsgType {
	case "text":
		content := ""
		if body.Text != nil {
			content = body.Text.Content
		}
		emitMessage(body.MsgID, sender, content, ts)

	case "image":
		if body.Image == nil || body.Image.URL == "" || body.Image.AESKey == "" {
			emitError(fmt.Sprintf("image msg missing url/aeskey (msgID=%s)", body.MsgID))
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		plain, mime, err := downloadAndDecrypt(ctx, body.Image.URL, body.Image.AESKey)
		if err != nil {
			emitError(fmt.Sprintf("image download/decrypt failed: %v", err))
			return
		}
		emitImage(body.MsgID, sender, "", plain, mime, ts)

	case "mixed":
		// 图文混排：按段遍历，text 段拼接成一条 message，image 段分别 emit
		if body.Mixed == nil {
			return
		}
		var textParts []string
		var imageCodes []struct{ URL, AESKey string }
		for _, raw := range body.Mixed.MsgItem {
			var seg struct {
				MsgType string `json:"msgtype"`
				Text    *struct {
					Content string `json:"content"`
				} `json:"text,omitempty"`
				Image *struct {
					URL    string `json:"url"`
					AESKey string `json:"aeskey"`
				} `json:"image,omitempty"`
			}
			if err := json.Unmarshal(raw, &seg); err != nil {
				continue
			}
			switch seg.MsgType {
			case "text":
				if seg.Text != nil {
					textParts = append(textParts, seg.Text.Content)
				}
			case "image":
				if seg.Image != nil && seg.Image.URL != "" && seg.Image.AESKey != "" {
					imageCodes = append(imageCodes, struct{ URL, AESKey string }{seg.Image.URL, seg.Image.AESKey})
				}
			}
		}
		if len(textParts) > 0 {
			joined := ""
			for i, p := range textParts {
				if i > 0 {
					joined += ""
				}
				joined += p
			}
			emitMessage(body.MsgID, sender, joined, ts)
		}
		for _, im := range imageCodes {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			plain, mime, err := downloadAndDecrypt(ctx, im.URL, im.AESKey)
			cancel()
			if err != nil {
				emitError(fmt.Sprintf("mixed image download/decrypt failed: %v", err))
				continue
			}
			emitImage(body.MsgID, sender, "", plain, mime, ts)
		}

	default:
		// voice / file / video 暂不支持（和飞书 / 钉钉对齐）
		emitError(fmt.Sprintf("unsupported msgtype: %s (msgID=%s)", body.MsgType, body.MsgID))
	}
}

// handleEventCallback 返回 true 表示连接被踢需退出
func (c *Client) handleEventCallback(f *Frame) (shouldExit bool) {
	var body msgBody
	if err := json.Unmarshal(f.Body, &body); err != nil {
		emitError(fmt.Sprintf("event_callback unmarshal: %v", err))
		return false
	}
	if body.Event == nil {
		return false
	}
	switch body.Event.EventType {
	case "enter_chat":
		// 用户首次进入与机器人的会话，可选回欢迎语；暂不处理
	case "disconnected_event":
		// 被新连接踢掉
		emitError("kicked by new connection (另一台设备可能用同一 bot 登录了)")
		return true
	case "template_card_event", "feedback_event":
		// 目前不涉及交互卡片 / 反馈，忽略
	}
	return false
}

func emitMessage(msgID, sender, text, ts string) {
	b, _ := json.Marshal(map[string]interface{}{
		"type":       "message",
		"channel":    "wecom",
		"message_id": msgID,
		"sender":     sender,
		"text":       text,
		"ts":         ts,
	})
	fmt.Println(string(b))
}

func emitImage(msgID, sender, text string, data []byte, mime, ts string) {
	b, _ := json.Marshal(map[string]interface{}{
		"type":       "image",
		"channel":    "wecom",
		"message_id": msgID,
		"sender":     sender,
		"text":       text,
		"data":       stdBase64(data),
		"mime":       mime,
		"ts":         ts,
	})
	fmt.Println(string(b))
}
