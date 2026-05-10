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
    // Mouse / trackpad
    fn CGEventCreate(source: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn CGEventSetType(event: *mut std::ffi::c_void, type_: u32);
    fn CGEventGetLocation(event: *mut std::ffi::c_void) -> CGPoint;
    fn CGEventCreateMouseEvent(
        source: *mut std::ffi::c_void,
        mouse_type: u32,
        cursor_position: CGPoint,
        mouse_button: u32,
    ) -> *mut std::ffi::c_void;
    /// Non-variadic variant (avoids Rust FFI variadic limitation); wheelCount fixed at 2.
    fn CGEventCreateScrollWheelEvent2(
        source: *mut std::ffi::c_void,
        units: u32,
        wheel_count: u32,
        wheel1: i32,
        wheel2: i32,
        wheel3: i32,
    ) -> *mut std::ffi::c_void;
    fn CGEventSetDoubleValueField(event: *mut std::ffi::c_void, field: u32, value: f64);
    // 屏幕录制权限（macOS 10.15+）
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// macOS CGPoint（与 C ABI 一致：两个 f64）
#[repr(C)]
#[derive(Copy, Clone)]
struct CGPoint {
    x: f64,
    y: f64,
}

// ─── CGEvent 鼠标类型常量 ──────────────────────────────────────────────
const CG_EVENT_LEFT_MOUSE_DOWN: u32 = 1;
const CG_EVENT_LEFT_MOUSE_UP: u32 = 2;
const CG_EVENT_RIGHT_MOUSE_DOWN: u32 = 3;
const CG_EVENT_RIGHT_MOUSE_UP: u32 = 4;
const CG_EVENT_MOUSE_MOVED: u32 = 5;
const CG_MOUSE_BUTTON_LEFT: u32 = 0;
const CG_MOUSE_BUTTON_RIGHT: u32 = 1;
const CG_SCROLL_EVENT_UNIT_PIXEL: u32 = 0;
/// kCGEventMagnify — trackpad 双指缩放手势
const CG_EVENT_MAGNIFY: u32 = 29;
/// kCGEventGestureMagnification field id（CGEventField 枚举值，参见 CGEventTypes.h 113 = 0x71）
const CG_FIELD_MAGNIFICATION: u32 = 113;

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

/// 当前前台应用是不是我们自己的进程。
/// 用 PID 比较而不是 bundleIdentifier：Tauri dev build 不走 .app
/// bundle，bundleIdentifier 可能为空或与 tauri.conf.json 里配置的
/// `com.typebridge.app` 不一致，导致自我保护在 dev 模式失效。PID
/// 比较绝对可靠——它就是我们这个进程。
pub fn is_frontmost_self() -> bool {
    use objc2_app_kit::NSWorkspace;
    let my_pid = std::process::id() as i32;
    unsafe {
        let ws = NSWorkspace::sharedWorkspace();
        if let Some(app) = ws.frontmostApplication() {
            return app.processIdentifier() as i32 == my_pid;
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
    const CMD_KEYCODE: u16 = 0x37; // kVK_Command

    unsafe {
        // Cmd down
        let cmd_down = CGEventCreateKeyboardEvent(std::ptr::null_mut(), CMD_KEYCODE, true);
        if !cmd_down.is_null() {
            CGEventPost(0, cmd_down);
            CFRelease(cmd_down);
        }

        // V down
        let key_down = CGEventCreateKeyboardEvent(std::ptr::null_mut(), V_KEYCODE, true);
        if key_down.is_null() {
            return Err("CGEventCreateKeyboardEvent failed".to_string());
        }
        set_event_flags(key_down, CG_FLAG_COMMAND);
        CGEventPost(0, key_down);

        // V up
        let key_up = CGEventCreateKeyboardEvent(std::ptr::null_mut(), V_KEYCODE, false);
        if !key_up.is_null() {
            set_event_flags(key_up, CG_FLAG_COMMAND);
            CGEventPost(0, key_up);
            CFRelease(key_up);
        }
        CFRelease(key_down);

        // Cmd up — must release or modifier sticks and corrupts subsequent key events
        let cmd_up = CGEventCreateKeyboardEvent(std::ptr::null_mut(), CMD_KEYCODE, false);
        if !cmd_up.is_null() {
            CGEventPost(0, cmd_up);
            CFRelease(cmd_up);
        }
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

// ─── 鼠标 / 触控板控制 ────────────────────────────────────────────────

/// 获取当前鼠标坐标。每次调用都创建一个临时 CGEvent 查询。
unsafe fn get_mouse_location() -> CGPoint {
    let e = CGEventCreate(std::ptr::null_mut());
    let pt = if e.is_null() {
        CGPoint { x: 0.0, y: 0.0 }
    } else {
        let p = CGEventGetLocation(e);
        CFRelease(e);
        p
    };
    pt
}

/// 鼠标相对移动（WebChat 触控板单指滑动）。
/// dx/dy 已经乘以灵敏度系数，由前端计算后传入。
pub fn mouse_move(dx: f64, dy: f64) -> Result<(), String> {
    unsafe {
        let mut pos = get_mouse_location();
        pos.x += dx;
        pos.y += dy;
        let event = CGEventCreateMouseEvent(
            std::ptr::null_mut(),
            CG_EVENT_MOUSE_MOVED,
            pos,
            CG_MOUSE_BUTTON_LEFT,
        );
        if event.is_null() {
            return Err("CGEventCreateMouseEvent(MOUSE_MOVED) failed".into());
        }
        CGEventPost(0, event);
        CFRelease(event);
    }
    Ok(())
}

/// 鼠标按键（down / up）。button = "left" | "right"，action = "down" | "up"。
pub fn mouse_click(button: &str, action: &str) -> Result<(), String> {
    let (event_type, mouse_btn) = match (button, action) {
        ("left", "down") => (CG_EVENT_LEFT_MOUSE_DOWN, CG_MOUSE_BUTTON_LEFT),
        ("left", "up") => (CG_EVENT_LEFT_MOUSE_UP, CG_MOUSE_BUTTON_LEFT),
        ("right", "down") => (CG_EVENT_RIGHT_MOUSE_DOWN, CG_MOUSE_BUTTON_RIGHT),
        ("right", "up") => (CG_EVENT_RIGHT_MOUSE_UP, CG_MOUSE_BUTTON_RIGHT),
        _ => return Err(format!("unsupported mouse_click: {button}/{action}")),
    };
    unsafe {
        let pos = get_mouse_location();
        let event = CGEventCreateMouseEvent(
            std::ptr::null_mut(),
            event_type,
            pos,
            mouse_btn,
        );
        if event.is_null() {
            return Err("CGEventCreateMouseEvent(click) failed".into());
        }
        CGEventPost(0, event);
        CFRelease(event);
    }
    Ok(())
}

/// 双指滚动（WebChat 触控板双指滑动）。
/// dx/dy 为像素量，负值 = 向上/向左滚动（与 macOS 自然滚动一致）。
pub fn mouse_scroll(dx: f64, dy: f64) -> Result<(), String> {
    unsafe {
        // wheel1 = 垂直, wheel2 = 水平
        let event = CGEventCreateScrollWheelEvent2(
            std::ptr::null_mut(),
            CG_SCROLL_EVENT_UNIT_PIXEL,
            2,
            dy.round() as i32,
            dx.round() as i32,
            0,
        );
        if event.is_null() {
            return Err("CGEventCreateScrollWheelEvent2 failed".into());
        }
        CGEventPost(0, event);
        CFRelease(event);
    }
    Ok(())
}

/// 双指缩放（Magnify 手势）。
/// delta > 0 = 放大，delta < 0 = 缩小。推荐量级 0.02~0.15 每帧。
pub fn mouse_zoom(delta: f64) -> Result<(), String> {
    unsafe {
        let event = CGEventCreate(std::ptr::null_mut());
        if event.is_null() {
            return Err("CGEventCreate(magnify) failed".into());
        }
        CGEventSetType(event, CG_EVENT_MAGNIFY);
        CGEventSetDoubleValueField(event, CG_FIELD_MAGNIFICATION, delta);
        CGEventPost(0, event);
        CFRelease(event);
    }
    Ok(())
}

// ─── 快捷键组合 ────────────────────────────────────────────────────────

/// 模拟常用快捷键组合（不操作剪贴板，直接发快捷键事件）。
/// combo: "Undo" | "Redo" | "SelectAll" | "Copy" | "Cut" | "Paste"
pub fn key_combo(combo: &str) -> Result<(), String> {
    // keycode + modifier flags
    let (keycode, flags): (u16, u64) = match combo {
        "Undo"         => (0x06 /* Z         */, CG_FLAG_COMMAND),
        "Redo"         => (0x06 /* Z         */, CG_FLAG_COMMAND | CG_FLAG_SHIFT),
        "SelectAll"    => (0x00 /* A         */, CG_FLAG_COMMAND),
        "Copy"         => (0x08 /* C         */, CG_FLAG_COMMAND),
        "Cut"          => (0x07 /* X         */, CG_FLAG_COMMAND),
        "Paste"        => (0x09 /* V         */, CG_FLAG_COMMAND),
        // Cmd+Arrow: 文档顶部 / 底部
        "DocTop"    => (0x7E /* ArrowUp   */, CG_FLAG_COMMAND),
        "DocBottom" => (0x7D /* ArrowDown */, CG_FLAG_COMMAND),
        // 3-finger desktop gestures (macOS Ctrl+Arrow shortcuts)
        "DesktopLeft"  => (0x7B /* ArrowLeft  */, CG_FLAG_CONTROL),
        "DesktopRight" => (0x7C /* ArrowRight */, CG_FLAG_CONTROL),
        "MissionControl" => (0x7E /* ArrowUp  */, CG_FLAG_CONTROL),
        "AppExpose"    => (0x7D /* ArrowDown  */, CG_FLAG_CONTROL),
        _ => return Err(format!("unsupported combo: {combo}")),
    };
    unsafe {
        let key_down = CGEventCreateKeyboardEvent(std::ptr::null_mut(), keycode, true);
        if key_down.is_null() {
            return Err("CGEventCreateKeyboardEvent(combo down) failed".into());
        }
        set_event_flags(key_down, flags);
        CGEventPost(0, key_down);

        let key_up = CGEventCreateKeyboardEvent(std::ptr::null_mut(), keycode, false);
        if !key_up.is_null() {
            set_event_flags(key_up, flags);
            CGEventPost(0, key_up);
            CFRelease(key_up);
        }
        CFRelease(key_down);
    }
    Ok(())
}

// ─── 截图 ────────────────────────────────────────────────────────

/// 截图前检查屏幕录制权限（macOS 10.15+）。
/// 未授权时调用系统 API 弹出引导提示，并返回机器可读错误码（前端负责 i18n 翻译）。
fn ensure_screen_recording_permission() -> Result<(), String> {
    let has_perm = unsafe { CGPreflightScreenCaptureAccess() };
    if has_perm {
        return Ok(());
    }
    // 触发系统权限引导弹窗（macOS 会弹出「前往系统设置」提示）
    unsafe { CGRequestScreenCaptureAccess() };
    // 返回机器可读错误码，由前端根据语言设置做 i18n 翻译
    Err("ERR_SCREEN_RECORDING_PERMISSION".to_string())
}

/// 截图并将结果存入剪贴板。
/// kind: "screen" → 全屏截图；"window" → 截取前台窗口（失败时回退到全屏）
pub fn screenshot(kind: &str) -> Result<(), String> {
    match kind {
        "screen" => screenshot_screen(),
        "window" => screenshot_window(),
        _ => Err(format!("unsupported screenshot kind: {kind}")),
    }
}

fn screenshot_screen() -> Result<(), String> {
    ensure_screen_recording_permission()?;
    screenshot_screen_inner()
}

/// 不做权限检查的全屏截图（作为 fallback 被内部调用）。
fn screenshot_screen_inner() -> Result<(), String> {
    // screencapture -c: 存剪贴板；-x: 无声
    let status = std::process::Command::new("screencapture")
        .args(["-c", "-x"])
        .status()
        .map_err(|e| format!("screencapture launch failed: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("screencapture exited with: {status}"))
    }
}

fn screenshot_window() -> Result<(), String> {
    ensure_screen_recording_permission()?;

    // 通过 NSWorkspace 在 Rust 层获取前台应用 PID，避免依赖 osascript 的
    // `frontmost is true` 查询（后者有时会把 TypeBridge 自身当作前台进程）。
    let my_pid = std::process::id() as i32;
    let target_pid = unsafe {
        use objc2_app_kit::NSWorkspace;
        let ws = NSWorkspace::sharedWorkspace();
        ws.frontmostApplication().map(|app| app.processIdentifier() as i32)
    };

    let target_pid = match target_pid {
        Some(pid) if pid != my_pid => pid,
        Some(_) => {
            // TypeBridge 自身是前台应用，回退到全屏截图
            return screenshot_screen_inner();
        }
        None => return screenshot_screen_inner(),
    };

    // 用 PID（unix id）精确查找该进程的第一个窗口 ID（CGWindowID），
    // 比 `frontmost is true` 更准确——不受 TypeBridge 窗口状态干扰。
    let script = format!(
        "tell application \"System Events\" to id of first window of \
         (first process whose unix id is {})",
        target_pid
    );

    let window_id = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if s.is_empty() { None } else { Some(s) }
            } else {
                None
            }
        });

    match window_id {
        Some(wid) => {
            let status = std::process::Command::new("screencapture")
                .args(["-c", "-x", "-l", &wid])
                .status()
                .map_err(|e| format!("screencapture launch failed: {e}"))?;
            if status.success() {
                Ok(())
            } else {
                // 带 window id 失败（如窗口已消失），回退到全屏
                screenshot_screen_inner()
            }
        }
        None => screenshot_screen_inner(),
    }
}
