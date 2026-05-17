---
name: telegram-preview-helper
description: Send generated HTML pages, static demos, and lightweight Docker previews back to the user through Telegram-friendly flows. Use when a temporary test site should be built, exposed briefly, and delivered as a link for mobile review.
---

# telegram-preview-helper

Use this skill when the user wants a preview link from Telegram.

## Workflow

1. Build the page or demo.
2. Start it on a dedicated temporary port.
3. Verify locally.
4. Expose via the safest available method.
   - Tailscale Serve for private preview
   - Tailscale Funnel for public preview
   - fallback local-only if exposure is unavailable
5. Return the link to the user.
6. Offer cleanup or auto-expiry.

## Good fits

- one-page HTML mockups
- landing page prototypes
- tiny static sites
- dockerized single-page demos

## Avoid

- exposing the OpenClaw dashboard
- reusing unrelated service ports
- making secret-bearing apps public
