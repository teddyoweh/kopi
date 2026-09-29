"""Scrape open opportunities from GeBIZ's public listing and notice pages.

The listing is a JSF (Mojarra) page: the full "Open" tab is at BOListing.xhtml?origin=menu,
ten cards per page, and paging is a partial-ajax postback carrying the form's ViewState.
Notice pages open without a login at directlink.xhtml?docCode=<no>.

Contact persons are removed from the page text before anything is parsed, so names,
emails and phone numbers of officials never reach a Notice, the cache or the index.
"""

from __future__ import annotations

import argparse
import hashlib
import html as htmllib
import json
import logging
import re
import time
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx
from selectolax.parser import HTMLParser

from kopi.config import DATA_DIR
from kopi.models import BcaWorkhead, GraHead, Notice, NoticeStatus

log = logging.getLogger(__name__)

BASE = "https://www.gebiz.gov.sg"
LISTING = f"{BASE}/ptn/opportunity/BOListing.xhtml"
DETAIL = f"{BASE}/ptn/opportunity/directlink.xhtml?docCode={{doc_no}}"
USER_AGENT = "kopi/0.1 (tender copilot; +https://github.com/teddyoweh/kopi)"
SGT = timezone(timedelta(hours=8))

HEADER = re.compile(r"^(?P<type>[A-Za-z][A-Za-z ]*?)\s+-\s+(?P<doc>[A-Z0-9]{12,})(?:\s*/\s*(?P<ref>.+))?$")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PHONE = re.compile(r"(?<![\d$])(?:\+?65[\s-]?)?[3689]\d{3}[\s-]?\d{4}(?!\d)")
GRA = re.compile(r"^(?P<code>EPU/[A-Z]{3}/\d{2})\s*-\s*(?P<label>.+?)\s*(?:\[\s*(?P<cap>[^\]]*)\])?$")
BCA = re.compile(r"^(?P<code>(?:CW|CR|ME|MW|SY|RW)\d{2})\s*-\s*(?P<label>.+?)\s*(?:\[\s*(?P<cap>[^\]]*)\])?$")
CAPACITY = re.compile(r"\$\s*(?P<amount>[\d,]+)\s*\((?:[A-Z]+\s+)?(?P<grade>[A-Z]\d{1,2}|L\d)\)")

# Sections whose lines are dropped wholesale: they name officials and give their contacts.
CONTACT_SECTIONS = ("WHO TO CONTACT", "AWARDING AGENCY", "CONTACT PERSON'S DETAILS")
# Headings that end a dropped section.
SECTION_HEADINGS = ("TENDER DOCUMENTS", "WHO TO CONTACT", "AWARDING AGENCY", "CONTACT PERSON'S DETAILS", "ITEMS TO RESPOND")
NOISE = {"LOADING", "LOADING...", "Add to Calendar", "Email", "Print"}

LABELS = {
    "Agency": "agency",
    "Published": "published",
    "Procurement Category": "category",
    "Procurement Type": "procurement_type",
    "Procurement Method": "procurement_method",
    "Procurement Nature": "procurement_nature",
    "Two Envelope Bidding": "two_envelope",
    "Covered under WTO-GPA/FTA": "wto_gpa",
    "Remarks": "remarks",
}


@dataclass
class ListingCard:
    doc_no: str
    type: str
    status: str
    title: str
    agency: str
    published: datetime
    closing: datetime
    category: str


# ---------------------------------------------------------------- text helpers


def page_lines(markup: str) -> list[str]:
    """Visible text of a page (or a partial-response fragment), one trimmed line per text node."""
    tree = HTMLParser(markup)
    for node in tree.css("script, style, noscript"):
        node.decompose()
    root = tree.body or tree.root
    text = root.text(separator="\n") if root else ""
    lines = (htmllib.unescape(line).strip() for line in text.split("\n"))
    return [line for line in lines if line and line not in NOISE]


def drop_contacts(lines: list[str]) -> list[str]:
    """Remove the contact sections, then scrub any stray email or phone number."""
    kept, skipping = [], False
    for line in lines:
        heading = line.upper()
        if heading.startswith(SECTION_HEADINGS):
            skipping = heading.startswith(CONTACT_SECTIONS)
        if not skipping:
            kept.append(PHONE.sub("[phone removed]", EMAIL.sub("[email removed]", line)))
    return kept


def parse_when(date_text: str, time_text: str = "") -> datetime:
    text = f"{date_text} {time_text}".strip().upper().replace("  ", " ")
    text = re.sub(r"(\d)(AM|PM)$", r"\1 \2", text)
    for fmt in ("%d %b %Y %I:%M %p", "%d %b %Y"):
        try:
            return datetime.strptime(text.title() if fmt == "%d %b %Y" else text, fmt).replace(tzinfo=SGT)
        except ValueError:
            continue
    raise ValueError(f"unrecognised GeBIZ date: {text!r}")


def to_status(label: str) -> NoticeStatus:
    label = label.strip().upper()
    if label == "OPEN":
        return NoticeStatus.OPEN
    if "AWARD" in label:
        return NoticeStatus.AWARDED
    if "CANCEL" in label:
        return NoticeStatus.CANCELLED
    return NoticeStatus.CLOSED


def yes_no(value: str | None) -> bool | None:
    if value is None:
        return None
    return {"YES": True, "NO": False}.get(value.strip().upper())


# ---------------------------------------------------------------- listing


def parse_listing(markup: str) -> list[ListingCard]:
    lines = page_lines(markup)
    cards: list[ListingCard] = []
    starts = [i for i, line in enumerate(lines) if HEADER.match(line)]
    for n, start in enumerate(starts):
        block = lines[start : starts[n + 1] if n + 1 < len(starts) else len(lines)]
        card = _card(block)
        if card:
            cards.append(card)
    return cards


def _card(block: list[str]) -> ListingCard | None:
    header = HEADER.match(block[0])
    if not header or len(block) < 4:
        return None
    fields = _labelled(block)
    closing_at = block.index("Closing on") if "Closing on" in block else None
    if closing_at is None or "Agency" not in fields:
        return None
    closing_time = block[closing_at + 2] if re.match(r"^\d{1,2}:\d{2}\s*[AP]M$", block[closing_at + 2]) else ""
    return ListingCard(
        doc_no=header["doc"],
        type=header["type"].strip(),
        status=block[1],
        title=block[2],
        agency=fields["Agency"],
        published=parse_when(fields["Published"]),
        closing=parse_when(block[closing_at + 1], closing_time),
        category=fields.get("Procurement Category", ""),
    )


def _labelled(lines: list[str]) -> dict[str, str]:
    """`Label` followed by its value, for the labels GeBIZ uses on cards and notices."""
    known = {"Agency", "Published", "Procurement Category", *LABELS}
    found: dict[str, str] = {}
    for i, line in enumerate(lines[:-1]):
        if line in known and line not in found:
            found[line] = lines[i + 1]
    return found


# ---------------------------------------------------------------- detail


def parse_detail(markup: str, card: ListingCard | None = None) -> Notice:
    lines = drop_contacts(page_lines(markup))
    doc_at = next(i for i, line in enumerate(lines) if re.fullmatch(r"[A-Z0-9]{12,}", line) and lines[i + 1] == "Overview")
    doc_no = lines[doc_at]
    title = lines[doc_at + 2]
    details_at = lines.index("OPPORTUNITY DETAILS")
    description = " ".join(lines[doc_at + 3 : details_at]).strip()
    body = lines[details_at:]
    fields = _detail_fields(body)
    closing = _closing(body)
    gra, bca = _heads(body)
    status_label = next((line for line in body[1:4] if line.isupper() and len(line) < 20), "OPEN")
    return Notice(
        doc_no=doc_no,
        type=card.type if card else _type_from(body),
        title=title,
        description=description,
        agency=fields.get("agency") or (card.agency if card else ""),
        published=parse_when(fields["published"]) if "published" in fields else card.published,
        closing=closing or card.closing,
        status=to_status(status_label),
        category=fields.get("category") or (card.category if card else ""),
        procurement_type=fields.get("procurement_type", ""),
        procurement_method=fields.get("procurement_method", ""),
        procurement_nature=fields.get("procurement_nature", ""),
        two_envelope=yes_no(fields.get("two_envelope")),
        wto_gpa=yes_no(fields.get("wto_gpa")),
        gra_heads=gra,
        bca_workheads=bca,
        items=_items(body),
        delivery_location=_delivery(body),
        url=DETAIL.format(doc_no=doc_no),
        source="live",
    )


def _detail_fields(body: list[str]) -> dict[str, str]:
    """Label → value. Some labels carry an explanatory sentence before the value; skip it."""
    found: dict[str, str] = {}
    for i, line in enumerate(body[:-1]):
        key = LABELS.get(line)
        if not key or key in found:
            continue
        value = body[i + 1]
        if value.startswith(("If the tender", "Please refer")) and i + 2 < len(body):
            value = body[i + 2]
        found[key] = "" if value in LABELS else value
    return found


def _closing(body: list[str]) -> datetime | None:
    if "Closing on" not in body:
        return None
    at = body.index("Closing on")
    time_text = body[at + 2] if re.match(r"^\d{1,2}:\d{2}\s*[AP]M$", body[at + 2]) else ""
    return parse_when(body[at + 1], time_text)


def _heads(body: list[str]) -> tuple[list[GraHead], list[BcaWorkhead]]:
    gra: list[GraHead] = []
    bca: list[BcaWorkhead] = []
    for line in body:
        if m := GRA.match(line):
            amount, grade = _capacity(m["cap"])
            gra.append(GraHead(code=m["code"], label=m["label"].strip(), capacity_sgd=amount, grade=grade))
        elif m := BCA.match(line):
            _, grade = _capacity(m["cap"])
            bca.append(BcaWorkhead(code=m["code"], grade=grade))
    return gra, bca


def _capacity(text: str | None) -> tuple[int | None, str | None]:
    if not text or not (m := CAPACITY.search(text)):
        return None, None
    return int(m["amount"].replace(",", "")), m["grade"]


def _items(body: list[str]) -> list[str]:
    items = []
    for i, line in enumerate(body[:-1]):
        if line.startswith("Mandatory to Bid:"):
            items.append(body[i + 1])
    return items


def _delivery(body: list[str]) -> str:
    for i, line in enumerate(body[:-1]):
        if line == "Location" and i + 4 < len(body):
            candidate = body[i + 4]
            if not re.fullmatch(r"\d+", candidate):
                return candidate
            return body[i + 5] if i + 5 < len(body) else ""
    return ""


def _type_from(body: list[str]) -> str:
    return "Tender" if any(line == "Tender No." for line in body) else "Quotation"


# ---------------------------------------------------------------- JSF paging


def form_fields(markup: str) -> list[tuple[str, str]]:
    """The contentForm's submittable fields as a browser would send them (no buttons)."""
    tree = HTMLParser(markup)
    form = tree.css_first("form#contentForm")
    if form is None:
        raise ValueError("contentForm not found")
    fields: list[tuple[str, str]] = []
    for node in form.css("input"):
        name, kind = node.attributes.get("name"), (node.attributes.get("type") or "text").lower()
        if name and kind not in {"submit", "button", "image", "checkbox", "radio"}:
            fields.append((name, node.attributes.get("value") or ""))
    for node in form.css("select"):
        chosen = node.css_first("option[selected]") or node.css_first("option")
        if name := node.attributes.get("name"):
            fields.append((name, chosen.attributes.get("value", "") if chosen else ""))
    return fields


NEXT_BUTTON = re.compile(r"name=\"(?P<name>contentForm:[^\"]+_Next_\d+)\"[^>]*?mojarra\.ab\(this,event,\\?'action\\?',\\?'(?P<execute>[^'\\]+)\\?',\\?'(?P<render>[^'\\]+)\\?'")


def next_page_request(markup: str, viewstate: str | None = None) -> list[tuple[str, str]] | None:
    """Form data for the "Next" partial-ajax postback, or None on the last page."""
    button = NEXT_BUTTON.search(markup)
    if not button:
        return None
    fields = form_fields(markup)
    if viewstate:
        fields = [(k, v) for k, v in fields if "ViewState" not in k] + [("javax.faces.ViewState", viewstate)]
    return fields + [
        (button["name"], "Next"),
        ("javax.faces.source", button["name"]),
        ("javax.faces.partial.event", "click"),
        ("javax.faces.partial.execute", button["execute"]),
        ("javax.faces.partial.render", button["render"]),
        ("javax.faces.behavior.event", "action"),
        ("javax.faces.partial.ajax", "true"),
    ]


def parse_partial(xml: str) -> tuple[str, str | None]:
    """The updated contentForm markup and the new ViewState from a Mojarra partial-response."""
    form = re.search(r'<update id="contentForm"><!\[CDATA\[(.*?)\]\]></update>', xml, re.S)
    state = re.search(r'<update id="[^"]*javax\.faces\.ViewState[^"]*"><!\[CDATA\[(.*?)\]\]></update>', xml, re.S)
    if not form:
        raise ValueError("partial response carried no contentForm update")
    return form.group(1), state.group(1) if state else None


def open_count(markup: str) -> int | None:
    m = re.search(r"Open \((\d[\d,]*)\)", markup)
    return int(m.group(1).replace(",", "")) if m else None


# ---------------------------------------------------------------- fetching


class GebizClient:
    """A polite session: one request per `delay` seconds, detail pages cached on disk."""

    def __init__(self, cache_dir: Path = DATA_DIR / "cache" / "gebiz", delay: float = 1.0, http: httpx.Client | None = None):
        self.http = http or httpx.Client(headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=30)
        self.cache_dir = cache_dir
        self.delay = delay
        self._last = 0.0

    def _wait(self) -> None:
        pause = self.delay - (time.monotonic() - self._last)
        if pause > 0:
            time.sleep(pause)
        self._last = time.monotonic()

    def listing(self, limit: int | None = None) -> Iterator[ListingCard]:
        """Every card on the Open tab, page by page, until `limit` or the last page."""
        self._wait()
        page = self.http.get(LISTING, params={"origin": "menu"}).text
        log.info("GeBIZ lists %s open opportunities", open_count(page))
        seen: set[str] = set()
        viewstate: str | None = None
        while True:
            for card in parse_listing(page):
                if card.doc_no in seen:
                    continue
                seen.add(card.doc_no)
                yield card
                if limit and len(seen) >= limit:
                    return
            request = next_page_request(page, viewstate)
            if request is None:
                return
            self._wait()
            try:
                response = self.http.post(
                    LISTING,
                    content=urlencode(request),
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "Faces-Request": "partial/ajax",
                        "X-Requested-With": "XMLHttpRequest",
                    },
                )
                page, viewstate = parse_partial(response.text)
            except (httpx.HTTPError, ValueError) as error:
                log.warning("paging stopped after %d notices: %s", len(seen), error)
                return

    def detail_html(self, doc_no: str, refresh: bool = False) -> str:
        path = self.cache_dir / f"{hashlib.sha256(doc_no.encode()).hexdigest()[:16]}.html"
        if path.exists() and not refresh:
            return path.read_text()
        self._wait()
        markup = self.http.get(DETAIL.format(doc_no=doc_no)).text
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(markup)
        return markup


def fetch_open(limit: int | None = None, out_dir: Path = DATA_DIR / "notices", client: GebizClient | None = None) -> list[Notice]:
    """Fetch open opportunities and write one JSON per notice.

    A notice already on disk is refetched only when its closing time changed, which is how
    GeBIZ amendments usually show on the listing.
    """
    client = client or GebizClient()
    out_dir.mkdir(parents=True, exist_ok=True)
    notices: list[Notice] = []
    for card in client.listing(limit):
        path = out_dir / f"{card.doc_no}.json"
        if path.exists():
            existing = Notice.model_validate_json(path.read_text())
            if existing.closing == card.closing:
                notices.append(existing)
                continue
        try:
            notice = parse_detail(client.detail_html(card.doc_no, refresh=path.exists()), card)
        except (ValueError, StopIteration, KeyError, IndexError) as error:
            log.warning("could not parse %s: %s", card.doc_no, error)
            continue
        path.write_text(notice.model_dump_json(indent=1))
        notices.append(notice)
    return notices


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch open GeBIZ opportunities.")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--out", type=Path, default=DATA_DIR / "notices")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    notices = fetch_open(args.limit, args.out)
    print(json.dumps({"written": len(notices), "out": str(args.out)}))


if __name__ == "__main__":
    main()
