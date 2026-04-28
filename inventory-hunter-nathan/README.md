# Inventory Hunter - Nathan Package

This package wraps the upstream `inventory-hunter` project into a simpler local deployment layout for Nathan's GPU tracking use case.

## What this package is for

- Track known GPU product URLs
- Filter by max price
- Send alerts by email and/or other supported channels
- Run cleanly via Docker

## Included here

- `config/gpu-watch.yaml` — starter multi-GPU config
- `config/alerters.yaml.example` — starter alerter config template
- `scripts/run-inventory-hunter.sh` — helper to run with mounted configs

## Current recommendation

Use this platform as a **known-product URL tracker**, not a broad automatic discovery engine.

## How to use

1. Fill in `config/gpu-watch.yaml` with real product URLs you care about.
2. Copy `config/alerters.yaml.example` to `config/alerters.yaml` and fill in your alert settings.
3. Run:

```bash
./scripts/run-inventory-hunter.sh
```

## Notes

- Upstream repo cloned locally at: `../inventory-hunter-upstream`
- This wrapper uses the upstream Docker image unless you choose to build your own fork later.
