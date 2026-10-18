# FiniteHSR - HSR Damage Simulator

—имул€тор бо€ Honkai: Star Rail: расчЄт урона, AV-анализ, цикл-тайминг, баффы/дебаффы,
брокен/DoT, контроли и сравнение билдов в один клик.

> —татус: стабилен (16.10.2026). Gates: 
px tsc --noEmit 0; 
pm test 2951/0; 
pm run lab ALL PASSED; 
px tsx tests/index.ts enemies 933/0; 
px tsx src/core/debug-kits.ts 0 failures.

##  ак пользоватьс€

`ash
npm install
npm run dev       # dev-сервер Vite (http://localhost:5173)
npm run build     # tsc --noEmit + vite build
npm run preview   # предпросмотр билда
npm run check     # self-check
npm test          # прогон тестов (2951 cases, 0 failed)
npm run verify    # verification gate
npm run lab       # debug/lab sanity
npm run ci        # tsc --noEmit && npm test && npm run lab
` 

GUI доступен по http://localhost:5173 после 
pm run dev.

## „то реализовано

- ƒетерминированный боевой симул€тор (timeline, actions, AV, energy/SP, triggers, events)
- ћеханики урона, крита, защиты, резиста, у€звимости, брака/супербрака, DoT, контроль, щиты/хил
- Ѕоссы/мобы + покрытие врагов (E0ЦE6 + инвентарь/негативы)
- ¬ерификаци€: golden/spec + comparison + audit + deviations
- GUI (Vite): dashboard/build/team/encounter/run/compare/profiles/optimizer/verification/catalog/deviations/settings
- Ћаборатори€ debug/lab + CLI-утилиты валидации

## —труктура проекта

`	ext
src/            # core engine, UI, analysis, optimizer, verification helpers
tests/          # unit/scenario/regression/golden suites + UI tests
verification/   # specs, golden traces, interactions, meta
hsr-data/        # game data (characters/enemies/lightcones + data/)
docs/            # guides, GUI docs
debug/lab/       # lab harness + checks (CI)
index.html       # Vite entry
tsconfig.json
package.json
` 

## √ейты/качество

- 
px tsc --noEmit Ч 0 ошибок типов
- 
pm test Ч 2951/0
- 
pm run lab Ч ALL PASSED
- 
px tsx tests/index.ts enemies Ч 933/0
- 
px tsx src/core/debug-kits.ts Ч 0 failures
- 
pm run verify Ч ALL SPECS PASSED
