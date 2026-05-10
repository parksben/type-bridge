//! 关于 TypeBridge tab 的后端支持：版本号 + 检查更新 + 应用更新（半自动）。
//!
//! # 流程
//!
//! 1. 前端 AboutTab 启动时 invoke `get_app_version` 拿版本号文案
//! 2. 用户点「检查更新」→ invoke `check_update`
//!    - dev 构建用于联调：优先复用官网版本信息并强制判定有更新
//!    - release 构建 fetch 官网 `/api/latest-version` → 比版本号
//! 3. 有新版 → 前端 About 页顶部状态栏展示「立即下载」
//! 4. 用户点下载 → invoke `start_update_download`
//!    - 后台流式下载新版 .dmg 到 `~/Downloads/`
//!    - 过程中持续 emit `typebridge://update-download-state`
//!    - 用户可随时 invoke `cancel_update_download` 取消
//! 5. 下载完成后调系统 `open <dmg>` 挂载并打开 Finder，再 `app.exit(0)`
//! 6. 用户在 Finder 里把新版 .app 拖入「应用程序」文件夹覆盖旧版
//!
//! # 为什么不全自动 relaunch
//!
//! 完整 auto-update 需要 `tauri-plugin-updater` + Apple Developer 签名 / 自签
//! ed25519 公私钥对 + CI 集成。当前 v0.7.x 优先打通链路，签名基建放后续版本。
//! 见 docs/REQUIREMENTS.md §2.11.5。

use std::{
    path::PathBuf,
    sync::{Mutex, OnceLock},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

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
    let has_update = if cfg!(debug_assertions) {
        // DEV 联调模式：只要能拿到可下载的新包信息，就强制展示为"可更新"。
        // 这样每次都能走完整的下载/取消/失败/重试链路验证。
        download_url.is_some()
    } else {
        is_newer_version(&payload.version, &current)
    };

    Ok(UpdateCheckResult {
        is_dev: cfg!(debug_assertions),
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
// 命令：start_update_download / cancel_update_download
// ──────────────────────────────────────────────────────────────

struct ActiveDownloadTask {
    cancel_token: CancellationToken,
}

static UPDATE_DOWNLOAD_TASK: OnceLock<Mutex<Option<ActiveDownloadTask>>> = OnceLock::new();

fn download_task_slot() -> &'static Mutex<Option<ActiveDownloadTask>> {
    UPDATE_DOWNLOAD_TASK.get_or_init(|| Mutex::new(None))
}

fn clear_active_download_task() {
    if let Ok(mut guard) = download_task_slot().lock() {
        *guard = None;
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "phase", rename_all = "kebab-case")]
enum UpdateDownloadEvent {
    Starting {
        version: String,
    },
    Downloading {
        version: String,
        downloaded: u64,
        total: Option<u64>,
        percent: Option<f32>,
    },
    Opening {
        version: String,
        downloaded: u64,
        total: Option<u64>,
        percent: Option<f32>,
    },
    Failed {
        version: String,
        reason: String,
    },
    Cancelled {
        version: String,
    },
}

fn emit_update_download_state(app: &AppHandle, payload: UpdateDownloadEvent) {
    let _ = app.emit("typebridge://update-download-state", payload);
}

#[tauri::command]
pub fn start_update_download(
    app: AppHandle,
    download_url: String,
    version: String,
) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err("dev 构建不支持自动更新".to_string());
    }

    let cancel_token = CancellationToken::new();
    {
        let mut guard = download_task_slot()
            .lock()
            .map_err(|_| "下载任务状态锁定失败".to_string())?;
        if guard.is_some() {
            return Err("已有进行中的更新下载任务".to_string());
        }
        *guard = Some(ActiveDownloadTask {
            cancel_token: cancel_token.clone(),
        });
    }

    tauri::async_runtime::spawn(async move {
        let result = run_update_download_task(&app, &download_url, &version, cancel_token).await;
        if let Err(reason) = result {
            emit_update_download_state(
                &app,
                UpdateDownloadEvent::Failed {
                    version: version.clone(),
                    reason,
                },
            );
        }
        clear_active_download_task();
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_update_download() -> Result<(), String> {
    let guard = download_task_slot()
        .lock()
        .map_err(|_| "下载任务状态锁定失败".to_string())?;

    if let Some(task) = guard.as_ref() {
        task.cancel_token.cancel();
        Ok(())
    } else {
        Err("当前没有进行中的更新下载任务".to_string())
    }
}

async fn run_update_download_task(
    app: &AppHandle,
    download_url: &str,
    version: &str,
    cancel_token: CancellationToken,
) -> Result<(), String> {
    emit_update_download_state(
        app,
        UpdateDownloadEvent::Starting {
            version: version.to_string(),
        },
    );

    // 1. 下载到 ~/Downloads/{filename}
    let downloads_dir = dirs::download_dir()
        .ok_or_else(|| "无法定位 ~/Downloads 目录".to_string())?;
    std::fs::create_dir_all(&downloads_dir)
        .map_err(|e| format!("创建 Downloads 目录失败：{}", e))?;

    let filename = filename_from_url(download_url);
    let target_path: PathBuf = downloads_dir.join(filename);

    let outcome = download_to_file(app, download_url, version, &target_path, &cancel_token).await?;
    let (downloaded, total) = match outcome {
        DownloadWriteOutcome::Cancelled => {
            remove_partial_file(&target_path);
            emit_update_download_state(
                app,
                UpdateDownloadEvent::Cancelled {
                    version: version.to_string(),
                },
            );
            return Ok(());
        }
        DownloadWriteOutcome::Completed { downloaded, total } => (downloaded, total),
    };

    emit_update_download_state(
        app,
        UpdateDownloadEvent::Opening {
            version: version.to_string(),
            downloaded,
            total: total.or(Some(downloaded)),
            percent: Some(100.0),
        },
    );

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

fn remove_partial_file(target: &PathBuf) {
    if target.exists() {
        let _ = std::fs::remove_file(target);
    }
}

fn filename_from_url(url: &str) -> String {
    url.rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("TypeBridge-update.dmg")
        .to_string()
}

enum DownloadWriteOutcome {
    Completed { downloaded: u64, total: Option<u64> },
    Cancelled,
}

async fn download_to_file(
    app: &AppHandle,
    url: &str,
    version: &str,
    target: &PathBuf,
    cancel_token: &CancellationToken,
) -> Result<DownloadWriteOutcome, String> {
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

    let total = resp.content_length();

    let mut file = std::fs::File::create(target)
        .map_err(|e| format!("创建下载文件失败：{}", e))?;

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;

    loop {
        let next_chunk = tokio::select! {
            _ = cancel_token.cancelled() => {
                return Ok(DownloadWriteOutcome::Cancelled);
            }
            item = stream.next() => item,
        };

        let Some(chunk) = next_chunk else {
            break;
        };
        let bytes = chunk.map_err(|e| format!("下载流中断：{}", e))?;
        downloaded += bytes.len() as u64;
        file.write_all(&bytes)
            .map_err(|e| format!("写入下载文件失败：{}", e))?;

        let percent = total.map(|t| {
            if t == 0 {
                100.0f32
            } else {
                (downloaded as f32 / t as f32 * 100.0).min(99.9)
            }
        });
        emit_update_download_state(
            app,
            UpdateDownloadEvent::Downloading {
                version: version.to_string(),
                downloaded,
                total,
                percent,
            },
        );
    }

    Ok(DownloadWriteOutcome::Completed { downloaded, total })
}
