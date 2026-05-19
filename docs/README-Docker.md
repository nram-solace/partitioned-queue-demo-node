# Docker deployment guide

Run the **Solace Queue Types Demo** with Docker Compose in two modes:

| Mode | Command | Broker |
|------|---------|--------|
| **Full stack** (default) | `docker compose up -d --build` | Bundled PubSub+ Standard (`profile: broker`) |
| **Apps only** | `docker compose -f docker-compose.minimal.yml up -d --build` | Your existing broker via `demo.env` (Solace Cloud, host, remote VM) |

For domain concepts and dashboard usage, see [README.md](../README.md). Implementation notes live under [`.dev/pm/`](../.dev/pm/) (especially [impl-central-config.md](../.dev/pm/impl-central-config.md), [impl-containers.md](../.dev/pm/impl-containers.md), [impl-profile-selection.md](../.dev/pm/impl-profile-selection.md)).

---

## Compose files

| File | Purpose |
|------|---------|
| [docker-compose.apps.yml](../docker-compose.apps.yml) | Shared **consumer**, **publisher**, **frontend** |
| [docker-compose.yml](../docker-compose.yml) | Includes apps + optional **`solace-broker`** / **`solace-init`** (`profiles: [broker]`) |
| [docker-compose.broker.yml](../docker-compose.broker.yml) | Merged for full stack: in-network `SOLACE_HOST`, wait for `solace-init` |
| [docker-compose.minimal.yml](../docker-compose.minimal.yml) | Apps only (includes `docker-compose.apps.yml`) |
| [.env](../.env) | Default `COMPOSE_PROFILES=broker` and `COMPOSE_FILE=…:docker-compose.broker.yml` |

`docker compose -f docker-compose.minimal.yml` **ignores** `.env` `COMPOSE_FILE` (Compose uses only the `-f` file).

---

## Services

| Service | Container | Profile | Role |
|---------|-----------|---------|------|
| `solace-broker` | `solace-broker` | `broker` | PubSub+ Standard (optional) |
| `solace-init` | `solace-broker-init` | `broker` | One-shot SEMP provisioning |
| `consumer` | `demo-consumer` | *(always)* | Queue consumers + `solace/catalog/*` |
| `publisher` | `demo-publisher` | *(always)* | Profile publishers + catalog stats |
| `frontend` | `demo-frontend` | *(always)* | nginx + Vite build |

### Full stack (bundled broker)

```text
Browser ──http:3000──► demo-frontend (nginx)
Browser ──ws:8008────► solace-broker (Web Transport)
                              ▲
         demo-consumer / demo-publisher (ws://solace-broker:8008)
                              ▲
                    solace-broker-init (SEMP, exit 0)
```

### Apps only (external broker)

```text
Browser ──http:3000──► demo-frontend
Browser ──wss/ws─────► your PubSub+ broker (SOLACE_PUBLIC_URL in demo.env)
                              ▲
         demo-consumer / demo-publisher (SOLACE_HOST in demo.env)
```

The dashboard uses **Solace Web Transport** for catalog events, stats, and commands — not a separate app WebSocket port.

---

## Prerequisites

- **Docker** with the **Compose v2** plugin (`docker compose`, not legacy `docker-compose` v1)
- **Full stack:** **~4–8 GiB RAM** for the broker container (8 GiB recommended if the broker stays `unhealthy` on smaller VMs)
- **Apps only:** a reachable PubSub+ broker with Web Messaging, VPN credentials, and queues/subscriptions provisioned (see [Broker provisioning](#broker-provisioning))
- Repo cloned locally

---

## Quick start

### 1. Configuration (once)

```bash
cp demo.env.example demo.env
# Edit demo.env — see tables below for full-stack vs minimal
```

`demo.env` is the **single source of truth** for Solace connectivity, publish rate, prediction chart consumer index, dashboard version label, and SEMP wait settings. Compose loads it on all app services (`env_file`, optional if missing).

### 2. Build and run

**Full stack (bundled broker + provisioning):**

```bash
docker compose up -d --build
```

**Apps only (Solace Cloud, host broker, remote VM):**

1. Configure **`demo.env`** for Web Messaging (see [Remote broker: queues and subscriptions](#remote-broker-queues-and-subscriptions-minimal-compose)).
2. **Provision queues** on the remote broker (same section) — required before the demo can publish or consume.
3. Start apps:

```bash
docker compose -f docker-compose.minimal.yml up -d --build
```

Use `--build` on first run or after changing Node dependencies, backend code, frontend assets, or Dockerfiles.

To start **without** the bundled broker while still using `docker-compose.yml` (e.g. broker on the host, apps in Docker):

```bash
COMPOSE_PROFILES= docker compose up -d --build
# Set SOLACE_HOST=ws://host.docker.internal:8008 in demo.env (macOS/Windows)
```

### 3. Wait for readiness

**Full stack**

| Step | What to expect |
|------|----------------|
| Broker | **1–3 minutes** first boot; health check probes PubSub+ Manager on **8080** |
| `solace-init` | Exits **0** after SEMP creates queues for all profiles |
| Apps | `consumer`, `publisher`, `frontend` start after init completes |

```bash
docker compose ps
docker compose logs -f solace-broker
docker compose logs solace-init
```

**Apps only** — no broker container; ensure `demo.env` points at your broker and queues exist before expecting traffic.

### 4. Open the dashboard

| Endpoint | Full stack | Apps only |
|----------|------------|-----------|
| Dashboard | http://localhost:3000 | http://localhost:3000 |
| Web Transport (browser) | `ws://localhost:8008` (`SOLACE_PUBLIC_URL`) | URL from `demo.env` (e.g. `wss://…:443`) |
| PubSub+ Manager | http://localhost:8080 (`admin` / `admin`) | Your broker’s admin URL |

Header should show **Connected to Solace** once the consumer is up and catalog traffic flows.

---

## Configuration (`demo.env`)

### How settings reach each process

```text
demo.env (repo root; gitignored — template: demo.env.example)
        │
        ├── docker compose env_file (all app services)
        ├── docker-compose.broker.yml → SOLACE_HOST for bundled broker (full stack only)
        │
        ├── consumer / publisher → backend/lib/solaceEnv.js
        ├── solace-init → scripts/setup-solace.sh (SEMP host = solace-broker)
        └── demo-frontend → docker/entrypoint-frontend.sh
                              → sync-frontend-config.js → /usr/share/nginx/html/config.js
```

**Do not hand-edit** `frontend/public/config.js` for Docker or host runs; regenerate it instead.

### `demo.env` by deployment mode

| Variable | Host `npm run` | Full stack (`docker compose up`) | Apps only (`docker-compose.minimal.yml`) |
|----------|----------------|----------------------------------|------------------------------------------|
| `SOLACE_HOST` | `ws://localhost:8008` | Set by **docker-compose.broker.yml** → `ws://solace-broker:8008` | Your broker Web Messaging URL (`wss://…` or `ws://…`) |
| `SOLACE_PUBLIC_URL` | *(omit)* | `ws://localhost:8008` (Compose default on frontend) | Same URL the **browser** must use |
| `SOLACE_VPN` / user / password | `default` | `default` (bundled) or your cloud VPN | Your broker credentials |

**Host development:** `SOLACE_HOST=ws://localhost:8008`, omit `SOLACE_PUBLIC_URL`.

**Remote VM with bundled broker:** `SOLACE_PUBLIC_URL=ws://<PUBLIC_IP>:8008`, open NSG/firewall for **8008** and **3000**, recreate **frontend**.

**Solace Cloud (minimal compose):** Web Messaging `wss://…:443` in `demo.env`; provision queues via SEMP first — see [Remote broker: queues and subscriptions](#remote-broker-queues-and-subscriptions-minimal-compose).

### Apply config changes

| What changed | Action |
|--------------|--------|
| `SOLACE_PUBLIC_URL`, `VERSION`, VPN/user/password for **browser** | Recreate **frontend** (use the same `-f` file you normally run) |
| `PUBLISH_RATE`, `NQ_PREDICTION_CONSUMER`, Node Solace settings | Recreate **consumer** and **publisher** |
| SEMP wait / VPN for provisioning | Edit `demo.env`, then re-run init (full stack only) |
| **Host** Vite dev (not Docker) | `npm run sync-config` after editing `demo.env` |

```bash
# Full stack
docker compose up -d --force-recreate frontend

# Apps only
docker compose -f docker-compose.minimal.yml up -d --force-recreate frontend
```

Example — point the UI at a public broker WebSocket:

```bash
# demo.env
SOLACE_PUBLIC_URL=ws://20.51.158.49:8008

docker compose up -d --force-recreate frontend
```

If `solaceUrl` is `null` in generated config, the app may rewrite `ws://localhost:8008` to `ws://<page-host>:8008` when the page is not served from localhost.

### Migration from older checkouts

Older layouts used `docker/demo.apps.env` and a bind-mounted `docker/dashboard-config.js`. Those are removed.

1. `cp demo.env.example demo.env`
2. Copy any custom values from old `docker/demo.apps.env` into `demo.env`
3. Set `SOLACE_PUBLIC_URL=ws://localhost:8008` for Docker if you rely on explicit browser URL
4. `npm run sync-config` (optional, for host frontend)
5. `docker compose up -d --build`

Details: [`.dev/pm/impl-central-config.md`](../.dev/pm/impl-central-config.md).

---

## Build images

Compose builds two images from the repo root:

| Image | Dockerfile | Contents |
|-------|------------|----------|
| `partitioned-queue-demo-node:local` | `Dockerfile` | Node 20 Alpine, backend + profiles + scripts; used by **consumer** and **publisher** |
| `partitioned-queue-demo-frontend:local` | `Dockerfile.frontend` | Multi-stage: Vite build → nginx; runtime entrypoint syncs `config.js` |

```bash
# Rebuild everything
docker compose build

# Rebuild one service
docker compose build consumer
docker compose build frontend

# No cache (after UI or dependency confusion)
docker compose build --no-cache frontend
```

`.dockerignore` excludes `node_modules`, `.git`, `.dev`, and most markdown (README is kept for the frontend build context).

---

## Day-2 operations

### Status and logs

```bash
docker compose ps

docker compose logs -f solace-broker
docker compose logs solace-init
docker compose logs -f consumer
docker compose logs -f publisher
docker compose logs -f frontend
```

### Stop and reset

```bash
# Stop containers, keep broker volumes
docker compose down

# Stop and remove broker data volumes (full broker reset)
docker compose down -v
```

### Start subsets

```bash
# Broker + provisioning only (full stack file, broker profile)
docker compose up -d solace-broker solace-init

# Re-run provisioning after profile JSON changes (requires broker profile)
docker compose run --rm solace-init
```

`solace-init` is **one-shot** (`restart: "no"`). It is only defined when profile **`broker`** is active. Compose does not re-run it after a successful exit until you recreate or `docker compose run` it.

### Broker provisioning (summary)

| Mode | How to provision queues |
|------|-------------------------|
| Full stack | Automatic via **`solace-init`** on first `docker compose up` |
| Apps only (minimal) | **[Remote broker: queues and subscriptions](#remote-broker-queues-and-subscriptions-minimal-compose)** — run **`setup-solace.sh`** before `docker compose -f docker-compose.minimal.yml up` |
| One profile | `./scripts/setup-solace.sh finance` (or any profile `id`) |

### Individual containers

```bash
docker stop demo-frontend && docker start demo-frontend
docker stop demo-publisher && docker start demo-publisher
docker stop demo-consumer && docker start demo-consumer
```

### Code updates

```bash
git pull
docker compose build
docker compose up -d
```

After **frontend** changes, hard-refresh the browser (nginx sets `Cache-Control: no-store` on static assets). Use `--no-cache` if an old bundle persists.

### Profiles and broker objects

- **Switch profile in the UI** — use the dashboard profile picker; **no** container restart.
- **Add or change** `profiles/*.json` (queue names, partition counts, topic prefix) — re-run provisioning:

```bash
docker compose run --rm solace-init   # full stack only
```

Or provision one profile on any host with SEMP reachability:

```bash
./scripts/setup-solace.sh finance
./scripts/setup-solace.sh airline-carrier
```

Packaged profiles: `finance`, `retail`, `airline-carrier`, `airline-hub` (12 queues total on full init). See [`.dev/pm/impl-profile-selection.md`](../.dev/pm/impl-profile-selection.md).

---

## Remote broker: queues and subscriptions (minimal compose)

With **`docker-compose.minimal.yml`**, there is no **`solace-init`** container. You must create **queues** and **topic subscriptions** on your remote broker **before** (or restart apps after) the consumer and publisher can work.

The repo ships **[`scripts/setup-solace.sh`](../scripts/setup-solace.sh)** — the same script **`solace-init`** runs for the bundled broker. It reads every **`profiles/*.json`** (or one profile if you pass an argument) and uses **SEMP v2** to:

- Create the three queues in each profile’s **`queues`** block (`*_PQ` with partition count = `partitionKeys.length`, plus `*_NQ` and `*_EQ`), each with configurable spool (`QUEUE_MAX_SPOOL_MB`, default 1024) and max TTL (`QUEUE_MAX_TTL`, default 60s). **`deadMsgQueue`** is not set (broker/VPN default).
- Add a subscription on each queue to **`{messaging.topicPrefix}/>`** from that profile.

If queue **names** changed in profile JSON, delete the old queues in PubSub+ Manager (or via SEMP), then re-run **`setup-solace.sh`** — existing names are **updated** via PATCH; missing names are **created**.

### What gets created (packaged profiles)

| Profile | Queues | Partitions (PQ) | Topic subscription |
|---------|--------|-----------------|-------------------|
| `finance` | `Finance_PQ`, `Finance_NQ`, `Finance_EQ` | 8 | `qdemo/stocks/orders/>` |
| `retail` | `Retail_PQ`, `Retail_NQ`, `Retail_EQ` | 5 | `qdemo/retail/fulfillment/>` |
| `airline-carrier` | `AirlineCarrier_PQ`, `AirlineCarrier_NQ`, `AirlineCarrier_EQ` | 5 | `qdemo/airline/ops/carrier/>` |
| `airline-hub` | `AirlineHub_PQ`, `AirlineHub_NQ`, `AirlineHub_EQ` | 5 | `qdemo/airline/ops/hub/>` |

If you change queue names or `topicPrefix` in a profile JSON, re-run the script (it is idempotent for existing objects).

### Messaging URL vs SEMP (do not mix them up)

| Purpose | `demo.env` keys | Example (Solace Cloud) |
|---------|-----------------|-------------------------|
| **Web Messaging** | `SOLACE_HOST`, `SOLACE_PUBLIC_URL` | `wss://…messaging.solace.cloud:443` |
| **SEMP REST** | **`SEMP_HOST`**, `SEMP_SCHEME`, `SEMP_PORT`, `MSG_VPN`, `SEMP_USER`, `SEMP_PASS` | `SEMP_HOST=…solacecloud.com`, `SEMP_SCHEME=https`, `SEMP_PORT=943` |

`setup-solace.sh` **loads `demo.env`** if it exists, then connects to **`SEMP_HOST`** (hostname only). It **ignores** `SOLACE_HOST` when that value is a `ws://` or `wss://` URL (so your Web Messaging settings are not mistaken for SEMP).

If you run the script with no config, it defaults to **`solace-broker:8080`** — that hostname only works **inside** the Docker Compose network (the `solace-init` container). From your laptop you will see:

```text
Waiting for Solace SEMP (msgVpn default) at http://solace-broker:8080...
```

That is expected until you set **`SEMP_HOST`** (see below).

### Option A — run on your machine (recommended)

**Prerequisites:** `curl`, `jq`, and network access to the broker’s **SEMP** endpoint.

**1. Add SEMP settings to `demo.env`** (recommended — same file as minimal compose):

```env
# Web Messaging (apps + browser)
SOLACE_HOST=wss://your-service.messaging.solace.cloud:443
SOLACE_PUBLIC_URL=wss://your-service.messaging.solace.cloud:443
SOLACE_VPN=your-vpn-name
SOLACE_USERNAME=your-client-user
SOLACE_PASSWORD=your-client-password

# SEMP (setup-solace.sh only — from Solace Cloud console)
SEMP_HOST=your-service.solacecloud.com
SEMP_SCHEME=https
SEMP_PORT=943
MSG_VPN=your-vpn-name
SEMP_USER=your-management-user
SEMP_PASS=your-management-password
```

**2. Run provisioning:**

```bash
cd /path/to/partitioned-queue-demo-node
npm run setup-solace
# or: ./scripts/setup-solace.sh
# one profile: ./scripts/setup-solace.sh finance
```

The script prints the resolved endpoint first, e.g. `SEMP endpoint: https://your-service.solacecloud.com:943  msgVpn=…`.

**Bundled broker already running on localhost** (`docker compose up` with broker profile):

```env
SEMP_HOST=localhost
SEMP_PORT=8080
SEMP_SCHEME=http
MSG_VPN=default
SEMP_USER=admin
SEMP_PASS=admin
```

**Self-hosted broker** (Manager on 8080):

```env
SEMP_HOST=broker.example.com
SEMP_SCHEME=http
SEMP_PORT=8080
```

You can still **`export SEMP_HOST=…`** in the shell instead of editing `demo.env`; shell exports override `demo.env` for that run.

Success ends with **`Solace demo queues and topic subscriptions are ready.`** and a line listing provisioned profile ids.

### Option B — run in Docker (no local `curl` / `jq`)

Same script and **`profiles/`** mount as **`solace-init`**; point env at your remote SEMP host:

```bash
cd /path/to/partitioned-queue-demo-node

docker run --rm \
  -v "$PWD/scripts:/app/scripts:ro" \
  -v "$PWD/profiles:/app/profiles:ro" \
  -e SEMP_HOST=your-service.solacecloud.com \
  -e SEMP_SCHEME=https \
  -e SEMP_PORT=943 \
  -e MSG_VPN=your-vpn-name \
  -e SEMP_USER=your-management-user \
  -e SEMP_PASS='your-management-password' \
  alpine:3.19 sh -c 'apk add --no-cache curl jq >/dev/null && exec /bin/sh /app/scripts/setup-solace.sh'
```

Add a final argument to provision one profile, e.g. `... setup-solace.sh retail` inside the `sh -c` string.

### Configure `demo.env` and start minimal compose

**`demo.env`** is for **runtime** apps (Web Messaging + VPN client user), not SEMP:

```env
SOLACE_HOST=wss://your-service.messaging.solace.cloud:443
SOLACE_PUBLIC_URL=wss://your-service.messaging.solace.cloud:443
SOLACE_VPN=your-vpn-name
SOLACE_USERNAME=your-client-user
SOLACE_PASSWORD=your-client-password
```

Use a **client profile** user that can connect, publish, and consume on the demo queues (separate from SEMP management credentials unless your broker uses one account for both).

```bash
docker compose -f docker-compose.minimal.yml up -d --build
```

Open http://localhost:3000 — the header should show **Connected to Solace** once VPN credentials and queue names match the provisioned objects.

### Verify in PubSub+ Manager

In the correct message VPN, confirm each queue exists, **partition count** on `*_PQ` matches `partitionKeys.length` in the profile JSON, and each queue has a subscription to **`{topicPrefix}/>`**.

### After profile JSON changes

Re-run provisioning (Option A or B), then recreate the Node containers if they were already running:

```bash
./scripts/setup-solace.sh
docker compose -f docker-compose.minimal.yml up -d --force-recreate consumer publisher
```

### Manual provisioning

If you cannot use SEMP from your network, create the objects in **PubSub+ Manager** (or your platform’s API) to match each profile’s **`queues`** and **`messaging.topicPrefix`** in **`profiles/*.json`**.

---

## Remote / cloud hosting

### VM with bundled broker (full stack)

Browsers must reach **both** the dashboard (**3000**) and **Web Transport** (**8008**).

| Port | Purpose |
|------|---------|
| 22 | SSH (restrict to admin IPs in production) |
| 3000 | Dashboard (nginx) |
| 8008 | Solace Web Transport |
| 8080 | PubSub+ Manager (optional; lock down in production) |

```bash
cp demo.env.example demo.env
# SOLACE_PUBLIC_URL=ws://<PUBLIC_IP>:8008
docker compose up -d --build
```

Broker sizing: **Standard_B2ms (8 GiB)** or larger is more reliable than 4 GiB for PubSub+ Standard plus app containers. See [`.dev/pm/impl-public-hosting.md`](../.dev/pm/impl-public-hosting.md) for Azure NSG and VM notes.

**`demo.env` for bundled broker on a VM:** use **`demo-local.env`** as the template (`SOLACE_VPN=default`, `SOLACE_USERNAME=default`, `SOLACE_PASSWORD=default`). If `demo.env` still has **Solace Cloud** VPN/user/password, `docker compose up` will fail to connect until you fix it — **`docker-compose.broker.yml`** now forces `default`/`default` on consumer, publisher, and init, but only when you use the default Compose merge (`.env` `COMPOSE_FILE=…:docker-compose.broker.yml`).

```env
SOLACE_PUBLIC_URL=ws://20.51.158.49:8008
```

Open NSG port **8008**. Re-run init after profile changes: `docker compose run --rm solace-init`.

### Solace Cloud or external broker (apps only)

Use **`docker-compose.minimal.yml`** and follow **[Remote broker: queues and subscriptions](#remote-broker-queues-and-subscriptions-minimal-compose)** end to end:

1. Provision queues/subscriptions via **`setup-solace.sh`** (SEMP host is usually **`*.solacecloud.com:943`**, not the Web Messaging host).
2. Set **`demo.env`** to your **`wss://…messaging.solace.cloud:443`** URL and **client** VPN credentials.
3. **`docker compose -f docker-compose.minimal.yml up -d --build`**

Symptom: dashboard loads but header stays **Disconnected** → wrong **`SOLACE_PUBLIC_URL`**, client ACLs, or VPN/credentials. Symptom: connected but no tiles/messages → queues missing or topic subscriptions do not cover the profile **`topicPrefix`**.

### Blank page on `http://<VM-IP>:3000` (`crypto.randomUUID is not a function`)

Browsers only expose **`crypto.randomUUID`** in a **secure context** (HTTPS or localhost). Over plain **HTTP** to a remote IP, the dashboard used to crash on load. The app now falls back to **`crypto.getRandomValues`** for session IDs. Rebuild and recreate the frontend after pulling the fix:

```bash
docker compose build frontend
docker compose up -d --force-recreate frontend
```

Use **`docker compose`** (space), not **`docker-compose`** v1 — v1 can fail with `KeyError: 'ContainerConfig'` on recreate.

---

## Environment reference

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLACE_HOST` | Web Transport URL for Node | `ws://localhost:8008` |
| `SOLACE_PUBLIC_URL` | Browser Web Transport URL | same as `SOLACE_HOST` |
| `SOLACE_VPN` | Message VPN | `default` |
| `SOLACE_USERNAME` / `SOLACE_PASSWORD` | Client credentials | `default` |
| `PUBLISH_RATE` | Messages per second per profile | `10` |
| `NQ_PREDICTION_CONSUMER` | NQ tile index (1–5) for prediction chart | `1` |
| `VERSION` | Dashboard header version | `3.4` |
| `PROFILES_DIR` | Profile JSON directory | `./profiles` |
| `SEMP_HOST` | SEMP API hostname (`setup-solace.sh`; not `ws://` / `wss://`) | `solace-broker` (Docker only) |
| `MSG_VPN` | VPN for SEMP (`setup-solace.sh` / `solace-init`) | `default` |
| `SEMP_SCHEME` | `http` or `https` for SEMP (`setup-solace.sh`) | `http` |
| `SEMP_PORT` | SEMP port (`8080` local, `943` typical on Solace Cloud) | `8080` |
| `SEMP_USER` / `SEMP_PASS` | SEMP management credentials | `admin` / `admin` |
| `SEMP_WAIT_MAX_ITERATIONS` | SEMP wait loop count | `120` |
| `SEMP_WAIT_SLEEP_SECS` | Sleep between SEMP polls | `3` |

**Not in `demo.env`:** `DEMO_PROFILE`, `QUEUE_*`, `TOPIC_PREFIX`, or `VITE_*` — profiles hold queue/topic config; `VITE_*` is emergency fallback only in `frontend/src/config.js`.

Full mapping to `window.__DEMO_CONFIG__`: [`.dev/pm/impl-central-config.md`](../.dev/pm/impl-central-config.md).

---

## Troubleshooting

### Broker `unhealthy` or slow start

- First boot often needs **1–3 minutes** before port **8080** responds inside the container.
- `docker compose logs -f solace-broker`
- Inside container: `docker exec solace-broker curl -sf http://127.0.0.1:8080/ | head`

### `solace-init` exits 1

- Ensure broker is **healthy** before init; increase `SEMP_WAIT_*` in `demo.env` on slow disks.
- Re-run: `docker compose run --rm solace-init`
- Queue GET returning **400 + NOT_FOUND** is treated as “missing” in current `setup-solace.sh` (see [`.dev/pm/impl-public-hosting.md`](../.dev/pm/impl-public-hosting.md)).

### `setup-solace.sh` stuck on `http://solace-broker:8080`

You ran the script on the **host** without **`SEMP_HOST`**. `solace-broker` is the Docker service name, not your laptop’s localhost.

| Your broker | Set in `demo.env` |
|-------------|-------------------|
| Docker Compose broker on this machine | `SEMP_HOST=localhost` `SEMP_PORT=8080` |
| Solace Cloud | `SEMP_HOST=<service>.solacecloud.com` `SEMP_SCHEME=https` `SEMP_PORT=943` |
| Remote/VM Manager | `SEMP_HOST=<hostname-or-ip>` and matching `SEMP_PORT` |

Then run `npm run setup-solace` again.

### Dashboard disconnected (containers up, publisher/consumer OK in logs)

**Symptom:** `docker compose logs consumer` shows **Dashboard bridge ready**, but the UI says **Disconnected** and Publisher **Inactive**.

**Common cause (minimal compose + Solace Cloud):** the frontend was given **`SOLACE_PUBLIC_URL=ws://localhost:8008`** by an old Compose default, while Node apps use **`wss://…`** from `demo.env`. The browser never reaches your cloud broker.

**Fix:**

```env
# demo.env — use your Web Messaging URL (or omit SOLACE_PUBLIC_URL to default to SOLACE_HOST)
SOLACE_PUBLIC_URL=wss://your-service.messaging.solace.cloud:443
```

```bash
docker compose -f docker-compose.minimal.yml up -d --force-recreate frontend
```

Verify served config: `docker exec demo-frontend cat /usr/share/nginx/html/config.js` — `solaceUrl` must be your **`wss://`** URL, not `null` with localhost fallback.

**Bundled broker:** `docker-compose.broker.yml` sets `SOLACE_PUBLIC_URL=ws://localhost:8008` on the frontend only.

Other checks:

- Confirm `demo-consumer` and `demo-publisher` are running.
- DevTools → Network → WebSocket to the broker; header shows `Solace - user@host` when connected.

### Consumer log: `NO_SPACE` / `no space in transport`

The **catalog** session publishes UI events from all queue consumers on **one** Solace session. At high `PUBLISH_RATE` with **four** profiles, the default 64 KiB send buffer can fill (especially on Solace Cloud).

The consumer now uses a **4 MiB** send buffer, **throttles** `order` / `prediction` catalog events per profile (`CATALOG_EVENT_MIN_INTERVAL_MS`, default 50 ms), and **drops** gracefully if the buffer is still full (rate-limited warning).

Tune in `demo.env` if needed:

```env
CATALOG_SEND_BUFFER_MAX_SIZE=8388608
CATALOG_EVENT_MIN_INTERVAL_MS=80
PUBLISH_RATE=5
```

Recreate the consumer: `docker compose -f docker-compose.minimal.yml up -d --force-recreate consumer`.

### No messages / empty tiles

- Publisher running (`demo-publisher` logs).
- Queues exist for the selected profile (re-run `solace-init` after profile edits).
- Partitioned queue partition count = `partitionKeys.length` in that profile JSON.

### Publisher panel **Inactive**

- Publisher must be running; UI marks **Active** only when `solace/catalog/stats/{profileId}/publisher` updates (~1 Hz).

### Port 8080 connection refused on host

- Use `docker compose up` from the repo so port mappings apply (`0.0.0.0:8080->8080/tcp` in `docker ps`).
- Try `curl -v http://127.0.0.1:8080/` if `localhost` resolves to IPv6 only.

### Compose v1 / `ContainerConfig` errors

Install Compose **v2** and run `docker compose`, not `docker-compose`.

---

## Related documentation

| Document | Topic |
|----------|--------|
| [README.md](../README.md) | Demo overview, dashboard usage, host `npm run` workflow |
| [demo.env.example](../demo.env.example) | Committed configuration template |
| [docker-compose.yml](../docker-compose.yml) | Apps + optional bundled broker (`profile: broker`) |
| [docker-compose.minimal.yml](../docker-compose.minimal.yml) | Apps only (external broker) |
| [docker-compose.apps.yml](../docker-compose.apps.yml) | Shared application services |
| [docker-compose.broker.yml](../docker-compose.broker.yml) | Bundled-broker URL + init ordering |
| [scripts/setup-solace.sh](../scripts/setup-solace.sh) | SEMP provisioning |

---

## License

MIT — same as [README.md](../README.md).
