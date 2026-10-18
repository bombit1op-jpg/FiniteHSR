import { KITS } from '../core/kits'
import { PROG } from '../core/progression'
import { escapeHtml } from './dom'

const SLOT_LABELS: Record<string, string> = {
  basic: 'Базовая', skill: 'Навык', ult: 'Ультимейт', talent: 'Талант',
  basic_en: 'Базовая+', skill_en: 'Навык+', talent_a2: 'Талант (2)', ult_a2: 'Ульта (2)',
  ult_a3: 'Ульта (3)', skill_a2: 'Навык (2)', skill_a3: 'Навык (3)',
}

export function renderReference(): void {
  const box = document.getElementById('reference')
  if (!box) return
  const pct = (v: number): string =>
    Math.abs(v) < 5 ? `${Math.round(v * 1000) / 10}%` : String(Math.round(v * 10) / 10)
  let html = ''
  for (const kit of KITS) {
    const p = PROG[kit.id]
    if (!p) continue
    html += `<details><summary><b>${escapeHtml(kit.name)}</b> — HP ${p.base.hp} · ATK ${p.base.atk} · DEF ${p.base.def} · SPD ${p.base.spd}</summary>`
    html += '<div class="refBody">'
    html += '<table class="refTable"><tr><th>Способность</th><th>Lv1</th><th>Макс</th></tr>'
    for (const [slot, arr] of Object.entries(p.abilities)) {
      html += `<tr><td>${SLOT_LABELS[slot] ?? slot}</td><td>${pct(arr[0])}</td><td>${pct(arr[arr.length - 1])}</td></tr>`
    }
    html += '</table>'
    html += `<ul class="eidList">${p.eidolons.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
    html += `<div class="dim">Трейсы: ${p.traces.map(t => `${t.stat} +${Math.round(t.value * 100)}%`).join(', ')}</div>`
    html += '</div></details>'
  }
  box.innerHTML = html
}
