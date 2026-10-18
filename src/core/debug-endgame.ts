import { runBattle } from './battle'
import { endgameStage, endgameSections, endgameVersions, enemyAtLevel, endgameSetup } from './endgame'
import type { TeamSpec } from './battle'

let failures = 0
const FAILS: string[] = []
function chk(tag: string, name: string, ok: boolean, soft = false): void {
  if (!ok) {
    if (!soft) { failures++; FAILS.push(`${tag}: ${name}`) }
    console.log(`  ${ok ? '✓' : (soft ? '(•)' : '✗')} ${name}`)
  } else console.log(`  ✓ ${name}`)
}

// ---------------------------------------------------------------- data-level checks

// 1. all cards in every stage resolve to an enemy in enemies.json (no drop)
import ENDGAME from '../../hsr-data/endgame.json'
import ENEMIES from '../../hsr-data/enemies.json'
const enemies = ENEMIES as any[]
const titles = new Set(enemies.map(e => e.title))
const baseNames = new Set(enemies.map(e => e.baseName))

let uniq = 0, unmatched = 0
for (const mode of ['MoC', 'PF', 'AS', 'AA'] as const) {
  for (const v of (ENDGAME as any).modes[mode]) {
    for (const sec of v.sections ?? []) {
      const blocks = sec.layouts?.length ? sec.layouts[sec.layouts.length - 1].blocks : sec.blocks
      for (const b of blocks ?? []) {
        for (const c of [...(b.cards ?? []), ...(b.nodes ?? []).flatMap((n: any) => n.cards ?? [])]) {
          uniq++
          if (!titles.has(c.name) && !baseNames.has(c.name)) unmatched++
        }
      }
    }
  }
}
chk('endgame', 'все карточки эндгейма резолвятся в enemies.json', unmatched === 0)
console.log(`  (уникальных карточек по всем модам: ${uniq})`)

// 2. level interpolation matches raw data at explicit levels for a boss and a mob
const sam80 = enemyAtLevel('Stellaron Hunter: Sam', 80)!
const sam100 = enemyAtLevel('Stellaron Hunter: Sam', 100)!
const sam120 = enemyAtLevel('Stellaron Hunter: Sam', 120)!
chk('endgame', 'Sam lv80 hp = raw 688251', sam80.hp === 688251)
chk('endgame', 'Sam lv100 hp = raw 1691857', sam100.hp === 1_691_857)
chk('endgame', 'Sam lv120 hp = raw 6767428', sam120.hp === 6_767_428)
chk('endgame', 'Sam lv120 atk = raw 1082', sam120.atk === 1082)
chk('endgame', 'Sam lv120 spd = raw 180', sam120.spd === 180)
chk('endgame', 'Sam res=20% на Ph/F/I/W, Lightning/Quantum/Imag из res исключены', sam100.res?.Physical === 0.2 && sam100.res?.Fire === 0.2 && sam100.res?.Ice === 0.2 && sam100.res?.Wind === 0.2 && sam100.res?.Lightning === undefined && sam100.res?.Quantum === undefined && sam100.res?.Imaginary === undefined)
chk('endgame', 'Sam toughness = 200, rank=boss', sam80.toughness === 200 && sam80.rank === 'boss')

// 3. AS 4.5 boss ranks: Echo of War tier → boss
const as = endgameStage('AS', '4.5', 'Celestial_Lupine')
const hc = as?.battles.find(b => b.waves[0]?.some(w => w.name === 'Hellcharred Shadow General'))
chk('endgame', 'AS Hellcharred (Echo of War) rank=boss', hc !== undefined && hc.waves[0].find(w => w.name === 'Hellcharred Shadow General')!.rank === 'boss')

// 4. MoC 4.4 Stage_12 uses the CURRENT (3-node) layout: 3 waves
const moc = endgameStage('MoC', '4.4', 'Stage_12')!
chk('endgame', 'MoC 4.4 S12 current layout = 3 waves', moc.battles[0].waves.length === 3)
chk('endgame', 'MoC 4.4 S12 cycles=45', moc.maxCycles === 45 && moc.enemyLevels[0] === 95)
const samWave = moc.battles[0].waves[0].find(w => w.name === 'Stellaron Hunter: Sam')
chk('endgame', 'MoC 4.4 S12 Sam hp at lv95 = 1369061', samWave!.hp === 1_369_061)

// 5. PF nodes = independent fights (Node 1 + Node 2), level 85 in 4.4
const pf = endgameStage('PF', '4.4', 'Stage_1')!
chk('endgame', 'PF 4.4 Stage_1 = 2 independent battles', pf.battles.length === 2)

// 5b. PF 1.6 Stage_4_2 has the label "Enemies Note 1 Note 2" — prefix-matched
const pf16 = endgameStage('PF', '1.6', 'Stage_4_2')!
chk('endgame', 'PF 1.6 Stage_4_2 блок "Enemies Note 1 Note 2" → 2 битвы', pf16.battles.length === 2 && pf16.battles[0].waves[0].length > 0)

// ---------------------------------------------------------------- sim smoke: prove runnable

// 6. build a real battle straight from the stage model — must run to completion
const team: TeamSpec[] = [{ kitId: 'firefly' }, { kitId: 'fugue' }, { kitId: 'lingsha' }]
let sim: ReturnType<typeof runBattle>
try {
  const setup = endgameSetup('MoC', '4.4', 'Stage_1', team, { seed: 3 })
  sim = runBattle({ ...setup!, cycles: 40 })
  const cleared = sim.allies('enemy').length === 0
  chk('endgame', 'smoke: MoC 4.4 S1 из модели боеспособен (битва до устоявшихся врагов/победы)', true, true)
  console.log(`  (${Math.round(sim.avElapsed)}AV, enemies ${cleared ? 'все повержены' : 'остались ' + sim.allies('enemy').length}, ${team.map(t => t.kitId).join('+')})`)
} catch (e) {
  chk('endgame', 'smoke: MoC 4.4 S1 из модели боеспособен (битва до устоявшихся врагов/победы)', false)
  console.log('  EX:', (e as Error).message)
}

// 6b. endgameSetup bridge: PF cycles "5 + 5" sum to 10, battle 0 = Node 1; enemy = first group
const pfSetup = endgameSetup('PF', '4.4', 'Stage_1', team, { battle: 0 })
chk('endgame', 'endgameSetup PF суммирует cycles "5 + 5" → 10, battle=0 → Node 1 (Meteoric Eagle)', !!pfSetup && pfSetup.cycles === 10 && !!pfSetup.enemyWaves && pfSetup.enemyWaves[0].some(e => e.name === 'Meteoric Eagle'))

// 6c. bridge sweep: every battleable section assembles a valid BattleSetup
const oneTeam: TeamSpec[] = [{ kitId: 'firefly' }]
let bridgeStages = 0, bridgeBad = 0
for (const mode of ['MoC', 'PF', 'AS', 'AA'] as const) {
  for (const ver of endgameVersions(mode)) {
    for (const sec of endgameSections(mode, ver)) {
      const st = endgameStage(mode, ver, sec.id)
      if (!st) continue
      bridgeStages += st.battles.length
      st.battles.forEach((b, bi) => {
        const s = endgameSetup(mode, ver, sec.id, oneTeam, { battle: bi })
        if (!s || s.cycles <= 0 || !s.enemy || s.enemy.hp <= 0 || !s.enemyWaves?.length) {
          bridgeBad++
          console.log(`  BRIDGE BAD ${mode} ${ver} ${sec.id} b${bi} cycles=${s?.cycles} enemy=${s?.enemy?.name}`)
        }
      })
    }
  }
}
chk('endgame', `bridge-свип всех ${bridgeStages} битв собирает валидный BattleSetup (cycles>0, враг hp>0)`, bridgeBad === 0)

// 7. AA enemy-level metadata (effRes, boss rank) resolves from raw stats
const aa = endgameStage('AA', '4.5', 'Knight_III')!
const fua = aa.battles[0].waves[0].find(w => w.name === 'Furiae Praetor')
chk('endgame', 'AA Furiae Praetor effRes from raw', fua!.effectRes === 0.3)
const reaver = aa.battles[0].waves[1].find(w => w.name === 'Flame Reaver of the Deepest Dark')
chk('endgame', 'AA Flame Reaver rank=boss', reaver!.rank === 'boss')

// ---------------------------------------------------------------- full-domain sweep
// every stage of every mode/version must resolve: no throw, no empty battle, no zero-HP enemy

let stages = 0, traitSec = 0, throws = 0, emptyBattles = 0, zeroHp = 0, badStats = 0
for (const mode of ['MoC', 'PF', 'AS', 'AA'] as const) {
  for (const ver of endgameVersions(mode)) {
    for (const sec of endgameSections(mode, ver)) {
      let st
      try {
        st = endgameStage(mode, ver, sec.id)
      } catch (e) {
        throws++
        console.log(`  THROW ${mode} ${ver} ${sec.id}: ${(e as Error).message}`)
        continue
      }
      if (!st) { traitSec++; continue }
      stages++
      if (!st.battles.length) { emptyBattles++; console.log(`  EMPTY BATTLES ${mode} ${ver} ${sec.id}`) }
      for (const b of st.battles) {
        for (const w of b.waves) {
          if (!w.length) { emptyBattles++; console.log(`  EMPTY WAVE ${mode} ${ver} ${sec.id} ${b.id}`) }
          for (const e of w) if (e.hp <= 0 || e.count < 1) { zeroHp++; console.log(`  ZERO/COUNT ${mode} ${ver} ${sec.id} ${b.id} ${e.name} hp=${e.hp} cnt=${e.count}`) }
          for (const e of w) if (e.spd <= 0 || e.toughness <= 0 || (e.atk ?? 800) <= 0) { badStats++; console.log(`  BADSTATS ${mode} ${ver} ${sec.id} ${b.id} ${e.name} spd=${e.spd} tough=${e.toughness} atk=${e.atk ?? 800}`) }
        }
      }
    }
  }
}
chk('endgame', `свип всех секций (${stages} боевых, ${traitSec} trait-страниц) без исключений`, throws === 0)
chk('endgame', 'нет пустых битв/волн', emptyBattles === 0)
chk('endgame', 'нет врагов с hp≤0 или count<1', zeroHp === 0)
chk('endgame', 'нет врагов с spd≤0/toughness≤0/atk≤0', badStats === 0)

console.log('endgameVersions(MoC) tail:', endgameVersions('MoC').slice(-2).join(','))
console.log('endgameSections(PF, 4.4):', endgameSections('PF', '4.4').map(s => s.id).join(','))

if (failures) { console.log(`\nFAILURES: ${failures}`); console.log(FAILS.join('\n')); process.exit(1) }
console.log('\nFAILURES: 0')