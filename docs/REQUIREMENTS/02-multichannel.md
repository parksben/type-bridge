# 多渠道支持（§二 2.9）

---

## 2.9 多渠道支持（钉钉 / 企微）

TypeBridge v0.6 起支持**同时接入多个 IM 平台**的机器人，消息进入同一个注入队列。

### 接入目标

| 渠道 | 接入方式 | 需要的凭据 | 状态 |
|------|---------|-----------|------|
| **飞书** | WebSocket 长连接（自建应用） | App ID + App Secret | ✅ 已实现 |
| **钉钉** | Stream Mode（自建应用） | Client ID + Client Secret | ✅ 已实现 |
| **企业微信** | AI Bot 长连接 | Corp ID + App ID + App Secret | 🔧 P2 |

### 2.9.1 钉钉接入要点

- 使用钉钉开放平台 **Stream Mode**（长连接，不需要公网回调）
- SDK：`github.com/open-dingtalk/dingtalk-stream-sdk-go`
- 接收事件类型：`chat:receive_message`（群聊/单聊消息）
- 鉴权：`client_id` + `client_secret`（钉钉 stream 模式 OAuth 2.0 应用凭据）
- 断线自动重连：指数退避，最大间隔 60s

**消息类型支持：**

| 钉钉消息类型 | TypeBridge 处理方式 |
|-------------|-------------------|
| `text` | 直接注入文本 |
| `image` | 下载图片 → 注入 |
| `richText` | 提取文本部分注入，图片部分单独注入 |
| `file` | 暂不支持，写日志 `unsupported type: file` |
| `audio` | 暂不支持，写日志 `unsupported type: audio` |

**钉钉 vs 飞书差异：**
- 消息 ID 字段名不同：钉钉是 `message_id`，飞书是 `message_id`（相同）；但事件结构整体不同
- 钉钉没有"表情反应"API，成功反馈改用 **thread 回复一个 emoji**（`👀`/`✅`/`❌`）
- 钉钉图片下载需要先获取 `media_id` → 调 `/v1.0/robot/messageFiles/download` 下载

### 2.9.2 企微接入要点

- 使用企业微信 **AI Bot 长连接**（企微 2024 新能力，支持 WebSocket 接收消息）
- SDK：`github.com/EasyWeChat/go-wecom`（或直接调 HTTP API）
- 鉴权：`corpid` + `corpsecret`（企业自建应用 secret）
- 消息类型：`text` / `image`（基础消息），暂不支持文件/语音
- AI Bot 回调：通过 `aiagent.receive` 事件接收消息（企微 AI 应用）

**v0.6 时间节点：企微为 P2 占位。** 等企微 AI Bot 长连接 SDK 成熟后再落地。

### 2.9.3 渠道差异汇总

| 特性 | 飞书 | 钉钉 | 企微 |
|------|------|------|------|
| 长连接协议 | WebSocket（官方 SDK） | Stream Mode（官方 SDK） | WebSocket（AI Bot） |
| 表情反应 | 支持 | 不支持（改用 thread 回复） | 不支持（改用 thread 回复） |
| 图片下载 | `im.message_resource.get` | `/v1.0/robot/messageFiles/download` | `media.get` |
| 自动重连 | 指数退避 2s→60s | 指数退避 2s→60s | 指数退避 2s→60s |
| 消息 thread | 支持 | 支持（dingtalk thread） | 不支持（改用直发） |
| 凭据字段 | App ID + App Secret | Client ID + Client Secret | Corp ID + Agent ID + Corp Secret |

### 2.9.4 多渠道 UI 约定

- 侧边栏「连接 TypeBridge」tab 内，**横向子 tab** 列出各渠道（WebChat / 飞书 / 钉钉 / 企微）
- 子 tab 上方有一个全局状态条："n 个渠道已连接"，点击任意子 tab 展开对应配置
- 每个渠道子 tab 独立展示连接状态（绿点 = 已连接，红点 = 已断开，灰点 = 未配置）
- 历史消息 tab 顶部 chip 筛选可按渠道过滤
- 日志条目带 `[渠道]` 彩色前缀
- **渠道 icon**：各渠道用对应官方 logo（作为 SVG inline，不依赖网络），在侧边栏渠道 tag、历史消息卡片、日志前缀中复用

### 2.9.5 同时接入多渠道

- 多个渠道可**同时启动**，彼此独立运行（各自一个 Go sidecar 进程）
- 所有渠道的消息进入**同一个 FIFO 全局队列**，统一串行注入
- 每条消息带 `channel` 字段标识来源（`feishu` / `dingtalk` / `wecom` / `webchat`）
- 某个渠道断线不影响其他渠道继续工作
