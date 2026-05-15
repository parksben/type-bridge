# 技术架构 · UI 原型 · 权限 · 渠道清单（§三 · §四 · §五 · §五A）

---

## 三、技术架构

### 3.1 技术选型

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2.x（Rust + WebView） |
| 前端 UI | React + TypeScript + Tailwind CSS |
| 状态管理 | Zustand |
| 本地存储 | `tauri-plugin-store`（JSON 加密存储凭据） |
| 飞书 SDK | Go sidecar 调用飞书官方 SDK 的 HTTP API |
| 文字注入 | Rust FFI 调 macOS NSPasteboard + CGEventPost |
| 系统通知 | Tauri `notification` 插件（封装 `UNUserNotificationCenter`） |
| 日志 | `tracing` + `tracing-appender`（按天滚动） |

### 3.2 进程架构

```
┌─────────────────────────────────────────────────────────────┐
│  TypeBridge.app                                             │
│                                                             │
│  ┌──────────┐    ┌─────────────────────────────────────┐    │
│  │ WebView  │◄──►│  Tauri Core (Rust)                  │    │
│  │ (React)  │    │                                     │    │
│  └──────────┘    │  feishu-bridge (Go sidecar) ──stdout│    │
│                  │  dingtalk-bridge (Go sidecar) ─stdout│   │
│                  │  wecom-bridge (Go sidecar) ───stdout │    │
│                  │                                     │    │
│                  │  webchat_server (axum+socketioxide)  │    │
│                  │                                     │    │
│                  │  injector (NSPasteboard+CGEventPost) │    │
│                  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼ WebSocket (Go sidecar)       ▼ Socket.IO (LAN)
   飞书/钉钉/企微开放平台              同 WiFi 手机浏览器
```

### 3.3 关键 Rust 模块

```
src-tauri/src/
├── lib.rs            # 入口，注册 plugin / command / tray + window / AppContext
├── sidecar.rs        # 启动 Go 进程，解析 JSON Lines，派发事件，指数退避重连
├── webchat.rs        # WebChat session 生命周期管理
├── webchat_server.rs # axum HTTP server + socketioxide
├── webchat_net.rs    # LAN IP 枚举 + CoreWLAN FFI 获取 WiFi SSID
├── injector.rs       # NSPasteboard + CGEventPost 注入核心
├── tray.rs           # 托盘 icon，单击转发给 window::show_or_create_main_window
├── window.rs         # 主窗口生命周期：build / show / 拦截 close 改 hide
├── store.rs          # 凭据和设置持久化，config.json
└── logger.rs         # 文件日志按天滚动，保留 30 天
```

---

## 四、UI 原型描述

### 主窗口（820×560 px，左侧侧边栏 + 右侧内容区）

左侧 ~150px 侧边栏，**所有 tab 平铺在顶部**：

```
┌──────────────────────────────────────────────────────────────┐
│  TypeBridge                                                  │ <- 标题栏
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│  连接        │                                               │
│  TypeBridge  │                                               │
│              │   Tab 内容区（独立滚动）                       │
│  连接应用    │                                               │
│              │                                               │
│  输入设置    │                                               │
│              │                                               │
│  历史消息    │                                               │
│              │                                               │
│  系统日志    │                                               │
│              │                                               │
│  ────────    │                                               │
│              │                                               │
│  关于        │                                               │
│  TypeBridge  │                                               │
│              │                                               │
│  (语言切换)  │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

- active tab：3px accent 色左竖条 + `surface-2` 背景
- 侧边栏底部：关于 TypeBridge 入口 + 语言切换控件
- 「关于」页右下角同时显示语言切换（左）+ 主题切换（右），均为下拉菜单风格
- 主题切换支持三种模式：跟随系统 / 浅色 / 深色；偏好持久化到 localStorage（`tb_theme`）

#### Tab 1: 连接 TypeBridge（WebChat 专属页）

内容区只包含 WebChat 扫码配对面板，**无顶部渠道子 tab**：

- 顶部一句话说明横条：「扫码配对，手机变身桌面鼠标键盘」
- 面板内容：启动前显示提示 + "启动会话"按钮；启动后显示 QR + OTP + 倒计时进度条（详见 §2.10.6）

#### Tab 2: 连接应用（Link Chat Apps）—— IM 渠道页

面板自上而下：

**① 一句话说明**（顶部贯穿横条，**位于横向子 tab 上方**）：「给机器人发消息，自动写入桌面当前聚焦输入框」。

**② 横向子 tab**（飞书 | 钉钉 | 企微）：点击切换下方的渠道配置面板；active tab 用 2px accent 色下划线 + 文字加深。

**③ 渠道配置面板**（占据剩余高度，独立滚动）：
- 飞书：顶部「还没有自建应用？」引导 banner → App ID / App Secret 输入 → 启动长连接 + 测试连接 → scope 检查清单
- 钉钉：结构对齐，字段名改 Client ID / Secret
- 企微：v0.6 暂占位

```
│   ⓘ 还没有自建应用？先到 飞书开发者后台 ↗ 创建一个，
│      复制 App ID / Secret 到下方
│
│   APP ID
│   [ cli_xxxxxxxxxxxxxxxxx         ]
│
│   APP SECRET
│   [ ********                       ]
│
│   [ 启动长连接 ]   [ 测试连接 ]
│
│   ● 已连接
│
│   连接测试清单：
│   ✓ 凭据可用（App ID / App Secret 能换到 token）
│   ✓ 下载图片资源    im:message:readonly
│   ✓ 发表情反应      im:message.reactions:write_only
│   ✗ 回复消息        im:message:send_as_bot    [去授权]
│
│   ⓘ 飞书自建应用需完整开通以下 5 项权限（指南）：
│      • im:message                       获取与发送单聊、群组消息
│      • im:message.p2p_msg:readonly      读取用户发给机器人的单聊消息
│      • im:message:readonly              获取单聊、群组消息
│      • im:message.reactions:write_only  发送、删除消息表情回复
│      • im:message:send_as_bot           以应用的身份发消息
│   [去权限管理页 ↗]
│
│   ⓘ 接收消息事件 需在飞书后台「事件配置」中单独完成
│      ① 订阅方式：选择"使用长连接接收事件"并完成验证
│      ② 添加事件：搜索 im.message.receive_v1 并勾选提交
│   [去事件配置页 ↗]   [查看文档 ↗]
```

#### Tab 2: 输入设置

```
│   输入后自动提交                            [ ● ]
│   写入完成后模拟按下提交按键
│
│   提交按键                       [  ⌘ + Enter   ] ✎
│   点击录入，Escape 取消
```

#### Tab 3: 历史消息

```
│  [ 全部 ] [ WebChat ] [ 飞书 ] [ 钉钉 ] [ 企微 ]   [清空]
│  ─────────────────────────────────────────────
│  ┌─────────────────────────────────────────┐
│  │ @张三 · 刚刚                   [已发送]   │
│  │ 帮我写一个 React 按钮组件                  │
│  │                       [复制]  [删除]     │
│  └─────────────────────────────────────────┘
│  ┌─────────────────────────────────────────┐
│  │ @李四 · 2 分钟前              [失败]      │
│  │ 你好                                     │
│  │ ▸ 本地输入失败：辅助功能权限未授予         │ ← 橙色
│  │                       [复制]  [删除]     │
│  └─────────────────────────────────────────┘
```

#### Tab 4: 系统日志

```
│  系统日志                         [清空] [在访达中显示]
│  ──────────────────────────────────────────────
│  10:23:01 [飞书] 长连接已建立
│  10:23:45 [飞书] 收到消息 msg_abc123
│  10:23:45 [队列] 入队 msg_abc123
│  10:23:45 [注入] VSCode 输入成功
│  10:24:10 [webchat] Server started at http://192.168.1.5:8723
│  ...
```

### 设计要点

- **侧边栏**：~150px 固定宽度，lucide icon 标识，active tab 用 accent 色左边 3px 竖条 + `surface-2` 背景
- **消息卡片**：圆角 10px，`surface-2` 背景，失败卡片左侧有 2px accent 色竖条
- **状态 tag**：已入队 muted / 处理中 accent 带脉冲 / 已发送 success / 失败 error
- **失败原因分层**：本地输入失败（橙色小字）与飞书反馈被拒（红色 banner）可同时出现
- **空态**：Inbox 大图标 + "暂无消息记录" 提示

---

## 五、权限说明

| 权限 | 用途 | 申请时机 |
|------|------|---------|
| 辅助功能（Accessibility） | 模拟 `Cmd+V` / 自定义提交键等跨应用按键事件 | 启动即检查，未授权时全屏模态（AccessibilityGate）引导直接跳系统设置对应面板 |
| 网络（Outbound HTTP/WS） | 连接飞书开放平台、下载图片 | Tauri 默认允许 |

---

## 五A、各渠道接入清单

每个渠道接入时需要在对应平台后台完成的最小动作 + 所需权限。

### 五A.1 飞书

跑通完整消息链路（接收 → 入队 → 粘贴 → 表情反应 → 失败时 thread 回复）共调用 **4 组飞书 API**：

| 环节 | 触发 API / 事件 | 最小粒度 scope | 兼容"大包" scope |
|------|----------------|--------------|----------------|
| **1. 接收消息事件** | event `im.message.receive_v1`（WebSocket） | `im:message.p2p_msg` + `im:message.group_at_msg` | `im:message` |
| **2. 下载图片资源** | `Im.MessageResource.Get` | `im:message:readonly` | `im:message` |
| **3. 发表情反应** | `Im.MessageReaction.Create` | `im:message.reactions:write_only` | `im:message` |
| **4. 回复消息**（失败 thread 回复） | `Im.Message.Reply` | `im:message:send_as_bot` | `im:message` |

> "大包" `im:message` 单独勾一个就能覆盖 2/3/4 全部需求。

**重要说明：**
1. 接收消息事件（#1）必须在开发者后台「事件配置」完成：①选"使用长连接接收事件"；②搜索 `im.message.receive_v1` 并勾选提交。TypeBridge 只能 UI 引导
2. 应用不需要任何 `im:chat*` / `contact:*` / `application:*` 权限
3. 所有 scope 勾选后，必须在开发者后台**发布一次新版本**才会生效
4. 凭据本身能换到 `tenant_access_token` 是所有调用的前提

### 五A.2 钉钉

钉钉"机器人收消息"能力**不需要勾任何 scope**——创建"企业内部应用"+ 添加"机器人"能力 + 选择 Stream Mode 后开箱即用。

| 环节 | 操作 | 自动校验 |
|------|------|---------|
| **1. 创建应用** | "企业内部应用" → 复制 `Client ID` + `Client Secret` | selftest 中"凭据可用"项验证 |
| **2. 添加机器人能力** | 应用页 → 左侧"功能/机器人" → 添加 | 纯静态引导 |
| **3. 选择消息接收模式** | 机器人页 → "消息接收模式" → 选 **Stream 模式** | 纯静态引导 |

**钉钉的状态反馈策略**：钉钉没有 bot reaction API，靠 `sessionWebhook` 发回执文字。每条用户消息最多对应一条 bot 回执：注入成功 → `✅ 已输入`；注入失败 → `❌ 输入失败：<原因>`。

### 五A.3 企微

需要在企微管理后台完成：

| 环节 | 操作 | 自动校验 |
|------|------|---------|
| **1. 创建智能机器人** | "应用管理" → "智能机器人" → 创建 | UI 引导用户跳转 |
| **2. 切换 API 模式** | 智能机器人详情 → API 模式 → 选 **长连接** | 不可自动校验 |
| **3. 复制凭据** | 同页面复制 `Bot ID` + `Secret` | 通过实际 WSS 鉴权握手验证 |

**关键限制**：
- **每个机器人同时只能一条活动 WSS 连接**——新连接踢旧连接
- 切换为长连接模式后**回调 URL 失效**——两种模式互斥
