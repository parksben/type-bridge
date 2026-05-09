pub mod about;
pub mod channel;
pub mod history;
pub mod injector;
pub mod logger;
pub mod queue;
pub mod sidecar;
pub mod store;
pub mod tray;
pub mod webchat;
pub mod webchat_net;
pub mod webchat_server;
pub mod window;

use sidecar::AppContext;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logger::init_file_logger();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            store::get_settings,
            store::save_settings,
            sidecar::start_feishu,
            sidecar::start_dingtalk,
            sidecar::start_wecom,
            sidecar::stop_channel,
            sidecar::run_selftest,
            sidecar::get_history,
            sidecar::get_history_dir,
            sidecar::delete_history_message,
            sidecar::clear_all_history,
            sidecar::retry_history_message,
            sidecar::copy_text_to_clipboard,
            sidecar::copy_image_to_clipboard,
            webchat::start_webchat,
            webchat::stop_webchat,
            webchat::rotate_webchat_otp,
            webchat::webchat_snapshot,
            injector::check_accessibility,
            injector::request_accessibility,
            injector::inject_text_direct,
            logger::get_log_dir,
            about::get_app_version,
            about::check_update,
            about::apply_update,
        ])
        .setup(|app| {
            window::setup_main_window(app)?;
            tray::setup_tray(app)?;
            logger::cleanup_old_logs();

            // 构造共享 AppContext（含 history + injector worker + submit 配置 + WebChat bridge）
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

            // 注册全局 ack 桥接：injection queue 的 message-status → WebChat Socket.IO ack
            webchat::install_ack_listener(app.handle());

            // 自动启动 WebChat 服务，App 生命周期内常驻，进程退出时 OS 自动回收端口
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let ctx = handle
                        .state::<std::sync::Arc<sidecar::AppContext>>()
                        .inner()
                        .clone();
                    if let Err(e) = ctx.webchat.start(ctx.clone(), &handle).await {
                        tracing::error!("[webchat] auto-start failed: {e}");
                    }
                    let snap = ctx.webchat.snapshot(webchat::current_lang(&handle).as_deref());
                    let _ = handle.emit("typebridge://webchat-session-update", &snap);
                });
            }

            // 启动后广播一次辅助功能权限状态，前端 ConnectionTab 据此决定是否
            // 展示 banner；前端后续会每 3s 主动 check_accessibility 轮询直到授予
            let granted = injector::check_accessibility();
            let _ = app
                .handle()
                .emit("typebridge://accessibility", serde_json::json!({ "granted": granted }));

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // 拦截 macOS Dock 图标点击。Tauri 2 的 RunEvent::Reopen 对应 NSApplicationDelegate
    // 的 applicationShouldHandleReopen — 用户在窗口已隐藏（红色关闭按钮收起）后再点
    // Dock，has_visible_windows 为 false，我们这里把主窗口 show + 抢焦点，让用户
    // 体验和原生 macOS 应用一致。
    app.run(|app_handle, event| {
        if let tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } = event
        {
            if !has_visible_windows {
                window::show_or_create_main_window(app_handle);
            }
        }
    });
}
