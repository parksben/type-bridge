# TypeBridge — 需求文档（入口）

> 将飞书 / 钉钉 / 企微机器人消息实时注入你当前聚焦的输入框

记录 **做什么、为什么**。各模块按关注点独立拆分，点击链接直接跳转。

---

## 模块索引

| 文件 | 内容 |
|------|------|
| [01-product-features.md](./01-product-features.md) | §一 产品定位 + §二 2.1–2.8 核心功能需求（配置窗口 / 飞书长连接 / 消息输入 / 生命周期 / 主窗口 / 双向回复 / 队列 / 日志） |
| [02-multichannel.md](./02-multichannel.md) | §二 2.9 多渠道支持（钉钉 / 企微，渠道差异、接入要点、UI 约定） |
| [03-webchat.md](./03-webchat.md) | §二 2.10 WebChat 渠道（本地局域网网页机器人，OTP 安全模型、手机端 SPA） |
| [04-about.md](./04-about.md) | §二 2.11 关于 TypeBridge（sidebar about tab + 检查更新） |
| [05-arch-ui.md](./05-arch-ui.md) | §三 技术架构 + §四 UI 原型描述 + §五 权限说明 + §五A 各渠道接入清单 |
| [06-roadmap-cicd.md](./06-roadmap-cicd.md) | §六 后续扩展 + §七 开发里程碑 + §八 CI/CD 发布流水线 + §八A 桌面端 i18n |
| [07-website.md](./07-website.md) | §九 产品官网（单页落地页，设计、信息架构、下载机制、部署） |

---

## 文档约定

- REQUIREMENTS 记"做什么、为什么"——用户可见行为与产品决策
- 技术实现细节见 `docs/TECH_DESIGN/README.md`
- 改动影响用户可见行为 → 两份文档都更新；仅影响内部实现 → 只更 TECH_DESIGN


