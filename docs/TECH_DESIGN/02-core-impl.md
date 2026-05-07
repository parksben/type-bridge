# §六、§七、§九~§十一 图片注入、设置持久化、消息队列状态机、飞书双向回复、消息历史

> **模块归属**：核心功能实现。§八UI设计语言在 [03-ui-tab.md](./03-ui-tab.md)

---

## 六、图片注入技术方案

### 6.1 图片下载（Go sidecar）

飞书图片消息的 `image_key` 需通过 API 下载原始字节：

```go
// 使用 lark-oapi-sdk-golang 下载图片
req := larkim.NewGetMessageResourceReqBuilder().
    MessageId(msgId).
    FileKey(imageKey).
    Type("image").
    Build()
resp, _ := client.Im.MessageResource.Get(ctx, req)
// resp.RawBody 即图片字节流
```

下载完成后，通过 stdout 输出图片（Base64 编码）：

```json
{"type":"image","message_id":"xxx","data":"<base64>","mime":"image/png","text":"同消息中的文本（可为空）"}
```

### 6.2 图片写入剪贴板（Rust）

```rust
// 使用 objc2 / cocoa crate 操作 NSPasteboard
let pasteboard = NSPasteboard::generalPasteboard();
pasteboard.clearContents();
pasteboard.setData_forType(image_data, NSPasteboardTypePNG);
```

### 6.3 粘贴触发

```rust
// 模拟 Cmd+V
let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState).unwrap();
let v_down = CGEvent::new_keyboard_event(source.clone(), 0x09, true).unwrap();
v_down.set_flags(CGEventFlags::CGEventFlagCommand);
v_down.post(CGEventTapLocation::HID);
// key up ...
```

### 6.4 图文混合顺序

1. 若消息含文本 → 先 `CGEventPost` 注入文本
2. 再将图片写入剪贴板 → 模拟 `Cmd+V`
3. 若粘贴失败（目标不支持图片）→ 写日志，剪贴板内容保留，用户可手动粘贴

---

## 七、设置项持久化方案

所有设置与凭据统一存储在 `tauri-plugin-store` 的同一个 JSON 文件中（`~/.typebridge/config.json`）：

```json
{
  "feishu_app_id": "cli_xxxx",
  "feishu_app_secret": "xxxx",
  "dingtalk_client_id": "dingxxxx",
  "dingtalk_client_secret": "xxxx",
  "auto_submit": true,
  "submit_key": "enter"
}
```

Rust 侧提供两个 command 供前端调用：

```rust
#[tauri::command]
fn get_settings() -> Settings { ... }

#[tauri::command]
fn save_settings(settings: Settings) { ... }
```

设置变更后立即生效，无需重启。

---

## 九、消息队列与状态机

### 9.1 队列模型

单 FIFO 队列 + 单 worker：

```
 Go sidecar stdout
        │ {"type":"message", ...}
        ▼
 sidecar.rs dispatcher
        │
        ├── 写 history（status=Queued）
        ├── emit feishu://history-update（前端刷新列表）
        ├── 发 reaction EYES → Go stdin
        └── 入队 tokio::sync::mpsc::Sender<QueuedMessage>
                             │
                             ▼
             injection_worker（单 tokio task）
                loop { msg = rx.recv().await; process(msg); }
```

**为什么严格单 worker：** 同一时刻只能有一条注入 CGEventPost，多条并发会互相"抢键盘"、目标焦点切换时序会乱。

### 9.2 状态机

```rust
enum MessageStatus {
    Queued,       // 入队，等待 worker 取
    Processing,   // worker 取到，正在注入
    Sent,         // 注入成功
    Failed { reason: String },
}
```

状态转换完全由 `injection_worker` 与用户操作（重发）触发，其他地方只读不写。

每次状态变更：
1. 更新 `history.json` 中的记录
2. emit `feishu://message-status` 事件给前端：`{id, status, reason?}`
3. 调用 Go sidecar 发相应表情反应（详见 §十）

### 9.3 状态转换轨迹

消息一进队就走 `Queued → Processing → Sent/Failed` 的线性流程，worker 直接消费、无中间人工闸门。（v0.4.3 曾存在 `confirm_before_inject` 开关和 ConfirmOverlay 浮层，实测开启后弹窗会抢焦点导致粘贴目标丢失，已完全移除。）

### 9.4 重发

用户在消息历史 tab 点"重发"：

1. 检查消息状态为 Sent 或 Failed（排队中的消息不允许重发）
2. 重置为 Queued，更新 updated_at
3. 重新入队（不改变 `id`，同一条消息的历史只有一条记录，每次重发覆盖之前的状态）
4. 触发整条状态机流水

---

## 十、飞书双向回复

### 10.1 通信方向

v0.1 架构：Rust ↔ Go 仅 **Rust ← Go（stdout 单向）**。
v0.3 架构：增加 **Rust → Go（stdin 双向）**，Rust 侧向 Go sidecar stdin 写 JSON Lines 命令。

```
Rust ──stdin JSON Lines──► Go sidecar
Rust ◄─stdout JSON Lines── Go sidecar
```

### 10.2 Rust → Go 命令协议

```json
{"cmd":"reaction","message_id":"om_xxx","emoji_type":"EYES","replace_prev":true}
{"cmd":"reply","message_id":"om_xxx","text":"失败原因：无焦点输入框"}
```

- `reaction.replace_prev`: 若为 true，先删除 bot 之前给这条消息打的表情再加新的（避免两个表情堆叠）
- `reply`: 在原消息 thread 下回复一条文字消息（使用 `reply_in_thread: true`）

### 10.3 Go sidecar 实现

Go 启一个专门的 goroutine 读 stdin：

```go
go func() {
    decoder := json.NewDecoder(os.Stdin)
    for {
        var cmd Command
        if err := decoder.Decode(&cmd); err != nil { return }
        switch cmd.Cmd {
        case "reaction": handleReaction(ctx, client, cmd)
        case "reply":    handleReply(ctx, client, cmd)
        }
    }
}()
```

**API 调用**（lark-oapi-sdk-golang v3）：

```go
// 表情反应
req := larkim.NewCreateMessageReactionReqBuilder().
    MessageId(cmd.MessageId).
    Body(larkim.NewCreateMessageReactionReqBodyBuilder().
        ReactionType(larkim.NewEmojiBuilder().EmojiType(cmd.EmojiType).Build()).
        Build()).
    Build()
client.Im.MessageReaction.Create(ctx, req)

// Thread 回复
replyReq := larkim.NewReplyMessageReqBuilder().
    MessageId(cmd.MessageId).
    Body(larkim.NewReplyMessageReqBodyBuilder().
        MsgType("text").
        Content(...).
        ReplyInThread(true).
        Build()).
    Build()
client.Im.Message.Reply(ctx, replyReq)
```

### 10.4 emoji_type 取值映射

| 阶段 | Rust 侧常量 | 飞书 emoji_type |
|------|-----------|----------------|
| 收到消息 | `EYES` | `"EYE_SPY"`（👀，待验证；若不存在退回 `"SHOCK"`） |
| 成功 | `DONE` | `"OK"`（✅ 对勾风格） |
| 失败 | `SAD` | `"CRY"` 或 `"SAD"`（❌/🥲） |

> 飞书 emoji_type 的确切枚举值需在开发时打开飞书官方文档 `/open-apis/im/v1/messages/:msg_id/reactions` 确认；若上述值不存在则用兜底值（`OK` → `THUMBSUP`，`CRY` → `NAY`）。代码中用常量集中管理，方便快速调整。

### 10.5 错误处理

- 表情/回复失败（网络抖动 / API 频控 / 权限不足）：记日志不抛异常，主流程继续
- Go sidecar stdin 被关闭：视为命令通道断开，只影响未来的回复，不影响已入队消息的注入

---

## 十一、消息历史持久化

### 11.1 存储格式

单个 JSON 数组文件：`~/.typebridge/history.json`

```json
[
  {
    "id": "om_xxxxxx",
    "received_at": 1730000000,
    "updated_at": 1730000002,
    "sender": "张三",
    "text": "帮我写一个 React 组件",
    "image_path": null,
    "status": "sent"
  },
  {
    "id": "om_yyyyyy",
    "received_at": 1730000010,
    "updated_at": 1730000011,
    "sender": "李四",
    "text": "帮我看看这个错误",
    "image_path": "images/om_yyyyyy.png",
    "status": "failed",
    "failure_reason": "无焦点输入框"
  }
]
```

图片独立目录 `~/.typebridge/images/<message_id>.<ext>`，历史记录只存相对路径。

### 11.2 Rust 模块 `history.rs`

```rust
pub struct HistoryStore {
    path: PathBuf,
    messages: RwLock<Vec<HistoryMessage>>, // 按 received_at 升序存，读取时倒序
}

impl HistoryStore {
    pub fn load() -> Result<Self>;
    pub fn append(&self, msg: HistoryMessage);           // FIFO 淘汰超 500 条
    pub fn update_status(&self, id: &str, status: MessageStatus);
    pub fn delete(&self, id: &str);
    pub fn all_desc(&self) -> Vec<HistoryMessage>;       // 倒序返回
    fn flush(&self);                                     // 序列化到 history.json（写时锁）
}
```

**写时锁** + **整体重写**策略：数据量 500 条 × 平均 500B ≈ 250KB，全文件重写代价可忽略。

**并发安全**：`injection_worker`、Tauri command、Go 消息入口都会写 `HistoryStore`，用 `Arc<HistoryStore>` 共享，内部 `RwLock` 控并发。

### 11.3 新增 Tauri Commands

```rust
#[tauri::command] fn get_history() -> Vec<HistoryMessage>;
#[tauri::command] fn delete_history_message(id: String);
#[tauri::command] fn retry_history_message(id: String);
```

### 11.4 图片缓存清理

- 删除历史消息时，同步删除对应 `images/<id>.<ext>` 文件
- 500 条 FIFO 淘汰时，同步删除被淘汰项的图片
- 启动时做一次扫描：`images/` 下不属于任何历史记录的孤儿图片清理掉（防崩溃残留）
