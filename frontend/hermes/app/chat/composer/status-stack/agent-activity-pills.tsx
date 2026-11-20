import { useStore } from '@nanostores/react'
import { computed } from 'nanostores'
import { useEffect, useMemo, useRef, useState } from 'react'

import { chatMessageText } from '@hermes/lib/chat-messages'
import { subscribeSubagentSurface, type SubagentSurfaceSnapshot } from '@hermes/lib/subagent-surface'
import { $sessionStates } from '@hermes/store/session-states'
import type { SubagentProgress } from '@hermes/store/subagents'

const StatusLabels = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Done',
  failed: 'Failed',
  interrupted: 'Stopped'
}

interface AgentActivityPillProps {
  id: string
  sessionId?: string
  task: string
  status: keyof typeof StatusLabels
  detail?: string
  since?: number
  swarm?: boolean
  worker?: boolean
  onOpen?: () => void
}

function AgentActivityPill({ id, sessionId, task, status, detail, since, swarm, worker, onOpen }: AgentActivityPillProps) {
  const live = status === 'running'
  const [surface, setSurface] = useState<SubagentSurfaceSnapshot>({})
  const [expanded, setExpanded] = useState(false)
  const pillRef = useRef<HTMLDivElement>(null)
  const [onScreen, setOnScreen] = useState(false)
  useEffect(() => {
    if (!pillRef.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    observer.observe(pillRef.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!sessionId && !swarm) return
    return subscribeSubagentSurface({ id, sessionId, live, swarm, since, capture: onScreen }, snapshot => {
      setSurface(previous => ({
        ...snapshot,
        imageUrl: snapshot.imageUrl ?? (!live && snapshot.targetKey === previous.targetKey ? previous.imageUrl : undefined)
      }))
    })
  }, [id, sessionId, live, swarm, since, onScreen])

  const show = async () => {
    if (onOpen) {
      onOpen()
      return
    }
    const bridge = window.hermesDesktop?.krontermSurfaces
    if (surface.blockId && bridge) {
      const result = await bridge.openSplit(surface.blockId).catch(() => undefined)
      if (result?.ok) return
    }
    setExpanded(value => !value)
  }

  const action = detail || surface.detail
  const label = worker ? 'Subagent' : 'Main agent'
  return (
    <div ref={pillRef} className="min-w-0">
      <button
        type="button"
        aria-expanded={worker ? undefined : expanded}
        aria-haspopup={worker ? 'dialog' : undefined}
        className="flex w-full cursor-pointer items-center gap-2 rounded-full border border-current/15 bg-current/5 p-1 pr-3 text-left hover:bg-current/10 focus-visible:outline-2"
        onClick={() => void show()}
      >
        <span aria-hidden="true" className="grid h-8 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-current/10">
          {surface.imageUrl ? <img src={surface.imageUrl} alt="" className="h-full w-full object-cover object-top" /> : '•'}
        </span>
        <span className="grid min-w-0 flex-1">
          <strong className="truncate font-medium">{task || label}</strong>
          <span className="truncate opacity-70">{action ? `${label} · ${action}` : label}</span>
        </span>
        <span className="shrink-0 opacity-70">{StatusLabels[status]}</span>
      </button>
      {expanded && (
        <div className="px-3 py-1">
          {surface.imageUrl && <img alt="Agent activity preview" src={surface.imageUrl} className="max-h-40 w-full object-contain" />}
          <p>{action || task}</p>
        </div>
      )}
    </div>
  )
}

export function AgentActivityPills({
  sessionId,
  subagents,
  onOpenSubagent
}: {
  sessionId: string
  subagents: SubagentProgress[]
  onOpenSubagent: (id: string) => void
}) {
  const $state = useMemo(() => computed($sessionStates, states => states[sessionId]), [sessionId])
  const state = useStore($state)
  const messages = state?.messages ?? []
  const userIndex = messages.findLastIndex(message => message.role === 'user')
  const user = messages[userIndex]
  const turn = user ? messages.slice(userIndex + 1) : []
  const action = turn.flatMap(message => message.parts).findLast(part => part.type === 'tool-call')
  const since = user?.timestamp
  const mainState = state?.busy ? 'running' : turn.some(message => message.error) ? 'failed' : 'completed'
  const workers = subagents.filter(worker => since == null || worker.startedAt >= since).slice(0, 6)
  if ((!user || (!state?.busy && !action)) && workers.length === 0) return null

  return (
    <div role="group" aria-label="Agent activity" className="mx-2 grid max-h-[26vh] gap-1 overflow-auto px-1 py-1 text-[11px]">
      {user && (state?.busy || action) && (
        <AgentActivityPill
          key={`${sessionId}:${user.id}`}
          id={sessionId}
          sessionId={sessionId}
          task={chatMessageText(user).slice(0, 160)}
          status={mainState}
          detail={action?.toolName.replaceAll('_', ' ')}
          since={since}
        />
      )}
      {workers.map(worker => (
        <AgentActivityPill
          key={worker.id}
          id={worker.id}
          sessionId={worker.sessionId}
          task={worker.goal}
          status={worker.status}
          detail={worker.currentTool || worker.summary}
          swarm={worker.swarm != null}
          since={worker.startedAt}
          worker
          onOpen={() => onOpenSubagent(worker.id)}
        />
      ))}
    </div>
  )
}
