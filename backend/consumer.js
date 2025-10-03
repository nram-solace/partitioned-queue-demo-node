const solace = require('solclientjs');
const WebSocket = require('ws');
require('dotenv').config();

// Initialize Solace factory
const factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10;
solace.SolclientFactory.init(factoryProps);
solace.SolclientFactory.setLogLevel(solace.LogLevel.WARN);

class ConsumerManager {
  constructor() {
    this.consumers = [];
    this.wsServer = null;
    this.clients = new Set();
    this.partitionState = 'unknown'; // States: unknown, balanced, rebalancing
    this.partitionedState = 'unknown'; // States: unknown, healthy, degraded, down
    this.nonExclusiveState = 'unknown'; // States: unknown, healthy, degraded, down
    this.exclusiveState = 'unknown'; // States: unknown, healthy, degraded, down
    this.lastPartitionCheck = null;
    this.rebalanceDetectionTimer = null;
  }

  startWebSocketServer(port = 8080) {
    this.wsServer = new WebSocket.Server({ port });

    this.wsServer.on('connection', (ws) => {
      console.log('📱 Dashboard connected');
      this.clients.add(ws);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'disconnect') {
            this.handleDisconnectRequest(data.consumerId);
          } else if (data.type === 'reconnect') {
            this.handleReconnectRequest(data.consumerId);
          }
        } catch (error) {
          console.error('❌ Error handling WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('📱 Dashboard disconnected');
        this.clients.delete(ws);
      });

      // Send current state to new client
      this.sendStateToClient(ws);
    });

    console.log(`🌐 WebSocket server listening on port ${port}`);
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  sendStateToClient(client) {
    const state = {
      type: 'state',
      consumers: this.consumers.map(c => ({
        id: c.id,
        queueName: c.queueName,
        queueType: c.queueType,
        consumerNumber: c.consumerNumber,
        status: c.status,
        messagesProcessed: c.messagesProcessed,
        lastOrders: c.lastOrders,
        assignedSymbol: c.assignedSymbol
      })),
      partitionState: this.partitionState,
      partitionedState: this.partitionedState,
      nonExclusiveState: this.nonExclusiveState,
      exclusiveState: this.exclusiveState
    };

    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(state));
    }
  }

  handleDisconnectRequest(consumerId) {
    const consumer = this.consumers.find(c => c.id === consumerId);
    if (consumer) {
      console.log(`🔌 Disconnecting consumer ${consumerId} (${consumer.queueName}-${consumer.consumerNumber})`);
      consumer.disconnect();
    } else {
      console.warn(`⚠️  Consumer ${consumerId} not found`);
    }
  }

  async handleReconnectRequest(consumerId) {
    const consumer = this.consumers.find(c => c.id === consumerId);
    if (consumer) {
      console.log(`🔄 Reconnecting consumer ${consumerId} (${consumer.queueName}-${consumer.consumerNumber})`);
      await consumer.connect();
    } else {
      console.warn(`⚠️  Consumer ${consumerId} not found`);
    }
  }

  checkPartitionState() {
    const partitionedConsumers = this.consumers.filter(c => c.queueType === 'partitioned');

    const activeConsumers = partitionedConsumers.filter(c => c.status === 'active');
    const connectedConsumers = partitionedConsumers.filter(c => c.status === 'connected' || c.status === 'active');
    const assignedConsumers = partitionedConsumers.filter(c => c.assignedSymbol !== null);
    const downConsumers = partitionedConsumers.filter(c => c.status === 'down' || c.status === 'offline');

    // Debug logging
    console.log(`📊 Partition State Check:
      Total: ${partitionedConsumers.length}
      Active: ${activeConsumers.length} (${activeConsumers.map(c => c.consumerNumber).join(',')})
      Connected: ${connectedConsumers.length} (${connectedConsumers.map(c => c.consumerNumber).join(',')})
      Down: ${downConsumers.length} (${downConsumers.map(c => c.consumerNumber).join(',')})
      Assigned: ${assignedConsumers.length} (${assignedConsumers.map(c => `${c.consumerNumber}:${c.assignedSymbol}`).join(',')})
      Statuses: ${partitionedConsumers.map(c => `${c.consumerNumber}=${c.status}`).join(', ')}`);

    // Detect rebalancing by tracking assignment changes
    // When a consumer goes down or comes up, assignments may shift
    this.detectRebalancing(partitionedConsumers);

    // Check operational state (similar to non-exclusive and exclusive)
    this.checkPartitionedOperationalState();
  }

  checkPartitionedOperationalState() {
    const partitionedConsumers = this.consumers.filter(c => c.queueType === 'partitioned');
    const connectedConsumers = partitionedConsumers.filter(c =>
      c.status === 'connected' || c.status === 'active' || c.status === 'standby'
    );

    let newState = 'unknown';

    if (connectedConsumers.length === 0) {
      // All consumers down - queue cannot process messages
      newState = 'down';
    } else if (connectedConsumers.length === partitionedConsumers.length) {
      // All consumers up
      newState = 'healthy';
    } else {
      // Some consumers down, but at least one operational
      newState = 'degraded';
    }

    if (newState !== this.partitionedState) {
      this.partitionedState = newState;
      console.log(`🔀 Partitioned Queue operational state: ${newState}`);
      this.broadcast({
        type: 'queueState',
        queueType: 'partitioned',
        state: newState
      });
    }
  }

  checkNonExclusiveState() {
    const nonExclusiveConsumers = this.consumers.filter(c => c.queueType === 'non-exclusive');
    const connectedConsumers = nonExclusiveConsumers.filter(c =>
      c.status === 'connected' || c.status === 'active' || c.status === 'standby'
    );

    let newState = 'unknown';

    if (connectedConsumers.length === 0) {
      // All consumers down - queue cannot process messages
      newState = 'down';
    } else if (connectedConsumers.length === nonExclusiveConsumers.length) {
      // All consumers up
      newState = 'healthy';
    } else {
      // Some consumers down, but at least one operational
      newState = 'degraded';
    }

    if (newState !== this.nonExclusiveState) {
      this.nonExclusiveState = newState;
      console.log(`🔄 Non-Exclusive Queue state: ${newState}`);
      this.broadcast({
        type: 'queueState',
        queueType: 'non-exclusive',
        state: newState
      });
    }
  }

  checkExclusiveState() {
    const exclusiveConsumers = this.consumers.filter(c => c.queueType === 'exclusive');
    const connectedConsumers = exclusiveConsumers.filter(c =>
      c.status === 'connected' || c.status === 'active' || c.status === 'standby'
    );

    let newState = 'unknown';

    if (connectedConsumers.length === 0) {
      // All consumers down - queue cannot process messages
      newState = 'down';
    } else if (connectedConsumers.length === exclusiveConsumers.length) {
      // All consumers up - full HA redundancy
      newState = 'healthy';
    } else {
      // Some consumers down - reduced redundancy but still processing
      // Note: Processing capacity unaffected (one active consumer = full throughput)
      newState = 'degraded';
    }

    if (newState !== this.exclusiveState) {
      this.exclusiveState = newState;
      console.log(`🔒 Exclusive Queue state: ${newState}`);
      this.broadcast({
        type: 'queueState',
        queueType: 'exclusive',
        state: newState
      });
    }
  }

  detectRebalancing(partitionedConsumers) {
    const connectedConsumers = partitionedConsumers.filter(c => c.status === 'connected' || c.status === 'active');
    const assignedConsumers = partitionedConsumers.filter(c => c.assignedSymbol !== null);

    // Build current assignment snapshot (only include connected consumers)
    const currentAssignments = {};
    partitionedConsumers.forEach(c => {
      // Only track assignments for connected/active consumers
      if (c.status === 'connected' || c.status === 'active') {
        currentAssignments[c.id] = c.assignedSymbol;
      }
    });

    // Detect changes from last snapshot
    if (this.lastAssignmentSnapshot) {
      // Check if assignment map has changed (different keys or different values)
      const lastKeys = Object.keys(this.lastAssignmentSnapshot).sort();
      const currentKeys = Object.keys(currentAssignments).sort();

      const keysChanged = lastKeys.length !== currentKeys.length ||
                         lastKeys.some((key, i) => key !== currentKeys[i]);

      const valuesChanged = currentKeys.some(
        id => currentAssignments[id] !== this.lastAssignmentSnapshot[id]
      );

      if (keysChanged || valuesChanged) {
        console.log('🔄 Partition assignment change detected:');
        console.log('   Previous:', JSON.stringify(this.lastAssignmentSnapshot));
        console.log('   Current:', JSON.stringify(currentAssignments));

        this.setPartitionState('rebalancing');

        // Clear any existing timer
        if (this.rebalanceDetectionTimer) {
          clearTimeout(this.rebalanceDetectionTimer);
        }

        // Set a timer to transition to BALANCED after assignments stabilize
        // Solace typically completes rebalancing within a few seconds
        this.rebalanceDetectionTimer = setTimeout(() => {
          console.log('✅ Partition assignments stabilized - entering BALANCED state');
          this.setPartitionState('balanced');
          this.rebalanceDetectionTimer = null;
        }, 5000); // Wait 5 seconds for stability (increased from 3s to match Solace rebalance time)
      }
    } else {
      // First snapshot - if we have assignments and connected consumers, we're balanced
      if (connectedConsumers.length > 0 && assignedConsumers.length > 0) {
        this.setPartitionState('balanced');
      } else if (connectedConsumers.length > 0) {
        this.setPartitionState('rebalancing');
      }
    }

    // Save snapshot
    this.lastAssignmentSnapshot = { ...currentAssignments };
  }

  setPartitionState(newState) {
    if (newState !== this.partitionState) {
      const oldState = this.partitionState;
      this.partitionState = newState;
      console.log(`🔀 Partition state changed: ${oldState} → ${newState}`);

      this.broadcast({
        type: 'partitionState',
        state: newState
      });
    }
  }

  async createConsumers() {
    const queues = [
      { name: 'Orders_PQ', type: 'partitioned', count: 5 },
      { name: 'NonExclusiveOrders', type: 'non-exclusive', count: 5 },
      { name: 'ExclusiveOrders', type: 'exclusive', count: 5 }
    ];

    let consumerId = 1;
    for (const queue of queues) {
      for (let i = 0; i < queue.count; i++) {
        const consumer = new QueueConsumer(
          consumerId++,
          queue.name,
          queue.type,
          i + 1,
          (data) => {
            this.broadcast(data);
            // Check queue state on status changes only (not on every message)
            if (data.triggerPartitionCheck) {
              this.checkPartitionState();
            }
            if (queue.type === 'partitioned' && data.type === 'status') {
              this.checkPartitionedOperationalState();
            }
            if (queue.type === 'non-exclusive' && data.type === 'status') {
              this.checkNonExclusiveState();
            }
            if (queue.type === 'exclusive' && data.type === 'status') {
              this.checkExclusiveState();
            }
          }
        );
        this.consumers.push(consumer);
        await consumer.connect();
        // Small delay between exclusive queue consumers to allow proper flow status sync
        if (queue.type === 'exclusive') {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
  }

  async start() {
    this.startWebSocketServer();
    await this.createConsumers();
    console.log('✅ All consumers started');
  }

  stop() {
    this.consumers.forEach(c => c.disconnect());
    if (this.wsServer) {
      this.wsServer.close();
    }
  }
}

class QueueConsumer {
  constructor(id, queueName, queueType, consumerNumber, onMessage) {
    this.id = id;
    this.queueName = queueName;
    this.queueType = queueType;
    this.consumerNumber = consumerNumber;
    this.onMessage = onMessage;
    this.session = null;
    this.messageConsumer = null;
    this.status = 'offline';
    this.messagesProcessed = 0;
    this.lastOrders = [];
    this.startTime = Date.now();
    this.assignedSymbol = null; // Track which symbol this partition is handling
    this.manualDisconnect = false; // Track if disconnect was manual
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.session = solace.SolclientFactory.createSession({
          url: process.env.SOLACE_HOST || 'ws://localhost:8008',
          vpnName: process.env.SOLACE_VPN || 'default',
          userName: process.env.SOLACE_USERNAME || 'default',
          password: process.env.SOLACE_PASSWORD || 'default',
          clientName: `Consumer-${this.queueType}-${this.consumerNumber}-${Date.now()}`
        });

        this.session.on(solace.SessionEventCode.UP_NOTICE, () => {
          console.log(`✅ Consumer ${this.id} (${this.queueName}) session connected`);
          this.createMessageConsumer();
          resolve();
        });

        this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (sessionEvent) => {
          console.error(`❌ Consumer ${this.id} connection failed:`, sessionEvent.infoStr);
          this.status = 'error';
          this.broadcastStatus();
          reject(new Error(sessionEvent.infoStr));
        });

        this.session.on(solace.SessionEventCode.DISCONNECTED, () => {
          // Only change status to offline if it wasn't a manual disconnect
          if (!this.manualDisconnect) {
            this.status = 'offline';
            console.log(`⚠️  Consumer ${this.id} disconnected`);
            this.broadcastStatus();
          }
          this.manualDisconnect = false; // Reset flag
        });

        this.session.connect();
      } catch (error) {
        reject(error);
      }
    });
  }

  createMessageConsumer() {
    try {
      console.log(`🔌 Consumer ${this.id} binding to queue: ${this.queueName} (type: ${this.queueType})`);

      const consumerProps = {
        queueDescriptor: { name: this.queueName, type: solace.QueueType.QUEUE },
        acknowledgeMode: solace.MessageConsumerAcknowledgeMode.CLIENT,
        createIfMissing: false
      };

      this.messageConsumer = this.session.createMessageConsumer(consumerProps);

      // Register ALL event handlers BEFORE connecting to avoid missing events
      this.messageConsumer.on(solace.MessageConsumerEventName.UP, () => {
        // Flow is UP - this consumer is now connected
        console.log(`⬆️  Consumer ${this.id} (${this.queueName}-${this.consumerNumber}) received UP event`);

        if (this.queueType === 'exclusive') {
          // For exclusive queues, start as standby. Will change to active when messages flow
          this.status = 'standby';
          console.log(`⚪ Consumer ${this.id} (${this.queueName}-${this.consumerNumber}) status: STANDBY (waiting for messages)`);
        } else {
          this.status = 'connected';
          console.log(`🔵 Consumer ${this.id} (${this.queueName}-${this.consumerNumber}) status: CONNECTED`);
        }
        this.broadcastStatus();
      });

      this.messageConsumer.on(solace.MessageConsumerEventName.DOWN, () => {
        // Flow is DOWN
        console.log(`⬇️  Consumer ${this.id} (${this.queueName}-${this.consumerNumber}) received DOWN event`);
        this.status = 'standby';
        console.log(`⚪ Consumer ${this.id} (${this.queueName}-${this.consumerNumber}) status: STANDBY`);
        this.broadcastStatus();
      });

      this.messageConsumer.on(solace.MessageConsumerEventName.CONNECT_FAILED_ERROR, (error) => {
        console.error(`❌ Consumer ${this.id} (${this.queueName}-${this.consumerNumber}) connection error:`, error);
      });

      this.messageConsumer.on(solace.MessageConsumerEventName.MESSAGE, (message) => {
        this.handleMessage(message);
      });

      // Connect AFTER all event handlers are registered
      this.messageConsumer.connect();
    } catch (error) {
      console.error(`❌ Failed to create message consumer ${this.id}:`, error);
    }
  }

  handleMessage(message) {
    try {
      const orderData = JSON.parse(message.getBinaryAttachment());
      this.messagesProcessed++;

      // Change status to 'active' when messages flow
      if (this.queueType === 'exclusive' && this.status === 'standby') {
        this.status = 'active';
        console.log(`🟢 Consumer ${this.id} (${this.queueName}-${this.consumerNumber}) now ACTIVE (exclusive, messages flowing)`);
        this.broadcastStatus();
      } else if ((this.queueType === 'non-exclusive' || this.queueType === 'partitioned') &&
          this.status === 'connected') {
        this.status = 'active';
        console.log(`🟢 Consumer ${this.id} (${this.queueName}-${this.consumerNumber}) now active (messages flowing)`);
      }

      // Track assigned symbol for partitioned queues
      if (this.queueType === 'partitioned' && !this.assignedSymbol) {
        this.assignedSymbol = orderData.symbol;
        console.log(`🎯 Consumer ${this.id} (Partition ${this.consumerNumber}) assigned to symbol: ${this.assignedSymbol}`);
      }

      // Keep last 5 orders
      this.lastOrders.unshift(orderData);
      if (this.lastOrders.length > 5) {
        this.lastOrders.pop();
      }

      // Calculate rate
      const elapsed = (Date.now() - this.startTime) / 1000;
      const rate = (this.messagesProcessed / elapsed).toFixed(2);

      // Broadcast to dashboard
      this.onMessage({
        type: 'order',
        consumerId: this.id,
        queueName: this.queueName,
        queueType: this.queueType,
        consumerNumber: this.consumerNumber,
        order: orderData,
        stats: {
          messagesProcessed: this.messagesProcessed,
          rate: parseFloat(rate),
          status: this.status
        },
        lastOrders: this.lastOrders,
        assignedSymbol: this.assignedSymbol
      });

      // Acknowledge message
      message.acknowledge();

    } catch (error) {
      console.error(`❌ Error processing message on consumer ${this.id}:`, error);
    }
  }

  broadcastStatus() {
    // Broadcast status change to dashboard
    this.onMessage({
      type: 'status',
      consumerId: this.id,
      queueName: this.queueName,
      queueType: this.queueType,
      consumerNumber: this.consumerNumber,
      status: this.status,
      triggerPartitionCheck: this.queueType === 'partitioned' // Signal to check partition state
    });
  }

  disconnect() {
    console.log(`🔌 Disconnecting consumer ${this.id} (${this.queueName}-${this.consumerNumber})`);

    this.manualDisconnect = true; // Mark as manual disconnect
    this.status = 'down';

    // Clear assigned symbol when disconnecting - partitions will be reassigned
    if (this.queueType === 'partitioned') {
      this.assignedSymbol = null;
    }

    this.broadcastStatus();

    if (this.messageConsumer) {
      this.messageConsumer.disconnect();
      this.messageConsumer.dispose();
      this.messageConsumer = null;
    }
    if (this.session) {
      this.session.disconnect();
      this.session = null;
    }
  }
}

// Main execution
async function main() {
  const manager = new ConsumerManager();

  try {
    await manager.start();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down consumers...');
      manager.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start consumers:', error);
    process.exit(1);
  }
}

main();
