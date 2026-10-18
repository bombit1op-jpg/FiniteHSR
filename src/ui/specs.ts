/**
 * §84 G1 — canonical spec import/export.
 *
 * The GUI owns no build/team/encounter format of its own (rule 84.1): the persisted and
 * exchanged documents ARE the engine's canonical types — `BuildSpec`, `TeamSpec[]`,
 * `EncounterSpec`. Validation delegates to the existing domain validators
 * (`validateBuild`, `validateEncounter`) rather than re-checking ids in the UI.
 *
 * File IO is browser-native (Blob download + hidden `<input type=file>`); the node
 * `writeReplay`/`readReplay` path stays CLI-only (see capabilities `replay.build`).
 */
import { validateBuild, type BuildSpec } from '../core/build'
import { validateEncounter, type EncounterSpec } from '../core/encounter'
import type { TeamSpec } from '../core/battle'

export type SpecKind = 'build' | 'team' | 'encounter'

/** versioned envelope so a future schema bump is detectable on import */
export interface SpecEnvelope<T> {
  kind: SpecKind
  version: 1
  data: T
}

export function envelope<T>(kind: SpecKind, data: T): SpecEnvelope<T> {
  return { kind, version: 1, data }
}

export function specToJson<T>(kind: SpecKind, data: T): string {
  return JSON.stringify(envelope(kind, data), null, 2) + '\n'
}

/** parse + unwrap an envelope. Throws a readable error on a malformed/foreign document. */
export function specFromJson<T>(text: string, expect: SpecKind): T {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error(`не JSON: ${String(e)}`)
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('ожидался объект')
  const env = parsed as Partial<SpecEnvelope<T>>
  if (env.kind !== expect) throw new Error(`ожидался kind="${expect}", получен "${String(env.kind)}"`)
  if (env.data === undefined) throw new Error('нет поля data')
  return env.data
}

/** structural validation via the engine's own validators; empty = valid. */
export function validateSpec(kind: SpecKind, data: unknown): string[] {
  if (kind === 'build') return validateBuild(data as BuildSpec)
  if (kind === 'encounter') return validateEncounter(data as EncounterSpec)
  if (kind === 'team') {
    if (!Array.isArray(data)) return ['team:not-array']
    const bad: string[] = []
    ;(data as TeamSpec[]).forEach((m, i) => {
      if (!m || typeof m !== 'object') { bad.push(`member${i}:invalid`); return }
      if (!m.kitId) bad.push(`member${i}:kitId`)
      if (m.build) for (const e of validateBuild(m.build)) bad.push(`member${i}.${e}`)
    })
    return bad
  }
  return ['unknown-kind']
}

// ---------------------------------------------------------------- browser file IO

export function downloadJson(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** one-shot hidden file picker; resolves null when the user cancels */
export function pickJsonFile(accept = '.json,application/json'): Promise<File | null> {
  return new Promise(resolve => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = accept
    inp.onchange = () => resolve(inp.files?.[0] ?? null)
    inp.oncancel = () => resolve(null)
    inp.click()
  })
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsText(file)
  })
}
