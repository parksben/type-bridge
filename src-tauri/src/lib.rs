pub mod history;
pub mod injector;
pub mod logger;
pub mod notification;
pub mod queue;
pub mod sidecar;
pub mod store;
pub mod tray;

use sidecar::AppContext;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logger::init_file_logger();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            store::get_settings,
            store::save_settings,
            sidecar::start_feishu,
            sidecar::stop_feishu,
            sidecar::get_history,
            sidecar::delete_history_message,
            sidecar::retry_history_message,
            sidecar::confirm_pending_message,
            injector::check_accessibility,
            injector::inject_text_direct,
            logger::get_log_dir,
        ])
        .setup(|app| {
            tray::setup_tray(app)?;
            logger::cleanup_old_logs();

            // 构造共享 AppContext（包含 history + injector worker + confirm flag）
            let initial_confirm = {
                use tauri_plugin_store::StoreExt;
                app.store("config.json")
                    .ok()
                    .and_then(|s| s.get("confirm_before_inject").and_then(|v| v.as_bool()))
                    .unwrap_or(false)
            };
            let ctx = AppContext::new(app.handle().clone(), initial_confirm);
            app.manage(ctx);

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
