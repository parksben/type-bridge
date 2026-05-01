// Rust 向前台应用"写入文本/图片"的核心实现。
//
// 策略：NSPasteboard 放内容 → 模拟 Cmd+V 触发粘贴。
// 该方案覆盖 Electron / webview 类应用（VSCode / Slack / Discord 等）——
// 这些应用的 AX 焦点查询不稳定，之前的逐字符 CGEventPost 方案会失败。
//
// 权限：NSPasteboard 本身不需要任何权限；CGEventPost（模拟 Cmd+V
// 和自动提交按键）在 macOS 上仍需"辅助功能"权限，TCC 会拦截未授权
// 的应用跨进程发按键事件。

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrustedWithOptions(options: *const std::ffi::c_void) -> bool;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventCreateKeyboardEvent(
        source: *mut std::ffi::c_void,
        virtual_key: u16,
        key_down: bool,
    ) -> *mut std::ffi::c_void;
    fn CGEventPost(tap: u32, event: *mut std::ffi::c_void);
    fn CGEventSetFlags(event: *mut std::ffi::c_void, flags: u64);
    fn CFRelease(cf: *mut std::ffi::c_void);
}

unsafe fn set_event_flags(event: *mut std::ffi::c_void, flags: u64) {
    CGEventSetFlags(event, flags);
}

// ─── 辅助功能权限 ─────────────────────────────────────────────────

#[tauri::command]
pub fn check_accessibility() -> bool {
    unsafe {
        // 传 NULL options：仅查询当前信任状态，不触发系统 UI 提示
        AXIsProcessTrustedWithOptions(std::ptr::null())
    }
}

/// 打开系统设置 → 隐私与安全性 → 辅助功能 面板。
#[tauri::command]
pub fn request_accessibility() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

// ─── 前台应用自我保护 ────────────────────────────────────────────

/// 当前前台应用的 bundle identifier 是否就是我们自己。
/// 用来拦截"焦点仍在 TypeBridge 自己的窗口"这种场景——如果不拦截，
/// CGEventPost 的按键会打回自己身上，粘贴命令也会粘到自己的 webview。
pub fn is_frontmost_self() -> bool {
    use objc2_app_kit::NSWorkspace;
    unsafe {
        let ws = NSWorkspace::sharedWorkspace();
        if let Some(app) = ws.frontmostApplication() {
            if let Some(bid) = app.bundleIdentifier() {
                return bid.to_string() == "com.typebridge.app";
            }
        }
        false
    }
}

// ─── 文本 / 图片写入 ─────────────────────────────────────────────

#[tauri::command]
pub fn inject_text_direct(text: String) -> Result<(), String> {
    inject_text(&text)
}

/// 向前台应用写入文本：NSPasteboard 放文本 → 模拟 Cmd+V。
pub fn inject_text(text: &str) -> Result<(), String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
    use objc2_foundation::NSString;

    if is_frontmost_self() {
        return Err("当前前台是 TypeBridge 自己，请先切换到目标应用窗口".to_string());
    }

    unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();
        let ns_string = NSString::from_str(text);
        let ok = pasteboard.setString_forType(&ns_string, NSPasteboardTypeString);
        if !ok {
            return Err("NSPasteboard 写入文本失败".to_string());
        }
    }

    // 给前台应用一点时间感知剪贴板变化，再触发粘贴
    std::thread::sleep(std::time::Duration::from_millis(50));
    simulate_cmd_v()?;
    // 让前台应用把粘贴事件流处理完，再让调用方继续发后续按键（如 Enter）
    std::thread::sleep(std::time::Duration::from_millis(150));
    Ok(())
}

pub fn inject_image(png_bytes: &[u8], _mime: &str) -> Result<(), String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypePNG};
    use objc2_foundation::NSData;

    if is_frontmost_self() {
        return Err("当前前台是 TypeBridge 自己，请先切换到目标应用窗口".to_string());
    }

    unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();

        let data = NSData::with_bytes(png_bytes);
        let ok = pasteboard.setData_forType(Some(&data), NSPasteboardTypePNG);
        if !ok {
            return Err("NSPasteboard 写入图片失败".to_string());
        }
    }

    simulate_cmd_v()?;
    std::thread::sleep(std::time::Duration::from_millis(150));
    Ok(())
}

// ─── 键盘事件模拟 ─────────────────────────────────────────────────

const CG_FLAG_COMMAND: u64 = 0x00100000;
const CG_FLAG_SHIFT: u64 = 0x00020000;
const CG_FLAG_CONTROL: u64 = 0x00040000;
const CG_FLAG_OPTION: u64 = 0x00080000;

fn simulate_cmd_v() -> Result<(), String> {
    const V_KEYCODE: u16 = 0x09;

    unsafe {
        let key_down = CGEventCreateKeyboardEvent(std::ptr::null_mut(), V_KEYCODE, true);
        if key_down.is_null() {
            return Err("CGEventCreateKeyboardEvent failed".to_string());
        }
        set_event_flags(key_down, CG_FLAG_COMMAND);
        CGEventPost(0, key_down);

        let key_up = CGEventCreateKeyboardEvent(std::ptr::null_mut(), V_KEYCODE, false);
        if !key_up.is_null() {
            set_event_flags(key_up, CG_FLAG_COMMAND);
            CGEventPost(0, key_up);
            CFRelease(key_up);
        }
        CFRelease(key_down);
    }
    Ok(())
}

/// 根据用户配置的 SubmitKey 模拟一次按键（down + up）用于消息提交。
pub fn simulate_submit(sk: &crate::store::SubmitKey) -> Result<(), String> {
    let keycode = ecode_to_macos_keycode(&sk.key)
        .ok_or_else(|| format!("unsupported key: {}", sk.key))?;

    let mut flags: u64 = 0;
    if sk.cmd {
        flags |= CG_FLAG_COMMAND;
    }
    if sk.shift {
        flags |= CG_FLAG_SHIFT;
    }
    if sk.option {
        flags |= CG_FLAG_OPTION;
    }
    if sk.ctrl {
        flags |= CG_FLAG_CONTROL;
    }

    unsafe {
        let key_down = CGEventCreateKeyboardEvent(std::ptr::null_mut(), keycode, true);
        if key_down.is_null() {
            return Err("CGEventCreateKeyboardEvent failed".to_string());
        }
        if flags != 0 {
            set_event_flags(key_down, flags);
        }
        CGEventPost(0, key_down);

        let key_up = CGEventCreateKeyboardEvent(std::ptr::null_mut(), keycode, false);
        if !key_up.is_null() {
            if flags != 0 {
                set_event_flags(key_up, flags);
            }
            CGEventPost(0, key_up);
            CFRelease(key_up);
        }
        CFRelease(key_down);
    }
    Ok(())
}

/// JavaScript KeyboardEvent.code → macOS virtual keycode
/// 参见 Carbon HIToolbox/Events.h 中的 kVK_* 常量
pub fn ecode_to_macos_keycode(code: &str) -> Option<u16> {
    Some(match code {
        // 控制键
        "Enter" => 0x24,       // kVK_Return
        "NumpadEnter" => 0x4C, // kVK_ANSI_KeypadEnter
        "Tab" => 0x30,
        "Space" => 0x31,
        "Escape" => 0x35,
        "Backspace" => 0x33,
        "Delete" => 0x75,
        "ArrowUp" => 0x7E,
        "ArrowDown" => 0x7D,
        "ArrowLeft" => 0x7B,
        "ArrowRight" => 0x7C,
        "Home" => 0x73,
        "End" => 0x77,
        "PageUp" => 0x74,
        "PageDown" => 0x79,
        // 字母 A-Z
        "KeyA" => 0x00, "KeyB" => 0x0B, "KeyC" => 0x08, "KeyD" => 0x02,
        "KeyE" => 0x0E, "KeyF" => 0x03, "KeyG" => 0x05, "KeyH" => 0x04,
        "KeyI" => 0x22, "KeyJ" => 0x26, "KeyK" => 0x28, "KeyL" => 0x25,
        "KeyM" => 0x2E, "KeyN" => 0x2D, "KeyO" => 0x1F, "KeyP" => 0x23,
        "KeyQ" => 0x0C, "KeyR" => 0x0F, "KeyS" => 0x01, "KeyT" => 0x11,
        "KeyU" => 0x20, "KeyV" => 0x09, "KeyW" => 0x0D, "KeyX" => 0x07,
        "KeyY" => 0x10, "KeyZ" => 0x06,
        // 数字 0-9（主键盘）
        "Digit0" => 0x1D, "Digit1" => 0x12, "Digit2" => 0x13,
        "Digit3" => 0x14, "Digit4" => 0x15, "Digit5" => 0x17,
        "Digit6" => 0x16, "Digit7" => 0x1A, "Digit8" => 0x1C,
        "Digit9" => 0x19,
        // 功能键
        "F1" => 0x7A, "F2" => 0x78, "F3" => 0x63, "F4" => 0x76,
        "F5" => 0x60, "F6" => 0x61, "F7" => 0x62, "F8" => 0x64,
        "F9" => 0x65, "F10" => 0x6D, "F11" => 0x67, "F12" => 0x6F,
        // 符号（主键盘）
        "Minus" => 0x1B,        // -
        "Equal" => 0x18,        // =
        "BracketLeft" => 0x21,  // [
        "BracketRight" => 0x1E, // ]
        "Backslash" => 0x2A,    // \
        "Semicolon" => 0x29,    // ;
        "Quote" => 0x27,        // '
        "Comma" => 0x2B,        // ,
        "Period" => 0x2F,       // .
        "Slash" => 0x2C,        // /
        "Backquote" => 0x32,    // `
        _ => return None,
    })
}
