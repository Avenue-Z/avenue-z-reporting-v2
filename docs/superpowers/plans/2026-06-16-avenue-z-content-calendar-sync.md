# Avenue Z Content Calendar Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scheduled Python job that pulls Avenue Z's published blog posts from the WordPress REST API and writes them (in the Renaissance 17-column format, **sorted chronologically by publish date**) to the first tab of the Avenue Z content-calendar Google Sheet, so the reporting dashboard's Content Impact Tracker reads them.

**Architecture:** Standalone Python repo mirroring the `monthly-report-agent` pattern (service-account auth, Cloud Run Job + Cloud Scheduler). Pure functions (`mapping`, `merge`, post filtering) are separated from I/O (`wp_reader` network, `sheets_writer` Google API) so the core logic is unit-tested without network access. The job is idempotent: each run reads the sheet, rebuilds the full data region from the live post list **sorted by publish date (oldest→newest)**, keyed by post URL — carrying over any human-filled strategy cells — and rewrites the tab. Because Avenue Z's sheet is machine-generated (no human-maintained calendar), a full date-sorted rewrite keeps posts perfectly ordered by date every run rather than letting new posts pile up at the bottom.

**Tech Stack:** Python 3.11, `requests`, `google-api-python-client`, `google-auth`, `pytest`. Deployed as a Cloud Run Job triggered by Cloud Scheduler (cron `0 9 */2 * *`, every other day).

**Spec:** `docs/superpowers/specs/2026-06-16-avenue-z-content-calendar-sync-design.md`

**Repo location (new, standalone):** `~/Desktop/avenuez-agents/content-calendar-sync/` (sibling of `monthly-report-agent`). All paths below are relative to that directory unless stated otherwise.

**Key facts (verified):**
- The dashboard parser reads `A1:Z1000` of the **first (leftmost) tab** → blog rows go in the first tab.
- Renaissance header `"Proposed Page Slug (or Live URL When Published)"` is the URL column the parser reads.
- `Content Type = "New Blog"` → derives Content Action `new`; `Status = "Published"` + a URL → match status `matched`.
- Target sheet: `1-Ar5vGXLWHnO3qtbymFVsgGD6kpJxCZvGWUSK5NngyQ` (SA `automation-agent@vertex-api-test-495415` has Editor).
- The Sheets API alone suffices (sheet pre-exists and is shared directly with the SA); no Drive API / `supportsAllDrives` needed.

---

## File Structure

- `requirements.txt` — dependencies
- `.gitignore` — ignore `google-credentials.json`, venv, `__pycache__`
- `config.py` — constants (URLs, sheet id, scopes, header, column indices, cron)
- `wp_reader.py` — `filter_blog_posts()` (pure) + `fetch_blog_posts()` (network)
- `mapping.py` — `hyperlink_formula()`, `post_to_row()` (pure)
- `merge.py` — `existing_strategy_by_url()`, `build_sheet_rows()` (pure, date-sorted)
- `sheets_writer.py` — SA auth, read first tab, write data region (Google API)
- `sync.py` — CLI entry point orchestrating the run (`--dry-run` supported)
- `cloud_run_entrypoint.py` — decode base64 SA creds env → file, then run `sync.py`
- `Dockerfile`, `deploy.sh`, `.env.template`, `README.md`
- `tests/test_mapping.py`, `tests/test_merge.py`, `tests/test_wp_reader.py`

---

### Task 1: Scaffold the repo

**Files:**
- Create: `~/Desktop/avenuez-agents/content-calendar-sync/requirements.txt`
- Create: `~/Desktop/avenuez-agents/content-calendar-sync/.gitignore`

- [ ] **Step 1: Create the directory and init git**

```bash
mkdir -p ~/Desktop/avenuez-agents/content-calendar-sync/tests
cd ~/Desktop/avenuez-agents/content-calendar-sync
git init -q
```

- [ ] **Step 2: Write `requirements.txt`**

```
requests==2.32.3
google-api-python-client==2.149.0
google-auth==2.35.0
pytest==8.3.3
```

- [ ] **Step 3: Write `.gitignore`**

```
google-credentials.json
.env
venv/
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 4: Create venv and install**

Run:
```bash
cd ~/Desktop/avenuez-agents/content-calendar-sync
python3 -m venv venv && ./venv/bin/pip install -q -r requirements.txt
```
Expected: installs without error.

- [ ] **Step 5: Commit**

```bash
git add requirements.txt .gitignore
git commit -m "chore: scaffold content-calendar-sync repo"
```

---

### Task 2: Config constants

**Files:**
- Create: `config.py`

- [ ] **Step 1: Write `config.py`**

```python
"""Constants for the Avenue Z content-calendar sync."""
import os

# WordPress REST API (Avenue Z blog)
WP_POSTS_URL = "https://avenuez.com/wp-json/wp/v2/posts"
WP_PER_PAGE = 100
BLOG_URL_SUBSTRING = "/blog/"  # only posts whose link path contains this

# Target Google Sheet (Avenue Z content calendar) — SA has Editor
TARGET_SHEET_ID = os.getenv(
    "TARGET_SHEET_ID", "1-Ar5vGXLWHnO3qtbymFVsgGD6kpJxCZvGWUSK5NngyQ"
)

# Service account (automation-agent@vertex-api-test-495415)
CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "google-credentials.json")
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Renaissance 17-column header (column order A..Q). Row 1 of the sheet.
HEADER = [
    "Date",                                              # A
    "Priority",                                          # B
    "Content Type",                                      # C
    "Topic",                                             # D
    "Status",                                            # E
    "Publish Date",                                      # F
    "Suggested Author (Blog Only)",                      # G
    "Suggested Category Tags (Blog Only)",               # H
    "Why",                                               # I
    "How",                                               # J
    "Proposed Page Slug (or Live URL When Published)",   # K  <- parser reads URL here
    "Relevant AI Queries",                               # L
    "Keyword(s)",                                        # M
    "Internal Linking Opportunities",                    # N
    "Inspiration / Competitor URLs",                     # O
    "Organic Social Support",                            # P
    "Notes",                                             # Q
]

URL_COL_INDEX = 10  # column K (0-based) — dedup key

# Observable columns the script owns (always regenerated from the post):
# A Date(0), C Content Type(2), D Topic(3), E Status(4), F Publish Date(5), K URL(10).
# Everything else is a human strategy column we carry over on re-run if filled.
STRATEGY_COL_INDICES = [1, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16]
```

- [ ] **Step 2: Commit**

```bash
git add config.py
git commit -m "feat: add config constants"
```

---

### Task 3: Mapping (post → row) — pure, TDD

**Files:**
- Create: `mapping.py`
- Test: `tests/test_mapping.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_mapping.py
from mapping import hyperlink_formula, post_to_row

SAMPLE_POST = {
    "date": "2026-06-15T15:00:00",
    "modified": "2026-06-11T22:06:08",
    "link": "https://avenuez.com/blog/best-aeo-agencies-for-ecommerce-brands-in-2026/",
    "title": {"rendered": "Best AEO Agencies for Ecommerce Brands &amp; More in 2026"},
}

def test_hyperlink_formula_escapes_quotes():
    f = hyperlink_formula("https://x.com/a", 'Say "hi" now')
    assert f == '=HYPERLINK("https://x.com/a","Say ""hi"" now")'

def test_post_to_row_maps_observable_columns():
    row = post_to_row(SAMPLE_POST)
    assert len(row) == 17
    assert row[0] == "June 2026"          # A Date (month-year)
    assert row[1] == ""                   # B Priority blank
    assert row[2] == "New Blog"           # C Content Type
    assert row[3] == (                    # D Topic (hyperlinked, HTML-decoded)
        '=HYPERLINK('
        '"https://avenuez.com/blog/best-aeo-agencies-for-ecommerce-brands-in-2026/",'
        '"Best AEO Agencies for Ecommerce Brands & More in 2026")'
    )
    assert row[4] == "Published"          # E Status
    assert row[5] == "6/15"               # F Publish Date M/D
    assert row[10] == (                   # K Proposed Page Slug (URL)
        "https://avenuez.com/blog/best-aeo-agencies-for-ecommerce-brands-in-2026/"
    )
    # All strategy columns blank
    for i in (6, 7, 8, 9, 11, 12, 13, 14, 15, 16):
        assert row[i] == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Desktop/avenuez-agents/content-calendar-sync && ./venv/bin/pytest tests/test_mapping.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'mapping'`.

- [ ] **Step 3: Write `mapping.py`**

```python
"""Pure mapping: a WordPress post dict -> a 17-column calendar row."""
import html
from datetime import datetime

from config import HEADER

_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _parse_date(iso: str) -> datetime:
    # WP returns e.g. "2026-06-15T15:00:00"
    return datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S")


def hyperlink_formula(url: str, title: str) -> str:
    """Build a Google Sheets =HYPERLINK formula, escaping double quotes."""
    safe_title = title.replace('"', '""')
    return f'=HYPERLINK("{url}","{safe_title}")'


def post_to_row(post: dict) -> list:
    """Map a WP post to a 17-element row in HEADER column order."""
    dt = _parse_date(post["date"])
    month_year = f"{_MONTHS[dt.month - 1]} {dt.year}"
    publish_md = f"{dt.month}/{dt.day}"
    title = html.unescape(post["title"]["rendered"]).strip()
    url = post["link"]

    row = [""] * len(HEADER)
    row[0] = month_year                       # A Date
    row[2] = "New Blog"                        # C Content Type
    row[3] = hyperlink_formula(url, title)     # D Topic (hyperlinked)
    row[4] = "Published"                       # E Status
    row[5] = publish_md                        # F Publish Date
    row[10] = url                              # K Proposed Page Slug (URL)
    return row
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_mapping.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add mapping.py tests/test_mapping.py
git commit -m "feat: map WP post to 17-column calendar row"
```

---

### Task 4: Merge (date-sorted rewrite, keyed by URL) — pure, TDD

The full data region is rebuilt every run from the live post list, sorted by
publish date (oldest→newest). Observable columns are regenerated from each post;
any human-filled strategy cells on an existing row (matched by URL) are carried
over so manual edits are never clobbered. Idempotent: same posts → identical rows.

**Files:**
- Create: `merge.py`
- Test: `tests/test_merge.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_merge.py
from merge import existing_strategy_by_url, build_sheet_rows

POST_A = {"date": "2026-06-15T15:00:00", "link": "https://avenuez.com/blog/a/",
          "title": {"rendered": "A"}}
POST_B = {"date": "2026-06-14T10:00:00", "link": "https://avenuez.com/blog/b/",
          "title": {"rendered": "B"}}

def _row(url, **cells):
    r = [""] * 17
    r[10] = url
    for i, v in cells.items():
        r[i] = v
    return r

def test_existing_strategy_by_url_indexes_col_k_skipping_header():
    rows = [["Date"], _row("https://avenuez.com/blog/a/", **{16: "a note"})]
    idx = existing_strategy_by_url(rows)
    assert set(idx) == {"https://avenuez.com/blog/a/"}
    assert idx["https://avenuez.com/blog/a/"][16] == "a note"

def test_build_sheet_rows_sorts_by_date_ascending():
    # POST_A is newer than POST_B → B must come first
    rows = build_sheet_rows([["Date"]], [POST_A, POST_B])
    assert [r[10] for r in rows] == [
        "https://avenuez.com/blog/b/",   # 6/14 (older) first
        "https://avenuez.com/blog/a/",   # 6/15 (newer) second
    ]

def test_build_sheet_rows_is_idempotent():
    once = build_sheet_rows([["Date"]], [POST_A, POST_B])
    twice = build_sheet_rows([["Date"]] + once, [POST_A, POST_B])
    assert once == twice

def test_build_sheet_rows_carries_over_human_strategy_cells():
    existing = [["Date"], _row("https://avenuez.com/blog/a/", **{16: "keep me", 1: "High"})]
    rows = build_sheet_rows(existing, [POST_A])
    row_a = next(r for r in rows if r[10] == "https://avenuez.com/blog/a/")
    assert row_a[16] == "keep me"          # Q Notes carried over
    assert row_a[1] == "High"              # B Priority carried over
    assert row_a[4] == "Published"         # E Status still regenerated
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_merge.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'merge'`.

- [ ] **Step 3: Write `merge.py`**

```python
"""Pure merge: rebuild the full data region, date-sorted, keyed by post URL.

Observable columns are regenerated from each post; human-filled strategy cells
on a matching existing row (by URL) are carried over. Posts are sorted by
publish date ascending so the sheet stays in chronological order every run.
"""
from config import URL_COL_INDEX, STRATEGY_COL_INDICES
from mapping import post_to_row


def existing_strategy_by_url(rows: list) -> dict:
    """Index existing data rows by URL (column K), skipping the header row."""
    by_url = {}
    for row in rows[1:]:  # skip header
        if len(row) > URL_COL_INDEX:
            url = (row[URL_COL_INDEX] or "").strip()
            if url:
                by_url[url] = row
    return by_url


def build_sheet_rows(existing_rows: list, posts: list) -> list:
    """Return the full data region (no header), sorted by publish date ascending,
    carrying over any human-filled strategy cells from matching existing rows."""
    prior = existing_strategy_by_url(existing_rows)
    ordered = sorted(posts, key=lambda p: p["date"])  # ISO dates sort lexically
    out = []
    for post in ordered:
        row = post_to_row(post)
        old = prior.get(post["link"].strip())
        if old:
            for i in STRATEGY_COL_INDICES:
                if i < len(old) and old[i]:
                    row[i] = old[i]
        out.append(row)
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_merge.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add merge.py tests/test_merge.py
git commit -m "feat: date-sorted rewrite keyed by URL, preserving human strategy cells"
```

---

### Task 5: WordPress reader — filter (pure, TDD) + fetch (network)

**Files:**
- Create: `wp_reader.py`
- Test: `tests/test_wp_reader.py`

- [ ] **Step 1: Write the failing test (pure filter)**

```python
# tests/test_wp_reader.py
from wp_reader import filter_blog_posts

RAW = [
    {"link": "https://avenuez.com/blog/post-one/", "title": {"rendered": "One"}},
    {"link": "https://avenuez.com/events/some-event/", "title": {"rendered": "Ev"}},
    {"link": "https://avenuez.com/press-release/pr/", "title": {"rendered": "PR"}},
    {"link": "https://avenuez.com/blog/post-two/", "title": {"rendered": "Two"}},
]

def test_filter_keeps_only_blog_urls():
    kept = filter_blog_posts(RAW)
    assert [p["link"] for p in kept] == [
        "https://avenuez.com/blog/post-one/",
        "https://avenuez.com/blog/post-two/",
    ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_wp_reader.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'wp_reader'`.

- [ ] **Step 3: Write `wp_reader.py`**

```python
"""Read Avenue Z blog posts from the WordPress REST API."""
import requests

from config import WP_POSTS_URL, WP_PER_PAGE, BLOG_URL_SUBSTRING

_FIELDS = "id,date,modified,link,title,categories"


def filter_blog_posts(raw_posts: list) -> list:
    """Keep only posts whose link path contains the blog substring."""
    return [p for p in raw_posts if BLOG_URL_SUBSTRING in p.get("link", "")]


def fetch_blog_posts(session=None) -> list:
    """Paginate the REST API, return all blog posts (filtered)."""
    session = session or requests.Session()
    all_posts = []
    page = 1
    while True:
        resp = session.get(
            WP_POSTS_URL,
            params={"per_page": WP_PER_PAGE, "page": page, "_fields": _FIELDS},
            timeout=30,
        )
        if resp.status_code == 400:
            # WP returns 400 ("rest_post_invalid_page_number") past the last page
            break
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        all_posts.extend(batch)
        if len(batch) < WP_PER_PAGE:
            break
        page += 1
    return filter_blog_posts(all_posts)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_wp_reader.py -v`
Expected: PASS (1 passed).

- [ ] **Step 5: Integration check against the live API (read-only)**

Run:
```bash
./venv/bin/python -c "from wp_reader import fetch_blog_posts; p=fetch_blog_posts(); print(len(p), 'blog posts'); print(p[0]['link'])"
```
Expected: prints a count (hundreds) and a `/blog/` URL. No errors.

- [ ] **Step 6: Commit**

```bash
git add wp_reader.py tests/test_wp_reader.py
git commit -m "feat: fetch + filter Avenue Z blog posts from WP REST API"
```

---

### Task 6: Sheets writer (Google API I/O)

**Files:**
- Create: `sheets_writer.py`

- [ ] **Step 1: Write `sheets_writer.py`**

```python
"""Google Sheets I/O for the Avenue Z content calendar (service-account auth)."""
from google.oauth2 import service_account
from googleapiclient.discovery import build

from config import CREDENTIALS_PATH, SCOPES, HEADER

# 0-based column indices holding date-like LABELS that must stay literal text.
# Without this, USER_ENTERED (needed so =HYPERLINK in Topic parses) coerces
# "July 2023" and "7/7" into date serial numbers (and assumes the current year).
TEXT_COL_INDICES = [0, 5]  # A Date (month-year), F Publish Date (M/D)


def build_sheets_service(credentials_path: str = CREDENTIALS_PATH):
    creds = service_account.Credentials.from_service_account_file(
        credentials_path, scopes=SCOPES
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _first_tab_props(service, sheet_id: str) -> dict:
    """Return {title, sheetId} of the first (leftmost) tab — the one the app reads."""
    meta = service.spreadsheets().get(
        spreadsheetId=sheet_id, fields="sheets.properties(title,index,sheetId)"
    ).execute()
    sheets = sorted(meta["sheets"], key=lambda s: s["properties"]["index"])
    return sheets[0]["properties"]


def get_first_tab_title(service, sheet_id: str) -> str:
    """Return the title of the first (leftmost) tab — the one the app reads."""
    return _first_tab_props(service, sheet_id)["title"]


def _format_text_columns(service, sheet_id: str, gid: int) -> None:
    """Force date-label columns to plain-text so USER_ENTERED writes stay literal."""
    requests = []
    for col in TEXT_COL_INDICES:
        requests.append({
            "repeatCell": {
                "range": {"sheetId": gid, "startColumnIndex": col,
                          "endColumnIndex": col + 1},
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT"}}},
                "fields": "userEnteredFormat.numberFormat",
            }
        })
    service.spreadsheets().batchUpdate(
        spreadsheetId=sheet_id, body={"requests": requests}
    ).execute()


def read_rows(service, sheet_id: str, tab_title: str) -> list:
    """Read A1:Z1000 of the given tab as a list of rows (formatted values)."""
    resp = service.spreadsheets().values().get(
        spreadsheetId=sheet_id,
        range=f"'{tab_title}'!A1:Z1000",
        valueRenderOption="FORMULA",   # read =HYPERLINK back as formula, not display text
    ).execute()
    return resp.get("values", [])


def write_data_region(service, sheet_id: str, tab_title: str, data_rows: list) -> int:
    """Clear the tab then write HEADER (row 1) + all data rows, in order.

    A full rewrite (not append) so the date-sorted order is materialized every
    run. USER_ENTERED so =HYPERLINK formulas are parsed into real links; the
    date-label columns are preformatted as text so they aren't coerced to serials.
    """
    props = _first_tab_props(service, sheet_id)
    gid = props["sheetId"]
    service.spreadsheets().values().clear(
        spreadsheetId=sheet_id, range=f"'{tab_title}'!A1:Z1000"
    ).execute()
    _format_text_columns(service, sheet_id, gid)  # must precede the value write
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=f"'{tab_title}'!A1",
        valueInputOption="USER_ENTERED",
        body={"values": [HEADER] + data_rows},
    ).execute()
    return len(data_rows)
```

- [ ] **Step 2: Copy the service-account key into the repo**

Run:
```bash
cp ~/.config/gcloud/automation-agent-key.json \
   ~/Desktop/avenuez-agents/content-calendar-sync/google-credentials.json
```
Expected: file present (gitignored). Verify identity (non-secret field only):
```bash
grep -o '"client_email": *"[^"]*"' ~/Desktop/avenuez-agents/content-calendar-sync/google-credentials.json
```
Expected: `automation-agent@vertex-api-test-495415.iam.gserviceaccount.com`.

- [ ] **Step 3: Smoke-test auth + read the target sheet's first tab (read-only)**

Run:
```bash
cd ~/Desktop/avenuez-agents/content-calendar-sync
./venv/bin/python -c "
from sheets_writer import build_sheets_service, get_first_tab_title, read_rows
from config import TARGET_SHEET_ID
s = build_sheets_service()
t = get_first_tab_title(s, TARGET_SHEET_ID)
print('first tab:', t, '| rows:', len(read_rows(s, TARGET_SHEET_ID, t)))
"
```
Expected: prints the first tab title and a row count (0 if blank). No auth errors.

- [ ] **Step 4: Commit**

```bash
git add sheets_writer.py
git commit -m "feat: sheets writer (SA auth, read first tab, date-sorted full rewrite)"
```

---

### Task 7: Orchestration entry point (`sync.py`)

**Files:**
- Create: `sync.py`

- [ ] **Step 1: Write `sync.py`**

```python
"""Entry point: fetch blog posts and rewrite the Avenue Z sheet, date-sorted."""
import argparse

from config import TARGET_SHEET_ID, URL_COL_INDEX
from wp_reader import fetch_blog_posts
from merge import build_sheet_rows, existing_strategy_by_url
from sheets_writer import (
    build_sheets_service, get_first_tab_title, read_rows, write_data_region,
)


def run(dry_run: bool = False) -> int:
    posts = fetch_blog_posts()
    print(f"[sync] fetched {len(posts)} blog posts")

    service = build_sheets_service()
    tab = get_first_tab_title(service, TARGET_SHEET_ID)
    rows = read_rows(service, TARGET_SHEET_ID, tab)
    print(f"[sync] first tab '{tab}' has {max(len(rows) - 1, 0)} existing data rows")

    data_rows = build_sheet_rows(rows, posts)
    known = set(existing_strategy_by_url(rows))
    new_count = sum(1 for r in data_rows if r[URL_COL_INDEX] not in known)
    print(f"[sync] {len(data_rows)} total rows ({new_count} new) — date-sorted")

    if dry_run:
        for r in data_rows[:5]:
            print("  row:", r[5], "|", r[10])  # publish date, URL (oldest first)
        if len(data_rows) > 5:
            print(f"  ... and {len(data_rows) - 5} more")
        print("[sync] dry-run: nothing written")
        return 0

    written = write_data_region(service, TARGET_SHEET_ID, tab, data_rows)
    print(f"[sync] wrote {written} data rows to '{tab}' (header + date-sorted posts)")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    raise SystemExit(run(dry_run=args.dry_run))
```

- [ ] **Step 2: Dry-run against live API + sheet (writes nothing)**

Run:
```bash
cd ~/Desktop/avenuez-agents/content-calendar-sync && ./venv/bin/python sync.py --dry-run
```
Expected: prints fetched count, existing-row count, "N total rows (M new) — date-sorted", and the first few rows in oldest-first order. Nothing written.

- [ ] **Step 3: Commit**

```bash
git add sync.py
git commit -m "feat: sync orchestration with --dry-run"
```

---

### Task 8: First real population (manual, gated)

**Files:** none (operational step).

- [ ] **Step 1: Run for real to populate the Avenue Z sheet**

Run:
```bash
cd ~/Desktop/avenuez-agents/content-calendar-sync && ./venv/bin/python sync.py
```
Expected: "[sync] wrote N data rows" (N ≈ all `/blog/` posts), all new on first run.

- [ ] **Step 2: Verify in the sheet**

Open `https://docs.google.com/spreadsheets/d/1-Ar5vGXLWHnO3qtbymFVsgGD6kpJxCZvGWUSK5NngyQ/edit`.
Confirm: header row present; rows are in **chronological order by Publish Date / Date month** (oldest at top); Topic column shows clickable hyperlinks; Content Type = "New Blog"; Status = "Published"; column K holds the post URLs.

- [ ] **Step 3: Verify idempotency**

Run `./venv/bin/python sync.py` again.
Expected: "[sync] N total rows (0 new)" — same row count, no duplicates, identical order.

---

### Task 9: Containerize + deploy (Cloud Run Job + Cloud Scheduler)

**Files:**
- Create: `cloud_run_entrypoint.py`, `Dockerfile`, `deploy.sh`, `.env.template`, `README.md`

- [ ] **Step 1: Write `cloud_run_entrypoint.py`**

```python
"""Cloud Run entrypoint: decode base64 SA creds env -> file, then run sync."""
import base64
import os
import subprocess
import sys
from pathlib import Path


def write_credentials():
    creds_b64 = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if creds_b64:
        path = Path("/app/google-credentials.json")
        path.write_bytes(base64.b64decode(creds_b64))
        os.environ["GOOGLE_CREDENTIALS_PATH"] = str(path)
        print(f"[entrypoint] wrote credentials to {path}")


if __name__ == "__main__":
    write_credentials()
    sys.exit(subprocess.run(["python", "sync.py"], cwd="/app").returncode)
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
CMD ["python", "cloud_run_entrypoint.py"]
```

- [ ] **Step 3: Write `.env.template`**

```
# Base64-encoded automation-agent service account JSON
GOOGLE_CREDENTIALS_JSON=
# Optional override of the target sheet
TARGET_SHEET_ID=1-Ar5vGXLWHnO3qtbymFVsgGD6kpJxCZvGWUSK5NngyQ
```

- [ ] **Step 4: Write `deploy.sh` (build + Cloud Run Job + Cloud Scheduler)**

```bash
#!/usr/bin/env bash
# Deploy content-calendar-sync to Cloud Run Jobs + Cloud Scheduler.
# Prereqs: gcloud authed to project vertex-api-test-495415; APIs enabled
# (Cloud Run, Cloud Build, Cloud Scheduler, Artifact Registry).
set -euo pipefail

PROJECT="vertex-api-test-495415"
REGION="us-central1"
JOB="content-calendar-sync"
SCHEDULER="content-calendar-sync-trigger"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/agents/${JOB}:latest"

# Base64 the local SA key for the job env (no key committed to the image)
CREDS_B64=$(base64 -i google-credentials.json | tr -d '\n')

gcloud builds submit --tag "$IMAGE" --project "$PROJECT"

gcloud run jobs deploy "$JOB" \
  --image "$IMAGE" --region "$REGION" --project "$PROJECT" \
  --set-env-vars "GOOGLE_CREDENTIALS_JSON=${CREDS_B64}" \
  --max-retries 1 --task-timeout 600s

# Every other day at 09:00 ET
gcloud scheduler jobs delete "$SCHEDULER" --location "$REGION" \
  --project "$PROJECT" --quiet 2>/dev/null || true
gcloud scheduler jobs create http "$SCHEDULER" \
  --location "$REGION" --project "$PROJECT" \
  --schedule="0 9 */2 * *" --time-zone="America/New_York" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB}:run" \
  --http-method=POST \
  --oauth-service-account-email="automation-agent@${PROJECT}.iam.gserviceaccount.com"

echo "Deployed job '$JOB' + scheduler '$SCHEDULER' (every other day, 09:00 ET)."
```

- [ ] **Step 5: Write `README.md`**

```markdown
# content-calendar-sync

Pulls Avenue Z published blog posts (WordPress REST API) and appends them to the
first tab of the Avenue Z content-calendar Google Sheet, in the Renaissance
17-column format. Feeds the reporting dashboard's Content Impact Tracker.

- Service account: automation-agent@vertex-api-test-495415 (Sheets API).
- Target sheet: 1-Ar5vGXLWHnO3qtbymFVsgGD6kpJxCZvGWUSK5NngyQ (first tab).
- Idempotent: dedups by post URL; safe to re-run.
- Schedule: Cloud Run Job + Cloud Scheduler, every other day (cron `0 9 */2 * *`).

## Local
    python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
    ./venv/bin/python sync.py --dry-run   # preview
    ./venv/bin/python sync.py             # write

## Deploy
    ./deploy.sh
```

- [ ] **Step 6: Make deploy.sh executable and commit**

```bash
chmod +x deploy.sh
git add cloud_run_entrypoint.py Dockerfile deploy.sh .env.template README.md
git commit -m "feat: containerize + Cloud Run Job/Scheduler deploy (every other day)"
```

- [ ] **Step 7: Deploy**

Run: `cd ~/Desktop/avenuez-agents/content-calendar-sync && ./deploy.sh`
Expected: build succeeds, job + scheduler created. (Requires gcloud auth to the project.)

- [ ] **Step 8: Trigger one manual job run to confirm the deployed path works**

Run:
```bash
gcloud run jobs execute content-calendar-sync --region us-central1 --project vertex-api-test-495415 --wait
```
Expected: completes successfully; "0 new posts" if Task 8 already populated the sheet.

---

### Task 10: Go-live — point the dashboard at the sheet

**Files:** none (DB change in the reporting platform; out of this repo).

- [ ] **Step 1: Set Avenue Z's `contentCalendarSheetId`**

In the reporting platform's Neon Postgres (Drizzle Studio or Neon SQL editor), update the Avenue Z `clients` row:
```sql
UPDATE clients
SET content_calendar_sheet_id = '1-Ar5vGXLWHnO3qtbymFVsgGD6kpJxCZvGWUSK5NngyQ'
WHERE slug = 'avenue-z';
```
Confirm the column name against `lib/db/schema.ts` before running.

- [ ] **Step 2: Verify on the live dashboard**

Open Avenue Z → Reports → Answer Engine Optimization → Content Impact (demo mode OFF).
Expected: "Planned URLs in Scope" and the planned-content table now reflect the blog posts; URLs match against Peec/GA4 at render time.

---

## Self-Review

**Spec coverage:** Source (Task 5) ✓ · 17-col mapping incl. URL in col K + Topic hyperlink (Task 3) ✓ · observable-only, strategy blank (Task 3) ✓ · first-tab write (Tasks 6–7) ✓ · idempotent, **date-sorted** rewrite keyed by URL, preserving human strategy cells (Task 4, verified Task 8.3) ✓ · SA auth via automation-agent (Task 6) ✓ · Sheets-only (no Drive/supportsAllDrives, per spec note) ✓ · Python + Cloud Run Job + Cloud Scheduler every-other-day (Task 9) ✓ · M/D publish date (Task 3) ✓ · go-live contentCalendarSheetId (Task 10) ✓ · dry-run (Task 7) ✓ · unit tests for mapping/merge/filter (Tasks 3–5) ✓.

**Placeholder scan:** No TBD/TODO; every code step has complete code; commands have expected output.

**Type consistency:** `post_to_row` (mapping) used by `build_sheet_rows` (merge) — signature consistent. `HEADER`/`URL_COL_INDEX`/`STRATEGY_COL_INDICES` defined in config, used in mapping/merge/sheets_writer consistently. `build_sheets_service`/`get_first_tab_title`/`read_rows`/`write_data_region` defined in Task 6, called identically in Task 7. `existing_strategy_by_url`/`build_sheet_rows` defined in Task 4, used in Task 7.
