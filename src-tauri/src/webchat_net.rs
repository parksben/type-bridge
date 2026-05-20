//! 网络探测工具：LAN IP + 当前 WiFi SSID + LAN 子网校验。
//!
//! - `primary_lan_ip()`：选一个"合适的"本机 IPv4 地址作为 WebChat server 绑定
//!   目标和 QR 里展示的主机名。多网卡环境下优先挑活跃 WiFi 网卡（en0 on
//!   macOS）；其次任意非回环 / 非链路本地的 IPv4。
//! - `current_wifi_ssid()`：macOS 上通过 `/usr/sbin/networksetup -getairportnetwork`
//!   获取当前 WiFi 名字。其他平台暂时返回 None。
//! - `enumerate_local_nics()` + `is_in_lan()`：webchat v3 安全模型"LAN-only 绑定"
//!   的实现基石。前者枚举本机网卡 (ip, prefix_len, name)，后者判断远端 IP 是否
//!   落在任一网卡的子网内。`local-ip-address` 只能拿 IP 不能拿 netmask，所以这
//!   两个函数走 `if-addrs` + `ipnet`。

use std::net::{IpAddr, Ipv4Addr};

/// 表示本机一张网卡的 LAN 信息（IP + 子网掩码）。
#[derive(Debug, Clone)]
pub struct LocalNic {
    pub ip: IpAddr,
    pub prefix_len: u8,
    pub name: String,
}

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
    tracing::info!("[webchat-net] primary LAN ip = {} ({})", chosen.1, chosen.2);
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

/// 网卡名是否属于"应该跳过"的虚拟/特殊接口（VPN、AWDL、桥接等）。
/// 与 primary_lan_ip() 的 score() 过滤策略保持一致。
fn is_skipped_iface_name(name: &str) -> bool {
    name.starts_with("utun")     // VPN tunnel
        || name.starts_with("awdl")   // Apple Wireless Direct Link
        || name.starts_with("llw")    // low-latency WLAN
        || name.starts_with("bridge") // 桥接
        || name.starts_with("anpi")   // Apple Network Privacy Interface
        || name.starts_with("ap") // Apple-internal
}

/// 枚举本机所有可用 IPv4 网卡，附带 netmask 推导出的 prefix_len。
///
/// 过滤策略：
/// - 仅保留 IPv4（IPv6 暂不参与 v3 LAN 校验）
/// - 跳过 loopback、unspecified、link-local、multicast、broadcast
/// - 跳过 VPN / AWDL / 桥接等虚拟接口（与 primary_lan_ip 一致）
///
/// 失败 / 无可用网卡时返回空 Vec，不 panic。
pub fn enumerate_local_nics() -> Vec<LocalNic> {
    let ifaces = match if_addrs::get_if_addrs() {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("[webchat-net] if_addrs::get_if_addrs failed: {e}");
            return Vec::new();
        }
    };

    let mut out = Vec::new();
    for iface in ifaces {
        if is_skipped_iface_name(&iface.name) {
            continue;
        }
        let v4 = match iface.addr {
            if_addrs::IfAddr::V4(v) => v,
            _ => continue, // 跳过 IPv6
        };
        if !is_usable_ipv4(&v4.ip) {
            continue;
        }
        // 用 ipnet 把 netmask 转 prefix_len（顺带校验 mask 是否连续）
        let net = match ipnet::Ipv4Net::with_netmask(v4.ip, v4.netmask) {
            Ok(n) => n,
            Err(e) => {
                tracing::debug!(
                    "[webchat-net] skip {} {} (invalid netmask {}): {e}",
                    iface.name,
                    v4.ip,
                    v4.netmask
                );
                continue;
            }
        };
        out.push(LocalNic {
            ip: IpAddr::V4(v4.ip),
            prefix_len: net.prefix_len(),
            name: iface.name,
        });
    }

    if out.is_empty() {
        tracing::debug!("[webchat-net] enumerate_local_nics: no usable NICs");
    } else {
        for n in &out {
            tracing::debug!("[webchat-net] NIC {} = {}/{}", n.name, n.ip, n.prefix_len);
        }
    }
    out
}

/// 判断远端 IP 是否落在本机任一网卡的子网内（v3 LAN-only 绑定的核心校验）。
///
/// - 仅匹配 IPv4 — IPv6 的 remote 一律返回 false（与 v3 安全模型一致）
/// - 空 nics 列表直接 false（启动时网卡枚举失败也算"不在 LAN"，宁可保守）
/// - 任一网卡子网命中即 true
pub fn is_in_lan(remote: IpAddr, nics: &[LocalNic]) -> bool {
    let remote_v4 = match remote {
        IpAddr::V4(v) => v,
        IpAddr::V6(_) => return false,
    };
    if nics.is_empty() {
        return false;
    }
    for nic in nics {
        let nic_v4 = match nic.ip {
            IpAddr::V4(v) => v,
            IpAddr::V6(_) => continue,
        };
        let net = match ipnet::Ipv4Net::new(nic_v4, nic.prefix_len) {
            Ok(n) => n,
            Err(_) => continue, // 不可能但保险
        };
        if net.contains(&remote_v4) {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    fn nic(ip: &str, prefix: u8) -> LocalNic {
        LocalNic {
            ip: IpAddr::V4(ip.parse::<Ipv4Addr>().expect("test ip")),
            prefix_len: prefix,
            name: format!("test-{}-{}", ip, prefix),
        }
    }

    fn ip(s: &str) -> IpAddr {
        s.parse().expect("test ip parse")
    }

    #[test]
    fn same_slash_24_hit() {
        let nics = vec![nic("192.168.1.10", 24)];
        assert!(is_in_lan(ip("192.168.1.55"), &nics));
    }

    #[test]
    fn same_slash_24_miss_different_third_octet() {
        let nics = vec![nic("192.168.1.10", 24)];
        assert!(!is_in_lan(ip("192.168.2.55"), &nics));
    }

    #[test]
    fn slash_16_hit() {
        let nics = vec![nic("10.0.0.1", 16)];
        assert!(is_in_lan(ip("10.0.255.5"), &nics));
    }

    #[test]
    fn slash_16_miss_out_of_range() {
        let nics = vec![nic("10.0.0.1", 16)];
        assert!(!is_in_lan(ip("10.1.0.5"), &nics));
    }

    #[test]
    fn multi_nic_second_hits() {
        let nics = vec![nic("10.0.0.1", 24), nic("192.168.1.10", 24)];
        assert!(is_in_lan(ip("192.168.1.99"), &nics));
    }

    #[test]
    fn empty_nics_returns_false() {
        let nics: Vec<LocalNic> = vec![];
        assert!(!is_in_lan(ip("192.168.1.55"), &nics));
    }

    #[test]
    fn public_internet_ip_rejected() {
        let nics = vec![nic("192.168.1.10", 24)];
        assert!(!is_in_lan(ip("8.8.8.8"), &nics));
    }

    #[test]
    fn ipv6_remote_rejected() {
        let nics = vec![nic("192.168.1.10", 24)];
        assert!(!is_in_lan(ip("::1"), &nics));
    }

    #[test]
    fn nic_own_ip_is_in_its_own_subnet() {
        // sanity: 网卡自己的 IP 必然 in lan
        let nics = vec![nic("192.168.1.10", 24)];
        assert!(is_in_lan(ip("192.168.1.10"), &nics));
    }

    #[test]
    fn slash_32_host_route_only_matches_self() {
        // /32 子网只包含自己
        let nics = vec![nic("192.168.1.10", 32)];
        assert!(is_in_lan(ip("192.168.1.10"), &nics));
        assert!(!is_in_lan(ip("192.168.1.11"), &nics));
    }
}
