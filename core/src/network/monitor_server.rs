/// Lightweight async HTTP monitoring server for "available" mode.
///
/// Binds to 0.0.0.0:9010 when a machine is in AVAILABLE role.
/// Serves:
///   GET /ping        → {"ok":true,"machine":"hostname","ip":"..."}
///   GET /data        → {"ok":true,"data": <latest FluffyMessage snapshot>}
///   GET /connections → {"ok":true,"admins": [...]}
///
/// The admin side (another Fluffy instance in ADMIN role) polls /data every 2s
/// using reqwest (already a dep). Results are fed back through IPC to Python brain.
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use once_cell::sync::Lazy;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, RwLock};

// ─── Shared state ─────────────────────────────────────────────────────────────

/// Latest system snapshot — written by main loop, read by /data handler.
pub static LATEST_SNAPSHOT: Lazy<RwLock<Option<serde_json::Value>>> =
    Lazy::new(|| RwLock::new(None));

/// Admin IPs that polled recently: ip → last_seen_unix_secs
pub static ADMIN_CONNECTIONS: Lazy<Mutex<HashMap<String, u64>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Whether the server task is currently running.
static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

const ADMIN_TIMEOUT_SECS: u64 = 10;

// ─── Public API ───────────────────────────────────────────────────────────────

/// Write the latest telemetry snapshot (called from main loop every 2s).
pub async fn update_snapshot(val: serde_json::Value) {
    let mut w = LATEST_SNAPSHOT.write().await;
    *w = Some(val);
}

/// True if the server is currently listening.
pub fn is_running() -> bool {
    SERVER_RUNNING.load(Ordering::Relaxed)
}

/// Start the monitor HTTP server on port 9010.
/// Spawns a Tokio task. Returns immediately.
pub fn start(port: u16) {
    if SERVER_RUNNING.swap(true, Ordering::SeqCst) {
        println!("[MonitorServer] Already running on port {}", port);
        return;
    }
    tokio::spawn(async move {
        let addr = format!("0.0.0.0:{}", port);
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => {
                println!("[MonitorServer] Listening on {}", addr);
                l
            }
            Err(e) => {
                eprintln!("[MonitorServer] Failed to bind {}: {}", addr, e);
                SERVER_RUNNING.store(false, Ordering::SeqCst);
                return;
            }
        };

        while SERVER_RUNNING.load(Ordering::Relaxed) {
            match tokio::time::timeout(Duration::from_millis(200), listener.accept()).await {
                Ok(Ok((stream, peer))) => {
                    tokio::spawn(handle(stream, peer));
                }
                Ok(Err(e)) => {
                    eprintln!("[MonitorServer] Accept error: {}", e);
                    break;
                }
                Err(_) => {} // timeout — loop and check SERVER_RUNNING
            }
        }

        println!("[MonitorServer] Stopped.");
    });
}

/// Stop the monitor HTTP server.
pub fn stop() {
    SERVER_RUNNING.store(false, Ordering::SeqCst);
    println!("[MonitorServer] Stop requested.");
}

// ─── Admin connection tracking ────────────────────────────────────────────────

async fn record_admin(ip: &str) {
    let now = unix_secs();
    let mut map = ADMIN_CONNECTIONS.lock().await;
    map.insert(ip.to_string(), now);
}

pub async fn get_active_admins() -> Vec<String> {
    let now = unix_secs();
    let mut map = ADMIN_CONNECTIONS.lock().await;
    map.retain(|_, &mut ts| now.saturating_sub(ts) <= ADMIN_TIMEOUT_SECS);
    map.keys().cloned().collect()
}

fn unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

async fn handle(stream: TcpStream, peer: SocketAddr) {
    let peer_ip = peer.ip().to_string();
    let mut buf_reader = BufReader::new(stream);

    let mut request_line = String::new();
    if buf_reader.read_line(&mut request_line).await.is_err() {
        return;
    }
    // Drain headers
    loop {
        let mut header = String::new();
        match buf_reader.read_line(&mut header).await {
            Ok(n) if n <= 2 => break, // blank line = end of headers
            Ok(0) | Err(_) => return,
            _ => {}
        }
    }

    // Parse method and path from "GET /path HTTP/1.1"
    let parts: Vec<&str> = request_line.trim().splitn(3, ' ').collect();
    if parts.len() < 2 {
        return;
    }
    let path = parts[1];

    let (status, body) = match path {
        "/ping" => {
            let hostname = hostname::get()
                .map(|h| h.to_string_lossy().into_owned())
                .unwrap_or_else(|_| "unknown".to_string());
            let ip = get_local_ip();
            (200, serde_json::json!({"ok": true, "machine": hostname, "ip": ip}).to_string())
        }
        "/data" => {
            record_admin(&peer_ip).await;
            let snap = LATEST_SNAPSHOT.read().await;
            match snap.as_ref() {
                Some(v) => (200, serde_json::json!({"ok": true, "data": v}).to_string()),
                None => (200, serde_json::json!({"ok": true, "data": null}).to_string()),
            }
        }
        "/connections" => {
            let admins = get_active_admins().await;
            (200, serde_json::json!({"ok": true, "admins": admins}).to_string())
        }
        _ => (404, serde_json::json!({"error": "not found"}).to_string()),
    };

    let response = format!(
        "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {len}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{body}",
        status = status,
        len = body.len(),
        body = body
    );

    let stream = buf_reader.into_inner();
    let mut stream = stream;
    let _ = stream.write_all(response.as_bytes()).await;
}

fn get_local_ip() -> String {
    // UDP trick: connect to external addr (no data sent), read local socket addr
    use std::net::UdpSocket;
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

// ─── Admin client poller ──────────────────────────────────────────────────────

/// Per-machine admin poll state.
#[derive(Debug, Clone)]
pub struct RemoteMachine {
    pub machine_id: String,
    pub ip: String,
    pub port: u16,
    pub name: String,
    pub online: bool,
    pub last_seen: u64,
    pub last_data: Option<serde_json::Value>,
}

impl RemoteMachine {
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "machine_id": self.machine_id,
            "ip": self.ip,
            "port": self.port,
            "name": self.name,
            "online": self.online,
            "last_seen": self.last_seen,
        })
    }
}

/// Global registry of admin-connected remote machines.
pub static REMOTE_MACHINES: Lazy<Mutex<HashMap<String, RemoteMachine>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Connect to a remote machine and start polling its /data endpoint every 2s.
/// Returns (ok, machine_id_or_error).
pub async fn admin_connect(ip: String, port: u16) -> (bool, String) {
    // Sanitize
    let ip = ip
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_string();

    if ip.is_empty() {
        return (false, "Invalid IP address".to_string());
    }

    // Ping first
    let ping_url = format!("http://{}:{}/ping", ip, port);
    let machine_name = match ping_remote(&ping_url).await {
        Ok(name) => name,
        Err(e) => return (false, format!("Cannot reach {}:{} — {}", ip, port, e)),
    };

    let machine_id = uuid::Uuid::new_v4().to_string()[..8].to_string();

    {
        let mut machines = REMOTE_MACHINES.lock().await;
        machines.insert(
            machine_id.clone(),
            RemoteMachine {
                machine_id: machine_id.clone(),
                ip: ip.clone(),
                port,
                name: machine_name.clone(),
                online: true,
                last_seen: unix_secs(),
                last_data: None,
            },
        );
    }

    // Spawn background poll task
    let mid = machine_id.clone();
    let poll_ip = ip.clone();
    tokio::spawn(async move {
        let data_url = format!("http://{}:{}/data", poll_ip, port);
        loop {
            // Check if still registered
            let still_registered = {
                let machines = REMOTE_MACHINES.lock().await;
                machines.contains_key(&mid)
            };
            if !still_registered {
                break;
            }

            match fetch_remote_data(&data_url).await {
                Ok(data) => {
                    let mut machines = REMOTE_MACHINES.lock().await;
                    if let Some(m) = machines.get_mut(&mid) {
                        m.online = true;
                        m.last_seen = unix_secs();
                        m.last_data = Some(data.clone());
                    }
                    // Broadcast via IPC so Python brain sees it
                    crate::ipc::server::IpcServer::broadcast_global(
                        &crate::ipc::protocol::IpcMessage {
                            schema_version: "1.0".to_string(),
                            payload: serde_json::json!({
                                "type": "remote_telemetry",
                                "machine_id": mid,
                                "data": data
                            }),
                        },
                    );
                }
                Err(_) => {
                    let mut machines = REMOTE_MACHINES.lock().await;
                    if let Some(m) = machines.get_mut(&mid) {
                        m.online = false;
                    }
                }
            }

            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });

    println!("[MonitorServer] Admin connected to {} ({}) id={}", machine_name, ip, machine_id);
    (true, machine_id)
}

/// Disconnect from a remote machine (stops polling).
pub async fn admin_disconnect(machine_id: &str) -> bool {
    let mut machines = REMOTE_MACHINES.lock().await;
    machines.remove(machine_id).is_some()
}

/// Disconnect all remote machines.
pub async fn admin_disconnect_all() -> usize {
    let mut machines = REMOTE_MACHINES.lock().await;
    let count = machines.len();
    machines.clear();
    count
}

/// Return JSON list of all connected remote machines.
pub async fn admin_list_machines() -> Vec<serde_json::Value> {
    let machines = REMOTE_MACHINES.lock().await;
    machines.values().map(|m| m.to_json()).collect()
}

async fn ping_remote(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        let name = body
            .get("machine")
            .and_then(|v| v.as_str())
            .unwrap_or("remote")
            .to_string();
        Ok(name)
    } else {
        Err(body.get("error").and_then(|v| v.as_str()).unwrap_or("unknown").to_string())
    }
}

async fn fetch_remote_data(url: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        Ok(body.get("data").cloned().unwrap_or(serde_json::Value::Null))
    } else {
        Err("Remote returned not ok".to_string())
    }
}
