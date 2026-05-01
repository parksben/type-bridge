use core_foundation::base::{CFTypeRef, TCFType};
use core_foundation::string::CFString;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrustedWithOptions(options: *const std::ffi::c_void) -> bool;
    fn AXUIElementCreateSystemWide() -> *mut std::ffi::c_void;
    fn AXUIElementCopyAttributeValue(
        element: *mut std::ffi::c_void,
        // CFStringRef（对象指针），不是 C 字符串
        attribute: CFTypeRef,
        value: *mut CFTypeRef,
    ) -> i32;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventCreateKeyboardEvent(
        source: *mut std::ffi::c_void,
        virtual_key: u16,
        key_down: bool,
    ) -> *mut std::ffi::c_void;
    fn CGEventPost(tap: u32, event: *mut std::ffi::c_void);
    fn CGEventKeyboardSetUnicodeString(
        event: *mut std::ffi::c_void,
        string_length: usize,
        unicode_string: *const u16,
    );
    fn CFRelease(cf: *mut std::ffi::c_void);
}

pub struct FocusedElement(*mut std::ffi::c_void);

unsafe impl Send for FocusedElement {}
unsafe impl Sync for FocusedElement {}

impl Drop for FocusedElement {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) };
        }
    }
}

#[tauri::command]
pub fn check_accessibility() -> bool {
    unsafe {
        // 传 NULL options：仅查询当前信任状态，不触发系统 UI 提示
        AXIsProcessTrustedWithOptions(std::ptr::null())
    }
}

/// 打开系统设置 → 隐私与安全性 → 辅助功能 面板。
/// 与 `check_accessibility` 严格分离：只有用户显式点击 UI 按钮时才调
/// 用，避免每次注入都弹系统窗口抢焦点。
#[tauri::command]
pub fn request_accessibility() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

/// 兼容保留旧名字（未被外部调用，仅内部代码可能用到）
pub fn request_accessibility_with_prompt() {
    request_accessibility();
}

pub fn get_focused_element() -> Result<FocusedElement, String> {
    // 前置：权限未授予时立刻返回错误，不再调 AX API（之前在这里
    // 直接弹系统设置是错的——重复弹窗 + 权限半授予状态下可能触发
    // CFStringRef 段错误）
    if !check_accessibility() {
        return Err("辅助功能权限未授予".to_string());
    }

    unsafe {
        let system = AXUIElementCreateSystemWide();
        if system.is_null() {
            return Err("AX system-wide element 不可用".to_string());
        }

        // AXFocusedUIElement 属性名：必须是真正的 CFStringRef，不是 C 字节指针
        let focused_attr = CFString::from_static_string("AXFocusedUIElement");
        let mut focused: CFTypeRef = std::ptr::null();
        let result = AXUIElementCopyAttributeValue(
            system,
            focused_attr.as_concrete_TypeRef() as CFTypeRef,
            &mut focused,
        );
        CFRelease(system);

        if result != 0 {
            return Err(format!(
                "获取焦点元素失败 {}（{}）",
                ax_error_name(result),
                ax_error_hint(result),
            ));
        }
        if focused.is_null() {
            return Err("系统当前无焦点元素（可能聚焦在桌面或不可访问的应用）".to_string());
        }

        // 读 AXRole 做一次基本校验
        let role_attr = CFString::from_static_string("AXRole");
        let mut role_val: CFTypeRef = std::ptr::null();
        let role_result = AXUIElementCopyAttributeValue(
            focused as *mut std::ffi::c_void,
            role_attr.as_concrete_TypeRef() as CFTypeRef,
            &mut role_val,
        );

        if role_result != 0 {
            CFRelease(focused as *mut std::ffi::c_void);
            return Err(format!(
                "读取焦点元素角色失败 {}（{}）",
                ax_error_name(role_result),
                ax_error_hint(role_result),
            ));
        }
        if role_val.is_null() {
            CFRelease(focused as *mut std::ffi::c_void);
            return Err("焦点元素不暴露 AXRole 属性（非标准 UI 组件）".to_string());
        }

        CFRelease(role_val as *mut std::ffi::c_void);
        Ok(FocusedElement(focused as *mut std::ffi::c_void))
    }
}

/// AXError 数值 → 可读名称
fn ax_error_name(code: i32) -> String {
    let name = match code {
        -25200 => "Failure",
        -25201 => "IllegalArgument",
        -25202 => "InvalidUIElement",
        -25203 => "InvalidUIElementObserver",
        -25204 => "CannotComplete",
        -25205 => "AttributeUnsupported",
        -25206 => "ActionUnsupported",
        -25207 => "NotificationUnsupported",
        -25208 => "NotImplemented",
        -25209 => "NotificationAlreadyRegistered",
        -25210 => "NotificationNotRegistered",
        -25211 => "APIDisabled",
        -25212 => "NoValue",
        -25213 => "ParameterizedAttributeUnsupported",
        -25214 => "NotEnoughPrecision",
        _ => "Unknown",
    };
    format!("AXError={} {}", code, name)
}

/// 根据 AXError 给出用户可操作的诊断建议
fn ax_error_hint(code: i32) -> &'static str {
    match code {
        -25211 => "TCC 缓存失效；请到系统设置 → 隐私与安全性 → 辅助功能，将 TypeBridge 移除后重新勾选",
        -25204 => "目标应用未响应 AX 调用；切到其他可输入应用再试，若仍失败请重新授权",
        -25202 => "焦点元素已失效；用户可能正在切换窗口",
        -25205 => "该元素不支持请求的属性",
        _ => "请检查辅助功能授权状态或目标应用是否支持 AX",
    }
}

#[tauri::command]
pub fn inject_text_direct(text: String) -> Result<(), String> {
    inject_text(&text)
}

pub fn inject_text(text: &str) -> Result<(), String> {
    for ch in text.chars() {
        let utf16: Vec<u16> = {
            let mut buf = [0u16; 2];
            let len = ch.encode_utf16(&mut buf).len();
            buf[..len].to_vec()
        };
        unsafe {
            let key_down = CGEventCreateKeyboardEvent(std::ptr::null_mut(), 0, true);
            if key_down.is_null() {
                return Err("CGEventCreateKeyboardEvent failed".to_string());
            }
            CGEventKeyboardSetUnicodeString(key_down, utf16.len(), utf16.as_ptr());
            CGEventPost(0, key_down); // kCGHIDEventTap = 0

            let key_up = CGEventCreateKeyboardEvent(std::ptr::null_mut(), 0, false);
            if !key_up.is_null() {
                CGEventKeyboardSetUnicodeString(key_up, utf16.len(), utf16.as_ptr());
                CGEventPost(0, key_up);
                CFRelease(key_up);
            }
            CFRelease(key_down);
        }
        std::thread::sleep(std::time::Duration::from_millis(8));
    }
    Ok(())
}

pub fn inject_image(png_bytes: &[u8], _mime: &str) -> Result<(), String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypePNG};
    use objc2_foundation::NSData;

    unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();

        let data = NSData::with_bytes(png_bytes);
        let ok = pasteboard.setData_forType(Some(&data), NSPasteboardTypePNG);
        if !ok {
            return Err("NSPasteboard setData failed".to_string());
        }
    }

    // Simulate Cmd+V
    simulate_cmd_v()?;
    Ok(())
}

fn simulate_cmd_v() -> Result<(), String> {
    const V_KEYCODE: u16 = 0x09;
    const K_CG_EVENT_FLAG_MASK_COMMAND: u64 = 0x00100000;

    unsafe {
        let key_down = CGEventCreateKeyboardEvent(std::ptr::null_mut(), V_KEYCODE, true);
        if key_down.is_null() {
            return Err("CGEventCreateKeyboardEvent failed".to_string());
        }

        // Set Command modifier via CGEventSetFlags (we use raw pointer trick)
        // CGEventSetFlags is in CoreGraphics but not always linked by name — use raw setter
        set_event_flags(key_down, K_CG_EVENT_FLAG_MASK_COMMAND);
        CGEventPost(0, key_down);

        let key_up = CGEventCreateKeyboardEvent(std::ptr::null_mut(), V_KEYCODE, false);
        if !key_up.is_null() {
            set_event_flags(key_up, K_CG_EVENT_FLAG_MASK_COMMAND);
            CGEventPost(0, key_up);
            CFRelease(key_up);
        }
        CFRelease(key_down);
    }
    Ok(())
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSetFlags(event: *mut std::ffi::c_void, flags: u64);
}

unsafe fn set_event_flags(event: *mut std::ffi::c_void, flags: u64) {
    CGEventSetFlags(event, flags);
}

// ─── 自动提交：按键模拟 ─────────────────────────────────────────────

const CG_FLAG_COMMAND: u64 = 0x00100000;
const CG_FLAG_SHIFT:   u64 = 0x00020000;
const CG_FLAG_CONTROL: u64 = 0x00040000;
const CG_FLAG_OPTION:  u64 = 0x00080000;

/// 根据用户配置的 SubmitKey 模拟一次按键（down + up）用于消息提交。
pub fn simulate_submit(sk: &crate::store::SubmitKey) -> Result<(), String> {
    let keycode = ecode_to_macos_keycode(&sk.key)
        .ok_or_else(|| format!("unsupported key: {}", sk.key))?;

    let mut flags: u64 = 0;
    if sk.cmd { flags |= CG_FLAG_COMMAND; }
    if sk.shift { flags |= CG_FLAG_SHIFT; }
    if sk.option { flags |= CG_FLAG_OPTION; }
    if sk.ctrl { flags |= CG_FLAG_CONTROL; }

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
