use crate::network::types::WifiProfile;

/// Helper to normalize authentication and cipher types to standard human-readable formats.
pub fn normalize_security_type(auth: &str, cipher: &str) -> (String, String) {
    let auth_upper = auth.to_uppercase();
    let cipher_upper = cipher.to_uppercase();

    let sec = if auth_upper.contains("8021X") || auth_upper.contains("ENTERPRISE") {
        "Enterprise".to_string()
    } else if auth_upper.contains("WPA3") || auth_upper.contains("SAE") {
        "WPA3-Personal".to_string()
    } else if auth_upper.contains("WPA2") {
        "WPA2-Personal".to_string()
    } else if auth_upper.contains("WPA") || auth_upper.contains("PSK") {
        "WPA-Personal".to_string()
    } else if auth_upper.contains("OPEN") || auth_upper.contains("NONE") {
        "Open".to_string()
    } else if auth_upper.contains("WEP") {
        "WEP".to_string()
    } else {
        auth.to_string()
    };

    let norm_cipher = if cipher_upper == "AES" || cipher_upper == "CCMP" {
        "AES".to_string()
    } else if cipher_upper == "TKIP" {
        "TKIP".to_string()
    } else if cipher_upper == "GCMP" || cipher_upper == "GCMP-256" {
        "GCMP".to_string()
    } else if cipher_upper == "NONE" {
        "None".to_string()
    } else {
        cipher.to_string()
    };

    (sec, norm_cipher)
}

/// Extract inner text between simple XML tags without external parser dependencies.
fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open_tag = format!("<{}>", tag);
    let close_tag = format!("</{}>", tag);

    if let Some(start_idx) = xml.find(&open_tag) {
        let content_start = start_idx + open_tag.len();
        if let Some(end_offset) = xml[content_start..].find(&close_tag) {
            let val = xml[content_start..content_start + end_offset].trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

/// Pure deterministic parser for Windows WLAN XML profile definitions.
/// Extracts only non-secret metadata (SSID, authentication, encryption).
pub fn parse_windows_profile_xml(xml: &str) -> (Option<String>, Option<String>, Option<String>) {
    let ssid = extract_xml_tag(xml, "name").or_else(|| extract_xml_tag(xml, "SSID"));
    let auth = extract_xml_tag(xml, "authentication");
    let enc = extract_xml_tag(xml, "encryption");

    (ssid, auth, enc)
}

/// Pure deterministic parser for Linux NetworkManager `.nmconnection` files.
/// Extracts only non-secret metadata.
pub fn parse_linux_nmconnection(content: &str) -> Option<WifiProfile> {
    let mut ssid = None;
    let mut iface = None;
    let mut key_mgmt = None;
    let mut is_wifi = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "type=wifi" || trimmed == "type=802-11-wireless" || trimmed == "[wifi]" {
            is_wifi = true;
        } else if let Some(val) = trimmed.strip_prefix("ssid=") {
            ssid = Some(val.trim().to_string());
        } else if let Some(val) = trimmed.strip_prefix("id=") {
            if ssid.is_none() {
                ssid = Some(val.trim().to_string());
            }
        } else if let Some(val) = trimmed.strip_prefix("interface-name=") {
            iface = Some(val.trim().to_string());
        } else if let Some(val) = trimmed.strip_prefix("key-mgmt=") {
            key_mgmt = Some(val.trim().to_string());
        }
    }

    if !is_wifi {
        return None;
    }

    let ssid_str = ssid?;
    let raw_auth = key_mgmt.unwrap_or_else(|| "open".to_string());
    let (sec, cipher) = normalize_security_type(&raw_auth, "AES");

    Some(WifiProfile {
        ssid: ssid_str,
        interface_name: iface,
        connected: false,
        signal_percent: None,
        security: Some(sec),
        cipher: Some(cipher),
        auth_type: Some(raw_auth),
        has_profile: true,
    })
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use std::ptr;

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct GUID {
        data1: u32,
        data2: u16,
        data3: u16,
        data4: [u8; 8],
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct WLAN_INTERFACE_INFO {
        interface_guid: GUID,
        str_interface_description: [u16; 256],
        is_state: u32,
    }

    #[repr(C)]
    struct WLAN_INTERFACE_INFO_LIST {
        dw_number_of_items: u32,
        dw_index: u32,
        interface_info: [WLAN_INTERFACE_INFO; 1],
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct WLAN_PROFILE_INFO {
        str_profile_name: [u16; 256],
        dw_flags: u32,
    }

    #[repr(C)]
    struct WLAN_PROFILE_INFO_LIST {
        dw_number_of_items: u32,
        dw_index: u32,
        profile_info: [WLAN_PROFILE_INFO; 1],
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct DOT11_SSID {
        u_ssid_length: u32,
        uc_ssid: [u8; 32],
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct WLAN_AVAILABLE_NETWORK {
        str_profile_name: [u16; 256],
        dot11_ssid: DOT11_SSID,
        dot11_bss_type: u32,
        u_number_of_bssids: u32,
        b_network_connectable: i32,
        wlan_not_connectable_reason: u32,
        u_number_of_phy_types: u32,
        dot11_phy_types: [u32; 8],
        b_more_phy_types: i32,
        wlan_signal_quality: u32, // 0 to 100
        b_security_enabled: i32,
        dot11_default_auth_algorithm: u32,
        dot11_default_cipher_algorithm: u32,
        dw_flags: u32,
        dw_reserved: u32,
    }

    #[repr(C)]
    struct WLAN_AVAILABLE_NETWORK_LIST {
        dw_number_of_items: u32,
        dw_index: u32,
        network: [WLAN_AVAILABLE_NETWORK; 1],
    }

    type HANDLE = *mut std::ffi::c_void;

    #[link(name = "wlanapi")]
    extern "system" {
        fn WlanOpenHandle(
            dwClientVersion: u32,
            pReserved: *mut std::ffi::c_void,
            pdwNegotiatedVersion: *mut u32,
            phClientHandle: *mut HANDLE,
        ) -> u32;

        fn WlanCloseHandle(hClientHandle: HANDLE, pReserved: *mut std::ffi::c_void) -> u32;

        fn WlanEnumInterfaces(
            hClientHandle: HANDLE,
            pReserved: *mut std::ffi::c_void,
            ppInterfaceList: *mut *mut WLAN_INTERFACE_INFO_LIST,
        ) -> u32;

        fn WlanGetProfileList(
            hClientHandle: HANDLE,
            pInterfaceGuid: *const GUID,
            pReserved: *mut std::ffi::c_void,
            ppProfileList: *mut *mut WLAN_PROFILE_INFO_LIST,
        ) -> u32;

        fn WlanGetProfile(
            hClientHandle: HANDLE,
            pInterfaceGuid: *const GUID,
            strProfileName: *const u16,
            pReserved: *mut std::ffi::c_void,
            pstrProfileXml: *mut *mut u16,
            pdwFlags: *mut u32,
            pdwGrantedAccess: *mut u32,
        ) -> u32;

        fn WlanGetAvailableNetworkList(
            hClientHandle: HANDLE,
            pInterfaceGuid: *const GUID,
            dwFlags: u32,
            pReserved: *mut std::ffi::c_void,
            ppAvailableNetworkList: *mut *mut WLAN_AVAILABLE_NETWORK_LIST,
        ) -> u32;

        fn WlanFreeMemory(pMemory: *mut std::ffi::c_void);
    }

    fn u16_slice_to_string(slice: &[u16]) -> String {
        let len = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
        String::from_utf16_lossy(&slice[..len])
    }

    pub fn query_wifi_profiles() -> Vec<WifiProfile> {
        let mut profiles = Vec::new();
        let mut client_handle: HANDLE = ptr::null_mut();
        let mut negotiated_version: u32 = 0;

        unsafe {
            // Client version 2 is for Windows Vista / 7 / 10 / 11
            if WlanOpenHandle(2, ptr::null_mut(), &mut negotiated_version, &mut client_handle) != 0 {
                return profiles;
            }

            let mut iface_list_ptr: *mut WLAN_INTERFACE_INFO_LIST = ptr::null_mut();
            if WlanEnumInterfaces(client_handle, ptr::null_mut(), &mut iface_list_ptr) == 0 && !iface_list_ptr.is_null() {
                let iface_count = (*iface_list_ptr).dw_number_of_items as usize;
                let ifaces_ptr = (*iface_list_ptr).interface_info.as_ptr();

                for i in 0..iface_count {
                    let iface = *ifaces_ptr.add(i);
                    let iface_desc = u16_slice_to_string(&iface.str_interface_description);
                    let is_connected = iface.is_state == 1; // wlan_interface_state_connected

                    // 1. Query live available networks for signal quality and active connected network
                    let mut signal_map = std::collections::HashMap::new();
                    let mut connected_profile_name: Option<String> = None;
                    let mut avail_list_ptr: *mut WLAN_AVAILABLE_NETWORK_LIST = ptr::null_mut();
                    if WlanGetAvailableNetworkList(client_handle, &iface.interface_guid, 0, ptr::null_mut(), &mut avail_list_ptr) == 0 && !avail_list_ptr.is_null() {
                        let avail_count = (*avail_list_ptr).dw_number_of_items as usize;
                        let net_ptr = (*avail_list_ptr).network.as_ptr();
                        for n in 0..avail_count {
                            let net = *net_ptr.add(n);
                            let prof_name = u16_slice_to_string(&net.str_profile_name);
                            let ssid_len = net.dot11_ssid.u_ssid_length as usize;
                            let raw_ssid = if ssid_len > 0 && ssid_len <= 32 {
                                std::str::from_utf8(&net.dot11_ssid.uc_ssid[..ssid_len]).ok().map(|s| s.to_string())
                            } else {
                                None
                            };

                            if !prof_name.is_empty() {
                                signal_map.insert(prof_name.clone(), net.wlan_signal_quality as u8);
                            }
                            if let Some(ref s) = raw_ssid {
                                signal_map.insert(s.clone(), net.wlan_signal_quality as u8);
                            }

                            // Flag 1 (WLAN_AVAILABLE_NETWORK_CONNECTED) indicates currently connected network
                            if (net.dw_flags & 1) != 0 {
                                if !prof_name.is_empty() {
                                    connected_profile_name = Some(prof_name);
                                } else if let Some(s) = raw_ssid {
                                    connected_profile_name = Some(s);
                                }
                            }
                        }
                        WlanFreeMemory(avail_list_ptr as *mut std::ffi::c_void);
                    }

                    // 2. Query saved profiles
                    let mut profile_list_ptr: *mut WLAN_PROFILE_INFO_LIST = ptr::null_mut();
                    if WlanGetProfileList(client_handle, &iface.interface_guid, ptr::null_mut(), &mut profile_list_ptr) == 0 && !profile_list_ptr.is_null() {
                        let prof_count = (*profile_list_ptr).dw_number_of_items as usize;
                        let profs_ptr = (*profile_list_ptr).profile_info.as_ptr();

                        for p in 0..prof_count {
                            let prof = *profs_ptr.add(p);
                            let profile_name = u16_slice_to_string(&prof.str_profile_name);
                            if profile_name.is_empty() {
                                continue;
                            }

                            // Query non-secret profile XML (dwFlags = 0 -> no plaintext keys)
                            let mut xml_ptr: *mut u16 = ptr::null_mut();
                            let mut flags: u32 = 0;
                            let mut access: u32 = 0;

                            let mut auth_type = None;
                            let mut cipher = None;
                            let mut security = None;

                            if WlanGetProfile(
                                client_handle,
                                &iface.interface_guid,
                                prof.str_profile_name.as_ptr(),
                                ptr::null_mut(),
                                &mut xml_ptr,
                                &mut flags,
                                &mut access,
                            ) == 0 && !xml_ptr.is_null() {
                                let mut len = 0;
                                while *xml_ptr.add(len) != 0 {
                                    len += 1;
                                }
                                let xml_slice = std::slice::from_raw_parts(xml_ptr, len);
                                let xml_str = String::from_utf16_lossy(xml_slice);

                                let (_xml_ssid, raw_auth, raw_enc) = parse_windows_profile_xml(&xml_str);
                                if let (Some(a), Some(e)) = (raw_auth.as_ref(), raw_enc.as_ref()) {
                                    let (sec, ciph) = normalize_security_type(a, e);
                                    security = Some(sec);
                                    cipher = Some(ciph);
                                }
                                auth_type = raw_auth;

                                WlanFreeMemory(xml_ptr as *mut std::ffi::c_void);
                            }

                            let signal_percent = signal_map.get(&profile_name).copied();
                            let connected = is_connected && connected_profile_name.as_deref() == Some(&profile_name);

                            profiles.push(WifiProfile {
                                ssid: profile_name.clone(),
                                interface_name: Some(iface_desc.clone()),
                                connected,
                                signal_percent,
                                security,
                                cipher,
                                auth_type,
                                has_profile: true,
                            });
                        }

                        WlanFreeMemory(profile_list_ptr as *mut std::ffi::c_void);
                    }

                }

                WlanFreeMemory(iface_list_ptr as *mut std::ffi::c_void);
            }

            WlanCloseHandle(client_handle, ptr::null_mut());
        }

        profiles
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::*;
    use std::fs;
    use std::path::Path;

    pub fn query_wifi_profiles() -> Vec<WifiProfile> {
        let mut profiles = Vec::new();
        let conn_dir = Path::new("/etc/NetworkManager/system-connections");

        if let Ok(entries) = fs::read_dir(conn_dir) {
            for entry in entries.flatten() {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    if let Some(prof) = parse_linux_nmconnection(&content) {
                        profiles.push(prof);
                    }
                }
            }
        }

        profiles
    }
}

/// Enumerate locally known Wi-Fi network profiles and their non-secret security metadata.
pub fn get_wifi_profiles() -> Vec<WifiProfile> {
    #[cfg(target_os = "windows")]
    {
        windows::query_wifi_profiles()
    }

    #[cfg(target_os = "linux")]
    {
        linux::query_wifi_profiles()
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_security_types() {
        let (s1, c1) = normalize_security_type("WPA2PSK", "AES");
        assert_eq!(s1, "WPA2-Personal");
        assert_eq!(c1, "AES");

        let (s2, c2) = normalize_security_type("WPA3SAE", "GCMP-256");
        assert_eq!(s2, "WPA3-Personal");
        assert_eq!(c2, "GCMP");

        let (s3, c3) = normalize_security_type("open", "none");
        assert_eq!(s3, "Open");
        assert_eq!(c3, "None");

        let (s4, c4) = normalize_security_type("WPA2-Enterprise", "TKIP");
        assert_eq!(s4, "Enterprise");
        assert_eq!(c4, "TKIP");

        let (s5, c5) = normalize_security_type("wpa-psk", "AES");
        assert_eq!(s5, "WPA-Personal");
        assert_eq!(c5, "AES");
    }

    #[test]
    fn test_parse_windows_profile_xml() {
        let sample_xml = r#"<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>Office_Guest_5G</name>
    <SSIDConfig>
        <SSID>
            <name>Office_Guest_5G</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
        </security>
    </MSM>
</WLANProfile>"#;

        let (ssid, auth, enc) = parse_windows_profile_xml(sample_xml);
        assert_eq!(ssid, Some("Office_Guest_5G".into()));
        assert_eq!(auth, Some("WPA2PSK".into()));
        assert_eq!(enc, Some("AES".into()));
    }

    #[test]
    fn test_parse_linux_nmconnection() {
        let sample_nmconn = r#"[connection]
id=Campus_Wireless
uuid=12345678-1234-1234-1234-123456789abc
type=wifi
interface-name=wlan0

[wifi]
mode=infrastructure
ssid=Campus_Wireless

[wifi-security]
auth-alg=open
key-mgmt=wpa-psk
psk=REDACTED_DO_NOT_PARSE
"#;

        let profile = parse_linux_nmconnection(sample_nmconn).expect("Should parse Wi-Fi profile");
        assert_eq!(profile.ssid, "Campus_Wireless");
        assert_eq!(profile.interface_name, Some("wlan0".into()));
        assert_eq!(profile.security, Some("WPA-Personal".into()));
        assert_eq!(profile.cipher, Some("AES".into()));
        assert_eq!(profile.has_profile, true);
    }

    #[test]
    fn test_parse_linux_nmconnection_non_wifi_returns_none() {
        let sample_eth = r#"[connection]
id=Wired Connection 1
type=ethernet
interface-name=eth0
"#;
        assert!(parse_linux_nmconnection(sample_eth).is_none());
    }

    #[test]
    fn test_get_wifi_profiles_live_system_does_not_panic() {
        let profiles = get_wifi_profiles();
        // On systems without Wi-Fi, this should safely return an empty vec without errors.
        // On systems with Wi-Fi, it returns valid WifiProfile entries.
        for p in &profiles {
            assert!(!p.ssid.is_empty());
        }
    }
}
