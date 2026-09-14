//! # Cluster Management
//!
//! Canonical Rust Cluster Management service layer for the Fluffy Network subsystem.
//! Coordinates node registration, lifecycle validation, heartbeat monitoring, and
//! compatibility adapters over the single authoritative [`crate::network::state::SharedNetworkState`].

pub mod adapters;
pub mod heartbeat;
pub mod lifecycle;
pub mod manager;

pub use adapters::{PythonClusterAdapter, PythonMachineEntry, TerminalMeshAdapter};
pub use heartbeat::{HeartbeatConfig, HeartbeatTracker, NodeHeartbeatRecord};
pub use lifecycle::validate_transition;
pub use manager::ClusterManager;
