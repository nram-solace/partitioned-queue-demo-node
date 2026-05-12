# Solace Queue Types — Interactive Demo

Real-time **React** dashboard for **Solace PubSub+** queue behavior: partitioned, non-exclusive, and exclusive queues, driven by a simulated stock-order publisher.

![Screenshot](./resources/screenshot.png)

## Architecture at a glance

```
Publisher (Node.js)
    ↓ publishes to topic: stocks/orders/{symbol}
    ↓ (with JMSXGroupID partition key)
    ↓
Three Queues (all subscribed to stocks/orders/>)
    ├── Orders_PQ (Partitioned Queue) - 5 partitions
    ├── Orders_NQ (Non-Exclusive Queue)
    └── Orders_EQ (Exclusive Queue)
    ↓
15 Consumers (5 per queue type)
    ↓ sends real-time updates via WebSocket
    ↓
React Dashboard (Vite + React)
```

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

Create a `.env` in the **repository root** (see [Environment variables](#environment-variables) for all keys). Example aligned with this repo’s defaults:

```env
SOLACE_HOST=ws://localhost:8008
SOLACE_VPN=default
SOLACE_USERNAME=default
SOLACE_PASSWORD=default

WS_PORT=8081

PUBLISH_RATE=2
TOPIC_PREFIX=stocks/orders
SYMBOLS=AAPL,GOOGL,MSFT,AMZN,TSLA,NVDA,WMT,INTC,META,JPM,NTRS

QUEUE_PARTITIONED=Orders_PQ
QUEUE_NON_EXCLUSIVE=Orders_NQ
QUEUE_EXCLUSIVE=Orders_EQ
```

**Frontend WebSocket URL** must match `WS_PORT`. In `frontend/src/config.js`, `VITE_WS_URL` or the fallback should point at the same host/port (default fallback is `ws://localhost:8081`).

### 4. Create queues on the broker

Create these queues (names must match `.env` unless you override):

| Queue name | Queue type | Partition count | Partition key property | Topic subscription |
|------------|------------|-----------------|------------------------|--------------------|
| `Orders_PQ` | Partitioned | 5 | `JMSXGroupID` | `stocks/orders/>` |
| `Orders_NQ` | Non-exclusive | — | — | `stocks/orders/>` |
| `Orders_EQ` | Exclusive | — | — | `stocks/orders/>` |

### 5. Run the app

The **consumer** process (15 Solace consumers + WebSocket server for the UI) must run in addition to the publisher and frontend.



```bash
# Terminal 1: consumers + WebSocket
npm run consumer

# Terminal 2: publisher + Vite (see root package.json "dev")
npm run dev

# Or run all components seperately:
npm run consumer
npm run publisher
npm run frontend
```

Then open **http://localhost:3000** (Vite port in `frontend/vite.config.js`).


### Using the dashboard

URL: **http://localhost:3000**.

![Screenshot2](./resources/screenshot2.png)

**Publisher panel** — publish totals, rate, topic pattern.

**Queue panels** (one per queue type)

- Queue status (e.g. healthy / degraded / down), consumer counts, message counts  
- Partitioned queue: partition state (balanced / rebalancing)

**Consumer tiles** (5 per queue)

- Status: active, connected, standby (exclusive), offline  
- Stats, last orders, assigned symbol (partitioned queue)  
- Disconnect / reconnect for failover and rebalancing experiments

**Quick experiments**

1. **Partitioned** — same symbol sticks to one consumer’s partition; disconnect a consumer and watch rebalancing.  
2. **Non-exclusive** — all consumers active; round-robin style spread.  
3. **Exclusive** — one active, others standby; fail over by disconnecting the active consumer.  
4. **Rebalancing** — on the partitioned panel, disconnect a consumer, observe REBALANCING then BALANCED (~5s stabilization), then reconnect.

---

## Background and Design details

### What this demo illustrates

- **Partitioned queue** — routing by partition key (here, stock symbol): ordering per key, scale-out by partition, rebalance on membership changes.  
- **Non-exclusive queue** — all consumers compete for messages in parallel; maximum throughput, no per-key ordering story.  
- **Exclusive queue** — single active consumer, strict ordering across the queue, standby consumers for HA.

### Understanding queue types

#### Partitioned queue

**When it fits** — You need **ordering per key** (customer, symbol, account, …) and can scale with partitions.

**Behavior** — Same partition key → same partition; order preserved within a partition; consumers can trigger **rebalance** when they join or leave.

**In this demo** — `JMSXGroupID` carries the symbol; symbols map to partitions 0–4 with five partitions.

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
│   ├── consumer.js      # Consumer manager + WebSocket server
│   └── publisher.js     # Stock order publisher
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── config.js    # WS URL + queue name constants for UI labels
│   │   └── components/
│   │       ├── ConsumerTile.jsx
│   │       ├── Header.jsx
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
| `npm run publisher` | Publisher only |
| `npm run consumer` | 15 consumers + WebSocket server |
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
| `PUBLISH_RATE` | Messages per second | `2` |
| `TOPIC_PREFIX` | Topic prefix | `stocks/orders` |
| `SYMBOLS` | Comma-separated symbols | (see `.env`) |
| `QUEUE_PARTITIONED` | Partitioned queue name | `Orders_PQ` |
| `QUEUE_NON_EXCLUSIVE` | Non-exclusive queue name | `Orders_NQ` |
| `QUEUE_EXCLUSIVE` | Exclusive queue name | `Orders_EQ` |

Frontend: set `VITE_WS_URL` if the WebSocket is not on the default in `frontend/src/config.js`.

### Troubleshooting

**Consumers not connecting**

- Confirm `.env` host, VPN, user, password.  
- Ensure all three queues exist and subscribe to `stocks/orders/>`.  
- Partitioned queue: type partitioned, 5 partitions, partition key **JMSXGroupID**.

**No messages**

- Publisher running; check topic vs subscriptions.  
- Partitioned path: publisher sets **JMSXGroupID** (see `backend/publisher.js`).

**UI not updating**

- `npm run consumer` must be running (WebSocket server).  
- Browser / `config.js`: WebSocket URL must match `WS_PORT`.  
- Header should show connected state.

**Partition state stuck UNKNOWN / REBALANCING**

- Allow ~5s for stabilization.  
- Ensure at least one partitioned consumer is connected and traffic is flowing.

## License

MIT
