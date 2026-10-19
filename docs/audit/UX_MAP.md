# FiniteHSR - UX Map (Phase B)

## Routes (shell.ts:25-47, регруппировка 19-10-2026)
4 пользовательских раздела (route id/deep links `#/<id>` не менялись, 18 роутов как раньше):
- БОЙ (BATTLE): dashboard, team, build, encounter, battle, gear, results, calc, reference
- АНАЛИЗ (ANALYSIS): analysis, compare, profiles
- ОПТИМИЗАЦИЯ (OPTIMIZATION): optimizer
- ПРОВЕРКА ДВИЖКА (ENGINEERING): verification, catalog, deviations, diagnostics, settings

Заголовки разделов — кнопки-секции (сворачивание, `GROUP_LABELS`, состояние в localStorage
`nav.collapsed`, дефолт: ENGINEERING свёрнут; переход на роут внутри свёрнутого раздела
раскрывает его — `expandGroup` в `activate`). Кнопки роутов всегда остаются в DOM.
Соответствует §2 брифа: технические инструменты — не равнозначные пункты главного меню.

## Иконки (fallback, 19-10-2026)
Проверено: 0 image-файлов в репо/hsr-data; `characters.json` — только числовой `avatar_id`;
`lightcones.json` — без icon/url полей; `relicsets.json` — строки `SpriteOutput/...` (путь в игре,
без файлов и без базового URL); `enemies.json` — ссылка на страницу вики, не картинка.
Реализован только data-driven fallback: `src/ui/icons.ts` `charBadge/updateCharBadge` —
круглый бейдж с первой буквой имени, цвет по `KitDef.elem` (7 элементов), tooltip называет
имя+элемент+пробел. Точки: team-карточка (`charHead`) и Build Editor («Персонаж»).
`<img>` в UI — 0; URL не выдумываются. Пробел = локальные ассеты (Phase G) — не закрыт.
Тесты: `tests/ui/icons.ts` 6/6 (тint по палитре, смена кита, неизвестный id → `?`, без throw).

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

## Gaps (актуально, 19-10-2026)
- C/D/E/I — закрыты (см. TODO.md, 18–20-10): техника в Team Builder, per-node traces, action-log из `sim.logger.events`, экран Диагностика есть (ROUTES: diagnostics).
- G: ассетов/манифеста по-прежнему нет — закрыт только fallback-бейдж (см. «Иконки» выше); `PHASE_G.md` = спецификация downloader'а, deliberate deferral.
- Адаптивность: в `src/style.css` нет ни одного `@media`-запроса (проверено 19-10) — навигация в 4 сворачиваемых секции облегчает узкие экраны, но breakpoint'ов нет; массовый responsive-рефактор вне задачи.
- Отмена долгих прогонов: механизма отмены нет → кнопка не рисуется (см. «Long operations»).