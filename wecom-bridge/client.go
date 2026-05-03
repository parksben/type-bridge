// client.go — WSS 主客户端：鉴权订阅 / 心跳 / 读帧循环 / reqID+streamID 内部 map。

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	wsEndpoint     = "wss://openws.work.weixin.qq.com"
	subscribeCmd   = "aibot_subscribe"
	pingCmd        = "ping"
	msgCallbackCmd = "aibot_msg_callback"
	evtCallbackCmd = "aibot_event_callback"
	respondMsgCmd  = "aibot_respond_msg"

	pingInterval = 27 * time.Second
	pongTimeout  = 60 * time.Second

	// 订阅 ack 最多等 10s
	subscribeAckTimeout = 10 * time.Second
)

// Frame 是 WeCom 长连接的通用 JSON 帧格式
type Frame struct {
	Cmd     string          `json:"cmd,omitempty"`
	Headers FrameHeaders    `json:"headers"`
	Body    json.RawMessage `json:"body,omitempty"`
	ErrCode int             `json:"errcode,omitempty"`
	ErrMsg  string          `json:"errmsg,omitempty"`
}

type FrameHeaders struct {
	ReqID string `json:"req_id"`
}

type Client struct {
	botID, secret string
	conn          *websocket.Conn
	writeMu       sync.Mutex
	reqIDs        sync.Map // msgID → reqID（reply 时透传）
	streams       sync.Map // msgID → streamID（同一条消息复用）
	lastPong      atomic.Value // time.Time
	subscribed    atomic.Bool
}

func NewClient(botID, secret string) *Client {
	c := &Client{botID: botID, secret: secret}
	c.lastPong.Store(time.Now())
	return c
}

func (c *Client) Run(ctx context.Context) error {
	// 1. 拨号
	dialer := websocket.DefaultDialer
	conn, _, err := dialer.DialContext(ctx, wsEndpoint, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	c.conn = conn
	defer conn.Close()

	// 2. 订阅鉴权（阻塞等 ack）
	if err := c.subscribe(ctx); err != nil {
		return fmt.Errorf("subscribe: %w", err)
	}
	c.subscribed.Store(true)
	emitStatus(true)

	// 3. 心跳 + 读循环并行；ctx 取消或任一 goroutine 出错则整体退出
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	errCh := make(chan error, 2)
	go func() { errCh <- c.pingLoop(ctx) }()
	go func() { errCh <- c.readLoop(ctx) }()

	err = <-errCh
	cancel()
	// 尝试优雅关闭；忽略错误
	_ = conn.WriteControl(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
	return err
}

// subscribe 发 aibot_subscribe 帧并阻塞等 ack（errcode==0）。
func (c *Client) subscribe(ctx context.Context) error {
	reqID := uuid.NewString()
	subFrame := map[string]any{
		"cmd":     subscribeCmd,
		"headers": map[string]string{"req_id": reqID},
		"body":    map[string]string{"bot_id": c.botID, "secret": c.secret},
	}
	if err := c.writeFrame(subFrame); err != nil {
		return err
	}

	// 同步等 ack：最多 subscribeAckTimeout；期间收到的非 ack 帧暂存后转交
	deadline := time.Now().Add(subscribeAckTimeout)
	_ = c.conn.SetReadDeadline(deadline)
	defer c.conn.SetReadDeadline(time.Time{}) // 清 deadline 供 readLoop 用

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read subscribe ack: %w", err)
		}
		var f Frame
		if err := json.Unmarshal(raw, &f); err != nil {
			continue // 非法帧忽略
		}
		// ack 特征：headers.req_id 与请求一致（cmd 可能为空）
		if f.Headers.ReqID == reqID {
			if f.ErrCode != 0 {
				return fmt.Errorf("subscribe rejected: errcode=%d errmsg=%s", f.ErrCode, f.ErrMsg)
			}
			return nil
		}
		// 非 ack 的帧（极少数情况）暂时忽略；真实用户消息会在 readLoop 接管后重发
	}
}

// writeFrame 线程安全地写 JSON 文本帧
func (c *Client) writeFrame(v any) error {
	buf, err := json.Marshal(v)
	if err != nil {
		return err
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return c.conn.WriteMessage(websocket.TextMessage, buf)
}

// pingLoop 定期发 ping；若 lastPong 太旧则 cancel 触发整体退出
func (c *Client) pingLoop(ctx context.Context) error {
	t := time.NewTicker(pingInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
			if last, ok := c.lastPong.Load().(time.Time); ok {
				if time.Since(last) > pongTimeout {
					return fmt.Errorf("pong timeout: last pong %s ago", time.Since(last).Truncate(time.Second))
				}
			}
			frame := map[string]any{
				"cmd":     pingCmd,
				"headers": map[string]string{"req_id": uuid.NewString()},
			}
			if err := c.writeFrame(frame); err != nil {
				return fmt.Errorf("ping write: %w", err)
			}
		}
	}
}

// readLoop 阻塞读 WSS 帧，按 cmd 分发
func (c *Client) readLoop(ctx context.Context) error {
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}
		var f Frame
		if err := json.Unmarshal(raw, &f); err != nil {
			// 协议 violator 忽略，不中断
			emitError(fmt.Sprintf("invalid frame: %v", err))
			continue
		}

		// 任意帧都视为连接活跃 —— ping 的 pong 可能没有 cmd
		c.lastPong.Store(time.Now())

		switch f.Cmd {
		case msgCallbackCmd:
			c.handleMsgCallback(&f)
		case evtCallbackCmd:
			if shouldExit := c.handleEventCallback(&f); shouldExit {
				return fmt.Errorf("kicked by new connection")
			}
		case "", pingCmd:
			// pong / subscribe ack 之类，前面已更新 lastPong
		default:
			// 未知 cmd 暂不处理，日志一下便于调试
			emitError(fmt.Sprintf("unknown cmd: %s", f.Cmd))
		}

		select {
		case <-ctx.Done():
			return nil
		default:
		}
	}
}

// isSubscribed 给 commands.go 查询
func (c *Client) isSubscribed() bool {
	return c.subscribed.Load()
}

// sendStreamingReply 被 commands.go 调用，组装 aibot_respond_msg 帧
func (c *Client) sendStreamingReply(msgID, content string, finish bool) error {
	reqIDVal, ok := c.reqIDs.Load(msgID)
	if !ok {
		return fmt.Errorf("no reqID for msgID=%s (expired or never received)", msgID)
	}
	reqID := reqIDVal.(string)

	streamIDVal, _ := c.streams.LoadOrStore(msgID, uuid.NewString())
	streamID := streamIDVal.(string)

	frame := map[string]any{
		"cmd":     respondMsgCmd,
		"headers": map[string]string{"req_id": reqID},
		"body": map[string]any{
			"msgtype": "stream",
			"stream": map[string]any{
				"id":      streamID,
				"finish":  finish,
				"content": content,
			},
		},
	}
	if err := c.writeFrame(frame); err != nil {
		return err
	}

	if finish {
		// 1s 宽限期后清 map；防止有残余帧命中旧 streamID
		go func(id string) {
			time.Sleep(time.Second)
			c.reqIDs.Delete(id)
			c.streams.Delete(id)
		}(msgID)
	}
	return nil
}
