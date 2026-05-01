package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	lark "github.com/larksuite/oapi-sdk-go/v3"
	"github.com/larksuite/oapi-sdk-go/v3/event/dispatcher"
	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
)

type MessageOut struct {
	Type      string `json:"type"`
	Sender    string `json:"sender,omitempty"`
	Text      string `json:"text,omitempty"`
	Ts        string `json:"ts,omitempty"`
	MessageID string `json:"message_id,omitempty"`
	Data      string `json:"data,omitempty"`
	Mime      string `json:"mime,omitempty"`
}

func newEventDispatcher(client *lark.Client) *dispatcher.EventDispatcher {
	return dispatcher.NewEventDispatcher("", "").
		OnP2MessageReceiveV1(func(ctx context.Context, event *larkim.P2MessageReceiveV1) error {
			return handleMessage(ctx, client, event)
		})
}

func handleMessage(ctx context.Context, client *lark.Client, event *larkim.P2MessageReceiveV1) error {
	if event.Event == nil || event.Event.Message == nil {
		return nil
	}

	msg := event.Event.Message
	sender := ""
	if event.Event.Sender != nil && event.Event.Sender.SenderId != nil {
		if event.Event.Sender.SenderId.UserId != nil {
			sender = *event.Event.Sender.SenderId.UserId
		}
	}

	msgType := ""
	if msg.MessageType != nil {
		msgType = *msg.MessageType
	}

	ts := fmt.Sprintf("%d", time.Now().UnixMilli())
	if msg.CreateTime != nil {
		ts = *msg.CreateTime
	}

	msgID := ""
	if msg.MessageId != nil {
		msgID = *msg.MessageId
	}

	content := ""
	if msg.Content != nil {
		content = *msg.Content
	}

	switch msgType {
	case "text":
		text := extractText(content)
		out, _ := json.Marshal(MessageOut{
			Type:      "message",
			MessageID: msgID,
			Sender:    sender,
			Text:      text,
			Ts:        ts,
		})
		fmt.Println(string(out))

	case "image":
		imageKey := extractImageKey(content)
		if imageKey == "" {
			return nil
		}
		data, mime, err := downloadImage(ctx, client, msgID, imageKey)
		if err != nil {
			emitError(fmt.Sprintf("image download failed: %v", err))
			return nil
		}
		out, _ := json.Marshal(MessageOut{
			Type:      "image",
			MessageID: msgID,
			Sender:    sender,
			Data:      data,
			Mime:      mime,
			Text:      "",
		})
		fmt.Println(string(out))

	case "post":
		text, imageKeys := extractPost(content)
		if text != "" {
			out, _ := json.Marshal(MessageOut{
				Type:      "message",
				MessageID: msgID,
				Sender:    sender,
				Text:      text,
				Ts:        ts,
			})
			fmt.Println(string(out))
		}
		for _, key := range imageKeys {
			data, mime, err := downloadImage(ctx, client, msgID, key)
			if err != nil {
				emitError(fmt.Sprintf("image download failed: %v", err))
				continue
			}
			out, _ := json.Marshal(MessageOut{
				Type:      "image",
				MessageID: msgID,
				Sender:    sender,
				Data:      data,
				Mime:      mime,
				Text:      "",
			})
			fmt.Println(string(out))
		}
	}

	emitStatus(true)
	return nil
}

func extractText(content string) string {
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(content), &m); err != nil {
		return content
	}
	if text, ok := m["text"].(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
}

func extractImageKey(content string) string {
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(content), &m); err != nil {
		return ""
	}
	if key, ok := m["image_key"].(string); ok {
		return key
	}
	return ""
}

func extractPost(content string) (string, []string) {
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(content), &m); err != nil {
		return "", nil
	}

	var texts []string
	var imageKeys []string

	// post format: {"zh_cn": {"content": [[...]]}}
	for _, lang := range m {
		langMap, ok := lang.(map[string]interface{})
		if !ok {
			continue
		}
		rows, _ := langMap["content"].([]interface{})
		for _, row := range rows {
			elements, _ := row.([]interface{})
			for _, elem := range elements {
				e, _ := elem.(map[string]interface{})
				tag, _ := e["tag"].(string)
				switch tag {
				case "text":
					if t, ok := e["text"].(string); ok {
						texts = append(texts, t)
					}
				case "img":
					if k, ok := e["image_key"].(string); ok {
						imageKeys = append(imageKeys, k)
					}
				}
			}
		}
		break
	}
	return strings.TrimSpace(strings.Join(texts, "")), imageKeys
}

func downloadImage(ctx context.Context, client *lark.Client, msgID, imageKey string) (string, string, error) {
	req := larkim.NewGetMessageResourceReqBuilder().
		MessageId(msgID).
		FileKey(imageKey).
		Type("image").
		Build()

	resp, err := client.Im.MessageResource.Get(ctx, req)
	if err != nil {
		return "", "", err
	}
	if !resp.Success() {
		return "", "", fmt.Errorf("api error: %s", resp.Msg)
	}

	// resp.RawBody is []byte in oapi-sdk-go v3
	mime := "image/png"
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		mime = strings.Split(ct, ";")[0]
	}

	return base64.StdEncoding.EncodeToString(resp.RawBody), mime, nil
}
