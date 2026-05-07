# §二十六~§二十九 多渠道架构

> **模块归属**：v0.6+ 多渠道（飞书/钉钉/企微）总体设计

---

## 二十六、多渠道架构总论（v0.6+）

### 26.1 设计目标

把 v0.5 的"单渠道飞书"扩展为"飞书 / 钉钉 / 企微三渠道并存"，同时保持现有的飞书功能不退化。具体目标：

- 三个渠道**都用原生长连接**（飞书 larkws / 钉钉 Stream Mode / 企微 AI Bot WSS），零公网 IP 依赖
- 用户可只配 1 / 2 / 3 个渠道，未配置的渠道**不启 sidecar**
- 三家收到的消息**进入同一个 FIFO 队列**，依次粘到当前焦点输入框（核心：注入路径完全不变）
- 一家断连不影响其他两家
- HistoryMessage 加 `channel` 字段，UI 支持渠道筛选 + 来源 tag

### 26.2 三大架构选项的权衡

|  | A. 1 sidecar 三渠道并存 | B. 3 sidecar 全启动 | C. 3 sidecar 按需启动（**采用**）|
|--|----------------------|------------------|------------------------------|
| 进程数 | 1 | 3（始终）| 0-3（按配置）|
| 二进制大小 | 1 个，包含三家 SDK | 3 个独立 | 3 个独立 |
| 故障隔离 | 弱（一家挂全挂）| 强 | 强 |
| 实现 | 重（要 mux 三家 SDK）| 轻（每个 sidecar 独立维护）| 轻 |
| 资源占用（用户只用 1 家时）| 偏低 | 偏高（其他两家空跑）| 最低（其他两家不启）|

**采用 C**：每家一个 Go 二进制（`feishu-bridge` / `dingtalk-bridge` / `wecom-bridge`），Rust 启动时按已配置的渠道动态启对应 sidecar。

### 26.3 进程拓扑

```
┌─────────────────── TypeBridge.app ──────────────────────────┐
│                                                             │
│  ┌─────────┐    ┌────────────────────────────────────────┐  │
│  │ WebView │ ◄─►│           Tauri Core (Rust)            │  │
│  │ (React) │    │                                        │  │
│  └─────────┘    │   ┌──────────────────────────────┐     │  │
│                 │   │  ChannelRegistry             │     │  │
│                 │   │   ├─ feishu  → SidecarBridge │     │  │
│                 │   │   ├─ dingtalk → ...          │     │  │
│                 │   │   └─ wecom   → ...           │     │  │
│                 │   └──────────────────────────────┘     │  │
│                 │              ▼                         │  │
│                 │   ┌──────────────────────────────┐     │  │
│                 │   │  injection_worker (single)   │     │  │
│                 │   │   ▼                          │     │  │
│                 │   │  AX Injector                 │     │  │
│                 │   └──────────────────────────────┘     │  │
│                 └────┬───────────┬──────────────┬────────┘  │
│                      │ stdin/out │              │           │
└──────────────────────┼───────────┼──────────────┼───────────┘
                       ▼           ▼              ▼
            ┌─────────────┐ ┌─────────────┐ ┌──────────────┐
            │feishu-bridge│ │dingtalk-    │ │wecom-bridge  │
            │ (larkws)    │ │bridge       │ │ (手写 WSS)    │
            │             │ │ (Stream SDK)│ │              │
            └──────┬──────┘ └──────┬──────┘ └──────┬───────┘
                   │ WSS           │ WSS          │ WSS
                   ▼               ▼              ▼
              飞书开放平台      钉钉开放平台    企微开放平台
```

### 26.4 关键不变量

- **注入 worker 是全局唯一的单实例**——v0.4 的"严格单 worker 串行"约束不动；不同渠道的消息只是数据来源不同，处理路径完全一样
- **三个 sidecar 互相不通信**——事件全部走 stdout 给 Rust，命令全部走 stdin 来自 Rust。Rust 是中央调度
- **不引入新进程**：渠道切换在 Rust `ChannelRegistry` 内完成，没有 supervisor / orchestrator 之类的中间层

---

## 二十七、Channel 抽象与统一 IPC 协议

### 27.1 Rust 侧 ChannelId 枚举

```rust
#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChannelId {
    Feishu,
    DingTalk,
    WeCom,
}

impl ChannelId {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Feishu => "飞书",
            Self::DingTalk => "钉钉",
            Self::WeCom => "企微",
        }
    }

    pub fn binary_name(&self) -> &'static str {
        match self {
            Self::Feishu => "feishu-bridge",
            Self::DingTalk => "dingtalk-bridge",
            Self::WeCom => "wecom-bridge",
        }
    }
}
```

### 27.2 统一事件协议（Sidecar → Rust）

所有 sidecar 的 stdout JSON Lines **必须包含 `channel` 字段**：

```json
{"type":"status","channel":"feishu","connected":true}
{"type":"message","channel":"dingtalk","message_id":"msg_xxx","sender":"...","text":"...","ts":"..."}
{"type":"image","channel":"wecom","message_id":"msg_xxx","data":"<base64>","mime":"image/png"}
{"type":"selftest_result","channel":"dingtalk","credentials_ok":true,"probes":[...]}
{"type":"feedback_error","channel":"dingtalk","message_id":"...","kind":"reply","code":-1,"msg":"..."}
{"type":"error","channel":"feishu","msg":"..."}
```

Rust 侧的 `SidecarEvent` enum 增加 `channel: ChannelId` 字段（`#[serde(default = "ChannelId::Feishu")]` 兼容旧 sidecar 没带 channel 的事件）。

### 27.3 统一命令协议（Rust → Sidecar）

Rust 写到对应 sidecar 的 stdin。**因为每个 sidecar 只服务自己渠道**，命令本身**不需要 `channel` 字段**——Rust 知道要写给谁。

```json
{"cmd":"selftest"}
{"cmd":"feedback_received","message_id":"msg_xxx"}
{"cmd":"feedback_sent","message_id":"msg_xxx"}
{"cmd":"feedback_failed","message_id":"msg_xxx","reason":"..."}
```

⚠ **命令名变化**：v0.5 飞书的 `reaction` / `reply` 命令是它特有的能力，多渠道下需要抽象成更高语义的 `feedback_*` 命令。每个 sidecar 内部把 `feedback_*` 翻译为该渠道的具体 API：
- 飞书：`feedback_received` → reaction EYES；`feedback_sent` → reaction DONE 替换；`feedback_failed` → reaction CRY 替换 + thread reply
- 钉钉：`feedback_received` → 发送互动卡片"处理中"（保存 card_id 到内存）；`feedback_sent` → `StreamingUpdate` 卡片为"✅ 已输入"；`feedback_failed` → `StreamingUpdate` 卡片为"❌ 失败：原因"
- 企微：同理，用 `aibot_respond_msg` 流式 markdown 卡片

`reaction` / `reply` 旧命令在飞书 sidecar 内**保留**作为内部实现细节（Rust 不再直接发它们）。

### 27.4 Channel Capability struct

不同渠道能力差异较大，用一个 capability 表显式声明：

```rust
pub struct ChannelCapability {
    /// 是否支持给消息加表情反应（飞书独有）
    pub reactions: bool,
    /// 是否支持 thread 内回复（飞书独有，钉钉群无 threading，企微 P2P 无 thread 概念）
    pub thread_reply: bool,
    /// 是否支持接收图片消息
    pub receive_images: bool,
    /// 是否需要单独的"事件订阅"配置（飞书独有，钉钉/企微开箱即用）
    pub requires_event_config: bool,
}

impl ChannelId {
    pub fn capability(&self) -> ChannelCapability {
        match self {
            Self::Feishu => ChannelCapability {
                reactions: true,
                thread_reply: true,
                receive_images: true,
                requires_event_config: true,
            },
            Self::DingTalk => ChannelCapability {
                reactions: false,
                thread_reply: false,
                receive_images: true,
                requires_event_config: false,
            },
            Self::WeCom => ChannelCapability {
                reactions: false,
                thread_reply: false,
                receive_images: true,
                requires_event_config: false,
            },
        }
    }
}
```

UI 用 capability 决定要不要展示某些控件（如选择题里的"事件订阅引导"只对飞书显示）。

---

## 二十八、HistoryMessage schema 演进 + 数据迁移

### 28.1 新 schema

```rust
pub struct HistoryMessage {
    /// 全局唯一 ID：复合键 `{channel}:{source_message_id}`，例如 "feishu:om_xxx"
    pub id: String,
    /// 渠道
    pub channel: ChannelId,                          // ★ 新增
    /// 平台原始 message_id（给 sidecar 调 API 用）
    pub source_message_id: String,                   // ★ 新增
    pub received_at: u64,
    pub updated_at: u64,
    pub sender: String,
    pub text: String,
    pub image_path: Option<String>,
    pub status: MessageStatus,
    pub failure_reason: Option<String>,
    pub feedback_error: Option<FeedbackError>,
    /// 部分渠道（钉钉 / 企微）的状态反馈是通过"互动卡片 + 更新"实现的，
    /// 需要存住卡片 ID 用于后续状态更新
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feedback_card_id: Option<String>,            // ★ 新增
}
```

### 28.2 migration: 旧 history.json 兼容

v0.5 之前的 `history.json` 没有 `channel` / `source_message_id` 字段。读取时用 serde 默认值兼容：

```rust
#[serde(default = "default_feishu")]
pub channel: ChannelId,

#[serde(default)]
pub source_message_id: String,  // 空时从 id 字段推断
```

启动时一次性 scan history.json：

```rust
fn migrate_legacy_history(messages: &mut Vec<HistoryMessage>) {
    for m in messages {
        if m.source_message_id.is_empty() {
            // 旧记录：id 形如 "om_xxx"（飞书原生），整个搬到 source_message_id
            // 新 id = "feishu:om_xxx"
            m.source_message_id = m.id.clone();
            m.id = format!("feishu:{}", m.id);
        }
    }
}
```

迁移幂等：`source_message_id` 已有值时跳过；新启动若发现旧数据则原地改写并 flush 一次。

### 28.3 跨渠道 ID 冲突分析

理论上：飞书 message_id 形如 `om_xxx`，钉钉形如 `msgXXX`，企微形如 `XXXX`（具体格式 TBD）。命名空间天然不重叠，但 **HistoryStore 内部 HashMap 用复合 id 作为 key 保证绝对安全**。

### 28.4 Rust → Go 命令时还原

Rust 收到 UI 操作（"重发"等）时，从 HistoryMessage 拿 `id` 和 `channel`：
1. 用 `channel` 选对应 sidecar
2. 用 `source_message_id` 作为命令 payload 中的 `message_id`
3. 不直接传复合 id 给 sidecar——sidecar 不应该感知复合格式

---

## 二十九、Channel 反馈机制抽象（feedback flow）

### 29.1 三个渠道的反馈差异

| 阶段 | 飞书 | 钉钉 | 企微 |
|------|------|------|------|
| 收到（received）| reaction EYES | 发互动卡片"🟡 处理中"（**保存 card_id**）| 发流式 markdown 卡片"🟡 处理中" |
| 成功（sent）| 删 EYES + 加 DONE | `StreamingUpdate` 卡片为"✅ 已输入" | 流式更新卡片为"✅ 已输入" |
| 失败（failed）| 删 EYES + 加 CRY + thread reply | `StreamingUpdate` 卡片为"❌ 失败：原因" | 流式更新卡片为"❌ 失败：原因" |

### 29.2 抽象命令（Rust → 任一 sidecar）

```rust
pub enum SidecarCommand {
    Selftest,
    FeedbackReceived { message_id: String },
    FeedbackSent     { message_id: String },
    FeedbackFailed   { message_id: String, reason: String },
}
```

每个 sidecar 内部维护一个 `message_id → card_id` 的内存 map（仅钉钉 / 企微需要，飞书无）：

```go
// dingtalk-bridge / wecom-bridge 内部
var feedbackCards sync.Map  // message_id -> card_id

func handleFeedbackReceived(msgID string) {
    cardID := sendInteractiveCard("处理中...")
    feedbackCards.Store(msgID, cardID)
}

func handleFeedbackSent(msgID string) {
    cardID, _ := feedbackCards.Load(msgID)
    streamingUpdate(cardID, "✅ 已输入")
    feedbackCards.Delete(msgID)
}
```

### 29.3 Sidecar 重启时的 card_id 丢失

Sidecar 进程崩溃 / 重启会清空内存 map。这意味着：
- 之前发出去的"处理中"卡片**会卡在那个状态**——无法更新
- 用户视觉上看到"处理中"但实际消息可能已成功输入或失败

**取舍**：接受这个边缘情况。后续如有强需求可考虑在 HistoryMessage 上持久化 `feedback_card_id`，sidecar 启动时从历史里恢复 map。但这要求 sidecar 能读 history.json，违反"sidecar 只关心自己渠道事件"的设计原则。v1 不做持久化恢复；保留 `HistoryMessage.feedback_card_id` 字段作为未来 hook。

### 29.4 飞书的兼容性

飞书 sidecar 收到 `feedback_*` 命令时翻译为现有的 reaction + reply 调用，**外部 API 不变**——v0.5 的 reaction / reply 命令在飞书 sidecar 内部保留作为底层实现，但 Rust 不再直接发它们。
