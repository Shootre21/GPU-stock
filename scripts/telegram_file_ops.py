#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def have_module(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


def extract_text_txt(path: Path) -> str:
    return path.read_text(errors="replace")


def extract_text_pdf_native(path: Path) -> str:
    try:
        out = subprocess.run([
            "python3", "-c",
            (
                "from pathlib import Path\n"
                "import sys\n"
                "try:\n"
                "    from pypdf import PdfReader\n"
                "except Exception:\n"
                "    from PyPDF2 import PdfReader\n"
                "r=PdfReader(sys.argv[1])\n"
                "parts=[]\n"
                "for p in r.pages:\n"
                "    parts.append(p.extract_text() or '')\n"
                "print('\\n'.join(parts))\n"
            ),
            str(path)
        ], capture_output=True, text=True, timeout=120)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout
    except Exception:
        pass
    return ""


def extract_text_image_ocr(path: Path) -> str:
    if not shutil_which("tesseract"):
        return ""
    try:
        out = subprocess.run(["tesseract", str(path), "stdout"], capture_output=True, text=True, timeout=120)
        if out.returncode == 0:
            return out.stdout
    except Exception:
        pass
    return ""


def extract_text_pdf_ocr(path: Path) -> str:
    if not shutil_which("tesseract"):
        return ""
    if not (have_module("pypdfium2") and have_module("PIL")):
        return ""
    code = r'''
import sys, tempfile, os
import pypdfium2 as pdfium
from PIL import Image
import subprocess
pdf = pdfium.PdfDocument(sys.argv[1])
out=[]
for i, page in enumerate(pdf):
    bmp = page.render(scale=2)
    img = bmp.to_pil()
    fd, p = tempfile.mkstemp(suffix='.png')
    os.close(fd)
    img.save(p)
    r = subprocess.run(['tesseract', p, 'stdout'], capture_output=True, text=True)
    if r.returncode == 0:
        out.append(r.stdout)
    try:
        os.remove(p)
    except Exception:
        pass
print('\n'.join(out))
'''
    try:
        out = subprocess.run(["python3", "-c", code, str(path)], capture_output=True, text=True, timeout=300)
        if out.returncode == 0:
            return out.stdout
    except Exception:
        pass
    return ""


def summarize_text(text: str, max_chars: int = 2000) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[:max_chars].rsplit(" ", 1)[0] + " …"


def detect_kind(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in {".txt", ".md", ".csv", ".json", ".log", ".py", ".js", ".ts", ".html", ".css"}:
        return "text"
    if ext == ".pdf":
        return "pdf"
    if ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}:
        return "image"
    return "unknown"


def shutil_which(cmd: str):
    from shutil import which
    return which(cmd)


def main():
    ap = argparse.ArgumentParser(description="Extract text from files for Telegram workflows")
    ap.add_argument("path", help="file path")
    ap.add_argument("--mode", choices=["extract", "summarize"], default="extract")
    ap.add_argument("--json", action="store_true", dest="as_json")
    args = ap.parse_args()

    path = Path(args.path).expanduser().resolve()
    if not path.exists() or not path.is_file():
        print(json.dumps({"ok": False, "error": f"file not found: {path}"}) if args.as_json else f"file not found: {path}")
        sys.exit(1)

    kind = detect_kind(path)
    text = ""
    method = ""

    if kind == "text":
        text = extract_text_txt(path)
        method = "plain-read"
    elif kind == "pdf":
        text = extract_text_pdf_native(path)
        method = "pdf-native" if text.strip() else ""
        if not text.strip():
            text = extract_text_pdf_ocr(path)
            method = "pdf-ocr" if text.strip() else ""
    elif kind == "image":
        text = extract_text_image_ocr(path)
        method = "image-ocr" if text.strip() else ""

    if not text.strip():
        msg = {
            "ok": False,
            "kind": kind,
            "error": "no extractable text found; OCR dependencies may be missing for scanned/image files"
        }
        print(json.dumps(msg, indent=2) if args.as_json else msg["error"])
        sys.exit(2)

    output = summarize_text(text) if args.mode == "summarize" else text.strip()
    result = {"ok": True, "kind": kind, "method": method, "chars": len(output), "text": output}
    print(json.dumps(result, indent=2) if args.as_json else output)


if __name__ == "__main__":
    main()
