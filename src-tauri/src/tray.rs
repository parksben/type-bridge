use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Manager, Runtime,
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

    Ok(())
}

fn show_or_create_config_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("config") {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        let _ = tauri::WebviewWindowBuilder::new(app, "config", tauri::WebviewUrl::App("/".into()))
            .title("TypeBridge")
            .inner_size(400.0, 440.0)
            .resizable(false)
            .center()
            .build();
    }
}

pub fn show_or_create_log_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("log") {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        let _ =
            tauri::WebviewWindowBuilder::new(app, "log", tauri::WebviewUrl::App("/log".into()))
                .title("消息日志 — TypeBridge")
                .inner_size(600.0, 500.0)
                .resizable(true)
                .center()
                .build();
    }
}
