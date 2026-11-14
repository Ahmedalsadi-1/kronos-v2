import { afterEach, expect, it } from 'vitest'
import { $subagentsBySession, upsertSubagent } from './subagents'

afterEach(() => $subagentsBySession.set({}))

it('retains bounded tool context and clears an old diff on the next tool', () => {
  upsertSubagent('parent', { subagent_id: 'child', child_session_id: 'session', tool_name: 'apply_patch', tool_preview: 'a'.repeat(20000), inline_diff: '+ changed', files_written: ['file.ts'] })
  let child = $subagentsBySession.get().parent[0]
  expect(child.toolPreview).toHaveLength(12000)
  expect(child.inlineDiff).toBe('+ changed')
  upsertSubagent('parent', { subagent_id: 'child', tool_name: 'terminal', tool_preview: 'npm test' })
  child = $subagentsBySession.get().parent[0]
  expect(child.inlineDiff).toBeUndefined()
  expect(child.toolPreview).toBe('npm test')
  upsertSubagent('parent', { subagent_id: 'child', status: 'completed' }, true, 'subagent.complete')
  child = $subagentsBySession.get().parent[0]
  expect(child.currentTool).toBeUndefined()
  expect(child.lastTool).toBe('terminal')
  expect(child.toolPreview).toBe('npm test')
})
