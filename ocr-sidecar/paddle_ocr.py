#!/usr/bin/env python3
"""PaddleOCR sidecar for Financial Encoder.

Reads an image or PDF, runs PaddleOCR (PP-OCR) and writes a JSON result to the
path passed via ``--output``. Standard output is never used for the result, so
library logging can not corrupt it.

The runtime is fully offline: models are expected under the PaddleX cache home
passed via ``--models`` and the remote model-source check is disabled.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback


def _configure_environment(models_dir: str | None) -> None:
    # PaddlePaddle 3.x can raise a PIR/oneDNN error on some CPUs; disabling
    # oneDNN is the documented workaround and only costs a little speed.
    os.environ.setdefault("FLAGS_use_mkldnn", "0")
    # Never contact the model host (offline requirement).
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    os.environ.setdefault("GLOG_minloglevel", "2")
    if models_dir:
        os.environ["PADDLE_PDX_CACHE_HOME"] = models_dir


def _box_to_rect(box) -> tuple[float, float, float, float]:
    import numpy as np

    arr = np.asarray(box, dtype=float)
    if arr.ndim == 2 and arr.shape[1] == 2:
        xs = arr[:, 0]
        ys = arr[:, 1]
        return float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())
    flat = arr.reshape(-1)
    return float(flat[0]), float(flat[1]), float(flat[2]), float(flat[3])


def _group_lines(texts, scores, boxes) -> list[dict]:
    items: list[dict] = []
    for index, text in enumerate(texts):
        if not text:
            continue
        score = float(scores[index]) if index < len(scores) else 0.0
        x1, y1, x2, y2 = _box_to_rect(boxes[index])
        items.append({"text": str(text), "score": score, "x1": x1, "cy": (y1 + y2) / 2.0, "h": max(1.0, y2 - y1)})

    items.sort(key=lambda item: (item["cy"], item["x1"]))

    lines: list[dict] = []
    for item in items:
        for line in lines:
            tolerance = max(6.0, 0.6 * min(line["h"], item["h"]))
            if abs(line["cy"] - item["cy"]) <= tolerance:
                count = line["count"] + 1
                line["cy"] += (item["cy"] - line["cy"]) / count
                line["h"] = max(line["h"], item["h"])
                line["count"] = count
                line["items"].append(item)
                break
        else:
            lines.append({"cy": item["cy"], "h": item["h"], "count": 1, "items": [item]})

    lines.sort(key=lambda line: line["cy"])

    grouped: list[dict] = []
    for line in lines:
        parts = sorted(line["items"], key=lambda item: item["x1"])
        text = " ".join(part["text"] for part in parts if part["text"]).strip()
        if not text:
            continue
        average = sum(part["score"] for part in parts) / len(parts)
        grouped.append({"text": text, "score": average})
    return grouped


def _iter_page_images(input_path: str, dpi: int):
    if input_path.lower().endswith(".pdf"):
        import fitz  # PyMuPDF
        import numpy as np

        document = fitz.open(input_path)
        try:
            for page in document:
                pixmap = page.get_pixmap(dpi=dpi)
                image = np.frombuffer(pixmap.samples, dtype=np.uint8)
                image = image.reshape(pixmap.height, pixmap.width, pixmap.n)
                if pixmap.n == 4:
                    image = image[:, :, :3]
                yield image
        finally:
            document.close()
    else:
        yield input_path


def main() -> int:
    parser = argparse.ArgumentParser(description="PaddleOCR sidecar for Financial Encoder")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--lang", default="en")
    parser.add_argument("--models", default=None)
    parser.add_argument("--dpi", type=int, default=200)
    args = parser.parse_args()

    _configure_environment(args.models)

    result: dict = {"engine": "paddleocr", "lang": args.lang, "pages": 0, "lines": [], "text": ""}
    status = 0
    try:
        from paddleocr import PaddleOCR

        ocr = PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            lang=args.lang,
            enable_mkldnn=False,
        )

        lines: list[dict] = []
        pages = 0
        for image in _iter_page_images(args.input, args.dpi):
            pages += 1
            for page_result in ocr.predict(image):
                texts = page_result.get("rec_texts") or []
                scores = page_result.get("rec_scores") or []
                boxes = page_result.get("rec_boxes")
                if boxes is None:
                    boxes = page_result.get("rec_polys") or []
                lines.extend(_group_lines(texts, scores, boxes))

        result["pages"] = pages
        result["lines"] = lines
        result["text"] = "\n".join(line["text"] for line in lines)
        result["average_score"] = sum(line["score"] for line in lines) / len(lines) if lines else 0.0
    except Exception as exc:  # noqa: BLE001 - any failure must be reported to Electron
        result["error"] = f"{type(exc).__name__}: {exc}"
        result["traceback"] = traceback.format_exc()
        status = 1

    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False)
    return status


if __name__ == "__main__":
    sys.exit(main())
