# GitHub Codespaces

## Setup

Create a Codespace from this repository. The devcontainer installs Node.js 24.19.0, npm 12.2.0, Python 3.12, the `requirements.txt` dependencies in `.venv`, and Docker CLI/Compose with Docker-in-Docker. It starts an ephemeral PostgreSQL 16 service on the internal `db` hostname and forwards application port 3000. The database has no persistent volume.

Container creation installs dependencies only: it does not start the app, seed data, or run job discovery. Scheduled discovery is disabled by default in the devcontainer.

## Start and seed

Run the app interactively in a terminal:

```sh
npm run dev
```

Use the forwarded port 3000 to open the app. To add optional synthetic UI data, explicitly run:

```sh
npm run dev:seed
```

The seed is idempotent and only inserts into an empty Codespaces development database. It refuses other database targets and populated databases. Its clearly labeled synthetic jobs are fictional, have unknown availability, and are not current vacancies. Seeding makes no live job-source or AI requests.

## Test and build

```sh
npm test
npm run lint
npm run build
npm run test:postgres
npm run test:docker
```

The last two commands start disposable PostgreSQL/app containers and build the production image, so they require Docker-in-Docker to be running in the Codespace.

## Reset

PostgreSQL data exists only in the Codespaces database container. To reset it and all fixture data, delete the Codespace and create a new one. The optional seed must be run again if desired.

## Optional runtime secrets

Add Codespaces secrets in GitHub Settings and expose them to the repository Codespace only when intentionally using a live provider:

- `OPENROUTER_API_KEY` for OpenCode with OpenRouter.
- `GEMINI_API_KEY` for live interactive Gemini.
- `TYPESAFE_API_KEY` (or the supported alias `TYPESAFE_AI_API_KEY`) for live JEV.

OpenCode CLI is installed in the devcontainer. OpenRouter is a hosted provider, not a separate package to install; choose an OpenRouter model interactively in OpenCode. These secrets are optional and used at runtime. Do not place secret values in devcontainer files, Docker build arguments, logs, or committed `.env` files. Ordinary development does not require production Gemini keys, Cloudflare Access credentials, tunnel tokens, or `API_SECRET_KEY`.
