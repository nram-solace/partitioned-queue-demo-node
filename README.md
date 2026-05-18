# Solace Queue Types — Interactive Demo

This is an **interactive demo** for Solace **PubSub+** queue types.

- A **publisher** emits stream of messages for a chosen scenario in a predefined **topic hierarchy**; **three** queues—a **partitioned**, a **non-exclusive**, and an **exclusive** queue—each subscribe to the same pattern, so every queue type sees the **same** traffic.
- **Consumers** attach to each queue, process messages, and publish live dashboard events to **`solace/catalog/`** topics; the browser subscribes over **Solace Web Transport** (`:8008`). Number of consumers per queue is configurable.
- The **dashboard** is a visual front end for that activity: you can see how each path delivers work, how load spreads, how ordering differs, and what happens when you **disconnect** or **reconnect** a consumer (**failover** on the exclusive one, **loadbalancing** on the non-exclusive queue, **rebalancing** on the partitioned queue).

![Screenshot](./resources/screenshot.png)

## Profiles

**Profiles** pick the demo domain (e.g. market-style events for finance/banking; fulfillment-style events for retail). Profile defines the topic space, partition keys, payload fields, and on-screen labels. 

*Packaged profiles:*

- finance: `profiles/finance.json` — stock orders; **price** prediction by symbol
- retail: `profiles/retail.json` — fulfillment orders; **line total** prediction by store
- airline-carrier: `profiles/airline-carrier.json` — flight status; **delay (minutes)** prediction partitioned by **carrier** (IATA codes)
- airline-hub: `profiles/airline-hub.json` — same payload shape; **delay** prediction partitioned by **hub** (airport codes)

You can add more domains (energy, logistics, and so on) by copying those samples and staying within the rules enforced in `backend/lib/demoProfile.js`.

Profiles with **`ui.prediction`** show a **Prediction** tab: charts compare **actual** values from the publisher with lightweight EMA+VWAP estimates on the **partitioned** and **non-exclusive** consumer paths. Finance uses per-symbol **price**; retail uses **line total** by store; airline profiles use **delay (min)** by carrier or hub. See [Finance profile and the Prediction UI](#finance-profile-and-the-prediction-ui) for behavior and env vars.

![Screenshot](./resources/screenshot-pred.png)

## Getting started

### Prerequisites

- **Node.js** (v14+)
- **Docker and Docker Compose** (optional; for local full stack: broker, queue init, consumer, publisher, **static frontend on port 3000** — default profile **finance**)
- **Solace PubSub+** broker you can manage (create queues and topic subscriptions), unless you use the bundled Docker flow below

### 1. Start the Demo (Docker)

```bash
docker compose up -d --build
```

(`--build` recommended the first time or after changing Node dependencies.)

This starts **`solace-broker`** (PubSub+ Standard), a one-shot **`solace-init`** that provisions **queues and topic subscriptions for every profile** under `profiles/` (e.g. `Finance_PQ` / `Retail_PQ` / `AirlineCarrier_PQ` and matching NQ/EQ), the **Node `consumer`** and **`publisher`** containers, and a **`frontend`** service (**nginx** serving the Vite production build on host **`http://localhost:3000`**). Defaults (**finance**, eight partitions) live in **`docker/demo.apps.env`**.

See **`scripts/setup-solace.sh`** if you need to change Solace resources.

To **re-run** provisioning (for example after changing **`PARTITION_COUNT`** or queue settings in **`docker/demo.apps.env`**):

```bash
docker compose run --rm solace-init
# or: docker compose up solace-init --force-recreate
```

Endpoints (typical local setup):

- **Dashboard (Docker frontend)**: http://localhost:3000 (Solace Web Transport to **`ws://localhost:8008`** — override with **`VITE_SOLACE_URL`** or **`docker/dashboard-config.js`**)
- **PubSub+ Web Transport**: `ws://localhost:8008` (browser + Node apps)
- **PubSub+ Manager**: http://localhost:8080 (`admin` / `admin`)

The broker may take 30–60 seconds to become ready (logs show the broker is up, or Manager loads). **`solace-init`** polls SEMP until the VPN is available, then applies queue and subscription config.

Additional docker commands:

```bash
Check process:
docker compose ps

Check logs:
docker compose logs -f solace-broker
docker compose logs solace-init
docker compose logs -f consumer
docker compose logs -f publisher
docker compose logs -f frontend

Stop:
docker compose down

Remove volumes:
docker compose down -v
```

#### Profile (Docker) and UI

**Switch profile (e.g. retail)** — edit **`docker/demo.apps.env`** only:

- Set **`DEMO_PROFILE=./profiles/retail.json`**
- Set **`PARTITION_COUNT=5`** (must match **`messaging.partitionKeys.length`** in that JSON; use **`8`** for **`./profiles/finance.json`**)

Then restart the Node containers so they reload **`docker/demo.apps.env`** (profile path, rates, etc.):

```bash
docker compose up -d --force-recreate consumer publisher
```

**When do you need `solace-init` again?** Not because of topic subscription or queue names: **`solace/demo/>`** already covers both profiles, and **`Demo_*`** names stay the same.

- **`solace-init`** is a **one-shot** container (`restart: "no"`): Compose does **not** re-run it on every **`docker compose up`** after it has exited successfully. You only recreate it when **broker** settings from **`docker/demo.apps.env`** must be reapplied — mainly **`PARTITION_COUNT`** on **`Demo_PQ`** (8 for finance, 5 for retail). Without re-running init, the broker can keep the wrong partition count while the app loads a different profile.
- If you **only** changed something that affects **Node** (e.g. **`DEMO_PROFILE`**, **`PUBLISH_RATE`**) and **`PARTITION_COUNT`** is unchanged, **`consumer`** + **`publisher`** recreate is enough.

Retail example (partition count changes):

```bash
docker compose up -d --force-recreate solace-init consumer publisher
```

You do not need **`docker compose down`** for a profile switch. The **frontend** container does not need a rebuild unless you change **`Dockerfile.frontend`** build args; the live profile is published to **`solace/catalog/profiles`** when the consumer starts.

With **`docker compose up`**, open the dashboard at **`http://localhost:3000`**. The static bundle uses **`VITE_SOLACE_URL`** at **image build** time (default **`ws://localhost:8008`**); change compose **`build.args`** and **`docker compose build frontend`** if your host layout differs.

**Remote browsers (e.g. Azure VM public IP):** set **`solaceUrl`** in **`docker/dashboard-config.js`** (mounted as **`/config.js`**) to **`ws://<VM_IP>:8008`**, then **`docker compose restart frontend`**. If **`solaceUrl`** is **`null`**, the app rewrites **`ws://localhost:8008`** to **`ws://<same host as the page>:8008`** when the page is not on localhost.

For **local Vite dev** (hot reload), run **`npm run consumer`**, **`npm run publisher`**, and **`npm run frontend`**; ensure **`frontend/public/config.js`** or **`VITE_SOLACE_*`** points at the broker.

**Start/stop apps independently** — use container names, for example:

```bash
docker stop demo-frontend && docker start demo-frontend
docker stop demo-publisher && docker start demo-publisher
docker stop demo-consumer && docker start demo-consumer   # catalog events stop while stopped
```

**Broker and init only** (no Node containers):  
`docker compose up -d solace-broker solace-init`

### 2. Install dependencies

```bash
npm run install-all

Or:
npm install && cd frontend && npm install && cd ..
```

### 3. Configure environment

Copy the template and edit **`demo.env`** in the **repository root** (see [Environment variables](#environment-variables)):

```bash
cp demo.env.example demo.env
```

If you already use **`solace.env`** from an older checkout, rename it to **`demo.env`** (same contents).

Set **`DEMO_PROFILE`** to the profile JSON path (relative to repo root or absolute), for example `./profiles/finance.json`. Queue names and Solace connection settings stay in **`demo.env`**.

Example aligned with this repo’s defaults:

```env
SOLACE_HOST=ws://localhost:8008
SOLACE_VPN=default
SOLACE_USERNAME=default
SOLACE_PASSWORD=default

DEMO_PROFILE=./profiles/finance.json

PUBLISH_RATE=2

QUEUE_PARTITIONED=Demo_PQ
QUEUE_NON_EXCLUSIVE=Demo_NQ
QUEUE_EXCLUSIVE=Demo_EQ
```

**Topic subscriptions on the broker** must cover the traffic your profile publishes. With the **Docker** setup above, **`solace/demo/>`** is applied automatically and matches both packaged profiles (`solace/demo/stocks/orders/...`, `solace/demo/retail/...`). On a **broker you manage yourself**, subscribe each queue to **`{messaging.topicPrefix}/>`** from the same JSON as **`DEMO_PROFILE`** (or an equivalent wildcard such as **`solace/demo/>`** if all your topics live under that prefix).

**Frontend Solace URL** must reach the broker Web Transport. In `frontend/src/config.js`, use **`VITE_SOLACE_URL`** (default **`ws://localhost:8008`**) or runtime **`public/config.js`** (`solaceUrl`).

### Choosing a profile

Use **`DEMO_PROFILE`** for both **`npm run consumer`** and **`npm run publisher`** (same file, same path) so partition keys, topics, and payloads stay aligned. Optional npm scripts set the path for you: `npm run publisher:retail` / `npm run consumer:retail` (see root `package.json`). Sample profiles live under `profiles/` (`finance.json` enables **price prediction** and uses eight partition keys; `retail.json` is a fulfillment-style vertical with five keys). Partition key count is defined per profile (validated range in the loader); the **partitioned queue** on the broker must declare the **same** number of partitions as `messaging.partitionKeys.length`.

Setting **`features.pricePrediction`: `true`** (as in `finance.json`) adds the **Prediction** tab and prediction updates emitted from the **consumer** process; the profile must include loader-supported `price` and `quantity` fields (see `backend/lib/demoProfile.js` for constraints).

Solace **connection**, **VPN**, **credentials**, **queue names**, and **PUBLISH_RATE** remain environment-driven; the profile does not contain secrets.

### 4. Create queues on the broker

**Using Docker (step 1)** — Queues and **`solace/demo/>`** subscriptions are created by **`solace-init`** from **`docker/demo.apps.env`**; **`PARTITION_COUNT`** there must match **`messaging.partitionKeys.length`** for the **`DEMO_PROFILE`** you set in the same file. Queue names in that file should match **`QUEUE_*`** in **`demo.env`** when you run Node on the host.

**Manual or external broker** — Create these queues (names must match **`demo.env`** unless you override):

| Queue name | Queue type | Partition count | Partition key property | Topic subscription |
|------------|------------|-----------------|------------------------|--------------------|
| `Demo_PQ` | Partitioned (non-exclusive queue with `partitionCount` > 0) | Same as `partitionKeys.length` in profile (e.g. 8 for `finance.json`, 5 for `retail.json`) | `JMSXGroupID` | Wildcard covering your profile topics (e.g. `{topicPrefix}/>` or `solace/demo/>`) |
| `Demo_NQ` | Non-exclusive | — | — | same as partitioned queue |
| `Demo_EQ` | Exclusive | — | — | same as partitioned queue |

### 5. Run the app

The **consumer** process (15 queue consumers + catalog topic publisher) must run in addition to the publisher and frontend.


```bash
# Terminal 1: consumers + solace/catalog topics
npm run consumer:finance

# Terminal 2: publisher + Vite (see root package.json "dev")
npm run dev

# Or run all components separately:
npm run consumer:finance
npm run publisher:finance
npm run frontend
```

Then open **http://localhost:3000** (Vite port in `frontend/vite.config.js`).

### Using the dashboard

URL: **http://localhost:3000**.

![Screenshot2](./resources/screenshot2.png)

**Header** — Solace connection indicator; primary title plus **profile subtitle** from `branding.appTitle` once **`solace/catalog/profiles`** (or initial **`state`** on the events topic) loads. If the profile sets `features.pricePrediction: true` (e.g. `profiles/finance.json`), tabs appear: **Message Flow** (consumer cards) and **Prediction** (price charts). The browser tab title follows `branding.documentTitle` when the profile loads.

**Publisher panel** — total published **events**, topic prefix (from profile or last publisher stats), and **Active** / **Inactive** based on whether **`publisherStats`** arrive on **`solace/catalog/stats/{profileId}/publisher`** (publisher process must be running for Active).

**Queue panels** (one per queue type)

- **Queue name** from the consumer (matches `QUEUE_*` in `demo.env`), not hardcoded in the UI  
- **Operational status** — HEALTHY, DEGRADED, or DOWN (plus UNKNOWN while warming up)  
- **Connected consumers** — count of connected / active / standby vs total (5 per queue type in this demo)  
- **Partitioned queue only** — broker partition state in brackets: BALANCED, REBALANCING, or UNKNOWN  

**Consumer tiles** (5 per queue)

- Status: active, connected, standby (exclusive), offline  
- Stats, recent messages, assigned partition key (partitioned queue)  
- Disconnect / reconnect for failover and rebalancing experiments  

**Prediction view** (details in [Finance profile and the Prediction UI](#finance-profile-and-the-prediction-ui); finance-style profiles only)

- Requires **`npm run publisher`** with the same `DEMO_PROFILE` so actual prices and stats flow to the UI  
- Charts **actual** publisher prices vs **partitioned-queue** and **non-exclusive** consumer-side predictions (NQ chart uses one canonical consumer index; keep backend **`NQ_PREDICTION_CONSUMER`** and frontend **`VITE_NQ_PREDICTION_CONSUMER`** aligned — see `demo.env.example`)

**Quick experiments**

1. **Partitioned** — same partition key maps to one partition; disconnect a consumer and watch rebalancing.  
2. **Non-exclusive** — all consumers active; parallel delivery.  
3. **Exclusive** — one active, others standby; fail over by disconnecting the active consumer.  
4. **Rebalancing** — on the partitioned panel, disconnect a consumer, observe REBALANCING then BALANCED (~5s stabilization), then reconnect.  
5. **Prediction** — with `finance.json`, switch to **Prediction** and compare PQ vs NQ prediction curves to the publisher’s actual prices.

---

## Background and Design details

### Finance profile and the Prediction UI

The default profile **`profiles/finance.json`** sets **`features.pricePrediction`: `true`**, which turns on a second dashboard mode beside the queue consumer cards:

| UI | What you see |
|----|----------------|
| **Message Flow** | Publisher strip + three queue panels + five consumer tiles per queue (same as other profiles). |
| **Prediction** | Header tabs switch to [`frontend/src/components/PredictionView.jsx`](frontend/src/components/PredictionView.jsx): **per-symbol** price charts with **Actual** (solid line, from **`publisherStats`** on the catalog stats topic), **PQ** (partitioned-queue consumer prediction), and **NQ** (non-exclusive prediction, dashed — one canonical consumer so the line is stable; set **`NQ_PREDICTION_CONSUMER`** and **`VITE_NQ_PREDICTION_CONSUMER`** to the same index, default `1`). Charts include recency / “closeness” style readouts derived from recent prediction error. |

**Retail** (`profiles/retail.json`) and profiles **without** `features.pricePrediction` only show **Message Flow** (no Prediction tab).

## Architecture at a glance

```
Publisher (Node.js)
    ↓ loads DEMO_PROFILE (JSON)
    ↓ publishes to topic: {topicPrefix}/{suffix from payload}
    ↓ (with JMSXGroupID = partition index)
    ↓
Three Queues (wildcard subscription covering profile topics — e.g. `{topicPrefix}/>` or `solace/demo/>` from Docker init)
    ├── Demo_PQ (Partitioned Queue) — partition count = partitionKeys.length in profile
    ├── Demo_NQ (Non-Exclusive Queue)
    └── Demo_EQ (Exclusive Queue)
    ↓
15 Consumers (5 per queue type) — if finance + pricePrediction: prediction hints on solace/catalog/events/{profileId}
    ↓
Publisher → solace/catalog/stats/{profileId}/publisher (~1 Hz)
Consumer  → solace/catalog/profiles + solace/catalog/events/{profileId}
    ↓
React Dashboard (solclientjs Web Transport :8008) — Message Flow; optional Prediction tab (finance.json)
```

### What this demo illustrates

- **Partitioned queue** — routing by partition key (for example a symbol or store id from the profile): ordering per key, scale-out by partition, rebalance on membership changes.  
- **Non-exclusive queue** — all consumers compete for messages in parallel; maximum throughput, no per-key ordering story.  
- **Exclusive queue** — single active consumer, strict ordering across the queue, standby consumers for HA.  
- **Finance Prediction UI** — with `profiles/finance.json`, the **Prediction** tab contrasts **publisher actual prices** with **streaming estimates** from partitioned-queue vs non-exclusive consumer paths (illustrates how delivery semantics affect a simple on-consumer price model).

### Understanding queue types

#### Partitioned queue

**When it fits** — You need **ordering per key** (customer, symbol, account, …) and can scale with partitions.

**Behavior** — Same partition key → same partition; order preserved within a partition; consumers can trigger **rebalance** when they join or leave.

**In this demo** — `JMSXGroupID` carries the partition index derived from the profile’s `partitionKeys` list (index `0` … `n-1` for `n` keys).

#### Non-exclusive queue

**When it fits** — **Throughput** matters; ordering across messages is not required.

**Behavior** — All bound consumers can receive; broker distributes work (e.g. round-robin).

**In this demo** — All five consumers are active and share the load.

#### Exclusive queue

**When it fits** — **Single-writer / single active consumer** semantics with failover: one active, others standby.

**Behavior** — One consumer delivers at a time; failover when the active client drops.

**In this demo** — One consumer active, four standby; disconnect the active one to see failover.

### Project structure

```
partitioned-queue-demo-node/
├── Dockerfile
├── docker-compose.yml         # solace-broker + solace-init + consumer + publisher + frontend
├── Dockerfile.frontend      # Vite build + nginx for dashboard (:3000 on host)
├── docker/
│   ├── demo.apps.env
│   └── nginx-frontend.conf
├── scripts/
│   └── setup-solace.sh        # SEMP: Demo_PQ / Demo_NQ / Demo_EQ + solace/demo/>
├── backend/
│   ├── lib/
│   │   └── demoProfile.js   # load + validate profile; message helpers
│   ├── __tests__/
│   │   └── demoProfile.test.js
│   ├── lib/uiTopics.js      # solace/catalog/* topic helpers
│   ├── consumer.js          # Queue consumers + catalog topic publish + commands
│   └── publisher.js         # Profile-driven publisher + catalog stats topic
├── profiles/
│   ├── finance.json
│   ├── retail.json
│   ├── airline-carrier.json
│   └── airline-hub.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── config.js    # Solace Web Transport (VITE_SOLACE_*); runtime config.js overrides
│   │   ├── hooks/useSolaceDashboard.js
│   │   ├── uiTopics.js
│   │   └── components/
│   │       ├── ConsumerTile.jsx
│   │       ├── Header.jsx
│   │       ├── PredictionView.jsx
│   │       ├── PublisherStatus.jsx
│   │       └── QueuePanel.jsx
│   └── package.json
├── package.json
└── README.md
```

### npm scripts

| Script | Purpose |
|--------|---------|
| `npm run install-all` | Install root + frontend dependencies |
| `npm run test` | Unit tests (profile loader) |
| `npm run publisher` | Publisher only (uses `DEMO_PROFILE` or default `./profiles/finance.json`) |
| `npm run publisher:finance` | Publisher with `profiles/finance.json` |
| `npm run publisher:retail` | Publisher with `profiles/retail.json` |
| `npm run consumer` | 15 queue consumers + `solace/catalog` UI topics |
| `npm run consumer:finance` | Consumer + WS with `profiles/finance.json` |
| `npm run consumer:retail` | Consumer + WS with `profiles/retail.json` |
| `npm run frontend` | Vite dev server |
| `npm run dev` | Publisher + frontend (run `consumer` separately) |

### Technology stack

- **Backend** — Node.js, `solclientjs`, `dotenv`  
- **Frontend** — React 18, Vite, Tailwind CSS, Framer Motion  
- **Broker** — Solace PubSub+ Event Broker  

### Environment variables

| Variable | Description | Typical default |
|----------|-------------|-----------------|
| `SOLACE_HOST` | Broker WebSocket URL | `ws://localhost:8008` |
| `SOLACE_VPN` | Message VPN | `default` |
| `SOLACE_USERNAME` | Client username | `default` |
| `SOLACE_PASSWORD` | Client password | `default` |
| `DEMO_PROFILE` | Path to demo profile JSON (repo-relative or absolute) | `./profiles/finance.json` |
| `PUBLISH_RATE` | Messages per second | `2` |
| `TOPIC_PREFIX` | *(Deprecated when `DEMO_PROFILE` is set.)* Ignored; topic prefix comes from the profile | — |
| `SYMBOLS` | *(Deprecated when `DEMO_PROFILE` is set.)* Ignored | — |
| `QUEUE_PARTITIONED` | Partitioned queue name | `Demo_PQ` |
| `QUEUE_NON_EXCLUSIVE` | Non-exclusive queue name | `Demo_NQ` |
| `QUEUE_EXCLUSIVE` | Exclusive queue name | `Demo_EQ` |
| `NQ_PREDICTION_CONSUMER` | Non-exclusive consumer number (1–5) whose prediction stream feeds the **Prediction** NQ line; must match the dashboard | `1` |

**Docker Compose** — **`docker/demo.apps.env`** is the single config file for **`solace-init`**, **`consumer`**, and **`publisher`** (profile, partitions, queues, Solace URLs, SEMP wait tuning). **`solace-init`** overrides **`SOLACE_HOST`** to the broker hostname for SEMP; **`SEMP_USER`** / **`SEMP_PASS`** stay **`admin`** from **`docker-compose.yml`**.

**Frontend image build** (optional overrides in **`docker-compose.yml`** or a project **`.env`** used only at **`docker compose build`** time):

| Variable | Description | Typical default |
|----------|-------------|-----------------|
| `VITE_SOLACE_URL` | Solace Web Transport URL baked into the static dashboard (**from the browser**) | `ws://localhost:8008` |
| `VITE_SOLACE_VPN` / `VITE_SOLACE_USERNAME` / `VITE_SOLACE_PASSWORD` | Browser session credentials | `default` |
| `VITE_NQ_PREDICTION_CONSUMER` | Must match **`NQ_PREDICTION_CONSUMER`** in **`docker/demo.apps.env`** | `1` |

**Frontend (Vite on host)** — optional: `VITE_SOLACE_*` overrides broker URL/credentials in `frontend/src/config.js`. Runtime **`public/config.js`** (or Docker **`dashboard-config.js`**) sets **`solaceUrl`**, **`solaceVpn`**, etc. **`VITE_NQ_PREDICTION_CONSUMER`** must match **`NQ_PREDICTION_CONSUMER`** when using prediction charts.

### Troubleshooting

**Consumers not connecting**

- Confirm **`demo.env`** host, VPN, user, password.  
- Ensure all three queues exist and subscribe to a topic wildcard that covers your **`DEMO_PROFILE`** (Docker: **`solace/demo/>`** via **`solace-init`**; otherwise **`{topicPrefix}/>`**).  
- Partitioned queue: **partition count = `partitionKeys.length` in your profile** (Docker: when **`PARTITION_COUNT`** in **`docker/demo.apps.env`** changes, re-run **`solace-init`** — see **Profile (Docker) and UI** above). Partition key **JMSXGroupID**.

**No messages**

- Publisher running; check topic prefix in the profile vs queue subscriptions.  
- Partitioned path: publisher sets **JMSXGroupID** (see `backend/publisher.js`).

**UI not updating**

- The **consumer** process must be running — locally **`npm run consumer`**, or the **`demo-consumer`** container.  
- Browser must reach **Web Transport** on **`8008`** (`config.js` **`solaceUrl`** or **`VITE_SOLACE_URL`**; remote VM: open NSG/firewall for **8008**).  
- Header should show **Connected to Solace**. In PubSub+ Manager, watch **`solace/catalog/events/{profileId}`** and **`solace/catalog/stats/{profileId}/publisher`**.

**Publisher panel shows Inactive**

- Start the publisher (`npm run publisher` or `npm run dev`); the UI treats the publisher as **Active** only when **`publisherStats`** arrive on **`solace/catalog/stats/{profileId}/publisher`** (~1 Hz).

**Partition state stuck UNKNOWN / REBALANCING**

- Allow ~5s for stabilization.  
- Ensure at least one partitioned consumer is connected and traffic is flowing.

**PubSub+ Manager (`http://localhost:8080`) — connection refused**

- **`docker ps`** should show host bindings like **`0.0.0.0:8080->8080/tcp`**. If you only see **`8080/tcp`** (no **`->`**) the container was started **without** publishing ports (for example `docker run` without **`-p 8080:8080`**). From this repo use **`docker compose up -d`** in the project directory so **`docker-compose.yml`** port mappings apply, or recreate the container with explicit **`-p`** flags.
- Confirm nothing else is bound to **8080**: `lsof -i :8080` (macOS) or `ss -lntp | grep 8080`.
- Try **IPv4 explicitly**: `curl -v http://127.0.0.1:8080/` (some setups resolve **`localhost`** to **IPv6** first while Docker publishes **IPv4** only).

**Broker container shows `unhealthy`**

- First boot can take **1–2 minutes** before **8080** answers; wait and check **`docker compose logs -f solace-broker`**.  
- This compose file’s health check probes **PubSub+ Manager / SEMP on port 8080** inside the container (not guaranteed-messaging on **5550**), so **`healthy`** aligns with the UI being reachable. If you still see **`unhealthy`** after ~2 minutes, inspect the container: **`docker exec solace-broker curl -sf http://127.0.0.1:8080/ | head`**.

**`solace-broker-init` exits 1** (SEMP / queue setup failed)

- **`solace-init`** starts only after **`solace-broker`** is **healthy**, then waits for SEMP (see **`SEMP_WAIT_*`** in **`docker/demo.apps.env`**), with retries on **502/503/504** for queue and subscription writes. On very slow disks, raise those values in **`docker/demo.apps.env`**.  
- Re-run provisioning: **`docker compose run --rm solace-init`**.

## License

MIT
