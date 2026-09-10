pub mod actions;
pub mod capabilities;
pub mod ipc;
pub mod network;
pub mod permissions;
pub mod terminal;

pub static IS_UI_ACTIVE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
