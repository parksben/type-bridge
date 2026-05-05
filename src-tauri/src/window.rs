use tauri::{App, Manager, Runtime, WindowEvent};

/// 启动期初始化：建一次主窗口（默认可见）。
/// 后续用户点窗口左上角红色关闭按钮 → 隐藏窗口（不销毁）。
/// 用户再点 Dock 图标 → lib.rs 的 RunEvent::Reopen handler 调
/// `show_or_create_main_window` 让窗口重新可见。
pub fn setup_main_window<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    if app.get_webview_window("main").is_none() {
        build_main_window(app)?;
    }
    Ok(())
}

/// 显示已存在的主窗口（隐藏 → 可见 + 抢焦点）。
/// 由 RunEvent::Reopen（macOS Dock click）触发。
pub fn show_or_create_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        let _ = build_main_window(app);
    }
}

fn build_main_window<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<()> {
    let win = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("/".into()))
        .title("TypeBridge")
        .inner_size(820.0, 560.0)
        .min_inner_size(720.0, 480.0)
        .resizable(true)
        .center()
        .visible(true)
        .build()?;

    // 拦截关闭按钮：隐藏窗口而非销毁。应用进程继续在 Dock 上驻留，前端 React
    // state 全部保留，用户再次点 Dock 图标即可秒级唤回。彻底退出走系统级路径
    // （Cmd+Q / Dock 右键退出）— 那种情况由 macOS 直接发 terminate，Tauri
    // 会调 app.exit(0) 正常清理。
    let win_clone = win.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = win_clone.hide();
        }
    });

    Ok(())
}
