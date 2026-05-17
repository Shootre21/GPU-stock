---
name: telegram-file-assistant
description: Handle Telegram-driven remote file workflows safely. Use when the user sends or references files over Telegram and wants to download, inspect, OCR, edit, convert, summarize, or send files back. Also use when setting up a secure owner-only Telegram workflow for remote access to selected files, PDFs, images, and voice responses.
---

# telegram-file-assistant

Use this skill for owner-driven remote file operations over Telegram.

## Goals

- Accept files or file references received from Telegram.
- Determine likely file type and next action.
- Prefer reversible, scoped edits.
- Return artifacts back through Telegram when possible.
- Keep access narrow: owner-only, selected folders only, destructive actions gated.

## Workflow

1. Confirm the request scope.
   - If the user asks for broad filesystem access, narrow it to named folders first.
   - Prefer workspace paths and explicitly approved directories.

2. Inspect the inbound artifact.
   - Identify whether it is PDF, image, text, archive, or unknown.
   - For PDFs, prefer native PDF analysis first.
   - For scanned PDFs or images, use OCR-capable tools or skills.

3. Choose the smallest useful action.
   - Summarize, extract text, rename, convert, annotate, or edit.
   - Avoid destructive transforms unless explicitly requested.

4. Return the result.
   - Send back the modified file, extracted text, or a concise summary.
   - If voice delivery is requested, produce a TTS artifact in addition to text.

## Safety rules

- Treat Telegram as remote control, not unrestricted shell access.
- Restrict owner automation to allowlisted Telegram user IDs.
- Prefer folder allowlists over whole-home access.
- Ask before deletion, overwrite, mass moves, or external uploads.
- If a request implies secrets exposure, pause and clarify.

## Recommended companion capabilities

- `nano-pdf` for simple PDF edits.
- OCR skill or plugin for scanned PDFs/images.
- TTS for spoken summaries or readbacks.

## Common patterns

- "Summarize this PDF and send me a voice version."
- "Extract text from this photographed receipt."
- "Edit page 2 of this PDF and send it back."
- "Find the latest file in a specific folder and send it to me on Telegram."

## Notes

- If Telegram config is not owner-locked, recommend tightening DM access before enabling file automation.
- If exact file-send primitives are unavailable in-tool, use the best supported OpenClaw channel action path instead of inventing one.
