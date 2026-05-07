# §三十~§三十四 各渠道 sidecar 实现与 UI 扩展

> **模块归属**：钉钉、企微 sidecar 实现，UI 多渠道扩展，设置 schema 演进

---

## 三十、钉钉 Stream Mode sidecar 实现

### 30.1 选型

- 二进制：`dingtalk-bridge`（Go），目录 `dingtalk-bridge/`
- 长连接：[`open-dingtalk/dingtalk-stream-sdk-go`](https://github.com/open-dingtalk/dingtalk-stream-sdk-go) 官方维护，稳定
- 模式：仅支持 Stream Mode，不支持 webhook callback（架构上不允许公网回调）

### 30.2 关键代码骨架

```go
// dingtalk-bridge/main.go
cli := client.NewStreamClient(
    client.WithAppCredential(client.NewAppCredentialConfig(clientID, clientSecret)),
)
cli.RegisterChatBotCallbackRouter(func(ctx context.Context, data *chatbot.BotCallbackDataModel) ([]byte, error) {
    handleMessage(data)  // 解析 + emit JSON Lines
    return nil, nil
})

// !!! 和 larkws 不同：dingtalk-stream-sdk-go 的 Start() 是非阻塞的。
// 它同步完成 HTTP gettoken + WSS 握手后 return nil，真正的读循环在内部 goroutine。
// SDK 官方 example 的用法就是 `Start(ctx); select {}`。
if err := cli.Start(ctx); err != nil {
    emitError(err); os.Exit(1)
}
emitStatus(true)
<-sigChan  // 阻塞在信号上，让内部 processLoop 跑
```

**踩坑记录**：最初照抄 feishu-bridge 的"宽限期 select"模式（把 `Start()` 丢 goroutine，2s 内没报错就 emit connected），结果 `Start()` 在 <1s 就返回 `nil`，select 分支立即命中，被误判为 `stream terminated immediately` 并退出——sidecar 永远拉不起来。修正方案是同步调用 `Start()`，非 nil 才算启动失败，nil 就直接 emit `status:true` 并阻塞在信号上。SDK 自带 `AutoReconnect: true`，WSS 中断会在内部重连。

### 30.3 消息载荷映射

`BotCallbackDataModel` → 统一事件：

| 飞书原 SDK 字段 | 钉钉 SDK 字段 | 统一事件字段 |
|---------------|-------------|------------------|
| `event.message.message_id` | `MsgId` | `message_id` |
| `event.sender.sender_id.user_id` | `SenderStaffId` (或 `SenderNick`)| `sender` |
| `event.message.content.text` | `Text.Content` | `text` |
| `event.message.create_time` | `CreateAt` (ms) | `ts` |

消息类型 (`msgtype`)：
- `text` → emit `{"type":"message", ...}`
- `picture` → 用 `Picture.DownloadCode` 调 `/v1.0/robot/messageFiles/download` 拿字节，base64 编码后 emit `{"type":"image", ...}`
- `richText` → 类似飞书 `post`，按段落拼接，图片单独 emit
- 其他（audio / file / video）→ 暂不支持，emit error 提示

### 30.4 反馈实现

**原设计（互动卡片 + StreamingUpdate）已搁置**：卡片路径需要用户在钉钉开发者平台注册卡片模板、保存 `card_biz_id`、再用 Streaming API 原地更新。对 MVP 来讲把"接入门槛从 2 步变成 N 步"得不偿失。

**落地方案：每条用户消息最多对应一条 bot 文字回执**，通过 `data.SessionWebhook` 的 `SimpleReplyText` 实现：

| 时机 | 回执内容 |
|------|---------|
| 注入成功 | `✅ 已输入` |
| 注入失败 | `❌ 输入失败：<原因>` |
| 已接收（中间态） | 不回——注入 <1s，回两条会刷屏 |

```go
// dingtalk-bridge/commands.go，handleReply
replier := chatbot.NewChatbotReplier()
return replier.SimpleReplyText(ctx, webhook, []byte(text))
```

`sessionWebhook` 有效期约 1h（由 `SessionWebhookExpiredTime` 控制），本地用 `msgID → (webhook, expireAt)` map 记住，发回执时查表用，过期则吞掉不阻塞主流程。对"注入完成"这个秒级场景，过期可忽略。

飞书侧 `success_text_reply = false`：它有 `reactions` 能力，`✅` 表情贴在原消息上，没必要再发一条新文字。能力矩阵见 [channel.rs](../../src-tauri/src/channel.rs)。

### 30.5 selftest 实现

钉钉的 selftest 比飞书简单——没有 scope 概念，只验证凭据：

```go
// 调 /gettoken 获取 access_token，能拿到就算通过
resp, err := getAccessToken(clientID, clientSecret)
if err != nil || resp.AccessToken == "" {
    return SelftestResult{
        CredentialsOk: false,
        CredentialsReason: err.Error(),
    }
}
return SelftestResult{
    CredentialsOk: true,
    Probes: []ProbeResult{},  // 钉钉无 scope probe
}
```

UI 上仍渲染清单结构，只是 probes 数组为空，主要看"凭据可用 ✓"+ Stream Mode 静态引导。

**文案按渠道差异化**：`SelftestChecklist` 的"凭据可用"hint、失败兜底提示、Stream Mode 引导块的按钮文案要按 `channel` 参数切换，避免飞书术语（App ID / App Secret / tenant_access_token / open.feishu.cn）泄漏到钉钉面板。钉钉侧使用 "Client ID / Client Secret 能换到 access_token" + "去钉钉开发者平台"。

**静态引导块不挂「查看文档」外链**（飞书 / 钉钉统一遵循）——官网 `/docs/{channel}` 已经是维护的入口，在桌面应用里再多放一个外链只会分散点击、制造冗余。清单底部只保留"去配置页"这一个动作链接。

---

## 三十一、企微 AI Bot 长连接 sidecar 实现

### 31.1 选型

- 二进制：`wecom-bridge`（Go），目录 `wecom-bridge/`
- 长连接：**Go 手写 WSS 协议**（无官方 Go SDK；Node 官方 SDK 不在我们技术栈内）
- 端点：`wss://openws.work.weixin.qq.com`
- 协议参考：[企微智能机器人长连接](https://developer.work.weixin.qq.com/document/path/101463)

### 31.2 协议要点

- 鉴权：连接后立刻发 `aibot_subscribe` 帧带 botId + secret
- 订阅成功后接收 `aibot_msg_callback`（用户消息）/ `enter_chat`（进会话）等帧
- 心跳：30s 一次 ping，超时则被服务端断连
- 媒体加密：image / file / video 帧自带 per-URL `aeskey`，AES-256-CBC + PKCS#7（与回调模式 EncodingAESKey 不同）
- 单连接限制：同一个机器人**同时只能一条活动 WSS**，新连接会踢旧连接

### 31.3 实现骨架（Go）

```go
// wecom-bridge/client.go
type Client struct {
    botID, secret string
    conn          *websocket.Conn
    writeMu       sync.Mutex                // WriteMessage 并发写保护
    reqIDs        sync.Map                  // msgID → reqID（reply 时透传）
    streams       sync.Map                  // msgID → streamID（同一条消息复用）
    lastPong      atomic.Value              // time.Time，心跳超时判定
}

func (c *Client) Run(ctx context.Context) error {
    c.conn = dial("wss://openws.work.weixin.qq.com")
    if err := c.subscribe(ctx); err != nil {     // 发 aibot_subscribe 等 errcode==0 ack
        return err
    }
    go c.pingLoop(ctx)                            // 27s 间隔 ping；>60s 无 pong 取消 ctx
    return c.readLoop(ctx)                        // 阻塞；返回即触发 main.go 退出
}
```

`aibot_subscribe` 帧格式：

```json
{"cmd":"aibot_subscribe","headers":{"req_id":"<uuid>"},"body":{"bot_id":"...","secret":"..."}}
```

响应 `{"headers":{"req_id":"<echoed>"},"errcode":0,"errmsg":"ok"}`，errcode ≠ 0 即为启动失败（凭据错 / bot 被禁）。依赖：`github.com/gorilla/websocket`（主流、稳定）+ `github.com/google/uuid`。

### 31.4 反馈实现

企微 `aibot_respond_msg` 的 `stream.id + finish` 机制允许**同一 stream.id 多次推送等于原地更新消息内容**，这比钉钉"多条文字回执"优雅得多。

```go
// 首次推送（finish=false）→ bot 侧出现新消息
respondStream(reqID, streamID, "🟡 处理中...", false)

// 继续推送相同 streamID（finish=false）→ 原地更新内容
respondStream(reqID, streamID, "⚙️ 注入中...", false)

// 最终推送（finish=true）→ 原地更新 + 关闭流
respondStream(reqID, streamID, "✅ 已输入", true)
```

关键约束：
1. `headers.req_id` **必须透传** message callback 的 req_id；否则服务端拒绝关联
2. `stream.id` 同一消息生命周期复用；新消息生成新 streamID
3. 从首次推送开始 10 分钟内必须发 finish=true，否则自动结束
4. 同一会话回复 + 主动推送合计限流 30 条/分钟、1000 条/小时

**req_id / stream_id 封装**：这两个都是协议传输层细节，不泄漏给 Rust。Go 内部维护 `reqIDs sync.Map[msgID]reqID` + `streams sync.Map[msgID]streamID`。Rust 只发 `StreamingReply { message_id, content, finish }`，Go 收到后查表组装帧。`finish=true` 时延迟 1s 清 map。

### 31.5 selftest 实现

企微没有"换 token"流程——订阅成功即可用。selftest 直接读一个 `atomic.Bool subscribed` 标志：已订阅返回 `credentials_ok:true`；未订阅返回 false + 具体 errmsg。UI 渲染清单结构，"凭据可用 ✓" + API 模式静态引导。

### 31.6 消息载荷字段映射

| 统一事件字段 | 企微 frame 字段 |
|---|---|
| `message_id` | `body.msgid` |
| `sender` | `body.from.userid` |
| `text` | `body.text.content` |
| `ts` | `body.msgid` 的附带时间戳（或落 `time.Now().Unix()`） |

图片消息：`body.image.url` + `body.image.aeskey`，AES-256-CBC + PKCS#7 解密（IV = aeskey 前 16 字节），下载后 base64 编码 → emit `{"type":"image","data":"..."}`。下载 URL 5min 有效期，收到 callback 后立即 fetch，不 defer。

### 31.7 单连接互斥

文档明示"同一机器人同一时刻只能一条活动 WSS"——新订阅会踢旧连接，服务端给旧连接发 `disconnected_event`（`aibot_event_callback` 的 eventtype），随后主动断开。本次最小处理：Go 侧收到 `disconnected_event` → emit `error msg="kicked"` + `status:false` → 退出进程，让 Rust 现有 2s→60s 指数退避接管。UI tab 顶部 banner 加静态提示"同一企微机器人同时只能一台设备使用，多设备登录会互相挤掉"。

### 31.8 心跳机制

27s ticker 发 `{"cmd":"ping","headers":{"req_id":"<uuid>"}}`；`readLoop` 收到 pong 后更新 `lastPong`。`pingLoop` 每次 tick 检查 `time.Since(lastPong) > 60s` 则 cancel ctx 触发 Run 返回。选 27s（不是 30s）是给服务端留余量，防止网络抖动导致误判死连接。

---

## 三十二、UI 多渠道扩展

### 32.1 SideBar 底部连接状态

从单个 dot 变成多 dot 排列：

```tsx
// 仅展示已配置过凭据的渠道
const configuredChannels: ChannelId[] = useConfiguredChannels();

return (
  <div className="mt-auto px-3 py-3 flex flex-col gap-1.5"
       style={{ borderTop: "1px solid var(--border)" }}>
    {configuredChannels.map((ch) => (
      <ChannelStatusRow key={ch} channel={ch} />
    ))}
    {configuredChannels.length === 0 && (
      <div className="text-[11px] text-subtle">尚未配置任何渠道</div>
    )}
  </div>
);
```

每行：渠道 label + 状态点（脉冲 / idle）。

### 32.2 ConnectionTab 抽象（飞书 / 钉钉 / 企微 三个 Tab 共享框架）

新建 `tabs/ConnectionTabBase.tsx`，按 props 渲染：

```tsx
interface Props {
  channel: ChannelId;
  intro: { hint: string; portalUrl: string };
  fields: FieldDef[];                  // 凭据字段定义
  validate: (values) => FieldErrors;
  staticGuide?: GuideStep[];           // 平台特定的引导步骤
}
```

各渠道的 tab 组件只是 props 不同：
- `FeishuConnectionTab`：沿用现有 ConnectionTab 实现，重构提取共用 base
- `DingTalkConnectionTab`：新建，基于 base
- `WeComConnectionTab`：新建，基于 base

### 32.3 HistoryTab 渠道筛选 chip

```tsx
const filters: ChannelFilter[] = [
  { id: "all", label: "全部" },
  ...configuredChannels.map((ch) => ({ id: ch, label: ch.label() })),
];

const visible = useMemo(() =>
  history.filter((m) =>
    activeFilter === "all" || m.channel === activeFilter
  ).filter((m) => !hiddenIds.has(m.id)),
[history, activeFilter, hiddenIds]);
```

每个 chip 计数独立计算（基于 `history`，不受 `activeFilter` 影响）。

### 32.4 HistoryCard 渠道 tag

卡片右上角与状态 tag 相邻：

```tsx
<div className="flex items-center gap-1.5">
  <ChannelTag channel={message.channel} />   {/* 飞书/钉钉/企微 */}
  <StatusTag status={message.status} />      {/* 已发送/失败 */}
</div>
```

`ChannelTag` 颜色：飞书 = `var(--accent)`、钉钉 = #2378e7（蓝）、企微 = #07c160（绿）。

### 32.5 SystemLogTab 渠道前缀

LogEntry 加 `channel?: ChannelId` 字段（可选——全局事件无渠道）。前端渲染时按字段决定前缀：

```tsx
{log.channel ? (
  <span className="font-mono text-[11px]" style={{ color: channelColor(log.channel) }}>
    [{log.channel.label()}]
  </span>
) : null}
{" "}{log.text}
```

LogEntry 的 channel 由后端在 emit log 时显式带上，前端不做推断。

### 32.6 不引入第二种导航模式

历史筛选只用 chip，不用左侧二级菜单 / 折叠面板等更重的 UI——保持 v0.5 已有 layout 的简洁性。

---

## 三十三、设置存储 schema 演进 + 迁移

### 33.1 旧 schema（v0.5）

```json
{
  "feishu_app_id": "cli_xxx",
  "feishu_app_secret": "xxx",
  "auto_submit": true,
  "submit_key": { ... }
}
```

### 33.2 新 schema（v0.6+）

```json
{
  "channels": {
    "feishu": { "app_id": "cli_xxx", "app_secret": "xxx" },
    "dingtalk": { "client_id": "ding_xxx", "client_secret": "xxx" },
    "wecom": { "bot_id": "...", "secret": "..." }
  },
  "auto_submit": true,
  "submit_key": { ... }
}
```

### 33.3 自动迁移逻辑（Rust 启动时一次性）

```rust
fn migrate_legacy_settings(store: &Store) -> Result<()> {
    if store.has("channels") {
        return Ok(());  // 已是新 schema
    }
    let mut channels = serde_json::Map::new();
    if let Some(app_id) = store.get("feishu_app_id") {
        if let Some(app_secret) = store.get("feishu_app_secret") {
            channels.insert("feishu".into(), json!({
                "app_id": app_id, "app_secret": app_secret,
            }));
        }
    }
    store.set("channels", json!(channels));
    store.delete("feishu_app_id");
    store.delete("feishu_app_secret");
    store.save()?;
    Ok(())
}
```

迁移幂等：第二次调用直接 return（已有 `channels` 键）。

### 33.4 InputSettingsTab 不变

`auto_submit` / `submit_key` 仍在顶层，不放到 `channels.*`——它们是与渠道无关的全局设置。

---

## 三十四、落地阶段

| 阶段 | 内容 | 预估工时 |
|------|------|---------|
| **P0 设计 + scaffold** | TECH_DESIGN / REQ 完成；ChannelId enum / 统一事件协议 / HistoryMessage schema 落地（不动 sidecar）| 1 天 |
| **P1 钉钉 MVP** | dingtalk-bridge Go sidecar；DingTalkTab UI；钉钉 selftest；端到端跑通文本消息接收 + 输入 | 2-3 天 |
| **P2 钉钉完整功能** | 钉钉图片消息接收；状态反馈卡片（feedback_received/sent/failed）；UI 渠道筛选 + tag + 日志前缀 | 1-2 天 |
| **P3 企微 MVP** | wecom-bridge Go 手写 WSS；WeComTab UI；企微 selftest；文本消息端到端 | 3-4 天（含手写协议）|
| **P4 企微完整功能** | 企微图片解密；流式 markdown 卡片反馈 | 1-2 天 |
| **合计** | | **约 8-12 天** |

实际节奏可根据反馈调整。P0 必须先于其他阶段完成——所有后续工作都依赖统一的 ChannelId / 事件协议 / HistoryMessage schema。
