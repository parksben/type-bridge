use crate::sidecar::AppContext;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Emitter, Manager, Wry};
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitKey {
    /// JavaScript KeyboardEvent.code 字面值（如 "Enter" / "KeyA" / "Space"）
    pub key: String,
    #[serde(default)]
    pub cmd: bool,
    #[serde(default)]
    pub shift: bool,
    #[serde(default)]
    pub option: bool,
    #[serde(default)]
    pub ctrl: bool,
}

impl Default for SubmitKey {
    fn default() -> Self {
        Self {
            key: "Enter".to_string(),
            cmd: false,
            shift: false,
            option: false,
            ctrl: false,
        }
    }
}

fn default_true() -> bool {
    true
}

/// 单条快捷输入条目（snippet）。trigger 只存裸 key（不含 `/` 或 `$` 前缀），
/// `/key` 与 `$key` 两种语法共用同一份 content。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    /// uuid v4，前端增删定位用。
    pub id: String,
    /// 触发词 key，匹配 `[A-Za-z0-9_]+`，不含前缀。
    pub trigger: String,
    /// 展开文本，可多行。
    pub content: String,
    /// 单条启用开关。
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub feishu_app_id: String,
    #[serde(default)]
    pub feishu_app_secret: String,
    /// 钉钉 Stream Mode 凭据（P1 接入）。Client ID 即钉钉开放平台的 AppKey。
    #[serde(default)]
    pub dingtalk_client_id: String,
    /// 钉钉 Client Secret 即 AppSecret。
    #[serde(default)]
    pub dingtalk_client_secret: String,
    /// 企微智能机器人长连接凭据（v0.6 P2.3 接入）。
    /// Bot ID 在企微管理后台智能机器人详情页获取，secret 是"长连接"模式
    /// 专用 key（与"设置接收消息回调地址"模式下的 Token/EncodingAESKey 不同）。
    #[serde(default)]
    pub wecom_bot_id: String,
    #[serde(default)]
    pub wecom_secret: String,
    /// 输入后自动提交。默认开启。
    #[serde(default = "default_true")]
    pub auto_submit: bool,
    /// 自动提交使用的按键。默认 Enter。
    #[serde(default)]
    pub submit_key: SubmitKey,
    /// UI 语言。空字符串表示「未选择」，前端首启时会弹语言选择卡片。
    /// 取值：`""` / `"zh"` / `"en"`。
    #[serde(default)]
    pub language: String,
    /// 快捷输入功能总开关。默认开启。
    #[serde(default = "default_true")]
    pub quick_input_enabled: bool,
    /// 快捷输入 key 匹配是否区分大小写。默认不区分。
    #[serde(default)]
    pub quick_input_case_sensitive: bool,
    /// 快捷输入条目列表。
    #[serde(default)]
    pub snippets: Vec<Snippet>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            feishu_app_id: String::new(),
            feishu_app_secret: String::new(),
            dingtalk_client_id: String::new(),
            dingtalk_client_secret: String::new(),
            wecom_bot_id: String::new(),
            wecom_secret: String::new(),
            auto_submit: true,
            submit_key: SubmitKey::default(),
            language: String::new(),
            quick_input_enabled: true,
            quick_input_case_sensitive: false,
            snippets: Vec::new(),
        }
    }
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle<Wry>) -> Settings {
    let store = app
        .store(STORE_PATH)
        .unwrap_or_else(|_| app.store(STORE_PATH).expect("failed to open store"));

    let submit_key = store
        .get("submit_key")
        .and_then(|v| serde_json::from_value::<SubmitKey>(v).ok())
        .unwrap_or_default();

    Settings {
        feishu_app_id: store
            .get("feishu_app_id")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        feishu_app_secret: store
            .get("feishu_app_secret")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        dingtalk_client_id: store
            .get("dingtalk_client_id")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        dingtalk_client_secret: store
            .get("dingtalk_client_secret")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        wecom_bot_id: store
            .get("wecom_bot_id")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        wecom_secret: store
            .get("wecom_secret")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        auto_submit: store
            .get("auto_submit")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        submit_key,
        language: store
            .get("language")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        quick_input_enabled: store
            .get("quick_input_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        quick_input_case_sensitive: store
            .get("quick_input_case_sensitive")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        snippets: store
            .get("snippets")
            .and_then(|v| serde_json::from_value::<Vec<Snippet>>(v).ok())
            .unwrap_or_default(),
    }
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle<Wry>, settings: Settings) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set("feishu_app_id", settings.feishu_app_id);
    store.set("feishu_app_secret", settings.feishu_app_secret);
    store.set("dingtalk_client_id", settings.dingtalk_client_id);
    store.set("dingtalk_client_secret", settings.dingtalk_client_secret);
    store.set("wecom_bot_id", settings.wecom_bot_id);
    store.set("wecom_secret", settings.wecom_secret);
    store.set("auto_submit", settings.auto_submit);
    store.set(
        "submit_key",
        serde_json::to_value(&settings.submit_key).map_err(|e| e.to_string())?,
    );
    store.set("language", settings.language.clone());
    store.set("quick_input_enabled", settings.quick_input_enabled);
    store.set(
        "quick_input_case_sensitive",
        settings.quick_input_case_sensitive,
    );
    store.set(
        "snippets",
        serde_json::to_value(&settings.snippets).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    if let Some(ctx) = app.try_state::<Arc<AppContext>>() {
        ctx.set_submit_config(settings.auto_submit, settings.submit_key);
        ctx.set_quick_input_config(
            settings.quick_input_enabled,
            settings.quick_input_case_sensitive,
            settings.snippets.clone(),
        );

        // 语言改了的话，正在跑的 WebChat 会话需要把 QR URL 里的 &lang= 同步刷新，
        // 否则手机扫到的还是旧 QR（embed 了切换前的语言）。snapshot 现在会读最新的
        // store，这里只需重新 emit 一次让前端重渲染二维码。
        let lang = if settings.language == "zh" || settings.language == "en" {
            Some(settings.language.as_str())
        } else {
            None
        };
        let snap = ctx.webchat.snapshot(lang);
        let _ = app.emit("typebridge://webchat-session-update", &snap);
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// WebChat v3 持久化 sessionId（独立于 Settings，因为这不是用户配置而是设备身份）
// ---------------------------------------------------------------------------
//
// v3 安全模型把"手机第一次扫码绑定后，下次重启 App / 重启 server 都还是同一个
// sessionId"作为核心契约。这样手机端 localStorage 缓存的 sessionId 在 visibility-
// change 重连时可以直接复用，不需要重新扫码。
//
// 持久化 key 与 Settings 平级，存在同一个 config.json 文件里，避免再开新 store。
// 重置时序：UI 显式点"重置 WebChat 绑定"按钮 → webchat::reset_webchat_binding
//          command → 调本文件的 reset_webchat_session_id → 下次 server 启动会
//          重新生成一个 fresh sessionId 并落盘。

const WEBCHAT_SESSION_ID_KEY: &str = "webchat_session_id";

/// 读取持久化的 webchat sessionId。
/// None 表示尚未生成（首次启动 / 用户刚显式重置过），调用方应生成新 id 然后 `set_webchat_session_id` 写回。
pub fn get_webchat_session_id(app: &tauri::AppHandle<Wry>) -> Option<String> {
    let store = app.store(STORE_PATH).ok()?;
    let v = store.get(WEBCHAT_SESSION_ID_KEY)?;
    let s = v.as_str()?.trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// 写入 webchat sessionId 并立即落盘。
/// 失败时返回包含底层错误信息的 String（与本文件其他 command 风格一致）。
pub fn set_webchat_session_id(app: &tauri::AppHandle<Wry>, session_id: &str) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(WEBCHAT_SESSION_ID_KEY, session_id.to_string());
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// 清空持久化的 webchat sessionId（用户在 UI 点了"重置 WebChat 绑定"按钮）。
/// 下次 server 启动会重新生成。
pub fn reset_webchat_session_id(app: &tauri::AppHandle<Wry>) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.delete(WEBCHAT_SESSION_ID_KEY);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
