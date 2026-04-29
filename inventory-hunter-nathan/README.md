# Inventory Hunter - Nathan Package

This package wraps the upstream `inventory-hunter` project into a simpler local deployment layout for Nathan's GPU tracking use case.

## What this package is for

- Track known GPU product URLs
- Filter by max price
- Send alerts by email and/or other supported channels
- Run cleanly via Docker

## Included here

- `config/rtx-3090.yaml` — RTX 3090 starter config
- `config/rtx-4080.yaml` — RTX 4080 starter config
- `config/rtx-4090.yaml` — RTX 4090 starter config
- `config/rtx-5080.yaml` — RTX 5080 starter config
- `config/rtx-5090.yaml` — RTX 5090 starter config
- `config/README.md` — notes on the per-model layout
- `config/alerters.yaml.example` — starter alerter config template
- `scripts/run-inventory-hunter.sh` — helper to run with mounted configs

## Current recommendation

Use this platform as a **known-product URL tracker**, not a broad automatic discovery engine.

## How to use

1. Pick one model config in `config/` and replace the placeholder URLs with real product URLs you care about.
2. Update `scripts/run-inventory-hunter.sh` if you want it to point at a different model config than the default.
3. Fill in `config/alerters.yaml` if needed.
4. Run:

```bash
./scripts/run-inventory-hunter.sh
```

## Notes

- Upstream repo cloned locally at: `../inventory-hunter-upstream`
- This wrapper uses the upstream Docker image unless you choose to build your own fork later.
