import { t } from '../../suites'
import { executeEnemyAbility, enemyBehavior, chooseEnemyAction } from '../../../src/core/enemy'
import type { EnemyAbilityDefinition } from '../../../src/core/enemy'
import type { SimApi } from '../../../src/core/kit'
import type { Unit } from '../../../src/core/entities/Unit'

/** §85 — ally-directed support negatives and real state gates.
 *
 *  Positives for these kits are pinned elsewhere (`profile-elites.ts` Antimatter Engine, `ops.ts`
 *  advance, `phase.ts` / `profile-savage-god.ts` phase machines). This suite pins what must NOT
 *  happen: an `alliesOther` effect never reaches its own actor, and a real boss/mob `require` gate
 *  withholds its gated ability until the state exists. Driven through the exported
 *  `executeEnemyAbility` / `chooseEnemyAction` on the production behaviours — deterministic, no
 *  battle, and complementary to the synthetic gates in `negative-order.ts`. */

const ability = (enemy: string, id: string): EnemyAbilityDefinition => {
  const a = enemyBehavior(enemy)?.abilities.find(x => x.id === id)
  if (!a) throw new Error(`missing ability ${enemy}/${id}`)
  return a
}

/** minimal stub: records `advance` targets and stores buffs, so recipient resolution is observable */
function harness() {
  const advanced: string[] = []
  const units: Unit[] = []
  const mk = (id: string): Unit => {
    const u = { id, name: id, side: 'enemy', kind: 'enemy', dead: false, buffs: [] } as unknown as Unit
    units.push(u)
    return u
  }
  const sim = {
    allies: (side: string) => units.filter(u => u.side === side && !u.dead),
    advance: (u: Unit) => { advanced.push(u.id) },
    addBuff: (u: Unit, b: { id: string }) => { u.buffs.push(b as never) },
    log: () => {},
    logger: { emit: () => {} },
  } as unknown as SimApi
  return { sim, mk, advanced }
}

const stub = (buffs: { id: string }[] = []): Unit => ({ id: 'e', name: 'e', buffs } as unknown as Unit)

export default () => {
  const cases = []

  // ---- advance {to:'alliesOther'}: the actor is excluded (real mob ability) --------------------
  cases.push((() => {
    const h = harness(); const a = h.mk('A'); h.mk('B')
    executeEnemyAbility(h.sim, a, ability("Dreamjolt Troupe's Winder Goon", 'winder_alarm'), [])
    return t.ok('alliesOther(advance): every OTHER living ally advances, never the actor',
      h.advanced.length === 1 && h.advanced[0] === 'B', h.advanced.join(','))
  })())

  // ---- buff {to:'alliesOther'}: the actor is excluded (real boss ability) ----------------------
  cases.push((() => {
    const h = harness(); const a = h.mk('A'); const b = h.mk('B')
    executeEnemyAbility(h.sim, a, ability('Doomsday Beast', 'doomsday_boost'), [])
    const self = a.buffs.some(x => (x as unknown as { id: string }).id === 'doomsday_enhanced')
    const other = b.buffs.some(x => (x as unknown as { id: string }).id === 'doomsday_enhanced')
    return t.ok('alliesOther(buff): the buff lands on the ally and never on the caster',
      !self && other, `self=${self} other=${other}`)
  })())

  // ---- boundary contrast: a default (no-`to`) buff DOES reach the actor ------------------------
  cases.push((() => {
    const h = harness(); const a = h.mk('A'); h.mk('B')
    executeEnemyAbility(h.sim, a, ability('Daybreak Squadron: Azurewing', 'daybreak_will'), [])
    const self = a.buffs.some(x => (x as unknown as { id: string }).id === 'daybreak_forcefield')
    return t.ok('default target (self): a no-`to` buff reaches the actor', self, `self=${self}`)
  })())

  // ---- solo actor: an alliesOther effect is a no-op, never self-applied -------------------------
  cases.push((() => {
    const h = harness(); const a = h.mk('A')
    executeEnemyAbility(h.sim, a, ability("Dreamjolt Troupe's Winder Goon", 'winder_alarm'), [])
    return t.ok('alliesOther solo: with no other ally nothing is advanced (no self-advance)',
      h.advanced.length === 0, h.advanced.join(','))
  })())

  // ---- real boss require gate: Forcefield rotation (Daybreak Squadron) -------------------------
  const beh = enemyBehavior('Daybreak Squadron: Azurewing')!
  const ff = ((beh.abilities.find(x => x.id === 'daybreak_will')!.effects[0] as unknown as { buff: { id: string } }).buff).id
  const pickNoFF: string | undefined = chooseEnemyAction({} as never, stub(), 1, beh)?.ability.id
  const pickFF: string | undefined = chooseEnemyAction({} as never, stub([{ id: ff }]), 1, beh)?.ability.id
  cases.push(t.ok(`require(buff:${ff}): the Forcefield-gated ability is withheld until the field exists`,
    String(pickNoFF) === 'daybreak_will' && String(pickNoFF) !== 'daybreak_shadow_dance', String(pickNoFF)))
  cases.push(t.ok('require(noBuff): once the Forcefield is up the ungated opener is withheld',
    String(pickFF) === 'daybreak_shadow_dance' && String(pickFF) !== 'daybreak_will', String(pickFF)))

  // ---- second real state gate: the Moon Rage rotation (Sableclaw Wolftrooper) -----------------
  const wolf = enemyBehavior('Sableclaw Wolftrooper')!
  const mr = wolf.abilities.find(x => x.id === 'wolf_massacre_rage')!.require!.buff!
  const wolfNo = chooseEnemyAction({} as never, stub(), 1, wolf)?.ability.id
  const wolfYes = chooseEnemyAction({} as never, stub([{ id: mr }]), 1, wolf)?.ability.id
  cases.push(t.ok('require(Moon Rage): the rage-only attack is withheld outside the state',
    wolfNo === 'wolf_massacre' && wolfYes === 'wolf_massacre_rage', `${wolfNo}/${wolfYes}`))

  return cases
}
