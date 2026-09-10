use std::collections::HashMap;
use crate::network::types::{InterfaceSample, TrafficRates};

/// Minimum duration in seconds required to calculate a valid rate (prevents division by zero or jitter).
pub const MIN_RATE_CALCULATION_SECS: f64 = 0.001; // 1 millisecond

/// Pure function to calculate instantaneous traffic rates between two discrete samples.
pub fn calculate_rates(prev: Option<InterfaceSample>, curr: InterfaceSample) -> TrafficRates {
    let Some(prev_sample) = prev else {
        return TrafficRates::default();
    };

    // Anomaly guard: current timestamp must strictly follow previous timestamp
    if curr.timestamp_nanos <= prev_sample.timestamp_nanos {
        return TrafficRates::default();
    }

    let elapsed_nanos = curr.timestamp_nanos - prev_sample.timestamp_nanos;
    let elapsed_secs = elapsed_nanos as f64 / 1_000_000_000.0;

    if elapsed_secs < MIN_RATE_CALCULATION_SECS {
        return TrafficRates::default();
    }

    // Counter reset guard: if current counters are lower than previous counters,
    // an adapter reset or reboot occurred. Safely return zeros to prevent underflow.
    let rx_delta = if curr.rx_bytes >= prev_sample.rx_bytes {
        curr.rx_bytes - prev_sample.rx_bytes
    } else {
        0
    };

    let tx_delta = if curr.tx_bytes >= prev_sample.tx_bytes {
        curr.tx_bytes - prev_sample.tx_bytes
    } else {
        0
    };

    let rx_bytes_per_sec = rx_delta as f64 / elapsed_secs;
    let tx_bytes_per_sec = tx_delta as f64 / elapsed_secs;

    TrafficRates {
        rx_bytes_per_second: (rx_bytes_per_sec * 100.0).round() / 100.0,
        tx_bytes_per_second: (tx_bytes_per_sec * 100.0).round() / 100.0,
        rx_bits_per_second: (rx_bytes_per_sec * 8.0 * 100.0).round() / 100.0,
        tx_bits_per_second: (tx_bytes_per_sec * 8.0 * 100.0).round() / 100.0,
    }
}

/// State tracker maintaining previous sample checkpoints for multiple interfaces.
#[derive(Debug, Clone, Default)]
pub struct TrafficRateCalculator {
    last_samples: HashMap<String, InterfaceSample>,
}

impl TrafficRateCalculator {
    pub fn new() -> Self {
        Self {
            last_samples: HashMap::new(),
        }
    }

    /// Record a new sample for an interface and return the calculated traffic rate.
    pub fn update(&mut self, interface_key: &str, current_sample: InterfaceSample) -> TrafficRates {
        let prev = self.last_samples.get(interface_key).copied();
        let rates = calculate_rates(prev, current_sample);
        self.last_samples.insert(interface_key.to_string(), current_sample);
        rates
    }

    /// Remove tracking for an interface that has been disconnected.
    pub fn remove(&mut self, interface_key: &str) {
        self.last_samples.remove(interface_key);
    }

    /// Clear all historical tracking state.
    pub fn clear(&mut self) {
        self.last_samples.clear();
    }

    /// Return count of currently tracked interfaces.
    pub fn len(&self) -> usize {
        self.last_samples.len()
    }

    pub fn is_empty(&self) -> bool {
        self.last_samples.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_first_sample_returns_zero_rates() {
        let sample = InterfaceSample {
            rx_bytes: 1000,
            tx_bytes: 2000,
            timestamp_nanos: 1_000_000_000,
        };
        let rates = calculate_rates(None, sample);
        assert_eq!(rates, TrafficRates::default());
    }

    #[test]
    fn test_normal_rate_calculation_one_second() {
        let prev = InterfaceSample {
            rx_bytes: 1000,
            tx_bytes: 2000,
            timestamp_nanos: 1_000_000_000, // 1.0s
        };
        let curr = InterfaceSample {
            rx_bytes: 2024,                  // +1024 bytes
            tx_bytes: 2512,                  // +512 bytes
            timestamp_nanos: 2_000_000_000, // 2.0s (+1.0s)
        };
        let rates = calculate_rates(Some(prev), curr);
        assert_eq!(rates.rx_bytes_per_second, 1024.0);
        assert_eq!(rates.tx_bytes_per_second, 512.0);
        assert_eq!(rates.rx_bits_per_second, 8192.0);
        assert_eq!(rates.tx_bits_per_second, 4096.0);
    }

    #[test]
    fn test_zero_interval_guard() {
        let prev = InterfaceSample {
            rx_bytes: 1000,
            tx_bytes: 2000,
            timestamp_nanos: 1_000_000_000,
        };
        let curr = InterfaceSample {
            rx_bytes: 5000,
            tx_bytes: 6000,
            timestamp_nanos: 1_000_000_000, // Same timestamp
        };
        let rates = calculate_rates(Some(prev), curr);
        assert_eq!(rates, TrafficRates::default());
    }

    #[test]
    fn test_negative_elapsed_time_anomaly() {
        let prev = InterfaceSample {
            rx_bytes: 1000,
            tx_bytes: 2000,
            timestamp_nanos: 2_000_000_000,
        };
        let curr = InterfaceSample {
            rx_bytes: 5000,
            tx_bytes: 6000,
            timestamp_nanos: 1_000_000_000, // Clock went backwards
        };
        let rates = calculate_rates(Some(prev), curr);
        assert_eq!(rates, TrafficRates::default());
    }

    #[test]
    fn test_counter_reset_or_adapter_reconnect() {
        let prev = InterfaceSample {
            rx_bytes: 50_000_000,
            tx_bytes: 50_000_000,
            timestamp_nanos: 1_000_000_000,
        };
        let curr = InterfaceSample {
            rx_bytes: 100, // Counter reset to near 0
            tx_bytes: 200,
            timestamp_nanos: 2_000_000_000,
        };
        let rates = calculate_rates(Some(prev), curr);
        assert_eq!(rates.rx_bytes_per_second, 0.0);
        assert_eq!(rates.tx_bytes_per_second, 0.0);
    }

    #[test]
    fn test_large_64bit_counters() {
        let prev = InterfaceSample {
            rx_bytes: 10_000_000_000_000,
            tx_bytes: 5_000_000_000_000,
            timestamp_nanos: 10_000_000_000,
        };
        let curr = InterfaceSample {
            rx_bytes: 10_000_000_000_000 + 100_000_000, // +100 MB
            tx_bytes: 5_000_000_000_000 + 50_000_000,   // +50 MB
            timestamp_nanos: 12_000_000_000,             // +2.0s
        };
        let rates = calculate_rates(Some(prev), curr);
        assert_eq!(rates.rx_bytes_per_second, 50_000_000.0);
        assert_eq!(rates.tx_bytes_per_second, 25_000_000.0);
        assert_eq!(rates.rx_bits_per_second, 400_000_000.0);
        assert_eq!(rates.tx_bits_per_second, 200_000_000.0);
    }

    #[test]
    fn test_stateful_calculator_multiple_interfaces() {
        let mut calc = TrafficRateCalculator::new();
        assert_eq!(calc.len(), 0);

        // Tick 1 (t=1.0s)
        let r1_eth = calc.update("eth0", InterfaceSample { rx_bytes: 1000, tx_bytes: 1000, timestamp_nanos: 1_000_000_000 });
        let r1_wifi = calc.update("wlan0", InterfaceSample { rx_bytes: 5000, tx_bytes: 5000, timestamp_nanos: 1_000_000_000 });
        assert_eq!(r1_eth, TrafficRates::default());
        assert_eq!(r1_wifi, TrafficRates::default());
        assert_eq!(calc.len(), 2);

        // Tick 2 (t=3.0s, +2.0s)
        let r2_eth = calc.update("eth0", InterfaceSample { rx_bytes: 3000, tx_bytes: 2000, timestamp_nanos: 3_000_000_000 });
        let r2_wifi = calc.update("wlan0", InterfaceSample { rx_bytes: 9000, tx_bytes: 7000, timestamp_nanos: 3_000_000_000 });
        assert_eq!(r2_eth.rx_bytes_per_second, 1000.0); // 2000 / 2.0
        assert_eq!(r2_eth.tx_bytes_per_second, 500.0);  // 1000 / 2.0
        assert_eq!(r2_wifi.rx_bytes_per_second, 2000.0); // 4000 / 2.0
        assert_eq!(r2_wifi.tx_bytes_per_second, 1000.0); // 2000 / 2.0

        // Remove eth0
        calc.remove("eth0");
        assert_eq!(calc.len(), 1);
    }
}
