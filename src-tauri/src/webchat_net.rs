//! 网络探测工具：LAN IP + 当前 WiFi SSID。
//!
//! - `primary_lan_ip()`：选一个"合适的"本机 IPv4 地址作为 WebChat server 绑定
//!   目标和 QR 里展示的主机名。多网卡环境下优先挑活跃 WiFi 网卡（en0 on
//!   macOS）；其次任意非回环 / 非链路本地的 IPv4。
//! - `current_wifi_ssid()`：macOS 上通过 `/usr/sbin/networksetup -getairportnetwork`
//!   获取当前 WiFi 名字。其他平台暂时返回 None。

use std::net::{IpAddr, Ipv4Addr};

/// 选一个用于 WebChat server 绑定 + QR 展示的 LAN IPv4。
/// 返回 None 表示本机没有接入任何可用网络（用户应该先连 WiFi）。
pub fn primary_lan_ip() -> Option<IpAddr> {
    // local_ip_address::list_afinet_netifas 返回 (interface_name, IpAddr) 列表
    let ifaces = local_ip_address::list_afinet_netifas().ok()?;

    // 偏好顺序：
    //   1. macOS 主 WiFi 网卡 en0（默认 WiFi） / en1（部分机型）
    //   2. 以太网 en0 / en1
    //   3. 任意非回环 / 非链路本地 IPv4
    fn score(name: &str) -> u8 {
        // 排除 VPN / bridge / utun / awdl / llw
        if name.starts_with("utun")
            || name.starts_with("awdl")
            || name.starts_with("llw")
            || name.starts_with("bridge")
            || name.starts_with("anpi")
            || name.starts_with("ap")
        {
            return 0; // 不用
        }
        match name {
            "en0" => 10,
            "en1" => 9,
            "en2" => 8,
            _ => 5,
        }
    }

    let mut candidates: Vec<(u8, IpAddr, String)> = ifaces
        .into_iter()
        .filter_map(|(name, ip)| match ip {
            IpAddr::V4(v4) if is_usable_ipv4(&v4) => {
                let s = score(&name);
                if s == 0 {
                    None
                } else {
                    Some((s, IpAddr::V4(v4), name))
                }
            }
            _ => None,
        })
        .collect();

    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    let chosen = candidates.into_iter().next()?;
    tracing::info!(
        "[webchat-net] primary LAN ip = {} ({})",
        chosen.1,
        chosen.2
    );
    Some(chosen.1)
}

fn is_usable_ipv4(addr: &Ipv4Addr) -> bool {
    !addr.is_loopback()
        && !addr.is_unspecified()
        && !addr.is_link_local()   // 169.254.x.x
        && !addr.is_multicast()
        && !addr.is_broadcast()
}

/// 获取当前 WiFi SSID。macOS 上调 `networksetup -getairportnetwork en0`，
/// 拿到形如 "Current Wi-Fi Network: MyWiFi-5G" 的文本，解析冒号后部分。
/// 失败或其他平台返回 None。
pub fn current_wifi_ssid() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        // 优先 en0，失败尝试 en1（少数机型）
        for device in &["en0", "en1"] {
            if let Some(ssid) = probe_macos_ssid(device) {
                return Some(ssid);
            }
        }
        None
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

#[cfg(target_os = "macos")]
fn probe_macos_ssid(device: &str) -> Option<String> {
    use std::process::Command;
    let output = Command::new("/usr/sbin/networksetup")
        .args(["-getairportnetwork", device])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    // 预期："Current Wi-Fi Network: <name>\n"
    // 未连接：stdout 会是 "You are not associated with an AirPort network." 之类
    let line = stdout.lines().next()?;
    let colon = line.find(':')?;
    let name = line[colon + 1..].trim();
    if name.is_empty() || name.contains("not associated") {
        None
    } else {
        Some(name.to_string())
    }
}
