# Telegram Automation Plan

## Goal
Turn the existing OpenClaw Telegram bot into a practical owner-scoped remote assistant for:
1. file-to-text
2. voice replies
3. reminders/cron
4. service/security alerts
5. remote file fetch

## Current state
- Telegram transport is already live via OpenClaw.
- Bot: `@Larry234bot`
- Channel mode: polling
- DM policy: `pairing`
- Group policy: `allowlist`
- Mention gating in groups: enabled

## Architecture

### Layer 1 — OpenClaw routing
OpenClaw already handles:
- inbound Telegram messages
- replies back to Telegram
- pairing / allowlisting / mention gating
- cron delivery to chat surfaces

This should remain the control plane.

### Layer 2 — Local helper scripts
Add small local scripts for deterministic actions:
- `telegram_send_file.py` for outbound file delivery
- `telegram_file_ops.py` for extracting text / OCR / summaries
- `telegram_remote_fetch.py` for safe allowlisted file fetches
- optional future `telegram_voice_reply.py` for text -> Telegram voice note

### Layer 3 — Safety policy
- keep Telegram owner-scoped
- use explicit allowlisted folders only
- no destructive file ops by default
- no arbitrary shell exposed through Telegram
- prefer read/extract/send workflows

### Layer 4 — Automation
- cron jobs for reminders and health nudges
- future service checks can announce into Telegram directly

## MVP implementation

### Included now
- architecture doc
- config file for allowed fetch roots
- file/text extraction helper with graceful fallback
- remote fetch helper using allowlisted folders
- vendored Telegram send-file script

### Deferred until dependencies are installed
- OCR for scanned PDFs/images (`tesseract`, `pytesseract`, `pypdfium2`, `Pillow`)
- natural voice replies (`ffmpeg`, TTS provider/sdk)
- fully automated Telegram-native command parsing loop

## Recommended next config hardening
For a single-owner setup, switch from `pairing` to `allowlist` after confirming your Telegram user ID.

Recommended target:
```json5
channels: {
  telegram: {
    enabled: true,
    dmPolicy: "allowlist",
    allowFrom: ["<YOUR_TELEGRAM_USER_ID>"],
    groupPolicy: "allowlist",
    groups: { "*": { requireMention: true } }
  }
}
```

## Suggested operator phrases
- "extract text"
- "summarize this"
- "send latest from downloads"
- "send latest pdf from scans"
- "remind me in 30 minutes to check the server"

## Dependency install plan
### For file send
- `python-telegram-bot>=20`

### For OCR
- `tesseract-ocr`
- `python3-pip`
- `pypdfium2`
- `pytesseract`
- `Pillow`

### For voice
- `ffmpeg`
- either `edge-tts` or provider SDK

