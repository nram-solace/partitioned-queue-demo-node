const solace = require('solclientjs');

class PredictionEngine {
  constructor(queueType) {
    this.queueType = queueType;
    const isPq = queueType === 'partitioned';
    this.isPq = isPq;
    this.alpha = isPq ? 0.48 : 0.15;
    this.maxWindow = 100;
    this.ema = null;
    this.window = [];
    this.tradeCount = 0;
  }

  update(price, quantity) {
    this.tradeCount++;
    this.ema = this.ema === null ? price : this.alpha * price + (1 - this.alpha) * this.ema;
    this.window.push({ price, quantity });
    if (this.window.length > this.maxWindow) {
      this.window.shift();
    }
    const totalQty = this.window.reduce((s, t) => s + t.quantity, 0);
    const vwap =
      totalQty === 0
        ? price
        : this.window.reduce((s, t) => s + t.price * t.quantity, 0) / totalQty;
    const blended = this.isPq
      ? 0.42 * this.ema + 0.33 * vwap + 0.25 * price
      : 0.6 * this.ema + 0.4 * vwap;
    return parseFloat(blended.toFixed(2));
  }
}

class QueueConsumer {
  constructor(id, queueName, queueType, consumerNumber, partitionKeyField, onMessage, options = {}) {
    this.id = id;
    this.profileId = options.profileId || 'demo';
    this.queueName = queueName;
    this.queueType = queueType;
    this.consumerNumber = consumerNumber;
    this.partitionKeyField = partitionKeyField;
    this.onMessage = onMessage;
    this.session = null;
    this.messageConsumer = null;
    this.status = 'offline';
    this.messagesProcessed = 0;
    this.lastOrders = [];
    this.startTime = Date.now();
    this.assignedPartitionKey = null;
    this.manualDisconnect = false;
    this.pricePrediction = options.pricePrediction === true;
    this.canonicalNqConsumer = options.canonicalNqConsumer ?? 1;
    this.predictionEngines = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.session = solace.SolclientFactory.createSession({
          url: process.env.SOLACE_HOST || 'ws://localhost:8008',
          vpnName: process.env.SOLACE_VPN || 'default',
          userName: process.env.SOLACE_USERNAME || 'default',
          password: process.env.SOLACE_PASSWORD || 'default',
          clientName: `Consumer-${this.profileId}-${this.queueType}-${this.consumerNumber}-${Date.now()}`,
        });

        this.session.on(solace.SessionEventCode.UP_NOTICE, () => {
          this.createMessageConsumer();
          resolve();
        });

        this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (sessionEvent) => {
          this.status = 'error';
          this.broadcastStatus();
          reject(new Error(sessionEvent.infoStr));
        });

        this.session.on(solace.SessionEventCode.DISCONNECTED, () => {
          if (!this.manualDisconnect) {
            this.status = 'offline';
            this.broadcastStatus();
          }
          this.manualDisconnect = false;
        });

        this.session.connect();
      } catch (error) {
        reject(error);
      }
    });
  }

  createMessageConsumer() {
    const consumerProps = {
      queueDescriptor: { name: this.queueName, type: solace.QueueType.QUEUE },
      acknowledgeMode: solace.MessageConsumerAcknowledgeMode.CLIENT,
      createIfMissing: false,
    };

    this.messageConsumer = this.session.createMessageConsumer(consumerProps);

    this.messageConsumer.on(solace.MessageConsumerEventName.UP, () => {
      if (this.queueType === 'exclusive') {
        this.status = 'standby';
      } else {
        this.status = 'connected';
      }
      this.broadcastStatus();
    });

    this.messageConsumer.on(solace.MessageConsumerEventName.DOWN, () => {
      this.status = 'standby';
      this.broadcastStatus();
    });

    this.messageConsumer.on(solace.MessageConsumerEventName.MESSAGE, (message) => {
      this.handleMessage(message);
    });

    this.messageConsumer.connect();
  }

  handleMessage(message) {
    try {
      const orderData = JSON.parse(message.getBinaryAttachment());
      this.messagesProcessed++;

      if (this.queueType === 'exclusive' && this.status === 'standby') {
        this.status = 'active';
        this.broadcastStatus();
      } else if (
        (this.queueType === 'non-exclusive' || this.queueType === 'partitioned') &&
        this.status === 'connected'
      ) {
        this.status = 'active';
      }

      if (this.queueType === 'partitioned' && !this.assignedPartitionKey) {
        const pk = orderData[this.partitionKeyField];
        this.assignedPartitionKey = pk != null ? String(pk) : null;
      }

      this.lastOrders.unshift(orderData);
      if (this.lastOrders.length > 5) {
        this.lastOrders.pop();
      }

      if (
        this.pricePrediction &&
        (this.queueType === 'partitioned' || this.queueType === 'non-exclusive')
      ) {
        const useNqPrediction =
          this.queueType !== 'non-exclusive' || this.consumerNumber === this.canonicalNqConsumer;
        if (useNqPrediction) {
          const seriesKey = orderData[this.partitionKeyField];
          const price = orderData.price;
          const quantity = orderData.quantity;
          if (seriesKey != null && typeof price === 'number' && typeof quantity === 'number') {
            const key = String(seriesKey);
            let engine = this.predictionEngines.get(key);
            if (!engine) {
              engine = new PredictionEngine(this.queueType);
              this.predictionEngines.set(key, engine);
            }
            const predictedPrice = engine.update(price, quantity);
            this.onMessage({
              type: 'prediction',
              consumerId: this.id,
              queueType: this.queueType,
              consumerNumber: this.consumerNumber,
              symbol: key,
              predictedPrice,
              tradePrice: price,
              tradesUsed: engine.tradeCount,
            });
          }
        }
      }

      const elapsed = (Date.now() - this.startTime) / 1000;
      const rate = (this.messagesProcessed / elapsed).toFixed(2);

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
          status: this.status,
        },
        lastOrders: this.lastOrders,
        assignedPartitionKey: this.assignedPartitionKey,
      });

      message.acknowledge();
    } catch (error) {
      console.error(`❌ Error processing message on consumer ${this.profileId}:${this.id}:`, error);
    }
  }

  broadcastStatus() {
    this.onMessage({
      type: 'status',
      consumerId: this.id,
      queueName: this.queueName,
      queueType: this.queueType,
      consumerNumber: this.consumerNumber,
      status: this.status,
      triggerPartitionCheck: this.queueType === 'partitioned',
    });
  }

  disconnect() {
    this.manualDisconnect = true;
    this.status = 'down';
    if (this.queueType === 'partitioned') {
      this.assignedPartitionKey = null;
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

module.exports = { QueueConsumer, PredictionEngine };
