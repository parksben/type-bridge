# §十七、§二十三 连接自检与 scope probe 清单

> **模块归属**：飞书连接自检功能。§二十三是 §十七 的升级版（v0.5）

---

## 十七、连接自检（selftest）

### 17.1 目标

"启动长连接"按钮负责建立 WebSocket 下行通道，但飞书自建应用有一个额外步骤：**需要在开发者后台 → 事件订阅里完成"长连接验证"**，否则机器人虽然上线但不会被推送消息。

"测试连接"按钮用来在这个步骤之后快速验证：
1. 凭据有效（能换到 `tenant_access_token`）
2. 网络到飞书开放平台可达
3. 应用权限范围包含 IM 读 API

一次通过的 selftest ≈ "下行 WebSocket + 上行 HTTP API 都就绪"，用户可以放心开始让机器人收消息。

### 17.2 协议

Rust → Go stdin 新增命令：

```json
{"cmd":"selftest"}
```

Go → Rust stdout 新增事件类型：

```json
{"type":"selftest_result","ok":true}
{"type":"selftest_result","ok":false,"reason":"tenant_access_token: code=10003 msg=..."}
```

### 17.3 Go 侧实现

用 `client.Im.Chat.List` 作为 ping 目标：

```go
case "selftest":
    go handleSelftest(ctx, client)

func handleSelftest(ctx context.Context, client *lark.Client) {
    req := larkim.NewListChatReqBuilder().PageSize(1).Build()
    resp, err := client.Im.Chat.List(ctx, req)
    ok, reason := true, ""
    if err != nil {
        ok, reason = false, fmt.Sprintf("网络请求失败: %v", err)
    } else if !resp.Success() {
        ok, reason = false, fmt.Sprintf("API 错误 code=%d msg=%s", resp.Code, resp.Msg)
    }
    b, _ := json.Marshal(map[string]interface{}{
        "type": "selftest_result", "ok": ok, "reason": reason,
    })
    fmt.Println(string(b))
}
```

**为什么用 `Im.Chat.List`**：
- 覆盖自建应用常见权限范围（`im:chat`），大部分接入飞书的 bot 都具备
- 即使 bot 在 0 个群里，`resp.Success()` 依然返回 true（data.items 是空数组）
- 失败时 `resp.Code` / `resp.Msg` 能清晰区分权限不足 / token 无效 / 网络错误

### 17.4 Rust 侧：同步 selftest command

用 oneshot 把异步的 stdout 回执转成同步 `Result`：

```rust
pub struct AppContext {
    // ... 已有字段
    pub pending_selftest: Arc<TokioMutex<Option<oneshot::Sender<SelftestResult>>>>,
}

#[tauri::command]
pub async fn run_selftest(app: AppHandle) -> Result<SelftestResult, String> {
    let ctx = app.state::<Arc<AppContext>>();
    let (tx, rx) = oneshot::channel();
    *ctx.pending_selftest.lock().await = Some(tx);

    ctx.bridge.send(&SidecarCommand::Selftest);

    tokio::time::timeout(Duration::from_secs(10), rx)
        .await
        .map_err(|_| "selftest 超时（10s），请检查网络与 sidecar 状态".into())?
        .map_err(|_| "selftest 通道被释放".into())
}
```

stdout 派发器收到 `SidecarEvent::SelftestResult` → take sender → send result。

### 17.5 前端：表单校验 + 双按钮

`ConnectionTab` 关键逻辑：

```tsx
function validate(): FieldErrors {
  const errs: FieldErrors = {};
  if (!appId.trim()) errs.appId = "App ID 不能为空";
  else if (!appId.trim().startsWith("cli_")) errs.appId = "App ID 应以 cli_ 开头";
  if (!appSecret.trim()) errs.appSecret = "App Secret 不能为空";
  return errs;
}

async function handleStart() {
  const errs = validate();
  setFieldErrors(errs);
  if (Object.keys(errs).length) return;
  await invoke("start_feishu", { appId, appSecret });
}

async function handleSelftest() {
  setSelftesting(true);
  try {
    const res = await invoke<SelftestResult>("run_selftest");
    setSelftestResult(res);
  } catch (e) {
    setSelftestResult({ ok: false, reason: String(e) });
  } finally {
    setSelftesting(false);
  }
}
```

失败 reason → 前端附加一段诊断建议：
- 含 "code=99991663" 或 "invalid app_id" → 建议检查 App ID
- 含 "invalid app_secret" → 建议检查 App Secret
- 含 "permission" / "scope" → 建议去开发者后台勾选 im:chat 权限并发布版本
- 网络相关 → 建议检查网络与代理
- 其他 → 通用建议"请去开发者后台确认长连接验证状态"

---

## 二十三、连接测试升级：scope probe 清单（v0.5）

### 23.1 问题

v0.4 的"测试连接"只发一个 `Im.Chat.List` 请求，返回一句 `ok / reason`。两个缺陷：

1. **绑架无关 scope**：`Im.Chat.List` 需要 `im:chat:readonly`，而这个 scope 在消息链路里根本用不上——只是为了"找一个能 ping 的只读 API"而硬加的
2. **诊断太粗**：用户失败后只能看到一条错误 reason，不知道到底是哪个 API 的 scope 缺了；很多情况下要等真正收到消息才发现"噢原来 reaction 权限没开"

### 23.2 设计：并行 probe + 清单结果

把 selftest 从"一次 ping"改成"对消息链路上**真实需要**的每个 API 各发一次 probe"，返回一个 per-probe 数组。probe 的关键是**非破坏性**——用假的 `message_id` / `file_key` 触发业务错误，通过观察 code 区分"scope 不足" vs "参数不合法"。

**Probe 列表：**

| Probe ID | 所测 API | 假请求 | scope_hint（UI 展示） |
|----------|--------|-------|--------------------|
| `download_image` | `Im.MessageResource.Get` | `message_id=om_probe_xxx`, `file_key=img_probe_xxx`, `type=image` | `im:message:readonly` |
| `reaction` | `Im.MessageReaction.Create` | `message_id=om_probe_xxx`, `emoji_type=DONE` | `im:message.reactions:write_only` |
| `reply` | `Im.Message.Reply` | `message_id=om_probe_xxx`, `content={"text":"probe"}` | `im:message:send_as_bot` |

### 23.3 飞书错误码到 probe 结论的映射

| 飞书返回 | probe 结论 | 展示 |
|---------|-----------|------|
| `resp.Code == 0`（真的成功） | ok | ✓（用假 ID 成功极罕见，当成功处理即可） |
| `resp.Code == 99991672`（Access denied, scope 不足） | **fail**，从 `resp.Msg` 中抽出 `[scope1, scope2, ...]` | ✗，展示所需 scope + 深链 `help_url` |
| `resp.Code == 99991663`（invalid app_id） | **凭据级 fail** | 整清单 short-circuit：凭据错误，不再展示具体 probe |
| `resp.Code == 99991664`（invalid app_secret） | **凭据级 fail** | 同上 |
| 其他业务 code（`230000` 参数非法 / `230005` 消息不存在 etc.） | **ok**——说明请求已进到业务层，scope 充足 | ✓，probe 通过 |
| 网络错误（DNS / TLS / timeout） | **网络级 fail** | 整清单 short-circuit：网络错误 |

**关键判断：**`ok = (resp.Code != 99991672 && !is_credential_error && !is_network_error)`。用"只有 99991672 才判 scope 缺失"的白名单逻辑，避免误报——飞书的业务错误码空间很大，逐个穷举不现实，用"明确认定缺权限的 code 做黑名单"最稳。

### 23.4 凭据 / 网络错误 short-circuit

三个 probe 都会经历 `tenant_access_token` 换取阶段。如果任一 probe 返回 `99991663` / `99991664` 或网络错误，**其他 probe 也注定失败**，没必要展示三行一样的错误。Go 侧在 probe fan-in 后：

```go
if anyCredentialErr := findCredentialErr(results); anyCredentialErr != nil {
    emitSelftestResult(SelftestResult{
        CredentialsOk: false,
        CredentialsReason: anyCredentialErr,
        // Probes 故意留空，由 UI 展示"凭据错误"整块
    })
    return
}
if anyNetworkErr := findNetworkErr(results); anyNetworkErr != nil {
    emitSelftestResult(SelftestResult{
        CredentialsOk: false, // 网络问题归到凭据级别一起处理，UI 不必区分
        CredentialsReason: "网络不通: " + anyNetworkErr,
    })
    return
}
// 都 pass 凭据和网络，按 probe 展示结果
```

### 23.5 协议扩展

**Rust → Go 命令**不变（仍是 `{"cmd":"selftest"}`）。

**Go → Rust 事件**升级 `selftest_result` 的 payload：

```json
{
  "type": "selftest_result",
  "credentials_ok": true,
  "credentials_reason": "",
  "probes": [
    {
      "id": "download_image",
      "label": "下载图片资源",
      "scope_hint": "im:message:readonly",
      "ok": true,
      "code": 230005,
      "msg": "message not found",
      "scopes": [],
      "help_url": ""
    },
    {
      "id": "reply",
      "label": "回复消息",
      "scope_hint": "im:message:send_as_bot",
      "ok": false,
      "code": 99991672,
      "msg": "Access denied. One of the following scopes is required: [im:message:send_as_bot, im:message]. ...",
      "scopes": ["im:message:send_as_bot", "im:message"],
      "help_url": "https://open.feishu.cn/app/cli_xxx/auth?q=..."
    }
  ]
}
```

- `credentials_ok=false` 时 UI 展示凭据错误块，`probes` 数组可忽略
- `credentials_ok=true` 时逐条展示 probe 结果
- `help_url` 由 Go 侧用正则从 `msg` 中抽取；抽不到就留空，UI 点击"去授权"退化为固定深链 `https://open.feishu.cn/app/{app_id}/auth`

### 23.6 UI：SelftestChecklist 组件

`src/components/SelftestChecklist.tsx` 渲染一个清单卡片：

```
┌──────────────────────────────────────────────────────┐
│  凭据可用                                        ✓   │
├──────────────────────────────────────────────────────┤
│  下载图片资源                                    ✓   │
│  im:message:readonly                                 │
├──────────────────────────────────────────────────────┤
│  发表情反应                                      ✓   │
│  im:message.reactions:write_only                     │
├──────────────────────────────────────────────────────┤
│  回复消息                                        ✗   │
│  缺少 scope：im:message:send_as_bot / im:message     │
│  [去飞书开发者后台授权 ↗]                            │
├──────────────────────────────────────────────────────┤
│  ⓘ 飞书自建应用需完整开通以下 5 项权限                │
│     • im:message                       获取与发送单聊、群组消息    │
│     • im:message.p2p_msg:readonly      读取用户发给机器人的单聊消息 │
│     • im:message:readonly              获取单聊、群组消息          │
│     • im:message.reactions:write_only  发送、删除消息表情回复      │
│     • im:message:send_as_bot           以应用的身份发消息          │
│     [去权限管理页 ↗]                                              │
├──────────────────────────────────────────────────────┤
│  ⓘ 接收消息事件 需在飞书后台「事件配置」单独完成      │
│     ① 订阅方式选"使用长连接接收事件"并完成验证        │
│     ② 添加事件搜索 im.message.receive_v1 勾选提交     │
│     [去事件配置页 ↗]                                 │
└──────────────────────────────────────────────────────┘
```

- 清单卡片**替代**原来那一行绿色/橙色 banner
- 失败行的"去授权"按钮用 `openUrl`（tauri-plugin-opener）打开 probe 返回的 `help_url`；没有 `help_url` 时退化为 `https://open.feishu.cn/app/{app_id}/auth`
- 第二个 ⓘ 块是**静态完整 scope 清单**——前 3 项已被 API probe 动态校验，但 `im:message` / `im:message.p2p_msg:readonly` 是**事件订阅级 scope**（`im.message.receive_v1` 长连接的接收消息依赖），REST API probe 探测不到，必须在 UI 上完整罗列让用户对照后台勾选
- 最后一行（事件订阅引导）是**静态 info**——API probe 无法自动校验事件订阅的配置状态
- 主按钮直达**应用本身的**事件配置页 `https://open.feishu.cn/app/{app_id}/event` 和权限管理页 `https://open.feishu.cn/app/{app_id}/auth`，而不是公开文档页
- 两步 checklist 对应飞书"事件配置"页的实际 UI 顺序：先选订阅方式（长连接 vs HTTP）+ 完成验证，再添加具体事件并勾选提交

> **历史 issue（v0.2.2 修复）**：先前 UI 只透出 API probe 显式涉及的 3 个 scope，导致用户配置完后机器人能回复但收不到用户的私聊/群聊消息（缺 `im:message` / `im:message.p2p_msg:readonly`）。本次升级在 footer 增加 **5 项完整必备 scope 清单**作为静态对照，避免漏配。

### 23.7 为什么不单独做一个 probe 检查事件订阅

| 方案 | 结论 |
|------|------|
| 找 introspection API（如 `/event/v1/list-subscriptions`） | **不存在**——飞书没有公开"列出当前订阅事件"的独立 API |
| WebSocket 握手响应里抠事件列表 | **不暴露**——`larkws.Client.Start()` 握手只返回 status/auth_err_code，不带事件清单 |
| 用 `Application.Application.Get` 查 `event.subscribed_events` 字段 | **可行但代价不划算**——需要 `application:application:self_manage` scope（一个相对敏感的范围）。给 TypeBridge 这个"消息收发"语义的 bot 加这个 scope 越界；并且把"事件配置自查"换成了"self_manage scope 自查"，权限清单多一行反而让用户更晕 |
| 等待首条真实消息被动验证 | **脆弱**——用户不主动发消息就永远超时；超时也不能区分"未订阅" vs "无人发消息" |

最终选择"静态步骤清单 + 直达事件配置页深链"——表达诚实，无额外权限成本，用户操作路径最短。

### 23.8 Probe 的 dummy ID 选型

- 用前缀 `om_probe_typebridge_` + PID/时间戳后缀，保证 dummy ID 不会意外撞到真实消息
- `file_key` 用 `img_probe_typebridge_` 前缀
- 飞书 message_id 的真实前缀是 `om_` / `om_x_`；dummy ID 用合法前缀保证通过格式校验、直达 scope 检查路径

### 23.9 不修改点

- `SidecarCommand::Selftest` 枚举、`run_selftest` command 签名（前端调用方式）都保持兼容——变的只有返回结构
- 历史消息 / 队列 / 注入逻辑完全不涉及
- `feedback_error` 机制（消息级的反馈失败）保持原样——新增的 probe 结果只影响"测试连接"按钮的展示，不落地到 HistoryMessage
