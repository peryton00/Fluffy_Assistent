/**
 * Fluffy Desktop - Create Extension Modal
 * 
 * Interactive studio for users to create custom extensions with live code editor,
 * trigger matching configuration, starter templates, and architectural design guide.
 */

import React, { useState, useEffect } from "react";
import { extensionsStore } from "../../../stores/extensionsStore";
import { useUiStore } from "../../../stores/uiStore";
import {
  CodeIcon,
  PlusIcon,
  CheckIcon,
  AlertTriangleIcon,
  BookOpenIcon,
  SparklesIcon,
} from "../../../components/common/Icons";
import { JellyfishCodeEditor } from "./JellyfishCodeEditor";

interface CreateExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (intent: string) => void;
}

const TEMPLATES: Record<
  string,
  { name: string; language: "python" | "javascript"; code: string; triggers: string; patterns: string; desc: string }
> = {
  basic_python: {
    name: "Basic Python Handler",
    language: "python",
    desc: "Standard Python extension with parameter extraction and response formatting.",
    triggers: "custom tool, my action",
    patterns: "run custom tool, execute my action, perform custom task",
    code: `"""
Custom Extension Handler for Fluffy
"""

from typing import Dict, Any

class CustomActionHandler:
    """Handle custom operations for Fluffy"""

    def execute(self, command) -> Dict[str, Any]:
        """
        Main execution entrypoint called by Fluffy.
        
        Args:
            command: Object containing:
              - command.intent: The intent string (e.g. 'custom_action')
              - command.parameters: Dict of parameters extracted by Fluffy (e.g. {'query': '...'})
              
        Returns:
            Dict containing:
              - success: bool (True if executed successfully)
              - message: str (Markdown response displayed and spoken by Fluffy)
              - data: dict (Optional structured telemetry or data)
        """
        params = getattr(command, "parameters", {}) or {}
        query = params.get("query", "default_action")
        
        # Add your custom logic here
        return {
            "success": True,
            "message": f"✨ **Custom Action Executed!**\\n\\nParameter received: \`{query}\`",
            "data": {
                "status": "completed",
                "params": params
            }
        }

def get_handler():
    """Factory function required by Fluffy to instantiate the handler."""
    return CustomActionHandler()
`,
  },
  system_inspection: {
    name: "System / Hardware Inspector",
    language: "python",
    desc: "Inspects local OS, disk storage, memory, or runs safe system diagnostics.",
    triggers: "disk space, drive storage, system check",
    patterns: "check disk space, how much storage is left, disk status, system storage",
    code: `"""
System Inspection Extension for Fluffy
Inspects system disk storage and resource metrics.
"""

import shutil
import platform
from typing import Dict, Any

class SystemCheckHandler:
    """Check storage and system health"""

    def execute(self, command) -> Dict[str, Any]:
        # Inspect main drive disk usage
        total, used, free = shutil.disk_usage("/")
        gb = 1024 ** 3
        
        free_gb = round(free / gb, 2)
        total_gb = round(total / gb, 2)
        used_gb = round(used / gb, 2)
        used_pct = round((used / total) * 100, 1)

        os_name = platform.system()
        node = platform.node()

        msg = (
            f"### 💽 Disk & System Storage Report\\n"
            f"- **Host**: \`{node}\` ({os_name})\\n"
            f"- **Free Storage**: **{free_gb} GB** / {total_gb} GB\\n"
            f"- **Used Storage**: {used_gb} GB ({used_pct}%)\\n"
        )

        return {
            "success": True,
            "message": msg,
            "data": {
                "free_gb": free_gb,
                "total_gb": total_gb,
                "used_percent": used_pct,
                "os": os_name
            }
        }

def get_handler():
    return SystemCheckHandler()
`,
  },
  web_api_fetch: {
    name: "Web API / HTTP Fetcher",
    language: "python",
    desc: "Fetches live data from public REST APIs or web services via urllib or requests.",
    triggers: "fetch data, get weather, api query",
    patterns: "fetch data for, check weather in, lookup information on",
    code: `"""
Web API Extension for Fluffy
Queries live web services and formats the result.
"""

import urllib.request
import json
from typing import Dict, Any

class WebApiHandler:
    """Fetch live web or API data"""

    def execute(self, command) -> Dict[str, Any]:
        params = getattr(command, "parameters", {}) or {}
        topic = params.get("topic", "zen")
        
        try:
            # Example: Fetching programming quote / zen
            url = "https://api.github.com/zen"
            req = urllib.request.Request(
                url, 
                headers={"User-Agent": "Fluffy-Assistant/1.0"}
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                zen_quote = response.read().decode('utf-8').strip()

            return {
                "success": True,
                "message": f"🌐 **Web Service Response:**\\n\\n> *\\"{zen_quote}\\"*",
                "data": {"quote": zen_quote}
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"⚠️ Failed to query API: {str(e)}"
            }

def get_handler():
    return WebApiHandler()
`,
  },
  javascript_node: {
    name: "JavaScript / Node.js Handler",
    language: "javascript",
    desc: "Fast Node.js extension executed in a sandboxed child process.",
    triggers: "node script, run js, javascript task",
    patterns: "run node script, execute javascript task, run js tool",
    code: `// Fluffy JavaScript Extension Handler
// Runs in Node.js runtime environment

const fs = require('fs');

try {
  // Read parameters JSON passed via stdin
  const input = fs.readFileSync(0, 'utf-8');
  const params = input ? JSON.parse(input) : {};

  const timeStr = new Date().toISOString();
  
  // Return JSON response to stdout
  const result = {
    success: true,
    message: \`⚡ **JavaScript Extension Executed!**\\n\\nTimestamp: \\\`\${timeStr}\\\`\\nPayload: \\\`\${JSON.stringify(params)}\\\`\`,
    data: {
      runtime: "Node.js " + process.version,
      timestamp: timeStr,
      params: params
    }
  };

  console.log(JSON.stringify(result));
} catch (err) {
  console.log(JSON.stringify({
    success: false,
    message: "Error executing JavaScript handler: " + err.message
  }));
}
`,
  },
};

export const CreateExtensionModal: React.FC<CreateExtensionModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const setSidebarView = useUiStore((s) => s.setSidebarView);

  const [name, setName] = useState<string>("");
  const [intent, setIntent] = useState<string>("");
  const [intentTouched, setIntentTouched] = useState<boolean>(false);
  const [description, setDescription] = useState<string>("");
  const [language, setLanguage] = useState<"python" | "javascript">("python");
  const [triggers, setTriggers] = useState<string>("");
  const [patterns, setPatterns] = useState<string>("");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("basic_python");
  const [code, setCode] = useState<string>(TEMPLATES.basic_python.code);
  const [activeTab, setActiveTab] = useState<"code" | "guide">("code");

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-generate snake_case intent identifier from display name
  useEffect(() => {
    if (!intentTouched && name) {
      const autoSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      setIntent(autoSlug);
    }
  }, [name, intentTouched]);

  // Handle template switch
  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplateKey(templateKey);
    const tmpl = TEMPLATES[templateKey];
    if (tmpl) {
      setLanguage(tmpl.language);
      setCode(tmpl.code);
      if (!description) setDescription(tmpl.desc);
      if (!triggers) setTriggers(tmpl.triggers);
      if (!patterns) setPatterns(tmpl.patterns);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanIntent = intent.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!cleanIntent) {
      setErrorMessage("Please specify a valid intent identifier (alphanumeric and underscores).");
      return;
    }

    const cleanPatterns = patterns
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const cleanTriggers = triggers
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      const result = await extensionsStore.createExtension({
        intent: cleanIntent,
        name: name.trim() || cleanIntent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        description: description.trim(),
        language,
        code,
        patterns: cleanPatterns,
        triggers: cleanTriggers,
      });

      if (result.success && result.intent) {
        onClose();
        if (onCreated) {
          onCreated(result.intent);
        } else {
          // Switch to code view with new extension active
          setSidebarView("code");
        }
      } else {
        setErrorMessage(result.error || "Failed to create extension");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "var(--space-4)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "95vw",
          maxWidth: "1180px",
          height: "88vh",
          maxHeight: "860px",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xl)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "var(--color-text)",
        }}
      >
        {/* Header */}
        <header
          style={{
            padding: "var(--space-3) var(--space-6)",
            borderBottom: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface-elevated)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-accent-subtle)",
                border: "1px solid var(--color-accent-border)",
                color: "var(--color-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PlusIcon size={18} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: "var(--font-size-md)",
                  fontWeight: "var(--font-weight-bold)",
                  margin: 0,
                }}
              >
                Create Custom Fluffy Extension
              </h2>
              <p
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-text-muted)",
                  margin: "1px 0 0",
                }}
              >
                Build new tools, handlers, and actions directly in code for Fluffy AI.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            {/* View Mode Tabs */}
            <div
              style={{
                display: "flex",
                backgroundColor: "var(--color-surface)",
                padding: "2px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)",
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab("code")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 12px",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: activeTab === "code" ? "var(--font-weight-bold)" : "normal",
                  borderRadius: "var(--radius-xs)",
                  border: "none",
                  backgroundColor: activeTab === "code" ? "var(--color-accent)" : "transparent",
                  color: activeTab === "code" ? "#ffffff" : "var(--color-text-muted)",
                  cursor: "pointer",
                }}
              >
                <CodeIcon size={13} />
                <span>Code & Setup</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("guide")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 12px",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: activeTab === "guide" ? "var(--font-weight-bold)" : "normal",
                  borderRadius: "var(--radius-xs)",
                  border: "none",
                  backgroundColor: activeTab === "guide" ? "var(--color-accent)" : "transparent",
                  color: activeTab === "guide" ? "#ffffff" : "var(--color-text-muted)",
                  cursor: "pointer",
                }}
              >
                <BookOpenIcon size={13} />
                <span>Extension Guide</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                fontSize: "18px",
                padding: "4px 8px",
                borderRadius: "var(--radius-xs)",
              }}
              title="Close modal"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Content Body */}
        {activeTab === "guide" ? (
          /* Guide Tab */
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "var(--space-6)",
              lineHeight: 1.6,
              fontSize: "var(--font-size-sm)",
            }}
          >
            <div style={{ maxWidth: "840px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <div
                style={{
                  padding: "var(--space-4)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-accent-subtle)",
                  border: "1px solid var(--color-accent-border)",
                  display: "flex",
                  gap: "var(--space-3)",
                  alignItems: "flex-start",
                }}
              >
                <SparklesIcon size={22} style={{ color: "var(--color-accent)", marginTop: "2px", flexShrink: 0 }} />
                <div>
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "var(--font-size-md)", color: "var(--color-accent)" }}>
                    How Fluffy Discovers and Executes Extensions
                  </h3>
                  <p style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--color-text)" }}>
                    Fluffy uses an intent routing pipeline. Whenever you ask Fluffy something in chat, it evaluates whether the prompt matches your extension's triggers, example patterns, or canonical intent name. If matched, your handler runs instantly and Fluffy presents your response!
                  </p>
                </div>
              </div>

              {/* Section 1 */}
              <div style={{ padding: "var(--space-4)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                <h4 style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
                  1. The Handler Contract (`handler.py`)
                </h4>
                <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "0 0 var(--space-2) 0" }}>
                  Every Fluffy extension must define an <code>execute(self, command)</code> method and a top-level <code>get_handler()</code> factory:
                </p>
                <pre
                  style={{
                    backgroundColor: "#16161e",
                    color: "#c0caf5",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                    overflowX: "auto",
                    margin: 0,
                  }}
                >
{`from typing import Dict, Any

class MyExtensionHandler:
    def execute(self, command) -> Dict[str, Any]:
        # 1. Read input parameters parsed by Fluffy
        params = getattr(command, "parameters", {}) or {}
        target = params.get("target", "all")
        
        # 2. Perform your logic (inspect system, query API, run computation)
        result_text = f"Found target: {target}"
        
        # 3. Return the standard response dictionary
        return {
            "success": True,
            "message": f"### Output\\n{result_text}",  # Markdown shown in Chat
            "data": { "target": target }             # Optional structured telemetry
        }

def get_handler():
    return MyExtensionHandler()`}
                </pre>
              </div>

              {/* Section 2 */}
              <div style={{ padding: "var(--space-4)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                <h4 style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
                  2. Input `command` Properties
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px", fontSize: "var(--font-size-xs)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>command.intent</span>
                  <span>The string identifier of the triggered extension (e.g. <code>disk_space_checker</code>).</span>

                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>command.parameters</span>
                  <span>A dictionary containing values extracted by Fluffy or passed from the Test Runner (e.g. <code>&#123; "action": "scan", "path": "C:\\" &#125;</code>).</span>
                </div>
              </div>

              {/* Section 3 */}
              <div style={{ padding: "var(--space-4)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                <h4 style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
                  3. Expected Return Format
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px", fontSize: "var(--font-size-xs)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", color: "#9ece6a" }}>success (bool)</span>
                  <span><code>True</code> if the action succeeded; <code>False</code> if an error occurred.</span>

                  <span style={{ fontFamily: "var(--font-mono)", color: "#7aa2f7" }}>message (str)</span>
                  <span>Markdown-formatted message that Fluffy speaks or displays directly in Chat.</span>

                  <span style={{ fontFamily: "var(--font-mono)", color: "#bb9af7" }}>data (dict)</span>
                  <span>Optional structured payload returned to the caller or telemetry inspector.</span>
                </div>
              </div>

              {/* Section 4 */}
              <div style={{ padding: "var(--space-4)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                <h4 style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
                  4. Trigger Matching & Instant Availability
                </h4>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <li><strong>Phrasing Patterns:</strong> Add full example phrases (e.g. <em>"how much disk is free"</em>, <em>"check storage health"</em>).</li>
                  <li><strong>Trigger Keywords:</strong> Add core subject keywords (e.g. <em>"disk"</em>, <em>"storage"</em>, <em>"ssd"</em>).</li>
                  <li><strong>Zero Restart Needed:</strong> When you click <em>Create Extension</em>, Fluffy automatically registers it in <code>registry.json</code> and hot-loads it into the active Python Brain runtime immediately!</li>
                </ul>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("code")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-bold)",
                    backgroundColor: "var(--color-accent)",
                    color: "#ffffff",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <CodeIcon size={14} />
                  <span>Start Coding Extension</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Code & Configuration Tab */
          <form
            onSubmit={handleSubmit}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "row",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {/* Left Column: Metadata & Config */}
            <div
              style={{
                width: "360px",
                borderRight: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface)",
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
                padding: "var(--space-4)",
                gap: "var(--space-3)",
                flexShrink: 0,
              }}
            >
              {/* Template Selector */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    marginBottom: "4px",
                  }}
                >
                  Starter Template
                </label>
                <select
                  value={selectedTemplateKey}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                  }}
                >
                  {Object.entries(TEMPLATES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.name} ({v.language})
                    </option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    marginBottom: "4px",
                  }}
                >
                  Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Disk Space Monitor"
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Intent ID */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    marginBottom: "4px",
                  }}
                >
                  Intent ID (snake_case) *
                </label>
                <input
                  type="text"
                  required
                  value={intent}
                  onChange={(e) => {
                    setIntentTouched(true);
                    setIntent(e.target.value);
                  }}
                  placeholder="e.g. disk_space_monitor"
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    fontFamily: "var(--font-mono)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "2px", display: "block" }}>
                  Unique runtime identifier used by Python Brain router.
                </span>
              </div>

              {/* Description */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    marginBottom: "4px",
                  }}
                >
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this extension do?"
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                    resize: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Trigger Phrases & Patterns */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    marginBottom: "4px",
                  }}
                >
                  Natural Language Patterns
                </label>
                <input
                  type="text"
                  value={patterns}
                  onChange={(e) => setPatterns(e.target.value)}
                  placeholder="e.g. check disk space, disk status"
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "2px", display: "block" }}>
                  Comma-separated phrases user might say in Chat.
                </span>
              </div>

              {/* Trigger Keywords */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    marginBottom: "4px",
                  }}
                >
                  Trigger Keywords
                </label>
                <input
                  type="text"
                  value={triggers}
                  onChange={(e) => setTriggers(e.target.value)}
                  placeholder="e.g. disk, storage, drive"
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Language Selector */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    marginBottom: "4px",
                  }}
                >
                  Language
                </label>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <label
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "var(--font-size-xs)",
                      padding: "6px 10px",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: language === "python" ? "var(--color-accent-subtle)" : "var(--color-surface-elevated)",
                      border: language === "python" ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="lang"
                      value="python"
                      checked={language === "python"}
                      onChange={() => setLanguage("python")}
                      style={{ display: "none" }}
                    />
                    <span style={{ fontWeight: language === "python" ? "bold" : "normal" }}>🐍 Python</span>
                  </label>

                  <label
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "var(--font-size-xs)",
                      padding: "6px 10px",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: language === "javascript" ? "var(--color-accent-subtle)" : "var(--color-surface-elevated)",
                      border: language === "javascript" ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="lang"
                      value="javascript"
                      checked={language === "javascript"}
                      onChange={() => setLanguage("javascript")}
                      style={{ display: "none" }}
                    />
                    <span style={{ fontWeight: language === "javascript" ? "bold" : "normal" }}>⚡ Node.js (JS)</span>
                  </label>
                </div>
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: "var(--radius-xs)",
                    backgroundColor: "rgba(247, 118, 142, 0.15)",
                    border: "1px solid #f7768e",
                    color: "#f7768e",
                    fontSize: "11px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <AlertTriangleIcon size={14} style={{ flexShrink: 0 }} />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {/* Right Column: Embedded Code Editor */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                backgroundColor: "#1f2335",
              }}
            >
              {/* Editor Top Bar */}
              <div
                style={{
                  padding: "6px 12px",
                  borderBottom: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface-elevated)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <CodeIcon size={14} style={{ color: "var(--color-accent)" }} />
                  <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    {language === "javascript" ? "handler.js" : "handler.py"}
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                    ({language === "javascript" ? "Node.js Sandboxed" : "Python Brain Active Runtime"})
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab("guide")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "11px",
                    color: "var(--color-accent)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <BookOpenIcon size={12} />
                  <span>View Contract Details</span>
                </button>
              </div>

              {/* Code Editor */}
              <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                <JellyfishCodeEditor
                  value={code}
                  onChange={setCode}
                  language={language}
                />
              </div>

              {/* Bottom Actions Bar */}
              <footer
                style={{
                  padding: "var(--space-3) var(--space-6)",
                  borderTop: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                  Pressing Create writes files to <code>brain/extensions/{intent || "<intent>"}</code> and registers it live.
                </span>

                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "var(--radius-xs)",
                      fontSize: "var(--font-size-xs)",
                      backgroundColor: "var(--color-surface-elevated)",
                      color: "var(--color-text)",
                      border: "1px solid var(--color-border)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submitting || !intent.trim()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 18px",
                      borderRadius: "var(--radius-xs)",
                      fontSize: "var(--font-size-xs)",
                      fontWeight: "var(--font-weight-bold)",
                      backgroundColor: "var(--color-accent)",
                      color: "#ffffff",
                      border: "none",
                      cursor: submitting || !intent.trim() ? "not-allowed" : "pointer",
                      opacity: submitting || !intent.trim() ? 0.6 : 1,
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    {submitting ? (
                      <span>Creating & Registering...</span>
                    ) : (
                      <>
                        <CheckIcon size={13} />
                        <span>Create & Activate Extension</span>
                      </>
                    )}
                  </button>
                </div>
              </footer>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
