# §十四~§十六 输入后自动提交、v0.4增量、Sidecar心跳

> **模块归属**：输入提交行为与 sidecar 连接稳定性

---

## 十四、输入后自动提交

### 14.1 数据模型

在 `Settings` 里新增两个字段（沿用 `tauri-plugin-store` 同一 `config.json`）：

```rust
pub struct Settings {
    /* existing */
    pub auto_submit: bool,         // default true
    pub submit_key: SubmitKey,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SubmitKey {
    pub key: String,   // JavaScript KeyboardEvent.code 字面值（如 "Enter" / "KeyA" / "Space"）
    pub cmd: bool,
    pub shift: bool,
    pub option: bool,
    pub ctrl: bool,
}
```

默认值：`auto_submit = true`，`submit_key = { key: "Enter", cmd/shift/option/ctrl = false }`。

**为什么用 `e.code` 而不是 `e.key`**：`e.code` 与键盘物理位置绑定，与布局无关；`e.key` 在不同布局下会变（比如 Dvorak 下 "KeyA" 键位产生的 e.key 可能是 "a" 或其他）。存储 `e.code` 让注入行为稳定。

### 14.2 AppContext 共享

扩展 `AppContext`：

```rust
pub struct AppContext {
    /* existing */
    pub submit_config: Arc<Mutex<SubmitConfig>>,
}

pub struct SubmitConfig {
    pub auto_submit: bool,
    pub submit_key: SubmitKey,
}
```

`save_settings` command 更新 store 的同时同步 `Arc<Mutex<SubmitConfig>>`，让 injection worker 即时感知。

### 14.3 按键模拟（Rust）

复用已有 `core_graphics::event::CGEvent`。新增 `injector::simulate_submit(key: &SubmitKey)`：

```rust
fn simulate_submit(sk: &SubmitKey) -> Result<(), String> {
    let keycode = ecode_to_macos_keycode(&sk.key)
        .ok_or_else(|| format!("unsupported key: {}", sk.key))?;
    let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)?;
    let mut flags = CGEventFlags::empty();
    if sk.cmd    { flags |= CGEventFlags::CGEventFlagCommand; }
    if sk.shift  { flags |= CGEventFlags::CGEventFlagShift; }
    if sk.option { flags |= CGEventFlags::CGEventFlagAlternate; }
    if sk.ctrl   { flags |= CGEventFlags::CGEventFlagControl; }

    let down = CGEvent::new_keyboard_event(source.clone(), keycode, true)?;
    down.set_flags(flags);
    down.post(CGEventTapLocation::HID);

    let up = CGEvent::new_keyboard_event(source, keycode, false)?;
    up.set_flags(flags);
    up.post(CGEventTapLocation::HID);
    Ok(())
}
```

`ecode_to_macos_keycode` 维护一张常用键映射表（Enter / Tab / Escape / Space / Backspace / Arrow* / Letter* / Digit* / F1..F12），不在表内的返回 `None` 并在 UI 捕捉时提示不支持。

### 14.4 调用时机

在 `queue.rs` worker 的成功分支（`Sent` 状态之后，send_reaction DONE 之前）：

```rust
if ctx_submit.auto_submit {
    tauri::async_runtime::spawn_blocking({
        let sk = ctx_submit.submit_key.clone();
        move || injector::simulate_submit(&sk)
    }).await.ok();
}
```

图片粘贴完也统一走一次提交（复用同一把钥匙）。

### 14.5 UI 按键捕捉组件

新增 `src/components/KeyBindInput.tsx`：

- 点击显示字段进入 capturing 状态
- `onKeyDown` 捕捉：忽略纯 modifier keys（Shift/Meta/Control/Alt 本身）；Escape 取消不保存
- 捕到主键 + 当前 modifier 状态后立即保存、退出 capturing
- 展示用 lucide `Command` / `ArrowBigUp` / `Option` / `ChevronUp`（Ctrl）icon 配合主键字符串

按键字符串展示映射：
- `Enter` → "Enter"
- `Space` → "Space"
- `Tab` → "Tab"
- `KeyX` → "X"（全大写单字母）
- `DigitN` → "N"
- `FN` → "FN"

---

## 十五、v0.4 commands / events 增量

### 新 commands（React → Rust）

| Command | 参数 | 作用 |
|---------|------|------|
| `get_settings` / `save_settings` | `Settings`（含新字段 `auto_submit`、`submit_key`） | 扩展既有 |

（本次不新增独立 event，自动提交的成功/失败依然合并到既有 `feishu://inject-result` 与 `feishu://message-status` 的 Sent/Failed 状态，简单统一。）

---

## 十六、Sidecar 连接状态心跳

### 16.1 问题

v0.3 起 Go sidecar 只在 `emitStatus(false)` 初始化 + 每条消息**处理完**后 `emitStatus(true)` 这两个时机输出连接状态。WebSocket 握手成功但在用户发出第一条消息前，Rust 和前端都收不到 `connected: true`，UI 永久卡"连接中"。

### 16.2 修复策略

把 `wsClient.Start(ctx)`（阻塞调用）放到 goroutine，主线程用 `select` 在一个短的"连接建立宽限窗口"（2 秒）之后无条件广播 `connected: true`：

```go
errCh := make(chan error, 1)
go func() { errCh <- wsClient.Start(ctx) }()

select {
case err := <-errCh:
    // 2 秒内就返回 = 启动失败
    emitStatus(false)
    if err != nil { emitError(...) }
    os.Exit(1)
case <-time.After(2 * time.Second):
    // 2 秒内未失败，视作连接已建立
    emitStatus(true)
}

// 继续阻塞等 ws 终止
if err := <-errCh; err != nil {
    emitStatus(false)
    emitError(...)
    os.Exit(1)
}
emitStatus(false)
```

### 16.3 取舍

- **为什么不用回调**：`larkws.Client` 未暴露 `OnConnected` / `OnHandshakeComplete` 回调，强行走反射或私有字段代价大
- **2 秒宽限的依据**：经验值，覆盖网络正常时 WebSocket 握手 + token 刷新 + 事件订阅绑定全过程；极端网络下可能早报"已连接"但稍后 Start 失败 → Rust 侧 `SidecarEvent::Error` 会修正状态，UI 通过 `feishu://status` 事件刷回"未连接"
- **误报容忍**：2 秒虚假"已连接"带来的用户体验成本远小于长期卡"连接中"的困扰

本修复不改变协议契约，`feishu://status` event 语义不变。
