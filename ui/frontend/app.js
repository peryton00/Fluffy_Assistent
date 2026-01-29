async function fetchStatus() {
  try {
    const res = await fetch("/status");
    const data = await res.json();
    // Check if data is valid and not initializing
    if (data && data.system) {
      render(data);
    }
  } catch (err) {
    console.warn("Status fetch failed:", err);
  }
}

async function killProcess(pid) {
  const ok = confirm(
    `⚠ Are you sure?\n\nThis will TERMINATE the process and ALL its children.\nUnsaved work may be lost.`,
  );

  if (!ok) {
    addLog(`Kill cancelled for PID ${pid}`, "info");
    return;
  }

  addLog(`Kill requested for PID ${pid}`, "action");

  await fetch("/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ KillProcess: { pid } }),
  });
}

function renderNode(node, container, depth = 0) {
  const row = document.createElement("div");
  row.style.marginLeft = `${depth * 16}px`;

  const label = document.createElement("span");
  label.innerText = `${node.name} (PID ${node.pid}) — ${node.ram_mb} MB`;

  const btn = document.createElement("button");
  btn.innerText = "Kill tree";
  btn.style.marginLeft = "8px";
  btn.onclick = () => killProcess(node.pid);

  row.appendChild(label);
  row.appendChild(btn);
  container.appendChild(row);

  node.children.forEach((c) => renderNode(c, container, depth + 1));
}

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
        li.innerText = log.message;

        if (log.level === "error") li.style.color = "red";
        if (log.level === "action") li.style.color = "orange";
        if (log.level === "system") li.style.color = "gray";

        ul.appendChild(li);
      });
  } catch { }
}

function renderNode(node, container, depth = 0) {
  const row = document.createElement("div");
  row.style.marginLeft = `${depth * 16}px`;

  const label = document.createElement("span");
  label.innerText = `${node.name} (PID ${node.pid}) — ${node.ram_mb} MB`;

  const btn = document.createElement("button");
  btn.innerText = "Kill tree";
  btn.style.marginLeft = "8px";
  btn.onclick = () => killProcess(node.pid);

  row.appendChild(label);
  row.appendChild(btn);
  container.appendChild(row);

  node.children.forEach((c) => renderNode(c, container, depth + 1));
}

function render(data) {
  if (!data.system) return;

  const sys = data.system;

  document.getElementById("system").innerText =
    `RAM: ${sys.ram.used_mb} / ${sys.ram.total_mb} MB
CPU: ${sys.cpu.usage_percent.toFixed(1)}%`;

  document.getElementById("processes").innerText = sys.processes.top_ram
    .slice(0, 10)
    .map((p) => `${p.name} (PID ${p.pid}) — ${p.ram_mb} MB`)
    .join("\n");

  const insights = document.getElementById("insights");
  insights.innerHTML = "";

  (data._insights || []).forEach((text) => {
    const li = document.createElement("li");
    li.innerText = text;
    insights.appendChild(li);
  });
}

setInterval(fetchStatus, 1500);
setInterval(fetchLogs, 1500);
