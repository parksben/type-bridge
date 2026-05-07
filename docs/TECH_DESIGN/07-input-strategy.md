# §二十一~§二十二 输入策略重大变更、Accessibility引导启动模态

> **模块归属**：输入注入策略演进与权限引导体验

---

## 二十一、输入策略重大变更：AX 逐字符 → 剪贴板 + Cmd+V

### 21.1 问题

v0.4 以前 `inject_text` 流程：
1. `AXUIElementCopyAttributeValue(system, AXFocusedUIElement)` 拿焦点
2. 读 `AXRole` 校验白名单
3. `CGEventKeyboardSetUnicodeString` + `CGEventPost` 逐字符发事件

在 Electron 类应用（VSCode / Slack / Discord / Figma 等）上第 1 步直接返回 `AXError=-25212 NoValue`——这些应用的 webview 内容没通过标准 AX 接口暴露出焦点。结果：TypeBridge 对所有 Electron 应用都判"无焦点"，消息无法输入。

### 21.2 新策略

**统一走 NSPasteboard + Cmd+V**，文本和图片用同一条路径：
1. 确认辅助功能权限（`AXIsProcessTrusted`）——`CGEventPost` 仍需它
2. 校验前台应用不是 TypeBridge 自己（`NSWorkspace.frontmostApplication.bundleIdentifier`）
3. 文本 → `NSPasteboard.setString_forType(..., NSPasteboardTypeString)`；图片 → `NSPasteboardTypePNG`
4. `CGEventPost` 模拟 `Cmd+V`
5. 若开启了"输入后自动提交"，继续模拟提交按键

不再需要 AXUIElement / AXRole 白名单 / 逐字符输入。

### 21.3 兼容性改进

| 应用类型 | 旧策略 (AX + CGEventPost) | 新策略 (剪贴板 + Cmd+V) |
|---------|-------------------------|----------------------|
| 原生 NSTextField / NSTextView | ✓ | ✓ |
| 浏览器 `<input>` / `<textarea>` | ✓ | ✓ |
| VSCode Monaco 编辑器 | ✗ AXError -25212 | ✓ |
| Slack / Discord 输入框 | ✗ 同上 | ✓ |
| Figma / Linear 富文本框 | ✗ 同上 | ✓ |
| iTerm2 终端 | 部分 | ✓ |

### 21.4 自我保护：前台应用 bundle ID 检查

旧方案依赖 AXRole 白名单判断"焦点是否在可输入元素"，间接防止字符打回 TypeBridge 自己。新方案没 AX，改用更可靠的 **前台应用 bundle ID 检查**：

```rust
fn is_frontmost_self() -> bool {
    let ws = NSWorkspace::sharedWorkspace();
    ws.frontmostApplication()
        .and_then(|app| app.bundleIdentifier())
        .map(|bid| bid.to_string() == "com.typebridge.app")
        .unwrap_or(false)
}
```

前台是我们自己时直接 Err("当前前台是 TypeBridge 自己，请先切换到目标应用")。这比 AXRole 白名单可靠——不依赖目标应用的 AX 树质量。

### 21.5 剪贴板副作用

粘贴完成后剪贴板保留消息内容，不回写旧值。理由：
- 粘贴是异步的，回写时机不好把握（早了覆盖未完成的粘贴，晚了用户可能已经手动操作剪贴板）
- 用户想再粘一次同内容直接 Cmd+V 更方便
- 实现简单

原剪贴板丢失是用户使用此功能时的自然代价，REQ 已明示。

### 21.5.1 粘贴完成到提交按键之间的 settle delay

自动提交（默认 Enter）紧跟在粘贴之后。若 `simulate_cmd_v()` 返回立即调 `simulate_submit()`，目标应用（尤其 VSCode Monaco / Slack / Figma 这类基于 React 或合成事件的 app）还没处理完粘贴事件流，就被 Enter 打断——表现为 Enter 被**延迟到下一次事件循环**才生效。用户观察："我每次输入完后当前消息没提交，下一条消息来时上一条才被提交"，正是因为前一条的 Enter 排到了后一条粘贴之后才触发。

修复：`inject_text` / `inject_image` 在 `simulate_cmd_v()` 成功返回后，主动 sleep **150ms**，让前台应用有时间把粘贴事件流消化完，再让调用方继续做后续按键（如 Enter）。150ms 凭经验选择，覆盖绝大部分 Electron / React 合成事件应用；再往上拖会让整体"从消息到达到输入完成"的响应肉眼可感。

### 21.6 injector.rs 模块变化

- 保留 `check_accessibility` / `request_accessibility`（权限检查入口未变）
- 新增 `is_frontmost_self` 使用 `objc2_app_kit::NSWorkspace` 查前台应用
- 重写 `inject_text`：不再逐字符 CGEventPost；改为 NSPasteboard 写 + `simulate_cmd_v`
- `inject_image` 原本就用剪贴板 + Cmd+V，无需改动
- `simulate_submit`（自动提交按键）无需改动
- **删除**不再使用的 AX 焦点查询代码：`get_focused_element` / `FocusedElement` / `ax_error_name` / `ax_error_hint` / 对应 AXUIElement FFI 声明 / `core_foundation::CFString` 导入。这些代码在策略切换后没有任何 caller，保留只会让新读代码的人以为焦点还是基于 AX 判定的，造成认知干扰，整体移除更清爽

### 21.7 为什么仍需辅助功能权限

改用剪贴板 + Cmd+V 后容易让人误以为可以丢弃辅助功能权限。实际上：

| API 调用 | 是否需辅助功能权限 |
|---------|----------------|
| `NSPasteboard.setString/setData` | 不需要——剪贴板本身开放 |
| `AXIsProcessTrusted`（查询） | 不需要——仅读取当前授权状态 |
| `AXUIElementCopyAttributeValue` 等 AX 查询 | 需要，但我们已不用 |
| **`CGEventPost`（`Cmd+V` / 提交按键模拟）** | **需要**——macOS TCC 对跨应用发按键事件受"辅助功能"管控 |

因此权限入口（`check_accessibility`、启动即查、权限 gate UI、3s 轮询、`request_accessibility` 打开系统设置）必须保留。仅仅"用途描述"从"查焦点 + 注入事件"缩窄为"粘贴触发的按键事件"。gate 文案保持"消息将无法注入"仍然准确。

---

## 二十二、辅助功能权限引导：启动模态化（v0.5）

### 22.1 问题

v0.4.2 把未授权反馈放在 ConnectionTab 顶部一条黄色 banner 里。实际使用中暴露两个问题：

1. **首次启动隐蔽**：用户如果没先切到"连接"tab 就开始让机器人发消息，banner 根本看不到；消息全部失败，看不到原因
2. **路径冗长**：用户点 banner 上的"打开系统设置"后，只是到了辅助功能面板——还得在一个长列表里手动找到 TypeBridge，体感步骤多

用户的表达："比让用户在系统辅助功能设置页（还得从应用列表中先找到当前应用）操作能简单些"。

### 22.2 macOS 能力边界（前置约束）

辅助功能权限属于 macOS **敏感特权**，TCC 强制要求用户在系统设置里手动勾选。

**没有任何公开 API 能让应用自己给自己授权**，也没有任何 API 能弹一个"同意即开"的系统确认框：

| 诉求 | 可行性 |
|------|--------|
| 应用自己给自己开 | ✗ 完全不可能 |
| 弹系统级"同意即开"的确认框 | ✗ 不存在这种 API |
| `AXIsProcessTrustedWithOptions(prompt=true)` 弹窗 | ✓ 但它只是一个"前往系统设置"的提示，本质仍要求用户去设置里勾选 |
| 深链直达辅助功能面板 | ✓ `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility` |
| 应用出现在辅助功能列表里（免得用户点"+"） | ✓ 调过一次 `AXIsProcessTrusted` 即自动登记 |

因此 v0.5 能做的简化只有两项：**① 让未授权状态不可忽视**（从 banner 升级为启动模态）；**② 确保用户到了设置页就能看见 TypeBridge**（启动时已经调过 check 自动登记），从而真正减少一次"点 +，找到 TypeBridge"的步骤。

### 22.3 设计方案：AccessibilityGate 启动模态

新增 `src/components/AccessibilityGate.tsx`，挂在 `App.tsx` 根层，**位于 `MainWindow` 之上**。逻辑：

```
启动 → check_accessibility
  ├── granted=true  → 不渲染 gate，MainWindow 正常使用
  └── granted=false → 渲染全屏 overlay 模态，覆盖 MainWindow
                        │
                        │  3s 轮询 check_accessibility
                        │  + listen typebridge://accessibility
                        │
                        ├── 依然 false → 模态保持
                        └── 变为 true  → 模态自动消失（CSS 淡出）
```

### 22.4 关键取舍

- **blocking 而非 dismissible**：未授权时注入必然失败，"允许跳过"只会让用户更困惑。模态无关闭按钮，未授权就是用不了——这是现实的忠实表达
- **纯应用内模态，不触发原生 AX 弹窗**：`AXIsProcessTrustedWithOptions(prompt=true)` 会叠一层 macOS 原生"X wants to control this computer..."对话框，反而让用户多点一次。直接深链到设置页最干净
- **启动时已自动登记**：`lib.rs::setup` 调了 `check_accessibility()`（即 `AXIsProcessTrusted`），这一次调用足以把 TypeBridge 加到辅助功能列表里。用户点完"前往授权"到达设置页时，TypeBridge 必定已在列表中
- **不替换 queue.rs 的 pre-injection 检查**：worker 里的 `check_accessibility()` 短路仍保留——即使 gate 路径漏了（比如权限中途被吊销），消息也不会盲注入崩溃

### 22.5 模态视觉

- 覆盖层：`position: fixed; inset: 0` + 半透明暗色背景（`rgba(0,0,0,0.6)`）模糊 MainWindow
- 卡片居中：圆角 14px，`surface` 背景，1px `border`，min-width 440px
- 顶部 lucide `ShieldAlert` 图标（24px accent 色）+ 标题"需要授予辅助功能权限"
- 正文说明两行：
  1. "TypeBridge 需要此权限才能把飞书消息粘贴到你的当前输入框。"
  2. "点击下方按钮将直接打开系统设置页，TypeBridge 已在列表中——只需勾上开关即可。"
- 主按钮：`前往授权` + 外链 icon（lucide `ExternalLink`），accent 实色；按钮下方一行小字"授权后本窗口会自动感知，不需要手动刷新"
- 不再展示"我已授权/刷新/稍后"等二级选项，减少决策负担

### 22.6 删除 AccessibilityBanner

`src/components/AccessibilityBanner.tsx` 和它在 `ConnectionTab.tsx` 里的引用整体移除——gate 模态已完全接管"未授权反馈"这个角色，保留 banner 会造成信息冗余且层次混乱（同一状态两个提示点）。

### 22.7 为什么不放两处（gate + banner）

考虑过"启动时用模态 + 之后保留 banner 防止用户关模态没看见"。最终否掉：

- 模态 blocking 且授权后自动消失——不存在"关闭了就看不见"的场景
- 保留 banner 反而引入两处要同步维护的 UI，未来改文案/交互会很容易漏一处
- 单一真相源（single source of truth）原则——权限状态只在 gate 组件里呈现
