"""The data contract shared by the scraper, the index, the API, the agent and the web app.

Changes here are additive only: the web app's types are generated from these models.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class NoticeStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"
    AWARDED = "awarded"
    CANCELLED = "cancelled"


class GraHead(BaseModel):
    """A GRA (EPU) supply head a notice requires, with the tendering capacity it names."""

    code: str = Field(examples=["EPU/CMP/10"])
    label: str = ""
    capacity_sgd: int | None = Field(None, description="Tendering capacity named on the notice, e.g. 250000")
    grade: str | None = Field(None, examples=["S3"])


class BcaWorkhead(BaseModel):
    code: str = Field(examples=["CW01"])
    grade: str | None = Field(None, examples=["B2"])


class Notice(BaseModel):
    """One GeBIZ opportunity. Contact persons are never part of it."""

    doc_no: str
    type: str = Field(examples=["Quotation", "Tender", "Tender Lite"])
    title: str
    description: str = ""
    agency: str
    published: datetime
    closing: datetime
    status: NoticeStatus = NoticeStatus.OPEN
    category: str = ""
    procurement_type: str = ""
    procurement_method: str = ""
    procurement_nature: str = ""
    two_envelope: bool | None = None
    wto_gpa: bool | None = None
    gra_heads: list[GraHead] = []
    bca_workheads: list[BcaWorkhead] = []
    licences_mentioned: list[str] = []
    items: list[str] = []
    delivery_location: str = ""
    url: str
    source: Literal["live", "fixture"] = "live"


class NoticeSummary(BaseModel):
    """The listing view of a notice."""

    doc_no: str
    type: str
    title: str
    agency: str
    published: datetime
    closing: datetime
    status: NoticeStatus
    category: str
    url: str


class Award(BaseModel):
    """One row of data.gov.sg's GeBIZ awards dataset (rows are per supplier or per item)."""

    tender_no: str
    tender_description: str
    agency: str
    award_date: date | None
    tender_detail_status: str
    supplier_name: str
    awarded_amt: float | None


class AwardTender(BaseModel):
    """Award rows grouped by tender number."""

    tender_no: str
    description: str
    agency: str
    award_date: date | None
    status: str
    suppliers: list[str]
    total_amount: float | None


class Licence(BaseModel):
    id: str
    name: str
    agency: str
    description: str = ""
    who_needs_it: str = ""
    fee: str = ""
    processing_time: str = ""
    validity: str = ""
    prerequisites: list[str] = []
    url: str


class Registration(BaseModel):
    """A registration the company holds: a GRA supply head or a BCA workhead, with grade."""

    code: str
    grade: str | None = None
    expires: date | None = None


class ValueBand(BaseModel):
    min_sgd: int | None = None
    max_sgd: int | None = None


class Profile(BaseModel):
    """The company Kopi works for. `None` means "we do not know", never "no"."""

    id: str
    name: str
    uen: str | None = None
    summary: str
    capabilities: list[str] = []
    past_work: list[str] = []
    gra_registrations: list[Registration] | None = None
    bca_registrations: list[Registration] | None = None
    licences_held: list[str] | None = None
    bizsafe_level: str | None = None
    value_band_sgd: ValueBand = ValueBand()


class SearchHit(BaseModel):
    notice: NoticeSummary
    score: float = Field(description="0..1, higher is closer")
    highlights: list[str] = []


class SearchResponse(BaseModel):
    query: str
    total: int
    hits: list[SearchHit]


class EligibilityStatus(StrEnum):
    MET = "met"
    UNMET = "unmet"
    UNKNOWN = "unknown"


class EligibilityCheck(BaseModel):
    kind: Literal["closing", "gra", "bca", "licence", "value", "company"]
    requirement: str
    status: EligibilityStatus
    reason: str
    source_url: str | None = None


class AwardExample(BaseModel):
    tender_no: str
    description: str
    agency: str
    year: int | None
    amount: float | None
    suppliers: list[str]


class SupplierWins(BaseModel):
    supplier: str
    wins: int


class MarketContext(BaseModel):
    similar_count: int
    median_amount: float | None
    p25_amount: float | None
    p75_amount: float | None
    top_suppliers: list[SupplierWins]
    agency_incumbents: list[SupplierWins]
    no_award_share: float | None
    examples: list[AwardExample]


class TenderDetail(BaseModel):
    notice: Notice
    eligibility: list[EligibilityCheck]
    market: MarketContext | None


class Recommendation(StrEnum):
    BID = "BID"
    MAYBE = "MAYBE"
    NO_BID = "NO_BID"


class Reason(BaseModel):
    point: str
    quote: str = Field(description="Verbatim text from the notice or profile")
    verified: bool = False
    found_in: Literal["notice", "profile"] | None = Field(
        default=None, description="Where code found the quote word for word; None when it wasn't found"
    )


class Fit(BaseModel):
    score: int = Field(ge=0, le=100)
    recommendation: Recommendation
    reasons: list[Reason]


class KeyDate(BaseModel):
    label: str
    at: datetime


class Overview(BaseModel):
    doc_no: str
    profile_id: str
    summary: str
    buying: str
    who_can_bid: str
    fit: Fit
    key_dates: list[KeyDate] = []
    risks: list[str] = []
    questions_for_agency: list[str] = []
    unverified_quotes: int = 0
    model: str = ""
    generated_at: datetime


class ChecklistItem(BaseModel):
    id: str
    label: str
    detail: str = ""
    source: Literal["notice", "eligibility", "drafting", "submission"]
    due: datetime | None = None


class ChatEventType(StrEnum):
    TEXT = "text"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    FILE = "file"
    WRITING = "writing"  # the next piece of a draft while the model is still writing it: `file` and `text`
    DONE = "done"
    ERROR = "error"


class ChatEvent(BaseModel):
    """One line the agent runner prints and the API forwards as an SSE event."""

    type: ChatEventType
    text: str | None = None
    tool: str | None = None
    input: dict | None = None
    summary: str | None = None
    file: str | None = None
    session_id: str | None = None
    cost_usd: float | None = None


class AuthRequest(BaseModel):
    code: str


class AuthResponse(BaseModel):
    token: str
    expires_at: datetime


class EligibilityRequest(BaseModel):
    doc_no: str
    profile: Profile


class OverviewRequest(BaseModel):
    profile: Profile


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    profile: Profile
    doc_no: str | None = Field(None, description="The tender the conversation is about, if any")
    bid: bool = Field(False, description="A bid session: the copilot works the bid on doc_no, with a bid memory")
    autopilot: bool = Field(False, description="With bid: take the next step of the bid without stopping to ask the person")


class SessionFile(BaseModel):
    name: str
    title: str
    size: int
    modified: datetime
    kind: Literal["draft", "upload"] = "draft"


# ---------------------------------------------------------------- search insights (KP-31)


class InsightsRequest(BaseModel):
    doc_nos: list[str] = Field(min_length=1, max_length=25)
    profile: Profile
    query: str | None = Field(None, max_length=300, description="The search the cards came from, for the snippet")


class EligibilitySummary(BaseModel):
    met: int
    unmet: int
    unknown: int
    blocker: EligibilityCheck | None = Field(None, description="The first unmet check")
    open_question: EligibilityCheck | None = Field(None, description="The first unknown check")


class MarketBand(BaseModel):
    similar_count: int
    median_amount: float | None
    p25_amount: float | None
    p75_amount: float | None


class TenderInsight(BaseModel):
    """What a search card shows beyond the summary, for one company profile."""

    doc_no: str
    eligibility: EligibilitySummary
    snippet: str | None = Field(None, description="The description sentence closest to the query, at most 240 characters")
    items: int
    two_envelope: bool | None = None
    procurement_method: str | None = None
    market: MarketBand | None = None


# ---------------------------------------------------------------- bid sessions (KP-31)

BidStage = Literal["qualify", "clarify", "draft", "review", "submit"]


class MemoryNote(BaseModel):
    id: str
    text: str
    source: Literal["kopi", "you"]
    created: datetime


class BidMemory(BaseModel):
    """What a bid session remembers across turns and sandboxes: notes, and where the bid stands."""

    notes: list[MemoryNote] = []
    stage: BidStage | None = None
    next_step: str | None = None
    updated: datetime | None = None


class MemoryRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
