# GPU Config Layout

Use one config per GPU model.

Included starter files:
- `rtx-3090.yaml`
- `rtx-4080.yaml`
- `rtx-4090.yaml`
- `rtx-5080.yaml`
- `rtx-5090.yaml`

## Why this layout

This is easier to maintain than one giant mixed file because:
- each model can have its own max price
- each model can have its own target URLs
- you can run one model at a time if needed

## Recommended workflow

1. Replace placeholder URLs with real product URLs.
2. Run one config first to validate alerting.
3. Add more models after the first config works.
