# Solace Queue Types — Interactive Demo

This is an **interactive demo** for Solace **PubSub+** queue types.

- A **publisher** emits stream of messages for a chosen scenario in a predefined **topic hierarchy**; **three** queues—a **partitioned**, a **non-exclusive**, and an **exclusive** queue—each subscribe to the same pattern, so every queue type sees the **same** traffic.
- **Consumers** attach to each queue, process messages, and the backend **pushes** live stats to the browser over a WebSocket. Number of consumers per queue is configurable.
- The **dashboard** is a visual front end for that activity: you can see how each path delivers work, how load spreads, how ordering differs, and what happens when you **disconnect** or **reconnect** a consumer (**failover** on the exclusive one, **loadbalancing** on the non-exclusive queue, **rebalancing** on the partitioned queue).

![Screenshot](./resources/screenshot.png)

## Profiles

**Profiles** pick the demo domain (e.g. market-style events for finance/banking; fulfillment-style events for retail). Profile defines the topic space, partition keys, payload fields, and on-screen labels. 

*Packaged profiles:*

- finance: `profiles/finance.json`
- retail:  `profiles/retail.json` 

You can add more domains (airlines, energy, and so on) by copying those samples and staying within the rules enforced in `backend/lib/demoProfile.js`.

With **`profiles/finance.json`**, the UI can also show a **Prediction** view: per-symbol charts compare **actual** prices from the publisher with lightweight estimates computed along the **partitioned** and **non-exclusive** paths—so differences in prediction quality echo differences in what each queue type delivers to its consumers. See [Finance profile and the Prediction UI](#finance-profile-and-the-prediction-ui) for behavior and env vars.

![Screenshot](./resources/screenshot-pred.png)

## Getting started

### Prerequisites

- **Node.js** (v14+)
- **Docker and Docker Compose** (optional; for local broker)
- **Solace PubSub+** broker you can manage (create queues and topic subscriptions)

### 1. Start the broker (Docker)

```bash
docker-compose up -d
```

Endpoints (typical local setup):

- **Messaging WebSocket**: `ws://localhost:8008`
- **PubSub+ Manager**: http://localhost:8080 (`admin` / `admin`)

The broker may take 30–60 seconds to become ready (logs show the broker is up, or Manager loads).

Additional docker commands:

```bash
Check process:
docker-compose ps

Check logs:
docker-compose logs -f solace-pqdemo

Stop
docker-compose down

Remove volumes:
docker-compose down -v
```

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

WS_PORT=8081

PUBLISH_RATE=2

QUEUE_PARTITIONED=Demo_PQ
QUEUE_NON_EXCLUSIVE=Demo_NQ
QUEUE_EXCLUSIVE=Demo_EQ
```

**Topic subscriptions on the broker** must use the **`messaging.topicPrefix`** from that same profile, with a wildcard: `{topicPrefix}/>`
`solace/demo/>` subscription should cover all demo topics.

**Frontend WebSocket URL** must match `WS_PORT`. In `frontend/src/config.js`, `VITE_WS_URL` or the fallback should point at the same host/port (default fallback is `ws://localhost:8081`).

### Choosing a profile

Use **`DEMO_PROFILE`** for both **`npm run consumer`** and **`npm run publisher`** (same file, same path) so partition keys, topics, and payloads stay aligned. Optional npm scripts set the path for you: `npm run publisher:retail` / `npm run consumer:retail` (see root `package.json`). Sample profiles live under `profiles/` (`finance.json` enables **price prediction** and uses eight partition keys; `retail.json` is a fulfillment-style vertical with five keys). Partition key count is defined per profile (validated range in the loader); the **partitioned queue** on the broker must declare the **same** number of partitions as `messaging.partitionKeys.length`.

Setting **`features.pricePrediction`: `true`** (as in `finance.json`) adds the **Prediction** tab and prediction updates emitted from the **consumer** process; the profile must include loader-supported `price` and `quantity` fields (see `backend/lib/demoProfile.js` for constraints).

Solace **SMF connection**, **VPN**, **credentials**, **queue names**, **WS_PORT**, and **PUBLISH_RATE** remain environment-driven; the profile does not contain secrets.

### 4. Create queues on the broker

Create these queues (names must match **`demo.env`** unless you override):

| Queue name | Queue type | Partition count | Partition key property | Topic subscription |
|------------|------------|-----------------|------------------------|--------------------|
| `Orders_PQ` | Partitioned | Same as `partitionKeys.length` in profile (e.g. 8 for `finance.json`, 5 for `retail.json`) | `JMSXGroupID` | `{topicPrefix}/>` from `DEMO_PROFILE` |
| `Orders_NQ` | Non-exclusive | — | — | same as partitioned queue |
| `Orders_EQ` | Exclusive | — | — | same as partitioned queue |

### 5. Run the app

The **consumer** process (15 Solace consumers + WebSocket server for the UI) must run in addition to the publisher and frontend.


```bash
# Terminal 1: consumers + WebSocket
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

**Header** — WebSocket connection indicator; primary title plus **profile subtitle** from `branding.appTitle` once the consumer sends the `demoProfile` message. If the profile sets `features.pricePrediction: true` (e.g. `profiles/finance.json`), tabs appear: **Message Flow** (consumer cards) and **Prediction** (price charts). The browser tab title follows `branding.documentTitle` when the profile loads.

**Publisher panel** — total published **events**, topic prefix (from profile or last publisher stats), and **Active** / **Inactive** based on whether publisher stats are arriving over the WebSocket (publisher process must be running for Active).

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
| **Prediction** | Header tabs switch to [`frontend/src/components/PredictionView.jsx`](frontend/src/components/PredictionView.jsx): **per-symbol** price charts with **Actual** (solid line, from the publisher over WebSocket), **PQ** (partitioned-queue consumer prediction), and **NQ** (non-exclusive prediction, dashed — one canonical consumer so the line is stable; set **`NQ_PREDICTION_CONSUMER`** and **`VITE_NQ_PREDICTION_CONSUMER`** to the same index, default `1`). Charts include recency / “closeness” style readouts derived from recent prediction error. |

**Retail** (`profiles/retail.json`) and profiles **without** `features.pricePrediction` only show **Message Flow** (no Prediction tab).

Design and implementation notes for the config-driven demo (including WebSocket profile bootstrap) live under **[`.dev/pm/`](.dev/pm/)** — start with [`impl-generic-demo.md`](.dev/pm/impl-generic-demo.md) and [`plan-generic-demo.md`](.dev/pm/plan-generic-demo.md) if present.

## Architecture at a glance

```
Publisher (Node.js)
    ↓ loads DEMO_PROFILE (JSON)
    ↓ publishes to topic: {topicPrefix}/{suffix from payload}
    ↓ (with JMSXGroupID = partition index)
    ↓
Three Queues (all subscribed to {topicPrefix}/> — must match the running profile)
    ├── Orders_PQ (Partitioned Queue) — partition count = partitionKeys.length in profile
    ├── Orders_NQ (Non-Exclusive Queue)
    └── Orders_EQ (Exclusive Queue)
    ↓
15 Consumers (5 per queue type) — if finance + pricePrediction: each consumer can emit prediction hints
    ↓ WebSocket: state, orders, publisherStats, prediction (finance), demoProfile
    ↓
React Dashboard (Vite + React) — Message Flow; optional Prediction tab (finance.json)
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
├── backend/
│   ├── lib/
│   │   └── demoProfile.js   # load + validate profile; message helpers
│   ├── __tests__/
│   │   └── demoProfile.test.js
│   ├── consumer.js          # Consumer manager + WebSocket + demoProfile
│   └── publisher.js         # Profile-driven publisher
├── profiles/
│   ├── finance.json
│   └── retail.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── config.js    # WebSocket URL (VITE_WS_URL); queue names come from the consumer over WS
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
| `npm run consumer` | 15 consumers + WebSocket server |
| `npm run consumer:finance` | Consumer + WS with `profiles/finance.json` |
| `npm run consumer:retail` | Consumer + WS with `profiles/retail.json` |
| `npm run frontend` | Vite dev server |
| `npm run dev` | Publisher + frontend (run `consumer` separately) |

### Technology stack

- **Backend** — Node.js, `solclientjs`, `ws`, `dotenv`  
- **Frontend** — React 18, Vite, Tailwind CSS, Framer Motion  
- **Broker** — Solace PubSub+ Event Broker  

### Environment variables

| Variable | Description | Typical default |
|----------|-------------|-----------------|
| `SOLACE_HOST` | Broker WebSocket URL | `ws://localhost:8008` |
| `SOLACE_VPN` | Message VPN | `default` |
| `SOLACE_USERNAME` | Client username | `default` |
| `SOLACE_PASSWORD` | Client password | `default` |
| `WS_PORT` | WebSocket server for dashboard | `8081` |
| `DEMO_PROFILE` | Path to demo profile JSON (repo-relative or absolute) | `./profiles/finance.json` |
| `PUBLISH_RATE` | Messages per second | `2` |
| `TOPIC_PREFIX` | *(Deprecated when `DEMO_PROFILE` is set.)* Ignored; topic prefix comes from the profile | — |
| `SYMBOLS` | *(Deprecated when `DEMO_PROFILE` is set.)* Ignored | — |
| `QUEUE_PARTITIONED` | Partitioned queue name | `Orders_PQ` |
| `QUEUE_NON_EXCLUSIVE` | Non-exclusive queue name | `Orders_NQ` |
| `QUEUE_EXCLUSIVE` | Exclusive queue name | `Orders_EQ` |
| `NQ_PREDICTION_CONSUMER` | Non-exclusive consumer number (1–5) whose prediction stream feeds the **Prediction** NQ line; must match the dashboard | `1` |

**Frontend (Vite)** — optional: `VITE_WS_URL` overrides the WebSocket URL in `frontend/src/config.js`. **`VITE_NQ_PREDICTION_CONSUMER`** must match **`NQ_PREDICTION_CONSUMER`** when using prediction charts (set in the shell or a `frontend/.env.local` for Vite). See comments in `demo.env.example`.

### Troubleshooting

**Consumers not connecting**

- Confirm **`demo.env`** host, VPN, user, password.  
- Ensure all three queues exist and subscribe to **`{topicPrefix}/>`** for your active `DEMO_PROFILE`.  
- Partitioned queue: type partitioned, **partition count = `partitionKeys.length` in your profile**, partition key **JMSXGroupID**.

**No messages**

- Publisher running; check topic prefix in the profile vs queue subscriptions.  
- Partitioned path: publisher sets **JMSXGroupID** (see `backend/publisher.js`).

**UI not updating**

- `npm run consumer` must be running (WebSocket server).  
- Browser / `config.js`: WebSocket URL must match `WS_PORT`.  
- Header should show connected state.  
- After upgrading this repo, do a **hard refresh** so the SPA loads the `demoProfile` WebSocket handler.

**Publisher panel shows Inactive**

- Start the publisher (`npm run publisher` or `npm run dev`); the UI treats the publisher as **Active** only when `publisherStats` messages arrive regularly over the WebSocket.

**Partition state stuck UNKNOWN / REBALANCING**

- Allow ~5s for stabilization.  
- Ensure at least one partitioned consumer is connected and traffic is flowing.

## License

MIT
