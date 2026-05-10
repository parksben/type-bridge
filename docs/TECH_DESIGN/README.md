# TypeBridge — 技术方案文档（入口）

> 记录**怎么做、为什么选这个方案**。各模块按关注点独立拆分。

---

## 模块索引

| 文件 | 内容 |
|------|------|
| [01-stack.md](./01-stack.md) | §一~§五 技术选型/完整技术栈/关键数据流/打包/已确认决策 |
| [02-core-impl.md](./02-core-impl.md) | §六图片注入 + §七设置持久化 + §九消息队列状态机 + §十飞书双向回复 + §十一消息历史 |
| [03-ui-tab.md](./03-ui-tab.md) | §八UI设计语言 + §十二UI Tab架构 + §十三events/commands清单 |
| [04-input-events.md](./04-input-events.md) | §十四输入后自动提交 + §十五v0.4增量 + §十六Sidecar心跳 |
| [05-selftest.md](./05-selftest.md) | §十七连接自检 + §二十三scope probe清单升级 |
| [06-error-handling.md](./06-error-handling.md) | §十八Accessibility权限修复 + §十九Go→Rust错误事件 + §二十失败分层展示 |
| [07-input-strategy.md](./07-input-strategy.md) | §二十一输入策略（剪贴板+Cmd+V）+ §二十二Accessibility引导启动模态 |
| [08-cicd.md](./08-cicd.md) | §二十四CI/CD发布流水线 |
| [09-website.md](./09-website.md) | §二十五产品官网技术方案 |
| [10-multichannel-arch.md](./10-multichannel-arch.md) | §二十六~§二十九 多渠道架构/Channel抽象/HistoryMessage schema/反馈机制 |
| [11-channel-impl.md](./11-channel-impl.md) | §三十~§三十四 钉钉/企微/UI多渠道/设置schema/落地阶段 |
| [12-webchat.md](./12-webchat.md) | §三十五 WebChat渠道（本地局域网+Socket.IO）完整内容 |
| [13-i18n.md](./13-i18n.md) | §三十六桌面端i18n + WKWebView确认弹窗约定 + §三十八WebChat SPA i18n |

---

## 文档约定

- **TECH_DESIGN** 记"怎么做、为什么选这个方案"——技术实现细节与设计决策
- 产品需求与用户可见行为见 `docs/REQUIREMENTS/README.md`
- 改动影响用户可见行为 → 两份文档都更新；仅影响内部实现 → 只更 TECH_DESIGN

---

## 最近更新（2026-05-11）

- 博客截图技术方案增强：采用自动化截图脚本批量采集手机端多状态画面（打字文本/图片/图文、触控板主界面/设置、快捷键三分组）。
- 双语截图策略：通过 `lang=zh|en` 参数分别生成中文与英文版本截图，确保文章语言与界面语言一致。
- 排版实现约定：博客正文使用单行多图布局展示同一模式下的状态对比，减少读者滚动成本。
