# 05 — What was cut, and why

Scope was set in two days, so every item below is a choice rather than something that got
forgotten. Each one says what would bring it back.

## Cut by design (out of scope from the plan)

| Cut | Why | What would bring it back |
|---|---|---|
| **Submitting on GeBIZ** | Submitting needs the supplier's own Singpass/CorpPass. Kopi prepares the submission and the person submits it, which is also where accountability should sit. | Nothing. Kopi should stay on this side of the line. |
| **Reading the tender documents** | The real specifications are PDFs behind the GeBIZ login. Kopi reads the public notice only, and says so on every overview and draft. | A supplier-side upload of the tender pack, parsed into the same eligibility checks and quote verification. |
| **Accounts, teams and a user database** | No personal data stored, nothing to breach, and no sign-up in the demo. The company profile and the tracker live in the browser. | Shared team profiles once more than one person bids from the same company. |
| **Email and Slack digests** | A digest is only useful once the ranking is trusted, so it comes after it. | A daily job that runs each saved profile's search and sends the new matches. |
| **Fine-tuning, or hosting a reranker** | The eval showed the off-the-shelf model plus BM25 was already the best of the methods tried (nDCG@10 0.715). | A labelled set 10× larger, then a cross-encoder reranker measured against the same eval. |
| **GeBIZ content on the open web** | Notices carry a no-republication clause, so the app is behind an access code and links back to GeBIZ. | Nothing; linking back is the right model. |

## Cut during the build

| Cut | When | Why |
|---|---|---|
| **The CLI report** (the first plan, [`plan-v1-cli.md`](plan-v1-cli.md)) | Before any code | I asked for a web copilot on my own stack: Next.js, NeedleDB, open embeddings, the Agent SDK and Modal. The CLI would have been a smaller demo of the same index. |
| **A tender-specific query instruction for Qwen3** | KP-6 | It was the most confident design choice in the plan, and the eval showed it was the worst: nDCG@10 0.444, against 0.695 for the generic instruction. It stays in the eval as a warning. |
| **Qwen3-Embedding 4B / 8B** | KP-6 | Better on MTEB, but they need a GPU on every query. 0.6B embeds a query on CPU in about 0.6 s and already beat BGE-small and BM25 on our own data. |
| **int8 quantisation of the query embedder** | KP-8 | PyTorch's int8 path needs a quantisation engine this Mac lacks and a deprecated API. After two attempts on the same bottleneck, the agent stopped. New queries stay at about 1 s; ONNX on x86 is the next thing to try. |
| **Hosted copilot in the demo on day one** | KP-12 → KP-20 | It needs a Claude OAuth token that only I can create (`claude setup-token`). Everything around it is deployed and proven. The live copilot answers with a designed 503 until the token exists, and the same agent ran end to end locally against the live API. |
| **Independent review after milestone 1** | Milestones 2–4 | The board assigned no reviewers after milestone 1. Those tasks rest on their tests, the eval and live runs instead. That is weaker, and the journal says so. |
| **Full session transcripts** | KP-16 | The published logs drop thinking, images, mailbox results and the privacy review's own shell calls, and they mask secrets and personal data. [`logs/INDEX.md`](../logs/INDEX.md) lists exactly what was removed. |

## Known weak spots I kept, on purpose

These are in the README under *Weakest parts*, each with its fix:

- **Quotes are checked for existence, not relevance.**
- **Injected text can buy retrieval rank**, though the model ignores it.
- **About 1 s latency for a new query.**
