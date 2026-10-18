"""Generate src/core/presets.ts (recommended relic sets / lightcones / teams)
   from hsr-data/characters.json + relicsets.json + lightcones.json.

   Sim gear keys are matched to data by English name (gear.ts hardcodes them).
   Rerun after a gear.ts / data refresh.
"""
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "hsr-data")
OUT = os.path.join(ROOT, "src", "core", "presets.ts")

# --- gear.ts name -> sim key (source of truth: src/core/gear.ts) ---
RELIC = {
    "Passerby of Wandering Cloud": "passerby",
    "Musketeer of Wild Wheat": "musketeer",
    "Knight of Purity Palace": "knight",
    "Hunter of Glacial Forest": "hunter_glacial",
    "Champion of Streetwise Boxing": "boxing",
    "Guard of Wuthering Snow": "guard",
    "Firesmith of Lava-Forging": "firesmith",
    "Genius of Brilliant Stars": "genius",
    "Band of Sizzling Thunder": "sizzling",
    "Eagle of Twilight Line": "eagle",
    "Thief of Shooting Meteor": "thief",
    "Wastelander of Banditry Desert": "wastelander",
    "Longevous Disciple": "longevous",
    "Messenger Traversing Hackerspace": "messenger",
    "The Ashblazing Grand Duke": "grand_duke",
    "Prisoner in Deep Confinement": "prisoner",
    "Pioneer Diver of Dead Waters": "pioneer",
    "Watchmaker, Master of Dream Machinations": "watchmaker",
    "Iron Cavalry Against the Scourge": "iron_cavalry",
    "The Wind-Soaring Valorous": "valorous",
    "Scholar Lost in Erudition": "scholar",
    "Hero of Triumphant Song": "hero",
    "Poet of Mourning Collapse": "poet",
    "Warrior Goddess of Sun and Thunder": "warrior_goddess",
    "Wavestrider Captain": "wavestrider",
    "World-Remaking Deliverer": "world_remaking",
    "Self-Enshrouded Recluse": "self_enshrouded",
    "Ever-Glorious Magical Girl": "magical_girl",
    "Diviner of Distant Reach": "diviner",
    "As Navigator Isee Sees It": "navigator",
    "Divine-Querying Master Smith": "smith",
}
PLANAR = {
    "Space Sealing Station": "sss",
    "Fleet of the Ageless": "fleet",
    "Inert Salsotto": "salsotto",
    "Rutilant Arena": "rutilant",
    "Talia: Kingdom of Banditry": "talia",
    "Firmament Frontline Glamoth": "glamoth",
    "Firmament Frontline: Glamoth": "glamoth",
    "Broken Keel": "broken_keel",
    "Sprightly Vonwacq": "vonwacq",
    "Pan-Cosmic Commercial Enterprise": "pan_cosmic",
    "Belobog of the Architects": "belobog",
    "Celestial Differentiator": "celestial",
    "Penacony, Land of the Dreams": "penacony",
    "Sigonia, the Unclaimed Desolation": "sigonia",
    "Izumo Gensei and Takama Divine Realm": "izumo",
    "Duran, Dynasty of Running Wolves": "duran",
    "Forge of the Kalpagni Lantern": "kalpagni",
    "Lushaka, the Sunken Seas": "lushaka",
    "The Wondrous BananAmusement Park": "banana",
    "Giant Tree of Rapt Brooding": "giant_tree",
    "Arcadia of Woven Dreams": "arcadia",
    "Revelry by the Sea": "revelry",
    "Amphoreus, The Eternal Land": "amphoreus",
    "Tengoku@Livestream": "tengoku",
    "Punklorde Stage Zero": "punklorde",
    "City of Converging Stars": "converging",
    "Fallen Star Anchorage": "fallen",
    "Cosmic Life Sciences Institute": "cosmic",
}
LIGHTCONE = {
    "In the Night": "in_the_night",
    "Night of Fright": "night_of_fright",
    "Before Dawn": "before_dawn",
    "Whereabouts Should Dreams Rest": "whereabouts",
    "Earthly Escapade": "earthly_escapade",
    "Cruising in the Stellar Sea": "cruising",
    "Resolution Shines As Pearls of Sweat": "resolution",
    "Dance! Dance! Dance!": "ddd",
    "Planetary Rendezvous": "planetary",
    "Swordplay": "swordplay",
    "Fermata": "fermata",
    "Today Is Another Peaceful Day": "tapd",
}

# characters.json property_type -> readable stat label
PROP = {
    "AttackAddedRatio": "ATK%",
    "DefenceAddedRatio": "DEF%",
    "HPAddedRatio": "HP%",
    "SpeedDelta": "SPD",
    "CriticalChanceBase": "CRIT Rate",
    "CriticalDamageBase": "CRIT DMG",
    "StatusProbabilityBase": "Effect Hit Rate",
    "StatusResistanceBase": "Effect RES",
    "BreakDamageAddedRatioBase": "Break Effect",
    "HealRatioBase": "Outgoing Healing",
    "SPRatioBase": "Energy Regen",
    "FireAddedRatio": "Fire DMG",
    "IceAddedRatio": "Ice DMG",
    "ThunderAddedRatio": "Lightning DMG",
    "WindAddedRatio": "Wind DMG",
    "QuantumAddedRatio": "Quantum DMG",
    "ImaginaryAddedRatio": "Imaginary DMG",
    "PhysicalAddedRatio": "Physical DMG",
    "AttackDelta": "ATK Flat",
}

SLOT = {"BODY": "body", "FOOT": "foot", "NECK": "neck", "OBJECT": "object"}

# max team variants emitted per kit (main + per-slot alt swaps)
TEAM_CAP = 20

# hand-tuned corrections to the auto-generated build (main stats / substats) because the
# wiki relic recommendation is not the sim-optimal line for these kits.
TUNE = {
    # aglaea's signature lightcone is not in LIGHTCONE (name miss) - kept from the sim-maintained line
    "aglaea": {"lc": ["time_woven_gold"]},
    "sparxie": {
        "main": {"body": "CRIT Rate", "foot": "SPD", "neck": "ATK%", "object": "ATK%"},
        "subs": ["CRIT Rate", "CRIT DMG", "SPD"],
    },
}
# rationale comments emitted directly above a kit's `main` line in the generated file
COMMENTS = {
    "sparxie": [
        "Elation DMG (dealElationDamage) scales from statValue=1, NOT ATK, and takes no DMG boost:",
        "only CRIT Rate/DMG, SPD and Elation/DEF-pen matter. ATK% stays on neck/object (legal mains,",
        "they only feed the ~1% ATK-scaled Bloom/ult) but the feet and one sub go to SPD.",
    ],
}

# char-name normalisation -> kit id (mirrors src/core/kits/index.ts ids)
ALIAS = {
    "dan heng": "danheng",
    "march 7th": "march7th",
    "imbibitor lunae": "danhengil",
    "dan heng • imbibitor lunae": "danhengil",
    "dan heng • permansor terrae": "danhengperman",
    "topaz & numby": "topaz",
    "the herta": "the_herta",
    "the dahlia": "the_dahlia",
    "yao guang": "yao_guang",
    "rin tohsaka": "rin",
    "aventurine • waveflair": "aventurine_waveflair",
    "himeko • nova": "himeko_nova",
    # wiki name has no separator - norm_name() would give "mortenaxblade"
    "mortenax blade": "mortenax_blade",
    # wiki name carries <unbreak> markup: "Silver Wolf LV.<unbreak>999</unbreak>"
    "silver wolf lv.999": "silver_wolf_lv999",
    "robin • summeretto": "robin_summeretto",
}

# тёзки: записи с одинаковым именем разводятся по base_type (в characters.json две записи
# `name: "March 7th"` — Preservation и The Hunt, top-level `id` у записей null)
ALIAS_BY_TYPE = {
    ("march 7th", "the hunt"): "march7th_the_hunt",
}


def norm_name(name):
    low = name.lower().strip()
    # drop wiki markup tags (<unbreak>...</unbreak>, <img .../>) so they don't leak into the id
    low = re.sub(r"<[^>]*>", "", low)
    if low in ALIAS:
        return ALIAS[low]
    return "".join(c for c in low if c.isalnum())


def kit_id(c):
    low = re.sub(r"<[^>]*>", "", c["name"].lower().strip())
    by_type = ALIAS_BY_TYPE.get((low, c.get("base_type", "").lower()))
    return by_type if by_type else norm_name(c["name"])


KITS = [
    "seele", "jingyuan", "firefly", "bronya", "pela", "guinaifen", "sparkle",
    "gallagher", "huohuo", "march7th", "danheng", "himeko", "welt", "kafka",
    "silverwolf", "luocha", "yukong", "blade", "luka", "fuxuan", "lynx",
    "jingliu", "tingyun", "blackswan", "sparxie", "aglaea", "hyacine",
    "tribbie", "sunday", "cipher", "cerydra", "castorice", "phainon",
    "aventurine", "fugue", "herta", "serval", "gepard", "natasha",
    "clara", "sampo", "hook",
    "danhengil", "asta", "arlan", "topaz", "danhengperman",
    "qingque", "yanqing", "sushang",
    "bailu", "xueyi", "hanya", "misha",
    "jiaoqiu", "feixiao", "yunli", "lingsha",
    "ruanmei", "argenti", "moze", "acheron", "robin", "jade", "boothill", "rappa",
    "saber", "archer", "rin", "gilgamesh",
    "yao_guang", "the_herta", "mydei", "anaxa", "hysilens", "evernight", "cyrene",
    "pearl", "ashveil", "the_dahlia", "evanescia", "mortenax_blade",
    "aventurine_waveflair", "himeko_nova", "silver_wolf_lv999", "robin_summeretto",
    "march7th_the_hunt",
]

TRAILBLAZER = {8001, 8002, 8003, 8004, 8005, 8006, 8007}


def main():
    chars = json.load(open(os.path.join(DATA, "characters.json"), encoding="utf-8"))
    chars = list(chars.values()) if isinstance(chars, dict) else chars

    # kit -> chars record
    kit_char = {}
    for c in chars:
        k = kit_id(c)
        if k in KITS and k not in kit_char:
            kit_char[k] = c

    # avatar_id -> kit (avatar id lives in relics.avatar_id, not top-level id)
    avatar_kit = {}
    for c in chars:
        k = norm_name(c["name"])
        rel = c.get("relics") or {}
        aid = rel.get("avatar_id")
        if k in KITS and aid is not None:
            avatar_kit[str(aid)] = k

    # character name -> kit id (teams are now names-only)
    name_kit = {}
    for c in chars:
        k = norm_name(c["name"])
        if k in KITS:
            name_kit[c["name"].lower()] = k

    def map_names(names, kind):
        table = RELIC if kind == "relic" else PLANAR if kind == "planar" else LIGHTCONE
        out, skipped = [], []
        for n in names:
            key = table.get(n)
            if key and key not in out:
                out.append(key)
            else:
                skipped.append((n, key or "no-key"))
        return out, skipped

    def map_team(member_names):
        team, skipped = [], []
        for name in member_names:
            low = name.lower().strip()
            k = name_kit.get(low) or norm_name(low)
            if k in KITS and k not in team:
                team.append(k)
            else:
                skipped.append((name, "no-kit"))
        return team, skipped

    presets = {}
    report = []

    for k in KITS:
        c = kit_char.get(k)
        if not c:
            report.append(f"{k}: NO CHARACTER DATA")
            continue
        rel = c.get("relics") or {}
        # relic 4pc (best first), planar = set2, both already resolved to names
        relic4, s1 = map_names(rel.get("set4", []), "relic")
        planar, s2 = map_names(rel.get("set2", []), "planar")
        lc, s3 = map_names(c.get("lightcones") or [], "lightcone")
        # main stats
        main = {"body": "-", "foot": "-", "neck": "-", "object": "-"}
        for p in rel.get("main", []) or []:
            slot = p.get("slot")
            if slot in main:
                main[slot] = p.get("stat", "-")
        subs = list(rel.get("subs") or [])
        # teams (best usable first): each entry = main `list` + per-slot `alt`
        # single-swap variants (replace slot i with each mapped alternative)
        teams = []
        for t in (c.get("teams") or []):
            members = t.get("list") or []
            if not members:
                continue
            team, _skip = map_team(members)
            if not team:
                continue
            if team not in teams:
                teams.append(team)
            alts = t.get("alt") or []
            for i in range(len(team)):
                for alt_name in (alts[i] if i < len(alts) else []):
                    ak = name_kit.get(alt_name.lower().strip()) or norm_name(alt_name)
                    if ak not in KITS or ak in team:
                        continue
                    variant = list(team)
                    variant[i] = ak
                    if variant not in teams:
                        teams.append(variant)
                    if len(teams) >= TEAM_CAP:
                        break
                if len(teams) >= TEAM_CAP:
                    break
            if len(teams) >= TEAM_CAP:
                break
        # wiki team recommendations list only the OTHER members for some chars
        # (Aventurine • Waveflair) — the carrier leads the sim team, so put it back
        # AFTER the per-slot alt swaps (which index into the wiki member order)
        teams = [[k] + t for t in teams if k not in t]
        presets[k] = {
            "relic4": relic4, "planar": planar, "lc": lc,
            "main": main, "subs": subs, "teams": teams,
        }
        report.append(
            f"{k}: relic4={relic4} planar={planar} lc={lc} "
            f"main={main['body']}/{main['foot']}/{main['neck']}/{main['object']} "
            f"subs={subs} teams={len(teams)}"
        )

    # apply hand-tuned build corrections over the auto-generated main/subs
    for k, v in TUNE.items():
        if k in presets:
            presets[k].update(v)

    # manual presets for kits not in characters.json
    MANUAL = {
        "danhengperman": {
            "relic4": ["wastelander", "boxing", "musketeer"],
            "planar": ["rutilant", "salsotto"],
            "lc": [],
            "main": {"body": "CRIT Rate", "foot": "ATK%", "neck": "Physical DMG", "object": "ATK%"},
            "subs": ["CRIT Rate", "CRIT DMG", "ATK%"],
            "teams": [["phainon"]],
        },
        "trailblazer_destruction": {
        "relic4": ["boxing", "pioneer", "musketeer"],
        "planar": ["rutilant", "salsotto"],
        "lc": ["something_irreplaceable", "secret_vow"],
        "main": {"body": "CRIT Rate", "foot": "SPD", "neck": "Physical DMG", "object": "ATK%"},
        "subs": ["CRIT Rate", "CRIT DMG", "ATK%", "SPD"],
        "teams": [["tribbie", "hyacine"], ["robin", "sunday"]],
    },
    "trailblazer_elation": {
        "relic4": ["magical_girl", "diviner"],
        "planar": ["punklorde", "tengoku"],
        "lc": ["dazzled", "summer_rides_surf"],
        "main": {"body": "CRIT Rate", "foot": "SPD", "neck": "Lightning DMG", "object": "Energy Regen"},
        "subs": ["CRIT Rate", "CRIT DMG", "ATK%", "SPD"],
        "teams": [["sparxie", "hyacine"]],
    },
    "trailblazer_harmony": {
        "relic4": ["messenger", "eagle", "guard"],
        "planar": ["lushaka", "broken_keel", "fleet"],
        "lc": ["past_future", "ddd", "planetary"],
        "main": {"body": "HP%", "foot": "SPD", "neck": "HP%", "object": "Energy Regen"},
        "subs": ["SPD", "HP%", "Effect RES"],
        "teams": [["phainon", "cerydra"]],
    },
    "trailblazer_preservation": {
        "relic4": ["knight", "passerby", "guard"],
        "planar": ["belobog", "broken_keel", "fleet"],
        "lc": ["moment_victory", "texture_memories"],
        "main": {"body": "DEF%", "foot": "SPD", "neck": "DEF%", "object": "Energy Regen"},
        "subs": ["SPD", "DEF%", "Effect RES"],
        "teams": [["phainon", "cerydra"]],
    },
    "trailblazer_remembrance": {
        "relic4": ["hero", "world_remaking", "musketeer"],
        "planar": ["banana", "amphoreus", "fleet"],
        "lc": ["time_woven_gold", "victory_blink"],
        "main": {"body": "CRIT Rate", "foot": "SPD", "neck": "Ice DMG", "object": "Energy Regen"},
        "subs": ["CRIT Rate", "CRIT DMG", "ATK%", "SPD"],
        "teams": [["aglaea", "hyacine"], ["sunday", "tribbie"]],
    },
    "dr_ratio": {
            "relic4": ["wastelander", "musketeer"],
            "planar": ["rutilant", "sss", "salsotto"],
            "lc": [],
            "main": {"body": "CRIT Rate", "foot": "SPD", "neck": "Imaginary DMG", "object": "ATK%"},
            "subs": ["CRIT Rate", "CRIT DMG", "ATK%", "SPD"],
            "teams": [["pela", "kafka"]],
        },
    }
    for k, v in MANUAL.items():
        if k not in presets:
            presets[k] = v
            report.append(f"{k}: MANUAL")

    write_presets(presets)
    print("== coverage ==")
    mapped = sum(1 for k in KITS if k in presets)
    print(f"kits with preset: {mapped}/{len(KITS)}")
    for line in report:
        print(line)


def write_presets(presets):
    keys = sorted(presets)
    lines = []
    lines.append("// AUTO-GENERATED by hsr-data/gen_presets.py - recommended BUILD (relic sets / lightcones /")
    lines.append("// main stats / substats) and TEAM presets per kit, mapped from hsr-data/characters.json")
    lines.append("// into simulation gear keys. Matched by English name against src/core/gear.ts;")
    lines.append("// rerun the generator after gear updates.")
    lines.append("")
    lines.append("export interface BuildPreset {")
    lines.append("  /** best-first ELEMENTAL-relic-set sim keys (set4_id_list) */")
    lines.append("  relic4: string[]")
    lines.append("  /** best-first PLANAR-set sim keys (set2_id_list) */")
    lines.append("  planar: string[]")
    lines.append("  /** best-first lightcone sim keys */")
    lines.append("  lc: string[]")
    lines.append("  /** recommended main stats per slot (readable labels) */")
    lines.append("  main: { body: string; foot: string; neck: string; object: string }")
    lines.append("  /** preferred substats (readable labels, best first) */")
    lines.append("  subs: string[]")
    lines.append("}")
    lines.append("")
    lines.append("export const PRESETS: Record<string, BuildPreset> = {")
    for k in keys:
        p = presets[k]
        lines.append(f"  {k}: {{")
        lines.append(f"    relic4: {fmt(p['relic4'])},")
        lines.append(f"    planar: {fmt(p['planar'])},")
        lines.append(f"    lc: {fmt(p['lc'])},")
        for c in COMMENTS.get(k, []):
            lines.append(f"    // {c}")
        lines.append(
            f"    main: {{ body: {fmt1(p['main']['body'])}, foot: {fmt1(p['main']['foot'])}, "
            f"neck: {fmt1(p['main']['neck'])}, object: {fmt1(p['main']['object'])} }},"
        )
        lines.append(f"    subs: {fmt(p['subs'])},")
        lines.append("  },")
    lines.append("}")
    lines.append("")
    lines.append("/** recommended teams as sibling sim-kit ids (best-usable first); self excluded */")
    lines.append("export const TEAM_PRESETS: Record<string, string[][]> = {")
    for k in keys:
        lines.append(f"  {k}: {fmt_teams(presets[k]['teams'])},")
    lines.append("}")
    lines.append("")
    lines.append("export function preset(id: string): BuildPreset | undefined {")
    lines.append("  return PRESETS[id]")
    lines.append("}")
    lines.append("")
    lines.append("/** recommended team variants for a kit ([] when none) */")
    lines.append("export function presetTeams(id: string): string[][] {")
    lines.append("  return TEAM_PRESETS[id] ?? []")
    lines.append("}")
    lines.append("")
    lines.append("/** kits whose own kit needs an EARLIER-slot ally of a given Path (Participant-ID gate):")
    lines.append(" *  the carrier's slot decides the gate, so its position in the sim team is load-bearing.")
    lines.append(" *  evanescia A2 — only an Elation-Skill teammate with a LOWER Participant ID converts CB. */")
    lines.append("export const PID_GATE_LEAD: Record<string, string> = { evanescia: 'Elation' }")
    lines.append("")
    lines.append("/** Preset team in SIM order. Returns a COPY (callers pad it up to 4 characters).")
    lines.append(" *  Puts the carrier in when the wiki teams omit it, and moves a gated carrier")
    lines.append(" *  behind the first qualifying ally. Teams that already satisfy the gate keep their order. */")
    lines.append("export function presetTeamOrder(id: string, mates: string[]): string[] {")
    lines.append("  const team = mates.includes(id) ? mates.slice() : [id, ...mates]")
    lines.append("  const gate = PID_GATE_LEAD[id]")
    lines.append("  if (!gate) return team")
    lines.append("  const at = team.indexOf(id)")
    lines.append("  const lead = team.findIndex((m, i) => i < at && KIT_PATH[m] === gate)")
    lines.append("  if (lead >= 0) return team")
    lines.append("  const first = team.findIndex((m) => m !== id && KIT_PATH[m] === gate)")
    lines.append("  if (first < 0) return team")
    lines.append("  team.splice(at, 1)")
    lines.append("  team.splice(first, 0, id)")
    lines.append("  return team")
    lines.append("}")
    lines.append("")
    lines.append("import { KIT_PATH } from './kits'")
    lines.append("")
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))


def fmt1(s):
    return f"'{s}'"


def fmt(a):
    return "[" + ", ".join(f"'{x}'" for x in a) + "]"


def fmt_teams(teams):
    return "[" + ", ".join(fmt(t) for t in teams) + "]"


if __name__ == "__main__":
    main()
