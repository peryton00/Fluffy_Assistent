use serde::Deserialize;

/// Location data from IP geolocation API.
#[derive(Debug, Deserialize)]
struct GeoLocation {
    ip: Option<String>,
    city: Option<String>,
    region: Option<String>,
    country_name: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    org: Option<String>,
    timezone: Option<String>,
}

/// Handle locate command — network-based geolocation.
pub async fn handle_locate() -> Result<String, String> {
    let response = reqwest::get("https://ipapi.co/json/")
        .await
        .map_err(|e| format!("Location unavailable: Could not reach geolocation service. {}", e))?;

    if !response.status().is_success() {
        return Err("Location unavailable: Geolocation service returned an error.".to_string());
    }

    let geo: GeoLocation = response
        .json()
        .await
        .map_err(|e| format!("Location unavailable: Failed to parse response. {}", e))?;

    let mut output = String::new();
    output.push_str("  ── Network Geolocation ─────────────────\n");
    output.push_str("  (Based on IP address, not GPS)\n\n");
    output.push_str(&format!("  IP        : {}\n", geo.ip.unwrap_or_else(|| "Unknown".to_string())));
    output.push_str(&format!("  City      : {}\n", geo.city.unwrap_or_else(|| "Unknown".to_string())));
    output.push_str(&format!("  Region    : {}\n", geo.region.unwrap_or_else(|| "Unknown".to_string())));
    output.push_str(&format!("  Country   : {}\n", geo.country_name.unwrap_or_else(|| "Unknown".to_string())));
    output.push_str(&format!("  Latitude  : {}\n", geo.latitude.map(|l| l.to_string()).unwrap_or_else(|| "Unknown".to_string())));
    output.push_str(&format!("  Longitude : {}\n", geo.longitude.map(|l| l.to_string()).unwrap_or_else(|| "Unknown".to_string())));
    output.push_str(&format!("  ISP       : {}\n", geo.org.unwrap_or_else(|| "Unknown".to_string())));
    output.push_str(&format!("  Timezone  : {}\n", geo.timezone.unwrap_or_else(|| "Unknown".to_string())));

    Ok(output)
}
