"""What to prepare and submit for a tender, built by rules from the notice and the eligibility checks.

Shared by the API (the Submissions page) and the copilot's `submission_checklist` tool, so
both show the same list.
"""

from __future__ import annotations

from datetime import timedelta

from kopi.models import ChecklistItem, EligibilityCheck, EligibilityStatus, Notice


def submission_checklist(notice: Notice, checks: list[EligibilityCheck]) -> list[ChecklistItem]:
    """What to prepare and send, from the notice itself. Rules, not a model."""
    unsettled = [c for c in checks if c.kind != "closing" and c.status != EligibilityStatus.MET]
    items = [
        ChecklistItem(id=f"eligibility-{n}", label=f"Settle: {c.requirement}", detail=c.reason, source="eligibility")
        for n, c in enumerate(unsettled, start=1)
    ]
    items.append(ChecklistItem(
        id="clarify", label="Send clarification questions early", source="drafting", due=notice.closing - timedelta(days=5),
        detail="Agencies answer clarifications before a deadline set in the tender documents.",
    ))
    items += [
        ChecklistItem(id=f"item-{n}", label=f"Price and respond to item {n}", detail=item, source="notice")
        for n, item in enumerate(notice.items, start=1)
    ]
    if notice.two_envelope:
        items.append(ChecklistItem(id="envelopes", label="Prepare two envelopes", source="notice",
                                   detail="The technical proposal and the price proposal are submitted separately."))
    items.append(ChecklistItem(id="documents", label="Download and read the tender documents on GeBIZ", source="notice",
                               detail="They sit behind the GeBIZ login; Kopi reads only the public notice."))
    items.append(ChecklistItem(id="submit", label="Submit on GeBIZ before closing", source="submission", due=notice.closing,
                               detail=f"Closes {notice.closing:%d %b %Y, %I:%M %p} SGT. Kopi prepares; the submission is yours."))
    return items


def checklist_text(items: list[ChecklistItem]) -> str:
    return "\n".join(f"- {i.label}" + (f" (by {i.due:%d %b %Y})" if i.due else "") + (f": {i.detail}" if i.detail else "") for i in items)
