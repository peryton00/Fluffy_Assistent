use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast::{self, error::RecvError, error::TryRecvError};

use crate::network::model::NetworkEvent;

fn current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Default maximum number of events retained in the bounded broadcast ring buffer.
pub const DEFAULT_EVENT_BUFFER_CAPACITY: usize = 1024;

/// Error returned when receiving from an asynchronous event subscriber.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventRecvError {
    /// Subscriber fell behind and messages were dropped by the bounded broadcast ring buffer.
    Lagged(u64),
    /// Event bus publisher channel has been closed.
    Closed,
}

impl std::fmt::Display for EventRecvError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventRecvError::Lagged(n) => write!(f, "subscriber lagged by {} events", n),
            EventRecvError::Closed => write!(f, "event bus channel closed"),
        }
    }
}

impl std::error::Error for EventRecvError {}

/// Error returned when attempting non-blocking poll on an event subscriber.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventTryRecvError {
    /// No new events available in the subscriber buffer at this time.
    Empty,
    /// Subscriber fell behind and messages were dropped by the bounded broadcast ring buffer.
    Lagged(u64),
    /// Event bus publisher channel has been closed.
    Closed,
}

impl std::fmt::Display for EventTryRecvError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventTryRecvError::Empty => write!(f, "no events currently available"),
            EventTryRecvError::Lagged(n) => write!(f, "subscriber lagged by {} events", n),
            EventTryRecvError::Closed => write!(f, "event bus channel closed"),
        }
    }
}

impl std::error::Error for EventTryRecvError {}

/// Thread-safe subscriber handle receiving network events from [`NetworkEventBus`].
///
/// Bounded memory guarantee:
/// - If a subscriber processes events too slowly, the underlying ring buffer drops oldest events
///   and emits `EventRecvError::Lagged(n)` or `EventTryRecvError::Lagged(n)`.
/// - Memory growth from slow or dead subscribers is strictly prevented.
#[derive(Debug)]
pub struct EventSubscriber {
    receiver: broadcast::Receiver<NetworkEvent>,
    dropped_count: u64,
}

impl EventSubscriber {
    fn new(receiver: broadcast::Receiver<NetworkEvent>) -> Self {
        Self {
            receiver,
            dropped_count: 0,
        }
    }

    /// Asynchronously await the next network event.
    pub async fn recv(&mut self) -> Result<NetworkEvent, EventRecvError> {
        match self.receiver.recv().await {
            Ok(event) => Ok(event),
            Err(RecvError::Lagged(count)) => {
                self.dropped_count = self.dropped_count.saturating_add(count);
                Err(EventRecvError::Lagged(count))
            }
            Err(RecvError::Closed) => Err(EventRecvError::Closed),
        }
    }

    /// Non-blocking synchronous poll for the next available network event.
    pub fn try_recv(&mut self) -> Result<NetworkEvent, EventTryRecvError> {
        match self.receiver.try_recv() {
            Ok(event) => Ok(event),
            Err(TryRecvError::Empty) => Err(EventTryRecvError::Empty),
            Err(TryRecvError::Lagged(count)) => {
                self.dropped_count = self.dropped_count.saturating_add(count);
                Err(EventTryRecvError::Lagged(count))
            }
            Err(TryRecvError::Closed) => Err(EventTryRecvError::Closed),
        }
    }

    /// Cumulative count of events dropped due to subscriber buffer lag.
    pub fn dropped_count(&self) -> u64 {
        self.dropped_count
    }

    /// Create a new, resynchronized subscriber handle starting from current broadcast head.
    pub fn resubscribe(&self) -> Self {
        Self {
            receiver: self.receiver.resubscribe(),
            dropped_count: 0,
        }
    }
}

/// Lightweight, bounded, multi-subscriber event bus for the Fluffy Network subsystem.
///
/// Invariants:
/// - Events are an ordered stream of observations, NOT a second state store.
/// - `NetworkState` remains the authoritative source of current network reality.
/// - Monotonic sequence numbers are assigned by the event bus upon publication.
/// - Fast publisher / slow subscriber decoupling: Slow consumers drop old events and receive
///   explicit lag notifications; state mutations and fast subscribers never block.
/// - Subscribers NEVER execute callbacks while `NetworkState` locks are held.
#[derive(Debug, Clone)]
pub struct NetworkEventBus {
    sender: broadcast::Sender<NetworkEvent>,
    sequence_counter: Arc<AtomicU64>,
}

impl Default for NetworkEventBus {
    fn default() -> Self {
        Self::new(DEFAULT_EVENT_BUFFER_CAPACITY)
    }
}

impl NetworkEventBus {
    /// Create a new NetworkEventBus with a specified ring buffer capacity.
    pub fn new(capacity: usize) -> Self {
        let cap = if capacity == 0 {
            DEFAULT_EVENT_BUFFER_CAPACITY
        } else {
            capacity
        };
        let (sender, _) = broadcast::channel(cap);
        Self {
            sender,
            sequence_counter: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Publish a network event to all active subscribers.
    ///
    /// Assigns a strictly monotonic sequence number and ensures timestamps are populated.
    /// Returns the assigned sequence number.
    pub fn publish(&self, mut event: NetworkEvent) -> u64 {
        let seq = self.sequence_counter.fetch_add(1, Ordering::SeqCst) + 1;
        event.sequence = seq;
        if event.timestamp_epoch_ms == 0 {
            event.timestamp_epoch_ms = current_epoch_ms();
        }

        // Send to active subscribers (ignoring error if no active receivers exist)
        let _ = self.sender.send(event);
        seq
    }

    /// Create a new subscription receiver handle.
    pub fn subscribe(&self) -> EventSubscriber {
        EventSubscriber::new(self.sender.subscribe())
    }

    /// Current count of active subscribers.
    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }

    /// Retrieve the highest monotonic sequence number assigned so far.
    pub fn current_sequence(&self) -> u64 {
        self.sequence_counter.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::ids::NodeId;
    use crate::network::model::{EventCategory, EventSeverity, NetworkEventType};
    use std::thread;

    #[test]
    fn test_event_bus_monotonic_sequence_and_timestamps() {
        let bus = NetworkEventBus::new(100);
        assert_eq!(bus.current_sequence(), 0);

        let mut sub = bus.subscribe();
        assert_eq!(bus.subscriber_count(), 1);

        let evt1 = NetworkEvent::new(
            EventCategory::Cluster,
            NetworkEventType::NodeConnected,
            EventSeverity::Info,
            "Node connected",
        );
        let seq1 = bus.publish(evt1);
        assert_eq!(seq1, 1);
        assert_eq!(bus.current_sequence(), 1);

        let evt2 = NetworkEvent::new(
            EventCategory::Discovery,
            NetworkEventType::DeviceDiscovered,
            EventSeverity::Info,
            "Device discovered",
        );
        let seq2 = bus.publish(evt2);
        assert_eq!(seq2, 2);
        assert_eq!(bus.current_sequence(), 2);

        let received1 = sub.try_recv().unwrap();
        assert_eq!(received1.sequence, 1);
        assert_eq!(received1.event_type, NetworkEventType::NodeConnected);
        assert!(received1.timestamp_epoch_ms > 0);

        let received2 = sub.try_recv().unwrap();
        assert_eq!(received2.sequence, 2);
        assert_eq!(received2.event_type, NetworkEventType::DeviceDiscovered);

        assert_eq!(sub.try_recv(), Err(EventTryRecvError::Empty));
    }

    #[test]
    fn test_event_bus_multi_subscriber_isolation() {
        let bus = NetworkEventBus::new(100);
        let mut sub1 = bus.subscribe();
        let mut sub2 = bus.subscribe();
        assert_eq!(bus.subscriber_count(), 2);

        let evt = NetworkEvent::new(
            EventCategory::Security,
            NetworkEventType::AnomalyDetected,
            EventSeverity::Warning,
            "Suspicious ARP detected",
        );
        bus.publish(evt);

        let r1 = sub1.try_recv().unwrap();
        let r2 = sub2.try_recv().unwrap();
        assert_eq!(r1.sequence, 1);
        assert_eq!(r2.sequence, 1);
        assert_eq!(r1.event_type, NetworkEventType::AnomalyDetected);
        assert_eq!(r2.event_type, NetworkEventType::AnomalyDetected);

        // Dropping one subscriber does not affect the other
        drop(sub1);
        assert_eq!(bus.subscriber_count(), 1);

        let evt2 = NetworkEvent::new(
            EventCategory::Cluster,
            NetworkEventType::NodeDisconnected,
            EventSeverity::Warning,
            "Node disconnected",
        );
        bus.publish(evt2);

        let r2_next = sub2.try_recv().unwrap();
        assert_eq!(r2_next.sequence, 2);
        assert_eq!(r2_next.event_type, NetworkEventType::NodeDisconnected);
    }

    #[test]
    fn test_event_bus_bounded_lag_handling() {
        // Small buffer of size 2
        let bus = NetworkEventBus::new(2);
        let mut slow_sub = bus.subscribe();

        // Publish 5 events (exceeding buffer capacity 2)
        for i in 1..=5 {
            let evt = NetworkEvent::new(
                EventCategory::Cluster,
                NetworkEventType::HeartbeatMissed,
                EventSeverity::Warning,
                format!("Missed heartbeat {}", i),
            );
            bus.publish(evt);
        }

        // Slow subscriber should report lagged error
        match slow_sub.try_recv() {
            Err(EventTryRecvError::Lagged(dropped)) => {
                assert!(dropped >= 3);
                assert!(slow_sub.dropped_count() >= 3);
            }
            other => panic!("Expected Lagged error, got: {:?}", other),
        }

        // Subsequent read receives newest unlagged event
        let next_evt = slow_sub.try_recv().unwrap();
        assert_eq!(next_evt.sequence, 4);
    }

    #[test]
    fn test_concurrent_publish_and_subscribe() {
        let bus = NetworkEventBus::new(1000);
        let mut handles = Vec::new();

        // Spawn 4 concurrent publishers publishing 50 events each
        for p in 0..4 {
            let b = bus.clone();
            handles.push(thread::spawn(move || {
                for i in 0..50 {
                    let evt = NetworkEvent::new(
                        EventCategory::Telemetry,
                        NetworkEventType::ConnectionOpened,
                        EventSeverity::Info,
                        format!("Publisher {} Event {}", p, i),
                    );
                    b.publish(evt);
                }
            }));
        }

        for h in handles {
            h.join().unwrap();
        }

        assert_eq!(bus.current_sequence(), 200);
    }

    #[tokio::test]
    async fn test_async_subscriber_recv() {
        let bus = NetworkEventBus::new(100);
        let mut sub = bus.subscribe();

        tokio::spawn({
            let bus = bus.clone();
            async move {
                tokio::time::sleep(tokio::time::Duration::from_millis(20)).await;
                let evt = NetworkEvent::new(
                    EventCategory::Cluster,
                    NetworkEventType::NodeConnected,
                    EventSeverity::Info,
                    "Async connected",
                )
                .with_target_node(NodeId::new("node-async"));
                bus.publish(evt);
            }
        });

        let received = sub.recv().await.unwrap();
        assert_eq!(received.event_type, NetworkEventType::NodeConnected);
        assert_eq!(received.target_node_id, Some(NodeId::new("node-async")));
        assert_eq!(received.sequence, 1);
    }
}
