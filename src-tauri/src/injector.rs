#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrustedWithOptions(options: *const std::ffi::c_void) -> bool;
    fn AXUIElementCreateSystemWide() -> *mut std::ffi::c_void;
    fn AXUIElementCopyAttributeValue(
        element: *mut std::ffi::c_void,
        attribute: *const std::ffi::c_char,
        value: *mut *mut std::ffi::c_void,
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
        // Build CFDictionary with kAXTrustedCheckOptionPrompt = kCFBooleanTrue
        // For simplicity we call without prompt option first
        AXIsProcessTrustedWithOptions(std::ptr::null())
    }
}

pub fn request_accessibility_with_prompt() {
    // Trigger system accessibility permission prompt by opening the prefs pane
    // The simplest approach on macOS 13+: open the accessibility prefs pane
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

pub fn get_focused_element() -> Option<FocusedElement> {
    if !check_accessibility() {
        request_accessibility_with_prompt();
        return None;
    }

    unsafe {
        let system = AXUIElementCreateSystemWide();
        if system.is_null() {
            return None;
        }

        let attr = b"AXFocusedUIElement\0";
        let mut focused: *mut std::ffi::c_void = std::ptr::null_mut();
        let result = AXUIElementCopyAttributeValue(
            system,
            attr.as_ptr() as *const std::ffi::c_char,
            &mut focused,
        );
        CFRelease(system);

        if result != 0 || focused.is_null() {
            return None;
        }

        // Check role is editable
        let role_attr = b"AXRole\0";
        let mut role_val: *mut std::ffi::c_void = std::ptr::null_mut();
        let role_result = AXUIElementCopyAttributeValue(
            focused,
            role_attr.as_ptr() as *const std::ffi::c_char,
            &mut role_val,
        );

        if role_result != 0 || role_val.is_null() {
            CFRelease(focused);
            return None;
        }

        // We accept any focused element that has AXRole (all editable elements do)
        // Stricter checking can be added here if needed
        CFRelease(role_val);
        Some(FocusedElement(focused))
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
