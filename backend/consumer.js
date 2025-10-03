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
  }

  startWebSocketServer(port = 8080) {
    this.wsServer = new WebSocket.Server({ port });

    this.wsServer.on('connection', (ws) => {
      console.log('📱 Dashboard connected');
      this.clients.add(ws);

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
      }))
    };

    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(state));
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
          (data) => this.broadcast(data)
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
          this.status = 'offline';
          console.log(`⚠️  Consumer ${this.id} disconnected`);
          this.broadcastStatus();
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
      status: this.status
    });
  }

  disconnect() {
    if (this.messageConsumer) {
      this.messageConsumer.disconnect();
      this.messageConsumer.dispose();
    }
    if (this.session) {
      this.session.disconnect();
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
