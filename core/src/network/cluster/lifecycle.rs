use crate::network::error::{NetworkError, NetworkResult};
use crate::network::model::NodeAvailability;

/// Validates whether a state transition between two `NodeAvailability` states is permitted by domain rules.
///
/// Authentication & Connection Path Invariant:
/// - Newly discovered nodes begin at `Unknown` or `Available`.
/// - A node MUST NOT transition directly from `Unknown` or `Available` to `Connected`.
/// - The canonical connection path is: `Available -> Pairing -> Authenticating -> Connected`.
/// - Existing authenticated connections experiencing temporary disruption follow:
///   `Connected -> Disconnected -> Recovering -> Connected` (upon verified session restoration).
///
/// Permitted transition paths:
/// - Any state -> Same state (no-op identity update)
/// - `Unknown` -> `Available`, `Disconnected`
/// - `Available` -> `Pairing`, `Disconnected`, `Unknown`
/// - `Pairing` -> `Authenticating`, `Available`, `Disconnected`, `Unknown`
/// - `Authenticating` -> `Connected`, `Available`, `Disconnected`, `Unknown`
/// - `Connected` -> `Disconnected`, `Recovering`, `Available`, `Unknown`
/// - `Disconnected` -> `Recovering`, `Available`, `Unknown`
/// - `Recovering` -> `Connected`, `Disconnected`, `Available`, `Unknown`
pub fn validate_transition(current: NodeAvailability, next: NodeAvailability) -> NetworkResult<()> {
    if current == next {
        return Ok(());
    }

    let is_valid = match (current, next) {
        // Unknown initial discovery state -> can advertise Availability or be recorded as Disconnected
        (NodeAvailability::Unknown, NodeAvailability::Available)
        | (NodeAvailability::Unknown, NodeAvailability::Disconnected) => true,

        // Discovered and advertising availability -> can initiate Pairing, go Disconnected, or reset to Unknown
        (NodeAvailability::Available, NodeAvailability::Pairing)
        | (NodeAvailability::Available, NodeAvailability::Disconnected)
        | (NodeAvailability::Available, NodeAvailability::Unknown) => true,

        // Pairing handshake in flight -> can advance to Authenticating, cancel to Available, or drop
        (NodeAvailability::Pairing, NodeAvailability::Authenticating)
        | (NodeAvailability::Pairing, NodeAvailability::Available)
        | (NodeAvailability::Pairing, NodeAvailability::Disconnected)
        | (NodeAvailability::Pairing, NodeAvailability::Unknown) => true,

        // Authentication handshake in flight -> can advance to Connected, fail to Available, or drop
        (NodeAvailability::Authenticating, NodeAvailability::Connected)
        | (NodeAvailability::Authenticating, NodeAvailability::Available)
        | (NodeAvailability::Authenticating, NodeAvailability::Disconnected)
        | (NodeAvailability::Authenticating, NodeAvailability::Unknown) => true,

        // Actively connected -> can drop to Disconnected, enter grace period Recovering, or withdraw
        (NodeAvailability::Connected, NodeAvailability::Disconnected)
        | (NodeAvailability::Connected, NodeAvailability::Recovering)
        | (NodeAvailability::Connected, NodeAvailability::Available)
        | (NodeAvailability::Connected, NodeAvailability::Unknown) => true,

        // Disconnected -> can initiate pairing reconnect (Pairing), attempt session recovery (Recovering), re-advertise as Available, or reset
        (NodeAvailability::Disconnected, NodeAvailability::Pairing)
        | (NodeAvailability::Disconnected, NodeAvailability::Recovering)
        | (NodeAvailability::Disconnected, NodeAvailability::Available)
        | (NodeAvailability::Disconnected, NodeAvailability::Unknown) => true,

        // Recovering from temporary heartbeat loss -> can restore Connected, fail to Disconnected, or withdraw
        (NodeAvailability::Recovering, NodeAvailability::Connected)
        | (NodeAvailability::Recovering, NodeAvailability::Disconnected)
        | (NodeAvailability::Recovering, NodeAvailability::Available)
        | (NodeAvailability::Recovering, NodeAvailability::Unknown) => true,

        // All other transitions (e.g. Unknown -> Connected, Available -> Connected, Pairing -> Connected) are rejected
        _ => false,
    };

    if is_valid {
        Ok(())
    } else {
        Err(NetworkError::InvalidState(format!(
            "Invalid node availability transition from '{}' to '{}': connection requires proper authentication path (Available -> Pairing -> Authenticating -> Connected) or session recovery (Recovering -> Connected)",
            current, next
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_lifecycle_transitions() {
        // Initial discovery
        assert!(validate_transition(NodeAvailability::Unknown, NodeAvailability::Available).is_ok());

        // Canonical pairing and authentication path
        assert!(validate_transition(NodeAvailability::Available, NodeAvailability::Pairing).is_ok());
        assert!(validate_transition(NodeAvailability::Pairing, NodeAvailability::Authenticating).is_ok());
        assert!(validate_transition(NodeAvailability::Authenticating, NodeAvailability::Connected).is_ok());

        // Disconnect and recovery / reconnect path
        assert!(validate_transition(NodeAvailability::Connected, NodeAvailability::Disconnected).is_ok());
        assert!(validate_transition(NodeAvailability::Disconnected, NodeAvailability::Recovering).is_ok());
        assert!(validate_transition(NodeAvailability::Disconnected, NodeAvailability::Pairing).is_ok());
        assert!(validate_transition(NodeAvailability::Recovering, NodeAvailability::Connected).is_ok());

        // Grace period recovery from Connected
        assert!(validate_transition(NodeAvailability::Connected, NodeAvailability::Recovering).is_ok());
        assert!(validate_transition(NodeAvailability::Recovering, NodeAvailability::Disconnected).is_ok());

        // Identity transition (no-op)
        assert!(validate_transition(NodeAvailability::Connected, NodeAvailability::Connected).is_ok());
        assert!(validate_transition(NodeAvailability::Available, NodeAvailability::Available).is_ok());
    }

    #[test]
    fn test_invalid_lifecycle_transitions_rejected() {
        // Unknown cannot become Connected directly
        let res_unknown = validate_transition(NodeAvailability::Unknown, NodeAvailability::Connected);
        assert!(res_unknown.is_err());
        assert_eq!(res_unknown.unwrap_err().kind(), "invalid_network_state");

        // Available cannot bypass Pairing & Authenticating to jump directly to Connected
        let res_avail = validate_transition(NodeAvailability::Available, NodeAvailability::Connected);
        assert!(res_avail.is_err());
        assert_eq!(res_avail.unwrap_err().kind(), "invalid_network_state");

        // Pairing directly to Connected without Authenticating is invalid
        let res_pair = validate_transition(NodeAvailability::Pairing, NodeAvailability::Connected);
        assert!(res_pair.is_err());
        assert_eq!(res_pair.unwrap_err().kind(), "invalid_network_state");

        // Disconnected directly to Connected without Recovering is invalid
        let res_disc = validate_transition(NodeAvailability::Disconnected, NodeAvailability::Connected);
        assert!(res_disc.is_err());
        assert_eq!(res_disc.unwrap_err().kind(), "invalid_network_state");

        // Unknown directly to Pairing without Available is invalid
        assert!(validate_transition(NodeAvailability::Unknown, NodeAvailability::Pairing).is_err());
        assert!(validate_transition(NodeAvailability::Unknown, NodeAvailability::Authenticating).is_err());
    }
}
