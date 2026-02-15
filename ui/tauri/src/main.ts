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

const DEFAULT_LAYOUT_ORDER = ["cpu", "ram", "proc", "health", "network", "speedtest", "fluffy", "sessions"];
let dashboardOrder = JSON.parse(localStorage.getItem("fluffy_dashboard_order") || JSON.stringify(DEFAULT_LAYOUT_ORDER));

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
  const navItems = ["dashboard", "processes", "guardian", "apps", "analytics", "startup", "settings"];
  navItems.forEach(id => {
    const btn = document.getElementById(`nav-${id}`);
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        switchView(id);
        if (id === "settings") renderLayoutSettings();
        if (id === "dashboard") applyDashboardOrder();
        if (id === "apps") fetchApps();
      };
    }
  });

  const appsSearchInput = document.getElementById("apps-search-input") as HTMLInputElement;
  if (appsSearchInput) {
    appsSearchInput.oninput = (e) => {
      const q = (e.target as HTMLInputElement).value.toLowerCase();
      renderApps(null, q); // Filter current list
    };
  }

  const refreshAppsBtn = document.getElementById("btn-refresh-apps");
  if (refreshAppsBtn) {
    refreshAppsBtn.onclick = () => fetchApps();
  }

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
    okResultBtn.onclick = hide;
  }

  const clearGuardianBtn = document.getElementById("btn-clear-guardian");
  if (clearGuardianBtn) {
    clearGuardianBtn.onclick = async () => {
      if (confirm("This will wipe all learned process behaviors. Are you sure?")) {
        await clearGuardianData();
      }
    };
  }

  // Floating Chat Button
  const fabChat = document.getElementById("fab-chat");
  if (fabChat) {
    fabChat.onclick = () => {
      switchView("chat");
    };
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
          <p style="color:#f59e0b; margin-bottom:5px; display:flex; align-items:center; gap:8px;">
            <i data-lucide="alert-triangle" style="width:18px; height:18px;"></i>
            <strong>${data.unusual_processes.length} Unusual Process(es) Detected:</strong>
          </p>
          <ul style="color:#e2e8f0; font-size:0.9em; margin-left:26px;">${processList}</ul>
        </div>
      `;
    } else {
      detailsHtml += `
        <p style="margin-top:10px; color:#10b981; font-size:0.9em; display:flex; align-items:center; gap:8px;">
          <i data-lucide="check-circle" style="width:18px; height:18px;"></i>
          No unusual processes detected.
        </p>
      `;
    }

    showResultModal(
      "Normalization Success",
      "System has been successfully optimized.",
      "check-circle",
      detailsHtml
    );
  } else {
    showResultModal(
      "Normalization Failed",
      data?.error || "An unknown error occurred during normalization.",
      "alert-octagon",
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
  iconEl.innerHTML = `<i data-lucide="${icon}"></i>`;
  detailsEl.innerHTML = detailsHtml;

  if ((window as any).lucide) (window as any).lucide.createIcons();

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

async function killProcess(pid: number, mode: string = "tree", skipConfirm = false) {
  const msg = mode === "tree"
    ? "Terminate this process and ALL its children?"
    : "Terminate ONLY this process?";

  if (!skipConfirm && !confirm(`⚠ ${msg}\nUnsaved work may be lost.`)) return;

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
        ${hasChildren ? (shouldExpand ? '<i data-lucide="minus-square"></i>' : '<i data-lucide="plus-square"></i>') : '<i data-lucide="circle" style="width:6px; height:6px; fill:currentColor;"></i>'}
      </div>
      <span class="tree-label">${node.name} ${isPinned ? '<span class="pinned-badge">Pinned</span>' : ''}</span>
      <span class="tree-pid">${node.pid}</span>
    </div>
    <div class="tree-right">
      <div class="process-actions">
        <div class="action-icon ${isPinned ? 'pinned' : ''}" title="${isPinned ? 'Unpin' : 'Pin'}" data-action="pin"><i data-lucide="pin"></i></div>
        <div class="action-icon" title="Open File Location" data-action="folder"><i data-lucide="folder"></i></div>
        <div class="action-icon" title="Google Search" data-action="google"><i data-lucide="search"></i></div>
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
  if (!data || !data.system || !data.system.cpu || !data.system.ram) {
    console.warn("Incomplete dashboard data", data);
    return;
  }
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
  if (headerSpeedEl) headerSpeedEl.innerText = `${net.total_rx_kbps.toFixed(0)} Kbps`;

  const headerIconEl = document.getElementById("header-net-icon");
  if (headerIconEl) {
    if (net.status === "wifi") headerIconEl.innerHTML = '<i data-lucide="wifi"></i>';
    else if (net.status === "ethernet") headerIconEl.innerHTML = '<i data-lucide="network"></i>';
    else headerIconEl.innerHTML = '<i data-lucide="wifi-off"></i>';
  }

  const netRxEl = document.getElementById("net-rx-value");
  if (netRxEl) netRxEl.innerText = rxSpeed;

  const netTxEl = document.getElementById("net-tx-value");
  if (netTxEl) netTxEl.innerText = txSpeed;

  const netStatusEl = document.getElementById("net-status-label");
  if (netStatusEl) netStatusEl.innerText = net.status.charAt(0).toUpperCase() + net.status.slice(1);

  const netCardIconEl = document.getElementById("net-card-icon");
  if (netCardIconEl) {
    if (net.status === "wifi") netCardIconEl.innerHTML = '<i data-lucide="wifi"></i>';
    else if (net.status === "ethernet") netCardIconEl.innerHTML = '<i data-lucide="network"></i>';
    else netCardIconEl.innerHTML = '<i data-lucide="globe"></i>';
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

  const healthDetailsBtn = document.getElementById("btn-health-details");
  if (healthDetailsBtn) {
    healthDetailsBtn.onclick = () => {
      const reasons = data.system?.health_reasons || ["No specific health signals recorded."];
      showHealthDetailsModal(reasons);
    };
  }
}

function showHealthDetailsModal(reasons: string[]) {
  const modal = document.getElementById("health-details-modal") as HTMLElement;
  const list = document.getElementById("health-reasons-list") as HTMLElement;
  const closeBtn = document.getElementById("close-health-details");

  if (!modal || !list || !closeBtn) return;

  list.innerHTML = reasons.map(r => `<li>${r}</li>`).join("");
  modal.classList.add("active");

  closeBtn.onclick = () => modal.classList.remove("active");
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove("active"); };
}

async function runSpeedTest() {
  const btn = document.getElementById("btn-run-speedtest") as HTMLButtonElement;
  const statusEl = document.getElementById("speed-test-status");
  const resultEl = document.getElementById("speed-result-value");
  const circleEl = document.querySelector(".speed-circle");

  if (!btn || !statusEl || !resultEl || !circleEl) return;

  btn.disabled = true;
  statusEl.innerText = "Testing bandwidth... (10s rigorous sample)";
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
      <td>
        <div class="status-cell">
           <label class="startup-toggle">
            <input type="checkbox" class="toggle-startup" data-name="${app.name}" ${app.enabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
          <span class="badge ${statusClass}">${statusLabel}</span>
        </div>
      </td>
      <td>
        <button class="btn-error btn-sm btn-remove-startup" data-name="${app.name}">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach event listeners to toggles
  document.querySelectorAll(".toggle-startup").forEach((input: any) => {
    input.onchange = () => toggleStartupApp(input.dataset.name, input.checked);
  });

  // Attach event listeners to remove buttons
  document.querySelectorAll(".btn-remove-startup").forEach((btn: any) => {
    btn.onclick = () => removeStartupApp(btn.dataset.name);
  });
}

async function trustProcess(name: string, risk_score: number) {
  addLog(`Requesting to trust behavior for: ${name}`, "action");

  // Optimistic UI: find and remove the card immediately
  const cardId = `alert-${name}-${risk_score}`;
  const card = document.getElementById(cardId);
  if (card) {
    card.style.opacity = "0";
    card.style.transform = "translateX(50px)";
    setTimeout(() => card.remove(), 300);
  }

  const res = await apiRequest("/trust_process", {
    method: "POST",
    body: JSON.stringify({ process: name })
  });
  if (res && res.ok) {
    showToast(`Behavior for ${name} is now trusted.`, "success");
    await fetchData();
  }
}

async function clearGuardianData() {
  addLog("Requesting to clear all Guardian recognition data", "action");
  const res = await apiRequest("/clear_guardian_data", { method: "POST" });
  if (res && res.ok) {
    showToast("Guardian data cleared. Learning phase restarted.", "info");
    await fetchData();
  }
}

function renderGuardianAlerts(data: any) {
  const container = document.getElementById("guardian-alerts");
  if (!container) return;

  const verdicts = data._guardian_verdicts || [];

  if (verdicts.length === 0) {
    container.innerHTML = `
      <div class="guardian-empty-state">
        <div class="empty-icon"><i data-lucide="shield-check"></i></div>
        <h3>System Secure</h3>
        <p>No suspicious behavioral chains detected in the last window.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  verdicts.forEach((v: any) => {
    const card = document.createElement("div");
    const cardId = `alert-${v.process}-${v.risk_score}`;
    card.id = cardId;
    card.className = `alert-card ${v.level.toLowerCase().replace(" ", "-")}`;
    card.innerHTML = `
      <div class="alert-header">
        <span class="alert-icon"><i data-lucide="alert-triangle"></i></span>
        <div>
          <h4>${v.process}</h4>
          <span class="alert-level">${v.level} (Score: ${v.risk_score.toFixed(1)})</span>
        </div>
      </div>
      <p class="alert-reason"><strong>Reason:</strong> ${v.reason}</p>
      <p class="alert-explanation">${v.explanation}</p>
      <div class="alert-actions">
        <button class="btn-primary btn-sm btn-kill" id="kill-${v.process}-${v.risk_score}">Terminate</button>
        <button class="btn-outline btn-sm btn-trust" id="trust-${v.process}-${v.risk_score}">Trust Behavior</button>
      </div>
    `;
    container.appendChild(card);

    const killBtn = card.querySelector(".btn-kill") as HTMLButtonElement;
    if (killBtn) {
      killBtn.onclick = () => killProcess(v.pid, "tree", true);
    }

    const trustBtn = card.querySelector(".btn-trust") as HTMLButtonElement;
    if (trustBtn) {
      trustBtn.onclick = () => trustProcess(v.process, v.risk_score);
    }
  });
}

async function toggleStartupApp(name: string, enabled: boolean) {
  addLog(`Requesting to ${enabled ? 'enable' : 'disable'} startup app: ${name}`, "action");
  await apiRequest("/command", {
    method: "POST",
    body: JSON.stringify({
      StartupToggle: { name, enabled }
    })
  });
  showToast(`Request sent to ${enabled ? 'enable' : 'disable'} startup app`, "info");
  await fetchData();
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
  else if (activeSection === "section-guardian") renderGuardianAlerts(data);
  else if (activeSection === "section-analytics") renderAnalytics(data);
  else if (activeSection === "section-startup") renderStartupApps(data);

  // Learning Mode Banner
  const learningBanner = document.getElementById("learning-mode-indicator");
  const learningProgress = document.getElementById("learning-progress");
  if (learningBanner && learningProgress && data._guardian_state) {
    const isLearning = data._guardian_state.is_learning;
    learningBanner.style.display = isLearning ? "flex" : "none";
    learningProgress.innerText = data._guardian_state.learning_progress.toString();
  }

  // Status Dot (Tray Color Sync) - Strictly system health
  const statusDot = document.getElementById("system-status-dot");
  if (statusDot) {
    const systemHealth = data.system?.health?.toLowerCase() || "healthy";
    statusDot.className = "status-dot " + systemHealth;
  }

  // Guardian Notifications (Sidebar Portal)
  renderGuardianNotifications(data);

  // Confirmations (global layer) - Filter out Guardian autonomous ones
  const warn = document.getElementById("admin-warning");
  const allConfs = data.pending_confirmations || [];

  // High-level filter: Only show manual/system confirmations here
  const systemConfs = allConfs.filter((c: any) =>
    !c.command_name.includes("Guardian") &&
    !c.details.toLowerCase().includes("suspicious")
  );

  if (warn) {
    if (systemConfs.length > 0) {
      warn.style.display = "block";
      warn.innerHTML = "<h4><i data-lucide='alert-triangle'></i> Action Required</h4>";
      systemConfs.forEach((c: any) => {
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

  // Admin warning globally handled at the top of renderUI
  // Guardian Alerts moved to dedicated tab

  // Notifications (Toast Feedback from Backend)
  if (data.notifications && data.notifications.length > 0) {
    data.notifications.forEach((n: any) => {
      showToast(n.message, n.type || "info");
    });
    // Clear notifications to prevent re-toast on re-render
    data.notifications = [];
  }

  if ((window as any).lucide) (window as any).lucide.createIcons();
}

function renderGuardianNotifications(data: any) {
  const icon = document.getElementById("guardian-notification-icon");
  const badge = document.getElementById("notification-badge");
  const list = document.getElementById("notification-list");

  const verdicts = data._guardian_verdicts || [];
  const confs = (data.pending_confirmations || []).filter((c: any) =>
    c.command_name.includes("Guardian") || c.details.toLowerCase().includes("suspicious")
  );

  const totalCount = verdicts.length + confs.length;

  if (badge) {
    badge.innerText = totalCount.toString();
    if (totalCount > 0) icon?.classList.add("has-alerts");
    else icon?.classList.remove("has-alerts");
  }

  if (list) {
    if (totalCount === 0) {
      list.innerHTML = `<p class="empty-notif">No new security suggestions.</p>`;
      return;
    }

    list.innerHTML = "";

    // Render Confirmations first
    confs.forEach((c: any) => {
      const div = document.createElement("div");
      div.className = "notif-item confirm";
      div.innerHTML = `
        <div class="notif-item-header">
           <span class="notif-process"><i data-lucide="alert-octagon"></i> ${c.command_name}</span>
        </div>
        <p class="notif-reason">${c.details}</p>
        <div class="confirm-actions" style="margin-top: 8px;">
          <button class="btn-primary btn-xs" onclick="confirmCommand('${c.command_id}', true)">Confirm</button>
          <button class="btn-outline btn-xs" onclick="confirmCommand('${c.command_id}', false)">Cancel</button>
        </div>
      `;
      list.appendChild(div);
    });

    // Render Verdicts
    verdicts.forEach((v: any) => {
      const div = document.createElement("div");
      div.className = "notif-item";
      div.onclick = () => {
        // Switch to Guardian tab
        document.getElementById("nav-guardian")?.click();
        document.getElementById("notification-portal")?.classList.remove("active");
      };
      div.innerHTML = `
        <div class="notif-item-header">
          <span class="notif-process">${v.process}</span>
          <span class="notif-score" style="color: ${v.risk_score > 12 ? 'var(--error)' : 'var(--warning)'}">${v.risk_score.toFixed(1)}</span>
        </div>
        <p class="notif-reason">${v.reason}</p>
      `;
      list.appendChild(div);
    });
  }
  if ((window as any).lucide) (window as any).lucide.createIcons();
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

// Track backend connection state locally to prevent spam
let backendUIActive = false;

// Listen for visibility changes from Rust (Tauri)
listen('ui-active', async (event) => {
  const newState = event.payload as boolean;
  if (newState === backendUIActive) return;

  backendUIActive = newState;
  console.log('UI Active State Changed:', backendUIActive);

  if (backendUIActive) {
    const success = await apiRequest("/ui_connected", { method: "POST" });
    if (success) startPolling();
  } else {
    stopPolling();
    await apiRequest("/ui_disconnected", { method: "POST" });
  }
});

// Initial connection attempt with higher retry for boot up
console.log("Initializing Fluffy Dashboard connection...");
addLog("Connecting to Fluffy Brain...", "system");

function setupUIListeners() {
  // Sidebar Notifications Portal
  const icon = document.getElementById("guardian-notification-icon");
  const portal = document.getElementById("notification-portal");
  const closePortal = document.getElementById("close-portal");

  if (icon && portal) {
    icon.onclick = (e) => {
      e.stopPropagation();
      portal.classList.toggle("active");
    };
  }

  if (closePortal && portal) {
    closePortal.onclick = () => {
      portal.classList.remove("active");
    };
  }

  // Close portal when clicking outside
  document.addEventListener("click", (e) => {
    if (portal && !portal.contains(e.target as Node) && e.target !== icon) {
      portal.classList.remove("active");
    }
  });

  // TTS Test
  const ttsBtn = document.getElementById("btn-test-tts");
  const ttsInput = document.getElementById("tts-test-input") as HTMLInputElement;
  if (ttsBtn && ttsInput) {
    ttsBtn.onclick = async () => {
      const text = ttsInput.value.trim();
      if (!text) {
        showToast("Please enter some text to speak", "error");
        return;
      }

      ttsBtn.setAttribute("disabled", "true");
      try {
        const res = await apiRequest("/tts_test", {
          method: "POST",
          body: JSON.stringify({ text })
        });
        if (res && res.ok) {
          showToast("Speaking...", "success");
        } else {
          showToast("Failed to trigger TTS. Check logs.", "error");
        }
      } finally {
        setTimeout(() => ttsBtn.removeAttribute("disabled"), 1000);
      }
    };
  }
}

// Initialize listeners
setupUIListeners();
if ((window as any).lucide) (window as any).lucide.createIcons();

// Initial connection attempt
if (!backendUIActive) {
  apiRequest("/ui_connected", { method: "POST" }, 20).then((res) => {
    if (res) {
      console.log("Dashboard connected to brain.");
      backendUIActive = true;
      addLog("Connected to Fluffy Brain", "system");
      startPolling();
    } else {
      addLog("Failed to connect to Brain after 20 attempts. Please check if Brain is running.", "error");
    }
  });
}

/* =========================
   DASHBOARD LAYOUT MANAGEMENT
========================= */

function applyDashboardOrder() {
  const grid = document.querySelector(".dashboard-grid");
  if (!grid) return;

  const components: { [key: string]: HTMLElement } = {};
  grid.querySelectorAll("[data-component-id]").forEach(el => {
    const id = el.getAttribute("data-component-id");
    if (id) components[id] = el as HTMLElement;
  });

  dashboardOrder.forEach((id: string) => {
    if (components[id]) {
      grid.appendChild(components[id]);
    }
  });
}

function renderLayoutSettings() {
  const list = document.getElementById("layout-order-list");
  if (!list) return;

  list.innerHTML = "";

  const componentNames: { [key: string]: { name: string, icon: string } } = {
    cpu: { name: "CPU Usage", icon: "zap" },
    ram: { name: "RAM Usage", icon: "database" },
    proc: { name: "Total Processes", icon: "layers" },
    health: { name: "Health Score", icon: "shield" },
    network: { name: "Network Usage", icon: "globe" },
    speedtest: { name: "Internet Speed Test", icon: "gauge" },
    fluffy: { name: "Fluffy Usage", icon: "sparkles" },
    sessions: { name: "Active Sessions", icon: "users" }
  };

  dashboardOrder.forEach((id: string, index: number) => {
    const info = componentNames[id];
    if (!info) return;

    const item = document.createElement("div");
    item.className = "layout-item";
    item.innerHTML = `
      <div class="layout-item-info">
        <span class="layout-item-icon"><i data-lucide="${info.icon}"></i></span>
        <span class="layout-item-name">${info.name}</span>
      </div>
      <div class="layout-item-actions">
        <button class="btn-layout" data-action="up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>
          <i data-lucide="chevron-up"></i>
        </button>
        <button class="btn-layout" data-action="down" data-index="${index}" ${index === dashboardOrder.length - 1 ? 'disabled' : ''}>
          <i data-lucide="chevron-down"></i>
        </button>
      </div>
    `;

    item.querySelectorAll(".btn-layout").forEach(btn => {
      (btn as HTMLButtonElement).onclick = () => {
        const action = btn.getAttribute("data-action");
        const idx = parseInt(btn.getAttribute("data-index") || "0");

        if (action === "up" && idx > 0) {
          [dashboardOrder[idx], dashboardOrder[idx - 1]] = [dashboardOrder[idx - 1], dashboardOrder[idx]];
        } else if (action === "down" && idx < dashboardOrder.length - 1) {
          [dashboardOrder[idx], dashboardOrder[idx + 1]] = [dashboardOrder[idx + 1], dashboardOrder[idx]];
        }

        localStorage.setItem("fluffy_dashboard_order", JSON.stringify(dashboardOrder));
        renderLayoutSettings();
        applyDashboardOrder();
      };
    });

    list.appendChild(item);
  });
  if ((window as any).lucide) (window as any).lucide.createIcons();
}

// Initialize layout on load
applyDashboardOrder();
if (document.getElementById("section-settings")?.classList.contains("active")) {
  renderLayoutSettings();
}

/* =========================
   APPS MANAGEMENT
========================= */
let allApps: any[] = [];
let appsRefreshBound = false;

async function fetchApps(forceRefresh = false) {
  const loader = document.getElementById("apps-loading-indicator");
  const grid = document.getElementById("apps-grid");
  if (loader) loader.classList.remove("hidden");
  if (grid) grid.innerHTML = "";

  if (!appsRefreshBound) {
    document.getElementById("btn-refresh-apps")?.addEventListener("click", () => fetchApps(true));
    appsRefreshBound = true;
  }

  const endpoint = forceRefresh ? "/apps/refresh" : "/apps";
  const method = forceRefresh ? "POST" : "GET";

  addLog(forceRefresh ? "Forcing full system scan for apps..." : "Loading applications from cache...", "action");
  const data = await apiRequest(endpoint, { method });

  if (loader) loader.classList.add("hidden");

  if (data) {
    if (forceRefresh) {
      // After refresh, the data returned is {ok: true, count: X}, not the list.
      // So we need to call /apps to get the updated list.
      const apps = await apiRequest("/apps");
      if (apps && Array.isArray(apps)) {
        allApps = apps;
        renderApps(allApps);
        addLog(`Found ${apps.length} applications after refresh`, "success");
      }
    } else if (Array.isArray(data)) {
      allApps = data;
      renderApps(allApps);
      addLog(`Loaded ${data.length} applications from cache`, "success");
    }
  } else {
    showToast("Failed to fetch installed apps", "error");
  }
}

function renderApps(apps: any[] | null = null, filter: string = "") {
  const grid = document.getElementById("apps-grid");
  if (!grid) return;

  const list = apps || allApps;
  grid.innerHTML = "";

  const filtered = list.filter(app =>
    app.name.toLowerCase().includes(filter) ||
    app.publisher.toLowerCase().includes(filter)
  );

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1; padding: 40px; text-align: center; opacity: 0.5;">
        <i data-lucide="search-x" style="width: 48px; height: 48px; margin-bottom: 10px;"></i>
        <p>No applications found matching "${filter}"</p>
      </div>
    `;
    if ((window as any).lucide) (window as any).lucide.createIcons();
    return;
  }

  filtered.forEach(app => {
    const card = document.createElement("div");
    card.className = "app-card";

    // Icon resolution: use data uri if available, otherwise fallback to lucide icon
    const iconHtml = app.icon_data
      ? `<img src="${app.icon_data}" class="app-icon-img" alt="${app.name}">`
      : `<i data-lucide="package"></i>`;

    // Only show launch button if we have a valid exe_path
    const showLaunch = !!app.exe_path;

    card.innerHTML = `
      <div class="app-card-header">
        <div class="app-icon-wrapper">
          ${iconHtml}
        </div>
        <div class="app-info">
          <div class="app-name" title="${app.name}">${app.name}</div>
          <div class="app-publisher">${app.publisher}</div>
        </div>
      </div>
      <div class="app-meta">
        <div class="meta-item">
          <i data-lucide="info"></i>
          <span>Version: ${app.version}</span>
        </div>
        ${app.install_location ? `
        <div class="meta-item">
          <i data-lucide="folder"></i>
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${app.install_location}">${app.install_location}</span>
        </div>` : ''}
      </div>
      <div class="app-actions">
        ${showLaunch ? `
        <button class="btn-app-action btn-launch" data-app-id="${app.id}">
          <i data-lucide="play"></i> Launch
        </button>` : '<span></span>'}
        <button class="btn-app-action btn-uninstall" data-app-id="${app.id}">
          <i data-lucide="trash-2"></i> Uninstall
        </button>
      </div>
    `;

    const launchBtn = card.querySelector(".btn-launch") as HTMLButtonElement;
    const uninstallBtn = card.querySelector(".btn-uninstall") as HTMLButtonElement;

    if (launchBtn) {
      launchBtn.onclick = async () => {
        launchBtn.disabled = true;
        const res = await apiRequest("/apps/launch", {
          method: "POST",
          body: JSON.stringify({
            exe_path: app.exe_path,
            location: app.install_location,
            name: app.name
          })
        });
        if (res && res.ok) showToast(`Launching ${app.name}...`, "success");
        else showToast(`Failed to launch ${app.name}`, "error");
        launchBtn.disabled = false;
      };
    }

    uninstallBtn.onclick = async () => {
      if (confirm(`Are you sure you want to uninstall ${app.name}?\nThis will open the system uninstaller.`)) {
        const res = await apiRequest("/apps/uninstall", {
          method: "POST",
          body: JSON.stringify({ uninstall_string: app.uninstall_string, name: app.name })
        });
        if (res && res.ok) showToast(`Uninstaller sequence started for ${app.name}`, "info");
      }
    };

    grid.appendChild(card);
  });

  if ((window as any).lucide) (window as any).lucide.createIcons();
}

// ===== STT Testing Handlers =====
let sttPollingInterval: number | null = null;

const btnStartSTT = document.getElementById('btn-start-stt') as HTMLButtonElement;
const btnStopSTT = document.getElementById('btn-stop-stt') as HTMLButtonElement;
const sttStatusText = document.getElementById('stt-status-text');
const sttResultText = document.getElementById('stt-result-text');

async function pollSTTStatus() {
  try {
    const response = await apiRequest('/stt_status');

    if (response && sttResultText) {
      const transcription = response.transcription || '';
      sttResultText.textContent = transcription || 'Listening...';
    }
  } catch (error) {
    console.error('Failed to poll STT status:', error);
  }
}

if (btnStartSTT) {
  btnStartSTT.onclick = async () => {
    try {
      const response = await apiRequest('/test_stt', { method: 'POST' });

      if (response && response.ok) {
        btnStartSTT.disabled = true;
        if (btnStopSTT) btnStopSTT.disabled = false;
        btnStartSTT.setAttribute('data-recording', 'true');
        if (sttStatusText) sttStatusText.textContent = 'Listening...';
        if (sttResultText) sttResultText.textContent = '';

        // Start polling for transcription results
        sttPollingInterval = window.setInterval(pollSTTStatus, 500);

        showToast('STT listening started', 'success');
      } else {
        showToast(response?.error || 'Failed to start STT', 'error');
      }
    } catch (error) {
      console.error('Failed to start STT:', error);
      showToast('Failed to start STT', 'error');
    }
  };
}

if (btnStopSTT) {
  btnStopSTT.onclick = async () => {
    try {
      await apiRequest('/stop_stt', { method: 'POST' });

      if (btnStartSTT) {
        btnStartSTT.disabled = false;
        btnStartSTT.removeAttribute('data-recording');
      }
      btnStopSTT.disabled = true;
      if (sttStatusText) sttStatusText.textContent = 'Stopped';

      if (sttPollingInterval) {
        clearInterval(sttPollingInterval);
        sttPollingInterval = null;
      }

      showToast('STT listening stopped', 'info');
    } catch (error) {
      console.error('Failed to stop STT:', error);
      showToast('Failed to stop STT', 'error');
    }
  };
}

// TTS Testing Handler
const btnTestTTS = document.getElementById('btn-test-tts');
const ttsTestInput = document.getElementById('tts-test-input') as HTMLInputElement;

if (btnTestTTS && ttsTestInput) {
  btnTestTTS.onclick = async () => {
    const text = ttsTestInput.value.trim();
    if (!text) {
      showToast('Please enter text to speak', 'info');
      return;
    }

    try {
      const response = await apiRequest('/tts_test', {
        method: 'POST',
        body: JSON.stringify({ text })
      });

      if (response && response.ok) {
        showToast('TTS test started', 'success');
      } else {
        showToast(response?.error || 'TTS test failed', 'error');
      }
    } catch (error) {
      console.error('TTS test error:', error);
      showToast('TTS test failed', 'error');
    }
  };
}

/* =========================
   CHAT INTERFACE
========================= */

interface ChatMessage {
  id: number;
  text: string;
  type: 'user' | 'fluffy' | 'system';
  timestamp: Date;
  status?: 'success' | 'error' | 'warning';
  inputMode?: 'text' | 'voice';
}

const chatState = {
  messages: [] as ChatMessage[],
  isListening: false,
  inputMode: 'text' as 'text' | 'voice',
  sttPollInterval: null as any,
  currentSessionId: null as string | null
};

function addChatMessage(text: string, type: 'user' | 'fluffy' | 'system', metadata: Partial<ChatMessage> = {}) {
  const message: ChatMessage = {
    id: Date.now(),
    text,
    type,
    timestamp: new Date(),
    ...metadata
  };

  chatState.messages.push(message);
  renderChatMessage(message);
  scrollChatToBottom();

  // Auto-save to backend if we have a session
  if (chatState.currentSessionId && type !== 'system') {
    saveChatMessageToBackend(message);
  }
}

function renderChatMessage(message: ChatMessage) {
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) return;

  const messageEl = document.createElement('div');
  messageEl.className = `message ${message.type}`;
  messageEl.setAttribute('data-message-id', message.id.toString());

  if (message.type === 'system') {
    messageEl.innerHTML = `
      <div class="system-message">
        <i data-lucide="info"></i>
        <span>${message.text}</span>
      </div>
    `;
  } else {
    const icon = message.type === 'user' ? '👤' : '🤖';
    const statusIcon = message.status === 'success' ? '✓' :
      message.status === 'error' ? '✗' :
        message.status === 'warning' ? '⚠' : '';

    // Add TTS button for fluffy messages
    const ttsButton = message.type === 'fluffy'
      ? `<button class="tts-btn" data-text="${message.text.replace(/"/g, '&quot;')}" title="Speak"><i data-lucide="volume-2"></i></button>`
      : '';

    messageEl.innerHTML = `
      <div class="message-avatar">${icon}</div>
      <div class="message-bubble">
        <div class="message-text">${message.text}</div>
        <div class="message-meta">
          <span class="message-time">${formatChatTime(message.timestamp)}</span>
          ${statusIcon ? `<span class="message-status">${statusIcon}</span>` : ''}
          ${ttsButton}
        </div>
      </div>
    `;
  }

  messagesContainer.appendChild(messageEl);

  // Re-initialize Lucide icons for new elements
  if (typeof (window as any).lucide !== 'undefined') {
    (window as any).lucide.createIcons();
  }

  // Add click handlers for TTS buttons
  const ttsButtons = messageEl.querySelectorAll('.tts-btn');
  ttsButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const text = (e.currentTarget as HTMLElement).getAttribute('data-text');
      if (text) playTTS(text);
    });
  });
}

async function playTTS(text: string) {
  try {
    const response = await apiRequest('/tts/speak', {
      method: 'POST',
      body: JSON.stringify({ text })
    });

    if (!response || !response.ok) {
      console.error('Failed to play TTS');
      showToast('Failed to play audio', 'error');
    }
  } catch (error) {
    console.error('TTS error:', error);
  }

}

async function stopTTS() {
  console.log('Attempting to stop TTS...');
  try {
    await apiRequest('/tts/stop', { method: 'POST' });
  } catch (err) {
    console.error('Failed to stop TTS:', err);
  }
}

function formatChatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function scrollChatToBottom() {
  const messagesContainer = document.getElementById('chat-messages');
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

function removeLastSystemMessage() {
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) return;

  const systemMessages = messagesContainer.querySelectorAll('.message.system');
  if (systemMessages.length > 0) {
    const lastSystem = systemMessages[systemMessages.length - 1];
    lastSystem.remove();
    chatState.messages = chatState.messages.filter(m =>
      m.id !== parseInt(lastSystem.getAttribute('data-message-id') || '0')
    );
  }
}

function updateChatStatus(text: string, state: 'ready' | 'listening' | 'processing') {
  const indicator = document.getElementById('chat-status-indicator');
  const statusText = document.getElementById('chat-status-text');

  if (indicator && statusText) {
    indicator.className = `status-dot ${state}`;
    statusText.textContent = text;
  }
}

async function sendTextCommand() {
  const input = document.getElementById('chat-input') as HTMLInputElement;
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  // Interrupt any ongoing speech when user sends a new command
  stopTTS();

  // Add user message
  addChatMessage(text, 'user', { inputMode: 'text' });
  input.value = '';

  // Show processing
  addChatMessage('Processing...', 'system');
  updateChatStatus('Processing...', 'processing');

  // Send to chat endpoint (supports both commands and LLM)
  try {
    const response = await apiRequest('/chat/message', {
      method: 'POST',
      body: JSON.stringify({
        message: text,
        session_id: chatState.currentSessionId,
        use_voice: chatState.inputMode === 'voice'  // Only use voice if input mode is voice
      })
    });

    // Remove "Processing..." message
    removeLastSystemMessage();
    updateChatStatus('Ready', 'ready');

    console.log('Chat response:', response);

    if (response && response.ok) {
      // Response can be either command or LLM
      const messageText = response.message || 'Done';
      const isCommand = response.type === 'command';

      // Determine status based on response
      let status: 'success' | 'error' | 'warning' = 'success';
      if (isCommand && response.result) {
        status = response.result.success ? 'success' : 'error';
      }

      addChatMessage(messageText, 'fluffy', { status });
    } else {
      const errorMsg = response?.error || 'Failed to process message';
      console.error('Chat error:', errorMsg, response);
      addChatMessage(errorMsg, 'fluffy', { status: 'error' });
    }
  } catch (error: any) {
    removeLastSystemMessage();
    updateChatStatus('Ready', 'ready');
    console.error('Chat exception:', error);
    addChatMessage(`Error: ${error.message}`, 'fluffy', { status: 'error' });
  }
}


async function startVoiceInput() {
  if (chatState.isListening) return;

  chatState.isListening = true;
  chatState.inputMode = 'voice'; // Ensure input mode is voice
  updateChatStatus('Listening...', 'listening');
  addChatMessage('Listening for voice input...', 'system');

  try {
    // Start STT
    const response = await apiRequest('/test_stt', { method: 'POST' });

    if (!response || !response.ok) {
      throw new Error('Failed to start STT');
    }

    // Poll for transcription
    let pollCount = 0;
    const maxPolls = 20; // 10 seconds max

    chatState.sttPollInterval = setInterval(async () => {
      pollCount++;

      if (pollCount > maxPolls) {
        stopVoiceInput('Voice input timeout');
        return;
      }

      const statusResponse = await apiRequest('/stt_status', { method: 'GET' });

      if (statusResponse && statusResponse.transcription && statusResponse.transcription.trim()) {
        const transcription = statusResponse.transcription.trim();

        // Stop STT
        await apiRequest('/stop_stt', { method: 'POST' });

        // Clear interval
        if (chatState.sttPollInterval) {
          clearInterval(chatState.sttPollInterval);
          chatState.sttPollInterval = null;
        }

        // Remove "Listening..." message
        removeLastSystemMessage();

        // Use transcription as command
        const input = document.getElementById('chat-input') as HTMLInputElement;
        if (input) {
          input.value = transcription;
        }

        chatState.isListening = false;
        updateChatStatus('Ready', 'ready');

        // Auto-send
        await sendTextCommand();
      }
    }, 500);

  } catch (error: any) {
    stopVoiceInput(`Voice input error: ${error.message} `);
  }
}

function stopVoiceInput(message?: string) {
  if (chatState.sttPollInterval) {
    clearInterval(chatState.sttPollInterval);
    chatState.sttPollInterval = null;
  }

  chatState.isListening = false;
  updateChatStatus('Ready', 'ready');
  removeLastSystemMessage();

  if (message) {
    addChatMessage(message, 'system');
  }
}

// Chat event listeners
const sendBtn = document.getElementById('send-btn');
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const voiceModeBtn = document.getElementById('voice-mode-btn');
const textModeBtn = document.getElementById('text-mode-btn');

if (sendBtn) {
  sendBtn.onclick = sendTextCommand;
}

if (chatInput) {
  // Stop TTS when user starts typing
  chatInput.addEventListener('input', () => {
    if (chatInput.value.length > 0) {
      apiRequest('/stop_tts', { method: 'POST' }).catch(() => { });
    }
  });

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendTextCommand();
    }
  });
}

if (voiceModeBtn) {
  voiceModeBtn.onclick = () => {
    if (!chatState.isListening) {
      startVoiceInput();
    }
  };
}

if (textModeBtn) {
  textModeBtn.onclick = () => {
    chatState.inputMode = 'text';
    textModeBtn.classList.add('active');
    voiceModeBtn?.classList.remove('active');
  };
}

// Add chat to navigation
const navChat = document.getElementById('nav-chat');
if (navChat) {
  navChat.onclick = (e) => {
    e.preventDefault();
    switchView('chat');
  };
}

// ============================================================================
// CHAT HISTORY FUNCTIONS
// ============================================================================

async function saveChatMessageToBackend(message: ChatMessage) {
  try {
    if (!chatState.currentSessionId) return;

    await apiRequest('/chat/save_message', {
      method: 'POST',

      body: JSON.stringify({
        session_id: chatState.currentSessionId,
        message: {
          type: message.type,
          text: message.text,
          timestamp: message.timestamp.toISOString(),
          status: message.status,
          inputMode: message.inputMode
        }
      })
    });
  } catch (error) {
    console.error('Failed to save message:', error);
  }
}

async function initializeChatSession() {
  try {
    // Try to get current session
    const currentResponse = await apiRequest('/chat/current_session', {
      method: 'GET'
    });

    if (currentResponse && currentResponse.ok && currentResponse.session_id) {
      // Load existing session
      chatState.currentSessionId = currentResponse.session_id;
      await loadChatSession(currentResponse.session_id);
    } else {
      // Create new session
      const createResponse = await apiRequest('/chat/create_session', {
        method: 'POST'
      });

      if (createResponse && createResponse.ok) {
        chatState.currentSessionId = createResponse.session_id;
        console.log('Created new chat session:', createResponse.session_id);

        // Add welcome message for new session
        addChatMessage("Welcome back Boss! Fluffy is standing by. How can I help you today?", 'fluffy');
      }
    }
  } catch (error) {
    console.error('Failed to initialize chat session:', error);
  }
}

async function loadChatSession(sessionId: string) {
  try {
    const response = await apiRequest(`/chat/session/${sessionId}`, {
      method: 'GET'
    });

    if (response && response.ok && response.session) {
      // Clear current messages
      chatState.messages = [];
      const messagesContainer = document.getElementById('chat-messages');
      if (messagesContainer) {
        messagesContainer.innerHTML = '';
      }

      // Load messages from session
      for (const msg of response.session.messages) {
        const message: ChatMessage = {
          id: Date.now() + Math.random(),
          text: msg.text,
          type: msg.type,
          timestamp: new Date(msg.timestamp),
          status: msg.status,
          inputMode: msg.inputMode
        };

        chatState.messages.push(message);
        renderChatMessage(message);
      }

      scrollChatToBottom();
      console.log(`Loaded ${response.session.messages.length} messages from session`);
    }
  } catch (error) {
    console.error('Failed to load chat session:', error);
  }
}

// Initialize chat session on load
initializeChatSession();

// ============================================================================
// HISTORY SIDEBAR FUNCTIONS
// ============================================================================

function toggleHistorySidebar() {
  const sidebar = document.getElementById('chat-history-sidebar');
  if (sidebar) {
    sidebar.classList.toggle('hidden');
  }
}

async function loadSessionsList() {
  try {
    const response = await apiRequest('/chat/sessions', {
      method: 'GET'
    });

    if (response && response.ok && response.sessions) {
      renderSessionsList(response.sessions);
    }
  } catch (error) {
    console.error('Failed to load sessions list:', error);
  }
}

function renderSessionsList(sessions: any[]) {
  const sessionsList = document.getElementById('sessions-list');
  if (!sessionsList) return;

  if (sessions.length === 0) {
    sessionsList.innerHTML = '<p class="empty-state">No chat history yet</p>';
    return;
  }

  sessionsList.innerHTML = '';

  for (const session of sessions) {
    const sessionEl = document.createElement('div');
    sessionEl.className = 'session-item';
    if (session.id === chatState.currentSessionId) {
      sessionEl.classList.add('active');
    }

    sessionEl.innerHTML = `
      <div class="session-preview">${session.preview}</div>
      <div class="session-meta">
        <span class="session-time">${formatSessionTime(session.last_updated)}</span>
        <button class="session-delete" data-session-id="${session.id}">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    // Click to load session
    sessionEl.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.session-delete')) {
        switchToSession(session.id);
      }
    });

    // Delete button
    const deleteBtn = sessionEl.querySelector('.session-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSessionWithConfirmation(session.id);
      });
    }

    sessionsList.appendChild(sessionEl);
  }

  // Re-initialize Lucide icons
  if (typeof (window as any).lucide !== 'undefined') {
    (window as any).lucide.createIcons();
  }
}

function formatSessionTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

async function switchToSession(sessionId: string) {
  if (sessionId === chatState.currentSessionId) return;

  chatState.currentSessionId = sessionId;
  await loadChatSession(sessionId);

  // Update active state manually without re-rendering the entire list
  const sessionItems = document.querySelectorAll('.session-item');
  sessionItems.forEach(item => {
    item.classList.remove('active');
  });

  // Find and activate the current session
  sessionItems.forEach(item => {
    const deleteBtn = item.querySelector('.session-delete') as HTMLElement;
    if (deleteBtn && deleteBtn.dataset.sessionId === sessionId) {
      item.classList.add('active');
    }
  });
}

async function deleteSessionWithConfirmation(sessionId: string) {
  // if (!confirm('Are you sure you want to delete this conversation?')) {
  //   return;
  // }

  try {
    const response = await apiRequest(`/chat/session/${sessionId}`, {
      method: 'DELETE'
    });

    if (response && response.ok) {
      // If deleted session was current, create new one
      if (sessionId === chatState.currentSessionId) {
        await createNewChatSession();
      }

      // Refresh sessions list
      loadSessionsList();
    }
  } catch (error) {
    console.error('Failed to delete session:', error);
  }
}

async function createNewChatSession() {
  try {
    const response = await apiRequest('/chat/create_session', {
      method: 'POST'
    });

    if (response && response.ok) {
      chatState.currentSessionId = response.session_id;

      // Clear current messages
      chatState.messages = [];
      const messagesContainer = document.getElementById('chat-messages');
      if (messagesContainer) {
        messagesContainer.innerHTML = '';
      }

      // Refresh sessions list
      loadSessionsList();

      console.log('Created new chat session:', response.session_id);

      // Add welcome message
      addChatMessage("Welcome back Boss! Fluffy is standing by. How can I help you today?", 'fluffy');
    }
  } catch (error) {
    console.error('Failed to create new session:', error);
  }
}

// Initialize sidebar event listeners
const toggleHistoryBtn = document.getElementById('toggle-history-btn');
if (toggleHistoryBtn) {
  toggleHistoryBtn.onclick = toggleHistorySidebar;
}

const closeHistoryBtn = document.getElementById('close-history-btn');
if (closeHistoryBtn) {
  closeHistoryBtn.onclick = toggleHistorySidebar;
}

const newChatBtn = document.getElementById('new-chat-btn');
if (newChatBtn) {
  newChatBtn.onclick = createNewChatSession;
}

// Load sessions list on init
loadSessionsList();


console.log('✅ Chat interface initialized');

// Initial Welcome Message

// Initial Welcome Message Logic (Moved to createNewChatSession/initializeChatSession if needed, 
// or kept here for app start if no history)
window.addEventListener('DOMContentLoaded', () => {
  // We check in initializeChatSession
});

// Stop TTS when window loses focus or is closed
window.addEventListener('blur', () => {
  stopTTS();
});

window.addEventListener('beforeunload', () => {
  stopTTS();
});
