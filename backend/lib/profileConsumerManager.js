const { getQueueNames } = require('./demoProfile');
const { slimProfile } = require('./catalogPayload');
const { QueueConsumer } = require('./queueConsumer');

class ProfileConsumerManager {
  /**
   * @param {object} profile validated demo profile
   * @param {(message: object) => void} onPublish publish to solace/catalog/events/{profileId}
   */
  constructor(profile, onPublish) {
    this.profile = profile;
    this.onPublish = onPublish;
    this.consumers = [];
    this.partitionState = 'unknown';
    this.partitionedState = 'unknown';
    this.nonExclusiveState = 'unknown';
    this.exclusiveState = 'unknown';
    this.lastPartitionCheck = null;
    this.rebalanceDetectionTimer = null;
    this.messageCounts = { partitioned: 0, 'non-exclusive': 0, exclusive: 0 };
    this.publisherStats = {
      publishedCount: 0,
      rate: 0,
      topicName: '',
      publishedCountBySymbol: {},
    };
    this.lastAssignmentSnapshot = null;
  }

  getQueueNames() {
    return getQueueNames(this.profile);
  }

  broadcast(message) {
    this.onPublish(message);
  }

  buildStatePayload() {
    return {
      type: 'state',
      profile: slimProfile(this.profile),
      consumers: this.consumers.map((c) => {
        const elapsed = (Date.now() - c.startTime) / 1000;
        const rate =
          elapsed > 0 ? parseFloat((c.messagesProcessed / elapsed).toFixed(2)) : 0;
        return {
          id: c.id,
          queueName: c.queueName,
          queueType: c.queueType,
          consumerNumber: c.consumerNumber,
          status: c.status,
          messagesProcessed: c.messagesProcessed,
          rate,
          lastOrders: c.lastOrders,
          assignedPartitionKey: c.assignedPartitionKey,
        };
      }),
      partitionState: this.partitionState,
      partitionedState: this.partitionedState,
      nonExclusiveState: this.nonExclusiveState,
      exclusiveState: this.exclusiveState,
      messageCounts: this.messageCounts,
      publisherStats: this.publisherStats,
      queueNames: this.getQueueNames(),
    };
  }

  refreshOperationalState() {
    this.checkPartitionState();
    this.checkPartitionedOperationalState();
    this.checkNonExclusiveState();
    this.checkExclusiveState();
  }

  handleDisconnectRequest(consumerId) {
    const consumer = this.consumers.find((c) => c.id === consumerId);
    if (consumer) {
      consumer.disconnect();
    } else {
      console.warn(`⚠️  [${this.profile.id}] Consumer ${consumerId} not found`);
    }
  }

  async handleReconnectRequest(consumerId) {
    const consumer = this.consumers.find((c) => c.id === consumerId);
    if (consumer) {
      await consumer.connect();
    } else {
      console.warn(`⚠️  [${this.profile.id}] Consumer ${consumerId} not found`);
    }
  }

  checkPartitionState() {
    const partitionedConsumers = this.consumers.filter((c) => c.queueType === 'partitioned');
    this.detectRebalancing(partitionedConsumers);
    this.checkPartitionedOperationalState();
  }

  checkPartitionedOperationalState() {
    const partitionedConsumers = this.consumers.filter((c) => c.queueType === 'partitioned');
    const connectedConsumers = partitionedConsumers.filter((c) =>
      ['connected', 'active', 'standby'].includes(c.status),
    );
    let newState = 'unknown';
    if (connectedConsumers.length === 0) {
      newState = 'down';
    } else if (connectedConsumers.length === partitionedConsumers.length) {
      newState = 'healthy';
    } else {
      newState = 'degraded';
    }
    if (newState !== this.partitionedState) {
      this.partitionedState = newState;
      this.broadcast({ type: 'queueState', queueType: 'partitioned', state: newState });
    }
  }

  checkNonExclusiveState() {
    const list = this.consumers.filter((c) => c.queueType === 'non-exclusive');
    const connected = list.filter((c) => ['connected', 'active', 'standby'].includes(c.status));
    let newState = 'unknown';
    if (connected.length === 0) newState = 'down';
    else if (connected.length === list.length) newState = 'healthy';
    else newState = 'degraded';
    if (newState !== this.nonExclusiveState) {
      this.nonExclusiveState = newState;
      this.broadcast({ type: 'queueState', queueType: 'non-exclusive', state: newState });
    }
  }

  checkExclusiveState() {
    const list = this.consumers.filter((c) => c.queueType === 'exclusive');
    const connected = list.filter((c) => ['connected', 'active', 'standby'].includes(c.status));
    let newState = 'unknown';
    if (connected.length === 0) newState = 'down';
    else if (connected.length === list.length) newState = 'healthy';
    else newState = 'degraded';
    if (newState !== this.exclusiveState) {
      this.exclusiveState = newState;
      this.broadcast({ type: 'queueState', queueType: 'exclusive', state: newState });
    }
  }

  detectRebalancing(partitionedConsumers) {
    const connectedConsumers = partitionedConsumers.filter((c) =>
      ['connected', 'active'].includes(c.status),
    );
    const assignedConsumers = partitionedConsumers.filter((c) => c.assignedPartitionKey !== null);
    const currentAssignments = {};
    partitionedConsumers.forEach((c) => {
      if (c.status === 'connected' || c.status === 'active') {
        currentAssignments[c.id] = c.assignedPartitionKey;
      }
    });

    if (this.lastAssignmentSnapshot) {
      const lastKeys = Object.keys(this.lastAssignmentSnapshot).sort();
      const currentKeys = Object.keys(currentAssignments).sort();
      const keysChanged =
        lastKeys.length !== currentKeys.length || lastKeys.some((key, i) => key !== currentKeys[i]);
      const valuesChanged = currentKeys.some(
        (id) => currentAssignments[id] !== this.lastAssignmentSnapshot[id],
      );
      if (keysChanged || valuesChanged) {
        this.setPartitionState('rebalancing');
        if (this.rebalanceDetectionTimer) clearTimeout(this.rebalanceDetectionTimer);
        this.rebalanceDetectionTimer = setTimeout(() => {
          this.setPartitionState('balanced');
          this.rebalanceDetectionTimer = null;
        }, 5000);
      }
    } else if (connectedConsumers.length > 0 && assignedConsumers.length > 0) {
      this.setPartitionState('balanced');
    } else if (connectedConsumers.length > 0) {
      this.setPartitionState('rebalancing');
    }

    this.lastAssignmentSnapshot = { ...currentAssignments };
  }

  setPartitionState(newState) {
    if (newState !== this.partitionState) {
      this.partitionState = newState;
      this.broadcast({ type: 'partitionState', state: newState });
    }
  }

  async createConsumers() {
    const qn = this.getQueueNames();
    const queues = [
      { name: qn.partitioned, type: 'partitioned', count: 5 },
      { name: qn.nonExclusive, type: 'non-exclusive', count: 5 },
      { name: qn.exclusive, type: 'exclusive', count: 5 },
    ];

    let consumerId = 1;
    const canonicalNqConsumer = parseInt(process.env.NQ_PREDICTION_CONSUMER || '1', 10);

    for (const queue of queues) {
      for (let i = 0; i < queue.count; i++) {
        const consumer = new QueueConsumer(
          consumerId++,
          queue.name,
          queue.type,
          i + 1,
          this.profile.messaging.partitionKeyField,
          (data) => {
            if (data.type === 'order') {
              this.messageCounts[queue.type]++;
              data.messageCount = this.messageCounts[queue.type];
            }
            this.broadcast(data);
            if (data.triggerPartitionCheck) this.checkPartitionState();
            if (queue.type === 'partitioned' && data.type === 'status') {
              this.checkPartitionedOperationalState();
            }
            if (queue.type === 'non-exclusive' && data.type === 'status') {
              this.checkNonExclusiveState();
            }
            if (queue.type === 'exclusive' && data.type === 'status') {
              this.checkExclusiveState();
            }
          },
          { profile: this.profile, canonicalNqConsumer, profileId: this.profile.id },
        );
        this.consumers.push(consumer);
        await consumer.connect();
        if (queue.type === 'exclusive') {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }
  }

  async startConsumers() {
    await this.createConsumers();
    console.log(`✅ [${this.profile.id}] ${this.consumers.length} queue consumers started`);
  }

  stop() {
    this.consumers.forEach((c) => c.disconnect());
  }
}

module.exports = { ProfileConsumerManager };
