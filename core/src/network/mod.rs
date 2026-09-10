//! # Fluffy Local Network Observability Subsystem
//!
//! Provides authoritative native facts and telemetry regarding the local host's
//! network adapters, link states, and real-time bandwidth consumption rates.
//!
//! ## Domain Distinction
//!
//! - **Local Network** (`core::network`): Observes the local host machine's network stack
//!   (interfaces, traffic rates, connection flows, local discovery, Wi-Fi profiles).
//! - **Fluffy Cluster** (`fluffy::network` / `core::terminal`): Inter-machine distributed
//!   peer mesh for multi-device management, remote command dispatch, and cluster health.
//!
//! ## Submodules
//!
//! - [`types`]: Strongly-typed domain models for interfaces, statuses, devices, flows, and metrics.
//! - [`traffic`]: Reusable, anomaly-safe traffic rate calculation primitives.
//! - [`interfaces`]: Cross-platform interface enumeration, MAC normalization, and type categorization.
//! - [`discovery`]: Passive local network neighbor/ARP table discovery.
//! - [`flows`]: Active transport socket and connection flow mapping with PID ownership.
//! - [`wifi`]: Wi-Fi network profile and non-secret security metadata observation.

pub mod capture;
pub mod discovery;
pub mod flows;
pub mod interfaces;
pub mod traffic;
pub mod types;
pub mod wifi;

// Re-export primary types for convenience
pub use capture::{get_packet_capture_status, record_packet_observation, start_packet_capture, stop_packet_capture};
pub use discovery::{get_local_devices, parse_linux_arp};
pub use flows::{get_active_flows, parse_linux_proc_net};
pub use interfaces::{get_interface_by_name, get_interfaces, get_interfaces_with_rates};
pub use traffic::{calculate_rates, TrafficRateCalculator};
pub use types::{
    DeviceState, FlowProtocol, FlowState, InterfaceSample, InterfaceType, LocalNetworkDevice,
    NetworkFlow, NetworkInterfaceInfo, OperationalStatus, PacketCaptureStatus, PacketDirection,
    PacketObservation, PacketProtocol, TcpFlags, TrafficRates, WifiProfile,
};
pub use wifi::{get_wifi_profiles, parse_linux_nmconnection, parse_windows_profile_xml};

