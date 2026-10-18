import { KITS } from '../core/kits'
import { runBattle } from '../core/battle'
import type { BattleIO, BattleView } from '../core/battle'
import type { Action } from '../core/kit'
import type { Unit } from '../core/entities/Unit'
import { el, fillSelect, fmt, escapeHtml } from './dom'
import { store } from './store'

// ---------------------------------------------------------------- results

function colorizeLog(lines: string[]): string {
  return lines.map(l => {
    let cls = ''
    if (/CRIT/.test(l)) cls = 'crit'
    else if (/WEAKNESS BROKEN|SUPER BREAK|Break DMG/.test(l)) cls = 'break'
    else if (/DoT |Burn Detonation/.test(l)) cls = 'dot'
    else if (/^.*XX /.test(l) || / defeated/.test(l)) cls = 'kill'
    else if (/>>|♪/.test(l)) cls = 'special'
    else if (/◈|afflicted by|Routed|Ensnared|Exposed|Firekiss/.test(l)) cls = 'debuff'
    else if (/✕|RESISTS/.test(l)) cls = 'miss'
    else if (/advances/.test(l)) cls = 'special'
    else if (/ENEMY|hits/.test(l)) cls = 'enemyhit'
    const av = l.match(/^\[[\d.]+\]/)?.[0] ?? ''
    const rest = av ? l.slice(av.length) : l
    return `<div class="logline ${cls}"><span class="av">${av}</span>${escapeHtml(rest)}</div>`
  }).join('\n')
}

function renderStatsPanel(setup: Parameters<typeof runBattle>[0]): void {
  let html = '<table><tr><th>Персонаж</th><th>ATK</th><th>SPD</th><th>CR</th><th>CD</th><th>BE</th><th>EHR</th></tr>'
  for (const t of setup.team) {
    const kit = KITS.find(k => k.id === t.kitId)!
    const s = t.stats ?? {}
    const atk = (s.atk ?? kit.base.atk)
    const spd = (s.spd ?? kit.base.spd)
    const cr = (s.critRate ?? kit.base.critRate ?? 0.05)
    const cd = (s.critDmg ?? kit.base.critDmg ?? 1)
    const be = (s.be ?? 0)
    const ehr = kit.base.ehr ?? 0
    html += `<tr><td>${escapeHtml(kit.name)}</td><td>${fmt(atk)}</td><td>${spd}</td><td>${Math.round(cr * 100)}%</td><td>${Math.round(cd * 100)}%</td><td>${Math.round(be * 100)}%</td><td>${Math.round(ehr * 100)}%</td></tr>`
  }
  html += '</table>'
  if (setup.manualMods?.length) {
    html += `<div class="modList">Моды: ${setup.manualMods.map(m => `${m.stat} ${m.value > 0 ? '+' : ''}${Math.round(m.value * 100)}% → ${m.side === 'ally' ? 'отряду' : 'врагам'}`).join('; ')}</div>`
  }
  document.getElementById('statPanel')!.innerHTML = html
}

export function render(sim: ReturnType<typeof runBattle>, setup: Parameters<typeof runBattle>[0]): void {
  store.dispatch({ type: 'results/set', sim, setup })

  const rows: Array<{ name: string; total: number; bySkill: Record<string, number>; enemy?: boolean }> = []
  for (const [name, acc] of sim.accounts) rows.push({ name, total: acc.total, bySkill: acc.bySkill, enemy: name.startsWith('ENEMY') })
  const allyTotal = rows.filter(r => !r.enemy).reduce((a, r) => a + r.total, 0)
  rows.sort((a, b) => b.total - a.total)

  let html = `<table><tr><th>Источник</th><th class="num">Урон</th><th class="num">%</th></tr>`
  for (const r of rows) {
    const pct = ((r.total / Math.max(1, allyTotal)) * 100).toFixed(1)
    const skills = Object.entries(r.bySkill).map(([k, v]) => `${k}: ${fmt(v)}`).join(' · ')
    html += `<tr><td>${escapeHtml(r.name)}<div class="skillList">${skills}</div></td><td class="num">${fmt(r.total)}</td><td class="num">${r.enemy ? '' : pct}</td></tr>`
  }
  html += `<tr class="total"><td>ИТОГО по отряду (${sim.endReason}, ${sim.avElapsed.toFixed(0)} AV)</td><td class="num">${fmt(allyTotal)}</td><td class="num">100%</td></tr></table>`
  document.getElementById('summary')!.innerHTML = html

  // ally HP accounting
  let hpHtml = '<table><tr><th>Юнит</th><th class="num">HP</th></tr>'
  for (const u of sim.roster.filter(x => x.kind !== 'timer')) {
    const bar = '█'.repeat(Math.round((u.hp / Math.max(1, u.maxHp)) * 10)).padEnd(10, u.dead ? '×' : '░')
    hpHtml += `<tr class="${u.dead ? 'dead' : ''}"><td>${escapeHtml(u.name)}</td><td class="num">${bar} ${u.hp}/${u.maxHp}</td></tr>`
  }
  hpHtml += '</table>'
  document.getElementById('hpPanel')!.innerHTML = hpHtml

  renderStatsPanel(setup)
  document.getElementById('log')!.innerHTML = colorizeLog(sim.logLines)
}

// ---------------------------------------------------------------- пошаговый режим

function describeAction(a: Action, names: Map<string, string>): string {
  let s = a.kind === 'basic' ? 'Базовая' : a.kind === 'skill' ? 'Навык' : 'Ультимейт'
  if (a.kind === 'skill' && a.targetId) s += ` → ${names.get(a.targetId) ?? a.targetId}`
  return s
}

function renderLive(view: BattleView, note: string): void {
  const box = document.getElementById('manualPanel')!
  box.style.display = ''
  let html = `<div class="liveNote"><b>${escapeHtml(note)}</b> · AV ${view.avElapsed} · SP ${view.sp}/${view.maxSp}</div>`
  html += '<table class="liveTable"><tr><th>Юнит</th><th>HP</th><th>Энергия</th><th>AV</th></tr>'
  for (const u of view.units) {
    if (u.dead) continue
    const bar = '█'.repeat(Math.max(0, Math.round((u.hp / Math.max(1, u.maxHp)) * 10))).padEnd(10, '░')
    const ready = u.maxEnergy > 0 && u.energy >= u.maxEnergy ? ' ★' : ''
    const cls = u.id === view.nextActorId ? ' class="nextActor"' : ''
    html += `<tr${cls}><td>${escapeHtml(u.name)}${u.broken ? ' [сломан]' : ''}</td><td>${bar}</td><td>${Math.floor(u.energy)}/${u.maxEnergy}${ready}</td><td>${u.av}</td></tr>`
  }
  box.innerHTML = html + '</table><div id="manualControls" class="row"></div>'
}

export function uiIO(): BattleIO {
  return {
    pickUlts(ready, view) {
      renderLive(view, 'Внеходовые ультимейты — выберите в порядке применения (или пропустите)')
      const ctrl = document.getElementById('manualControls')!
      const order: Unit[] = []
      return new Promise(resolve => {
        const label = el('span', 'dim')
        const refresh = () => { label.textContent = order.length ? order.map(u => u.name).join(' → ') : 'ничего не выбрано' }
        for (const r of ready) {
          const b = el('button', 'btn-secondary')
          b.textContent = r.name
          b.title = 'добавить/убрать из очереди ультов'
          b.onclick = () => {
            const i = order.indexOf(r)
            if (i >= 0) { order.splice(i, 1); b.style.borderColor = '' } else { order.push(r); b.style.borderColor = '#f2c94c' }
            refresh()
          }
          ctrl.append(b)
        }
        const done = el('button', 'btn-primary')
        done.textContent = 'Продолжить'
        done.onclick = () => resolve(order)
        ctrl.append(label, done)
        refresh()
      })
    },
    planTurn(u, view) {
      renderLive(view, `Ход: ${u.name} — соберите последовательность действий`)
      const ctrl = document.getElementById('manualControls')!
      const seq: Action[] = []
      const names = new Map(view.units.map(x => [x.id, x.name]))
      return new Promise(resolve => {
        // skill target override: '' = kit's automatic choice
        const targetSel = el('select') as HTMLSelectElement
        const enemies = view.units.filter(x => !x.dead && x.side === 'enemy')
        const allies = view.units.filter(x => !x.dead && x.side !== 'enemy' && x.id !== u.id)
        fillSelect(targetSel, [
          ['', 'Цель навыка: авто'],
          ...enemies.map(x => [x.id, `Враг · ${x.name}`] as [string, string]),
          ...allies.map(x => [x.id, `Союзник · ${x.name}`] as [string, string]),
        ])
        targetSel.title = 'куда полетит навык (по умолчанию решает ИИ кита)'
        const targetLab = el('label'); targetLab.className = 'targetLab'; targetLab.append(targetSel)

        const chips = el('span', 'dim')
        const finish = el('button', 'btn-primary')
        finish.textContent = 'Завершить ход'
        finish.title = 'нужна хотя бы одна атака/навык; ульты можно ставить до и после'
        const refresh = () => {
          chips.textContent = seq.map(a => describeAction(a, names)).join(' → ') || '—'
          finish.disabled = !seq.some(a => a.kind !== 'ult')
        }
        const mk = (label: string, make: () => Action, enabled: boolean) => {
          const b = el('button', 'btn-secondary')
          b.textContent = label
          b.disabled = !enabled
          b.onclick = () => { seq.push(make()); refresh() }
          ctrl.append(b)
        }
        mk('Ультимейт', () => ({ kind: 'ult' }), u.energy >= u.maxEnergy)
        mk('Базовая атака', () => ({ kind: 'basic' }), true)
        mk('Навык', () => ({ kind: 'skill', targetId: targetSel.value || undefined }), true)
        const undo = el('button', 'btn-secondary')
        undo.textContent = '⟲ Отменить'
        undo.onclick = () => { seq.pop(); refresh() }
        finish.onclick = () => resolve(seq)
        ctrl.append(targetLab, undo, finish, chips)
        refresh()
      })
    },
  }
}