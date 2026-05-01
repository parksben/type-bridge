use tauri::Runtime;
use tauri_plugin_notification::NotificationExt;

pub fn notify_no_focus<R: Runtime>(app: &tauri::AppHandle<R>) {
    let _ = app
        .notification()
        .builder()
        .title("TypeBridge")
        .body("当前无聚焦输入框，消息已暂存，请聚焦后重试")
        .show();
}
