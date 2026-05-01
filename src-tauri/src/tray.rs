use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Manager, Runtime, WindowEvent,
};

pub fn setup_tray<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let show_main = MenuItem::with_id(app, "show_main", "打开主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出应用", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_main, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_main" => {
                show_or_create_main_window(app);
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
                show_or_create_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    // 启动时创建一次主窗口（默认可见），后续关闭/唤出复用这一个实例
    if app.get_webview_window("main").is_none() {
        let _ = build_main_window(app);
    }

    Ok(())
}

fn build_main_window<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<()> {
    let win = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("/".into()))
        .title("TypeBridge")
        .inner_size(720.0, 560.0)
        .min_inner_size(620.0, 480.0)
        .resizable(true)
        .center()
        .visible(true)
        .build()?;

    // 拦截关闭事件：隐藏到托盘而非销毁，保留前端 state
    let win_clone = win.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = win_clone.hide();
        }
    });

    Ok(())
}

fn show_or_create_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        let _ = build_main_window(app);
    }
}
