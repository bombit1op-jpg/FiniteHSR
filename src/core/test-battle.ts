// Battle: Seele/Sparkle/Huohuo/Pela vs MoC 12 Boss
// Benchmark builds: 25 effective substat rolls per character
// Substats from hsr-data sub_affix_property_list, weights from fribbels scoring metadata
import { prepareBattle, ENEMY_PRESETS } from './battle'
import { eff } from './combat/StatResolver'
import type { RelicPiece, Unit } from './entities/Unit'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

// ---- Benchmark Builds (25 effective rolls, tier 2 high, on effective substats only) ----

// Seele — effective: CR, CD, ATK%, SPD
// Body=CR (32.4%), traces=28% CR → base 65.4% + subs for 70%+ Rutilant Arena
// Distribution: CR×2, CD×9, ATK%×7, SPD×7 = 25
const seeleRelics: RelicPiece[] = [
  { setId: 'rutilant', slot: 'head', main: 'hpFlat', subs: [
    { stat: 'critRate', tier: 2, rolls: 1 }, { stat: 'critDmg', tier: 2, rolls: 2 },
    { stat: 'atkPct', tier: 2, rolls: 1 }, { stat: 'spd', tier: 2, rolls: 1 },
  ]},
  { setId: 'rutilant', slot: 'hands', main: 'atkFlat', subs: [
    { stat: 'critRate', tier: 2, rolls: 1 }, { stat: 'critDmg', tier: 2, rolls: 2 },
    { stat: 'atkPct', tier: 2, rolls: 2 }, { stat: 'spd', tier: 2, rolls: 1 },
  ]},
  { setId: 'rutilant', slot: 'body', main: 'critRate', subs: [
    { stat: 'critDmg', tier: 2, rolls: 2 }, { stat: 'atkPct', tier: 2, rolls: 1 },
    { stat: 'spd', tier: 2, rolls: 1 },
  ]},
  { setId: 'rutilant', slot: 'feet', main: 'spd', subs: [
    { stat: 'critDmg', tier: 2, rolls: 2 }, { stat: 'atkPct', tier: 2, rolls: 1 },
    { stat: 'spd', tier: 2, rolls: 1 },
  ]},
  { setId: 'rutilant', slot: 'sphere', main: 'dmg:Quantum', subs: [
    { stat: 'critDmg', tier: 2, rolls: 1 }, { stat: 'atkPct', tier: 2, rolls: 2 },
    { stat: 'spd', tier: 2, rolls: 1 },
  ]},
  { setId: 'rutilant', slot: 'rope', main: 'atkPct', subs: [
    { stat: 'critDmg', tier: 2, rolls: 2 }, { stat: 'spd', tier: 2, rolls: 2 },
  ]},
]

// Sparkle — effective: CD, SPD, RES (weights: CD=1, SPD=1, RES=0.25)
// Distribution: CD×10, SPD×12, RES×3 = 25
const sparkleRelics: RelicPiece[] = [
  { setId: 'eagle', slot: 'head', main: 'hpFlat', subs: [
    { stat: 'critDmg', tier: 2, rolls: 2 }, { stat: 'spd', tier: 2, rolls: 2 },
    { stat: 'effRes', tier: 2, rolls: 1 },
  ]},
  { setId: 'eagle', slot: 'hands', main: 'atkFlat', subs: [
    { stat: 'critDmg', tier: 2, rolls: 2 }, { stat: 'spd', tier: 2, rolls: 2 },
    { stat: 'effRes', tier: 2, rolls: 1 },
  ]},
  { setId: 'eagle', slot: 'body', main: 'critDmg', subs: [
    { stat: 'spd', tier: 2, rolls: 2 }, { stat: 'effRes', tier: 2, rolls: 1 },
  ]},
  { setId: 'eagle', slot: 'feet', main: 'spd', subs: [
    { stat: 'critDmg', tier: 2, rolls: 2 }, { stat: 'effRes', tier: 2, rolls: 1 },
  ]},
  { setId: 'broken_keel', slot: 'sphere', main: 'hpPct', subs: [
    { stat: 'critDmg', tier: 2, rolls: 2 }, { stat: 'spd', tier: 2, rolls: 2 },
  ]},
  { setId: 'broken_keel', slot: 'rope', main: 'err', subs: [
    { stat: 'critDmg', tier: 2, rolls: 2 }, { stat: 'spd', tier: 2, rolls: 2 },
  ]},
]

// Huohuo — effective: HP%, SPD, RES (weights: HP=1, HP%=1, SPD=1, RES=0.5)
// Distribution: HP%×8, SPD×10, RES×7 = 25
const huohuoRelics: RelicPiece[] = [
  { setId: 'musketeer', slot: 'head', main: 'hpFlat', subs: [
    { stat: 'hpPct', tier: 2, rolls: 2 }, { stat: 'spd', tier: 2, rolls: 2 },
    { stat: 'effRes', tier: 2, rolls: 1 },
  ]},
  { setId: 'musketeer', slot: 'hands', main: 'atkFlat', subs: [
    { stat: 'hpPct', tier: 2, rolls: 2 }, { stat: 'spd', tier: 2, rolls: 2 },
    { stat: 'effRes', tier: 2, rolls: 1 },
  ]},
  { setId: 'musketeer', slot: 'body', main: 'hpPct', subs: [
    { stat: 'spd', tier: 2, rolls: 2 }, { stat: 'effRes', tier: 2, rolls: 1 },
  ]},
  { setId: 'musketeer', slot: 'feet', main: 'spd', subs: [
    { stat: 'hpPct', tier: 2, rolls: 2 }, { stat: 'effRes', tier: 2, rolls: 1 },
  ]},
  { setId: 'fleet', slot: 'sphere', main: 'hpPct', subs: [
    { stat: 'spd', tier: 2, rolls: 2 }, { stat: 'effRes', tier: 2, rolls: 2 },
  ]},
  { setId: 'fleet', slot: 'rope', main: 'err', subs: [
    { stat: 'hpPct', tier: 2, rolls: 2 }, { stat: 'spd', tier: 2, rolls: 2 },
    { stat: 'effRes', tier: 2, rolls: 2 },
  ]},
]

// Pela — effective: SPD, EHR, CR, CD, ATK% (weights: EHR=1, SPD=1, all others 0.25)
// Distribution: EHR×6, SPD×7, CR×4, CD×4, ATK%×4 = 25
const pelaRelics: RelicPiece[] = [
  { setId: 'eagle', slot: 'head', main: 'hpFlat', subs: [
    { stat: 'ehr', tier: 2, rolls: 1 }, { stat: 'spd', tier: 2, rolls: 2 },
    { stat: 'critRate', tier: 2, rolls: 1 }, { stat: 'critDmg', tier: 2, rolls: 1 },
  ]},
  { setId: 'eagle', slot: 'hands', main: 'atkFlat', subs: [
    { stat: 'ehr', tier: 2, rolls: 1 }, { stat: 'spd', tier: 2, rolls: 2 },
    { stat: 'critRate', tier: 2, rolls: 1 }, { stat: 'critDmg', tier: 2, rolls: 1 },
  ]},
  { setId: 'eagle', slot: 'body', main: 'ehr', subs: [
    { stat: 'spd', tier: 2, rolls: 1 }, { stat: 'critRate', tier: 2, rolls: 1 },
    { stat: 'critDmg', tier: 2, rolls: 1 }, { stat: 'atkPct', tier: 2, rolls: 1 },
  ]},
  { setId: 'eagle', slot: 'feet', main: 'spd', subs: [
    { stat: 'ehr', tier: 2, rolls: 2 }, { stat: 'critRate', tier: 2, rolls: 1 },
    { stat: 'atkPct', tier: 2, rolls: 1 },
  ]},
  { setId: 'fleet', slot: 'sphere', main: 'dmg:Ice', subs: [
    { stat: 'ehr', tier: 2, rolls: 1 }, { stat: 'spd', tier: 2, rolls: 1 },
    { stat: 'critDmg', tier: 2, rolls: 1 }, { stat: 'atkPct', tier: 2, rolls: 1 },
  ]},
  { setId: 'fleet', slot: 'rope', main: 'err', subs: [
    { stat: 'ehr', tier: 2, rolls: 1 }, { stat: 'spd', tier: 2, rolls: 1 },
    { stat: 'critRate', tier: 2, rolls: 1 }, { stat: 'critDmg', tier: 2, rolls: 1 },
  ]},
]

// ---- Run Battle ----

const sim = prepareBattle({
  team: [
    {
      kitId: 'seele', skillPriority: 2,
      gear: { coneId: 'in_the_night', si: 1, pieces: seeleRelics },
    },
    {
      kitId: 'sparkle', skillPriority: 1,
      gear: { coneId: 'earthly_escapade', si: 1, pieces: sparkleRelics },
    },
    {
      kitId: 'huohuo', skillPriority: 1,
      gear: { coneId: 'night_of_fright', si: 1, pieces: huohuoRelics },
    },
    {
      kitId: 'pela', skillPriority: 1,
      gear: { coneId: 'resolution', si: 5, pieces: pelaRelics },
    },
  ],
  enemy: { ...ENEMY_PRESETS.moc12_boss, count: 1, hp: 280_000 },
  cycles: 15,
  seed: 99,
})

// ---- Pre-Battle Stats ----

const out: string[] = []

function statLine(u: Unit): string {
  const e = eff(u)
  return `  ${u.name.padEnd(10)} HP:${Math.round(u.maxHp)} ATK:${Math.round(e.atk)} DEF:${Math.round(e.def)} SPD:${e.spd.toFixed(1)} CR:${(e.critRate * 100).toFixed(1)}% CD:${(e.critDmg * 100).toFixed(1)}% BE:${(e.be * 100).toFixed(1)}%`
}

out.push('================================================================')
out.push('   BENCHMARK: Seele / Sparkle / Huohuo / Pela vs MoC 12 Boss')
out.push('   (25 effective substat rolls per character)')
out.push('================================================================')
out.push('')
out.push('--- PRE-BATTLE STATS ---')
const allies = sim.roster.filter(u => u.side === 'ally' && u.kind === 'char')
const enemies = sim.roster.filter(u => u.side === 'enemy')
for (const u of allies) out.push(statLine(u))
out.push('')
for (const e of enemies) {
  const weak = e.weaknesses.join('/')
  out.push(`  ${e.name} HP:${e.maxHp} DEF:${e.base.def} SPD:${e.base.spd} Weak:${weak} RES:${Object.entries(e.res).map(([k,v]) => `${k}=${(v*100).toFixed(0)}%`).join(' ')}`)
}

sim.start()
out.push('')
out.push('--- BATTLE LOG ---')
out.push('')

// ---- Formatted Output ----

function fmtBuffs(u: Unit): string {
  return u.buffs.filter(b => b.sourceId !== 'gear' && b.id !== 'traces')
    .map(b => b.name).join(', ')
}

function fmtDebuffs(e: Unit): string {
  return e.buffs.filter(b => b.sourceId !== 'gear' && b.id !== 'traces')
    .map(b => b.name).join(', ')
}

function energyStr(u: Unit | undefined): string {
  return u ? `${Math.floor(u.energy)}/${u.maxEnergy}` : '??/??'
}

for (const line of sim.logLines) {
  const avMatch = line.match(/^\[([^\]]+)\]/)
  if (!avMatch) { out.push(`  ${line}`); continue }
  const av = avMatch[1]

  // Turn header: >>> Name [TYPE] HP:... EN:... / Tough:...
  const preMatch = line.match(/^\[[^\]]+\]\s*>>> (\S+)\s+\[(\w+)\]\s+HP:(\S+)\s+(EN:\S+|Tough:\S+)/)
  if (preMatch) {
    const [, name, type, , stats] = preMatch
    const u = sim.roster.find(x => x.name === name)
    const buffs = u ? (u.side === 'ally' ? fmtBuffs(u) : fmtDebuffs(u)) : ''
    out.push(`[${av}] ${name}: ${type} | ${stats}${buffs ? ' | ' + buffs : ''}`)
    continue
  }

  // Damage: Name → Target: dmg (CRIT) [SKILL/BASIC/...]
  const dmgMatch = line.match(/^\[[^\]]+\]\s+(.+?)\s*\u2192\s*(.+?):\s*(\d+)(.*?)\s*\[(.+?)\]/)
  if (dmgMatch) {
    const [, attacker, target, dmg, extra, skill] = dmgMatch
    const crit = extra.includes('CRIT') ? ' CRIT' : ''
    const u = sim.roster.find(x => x.name === attacker)
    out.push(`  ${av} | ${attacker}: ${skill} → ${target} | ${dmg}${crit} | EN:${energyStr(u)}`)
    continue
  }

  // Enemy hits: Name hits Target: dmg
  const hitMatch = line.match(/^\[[^\]]+\]\s+(.+?) hits (.+?): (\d+)/)
  if (hitMatch) {
    const [, attacker, target, dmg] = hitMatch
    const u = sim.roster.find(x => x.name === attacker)
    out.push(`  ${av} | ${attacker} hits ${target} | ${dmg} | EN:${energyStr(u)}`)
    continue
  }

  // AoE attack
  if (line.includes('uses AoE attack')) {
    const name = line.match(/(\S+)\s+uses AoE/)?.[1] ?? '???'
    out.push(`  ${av} | ${name}: AoE Attack`)
    continue
  }

  // Weakness Break
  const breakMatch = line.match(/WEAKNESS BROKEN.*?Break DMG (\d+)/)
  if (breakMatch) {
    out.push(`  ${av} | >> WEAKNESS BROKEN — Break DMG ${breakMatch[1]}`)
    continue
  }

  // Defeated
  if (line.includes('defeated')) {
    const name = line.match(/XX (.+?) defeated/)?.[1] ?? '???'
    out.push(`  ${av} | >> ${name} DEFEATED`)
    continue
  }

  // DoT
  const dotMatch = line.match(/(.+?)\s+takes\s+(\d+)\s*\[DoT\s+(.+?)\]/)
  if (dotMatch) {
    out.push(`  ${av} | ${dotMatch[1]}: DoT ${dotMatch[3]} ${dotMatch[2]}`)
    continue
  }

  // Entanglement
  const entMatch = line.match(/(.+?)\s+takes\s+(\d+)\s*\[Entanglement\s*\u00d7(\d+)\]/)
  if (entMatch) {
    out.push(`  ${av} | ${entMatch[1]}: Entanglement ×${entMatch[3]} ${entMatch[2]}`)
    continue
  }

  // Heals
  const healMatch = line.match(/Heals (.+?) \+(\d+), all allies \+(\d+)/)
  if (healMatch) {
    out.push(`  ${av} | Huohuo: Heals ${healMatch[1]} +${healMatch[2]}, all +${healMatch[3]}`)
    continue
  }

  // Huohuo Skill heal
  const hhSkillMatch = line.match(/\] (.+?) Skill: heals (.+?) \+(\d+), all \+(\d+)/)
  if (hhSkillMatch) {
    out.push(`  ${av} | ${hhSkillMatch[1]} Skill: heals ${hhSkillMatch[2]} +${hhSkillMatch[3]}, all +${hhSkillMatch[4]}`)
    continue
  }

  // Huohuo Talent heal
  const hhTalentMatch = line.match(/\] (.+?) Talent: heals (.+?) \+(\d+)/)
  if (hhTalentMatch) {
    out.push(`  ${av} | ${hhTalentMatch[1]} Talent: heals ${hhTalentMatch[2]} +${hhTalentMatch[3]}`)
    continue
  }

  // Huohuo Ult
  const ultEnergyMatch = line.match(/\+(\d+) energy/)
  if (ultEnergyMatch && line.includes('ATK+')) {
    out.push(`  ${av} | Huohuo Ult: +${ultEnergyMatch[1]} energy, ATK+40% for all allies`)
    continue
  }

  // Sparkle Ult
  if (line.includes('The Hero with a Thousand Faces')) {
    out.push(`  ${av} | Sparkle Ult: +SP, Cipher on allies`)
    continue
  }

  // Dreamdiver
  const dreamMatch = line.match(/Dreamdiver advances (.+?) by (\d+)%/)
  if (dreamMatch) {
    out.push(`  ${av} | Sparkle Skill: Dreamdiver → ${dreamMatch[1]} +${dreamMatch[2]}%`)
    continue
  }

  // Buff lands
  const buffMatch = line.match(/\] ◈\s+(.+?)\s+lands on\s+(.+)/)
  if (buffMatch) {
    out.push(`  ${av} | ${buffMatch[2]}: +${buffMatch[1]}`)
    continue
  }

  // Resist
  const resistMatch = line.match(/\] ✕\s+(.+?)\s+RESISTS\s+(.+)/)
  if (resistMatch) {
    out.push(`  ${av} | ${resistMatch[1]}: RESISTS ${resistMatch[2]}`)
    continue
  }

  // Pela dispel
  const dispelMatch = line.match(/Frostbite dispels (.+?) from (.+)/)
  if (dispelMatch) {
    out.push(`  ${av} | Pela Skill: dispels ${dispelMatch[1]} from ${dispelMatch[2]}`)
    continue
  }

  // Seele auto-Skill
  const seeleSkillMatch = line.match(/\] (\S+) auto-Skill \u2192 (.+?) \((.+?)\)/)
  if (seeleSkillMatch) {
    out.push(`  ${av} | ${seeleSkillMatch[1]}: ${seeleSkillMatch[3]} → ${seeleSkillMatch[2]}`)
    continue
  }

  // Seele Butterfly Flurry
  const seeleFlurryMatch = line.match(/\] (\S+) Butterfly Flurry \u2192 (.+?): (\d+)/)
  if (seeleFlurryMatch) {
    out.push(`  ${av} | ${seeleFlurryMatch[1]}: Butterfly Flurry → ${seeleFlurryMatch[2]} | ${seeleFlurryMatch[3]}`)
    continue
  }

  // Gallagher heal
  const gallagherHealMatch = line.match(/(\S+) heals (\S+) for (\d+)/)
  if (gallagherHealMatch) {
    out.push(`  ${av} | ${gallagherHealMatch[1]} heals ${gallagherHealMatch[2]} | ${gallagherHealMatch[3]} [Special Brew]`)
    continue
  }

  // Gallagher A6
  if (line.includes('A6 Bottoms Up')) {
    out.push(`  ${av} | Gallagher A6: Nectar Blitz heals all teammates`)
    continue
  }

  // Jing Yuan summons LL
  const jySummonMatch = line.match(/(\S+) summons Lightning-Lord/)
  if (jySummonMatch) {
    out.push(`  ${av} | ${jySummonMatch[1]}: summons Lightning-Lord`)
    continue
  }

  // Lightning-Lord acts
  const llActMatch = line.match(/-- (\S+) acts \((\d+) hits\)/)
  if (llActMatch) {
    out.push(`  ${av} | Lightning-Lord: ${llActMatch[2]} hits`)
    continue
  }

  // Pela E1
  if (line.includes('E1 Victory Report')) {
    out.push(`  ${av} | Pela E1: Victory Report restores 5 Energy`)
    continue
  }

  // Pela E6
  const pelaE6Match = line.match(/\] (\S+) E6 Additional DMG \u2192 (.+?): (\d+)/)
  if (pelaE6Match) {
    out.push(`  ${av} | ${pelaE6Match[1]}: E6 Additional DMG → ${pelaE6Match[2]} | ${pelaE6Match[3]} [Ice]`)
    continue
  }

  // Guinaifen detonate
  const guiDetMatch = line.match(/\] (\S+) detonates Burn on (.+?): (\d+)/)
  if (guiDetMatch) {
    out.push(`  ${av} | ${guiDetMatch[1]}: detonates Burn → ${guiDetMatch[2]} | ${guiDetMatch[3]}`)
    continue
  }

  // Bronya Belobog March
  if (line.includes('The Belobog March')) {
    const byName = line.match(/(\S+) casts The Belobog March/)?.[1] ?? '???'
    out.push(`  ${av} | ${byName}: casts The Belobog March`)
    continue
  }

  // Bronya E1
  if (line.includes('E1 Hone Your Strength')) {
    out.push(`  ${av} | Bronya E1: Hone Your Strength recovers 1 SP`)
    continue
  }

  // Bronya advance
  const byAdvMatch = line.match(/(\S+) advances (\S+) \(immediate action\)/)
  if (byAdvMatch) {
    out.push(`  ${av} | ${byAdvMatch[1]}: advances ${byAdvMatch[2]} (immediate action)`)
    continue
  }

  // Firefly energy set
  const ffEnergyMatch = line.match(/(\S+) talent: energy set to (\d+)%/)
  if (ffEnergyMatch) {
    out.push(`  ${av} | ${ffEnergyMatch[1]}: talent energy set to ${ffEnergyMatch[2]}%`)
    continue
  }

  // Firefly Module gamma
  const ffModMatch = line.match(/(\S+) Module \u03b3: \+(\d+)% BE from ATK/)
  if (ffModMatch) {
    out.push(`  ${av} | ${ffModMatch[1]}: Module γ +${ffModMatch[2]}% BE from ATK`)
    continue
  }

  // Firefly enter/exit Complete Combustion
  if (line.includes('enters COMPLETE COMBUSTION')) {
    const ffName = line.match(/(\S+) enters/)?.[1] ?? '???'
    out.push(`  ${av} | ${ffName}: enters COMPLETE COMBUSTION`)
    continue
  }
  if (line.includes('exits Complete Combustion')) {
    const ffName = line.match(/(\S+) exits/)?.[1] ?? '???'
    out.push(`  ${av} | ${ffName}: exits Complete Combustion`)
    continue
  }

  // Firefly E2 extra turn
  if (line.includes('E2 extra turn')) {
    const reason = line.includes('kill') ? 'on kill' : 'on break'
    out.push(`  ${av} | Firefly E2: extra turn ${reason} in Complete Combustion`)
    continue
  }

  // Break debuff afflict
  const breakDebuffMatch = line.match(/afflicted by (\S+) break debuff/)
  if (breakDebuffMatch) {
    out.push(`  ${av} | ${breakDebuffMatch[1]} break debuff applied`)
    continue
  }

  // Extra turn
  if (line.includes('gains an Extra Turn')) {
    const name = line.match(/>> (\S+) gains/)?.[1] ?? '???'
    out.push(`  ${av} | ${name}: EXTRA TURN`)
    continue
  }

  // Will act immediately
  if (line.includes('will act immediately')) {
    const name = line.match(/>> (\S+) will/)?.[1] ?? '???'
    out.push(`  ${av} | ${name}: will act immediately`)
    continue
  }

  // Frozen
  if (line.includes('is Frozen')) {
    const name = line.match(/\.\. (\S+) is Frozen/)?.[1] ?? '???'
    out.push(`  ${av} | ${name}: FROZEN — turn skipped`)
    continue
  }

  // Recovered from break
  if (line.includes('recovered from Weakness Break')) {
    const name = line.match(/\.\. (\S+) recovered/)?.[1] ?? '???'
    out.push(`  ${av} | ${name}: recovered from Weakness Break`)
    continue
  }

  // Super Break
  const sbMatch = line.match(/SUPER BREAK \u2192 (\S+): (\d+)/)
  if (sbMatch) {
    out.push(`  ${av} | SUPER BREAK → ${sbMatch[1]} | ${sbMatch[2]}`)
    continue
  }

  // Phase markers
  const endMatch = line.match(/===\s*(.+?)\s*===/)
  if (endMatch) {
    out.push('')
    out.push(`=== ${endMatch[1]} ===`)
    out.push('')
    continue
  }

  // Fallback: show raw
  out.push(`  ${line}`)
}

// ---- Post-Battle ----

out.push('')
out.push('--- POST-BATTLE ---')
out.push(`Result: ${sim.endReason} | Time: ${sim.avElapsed.toFixed(0)} AV | SP: ${sim.sp()}/${sim.maxSp}`)
out.push('')
for (const u of allies) {
  const e = eff(u)
  const hpPct = u.maxHp > 0 ? (u.hp / u.maxHp * 100).toFixed(0) : '0'
  out.push(`  ${u.name}: HP ${Math.round(u.hp)}/${u.maxHp} (${hpPct}%) | EN ${Math.floor(u.energy)}/${u.maxEnergy}`)
  out.push(`    ATK:${Math.round(e.atk)} DEF:${Math.round(e.def)} SPD:${e.spd.toFixed(1)} CR:${(e.critRate*100).toFixed(1)}% CD:${(e.critDmg*100).toFixed(1)}%`)
  const b = fmtBuffs(u)
  if (b) out.push(`    Buffs: ${b}`)
}
out.push('')
for (const e of enemies) {
  const hpPct = e.maxHp > 0 ? (e.hp / e.maxHp * 100).toFixed(0) : '0'
  out.push(`  ${e.name}: HP ${Math.round(e.hp)}/${e.maxHp} (${hpPct}%) | Tough: ${e.broken ? 'BROKEN' : Math.round(e.toughness) + '/' + e.maxToughness}`)
  const d = fmtDebuffs(e)
  if (d) out.push(`    Debuffs: ${d}`)
}
out.push('')
out.push('--- DAMAGE ---')
for (const [name, acc] of sim.accounts) {
  out.push(`  ${name}: ${Math.round(acc.total)} | ${Object.entries(acc.bySkill).map(([k, v]) => `${k}=${Math.round(v)}`).join(', ')}`)
}

// ---- Write output ----

const text = out.join('\n')
console.log(text)

const logDir = join(process.cwd(), 'battlelog')
mkdirSync(logDir, { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
writeFileSync(join(logDir, `${ts}.txt`), text, 'utf-8')
console.log(`\nLog saved to battlelog/${ts}.txt`)
