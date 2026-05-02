pub mod channel;
pub mod history;
pub mod injector;
pub mod logger;
pub mod queue;
pub mod sidecar;
pub mod store;
pub mod tray;

use sidecar::AppContext;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logger::init_file_logger();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            store::get_settings,
            store::save_settings,
            sidecar::start_feishu,
            sidecar::start_dingtalk,
            sidecar::stop_channel,
            sidecar::run_selftest,
            sidecar::get_history,
            sidecar::get_history_dir,
            sidecar::delete_history_message,
            sidecar::retry_history_message,
            sidecar::copy_text_to_clipboard,
            sidecar::copy_image_to_clipboard,
            injector::check_accessibility,
            injector::request_accessibility,
            injector::inject_text_direct,
            logger::get_log_dir,
        ])
        .setup(|app| {
            tray::setup_tray(app)?;
            logger::cleanup_old_logs();

            // 构造共享 AppContext（含 history + injector worker + submit 配置）
            let submit_config = {
                use tauri_plugin_store::StoreExt;
                let store = app.store("config.json").ok();
                match store {
                    Some(s) => {
                        let auto_submit = s
                            .get("auto_submit")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(true);
                        let submit_key = s
                            .get("submit_key")
                            .and_then(|v| serde_json::from_value::<store::SubmitKey>(v).ok())
                            .unwrap_or_default();
                        sidecar::SubmitConfig { auto_submit, submit_key }
                    }
                    None => sidecar::SubmitConfig::default(),
                }
            };
            let ctx = AppContext::new(app.handle().clone(), submit_config);
            app.manage(ctx);

            // 启动后广播一次辅助功能权限状态，前端 ConnectionTab 据此决定是否
            // 展示 banner；前端后续会每 3s 主动 check_accessibility 轮询直到授予
            let granted = injector::check_accessibility();
            let _ = app
                .handle()
                .emit("typebridge://accessibility", serde_json::json!({ "granted": granted }));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
