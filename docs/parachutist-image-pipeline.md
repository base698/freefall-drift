# Parachutist Back-Issue Image Pipeline

Goal: build a reproducible pipeline for turning old *Parachutist* HTML5 back issues into structured fatality-summary data for the freefall simulator.

## Source shape

Modern article pages often expose text directly, but older back issues are rendered magazine pages. Example:

```text
https://parachutist.com/portals/parachutist/parachutist/archives/August-2001/HTML5/index.html
```

The browser can render the issue visually. Page images are also directly fetchable as JPEGs:

```text
.../HTML5/m/1.jpg   # full rendered page image
.../HTML5/s/1.jpg   # thumbnail
```

For the August 2001 example, probing `m/{page}.jpg` yields 108 full-page images.

## Storage location

Large downloaded issue images should not live in git. Save them on Synology backup storage:

```text
/mnt/synology-backup/parachutist/<Issue-Slug>/
```

Each issue directory contains:

```text
pages/page-001.jpg      # full rendered page image
thumbs/page-001.jpg     # thumbnail image
manifest.json           # machine-readable page manifest
manifest.csv            # page/url/path listing
```

## Scrape images

From this repo:

```bash
python3 scripts/scrape_parachutist_images.py \
  https://parachutist.com/portals/parachutist/parachutist/archives/August-2001/HTML5/index.html \
  --out-root /mnt/synology-backup/parachutist
```

The scraper probes `m/1.jpg`, `m/2.jpg`, ... until the server stops returning image content. This is more reliable than parsing the old HTML5 flipbook JavaScript, which does not expose clean text metadata.

## Find fatality-summary pages

1. Download issue images.
2. Make a quick contact sheet or inspect thumbnails to find pages with tables/headings such as:
   - `Fatality Summary`
   - `Fatalities by Category`
   - `Landing Problems`
   - `Malfunction`
   - `No Pull`
   - `Canopy Collision`
3. Extract candidate pages with OCR or manual vision review.
4. Enter parsed annual data into `data/uspa-fatality-summary-*.csv` with explicit source page references.

## OCR / extraction notes

Preferred extraction order:

1. If the issue has a modern article URL, use `web_extract` first.
2. If only rendered magazine images are available, use page images from `pages/`.
3. OCR candidate pages rather than every issue page when possible.
4. Preserve the source page image path and page number for every extracted table row.

Potential OCR commands:

```bash
# If tesseract is installed
 tesseract /mnt/synology-backup/parachutist/August-2001/pages/page-042.jpg stdout

# Or use a higher-quality OCR/model pipeline if needed for tables.
```

## Structured data target

Fatality summary rows should include:

```csv
year,total_fatalities,landing,intentional_low_turn,unintentional_low_turn,non_turn_landing,medical,incorrect_emergency_procedures,equipment_problem,malfunction,no_pull_or_low_pull,low_deployment,canopy_collision,freefall_collision,reserve_problem,cutaway_low_or_no_reserve,other,notes,source_url,source_page_image
```

Notes:

- Mark partially parsed years explicitly.
- Do not silently infer subcategories unless the article/table states them or the arithmetic is documented in `notes`.
- The fast-faller / exit-order concern starts around 2004, so the ideal source range is 2004 onward, with 1999–2003 useful for baseline context when available.
