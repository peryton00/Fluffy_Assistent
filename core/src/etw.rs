use dashmap::DashMap;
use once_cell::sync::Lazy;

pub static NETWORK_DELTAS: Lazy<DashMap<u32, (u64, u64)>> = Lazy::new(DashMap::new);

pub struct NetworkMonitor;

impl NetworkMonitor {
    pub fn start() {
        #[cfg(target_os = "windows")]
        println!("[Fluffy Core] Network Monitor (Stub) initiated. Network stats will be zeroed.");
        #[cfg(not(target_os = "windows"))]
        println!("[Fluffy Core] Network Monitor (Linux stub) - ETW not available on this platform.");
    }
}
