use dashmap::DashMap;
use once_cell::sync::Lazy;

pub static NETWORK_DELTAS: Lazy<DashMap<u32, (u64, u64)>> = Lazy::new(DashMap::new);

pub struct NetworkMonitor;

impl NetworkMonitor {
    pub fn start() {
        // Native N1-N7 traffic rate telemetry (GetIfTable2 / TrafficRateCalculator) is the active engine.
    }
}

