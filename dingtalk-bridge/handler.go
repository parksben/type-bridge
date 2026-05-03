package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/open-dingtalk/dingtalk-stream-sdk-go/chatbot"
)

// handleMessage 解析 BotCallbackDataModel，按消息类型 emit JSON Lines。
// 支持 text / picture / richText（图文混合）；audio / file / video 暂不处理。
func handleMessage(ctx context.Context, data *chatbot.BotCallbackDataModel) ([]byte, error) {
	if data == nil {
		return []byte(""), nil
	}

	// 记录 sessionWebhook 供后续 reply 命令使用（有效期 ~1h，过期自动淘汰）
	rememberSession(data)

	ts := fmt.Sprintf("%d", data.CreateAt)
	sender := data.SenderStaffId
	if sender == "" {
		sender = data.SenderNick
	}

	switch data.Msgtype {
	case "text":
		text := strings.TrimSpace(data.Text.Content)
		emitMessage(data.MsgId, sender, text, ts)

	case "picture":
		downloadCode := extractPictureDownloadCode(data.Content)
		if downloadCode == "" {
			emitError(fmt.Sprintf("picture msg has no downloadCode (msgId=%s)", data.MsgId))
			return []byte(""), nil
		}
		b64, mime, err := downloadMessageFile(ctx, downloadCode)
		if err != nil {
			emitError(fmt.Sprintf("picture download failed: %v", err))
			return []byte(""), nil
		}
		emitImage(data.MsgId, sender, "", b64, mime, ts)

	case "richText":
		text, imageCodes := extractRichText(data.Content)
		if text != "" {
			emitMessage(data.MsgId, sender, text, ts)
		}
		for _, code := range imageCodes {
			b64, mime, err := downloadMessageFile(ctx, code)
			if err != nil {
				emitError(fmt.Sprintf("richText image download failed: %v", err))
				continue
			}
			// 同一 msgId 下多张图片用同一个 message_id——与飞书行为一致
			emitImage(data.MsgId, sender, "", b64, mime, ts)
		}

	default:
		// audio / file / video 等暂不支持，emit error 便于调试
		emitError(fmt.Sprintf("unsupported msgtype: %s (msgId=%s)", data.Msgtype, data.MsgId))
	}

	return []byte(""), nil
}

func emitMessage(msgID, sender, text, ts string) {
	out, _ := json.Marshal(map[string]interface{}{
		"type":       "message",
		"channel":    "dingtalk",
		"message_id": msgID,
		"sender":     sender,
		"text":       text,
		"ts":         ts,
	})
	fmt.Println(string(out))
}

func emitImage(msgID, sender, text, dataB64, mime, ts string) {
	out, _ := json.Marshal(map[string]interface{}{
		"type":       "image",
		"channel":    "dingtalk",
		"message_id": msgID,
		"sender":     sender,
		"text":       text,
		"data":       dataB64,
		"mime":       mime,
		"ts":         ts,
	})
	fmt.Println(string(out))
}

// extractPictureDownloadCode 从 picture 类型的 Content 字段里抠 downloadCode。
// Content 是 interface{}，实际结构 {"downloadCode": "xxx", "downloadUrl": "..."}
// （钉钉文档 2024 起 downloadUrl 已弃用，下载必须通过 downloadCode + OpenAPI）
func extractPictureDownloadCode(content interface{}) string {
	m, ok := content.(map[string]interface{})
	if !ok {
		return ""
	}
	if code, ok := m["downloadCode"].(string); ok {
		return code
	}
	return ""
}

// extractRichText 从 richText 类型的 Content 字段里拼文本 + 收集所有图片的 downloadCode。
// Content 结构大致是 {"richText": [{"type":"text","text":"..."},{"type":"image","downloadCode":"..."}]}
// 或直接 {"richText": [...]} （文档没完全统一，按 best-effort 解析）。
func extractRichText(content interface{}) (text string, imageCodes []string) {
	m, ok := content.(map[string]interface{})
	if !ok {
		return "", nil
	}

	// 尝试两种路径：m["richText"] 和直接 m 本身
	var segments []interface{}
	if rt, ok := m["richText"].([]interface{}); ok {
		segments = rt
	} else if s, ok := content.([]interface{}); ok {
		segments = s
	} else {
		return "", nil
	}

	var textParts []string
	for _, seg := range segments {
		segMap, ok := seg.(map[string]interface{})
		if !ok {
			continue
		}
		switch segMap["type"] {
		case "text":
			if t, ok := segMap["text"].(string); ok {
				textParts = append(textParts, t)
			}
		case "image", "picture":
			if code, ok := segMap["downloadCode"].(string); ok {
				imageCodes = append(imageCodes, code)
			}
		}
	}
	return strings.TrimSpace(strings.Join(textParts, "")), imageCodes
}
