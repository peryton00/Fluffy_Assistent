// Tracks which parent PIDs are expanded
const expanded = new Set();

/* =========================
   FETCH SYSTEM STATE
========================= */
async function fetchStatus() {
  try {
    const res = await fetch("/status");
    const data = await res.json();

    if (data && data.system) {
      render(data);
    }
  } catch (err) {
    console.warn("Status fetch failed:", err);
  }
}
async function confirmCommand(commandId, approve = true) {
  await fetch("/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: approve
      ? JSON.stringify({ Confirm: { command_id: commandId } })
      : JSON.stringify({ Cancel: { command_id: commandId } }),
  });

  addLog(
    approve
      ? `Command confirmed (${commandId})`
      : `Command cancelled (${commandId})`,
    "action",
  );
}

/* =========================
   LOGGING (UI SIDE)
========================= */
function addLog(message, level = "info") {
  const ul = document.getElementById("logs");
  if (!ul) return;

  const li = document.createElement("li");
  li.textContent = message;
  li.className = `log-${level}`;
  ul.prepend(li);
}

/* =========================
   PROCESS TREE BUILDING
========================= */
function buildProcessTree(processes) {
  const map = {};
  const roots = [];

  processes.forEach((p) => {
    map[p.pid] = { ...p, children: [] };
  });

  processes.forEach((p) => {
    if (p.parent_pid && map[p.parent_pid]) {
      map[p.parent_pid].children.push(map[p.pid]);
    } else {
      roots.push(map[p.pid]);
    }
  });

  return roots;
}

function sortTreeByMemory(nodes) {
  nodes.sort((a, b) => b.ram_mb - a.ram_mb);
  nodes.forEach((n) => sortTreeByMemory(n.children));
}

/* =========================
   PROCESS KILL
========================= */
async function killProcess(pid, mode = "tree") {
  const msg =
    mode === "tree"
      ? "This will TERMINATE the process and ALL its children."
      : "This will TERMINATE ONLY this process.";

  const ok = confirm(`⚠ Are you sure?\n\n${msg}\nUnsaved work may be lost.`);

  if (!ok) {
    addLog(`Kill cancelled for PID ${pid}`, "info");
    return;
  }

  addLog(`Kill ${mode} requested for PID ${pid}`, "action");

  await fetch("/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ KillProcess: { pid } }),
  });
}

/* =========================
   HIERARCHICAL RENDERING
========================= */
function renderNode(node, container, depth = 0) {
  const row = document.createElement("div");
  row.className = `process-row depth-${depth}`;

  // ----- LEFT SIDE (label + expand) -----
  const left = document.createElement("div");

  if (node.children.length > 0) {
    const toggle = document.createElement("button");
    toggle.textContent = expanded.has(node.pid) ? "▼" : "▶";
    toggle.onclick = () => {
      if (expanded.has(node.pid)) {
        expanded.delete(node.pid);
      } else {
        expanded.add(node.pid);
      }
      fetchStatus(); // re-render
    };
    left.appendChild(toggle);
  }

  const label = document.createElement("span");
  label.textContent = `${node.name} (PID ${node.pid}) — ${node.ram_mb} MB`;

  left.appendChild(label);

  // ----- RIGHT SIDE (actions) -----
  const right = document.createElement("div");

  const btn = document.createElement("button");
  btn.textContent = node.children.length > 0 ? "Kill tree" : "Kill process";

  btn.onclick = () =>
    killProcess(node.pid, node.children.length > 0 ? "tree" : "single");

  right.appendChild(btn);

  row.appendChild(left);
  row.appendChild(right);
  container.appendChild(row);

  // ----- CHILDREN -----
  if (expanded.has(node.pid)) {
    node.children.forEach((child) => renderNode(child, container, depth + 1));
  }
}

/* =========================
   MAIN RENDER
========================= */
function render(data) {
  const sys = data.system;

  // ---- SYSTEM SUMMARY ----
  document.getElementById("system").innerText =
    `RAM: ${sys.ram.used_mb} / ${sys.ram.total_mb} MB
CPU: ${sys.cpu.usage_percent.toFixed(1)}%`;

  // ---- PROCESS TREE ----
  const container = document.getElementById("processes");
  container.innerHTML = "";

  const tree = buildProcessTree(sys.processes.top_ram);
  sortTreeByMemory(tree);
  tree.forEach((node) => renderNode(node, container));

  // ---- INSIGHTS ----
  const insights = document.getElementById("insights");
  insights.innerHTML = "";

  (data._insights || []).forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    insights.appendChild(li);
  });
  const warn = document.getElementById("admin-warning");

  if (data.confirm_required) {
    warn.style.display = "block";
    warn.innerHTML = `
    ⚠ Confirmation required
    <button onclick="confirmCommand('${data.command_id}', true)">Confirm</button>
    <button onclick="confirmCommand('${data.command_id}', false)">Cancel</button>
  `;
  } else {
    warn.style.display = "none";
  }
}

/* =========================
   EXECUTION LOGS
========================= */
async function fetchLogs() {
  try {
    const res = await fetch("/logs");
    const logs = await res.json();

    const ul = document.getElementById("logs");
    ul.innerHTML = "";

    logs
      .slice()
      .reverse()
      .forEach((log) => {
        const li = document.createElement("li");
        li.textContent = log.message;
        li.className = `log-${log.level}`;
        const expanded = new Set();

        function addLog(msg, level = "info") {
          const ul = document.getElementById("logs");
          if (!ul) return;
          const li = document.createElement("li");
          li.textContent = msg;
          li.className = `log-${level}`;
          ul.prepend(li);
        }

        async function fetchStatus() {
          const res = await fetch("/status");
          const data = await res.json();
          if (data.system) render(data);
        }

        function buildTree(list) {
          const map = {};
          list.forEach((p) => (map[p.pid] = { ...p, children: [] }));

          const roots = [];
          list.forEach((p) => {
            if (p.parent_pid && map[p.parent_pid]) {
              map[p.parent_pid].children.push(map[p.pid]);
            } else {
              roots.push(map[p.pid]);
            }
          });

          return roots;
        }

        function renderNode(node, container, depth = 0) {
          const row = document.createElement("div");
          row.style.marginLeft = `${depth * 16}px`;

          if (node.children.length > 0) {
            const toggle = document.createElement("button");
            toggle.textContent = expanded.has(node.pid) ? "▼" : "▶";
            toggle.onclick = () => {
              expanded.has(node.pid)
                ? expanded.delete(node.pid)
                : expanded.add(node.pid);
              fetchStatus();
            };
            row.appendChild(toggle);
          }

          row.appendChild(
            document.createTextNode(
              `${node.name} (PID ${node.pid}) — ${node.ram_mb} MB`,
            ),
          );

          const btn = document.createElement("button");
          btn.textContent = node.children.length ? "Kill tree" : "Kill";
          btn.onclick = () =>
            fetch("/command", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ KillProcess: { pid: node.pid } }),
            });

          row.appendChild(btn);
          container.appendChild(row);

          if (expanded.has(node.pid)) {
            node.children.forEach((c) => renderNode(c, container, depth + 1));
          }
        }

        function render(data) {
          document.getElementById("system").innerText =
            `RAM: ${data.system.ram.used_mb}/${data.system.ram.total_mb} MB
CPU: ${data.system.cpu.usage_percent.toFixed(1)}%`;

          const container = document.getElementById("processes");
          container.innerHTML = "";

          const tree = buildTree(data.system.processes.all);
          tree.sort((a, b) => b.ram_mb - a.ram_mb);
          tree.forEach((n) => renderNode(n, container));

          const insights = document.getElementById("insights");
          insights.innerHTML = "";
          (data._insights || []).forEach((t) => {
            const li = document.createElement("li");
            li.textContent = t;
            insights.appendChild(li);
          });
        }

        setInterval(fetchStatus, 1500);
        ul.appendChild(li);
      });
  } catch {}
}

/* =========================
   POLLING
========================= */
setInterval(fetchStatus, 1500);
setInterval(fetchLogs, 1500);
