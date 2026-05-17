#!/usr/bin/env python3
import argparse
import json
import os
import sys
from pathlib import Path

CONFIG_PATH = Path(__file__).with_name("telegram-allowed-paths.json")


def load_config():
    return json.loads(CONFIG_PATH.read_text())


def resolve_root(name_or_path: str, cfg: dict) -> Path:
    aliases = cfg.get("aliases", {})
    raw = aliases.get(name_or_path, name_or_path)
    return Path(raw).expanduser().resolve()


def is_within(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except Exception:
        return False


def allowed(path: Path, cfg: dict) -> bool:
    roots = [Path(p).expanduser().resolve() for p in cfg.get("allowedRoots", [])]
    return any(is_within(path, root) or path == root for root in roots)


def latest_file(root: Path, pattern: str = "*") -> Path | None:
    candidates = [p for p in root.rglob(pattern) if p.is_file()]
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def main():
    ap = argparse.ArgumentParser(description="Safe allowlisted remote file fetch helper")
    ap.add_argument("root", help="alias or path within allowlist")
    ap.add_argument("--pattern", default="*", help="glob pattern, e.g. '*.pdf'")
    ap.add_argument("--json", action="store_true", dest="as_json")
    args = ap.parse_args()

    cfg = load_config()
    root = resolve_root(args.root, cfg)

    if not root.exists():
        msg = {"ok": False, "error": f"root does not exist: {root}"}
        print(json.dumps(msg, indent=2) if args.as_json else msg["error"])
        sys.exit(1)

    if not allowed(root, cfg):
        msg = {"ok": False, "error": f"path not allowlisted: {root}"}
        print(json.dumps(msg, indent=2) if args.as_json else msg["error"])
        sys.exit(2)

    found = latest_file(root, args.pattern)
    if not found:
        msg = {"ok": False, "error": f"no file found in {root} matching {args.pattern}"}
        print(json.dumps(msg, indent=2) if args.as_json else msg["error"])
        sys.exit(3)

    msg = {
        "ok": True,
        "path": str(found),
        "size": found.stat().st_size,
        "mtime": int(found.stat().st_mtime)
    }
    print(json.dumps(msg, indent=2) if args.as_json else str(found))


if __name__ == "__main__":
    main()
