/**
 * Fluffy Desktop - Backend Contract Types
 * 
 * Formal TypeScript definitions matching the authoritative backend interfaces:
 * - Python Brain Web API (HTTP 5123)
 * - Rust Core IPC (TCP 9001 Telemetry, TCP 9002 Commands, WS 9003 Terminal Bridge)
 * - Guardian Behavioral Security System
 * 
 * Strict rule: No invented fields. All representations match backend semantics.
 */

// ============================================================================
// 1. Telemetry & Subsystem Status (HTTP 5123 GET /status)
// ============================================================================

export type SubsystemHealth = "healthy" | "degraded" | "unhealthy" | "unknown" | "disabled";

export interface CoreStatus {
  status: "active" | "degraded" | "offline" | "initializing";
  ipc_connected: boolean;
  version?: string;
  uptime_seconds?: number;
}

export interface BrainStatus {
  status: "active" | "busy" | "initializing" | "shutdown" | "offline";
  ui_active: boolean;
  active_sessions: number;
  tts_muted: boolean;
}

export interface GuardianStatus {
  status: "active" | "standby" | "disabled";
  alerts_count: number;
  trusted_count?: number;
  active_threats?: number;
}

export interface MemoryStatus {
  status: "active" | "syncing" | "idle" | "disabled";
  session_count?: number;
  profile_loaded?: boolean;
}

export interface NetworkStatus {
  role: "standalone" | "available" | "admin";
  active_sessions: number;
  interfaces_count: number;
  total_bytes_sent: number;
  total_bytes_recv: number;
}

export interface SystemResourceStatus {
  cpu_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_percent: number;
  process_count: number;
  network_speed_mbps?: number;
}

export interface CpuTelemetry {
  usage_percent: number;
  cores_usage: number[];
  temperature?: number;
  frequency_mhz?: number;
}

export interface MemoryTelemetry {
  total_mb: number;
  used_mb: number;
  free_mb: number;
  usage_percent: number;
}

export interface DiskTelemetry {
  name: string;
  mount_point: string;
  total_bytes: number;
  available_bytes: number;
  used_percent: number;
}

export interface NetworkTelemetry {
  interface_name: string;
  bytes_sent: number;
  bytes_recv: number;
  packets_sent: number;
  packets_recv: number;
  speed_mbps?: number;
  ping_ms?: number;
}

export interface ProcessTelemetry {
  pid: number;
  name: string;
  cpu_percent: number;
  ram_mb: number;
  disk_usage_mb?: number;
  status: string;
  user?: string;
  start_time?: string;
  parent_pid?: number;
  net_received?: number;
  net_sent?: number;
}

export interface GpuTelemetry {
  name: string;
  usage_percent?: number;
  memory_used_mb?: number;
  memory_total_mb?: number;
  temperature_c?: number;
}

export interface BatteryTelemetry {
  percent: number;
  is_charging: boolean;
  time_remaining_minutes?: number;
}

export interface PendingConfirmation {
  command_id: string;
  command_name: string;
  id?: string;
  action?: string;
  requester?: string;
  target?: string;
  risk?: string;
  reason?: string;
  message?: string;
  details?: Record<string, unknown>;
  params?: Record<string, unknown>;
  timestamp?: number;
  [key: string]: unknown;
}

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface SecurityAlert {
  id: string;
  timestamp: string | number;
  severity: AlertSeverity;
  alert_type: string;
  message: string;
  details?: Record<string, unknown>;
  process_id?: number;
  pid?: number;
  process_name?: string;
  reason?: string;
  resolved?: boolean;
  [key: string]: unknown;
}

export type NotificationType = "info" | "warning" | "error" | "success";

export interface Notification {
  message: string;
  type: NotificationType;
  timestamp?: number;
}

export type ExecutionLogLevel = "info" | "warn" | "warning" | "error" | "action" | "system" | "debug" | string;

export interface ExecutionLog {
  message: string;
  level: ExecutionLogLevel;
  module?: string;
  action?: string;
  timestamp?: string | number;
  [key: string]: unknown;
}

export interface SystemTelemetryGroup {
  cpu?: CpuTelemetry;
  ram?: MemoryTelemetry;
  network?: NetworkTelemetry;
  processes?: {
    total_count: number;
    top_cpu: ProcessTelemetry[];
    top_ram: ProcessTelemetry[];
    top_disk?: ProcessTelemetry[];
  };
  battery?: BatteryTelemetry;
  bluetooth?: {
    is_on: boolean;
    connected_devices: number;
  };
  disks?: DiskTelemetry[];
  persistence?: StartupApp[];
}

export type ProcessInfo = ProcessTelemetry;

export interface TelemetrySnapshot {
  status?: "active" | "initializing" | "shutdown" | string;
  schema_version?: string;
  timestamp?: string | number;
  system?: SystemTelemetryGroup;
  cpu?: CpuTelemetry;
  ram?: MemoryTelemetry;
  disks?: DiskTelemetry[];
  networks?: NetworkTelemetry[];
  gpus?: GpuTelemetry[];
  battery?: BatteryTelemetry;
  processes?: {
    total_count: number;
    top_cpu: ProcessTelemetry[];
    top_ram: ProcessTelemetry[];
    top_disk?: ProcessTelemetry[];
  };
  persistence?: StartupApp[];
  pending_confirmations?: PendingConfirmation[];
  security_alerts?: SecurityAlert[];
  _guardian_verdicts?: Array<Record<string, unknown>> | Record<string, GuardianVerdict> | Record<string, unknown>;
  notifications?: Notification[];
  active_sessions?: number;
  _tts_muted?: boolean;
}

/**
 * Backward compatibility alias for TelemetrySnapshot
 */
export type SystemStatus = TelemetrySnapshot;

// ============================================================================
// 2. Systems Domain Contracts (Processes, Apps, Startup, LAN Network)
// ============================================================================

export interface StartupApp {
  name: string;
  command: string;
  enabled: boolean;
  source?: "Registry" | "Startup Folder" | string;
}

export interface InstalledApp {
  id: string;
  name: string;
  publisher?: string;
  version?: string;
  exe_path?: string;
  location?: string;
  icon_data?: string;
  size_kb?: number;
  install_date?: string;
  uninstall_string?: string;
}

export type NetworkRole = "standalone" | "available" | "admin";

export interface NetworkMachine {
  machine_id: string;
  ip: string;
  port: number;
  name?: string;
  online: boolean;
}

export interface RemoteMachineData {
  system?: {
    hostname?: string;
    os?: string;
    os_version?: string;
    arch?: string;
    uptime?: string;
    [key: string]: unknown;
  };
  cpu?: CpuTelemetry;
  ram?: MemoryTelemetry;
  network?: {
    status?: string;
    [key: string]: unknown;
  };
  processes?: {
    top_ram?: ProcessTelemetry[];
    top_cpu?: ProcessTelemetry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type KillProcessPayload = {
  KillProcess: {
    pid: number;
  };
};

export type StartupAddPayload = {
  StartupAdd: {
    name: string;
    path: string;
  };
};

export type StartupRemovePayload = {
  StartupRemove: {
    name: string;
  };
};

export type StartupTogglePayload = {
  StartupToggle: {
    name: string;
    enabled: boolean;
  };
};

// ============================================================================
// 3. Authentication Contracts
// ============================================================================

export interface TokenResponse {
  token: string;
}

// ============================================================================
// 4. Operations & Commands Contracts
// ============================================================================

export interface NormalizeResult {
  ok: boolean;
  cleanup?: string;
  settings?: string;
  unusual_processes?: Array<{
    pid?: number;
    name?: string;
    cpu_percent?: number;
    ram_mb?: number;
    reason?: string;
    [key: string]: unknown;
  }>;
  memory_freed_mb?: number;
  actions?: number;
  error?: string;
}

export interface SpeedTestResult {
  status?: "success" | "error" | string;
  download_mbps?: number;
  ping_ms?: number;
  upload_mbps?: number;
  error?: string;
}

export type ConfirmCommandPayload = {
  Confirm: {
    command_id: string;
  };
};

export type CancelCommandPayload = {
  Cancel: {
    command_id: string;
  };
};

export type CommandPayload =
  | ConfirmCommandPayload
  | CancelCommandPayload
  | KillProcessPayload
  | StartupAddPayload
  | StartupRemovePayload
  | StartupTogglePayload
  | Record<string, unknown>;

// ============================================================================
// 6. Guardian Domain Contracts
// ============================================================================

export interface GuardianVerdict {
  process: string;
  level: "SAFE" | "SUSPICIOUS" | "ANOMALY" | "DANGEROUS" | string;
  reason: string;
  pid?: number;
  cpu?: number;
  ram?: number;
  net_sent?: number;
  net_recv?: number;
  timestamp?: number;
  [key: string]: unknown;
}

export type SecurityActionType = "trust" | "ignore" | "mark_dangerous";

export interface SecurityActionPayload {
  pid: number;
  action: SecurityActionType;
}

export interface TrustProcessPayload {
  process: string;
}

export type LogEntry = ExecutionLog;

export interface PendingApproval {
  id: string;
  command_id?: string;
  action: string;
  requester?: string;
  target?: string;
  risk?: string;
  reason?: string;
  params?: Record<string, unknown>;
  timestamp?: number;
}

export interface TrustedProcessesResponse {
  ok: boolean;
  trusted_processes: string[];
}

// ============================================================================
// 7. Memory Domain Contracts
// ============================================================================

export interface UserPreferences {
  theme?: string;
  voice_speed?: number;
  auto_normalize?: boolean;
  alert_threshold?: number;
  [key: string]: unknown;
}

export interface UserProfileIdentity {
  name?: string;
  role?: string;
  organization?: string;
  timezone?: string;
  [key: string]: unknown;
}

export interface UserProfile {
  name?: string;
  role?: string;
  identity?: UserProfileIdentity;
  facts?: string[];
  frequent_apps?: string[];
  learned_intents?: Record<string, unknown>;
  preferences?: Record<string, { value: unknown; [key: string]: unknown } | unknown>;
  system_preferences?: {
    trusted_processes?: { value: string[] };
    ignored_processes?: { value: string[] };
    pinned_processes?: { value: string[] };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface MemoryBehavior {
  frequent_intents?: Record<string, number>;
  learned_apps?: string[];
  command_history?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface LongTermMemory {
  user_profile?: UserProfile;
  name?: string;
  facts?: string[];
  frequent_apps?: string[];
  learned_intents?: Record<string, unknown>;
  behavior?: MemoryBehavior;
  metadata?: {
    created_at?: string;
    last_updated?: string;
    version?: string;
  };
  [key: string]: unknown;
}

export interface SessionContextSummary {
  has_pending_intent?: boolean;
  pending_intent?: string | null;
  active_intent?: string | null;
  has_context?: boolean;
  parameters?: Record<string, unknown>;
  has_action_context?: boolean;
  last_action?: string | null;
  last_search?: Record<string, unknown> | null;
  last_killed_process?: Record<string, unknown> | null;
  last_trusted_process?: string | null;
  history_length?: number;
  last_exchange?: {
    user?: string | null;
    ai?: string | null;
  } | null;
  [key: string]: unknown;
}

export type ChatMessageRole = "user" | "assistant" | "system" | "command" | "error";

export interface ChatMessage {
  id?: string;
  role: ChatMessageRole;
  content: string;
  timestamp?: string | number;
  metadata?: Record<string, unknown>;
  type?: string;
  text?: string;
  command_result?: unknown;
  error?: string;
  streaming?: boolean;
  [key: string]: unknown;
}

export interface ChatSendMessagePayload {
  message: string;
  session_id?: string;
  use_voice?: boolean;
}

export interface ChatSendMessageResponse {
  ok: boolean;
  type?: "command" | "llm" | string;
  message?: string;
  result?: unknown;
  error?: string;
}

export interface ChatStreamChunk {
  chunk?: string;
  done?: boolean;
}

export interface SttStatusResponse {
  ok?: boolean;
  status?: "listening" | "stopped" | "processing" | string;
  text?: string;
  partial?: string;
  is_listening?: boolean;
  [key: string]: unknown;
}

export interface TtsMuteResponse {
  ok: boolean;
  muted: boolean;
}

export interface ChatSessionSummary {
  id: string;
  title?: string;
  created?: string | number;
  last_updated?: string | number;
  message_count?: number;
  [key: string]: unknown;
}

export interface ChatSessionDetail {
  id: string;
  created?: string | number;
  last_updated?: string | number;
  messages: ChatMessage[];
  [key: string]: unknown;
}

// --------------------------------------------------------------------------
// Core Terminal Contracts (ws://127.0.0.1:9003)
// --------------------------------------------------------------------------

export type TerminalOutputColorTag =
  | "success"
  | "error"
  | "brand"
  | "dim"
  | "text"
  | "warning"
  | string;

export interface TerminalOutputMessage {
  type: "output";
  tag: string;
  text: string;
  color_tag: TerminalOutputColorTag;
  timestamp: string;
}

export interface TerminalPromptMessage {
  type: "prompt";
  text: string;
}

export interface TerminalStatusMessage {
  type: "status";
  admin_port: number;
  client_count: number;
  mode: "Standalone" | "Admin" | "Client" | string;
}

export interface TerminalClientNode {
  tag: string;
  hostname: string;
  os: string;
  os_version: string;
  ip: string;
  arch: string;
  connected_at: string;
  [key: string]: unknown;
}

export interface TerminalClientListMessage {
  type: "client_list";
  clients: TerminalClientNode[];
}

export type TerminalServerMessage =
  | TerminalOutputMessage
  | TerminalPromptMessage
  | TerminalStatusMessage
  | TerminalClientListMessage;

export interface TerminalCommandMessage {
  type: "command";
  text: string;
}

export type TerminalConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

// ============================================================================
// 8. Extensions Domain Contracts (HTTP 5123 /extensions/*)
// ============================================================================

export interface ExtensionSummary {
  intent: string;
  name: string;
  description: string;
  version: string;
  language: "python" | "javascript" | string;
  has_ui: boolean;
  enabled: boolean;
  loaded: boolean;
  created?: string;
  author?: string;
  patterns?: string[];
  [key: string]: unknown;
}

export interface ExtensionListResponse {
  ok: boolean;
  extensions: ExtensionSummary[];
  count?: number;
  error?: string;
}

export interface ExtensionDetail extends ExtensionSummary {
  files?: string[];
  directory?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExtensionDetailResponse {
  ok: boolean;
  extension?: ExtensionDetail;
  error?: string;
}

export interface ExtensionCodeResponse {
  ok: boolean;
  intent?: string;
  filename?: string;
  language?: string;
  code?: string;
  error?: string;
}

export interface ExtensionSaveCodePayload {
  code: string;
  language?: string;
}

export interface ExtensionSaveCodeResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

export interface ExtensionReloadResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

export interface ExtensionDeleteResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

export interface ExtensionToggleResponse {
  ok: boolean;
  enabled: boolean;
  message?: string;
  error?: string;
}

export interface ExtensionRunPayload {
  payload?: Record<string, unknown>;
}

export interface ExtensionRunResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ExtensionOpenVscodeResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// 9. FTP Domain Contracts (HTTP 5123 /ftp/*)
// ============================================================================

export type FtpServerStatus = "running" | "stopped" | "unavailable";

export interface FtpStatusResponse {
  ok?: boolean;
  status: FtpServerStatus;
  ip: string;
  port: number;
  username: string;
  password?: string;
  qr_code?: string;
  active_clients: number;
  error?: string;
}

export interface FtpStartPayload {
  shared_dir?: string;
}

export interface FtpStartResponse {
  ok?: boolean;
  success?: boolean;
  status?: FtpServerStatus;
  ip?: string;
  port?: number;
  username?: string;
  password?: string;
  qr_code?: string;
  error?: string;
}

export interface FtpStopResponse {
  ok?: boolean;
  success?: boolean;
  status?: FtpServerStatus;
  error?: string;
}

export interface FtpLogEntry {
  timestamp: string;
  event: string;
  client?: string;
  file?: string;
  details?: string;
  [key: string]: unknown;
}

export interface FtpLogsResponse {
  ok: boolean;
  logs: FtpLogEntry[];
  error?: string;
}

export interface FtpDisconnectPayload {
  client_ip: string;
}

// ============================================================================
// 10. Settings & LLM Domain Contracts (HTTP 5123 /llm/* & /memory/preferences)
// ============================================================================

export interface LlmConfig {
  api_key?: string;
  model?: string;
  is_configured?: boolean;
  [key: string]: unknown;
}

export interface LlmConfigResponse {
  ok: boolean;
  config?: LlmConfig;
  error?: string;
}

export interface LlmUpdateConfigPayload {
  api_key?: string;
  model?: string;
}

export interface LlmModelSummary {
  id: string;
  name: string;
  description?: string;
  cost?: string;
  recommended?: boolean;
  context_length?: number;
  [key: string]: unknown;
}

export interface LlmModelsResponse {
  ok: boolean;
  models?: LlmModelSummary[];
  error?: string;
}

export interface GeneralSettingsState {
  theme: "fluffyDark" | "fluffyLight" | "highContrast";
  autoNormalize: boolean;
  alertThreshold: number;
  voiceSpeed: number;
  ttsMuted: boolean;
  reducedMotion: boolean;
}



