use serde::{Deserialize, Serialize};
use tauri::Wry;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "config.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    pub feishu_app_id: String,
    pub feishu_app_secret: String,
    pub confirm_before_inject: bool,
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle<Wry>) -> Settings {
    let store = app.store(STORE_PATH).unwrap_or_else(|_| {
        app.store(STORE_PATH).expect("failed to open store")
    });

    Settings {
        feishu_app_id: store
            .get("feishu_app_id")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        feishu_app_secret: store
            .get("feishu_app_secret")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        confirm_before_inject: store
            .get("confirm_before_inject")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    }
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle<Wry>, settings: Settings) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set("feishu_app_id", settings.feishu_app_id);
    store.set("feishu_app_secret", settings.feishu_app_secret);
    store.set("confirm_before_inject", settings.confirm_before_inject);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
