# KP-2 — GeBIZ scraper

**Built:** `backend/kopi/sources/gebiz.py`, which reads every open GeBIZ opportunity: the
listing cards, then each notice page. It turns those into `Notice`s with no contact
details and writes them to `data/notices/<doc_no>.json`. CLI:
`uv run python -m kopi.sources.gebiz --limit N --out data/notices`. 9 tests on synthetic
pages that copy GeBIZ's structure.

**Live, 29 Sep 2026**
- The Open tab said 724. A full listing pass returned **723 unique open
  opportunities in 74 s** (73 pages). The one missing probably closed during the run.
- Categories:

  | Category | Open |
  |---|---:|
  | Services | 276 |
  | Administration & Training | 108 |
  | Construction | 100 |
  | Miscellaneous | 78 |
  | IT & Telecommunication | 50 |
  | Facilities Management | 35 |

- A 30-notice run filled every field. The contact-detail audit (emails and phone
  numbers) found nothing in any notice.
- A full detail pass is about 12 minutes at 1 request/s. That's ingest's job (KP-7).

**How GeBIZ works (so nobody relearns it)**
- **Listing URL.** `BOListing.xhtml` with no parameter shows *today's* opportunities
  only. `BOListing.xhtml?origin=menu` is the full Open tab.
- **Paging** is a Mojarra partial-ajax POST. It carries every `contentForm` field plus
  the Next button's name, and these values:
  - `javax.faces.source` = the button id;
  - `partial.execute` / `partial.render`, read from the button's `mojarra.ab(...)` onclick;
  - `partial.ajax=true`;
  - header `Faces-Request: partial/ajax`.

  The response is XML. Its `<update id="contentForm">` holds the next page, and the
  ViewState update must go into the following request. A plain full-form POST
  silently returns page 1 again.
- **Notice pages** open without a login at `directlink.xhtml?docCode=…`, which
  redirects (302) to `opportunityDetails.xhtml`. The session cookie matters.
- **One line holds every registration.** GRA supply heads and BCA workheads share the
  "GRA Supply/Work Heads" block, e.g. `SY08 - … [$8,000,000 (BCA L4)]` and
  `EPU/HWT/10 - … [$10,000,000 (EPU S8)]`. Both are parsed, with capacity and grade.
- **Quotations** have no two-envelope or WTO fields, so those stay `None`.
- **Items** on a notice page are paginated too. Only the first page of items is read.

**Decisions**
- Parse visible text lines, not CSS classes. GeBIZ's ids are generated (`j_idt828`)
  and change between deploys; the labels ("Agency", "Closing on") don't.
- **Contact details** are removed at the line level before any field is read:
  - whole sections: WHO TO CONTACT, AWARDING AGENCY, CONTACT PERSON'S DETAILS;
  - any stray email or SG phone number on any remaining line.
- **Incremental runs.** A notice on disk is refetched only when its closing time on
  the listing changed, which is how amendments usually show up.
- **Paging failure** stops the run and returns what it has, with a warning. It never
  crashes an ingest.
- **Models.** `BcaWorkhead` has no capacity field; I didn't add one (models.py is
  shared). KP-4 derives the limit from the grade table.

**Where the agent went wrong**
- **Plain POST for paging.** I first sent a normal full-form POST for "Next" and it
  came back 200 with page 1 again: no error, the same 10 documents. Comparing the doc
  sets exposed it, and the button's `onclick` showed the Mojarra ajax call.
- **Form encoding.** Passing a list of pairs to `httpx`'s `data=` crashed deep in h11.
  Fixed by sending the form url-encoded as `content=`, since repeated keys need pairs.
- **Test fake.** The incremental test failed twice because the fake notice pages all
  had one closing date, so every notice looked amended. It was a fake bug, not a
  scraper bug. Fixed by giving each fake notice the listing's closing date. I also
  dropped a title comparison that added nothing.

## Review fix (reviewer: Agent 4)
- **Concern:** the check failed on main (9 failed) because `backend/tests/data/gebiz/*`
  was never committed: `.gitignore`'s unanchored `data/` swallowed it, and `git add -A`
  dropped it without a word. My "9 passed" was true only in the worktree, which was then
  deleted. **Fixed:** the ignore pattern is anchored and the three synthetic pages are
  regenerated and committed.
- Added the two asserts the reviewer found missing: `delivery_location`, and `type`
  read from the notice when there is no listing card.
- **Lesson for every task:** after committing, run `git ls-files` on your fixtures, or
  run the check from main.
