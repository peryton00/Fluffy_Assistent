use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Emitter, Manager, WindowEvent};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};

struct AppState {
    python_child: Mutex<Option<Child>>,
}

fn get_env_path() -> Option<std::path::PathBuf> {
    let paths = vec![
        std::path::PathBuf::from(".env"),
        std::path::PathBuf::from("../../.env"),
        std::path::PathBuf::from("../../../.env"),
    ];
    for p in paths {
        if p.exists() {
            return Some(p);
        }
    }
    None
}

fn read_env_key(key: &str) -> Option<String> {
    let env_path = get_env_path()?;
    let content = std::fs::read_to_string(env_path).ok()?;
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            if k.trim() == key {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

async fn notify_python_ui_state(connected: bool) {
    let url = if connected {
        "http://127.0.0.1:5123/ui_connected"
    } else {
        "http://127.0.0.1:5123/ui_disconnected"
    };

    let token = read_env_key("FLUFFY_TOKEN").unwrap_or_else(|| "fluffy_dev_token".to_string());

    let client = reqwest::Client::new();
    let _ = client.post(url)
        .header("X-Fluffy-Token", token)
        .send()
        .await;
}

async fn notify_core_ui_state(active: bool) {
    use std::io::Write;
    use std::net::TcpStream;

    let cmd = serde_json::json!({
        "SetUiActive": { "active": active }
    });

    if let Ok(mut stream) = TcpStream::connect("127.0.0.1:9002") {
        let _ = writeln!(stream, "{}", cmd.to_string());
    }
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct DiskPayload {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_percent: f64,
    pub file_system: Option<String>,
    pub is_removable: Option<bool>,
}

#[tauri::command]
fn get_system_disks() -> Vec<DiskPayload> {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .map(|d| {
            let mount = d.mount_point().to_string_lossy().to_string();
            let total = d.total_space();
            let available = d.available_space();
            let used = total.saturating_sub(available);
            let used_pct = if total > 0 {
                (used as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            let name_str = d.name().to_string_lossy().to_string();
            let name = if name_str.is_empty() {
                mount.clone()
            } else {
                name_str
            };
            DiskPayload {
                name,
                mount_point: mount,
                total_bytes: total,
                available_bytes: available,
                used_percent: (used_pct * 10.0).round() / 10.0,
                file_system: Some(d.file_system().to_string_lossy().to_string()),
                is_removable: Some(d.is_removable()),
            }
        })
        .collect()
}

fn custom_base64_encode(input: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(CHARSET[((triple >> 18) & 0x3F) as usize] as char);
        out.push(CHARSET[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(CHARSET[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARSET[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn detect_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
        "image/jpeg"
    } else if bytes.len() >= 8 && &bytes[0..8] == b"\x89PNG\r\n\x1a\n" {
        "image/png"
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "image/jpeg"
    }
}

#[tauri::command]
fn get_system_wallpaper() -> Option<String> {
    // 1. Windows Platform Detection
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let transcoded = std::path::PathBuf::from(&appdata)
                .join("Microsoft")
                .join("Windows")
                .join("Themes")
                .join("TranscodedWallpaper");
            if transcoded.exists() {
                if let Ok(bytes) = std::fs::read(&transcoded) {
                    let mime = detect_image_mime(&bytes);
                    let b64 = custom_base64_encode(&bytes);
                    return Some(format!("data:{};base64,{}", mime, b64));
                }
            }

            // Fallback: search CachedFiles directory
            let cached_dir = std::path::PathBuf::from(appdata)
                .join("Microsoft")
                .join("Windows")
                .join("Themes")
                .join("CachedFiles");
            if let Ok(entries) = std::fs::read_dir(cached_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Ok(bytes) = std::fs::read(&path) {
                            let mime = detect_image_mime(&bytes);
                            let b64 = custom_base64_encode(&bytes);
                            return Some(format!("data:{};base64,{}", mime, b64));
                        }
                    }
                }
            }
        }
    }

    // 2. macOS Platform Detection
    #[cfg(target_os = "macos")]
    {
        // Try querying macOS desktop picture via AppleScript
        let script = r#"tell application "System Events" to get picture of current desktop"#;
        if let Ok(output) = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
        {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let path = std::path::PathBuf::from(&path_str);
                if path.exists() {
                    if let Ok(bytes) = std::fs::read(&path) {
                        let mime = detect_image_mime(&bytes);
                        let b64 = custom_base64_encode(&bytes);
                        return Some(format!("data:{};base64,{}", mime, b64));
                    }
                }
            }
        }

        // Fallback standard macOS desktop pictures
        let default_paths = [
            "/System/Library/CoreServices/DefaultDesktop.heic",
            "/Library/Desktop Pictures/Solid Colors/Stone.png",
        ];
        for p in &default_paths {
            let path = std::path::PathBuf::from(p);
            if path.exists() {
                if let Ok(bytes) = std::fs::read(&path) {
                    let mime = detect_image_mime(&bytes);
                    let b64 = custom_base64_encode(&bytes);
                    return Some(format!("data:{};base64,{}", mime, b64));
                }
            }
        }
    }

    // 3. Linux Platform Detection (GNOME, Cinnamon, MATE, XFCE, KDE)
    #[cfg(target_os = "linux")]
    {
        // GNOME / Unity / Cinnamon
        let gsettings_queries = [
            ("org.gnome.desktop.background", "picture-uri-dark"),
            ("org.gnome.desktop.background", "picture-uri"),
            ("org.cinnamon.desktop.background", "picture-uri"),
            ("org.mate.background", "picture-filename"),
        ];

        for (schema, key) in &gsettings_queries {
            if let Ok(output) = std::process::Command::new("gsettings")
                .args(["get", schema, key])
                .output()
            {
                if output.status.success() {
                    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    let cleaned = raw.trim_matches('\'').trim_matches('"');
                    let file_path = cleaned.strip_prefix("file://").unwrap_or(cleaned);
                    let path = std::path::PathBuf::from(file_path);
                    if path.exists() {
                        if let Ok(bytes) = std::fs::read(&path) {
                            let mime = detect_image_mime(&bytes);
                            let b64 = custom_base64_encode(&bytes);
                            return Some(format!("data:{};base64,{}", mime, b64));
                        }
                    }
                }
            }
        }

        // XFCE query
        if let Ok(output) = std::process::Command::new("xfconf-query")
            .args(["-c", "xfce4-desktop", "-p", "/backdrop/screen0/monitor0/workspace0/last-image"])
            .output()
        {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let path = std::path::PathBuf::from(&path_str);
                if path.exists() {
                    if let Ok(bytes) = std::fs::read(&path) {
                        let mime = detect_image_mime(&bytes);
                        let b64 = custom_base64_encode(&bytes);
                        return Some(format!("data:{};base64,{}", mime, b64));
                    }
                }
            }
        }
    }

    None
}


#[tauri::command]
fn graceful_shutdown(app: tauri::AppHandle) {
    println!("[Fluffy Rust] Graceful shutdown requested from Frontend");
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![graceful_shutdown, get_system_disks, get_system_wallpaper])
        .manage(AppState {
            python_child: Mutex::new(None),
        })
        .setup(|app| {
            println!("[Fluffy Rust] Current working directory: {:?}", std::env::current_dir().unwrap_or_default());
            
            // Check if running in production (installed) mode
            let is_production = std::path::Path::new(".env").exists();

            if is_production {
                println!("[Fluffy Rust] Running in production mode. Skipping Python backend spawn (managed by Core).");
            } else {
                // 1. Start Python backend
                let python_script = "../../../brain/listener.py";
                println!("[Fluffy Rust] Attempting to spawn Python backend with script: {}", python_script);

                // 1a. Build list of potential python executables
                let mut python_commands = Vec::new();

                // Try local venv first (Industry standard)
                let venv_python = "../../../.venv/Scripts/python.exe";
                if std::path::Path::new(venv_python).exists() {
                    println!("[Fluffy Rust] Found local virtual environment at: {}", venv_python);
                    python_commands.push(venv_python.to_string());
                }

                // Fallback to system commands
                python_commands.extend(vec!["python".to_string(), "python3".to_string(), "py".to_string()]);

                let mut spawned = false;
                for cmd in python_commands {
                    println!("[Fluffy Rust] Trying command: {}", cmd);
                    let child = Command::new(&cmd)
                        .arg(python_script)
                        .spawn();

                    match child {
                        Ok(c) => {
                            if let Ok(mut lock) = app.state::<AppState>().python_child.lock() {
                                *lock = Some(c);
                            }
                            println!("[Fluffy Rust] Python backend spawned successfully using '{}'.", cmd);
                            spawned = true;
                            break;
                        }
                        Err(e) => {
                            println!("[Fluffy Rust] Command '{}' failed to start: {}", cmd, e);
                        }
                    }
                }

                if !spawned {
                    eprintln!("[Fluffy Rust] CRITICAL: Failed to spawn Python backend with any command. Path attempted: {}", python_script);
                }
            }

            // 2. Ensure main window is visible
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                println!("[Fluffy Rust] Main window visible and focused.");
                tauri::async_runtime::spawn(async move {
                    notify_python_ui_state(true).await;
                    notify_core_ui_state(true).await;
                });
            }

            // 3. Setup System Tray
            let quit_i = MenuItem::with_id(app, "quit", "Quit Fluffy", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Open Dashboard", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let icon_bytes = include_bytes!("../icons/icon.ico");
            let icon = tauri::image::Image::from_bytes(icon_bytes).expect("failed to load icon");

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = app.emit("ui-active", true); // Notify Frontend
                            tauri::async_runtime::spawn(async move {
                                notify_python_ui_state(true).await;
                                notify_core_ui_state(true).await;
                            });
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = app.emit("ui-active", true); // Notify Frontend
                            tauri::async_runtime::spawn(async move {
                                notify_python_ui_state(true).await;
                                notify_core_ui_state(true).await;
                            });
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                window.hide().unwrap();
                api.prevent_close();
                let _ = window.emit("ui-active", false); // Notify Frontend
                tauri::async_runtime::spawn(async move {
                    notify_python_ui_state(false).await;
                    notify_core_ui_state(false).await;
                });
            }
            _ => {}
        })
        .build(context)
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            if let Ok(mut lock) = app_handle.state::<AppState>().python_child.lock() {
                if let Some(mut child) = lock.take() {
                    println!("[Fluffy Rust] Killing Python backend...");
                    let _ = child.kill();
                }
            }
        }
    });
}
