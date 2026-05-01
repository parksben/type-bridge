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
