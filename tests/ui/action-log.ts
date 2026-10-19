import { raw } from '../_helpers/battle'
import { actionLogHtml } from '../../src/ui/results'
import type { BattleEvent } from '../../src/core/battlelog'

/**
 * Phase E — the human action log must render from the typed event stream (not only from legacy
 * `logLines`), show only the canonical subset with display names, and keep diagnostics internals
 * (eventId/traceId/...) out of the normal UI (they belong to Diagnostics, §84.9/I).
 */
export default () => {
  const ev = (over: Partial<BattleEvent>): BattleEvent => ({
    eventId: 42, time: 12.5, turn: 3, actionId: 182, traceId: '182.3.1',
    type: 'DAMAGE_DEALT', source: 'Seele', target: 'Тяжёлый бронированный воин',
    payload: { amount: 12345, crit: true, hpAfter: 800, maxHp: 5000 }, ...over,
  })

  const empty = actionLogHtml([])
  const dmg = actionLogHtml([ev({})])
  const filtered = actionLogHtml([ev({ type: 'BUFF_APPLIED', payload: { name: 'Atk Up' } }), ev({})])

  return [
    raw('no recorded events => empty string (render falls back to logLines)', empty === '', JSON.stringify(empty)),
    raw('action log renders type + source -> target', dmg.includes('DAMAGE_DEALT') && dmg.includes('Seele → Тяжёлый бронированный воин'), dmg.slice(0, 160)),
    raw('damage detail shows CRIT + amount (fmt)', dmg.includes('CRIT') && dmg.includes('12.3k'), dmg.slice(0, 160)),
    raw('diagnostics internals (traceId/eventId) stay out of the human log', !dmg.includes('182.3.1') && !dmg.includes('eventId'), dmg.slice(0, 160)),
    raw('only the canonical subset renders (BUFF_APPLIED filtered)', filtered.includes('DAMAGE_DEALT') && !filtered.includes('BUFF_APPLIED'), filtered.slice(0, 160)),
  ]
}
