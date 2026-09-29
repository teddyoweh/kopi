# Plan v1 — CLI triage (superseded)

Written 29 Sep 2026 before the product call. Kept because the change is part of the story:
v1 was a zero-infrastructure CLI that ranked GeBIZ notices and wrote an HTML report.
After reviewing it I widened the product to a web copilot (see 03-plan.md and 02-decisions.md, D1).

## Summary
A CLI that reads today's Singapore GeBIZ procurement notices against a supplier's capability profile and returns a ranked bid / maybe / no-bid shortlist with verified evidence and past-award market context. Built for the Pragnition AI-Native Builder assessment.

## Foundation and data
Goal: `uv run triage fetch --limit 20` writes 20 real, PII-free notices from today's GeBIZ to data/notices/; `uv run triage awards` caches all 18,464 awards; `uv run triage market "data analytics platform"` prints similar-award stats; `uv run pytest -q` is green with no network.

- **Contract: package, models, CLI, fixtures, profiles** — check: `uv run pytest -q tests/test_models.py tests/test_text.py && uv run triage --help`
- **Live GeBIZ scraper with PII stripped** — check: `uv run pytest -q tests/test_gebiz.py`
- **Awards dataset and market context** — check: `uv run pytest -q tests/test_awards.py tests/test_market.py && uv run triage market "data analytics platform" --offline`

## Triage engine
Goal: `uv run triage run --source fixtures --profile profiles/pragnition.yaml --backend replay` prints a ranked shortlist where every assessment's quotes are verified, the two prompt-injection fixtures do not change behaviour, and `make eval` prints precision@10 for BM25 alone vs BM25 + Claude rerank on labelled real award titles.

- **Prefilter: eligibility gates and relevance** — check: `uv run pytest -q tests/test_prefilter.py`
- **Claude assessment: backends, schema, verified evidence** — check: `uv run pytest -q tests/test_llm.py`
- **Run pipeline and recorded replay for fixtures** — check: `uv run pytest -q && uv run triage run --source fixtures --profile profiles/pragnition.yaml --backend replay`
- **Eval on labelled real award titles** — check: `uv run python evals/run_eval.py --backend replay`

## Report and ship
Goal: `make demo` on a clean clone with no key and no network writes out/report.html and out/memos/; a live run on that day's GeBIZ against the Pragnition profile produced a real report (screenshots in artifacts/media/); README and planning/ are complete; redacted session logs are in logs/; the repo is public on GitHub with CI green.

- **HTML report and markdown memos** — check: `uv run pytest -q tests/test_report.py && make demo && test -s out/report.html`
- **Redacted session-log export** — check: `uv run pytest -q tests/test_export_logs.py`
- **README, decisions, CI** — check: `uv run pytest -q && make demo && test -s README.md`
- **Live run on today's GeBIZ and publish the repo** — check: `gh repo view teddyoweh/gebiz-triage --json visibility -q .visibility && gh run list -R teddyoweh/gebiz-triage -L 1 --json conclusion -q '.[0].conclusion'`

## Demo film
Goal: A 3–4 minute MP4 in artifacts/media/ that covers, in order: what it does (live run), AI tools used, how the agents planned/implemented/debugged, what was built and fixed, what was cut, the weakest part and what's next — with a natural voiceover and real screen footage.

- **Demo script and screen footage** — check: `test -s planning/06-demo-script.md && ls artifacts/media/gebiz-triage-demo/*.mp4`
- **Voiceover, cut and render** — check: `ls artifacts/media/gebiz-triage-demo.mp4`
