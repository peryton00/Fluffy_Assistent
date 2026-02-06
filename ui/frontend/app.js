const FLUFFY_TOKEN = "fluffy_dev_token";
const expanded = new Set();

/* =========================
   UTILITIES
========================= */
async function apiRequest(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Fluffy-Token": FLUFFY_TOKEN,
    ...(options.headers || {})
  };
  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Request failed");
    }
    return await res.json();
  } catch (err) {
    console.error(`API Error (${url}):`, err);
    addLog(err.message, "error");
    return null;
  }
}

function addLog(message, level = "info") {
  const ul = document.getElementById("logs");
  if (!ul) return;
  const li = document.createElement("li");
  li.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  li.className = `log-${level}`;
  ul.prepend(li); // Show newest at top
  // Limit log size
  while (ul.children.length > 50) ul.removeChild(ul.lastChild);
}

/* =========================
   COMMANDS
========================= */
async function confirmCommand(commandId, approve = true) {
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
  await fetchData(); // Refresh UI immediately
}

async function killProcess(pid, mode = "tree") {
  const msg = mode === "tree"
    ? "Terminate this process and ALL its children?"
    : "Terminate ONLY this process?";

  if (!confirm(`⚠ ${msg}\nUnsaved work may be lost.`)) return;

  addLog(`Requesting kill (${mode}) for PID ${pid}`, "action");
  const data = await apiRequest("/command", {
    method: "POST",
    body: JSON.stringify({ KillProcess: { pid } })
  });
}

/* =========================
   RENDERING
========================= */
function buildTree(processes) {
  const map = {};
  const roots = [];
  processes.forEach(p => map[p.pid] = { ...p, children: [] });
  processes.forEach(p => {
    if (p.parent_pid && map[p.parent_pid]) {
      map[p.parent_pid].children.push(map[p.pid]);
    } else {
      roots.push(map[p.pid]);
    }
  });
  return roots;
}

function sortTree(nodes) {
  nodes.sort((a, b) => b.ram_mb - a.ram_mb);
  nodes.forEach(n => sortTree(n.children));
}

function renderNode(node, container, depth = 0) {
  const row = document.createElement("div");
  row.className = `process-row depth-${Math.min(depth, 4)}`;

  const left = document.createElement("div");
  if (node.children.length > 0) {
    const toggle = document.createElement("button");
    toggle.className = "toggle-btn";
    toggle.textContent = expanded.has(node.pid) ? "▼" : "▶";
    toggle.onclick = (e) => {
      e.stopPropagation();
      expanded.has(node.pid) ? expanded.delete(node.pid) : expanded.add(node.pid);
      renderTree(lastData); // Re-render tree without full fetch
    };
    left.appendChild(toggle);
  }

  const label = document.createElement("span");
  label.textContent = `${node.name} (PID ${node.pid}) — ${node.ram_mb} MB`;
  left.appendChild(label);

  const right = document.createElement("div");
  const killBtn = document.createElement("button");
  const isTree = node.children.length > 0;
  killBtn.textContent = isTree ? "Kill tree" : "Kill";
  killBtn.onclick = () => killProcess(node.pid, isTree ? "tree" : "single");
  right.appendChild(killBtn);

  row.appendChild(left);
  row.appendChild(right);
  container.appendChild(row);

  if (expanded.has(node.pid)) {
    node.children.forEach(child => renderNode(child, container, depth + 1));
  }
}

let lastData = null;
function renderTree(data) {
  if (!data || !data.system) return;
  lastData = data;
  const container = document.getElementById("processes");
  container.innerHTML = "";

  const tree = buildTree(data.system.processes.top_ram);
  sortTree(tree);
  tree.forEach(node => renderNode(node, container));
}

function renderUI(data) {
  if (!data) return;

  // Stats
  if (data.system) {
    const sys = data.system;
    document.getElementById("system").innerText =
      `RAM: ${sys.ram.used_mb} / ${sys.ram.total_mb} MB | CPU: ${sys.cpu.usage_percent.toFixed(1)}%`;
    renderTree(data);
  }

  // Insights
  const insights = document.getElementById("insights");
  insights.innerHTML = "";
  (data._insights || []).forEach(text => {
    const li = document.createElement("li");
    li.textContent = text;
    insights.appendChild(li);
  });

  // Confirmations
  const warn = document.getElementById("admin-warning");
  const confs = data.pending_confirmations || [];
  if (confs.length > 0) {
    warn.style.display = "block";
    warn.innerHTML = "<h4>⚠ Action Required</h4>";
    confs.forEach(c => {
      const div = document.createElement("div");
      div.className = "confirm-item";
      div.innerHTML = `
                <p><strong>${c.command_name}</strong>: ${c.details}</p>
                <button onclick="confirmCommand('${c.command_id}', true)">Confirm</button>
                <button onclick="confirmCommand('${c.command_id}', false)" style="background:#555">Cancel</button>
            `;
      warn.appendChild(div);
    });
  } else {
    warn.style.display = "none";
  }
}

/* =========================
   POLLING & INIT
========================= */
async function fetchData() {
  const data = await apiRequest("/status");
  if (data) renderUI(data);
}

async function fetchLogs() {
  const logs = await apiRequest("/logs");
  if (logs) {
    const ul = document.getElementById("logs");
    ul.innerHTML = "";
    logs.slice().reverse().forEach(log => {
      const li = document.createElement("li");
      li.textContent = `[${log.level.toUpperCase()}] ${log.message}`;
      li.className = `log-${log.level}`;
      ul.appendChild(li);
    });
  }
}

setInterval(fetchData, 2000);
setInterval(fetchLogs, 5000);
fetchData();
fetchLogs();
