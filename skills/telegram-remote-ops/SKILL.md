---
name: telegram-remote-ops
description: Coordinate Telegram as a remote-control surface for files, previews, OCR, PDFs, and voice replies. Use when the user is away from their computer and wants Telegram-first workflows such as retrieving files, editing documents, generating temporary preview links, extracting text from images or scans, or getting voice read-backs.
---

# telegram-remote-ops

Use this skill as the umbrella workflow for Telegram-first operations.

## Use cases

- "Send me that file from my machine"
- "Edit this PDF and send it back"
- "Read this image or scanned document"
- "Spin up a temp preview link for this test page"
- "Reply with a voice message"

## Compose the right sub-workflow

- File send/receive/edit -> `telegram-file-assistant`
- Temporary public or tailnet preview -> `temporary-web-preview`
- Spoken response -> `humanlike-voice-replies`
- Scanned documents or photo text -> OCR-capable installed skill or plugin
- Large code or app generation -> `modular-coding-architect` for structure guidance

## Operating rules

1. Keep Telegram owner-scoped.
2. Use narrow folder scope for file access.
3. Prefer reversible edits and temp artifacts.
4. Do not expose unrelated local services when creating preview links.
5. For public temp links, ensure the content is intentionally shareable.

## Standard outputs

Return one of:
- a file
- a preview URL
- extracted text
- a concise summary
- an audio reply

## If tooling is missing

- Prefer installing one focused skill over several overlapping ones.
- Prefer local custom skills when OpenClaw built-ins already cover most of the path.
