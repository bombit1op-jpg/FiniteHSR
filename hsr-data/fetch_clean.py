import json
import urllib.request
from urllib.parse import quote
import re
import time
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"}

def fetch(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8")
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
            else:
                raise

def strip_html(s):
    if not s:
        return s
    s = re.sub(r'<color=[^>]*>', '', s)
    s = re.sub(r'</color>', '', s)
    s = re.sub(r'<unbreak>', '', s)
    s = re.sub(r'</unbreak>', '', s)
    s = re.sub(r'<u>', '', s)
    s = re.sub(r'</u>', '', s)
    s = re.sub(r'\\"', '"', s)
    s = re.sub(r'\\n', '\n', s)
    return s.strip()

def resolve_params(desc, params):
    if not desc:
        return desc
    result = desc
    if params:
        for idx, p in enumerate(params):
            if not isinstance(p, (int, float)):
                continue
            n = idx + 1
            # Determine if this placeholder is a percentage (followed by %) or a raw counter
            ph_i = f"#{n}[i]"
            is_percent = False
            if ph_i in result:
                # check if % immediately follows the placeholder
                pos = result.find(ph_i)
                after = pos + len(ph_i)
                is_percent = after < len(result) and result[after] == '%'
                if is_percent:
                    result = result.replace(ph_i, str(int(round(p * 100))))
                else:
                    result = result.replace(ph_i, str(int(round(p))) if abs(p - round(p)) < 1e-9 else str(p))
            # #N[f1] = float 1 decimal
            if f"#{n}[f1]" in result:
                result = result.replace(f"#{n}[f1]", f"{p * 100:.1f}" if 0 < p <= 1 else f"{p:.1f}")
            # #N[f2] = float 2 decimals
            if f"#{n}[f2]" in result:
                result = result.replace(f"#{n}[f2]", f"{p * 100:.2f}" if 0 < p <= 1 else f"{p:.2f}")
            # #N = raw number
            result = result.replace(f"#{n}", str(p))
    return strip_html(result)

# --- Wiki Gameplay Notes (per skill), survives regeneration ---
# Source: fandom "Gameplay Notes" tab of each ability in the ability-table.

def _notes_strip(s):
    if not s:
        return s
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
    s = re.sub(r'\n{2,}', '\n', s)
    return s.strip()


def _norm_name(n):
    return re.sub(r'\s+', ' ', _notes_strip(n)).strip()


def _ab_name(n):
    x = _norm_name(n)
    m = re.search(r' \((Blast|Single Target|AoE|Bounce|Support|Impair|Enhance|ST|ST Blast)\)$', x, re.I)
    return x[:m.start()] if m else x


def _notes_parse_page(title):
    url = f"https://honkai-star-rail.fandom.com/api.php?action=parse&page={quote(title)}&format=json&prop=text"
    j = json.loads(fetch(url))
    return j['parse']['text']['*'] if j.get('parse') and j['parse'].get('text') else None


def _notes_ability_table(html):
    ab = html.find('id="Abilities"')
    if ab < 0:
        return []
    table_start = html.find('<table class="wikitable ability-table', ab)
    if table_start < 0:
        return []
    te = html.find('<h3><span class="mw-headline"', table_start + 10)
    table_end = te if te >= 0 else len(html)
    sec = html[table_start:table_end]
    rows = []
    pos = 0
    while True:
        id_at = sec.find('<td id="Ability&#95;', pos)
        if id_at < 0:
            break
        src_at = sec.rfind('<td><span class="srw-icon', 0, id_at)
        m = re.search(r'<td><a[^>]*>([^<]*)</a></td>\s*<td><a href="/wiki/[^"]*" title="([^"]*)">', sec[src_at:id_at]) if src_at >= 0 else None
        if not m:
            pos = id_at + 1
            continue
        type_ = _norm_name(m.group(1))
        name = _ab_name(m.group(2))
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
    if name and str(name).startswith('Silver Wolf LV'):
        return 'Silver Wolf LV.999'
    if name == '{NICKNAME}':
        u = next((s for s in c.get('skills', {}).values() if s.get('type_name') == 'Ultimate'), None)
        case = _ab_name(u['name']) if u and u.get('name') else ''
        return {
            'Stardust Ace': 'Trailblazer',
            'War-Flaming Lance': 'Trailblazer/Preservation',
            'All-Out Footlight Parade': 'Trailblazer/Harmony',
            'Together, Mem!': 'Trailblazer/Remembrance',
        }.get(case, 'Trailblazer/Elation')
    return name


def _apply_notes(char):
    title = _notes_page_title_for(char)
    html = _notes_parse_page(title)
    if html is None or 'id="Abilities"' not in html or 'ability-table' not in html:
        return 0
    rows = _notes_ability_table(html)
    if not rows:
        return 0

    def find_row(t, nm):
        cands = [r for r in rows if r[0] == t and r[1] == nm]
        cands.sort(key=lambda r: 1 if r[2] else 0, reverse=True)
        return cands[0] if cands else None

    def row_by_name(nm):
        cands = [r for r in rows if r[1] == nm]
        cands.sort(key=lambda r: 1 if r[2] else 0, reverse=True)
        return cands[0] if cands else None

    cnt = 0

    def assign(s):
        nonlocal cnt
        if not s or s.get('notes'):
            return
        if not s.get('type_name'):
            return
        r = find_row(s['type_name'], _ab_name(s.get('name'))) or row_by_name(_ab_name(s.get('name')))
        if r and r[2]:
            s['notes'] = r[2]
            cnt += 1

    main = list(char.get('skills', {}).values())
    mm = (char.get('memosprite') or {}).get('skills') or {}
    for s in main + list(mm.values()):
        assign(s)
    return cnt

manifest = json.loads(fetch("https://static.nanoka.cc/manifest.json"))
version = manifest["hsr"]["latest"]
base = f"https://static.nanoka.cc/hsr/{version}"

# Ascension bracket: tier0 covers 1-20, tier1 21-30, ..., tier6 71-80
TARGET_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80]

def _tier_idx(L):
    return 0 if L <= 20 else (L - 20 + 9) // 10  # ceil((L-20)/10)

def compute_byLevel(stats):
    """Compute base stats at each target level from ascension data."""
    result = {}
    for lvl in TARGET_LEVELS:
        t = stats.get(str(_tier_idx(lvl)))
        if not t:
            continue
        result[str(lvl)] = {
            "hp":  int(t["hp_base"]      + t["hp_add"]      * (lvl - 1)),
            "atk": int(t["attack_base"]  + t["attack_add"]  * (lvl - 1)),
            "def": int(t["defence_base"] + t["defence_add"] * (lvl - 1)),
            "spd": t["speed_base"],
        }
    return result

chars_base = json.loads(fetch(f"{base}/character.json"))
print(f"Fetching {len(chars_base)} characters...")

all_chars = []
for i, (cid, info) in enumerate(chars_base.items()):
    name = info.get("en", cid)
    print(f"  [{i+1}/{len(chars_base)}] {name}...", end=" ", flush=True)
    try:
        d = json.loads(fetch(f"{base}/en/character/{cid}.json"))

        # --- skill trees → stat_bonus + bonus_abilities ---
        # For Novaflare chars, use enhanced skill_trees if available
        enhanced_data = d.get("enhanced") or None
        if enhanced_data and not any(
            rank_data.get("skills") for rank_data in enhanced_data.values()
        ):
            enhanced_data = None

        source_trees = d.get("skill_trees", {})
        if enhanced_data:
            for rank_id, rank_data in enhanced_data.items():
                est = rank_data.get("skill_trees")
                if est:
                    source_trees = est
                    break

        stat_bonus = {}
        bonus_abilities = []
        for tid, nodes in source_trees.items():
            for nid, node in nodes.items():
                pt = node.get("point_type")
                if pt == 1:
                    for s in node.get("status_add_list", []):
                        prop = s.get("property_type", "")
                        val = s.get("value", 0)
                        stat_bonus[prop] = stat_bonus.get(prop, 0) + val
                elif pt == 3:
                    desc_raw = node.get("point_desc", "")
                    params = node.get("param_list", [])
                    bonus_abilities.append({
                        "name": node.get("point_name", ""),
                        "desc": resolve_params(desc_raw, params),
                    })

        stat_bonus_list = [
            {"property": k, "value": round(v, 6)}
            for k, v in sorted(stat_bonus.items())
        ]

        # --- skills with resolved params ---
        def clean_skill(skill):
            levels = skill.get("level", {})
            cleaned_levels = {}
            for lid, lvl in levels.items():
                cleaned_levels[lid] = {
                    "level": lvl.get("level"),
                    "params": lvl.get("param_list", []),
                }
            return {
                "id": skill.get("id"),
                "name": skill.get("name"),
                "type": skill.get("type"),
                "type_name": skill.get("type_name"),
                "tag": skill.get("tag"),
                "desc": strip_html(skill.get("desc", "")),
                "sp_base": skill.get("sp_base"),
                "bp_need": skill.get("bp_need"),
                "bp_add": skill.get("bp_add"),
                "levels": cleaned_levels,
            }

        # --- skills: if enhanced (Novaflare) exists, use those instead of normals ---
        if enhanced_data:
            source_skills = {}
            for rank_id, rank_data in enhanced_data.items():
                for sid, skill in rank_data.get("skills", {}).items():
                    source_skills[sid] = skill
        else:
            source_skills = d.get("skills", {})

        skills = {sid: clean_skill(s) for sid, s in source_skills.items()}

        # --- memosprite ---
        memosprite = d.get("memosprite") or None
        if memosprite and not memosprite.get("skills"):
            memosprite = None

        # --- ranks (eidolons) with resolved params ---
        # If enhanced (Novaflare) exists, use its ranks instead of base ones
        source_ranks = d.get("ranks", {})
        if enhanced_data:
            for rank_id, rank_data in enhanced_data.items():
                erh = rank_data.get("ranks")
                if erh:
                    source_ranks = erh
                    break

        ranks = {}
        for rid, rank in source_ranks.items():
            ranks[rid] = {
                "id": rank.get("id"),
                "name": rank.get("name"),
                "desc": resolve_params(rank.get("desc", ""), rank.get("param_list", [])),
                "param_list": rank.get("param_list", []),
            }

        char = {
            "id": d.get("id"),
            "name": d.get("name"),
            "rarity": d.get("rarity"),
            "base_type": d.get("base_type"),
            "damage_type": d.get("damage_type"),
            "sp_need": d.get("sp_need"),
            "names": d.get("names"),
            "skills": skills,
            "ranks": ranks,
            "memosprite": memosprite,
            "stat_bonus": stat_bonus_list,
            "bonus_abilities": bonus_abilities,
            "stats": d.get("stats"),
            "byLevel": compute_byLevel(d.get("stats") or {}),
            "relics": d.get("relics"),
            "lightcones": d.get("lightcones"),
            "teams": d.get("teams"),
        }
        try:
            note_count = _apply_notes(char)
        except Exception as ne:
            print(f"notes FAIL: {ne}")
            note_count = 0
        all_chars.append(char)
        print(f"ok (+{note_count} notes)")
    except Exception as e:
        print(f"FAIL: {e}")
    time.sleep(0.15)

with open(r"C:\.projects\CalcFun\hsr-data\characters.json", "w", encoding="utf-8") as f:
    json.dump(all_chars, f, indent=2, ensure_ascii=False)

size_mb = len(json.dumps(all_chars, ensure_ascii=False)) / 1024 / 1024
print(f"\nSaved {len(all_chars)} characters ({size_mb:.1f} MB)")

# === Light Cones ===
print("\n=== Light Cones ===")
lc_base = json.loads(fetch(f"{base}/lightcone.json"))
first_lid = next(iter(lc_base))
try:
    json.loads(fetch(f"{base}/en/lightcone/{first_lid}.json"))
    has_lc_detail = True
except Exception:
    has_lc_detail = False

try:
    lc_en = json.loads(fetch(f"{base}/en/lightcone.json"))
except Exception:
    lc_en = {}

if has_lc_detail and lc_en:
    print(f"Total: {len(lc_base)}")
    lightcones = {}
    for i, (lid, info) in enumerate(lc_base.items()):
        en_lc = lc_en.get(lid, {})
        name = en_lc.get("name", info.get("en", lid))
        if i % 20 == 0:
            print(f"  [{i+1}/{len(lc_base)}] {name}...", end=" ", flush=True)
        try:
            detail = json.loads(fetch(f"{base}/en/lightcone/{lid}.json"))
            lightcones[lid] = {
                "id": lid, "name": detail.get("name", name),
                "rarity": detail.get("rarity", info.get("rank", "")),
                "base_type": detail.get("base_type", info.get("baseType", "")),
                "names": {"en": info.get("en",""), "zh": info.get("zh",""), "ja": info.get("ja",""), "ko": info.get("ko","")},
                "refinements": detail.get("refinements", {}),
                "stats": detail.get("stats", []),
                "desc": detail.get("desc", ""),
            }
            if i % 20 == 0: print("ok")
        except Exception as e:
            if i % 20 == 0: print(f"FAIL: {e}")
            lightcones[lid] = {"id": lid, "name": name, "rarity": info.get("rank",""), "base_type": info.get("baseType",""),
                "names": {"en": info.get("en",""), "zh": info.get("zh",""), "ja": info.get("ja",""), "ko": info.get("ko","")}}
        time.sleep(0.15)

    PATH_MAP = {'Warrior':'Destruction','Rogue':'The Hunt','Mage':'Erudition','Shaman':'Harmony','Warlock':'Nihility','Knight':'Preservation','Priest':'Abundance','Memory':'Remembrance'}
    for lc in lightcones.values():
        if lc.get("base_type") in PATH_MAP: lc["base_type"] = PATH_MAP[lc["base_type"]]
        if lc.get("desc"): lc["desc"] = strip_html(lc["desc"])
        for ref in lc.get("refinements", {}).values():
            if isinstance(ref, dict) and ref.get("desc"): ref["desc"] = strip_html(ref["desc"])
        for s in lc.get("stats", []): s.pop("promotion_cost_list", None)

    os.makedirs("data", exist_ok=True)
    with open("data/lightcones.json", "w", encoding="utf-8") as f:
        json.dump(lightcones, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(lightcones)} light cones")
else:
    print("Detail/bulk endpoints unavailable — keeping existing data/lightcones.json")

# === Relic Sets ===
print("\n=== Relic Sets ===")
rs_base = json.loads(fetch(f"{base}/relicset.json"))
first_rid = next(iter(rs_base))
try:
    json.loads(fetch(f"{base}/en/relicset/{first_rid}.json"))
    has_rs_detail = True
except Exception:
    has_rs_detail = False

try:
    rs_en = json.loads(fetch(f"{base}/en/relicset.json"))
except Exception:
    rs_en = {}

if has_rs_detail and rs_en:
    print(f"Total: {len(rs_base)}")
    relicsets = {}
    for i, (rid, info) in enumerate(rs_base.items()):
        en_r = rs_en.get(rid, {})
        name = en_r.get("name", info.get("en", rid))
        try:
            detail = json.loads(fetch(f"{base}/en/relicset/{rid}.json"))
            relicsets[rid] = {"id": rid, "name": detail.get("name", name),
                "names": {"en": info.get("en",""), "zh": info.get("zh",""), "ja": info.get("ja",""), "ko": info.get("ko","")},
                "icon": info.get("icon",""), "parts": detail.get("parts",{}), "set_bonuses": detail.get("require_num",{})}
            print(f"  ok: {name}")
        except Exception as e:
            print(f"  FAIL: {e}")
            relicsets[rid] = {"id": rid, "name": name,
                "names": {"en": info.get("en",""), "zh": info.get("zh",""), "ja": info.get("ja",""), "ko": info.get("ko","")},
                "icon": info.get("icon",""), "set_bonuses": info.get("set",{})}
        time.sleep(0.15)
    with open("data/relicsets.json", "w", encoding="utf-8") as f:
        json.dump(relicsets, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(relicsets)} relic sets")
else:
    print("Detail/bulk endpoints unavailable — keeping existing data/relicsets.json")
