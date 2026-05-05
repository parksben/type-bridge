//! 托盘 icon 设置。**不挂下拉菜单**——参考微信桌面端的交互：托盘只是个
//! 入口，单击直接显示主窗口、抢焦点。彻底退出走系统标准路径（Cmd+Q 或
//! Dock 右键退出），不需要托盘菜单提供。
//!
//! 历史决策见 docs/REQUIREMENTS.md §2.4。

use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Runtime,
};

use crate::window::show_or_create_main_window;

pub fn setup_tray<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
        .expect("failed to load tray icon");

    TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon)
        // 不调 .menu(...)：参照微信的体验，托盘点击直接打开窗口，不弹下拉菜单
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

    Ok(())
}
