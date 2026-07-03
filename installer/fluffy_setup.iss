; ============================================================
;  Fluffy Assistant — Inno Setup Script
;  Output: FluffyAssistant_v1.0_Win64.exe
;
;  To compile: open this file in Inno Setup 6 and press F9,
;              OR run: ISCC.exe fluffy_setup.iss
; ============================================================

#define MyAppName      "Fluffy Assistant"
#define MyAppVersion   "1.0"
#define MyAppPublisher "Fluffy AI"
#define MyAppURL       "https://github.com/peryton00/Fluffy_Assistent"
#define MyAppExeName   "fluffy-launcher.exe"
#define MyAppID        "{{A7F3C2B1-8D4E-4F9A-B6C3-2E1D0F5A8B7C}"

[Setup]
; Basic app info
AppId={#MyAppID}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases

; Installation directory
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes

; Minimum Windows 10 required
MinVersion=10.0

; 64-bit only
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

; Output
OutputDir=.
OutputBaseFilename=FluffyAssistant_v1.0_Win64
SetupIconFile=assets\fluffy_icon.ico
UninstallDisplayIcon={app}\launcher\fluffy-launcher.exe

; Compression
Compression=lzma2/normal
SolidCompression=no

; UI style — modern wizard
WizardStyle=modern
WizardSizePercent=130
WizardImageFile=assets\fluffy_banner.bmp
WizardSmallImageFile=assets\fluffy_small.bmp

; Privileges — install in user space without requiring admin privileges
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline

; Uninstall info visible in Add/Remove Programs
UninstallDisplayName={#MyAppName} {#MyAppVersion}
CreateUninstallRegKey=yes

; Restart not required
RestartIfNeededByRun=no

; License shown in installer
LicenseFile=assets\LICENSE.rtf

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";    Description: "Create a &Desktop shortcut";             GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "startupicon";    Description: "Start Fluffy Assistant when Windows starts"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

; ── File Installation ─────────────────────────────────────────────────────────

[Files]
; ── Python Embeddable (no system Python needed) ──
Source: "dist\python\*";    DestDir: "{app}\python";    Flags: recursesubdirs createallsubdirs; Excludes: "*.pyc,__pycache__"

; ── Python Brain source ──
Source: "dist\brain\*";     DestDir: "{app}\brain";     Flags: recursesubdirs createallsubdirs; Excludes: "*.pyc,__pycache__,fluffy_data"

; ── AI / LLM client ──
Source: "dist\ai\*";        DestDir: "{app}\ai";        Flags: recursesubdirs createallsubdirs; Excludes: "*.pyc,__pycache__"

; ── Services (FTP etc.) ──
Source: "dist\services\*";  DestDir: "{app}\services";  Flags: recursesubdirs createallsubdirs; Excludes: "*.pyc,__pycache__"

; ── Fluffy Core Python modules ──
Source: "dist\fluffy\*";    DestDir: "{app}\fluffy";    Flags: recursesubdirs createallsubdirs; Excludes: "*.pyc,__pycache__"

; ── Voice engine (Piper TTS + Vosk models) ──
Source: "dist\voice\*";     DestDir: "{app}\voice";     Flags: recursesubdirs createallsubdirs; Excludes: "*.pyc,__pycache__"

; ── Assets (icons, logos) ──
Source: "dist\assets\*";    DestDir: "{app}\assets";    Flags: recursesubdirs createallsubdirs

; ── Rust Core executable ──
Source: "dist\bin\fluffy-core.exe"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "dist\bin\fluffy-client.exe"; DestDir: "{app}\bin"; Flags: ignoreversion

; ── Tauri UI executable ──
Source: "dist\bin\fluffy-ui.exe";   DestDir: "{app}\bin"; Flags: ignoreversion

; ── Launcher scripts ──
Source: "dist\launcher\*";  DestDir: "{app}\launcher";  Flags: recursesubdirs createallsubdirs

; ── Pre-built launcher .exe (compiled from launcher.py) ──
Source: "dist\bin\fluffy-launcher.exe"; DestDir: "{app}\launcher"; Flags: ignoreversion

; ── Environment config (pre-filled with API keys) ──
Source: "dist\.env";        DestDir: "{app}";            Flags: onlyifdoesntexist

; ── Visual C++ Redistributable (if needed) ──
; Source: "redist\vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

; ── Icons ──
Source: "assets\fluffy_icon.ico"; DestDir: "{app}"; Flags: ignoreversion

; ── App data dirs ─────────────────────────────────────────────────────────────
[Dirs]
Name: "{app}\fluffy_data"
Name: "{app}\fluffy_data\guardian"
Name: "{app}\fluffy_data\ftp"
Name: "{app}\brain\extensions"
Name: "{app}\FluffyShared"

; ── Registry entries ──────────────────────────────────────────────────────────
[Registry]
; Store install path for self-update and uninstall
Root: HKCU; Subkey: "Software\{#MyAppName}"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey

; Optional: run at startup (only if user chose the startup task)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#MyAppName}"; ValueData: """{app}\launcher\fluffy-launcher.exe"""; Tasks: startupicon; Flags: uninsdeletevalue

; ── Shortcuts ─────────────────────────────────────────────────────────────────
[Icons]
; Start Menu
Name: "{group}\{#MyAppName}"; Filename: "{app}\launcher\fluffy-launcher.exe"; IconFilename: "{app}\fluffy_icon.ico"; WorkingDir: "{app}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"

; Desktop (optional, user controlled via Tasks)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\launcher\fluffy-launcher.exe"; IconFilename: "{app}\fluffy_icon.ico"; WorkingDir: "{app}"; Tasks: desktopicon

; ── Post-install Actions ──────────────────────────────────────────────────────
[Run]
; Run first-time setup wizard after install completes
Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\launcher\first_run_setup.py"" ""{app}"""; WorkingDir: "{app}"; Description: "Configure Fluffy Assistant (recommended)"; Flags: nowait postinstall skipifsilent

; Launch the app immediately after install
Filename: "{app}\launcher\fluffy-launcher.exe"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent; WorkingDir: "{app}"

; ── Uninstall cleanup ─────────────────────────────────────────────────────────
[UninstallRun]
; Kill any running Fluffy processes before uninstalling
Filename: "taskkill"; Parameters: "/F /IM fluffy-core.exe /T"; Flags: runhidden; RunOnceId: "KillCore"
Filename: "taskkill"; Parameters: "/F /IM fluffy-ui.exe /T";   Flags: runhidden; RunOnceId: "KillUI"
Filename: "taskkill"; Parameters: "/F /IM fluffy-launcher.exe /T"; Flags: runhidden; RunOnceId: "KillLauncher"

[UninstallDelete]
; Clean up generated runtime files on uninstall
Type: filesandordirs; Name: "{app}\fluffy_data"
Type: filesandordirs; Name: "{app}\.venv"
Type: filesandordirs; Name: "{app}\brain\__pycache__"
Type: files;          Name: "{app}\.env"
Type: files;          Name: "{app}\status.json"

; ── Custom Messages ───────────────────────────────────────────────────────────
[Messages]
WelcomeLabel1=Welcome to the [name] Setup Wizard
WelcomeLabel2=This will install [name/ver] on your computer.%n%nFluffy is your always-on AI assistant for Windows — it monitors your system, responds to voice commands, and learns new capabilities on the fly.%n%nClick Next to continue.
FinishedHeadingLabel=Fluffy Assistant is Ready!
FinishedLabel=Setup has finished installing [name] on your computer.%n%nNo Python, Rust, or Node.js required — everything is included.%n%nClick Finish to launch your AI assistant.
