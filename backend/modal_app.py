"""Kopi on Modal: the NeedleDB service, the ingest pipeline and the API.

    MODAL_PROFILE=kryptonairc-lc uv run --extra deploy modal deploy modal_app.py

One Volume (`kopi-data`) holds everything that must outlive a container: source caches
(GeBIZ pages, awards, licences), the embeddings as one .npz per index, NeedleDB's key
store, and the Hugging Face model cache. NeedleDB itself runs on container-local disk
and is rebuilt from the .npz files when its container starts, so no SQLite database
ever sits on a network filesystem.

Secrets (workspace kryptonairc-lc, every name prefixed kopi-):
    kopi-needledb        NEEDLEDB_API_KEY  admin key, only the NeedleDB container has it
    kopi-needledb-write  NEEDLEDB_API_KEY, NEEDLEDB_URL  write key scoped to Kopi's indexes, for ingest
    kopi-needledb-read   NEEDLEDB_API_KEY, NEEDLEDB_URL  read key, for the API
    kopi-app             KOPI_ACCESS_CODES, KOPI_SIGNING_KEY
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import modal

VOL = "/vol"
DATA = f"{VOL}/data"
VECTORS = Path(VOL) / "vectors"
NEEDLE_AUTH = Path(VOL) / "needledb" / "auth.sqlite"
NEEDLE_LOCAL = Path("/needle")
NEEDLEDB_LABEL = "kopi-needledb"
DAILY = 20 * 3600

app = modal.App("kopi")
volume = modal.Volume.from_name("kopi-data", create_if_missing=True)
BACKEND = Path(__file__).parent

base = (
    modal.Image.debian_slim(python_version="3.13")
    .apt_install("git")
    .uv_pip_install(
        "fastapi>=0.115",
        "uvicorn>=0.32",
        "httpx>=0.28",
        "selectolax>=0.3",
        "pydantic>=2.9",
        "numpy>=2.0",
        "needledb @ git+https://github.com/teddyoweh/needledb@b88f8b7",
    )
    .env({"KOPI_DATA_DIR": DATA, "HF_HOME": f"{VOL}/hf"})
)
needle_image = base.add_local_dir(BACKEND / "kopi", "/root/kopi")
gpu_image = base.uv_pip_install("torch>=2.4", "transformers>=4.51", "sentence-transformers>=3.0").add_local_dir(
    BACKEND / "kopi", "/root/kopi"
)
api_image = (
    base.uv_pip_install("torch>=2.4", index_url="https://download.pytorch.org/whl/cpu")
    .uv_pip_install("transformers>=4.51", "sentence-transformers>=3.0")
    # The model lives in the image, not on the Volume: memory-mapped weights on the Volume
    # are open files, and open files make `volume.reload()` fail, so the API would never
    # see a new ingest.
    .env({"HF_HOME": "/root/hf", "KOPI_STORE": "live", "KOPI_EMBED_DEVICE": "cpu", "KOPI_TORCH_THREADS": "4"})
    .run_commands("python -c \"from sentence_transformers import SentenceTransformer; SentenceTransformer('Qwen/Qwen3-Embedding-0.6B')\"")
    .add_local_dir(BACKEND / "kopi", "/root/kopi")
)


# The copilot's sandbox: the agent SDK (with its bundled Claude Code binary) and Kopi's
# package, nothing else. No torch, no NeedleDB client, no keys but the Claude token.
agent_image = (
    modal.Image.debian_slim(python_version="3.13")
    .uv_pip_install("httpx>=0.28", "pydantic>=2.9", "claude-agent-sdk>=0.2.161")
    .add_local_dir(BACKEND / "kopi", "/root/kopi")
)
PUBLIC_API = "https://kryptonairc-lc--kopi-api.modal.run"
SANDBOX_EGRESS = ["api.anthropic.com", "claude.ai", "kryptonairc-lc--kopi-api.modal.run"]


# ---------------------------------------------------------------- NeedleDB


@app.cls(
    image=needle_image,
    volumes={VOL: volume},
    secrets=[modal.Secret.from_name("kopi-needledb")],
    min_containers=1,
    max_containers=1,
    cpu=2.0,
    memory=4096,
    timeout=600,
)
@modal.concurrent(max_inputs=200)
class NeedleService:
    """One NeedleDB server. It is the only writer, so there is only ever one container."""

    @modal.enter()
    def load(self) -> None:
        from needledb import NeedleDBLocal

        from kopi.ingest import load_into

        shutil.rmtree(NEEDLE_LOCAL, ignore_errors=True)
        (NEEDLE_LOCAL / "_system").mkdir(parents=True)
        if NEEDLE_AUTH.exists():
            shutil.copy(NEEDLE_AUTH, NEEDLE_LOCAL / "_system" / "auth.sqlite")
        started = time.monotonic()
        with NeedleDBLocal(NEEDLE_LOCAL) as db:
            loaded = load_into(db, VECTORS)
        print(json.dumps({"loaded": loaded, "seconds": round(time.monotonic() - started, 1)}))

    @modal.web_server(8080, startup_timeout=120, label=NEEDLEDB_LABEL)
    def serve(self) -> None:
        subprocess.Popen(
            ["needledb", "serve", "--data", str(NEEDLE_LOCAL), "--host", "0.0.0.0", "--port", "8080", "--trust-proxy", "--log-level", "warning"]
        )


# ---------------------------------------------------------------- ingest


def _stale(path: Path, age: float = DAILY) -> bool:
    return not path.exists() or time.time() - path.stat().st_mtime > age


@app.function(image=needle_image, volumes={VOL: volume}, schedule=modal.Cron("15 */3 * * *"), timeout=3600)
def refresh_sources(push: bool = True) -> dict:
    """Every 3 hours: today's open GeBIZ opportunities; once a day: awards and licences."""
    import httpx

    from kopi.sources import awards, gebiz, licences

    started = time.monotonic()
    from kopi.bundle import write_bundle

    open_notices = gebiz.fetch_open(out_dir=Path(DATA) / "notices")
    (Path(DATA) / "notices" / "_open.json").write_text(json.dumps([n.doc_no for n in open_notices]))
    summary: dict = {"open_notices": len(open_notices), "bundled": write_bundle(Path(DATA) / "notices", open_notices)}
    awards_cache = Path(DATA) / "cache" / "awards.json"
    if _stale(awards_cache):
        summary["award_rows"] = len(awards.load_awards(awards_cache, refresh=True))
    catalogue = Path(DATA) / "licences" / "gobusiness.json"
    if _stale(catalogue):
        http = httpx.Client(headers={"User-Agent": licences.BROWSER_UA}, follow_redirects=True, timeout=40)
        summary["licences"] = len(licences.fetch_gobusiness(http, catalogue))
    volume.commit()
    summary["seconds"] = round(time.monotonic() - started, 1)
    print(json.dumps(summary))
    if push:
        summary["embedded"] = embed_and_push.remote()
    return summary


@app.function(image=gpu_image, gpu="L4", volumes={VOL: volume}, secrets=[modal.Secret.from_name("kopi-needledb-write")], timeout=3600)
def embed_and_push() -> list[dict]:
    """Embed whatever changed on the GPU, save the vectors, and push changed rows to NeedleDB."""
    from dataclasses import asdict

    from needledb import NeedleDB

    from kopi.embed import Embedder, award_text, licence_text, notice_text
    from kopi.index import AWARDS, LICENCES, NOTICES
    from kopi.ingest import award_records, licence_records, notice_records, refresh
    from kopi.models import Notice
    from kopi.sources.awards import group_tenders, load_awards
    from kopi.sources.licences import load_licences

    volume.reload()
    embedder = Embedder(device="cuda")
    db = NeedleDB(os.environ["NEEDLEDB_URL"], api_key=os.environ["NEEDLEDB_API_KEY"], timeout=120)
    notices_dir = Path(DATA) / "notices"
    open_ids = json.loads((notices_dir / "_open.json").read_text())
    notices = [Notice.model_validate_json((notices_dir / f"{doc}.json").read_text()) for doc in open_ids]
    reports = [
        refresh(NOTICES, notice_records(notices, notice_text), VECTORS, embedder.embed_documents, db.Index(NOTICES)),
        refresh(AWARDS, award_records(group_tenders(load_awards(Path(DATA) / "cache" / "awards.json")), award_text), VECTORS, embedder.embed_documents, db.Index(AWARDS)),
        refresh(LICENCES, licence_records(load_licences(Path(DATA) / "licences" / "gobusiness.json"), licence_text), VECTORS, embedder.embed_documents, db.Index(LICENCES)),
    ]
    volume.commit()
    result = [asdict(r) for r in reports]
    print(json.dumps(result))
    return result


# ---------------------------------------------------------------- API


@app.function(
    image=api_image,
    volumes={VOL: volume},
    secrets=[modal.Secret.from_name("kopi-app"), modal.Secret.from_name("kopi-needledb-read")],
    min_containers=1,
    cpu=4.0,
    memory=6144,
    timeout=600,
)
@modal.concurrent(max_inputs=40)
@modal.asgi_app(label="kopi-api")
def api():
    """The Kopi API over live data; the store re-reads the Volume (after ingest commits) every 5 minutes."""
    from kopi.api.app import create_app
    from kopi.api.auth import mint_agent_token
    from kopi.api.live import from_environment
    from kopi.sandbox import Copilot, ModalBoxes, ModalDictStore

    copilot = Copilot(
        boxes=ModalBoxes(agent_image, [modal.Secret.from_name("kopi-claude")], SANDBOX_EGRESS),
        store=ModalDictStore("kopi-sessions"),
        mint_token=lambda session: mint_agent_token(os.environ["KOPI_SIGNING_KEY"], session),
        api_url=PUBLIC_API,
        model=os.environ.get("KOPI_MODEL"),
    )
    return create_app(from_environment(reload=volume.reload, copilot=copilot))


@app.function(image=agent_image, timeout=60)
def agent_image_ready() -> str:
    """Exists so `modal deploy` builds the sandbox image ahead of the first chat."""
    import claude_agent_sdk

    return claude_agent_sdk.__version__
