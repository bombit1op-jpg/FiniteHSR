/**
 * Equipment coverage registry (guide §19.2 "Generation", §19.3 light cones, §34.1/§34.2).
 *
 * Makes equipment coverage MEASURABLE instead of implied. Every light cone and every relic /
 * planar set is classified so the mandatory gate can never silently skip one:
 *
 *   verified   — every declared effect is asserted: stat-level `mods`/`cond` by the generic
 *                sweep in `tests/golden/gear/coverage.ts`, or a declared hook by a dedicated
 *                behavioural test listed in `CONE_HOOK_TESTS` / `SET_TESTS`.
 *   partial    — stat-level effects asserted, but a declared hook is not yet behaviourally
 *                asserted (`open` lists it). The majority: 151/169 cones carry hooks.
 *   unverified — nothing beyond presence in the dataset (must stay empty; a non-empty list is a
 *                real gap the report names).
 *   blocked    — the effect needs a mechanic the harness lacks (documented in the *_BLOCKED maps).
 *
 * The maps below are the only hand-maintained part (which item has a dedicated behaviour test /
 * why one is blocked); everything else is derived from the dataset shape, so it cannot rot.
 */
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS } from '../core/gear'

export type GearStatus = 'verified' | 'partial' | 'unverified' | 'blocked'
export type GearKind = 'cone' | 'relic' | 'planar'

export interface GearEntry {
  id: string
  kind: GearKind
  status: GearStatus
  /** what the gate actually asserts today */
  covered: string[]
  /** declared but not behaviourally asserted (the visible gap) */
  open: string[]
}

const CONE_HOOKS = [
  'onStart', 'onAfterSkill', 'onAfterUlt', 'onKill', 'onUnitDeath', 'onAfterBreak', 'onTurnStart',
  'onTurnEnd', 'onAfterAttack', 'hitMods', 'onHitTaken', 'onAllyHit', 'onAllyHpLoss', 'onAllyHeal',
  'onAllyAttack', 'onShieldProvide', 'onSpSpend', 'onCrit', 'onNonCrit', 'onDoTTick',
  'onEnemyTurnStart', 'onWaveStart', 'onWaveEnd', 'onCycleStart', 'onCycleEnd', 'onDebuffInflict',
  'onWeaknessApply', 'onElationSkill', 'onAhaInstant', 'onTurnSpHigh', 'onMemospriteSummon', 'onMemospriteTurnStart',
  'onMemospriteDisappear',
] as const
const RELIC_HOOKS = [
  'onStart', 'onTurnStart', 'onHitTaken', 'onAllyAbility', 'onAllyHeal', 'onDefRedInflict',
  'onDebuffInflict', 'onElationSkill', 'onAfterSkill', 'onAfterUlt', 'onKill', 'onAfterBreak',
  'onAfterAttack', 'onAllyAttack', 'hitMods', 'postMods', 'shieldMult2', 'shieldMult4',
] as const
const PLANAR_HOOKS = ['postMods', 'onStart', 'onKill', 'onAllyKill', 'onAfterAttack', 'hitMods', 'onSpSpend'] as const

const has = (o: object, k: string): boolean => (o as Record<string, unknown>)[k] !== undefined

/** cones whose declared hooks a dedicated behavioural test asserts (hooks: [] = stat/cond only) */
export const CONE_HOOK_TESTS: Record<string, { test: string; hooks: string[] }> = {
  swordplay: { test: 'cone-passive: per-target stacks (cap 5) + SI doubling', hooks: ['onAfterAttack'] },
  in_the_night: { test: 'cone-passive: spd≥120 condition gate', hooks: [] },
  showtime: { test: 'cone-hooks: onDebuffInflict stacking Trick DMG (cap 3)', hooks: ['onDebuffInflict'] },
  secret_vow: { test: 'cone-hooks: hitMods DMG% when target HP ratio exceeds the wearer\'s (was deltas base-ATK fold)', hooks: ['hitMods'] },
  bbibo: { test: 'cone-hooks: next-ally DMG buff + odd-ult SP refund + SI scaling', hooks: ['onStart', 'onAfterSkill', 'onAfterUlt'] },
  meshing_cogs: { test: 'cone-hooks: +energy on first attack or hit each turn', hooks: ['onTurnStart', 'onAfterAttack', 'onHitTaken'] },
  carve_moon: { test: 'cone-hooks: party rotation at start + each turn, cleared on death', hooks: ['onStart', 'onTurnStart', 'onUnitDeath'] },
  dazzled: { test: 'cone-hooks: maxSp per Elation ally, DEF-ignore per SP spent, repaid on death', hooks: ['onStart', 'onSpSpend', 'onUnitDeath'] },
  long_rainbows: { test: 'cone-hooks: ally-HP drain into pool, memosprite Additional DMG + vuln', hooks: ['onStart', 'onAfterAttack', 'onAllyAttack'] },
  never_forget_her_flame: { test: 'cone-hooks: Break buff self+best-BE ally, weakness SP refund, flag resets', hooks: ['onStart', 'onWeaknessApply', 'onTurnStart', 'onAfterUlt'] },
  unreachable: { test: 'cone-hooks: DMG buff on hit taken / own HP loss, cleared after attack', hooks: ['onHitTaken', 'onAllyHpLoss', 'onAfterAttack'] },
  sneering: { test: 'cone-hooks: Elation buff on Aha Instant start, expires at Aha turn end', hooks: ['onAhaInstant'] },
  cornucopia: { test: 'cone-mods: OHB counted only for Skill/Ult heals (whenAbility gate)', hooks: [] },
  ninja_record: { test: 'cone-hooks: HP change grants CRIT DMG, once per turn', hooks: ['onTurnStart', 'onAllyHpLoss', 'onAllyHeal'] },
  my_own_sword: { test: 'cone-hooks: Eclipse stacks on ally HP loss, DEF-ignore at 3, cleared after attack', hooks: ['onAllyHpLoss', 'hitMods', 'onAfterAttack'] },
  sweat_now: { test: 'cone-hooks: Come Train! DMG while a memosprite is on field, dropped otherwise', hooks: ['onStart', 'onMemospriteSummon', 'onMemospriteDisappear', 'onTurnStart'] },
  farewells: { test: 'cone-hooks: Death Flower on wearer-owned HP loss, ult clears advance flag, one advance when memosprite leaves', hooks: ['onAllyHpLoss', 'onAfterUlt', 'onTurnStart'] },
  arrows: { test: 'cone-hooks: onStart CRIT Rate buff, SI-scaled', hooks: ['onStart'] },
  void: { test: 'cone-hooks: onStart Effect Hit Rate buff, SI-scaled', hooks: ['onStart'] },
  chorus: { test: 'cone-hooks: onStart ATK% to each char ally, SI-scaled', hooks: ['onStart'] },
  fine_fruit: { test: 'cone-hooks: onStart flat energy to each char ally, SI-scaled', hooks: ['onStart'] },
  poised_bloom: { test: 'cone-hooks: onStart CRIT DMG to chars sharing a Path, SI-scaled', hooks: ['onStart'] },
  shadowed_night: { test: 'cone-hooks: onStart + onAfterBreak SPD% buffs, SI-scaled', hooks: ['onStart', 'onAfterBreak'] },
  pioneering: { test: 'cone-hooks: onAfterBreak heals the wearer by an SI-scaled max-HP fraction', hooks: ['onAfterBreak'] },
  i_am_as_you_behold: { test: 'cone-hooks: onStart party CRIT DMG buff, SI-scaled', hooks: ['onStart'] },
  passing_shore: { test: 'cone-hooks: hitMods flat DMG bonus, SI-scaled', hooks: ['hitMods'] },
  gnsw: { test: 'cone-hooks: hitMods DMG% scales with target debuff count (cap 3), SI-scaled', hooks: ['hitMods'] },
  shattered_home: { test: 'cone-hooks: hitMods bonus only vs targets above 50% HP, SI-scaled', hooks: ['hitMods'] },
  loop: { test: 'cone-hooks: hitMods bonus vs SPD-reduced targets, SI-scaled', hooks: ['hitMods'] },
  morrow: { test: 'cone-hooks: hitMods bonus while an ally is at 50%+ HP', hooks: ['hitMods'] },
  great_cosmic: { test: 'cone-hooks: hitMods DMG% by target weakness count (cap 7), SI-scaled', hooks: ['hitMods'] },
  darting_arrow: { test: 'cone-hooks: onKill ATK% buff, SI-scaled', hooks: ['onKill'] },
  adversarial: { test: 'cone-hooks: onKill SPD% buff, SI-scaled', hooks: ['onKill'] },
  solitary_healing: { test: 'cone-hooks: onAfterUlt DoT DMG buff, onKill flat energy (rounded)', hooks: ['onAfterUlt', 'onKill'] },
  something_irreplaceable: { test: 'cone-hooks: onKill/onHitTaken heal + DMG% buff, once per battleTurn', hooks: ['onKill', 'onHitTaken'] },
  moment_victory: { test: 'cone-hooks: onHitTaken DEF% buff, SI-scaled', hooks: ['onHitTaken'] },
  texture_memories: { test: 'cone-hooks: onHitTaken shield+CD / mitigation-while-shielded gate', hooks: ['onHitTaken'] },
  defense: { test: 'cone-hooks: onAfterUlt heal, SI-scaled', hooks: ['onAfterUlt'] },
  indelible_promise: { test: 'cone-hooks: onAfterUlt CRIT Rate buff, SI-scaled', hooks: ['onAfterUlt'] },
  genius_greeting: { test: 'cone-hooks: onAfterUlt Basic DMG buff, SI-scaled', hooks: ['onAfterUlt'] },
  charmony_fall: { test: 'cone-hooks: onAfterUlt SPD% buff, SI-scaled', hooks: ['onAfterUlt'] },
  dance_sunset: { test: 'cone-hooks: onAfterUlt FUA buff, 2-stack cap, SI-scaled', hooks: ['onAfterUlt'] },
  unreachable_veil: { test: 'cone-hooks: onAfterUlt Skill/Ult buff + SP at maxEnergy>=140', hooks: ['onAfterUlt'] },
  thankless_coronation: { test: 'cone-hooks: onAfterUlt ATK% + doubling/energy at maxEnergy>=300', hooks: ['onAfterUlt'] },
  for_tomorrow_journey: { test: 'cone-hooks: onAfterUlt DMG% buff, SI-scaled', hooks: ['onAfterUlt'] },
  tomorrow_together: { test: 'cone-hooks: onAfterUlt Elation buff to each char ally, SI-scaled', hooks: ['onAfterUlt'] },
  curtain_never: { test: 'cone-hooks: onAfterSkill DMG buff to each char ally, SI-scaled', hooks: ['onAfterSkill'] },
  hey_over_here: { test: 'cone-hooks: onAfterSkill outgoing-heal buff, SI-scaled', hooks: ['onAfterSkill'] },
  forever_victual: { test: 'cone-hooks: onAfterSkill stacking ATK% buff (cap 3), SI-scaled', hooks: ['onAfterSkill'] },
  scent_alone: { test: 'cone-hooks: onAfterUlt enemy vulnerability, BE-gated bonus', hooks: ['onAfterUlt'] },
  past_self_mirror: { test: 'cone-hooks: onStart party energy + onAfterUlt party DMG%, SI-scaled', hooks: ['onStart', 'onAfterUlt'] },
  tutorial_before: { test: 'cone-hooks: onAfterAttack flat energy vs DEF-reduced target, SI-scaled', hooks: ['onAfterAttack'] },
  cosmos_fell: { test: 'cone-hooks: onAfterAttack CRIT DMG buff vs ≥2 element-weak enemies, SI-scaled', hooks: ['onAfterAttack'] },
  multiplication: { test: 'cone-hooks: onAfterAttack advance after Basic, SI-scaled', hooks: ['onAfterAttack'] },
  race_horizon: { test: 'cone-hooks: onAfterAttack CRIT DMG buff after FUA (cap 10), SI-scaled', hooks: ['onAfterAttack'] },
  brighter_sun: { test: 'cone-hooks: onAfterAttack ATK%+ERR buff after Basic (cap 2), SI-scaled', hooks: ['onAfterAttack'] },
  many_springs: { test: 'cone-hooks: onAfterAttack target vulnerability, DoT-gated bonus, SI-scaled', hooks: ['onAfterAttack'] },
  eternal_calculus: { test: 'cone-hooks: onAfterAttack ATK% per enemy (cap 5) + SPD at ≥3, re-stack', hooks: ['onAfterAttack'] },
  mutual_demise: { test: 'cone-hooks: hitMods CRIT Rate below 80% HP, SI-scaled', hooks: ['hitMods'] },
  destiny_threads: { test: 'cone-hooks: hitMods DMG% per 100 DEF, capped 32%', hooks: ['hitMods'] },
  concert_two: { test: 'cone-hooks: hitMods DMG% per on-field shielded ally, SI-scaled', hooks: ['hitMods'] },
  boundless_choreo: { test: 'cone-hooks: hitMods CRIT DMG vs slowed/DEF-reduced/Imprisoned target, SI-scaled', hooks: ['hitMods'] },
  sailing_second_life: { test: 'cone-hooks: hitMods DEF ignore only on Break, SI-scaled', hooks: ['hitMods'] },
  qpq: { test: 'cone-hooks: onTurnStart flat energy to lowest-energy ally below 50%, SI-scaled', hooks: ['onTurnStart'] },
  aeon: { test: 'cone-hooks: onAfterAttack stacking ATK% (cap 4) + onAfterBreak DMG% buff, SI-scaled', hooks: ['onAfterAttack', 'onAfterBreak'] },
  amber: { test: 'cone-hooks: onAllyHpLoss below 50% adds DEF% buff; onAllyHeal removes it', hooks: ['onAllyHpLoss', 'onAllyHeal'] },
  flames_afar: { test: 'cone-hooks: onTurnStart reset + onAllyHpLoss heal/DMG% after ≥25% MaxHP loss (3-turn CD)', hooks: ['onTurnStart', 'onAllyHpLoss'] },
  life_flames: { test: 'cone-hooks: onTurnStart flat energy + onAfterAttack target DEF-reduction', hooks: ['onTurnStart', 'onAfterAttack'] },
  reforged_hellfire: { test: 'cone-hooks: onAfterSkill Purgatory + onTurnStart energy + hitMods CRIT-DMG-taken', hooks: ['onTurnStart', 'onAfterSkill', 'hitMods'] },
  star_lights_night: { test: 'cone-hooks: onAfterSkill energy+Sail; hitMods Ult boost at 3 stacks', hooks: ['hitMods', 'onAfterSkill'] },
  ninjutsu_inscription: { test: 'cone-hooks: onStart energy + onAfterUlt Raiton + 2-Basic advance', hooks: ['onStart', 'onAfterUlt', 'onAfterAttack'] },
  yet_hope_priceless: { test: 'cone-hooks: onStart/Basic DEF-ignore buff + hitMods FUA boost by CRIT DMG stacks', hooks: ['hitMods', 'onStart', 'onAfterAttack'] },
  dream_montage: { test: 'cone-hooks: onAfterAttack energy vs broken target (cap 2/turn) + onTurnStart reset', hooks: ['onAfterAttack', 'onTurnStart'] },
  incessant_rain: { test: 'cone-hooks: hitMods CRIT Rate at ≥3 debuffs + onAfterAttack Aether Code vulnerability', hooks: ['hitMods', 'onAfterAttack'] },
  before_dawn: { test: 'cone-hooks: onAfterSkill/onAfterUlt stacking Somnus FUA boost (cap 3)', hooks: ['onAfterSkill', 'onAfterUlt'] },
  whereabouts: { test: 'cone-hooks: onAfterBreak Routed (vulnerability + SPD down) on target', hooks: ['onAfterBreak'] },
  cruising: { test: 'cone-hooks: onKill ATK% buff', hooks: ['onKill'] },
  resolution: { test: 'cone-hooks: onAfterAttack Ensnared vs un-Ensnared living enemy only', hooks: ['onAfterAttack'] },
  ddd: { test: 'cone-hooks: onAfterUlt advances every living character on both sides', hooks: ['onAfterUlt'] },
  fermata: { test: 'cone-hooks: hitMods DMG bonus only vs Shock/WindShear targets', hooks: ['hitMods'] },
  day_one: { test: 'cone-hooks: onStart RES-mitigation to living ally characters', hooks: ['onStart'] },
  patience: { test: 'cone-hooks: onAfterAttack self SPD% stack (cap 3) + Erode Shock DoT', hooks: ['onAfterAttack'] },
  post_op: { test: 'cone-hooks: onAfterUlt OutHeal buff', hooks: ['onAfterUlt'] },
  only_silence: { test: 'cone-hooks: hitMods CRIT Rate while ≤2 enemies alive', hooks: ['hitMods'] },
  genius_repose: { test: 'cone-hooks: onKill CRIT DMG buff', hooks: ['onKill'] },
  wildfire: { test: 'cone-hooks: onStart mitigation + MaxHP-fraction heal to ally characters', hooks: ['onStart'] },
  perfect_timing: { test: 'cone-hooks: onStart OutHeal derived from effRes, capped', hooks: ['onStart'] },
  subscribe: { test: 'cone-hooks: hitMods Basic/Skill boost, doubled at full Energy', hooks: ['hitMods'] },
  night_of_fright: { test: 'cone-hooks: onAfterUlt ATK% buff on the lowest-HP-ratio ally (cap 5 stacks)', hooks: ['onAfterUlt'] },
  earthly_escapade: { test: 'cone-hooks: onAfterUlt Mask (CRIT DMG+Rate) to the highest-CRIT-DMG ally', hooks: ['onAfterUlt'] },
  planetary: { test: 'cone-hooks: onStart DMG% to same-element allies excluding the wearer', hooks: ['onStart'] },
  though_worlds_apart: { test: 'cone-hooks: onAfterUlt heals ally chars (lowest doubled) + Redoubt DMG%, extra for summon owner', hooks: ['onAfterUlt'] },
  shut_her_eyes: { test: 'cone-hooks: onAllyHpLoss per-ally tracking + party DMG% on wearer loss; onWaveStart heal of tracked loss', hooks: ['onAllyHpLoss', 'onWaveStart'] },
  unjust_destiny: { test: 'cone-hooks: onShieldProvide CRIT DMG buff + onAfterAttack FUA Unfair Advantage', hooks: ['onShieldProvide', 'onAfterAttack'] },
  time_woven_gold: { test: 'cone-hooks: hitMods Basic boost at 6 Brocade stacks + onAllyAttack Brocade stacking (cap 6)', hooks: ['hitMods', 'onAllyAttack'] },
  in_the_name: { test: 'cone-hooks: hitMods vs DoT/debuffed target + onSpSpend EHR buff + onAfterSkill ATK%', hooks: ['hitMods', 'onSpSpend', 'onAfterSkill'] },
  worrisome: { test: 'cone-hooks: onAfterAttack FUA applies Tame CRIT-DMG-taken', hooks: ['onAfterAttack'] },
  reforged: { test: 'cone-hooks: onAfterAttack unique DoT kinds into a stacking ATK% buff (cap 4)', hooks: ['onAfterAttack'] },
  if_time: { test: 'cone-hooks: onStart energy+Presage + onAfterAttack FUA energy+Presage to ally chars', hooks: ['onStart', 'onAfterAttack'] },
  flame_blood: { test: 'cone-hooks: hitMods Skill/Ult DMG%, doubled when MaxHP consumption exceeds 500', hooks: ['hitMods'] },
  lies_breeze: { test: 'cone-hooks: onAfterAttack Bamboozle on all enemies + Theft when SPD ≥ 170', hooks: ['onAfterAttack'] },
  thus_burns: { test: 'cone-hooks: onAfterUlt Blazing Sun DMG% + onTurnStart removes it', hooks: ['onAfterUlt', 'onTurnStart'] },
  milkyway: { test: 'cone-hooks: onAfterAttack living-enemy ATK% (cap 5) + onAfterBreak DMG%', hooks: ['onAfterAttack', 'onAfterBreak'] },
  echo_coffin: { test: 'cone-hooks: onAfterAttack Energy per new enemy hit (once per turn) + onAfterUlt SPD', hooks: ['onAfterAttack', 'onAfterUlt'] },
  epoch_etched: { test: 'cone-hooks: onAfterSkill Skill-DMG buff on ally char target + onAfterUlt +1 SP', hooks: ['onAfterSkill', 'onAfterUlt'] },
  long_road: { test: 'cone-hooks: onAfterBreak Charring vulnerability (cap 2)', hooks: ['onAfterBreak'] },
  what_is_real: { test: 'cone-hooks: onAfterAttack (Basic) self-heal 2% MaxHP + 800', hooks: ['onAfterAttack'] },
  past_future: { test: 'cone-hooks: onAfterSkill DMG% to next ally char by lowest AV', hooks: ['onAfterSkill'] },
  sleep_like_dead: { test: 'cone-hooks: onNonCrit CRIT Rate buff', hooks: ['onNonCrit'] },
  time_waits: { test: 'cone-hooks: heal tally + onAllyAttack Additional DMG once per battle turn', hooks: ['onAllyHeal', 'onAllyAttack'] },
  victory_blink: { test: 'cone-hooks: wearer-owned summon heal → party DMG% buff', hooks: ['onAllyHeal'] },
  today_good_luck: { test: 'cone-hooks: onElationSkill stacking Elation buff (cap 2)', hooks: ['onElationSkill'] },
  passkey: { test: 'cone-hooks: onAfterSkill grants Energy', hooks: ['onAfterSkill'] },
  hidden_shadow: { test: 'cone-hooks: onAfterSkill primes mult; next Basic consumes it for Additional DMG', hooks: ['onAfterSkill', 'onAfterAttack'] },
  mediation: { test: 'cone-hooks: onStart SPD to ally chars only', hooks: ['onStart'] },
  sagacity: { test: 'cone-hooks: onAfterUlt ATK% buff', hooks: ['onAfterUlt'] },
  shadowburn: { test: 'cone-hooks: first memosprite summon → +1 SP + Energy', hooks: ['onMemospriteSummon'] },
  reminiscence: { test: 'cone-hooks: memosprite turn start Commemoration on wearer + owned summon; disappear removes', hooks: ['onMemospriteTurnStart', 'onMemospriteDisappear'] },
  lingering_tear: { test: 'cone-hooks: hitMods CRIT DMG gated on Punchline pool ≥ 10', hooks: ['hitMods'] },
  memories_past: { test: 'cone-hooks: onAfterAttack (Basic) grants Energy', hooks: ['onAfterAttack'] },
  moles: { test: 'cone-hooks: onAfterAttack Basic/Skill/Ult stacking ATK% (cap 3)', hooks: ['onAfterAttack'] },
  birth_self: { test: 'cone-hooks: hitMods FUA DMG% vs target at ≤50% HP', hooks: ['hitMods'] },
  shared_feeling: { test: 'cone-hooks: onAfterSkill Energy to each ally char', hooks: ['onAfterSkill'] },
  clamor: { test: 'cone-hooks: onStart grants Energy', hooks: ['onStart'] },
  blue_sky: { test: 'cone-hooks: onKill CRIT Rate buff', hooks: ['onKill'] },
  woof: { test: 'cone-hooks: hitMods DMG% vs Burn/Bleed targets', hooks: ['hitMods'] },
  breakfast: { test: 'cone-hooks: onKill stacking ATK% (cap 3)', hooks: ['onKill'] },
  warmth: { test: 'cone-hooks: onAfterAttack (Basic/Skill) heals ally chars 2% MaxHP', hooks: ['onAfterAttack'] },
  meet_again: { test: 'cone-hooks: onAfterAttack Additional DMG to a living enemy', hooks: ['onAfterAttack'] },
  this_is_me: { test: 'cone-hooks: hitMods Ult DMG% scaled by wearer DEF', hooks: ['hitMods'] },
  return_dark: { test: 'cone-hooks: onCrit 16% dispel one enemy buff, once per attack', hooks: ['onCrit'] },
  nowhere_run: { test: 'cone-hooks: onKill heal scaled by ATK', hooks: ['onKill'] },
  dreamville: { test: 'cone-hooks: onAfterAttack same-type ally DMG buff (replace on retype)', hooks: ['onAfterAttack'] },
  final_victor: { test: 'cone-hooks: onCrit stacking CD (cap 4); onTurnStart clears', hooks: ['onCrit', 'onTurnStart'] },
  story_page: { test: 'cone-hooks: onAllyAttack wearer-owned summon grants Outgoing Heal', hooks: ['onAllyAttack'] },
  mushy_shroomy: { test: 'cone-hooks: onElationSkill Elation-vulnerability to each enemy', hooks: ['onElationSkill'] },
  trend_universal_market: { test: 'cone-hooks: onHitTaken from enemy applies DEF-scaled Burn DoT', hooks: ['onHitTaken'] },
  fly_pink_tomorrow: { test: 'cone-hooks: TB(Remembrance)-gated party DMG% + Basic DMG%', hooks: ['onStart', 'hitMods'] },
  baptism_pure_thought: { test: 'cone-hooks: hitMods CD per target debuff (cap 3); FUA defIgnore w/ Disputation; onAfterUlt grants it', hooks: ['hitMods', 'onAfterUlt'] },
  flowing_nightglow: { test: 'cone-hooks: onAllyAttack Cantillation ER stacks; onAfterUlt Cadenza ATK% + party DMG%', hooks: ['onAllyAttack', 'onAfterUlt'] },
  venture_forth_hunt: { test: 'cone-hooks: FUA Luminflux stacks (cap 2) → Ult defIgnore; onTurnEnd −1', hooks: ['onAllyAttack', 'hitMods', 'onTurnEnd'] },
  hell_ideals_burn: { test: 'cone-hooks: onWaveStart SP-limit ATK% + onAfterSkill stacking ATK% (cap 4)', hooks: ['onWaveStart', 'onAfterSkill'] },
  ocean_sing: { test: 'cone-hooks: onDebuffInflict Enthrallment DoT-taken stacks; onAllyAttack SPD% vs Enthralled; onUnitDeath wearer-defeat clears Enthrallment', hooks: ['onDebuffInflict', 'onAllyAttack', 'onUnitDeath'] },
  evernight_stars: { test: 'cone-hooks: onStart enemy DEF-ignore + onMemospriteDisappear energy', hooks: ['onStart', 'onMemospriteDisappear'] },
  this_love_forever: { test: 'cone-hooks: summon heal→Blank / attack→Verse, ×1.6 when both', hooks: ['onAllyHeal', 'onAllyAttack'] },
  when_she_decided_to_see: { test: 'cone-hooks: onWaveStart party CRIT buff + energy; onAfterUlt re-apply on ally target', hooks: ['onWaveStart', 'onAfterUlt'] },
  finale_of_a_lie: { test: 'cone-hooks: onStart Umbra Devourer; every 4th wearer FUA re-applies', hooks: ['onStart', 'onAllyAttack'] },
  welcome_cosmic_city: { test: 'cone-hooks: hitMods Elation DEF-ignore; onAfterUlt adds Punchline', hooks: ['hitMods', 'onAfterUlt'] },
  until_flowers: { test: 'cone-hooks: mods CD + energyMax-scaled ERR; onElationSkill enemy vulnAll', hooks: ['onElationSkill'] },
  flickering_stars: { test: 'cone-hooks: onTurnSpHigh party DEF-ignore + wearer Skill DMG', hooks: ['onTurnSpHigh'] },
  rise_and_sing: { test: 'cone-hooks: onStart advance + party SPD%; onAfterUlt refund SP', hooks: ['onStart', 'onAfterUlt'] },
  summer_rides_surf: { test: 'cone-hooks: onWaveStart SP; Elation Skill Updraft/Uptrend, every 3rd SP', hooks: ['onWaveStart', 'onElationSkill'] },
  elation_brimming: { test: 'cone-hooks: onAfterSkill/onAfterUlt Elation% to ally char only', hooks: ['onAfterSkill', 'onAfterUlt'] },
  grounded_ascent: { test: 'cone-hooks: onAfterSkill Hymn on real ally target in battle + onStart/onAfterUlt grAsc counter', hooks: ['onStart', 'onAfterSkill', 'onAfterUlt'] },
}
/** cones whose effect needs a mechanic the harness lacks */
export const CONE_BLOCKED: Record<string, string> = {
}

/** relic / planar sets with a dedicated behaviour test (2pc delta, 4pc activation, planar cond) */
export const SET_TESTS: Record<string, string> = {
  musketeer: 'deltas/coverage: 2pc atkPct delta',
  sss: 'deltas/coverage: planar atkPct + spd≥120 cond delta',
  // relic 4pc hooks — golden/gear/set-hooks.ts
  passerby: 'set-hooks: onAllyAbility grants +1 SP per Skill',
  knight: 'set-hooks: 4pc shieldMult 0.20 (applySetCounts)',
  hunter_glacial: 'set-hooks: onAfterUlt +25% CRIT DMG for 2 turns',
  boxing: 'set-hooks: onAfterSkill +5% ATK/stack (cap 5)',
  guard: 'set-hooks: onAllyHeal heals 8% maxHP + 5 Energy when ≤50% HP',
  firesmith: 'set-hooks: onStart +12% Fire DMG then consumed',
  genius: "set-hooks: hitMods defIgnore 0.20 vs Quantum-weak else 0.10",
  sizzling: 'set-hooks: onAfterSkill +20% ATK for 1 turn then consumed',
  eagle: 'set-hooks: onAfterUlt advances wearer 25% only out-of-turn',
  thief: 'set-hooks: onAfterUlt +3 Energy',
  wastelander: 'set-hooks: hitMods critRate 0.10 vs debuffed + critDmg 0.20 vs Imprison',
  longevous: 'set-hooks: onAfterSkill/onHitTaken critRate 0.08, 2t, cap 2',
  messenger: 'set-hooks: onAfterUlt +12% party SPD when targeting an ally',
  grand_duke: 'set-hooks: onAfterAttack FUA +6% ATK (cap 8)',
  prisoner: 'set-hooks: hitMods defIgnore 6% per DoT (cap 3)',
  pioneer: 'set-hooks: hitMods +12% DMG vs debuffed, doubling via pioneerDouble',
  watchmaker: 'set-hooks: onAfterUlt +30% Break Effect to party on ally-target',
  sacerdos: 'set-hooks: onAfterSkill/onAfterUlt +18% CRIT DMG to single ally (cap 2)',
  scholar: 'set-hooks: onAfterSkill +25% Skill DMG',
  hero: 'set-hooks: onStart spdPct 0.06 + onAllyAttack critDmg 0.30',
  wavestrider: 'set-hooks: 2 Help stacks from onAllyAbility, consumed by onAfterUlt → +48% ATK',
  world_remaking: 'set-hooks: onStart hpPct 0.24 + onAfterSkill dmgAll 0.15 party',
  self_enshrouded: 'set-hooks: 4pc shieldMult2 0.10 + shieldMult4 0.12 (applySetCounts) = 0.22',
  diviner: 'set-hooks: onElationSkill elation 0.10 once/battle + postMods CRIT Rate @spd',
  smith: 'set-hooks: onDefRedInflict party dmgAll 0.15 + postMods no-op',
  navigator: 'set-hooks: Skill +/turn − stack 0.18→0.36→0.18, removed at 0',
  magical_girl: 'set-hooks: hitMods defIgnore 0.10 + 0.01/5 Punchline (cap 0.10)',
  poet: 'set-hooks: postMods CRIT Rate 0.32 @<95 spd / 0.20 @<110',
  warrior_goddess: 'set-hooks: onStart spdPct 0.06 + postMods critDmg 0.15',
  valorous: 'set-hooks: onAfterAttack FUA +36% Ult DMG',
  // planar hooks — golden/gear/set-hooks.ts
  fleet: 'set-hooks: onStart atkPct 0.08 @spd≥120',
  banana: 'set-hooks: onStart critDmg 0.32 for the summon',
  bone: 'set-hooks: postMods critDmg 0.28 @hp≥5000',
  giant_tree: 'set-hooks: postMods outHeal 0.20 @spd≥180 / 0.12 @spd≥135',
  arcadia: 'set-hooks: postMods dmgAll 0.12*(4−allies)',
  revelry: 'set-hooks: postMods boost:dot 0.24 @atk≥3600 / 0.12 @atk≥2400',
  amphoreus: 'set-hooks: onStart spdPct 0.08 to owner',
  punklorde: 'set-hooks: onElationSkill critDmg 0.32/0.20 latched by rt.punkTier',
  tengoku: 'set-hooks: postMods critDmg 0.32 @spThisTurn≥3',
  converging: 'set-hooks: onAfterAttack FUA atkPct 0.24 + onAllyKill critDmg 0.12',
  duran: 'set-hooks: postMods boost:fua 0.05*n (cap 5) + critDmg 0.25 at 5',
  kalpagni: 'set-hooks: hitMods be 0.40 vs Fire-weak target',
  fallen: 'set-hooks: postMods critDmg 0.32 when +another TBC teammate',
  cosmic: 'set-hooks: postMods dmgAll min(0.32, 0.002*(energyMax−200))',
  sigonia: 'set-hooks: onKill critDmg 0.04 (cap 10)',
  izumo: 'set-hooks: onStart critRate 0.12 with a same-path ally',
  broken_keel: 'set-hooks: postMods critDmg 0.10 @effRes≥0.30',
  vonwacq: 'set-hooks: onStart advance 0.40 @spd≥120',
  pan_cosmic: 'set-hooks: postMods atkPct min(0.25, 0.25*ehr)',
  celestial: 'set-hooks: postMods critRate 0.60 @effCritDmg≥1.20',
  penacony: 'set-hooks: onStart dmgAll 0.10 to same-element allies',
  lushaka: 'set-hooks: onStart atkPct 0.12 to the first lineup character',
  glamoth: 'set-hooks: onStart dmgAll 0.12 @spd≥160',
}
/** relic / planar sets whose effect needs a mechanic the harness lacks */
export const SET_BLOCKED: Record<string, string> = {}

export function coneEntry(c: (typeof LIGHT_CONES)[number]): GearEntry {
  const covered: string[] = ['base HP/ATK/DEF']
  if (c.mods) covered.push('unconditional mods')
  if (c.cond) covered.push(`cond ${c.cond.stat}`)
  const hooks = CONE_HOOKS.filter(k => has(c, k))
  if (CONE_BLOCKED[c.id]) return { id: c.id, kind: 'cone', status: 'blocked', covered, open: [CONE_BLOCKED[c.id]!] }
  const ev = CONE_HOOK_TESTS[c.id]
  if (ev) covered.push(ev.test)
  const openHooks = hooks.filter(h => !(ev?.hooks ?? []).includes(h))
  const status: GearStatus = openHooks.length
    ? 'partial'
    : (!c.mods && !c.cond && !hooks.length ? 'unverified' : 'verified')
  return { id: c.id, kind: 'cone', status, covered, open: openHooks }
}

export function relicEntry(s: (typeof RELIC_SETS)[number]): GearEntry {
  const covered: string[] = []
  if (s.twoPc.length) covered.push('2pc mods')
  if (s.fourPc?.length) covered.push('4pc mods')
  const hooks = RELIC_HOOKS.filter(k => has(s, k))
  const open: string[] = [...hooks]
  // a 4pc declared but with no mods and no hook is a stub, not a covered bonus
  if (s.fourPc && s.fourPc.length === 0 && !hooks.length) open.push('4pc declared but empty')
  if (SET_BLOCKED[s.id]) return { id: s.id, kind: 'relic', status: 'blocked', covered, open: [SET_BLOCKED[s.id]!] }
  if (SET_TESTS[s.id]) return { id: s.id, kind: 'relic', status: 'verified', covered: [...covered, SET_TESTS[s.id]!], open: [] }
  const status: GearStatus = open.length ? 'partial' : (!s.twoPc.length && !(s.fourPc?.length) ? 'unverified' : 'verified')
  return { id: s.id, kind: 'relic', status, covered, open }
}

export function planarEntry(p: (typeof PLANAR_SETS)[number]): GearEntry {
  const covered: string[] = []
  if (p.mods.length) covered.push('mods')
  if (p.cond) covered.push(`cond ${p.cond.stat}`)
  const hooks = PLANAR_HOOKS.filter(k => has(p, k))
  if (SET_BLOCKED[p.id]) return { id: p.id, kind: 'planar', status: 'blocked', covered, open: [SET_BLOCKED[p.id]!] }
  if (SET_TESTS[p.id]) return { id: p.id, kind: 'planar', status: 'verified', covered: [...covered, SET_TESTS[p.id]!], open: [] }
  const status: GearStatus = hooks.length ? 'partial' : (!p.mods.length && !p.cond ? 'unverified' : 'verified')
  return { id: p.id, kind: 'planar', status, covered, open: hooks }
}

/** the whole equipment registry, one entry per dataset item */
export function gearRegistry(): GearEntry[] {
  return [...LIGHT_CONES.map(coneEntry), ...RELIC_SETS.map(relicEntry), ...PLANAR_SETS.map(planarEntry)]
}

const tally = (entries: GearEntry[]): string => {
  const n = (s: GearStatus) => entries.filter(e => e.status === s).length
  return `${entries.length} [verified ${n('verified')} · partial ${n('partial')} · unverified ${n('unverified')} · blocked ${n('blocked')}]`
}

/** one-line-per-kind summary for the verification CLI, plus the explicit gap lists */
export function gearCoverageReport(entries: GearEntry[] = gearRegistry()): string {
  const byKind = (k: GearKind) => entries.filter(e => e.kind === k)
  const out = [
    `GEAR COVERAGE — cone ${tally(byKind('cone'))} · relic ${tally(byKind('relic'))} · planar ${tally(byKind('planar'))}`,
  ]
  for (const kind of ['cone', 'relic', 'planar'] as const) {
    const open = byKind(kind).filter(e => e.status === 'partial')
    if (open.length) out.push(`  ${kind} partial (declared effect not behaviourally asserted): ${open.length}`)
  }
  for (const e of entries.filter(x => x.status === 'unverified' || x.status === 'blocked'))
    out.push(`  [${e.status.toUpperCase()}] ${e.kind}/${e.id}: ${e.open.join('; ')}`)
  return out.join('\n')
}
