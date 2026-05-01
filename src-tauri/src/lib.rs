pub mod injector;
pub mod logger;
pub mod notification;
pub mod sidecar;
pub mod store;
pub mod tray;

use std::sync::{Arc, Mutex};
use sidecar::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logger::init_file_logger();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Arc::new(Mutex::new(AppState::default())))
        .invoke_handler(tauri::generate_handler![
            store::get_settings,
            store::save_settings,
            sidecar::start_feishu,
            sidecar::stop_feishu,
            sidecar::inject_pending,
            injector::check_accessibility,
            injector::inject_text_direct,
            logger::get_log_dir,
        ])
        .setup(|app| {
            tray::setup_tray(app)?;

            // 启动时清理过期日志
            logger::cleanup_old_logs();

            // 请求通知权限
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_notification::NotificationExt;
                let _ = app.notification().request_permission();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
