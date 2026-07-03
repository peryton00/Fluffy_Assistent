use fluffy_core::terminal::app_state::new_shared_state;
use fluffy_core::terminal::client_agent::run_client_agent;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        println!("Fluffy Client Agent");
        println!("Usage: fluffy-client <admin_ip> [port]");
        return;
    }

    let admin_ip = args[1].clone();
    let port = args.get(2).cloned().unwrap_or_else(|| "9000".to_string());
    let admin_addr = format!("{}:{}", admin_ip, port);

    println!("[Fluffy Client] Starting client agent...");
    println!("[Fluffy Client] Will connect to admin server at {}", admin_addr);

    let state = new_shared_state();
    
    {
        let mut st = state.lock().await;
        st.admin_port = port.parse().unwrap_or(9000);
    }

    run_client_agent(state, admin_addr).await;
}
