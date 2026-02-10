use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Emitter, Manager, WindowEvent};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};

struct AppState {
    python_child: Mutex<Option<Child>>,
}

async fn notify_python_ui_state(connected: bool) {
    let url = if connected {
        "http://127.0.0.1:5123/ui_connected"
    } else {
        "http://127.0.0.1:5123/ui_disconnected"
    };

    let client = reqwest::Client::new();
    let _ = client.post(url).send().await;
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
        .invoke_handler(tauri::generate_handler![graceful_shutdown])
        .manage(AppState {
            python_child: Mutex::new(None),
        })
        .setup(|app| {
            println!("[Fluffy Rust] Current working directory: {:?}", std::env::current_dir().unwrap_or_default());
            // 1. Start Python backend
            let python_script = "../../../brain/listener.py";
            let python_commands = ["python", "python3", "py"];
            let mut spawned = false;

            println!("[Fluffy Rust] Attempting to spawn Python backend with script: {}", python_script);

            for cmd in python_commands {
                println!("[Fluffy Rust] Trying command: {}", cmd);
                let child = Command::new(cmd)
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

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
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
