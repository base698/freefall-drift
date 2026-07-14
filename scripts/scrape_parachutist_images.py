#!/usr/bin/env python3
"""Download page-render images from Parachutist HTML5 back issues.

Example:
  python3 scripts/scrape_parachutist_images.py \
    https://parachutist.com/portals/parachutist/parachutist/archives/August-2001/HTML5/index.html \
    --out-root /mnt/synology-backup/parachutist
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests


@dataclass
class PageImage:
    page: int
    url: str
    path: str
    bytes: int
    content_type: str


def issue_slug(index_url: str) -> str:
    match = re.search(r"/archives/([^/]+)/HTML5/index\.html", index_url)
    if match:
        return match.group(1)
    parsed = urlparse(index_url)
    parts = [part for part in parsed.path.split("/") if part]
    return parts[-3] if len(parts) >= 3 else "parachutist-issue"


def download_issue(index_url: str, out_root: Path, delay_s: float = 0.05, max_pages: int = 300) -> dict:
    if not index_url.endswith("/"):
        base_url = index_url.rsplit("/", 1)[0] + "/"
    else:
        base_url = index_url
    slug = issue_slug(index_url)
    issue_dir = out_root / slug
    pages_dir = issue_dir / "pages"
    thumbs_dir = issue_dir / "thumbs"
    pages_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({"User-Agent": "Hermes freefall-drift research scraper (+https://github.com/base698/freefall-drift)"})

    page_images: list[PageImage] = []
    thumbnail_images: list[PageImage] = []
    consecutive_misses = 0
    for page in range(1, max_pages + 1):
        page_url = urljoin(base_url, f"m/{page}.jpg")
        response = session.get(page_url, timeout=30)
        content_type = response.headers.get("content-type", "")
        if response.status_code != 200 or not content_type.startswith("image/"):
            consecutive_misses += 1
            if consecutive_misses >= 3:
                break
            continue
        consecutive_misses = 0
        page_path = pages_dir / f"page-{page:03d}.jpg"
        page_path.write_bytes(response.content)
        page_images.append(PageImage(page, page_url, str(page_path), len(response.content), content_type))

        thumb_url = urljoin(base_url, f"s/{page}.jpg")
        thumb_response = session.get(thumb_url, timeout=30)
        thumb_type = thumb_response.headers.get("content-type", "")
        if thumb_response.status_code == 200 and thumb_type.startswith("image/"):
            thumb_path = thumbs_dir / f"page-{page:03d}.jpg"
            thumb_path.write_bytes(thumb_response.content)
            thumbnail_images.append(PageImage(page, thumb_url, str(thumb_path), len(thumb_response.content), thumb_type))
        time.sleep(delay_s)

    manifest = {
        "source_index_url": index_url,
        "base_url": base_url,
        "issue_slug": slug,
        "issue_dir": str(issue_dir),
        "page_count": len(page_images),
        "pages": [asdict(image) for image in page_images],
        "thumbnails": [asdict(image) for image in thumbnail_images],
    }
    (issue_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    with (issue_dir / "manifest.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["page", "url", "path", "bytes", "content_type"])
        writer.writeheader()
        writer.writerows(asdict(image) for image in page_images)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("index_url", help="Parachutist HTML5 index URL")
    parser.add_argument("--out-root", default="/mnt/synology-backup/parachutist", help="Root directory for downloaded issues")
    parser.add_argument("--delay-s", type=float, default=0.05)
    parser.add_argument("--max-pages", type=int, default=300)
    args = parser.parse_args()

    manifest = download_issue(args.index_url, Path(args.out_root), args.delay_s, args.max_pages)
    print(json.dumps({
        "issue_slug": manifest["issue_slug"],
        "issue_dir": manifest["issue_dir"],
        "page_count": manifest["page_count"],
        "manifest": str(Path(manifest["issue_dir"]) / "manifest.json"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
