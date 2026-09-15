# Docker operations Reference

Operational commands for running this demo in Docker — locally or on the
public VM. For architecture and first-time setup, see
[README-Docker.md](README-Docker.md). For root causes behind the gotchas
referenced here, see [docker-findings.md](docker-findings.md).

All commands below assume you're in the repo root. On the VM, prefix
`docker compose` with `sudo` (see [Remote VM](#remote-vm) at the bottom).

---

## One-time setup

```bash
cp compose.env.example .env      # enables the bundled-broker profile + merge
cp demo.env.example demo.env     # or point demo.env at a broker-specific template
```

Pick the right `demo.env` content for the mode you want (see
[docker-findings.md #5](docker-findings.md#5-demoenv-is-one-file-shared-by-both-npm-run-dev-and-docker-compose)):

| Mode | `demo.env` should have |
|---|---|
| **Bundled local broker** (`docker compose up`) | `SOLACE_HOST=ws://localhost:8008`, `SOLACE_VPN=default`, `SOLACE_USERNAME=default`, `SOLACE_PASSWORD=default` — see `tmp/demo-local.env` |
| **External / Solace Cloud broker** (`docker compose -f docker-compose.minimal.yml`) | `SOLACE_HOST=wss://your-broker...:443`, real VPN/credentials |

---

## Start

**Full stack, bundled broker** (requires `.env` with `COMPOSE_PROFILES=broker`
and `COMPOSE_FILE=docker-compose.yml:docker-compose.broker.yml`):

```bash
docker compose up -d --build
```

**Apps only, external broker** (uses `demo.env` URLs directly, no `.env` needed):

```bash
docker compose -f docker-compose.minimal.yml up -d --build
```

First boot: wait for `solace-broker` to report **healthy** (~1–3 min), then
`solace-init` to **exit 0**, before expecting consumers/publisher to connect.

---

## Stop

```bash
docker compose down          # stop + remove containers, keep volumes/images
docker compose stop          # stop only, containers still exist (docker compose start to resume)
```

---

## Status / logs

```bash
docker compose ps
docker compose logs -f solace-broker
docker compose logs solace-init consumer publisher frontend
```

Quick health check of what the browser will actually load:

```bash
curl -s http://localhost:3000/config.js       # or http://<VM-IP>:3000/config.js
docker exec demo-frontend env | grep -i solace
```

---

## Rebuild

Rebuild is **not automatic** on `up -d` — see
[docker-findings.md #7](docker-findings.md#7-vm-deploys-are-pull-based-not-push-based--and-image-rebuilds-are-not-automatic).
Always rebuild after pulling new code:

```bash
docker compose build                      # rebuild all images (uses cache)
docker compose build consumer             # rebuild just one service's image
docker compose build --no-cache frontend  # force a clean rebuild (bypass layer cache — needed for stale-bundle symptoms)
```

Then apply the new images:

```bash
docker compose up -d
```

---

## Recreate (pick up new env vars without rebuilding)

Any change to `demo.env` or `.env` requires recreating the affected
containers — a plain `restart` does **not** re-read them
(see [docker-findings.md #1](docker-findings.md#1-demoenv-is-injected-into-containers-once-not-live-mounted)):

```bash
docker compose up -d --force-recreate frontend
docker compose up -d --force-recreate consumer publisher
docker compose up -d --force-recreate            # everything
```

| What changed | Recreate |
|---|---|
| `SOLACE_PUBLIC_URL`, `VERSION`, browser-facing VPN/user/password | `frontend` |
| `PUBLISH_RATE`, `NQ_PREDICTION_CONSUMER`, Node Solace settings | `consumer`, `publisher` |
| `.env` (`COMPOSE_PROFILES`, `COMPOSE_FILE`, `SOLACE_DOCKER_BROKER_HOST`) | everything (`docker compose up -d --force-recreate`) |

---

## Queue / topic provisioning (`solace-init`)

Runs automatically on `docker compose up` (bundled-broker mode only). To
re-run manually — e.g. after editing `profiles/*.json`:

```bash
docker compose run --rm solace-init
docker compose up -d --force-recreate consumer publisher   # pick up any new queues
```

Host-side equivalent (no Docker), same script:

```bash
npm run setup-solace              # all profiles
npm run setup-solace -- finance   # one profile by id
```

---

## Switching broker modes (bundled ⇄ external)

1. Point `demo.env` at the template matching the target mode (see table
   above under [One-time setup](#one-time-setup)).
2. For bundled → external: remove/comment `COMPOSE_PROFILES` and
   `COMPOSE_FILE` in `.env` (or just use `-f docker-compose.minimal.yml`,
   which ignores them).
3. For external → bundled: restore both lines in `.env`.
4. `docker compose down` then bring the target mode back up (see
   [Start](#start)).

---

## Full reset (clean slate)

```bash
docker compose down -v          # also removes volumes (broker message spool, etc.)
docker compose build --no-cache
docker compose up -d
```

---

## Remote VM

`npm run deploy-vm` ([scripts/deploy-vm.sh](../scripts/deploy-vm.sh)) is
**push-based**: it builds both images locally (cross-compiled for the VM's
architecture via `docker buildx`), ships them as tarballs, and loads them on
the VM. No `git`, Node, or build toolchain is required on the VM — only
Docker. This avoids the whole "forgot to `git pull`/rebuild on the remote"
failure mode from
[docker-findings.md #7](docker-findings.md#7-vm-deploys-are-pull-based-not-push-based--and-image-rebuilds-are-not-automatic);
what you build and test locally is exactly what ships.

```bash
npm run deploy-vm                    # build + push + deploy (resolves the VM's IP via az CLI)
npm run deploy-vm -- --host azureuser@1.2.3.4   # deploy to a specific host instead
npm run deploy-vm -- --no-build      # reuse tarballs already in tmp/docker-deploy/
npm run deploy-vm -- --reprovision   # also re-run solace-init (bundled-broker mode, after a profiles/*.json change)
```

What it syncs vs. leaves alone:

| Path | Behavior |
| --- | --- |
| `partitioned-queue-demo-node:local`, `partitioned-queue-demo-frontend:local` images | Always rebuilt + reloaded |
| `docker-compose*.yml`, `compose.env.example`, `scripts/`, `profiles/` | Always synced (rsync/scp — this is "code") |
| `demo.env`, `.env` | **Never overwritten** — bootstrapped from the `.example` templates only if missing, since they hold host-specific broker credentials (see [docker-findings.md #5](docker-findings.md#5-demoenv-is-one-file-shared-by-both-npm-run-dev-and-docker-compose)) |

`npm run deploy-vm` defaults `REMOTE_DIR` to
`/home/azureuser/solace-queue-demo` — a separate directory from the older
git-clone-based checkout at `/opt/queue-demo` still running on the same VM.
The two stacks bind the same host ports (3000, 8008, ...), so only one can
be up at a time; bring the other down first if you switch between them
(`docker compose down` in whichever directory is currently running).

If you'd rather deploy by pulling from git on the VM directly (e.g. no
`docker buildx`/cross-compilation available locally), that still works
manually against the original checkout:

```bash
ssh azureuser@<PUBLIC_IP>
cd /opt/queue-demo
git pull
sudo docker compose build
sudo docker compose up -d --force-recreate
sudo docker compose ps
```

Checklist after any VM deploy:

1. `solace-init` exited **0**, `solace-broker` **healthy**
2. `http://<PUBLIC_IP>:3000` loads, header version matches what you expect
3. DevTools → Network → WS target is `ws://<PUBLIC_IP>:8008` (or your
   configured `SOLACE_PUBLIC_URL`), status **Connected**
4. Consumer tiles go from `OFFLINE`/`UNKNOWN` to live counts within a few
   seconds of the publisher starting

If the header version doesn't change after a deploy, you likely skipped
`git pull` or `docker compose build` — recreating containers alone reuses
whatever image was already built (finding #7).
