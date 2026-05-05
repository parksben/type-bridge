//! 关于 TypeBridge tab 的后端支持：版本号 + 检查更新 + 应用更新（半自动）。
//!
//! # 流程
//!
//! 1. 前端 AboutTab 启动时 invoke `get_app_version` 拿版本号文案
//! 2. 用户点「检查更新」→ invoke `check_update`
//!    - dev 构建直接返回 `is_dev=true`，前端展示「已是最新版」
//!    - release 构建 fetch 官网 `/api/latest-version` → 比版本号
//! 3. 有新版 → 前端弹「确认更新」对话框 → invoke `apply_update`
//!    - 下载新版 .dmg 到 `~/Downloads/`
//!    - 调系统 `open <dmg>` 挂载并打开 Finder
//!    - 调用 `app.exit(0)` 退出应用
//! 4. 用户在 Finder 里把新版 .app 拖入「应用程序」文件夹覆盖旧版
//!
//! # 为什么不全自动 relaunch
//!
//! 完整 auto-update 需要 `tauri-plugin-updater` + Apple Developer 签名 / 自签
//! ed25519 公私钥对 + CI 集成。当前 v0.7.x 优先打通链路，签名基建放后续版本。
//! 见 docs/REQUIREMENTS.md §2.11.5。

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const LATEST_VERSION_API: &str = "https://typebridge.parksben.xyz/api/latest-version";
const NETWORK_TIMEOUT_SECS: u64 = 15;

/// dev 构建展示的版本字符串。和 REQUIREMENTS §2.11.1 / 前端 AboutTab 对齐。
const DEV_VERSION_LABEL: &str = "dev:latest";

// ──────────────────────────────────────────────────────────────
// 命令：get_app_version
// ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_app_version() -> String {
    if cfg!(debug_assertions) {
        DEV_VERSION_LABEL.to_string()
    } else {
        env!("CARGO_PKG_VERSION").to_string()
    }
}

// ──────────────────────────────────────────────────────────────
// 命令：check_update
// ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct UpdateCheckResult {
    pub is_dev: bool,
    pub current: String,
    pub latest: Option<String>,
    pub has_update: bool,
    pub download_url: Option<String>,
    pub notes: Option<String>,
}

/// 官网 /api/latest-version 的 response shape。和
/// website/app/api/latest-version/route.ts 对齐。
#[derive(Debug, Deserialize)]
struct LatestVersionResp {
    version: String,
    #[serde(default)]
    notes: Option<String>,
    download_urls: DownloadUrls,
}

#[derive(Debug, Deserialize)]
struct DownloadUrls {
    #[serde(default)]
    aarch64: Option<String>,
    #[serde(default)]
    x64: Option<String>,
}

#[tauri::command]
pub async fn check_update() -> Result<UpdateCheckResult, String> {
    let current = if cfg!(debug_assertions) {
        DEV_VERSION_LABEL.to_string()
    } else {
        env!("CARGO_PKG_VERSION").to_string()
    };

    if cfg!(debug_assertions) {
        return Ok(UpdateCheckResult {
            is_dev: true,
            current,
            latest: None,
            has_update: false,
            download_url: None,
            notes: None,
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(NETWORK_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("初始化 HTTP client 失败：{}", e))?;

    let resp = client
        .get(LATEST_VERSION_API)
        .send()
        .await
        .map_err(|e| format!("请求最新版本接口失败：{}", e))?;

    if !resp.status().is_success() {
        return Err(format!("接口返回 {}", resp.status()));
    }

    let payload: LatestVersionResp = resp
        .json()
        .await
        .map_err(|e| format!("解析最新版本响应失败：{}", e))?;

    let download_url = pick_download_url(&payload.download_urls);
    let has_update = is_newer_version(&payload.version, &current);

    Ok(UpdateCheckResult {
        is_dev: false,
        current,
        latest: Some(payload.version),
        has_update,
        download_url,
        notes: payload.notes,
    })
}

fn pick_download_url(urls: &DownloadUrls) -> Option<String> {
    if cfg!(target_arch = "aarch64") {
        urls.aarch64.clone()
    } else if cfg!(target_arch = "x86_64") {
        urls.x64.clone()
    } else {
        None
    }
}

/// 简单的 semver 比较：把 "x.y.z" 拆成 (u32, u32, u32) 直接比。
/// 不支持 pre-release 标签（-alpha 等），release 版本足够用。
fn is_newer_version(latest: &str, current: &str) -> bool {
    let l = parse_semver(latest);
    let c = parse_semver(current);
    l > c
}

fn parse_semver(s: &str) -> (u32, u32, u32) {
    let s = s.trim_start_matches('v');
    let mut parts = s.split(|ch: char| ch == '.' || ch == '-').filter_map(|p| p.parse::<u32>().ok());
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

// ──────────────────────────────────────────────────────────────
// 命令：apply_update
// ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn apply_update(app: AppHandle, download_url: String) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err("dev 构建不支持自动更新".to_string());
    }

    // 1. 下载到 ~/Downloads/{filename}
    let downloads_dir = dirs::download_dir()
        .ok_or_else(|| "无法定位 ~/Downloads 目录".to_string())?;
    std::fs::create_dir_all(&downloads_dir)
        .map_err(|e| format!("创建 Downloads 目录失败：{}", e))?;

    let filename = filename_from_url(&download_url);
    let target_path: PathBuf = downloads_dir.join(filename);

    download_to_file(&download_url, &target_path).await?;

    // 2. 用系统 `open` 挂载 .dmg 并显示 Finder 卷
    std::process::Command::new("open")
        .arg(&target_path)
        .spawn()
        .map_err(|e| format!("打开 .dmg 失败：{}", e))?;

    tracing::info!("[about] 新版 .dmg 已下载并打开：{}", target_path.display());

    // 3. 退出应用，让用户在 Finder 中拖入「应用程序」覆盖
    app.exit(0);

    Ok(())
}

fn filename_from_url(url: &str) -> String {
    url.rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("TypeBridge-update.dmg")
        .to_string()
}

async fn download_to_file(url: &str, target: &PathBuf) -> Result<(), String> {
    use futures_util::StreamExt;
    use std::io::Write;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60 * 5)) // 5 分钟，覆盖慢网
        .build()
        .map_err(|e| format!("初始化 HTTP client 失败：{}", e))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("发起下载请求失败：{}", e))?;

    if !resp.status().is_success() {
        return Err(format!("下载失败：HTTP {}", resp.status()));
    }

    let mut file = std::fs::File::create(target)
        .map_err(|e| format!("创建下载文件失败：{}", e))?;

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("下载流中断：{}", e))?;
        file.write_all(&bytes)
            .map_err(|e| format!("写入下载文件失败：{}", e))?;
    }

    Ok(())
}
