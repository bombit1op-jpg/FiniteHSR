import { chk, run, raw, all, mob } from '../../_helpers/battle'

/**
 * A Technique is pre-fight: buff-kind techniques only arm at battle start, and at most ONE
 * combat-starting (attack-kind) technique may fire (canon: one field/opening per battle). The
 * family rule pinned here: the requested list reaches BATTLE_START, the attack technique acts at
 * AV 0, and a second attack technique is skipped rather than stacked.
 */
export default () => {
  const c = run({
    team: [{ kitId: 'aglaea' }, { kitId: 'pela' }, { kitId: 'sunday' }, { kitId: 'gallagher' }],
    enemy: mob(),
    techniques: ['aglaea', 'sunday', 'pela'],
    cycles: 3,
  })
  const start = all(c, 'BATTLE_START')[0]
  const requested = JSON.stringify(start?.payload.techniques)
  const gm = all(c, 'SUMMON_CREATED').filter(n => n.target === 'Garmentmaker')
  const skipped = c.logLines.some(l => /only one combat Technique/.test(l))

  // battle-start buff family: each Technique arms a REAL stat (not just a note), read from buffLog
  // which records the application regardless of later expiry. cycles:1 keeps the runs cheap.
  const d = run({ team: [{ kitId: 'danheng' }], techniques: ['danheng'], cycles: 1 })
  const h = run({ team: [{ kitId: 'herta' }], techniques: ['herta'], cycles: 1 })
  const th = run({ team: [{ kitId: 'the_herta' }], techniques: ['the_herta'], cycles: 1 })
  const br = run({ team: [{ kitId: 'bronya' }, { kitId: 'danheng' }], techniques: ['bronya'], cycles: 1 })
  const kf = run({ team: [{ kitId: 'kafka' }], techniques: ['kafka'], cycles: 1 })

  const gp = run({ team: [{ kitId: 'gepard' }, { kitId: 'danheng' }], techniques: ['gepard'], cycles: 1 })
  const gpShield = gp.buffLog.filter(b => b.id === 'gepard_tech_shield')
  const bl = run({ team: [{ kitId: 'bailu' }, { kitId: 'danheng' }], techniques: ['bailu'], cycles: 1 })
  const blInv = bl.buffLog.filter(b => b.id === 'bailu_invig')
  const lx = run({ team: [{ kitId: 'lynx' }, { kitId: 'danheng' }], techniques: ['lynx'], cycles: 1 })
  const lxUnit = lx.sim.roster.find(u => u.kitId === 'lynx')
  const lxHots = lxUnit
    ? Object.values((lx.sim.rt(lxUnit) as unknown as { hots?: Record<string, { turns: number; heal: number }> }).hots ?? {})
    : []
  const su = run({ team: [{ kitId: 'sushang' }], enemy: mob({ count: 2 }), techniques: ['sushang'], cycles: 1 })
  const suHits = all(su, 'DAMAGE_DEALT').filter(n => n.source === 'Sushang' && n.element === 'Physical').length

  const ty = run({ team: [{ kitId: 'tingyun' }, { kitId: 'danheng' }], techniques: ['tingyun'], cycles: 1 })
  const tyGains = all(ty, 'ENERGY_GAIN').filter(n => n.target === 'Tingyun' && Math.round(Number(n.payload.n)) >= 49).length
  const qq = run({ team: [{ kitId: 'qingque' }, { kitId: 'danheng' }], techniques: ['qingque'], cycles: 1 })
  const qqDraws = qq.logLines.filter(l => /\(Game Solitaire\)/.test(l)).length
  const bs = run({ team: [{ kitId: 'blackswan' }, { kitId: 'danheng' }], techniques: ['blackswan'], cycles: 1 })
  const bsChain = bs.logLines.filter(l => /From Façade to Vérité/.test(l)).length
  const tbp = run({ team: [{ kitId: 'trailblazer_preservation' }, { kitId: 'danheng' }], techniques: ['trailblazer_preservation'], cycles: 1 })
  const tbpShield = tbp.buffLog.filter(b => b.id === 'tb_pres_tech_shield')
  const tbd = run({ team: [{ kitId: 'trailblazer_destruction' }, { kitId: 'danheng' }], techniques: ['trailblazer_destruction'], cycles: 1 })
  const tbdHeals = all(tbd, 'HEAL_APPLIED').length
  const tbh = run({ team: [{ kitId: 'trailblazer_harmony' }, { kitId: 'danheng' }], techniques: ['trailblazer_harmony'], cycles: 1 })

  const ar = run({ team: [{ kitId: 'arlan' }], enemy: mob({ count: 2 }), techniques: ['arlan'], cycles: 1 })
  const arHits = all(ar, 'DAMAGE_DEALT').filter(n => n.source === 'Arlan' && n.element === 'Lightning').length
  const as = run({ team: [{ kitId: 'asta' }], enemy: mob({ count: 2 }), techniques: ['asta'], cycles: 1 })
  const asHits = all(as, 'DAMAGE_DEALT').filter(n => n.source === 'Asta' && n.element === 'Fire').length
  const xy = run({ team: [{ kitId: 'xueyi' }], enemy: mob({ count: 2 }), techniques: ['xueyi'], cycles: 1 })
  const xyHits = all(xy, 'DAMAGE_DEALT').filter(n => n.source === 'Xueyi' && n.element === 'Quantum').length
  const hk = run({ team: [{ kitId: 'hook' }], enemy: mob({ count: 2 }), techniques: ['hook'], cycles: 1 })
  const hkBurn = all(hk, 'DOT_APPLIED').filter(n => (n.payload as { kind?: string })?.kind === 'Burn').length
  const hkFire = all(hk, 'DAMAGE_DEALT').filter(n => n.source === 'Hook' && n.element === 'Fire').length
  const gui = run({ team: [{ kitId: 'guinaifen' }], enemy: mob({ count: 2 }), techniques: ['guinaifen'], cycles: 1 })
  const guiFire = all(gui, 'DAMAGE_DEALT').filter(n => n.source === 'Guinaifen' && n.element === 'Fire').length
  const guiKiss = gui.buffLog.filter(b => b.id === 'firekiss').length

  const hm = run({ team: [{ kitId: 'himeko' }, { kitId: 'danheng' }], techniques: ['himeko'], cycles: 1 })
  const hmFire = hm.buffLog.filter(b => b.id === 'himeko_tech_fire')
  const sv = run({ team: [{ kitId: 'serval' }], enemy: mob({ count: 2 }), techniques: ['serval'], cycles: 1 })
  const svShock = all(sv, 'DOT_APPLIED').filter(n => (n.payload as { kind?: string })?.kind === 'Shock').length
  const cl = run({ team: [{ kitId: 'clara' }, { kitId: 'danheng' }], techniques: ['clara'], cycles: 1 })
  const clAggro = cl.buffLog.filter(b => b.id === 'clara_tech_aggro')
  const yq = run({ team: [{ kitId: 'yanqing' }, { kitId: 'danheng' }], techniques: ['yanqing'], cycles: 1 })
  const hy = run({ team: [{ kitId: 'hyacine' }, { kitId: 'danheng' }], techniques: ['hyacine'], cycles: 1 })
  const hyHp = hy.buffLog.filter(b => b.id === 'hyacine_tech_hp')

  const ag = run({ team: [{ kitId: 'argenti' }], enemy: mob({ count: 2 }), techniques: ['argenti'], cycles: 1 })
  const agPhys = all(ag, 'DAMAGE_DEALT').filter(n => n.source === 'Argenti' && n.element === 'Physical').length
  const agEn = all(ag, 'ENERGY_GAIN').filter(n => n.target === 'Argenti' && Math.round(Number(n.payload.n)) >= 15).length
  const sx = run({ team: [{ kitId: 'sparxie' }], enemy: mob({ count: 2 }), techniques: ['sparxie'], cycles: 1 })
  const sxFire = all(sx, 'DAMAGE_DEALT').filter(n => n.source === 'Sparxie' && n.element === 'Fire').length
  const sxSp = all(sx, 'SP_GAIN').length
  const spk = run({ team: [{ kitId: 'sparkle' }, { kitId: 'danheng' }], techniques: ['sparkle'], cycles: 1 })
  const spkEn = all(spk, 'ENERGY_GAIN').filter(n => n.target === 'Sparkle' && Math.round(Number(n.payload.n)) >= 20).length
  const spkSp = all(spk, 'SP_GAIN').length
  const se = run({ team: [{ kitId: 'seele' }], enemy: mob({ count: 2 }), techniques: ['seele'], cycles: 1 })
  const mz = run({ team: [{ kitId: 'moze' }, { kitId: 'danheng' }], techniques: ['moze'], cycles: 1 })

  const m7 = run({ team: [{ kitId: 'march7th' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['march7th'], cycles: 1 })
  const m7Freeze = all(m7, 'DOT_APPLIED').filter(n => (n.payload as { kind?: string })?.kind === 'Freeze').length
  const nt = run({ team: [{ kitId: 'natasha' }], enemy: mob({ count: 2 }), techniques: ['natasha'], cycles: 1 })
  const ntWeaken = nt.buffLog.filter(b => b.id === 'natasha_tech_weaken')
  const ntPhys = all(nt, 'DAMAGE_DEALT').filter(n => n.source === 'Natasha' && n.element === 'Physical').length
  const lk = run({ team: [{ kitId: 'luka' }], enemy: mob({ count: 2 }), techniques: ['luka'], cycles: 1 })
  const lkBleed = all(lk, 'DOT_APPLIED').filter(n => (n.payload as { kind?: string })?.kind === 'Bleed').length
  const hy2 = run({ team: [{ kitId: 'hanya' }], enemy: mob({ count: 2 }), techniques: ['hanya'], cycles: 1 })
  const hy2Burden = hy2.buffLog.filter(b => b.id === 'hanya_burden')
  const sw = run({ team: [{ kitId: 'silverwolf' }], enemy: mob({ count: 2 }), techniques: ['silverwolf'], cycles: 1 })
  const swQuantum = all(sw, 'DAMAGE_DEALT').filter(n => n.source === 'Silver Wolf' && n.element === 'Quantum').length

  const arc = run({ team: [{ kitId: 'archer' }], enemy: mob({ count: 2 }), techniques: ['archer'], cycles: 1 })
  const arcQ = all(arc, 'DAMAGE_DEALT').filter(n => n.source === 'Archer' && n.element === 'Quantum').length
  const jq = run({ team: [{ kitId: 'jiaoqiu' }], enemy: mob({ count: 2 }), techniques: ['jiaoqiu'], cycles: 1 })
  const jqFire = all(jq, 'DAMAGE_DEALT').filter(n => n.source === 'Jiaoqiu' && n.element === 'Fire').length
  const jqRoast = jq.buffLog.filter(b => b.id === 'jq_roast').length
  const tb = run({ team: [{ kitId: 'tribbie' }, { kitId: 'danheng' }], techniques: ['tribbie'], cycles: 1 })
  const tbRes = tb.buffLog.filter(b => b.id === 'tri_respen')
  const ev = run({ team: [{ kitId: 'evanescia' }], enemy: mob({ count: 2 }), techniques: ['evanescia'], cycles: 1 })
  const evPhys = all(ev, 'DAMAGE_DEALT').filter(n => n.source === 'Evanescia' && n.element === 'Physical').length

  const fx = run({ team: [{ kitId: 'feixiao' }], enemy: mob({ count: 2 }), techniques: ['feixiao'], cycles: 1 })
  const fxWind = all(fx, 'DAMAGE_DEALT').filter(n => n.source === 'Feixiao' && n.element === 'Wind').length
  const fxAureus = fx.logLines.some(l => /Flying Aureus \+1/.test(l))
  const yk = run({ team: [{ kitId: 'yukong' }, { kitId: 'danheng' }], techniques: ['yukong'], cycles: 1 })
  const ykBow = yk.buffLog.filter(b => b.id === 'roaring_bow')
  const ac = run({ team: [{ kitId: 'acheron' }], enemy: mob({ count: 2 }), techniques: ['acheron'], cycles: 1 })
  const acLt = all(ac, 'DAMAGE_DEALT').filter(n => n.source === 'Acheron' && n.element === 'Lightning').length
  const ph = run({ team: [{ kitId: 'phainon' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['phainon'], cycles: 1 })
  const phPhys = all(ph, 'DAMAGE_DEALT').filter(n => n.source === 'Phainon' && n.element === 'Physical').length
  const phEn = all(ph, 'ENERGY_GAIN').filter(n => Math.round(Number(n.payload.n)) >= 25).length
  const phSp = all(ph, 'SP_GAIN').length

  const blTech = run({ team: [{ kitId: 'blade' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['blade'], cycles: 1 })
  const blWind = all(blTech, 'DAMAGE_DEALT').filter(n => n.source === 'Blade' && n.element === 'Wind').length
  const blCost = blTech.logLines.some(l => /loses \d+ HP \(self-cost\)/.test(l))
  const jl = run({ team: [{ kitId: 'jingliu' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['jingliu'], cycles: 2 })
  const jlFreeze = jl.logLines.filter(l => /Technique: .* Frozen/.test(l)).length
  const jlFrozenDmg = jl.logLines.some(l => /Frozen Additional DMG/.test(l))
  const jlEn = all(jl, 'ENERGY_GAIN').filter(n => n.target === 'Jingliu').length
  const jy = run({ team: [{ kitId: 'jingyuan' }, { kitId: 'danheng' }], techniques: ['jingyuan'], cycles: 3 })
  const jyFirst = jy.logLines.some(l => /Lightning-Lord acts \(6 hits\)/.test(l))
  const rb = run({ team: [{ kitId: 'robin' }, { kitId: 'danheng' }], techniques: ['robin'], cycles: 1 })
  const rbEn = all(rb, 'ENERGY_GAIN').filter(n => n.target === 'Robin' && ((n.payload as { n?: number })?.n ?? 0) >= 5).length

  const mi = run({ team: [{ kitId: 'misha' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['misha'], cycles: 1 })
  const miTech = mi.logLines.some(l => /Technique: next Ultimate \+2 hits/.test(l))
  const li = run({ team: [{ kitId: 'lingsha' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['lingsha'], cycles: 1 })
  const liSummon = li.logLines.some(l => /summons Fuyuan/.test(l))
  const liBefog = li.buffLog.filter(b => b.id === 'lingsha_befog')
  const tp = run({ team: [{ kitId: 'topaz' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['topaz'], cycles: 2 })
  const tpTech = tp.logLines.some(l => /Numby first attack → \+60 Energy/.test(l))

  const ff = run({ team: [{ kitId: 'firefly' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['firefly'], cycles: 1 })
  const ffFire = all(ff, 'DAMAGE_DEALT').filter(n => n.source === 'Firefly' && n.element === 'Fire').length
  const ax = run({ team: [{ kitId: 'anaxa' }, { kitId: 'danheng' }], enemy: mob({ count: 2, weaknesses: ['Quantum'] }), techniques: ['anaxa'], cycles: 1 })
  const axWeak = ax.logLines.filter(l => /gains \w+ weakness \(Anaxa\)/.test(l)).length
  const hh = run({ team: [{ kitId: 'huohuo' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['huohuo'], cycles: 1 })
  const hhAtk = hh.buffLog.filter(b => b.id === 'huohuo_tech_atk')
  const dr = run({ team: [{ kitId: 'dr_ratio' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['dr_ratio'], cycles: 1 })
  const drSpd = dr.buffLog.filter(b => b.id === 'dr_tech_spd')

  const wl = run({ team: [{ kitId: 'welt' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['welt'], cycles: 1 })
  const wlImprison = wl.buffLog.filter(b => b.id === 'welt_tech_imprison')
  const jd = run({ team: [{ kitId: 'jade' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['jade'], cycles: 1 })
  const jdQuant = all(jd, 'DAMAGE_DEALT').filter(n => n.source === 'Jade' && n.element === 'Quantum').length
  const jdPawn = jd.buffLog.some(b => b.id === 'jade_pawn' && (b.mods ?? []).some(m => m.stat === 'atkPct' && Math.abs(m.value - 0.075) < 1e-6))
  const sp = run({ team: [{ kitId: 'sampo' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['sampo'], cycles: 1 })
  const spDelay = all(sp, 'ACTION_DELAY').length

  const av2 = run({ team: [{ kitId: 'ashveil' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['ashveil'], cycles: 1 })
  const avLit = all(av2, 'DAMAGE_DEALT').filter(n => n.source === 'Ashveil' && n.element === 'Lightning').length
  const avU = av2.sim.roster.find(u => u.kitId === 'ashveil')!
  const avCharge = av2.sim.rt(avU).ashCharge as number
  const yl = run({ team: [{ kitId: 'yunli' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['yunli'], cycles: 1 })
  const ylPhys = all(yl, 'DAMAGE_DEALT').filter(n => n.source === 'Yunli' && n.element === 'Physical').length
  const hysT = run({ team: [{ kitId: 'hysilens' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['hysilens'], cycles: 1 })
  const hyEnemies = hysT.sim.roster.filter(u => u.side === 'enemy')
  const hyDots = hyEnemies.map(e => e.dots.length)
  const bh = run({ team: [{ kitId: 'boothill' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['boothill'], cycles: 1 })
  const bhWeak = bh.sim.roster.filter(u => u.side === 'enemy' && u.weaknesses.includes('Physical')).length

  const fx2 = run({ team: [{ kitId: 'fuxuan' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['fuxuan'], cycles: 1 })
  const fxMatrix = fx2.buffLog.filter(b => b.id === 'fx_matrix')
  const lc = run({ team: [{ kitId: 'luocha' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['luocha'], cycles: 1 })
  const lcZone = lc.buffLog.filter(b => b.id === 'luocha_zone')
  const evT = run({ team: [{ kitId: 'evernight' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['evernight'], cycles: 1 })
  const evCd = evT.buffLog.filter(b => b.id === 'ev_skill_cd')
  const m7h = run({ team: [{ kitId: 'march7th_the_hunt' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['march7th_the_hunt'], cycles: 1 })
  const m7En = all(m7h, 'ENERGY_GAIN').filter(n => n.target === m7h.sim.roster.find(u => u.kitId === 'march7th_the_hunt')!.name && ((n.payload as { n?: number })?.n ?? 0) >= 30).length

  const md = run({ team: [{ kitId: 'mydei' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['mydei'], cycles: 1 })
  const mdImg = all(md, 'DAMAGE_DEALT').filter(n => n.source === 'Mydei' && n.element === 'Imaginary').length
  const cp = run({ team: [{ kitId: 'cipher' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['cipher'], cycles: 1 })
  const cpQuant = all(cp, 'DAMAGE_DEALT').filter(n => n.source === 'Cipher' && n.element === 'Quantum').length
  const aw2 = run({ team: [{ kitId: 'aventurine_waveflair' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['aventurine_waveflair'], cycles: 1 })
  const awU = aw2.sim.roster.find(u => u.kitId === 'aventurine_waveflair')!
  const awQuant = all(aw2, 'DAMAGE_DEALT').filter(n => n.source === awU.name && n.element === 'Quantum').length
  const awCb = aw2.sim.cbOf(awU)

  const il = run({ team: [{ kitId: 'danhengil' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['danhengil'], cycles: 1 })
  const ilImg = all(il, 'DAMAGE_DEALT').filter(n => n.source === 'Dan Heng • Imbibitor Lunae' && n.element === 'Imaginary').length
  const cy3 = run({ team: [{ kitId: 'cyrene' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['cyrene'], cycles: 1 })
  const cyZoneVal = cy3.sim.rt(cy3.sim.roster.find(u => u.kitId === 'cyrene')!).cyZone as number
  const dahl = run({ team: [{ kitId: 'the_dahlia' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['the_dahlia'], cycles: 1 })
  const dahlZone = dahl.buffLog.filter(b => b.id === 'dahl_zone')
  const rs = run({ team: [{ kitId: 'robin_summeretto' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['robin_summeretto'], cycles: 1 })
  const rsDmg = rs.buffLog.filter(b => b.id === 'rsu_tech_dmg')
  const rsAdv = all(rs, 'ACTION_ADVANCE').length

  const pe = run({ team: [{ kitId: 'pearl' }, { kitId: 'sparxie' }], enemy: mob({ count: 2 }), techniques: ['pearl'], cycles: 1 })
  const peRep = pe.sim.rt(pe.sim.roster.find(u => u.kitId === 'pearl')!).pearlRep as number
  const peDeep = pe.buffLog.filter(b => b.id === 'pearl_deep')
  const tbr = run({ team: [{ kitId: 'trailblazer_remembrance' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['trailblazer_remembrance'], cycles: 1 })
  const tbrDelay = all(tbr, 'ACTION_DELAY').length
  const tbrIce = all(tbr, 'DAMAGE_DEALT').filter(n => n.element === 'Ice').length
  const tbe = run({ team: [{ kitId: 'trailblazer_elation' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['trailblazer_elation'], cycles: 1 })
  const tbeEl = tbe.buffLog.filter(b => b.id === 'tb_el_tech')

  const sw9 = run({ team: [{ kitId: 'silver_wolf_lv999' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['silver_wolf_lv999'], cycles: 1 })
  const sw9U = sw9.sim.roster.find(u => u.kitId === 'silver_wolf_lv999')
  const sw9Cb = sw9U ? sw9.sim.cbOf(sw9U) : 0
  const dhp = run({ team: [{ kitId: 'danhengperman' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['danhengperman'], cycles: 1 })
  const dhpSummon = all(dhp, 'SUMMON_CREATED').length
  const dhpSkill = dhp.logLines.some(l => /Technique: auto-Skill/.test(l))
  const ce = run({ team: [{ kitId: 'cerydra' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['cerydra'], cycles: 1 })
  const ceU = ce.sim.roster.find(u => u.kitId === 'cerydra')
  const ceMerit = ceU ? !!((ce.sim.rt(ceU) as unknown as { mmId?: string }).mmId) : false

  const rp = run({ team: [{ kitId: 'rappa' }], enemy: mob({ count: 2 }), techniques: ['rappa'], cycles: 1 })
  const rpBreak = all(rp, 'BREAK_DAMAGE').length
  const rpTough = all(rp, 'TOUGHNESS_DAMAGE').filter(n => n.source === 'Rappa').length
  const ca = run({ team: [{ kitId: 'castorice' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['castorice'], cycles: 1 })
  const caSummon = all(ca, 'SUMMON_CREATED').some(n => /Netherwing/.test(String(n.target)))
  const caNwHalf = ca.logLines.some(l => /Netherwing at 17000 HP/.test(l))
  const caHpCost = ca.logLines.some(l => /Wail, Death's Herald/.test(l))
  const hn = run({ team: [{ kitId: 'himeko_nova' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['himeko_nova'], cycles: 1 })
  const hnSem = hn.buffLog.filter(b => b.id === 'hn_sem').length
  const hnSkill = hn.logLines.some(l => /Skill: Upraise the Vanward Cresset/.test(l))

  const yg = run({ team: [{ kitId: 'yao_guang' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['yao_guang'], cycles: 1 })
  const ygZone = yg.buffLog.filter(b => b.id === 'yg_zone').length
  const ygSkill = yg.logLines.some(l => /Skill: Decalight Unveils All/.test(l))

  const fug = run({ team: [{ kitId: 'fugue' }, { kitId: 'danheng' }], enemy: mob({ count: 2 }), techniques: ['fugue'], cycles: 1 })
  const fugScorch = fug.buffLog.filter(b => b.id === 'fugue_scorch' && (b.mods ?? []).some(m => m.stat === 'defRed' && Math.abs(m.value - 0.18) < 1e-9)).length
  const fugAdv = fug.logLines.some(l => /Percipient Shine/.test(l))

  const mbl = run({ team: [{ kitId: 'mortenax_blade' }], enemy: mob({ count: 2 }), techniques: ['mortenax_blade'], cycles: 1 })
  const mblMit = mbl.buffLog.some(b => b.id === 'mb_tech' && (b.mods ?? []).some(m => m.stat === 'mitigation' && Math.abs(m.value - 0.9) < 1e-9))
  const mblTnt = mbl.logLines.some(l => /Blade's Reach Spares None/.test(l))

  return [
    raw('requested techniques recorded at battle start', requested === JSON.stringify(['aglaea', 'sunday', 'pela']), requested),
    raw('attack technique acts at AV 0 (Garmentmaker summoned)', gm.length > 0, `summons=${gm.length}`),
    chk('buff technique arms', c, { assert: 'present', of: { type: 'NOTE', log: 'Sunday Technique' } }),
    raw('a second attack technique is skipped, not stacked', skipped),

    chk('Dan Heng Technique: self ATK +40% for 3 turns', d, { assert: 'buff', id: 'danheng_tech', target: 'Dan Heng', turns: 3 }),
    chk('Dan Heng Technique: atkPct value', d, { assert: 'buffStat', id: 'danheng_tech', stat: 'atkPct', value: 0.4 }),
    chk('Herta Technique: self ATK +40%', h, { assert: 'buffStat', id: 'herta_tech', stat: 'atkPct', value: 0.4 }),
    chk('The Herta Technique: self ATK +60% for 2 turns', th, { assert: 'buff', id: 'the_herta_tech', turns: 2 }),
    chk('The Herta Technique: atkPct value', th, { assert: 'buffStat', id: 'the_herta_tech', stat: 'atkPct', value: 0.6 }),
    chk('Bronya Technique: all allies ATK +15%', br, { assert: 'buffStat', id: 'bronya_tech', stat: 'atkPct', value: 0.15 }),
    chk('Bronya Technique: reaches an off-Bronya ally', br, { assert: 'buff', id: 'bronya_tech', target: 'Dan Heng' }),
    chk('Kafka Technique: AoE Shock (attack kind)', kf, { assert: 'present', of: { type: 'DOT_APPLIED', payload: { kind: 'Shock' } } }),
    chk('Kafka Technique: enemy takes Lightning DMG', kf, { assert: 'present', of: { type: 'DAMAGE_DEALT', element: 'Lightning' } }),

    chk('Gepard Technique: shield armed (2 turns)', gp, { assert: 'buff', id: 'gepard_tech_shield', turns: 2 }),
    raw('Gepard Technique: shield on every ally (positive value)', gpShield.length === 2 && gpShield.every(b => (b.shield ?? 0) > 0), `n=${gpShield.length} sh=${gpShield.map(b => b.shield).join('/')}`),
    raw('Bailu Technique: Invigoration on all allies (2 turns)', blInv.length === 2 && blInv.every(b => b.turns === 2), `n=${blInv.length} turns=${blInv.map(b => b.turns).join('/')}`),
    raw('Lynx Technique: HoT on all allies (Talent heal, outlives one tick)', lxHots.length === 2 && lxHots.every(h => h.heal > 0 && h.turns >= 1), `n=${lxHots.length} turns=${lxHots.map(h => h.turns).join('/')}`),
    chk('Sushang Technique: AoE Physical (attack kind)', su, { assert: 'present', of: { type: 'DAMAGE_DEALT', element: 'Physical' } }),
    raw('Sushang Technique: AoE across 2 enemies', suHits >= 2, `hits=${suHits}`),

    raw('Tingyun Technique: +50 Energy at battle start', tyGains >= 1, `gains=${tyGains}`),
    raw('Qingque Technique: draws 2 tiles (Game Solitaire)', qqDraws === 2, `draws=${qqDraws}`),
    raw('Black Swan Technique: Arcana chain lands', bsChain >= 1, `logs=${bsChain}`),
    raw('TB Preservation Technique: self shield (>0, 1 turn)', tbpShield.length === 1 && (tbpShield[0].shield ?? 0) > 0 && tbpShield[0].turns === 1, `n=${tbpShield.length} sh=${tbpShield[0]?.shield}`),
    raw('TB Destruction Technique: heals all allies', tbdHeals === 2, `heals=${tbdHeals}`),
    chk('TB Harmony Technique: allies Break Effect +30%', tbh, { assert: 'buffStat', id: 'tb_harm_tech_be', stat: 'be', value: 0.30 }),

    chk('Arlan Technique: AoE Lightning (attack kind)', ar, { assert: 'present', of: { type: 'DAMAGE_DEALT', source: 'Arlan', element: 'Lightning' } }),
    raw('Arlan Technique: AoE across 2 enemies', arHits >= 2, `hits=${arHits}`),
    chk('Asta Technique: AoE Fire (attack kind)', as, { assert: 'present', of: { type: 'DAMAGE_DEALT', source: 'Asta', element: 'Fire' } }),
    raw('Asta Technique: AoE across 2 enemies', asHits >= 2, `hits=${asHits}`),
    chk('Xueyi Technique: AoE Quantum (attack kind)', xy, { assert: 'present', of: { type: 'DAMAGE_DEALT', source: 'Xueyi', element: 'Quantum' } }),
    raw('Xueyi Technique: AoE across 2 enemies', xyHits >= 2, `hits=${xyHits}`),
    raw('Hook Technique: Burns every enemy', hkBurn >= 2, `burns=${hkBurn}`),
    chk('Hook Technique: Fire DMG dealt', hk, { assert: 'present', of: { type: 'DAMAGE_DEALT', source: 'Hook', element: 'Fire' } }),
    raw('Hook Technique: single-target Fire hit', hkFire >= 1, `hits=${hkFire}`),
    raw('Guinaifen Technique: 4 Fire hits', guiFire >= 4, `hits=${guiFire}`),
    raw('Guinaifen Technique: Firekiss inflicted', guiKiss >= 1, `kiss=${guiKiss}`),

    raw('Himeko Technique: enemy Fire DMG taken +10% (2 turns)', hmFire.length === 1 && (hmFire[0].turns ?? 0) === 2 && (hmFire[0].mods ?? []).some(m => m.stat === 'vuln:Fire' && Math.abs(m.value - 0.1) < 1e-9), `n=${hmFire.length}`),
    chk('Serval Technique: AoE Lightning (attack kind)', sv, { assert: 'present', of: { type: 'DAMAGE_DEALT', source: 'Serval', element: 'Lightning' } }),
    raw('Serval Technique: Shocks all enemies', svShock >= 2, `shocks=${svShock}`),
    chk('Clara Technique: self aggro buff (2 turns)', cl, { assert: 'buff', id: 'clara_tech_aggro', turns: 2 }),
    raw('Clara Technique: aggro +150', clAggro.some(b => (b.mods ?? []).some(m => m.stat === 'aggro' && m.value === 150)), `n=${clAggro.length}`),
    chk('Yanqing Technique: self DMG +30%', yq, { assert: 'buffStat', id: 'yanqing_tech', stat: 'dmgAll', value: 0.30 }),
    raw('Hyacine Technique: allies Max HP +20% (2 turns)', hyHp.length === 2 && hyHp.every(b => (b.turns ?? 0) === 2 && (b.mods ?? []).some(m => m.stat === 'hpPct' && Math.abs(m.value - 0.2) < 1e-9)), `n=${hyHp.length}`),

    raw('Argenti Technique: AoE Physical across 2 enemies', agPhys >= 2, `hits=${agPhys}`),
    raw('Argenti Technique: +15 Energy', agEn >= 1, `gains=${agEn}`),
    raw('Sparxie Technique: AoE Fire across 2 enemies', sxFire >= 2, `hits=${sxFire}`),
    raw('Sparxie Technique: recovers Skill Points', sxSp >= 1, `sp=${sxSp}`),
    raw('Sparkle Technique: +20 Energy', spkEn >= 1, `gains=${spkEn}`),
    raw('Sparkle Technique: +3 Skill Points', spkSp >= 1, `sp=${spkSp}`),
    chk('Seele Technique: Quantum DMG (guaranteed crit)', se, { assert: 'present', of: { type: 'DAMAGE_DEALT', source: 'Seele', element: 'Quantum' } }),
    chk('Moze Technique: self DMG +30%', mz, { assert: 'buffStat', id: 'moze_tech', stat: 'dmgAll', value: 0.30 }),

    raw('March 7th Technique: Freezes a random enemy', m7Freeze >= 1, `freeze=${m7Freeze}`),
    raw('Natasha Technique: Weaken on all enemies (30%, 1 turn)', ntWeaken.length === 2 && ntWeaken.every(b => (b.turns ?? 0) === 1 && (b.mods ?? []).some(m => m.stat === 'weaken' && Math.abs(m.value - 0.3) < 1e-9)), `n=${ntWeaken.length}`),
    raw('Natasha Technique: Physical DMG to a random enemy', ntPhys >= 1, `hits=${ntPhys}`),
    raw('Luka Technique: inflicts Skill Bleed', lkBleed >= 1, `bleed=${lkBleed}`),
    raw('Hanya Technique: applies Burden to an enemy', hy2Burden.length >= 1, `n=${hy2Burden.length}`),
    raw('Silver Wolf Technique: AoE Quantum across 2 enemies', swQuantum >= 2, `hits=${swQuantum}`),

    raw('Archer Technique: AoE Quantum across 2 enemies', arcQ >= 2, `hits=${arcQ}`),
    raw('Jiaoqiu Technique: AoE Fire across 2 enemies', jqFire >= 2, `hits=${jqFire}`),
    raw('Jiaoqiu Technique: applies Ashen Roast to every enemy', jqRoast >= 2, `roast=${jqRoast}`),
    raw('Tribbie Technique: Numinosity arms RES PEN on allies', tbRes.length >= 2, `n=${tbRes.length}`),
    raw('Evanescia Technique: AoE Physical across 2 enemies', evPhys >= 2, `hits=${evPhys}`),

    raw('Feixiao Technique: AoE Wind across 2 enemies', fxWind >= 2, `hits=${fxWind}`),
    raw('Feixiao Technique: +1 Flying Aureus', fxAureus),
    raw('Yukong Technique: Roaring Bowstrings on allies (2 stacks)', ykBow.length >= 2 && ykBow.every(b => b.stacks === 2), `n=${ykBow.length} st=${ykBow.map(b => b.stacks).join('/')}`),
    raw('Acheron Technique: AoE Lightning across 2 enemies', acLt >= 2, `hits=${acLt}`),
    raw('Phainon Technique: AoE Physical across 2 enemies', phPhys >= 2, `hits=${phPhys}`),
    raw('Phainon Technique: +25 Energy for allies', phEn >= 2, `gains=${phEn}`),
    raw('Phainon Technique: recovers a Skill Point', phSp >= 1, `sp=${phSp}`),

    raw('Blade Technique: AoE Wind across 2 enemies', blWind >= 2, `hits=${blWind}`),
    raw('Blade Technique: consumes Max HP (self-cost)', blCost),
    raw('Jingliu Technique: Freezes all enemies', jlFreeze >= 2, `freeze=${jlFreeze}`),
    raw('Jingliu Technique: +15 Energy', jlEn >= 1, `gains=${jlEn}`),
    raw('Jingliu Technique: Frozen Additional DMG', jlFrozenDmg),
    raw('Jing Yuan Technique: Lightning-Lord +3 hits first turn', jyFirst),
    raw('Robin Technique: +5 Energy', rbEn >= 1, `gains=${rbEn}`),

    raw('Misha Technique: next Ultimate +2 hits', miTech),
    raw('Lingsha Technique: summons Fuyuan at battle start', liSummon),
    raw('Lingsha Technique: Befog on all enemies (2 turns)', liBefog.length === 2 && liBefog.every(b => b.turns === 2), `n=${liBefog.length}`),
    raw('Topaz Technique: +60 Energy after Numby first attack', tpTech),

    raw('Firefly Technique: AoE Fire across 2 enemies', ffFire >= 2, `hits=${ffFire}`),
    raw('Anaxa Technique: applies Weakness to all enemies', axWeak >= 2, `n=${axWeak}`),
    raw('Huohuo Technique: ATK −25% on all enemies (2 turns)', hhAtk.length === 2 && hhAtk.every(b => b.turns === 2 && (b.mods ?? []).some(m => m.stat === 'atkPct' && Math.abs(m.value + 0.25) < 1e-9)), `n=${hhAtk.length}`),
    raw('Dr. Ratio Technique: SPD −15% on all enemies (2 turns)', drSpd.length === 2 && drSpd.every(b => b.turns === 2 && (b.mods ?? []).some(m => m.stat === 'spdPct' && Math.abs(m.value + 0.15) < 1e-9)), `n=${drSpd.length}`),

    raw('Welt Technique: Imprison all enemies (SPD −10%, 1 turn)', wlImprison.length === 2 && wlImprison.every(b => b.turns === 1 && (b.mods ?? []).some(m => m.stat === 'spdDown' && Math.abs(m.value - 0.1) < 1e-9)), `n=${wlImprison.length}`),
    raw('Jade Technique: AoE Quantum across 2 enemies', jdQuant >= 2, `hits=${jdQuant}`),
    raw('Jade Technique: gains 15 Pawned Asset', jdPawn),
    raw('Sampo Technique: delays all enemies 25%', spDelay >= 2, `delays=${spDelay}`),

    raw('Ashveil Technique: AoE Lightning across 2 enemies', avLit >= 2, `hits=${avLit}`),
    raw('Ashveil Technique: +1 Charge (2→3)', avCharge === 3, `charge=${avCharge}`),
    raw('Yunli Technique: Intuit: Cull on a random enemy', ylPhys >= 2, `hits=${ylPhys}`),
    raw('Hysilens Technique: 2 Talent DoTs on every enemy', hyDots.length === 2 && hyDots.every(n => n >= 2), `dots=${hyDots.join('/')}`),
    raw('Boothill Technique: first Skill applies Physical Weakness', bhWeak >= 1, `n=${bhWeak}`),

    raw('Fu Xuan Technique: Matrix of Prescience at battle start (2 turns)', fxMatrix.length >= 1 && fxMatrix[0].turns === 2, `n=${fxMatrix.length} turns=${fxMatrix[0]?.turns}`),
    raw('Luocha Technique: Prayer of Abyss Flower field at battle start (2 turns)', lcZone.length >= 1 && lcZone[0].turns === 2, `n=${lcZone.length} turns=${lcZone[0]?.turns}`),
    raw('Evernight Technique: ally memosprites gain Skill CRIT DMG buff', evCd.length >= 1, `n=${evCd.length}`),
    raw('March 7th (Hunt) Technique: +30 Energy at battle start', m7En >= 1, `gains=${m7En}`),

    raw('Mydei Technique: AoE Imaginary across 2 enemies (HP-scaled)', mdImg >= 2, `hits=${mdImg}`),
    raw('Mydei Technique: accumulates 50 charge', md.logLines.some(l => /Mydei: Charge → 50 \//.test(l)), md.logLines.filter(l => /Mydei: Charge/.test(l)).join(' | ')),
    raw('Cipher Technique: AoE Quantum across 2 enemies', cpQuant >= 2, `hits=${cpQuant}`),
    raw('Aventurine (Waveflair) Technique: AoE Quantum across 2 enemies', awQuant >= 2, `hits=${awQuant}`),
    raw('Aventurine (Waveflair) Technique: +20 Certified Banger', awCb >= 20, `cb=${awCb}`),

    raw('Dan Heng (IL) Technique: AoE Imaginary across 2 enemies', ilImg >= 2, `hits=${ilImg}`),
    raw('Cyrene Technique: deploys Elysium Zone', cyZoneVal > 0, `zone=${cyZoneVal}`),
    raw('The Dahlia Technique: deploys Skill Zone on allies', dahlZone.length >= 2, `n=${dahlZone.length}`),
    raw('Robin (Summeretto) Technique: allies +30% DMG (2 turns)', rsDmg.length >= 2 && rsDmg.every(b => b.turns === 2), `n=${rsDmg.length}`),
    raw('Robin (Summeretto) Technique: advances action 20%', rsAdv >= 1, `adv=${rsAdv}`),

    raw('Pearl Technique: +20 Certified Banger (Repellency)', peRep >= 20, `rep=${peRep}`),
    raw('Pearl Technique: Deep Learning on the Aesthetic Archetype', peDeep.length >= 1, `n=${peDeep.length}`),
    raw('TB (Remembrance) Technique: delays all enemies', tbrDelay >= 2, `delays=${tbrDelay}`),
    raw('TB (Remembrance) Technique: AoE Ice across 2 enemies', tbrIce >= 2, `hits=${tbrIce}`),
    raw('TB (Elation) Technique: allies gain Elation (3 turns)', tbeEl.length >= 2 && tbeEl.every(b => b.turns === 3), `n=${tbeEl.length}`),

    raw('Silver Wolf LV.999 Technique: +99 Certified Banger at wave start', sw9Cb >= 99, `cb=${sw9Cb}`),
    raw('Dan Heng (Permansor Terrae) Technique: auto-Skill summons Souldragon', dhpSummon >= 1, `summons=${dhpSummon}`),
    raw('Dan Heng (Permansor Terrae) Technique: auto-Skill (no SP) fires', dhpSkill, dhp.logLines.filter(l => /auto-Skill/.test(l)).join(' | ')),
    raw('Cerydra Technique: auto-Skill grants Merit', ceMerit, `merit=${ceMerit}`),

    raw('Rappa Technique: Break DMG on each enemy', rpBreak >= 2, `break=${rpBreak}`),
    raw('Rappa Technique: Toughness Reduction ignores Weakness Type', rpTough >= 2, `tough=${rpTough}`),
    raw('Castorice Technique: summons Netherwing at 50% max Newbud HP', caSummon && caNwHalf, `summon=${caSummon} half=${caNwHalf}`),
    raw('Castorice Technique: consumes 40% of allies current HP', caHpCost, caHpCost ? 'ok' : 'no log'),
    raw('Himeko • Nova Technique: auto-Skill fires (Semaphore)', hnSkill && hnSem >= 1, `skill=${hnSkill} sem=${hnSem}`),
    raw('Yao Guang Technique: auto-Skill without SP (Decalight zone)', ygSkill && ygZone >= 1, `skill=${ygSkill} zone=${ygZone}`),
    raw('Fugue Technique: Percipient Shine (DEF↓ 18% 2t on enemies)', fugScorch >= 1 && fugAdv, `scorch=${fugScorch} adv=${fugAdv}`),
    raw('Mortenax Blade Technique: Taunt 1t + DMG taken −90% 2t', mblMit && mblTnt, `mit=${mblMit} taunt=${mblTnt}`),
  ]
}
