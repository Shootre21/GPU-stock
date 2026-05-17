---
name: humanlike-voice-replies
description: Create natural text-to-speech reply workflows with humanlike delivery. Use when the user asks for voice replies, spoken summaries, expressive narration, Telegram audio responses, or better text-to-speech setup using ElevenLabs, OpenAI, or Microsoft voices.
---

# humanlike-voice-replies

Use this skill for natural spoken responses.

## Goals

- Produce clear, humanlike voice replies.
- Match tone to context: calm, warm, funny, dramatic, concise.
- Prefer short spoken summaries over dumping long text into audio.

## Provider preference

1. ElevenLabs when available for most humanlike delivery.
2. OpenAI for simple built-in TTS.
3. Microsoft as a no-key fallback.

## Voice workflow

1. Decide whether audio is actually useful.
   - Good for summaries, explanations, storytime, reminders, hands-free use.
   - Bad for dense tables, code, or long URLs.

2. Condense before speaking.
   - Rewrite for ears, not eyes.
   - Short sentences.
   - Fewer parentheses.
   - Natural pauses.

3. Generate audio.
   - Prefer a named voice or configured default.
   - If using ElevenLabs v3-style prompting, include light expressive cues only when they help.

4. Deliver both when useful.
   - Send the audio plus a short text summary.

## Style rules

- Avoid reading markdown literally.
- Expand abbreviations when helpful.
- Replace URLs with descriptions unless the exact URL matters.
- Keep voice replies usually under 60 to 90 seconds unless the user wants more.

## Telegram usage

- Favor voice-note style output when the channel supports it.
- If a file attachment works better than a voice note, say so briefly.
