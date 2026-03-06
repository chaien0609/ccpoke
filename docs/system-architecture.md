# System Architecture

This document describes the overall system architecture, component interactions, data flows, and technical design decisions for ccpoke.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         ccpoke Ecosystem                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐
│  │ Claude Code  │  │   Cursor     │  │  Codex CLI   │  │ Gemini  │
│  │   (Agent)    │  │   (Agent)    │  │   (Agent)    │  │  CLI    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │(Agent) │
│         │                 │                 │          └────┬────┘
│         │ Hook Event      │ Hook Event      │ Hook Event     │
│         └─────────────────┼─────────────────┼────────────────┘
│                           │                                      │
│                    ┌──────▼──────────────────────────┐           │
│                    │   ccpoke Bridge Server          │           │
│                    │  (Express API, 127.0.0.1:9377)  │           │
│                    │                                 │           │
│                    │  ┌──────────────────────────┐   │           │
│                    │  │  Agent Handler           │   │           │
│                    │  │  (Event Parsing)         │   │           │
│                    │  └──────────────────────────┘   │           │
│                    │                                 │           │
│                    │  ┌──────────────────────────┐   │           │
│                    │  │  Session Resolver        │   │           │
│                    │  │  (Project Detection)     │   │           │
│                    │  └──────────────────────────┘   │           │
│                    │                                 │           │
│                    │  ┌──────────────────────────┐   │           │
│                    │  │  Notification Channel    │   │           │
│                    │  │  (Single active channel) │   │           │
│                    │  │                          │   │           │
│                    │  │  One of:                 │   │           │
│                    │  │  ├─ TelegramChannel      │   │           │
│                    │  │  │  (Bot, handlers)      │   │           │
│                    │  │  │                       │   │           │
│                    │  │  ├─ DiscordChannel       │   │           │
│                    │  │  │  (discord.js, DM,     │   │           │
│                    │  │  │   buttons, slash cmds)│   │           │
│                    │  │  │                       │   │           │
│                    │  │  └─ SlackChannel         │   │           │
│                    │  │     (WebClient, blocks)  │   │           │
│                    │  └──────────────────────────┘   │           │
│                    │                                 │           │
│                    │  ┌──────────────────────────┐   │           │
│                    │  │  Session Monitor         │   │           │
│                    │  │  (Periodic Scanner)      │   │           │
│                    │  └──────────────────────────┘   │           │
│                    └─────────────────────────────────┘           │
│                           │    │                                 │
│                           │    │ tmux operations                 │
│                           │    │                                 │
│                    ┌──────▼────▼──────────────────┐              │
│                    │   tmux Session Manager       │              │
│                    │  (Bridge, Scanner, State)    │              │
│                    └──────┬────┬──────────────────┘              │
│                           │    │                                 │
│                    ┌──────▼────▼──────────────────┐              │
│                    │  Local tmux Sessions         │              │
│                    │  (Project Context)           │              │
│                    └──────────────────────────────┘              │
│                                                                  │
└────────────────────────────┬──────────────────────────────────────┘
                            │ │
                            │ │
                   Telegram  │ │  Slack Web API
                        API  │ │
                            │ │
                      ┌──────▼─▼────────────┐
                      │ Telegram Bot + Slack│
                      │     Channel         │
                      │  (User Chat UI)     │
                      └─────────────────────┘
```

---

## Core Components

### 1. Agent Framework

**Responsibility:** Detect and integrate multiple AI coding agents.

**Components:**
- **AgentRegistry** — Maintains list of available agents (Claude Code, Cursor, Codex CLI, Gemini CLI)
- **ClaudeCodeProvider** — Claude Code integration
- **CursorProvider** — Cursor integration
- **CodexProvider** — Codex CLI integration
- **GeminiCliProvider** — Gemini CLI integration
- **AgentHandler** — Central event dispatcher for all hook types

**Key Operations:**
```
Agent Hook Triggered
    ↓
Validate Secret Header
    ↓
Load Agent Provider
    ↓
Parse Event (transcript → structured)
    ↓
Extract Project/Session Info
    ↓
Resolve tmux Session
    ↓
Store Response
    ↓
Emit to Notification Channel
```

**Extensibility:** New agents implemented via `AgentProvider` interface.

### 2. Notification Channel

**Responsibility:** Send notifications to users via a single configured channel (Telegram, Discord, or Slack — selected during setup).

**Components:**
- **TelegramChannel** — Bot lifecycle and message handling (sessions, permission requests, ask-question)
- **TelegramSender** — Message formatting and pagination
- **PermissionRequestHandler** — Forward tool-use Allow/Deny to Telegram
- **AskQuestionHandler** — Forward AskUserQuestion events to Telegram
- **PendingReplyStore** — Tracks pending user replies (10min TTL, auto-cleanup on shutdown)
- **SlackChannel** — Slack Web API integration via `@slack/web-api`
- **SlackSender** — Sends Block Kit messages; splits >50 blocks automatically
- **SlackBlockBuilder** — Builds `KnownBlock[]` from `NotificationData`
- **DiscordChannel** — Discord bot via `discord.js` (DM-based, gateway intents, interaction/message routing)
- **DiscordSender** — Sends embeds to Discord DM
- **DiscordMarkdown** — NotificationData → Discord EmbedBuilder
- **DiscordPermissionHandler** — Allow/Deny buttons for tool-use approvals
- **DiscordAskQuestionHandler** — Single/multi-select option buttons (5-row cap)
- **DiscordPromptHandler** — Elicitation/idle prompt forwarding with DM reply capture
- **DiscordSessionCommandHandler** — /sessions, /projects slash commands
- **DiscordAgentLauncher** — Launch agent sessions from project selection

**Key Operations (Telegram example):**
```
Notification Event Received
    ↓
channel.sendNotification()
    ↓
Format Message (Markdown conversion)
    ↓
Check Message Length
    ↓
If > 4096 chars: Paginate [1/N]
    ↓
Send to Telegram API
    ↓
Store Response ID (for edits/updates)
    ↓
PendingReplyStore tracks reply window (10min)
    ↓
Auto-cleanup on timeout or explicit destroy()
```

**Resource Management:**
- **PendingReplyStore** — In-memory store bounded by reply TTL (10 minutes)
- **destroy()** — Explicitly clears all pending replies on shutdown (prevents memory leak)
- **Auto-expiry** — Entries automatically expire after 10 minutes inactivity

**Features:**
- Auto-split long messages
- Markdown to MarkdownV2 conversion (Telegram)
- Block Kit structured formatting (Slack)
- Rate limiting (Telegram: 30 msg/sec)
- Message editing (progress updates)

### 3. Session Management

**Responsibility:** Track and manage tmux sessions across bot restart.

**Components:**
- **SessionMap** — Registry of active sessions with LRU eviction
- **SessionStateManager** — State machine for individual sessions
- **TmuxScanner** — Detects live tmux panes
- **SessionResolver** — Links notifications to sessions

**Session Attributes:**
```typescript
interface TmuxSession {
  sessionId: string;           // Unique ID
  tmuxTarget: string;          // tmux target (session:window)
  agent: AgentName;            // Agent name (claude-code, cursor, codex)
  project: string;             // Project name (from path)
  cwd: string;                 // Working directory
  label: string;               // Display label
  state: 'idle' | 'busy' | 'blocked' | 'unknown';  // Current state
  lastActivity: Date;          // Last activity timestamp
}
```

**Session States:**
- **idle** — Session ready, no activity
- **busy** — Agent processing response
- **blocked** — Waiting for user input (elicitation_dialog hook)
- **unknown** — Unable to determine state

**Resource Limits:**
- **MAX_SESSIONS = 200:** Prevents unbounded memory growth
- **LRU Eviction:** When limit reached, oldest inactive session (by `lastActivity`) is evicted
- **Persistence:** Sessions saved to `~/.ccpoke/sessions.json` on disk for recovery

**Lifecycle:**
```
SessionStart Hook
    ↓
Register in SessionMap (memory + disk)
    ↓
Periodic 30s Scan (TmuxScanner)
    ├─ Detect new panes
    ├─ Update last_activity
    └─ Prune stale (30min idle)
    ↓
Persist to ~/.ccpoke/sessions.json
    ↓
Bot Restart: Load from disk
    ↓
Reconcile with live tmux state
```

### 4. tmux Bridge

**Responsibility:** Low-level operations on tmux sessions.

**Components:**
- **TmuxBridge** — CLI wrapper for tmux commands
- **TmuxScanner** — Process tree analysis
- **SessionMap** — Persistence and registry

**Operations:**
```typescript
// Send keystrokes
await bridge.sendKeys('0:1', 'message\nEnter');

// Capture pane content
const content = await bridge.capturePane('0:1');

// List sessions/windows/panes
const panes = await bridge.listPanes();

// Get pane details
const details = await bridge.getPaneInfo('0:1');
```

**Process Discovery:**
Uses `ps` tree to find processes running in panes:
```
tmux pane → shell process → child processes
```

Detects agents by matching AGENT_PATTERNS:
- `Claude` for Claude Code
- `Cursor` for Cursor IDE
- `codex` for Codex CLI
- `gemini` for Gemini CLI

---

## Data Flow: Stop Hook Notification

**Scenario:** Claude Code completes response → User receives Telegram notification

```
1. CLAUDE CODE STOP HOOK TRIGGERS
   ├─ Writes to ~/.claude/projects/{project}/session.jsonl
   └─ Executes ~/.ccpoke/hooks/stop-notify.sh

2. SHELL SCRIPT (stop-notify.sh)
   ├─ Reads transcript path from environment
   ├─ Gets hook secret from config
   ├─ Constructs JSON payload
   └─ curl POST http://127.0.0.1:9377/hook/stop
      └─ Headers:
         ├─ Content-Type: application/json
         └─ X-CCPoke-Secret: {secret}

3. EXPRESS SERVER (/hook/stop endpoint)
   ├─ Validate secret header
   ├─ Parse request body
   └─ Delegate to AgentHandler

4. AGENT HANDLER
   ├─ Detect agent (Claude Code)
   ├─ Load ClaudeCodeProvider
   ├─ Call parseEvent()
   │  ├─ Read transcript file
   │  ├─ Parse NDJSON
   │  ├─ Extract last response
   │  ├─ Collect git changes
   │  └─ Return AgentEventResult
   └─ Emit 'event' signal

5. SESSION RESOLVER
   ├─ Extract project from transcript path
   ├─ Query SessionMap
   ├─ Find matching tmux session
   └─ Attach session info to event

6. RESPONSE STORE
   ├─ Store response by session ID
   ├─ Generate short ID (6 chars)
   └─ Enable response lookup for chat

7. TELEGRAM CHANNEL
   ├─ Format notification
   │  ├─ Markdown → MarkdownV2
   │  ├─ Git diff summary
   │  ├─ Execution stats
   │  └─ Session info
   ├─ Check length
   ├─ If > 4096 chars: paginate
   ├─ Send via Telegram API
   ├─ Store message ID
   └─ Add inline buttons (Chat, View)

8. USER ON PHONE 📱
   └─ Receives notification with:
      ├─ Agent name
      ├─ Project
      ├─ Summary
      ├─ Git changes
      ├─ Duration
      └─ Action buttons
```

---

## Data Flow: Two-Way Chat

**Scenario:** User sends message via Telegram → Injected into Claude Code session

```
1. USER SENDS TELEGRAM MESSAGE
   └─ TelegramChannel receives update

2. MESSAGE HANDLER
   ├─ Validate user (whitelist check)
   ├─ Parse message text
   ├─ Store in PendingReplyStore (10min TTL)
   └─ Emit 'reply_pending' event

3. SESSION RESOLVER
   ├─ Extract session from Telegram message
   ├─ Query SessionMap
   └─ Find tmux target

4. SESSION STATE MACHINE
   ├─ Check session status
   ├─ Queue message if busy
   ├─ Transition to 'waiting_input'
   └─ Inject via tmux

5. TMUX BRIDGE (send-keys)
   ├─ Send message text
   ├─ Send Enter key
   └─ Claude Code receives input

6. POLLING (JSONL transcript)
   ├─ Periodic 2-second check
   ├─ Detect new response event
   ├─ Extract response content
   └─ Emit 'response_ready'

7. TELEGRAM SENDER
   ├─ Format response
   ├─ Send back to user
   ├─ Clear pending reply
   └─ Transition session to 'idle'

8. MESSAGE LIFECYCLE
   └─ PendingReplyStore expires (10min)
      └─ Auto-cleanup to free memory
```

---

## Data Flow: Elicitation Dialog Forwarding

**Scenario:** Claude Code sends elicitation_dialog hook → User sees prompt in Telegram → Response injected back

```
1. CLAUDE CODE ELICITATION HOOK
   ├─ Agent requires user input (e.g., "Proceed with change?")
   └─ Sends notification hook with event type: elicitation_dialog

2. NOTIFICATION HOOK ENDPOINT (/hook/notification)
   ├─ Validate secret header
   ├─ Parse notification event:
   │  ├─ session_id
   │  ├─ notification_type (elicitation_dialog)
   │  ├─ title (optional)
   │  └─ message (the prompt)
   └─ Delegate to AgentHandler.handleNotification()

3. AGENT HANDLER
   ├─ Resolve session ID (map to tmux target)
   ├─ Call chatResolver.onNotificationBlock()
   │  └─ Update session state → 'blocked'
   └─ Emit onNotification event

4. TELEGRAM CHANNEL
   ├─ PromptHandler receives elicitation_dialog
   ├─ Format message with title + prompt
   ├─ Send to Telegram with force_reply + selective markup
   └─ Track pending prompt (no TTL, cleaned on reply/shutdown/evict)

5. USER ON PHONE
   ├─ Sees prompt message with reply field
   ├─ Types response
   └─ Sends reply

6. TELEGRAM MESSAGE HANDLER
   ├─ Detect reply to prompt message
   ├─ PromptHandler.injectElicitationResponse()
   ├─ Validate session active and waiting
   ├─ Send keys via tmux: text + Enter
   └─ Update session state → 'busy'

7. CLAUDE CODE RESUMES
   ├─ Receives user response from stdin
   ├─ Processes with injected input
   ├─ Completes response
   └─ Sends stop hook

8. SESSION STATE RECOVERY
   └─ Session transitions: blocked → busy → idle
```

---

## Data Flow: Session List Command

**Scenario:** User requests `/sessions` → Shows all active Claude Code sessions with state emojis and chat buttons

```
1. USER SENDS /sessions COMMAND
   └─ TelegramChannel receives message

2. MESSAGE HANDLER
   ├─ Validate user (whitelist check)
   ├─ Load all sessions from SessionMap
   └─ Call formatSessionList()

3. SESSION FORMATTER
   ├─ Sort sessions by lastActivity (newest first)
   ├─ For each session:
   │  ├─ Get state emoji:
   │  │  ├─ 🟢 (green) = idle
   │  │  ├─ 🟡 (yellow) = busy
   │  │  ├─ 🔴 (red) = blocked
   │  │  └─ ⚪ (white) = unknown
   │  ├─ Format label: "{emoji} {project} ({state})"
   │  └─ Add "Chat" button (callback_data: chat:{sessionId})
   └─ Return formatted message + inline keyboard

4. TELEGRAM SEND
   ├─ Send message with MarkdownV2 formatting
   ├─ Include inline keyboard (50 buttons max)
   └─ User taps "Chat" button

5. CALLBACK HANDLER
   ├─ Parse callback_data: chat:{sessionId}
   ├─ Open chat input for that session
   └─ Messages sent to session receive handler
```

---

## Data Flow: Session Lifecycle

**Scenario:** Detect, register, sync, and prune sessions

```
DETECTION PHASE
├─ SessionStart Hook (Claude Code)
│  ├─ Captures tmux session info
│  ├─ Captures working directory
│  ├─ Posts to hook endpoint
│  └─ AgentHandler.onSessionStart()
│
└─ TmuxScanner (Periodic, 30s interval)
   ├─ List all tmux panes
   ├─ Extract process tree
   ├─ Detect agents (claude, cursor)
   ├─ Check session status
   └─ Create new session entries

REGISTRATION PHASE
├─ SessionMap.addSession()
│  ├─ Store in memory (_sessions map)
│  ├─ Persist to ~/.ccpoke/sessions.json
│  ├─ Emit 'session_started' event
│  └─ Return session object
│
└─ Listeners notified:
   ├─ TelegramChannel (optional notification)
   ├─ Logger (activity record)
   └─ ResponseStore (session context)

SYNCHRONIZATION PHASE (Periodic)
├─ TmuxScanner.scan() — Every 30 seconds
│  ├─ List live panes
│  ├─ For each registered session:
│  │  ├─ Check if pane exists
│  │  ├─ Get pane status
│  │  ├─ Update last_activity
│  │  └─ Mark as 'alive'
│  │
│  └─ For new panes:
│     ├─ Detect agent
│     ├─ Auto-register if agent detected
│     └─ Emit 'new_session'

CLEANUP PHASE
├─ Stale Detection
│  ├─ Session idle > 30 minutes
│  └─ Pane not found in tmux
│
└─ Prune:
   ├─ Remove from SessionMap
   ├─ Update persistence file
   ├─ Emit 'session_ended'
   └─ Optional: Notify Telegram

RESTART RECOVERY
├─ Bot startup:
│  ├─ Load ~/.ccpoke/sessions.json
│  ├─ Validate required fields (sessionId, tmuxTarget, project)
│  ├─ Validate date format (lastActivity timestamp)
│  ├─ Skip invalid entries (corrupted or malformed)
│  ├─ Populate SessionMap (memory)
│  ├─ Reconcile with live tmux
│  ├─ Mark lost sessions as 'stale'
│  └─ Resume monitoring
```

---

## Module Dependency Graph

```
index.ts (Entry Point)
  ├─ ConfigManager
  │  ├─ Paths utilities
  │  └─ Logger
  ├─ AgentHandler (Dispatcher)
  │  ├─ AgentRegistry
  │  │  ├─ ClaudeCodeProvider
  │  │  │  ├─ ClaudeCodeParser
  │  │  │  └─ ClaudeCodeInstaller
  │  │  ├─ CursorProvider
  │  │  │  ├─ CursorParser
  │  │  │  ├─ CursorInstaller
  │  │  │  └─ CursorStateReader
  │  │  ├─ CodexProvider
  │  │  │  ├─ CodexParser
  │  │  │  └─ CodexInstaller
  │  │  └─ GeminiCliProvider
  │  │     ├─ GeminiCliParser
  │  │     └─ GeminiCliInstaller
  │  ├─ SessionResolver
  │  │  └─ SessionMap
  │  └─ TelegramChannel (Observer)
  ├─ TelegramChannel (Initialization)
  │  ├─ TelegramSender
  │  ├─ PendingReplyStore
  │  ├─ PermissionRequestHandler
  │  ├─ AskQuestionHandler
  │  ├─ SessionResolver
  │  └─ ResponseStore
  ├─ ApiServer (Express)
  │  ├─ AgentHandler
  │  └─ Middleware (CORS, logging)
  ├─ SessionMonitor
  │  ├─ SessionMap
  │  └─ TmuxScanner
  │     ├─ TmuxBridge
  │     └─ InstallDetection
  └─ Graceful Shutdown
     ├─ TelegramChannel.close()
     ├─ ApiServer.close()
     └─ SessionMonitor.stop()
```

---

## Configuration & Persistence

### File Layout

```
~/.ccpoke/
├── config.json           # User configuration
│   ├─ telegram_bot_token
│   ├─ user_id
│   ├─ hook_port (default: 9377)
│   ├─ hook_secret
│   ├─ agents: ["claude-code", "cursor", "codex", "gemini-cli"]
│   └─ projects: {...}
│
├── state.json            # Chat state
│   ├─ chat_id
│   ├─ user_confirmed
│   └─ last_activity
│
├── sessions.json         # Active sessions (persist on restart)
│   └─ [{sessionId, tmuxTarget, agent, project, cwd, status, ...}]
│
├── responses/            # Response files (24h TTL, max 100)
│   └─ id.json
│
└── hooks/
    ├── claude-code-stop.sh
    ├── claude-code-session-start.sh
    ├── claude-code-permission-request.sh
    ├── claude-code-ask-user-question.sh
    ├── cursor-stop.sh
    ├── cursor-session-start.sh
    └── codex-stop.sh

~/.claude/
└── settings.json         # Claude Code settings (modified by setup)
    └─ hooks:
       ├─ Stop
       ├─ SessionStart
       ├─ PreToolUse (permission request)
       └─ ElicitationDialog (user input)

~/.cursor/
└── hooks.json            # Cursor hook config

~/.codex/
└── config.toml           # Codex CLI config (if used)
```

### Schema Migrations

ConfigManager detects structure changes and migrates:

```typescript
if (!config.hook_secret) {
  config.hook_secret = generateSecret();
  save();
}

if (oldFormat.port) {
  config.hook_port = oldFormat.port;  // Rename field
  delete oldFormat.port;
}
```

---

## Security Model

### Hook Secret

**Purpose:** Verify hook requests come from Claude Code on local machine.

**Mechanism:**
1. Setup script generates random 32-char secret
2. Store in `config.json` (local only, not committed)
3. Hook script reads from config
4. Hook request includes header: `X-CCPoke-Secret: {secret}`
5. Server validates before processing

**Security Properties:**
- ✅ Prevents external parties from triggering notifications
- ✅ Survives bot restart (persisted in config)
- ✅ Cannot be extracted from git (in .gitignore)
- ⚠️ Local machine security still required (don't expose port publicly)

### User Whitelist

**Purpose:** Only whitelisted Telegram users can send commands.

**Mechanism:**
1. `ALLOWED_USERS` env var or `config.json`
2. User ID checked before command processing
3. Non-whitelisted users: silent rejection

**Commands Protected:**
- `/start` — Register chat
- Message replies — Chat injection
- Inline buttons — Any action

### Loopback Binding

**Purpose:** Prevent internet exposure of hook endpoint.

**Configuration:**
```typescript
server.listen(9377, '127.0.0.1', () => {
  // Only accessible from localhost
});
```

**Access:**
- ✅ Local machine: `curl http://127.0.0.1:9377/`
- ❌ Remote: `curl http://your-machine:9377/` — fails

**Tunnel (Optional):**
Users can optionally expose via Cloudflare Tunnel:
```bash
cloudflared tunnel run
```

---

## Error Handling Strategy

### Failure Modes

| Component | Failure | Impact | Recovery |
|-----------|---------|--------|----------|
| **Hook secret mismatch** | Invalid request | Notification dropped | Log warning, continue |
| **Transcript parse fail** | NDJSON malformed | Content lost | Log error, send generic notification |
| **Telegram API error** | Network/API down | Message fails | Retry with exponential backoff |
| **tmux unavailable** | No tmux session | Can't inject | Skip session operations, log |
| **Config file missing** | ~/.ccpoke/config.json gone | Bot can't start | Prompt user to re-run setup |
| **Permission request injection failure** | tmux pane dead | Deny not sent | Log error, timeout after 30s |
| **Ask-question timeout** | User doesn't respond | TUI waiting | Timeout after 120s, auto-skip |
| **Project launch failure** | Invalid project path | Session can't start | Log error, skip project |

### Graceful Degradation

```typescript
// Hook parsing failure: send generic notification instead of crashing
try {
  const event = parseEvent(raw);
  // ... normal flow
} catch (error) {
  logger.error('Parse failed, sending generic notification', { error });
  channel.sendNotification({
    type: 'generic',
    content: 'Agent completed task (details unavailable)',
  });
}
```

---

## Scalability Considerations

### Memory Usage

**Expected:** < 100MB

**Breakdown:**
- SessionMap (in-memory): ~1KB per session × 10 sessions = 10KB
  - **Capped at 200 sessions** with LRU eviction
- Response cache: ~10KB per response × 100 responses = 1MB
- PendingReplyStore: ~1KB per pending reply × 10 = 10KB
  - **Auto-expires** after 10 minutes
  - **destroy()** called on shutdown for explicit cleanup
- Bot instance: ~50MB (Telegram library + Node.js)

**Resource Limits:**
- **SessionMap.MAX_SESSIONS = 200** — Prevents unbounded growth, evicts oldest inactive session when exceeded
- **PendingReplyStore TTL = 10 minutes** — Auto-cleanup, explicit destroy() on shutdown
- **Response cache cleanup** — Daily batch purge of expired responses

**Optimization:**
- SessionMap persists to disk (state survives restart)
- Atomic file writes prevent corruption on crash
- In-memory collections bounded by limits or TTL

### Throughput

**Expected:** 1-10 notifications/hour per session

**Bottleneck:** Telegram API (30 msg/sec limit)
- Solution: Batching, message editing for updates

### File Descriptor Limits

**Expected:** 10-20 open fds (Express server, Telegram polling, tmux)

**Platform Default:** 256-1024 (usually sufficient)

---

## Testing Architecture

### Unit Tests

```typescript
// Test agent parser in isolation
describe('ClaudeCodeParser', () => {
  it('extracts response from NDJSON', () => {
    const parser = new ClaudeCodeParser();
    const result = parser.parse(testTranscript);
    expect(result).toMatchObject({ type: 'response', content: '...' });
  });
});
```

### Integration Tests

```typescript
// Test hook → notification flow
describe('Hook Integration', () => {
  it('converts hook event to Telegram notification', async () => {
    const mockChannel = mock(NotificationChannel);
    const handler = new AgentHandler(registry, mockChannel);
    await handler.handleHookEvent(hookPayload);
    expect(mockChannel.sendNotification).toHaveBeenCalled();
  });
});
```

### E2E Tests (Manual)

1. Start bot: `pnpm dev`
2. Run agent in tmux → trigger response → verify Telegram notification
3. Test message reply injection via Chat button

---

## Related

- [Codebase Summary](./codebase-summary.md) — Module structure and files
- [Code Standards](./code-standards.md) — Implementation patterns
- [Project Overview](./project-overview-pdr.md) — Vision and requirements
- [CLI Commands](./commands.md) — User-facing commands
