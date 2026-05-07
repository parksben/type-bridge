# §十八~§二十 Accessibility权限修复、Go→Rust错误事件、失败分层展示

> **模块归属**：错误处理与诊断体验

---

## 十八、Accessibility 权限与崩溃修复（v0.4.2）

### 18.1 背景

v0.4.1 出现过一次崩溃：Go sidecar 首次成功派发消息入队后，队列 worker 调
`AXUIElementCopyAttributeValue` 前应用进程直接退出，macOS 弹出系统设置的
「辅助功能」面板。

### 18.2 两个 root cause

#### (1) FFI 类型错误：把 `CFStringRef` 误声明为 `*const c_char`

原始绑定：

```rust
// 错误：把 CFStringRef 写成 c_char*
fn AXUIElementCopyAttributeValue(
    element: *mut std::ffi::c_void,
    attribute: *const std::ffi::c_char,   // ❌
    value: *mut *mut std::ffi::c_void,
) -> i32;
```

Apple 原型：

```c
AXError AXUIElementCopyAttributeValue(
    AXUIElementRef element,
    CFStringRef attribute,          // 不透明对象指针，不是 C 字符串
    CFTypeRef _Nullable *value);
```

调用时传 `b"AXFocusedUIElement\0".as_ptr()`——这是一段 ASCII 字节的地址，
macOS 侧把它当作 `CFStringRef`（对象起始地址）读取对象头字段，在权限未授予时 AX API 会提前返回，但在**权限授予即将生效 / 半生效状态**下，API 会进入真正的解引用路径，读取非法内存段，进程 SIGSEGV。

**修复**：改用 `core_foundation::string::CFString` 构造真正的 CFString，
把 `as_concrete_TypeRef()` 作为 opaque 指针传入。

#### (2) 权限检查被动且副作用滥用

原始 `get_focused_element()` 逻辑：

```rust
if !check_accessibility() {
    request_accessibility_with_prompt(); // 打开系统设置！
    return None;
}
```

问题：
- 只有注入时才检查 → 启动期间用户完全不知道权限状态
- 每条消息未授权都会打开一次系统设置 → 用户已经在系统设置里给权限时，新消息又把窗口顶上来（焦点抢夺）
- 系统设置被反复调起本身不会崩，但和 (1) 的 FFI 崩溃叠加后定位变难

**修复**：
- `get_focused_element` 去掉对 `request_accessibility_with_prompt` 的副作用调用，只返回 `None`
- 启动期间在 `lib.rs::setup` 里 `check_accessibility()` 一次，未授予时 emit 事件告诉前端
- 新增独立 command `request_accessibility` 供 UI banner 按钮显式调用
- 队列 worker 注入前多一次 `check_accessibility()` 短路检查，拒绝的同时 fail() 标记消息为 Failed

### 18.3 权限状态事件契约

| 事件 | 方向 | 载荷 | 时机 |
|------|------|------|------|
| `typebridge://accessibility` | Rust → React | `{granted: bool}` | setup 时首次 emit；前端也可通过 `check_accessibility` command 主动拉 |

前端每 3s 通过 `check_accessibility` command 轮询；状态变为 `granted:true` 时停止轮询。

### 18.4 UI 反馈

ConnectionTab 顶部：未授权时显示黄色 banner——图标 + 文字 + "打开系统设置" 按钮，点击调 `request_accessibility`。banner 在 `granted:true` 时自动消失。

> **v0.5 已升级为启动模态**：banner 被 AccessibilityGate 模态替代，详见 §二十二（[07-input-strategy.md](./07-input-strategy.md)）。本节保留以说明 v0.4.2 时的历史形态。

---

## 十九、Go → Rust 结构化回调错误事件

### 19.1 背景

Go sidecar 此前把 reaction / reply 调用失败统一以 `emitError("reaction on X failed: ...")` 打成一条非结构化 `error` 事件。Rust 侧 dispatch 到 `SidecarEvent::Error { msg }` 时只做了两件事：

1. `tracing::error!` 写日志
2. `emit feishu://status {connected: false}` ← **错误做法**：一个单次 API 调用失败不等于长连接断开

症状：某条消息回复失败（常见原因：`im:message:send` scope 未开通），系统日志变成"断开"；用户反复"连上又断开"，体验极差。

### 19.2 新事件协议

Go 新增 `feedback_error` 事件类型：

```json
{
  "type": "feedback_error",
  "message_id": "om_xxx",
  "kind": "reply",                // "reaction" | "reply"
  "code": 99991672,
  "msg": "Access denied. One of the following scopes is required: [im:message:send, ...]. 点击链接申请...: https://open.feishu.cn/app/cli_xxx/auth?q=..."
}
```

Go 侧新增 `emitFeedbackError(msgID, kind, code, msg)` helper，`addReaction` / `replyInThread` 失败分支调用它替代旧 `emitError`。

### 19.3 Rust 侧：落到 HistoryMessage

`HistoryMessage` 增加：

```rust
pub struct HistoryMessage {
    /* existing */
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feedback_error: Option<FeedbackError>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FeedbackError {
    pub kind: String,     // "reaction" | "reply"
    pub code: i64,
    pub msg: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub help_url: Option<String>,
}
```

`help_url` 由 Rust 在收到 `feedback_error` 时从 `msg` 里用正则提取，找不到就是 `None`。

dispatcher 收到 `feedback_error` 时：
1. `history.attach_feedback_error(message_id, feedback)` 把错误写到对应消息
2. emit `feishu://history-update`，前端刷新
3. **不**动 `feishu://status`

### 19.4 修复 Error 分支

旧分支不再广播连接状态（连接状态由 `status` 事件独占）：

```rust
SidecarEvent::Error { msg } => {
    tracing::error!("[feishu] {}", msg);
    // 不再 emit feishu://status
}
```

### 19.5 前端展示

`HistoryCard` 若 `message.feedback_error` 存在，卡片正文下方插入一块：

- 红色背景（`--error-soft`）+ 1px `--error` 边
- 标题："机器人回复被拒" / "机器人表情被拒"（按 kind 映射）
- 原始 msg，font-mono
- `help_url` 有的话，末尾"去开通权限 ↗"按钮，点击调 `openUrl`

此展示独立于 status 的 `已发送 / 失败` tag——消息可能**已发送**，仅双向反馈失败。

---

## 二十、两类失败的分层展示

### 20.1 为什么需要分层

`HistoryMessage` 上同时存在 `failure_reason` 和 `feedback_error` 两个字段，它们代表**完全不同层级**的失败：

| 字段 | 层级 | 典型场景 | 处理方 |
|------|------|---------|-------|
| `failure_reason` | 本地（macOS） | 无焦点输入框 / 辅助功能权限未授予 | 注入 worker 写入 |
| `feedback_error` | 飞书 API（上行） | scope 不足 / emoji_type 非法 / 频控 | Go sidecar 的 reaction/reply 调用失败后回传 |

工作流中**两者可以同时非空**：
1. 消息到达 → 注入 worker 尝试 `AXUIElement::get_focused_element`，失败（无焦点）
2. `fail()` 分支被触发：set `status=Failed` + `failure_reason="无焦点输入框"`
3. `fail()` 接着发 CRY 反应 + thread reply "❌ 输入失败：无焦点输入框" 给飞书
4. 飞书那边因 scope 不足拒了 reply，emit `feedback_error(code=99991672,...)`
5. Rust 把 feedback_error 写进同一条 HistoryMessage

所以卡片上必须**同时、但分开**展示两种错误，不能让用户误以为它们是同一件事的两种描述。

### 20.2 UI 文案

原先卡片上只有一行 "原因：无焦点输入框"，与下方红色 banner 并列，层级不清。v0.4.3 改为：

- **本地注入失败**：橙色图标 + "本地注入失败：无焦点输入框"（紧贴正文下方）
- **飞书反馈被拒**：红色 banner + "机器人回复被拒 code=99991672 ..."（放在注入失败下方）

两段之间留 `gap-2`，让层次清楚。

### 20.3 emoji_type 更换记录

v0.3 猜测的值 `EYES / DONE / CRY` 里触发过 `code=231001 reaction type is invalid`。我第一次诊断方向错了——以为 DONE / CRY 无效就把它们改成 OK / SAD；实际经用户验证后，真正**不在飞书枚举**里的是 `EYES`。按用户提供的验证过的值最终定为：

- `REACT_RECEIVED = "Get"`（"已收到" 语义，替换原 EYES）
- `REACT_SENT = "DONE"`（✅ 恢复为 DONE，之前误改为 OK）
- `REACT_FAILED = "CRY"`（😢 恢复为 CRY，之前误改为 SAD）

> **⚠ 大小写敏感**：`Get` 必须是首字母大写 + 后两位小写这种**混合大小写**形式；全大写 `GET` 或全小写 `get` 都会被飞书返回 `code=231001 reaction type is invalid`。看似不符合其它枚举（DONE / CRY 都是全大写）的命名惯例，但飞书侧就是按 `Get` 录的——不要"归一化"它。另外两个 `DONE` / `CRY` 维持全大写。

集中在 [`queue.rs`](../../src-tauri/src/queue.rs) 顶部常量，后续再有 231001 只需单点修改。常用候选集（供未来扩展或兜底）：`Get / DONE / CRY`。

### 20.4 "注入"与"输入"的文案统一

此前代码和文档里混用了 **"注入"**（技术描述，来自 CGEventPost 注入系统事件）与 **"输入"**（用户友好描述，消息进到输入框）两个词。用户反馈："注入"对非技术用户不友好。

统一规则：
- **UI 可见文本**（React 组件的 JSX 文案、Rust 产生的 thread reply text、log 里发送到前端的描述）→ 全部用"输入"
- **源码注释、Rust 内部日志、变量/函数名、TECH_DESIGN 技术章节** → 保留"注入"表述，精确表达它是 macOS 事件模拟
