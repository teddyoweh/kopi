"""Can this company bid for this tender? Deterministic checks, one reason each.

Rules, not a model: every check compares something the notice states with something
the company profile (or a live register, when the profile has a UEN) states, and says
`unknown` whenever the profile does not say. A missing registration in the profile is
not taken to mean the company lacks it.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime

from kopi.models import BcaWorkhead, EligibilityCheck, EligibilityStatus, GraHead, Licence, Notice, Profile, Registration
from kopi.sources.licences import (
    BCA_COMPANY,
    GSR_DIRECTORY,
    NOT_IN_ACRA,
    NOT_LISTED,
    UNLIMITED,
    BizSafe,
    Company,
    LicenceRule,
    Registry,
    bca,
    bizsafe_rank,
    gsr,
    licence_rules,
    normalise_bca_grade,
    normalise_gsr_grade,
)

MET, UNMET, UNKNOWN = EligibilityStatus.MET, EligibilityStatus.UNMET, EligibilityStatus.UNKNOWN
BIZSAFE_REQUIREMENT = re.compile(r"\bbizSAFE\s*(?:level\s*)?(\d|star)\b", re.IGNORECASE)
BIZSAFE_URL = "https://www.tal.sg/wshc/programmes/bizsafe/bizsafe-e-services"
ACRA_URL = "https://data.gov.sg/datasets/d_3f960c10fed6145404ca7b821f263b87/view"


@dataclass(frozen=True)
class Facts:
    """What is known about the company: the profile's claims, replaced by live registers where they answered."""

    gra: list[Registration] | None
    bca: list[Registration] | None
    licences: list[str] | None
    bizsafe_level: str | None
    company: Company | None = None
    gra_verified: bool = False
    bca_verified: bool = False
    bizsafe_verified: bool = False
    bizsafe_note: str | None = None  # why the register shows no current certificate


def facts_for(profile: Profile, registry: Registry | None, today: date | None = None) -> Facts:
    """The profile's claims, with each live register's answer replacing the claim it covers.

    A register that answered wins even when its answer is "no": a company that claims
    bizSAFE Level 3 but is not on the register, or whose certificate expired, does not
    hold it. Only a register that could not answer (None) leaves the claim standing.
    """
    if registry is None or not profile.uen:
        return Facts(profile.gra_registrations, profile.bca_registrations, profile.licences_held, profile.bizsafe_level)
    today = today or datetime.now(UTC).date()
    gra_live, bca_live = registry.gsr(profile.uen), registry.bca(profile.uen)
    safe: BizSafe | None = registry.bizsafe(profile.uen)
    if safe is None:
        bizsafe_level, note = profile.bizsafe_level, None
    else:
        bizsafe_level, note = current_bizsafe(safe, today)
    return Facts(
        gra=gra_live if gra_live is not None else profile.gra_registrations,
        bca=bca_live if bca_live is not None else profile.bca_registrations,
        licences=profile.licences_held,
        bizsafe_level=bizsafe_level,
        company=registry.company(profile.uen),
        gra_verified=gra_live is not None,
        bca_verified=bca_live is not None,
        bizsafe_verified=safe is not None,
        bizsafe_note=note,
    )


def current_bizsafe(record: BizSafe, today: date) -> tuple[str | None, str | None]:
    """(level, None) for a current certificate, else (None, why not)."""
    if record is NOT_LISTED or not record.level:
        return None, "Not on the bizSAFE register"
    if record.status.lower() != "approved":
        return None, f"The bizSAFE register shows {bizsafe_label(record.level)} as '{record.status}'"
    if record.expires and record.expires < today:
        return None, f"{bizsafe_label(record.level)} expired on {record.expires:%d %b %Y}"
    return record.level, None


def check(
    notice: Notice,
    profile: Profile,
    *,
    now: datetime | None = None,
    registry: Registry | None = None,
    catalogue: Iterable[Licence] = (),
) -> list[EligibilityCheck]:
    """Every eligibility check for `profile` on `notice`, closing date first."""
    now = now or datetime.now(UTC)
    facts = facts_for(profile, registry, now.date())
    by_id = {lic.id: lic for lic in catalogue}
    checks = [closing_check(notice, now)]
    checks += [gra_check(head, facts, now.date()) for head in notice.gra_heads]
    checks += [bca_check(workhead, facts, now.date()) for workhead in notice.bca_workheads]
    checks += licence_checks(notice, facts, by_id)
    if (safe := bizsafe_check(notice, facts)) is not None:
        checks.append(safe)
    if registry is not None and profile.uen:
        checks.append(company_check(profile.uen, facts.company))
    return checks


# ---------------------------------------------------------------- closing


def closing_check(notice: Notice, now: datetime) -> EligibilityCheck:
    left = notice.closing - now
    if left.total_seconds() <= 0:
        return EligibilityCheck(kind="closing", requirement=f"Closes {notice.closing:%d %b %Y, %I:%M %p}", status=UNMET, reason="Closed; submissions are no longer accepted", source_url=notice.url)
    days = left.days
    when = "today" if days == 0 else f"in {days} day{'s' if days != 1 else ''}"
    return EligibilityCheck(kind="closing", requirement=f"Closes {notice.closing:%d %b %Y, %I:%M %p}", status=MET, reason=f"Open; closes {when}", source_url=notice.url)


# ---------------------------------------------------------------- GRA supply heads


def _money(amount: float | None) -> str:
    if amount is None:
        return "no stated limit"
    if amount == UNLIMITED:
        return "no upper limit"
    return f"S${amount:,.0f}"


def gra_check(head: GraHead, facts: Facts, today: date) -> EligibilityCheck:
    table = gsr()
    required = normalise_gsr_grade(head.grade) or table.grade_for(head.capacity_sgd)
    title = head.label or (table.heads[head.code].title if head.code in table.heads else "")
    requirement = f"GRA {head.code} {title}".strip() + (f" at {required} ({_money(table.capacity.get(required))}) or above" if required else "")
    source = GSR_DIRECTORY if facts.gra_verified else table.source
    verified = " (GeBIZ Supplier Directory)" if facts.gra_verified else ""

    def result(status: EligibilityStatus, reason: str) -> EligibilityCheck:
        return EligibilityCheck(kind="gra", requirement=requirement, status=status, reason=reason, source_url=source)

    if facts.gra is None:
        return result(UNKNOWN, "The profile does not list GRA registrations; add them or a UEN to check")
    held = next((r for r in facts.gra if r.code == head.code), None)
    if held is None:
        return result(UNMET, f"Not registered under {head.code}{verified}; the tender documents say whether it is a critical criterion")
    if held.expires and held.expires < today:
        return result(UNMET, f"Registration under {head.code} expired on {held.expires:%d %b %Y}{verified}")
    if required is None:
        return result(MET, f"Registered under {head.code}{verified}")
    held_grade = normalise_gsr_grade(held.grade)
    if held_grade is None:
        return result(UNKNOWN, f"Registered under {head.code}, but the grade is not recorded; the notice names {required}")
    if table.rank(held_grade) >= table.rank(required):
        return result(MET, f"Registered at {held_grade} ({_money(table.capacity[held_grade])}){verified}")
    return result(UNMET, f"Registered at {held_grade} ({_money(table.capacity[held_grade])}){verified}, below the {required} the notice names")


# ---------------------------------------------------------------- BCA workheads


def bca_check(workhead: BcaWorkhead, facts: Facts, today: date) -> EligibilityCheck:
    table = bca()
    title = table.titles.get(workhead.code, "")
    required_limit = table.limit(workhead.code, workhead.grade)
    requirement = f"BCA {workhead.code} {title}".strip() + (f" at {normalise_bca_grade(workhead.grade)} or above" if workhead.grade else "")
    source = BCA_COMPANY if facts.bca_verified else table.source
    verified = " (BCA e-Directory)" if facts.bca_verified else ""

    def result(status: EligibilityStatus, reason: str) -> EligibilityCheck:
        return EligibilityCheck(kind="bca", requirement=requirement, status=status, reason=reason, source_url=source)

    if facts.bca is None:
        return result(UNKNOWN, "The profile does not list BCA registrations; add them or a UEN to check")
    held = next((r for r in facts.bca if r.code == workhead.code), None)
    if held is None:
        return result(UNMET, f"Not registered under BCA workhead {workhead.code}{verified}")
    if held.expires and held.expires < today:
        return result(UNMET, f"BCA {workhead.code} registration expired on {held.expires:%d %b %Y}{verified}")
    if table.group(workhead.code) is None:
        return result(MET, f"Registered under {workhead.code}{verified}; BCA publishes no tendering limit for this workhead")
    if required_limit is None:
        return result(MET, f"Registered under {workhead.code} at {held.grade}{verified}")
    held_limit = table.limit(workhead.code, held.grade)
    if held_limit is None:
        return result(UNKNOWN, f"Registered under {workhead.code}, but grade '{held.grade}' is not one BCA publishes a limit for")
    if held_limit >= required_limit:
        return result(MET, f"Registered at {normalise_bca_grade(held.grade)} (tendering limit {_money(held_limit)}){verified}")
    return result(UNMET, f"Registered at {normalise_bca_grade(held.grade)} (limit {_money(held_limit)}){verified}, below {normalise_bca_grade(workhead.grade)} ({_money(required_limit)})")


# ---------------------------------------------------------------- licences


def notice_text(notice: Notice) -> str:
    return " ".join([notice.title, notice.description, *notice.items, *notice.licences_mentioned])


def implied_licences(notice: Notice) -> list[tuple[LicenceRule, str]]:
    """Licence rules this notice triggers, with the reason each one fired."""
    text, heads = notice_text(notice), {h.code for h in notice.gra_heads}
    found = []
    for rule in licence_rules():
        if reason := rule.triggered_by(text, notice.category, heads):
            found.append((rule, reason))
    return found


GENERIC = {"licence", "license", "licences", "certificate", "certification", "registration", "permit", "the", "of", "and", "for", "a"}


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower())) - GENERIC


def holds(held: list[str], names: Iterable[str]) -> str | None:
    """The held licence whose meaningful words cover one of `names` (or are covered by it).

    Generic words ("licence", "certificate") do not count, and a held name must carry at
    least two meaningful words to match a longer requirement, so "Licence" or "Business
    Licence" never passes for "Cleaning Business Licence".
    """
    targets = [w for w in (_words(n) for n in names if n) if w]
    for licence in held:
        have = _words(licence)
        if have and any(t <= have or (len(have) > 1 and have <= t) for t in targets):
            return licence
    return None


def licence_checks(notice: Notice, facts: Facts, catalogue: dict[str, Licence]) -> list[EligibilityCheck]:
    checks = []
    covered: set[str] = set()
    for rule, trigger in implied_licences(notice):
        names = (rule.licence, *rule.aliases)
        covered.update(m for m in notice.licences_mentioned if holds([m], names))
        checks.append(_rule_check(rule, trigger, facts, catalogue.get(rule.gobusiness or "")))
    for mentioned in notice.licences_mentioned:
        if mentioned in covered or BIZSAFE_REQUIREMENT.search(mentioned):
            continue
        checks.append(_named_check(mentioned, facts, notice.url))
    return checks


def _how_to_get(rule: LicenceRule, entry: Licence | None) -> str:
    if entry is None:
        return f"Apply to {rule.agency}"
    detail = "; ".join(x for x in (entry.processing_time, entry.fee.splitlines()[0] if entry.fee else "") if x)
    return f"Apply to {entry.agency}" + (f" ({detail})" if detail else "")


def _rule_check(rule: LicenceRule, trigger: str, facts: Facts, entry: Licence | None) -> EligibilityCheck:
    requirement = f"{rule.licence} ({rule.agency})"

    def result(status: EligibilityStatus, reason: str) -> EligibilityCheck:
        return EligibilityCheck(kind="licence", requirement=requirement, status=status, reason=reason, source_url=rule.url)

    if facts.licences is None:
        return result(UNKNOWN, f"Implied by {trigger}; the profile does not list licences held")
    if held := holds(facts.licences, (rule.licence, *rule.aliases)):
        return result(MET, f"Held: {held}")
    if rule.certainty == "check":
        return result(UNKNOWN, f"May be needed, implied by {trigger}. {rule.why}")
    return result(UNMET, f"Not held; implied by {trigger}. {_how_to_get(rule, entry)}")


def _named_check(mentioned: str, facts: Facts, url: str) -> EligibilityCheck:
    requirement = f"{mentioned} (named in the notice)"
    if facts.licences is None:
        return EligibilityCheck(kind="licence", requirement=requirement, status=UNKNOWN, reason="The profile does not list licences held", source_url=url)
    if held := holds(facts.licences, [mentioned, re.sub(r"\s*\(.*?\)", "", mentioned)]):
        return EligibilityCheck(kind="licence", requirement=requirement, status=MET, reason=f"Held: {held}", source_url=url)
    return EligibilityCheck(kind="licence", requirement=requirement, status=UNMET, reason="The notice names it and the profile does not list it", source_url=url)


# ---------------------------------------------------------------- bizSAFE


def bizsafe_check(notice: Notice, facts: Facts) -> EligibilityCheck | None:
    match = BIZSAFE_REQUIREMENT.search(notice_text(notice))
    if not match:
        return None
    wanted = match.group(1).lower()
    label = "bizSAFE Star" if wanted == "star" else f"bizSAFE Level {wanted}"
    requirement = f"{label} or above"
    verified = " (bizSAFE register)" if facts.bizsafe_verified else ""

    def result(status: EligibilityStatus, reason: str) -> EligibilityCheck:
        return EligibilityCheck(kind="licence", requirement=requirement, status=status, reason=reason, source_url=BIZSAFE_URL)

    held_rank, wanted_rank = bizsafe_rank(facts.bizsafe_level), bizsafe_rank(wanted)
    if facts.bizsafe_level is None:
        reason = (facts.bizsafe_note or "No current bizSAFE certificate") if facts.bizsafe_verified else "The profile does not state a bizSAFE level"
        return result(UNMET if facts.bizsafe_verified else UNKNOWN, reason)
    if held_rank is None:
        return result(UNKNOWN, f"bizSAFE '{facts.bizsafe_level}' is not a certification level")
    held = bizsafe_label(facts.bizsafe_level)
    if held_rank >= wanted_rank:
        return result(MET, f"Holds {held}{verified}")
    return result(UNMET, f"Holds {held}{verified}, below {label}")


def bizsafe_label(level: str) -> str:
    """'3', 'Level 3' and 'Level Star' all read as 'bizSAFE Level 3' / 'bizSAFE Star'."""
    text = level.strip().lower().removeprefix("level").strip()
    return "bizSAFE Star" if text == "star" else f"bizSAFE Level {text}"


# ---------------------------------------------------------------- company status (ACRA)


def company_check(uen: str, company: Company | None) -> EligibilityCheck:
    requirement = f"UEN {uen} is a live entity"
    if company is None:
        return EligibilityCheck(kind="company", requirement=requirement, status=UNKNOWN, reason="Could not reach ACRA's open data; try again later", source_url=ACRA_URL)
    if company.status == NOT_IN_ACRA:
        return EligibilityCheck(kind="company", requirement=requirement, status=UNKNOWN, reason="ACRA's open data has no entity with this UEN; check the number", source_url=ACRA_URL)
    activity = f"; activity {company.activities[0][0]} {company.activities[0][1]}" if company.activities else ""
    if company.live is True:
        return EligibilityCheck(kind="company", requirement=requirement, status=MET, reason=f"{company.name}: {company.status}{activity}", source_url=ACRA_URL)
    if company.live is False:
        return EligibilityCheck(kind="company", requirement=requirement, status=UNMET, reason=f"{company.name}: {company.status}", source_url=ACRA_URL)
    return EligibilityCheck(kind="company", requirement=requirement, status=UNKNOWN, reason=f"{company.name}: status '{company.status}'", source_url=ACRA_URL)
