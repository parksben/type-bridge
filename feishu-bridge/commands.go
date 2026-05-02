package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

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
				if fe, ok := err.(*apiFailure); ok {
					emitFeedbackError(cmd.MessageID, "reaction", fe.code, fe.msg)
				} else {
					emitError(fmt.Sprintf("reaction(%s) on %s failed: %v", cmd.EmojiType, cmd.MessageID, err))
				}
			}

		case "reply":
			if err := replyInThread(ctx, client, cmd.MessageID, cmd.Text); err != nil {
				if fe, ok := err.(*apiFailure); ok {
					emitFeedbackError(cmd.MessageID, "reply", fe.code, fe.msg)
				} else {
					emitError(fmt.Sprintf("reply on %s failed: %v", cmd.MessageID, err))
				}
			}

		case "selftest":
			// 异步执行，避免阻塞命令循环；结果通过 stdout JSON Lines 回传
			go runSelftest(ctx, client)

		default:
			emitError(fmt.Sprintf("unknown command: %s", cmd.Cmd))
		}
	}
}

// apiFailure 代表飞书 API 返回的业务错误（resp.Success() == false），
// 区别于网络错误等。用类型断言让上层把它映射成 feedback_error 事件。
type apiFailure struct {
	code int
	msg  string
}

func (e *apiFailure) Error() string {
	return fmt.Sprintf("api error code=%d msg=%s", e.code, e.msg)
}

// ──────────────────────────────────────────────────────────────
// selftest / scope probe
// ──────────────────────────────────────────────────────────────

// 飞书错误码常量
const (
	errCodeScopeMissing     = 99991672 // Access denied, scope missing
	errCodeInvalidAppID     = 99991663
	errCodeInvalidAppSecret = 99991664
)

// ProbeResult 对应一次 API probe 的结构化结论。
// `ok=true` 表示 scope 通过（成功或业务错误但非 scope 类）；
// `ok=false` 仅在 code=99991672 时为 true——白名单式判定避免误报。
type ProbeResult struct {
	ID        string   `json:"id"`
	Label     string   `json:"label"`
	ScopeHint string   `json:"scope_hint"`
	Ok        bool     `json:"ok"`
	Code      int      `json:"code"`
	Msg       string   `json:"msg"`
	Scopes    []string `json:"scopes,omitempty"`
	HelpURL   string   `json:"help_url,omitempty"`
}

// SelftestResult 聚合三个 probe 的结论 + 凭据/网络级短路结果。
type SelftestResult struct {
	Type              string        `json:"type"`
	CredentialsOk     bool          `json:"credentials_ok"`
	CredentialsReason string        `json:"credentials_reason,omitempty"`
	Probes            []ProbeResult `json:"probes"`
}

// runSelftest 并行跑 3 个消息链路 probe，所有 probe fan-in 后
// 判定全局凭据/网络错误，再通过 stdout 发一个聚合 selftest_result。
func runSelftest(ctx context.Context, client *lark.Client) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	results := make([]ProbeResult, 3)
	netErrs := make([]error, 3)

	wg.Add(3)
	go func() {
		defer wg.Done()
		results[0], netErrs[0] = probeDownloadImage(ctx, client)
	}()
	go func() {
		defer wg.Done()
		results[1], netErrs[1] = probeReaction(ctx, client)
	}()
	go func() {
		defer wg.Done()
		results[2], netErrs[2] = probeReply(ctx, client)
	}()
	wg.Wait()

	// 凭据级 short-circuit：任一 probe 返回 app_id/secret 错，整个 selftest 判失败
	for _, r := range results {
		if r.Code == errCodeInvalidAppID {
			emitSelftestResult(SelftestResult{
				Type:              "selftest_result",
				CredentialsOk:     false,
				CredentialsReason: fmt.Sprintf("App ID 无效（code=%d）：%s", r.Code, r.Msg),
			})
			return
		}
		if r.Code == errCodeInvalidAppSecret {
			emitSelftestResult(SelftestResult{
				Type:              "selftest_result",
				CredentialsOk:     false,
				CredentialsReason: fmt.Sprintf("App Secret 不匹配（code=%d）：%s", r.Code, r.Msg),
			})
			return
		}
	}

	// 网络级 short-circuit：只要所有 probe 都是网络错误，判定整体网络不通
	if allNetworkErrors(netErrs) {
		emitSelftestResult(SelftestResult{
			Type:              "selftest_result",
			CredentialsOk:     false,
			CredentialsReason: fmt.Sprintf("网络不通：%v", firstNonNil(netErrs)),
		})
		return
	}

	emitSelftestResult(SelftestResult{
		Type:          "selftest_result",
		CredentialsOk: true,
		Probes:        results,
	})
}

func emitSelftestResult(r SelftestResult) {
	b, _ := json.Marshal(r)
	fmt.Println(string(b))
}

// ──── 三个具体 probe ────

// 用前缀 + 纳秒时间戳组合成 dummy ID，保证不会撞到真实消息；
// `om_` 前缀让它通过格式校验，到达 scope 检查路径
func dummyMessageID() string {
	return fmt.Sprintf("om_probe_typebridge_%d", time.Now().UnixNano())
}

func dummyFileKey() string {
	return fmt.Sprintf("img_probe_typebridge_%d", time.Now().UnixNano())
}

func probeDownloadImage(ctx context.Context, client *lark.Client) (ProbeResult, error) {
	req := larkim.NewGetMessageResourceReqBuilder().
		MessageId(dummyMessageID()).
		FileKey(dummyFileKey()).
		Type("image").
		Build()

	resp, err := client.Im.MessageResource.Get(ctx, req)
	return buildProbeResult("download_image", "下载图片资源", "im:message:readonly", resp, err)
}

func probeReaction(ctx context.Context, client *lark.Client) (ProbeResult, error) {
	req := larkim.NewCreateMessageReactionReqBuilder().
		MessageId(dummyMessageID()).
		Body(larkim.NewCreateMessageReactionReqBodyBuilder().
			ReactionType(larkim.NewEmojiBuilder().EmojiType("DONE").Build()).
			Build()).
		Build()

	resp, err := client.Im.MessageReaction.Create(ctx, req)
	return buildProbeResult("reaction", "发表情反应", "im:message.reactions:write_only", resp, err)
}

func probeReply(ctx context.Context, client *lark.Client) (ProbeResult, error) {
	contentJSON, _ := json.Marshal(map[string]string{"text": "probe"})
	req := larkim.NewReplyMessageReqBuilder().
		MessageId(dummyMessageID()).
		Body(larkim.NewReplyMessageReqBodyBuilder().
			MsgType("text").
			Content(string(contentJSON)).
			Build()).
		Build()

	resp, err := client.Im.Message.Reply(ctx, req)
	return buildProbeResult("reply", "回复消息", "im:message:send_as_bot", resp, err)
}

// ──── 响应翻译 ────

// buildProbeResult 把 Go SDK 的 (*Resp, error) 转换为 ProbeResult。
// 用 json roundtrip 拿 Code/Msg 避免为每种 resp 类型写一份断言——飞书
// v3 所有 Get/Create/Reply resp 结构体都 embed 了 RawResp 并暴露 Code/Msg。
func buildProbeResult(id, label, hint string, resp interface{}, err error) (ProbeResult, error) {
	r := ProbeResult{
		ID:        id,
		Label:     label,
		ScopeHint: hint,
	}

	if err != nil {
		r.Ok = false
		r.Msg = err.Error()
		return r, err
	}

	code, msg := extractCodeMsg(resp)
	r.Code = code
	r.Msg = msg

	switch code {
	case 0:
		r.Ok = true
	case errCodeScopeMissing:
		r.Ok = false
		r.Scopes = extractScopes(msg)
		r.HelpURL = extractHelpURL(msg)
	case errCodeInvalidAppID, errCodeInvalidAppSecret:
		// 凭据错误：这一行 probe 也算 fail，但上层会用 Code 识别并 short-circuit
		r.Ok = false
	default:
		// 其他业务 code（参数非法 / not found / 频控 等等）都说明
		// 请求进到业务层了，scope 充足——判 ok
		r.Ok = true
	}
	return r, nil
}

// extractCodeMsg 从 resp 里抓 .Code .Msg；飞书 SDK 所有 Get/Create/Reply
// 的 resp 结构体都 embed 了 RawResp + 暴露 Code/Msg。
func extractCodeMsg(resp interface{}) (int, string) {
	if resp == nil {
		return -1, "nil response"
	}
	// 用 json roundtrip 拿 code/msg，简单且稳定（比 reflect.FieldByName 健壮）
	b, err := json.Marshal(resp)
	if err != nil {
		return -1, fmt.Sprintf("marshal resp failed: %v", err)
	}
	var tmp struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
	}
	if err := json.Unmarshal(b, &tmp); err != nil {
		return -1, fmt.Sprintf("unmarshal resp failed: %v", err)
	}
	return tmp.Code, tmp.Msg
}

var (
	// 飞书 msg 里 scope 列表形如：`[im:message:send_as_bot, im:message]`
	scopeListRe = regexp.MustCompile(`\[([\w:.\-]+(?:\s*,\s*[\w:.\-]+)*)\]`)
	// 后台深链：https://open.feishu.cn/app/cli_xxx/auth?q=...
	urlRe = regexp.MustCompile(`https://[^\s\p{Han}）)]+`)
)

func extractScopes(msg string) []string {
	m := scopeListRe.FindStringSubmatch(msg)
	if m == nil {
		return nil
	}
	parts := strings.Split(m[1], ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func extractHelpURL(msg string) string {
	m := urlRe.FindString(msg)
	return strings.TrimRight(m, ".,。，")
}

// ──── short-circuit 辅助 ────

// allNetworkErrors 判断是否所有 probe 都只是网络错误（err != nil 且
// 没有拿到 code）。有 code 的那条已经进到业务层，不算网络错。
func allNetworkErrors(errs []error) bool {
	any := false
	for _, e := range errs {
		if e == nil {
			return false
		}
		any = true
	}
	return any
}

func firstNonNil(errs []error) error {
	for _, e := range errs {
		if e != nil {
			return e
		}
	}
	return nil
}

// ──── 原 reaction / reply / replyDirect（保持不变）────

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
		return &apiFailure{code: resp.Code, msg: resp.Msg}
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
		return &apiFailure{code: resp.Code, msg: resp.Msg}
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
		return &apiFailure{code: resp.Code, msg: resp.Msg}
	}
	return nil
}

