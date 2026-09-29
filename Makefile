.PHONY: test types dev-api dev-web eval deploy

test:
	cd backend && uv run pytest -q

types:
	cd backend && uv run python -c "import json; from kopi.api.app import create_app; print(json.dumps(create_app().openapi(), indent=1))" > ../openapi.json
	cd web && npx --yes openapi-typescript ../openapi.json -o lib/api-types.ts

dev-api:
	cd backend && uv run uvicorn --factory kopi.api.app:create_app --reload --port 8000

dev-web:
	cd web && npm run dev

eval:
	cd backend && uv run --extra search python ../evals/run_eval.py

deploy:
	cd backend && MODAL_PROFILE=teddyoweh uv run --extra search --extra agent --extra deploy modal deploy modal_app.py
