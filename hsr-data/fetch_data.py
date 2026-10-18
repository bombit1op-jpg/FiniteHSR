"""
Unified data fetcher for CalcFun: characters (detail) + lightcones + relic sets + fandom notes.

Usage:
  python fetch_data.py                          # full refresh: chars + lc + rs
  python fetch_data.py --only kafka,seele        # refresh specific chars only
  python fetch_data.py --fandom                  # also fetch fandom combat_mechanics / relic stats
  python fetch_data.py --no-enrich               # skip name enrichment pass
"""
import json, urllib.request, re, time, sys, os, argparse
from urllib.parse import quote

sys.stdout.reconfigure(encoding='utf-8')
ap = argparse.ArgumentParser()
ap.add_argument("--only", default=None, help="comma-separated char ids or names")
ap.add_argument("--fandom", action="store_true", help="also fetch fandom combat_mechanics + relic stats")
ap.add_argument("--no-enrich", action="store_true", help="skip name enrichment")
_args = ap.parse_args()
ONLY = {x.strip().lower() for x in _args.only.split(",") if x.strip()} if _args.only else None

CHAR_PATH = r"C:\.projects\CalcFun\hsr-data\characters.json"
DATA_DIR  = os.path.join(os.path.dirname(CHAR_PATH), "data")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"}
FANDOM_API = "https://honkai-star-rail.fandom.com/api.php"

PROP = {
    "AttackAddedRatio": "ATK%", "DefenceAddedRatio": "DEF%", "HPAddedRatio": "HP%",
    "SpeedDelta": "SPD", "CriticalChanceBase": "CRIT Rate", "CriticalDamageBase": "CRIT DMG",
    "StatusProbabilityBase": "Effect Hit Rate", "StatusResistanceBase": "Effect RES",
    "BreakDamageAddedRatioBase": "Break Effect", "HealRatioBase": "Outgoing Healing",
    "SPRatioBase": "Energy Regen", "AttackDelta": "ATK Flat",
    "FireAddedRatio": "Fire DMG", "IceAddedRatio": "Ice DMG", "ThunderAddedRatio": "Lightning DMG",
    "WindAddedRatio": "Wind DMG", "QuantumAddedRatio": "Quantum DMG", "ImaginaryAddedRatio": "Imaginary DMG",
    "PhysicalAddedRatio": "Physical DMG",
}
SLOT = {"BODY": "body", "FOOT": "foot", "NECK": "neck", "OBJECT": "object"}

# ── helpers ──────────────────────────────────────────────────────────────────

def fetch(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode('utf-8')
        except Exception:
            if attempt < retries - 1: time.sleep(2 * (attempt + 1))
            else: raise

def strip_html(s):
    if not s: return s
    for pat, repl in [
        (r'<color=[^>]*>',''), (r'</color>',''), (r'<unbreak>',''), (r'</unbreak>',''),
        (r'<u>',''), (r'</u>',''), (r'\\"','"'), (r'\\n','\n'),
    ]: s = re.sub(pat, repl, s)
    return s.strip()

def resolve_params(desc, params):
    if not desc: return desc
    result = desc
    if params:
        for idx, p in enumerate(params):
            if not isinstance(p, (int, float)): continue
            n = idx + 1
            ph_i = f"#{n}[i]"
            if ph_i in result:
                pos = result.find(ph_i)
                after = pos + len(ph_i)
                is_pct = after < len(result) and result[after] == '%'
                result = result.replace(ph_i, str(int(round(p * 100))) if is_pct else str(int(round(p))) if abs(p - round(p)) < 1e-9 else str(p))
            for fmt, mult, dec in [('[f1]', 100, 1), ('[f2]', 100, 2)]:
                tag = f"#{n}{fmt}"
                if tag in result:
                    result = result.replace(tag, f"{p*mult:.{dec}f}" if 0 < p <= 1 else f"{p:.{dec}f}")
            result = result.replace(f"#{n}", str(p))
    return strip_html(result)

# ── fandom helpers ───────────────────────────────────────────────────────────

def fandom_parse(page_title):
    data = json.loads(fetch(f"{FANDOM_API}?action=parse&page={quote(page_title)}&format=json"))
    html = data.get("parse", {}).get("text", {}).get("*", "")
    text = re.sub(r'<[^>]+>', '\n', html)
    text = re.sub(r'&#\d+;', '', text).replace('&amp;', '&').replace('&nbsp;', ' ')
    return re.sub(r'\n{3,}', '\n\n', text).strip()

def _notes_strip(s):
    if not s: return s
    s = re.sub(r'<style[\s\S]*?</style>', '', s)
    s = re.sub(r'<script[\s\S]*?</script>', '', s)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'</p>', '\n', s)
    s = re.sub(r'</li>', '\n', s)
    s = re.sub(r'</tr>', '\n', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'&#0?39;', "'", s).replace('&quot;', '"').replace('&lt;', '<').replace('&gt;', '>')
    s = s.replace('&amp;', '&').replace('&#160;', ' ').replace('&#95;', '_')
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'^\s+$', '', s, flags=re.M)
    return re.sub(r'\n{2,}', '\n', s).strip()

def _norm_name(n): return re.sub(r'\s+', ' ', _notes_strip(n)).strip()

def _ab_name(n):
    x = _norm_name(n)
    m = re.search(r' \((Blast|Single Target|AoE|Bounce|Support|Impair|Enhance|ST|ST Blast)\)$', x, re.I)
    return x[:m.start()] if m else x

def _notes_parse_page(title):
    j = json.loads(fetch(f"{FANDOM_API}?action=parse&page={quote(title)}&format=json&prop=text"))
    return j['parse']['text']['*'] if j.get('parse') and j['parse'].get('text') else None

def _notes_ability_table(html):
    ab = html.find('id="Abilities"')
    if ab < 0: return []
    table_start = html.find('<table class="wikitable ability-table', ab)
    if table_start < 0: return []
    te = html.find('<h3><span class="mw-headline"', table_start + 10)
    table_end = te if te >= 0 else len(html)
    sec = html[table_start:table_end]
    rows, pos = [], 0
    while True:
        id_at = sec.find('<td id="Ability&#95;', pos)
        if id_at < 0: break
        src_at = sec.rfind('<td><span class="srw-icon', 0, id_at)
        m = re.search(r'<td><a[^>]*>([^<]*)</a></td>\s*<td><a href="/wiki/[^"]*" title="([^"]*)">', sec[src_at:id_at]) if src_at >= 0 else None
        if not m: pos = id_at + 1; continue
        type_, name = _norm_name(m.group(1)), _ab_name(m.group(2))
        ctx_end = sec.find('<td id="Ability&#95;', id_at + 1)
        ctx = sec[id_at:ctx_end if ctx_end >= 0 else table_end]
        ul = ctx.find('</ul>')
        notes = None
        if ul >= 0:
            labels = re.findall(r'class="wds-tabs&#95;&#95;tab-label">([^<]*)<', ctx)
            gi = labels.index('Gameplay Notes') if 'Gameplay Notes' in labels else -1
            if gi >= 0:
                parts = ctx[ul + 5:].split('<div class="wds-tab')
                raw = parts[gi + 1] if gi + 1 < len(parts) else None
                if raw:
                    s = _notes_strip(re.sub(r'^&#95;&#95;content[^>]*>', '', raw))
                    notes = None if (s.startswith('s__tab') or 'tab-label' in s or not s) else s
        rows.append((type_, name, notes))
        pos = id_at + 1
    return rows

def _notes_page_title_for(c):
    name = c.get('name')
    if name == 'March 7th':
        b = next((s for s in c.get('skills', {}).values() if s.get('type_name') == 'Basic ATK'), None)
        return 'March 7th/Preservation' if b and _ab_name(b.get('name')) == 'Frigid Cold Arrow' else 'March 7th/The Hunt'
    if name and str(name).startswith('Silver Wolf LV'): return 'Silver Wolf LV.999'
    if name == '{NICKNAME}':
        u = next((s for s in c.get('skills', {}).values() if s.get('type_name') == 'Ultimate'), None)
        return {'Stardust Ace':'Trailblazer','War-Flaming Lance':'Trailblazer/Preservation',
                'All-Out Footlight Parade':'Trailblazer/Harmony','Together, Mem!':'Trailblazer/Remembrance'
               }.get(_ab_name(u['name']) if u and u.get('name') else '', 'Trailblazer/Elation')
    return name

def _apply_notes(char):
    title = _notes_page_title_for(char)
    html = _notes_parse_page(title)
    if not html or 'id="Abilities"' not in html or 'ability-table' not in html: return 0
    rows = _notes_ability_table(html)
    if not rows: return 0
    def find_row(t, nm):
        cands = [r for r in rows if r[0] == t and r[1] == nm]
        return (sorted(cands, key=lambda r: 1 if r[2] else 0, reverse=True) or [None])[0]
    def row_by_name(nm):
        cands = [r for r in rows if r[1] == nm]
        return (sorted(cands, key=lambda r: 1 if r[2] else 0, reverse=True) or [None])[0]
    cnt = 0
    def assign(s):
        nonlocal cnt
        if not s or s.get('notes') or not s.get('type_name'): return
        r = find_row(s['type_name'], _ab_name(s.get('name'))) or row_by_name(_ab_name(s.get('name')))
        if r and r[2]: s['notes'] = r[2]; cnt += 1
    mem = (char.get('memosprite') or {})
    mem_skills = mem.get('skills') if isinstance(mem, dict) and isinstance(mem.get('skills'), dict) else {}
    for s in list(char.get('skills', {}).values()) + list(mem_skills.values()):
        assign(s)
    return cnt

# ── enrichment (name resolution) ─────────────────────────────────────────────

def enrich_names():
    chars = json.load(open(CHAR_PATH, encoding='utf8'))
    char_by_id = {}
    for c in chars:
        aid = (c.get('relics') or {}).get('avatar_id')
        if aid is not None: char_by_id[str(aid)] = c.get('name') or str(aid)
    lc_map = json.load(open(os.path.join(DATA_DIR, 'lightcones.json'), encoding='utf8'))
    rs_map = json.load(open(os.path.join(DATA_DIR, 'relicsets.json'), encoding='utf8'))
    def rs_name(i):  return (rs_map.get(str(i)) or {}).get('name') or str(i)
    def lc_name(i):  return (lc_map.get(str(i)) or {}).get('name') or str(i)
    def char_name(i): return char_by_id.get(str(i), str(i))

    for c in chars:
        r = c.get('relics')
        if r:
            r['set4'] = [rs_name(i) for i in r.get('set4_id_list', [])]
            r['set2'] = [rs_name(i) for i in r.get('set2_id_list', [])]
            r['main'] = [{'slot': SLOT.get(p.get('relic_type'), p.get('relic_type')),
                          'stat': PROP.get(p.get('property_type'), p.get('property_type'))}
                         for p in r.get('property_list', [])]
            r['subs'] = [PROP.get(p, p) for p in r.get('sub_affix_property_list', [])]
            for k in ('set4_id_list', 'set2_id_list', 'set4_names', 'set2_names',
                      'sub_affix_property_list', 'sub_affix_names', 'score_rank_list',
                      'property_list', 'property_list3', 'property_list4',
                      'property_list5', 'property_list6'):
                r.pop(k, None)
        if isinstance(c.get('lightcones'), list):
            c['lightcones'] = [lc_name(i) for i in c['lightcones']]
        # ── teams: names-only, backup alt per slot (idempotent — skips reshaped records) ──
        new_teams = []
        for t in c.get('teams') or []:
            ml = t.get('member_list')
            if not ml:
                # already reshaped (member_list gone) or empty — keep as-is
                if t.get('list'): new_teams.append(t)
                continue
            ml = ml or []
            # dedup within team
            seen, members = set(), []
            for mid in ml:
                if mid in seen: continue
                seen.add(mid)
                members.append(char_name(mid))
            # alt per slot (index-matched to member_list, empty where no alt)
            alt = []
            for slot_idx in range(len(ml)):
                bkey = f'backup_list{slot_idx+1}'
                bl = t.get(bkey) or []
                alts = []
                for bid in bl:
                    if bid in seen: continue
                    aname = char_name(bid)
                    if aname not in alts:
                        alts.append(aname)
                alt.append(alts)
            entry = {'list': members}
            if any(alt): entry['alt'] = alt
            new_teams.append(entry)
        c['teams'] = new_teams

    with open(CHAR_PATH, 'w', encoding='utf-8') as f:
        json.dump(chars, f, indent=2, ensure_ascii=False)
    print(f'Enriched names ({len(chars)} chars, teams=names-only)')

# ── main fetch ───────────────────────────────────────────────────────────────

manifest = json.loads(fetch('https://static.nanoka.cc/manifest.json'))
version = manifest['hsr']['latest']
base = f'https://static.nanoka.cc/hsr/{version}'
TARGET_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80]

def _tier_idx(L):
    return 0 if L <= 20 else (L - 20 + 9) // 10

def compute_byLevel(stats):
    result = {}
    for lvl in TARGET_LEVELS:
        t = stats.get(str(_tier_idx(lvl)))
        if not t: continue
        result[str(lvl)] = {
            'hp':  int(t['hp_base']      + t['hp_add']      * (lvl - 1)),
            'atk': int(t['attack_base']  + t['attack_add']  * (lvl - 1)),
            'def': int(t['defence_base'] + t['defence_add'] * (lvl - 1)),
            'spd': t['speed_base'],
        }
    return result

CHAR_PATH_MAP = {'Warrior':'Destruction','Rogue':'The Hunt','Mage':'Erudition','Shaman':'Harmony',
                 'Warlock':'Nihility','Knight':'Preservation','Priest':'Abundance','Memory':'Remembrance','Elation':'Elation'}

chars_base = json.loads(fetch(f'{base}/character.json'))
print(f'Fetching {len(chars_base)} characters...')
if ONLY:
    def _keep(cid, info): return cid in ONLY or (info.get('en') or '').lower() in ONLY
    kept = {cid: i for cid, i in chars_base.items() if _keep(cid, i)}
    if not kept:
        print(f'Error: --only matched no characters. Sample: {", ".join(list(chars_base)[:5])}'); sys.exit(1)
    chars_base = kept
    print(f'  (--only: {len(chars_base)} chars)')

all_chars = []
for i, (cid, info) in enumerate(chars_base.items()):
    name = info.get('en', cid)
    print(f'  [{i+1}/{len(chars_base)}] {name}...', end=' ', flush=True)
    try:
        d = json.loads(fetch(f'{base}/en/character/{cid}.json'))
        # enhanced (Novaflare)
        enhanced_data = d.get('enhanced') or None
        if enhanced_data and not any(rd.get('skills') for rd in enhanced_data.values()):
            enhanced_data = None
        # skill trees → stat_bonus + bonus_abilities (use enhanced if available)
        source_trees = d.get('skill_trees', {})
        if enhanced_data:
            for rank_data in enhanced_data.values():
                est = rank_data.get('skill_trees')
                if est: source_trees = est; break
        stat_bonus, bonus_abilities = {}, []
        for tid, nodes in source_trees.items():
            for nid, node in nodes.items():
                pt = node.get('point_type')
                if pt == 1:
                    for s in node.get('status_add_list', []):
                        prop = s.get('property_type', '')
                        stat_bonus[prop] = stat_bonus.get(prop, 0) + s.get('value', 0)
                elif pt == 3:
                    params = node.get('param_list', [])
                    bonus_abilities.append({'name': node.get('point_name',''),
                                            'desc': resolve_params(node.get('point_desc',''), params)})
        stat_bonus_list = [{'property': k, 'value': round(v, 6)} for k, v in sorted(stat_bonus.items())]
        # skills
        def clean_skill(skill):
            cleaned = {}
            for lid, lvl in (skill.get('level') or {}).items():
                cleaned[lid] = {'level': lvl.get('level'), 'params': lvl.get('param_list', [])}
            return {'id': skill.get('id'), 'name': skill.get('name'), 'type': skill.get('type'),
                    'type_name': skill.get('type_name'), 'tag': skill.get('tag'),
                    'desc': strip_html(skill.get('desc', '')), 'sp_base': skill.get('sp_base'),
                    'bp_need': skill.get('bp_need'), 'bp_add': skill.get('bp_add'), 'levels': cleaned}
        source_skills = {}
        if enhanced_data:
            for rd in enhanced_data.values():
                for sid, sk in (rd.get('skills') or {}).items(): source_skills[sid] = sk
        else:
            source_skills = d.get('skills', {})
        skills = {sid: clean_skill(s) for sid, s in source_skills.items()}
        # memosprite
        memosprite = d.get('memosprite') or None
        if memosprite and not memosprite.get('skills'): memosprite = None
        # ranks (eidolons) — use enhanced if available
        source_ranks = d.get('ranks', {})
        if enhanced_data:
            for rd in enhanced_data.values():
                erh = rd.get('ranks')
                if erh: source_ranks = erh; break
        ranks = {}
        for rid, rank in source_ranks.items():
            ranks[rid] = {'id': rank.get('id'), 'name': rank.get('name'),
                          'desc': resolve_params(rank.get('desc',''), rank.get('param_list',[])),
                          'param_list': rank.get('param_list', [])}
        # build character record (teams stored as raw for now; enrich_names reshapes)
        char = {
            'id': d.get('id'), 'name': d.get('name'), 'rarity': d.get('rarity'),
            'base_type': CHAR_PATH_MAP.get(d.get('base_type'), d.get('base_type')),
            'damage_type': d.get('damage_type'), 'sp_need': d.get('sp_need'),
            'names': d.get('names'), 'skills': skills, 'ranks': ranks,
            'memosprite': memosprite, 'stat_bonus': stat_bonus_list,
            'bonus_abilities': bonus_abilities, 'byLevel': compute_byLevel(d.get('stats') or {}),
            'relics': d.get('relics'), 'lightcones': d.get('lightcones'),
            'teams': d.get('teams'),   # raw team_ids + members (enrich reshapes)
        }
        try:
            note_count = _apply_notes(char)
        except Exception as ne:
            print(f'notes FAIL: {ne}')
            note_count = 0
        all_chars.append(char)
        print(f'ok (+{note_count} notes)')
    except Exception as e:
        print(f'FAIL: {e}')
    time.sleep(0.15)

# merge --only results
def _avatar_id(c): return (c.get('relics') or {}).get('avatar_id') or c.get('id')
existing = None
if ONLY and os.path.exists(CHAR_PATH):
    existing = json.load(open(CHAR_PATH, encoding='utf8'))
    fetched_ids = {_avatar_id(c) for c in all_chars}
    merged = [c for c in existing if _avatar_id(c) not in fetched_ids] + all_chars
    print(f'Merged --only results ({len(all_chars)} fetched, {len(existing)} existing)')
    all_chars = merged

os.makedirs(DATA_DIR, exist_ok=True)
with open(CHAR_PATH, 'w', encoding='utf-8') as f:
    json.dump(all_chars, f, indent=2, ensure_ascii=False)
print(f'\nSaved {len(all_chars)} characters')

if _args.no_enrich:
    print('--no-enrich: skipping enrichment')
else:
    enrich_names()

# ── Light Cones ──────────────────────────────────────────────────────────────
if not ONLY:
    print('\n=== Light Cones ===')
    lc_base = json.loads(fetch(f'{base}/lightcone.json'))
    first_lid = next(iter(lc_base))
    try:
        json.loads(fetch(f'{base}/en/lightcone/{first_lid}.json'))
        has_lc_detail = True
    except Exception:
        has_lc_detail = False
    lc_en = {}
    try: lc_en = json.loads(fetch(f'{base}/en/lightcone.json'))
    except Exception: pass
    if has_lc_detail and lc_en:
        print(f'Total: {len(lc_base)}')
        lightcones = {}
        for i, (lid, info) in enumerate(lc_base.items()):
            en_lc = lc_en.get(lid, {})
            nm = en_lc.get('name', info.get('en', lid))
            if i % 20 == 0: print(f'  [{i+1}/{len(lc_base)}] {nm}...', end=' ', flush=True)
            try:
                det = json.loads(fetch(f'{base}/en/lightcone/{lid}.json'))
                lightcones[lid] = {
                    'id': lid, 'name': det.get('name', nm),
                    'rarity': det.get('rarity', info.get('rank','')),
                    'base_type': det.get('base_type', info.get('baseType','')),
                    'names': {k: info.get(k,'') for k in ('en','zh','ja','ko')},
                    'refinements': det.get('refinements', {}),
                    'stats': det.get('stats', []),
                    'desc': det.get('desc', ''),
                }
                if i % 20 == 0: print('ok')
            except Exception as e:
                if i % 20 == 0: print(f'FAIL: {e}')
                lightcones[lid] = {'id': lid, 'name': nm, 'rarity': info.get('rank',''),
                    'base_type': info.get('baseType',''),
                    'names': {k: info.get(k,'') for k in ('en','zh','ja','ko')}}
            time.sleep(0.15)
        PATH_MAP = {'Warrior':'Destruction','Rogue':'The Hunt','Mage':'Erudition','Shaman':'Harmony',
                    'Warlock':'Nihility','Knight':'Preservation','Priest':'Abundance','Memory':'Remembrance'}
        for lc in lightcones.values():
            if lc.get('base_type') in PATH_MAP: lc['base_type'] = PATH_MAP[lc['base_type']]
            if lc.get('desc'): lc['desc'] = strip_html(lc['desc'])
            for ref in lc.get('refinements', {}).values():
                if isinstance(ref, dict) and ref.get('desc'): ref['desc'] = strip_html(ref['desc'])
            for s in lc.get('stats', []): s.pop('promotion_cost_list', None)
        with open(os.path.join(DATA_DIR, 'lightcones.json'), 'w', encoding='utf-8') as f:
            json.dump(lightcones, f, indent=2, ensure_ascii=False)
        print(f'Saved {len(lightcones)} light cones')
    else:
        print('Detail/bulk endpoints unavailable — keeping existing data/lightcones.json')

# ── Relic Sets ───────────────────────────────────────────────────────────────
if not ONLY:
    print('\n=== Relic Sets ===')
    rs_base = json.loads(fetch(f'{base}/relicset.json'))
    first_rid = next(iter(rs_base))
    try:
        json.loads(fetch(f'{base}/en/relicset/{first_rid}.json'))
        has_rs_detail = True
    except Exception:
        has_rs_detail = False
    rs_en = {}
    try: rs_en = json.loads(fetch(f'{base}/en/relicset.json'))
    except Exception: pass
    if has_rs_detail and rs_en:
        print(f'Total: {len(rs_base)}')
        relicsets = {}
        for i, (rid, info) in enumerate(rs_base.items()):
            en_r = rs_en.get(rid, {})
            nm = en_r.get('name', info.get('en', rid))
            try:
                det = json.loads(fetch(f'{base}/en/relicset/{rid}.json'))
                relicsets[rid] = {'id': rid, 'name': det.get('name', nm),
                    'names': {k: info.get(k,'') for k in ('en','zh','ja','ko')},
                    'icon': info.get('icon',''), 'parts': det.get('parts',{}),
                    'set_bonuses': det.get('require_num',{})}
                print(f'  ok: {nm}')
            except Exception as e:
                print(f'  FAIL: {e}')
                relicsets[rid] = {'id': rid, 'name': nm,
                    'names': {k: info.get(k,'') for k in ('en','zh','ja','ko')},
                    'icon': info.get('icon',''), 'set_bonuses': info.get('set',{})}
            time.sleep(0.15)
        with open(os.path.join(DATA_DIR, 'relicsets.json'), 'w', encoding='utf-8') as f:
            json.dump(relicsets, f, indent=2, ensure_ascii=False)
        print(f'Saved {len(relicsets)} relic sets')
    else:
        print('Detail/bulk endpoints unavailable — keeping existing data/relicsets.json')

# ── Fandom (optional) ────────────────────────────────────────────────────────
if _args.fandom:
    os.makedirs('combat_mechanics', exist_ok=True)
    cat_data = json.loads(fetch(f'{FANDOM_API}?action=query&list=categorymembers&cmtitle=Category:Combat&cmlimit=100&format=json'))
    members = [m for m in cat_data['query']['categorymembers'] if m['ns'] == 0]
    print(f'\n=== Fandom Combat ({len(members)} articles) ===')
    combat_data = {}
    for i, m in enumerate(members):
        title = m['title']
        print(f'  [{i+1}/{len(members)}] {title}...', end=' ', flush=True)
        try:
            text = fandom_parse(title)
            combat_data[title] = {'text': text}
            with open(f'combat_mechanics/{title.replace("/", "_").replace(":", "_")}.txt', 'w', encoding='utf-8') as f:
                f.write(text)
            print(f'ok ({len(text)} chars)')
        except Exception as e:
            print(f'FAIL: {e}')
        time.sleep(0.3)
    with open(os.path.join(DATA_DIR, 'combat_mechanics.json'), 'w', encoding='utf-8') as f:
        json.dump(combat_data, f, indent=2, ensure_ascii=False)
    print('Fandom combat mechanics saved')

print('\nDone.')
