use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{mpsc, Mutex};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;
use once_cell::sync::Lazy;

use crate::terminal::app_state::SharedState;
use crate::terminal::repl;

type TxMap = Arc<Mutex<HashMap<SocketAddr, mpsc::UnboundedSender<Message>>>>;

static WS_PEERS: Lazy<TxMap> = Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// Start the WebSocket bridge server on port 9003
pub async fn start_ws_bridge(state: SharedState) {
    let addr = "127.0.0.1:9003";
    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[WS Bridge] Failed to bind to {}: {}", addr, e);
            return;
        }
    };
    println!("[WS Bridge] Server running on {}", addr);

    // Spawn background task to listen for app state output broadcasts
    let state_clone = Arc::clone(&state);
    tokio::spawn(async move {
        let mut rx = {
            let st = state_clone.lock().await;
            st.tx_output.subscribe()
        };

        while let Ok(line) = rx.recv().await {
            // Broadcast the new output line to all WS connections
            let msg = serde_json::json!({
                "type": "output",
                "tag": line.tag,
                "text": line.text,
                "color_tag": line.color_tag,
                "timestamp": line.timestamp,
            });

            if let Ok(text) = serde_json::to_string(&msg) {
                broadcast_ws_message(Message::Text(text)).await;
            }
        }
    });

    // Accept incoming WS connections
    while let Ok((stream, peer_addr)) = listener.accept().await {
        let state_clone = Arc::clone(&state);
        tokio::spawn(handle_ws_connection(stream, peer_addr, state_clone));
    }
}

async fn handle_ws_connection(
    stream: tokio::net::TcpStream,
    peer_addr: SocketAddr,
    state: SharedState,
) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("[WS Bridge] Handshake failed for {}: {}", peer_addr, e);
            return;
        }
    };

    let (mut ws_writer, mut ws_reader) = ws_stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Register peer
    {
        let mut peers = WS_PEERS.lock().await;
        peers.insert(peer_addr, tx);
    }

    // Spawn peer writer task
    let peer_addr_clone = peer_addr;
    let writer_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_writer.send(msg).await.is_err() {
                break;
            }
        }
        // Connection closed cleanup
        let mut peers = WS_PEERS.lock().await;
        peers.remove(&peer_addr_clone);
    });

    // Send initial state on connection
    send_initial_state(&peer_addr, &state).await;

    // Read incoming WS messages
    while let Some(Ok(msg)) = ws_reader.next().await {
        if let Message::Text(text) = msg {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some("command") = val.get("type").and_then(|v| v.as_str()) {
                    if let Some(cmd_text) = val.get("text").and_then(|v| v.as_str()) {
                        // Execute command in REPL
                        repl::process_input(&state, cmd_text).await;
                        // Broadcast client list and prompt updates after execution
                        notify_state_changed(&state).await;
                    }
                }
            }
        }
    }

    writer_task.abort();
}

async fn send_initial_state(peer_addr: &SocketAddr, state: &SharedState) {
    let st = state.lock().await;
    
    // 1. Send status
    let status_msg = serde_json::json!({
        "type": "status",
        "admin_port": st.admin_port,
        "client_count": st.clients.len(),
        "mode": st.mode,
    });
    if let Ok(txt) = serde_json::to_string(&status_msg) {
        send_to_peer(peer_addr, Message::Text(txt)).await;
    }

    // 2. Send prompt
    let prompt_msg = serde_json::json!({
        "type": "prompt",
        "text": st.prompt(),
    });
    if let Ok(txt) = serde_json::to_string(&prompt_msg) {
        send_to_peer(peer_addr, Message::Text(txt)).await;
    }

    // 3. Send client list
    let clients: Vec<serde_json::Value> = st.clients.values().map(|c| {
        serde_json::json!({
            "tag": c.tag,
            "hostname": c.hostname,
            "os": c.os,
            "os_version": c.os_version,
            "ip": c.ip,
            "arch": c.arch,
            "connected_at": c.connected_at,
        })
    }).collect();

    let client_list_msg = serde_json::json!({
        "type": "client_list",
        "clients": clients,
    });
    if let Ok(txt) = serde_json::to_string(&client_list_msg) {
        send_to_peer(peer_addr, Message::Text(txt)).await;
    }

    // 4. Send output history so terminal isn't blank
    for line in &st.output_lines {
        let line_msg = serde_json::json!({
            "type": "output",
            "tag": line.tag,
            "text": line.text,
            "color_tag": line.color_tag,
            "timestamp": line.timestamp,
        });
        if let Ok(txt) = serde_json::to_string(&line_msg) {
            send_to_peer(peer_addr, Message::Text(txt)).await;
        }
    }
}

pub async fn notify_state_changed(state: &SharedState) {
    let st = state.lock().await;

    // Broadcast client list
    let clients: Vec<serde_json::Value> = st.clients.values().map(|c| {
        serde_json::json!({
            "tag": c.tag,
            "hostname": c.hostname,
            "os": c.os,
            "os_version": c.os_version,
            "ip": c.ip,
            "arch": c.arch,
            "connected_at": c.connected_at,
        })
    }).collect();

    let client_list_msg = serde_json::json!({
        "type": "client_list",
        "clients": clients,
    });
    if let Ok(txt) = serde_json::to_string(&client_list_msg) {
        broadcast_ws_message(Message::Text(txt)).await;
    }

    // Broadcast prompt
    let prompt_msg = serde_json::json!({
        "type": "prompt",
        "text": st.prompt(),
    });
    if let Ok(txt) = serde_json::to_string(&prompt_msg) {
        broadcast_ws_message(Message::Text(txt)).await;
    }

    // Broadcast status
    let status_msg = serde_json::json!({
        "type": "status",
        "admin_port": st.admin_port,
        "client_count": st.clients.len(),
        "mode": st.mode,
    });
    if let Ok(txt) = serde_json::to_string(&status_msg) {
        broadcast_ws_message(Message::Text(txt)).await;
    }
}

async fn send_to_peer(addr: &SocketAddr, msg: Message) {
    let peers = WS_PEERS.lock().await;
    if let Some(tx) = peers.get(addr) {
        let _ = tx.send(msg);
    }
}

async fn broadcast_ws_message(msg: Message) {
    let peers = WS_PEERS.lock().await;
    for tx in peers.values() {
        let _ = tx.send(msg.clone());
    }
}
