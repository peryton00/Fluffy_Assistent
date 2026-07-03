pub struct OsDetails {
    pub name: String,
    pub version: String,
    pub build: String,
    pub edition: String,
}
pub struct BatteryInfo {
    pub percentage: Option<u8>,
    pub status: String,
    pub time_remaining: Option<String>,
}
pub struct UserInfo {
    pub username: String,
    pub role: String,
    pub last_login: String,
}

pub fn lock() -> Result<String, String> { Err("Not implemented".to_string()) }
pub fn shutdown() -> Result<String, String> { Err("Not implemented".to_string()) }
pub fn restart() -> Result<String, String> { Err("Not implemented".to_string()) }
pub fn notify(_msg: &str) -> Result<String, String> { Err("Not implemented".to_string()) }
pub fn alert() -> Result<String, String> { Err("Not implemented".to_string()) }
pub fn screenshot() -> Result<String, String> { Err("Not implemented".to_string()) }
pub fn clipboard_read() -> Result<String, String> { Err("Not implemented".to_string()) }
pub fn get_gpu_info() -> String { "Not implemented".to_string() }
pub fn get_os_details() -> OsDetails { OsDetails { name: String::new(), version: String::new(), build: String::new(), edition: String::new() } }
pub fn get_battery() -> BatteryInfo { BatteryInfo { percentage: None, status: String::new(), time_remaining: None } }
pub fn get_users() -> Vec<UserInfo> { vec![] }
pub fn get_install_date() -> String { "Unknown".to_string() }
