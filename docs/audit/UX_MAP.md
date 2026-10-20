# FiniteHSR - UX Map (Phase B)

## Routes (shell.ts:25-48, регруппировка 19-10-2026; single-page player 20-10-2026)
4 пользовательских раздела (прежние 18 route id/deep links `#/<id>` сохранены; добавлен `player` = 19 роутов):
- БОЙ (BATTLE): player, dashboard, team, build, encounter, battle, gear, results, calc, reference
- АНАЛИЗ (ANALYSIS): analysis, compare, profiles
- ОПТИМИЗАЦИЯ (OPTIMIZATION): optimizer
- ПРОВЕРКА ДВИЖКА (ENGINEERING): verification, catalog, deviations, diagnostics, settings

### Single-page player flow (обновлено 20-10-2026)
`player` — первый роут и `DEFAULT_ROUTE`; панель `#panel-player` держит существующие редакторы
в порядке из `docs/gui/PLAYER_FLOW_AND_ASSETS.md`: отряд (`#team`/`#addChar`; каждая карточка
персонажа несёт **свой билд** — Light Cone/SI/eidolon/уровни/трейсы/энергия — и **6 relic slots**
под `<details>`, а **техника** остаётся видимой; продвинутая ротация и kit-флаги — под `<details>`
«Advanced strategy») → противники (`#enemyCfg`) → модификаторы (`#modRows`/`#addMod`) →
режим и запуск (`#cycles`/`#seed`/`#runMode`/`#run`/`#check`) → результаты ниже (`#summary`,
`#statPanel`, `#hpPanel`, `#log`, `#manualPanel`). Контейнеры **перенесены**, не скопированы: одна
живая копия каждого контрола, второй источник истины не создан. Импорт/экспорт `BuildSpec`
(`#buildEditor`) — `<details>` в секции «Отряд». Прежний отдельный таб-панель реликвий
(`#relicTabs`/`#relicPanel`) **убран**: слоты реликвий теперь в карточке (§2), параллельного
build-представления нет (§56). Старые роуты team/build/gear/battle/results
сохранили id и показывают указатель с кнопкой `[data-go="player"]` (`initShell` делегирует клик в
`navigate`). Покрытие: `tests/ui/player-page.ts` 11/11 (порядок секций, уникальность id, единый дом,
указатели, buildEditor в player, отсутствие relic-таба); `tests/ui/nav.ts` — 19 роутов.

Заголовки разделов — кнопки-секции (сворачивание, `GROUP_LABELS`, состояние в localStorage
`nav.collapsed`, дефолт: ENGINEERING свёрнут; переход на роут внутри свёрнутого раздела
раскрывает его — `expandGroup` в `activate`). Кнопки роутов всегда остаются в DOM.
Соответствует §2 брифа: технические инструменты — не равнозначные пункты главного меню.

## Иконки (реальные ассеты, 20-10-2026)
Ассеты добавлены в `public/icons/` (1874 PNG: characters/enemies/lightcones/relicsets/planarsets/
eidolons/stats/paths/elements/types/buffs/debuffs/states/abilities + `_manifest.json`), served at
`/icons/...`. Манифест генерируется `src/core/gen-icon-manifest.ts` → `src/ui/iconManifest.ts`
(typed `Record<name,path>` ×kind + вложенный `EIDOLON_ICONS`); id→display-name резолв через
kit/gear таблицы (`PATH_KEY` алиасит `Hunt`→`The Hunt`).
`src/ui/icons.ts` — единый компонент: `charIconUrl/gearIconUrl/elemIconUrl/pathIconUrl/statIconUrl/
enemyIconUrl` + `iconNode` рисует `<img>` (`alt`, `width/height`, `object-fit`, `loading="lazy"`,
`decoding="async"`, `onerror`→скрыть картинку и показать fallback-chip). Неизвестный/пустой id →
детерминированный chip по элементу; URL не выдумываются, вики не хотлинкается. Публичные контракты
`charBadge/updateCharBadge/gearBadge/updateGearBadge` сохранены. §1: карточка персонажа также несёт
element- и path-иконки через `metaBadge`/`updateMetaBadges` (`elemIconUrl`/`pathIconUrl`, fallback —
буква-чип), путь берётся из `KIT_PATH`.
Тесты: `tests/ui/icons.ts` 8/8 (резолв манифеста, alt+lazy, смена кита, неизвестный/пустой → chip,
резолв gear id, отсутствие выдуманных URL). Прежний пробел Phase G закрыт.

## Long operations (§4 брифа — проверка, изменений нет)
Уже есть и покрыто тестами: `withBusy` = единый loading/error контракт; оптимизатор печатает
effective options ДО и ПОСЛЕ запуска (`drawPre`, `maxCandidates` = «не задан»/значение),
F-отчёт помечает неполноту («исследовано X из Y…не глобальный оптимум», exhaustive-badge).
Отмены нет ни в одном алгоритме → фейковая кнопка отмены не добавлялась (правило 84.1).
Статусы `available/partial/unavailable/N/A` не менялись (`capabilities.ts` не тронут).

## Capability mapping (capabilities.ts)
- Non-available shown with badge (~=partial, !=unavailable) + full reason in .cap-notice.
- Available: build.editor, build.apply, team.editor, encounter.editor, validate, spec.io, battle.run/manual, rules.snapshot, checks.formulas, gear.coverage, determinism.check, analysis.run/compare/damage/causal/profile/teamValue/audit, capabilities grouped.
- Partial (10): replay.build, verification.specs, analysis.probe, optimize.search/beam/joint/mc/calibrate/encounter/ablation.
- Unavailable (1): sweep.workers.

## Status surface (shell.ts:130-190)
- showStatus(msg, kind=info/loading/error), clearStatus(), withBusy(label, fn) adds .busy, shows loading, clears on success or sets error, always restores .busy.

## Version bar (shell.ts:193-250)
- 3 chips: engine/rules/data from verification/meta/rules (ENGINE_VERSION, RULES_VERSION, DATASET_VERSION). Visible always.

## Route activation
- activate(id) sets active nav + active panel; renderCapabilityNotice removes or creates .cap-notice; runs enter hook (ENTER_HOOKS or route.enter).

## vs traceability.md (docs/gui/traceability.md)
- Route→module/init table exists (G0). Shell section 84.3 present. Traceability matrix covers many 84.17 items but not all routes fully expanded.

## Findings (84.1/84.3 compliance)
- Honesty: non-available → badge + notice (no stub). Browser-viable distinction in capabilities.ts (partial/unavailable).
- No engine duplication in shell (UI-only).
- No fake metrics; only status surface for missing backend.

## Gaps (актуально, 20-10-2026)
- C/D/E/I — закрыты (см. TODO.md, 18–20-10): техника в Team Builder, per-node traces, action-log из `sim.logger.events`, экран Диагностика есть (ROUTES: diagnostics).
- G — закрыт (20-10-2026): ассеты и манифест добавлены (`public/icons/` + `src/ui/iconManifest.ts`), иконки рендерятся через единый компонент с graceful fallback (см. «Иконки» выше).
- Single-page player flow — реализован и консолидирован (20-10-2026): §1 (element/path иконки), §2 (6 relic slots внутри карточки, `#buildEditor` import/export в секции «Отряд», роут build → указатель), §3 (advanced strategy под `<details>`). Прежний отдельный relic-таб убран, параллельного build-представления нет. См. «Single-page player flow» выше; `docs/gui/PLAYER_FLOW_AND_ASSETS.md` перенесён на main как целевой reference.
- Адаптивность — закрыта (20-10-2026): в `src/style.css` добавлены breakpoints `@media (max-width: 860px)` (nav rail → горизонтальная прокручиваемая полоса, team/relic-гриды в одну колонку) и `(max-width: 560px)` (topbar/mod-строки/сабстаты), плюс `@media (prefers-reduced-motion)`. Прежний leftover-gap снят.
- Доступность (20-10-2026): `:focus-visible`-кольцо на всех интерактивных контролах (кнопки/ссылки/input/select/nav/tab), у иконок всегда `alt`, Start (`#run`) — единственная prominent primary-кнопка (`btn-primary btn-large`).
- Отмена долгих прогонов: механизма отмены нет → кнопка не рисуется (см. «Long operations»).