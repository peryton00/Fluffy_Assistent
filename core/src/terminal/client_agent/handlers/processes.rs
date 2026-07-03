use sysinfo::System;

/// List all running processes with PID, name, CPU%, MEM, status.
pub fn handle_processes() -> Result<String, String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_all();

    let mut procs: Vec<(u32, String, f32, u64, String)> = sys
        .processes()
        .iter()
        .map(|(pid, proc_info)| {
            let pid_val = pid.as_u32();
            let name = proc_info.name().to_string_lossy().into_owned();
            let cpu = proc_info.cpu_usage();
            let mem = proc_info.memory() / 1024; // Convert to KB
            let status = format!("{:?}", proc_info.status());
            (pid_val, name, cpu, mem, status)
        })
        .collect();

    // Sort by CPU% descending
    procs.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    let mut output = String::new();
    output.push_str(&format!(
        "  {:<8} {:<30} {:>6} {:>10} {:<10}\n",
        "PID", "NAME", "CPU%", "MEM (KB)", "STATUS"
    ));
    output.push_str(&format!("  {}\n", "─".repeat(70)));

    for (pid, name, cpu, mem, status) in &procs {
        let display_name: String = if name.len() > 28 {
            format!("{}…", &name[..27])
        } else {
            name.clone()
        };
        output.push_str(&format!(
            "  {:<8} {:<30} {:>5.1}% {:>10} {:<10}\n",
            pid, display_name, cpu, mem, status
        ));
    }

    output.push_str(&format!("\n  Total processes: {}", procs.len()));
    Ok(output)
}

/// Kill a process by PID.
pub fn handle_kill(pid: u32) -> Result<String, String> {
    let sys = System::new_all();
    let pid_obj = sysinfo::Pid::from_u32(pid);

    match sys.process(pid_obj) {
        Some(process) => {
            let proc_name = process.name().to_string_lossy().into_owned();
            if process.kill() {
                Ok(format!("Process {} ({}) killed successfully.", pid, proc_name))
            } else {
                Err(format!(
                    "Failed to kill process {} ({}). Permission denied or process is protected.",
                    pid,
                    proc_name
                ))
            }
        }
        None => Err(format!(
            "Process with PID {} not found. It may have already exited.",
            pid
        )),
    }
}
