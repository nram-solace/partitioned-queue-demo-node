import { useState, useEffect } from 'react'
import QueuePanel from './components/QueuePanel'
import Header from './components/Header'
import PublisherStatus from './components/PublisherStatus'

function App() {
  const [consumers, setConsumers] = useState({
    partitioned: Array(5).fill(null).map((_, i) => ({
      id: i + 1,
      queueName: 'Orders_PQ',
      queueType: 'partitioned',
      consumerNumber: i + 1,
      status: 'offline',
      messagesProcessed: 0,
      rate: 0,
      lastOrders: [],
      assignedSymbol: null
    })),
    nonExclusive: Array(5).fill(null).map((_, i) => ({
      id: i + 6,
      queueName: 'NonExclusiveOrders',
      queueType: 'non-exclusive',
      consumerNumber: i + 1,
      status: 'offline',
      messagesProcessed: 0,
      rate: 0,
      lastOrders: []
    })),
    exclusive: Array(5).fill(null).map((_, i) => ({
      id: i + 11,
      queueName: 'ExclusiveOrders',
      queueType: 'exclusive',
      consumerNumber: i + 1,
      status: 'offline',
      messagesProcessed: 0,
      rate: 0,
      lastOrders: []
    }))
  })

  const [wsConnected, setWsConnected] = useState(false)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)

  useEffect(() => {
    let ws = null
    let reconnectTimeout = null

    const connect = () => {
      ws = new WebSocket('ws://localhost:8080')

      ws.onopen = () => {
        console.log('Connected to consumer backend')
        setWsConnected(true)
        setReconnectAttempt(0) // Reset on successful connection
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)

        if (data.type === 'order') {
          updateConsumer(data)
        } else if (data.type === 'status') {
          // Handle status updates
          updateConsumerStatus(data)
        } else if (data.type === 'state') {
          // Initial state sync
          updateConsumersFromState(data.consumers)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setWsConnected(false)
      }

      ws.onclose = () => {
        console.log('Disconnected from consumer backend')
        setWsConnected(false)
        // Attempt reconnection after 3 seconds
        reconnectTimeout = setTimeout(() => {
          console.log('Attempting to reconnect...')
          setReconnectAttempt(prev => prev + 1)
          connect()
        }, 3000)
      }

      // Store ws reference for disconnect function
      window.wsConnection = ws
    }

    connect()

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (ws) {
        ws.close()
      }
      window.wsConnection = null
    }
  }, [])

  const updateConsumer = (data) => {
    setConsumers(prev => {
      const newConsumers = { ...prev }
      const queueKey = data.queueType === 'partitioned' ? 'partitioned' :
                       data.queueType === 'non-exclusive' ? 'nonExclusive' : 'exclusive'

      const index = data.consumerNumber - 1
      if (newConsumers[queueKey][index]) {
        newConsumers[queueKey][index] = {
          ...newConsumers[queueKey][index],
          status: data.stats.status,
          messagesProcessed: data.stats.messagesProcessed,
          rate: data.stats.rate,
          lastOrders: data.lastOrders || [],
          assignedSymbol: data.assignedSymbol || newConsumers[queueKey][index].assignedSymbol
        }
      }

      return newConsumers
    })
  }

  const updateConsumerStatus = (data) => {
    setConsumers(prev => {
      const newConsumers = { ...prev }
      const queueKey = data.queueType === 'partitioned' ? 'partitioned' :
                       data.queueType === 'non-exclusive' ? 'nonExclusive' : 'exclusive'

      const index = data.consumerNumber - 1
      if (newConsumers[queueKey][index]) {
        newConsumers[queueKey][index] = {
          ...newConsumers[queueKey][index],
          status: data.status
        }
      }

      return newConsumers
    })
  }

  const updateConsumersFromState = (stateConsumers) => {
    // Update consumers from backend state
    setConsumers(prev => {
      const newConsumers = { ...prev }
      stateConsumers.forEach(consumer => {
        const queueKey = consumer.queueType === 'partitioned' ? 'partitioned' :
                         consumer.queueType === 'non-exclusive' ? 'nonExclusive' : 'exclusive'
        const index = consumer.consumerNumber - 1
        if (newConsumers[queueKey][index]) {
          newConsumers[queueKey][index] = {
            ...newConsumers[queueKey][index],
            ...consumer
          }
        }
      })
      return newConsumers
    })
  }

  const handleDisconnect = (consumerId) => {
    if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
      window.wsConnection.send(JSON.stringify({
        type: 'disconnect',
        consumerId
      }))
    }
  }

  const handleReconnect = (consumerId) => {
    if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
      window.wsConnection.send(JSON.stringify({
        type: 'reconnect',
        consumerId
      }))
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <Header connected={wsConnected} />

      <div className="container mx-auto px-4 py-6 space-y-6">
        <PublisherStatus />

        <QueuePanel
          title="📊 PARTITIONED QUEUES (Orders_PQ)"
          description="Symbol-based routing - Each consumer handles specific stocks"
          consumers={consumers.partitioned}
          queueType="partitioned"
          onDisconnect={handleDisconnect}
          onReconnect={handleReconnect}
        />

        <QueuePanel
          title="🔄 NON-EXCLUSIVE QUEUES (NonExclusiveOrders)"
          description="Load balanced - All consumers compete for messages"
          consumers={consumers.nonExclusive}
          queueType="non-exclusive"
          onDisconnect={handleDisconnect}
          onReconnect={handleReconnect}
        />

        <QueuePanel
          title="🔒 EXCLUSIVE QUEUES (ExclusiveOrders)"
          description="Single active consumer - Others on standby"
          consumers={consumers.exclusive}
          queueType="exclusive"
          onDisconnect={handleDisconnect}
          onReconnect={handleReconnect}
        />
      </div>
    </div>
  )
}

export default App
