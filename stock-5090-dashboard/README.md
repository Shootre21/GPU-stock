# 5090 Stock Dashboard v1

Deterministic stock watcher for RTX 5090 listings using APIs/parsing and sound alerts.

Planned v1 features:
- multi-store polling
- normalize listings
- price filter ($1500-$2500)
- in-stock transition detection
- dashboard UI
- sound hooks for new qualifying stock

## Sound files

Place your custom sounds in:

- `sounds/bruh.mp3`
- `sounds/fahhhh.mp3`

Sound paths are configured in `config.json`.

## Docker

Build and run directly:

```bash
docker build -t stock-5090-dashboard .
docker run --rm -p 4388:4388 -v $(pwd)/data:/app/data stock-5090-dashboard
```

Or use compose:

```bash
docker compose up --build
```
