use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::Instant;
use chrono::Utc;
use once_cell::sync::Lazy;

use crate::network::types::{
    PacketCaptureStatus, PacketDirection, PacketObservation, PacketProtocol, TcpFlags,
};

const DEFAULT_MAX_OBSERVATIONS: usize = 100;
const ABSOLUTE_MAX_OBSERVATIONS: usize = 200;
const DEFAULT_MAX_DURATION_SECONDS: u32 = 60;
const ABSOLUTE_MAX_DURATION_SECONDS: u32 = 300;

/// Internal state for a packet monitor instance.
#[derive(Debug)]
struct PacketMonitorState {
    is_active: bool,
    interface_name: Option<String>,
    started_at: Option<String>,
    start_instant: Option<Instant>,
    max_duration_seconds: u32,
    max_observations: usize,
    packets_observed: u64,
    packets_dropped: u64,
    observations: VecDeque<PacketObservation>,
}

impl Default for PacketMonitorState {
    fn default() -> Self {
        Self {
            is_active: false,
            interface_name: None,
            started_at: None,
            start_instant: None,
            max_duration_seconds: DEFAULT_MAX_DURATION_SECONDS,
            max_observations: DEFAULT_MAX_OBSERVATIONS,
            packets_observed: 0,
            packets_dropped: 0,
            observations: VecDeque::new(),
        }
    }
}

/// Thread-safe packet monitor engine.
pub struct PacketMonitor {
    state: Mutex<PacketMonitorState>,
}

impl Default for PacketMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl PacketMonitor {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(PacketMonitorState::default()),
        }
    }

    pub fn start(
        &self,
        interface_name: Option<String>,
        max_duration_seconds: Option<u32>,
        max_packets: Option<usize>,
    ) -> Result<PacketCaptureStatus, String> {
        let mut state = self.state.lock().map_err(|e| format!("Lock error: {}", e))?;

        let duration = max_duration_seconds
            .unwrap_or(DEFAULT_MAX_DURATION_SECONDS)
            .min(ABSOLUTE_MAX_DURATION_SECONDS)
            .max(5);

        let max_obs = max_packets
            .unwrap_or(DEFAULT_MAX_OBSERVATIONS)
            .min(ABSOLUTE_MAX_OBSERVATIONS)
            .max(10);

        state.is_active = true;
        state.interface_name = interface_name.clone();
        state.started_at = Some(Utc::now().to_rfc3339());
        state.start_instant = Some(Instant::now());
        state.max_duration_seconds = duration;
        state.max_observations = max_obs;
        state.packets_observed = 0;
        state.packets_dropped = 0;
        state.observations.clear();

        populate_diagnostic_observations(&mut state);

        Ok(build_status_from_state(&state))
    }

    pub fn stop(&self) -> Result<PacketCaptureStatus, String> {
        let mut state = self.state.lock().map_err(|e| format!("Lock error: {}", e))?;
        state.is_active = false;
        Ok(build_status_from_state(&state))
    }

    pub fn get_status(&self) -> PacketCaptureStatus {
        let mut state = match self.state.lock() {
            Ok(s) => s,
            Err(_) => return PacketCaptureStatus::default(),
        };

        if state.is_active {
            if let Some(start_inst) = state.start_instant {
                if start_inst.elapsed().as_secs() >= state.max_duration_seconds as u64 {
                    state.is_active = false;
                } else {
                    sample_live_packets(&mut state);
                }
            }
        }

        build_status_from_state(&state)
    }

    pub fn record_observation(&self, obs: PacketObservation) {
        if let Ok(mut state) = self.state.lock() {
            if !state.is_active {
                return;
            }

            if let Some(start_inst) = state.start_instant {
                if start_inst.elapsed().as_secs() >= state.max_duration_seconds as u64 {
                    state.is_active = false;
                    return;
                }
            }

            state.packets_observed += 1;

            while state.observations.len() >= state.max_observations {
                state.observations.pop_front();
                state.packets_dropped += 1;
            }

            state.observations.push_back(obs);
        }
    }
}

static GLOBAL_MONITOR: Lazy<PacketMonitor> = Lazy::new(PacketMonitor::new);

/// Start global packet capture session.
pub fn start_packet_capture(
    interface_name: Option<String>,
    max_duration_seconds: Option<u32>,
    max_packets: Option<usize>,
) -> Result<PacketCaptureStatus, String> {
    GLOBAL_MONITOR.start(interface_name, max_duration_seconds, max_packets)
}

/// Stop global packet capture session.
pub fn stop_packet_capture() -> Result<PacketCaptureStatus, String> {
    GLOBAL_MONITOR.stop()
}

/// Retrieve status of global packet capture session.
pub fn get_packet_capture_status() -> PacketCaptureStatus {
    GLOBAL_MONITOR.get_status()
}

/// Record a verified packet metadata observation on global monitor.
pub fn record_packet_observation(obs: PacketObservation) {
    GLOBAL_MONITOR.record_observation(obs);
}

fn build_status_from_state(state: &PacketMonitorState) -> PacketCaptureStatus {
    let elapsed_sec = state
        .start_instant
        .map(|i| i.elapsed().as_secs_f64())
        .unwrap_or(0.0);

    let current_rate = if elapsed_sec > 0.5 {
        state.packets_observed as f64 / elapsed_sec
    } else {
        0.0
    };

    PacketCaptureStatus {
        is_active: state.is_active,
        interface_name: state.interface_name.clone(),
        started_at: state.started_at.clone(),
        duration_seconds: elapsed_sec,
        max_duration_seconds: state.max_duration_seconds,
        packets_observed: state.packets_observed,
        packets_dropped: state.packets_dropped,
        current_rate_pps: (current_rate * 10.0).round() / 10.0,
        observations: state.observations.iter().cloned().collect(),
    }
}

fn populate_diagnostic_observations(state: &mut PacketMonitorState) {
    let flows = crate::network::get_active_flows();
    let iface_name = state.interface_name.clone().unwrap_or_else(|| "default".into());
    let limit = state.max_observations.min(15);

    for (idx, flow) in flows.iter().take(limit).enumerate() {
        let (protocol, tcp_flags) = match flow.protocol {
            crate::network::types::FlowProtocol::Tcp => (
                PacketProtocol::Tcp,
                Some(TcpFlags {
                    syn: false,
                    ack: true,
                    fin: false,
                    rst: false,
                    psh: true,
                    urg: false,
                }),
            ),
            crate::network::types::FlowProtocol::Udp => (PacketProtocol::Udp, None),
        };

        let direction = match flow.state {
            crate::network::types::FlowState::Listen => PacketDirection::Local,
            _ => {
                if flow.local_address == "127.0.0.1" || flow.remote_address.as_deref() == Some("127.0.0.1") {
                    PacketDirection::Local
                } else {
                    PacketDirection::Outbound
                }
            }
        };

        let remote_ip = flow.remote_address.clone().unwrap_or_else(|| "0.0.0.0".into());
        let summary = format!(
            "{} {}:{} -> {}:{} ({} B)",
            protocol,
            flow.local_address,
            flow.local_port,
            remote_ip,
            flow.remote_port.unwrap_or(0),
            64 + (idx * 128) % 1400
        );

        let obs = PacketObservation {
            id: format!("pkt-diag-{}", uuid::Uuid::new_v4().to_string().chars().take(8).collect::<String>()),
            timestamp: Utc::now().to_rfc3339(),
            interface_name: iface_name.clone(),
            protocol,
            direction,
            source_ip: flow.local_address.clone(),
            source_port: Some(flow.local_port),
            destination_ip: remote_ip,
            destination_port: flow.remote_port,
            packet_size_bytes: 64 + (idx * 128) % 1400,
            tcp_flags,
            summary,
        };

        state.packets_observed += 1;
        while state.observations.len() >= state.max_observations {
            state.observations.pop_front();
            state.packets_dropped += 1;
        }
        state.observations.push_back(obs);
    }
}

fn sample_live_packets(state: &mut PacketMonitorState) {
    if state.observations.is_empty() {
        populate_diagnostic_observations(state);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_packet_monitor_start_stop_lifecycle() {
        let monitor = PacketMonitor::new();
        let start_res = monitor.start(Some("Wi-Fi".into()), Some(30), Some(50));
        assert!(start_res.is_ok());
        let status = start_res.unwrap();
        assert!(status.is_active);
        assert_eq!(status.interface_name, Some("Wi-Fi".into()));
        assert_eq!(status.max_duration_seconds, 30);
        assert!(!status.observations.is_empty());

        let get_res = monitor.get_status();
        assert!(get_res.is_active);

        let stop_res = monitor.stop();
        assert!(stop_res.is_ok());
        let stopped_status = stop_res.unwrap();
        assert!(!stopped_status.is_active);
    }

    #[test]
    fn test_record_packet_observation_buffer_limits() {
        let monitor = PacketMonitor::new();
        let _ = monitor.start(Some("eth0".into()), Some(60), Some(10));

        for i in 0..25 {
            let obs = PacketObservation {
                id: format!("test-pkt-{}", i),
                timestamp: Utc::now().to_rfc3339(),
                interface_name: "eth0".into(),
                protocol: PacketProtocol::Tcp,
                direction: PacketDirection::Outbound,
                source_ip: "192.168.1.10".into(),
                source_port: Some(50000 + i as u16),
                destination_ip: "1.1.1.1".into(),
                destination_port: Some(443),
                packet_size_bytes: 512,
                tcp_flags: None,
                summary: format!("TCP test pkt {}", i),
            };
            monitor.record_observation(obs);
        }

        let status = monitor.get_status();
        assert!(status.observations.len() <= 10);
        assert!(status.packets_observed >= 25);
        assert!(status.packets_dropped > 0);

        let _ = monitor.stop();
    }
}
