"""Registrations, licences and who holds them.

Two kinds of source, kept apart on purpose:

- Reference tables (committed under kopi/data/, derived facts with source and date):
  GRA supply heads and financial grades, BCA workheads and tendering limits, SSIC
  codes, and the rules that say which licence a kind of work implies.
- Live registers (fetched at runtime, never committed): the GoBusiness licence
  directory, the bizSAFE register, and per-UEN lookups on the GeBIZ Supplier
  Directory, the BCA e-Directory and ACRA's open data. Most of these sites forbid
  republication, so their content lives only in data/ (gitignored) and the index.
"""

from __future__ import annotations

import argparse
import html as htmllib
import io
import json
import logging
import math
import re
import time
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from functools import cache
from pathlib import Path
from typing import Protocol
from urllib.parse import urlencode
from xml.etree import ElementTree

import httpx

from kopi.config import DATA_DIR
from kopi.models import Licence, Registration
from kopi.sources.gebiz import page_lines

log = logging.getLogger(__name__)

REFERENCE_DIR = Path(__file__).resolve().parents[1] / "data"
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 kopi/0.1"
DATASTORE = "https://data.gov.sg/api/action/datastore_search"
UNLIMITED = math.inf


def _reference(name: str) -> dict:
    return json.loads((REFERENCE_DIR / name).read_text())


# ---------------------------------------------------------------- GRA (GeBIZ supplier registration)


@dataclass(frozen=True)
class SupplyHead:
    code: str
    title: str
    licence_note: str | None


@dataclass(frozen=True)
class Gsr:
    source: str
    heads: dict[str, SupplyHead]
    capacity: dict[str, float]  # grade → tendering capacity in S$, inf for S10

    def rank(self, grade: str | None) -> int | None:
        normal = normalise_gsr_grade(grade)
        return list(self.capacity).index(normal) if normal in self.capacity else None

    def grade_for(self, capacity_sgd: int | None) -> str | None:
        """The lowest grade whose tendering capacity covers `capacity_sgd`."""
        if capacity_sgd is None:
            return None
        return next((g for g, cap in self.capacity.items() if cap >= capacity_sgd), None)


@cache
def gsr() -> Gsr:
    raw = _reference("gsr.json")
    heads = {h["code"]: SupplyHead(h["code"], h["title"], h["licence_note"]) for h in raw["supply_heads"]}
    capacity = {
        g["grade"]: UNLIMITED if g["tendering_capacity_sgd"] is None else float(g["tendering_capacity_sgd"])
        for g in raw["financial_grades"]
    }
    return Gsr(source=raw["source"], heads=heads, capacity=capacity)


def normalise_gsr_grade(grade: str | None) -> str | None:
    """'S3', 'EPU S3' and 'S10 >$30,000,000 (EPU S10)' all become 'S3' / 'S10'."""
    if not grade:
        return None
    match = re.search(r"\bS(\d{1,2})\b", grade.upper())
    return f"S{match.group(1)}" if match else None


# ---------------------------------------------------------------- BCA (contractors, FM and suppliers registries)


@dataclass(frozen=True)
class Bca:
    source: str
    titles: dict[str, str]
    limits: dict[str, dict[str, float]]  # limit group → grade → S$ (inf = unlimited)

    def group(self, workhead: str) -> str | None:
        code = workhead.upper()
        if code in {"CW01", "CW02"}:
            return "CW01_CW02"
        if code == "FM01":
            return "FM01"
        if code in {"FM02", "FM03", "FM04"}:
            return "FM02_FM03_FM04"
        if code.startswith(("CR", "ME")):
            return "CR_ME"
        if code.startswith("SY"):
            return "SY"
        return None  # RW and TR workheads: BCA publishes no tendering limit

    def limit(self, workhead: str, grade: str | None) -> float | None:
        group = self.group(workhead)
        if group is None or grade is None:
            return None
        return self.limits[group].get(normalise_bca_grade(grade))


@cache
def bca() -> Bca:
    raw = _reference("bca.json")
    limits = {
        group: {grade: UNLIMITED if amount is None else float(amount) for grade, amount in grades.items()}
        for group, grades in raw["limits"].items()
    }
    titles = {w["code"]: w["title"] for w in raw["workheads"]}
    return Bca(source=raw["sources"]["tendering_limits"], titles=titles, limits=limits)


def normalise_bca_grade(grade: str) -> str:
    grade = grade.strip().replace("%20", " ")
    return "Single Grade" if grade.lower() == "single grade" else grade.upper()


# ---------------------------------------------------------------- licence rules and SSIC


@dataclass(frozen=True)
class LicenceRule:
    id: str
    licence: str
    agency: str
    certainty: str  # "required" | "check"
    why: str
    url: str
    gobusiness: str | None
    aliases: tuple[str, ...]
    gra_heads: tuple[str, ...]
    categories: tuple[str, ...]
    patterns: tuple[re.Pattern[str], ...]
    register: dict | None = None

    def triggered_by(self, text: str, category: str, heads: set[str]) -> str | None:
        """Why this notice implies the licence, or None."""
        if hit := heads.intersection(self.gra_heads):
            return f"GRA supply head {sorted(hit)[0]}"
        if any(c in category.lower() for c in self.categories):
            return f"category '{category}'"
        for pattern in self.patterns:
            if match := pattern.search(text):
                return f"the words '{match.group(0)}'"
        return None


@cache
def licence_rules() -> tuple[LicenceRule, ...]:
    raw = _reference("licence_rules.json")
    base = raw["gobusiness_base"]
    return tuple(
        LicenceRule(
            id=r["id"],
            licence=r["licence"],
            agency=r["agency"],
            certainty=r["certainty"],
            why=r["why"],
            url=base + r["gobusiness"] if r.get("gobusiness") else r["url"],
            gobusiness=r.get("gobusiness"),
            aliases=tuple(a.lower() for a in r["aliases"]),
            gra_heads=tuple(r["triggers"]["gra_heads"]),
            categories=tuple(c.lower() for c in r["triggers"]["categories"]),
            patterns=tuple(re.compile(p, re.IGNORECASE) for p in r["triggers"]["text"]),
            register=r.get("register"),
        )
        for r in raw["rules"]
    )


@cache
def _ssic() -> tuple[dict[str, str], dict[str, str]]:
    raw = _reference("ssic.json")
    return raw["ssic2025"], raw["ssic2020"]


def ssic_title(code: str | None) -> str | None:
    """SSIC 2025 title, falling back to 2020 for codes that changed."""
    if not code:
        return None
    current, previous = _ssic()
    code = code.strip()
    return current.get(code) or previous.get(code)


# ---------------------------------------------------------------- GoBusiness licence directory


GOBUSINESS_SITEMAP = "https://licensing.gobusiness.gov.sg/licence-directory/sitemap/0.xml"
LICENCE_KEY = re.compile(r'\{"licence":\s*\{')


def parse_flight(body: str) -> dict[str, tuple[str, str]]:
    """Rows of a React Server Components payload: id → ('T', text) or ('J', json-ish line).

    A text row is `id:T<hex length>,<text>`; every other row runs to the end of its line.
    """
    rows: dict[str, tuple[str, str]] = {}
    data = body.encode()
    i = 0
    while i < len(data):
        colon = data.find(b":", i)
        if colon < 0:
            break
        row_id = data[i:colon].decode(errors="ignore").strip()
        if data[colon + 1 : colon + 2] == b"T":
            comma = data.find(b",", colon)
            length = int(data[colon + 2 : comma], 16)
            rows[row_id] = ("T", data[comma + 1 : comma + 1 + length].decode(errors="ignore"))
            i = comma + 1 + length
        else:
            end = data.find(b"\n", colon)
            end = len(data) if end < 0 else end
            rows[row_id] = ("J", data[colon + 1 : end].decode(errors="ignore"))
            i = end + 1
    return rows


def licence_record(body: str) -> dict | None:
    """The `licence` object a GoBusiness licence page embeds in its RSC payload, `$ref`s resolved."""
    rows = parse_flight(body)
    for kind, payload in rows.values():
        found = LICENCE_KEY.search(payload) if kind == "J" else None
        if found:
            record, _ = json.JSONDecoder().raw_decode(payload[found.end() - 1 :])
            return _resolve(record, rows)
    return None


def _resolve(value, rows: dict[str, tuple[str, str]]):
    if value == "$undefined":
        return None
    if isinstance(value, str) and re.fullmatch(r"\$[0-9a-f]+", value):
        kind, payload = rows.get(value[1:], ("", value))
        if kind == "T":
            return payload
        try:
            return _resolve(json.loads(payload), rows)
        except json.JSONDecodeError:
            return payload
    if isinstance(value, dict):
        return {k: _resolve(v, rows) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolve(v, rows) for v in value]
    return value


def html_text(fragment: str | None) -> str:
    if not fragment:
        return ""
    text = re.sub(r"<br\s*/?>|</p>|</li>", "\n", fragment)
    text = htmllib.unescape(re.sub(r"<[^>]+>", " ", text))
    return "\n".join(" ".join(line.split()) for line in text.splitlines() if line.strip())


def related_licences(text: str) -> list[str]:
    """Lines under a "Related licences…" heading; the rest of that field is eligibility prose."""
    lines = text.splitlines()
    start = next((i for i, line in enumerate(lines) if line.lower().startswith("related licence")), None)
    return [] if start is None else [line for line in lines[start + 1 :] if not line.endswith(":")]


def licence_from_record(record: dict, agencies: dict[str, str], url: str) -> Licence:
    agency = agencies.get(str(record.get("agency_in_charge")), record.get("agency_name") or "")
    prerequisites = related_licences(html_text(record.get("additional_eligibility_requirements")))
    return Licence(
        id=url.split("/licence-directory/")[-1],
        name=record["display_name"],
        agency=agency,
        description=record.get("short_description") or "",
        who_needs_it=html_text(record.get("long_description"))[:1200],
        fee=html_text(record.get("fee_details")),
        processing_time=record.get("estimated_processing_time") or "",
        validity=html_text(record.get("licence_validity")),
        prerequisites=prerequisites,
        url=url,
    )


def fetch_gobusiness(http: httpx.Client, out: Path = DATA_DIR / "licences" / "gobusiness.json", delay: float = 1.0) -> list[Licence]:
    """Every licence in the GoBusiness directory, one RSC request per licence page."""
    agencies = _reference("gobusiness_agencies.json")["agencies"]
    sitemap = http.get(GOBUSINESS_SITEMAP).text
    urls = re.findall(r"<loc>([^<]+/licence-directory/[^<]+/[^<]+)</loc>", sitemap)
    licences: list[Licence] = []
    for url in urls:
        time.sleep(delay)
        response = http.get(url, headers={"RSC": "1"})
        if response.status_code != 200 or not (record := licence_record(response.text)):
            log.warning("no licence object at %s", url)
            continue
        licences.append(licence_from_record(record, agencies, url))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps([lic.model_dump() for lic in licences], indent=1, ensure_ascii=False))
    return licences


def load_licences(path: Path = DATA_DIR / "licences" / "gobusiness.json") -> list[Licence]:
    """The fetched catalogue, or an empty list before the first fetch."""
    if not path.exists():
        return []
    return [Licence.model_validate(x) for x in json.loads(path.read_text())]


# ---------------------------------------------------------------- XLSX without a dependency


_XLSX = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def xlsx_rows(content: bytes, sheet: str | None = None) -> list[list[str]]:
    """Rows of one worksheet as strings. Enough of the format for plain data exports."""
    book = zipfile.ZipFile(io.BytesIO(content))
    shared = []
    if "xl/sharedStrings.xml" in book.namelist():
        for item in ElementTree.fromstring(book.read("xl/sharedStrings.xml")).findall(f"{_XLSX}si"):
            shared.append("".join(t.text or "" for t in item.iter(f"{_XLSX}t")))
    path = _sheet_path(book, sheet)
    rows = []
    for row in ElementTree.fromstring(book.read(path)).iter(f"{_XLSX}row"):
        cells: dict[int, str] = {}
        for cell in row.findall(f"{_XLSX}c"):
            column = _column_index(re.match(r"[A-Z]+", cell.get("r", "A")).group(0))
            kind, value = cell.get("t"), cell.find(f"{_XLSX}v")
            if kind == "inlineStr":
                cells[column] = "".join(t.text or "" for t in cell.iter(f"{_XLSX}t"))
            elif value is not None:
                cells[column] = shared[int(value.text)] if kind == "s" else (value.text or "")
        rows.append([cells.get(i, "") for i in range(max(cells, default=-1) + 1)])
    return rows


def _sheet_path(book: zipfile.ZipFile, name: str | None) -> str:
    workbook = ElementTree.fromstring(book.read("xl/workbook.xml"))
    sheets = workbook.find(f"{_XLSX}sheets")
    chosen = next((s for s in sheets if name is None or s.get("name") == name), sheets[0])
    rel_id = chosen.get(f"{_REL}id")
    rels = ElementTree.fromstring(book.read("xl/_rels/workbook.xml.rels"))
    target = next(r.get("Target") for r in rels if r.get("Id") == rel_id)
    return target.lstrip("/") if target.startswith("/") else f"xl/{target}"


def _column_index(letters: str) -> int:
    index = 0
    for letter in letters:
        index = index * 26 + ord(letter) - 64
    return index - 1


def excel_date(value: str) -> date | None:
    """XLSX dates arrive as ISO text or as serial days since 1899-12-30."""
    value = value.strip()
    if not value:
        return None
    if re.fullmatch(r"\d+(\.\d+)?", value):
        return date(1899, 12, 30) + timedelta(days=int(float(value)))
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


# ---------------------------------------------------------------- who holds what, by UEN


@dataclass(frozen=True)
class Company:
    uen: str
    name: str
    status: str
    activities: list[tuple[str, str]] = field(default_factory=list)  # (SSIC code, title)

    @property
    def live(self) -> bool | None:
        status = self.status.lower()
        if any(word in status for word in ("struck off", "cancelled", "dissolved", "ceased", "terminated", "wound up", "deregistered")):
            return False
        if "live" in status or "registered" in status or "existing" in status:
            return True
        return None


@dataclass(frozen=True)
class BizSafe:
    level: str
    expires: date | None
    status: str


NOT_LISTED = BizSafe(level="", expires=None, status="Not listed")


class Registry(Protocol):
    """Live facts about a company, by UEN. `None` means the lookup could not answer."""

    def gsr(self, uen: str) -> list[Registration] | None: ...
    def bca(self, uen: str) -> list[Registration] | None: ...
    def bizsafe(self, uen: str) -> BizSafe | None: ...  # NOT_LISTED when absent from the register
    def company(self, uen: str) -> Company | None: ...


GSR_DIRECTORY = "https://www.gebiz.gov.sg/ptn/supplier/directory/index.xhtml"
BCA_COMPANY = "https://www.bca.gov.sg/eBACS/BCA_DIRECTORY/Company/CompanyDetails"
BIZSAFE_PAGE = "https://www.tal.sg/wshc/programmes/bizsafe/bizsafe-e-services"
WORKHEAD = re.compile(r"^(?:CW|CR|ME|RW|TR|FM|SY)\d{2}[A-Z]?$")
BCA_GRADE = re.compile(r"^(?:[ABC][123]|L[1-6]|M[1-4]|Single Grade)$", re.IGNORECASE)
DMY = re.compile(r"^\d{2}/\d{2}/\d{4}$")


def search_form(markup: str, query: str) -> list[tuple[str, str]]:
    """The GeBIZ Supplier Directory search: hidden fields, the free-text field, and Search."""
    form = markup[markup.find('<form id="contentForm"') :]
    form = form[: form.find("</form>")]
    fields: list[tuple[str, str]] = []
    names = set()
    for tag in re.findall(r"<input[^>]*>", form):
        name, kind, value = (re.search(rf'{a}="([^"]*)"', tag) for a in ("name", "type", "value"))
        if not name:
            continue
        names.add(name.group(1))
        if kind and kind.group(1) == "hidden":
            fields.append((htmllib.unescape(name.group(1)), htmllib.unescape(value.group(1)) if value else ""))
    text_field = next(
        (n[: -len("_inputButton")] for n in names if n.endswith("_inputButton") and "HIDDEN" not in n and n[: -len("_inputButton")] in names),
        None,
    )
    if text_field is None or "contentForm:search" not in names:
        raise ValueError("supplier directory search form not recognised")
    return fields + [(text_field, query), ("contentForm:search", "Search")]


def parse_supply_heads(markup: str) -> list[Registration]:
    """The SUPPLY HEADS table of a supplier's directory page; only APPROVED rows count."""
    lines = page_lines(markup)
    if "SUPPLY HEADS" not in lines:
        return []
    rows = lines[lines.index("SUPPLY HEADS") :]
    registrations = []
    for i, line in enumerate(rows):
        head = re.match(r"^(EPU/[A-Z]{3}/\d{2})\s*-", line)
        if not head or i + 3 >= len(rows):
            continue
        grade, expiry, status = rows[i + 1], rows[i + 2], rows[i + 3]
        if status.upper() != "APPROVED":
            continue
        registrations.append(
            Registration(code=head.group(1), grade=normalise_gsr_grade(grade), expires=datetime.strptime(expiry, "%d %b %Y").date())
        )
    return registrations


def parse_bca_company(markup: str) -> list[Registration]:
    """Workhead rows of a BCA e-Directory company page: code, description(s), grade, expiry."""
    lines = page_lines(markup)
    registrations = []
    for i, line in enumerate(lines):
        if not WORKHEAD.match(line):
            continue
        tail = lines[i + 1 : i + 6]
        grade = next((x for x in tail if BCA_GRADE.match(x)), None)
        expiry = next((x for x in tail if DMY.match(x)), None)
        if grade and expiry:
            registrations.append(
                Registration(code=line, grade=normalise_bca_grade(grade), expires=datetime.strptime(expiry, "%d/%m/%Y").date())
            )
    return registrations


def parse_bizsafe(content: bytes) -> dict[str, BizSafe]:
    """UEN → the best current bizSAFE record from the Self-Help export (sheet 'Data')."""
    rows = xlsx_rows(content, sheet="Data")
    header = [h.strip().upper() for h in rows[0]]
    col = {name: header.index(name) for name in ("UEN", "EXPIRY", "STATUS", "LEVEL")}
    best: dict[str, BizSafe] = {}
    for row in rows[1:]:
        row = row + [""] * (len(header) - len(row))
        uen = row[col["UEN"]].strip().upper()
        if not uen:
            continue
        record = BizSafe(level=row[col["LEVEL"]].strip(), expires=excel_date(row[col["EXPIRY"]]), status=row[col["STATUS"]].strip())
        current = best.get(uen)
        if current is None or _bizsafe_key(record) > _bizsafe_key(current):
            best[uen] = record
    return best


BIZSAFE_ORDER = ["level 1", "level 2", "level 3", "level 4", "level star"]


def bizsafe_rank(level: str | None) -> int | None:
    if not level:
        return None
    text = level.lower().strip()
    text = text if text.startswith("level") else f"level {text}"
    return BIZSAFE_ORDER.index(text) if text in BIZSAFE_ORDER else None


def _bizsafe_key(record: BizSafe) -> tuple[int, int, date]:
    approved = int(record.status.lower() == "approved")
    return approved, bizsafe_rank(record.level) or -1, record.expires or date.min


class LiveRegistry:
    """Per-UEN lookups against the public registers, cached on disk for a day."""

    def __init__(self, http: httpx.Client | None = None, cache_dir: Path = DATA_DIR / "cache" / "registers", ttl: timedelta = timedelta(days=1)):
        self.http = http or httpx.Client(headers={"User-Agent": BROWSER_UA}, follow_redirects=True, timeout=40)
        self.cache_dir = cache_dir
        self.ttl = ttl
        self._bizsafe: dict[str, BizSafe] | None = None

    def _cached(self, key: str, fetch):
        path = self.cache_dir / f"{key}.json"
        if path.exists() and datetime.now(UTC).timestamp() - path.stat().st_mtime < self.ttl.total_seconds():
            return json.loads(path.read_text())
        value = fetch()
        if value is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value, default=str))
        return value

    def gsr(self, uen: str) -> list[Registration] | None:
        def fetch():
            try:
                page = self._get(GSR_DIRECTORY)
                results = self.http.post(
                    GSR_DIRECTORY,
                    content=urlencode(search_form(page, uen)),
                    headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": GSR_DIRECTORY},
                )
                results.raise_for_status()
                results = results.text
                link = re.search(r'href="(/ptn/supplier/directory/searchDetail\.xhtml\?code=[0-9a-f]+)"', results)
                if not link:
                    return []
                detail = self._get(f"https://www.gebiz.gov.sg{link.group(1)}")
                return [r.model_dump(mode="json") for r in parse_supply_heads(detail)]
            except (httpx.HTTPError, ValueError) as error:
                log.warning("GeBIZ supplier directory lookup failed for %s: %s", uen, error)
                return None

        found = self._cached(f"gsr-{uen}", fetch)
        return None if found is None else [Registration.model_validate(r) for r in found]

    def bca(self, uen: str) -> list[Registration] | None:
        def fetch():
            try:
                page = self._get(BCA_COMPANY, params={"uenNo": uen})
                return [r.model_dump(mode="json") for r in parse_bca_company(page)]
            except httpx.HTTPError as error:
                log.warning("BCA e-Directory lookup failed for %s: %s", uen, error)
                return None

        found = self._cached(f"bca-{uen}", fetch)
        return None if found is None else [Registration.model_validate(r) for r in found]

    def bizsafe(self, uen: str) -> BizSafe | None:
        """The UEN's bizSAFE record, NOT_LISTED when the register has none, None when the register is unreachable."""
        if self._bizsafe is None:
            try:
                self._bizsafe = self._load_bizsafe()
            except (httpx.HTTPError, KeyError, ValueError, zipfile.BadZipFile) as error:
                log.warning("bizSAFE register unavailable: %s", error)
                return None
        return self._bizsafe.get(uen.upper(), NOT_LISTED)

    def _load_bizsafe(self) -> dict[str, BizSafe]:
        path = self.cache_dir / "bizsafe.json"
        if path.exists() and datetime.now(UTC).timestamp() - path.stat().st_mtime < 7 * 86400:
            raw = json.loads(path.read_text())
        else:
            page = self._get(BIZSAFE_PAGE)
            link = re.search(r'href="([^"]*bizsafe-self-help_\d{8}\.xlsx)"', page)
            if not link:
                raise ValueError(f"bizSAFE export link not found on {BIZSAFE_PAGE}")
            url = link.group(1) if link.group(1).startswith("http") else f"https://www.tal.sg{link.group(1)}"
            download = self.http.get(url)
            download.raise_for_status()
            records = parse_bizsafe(download.content)
            raw = {uen: {"level": r.level, "expires": r.expires.isoformat() if r.expires else None, "status": r.status} for uen, r in records.items()}
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(raw))
        return {
            uen: BizSafe(level=r["level"], expires=date.fromisoformat(r["expires"]) if r["expires"] else None, status=r["status"])
            for uen, r in raw.items()
        }

    def company(self, uen: str) -> Company | None:
        def fetch():
            try:
                registers = _reference("registers.json")
                entity = self._datastore(registers["acra_entities"]["dataset"], uen)
                if entity is None:
                    return None
                name = entity["entity_name"]
                letter = name[:1].upper() if name[:1].isalpha() else "Others"
                detail = self._datastore(registers["acra_corporate_by_letter"]["datasets"][letter], uen) or {}
                codes = [detail.get("primary_ssic_code"), detail.get("secondary_ssic_code")]
                return {
                    "uen": uen,
                    "name": name,
                    "status": detail.get("entity_status_description") or entity.get("uen_status_desc", ""),
                    "activities": [[c, ssic_title(c) or "unknown SSIC code"] for c in codes if c and c.strip() not in {"", "na"}],
                }
            except (httpx.HTTPError, KeyError, ValueError) as error:
                log.warning("ACRA lookup failed for %s: %s", uen, error)
                return None

        found = self._cached(f"acra-{uen}", fetch)
        return None if found is None else Company(found["uen"], found["name"], found["status"], [tuple(a) for a in found["activities"]])

    def _get(self, url: str, **kwargs) -> str:
        """A page's text; any HTTP error raises, so a failed lookup is never read as "holds nothing"."""
        response = self.http.get(url, **kwargs)
        response.raise_for_status()
        return response.text

    def _datastore(self, dataset: str, uen: str) -> dict | None:
        response = self.http.get(DATASTORE, params={"resource_id": dataset, "filters": json.dumps({"uen": uen})})
        response.raise_for_status()
        records = response.json()["result"]["records"]
        return records[0] if records else None


# ---------------------------------------------------------------- CLI


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch licence and registration sources.")
    parser.add_argument("--gobusiness", action="store_true", help="fetch the GoBusiness licence directory")
    parser.add_argument("--uen", help="look up a company's GRA, BCA, bizSAFE and ACRA records")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    http = httpx.Client(headers={"User-Agent": BROWSER_UA}, follow_redirects=True, timeout=40)
    if args.gobusiness:
        print(json.dumps({"licences": len(fetch_gobusiness(http))}))
    if args.uen:
        registry = LiveRegistry(http)
        company = registry.company(args.uen)
        print(json.dumps({
            "company": company.__dict__ if company else None,
            "gsr": [r.model_dump(mode="json") for r in registry.gsr(args.uen) or []],
            "bca": [r.model_dump(mode="json") for r in registry.bca(args.uen) or []],
            "bizsafe": registry.bizsafe(args.uen).__dict__ if registry.bizsafe(args.uen) else None,
        }, indent=1, default=str))


if __name__ == "__main__":
    main()
