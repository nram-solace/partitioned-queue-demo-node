import { useEffect, useRef, useState, useCallback } from 'react'
import solace from 'solclientjs'
import { getSolaceSessionConfig } from '../config'
import {
  UI_ROOT,
  catalogProfiles,
  commandsControl,
} from '../uiTopics'
import { encodeJsonAttachment, parseSolaceJsonMessage } from '../solaceMessage'

let solaceFactoryInitialized = false

function ensureSolaceFactory() {
  if (solaceFactoryInitialized) return
  const factoryProps = new solace.SolclientFactoryProperties()
  factoryProps.profile = solace.SolclientFactoryProfiles.version10
  solace.SolclientFactory.init(factoryProps)
  solace.SolclientFactory.setLogLevel(solace.LogLevel.WARN)
  solaceFactoryInitialized = true
}

function sendSnapshotRequest(session) {
  const msg = solace.SolclientFactory.createMessage()
  msg.setDestination(solace.SolclientFactory.createTopicDestination(commandsControl()))
  msg.setBinaryAttachment(encodeJsonAttachment({ type: 'requestSnapshot' }))
  msg.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT)
  session.send(msg)
}

/**
 * @param {{ onMessage: (data: object) => void, onConnect?: () => void, onDisconnect?: () => void }} options
 */
export function useSolaceDashboard({ onMessage, onConnect, onDisconnect }) {
  const [connected, setConnected] = useState(false)
  const [connectionHint, setConnectionHint] = useState('')
  const sessionRef = useRef(null)
  const onMessageRef = useRef(onMessage)
  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)

  onMessageRef.current = onMessage
  onConnectRef.current = onConnect
  onDisconnectRef.current = onDisconnect

  const publishCommand = useCallback((payload) => {
    const session = sessionRef.current
    if (!session) return
    const msg = solace.SolclientFactory.createMessage()
    msg.setDestination(solace.SolclientFactory.createTopicDestination(commandsControl()))
    msg.setBinaryAttachment(encodeJsonAttachment(payload))
    msg.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT)
    session.send(msg)
  }, [])

  useEffect(() => {
    ensureSolaceFactory()
    let session = null
    let reconnectTimer = null
    let disposed = false

    const subscribeCatalogTopics = (s) => {
      const subs = [
        catalogProfiles(),
        `${UI_ROOT}/events/>`,
        `${UI_ROOT}/stats/>`,
      ]
      subs.forEach((topic, i) => {
        s.subscribe(solace.SolclientFactory.createTopicDestination(topic), true, `dash-${i}`, 10000)
      })
      console.log('Subscribed to Solace catalog topics:', subs.join(', '))
    }

    const connect = () => {
      if (disposed) return
      const cfg = getSolaceSessionConfig()
      setConnectionHint(cfg.hint)

      session = solace.SolclientFactory.createSession({
        url: cfg.url,
        vpnName: cfg.vpnName,
        userName: cfg.userName,
        password: cfg.password,
        clientName: `dashboard-${Date.now()}`,
      })
      sessionRef.current = session

      session.on(solace.SessionEventCode.UP_NOTICE, () => {
        subscribeCatalogTopics(session)
        // Consumer publishes catalog/state once at startup; request again after we subscribe.
        setTimeout(() => {
          if (sessionRef.current === session) {
            sendSnapshotRequest(session)
          }
        }, 300)
        setConnected(true)
        onConnectRef.current?.()
      })

      session.on(solace.SessionEventCode.MESSAGE, (message) => {
        try {
          const data = parseSolaceJsonMessage(message)
          if (data) onMessageRef.current(data)
        } catch (error) {
          console.error('Failed to parse catalog message:', error)
        }
      })

      session.on(solace.SessionEventCode.DISCONNECTED, () => {
        setConnected(false)
        sessionRef.current = null
        onDisconnectRef.current?.()
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 3000)
        }
      })

      session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (sessionEvent) => {
        console.error('Solace dashboard connect failed:', sessionEvent.infoStr)
        setConnected(false)
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 3000)
        }
      })

      session.connect()
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (session) {
        try {
          session.disconnect()
        } catch (_) {
          /* ignore */
        }
      }
      sessionRef.current = null
    }
  }, [])

  return { connected, connectionHint, publishCommand }
}
