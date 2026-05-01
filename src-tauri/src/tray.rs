use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Manager, Runtime, WindowEvent,
};

pub fn setup_tray<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let show_config = MenuItem::with_id(app, "connect", "连接飞书", true, None::<&str>)?;
    let show_log = MenuItem::with_id(app, "logs", "消息日志", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出应用", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_config, &show_log, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "connect" => {
                show_or_create_config_window(app);
            }
            "logs" => {
                show_or_create_log_window(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_or_create_config_window(tray.app_handle());
            }
        })
        .build(app)?;

    // 启动时创建一次配置窗口（隐藏的实例），后续关闭/再次唤出都复用这一个实例
    if app.get_webview_window("config").is_none() {
        let _ = build_config_window(app);
    }

    Ok(())
}

fn build_config_window<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<()> {
    let win = tauri::WebviewWindowBuilder::new(app, "config", tauri::WebviewUrl::App("/".into()))
        .title("TypeBridge")
        .inner_size(420.0, 500.0)
        .resizable(false)
        .center()
        .visible(true)
        .build()?;

    // 拦截关闭事件：隐藏到托盘而非销毁，保留 React state 与已填入的凭据
    let win_clone = win.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = win_clone.hide();
        }
    });

    Ok(())
}

fn show_or_create_config_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("config") {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        let _ = build_config_window(app);
    }
}

pub fn show_or_create_log_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("log") {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        let win = tauri::WebviewWindowBuilder::new(app, "log", tauri::WebviewUrl::App("/log".into()))
            .title("消息日志 — TypeBridge")
            .inner_size(720.0, 520.0)
            .resizable(true)
            .center()
            .build();
        if let Ok(win) = win {
            let win_clone = win.clone();
            win.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win_clone.hide();
                }
            });
        }
    }
}
