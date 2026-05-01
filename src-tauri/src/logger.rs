use std::fs;
use std::path::PathBuf;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

fn log_dir() -> PathBuf {
    let home = dirs_next().unwrap_or_else(|| PathBuf::from("/tmp"));
    home.join("Library/Logs/TypeBridge")
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

pub fn init_file_logger() {
    let dir = log_dir();
    let _ = fs::create_dir_all(&dir);

    let file_appender = RollingFileAppender::new(Rotation::DAILY, &dir, "typebridge");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Leak the guard so it lives for the process lifetime
    Box::leak(Box::new(_guard));

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(fmt::layer().with_writer(non_blocking).with_ansi(false))
        .with(fmt::layer().with_writer(std::io::stderr))
        .init();
}

pub fn cleanup_old_logs() {
    let dir = log_dir();
    let cutoff = std::time::SystemTime::now()
        - std::time::Duration::from_secs(30 * 24 * 3600);

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if let Ok(modified) = meta.modified() {
                    if modified < cutoff {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub fn get_log_dir() -> String {
    log_dir().to_string_lossy().into_owned()
}
