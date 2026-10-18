import type { KitDef } from '../kit'
import { pelaKit, guinaifenKit, weltKit, kafkaKit, silverwolfKit, lukaKit, blackswanKit, cipherKit, fugueKit, sampoKit, jiaoqiuKit, acheronKit, hysilensKit, the_dahliaKit, mortenaxBladeKit } from './nihility'
import { aglaeaKit, hyacineKit, castoriceKit, evernightKit, cyreneKit, trailblazerRemembranceKit, robinSummerettoKit } from './remembrance'
import { jingyuanKit, himekoKit, hertaKit, servalKit, qingqueKit, argentiKit, jadeKit, rappaKit, the_hertaKit, anaxaKit, rinKit, himekoNovaKit } from './erudition'
import { seeleKit, danhengKit, topazKit, yanqingKit, feixiaoKit, dr_ratioKit, mozeKit, boothillKit, archerKit, ashveilKit, sushangKit, march7thTheHuntKit } from './hunt'
import { fireflyKit, bladeKit, danhengilKit, arlanKit, jingliuKit, phainonKit, claraKit, hookKit, xueyiKit, mishaKit, yunliKit, mydeiKit, saberKit, gilgameshKit, trailblazerDestructionKit } from './destruction'
import { bronyaKit, sparkleKit, yukongKit, astaKit, tingyunKit, tribbieKit, sundayKit, cerydraKit, hanyaKit, ruanmeiKit, robinKit, trailblazerHarmonyKit } from './harmony'
import { march7thKit, fuxuanKit, gepardKit, danhengpermanKit, aventurineKit, trailblazerPreservationKit } from './preservation'
import { sparxieKit, yao_guangKit, trailblazerElationKit, pearlKit, evanesciaKit, aventurineWaveflairKit, silverWolfLv999Kit } from './elation'
import { gallagherKit, huohuoKit, luochaKit, natashaKit, lynxKit, bailuKit, lingshaKit } from './abundance'

export const KITS: KitDef[] = [seeleKit, jingyuanKit, fireflyKit, bronyaKit, pelaKit, guinaifenKit, sparkleKit, gallagherKit, huohuoKit, march7thKit, danhengKit, himekoKit, weltKit, kafkaKit, silverwolfKit, luochaKit, yukongKit, bladeKit, lukaKit, danhengilKit, fuxuanKit, astaKit, arlanKit, hertaKit, servalKit, gepardKit, natashaKit, lynxKit, topazKit, jingliuKit, tingyunKit, blackswanKit, sparxieKit, yao_guangKit, aglaeaKit, hyacineKit, tribbieKit, sundayKit, danhengpermanKit, cipherKit, cerydraKit, castoriceKit, phainonKit, aventurineKit, fugueKit, claraKit, sampoKit, hookKit, qingqueKit, yanqingKit, bailuKit, xueyiKit, hanyaKit, mishaKit, jiaoqiuKit, feixiaoKit, yunliKit, lingshaKit, argentiKit, ruanmeiKit, dr_ratioKit, mozeKit, acheronKit, robinKit, jadeKit, boothillKit, rappaKit, the_hertaKit, mydeiKit, anaxaKit, hysilensKit, evernightKit, cyreneKit, saberKit, archerKit, rinKit, gilgameshKit, trailblazerPreservationKit, trailblazerHarmonyKit, trailblazerRemembranceKit, trailblazerDestructionKit, trailblazerElationKit, pearlKit, ashveilKit, the_dahliaKit, sushangKit, evanesciaKit, mortenaxBladeKit, aventurineWaveflairKit, himekoNovaKit, silverWolfLv999Kit, robinSummerettoKit, march7thTheHuntKit]

export function kitById(id: string): KitDef | undefined {
  return KITS.find(k => k.id === id)
}

/** canonical Path per kit; fills base.path for kit defs that don't set it (Izumo same-Path gate, Lynx aggro) */
export const KIT_PATH: Record<string, string> = {
  seele: 'Hunt',
  danheng: 'Hunt',
  topaz: 'Hunt',
  yanqing: 'Hunt',
  feixiao: 'Hunt',
  moze: 'Hunt',
  archer: 'Hunt',
  sushang: 'Hunt',
  march7th: 'Preservation',
  fuxuan: 'Preservation',
  // Destruction
  jingliu: 'Destruction',
  firefly: 'Destruction',
  danhengil: 'Destruction',
  blade: 'Destruction',
  arlan: 'Destruction',
  clara: 'Destruction',
  hook: 'Destruction',
  misha: 'Destruction',
  xueyi: 'Destruction',
  yunli: 'Destruction',
  saber: 'Destruction',
  bailu: 'Abundance',
  hanya: 'Harmony',
  // Erudition
  himeko: 'Erudition',
  himeko_nova: 'Erudition',
  jingyuan: 'Erudition',
  herta: 'Erudition',
  qingque: 'Erudition',
  rin: 'Erudition',
  // Nihility
  pela: 'Nihility',
  acheron: 'Nihility',
  guinaifen: 'Nihility',
  kafka: 'Nihility',
  blackswan: 'Nihility',
  silverwolf: 'Nihility',
  welt: 'Nihility',
  luka: 'Nihility',
  sampo: 'Nihility',
  jiaoqiu: 'Nihility',
  // Harmony
  bronya: 'Harmony',
  sparkle: 'Harmony',
  robin: 'Harmony',
  asta: 'Harmony',
  tingyun: 'Harmony',
  yukong: 'Harmony',
  sunday: 'Harmony',
  tribbie: 'Harmony',
  ruanmei: 'Harmony',
  // Nihility (Warlock)
  cipher: 'Nihility',
  // Preservation
  danhengperman: 'Preservation',
  gepard: 'Preservation',
  // Abundance
  lynx: 'Abundance',
  gallagher: 'Abundance',
  luocha: 'Abundance',
  huohuo: 'Abundance',
  natasha: 'Abundance',
  lingsha: 'Abundance',
  // Remembrance (Memosprite)
  aglaea: 'Remembrance',
  hyacine: 'Remembrance',
  castorice: 'Remembrance',
  sparxie: 'Elation',
  yao_guang: 'Elation',
  pearl: 'Elation',
  // Hunt
  dr_ratio: 'Hunt',
  // Erudition
  argenti: 'Erudition',
  jade: 'Erudition',
  rappa: 'Erudition',
  boothill: 'Hunt',
  trailblazer_preservation: 'Preservation',
  trailblazer_harmony: 'Harmony',
  trailblazer_remembrance: 'Remembrance',
  trailblazer_destruction: 'Destruction',
  trailblazer_elation: 'Elation',
  // Endgame 6
  the_herta: 'Erudition',
  mydei: 'Destruction',
  anaxa: 'Erudition',
  hysilens: 'Nihility',
  evernight: 'Remembrance',
  cyrene: 'Remembrance',
  // Warlock / fan kits
  cerydra: 'Harmony',
  phainon: 'Destruction',
  aventurine: 'Preservation',
  fugue: 'Nihility',
  // Erudition
  serval: 'Erudition',
  gilgamesh: 'Destruction',
  // Hunt / Nihility
  ashveil: 'Hunt',
  the_dahlia: 'Nihility',
  evanescia: 'Elation',
  aventurine_waveflair: 'Elation',
  mortenax_blade: 'Nihility',
  silver_wolf_lv999: 'Elation',
  robin_summeretto: 'Remembrance',
  march7th_the_hunt: 'Hunt',
}
