import { useEffect, useRef, useState, useCallback } from 'react'
import solace from 'solclientjs'
import { getSolaceSessionConfig } from '../config'
import {
  catalogProfiles,
  events,
  statsPublisher,
  sessionTopics,
} from '../uiTopics'
import { commandSession } from '../commandTopics'
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

/**
 * @param {{
 *   sessionId: string,
 *   selectedProfileId: string | null,
 *   onMessage: (data: object) => void,
 *   onConnect?: () => void,
 *   onDisconnect?: () => void,
 * }} options
 */
export function useSolaceDashboard({
  sessionId,
  selectedProfileId,
  onMessage,
  onConnect,
  onDisconnect,
}) {
  const [connected, setConnected] = useState(false)
  const [connectionHint, setConnectionHint] = useState('')
  const sessionRef = useRef(null)
  const profileSubIdsRef = useRef([])
  const rawListenersRef = useRef(new Set())
  const onMessageRef = useRef(onMessage)
  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)
  const sessionIdRef = useRef(sessionId)
  const selectedProfileIdRef = useRef(selectedProfileId)

  onMessageRef.current = onMessage
  onConnectRef.current = onConnect
  onDisconnectRef.current = onDisconnect
  sessionIdRef.current = sessionId
  selectedProfileIdRef.current = selectedProfileId

  const unsubscribeProfileTopics = useCallback((s) => {
    if (!s) return
    for (const subId of profileSubIdsRef.current) {
      try {
        s.unsubscribe(subId)
      } catch (_) {
        /* ignore */
      }
    }
    profileSubIdsRef.current = []
  }, [])

  const subscribeProfileTopics = useCallback(
    (s, profileId) => {
      if (!s || !profileId) return
      unsubscribeProfileTopics(s)
      const topics = [events(profileId), statsPublisher(profileId)]
      const ids = []
      topics.forEach((topic, i) => {
        const id = s.subscribe(
          solace.SolclientFactory.createTopicDestination(topic),
          true,
          `profile-${profileId}-${i}`,
          10000,
        )
        ids.push(id)
      })
      profileSubIdsRef.current = ids
      console.log('Subscribed to profile topics:', topics.join(', '))
    },
    [unsubscribeProfileTopics],
  )

  const publishCommand = useCallback((payload) => {
    const session = sessionRef.current
    const sid = sessionIdRef.current
    if (!session || !sid) return
    const msg = solace.SolclientFactory.createMessage()
    msg.setDestination(solace.SolclientFactory.createTopicDestination(commandSession(sid)))
    msg.setBinaryAttachment(
      encodeJsonAttachment({ ...payload, sessionId: sid }),
    )
    msg.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT)
    session.send(msg)
  }, [])

  const requestSnapshot = useCallback(() => {
    publishCommand({ type: 'requestSnapshot' })
  }, [publishCommand])

  const subscribeTopic = useCallback((topic) => {
    const s = sessionRef.current
    if (!s || !topic) return
    try {
      s.subscribe(solace.SolclientFactory.createTopicDestination(topic), true, topic, 10000)
    } catch (_) {
      /* ignore */
    }
  }, [])

  const unsubscribeTopic = useCallback((topic) => {
    const s = sessionRef.current
    if (!s || !topic) return
    try {
      s.unsubscribe(solace.SolclientFactory.createTopicDestination(topic), true, topic, 10000)
    } catch (_) {
      /* ignore */
    }
  }, [])

  const addRawMessageListener = useCallback((fn) => {
    rawListenersRef.current.add(fn)
    return () => rawListenersRef.current.delete(fn)
  }, [])

  useEffect(() => {
    const s = sessionRef.current
    if (!connected || !s) return
    subscribeProfileTopics(s, selectedProfileId)
  }, [connected, selectedProfileId, subscribeProfileTopics])

  useEffect(() => {
    ensureSolaceFactory()
    let session = null
    let reconnectTimer = null
    let disposed = false

    const connect = () => {
      if (disposed) return
      const cfg = getSolaceSessionConfig()
      setConnectionHint(`${cfg.userName}@${cfg.hint}`)

      session = solace.SolclientFactory.createSession({
        url: cfg.url,
        vpnName: cfg.vpnName,
        userName: cfg.userName,
        password: cfg.password,
        clientName: `dashboard-${Date.now()}`,
      })
      sessionRef.current = session

      session.on(solace.SessionEventCode.UP_NOTICE, () => {
        const sid = sessionIdRef.current
        session.subscribe(
          solace.SolclientFactory.createTopicDestination(catalogProfiles()),
          true,
          'dash-catalog',
          10000,
        )
        if (sid) {
          session.subscribe(
            solace.SolclientFactory.createTopicDestination(sessionTopics(sid)),
            true,
            'dash-session',
            10000,
          )
        }
        setTimeout(() => {
          if (sessionRef.current === session) {
            publishCommand({ type: 'requestSnapshot' })
          }
        }, 300)
        setConnected(true)
        onConnectRef.current?.()
      })

      session.on(solace.SessionEventCode.MESSAGE, (message) => {
        let data
        try {
          data = parseSolaceJsonMessage(message)
        } catch (error) {
          console.error('Failed to parse catalog message:', error)
          return
        }
        if (!data) return
        onMessageRef.current(data)
        if (rawListenersRef.current.size > 0) {
          let topic = null
          try {
            topic = message.getDestination()?.getName() || null
          } catch (_) {
            /* ignore */
          }
          if (topic) {
            rawListenersRef.current.forEach((fn) => {
              try {
                fn(topic, data)
              } catch (error) {
                console.error('Raw message listener failed:', error)
              }
            })
          }
        }
      })

      session.on(solace.SessionEventCode.DISCONNECTED, () => {
        setConnected(false)
        unsubscribeProfileTopics(sessionRef.current)
        sessionRef.current = null
        onDisconnectRef.current?.()
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 3000)
        }
      })

      session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, () => {
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
      unsubscribeProfileTopics(sessionRef.current)
      if (session) {
        try {
          session.disconnect()
        } catch (_) {
          /* ignore */
        }
      }
      sessionRef.current = null
    }
  }, [publishCommand, unsubscribeProfileTopics])

  return {
    connected,
    connectionHint,
    publishCommand,
    requestSnapshot,
    subscribeTopic,
    unsubscribeTopic,
    addRawMessageListener,
  }
}
