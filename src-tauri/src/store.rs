use crate::sidecar::AppContext;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Manager, Wry};
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
    store.save().map_err(|e| e.to_string())?;

    if let Some(ctx) = app.try_state::<Arc<AppContext>>() {
        ctx.set_submit_config(settings.auto_submit, settings.submit_key);
    }

    Ok(())
}
