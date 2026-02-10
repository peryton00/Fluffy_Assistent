import { invoke } from "@tauri-apps/api/core";
import { listen } from '@tauri-apps/api/event';

const FLUFFY_TOKEN = "fluffy_dev_token";
const expandedPids = new Set<number>();
const pendingKills = new Set<number>();
let lastData: any = null;
let searchQuery = "";
let uiActive = true; // Default to true since window starts visible

// Chart state
const MAX_HISTORY = 60;
const statHistory = {
  cpu: new Array(MAX_HISTORY).fill(0),
  ram: new Array(MAX_HISTORY).fill(0)
};

let sortMode = localStorage.getItem("fluffy_sort_mode") || "ram";
const pinnedProcesses = new Set<string>(JSON.parse(localStorage.getItem("fluffy_pinned_names") || "[]"));

/* =========================
   UTILITIES
========================= */
async function apiRequest(url: string, options: any = {}, retries = 3): Promise<any> {
  const headers = {
    "Content-Type": "application/json",
    "X-Fluffy-Token": FLUFFY_TOKEN,
    ...(options.headers || {})
  };

  for (let i = 0; i < retries; i++) {
    const start = performance.now();
    try {
      const res = await fetch(url, { ...options, headers });
      const latency = performance.now() - start;
      updatePing(latency);

      const contentType = res.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (!res.ok) {
        let message = "Request failed";
        if (isJson) {
          const err = await res.json();
          message = err.error || message;
        } else {
          message = `Server error: ${res.status} ${res.statusText}`;
        }

        // If 403, we might be desynced on UI_ACTIVE
        if (res.status === 403 && url !== "/ui_connected") {
          console.warn("UI Disconnected from backend. Re-syncing...");
          await apiRequest("/ui_connected", { method: "POST" });
        }

        throw new Error(message);
      }

      if (isJson) return await res.json();
      return null;
    } catch (err: any) {
      const isConnError = err.message.includes("Failed to fetch") || err.message.includes("ECONNREFUSED");
      if (isConnError && i < retries - 1) {
        console.warn(`Connection refused for ${url}, retrying in 1s... (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      console.error(`API Error (${url}):`, err);
      if (url !== "/status" && url !== "/logs") { // Don't spam logs for background polls
        addLog(err.message, "error");
      }
      return null;
    }
  }
}

function addLog(message: string, level: string = "info") {
  const ul = document.getElementById("logs");
  if (!ul) return;
  const li = document.createElement("li");
  li.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  li.className = `log-${level}`;
  ul.prepend(li);
  while (ul.children.length > 50 && ul.lastChild) ul.removeChild(ul.lastChild);
}

function updatePing(ms: number) {
  const dot = document.getElementById("ping-dot");
  const value = document.getElementById("ping-value");
  if (!value || !dot) return;

  const latency = Math.round(ms);
  value.innerText = `${latency} ms`;

  // Update status color based on latency
  dot.className = "ping-dot";
  if (latency > 500) dot.classList.add("error");
  else if (latency > 150) dot.classList.add("warning");
}

/* =========================
   UI FEEDBACK (TOASTS)
========================= */
function showToast(message: string, type: "success" | "error" | "info" = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerText = message;

  container.appendChild(toast);

  // Auto remove after 3s
  setTimeout(() => {
    toast.style.animation = "fadeOut 0.3s ease-in forwards";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* =========================
   NAVIGATION & SEARCH
========================= */
function setupNavigation() {
  const navItems = ["dashboard", "processes", "analytics", "startup", "settings"];
  navItems.forEach(id => {
    const btn = document.getElementById(`nav-${id}`);
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        switchView(id);
      };
    }
  });

  const searchInput = document.getElementById("process-search-input") as HTMLInputElement;
  const clearBtn = document.getElementById("clear-search");

  const clearSearch = () => {
    searchQuery = "";
    if (searchInput) searchInput.value = "";
    if (lastData) renderUI(lastData);
  };

  if (searchInput) {
    searchInput.oninput = (e) => {
      searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      if (lastData) renderUI(lastData);
    };
  }

  if (clearBtn) {
    clearBtn.onclick = clearSearch;
  }


  const refreshBtn = document.getElementById("refresh-tree");
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      const originalText = refreshBtn.innerText;
      refreshBtn.innerText = "Refreshing...";
      (refreshBtn as HTMLButtonElement).disabled = true;

      clearSearch(); // Reset search when refreshing the tree
      await fetchData();

      refreshBtn.innerText = originalText;
      (refreshBtn as HTMLButtonElement).disabled = false;
      showToast("Process tree synchronized", "success");
    };
  }

  const themeToggle = document.getElementById("theme-toggle-input") as HTMLInputElement;
  const savedTheme = localStorage.getItem("fluffy_theme") || "dark";
  if (themeToggle) {
    themeToggle.checked = savedTheme === "dark";
    document.body.classList.toggle("light-mode", savedTheme === "light");

    themeToggle.onchange = () => {
      const mode = themeToggle.checked ? "dark" : "light";
      document.body.classList.toggle("light-mode", mode === "light");
      localStorage.setItem("fluffy_theme", mode);
    };
  }

  const sortSelect = document.getElementById("process-sort-mode") as HTMLSelectElement;
  if (sortSelect) {
    sortSelect.value = sortMode;
    sortSelect.onchange = () => {
      sortMode = sortSelect.value;
      localStorage.setItem("fluffy_sort_mode", sortMode);
      if (lastData) renderUI(lastData);
    };
  }

  setupModal();

  const normalizeBtn = document.getElementById("btn-normalize");
  if (normalizeBtn) {
    normalizeBtn.onclick = () => normalizeSystem();
  }

  setupStartupApps();

  // Setup Result Modal
  const resultModal = document.getElementById("result-modal");
  const closeResultBtn = document.getElementById("close-result-modal");
  const okResultBtn = document.getElementById("result-ok");
  if (resultModal && closeResultBtn && okResultBtn) {
    const hide = () => resultModal.classList.remove("active");
    closeResultBtn.onclick = hide;
    okResultBtn.onclick = hide;
  }
}

async function normalizeSystem() {
  const btn = document.getElementById("btn-normalize") as HTMLButtonElement;
  if (!btn) return;

  const originalText = btn.innerText;
  btn.innerText = "Normalizing...";
  btn.disabled = true;

  addLog("Normalization pulse starting...", "action");
  const data = await apiRequest("/normalize", { method: "POST" });

  if (data && data.ok) {
    let detailsHtml = `
      <ul>
        <li>Volume reset to 50%</li>
        <li>Brightness optimized to 70%</li>
        <li>Temp directories purged</li>
      </ul>
    `;

    if (data.unusual_processes && data.unusual_processes.length > 0) {
      const processList = data.unusual_processes.map((p: any) => `<li>${p.name} (PID: ${p.pid})</li>`).join("");
      detailsHtml += `
        <div style="margin-top:15px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
          <p style="color:#f59e0b; margin-bottom:5px;">⚠️ <strong>${data.unusual_processes.length} Unusual Process(es) Detected:</strong></p>
          <ul style="color:#e2e8f0; font-size:0.9em;">${processList}</ul>
        </div>
      `;
    } else {
      detailsHtml += `<p style="margin-top:10px; color:#10b981; font-size:0.9em;">✅ No unusual processes detected.</p>`;
    }

    showResultModal(
      "Normalization Success",
      "System has been successfully optimized.",
      "✅",
      detailsHtml
    );
  } else {
    showResultModal(
      "Normalization Failed",
      data?.error || "An unknown error occurred during normalization.",
      "❌",
      ""
    );
  }

  btn.innerText = originalText;
  btn.disabled = false;
  await fetchData();
}

function showResultModal(title: string, message: string, icon: string, detailsHtml: string) {
  const modal = document.getElementById("result-modal");
  const titleEl = document.getElementById("result-title");
  const messageEl = document.getElementById("result-message");
  const iconEl = document.getElementById("result-icon");
  const detailsEl = document.getElementById("result-details");

  if (!modal || !titleEl || !messageEl || !iconEl || !detailsEl) return;

  titleEl.innerText = title;
  messageEl.innerText = message;
  iconEl.innerText = icon;
  detailsEl.innerHTML = detailsHtml;

  modal.classList.add("active");
}

function setupModal() {
  const modal = document.getElementById("security-modal");
  const detailsBtn = document.querySelector(".upgrade-btn") as HTMLButtonElement;
  const closeBtn = document.getElementById("close-modal");
  const okBtn = document.getElementById("modal-ok");

  if (!modal || !detailsBtn || !closeBtn || !okBtn) return;

  const show = () => modal.classList.add("active");
  const hide = () => modal.classList.remove("active");

  detailsBtn.onclick = (e) => {
    e.preventDefault();
    show();
  };

  closeBtn.onclick = hide;
  okBtn.onclick = hide;

  // Close on outside click
  modal.onclick = (e) => {
    if (e.target === modal) hide();
  };
}

function switchView(viewId: string) {
  // Update active nav state
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  document.getElementById(`nav-${viewId}`)?.classList.add("active");

  // Update visible section
  document.querySelectorAll(".view-section").forEach(el => el.classList.remove("active"));
  document.getElementById(`section-${viewId}`)?.classList.add("active");

  // Update title
  const titleEl = document.getElementById("view-title");
  if (titleEl) titleEl.innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);

  // Trigger immediate render if we have data
  if (lastData) renderUI(lastData);
}

/* =========================
   COMMANDS
========================= */
async function confirmCommand(commandId: string, approve: boolean = true) {
  const data = await apiRequest("/command", {
    method: "POST",
    body: JSON.stringify(approve
      ? { Confirm: { command_id: commandId } }
      : { Cancel: { command_id: commandId } }
    )
  });

  if (data && data.ok) {
    addLog(approve ? "Command confirmed" : "Command cancelled", "action");
  }
  await fetchData();
}

async function killProcess(pid: number, mode: string = "tree") {
  const msg = mode === "tree"
    ? "Terminate this process and ALL its children?"
    : "Terminate ONLY this process?";

  if (!confirm(`⚠ ${msg}\nUnsaved work may be lost.`)) return;

  // Optimistic UI: Mark for removal
  pendingKills.add(pid);
  if (lastData) renderUI(lastData);

  addLog(`Requesting kill (${mode}) for PID ${pid}`, "action");
  const res = await apiRequest("/command", {
    method: "POST",
    body: JSON.stringify({ KillProcess: { pid } })
  });

  if (res) {
    showToast(`Successfully requested termination for PID ${pid}`, "success");
    addLog(`Termination sequence initiated for PID ${pid}`, "info");
    // Immediate refresh to sync with backend
    await fetchData();
  } else {
    // If request failed, remove from pending so it reappears
    pendingKills.delete(pid);
    if (lastData) renderUI(lastData);
  }
}

/* =========================
   CHARTING
========================= */
function updateChart(cpu: number, ramUsagePercent: number) {
  statHistory.cpu.push(cpu);
  statHistory.ram.push(ramUsagePercent);
  if (statHistory.cpu.length > MAX_HISTORY) {
    statHistory.cpu.shift();
    statHistory.ram.shift();
  }

  const cpuPath = document.getElementById("cpu-path") as any;
  const ramPath = document.getElementById("ram-path") as any;

  const generatePath = (data: number[]) => {
    if (data.length < 2) return "";
    const width = 400;
    const height = 150;
    const points = data.map((val, i) => {
      const x = (i / (MAX_HISTORY - 1)) * width;
      const y = height - (Math.min(val, 100) / 100) * height;
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")}`;
  };

  if (cpuPath) cpuPath.setAttribute("d", generatePath(statHistory.cpu));
  if (ramPath) ramPath.setAttribute("d", generatePath(statHistory.ram));
}

/* =========================
   TREE RENDERING
========================= */
function buildTree(processes: any[]): any[] {
  const map: any = {};
  const roots: any[] = [];

  processes.forEach(p => map[p.pid] = { ...p, children: [] });
  processes.forEach(p => {
    // Check if parent_pid is explicitly not null/undefined (handle PID 0)
    if (p.parent_pid !== null && p.parent_pid !== undefined && map[p.parent_pid]) {
      map[p.parent_pid].children.push(map[p.pid]);
    } else {
      roots.push(map[p.pid]);
    }
  });

  // Sort children by RAM by default to keep tree organized
  Object.values(map).forEach((node: any) => {
    if (node.children.length > 0) {
      node.children.sort((a: any, b: any) => b.ram_mb - a.ram_mb);
    }
  });

  return roots;
}

function calculateTotalRam(node: any): number {
  let total = node.ram_mb;
  if (node.children && node.children.length > 0) {
    total += node.children.reduce((sum: number, child: any) => sum + calculateTotalRam(child), 0);
  }
  node.total_ram_mb = total;
  return total;
}

function processMatchesSearch(node: any): boolean {
  if (!searchQuery) return true;
  const nameMatch = node.name.toLowerCase().includes(searchQuery);
  const pidMatch = node.pid.toString().includes(searchQuery);
  if (nameMatch || pidMatch) return true;
  return node.children.some((child: any) => processMatchesSearch(child));
}

function renderNode(node: any, container: HTMLElement) {
  const isPinned = pinnedProcesses.has(node.name);
  const matches = !searchQuery || node.name.toLowerCase().includes(searchQuery) || node.pid.toString().includes(searchQuery);
  const subTreeMatches = processMatchesSearch(node);

  if (!subTreeMatches) return; // Hide if nothing in this branch matches

  const nodeEl = document.createElement("div");
  nodeEl.className = `tree-node ${isPinned ? 'is-pinned' : ''}`;

  const hasChildren = node.children && node.children.length > 0;

  // Auto-expand if searching and branch matches
  const shouldExpand = (searchQuery && subTreeMatches && hasChildren) || expandedPids.has(node.pid);

  const ramDisplay = hasChildren
    ? `<span class="tree-ram">${node.ram_mb} MB</span> <span class="tree-ram-total" title="Total Tree Memory">(Σ ${node.total_ram_mb} MB)</span>`
    : `<span class="tree-ram">${node.ram_mb} MB</span>`;

  const row = document.createElement("div");
  row.className = `tree-row ${matches && searchQuery ? 'search-match' : ''}`;
  row.innerHTML = `
    <div class="tree-left">
      <div class="tree-toggle ${shouldExpand ? "expanded" : ""}">
        ${hasChildren ? (shouldExpand ? "−" : "+") : "•"}
      </div>
      <span class="tree-label">${node.name} ${isPinned ? '<span class="pinned-badge">Pinned</span>' : ''}</span>
      <span class="tree-pid">${node.pid}</span>
    </div>
    <div class="tree-right">
      <div class="process-actions">
        <div class="action-icon ${isPinned ? 'pinned' : ''}" title="${isPinned ? 'Unpin' : 'Pin'}" data-action="pin">📌</div>
        <div class="action-icon" title="Open File Location" data-action="folder">📁</div>
        <div class="action-icon" title="Google Search" data-action="google">🔍</div>
      </div>
      <div class="tree-stats">
        ${ramDisplay}
        <span class="tree-cpu">${node.cpu_percent.toFixed(1)}%</span>
        <button class="btn-tree-kill">${hasChildren ? "Kill Tree" : "Kill"}</button>
      </div>
    </div>
  `;

  if (hasChildren) {
    row.style.cursor = "pointer";
    row.onclick = (e: MouseEvent) => {
      // Don't toggle if clicking a button or action icon
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('.action-icon')) return;

      if (expandedPids.has(node.pid)) expandedPids.delete(node.pid);
      else expandedPids.add(node.pid);
      renderUI(lastData);
    };
  }

  // Action Logic
  row.querySelectorAll(".action-icon").forEach((icon: any) => {
    icon.onclick = async (e: MouseEvent) => {
      e.stopPropagation();
      const action = icon.dataset.action;
      if (action === "pin") {
        if (isPinned) pinnedProcesses.delete(node.name);
        else pinnedProcesses.add(node.name);
        localStorage.setItem("fluffy_pinned_names", JSON.stringify(Array.from(pinnedProcesses)));
        renderUI(lastData);
      } else if (action === "folder") {
        try {
          // In Tauri 2.0, we use the opener plugin
          const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
          if (node.exe_path) {
            await revealItemInDir(node.exe_path);
          } else {
            showToast("Path info not available for this process", "info");
          }
        } catch (err) {
          console.error("Opener failed:", err);
          showToast("Failed to open location", "error");
        }
      } else if (action === "google") {
        try {
          const { openUrl } = await import('@tauri-apps/plugin-opener');
          const query = encodeURIComponent(`what is process ${node.name} windows`);
          await openUrl(`https://www.google.com/search?q=${query}`);
        } catch (err) {
          console.error("Google search failed:", err);
          showToast("Failed to open search", "error");
        }
      }
    };
  });

  const killBtn = row.querySelector(".btn-tree-kill") as HTMLButtonElement;
  killBtn.onclick = () => killProcess(node.pid, hasChildren ? "tree" : "single");

  nodeEl.appendChild(row);

  if (hasChildren) {
    const childrenContainer = document.createElement("div");
    childrenContainer.className = `tree-children ${shouldExpand ? "active" : ""}`;

    // Recursive sort for children
    const sortedChildren = [...node.children].sort((a: any, b: any) => {
      if (sortMode === "ram") return b.ram_mb - a.ram_mb;
      if (sortMode === "cpu") return b.cpu_percent - a.cpu_percent;
      if (sortMode === "name") return a.name.localeCompare(b.name);
      return 0;
    });

    sortedChildren.forEach((child: any) => {
      renderNode(child, childrenContainer);
    });
    nodeEl.appendChild(childrenContainer);
  }

  container.appendChild(nodeEl);
}

/* =========================
   VIEW UPDATES
========================= */
function renderDashboard(data: any) {
  const sys = data.system;
  const cpu = sys.cpu.usage_percent;
  const ram = sys.ram;
  const ramPercent = (ram.used_mb / ram.total_mb) * 100;

  const cpuEl = document.getElementById("cpu-value");
  if (cpuEl) cpuEl.innerText = `${cpu.toFixed(1)}%`;

  const ramEl = document.getElementById("ram-value");
  if (ramEl) ramEl.innerText = `${ram.used_mb} MB`;

  const ramTotalEl = document.getElementById("ram-total");
  if (ramTotalEl) ramTotalEl.innerText = `Total: ${(ram.total_mb / 1024).toFixed(1)} GB`;

  const procCountEl = document.getElementById("proc-count");
  const filteredProcs = sys.processes.top_ram.filter((p: any) => !pendingKills.has(p.pid));
  if (procCountEl) procCountEl.innerText = filteredProcs.length.toString();

  // Fluffy Self-Monitoring (Aggregated ecosystem footprint)
  const fluffyProcesses = sys.processes.top_ram.filter((p: any) => {
    const name = p.name.toLowerCase();
    return name.includes("fluffy") ||
      name === "core.exe" ||
      name === "core" ||
      name.includes("tauri") ||
      name.includes("python"); // Added python for dev env
  });

  // console.log("Fluffy Processes:", fluffyProcesses);

  let totalCpu = 0;
  let totalRam = 0;
  fluffyProcesses.forEach((p: any) => {
    totalCpu += p.cpu_percent;
    totalRam += p.ram_mb;
  });

  const fluffyCpuEl = document.getElementById("fluffy-usage");
  if (fluffyCpuEl) fluffyCpuEl.innerText = `${totalCpu.toFixed(1)}%`;

  const fluffyRamEl = document.getElementById("fluffy-ram");
  if (fluffyRamEl) fluffyRamEl.innerText = `${totalRam} MB`;

  // Active Sessions
  const sessionCountEl = document.getElementById("session-count");
  if (sessionCountEl) {
    // Default to 1 if not present (legacy support)
    const count = data.active_sessions !== undefined ? data.active_sessions : 1;
    sessionCountEl.innerText = count.toString();
  }

  // Render Offenders (Filtered)
  const offendersContainer = document.getElementById("offenders-list");
  if (offendersContainer) {
    offendersContainer.innerHTML = "";
    const offenders = [...sys.processes.top_ram]
      .filter(p => !pendingKills.has(p.pid))
      .sort((a, b) => b.ram_mb - a.ram_mb)
      .slice(0, 5);

    const maxRam = sys.processes.top_ram.reduce((max: number, p: any) => Math.max(max, p.ram_mb), 1);
    offenders.forEach(p => {
      const percent = Math.min((p.ram_mb / maxRam) * 100, 100);
      const div = document.createElement("div");
      div.className = "offender-item";
      div.innerHTML = `
          <div class="offender-bar-container">
            <div class="offender-info">
              <span>${p.name.substring(0, 15)}</span>
              <span>${p.ram_mb} MB</span>
            </div>
            <div class="offender-bar-bg">
              <div class="offender-bar-fill" style="width: ${percent}%"></div>
            </div>
          </div>
        `;
      offendersContainer.appendChild(div);
    });
  }

  // Network Telemetry
  const net = sys.network;
  const rxSpeed = net.total_rx_kbps > 1024 ? `${(net.total_rx_kbps / 1024).toFixed(1)} MB/s` : `${net.total_rx_kbps.toFixed(1)} KB/s`;
  const txSpeed = net.total_tx_kbps > 1024 ? `${(net.total_tx_kbps / 1024).toFixed(1)} MB/s` : `${net.total_tx_kbps.toFixed(1)} KB/s`;

  const headerSpeedEl = document.getElementById("header-net-speed");
  if (headerSpeedEl) headerSpeedEl.innerText = `${(net.total_rx_kbps / 1024).toFixed(1)} Mbps`;

  const headerIconEl = document.getElementById("header-net-icon");
  if (headerIconEl) {
    if (net.status === "wifi") headerIconEl.innerText = "📶";
    else if (net.status === "ethernet") headerIconEl.innerText = "🔌";
    else headerIconEl.innerText = "🚫";
  }

  const netRxEl = document.getElementById("net-rx-value");
  if (netRxEl) netRxEl.innerText = rxSpeed;

  const netTxEl = document.getElementById("net-tx-value");
  if (netTxEl) netTxEl.innerText = txSpeed;

  const netStatusEl = document.getElementById("net-status-label");
  if (netStatusEl) netStatusEl.innerText = net.status.charAt(0).toUpperCase() + net.status.slice(1);

  const netCardIconEl = document.getElementById("net-card-icon");
  if (netCardIconEl) {
    if (net.status === "wifi") netCardIconEl.innerText = "📶";
    else if (net.status === "ethernet") netCardIconEl.innerText = "🔌";
    else netCardIconEl.innerText = "🌐";
  }

  const healthEl = document.getElementById("health-status");
  if (healthEl && sys.health) {
    healthEl.innerText = sys.health.charAt(0).toUpperCase() + sys.health.slice(1).toLowerCase();
    healthEl.className = sys.health.toLowerCase();
  }

  updateChart(cpu, ramPercent);

  // Link Speed Test button if dashboard is active
  const speedBtn = document.getElementById("btn-run-speedtest");
  if (speedBtn) {
    speedBtn.onclick = () => runSpeedTest();
  }
}

async function runSpeedTest() {
  const btn = document.getElementById("btn-run-speedtest") as HTMLButtonElement;
  const statusEl = document.getElementById("speed-test-status");
  const resultEl = document.getElementById("speed-result-value");
  const circleEl = document.querySelector(".speed-circle");

  if (!btn || !statusEl || !resultEl || !circleEl) return;

  btn.disabled = true;
  statusEl.innerText = "Testing bandwidth... (5-10MB sample)";
  circleEl.classList.add("testing");
  resultEl.innerText = "0.0";

  addLog("Internet speed test started", "action");

  try {
    const data = await apiRequest("/net-speed", { method: "POST" });
    if (data && data.status === "success") {
      resultEl.innerText = data.download_mbps.toFixed(1);
      statusEl.innerText = `Test complete! Latency: ${data.ping_ms}ms`;
      addLog(`Speed test success: ${data.download_mbps} Mbps`, "success");
    } else {
      statusEl.innerText = "Speed test failed. Try again.";
      addLog("Speed test failed", "error");
    }
  } catch (err) {
    statusEl.innerText = "Connection error during test.";
    addLog("Speed test connection error", "error");
  } finally {
    btn.disabled = false;
    circleEl.classList.remove("testing");
  }
}

function renderProcesses(data: any) {
  const container = document.getElementById("processes-tree");
  const highlightContainer = document.getElementById("top-consumer-highlight");
  if (!container || !data.system) return;

  container.innerHTML = "";
  // Filter out processes that are pending removal
  const allProcs = data.system.processes.top_ram || [];
  const filtered = allProcs.filter((p: any) => !pendingKills.has(p.pid));

  // Sort and Build Tree
  filtered.sort((a: any, b: any) => {
    // 1. Pinned Always Top
    const aPinned = pinnedProcesses.has(a.name);
    const bPinned = pinnedProcesses.has(b.name);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;

    // 2. User selected sort mode
    if (sortMode === "ram") return b.ram_mb - a.ram_mb;
    if (sortMode === "cpu") return b.cpu_percent - a.cpu_percent;
    if (sortMode === "name") return a.name.localeCompare(b.name);
    return 0;
  });

  const tree = buildTree(filtered);
  // Calculate total tree RAM for each root
  tree.forEach(node => calculateTotalRam(node));

  tree.forEach(node => renderNode(node, container));

  // Handle Top Consumer Highlight
  if (highlightContainer) {
    if (filtered.length > 0) {
      const topOffender = filtered.reduce((prev: any, current: any) => (prev.ram_mb > current.ram_mb) ? prev : current);
      highlightContainer.style.display = "flex";
      highlightContainer.innerHTML = `
        <div class="top-consumer-info">
          <span class="top-consumer-badge">🔥 Top Resource Consumer</span>
          <span class="top-consumer-name">${topOffender.name} (PID: ${topOffender.pid})</span>
        </div>
        <div class="top-consumer-stats">
          <div class="top-consumer-usage">${topOffender.ram_mb} MB</div>
          <div class="top-consumer-label">Memory Usage</div>
        </div>
      `;
    } else {
      highlightContainer.style.display = "none";
    }
  }
}

function renderAnalytics(data: any) {
  const insightsEl = document.getElementById("insights");
  if (insightsEl) {
    insightsEl.innerHTML = "";
    (data._insights || []).forEach((text: string) => {
      const li = document.createElement("li");
      li.textContent = text;
      insightsEl.appendChild(li);
    });
  }
}

function renderStartupApps(data: any) {
  const tbody = document.getElementById("startup-list-body");
  if (!tbody || !data.persistence) return;

  tbody.innerHTML = "";
  data.persistence.forEach((app: any) => {
    const tr = document.createElement("tr");
    const statusClass = app.enabled ? "status-enabled" : "status-disabled";
    const statusLabel = app.enabled ? "Active" : "Disabled";

    tr.innerHTML = `
      <td><strong>${app.name}</strong></td>
      <td title="${app.command}">${app.command}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>
        <button class="btn-error btn-sm btn-remove-startup" data-name="${app.name}">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach event listeners to remove buttons
  document.querySelectorAll(".btn-remove-startup").forEach((btn: any) => {
    btn.onclick = () => removeStartupApp(btn.dataset.name);
  });
}

function setupStartupApps() {
  // Modal Logic
  const modal = document.getElementById("startup-modal");
  const openBtn = document.getElementById("btn-add-startup");
  const closeBtn = document.getElementById("close-startup-modal");
  const confirmBtn = document.getElementById("btn-confirm-add-startup");
  const browseBtn = document.getElementById("btn-browse-app");

  if (!modal || !openBtn || !closeBtn || !confirmBtn) return;

  const show = () => modal.classList.add("active");
  const hide = () => modal.classList.remove("active");

  openBtn.onclick = show;
  closeBtn.onclick = hide;

  if (browseBtn) {
    browseBtn.onclick = async () => {
      try {
        // Try to use Tauri Dialog plugin if available
        // Note: This requires '@tauri-apps/plugin-dialog'
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          multiple: false,
          filters: [{
            name: 'Executable',
            extensions: ['exe', 'bat', 'cmd', 'sh']
          }]
        });

        if (selected && typeof selected === 'string') {
          const pathInput = document.getElementById("new-startup-path") as HTMLInputElement;
          const nameInput = document.getElementById("new-startup-name") as HTMLInputElement;
          if (pathInput) pathInput.value = selected;

          // Auto-fill name if empty
          if (nameInput && !nameInput.value) {
            const filename = selected.split(/[\\/]/).pop();
            if (filename) nameInput.value = filename.replace(/\.(exe|bat|cmd|sh)$/i, '');
          }
        }
      } catch (err) {
        console.warn("Tauri Dialog plugin not found or failed. Falling back to manual entry.", err);
        showToast("Dialog feature not available. Please enter the path manually.", "info");
      }
    };
  }

  confirmBtn.onclick = async () => {
    const nameInput = document.getElementById("new-startup-name") as HTMLInputElement;
    const pathInput = document.getElementById("new-startup-path") as HTMLInputElement;

    if (nameInput.value && pathInput.value) {
      await addStartupApp(nameInput.value, pathInput.value);
      nameInput.value = "";
      pathInput.value = "";
      hide();
    } else {
      showToast("Please fill in both fields", "error");
    }
  };
}

async function addStartupApp(name: string, path: string) {
  addLog(`Requesting to add startup app: ${name}`, "action");
  await apiRequest("/command", {
    method: "POST",
    body: JSON.stringify({
      StartupAdd: { name, path }
    })
  });
  showToast("Request sent to add startup app", "info");
  await fetchData();
}

async function removeStartupApp(name: string) {
  if (!confirm(`Are you sure you want to remove '${name}' from startup?`)) return;

  addLog(`Requesting to remove startup app: ${name}`, "action");
  await apiRequest("/command", {
    method: "POST",
    body: JSON.stringify({
      StartupRemove: { name }
    })
  });
  showToast("Request sent to remove startup app", "info");
  await fetchData();
}

function renderUI(data: any) {
  if (!data) return;
  lastData = data;

  // Cleanup pendingKills (if process is no longer in the list, backend sync is complete)
  if (data.system && data.system.processes.top_ram) {
    const currentPids = new Set(data.system.processes.top_ram.map((p: any) => p.pid));
    pendingKills.forEach(pid => {
      if (!currentPids.has(pid)) pendingKills.delete(pid);
    });
  }

  // Background updates for charts regardless of view
  if (data.system) {
    const sys = data.system;
    const cpu = sys.cpu.usage_percent;
    const ramPercent = (sys.ram.used_mb / sys.ram.total_mb) * 100;
    updateChart(cpu, ramPercent);
  }

  // View-specific rendering
  const activeSection = document.querySelector(".view-section.active")?.id;
  if (activeSection === "section-dashboard") renderDashboard(data);
  else if (activeSection === "section-processes") renderProcesses(data);
  else if (activeSection === "section-analytics") renderAnalytics(data);
  else if (activeSection === "section-startup") renderStartupApps(data);

  // Status Dot (Tray Color Sync)
  const statusDot = document.getElementById("system-status-dot");
  if (statusDot && data.system && data.system.health) {
    statusDot.className = "status-dot " + data.system.health.toLowerCase();
  }

  // Confirmations (global layer)
  const warn = document.getElementById("admin-warning");
  const confs = data.pending_confirmations || [];
  if (warn) {
    if (confs.length > 0) {
      warn.style.display = "block";
      warn.innerHTML = "<h4>⚠ Action Required</h4>";
      confs.forEach((c: any) => {
        const div = document.createElement("div");
        div.className = "confirm-item";
        div.innerHTML = `
          <p><strong>${c.command_name}</strong>: ${c.details}</p>
          <div class="confirm-actions">
            <button class="btn-primary" id="conf-${c.command_id}">Confirm</button>
            <button class="btn-outline" id="canc-${c.command_id}">Cancel</button>
          </div>
        `;
        warn.appendChild(div);
        const confBtn = document.getElementById(`conf-${c.command_id}`) as HTMLButtonElement;
        const cancBtn = document.getElementById(`canc-${c.command_id}`) as HTMLButtonElement;
        if (confBtn) confBtn.onclick = () => confirmCommand(c.command_id, true);
        if (cancBtn) cancBtn.onclick = () => confirmCommand(c.command_id, false);
      });
    } else {
      warn.style.display = "none";
    }
  }

  // Notifications (Toast Feedback from Backend)
  if (data.notifications && data.notifications.length > 0) {
    data.notifications.forEach((n: any) => {
      showToast(n.message, n.type || "info");
    });
    // Clear notifications to prevent re-toast on re-render of the same data object
    data.notifications = [];
  }
}

/* =========================
   POLLING & INIT
========================= */
async function fetchData() {
  if (!uiActive) return;
  const data = await apiRequest("/status");

  if (data && data.status === "shutdown") {
    console.warn("System shutdown signal received. Closing App...");
    await invoke("graceful_shutdown");
    return;
  }

  if (data) renderUI(data);
}

async function fetchLogs() {
  if (!uiActive) return;
  const logs = await apiRequest("/logs");
  if (logs) {
    const ul = document.getElementById("logs");
    if (ul) {
      ul.innerHTML = "";
      logs.slice().reverse().forEach((log: any) => {
        const li = document.createElement("li");
        li.textContent = `[${log.level.toUpperCase()}] ${log.message}`;
        li.className = `log-${log.level}`;
        ul.appendChild(li);
      });
    }
  }
}

setupNavigation();
let dataInterval: any = null;
let logsInterval: any = null;

function startPolling() {
  if (dataInterval) clearInterval(dataInterval);
  if (logsInterval) clearInterval(logsInterval);

  dataInterval = setInterval(fetchData, 2000);
  logsInterval = setInterval(fetchLogs, 5000);

  fetchData();
  fetchLogs();
}

function stopPolling() {
  if (dataInterval) clearInterval(dataInterval);
  if (logsInterval) clearInterval(logsInterval);
  dataInterval = null;
  logsInterval = null;
}

// Listen for visibility changes from Rust
listen('ui-active', async (event) => {
  console.log('UI Active State Changed:', event.payload);
  uiActive = event.payload as boolean;
  if (uiActive) {
    const connected = await apiRequest("/ui_connected", { method: "POST" });
    if (connected) startPolling();
  } else {
    stopPolling();
    await apiRequest("/ui_disconnected", { method: "POST" });
  }
});

// Initial connection attempt with higher retry for boot up
console.log("Initializing Fluffy Dashboard connection...");
addLog("Connecting to Fluffy Brain...", "system");

apiRequest("/ui_connected", { method: "POST" }, 20).then((res) => {
  if (res) {
    console.log("Dashboard connected to brain.");
    addLog("Connected to Fluffy Brain", "system");
    startPolling();
  } else {
    addLog("Failed to connect to Brain after 20 attempts. Please check if Brain is running.", "error");
  }
});
