import type { Unit } from '../entities/Unit'
import { cycleIndexOf as timelineCycleIndexOf, totalBudget as timelineTotalBudget } from '../timeline/Timeline'
import type { BattleIO } from '../../core/battle'
import type { Simulator } from '../../core/simulator'
import { resolvePreCombat, type PreCombatInput } from './PreCombat'
import { resetEnemyDefense } from '../enemy/defense'

/** Battle flow: the battle-start phase (AV seeding, full-HP sync, kit/cone/relic onStart, Techniques,
 *  wave-1 hooks) and the run loop that picks the next actor off the ActionQueue until the fight ends.
 *  Simulator owns the state it mutates (roster, wave/cycle, endReason, queue); this class drives it. */
export class BattleEngine {
  constructor(private s: Simulator) {}

  initBattle(): void {
    this.s.inBattleStart = true
    this.s.logger.emit({ type: 'BATTLE_START', payload: { seed: this.s.cfg.seed, cycles: this.s.cfg.cycles, waveCount: this.s.waveCount, techniques: this.s.cfg.techniques ?? [], units: this.s.units().map(u => ({ id: u.id, name: u.name, side: u.side, kind: u.kind, hp: u.hp, maxHp: u.maxHp, spd: Math.round(u.base.spd * 10) / 10, elem: u.elem, kitId: u.kitId })) } })
    for (const u of this.s.roster) u.av = this.s.baseAv(u)
    // units start a battle at full HP — eff() recomputes maxHp from HP% buffs
    // (traces/gear), so sync hp to the effective max or HP-gated kits read a stale
    // low ratio at start (e.g. Castorice A2 SPD gate). startHp (< 1) is the explicit
    // wounded-start knob (Arlan A6 Repel fixture) and overrides the full-HP sync.
    for (const u of this.s.roster) if (!u.dead) u.hp = Math.max(1, Math.round(u.maxHp * (u.startHp ?? 1)))
    for (const u of [...this.s.roster].filter(x => x.kind === 'char')) {
      this.s.kits.get(u.kitId!)?.onStart?.(this.s, u, this.s.rt(u))
      const g = this.s.gearMap.get(u.id)
      g?.cone?.onStart?.(this.s, u, g.coneSi)
      g?.planar?.onStart?.(this.s, u)
      g?.relicSets?.forEach(s => s.onStart?.(this.s, u))
    }
    this.applyTechniques()
    // wave 1 starts at battle start: fire wave-start hooks (wave energy, Great Fortune 3t, Summer wave-SP)
    this.s.fireWaveStart()
    this.s.logger.emit({ type: 'WAVE_START', payload: { wave: this.s.wave, waveCount: this.s.waveCount, enemies: this.s.currentWaveEnemies().map(e => e.name), enemyIds: this.s.currentWaveEnemies().map(e => e.id) } })
    // the first cycle opens here; without this the CYCLE_START/CYCLE_END pair is unbalanced.
    // onCycleStart has zero implementations today, so firing the hook is provably a no-op.
    this.s.fireCycle('start', this.s.cycle)
    this.s.logger.emit({ type: 'CYCLE_START', payload: { cycle: this.s.cycle + 1, time: this.s.avElapsed } })
    this.s.inBattleStart = false
  }

  /** apply the activated pre-fight Techniques (§84.6.1): the ordered config list is resolved
   *  into used-vs-surviving activations (attack/zone exclusivity, repeat cap, switch-cancel),
   *  the plan is attached to `sim.preCombat` BEFORE any apply so counters see every use, then
   *  only surviving activations apply. Battle-start effects stay inside the `inBattleStart`
   *  window, so their debuffs do not feed ability-enclosed hooks (Acheron #18). */
  private applyTechniques(): void {
    const enabled = this.s.cfg.techniques
    if (!enabled?.length) return
    const onField = new Set(this.s.roster.filter(x => x.side === 'ally' && x.kind === 'char' && !x.dead).map(x => x.kitId))
    const inputs: PreCombatInput[] = []
    for (const kitId of enabled) {
      if (!onField.has(kitId)) continue
      const t = this.s.kits.get(kitId)?.technique
      if (!t) continue
      inputs.push({ kitId, name: t.name, kind: t.kind, zone: t.zone, switchSensitive: t.switchSensitive, maxUses: t.maxUses })
    }
    const plan = resolvePreCombat(inputs)
    this.s.preCombat = plan
    for (const a of plan.activations) {
      const u = this.s.roster.find(x => x.side === 'ally' && x.kind === 'char' && !x.dead && x.kitId === a.kitId)!
      const t = this.s.kits.get(a.kitId)!.technique!
      if (!a.survives) {
        const why = a.cancelledBy === 'attack-conflict' ? 'only one combat Technique per battle'
          : a.cancelledBy === 'zone-replaced' ? `Zone replaced by "${a.replacedBy}"`
          : a.cancelledBy === 'switch-cancelled' ? `cancelled by switching to ${a.replacedBy}`
          : `repeat-use cap (${a.maxUses ?? 1}) reached`
        this.s.log(`${u.name}: Technique "${t.name}" skipped — ${why}`)
        continue
      }
      this.s.log(`${u.name} Technique: ${t.name}`)
      this.s.logger.emit({ type: 'TECHNIQUE_APPLIED', source: u.name, sourceId: u.id, payload: { technique: t.name, kind: t.kind ?? 'buff', kitId: a.kitId } })
      t.apply(this.s, u, this.s.rt(u))
    }
  }

  /** transition to the next wave: end-of-wave hooks, MoC AV reset to initial, awaken the new wave's enemies, cycle reset */
  private advanceWave(): void {
    this.s.logger.emit({ type: 'WAVE_END', payload: { wave: this.s.wave } })
    this.s.fireWaveEnd()
    // §61: the wave that just ended is despawned before the next spawns (explicit transition event)
    const leaving = this.s.roster.filter(u => u.side === 'enemy' && (u.wave ?? 1) === this.s.wave)
    this.s.logger.emit({ type: 'ENEMY_DESPAWN', payload: { wave: this.s.wave, enemies: leaving.map(u => u.name), enemyIds: leaving.map(u => u.id) } })
    this.s.wave++
    this.s.avElapsed = 0
    this.s.cycle = 0
    for (const u of this.s.roster) {
      if (u.dead) continue
      // MoC: Action Value elapsed resets to its initial value at the start of a new wave
      u.av = this.s.baseAv(u)
    }
    for (const u of this.s.roster) {
      if (u.side !== 'enemy' || (u.wave ?? 1) !== this.s.wave || !u.dead) continue
      u.dead = undefined
      u.hp = u.maxHp
      u.buffs = []
      u.dots = []
      u.broken = false
      this.s.refillToughness(u) // full multi-layer stack + exo bars back (wave respawn = fresh enemy)
      resetEnemyDefense(u) // §58 defense is per-spawn: shield accrual must not survive a respawn
      u.av = this.s.baseAv(u)
    }
    // §61: the arriving wave is spawned after cleanup; a boss in it gets an explicit reset marker
    const arriving = this.s.roster.filter(u => u.side === 'enemy' && (u.wave ?? 1) === this.s.wave)
    this.s.logger.emit({ type: 'ENEMY_SPAWN', payload: { wave: this.s.wave, enemies: arriving.map(u => u.name), enemyIds: arriving.map(u => u.id) } })
    const bosses = arriving.filter(u => u.rank === 'boss')
    if (bosses.length) this.s.logger.emit({ type: 'BOSS_RESET', payload: { wave: this.s.wave, enemies: bosses.map(u => u.name), enemyIds: bosses.map(u => u.id) } })
    this.s.log(`=== WAVE ${this.s.wave} ===`)
    this.s.fireWaveStart()
    this.s.logger.emit({ type: 'WAVE_START', payload: { wave: this.s.wave, waveCount: this.s.waveCount, enemies: this.s.currentWaveEnemies().map(e => e.name), enemyIds: this.s.currentWaveEnemies().map(e => e.id) } })
    // per-wave AV/cycle reset reopens cycle 1 — same pairing as initBattle
    this.s.fireCycle('start', this.s.cycle)
    this.s.logger.emit({ type: 'CYCLE_START', payload: { cycle: this.s.cycle + 1, time: this.s.avElapsed } })
  }

  start(): void {
    this.initBattle()
    this.s.loop()
  }

  /** manual step-by-step run: ult window before every unit's turn + action choice on every char turn */
  async startInteractive(io: BattleIO): Promise<void> {
    this.initBattle()
    this.s.io = io
    await this.loopI()
    this.s.io = undefined
  }

  private totalBudget(): number { return timelineTotalBudget(this.s.cfg.cycles) }

  /** end-of-run checks + wave transition, shared by loop() and loopI(). One copy on purpose: loopI used
   *  to test "any enemy alive in the roster", so on multi-wave setups interactive mode declared a win
   *  after wave 1 and never emitted WAVE_END/WAVE_START for wave 2. */
  private prologueCheck(guard: number): 'ok' | 'win' | 'lose' | 'timeout' | 'guard' {
    if (guard > 200000) { this.stop('guard', 'FORCE STOP'); return 'guard' }
    const alive = this.s.roster.filter(u => !u.dead)
    if (!alive.some(u => u.side === 'ally' && u.kind === 'char')) { this.stop('lose', '=== TEAM WIPED ==='); return 'lose' }
    if (!this.s.currentWaveEnemies().length) {
      if (this.s.wave >= this.s.waveCount) { this.stop('win', '=== ALL ENEMIES DEFEATED ==='); return 'win' }
      this.advanceWave()
    }
    if (this.s.avElapsed >= this.totalBudget()) { this.stop('timeout', '=== CYCLES EXPIRED ==='); return 'timeout' }
    return 'ok'
  }

  /** one place where a run ends, so BATTLE_END carries the full final tally (§29/§38) */
  private stop(reason: 'win' | 'lose' | 'timeout' | 'guard', line: string): void {
    this.s.log(line)
    this.s.endReason = reason
    // §61: an encounter that declares victory/defeat conditions resolves them as explicit events.
    // Plain setups declare neither, so no event fires and their traces stay unchanged (golden-safe).
    const rules = this.s.rules
    if (rules && (rules.victoryCondition || rules.defeatCondition)) {
      const victory = reason === 'win'
      if (victory && rules.victoryCondition) {
        this.s.logger.emit({ type: 'OBJECTIVE_COMPLETE', payload: { objective: rules.victoryCondition, mode: rules.mode, stageId: rules.stageId, wave: this.s.wave } })
      }
      this.s.logger.emit({ type: victory ? 'ENCOUNTER_VICTORY' : 'ENCOUNTER_DEFEAT', payload: { mode: rules.mode, stageId: rules.stageId, result: reason, wave: this.s.wave, cycle: this.s.cycle } })
    }
    const dead = this.s.units().filter(u => u.dead).map(u => u.name)
    this.s.logger.emit({
      type: 'BATTLE_END',
      payload: {
        result: reason, time: this.s.avElapsed, wave: this.s.wave, cycle: this.s.cycle,
        turns: this.s.logger.turn, sp: this.s.sp(), punchline: this.s.punchline,
        rolls: this.s.rollCount, dead,
        totalDamage: Math.round([...this.s.ownerDamage.values()].reduce((a, b) => a + b, 0)),
      },
    })
    // Release the shared DamageCalculator consumer: it holds a strong ref to this logger (and thus
    // every event), and nothing else ever detaches it. Without this, a multi-battle driver
    // (verification, sweeps) accumulates one logger per battle until the heap dies.
    this.s.logger.dispose()
  }

  loop(): void {
    let guard = 0
    for (;;) {
      const why = this.prologueCheck(++guard)
      if (why !== 'ok') break
      const alive = this.s.roster.filter(u => !u.dead)

      const next = this.s.queue.next(alive)!
      const delta = this.s.queue.advanceTime(alive, next)
      this.s.avElapsed += delta
      this.syncCycle()
      // Aha takes action on his own timeline; his SPD follows the team's Elation chars in real time
      if (this.s.aha && !this.s.aha.dead) this.s.ahaSync(this.s.aha)
      // before `next.av = 0`: payload.av is the AV the unit actually waited, i.e. `delta`
      this.s.logger.emit({ type: 'ACTION_SCHEDULED', target: next.name, targetId: next.id, payload: { kind: next.kind, side: next.side, av: Number(next.av.toFixed(3)), time: this.s.avElapsed, waited: Number(delta.toFixed(3)) } })
      next.av = 0
      this.s.takeTurn(next)
    }
  }

  /** manual-mode twin of loop(): inserts an out-of-turn ult window before every unit's turn */
  private async loopI(): Promise<void> {
    let guard = 0
    for (;;) {
      const why = this.prologueCheck(++guard)
      if (why !== 'ok') break
      const alive = this.s.roster.filter(u => !u.dead)

      // drain deferred immediate turns first: they were granted av=0, so they act
      // before the next timeline slot (manual-mode Bronya E)
      const deferred = [...this.s.pendingImmediate].map(id => this.s.roster.find(u => u.id === id)).filter((u): u is Unit => !!u && !u.dead)
      this.s.pendingImmediate.clear()
      for (const d of deferred) {
        await this.s.outOfTurnUlts(deferred, d)
        await this.s.takeTurnI(d)
        if (this.s.roster.some(u => !u.dead && u.side === 'enemy') === false) break
      }
      if (deferred.length) continue

      const next = this.s.queue.next(alive)!
      const delta = this.s.queue.advanceTime(alive, next)
      this.s.avElapsed += delta
      this.syncCycle()
      if (this.s.aha && !this.s.aha.dead) this.s.ahaSync(this.s.aha)
      // before `next.av = 0`: payload.av is the AV the unit actually waited, i.e. `delta`
      this.s.logger.emit({ type: 'ACTION_SCHEDULED', target: next.name, targetId: next.id, payload: { kind: next.kind, side: next.side, av: Number(next.av.toFixed(3)), time: this.s.avElapsed, waited: Number(delta.toFixed(3)) } })
      next.av = 0

      await this.s.outOfTurnUlts(alive, next)
      await this.s.takeTurnI(next)
    }
  }

  /** cycle boundary: MoC first cycle 150 AV, subsequent 100 AV (per wave). Shared by both loops so
   *  interactive mode emits the same CYCLE_END/CYCLE_START pair the auto loop does. */
  private syncCycle(): void {
    const cyc = timelineCycleIndexOf(this.s.avElapsed)
    if (cyc <= this.s.cycle) return
    this.s.logger.emit({ type: 'CYCLE_END', payload: { cycle: this.s.cycle + 1, time: this.s.avElapsed } })
    this.s.fireCycle('end', this.s.cycle)
    this.s.cycle = cyc
    this.s.log(`=== CYCLE ${this.s.cycle + 1} ===`)
    this.s.fireCycle('start', this.s.cycle)
    this.s.logger.emit({ type: 'CYCLE_START', payload: { cycle: this.s.cycle + 1, time: this.s.avElapsed } })
  }
}
