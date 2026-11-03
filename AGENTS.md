# AGENTS.md — FiniteHSR / Honkai: Star Rail Battle Simulator

## 0. Purpose

Этот файл — **инструкция для coding-agent**, а не полный справочник проекта.

Здесь находятся только правила, которые агент должен соблюдать почти в каждой задаче:
- source-of-truth и порядок чтения документов;
- архитектурные инварианты;
- критические соглашения текущего engine;
- правила работы с raw data;
- правила реализации персонажей / gear / команд;
- verification и debug workflow;
- запреты на опасные shortcuts;
- критерии завершения задачи.

Не дублируй здесь:
- полный список персонажей и их skillset;
- полный список Light Cones;
- историю старых фиксов;
- подробный roadmap;
- длинные debug-транскрипты;
- подробные примеры конкретных китов.

Для этого существуют отдельные документы.

---

## 0.1 UI reference — текущее состояние

UI сейчас — **одна страница**: роут `team` («Отряд»), настройка отряда. Страницы запуска боя,
дашборда, энкаунтера, анализа, сравнения, оптимизатора, верификации, каталога и deviations
удалены из шелла (коммит `993a3bf`). `src/ui/team.ts` сохранил только переиспользуемые виджеты
(`buildPieceEditors`, `pieceOf`, `toTeamSpec`, `collect`), а не рабочую страницу боя.

Каркас и маршрутизация:
- `src/main.ts` — entry: регистрирует enter-hook роута `team` и вызывает `initShell()`.
- `src/ui/shell.ts` — nav rail, hash-routing, version bar (engine/rules/dataset), status/busy surface.
  Список роутов — `ROUTES` (сейчас один: `team`).
- `index.html` — контейнеры `#navRail`, `#panel-team` → `#partyRoot`, `#statusBar`, `#versionBar`.

Страница «Отряд»:
- `src/ui/partyPanel.ts` — карточки слотов: персонаж (выбор — по клику на портрет/имя,
  select `.pcChar` монтируется и открывается классом `open`), конус + SI + уровень конуса,
  эйдолоны, уровни навыков, реликвии/плоские/сетовые, следы, стартовая энергия, претехника,
  превью финальных характеристик.
- `src/ui/partyStore.ts` — `PartyStore`: коллекция отрядов в `localStorage` (`FiniteHSR.parties`),
  зеркалится в `store.team` (`pushSlotsToStore` / `syncActiveToStore`).
- `src/core/party.ts` — чистая модель партии: `MAX_SLOTS = 4`, create/select/rename/delete/update.
- `src/ui/store.ts` — `TeamRowState` (состояние одного слота) и `techniquesForRows`
  (порядок активаций претехник).
- `src/ui/team.ts` — общие виджеты: `buildPieceEditors`, `pieceOf`, `toTeamSpec`, `collect`.
- `src/ui/icons.ts` + `src/ui/iconManifest.ts` — портреты и иконки из `public/portraits/`,
  `public/icons/`; манифест генерируется `src/core/gen-icon-manifest.ts`.
- `src/ui/dropdown.ts`, `src/ui/dom.ts`, `src/ui/render.ts`, `src/ui/settings.ts`,
  `src/ui/capabilities.ts` — инфраструктура UI.

Поток данных:

```text
PartyStore → store.team (TeamRowState[]) → toTeamSpec → TeamSpec → prepareBattle/setupSim
```

Финальные характеристики в превью берутся не из UI-математики, а из движка:
`src/core/charStats.ts:charFinalStats` (`prepareBattle` → `setupSim` → `eff(unit)`).

Правила работы с UI:
- UI не пересчитывает статы/урон сам: только читает движковые резолверы и пишет в store.
- Введённое значение ≠ фактическое: движок добавляет бонусы эйдолона (`resolveLevels`) и режет по
  капу (`LEVEL_CAPS`), поэтому превью и бой могут отличаться от показанных чисел.
- Превью характеристик уже включает конус, реликвии и следы (движковый setup-путь).
- Кнопки «запустить бой» нет и не добавляется без отдельного решения: страницы запуска удалены,
  `collect()`/`runBattle` живут только в core/CLI.

Покрытие: `tests/ui/*.ts` (`party.ts`, `store.ts`, `team-spec.ts`, `techniques.ts`).
`docs/gui/traceability.md` — историческая карта прежнего многостраничного UI, **не** источник истины.




## 1. Source of Truth

Используй источники в следующем порядке.

1. **Текущий запрос пользователя** — что именно требуется сейчас.
2. **Raw game data** — `hsr-data/data/*.json` для значений из датасета.
3. **Mechanics docs** — `docs/combat_mechanics/*.md` для правил конкретной механики.
4. **`TODO.md`** — текущий проверенный статус проекта и порядок работ.
5. **`AGENTS.md`** — инженерные правила и инварианты.
6. **Verification fixtures / tests** — ожидаемое поведение уже проверенных сценариев.
7. **Reference guide** — `reference/hsr_simulator_unified_guide.txt` для целевой архитектуры,
   verification, debug и неочевидных классов механик.
8. **Architecture/reference files** — `reference/hsr_simulator_structure.txt`,
   `reference/hsr_log_format.txt`.
9. **Внешние реализации** (`reference/hsr-optimizer-main`, Fribbels и т.п.) — только
   cross-check, никогда не считать их автоматически каноном.

Если источники конфликтуют:
- не угадывай;
- найди конкретное правило и конкретный код;
- проверь существующие тесты;
- зафиксируй расхождение как known deviation / project decision, если это сознательное решение.

`TODO.md` отвечает на вопрос **«что сейчас делать»**.
`reference/hsr_simulator_unified_guide.txt` отвечает на вопрос **«как должен быть устроен и проверяться engine»**.
`AGENTS.md` отвечает на вопрос **«как агент должен работать с кодом»**.

---

## 2. Current Project Priority

Главная цель проекта:

> Сделать deterministic, inspectable и verifiable combat engine, а не просто генератор
> правдоподобных чисел.

Текущий приоритет определяется `TODO.md`.

**Не расширяй контент ради самого контента**, если текущая задача относится к engine correctness,
verification или regression.

Особенно не начинай одновременно с engine-задачей:
- новых персонажей;
- новых конусов;
- массовой генерации реликов;
- optimizer;
- UI;
- крупных несвязанных refactors.

Если content change нужен, чтобы разблокировать correctness-задачу, делай минимально необходимый.

---

## 3. Core Architecture Contract

Целевая модель:

```text
RAW DATA
  ↓
RULE INTERPRETATION
  ↓
BUILD CONFIG
  ↓
TEAM CONFIG
  ↓
ENCOUNTER CONFIG
  ↓
RULES SNAPSHOT
  ↓
BATTLE STATE
  ↓
TIMELINE
  ↓
ACTION
  ↓
ATTACK CONTEXT
  ↓
EVENTS / TRIGGERS
  ↓
EFFECTS / DAMAGE / RESOURCES
  ↓
STATE TRANSITIONS
  ↓
EVENT STREAM
  ├─ Combat Log
  ├─ Debug Trace
  ├─ State Diff
  └─ Damage Trace
  ↓
VERIFICATION / ANALYSIS
  ↓
SWEEP / REGRESSION
```

Не смешивать:

```text
SOURCE DATA
RULE INTERPRETATION
BUILD / TEAM CONFIG
RUNTIME STATE
```

И не смешивать внутри runtime:

```text
character definition
build state
battle state
stage rules
```

### Главный принцип

Существующий simulator должен постепенно двигаться к модели:

```text
Simulator = orchestration
BattleState = mutable state
Timeline = scheduling
Action = what happens
AttackContext = identity/context of an attack
Event = what happened
Trigger = reaction to an event
Effect = state-changing operation
```

Не строй engine вокруг `character.attack()`.

---

## 4. Non-Standard Mechanics Are First-Class

Никогда не предполагай, что:

```text
Ultimate == Energy Full
Turn == One Ability
Ability == One Attack
Attack == One Hit
Hit == One Damage Event
Damage == HP Loss
FUA == Recursive Attack Call
Summon == Character
Buff == Direct Stat Mutation
Resource == Energy
Alive == Can Act
```

Engine должен быть способен представить как минимум:

```text
- standard Energy;
- alternative Ultimate resources;
- energy threshold Ultimate;
- special-resource Ultimate;
- charges / counters / gauges;
- resource overflow;
- resource that also modifies stats;
- resource generated by another entity's event;
- HP damage vs HP loss vs HP consumption vs redirect;
- persistent battle accumulators;
- state machines / transformations;
- dynamically available ability sets;
- multi-tag attacks;
- reactions / counters;
- scheduled / countdown entities;
- off-turn entities;
- summons / memosprites with explicit ownership;
- joint / multi-source attacks;
- marks and mark transfer;
- zones / fields / auras;
- team-level state;
- pre-battle / Technique state;
- event-driven actions;
- sub-field / alternate combat-space semantics when required by content.
```

**Не решай generic mechanic через `if (kitId === ...)`**, если можно создать reusable primitive.

Character-specific handler допустим, когда механика действительно уникальна и generic abstraction
становится хуже/хрупче.

---

## 5. Action / Attack / Hit / Trigger Semantics

Всегда различай:

```text
Action
  = одно запланированное или принудительно выполненное действие

Activation
  = одна активация способности/цепочки

Attack
  = логическая атака внутри activation

Hit
  = конкретное попадание

Damage Event
  = конкретное изменение через damage pipeline

Trigger
  = реакция на event
```

Не своди это к одному ID.

Целевая модель `AttackContext`:

```ts
{
  actionId,
  activationId,
  attackId,

  sourceId,
  ownerId,

  type,
  element,

  hitIndex,
  hitCount,

  tags,
  triggerSource
}
```

### `attackNo` vs `attackAct`

В текущем engine:

```text
attackNo / attackSeq
    = identity конкретной атаки

attackAct
    = identity активации
```

`attackNo()` нельзя использовать там, где нужен gate «один раз за activation».
`attackAct()` нельзя использовать там, где нужен gate «один раз за attack».

Это особенно важно для:
- multi-hit;
- FUA;
- retyped hits;
- Additional DMG;
- counters;
- nested actions.

---

## 6. Turn / Ultimate Contract

### 6.1 Обычный turn

Текущая глобальная конвенция:

```text
charTurn = one action slot
```

Ultimate по умолчанию **заменяет действие этого хода**, а не идёт дополнительно.

`grantExtraTurn` / другие explicit extra-action mechanics — отдельное действие.

Если энергия стала полной во время текущего действия, это не даёт автоматически ещё одно действие
внутри того же turn.

Не использовать старую конвенцию «Ult поверх Basic/Skill».

### 6.2 Ultimate

Ultimate execution не должен быть жёстко связан с обычной Energy.

Концептуально:

```text
UltimateAvailability
    ↓
UltimateActivation
    ↓
UltimateConsumption
    ↓
Action creation / execution
```

Поддерживаемые классы activation:

```text
energy_full
energy_threshold
special_resource_threshold
charges
counter
gauge
state_condition
external_trigger
custom predicate
```

Стандартная Energy — только один вариант.

### 6.3 Current special-ULT cases

Текущий reference/engine contract содержит отдельные non-Energy Ultimate ресурсы,
в частности для Acheron, Castorice, Cyrene, Feixiao, Phainon и Silver Wolf LV.999.

Не создавай fake `energyMax` ради того, чтобы заставить такие Ultimates работать.
Используй подход `resource + availability + consumption`.

Half-threshold Energy — отдельный класс и не должен смешиваться с non-Energy resource.

---

## 7. Resource Contract

В engine ресурс — это не синоним Energy.

Generic resource должен уметь:

```text
current
max / threshold
optional overflow
owner
lifetime
reset rule
consumption rule
generation sources
stat contribution (если есть)
```

Минимальные resource classes:

```text
Energy
Skill Points
Stacks
Charges
Counters
Gauges
Persistent Accumulators
Team Resources
Special Character Resources
```

Любое изменение ресурса должно идти через API и быть наблюдаемым как state/event transition.

Не делать прямые:

```ts
u.energy += x
sim.sp -= x
```

в местах, где можно использовать resource API.

---

## 8. HP Semantics

Не смешивать:

```text
incoming damage
HP loss
HP consumption
HP drain
HP redirect
HP restore
revival
```

Если механика реагирует на «HP loss», не заменяй это автоматически на `DamageDealt`.

Если механика требует redirect/interceptor, не прячь её внутрь DamageCalculator без явной семантики.

Целевой паттерн:

```text
Damage calculation
    ↓
Resolved incoming damage
    ↓
HP-change / shield / interceptor layer
    ↓
Actual HP mutation
    ↓
HP-related events
```

Любая прямая мутация HP должна быть классифицирована:

```text
legitimate internal/state mutation
или
engine bypass
```

---

## 9. State Lifetime

Для любого runtime state сначала определить lifetime:

```text
PER_HIT
PER_ATTACK
PER_ACTIVATION
PER_ACTION
PER_TURN
PER_WAVE
PER_CYCLE
PER_BATTLE
PERSISTENT
```

Перед добавлением нового `rt.foo` зафиксировать:

```text
owner
lifetime
initial value
reset condition
expiration condition
stack rule
source
```

Это обязательно для:
- FUA gates;
- one-per-turn effects;
- buff/debuff duration;
- countdowns;
- accumulators;
- summon state;
- wave/cycle mechanics;
- transformations.

---

## 10. State Machines / Transformations

Если механика меняет доступные действия или состояние сущности, не моделируй её как простой статический buff.

Используй концепцию:

```text
NORMAL STATE
    ↓
TRANSITION
    ↓
TRANSFORMED STATE
    ↓
STATE-SPECIFIC ABILITIES / RULES
    ↓
EXIT / EXPIRATION
```

State machine должна уметь менять:
- available abilities;
- action permissions;
- timeline presence;
- targeting eligibility;
- stat sources;
- resource rules;
- exit conditions.

`Alive`, `CanAct`, `CanReact`, `CanBeTargeted`, `VisibleOnTimeline` — разные свойства.

---

## 11. Summon / Memosprite Contract

Не предполагать:

```text
summon == normal character
```

Для summon/memosprite явно определяй:

```text
owner
ownerId
stat source
crit source
timeline behavior
action behavior
lifecycle
spawn event
despawn event
post-action behavior
damage attribution
```

Допустимы разные модели:

```text
normal AV summon
memospite with own AV
event-driven summon
countdown entity
off-turn summon
joint attacker
```

Если summon зеркалит CRIT владельца, предпочитать live lookup текущего значения, если это соответствует
канону/спеке, а не устаревший snapshot.

Для debug всегда показывай:

```text
owner
stat source
crit source
timeline source
action identity
owner damage attribution
```

---

## 12. Timeline Contract

Timeline — единственное место, которое отвечает за scheduling.

Персонажный kit может запросить:

```text
advance
 delay
extra action
immediate action
schedule action
```

но не должен сам реализовывать порядок queue.

Нельзя прятать timeline decisions внутри character logic.

### Advance / Delay / Extra Turn

Это разные семантики:

```text
Action Advance
Action Delay
Extra Turn
Immediate Action
Scheduled Action
```

Не заменять всё одной операцией «100% advance».

### Ordering

Порядок должен быть централизованным и deterministic.

Любой новый fan-out/trigger обязан явно определить:

```text
priority
insertion point
source order
slot order
same-time tie-break
```

---

## 13. Event / Trigger Contract

Используй единый event bus.

Минимальные категории:

```text
BATTLE_START / END
WAVE_START / END
CYCLE_START / END

ACTION_SCHEDULED
ACTION_START
ACTION_END
ACTION_CANCELLED
ACTION_SKIPPED

ABILITY_USED
HIT_START
HIT_END

DAMAGE_CALCULATED
DAMAGE_DEALT

HEAL_CALCULATED
HEAL_APPLIED

HP_LOSS
HP_CONSUMED
HP_REDIRECTED

BUFF_APPLIED
BUFF_STACKED
BUFF_REFRESHED
BUFF_REPLACED
BUFF_EXPIRED

DEBUFF_APPLIED
DEBUFF_STACKED
DEBUFF_REFRESHED
DEBUFF_EXPIRED

ENERGY_GAIN
ENERGY_LOSS
SP_GAIN
SP_LOSS
RESOURCE_CHANGED

TOUGHNESS_DAMAGE
WEAKNESS_BREAK
BREAK_DAMAGE
SUPERBREAK

DOT_APPLIED
DOT_TICK
DOT_EXPIRED

FOLLOW_UP_TRIGGERED
FOLLOW_UP_SCHEDULED
FOLLOW_UP_EXECUTED
COUNTER_TRIGGERED
REACTION_TRIGGERED

ACTION_ADVANCE
ACTION_DELAY
EXTRA_TURN

SUMMON_CREATED
SUMMON_ACTION
SUMMON_DESPAWNED

SHIELD_APPLIED
SHIELD_ABSORBED
SHIELD_BROKEN

CONTROL_APPLIED
CONTROL_EXPIRED

TARGET_SELECTED
DEATH
REVIVAL

RNG_ROLL
STAT_CHANGED
```

### Trigger queue

Не делать deep recursive chains вида:

```text
hit()
  -> trigger()
      -> fua()
          -> hit()
              -> trigger()
```

Предпочтительная модель:

```text
Event
  ↓
collect matching triggers
  ↓
Trigger Queue
  ↓
resolve one by one
  ↓
new Events
  ↓
new Triggers
```

---

## 14. Damage Contract

Damage не должен рассчитываться отдельно в каждом kit.

Целевая цепочка:

```text
Ability / AttackContext
  ↓
Base scaling
  ↓
Source stat
  ↓
Base / flat terms
  ↓
Damage bonuses
  ↓
Crit
  ↓
Weaken
  ↓
DEF
  ↓
RES
  ↓
Vulnerability
  ↓
Mitigation
  ↓
Broken / target-state modifiers
  ↓
Final modifiers
  ↓
Final damage
```

Текущая базовая формула проекта:

```text
DMG = Base × CRIT × (1+Type+Elem+All boost)
    × (1-Weaken)
    × DEFmult
    × RESmult
    × Vulnmult
    × ∏(1-mit)
    × broken/intact modifier
```

Капы и конкретные значения брать из текущих mechanics docs / reference guide,
а не копировать из памяти.

Ключевые проверенные project rules:

```text
CRIT Rate cap = 1.0
RES reduction cap = 90%
RES PEN floor = -100%
Vulnerability bonus cap = 2.50
MaxToughnessMult = 0.5 + maxToughness / 40
```

`MaxToughnessMult /40` — это проектный canon decision; не заменять `/120` из внешнего reference без нового доказательства.

Особые damage paths могут существовать, но должны быть **явными типами/режимами**, а не скрытыми bypass-ами:

```text
DoT
Break
Super Break
True Damage
Elation
Additional DMG
```

---

## 15. Damage Trace

Каждый сложный damage result должен быть диагностируемым.

Минимум:

```text
source
target
attackType
element
baseDamage
finalDamage
crit roll/rate/result/multiplier
modifier stages
HP before/after
toughness before/after
```

Идеальный stage сохраняет вклад каждого источника:

```text
+24% Sparkle
+20% Light Cone
+18% Relic
+12% Talent
```

Не использовать только pooled multiplier, если источник легко определить.

Финальный damage — недостаточное доказательство корректности.

---

## 16. Stats Contract

StatResolver — единая точка разрешения статов.

Смысл:

```text
Base
  ↓
Percent modifiers
  ↓
Flat modifiers
  ↓
Conditional / temporary modifiers
  ↓
Final stat
```

**Текущая project convention:** flat HP/ATK/DEF effects представлены как `hpFlat/atkFlat/defFlat`
и применяются после percentage stage; не добавлять их напрямую в base stats без явного решения.

Не писать character-specific stat math внутри kit.

Kit должен создавать effect/modifier.
StatResolver должен знать, как его применить.

Target-conditional stats должны быть явно названы как conditional, а не подменяться глобальным stat.

---

## 17. Buff / Debuff Contract

Buff/debuff — это state objects, а не прямое изменение числа статов.

Нужны:

```text
id
source
owner/target
stacks
maxStacks
duration
refresh/replace/stack behavior
modifiers
triggers
payload
```

При изменении состояния используйте централизованный lifecycle:

```text
apply
stack / refresh / replace
expire
remove
```

Для duration используйте общий expiration API.
Не копируй вручную `filter(buffs)`-логику в новом месте, если есть общий helper.

`Infinity` / permanent effects должны явно отличаться от тикающих duration.

---

## 18. Break / Toughness Contract

Всегда различай:

```text
HP damage
Toughness damage
Break damage
Super Break
```

Break pipeline должен явно показывать:

```text
hit
→ toughness reduction
→ check break
→ break damage / related effects
→ broken state transition
→ post-break triggers
```

Текущий project rule:

```text
The hit that empties Toughness and its immediate Break DMG
are resolved while target is still considered intact;
Broken flag is set after the Break damage calculation.
```

Новый код не должен менять этот порядок случайным образом.

---

## 19. Ability Availability

Доступные способности могут зависеть от state.

Не предполагай, что у entity навсегда фиксирован:

```text
basic
skill
ult
```

Use the conceptual API:

```text
getAvailableAbilities(entity, state)
```

Состояние может:
- отключить Skill;
- заменить Basic на Enhanced Basic;
- запретить Ultimate;
- дать extra ability;
- разрешить action только вне обычного timeline;
- перевести entity в off-turn режим.

---

## 20. Targeting Contract

Target selection должен быть отдельным resolver.

Не делать:

```ts
target = enemies[0]
```

в kit-логике.

TargetResolver должен поддерживать, где требуется:

```text
single
blast
AoE
random
lowest HP
highest HP
marked
primary
adjacent
forced
aggro-weighted
fallback target
```

Target selection должен происходить в момент, предусмотренный спецификацией,
а не обязательно в начале всего действия.

Для сложной targeting logic в debug показывать:

```text
rule
candidates
filters
weights
RNG
selected target
fallback reason
```

---

## 21. Gear Rules

### Light Cones

Raw stats/passive values брать дословно из:

```text
hsr-data/data/lightcones.json
```

Перед изменением проверь raw data.

Superimposition:

```text
SI = 1..5
```

и значение `si` должно проходить через gear hooks.

Не flatten-ить stateful passive, если нормальный event hook может смоделировать её корректно.

### Relics

Разделять:

```text
RelicDefinition
RelicPiece
Build
Runtime effect
```

Проверять независимо:

```text
slot
main stat
substats
roll budget
set activation
conditional passive
stack
refresh
expiration
character interaction
```

`buildGear`/allocator — это **generation/allocation**, а не optimizer.
Не называть его полноценным search/optimization engine.

---

## 22. Raw Character Data Contract

Для `hsr-data/characters.json` не угадывать поля.

Текущая структура принципиально различает:

### Обычный skill персонажа

```text
characters[N].skills.<id>
  → levels
      → { level, params[] }
```

### Memosprite skill

```text
characters[N].memosprite.skills.<id>
  → level
      → { level, param_list[] }
```

У memosprite skill нет ключа `levels`.

Также:

```text
desc = skill text
notes = optional notes
sp_base = SP metadata where applicable
```

Не используй `description`, если его нет в raw data.

`type_name` и `Maze*` / `MazeAttack` обозначают Technique-related data, а не memosprite.

Перед новым parser/helper сначала смотри реальную структуру JSON.

Не добавляй «терпимые» fallbacks, которые скрывают неверное чтение данных,
если они не нужны документированной совместимости.

---
