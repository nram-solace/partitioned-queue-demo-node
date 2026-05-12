# Partitioned Queue Demo - Solace PubSub+ Queue Types

A real-time interactive dashboard demonstrating three different Solace PubSub+ queue types (Partitioned, Non-Exclusive, and Exclusive) using a stock order processing simulation.

## Overview

This demo visualizes how different queue types handle message distribution across multiple consumers:

- **Partitioned Queue**: Messages are distributed based on a partition key (stock symbol), ensuring consistent routing and ordering per partition
- **Non-Exclusive Queue**: Messages are load-balanced across all active consumers for maximum throughput
- **Exclusive Queue**: Only one consumer is active at a time, with others in standby for high availability

## Architecture

```
Publisher (Node.js)
    ↓ publishes to topic: stocks/orders/{symbol}
    ↓ (with JMSXGroupID partition key)
    ↓
Three Queues (all subscribed to stocks/orders/>)
    ├── Orders_PQ (Partitioned Queue) - 5 partitions
    ├── NonExclusiveOrders (Non-Exclusive Queue)
    └── ExclusiveOrders (Exclusive Queue)
    ↓
15 Consumers (5 per queue type)
    ↓ sends real-time updates via WebSocket
    ↓
React Dashboard (Vite + React)
```

## Prerequisites

- **Node.js** (v14 or higher)
- **Docker and Docker Compose** (for running Solace broker locally)
- **Solace PubSub+ Event Broker** (local via Docker or cloud instance)
- Access to create queues and configure subscriptions on the broker

## Quick Start with Docker

### Start Solace PubSub+ Broker

The easiest way to get started is to run the Solace broker using Docker Compose:

```bash
# Start the Solace broker
docker-compose up -d

# Check broker status
docker-compose ps

# View broker logs
docker-compose logs -f solace-broker
```

The broker will be available at:
- **WebSocket**: `ws://localhost:8008` (used by the demo)
- **PubSub+ Manager (Web UI)**: http://localhost:8080
  - Username: `admin`
  - Password: `admin`

**Note**: The broker may take 30-60 seconds to fully start. You can verify it's ready by:
- Checking the logs: `docker-compose logs -f solace-broker` (look for "Solace PubSub+ broker is up")
- Accessing the PubSub+ Manager at http://localhost:8080
- Checking container status: `docker-compose ps` (should show "healthy" or "Up")

### Stop the Broker

```bash
docker-compose down
```

To remove all data volumes:
```bash
docker-compose down -v
```

## Installation

### 1. Install Dependencies

Install all dependencies (root and frontend):

```bash
npm run install-all
```

Or manually:

```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Solace PubSub+ Connection
# For Docker Compose setup, use these defaults:
SOLACE_HOST=ws://localhost:8008
SOLACE_VPN=default
SOLACE_USERNAME=admin
SOLACE_PASSWORD=admin

# WebSocket Server Port (for dashboard communication)
WS_PORT=8080

# Publisher Settings
PUBLISH_RATE=10                    # Messages per second
TOPIC_PREFIX=stocks/orders         # Topic prefix for orders
SYMBOLS=AAPL,GOOGL,MSFT,AMZN,TSLA  # Stock symbols to publish

# Queue Names (optional - defaults shown)
QUEUE_PARTITIONED=Orders_PQ
QUEUE_NON_EXCLUSIVE=Orders_EQ
QUEUE_EXCLUSIVE=Orders_NQ
```

**Note**: 
- If using the Docker Compose setup, use `admin`/`admin` for username/password
- If using a cloud instance or different broker, update the connection details accordingly
- The `default` VPN is automatically created by the Solace broker

### 3. Configure Frontend WebSocket URL

If your WebSocket server runs on a different port, update `frontend/src/config.js`:

```javascript
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'
```

**Important**: Ensure the WebSocket port matches the `WS_PORT` in your `.env` file (default: 8080).

## Solace Queue Configuration

Before running the demo, create these queues in your Solace PubSub+ broker:

### 1. Orders_PQ (Partitioned Queue)

```
Queue Name: Orders_PQ
Queue Type: Partitioned Queue
Partition Count: 5
Partition Key Property: JMSXGroupID
Topic Subscription: stocks/orders/>
```

**Configuration Details**:
- Partition key is set via `JMSXGroupID` user property in messages
- Each symbol (AAPL, GOOGL, MSFT, AMZN, TSLA) maps to a specific partition (0-4)
- Ensures all messages for the same symbol go to the same partition

### 2. NonExclusiveOrders (Non-Exclusive Queue)

```
Queue Name: NonExclusiveOrders
Queue Type: Non-Exclusive Queue
Topic Subscription: stocks/orders/>
```

**Configuration Details**:
- Messages are distributed round-robin across all active consumers
- All consumers can process messages simultaneously

### 3. ExclusiveOrders (Exclusive Queue)

```
Queue Name: ExclusiveOrders
Queue Type: Exclusive Queue
Topic Subscription: stocks/orders/>
```

**Configuration Details**:
- Only one consumer can be active at a time
- Other consumers remain in standby mode
- Automatic failover if the active consumer disconnects

## Running the Demo

**Important**: Make sure the Solace broker is running before starting the demo:
```bash
docker-compose up -d
```

Wait for the broker to be healthy (check with `docker-compose ps`), then proceed.

### Option 1: Run All Services Together (Recommended)

Start publisher, consumers, and frontend together:

```bash
npm run dev
```

This will:
- Start the publisher (publishes stock orders)
- Start the consumer manager (15 consumers + WebSocket server)
- Start the frontend dev server (React dashboard)

Then open **http://localhost:3000** in your browser.

### Option 2: Run Services Separately

**Terminal 1 - Start Publisher:**
```bash
npm run publisher
```

**Terminal 2 - Start Consumers:**
```bash
npm run consumer
```

**Terminal 3 - Start Frontend:**
```bash
npm run frontend
```

Then open **http://localhost:3000** in your browser.

## Using the Dashboard

### Dashboard Features

1. **Publisher Status Panel**
   - Shows total messages published
   - Displays publish rate and topic pattern

2. **Queue Panels** (one for each queue type)
   - **Queue Status**: HEALTHY, DEGRADED, or DOWN
   - **Consumer Status**: Shows how many consumers are up
   - **Message Count**: Total messages processed per queue type
   - **Partition State** (Partitioned Queue only): BALANCED or REBALANCING

3. **Consumer Tiles** (5 per queue)
   - **Status Indicators**:
     - 🟢 Active (processing messages)
     - 🔵 Connected (ready but no messages yet)
     - ⚪ Standby (exclusive queue - waiting for failover)
     - ⚫ Offline/Down
   - **Statistics**: Messages processed, processing rate
   - **Last Orders**: Shows the last 5 orders received
   - **Assigned Symbol** (Partitioned Queue): Which stock symbol this partition handles
   - **Controls**: Disconnect/Reconnect buttons for testing

### Interactive Demo Scenarios

#### 1. Observe Partitioned Queue Behavior

- Watch how each consumer consistently receives orders for the same stock symbol
- Notice the partition assignment: AAPL → Partition 0, GOOGL → Partition 1, etc.
- Disconnect a consumer and observe rebalancing (status changes to REBALANCING, then BALANCED)

#### 2. Observe Non-Exclusive Queue Behavior

- All 5 consumers are active simultaneously
- Messages are distributed across all consumers (round-robin)
- Each consumer processes different symbols
- Disconnect a consumer - remaining consumers continue processing

#### 3. Observe Exclusive Queue Behavior

- Only one consumer is active (typically Consumer 1)
- Other consumers show "Standby" status
- Disconnect the active consumer - watch automatic failover to the next consumer
- Reconnect the original consumer - it becomes standby again

#### 4. Test Rebalancing (Partitioned Queue)

1. Start with all 5 consumers active
2. Click "Disconnect" on Consumer 2
3. Watch the partition state change to "REBALANCING"
4. Observe symbols being reassigned to remaining consumers
5. After ~5 seconds, state changes to "BALANCED"
6. Click "Reconnect" on Consumer 2
7. Watch rebalancing again as the consumer rejoins

## Understanding Queue Types

### Partitioned Queue

**Use Case**: When you need guaranteed ordering per partition key (e.g., per customer, per symbol, per account)

**Characteristics**:
- Messages with the same partition key always go to the same partition
- Ensures ordering within a partition
- Horizontal scaling - add more partitions for more parallelism
- Automatic rebalancing when consumers join/leave

**In This Demo**:
- Stock symbol is used as the partition key
- Each symbol consistently routes to the same partition
- Perfect for scenarios where you need to process all orders for a symbol in order

### Non-Exclusive Queue

**Use Case**: Maximum throughput with horizontal scaling, no ordering requirements

**Characteristics**:
- All consumers process messages simultaneously
- Round-robin distribution
- No ordering guarantees
- Maximum parallelism

**In This Demo**:
- All 5 consumers are active
- Messages are distributed evenly
- Best for high-throughput scenarios where order doesn't matter

### Exclusive Queue

**Use Case**: Strict ordering across all messages, with high availability

**Characteristics**:
- Only one active consumer at a time
- Other consumers in standby for failover
- Guarantees strict ordering
- Automatic failover if active consumer fails

**In This Demo**:
- One consumer processes all messages
- Others wait in standby
- Perfect for scenarios requiring strict message ordering

## Troubleshooting

### Consumers Not Connecting

1. **Verify Solace Connection**:
   - Check `.env` file has correct broker details
   - Test connection: `telnet <broker-host> <port>`
   - Verify VPN, username, and password are correct

2. **Verify Queues Exist**:
   - Log into Solace broker management console
   - Confirm all three queues are created
   - Verify topic subscriptions are added (`stocks/orders/>`)

3. **Check Queue Types**:
   - Ensure Orders_PQ is configured as Partitioned Queue
   - Ensure partition count is 5
   - Verify JMSXGroupID is set as partition key property

### No Messages Appearing

1. **Check Publisher**:
   - Verify publisher is running: `npm run publisher`
   - Check console for publish confirmations
   - Verify topic pattern matches queue subscriptions

2. **Check Queue Subscriptions**:
   - Ensure all queues subscribe to `stocks/orders/>`
   - Verify wildcard subscription is correct

3. **Check Partition Key**:
   - For partitioned queue, verify JMSXGroupID is being set
   - Check publisher.js sets partition key correctly

### Frontend Not Updating

1. **WebSocket Connection**:
   - Check header shows green "Connected" indicator
   - Verify WebSocket port matches (default: 8080)
   - Check browser console for WebSocket errors

2. **Port Configuration**:
   - Ensure `WS_PORT` in `.env` matches `VITE_WS_URL` in frontend config
   - Default: backend uses 8080, frontend expects 8080

3. **Consumer Backend**:
   - Verify `npm run consumer` is running
   - Check console for WebSocket server startup message
   - Look for "WebSocket server listening on port 8080"

### Partition State Stuck on "UNKNOWN" or "REBALANCING"

- Wait a few seconds - rebalancing detection has a 5-second stabilization period
- Ensure at least one partitioned queue consumer is connected
- Check that consumers are receiving messages (messages trigger partition assignment)

## Project Structure

```
partitioned-queue-demo-vite/
├── backend/
│   ├── consumer.js      # Consumer manager + WebSocket server
│   └── publisher.js     # Stock order publisher
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # Main dashboard component
│   │   ├── config.js    # Frontend configuration
│   │   └── components/
│   │       ├── ConsumerTile.jsx    # Individual consumer display
│   │       ├── Header.jsx          # Dashboard header
│   │       ├── PublisherStatus.jsx # Publisher stats panel
│   │       └── QueuePanel.jsx      # Queue type panel
│   └── package.json
├── package.json         # Root package.json with scripts
└── README.md           # This file
```

## Key Scripts

- `npm run install-all` - Install all dependencies (root + frontend)
- `npm run publisher` - Start the publisher only
- `npm run consumer` - Start consumers + WebSocket server
- `npm run frontend` - Start frontend dev server
- `npm run dev` - Start all services concurrently

## Technology Stack

- **Backend**: Node.js, Solace JavaScript API (solclientjs), WebSocket (ws)
- **Frontend**: React 18, Vite, TailwindCSS, Framer Motion
- **Message Broker**: Solace PubSub+ Event Broker
- **Communication**: WebSocket for real-time dashboard updates

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLACE_HOST` | Solace broker WebSocket URL | `ws://localhost:8008` |
| `SOLACE_VPN` | Solace VPN name | `default` |
| `SOLACE_USERNAME` | Solace username | `default` |
| `SOLACE_PASSWORD` | Solace password | `default` |
| `WS_PORT` | WebSocket server port | `8080` |
| `PUBLISH_RATE` | Messages per second | `10` |
| `TOPIC_PREFIX` | Topic prefix for orders | `stocks/orders` |
| `SYMBOLS` | Comma-separated stock symbols | `AAPL,GOOGL,MSFT,AMZN,TSLA` |
| `QUEUE_PARTITIONED` | Partitioned queue name | `Orders_PQ` |
| `QUEUE_NON_EXCLUSIVE` | Non-exclusive queue name | `NonExclusiveOrders` |
| `QUEUE_EXCLUSIVE` | Exclusive queue name | `ExclusiveOrders` |

## License

MIT

