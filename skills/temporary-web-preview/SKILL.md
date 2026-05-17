---
name: temporary-web-preview
description: Create short-lived public previews for test HTML pages, static sites, and lightweight Docker apps. Use when the user wants a temporary public link for a generated page, prototype, or containerized demo, especially for remote review from chat or Telegram.
---

# temporary-web-preview

Use this skill to turn a local page or app into a temporary preview link.

## Preferred exposure order

1. Tailscale Funnel for public HTTPS when available and explicitly allowed.
2. Tailscale Serve for tailnet-only previews when public access is not required.
3. Existing VPS or reverse-proxy route already present on the machine.
4. Localhost-only preview if no safe public path exists.

## App types

- Static HTML/CSS/JS page
- Small Node or Python preview server
- Dockerized single-container app
- Existing service bound to a local port

## Workflow

1. Build or locate the app.
2. Pick a local port that does not conflict.
3. Start the preview process.
4. Verify local access.
5. Expose it using the safest available method.
6. Return the exact URL.
7. Optionally schedule cleanup.

## Safety rules

- Do not expose the OpenClaw Control UI or gateway port.
- Do not expose unrelated existing services just because they are listening.
- Prefer a dedicated temporary port for new previews.
- If the preview contains secrets, private files, or admin features, do not make it public.
- For Docker previews, prefer single-purpose containers and explicit port mapping.

## Tailscale notes

- Public links require Funnel, not just Serve.
- Funnel should be used only for intentionally public test content.
- Tailnet-only previews are often enough for the user if they are on their own devices.

## Response format

Return:
- local port
- preview type
- exposure method
- public or tailnet URL
- cleanup recommendation
