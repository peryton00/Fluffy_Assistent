use sysinfo::{Disks, System};

/// Handle disk --info command: RAM + all disks info.
pub fn handle_disk_info() -> Result<String, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let mut output = String::new();

    // RAM section
    let total_ram = sys.total_memory();
    let used_ram = sys.used_memory();
    let available_ram = sys.available_memory();
    let ram_pct = if total_ram > 0 {
        (used_ram as f64 / total_ram as f64) * 100.0
    } else {
        0.0
    };

    output.push_str("  ── RAM ─────────────────────────────────\n");
    output.push_str(&format!("  Total     : {}\n", format_bytes(total_ram)));
    output.push_str(&format!("  Used      : {}\n", format_bytes(used_ram)));
    output.push_str(&format!("  Available : {}\n", format_bytes(available_ram)));
    output.push_str(&format!("  Usage     : {:.1}%\n\n", ram_pct));

    // Disks section
    let disks = Disks::new_with_refreshed_list();

    output.push_str("  ── Disks ───────────────────────────────\n");
    output.push_str(&format!(
        "  {:<15} {:>10} {:>10} {:>10} {:>6} {:<10}\n",
        "MOUNT", "TOTAL", "USED", "FREE", "USE%", "FILESYSTEM"
    ));
    output.push_str(&format!("  {}\n", "─".repeat(65)));

    for disk in disks.list() {
        let mount = disk.mount_point().to_string_lossy().to_string();
        let total = disk.total_space();
        let available = disk.available_space();
        let used = total.saturating_sub(available);
        let pct = if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        let fs_type = disk.file_system().to_string_lossy().to_string();
        let is_removable = disk.is_removable();

        let label = if is_removable { " [removable]" } else { "" };
        let disk_name = disk.name().to_string_lossy().to_string();
        let display_name = if disk_name.is_empty() {
            mount.clone()
        } else {
            format!("{}{}", disk_name, label)
        };

        let mount_display = if mount.len() > 13 {
            format!("{}…", &mount[..12])
        } else {
            mount
        };

        output.push_str(&format!(
            "  {:<15} {:>10} {:>10} {:>10} {:>5.1}% {:<10}\n",
            mount_display,
            format_bytes(total),
            format_bytes(used),
            format_bytes(available),
            pct,
            fs_type,
        ));

        if !display_name.is_empty() && display_name != mount_display {
            output.push_str(&format!("    Label: {}\n", display_name));
        }
    }

    Ok(output)
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;
    const TB: u64 = 1024 * GB;

    if bytes >= TB {
        format!("{:.1} TB", bytes as f64 / TB as f64)
    } else if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}
