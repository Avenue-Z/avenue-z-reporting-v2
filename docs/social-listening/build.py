"""Build the Social Listening mockup page from the data-free template and a private data file.

    python3 -I docs/social-listening/build.py [month]

month defaults to 2026-10. Client data never lives in this repo (it is public). It is read from
MOCK_DIR (default ~/code/apfm-social-listening-mock):
    MOCK_DIR/data/<month>.js              numbers, analyst text, posts (see README.md)
    MOCK_DIR/inputs/post-images/*.jpg     the analyst's post screenshots
The built page is written to MOCK_DIR/apfm-social-listening.html, which is what gets published.
"""
import base64
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
MOCK_DIR = Path(os.environ.get("MOCK_DIR", Path.home() / "code/apfm-social-listening-mock"))
month = sys.argv[1] if len(sys.argv) > 1 else "2026-10"

template = (HERE / "mock.template.html").read_text()
data_file = MOCK_DIR / "data" / f"{month}.js"
if not data_file.exists():
    sys.exit(f"ABORTED: no data file at {data_file}")
data = data_file.read_text()

tsx = (REPO / "components/layout/avenue-z-logo.tsx").read_text()
paths = "".join(re.findall(r"<path [^>]*/>", tsx))
if paths.count("<path") != 7:
    sys.exit("ABORTED: the Avenue Z logo in components/layout/avenue-z-logo.tsx changed shape")
az = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 147 31" fill="none" '
      f'style="width:95px;height:20px" aria-hidden="true">{paths}</svg>')
client_logo = base64.b64encode((REPO / "public/logos/a-place-for-mom.png").read_bytes()).decode()
shots = {p.stem: "data:image/jpeg;base64," + base64.b64encode(p.read_bytes()).decode()
         for p in sorted((MOCK_DIR / "inputs/post-images").glob("*.jpg"))}

for marker in ("/*__DATA__*/", "__AZLOGO__", "__APFMLOGO__", "__POSTIMG__"):
    if marker not in template:
        sys.exit(f"ABORTED: {marker} missing from the template")
out = (template.replace("/*__DATA__*/", data)
       .replace("__AZLOGO__", az)
       .replace("__APFMLOGO__", client_logo)
       .replace("__POSTIMG__", json.dumps(shots)))
target = MOCK_DIR / "apfm-social-listening.html"
target.write_text(out)
print(f"wrote {target} ({len(out):,} bytes, {len(shots)} screenshots, data {data_file.name})")
