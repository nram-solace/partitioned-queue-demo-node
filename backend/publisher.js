const solace = require('solclientjs');
require('dotenv').config();

// Initialize Solace factory
const factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10;
solace.SolclientFactory.init(factoryProps);
solace.SolclientFactory.setLogLevel(solace.LogLevel.WARN);

class StockOrderPublisher {
  constructor() {
    this.session = null;
    this.symbols = (process.env.SYMBOLS || 'AAPL,GOOGL,MSFT,AMZN,TSLA').split(',');
    this.publishRate = parseInt(process.env.PUBLISH_RATE || '10');
    this.topicPrefix = process.env.TOPIC_PREFIX || 'stocks/orders';
    this.orderCounter = 1;
    this.publishInterval = null;

    this.sides = ['BUY', 'SELL'];
    this.orderTypes = ['MARKET', 'LIMIT'];
    this.traders = ['trader_01', 'trader_02', 'trader_03', 'trader_04', 'trader_05'];
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.session = solace.SolclientFactory.createSession({
          url: process.env.SOLACE_HOST || 'ws://localhost:8008',
          vpnName: process.env.SOLACE_VPN || 'default',
          userName: process.env.SOLACE_USERNAME || 'default',
          password: process.env.SOLACE_PASSWORD || 'default',
        });

        this.session.on(solace.SessionEventCode.UP_NOTICE, () => {
          console.log('✅ Publisher connected to Solace');
          resolve();
        });

        this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (sessionEvent) => {
          console.error('❌ Connection failed:', sessionEvent.infoStr);
          reject(new Error(sessionEvent.infoStr));
        });

        this.session.on(solace.SessionEventCode.DISCONNECTED, () => {
          console.log('⚠️  Publisher disconnected');
          if (this.publishInterval) {
            clearInterval(this.publishInterval);
          }
        });

        this.session.connect();
      } catch (error) {
        reject(error);
      }
    });
  }

  generateOrder() {
    const symbol = this.symbols[Math.floor(Math.random() * this.symbols.length)];
    const basePrice = {
      'AAPL': 182.45,
      'GOOGL': 142.30,
      'MSFT': 378.85,
      'AMZN': 145.20,
      'TSLA': 248.50
    };

    const price = basePrice[symbol] + (Math.random() - 0.5) * 2;
    const order = {
      orderId: `ORD-${String(this.orderCounter++).padStart(8, '0')}`,
      symbol: symbol,
      side: this.sides[Math.floor(Math.random() * this.sides.length)],
      quantity: Math.floor(Math.random() * 1000) + 100,
      orderType: this.orderTypes[Math.floor(Math.random() * this.orderTypes.length)],
      price: parseFloat(price.toFixed(2)),
      timestamp: new Date().toISOString(),
      trader: this.traders[Math.floor(Math.random() * this.traders.length)],
      account: `ACC-${String(Math.floor(Math.random() * 100) + 1).padStart(3, '0')}`
    };

    return order;
  }

  publishOrder(order) {
    const topic = `${this.topicPrefix}/${order.symbol}`;
    const message = solace.SolclientFactory.createMessage();
    message.setDestination(solace.SolclientFactory.createTopicDestination(topic));
    message.setBinaryAttachment(JSON.stringify(order));
    message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);

    // Map each symbol to a specific partition number (0-4) for equal distribution
    const symbolToPartition = {
      'AAPL': '0',
      'GOOGL': '1',
      'MSFT': '2',
      'AMZN': '3',
      'TSLA': '4'
    };

    const partitionKey = symbolToPartition[order.symbol] || '0';

    // Set partition key for partitioned queues using JMSXGroupID
    const userPropMap = new solace.SDTMapContainer();
    userPropMap.addField('JMSXGroupID', solace.SDTField.create(solace.SDTFieldType.STRING, partitionKey));
    message.setUserPropertyMap(userPropMap);

    try {
      this.session.send(message);
      console.log(`📤 Published: ${order.symbol} (P${partitionKey}) ${order.side} ${order.quantity} @ ${order.price}`);
    } catch (error) {
      console.error('❌ Failed to publish:', error);
    }
  }

  startPublishing() {
    console.log(`🚀 Starting publisher - ${this.publishRate} msg/sec`);
    console.log(`📊 Symbols: ${this.symbols.join(', ')}`);

    const intervalMs = 1000 / this.publishRate;

    this.publishInterval = setInterval(() => {
      const order = this.generateOrder();
      this.publishOrder(order);
    }, intervalMs);
  }

  stopPublishing() {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
      console.log('⏸️  Publishing stopped');
    }
  }

  disconnect() {
    this.stopPublishing();
    if (this.session) {
      this.session.disconnect();
    }
  }
}

// Main execution
async function main() {
  const publisher = new StockOrderPublisher();

  try {
    await publisher.connect();
    publisher.startPublishing();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down publisher...');
      publisher.disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start publisher:', error);
    process.exit(1);
  }
}

main();
