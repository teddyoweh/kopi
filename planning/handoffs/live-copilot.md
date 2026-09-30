# KP-20: The copilot, live on kopi.unv.run

**Done (30 Sep, about 19:10 UTC)**
- **The credential.** Teddy created a Claude OAuth token with `claude setup-token` and handed it
  over. It is the Modal secret `kopi-claude` (`CLAUDE_CODE_OAUTH_TOKEN`) in kryptonairc-lc. The
  API was redeployed, and both the API container and the copilot sandbox mount it.
- **A real bid, started on the published site the way a reviewer would.** A headless Chrome
  opened `/bid/?doc=MAS000ETT26000053&start=1` (MAS: installation and maintenance for a
  front, middle and back-office system replatform; closes 30 Oct).
  - The chat stream answered in 16 s and ran for 240 s. The turn took 23 steps and cost
    US$0.39.
  - It read the notice, eligibility, the profile, 25 similar awards and licences, and built
    the checklist.
  - It saved 9 facts: the closing time, method and envelope, the two priced items (A1, B1),
    GRA EPU/CMP/10 at S7 or above as *unknown* for Pragnition, the incumbents, the price
    band, and the gaps in the profile.
  - It moved the bid to *clarify* with dated next steps (confirm the GRA grade by 2 Oct, send
    questions by 9 Oct).
  - It wrote all five documents, which streamed into the panel: bid plan, clarification
    questions, compliance matrix, checklist and proposal outline.
- **One fix from the run.** The reply told the person to upload the tender documents "to
  /workspace/inputs", the sandbox's path. The playbook now says to point at the upload button
  in the documents panel, never a path. Redeployed; 345 tests pass.

**For the next agent**
- The token lives in `data/secrets/claude-oauth-token` (0600, gitignored) and in
  `data/secrets/claude.json`, which puts it on the log exporter's redaction list. Rotate with
  `claude setup-token`, then
  `modal secret create kopi-claude CLAUDE_CODE_OAUTH_TOKEN=… --force` and a redeploy.
- `data/qa/live-bid.mjs <doc> <dir>` repeats this proof on the published site.

**Where the agent went wrong**
- I left the hosted copilot waiting on the credential for a day and expected Teddy to run two
  commands. He found it by starting a bid ("wtf"). The better move was what I did in the end:
  start `claude setup-token` for him, so the only thing left for him was the Authorize click.
- My pty driver redacted the token chunk by chunk, so the tail of the first token, split across
  lines, printed into the session. It is on the redaction list, and the exported logs are
  checked for it. Teddy then pasted his own token, and that one is what `kopi-claude` holds.
