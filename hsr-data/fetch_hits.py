"""Fetch per-ability hit counts / attack types for the 25 sim kits from the HSR wiki.

Fandom has per-ability subpages (e.g. /wiki/Sheathed_Blade) that carry a "Hit Split"
table:  |20% |10% |10% |60% |  -> the ability deals 4 damage instances with that
distribution, each instance rolls CRIT independently. The character page's
navigation box maps slot (Basic ATK/Skill/Ultimate/Talent) -> ability page title.

This script:
  1. fetches each character page, reads the nav box for the four combat abilities,
  2. fetches each ability subpage and extracts Tag (Single Target/AoE/Blast/Bounce)
     + Hit Split,
  3. writes hsr-data/data/skill_hits.json (mirror of the fetch.py pipeline).

Usage:  python fetch_hits.py
Output: hsr-data/data/skill_hits.json
"""

import json
import re
import time
import urllib.parse
import urllib.request

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
}
PARSE = "https://honkai-star-rail.fandom.com/api.php?format=json&formatversion=2&action=parse"

KITS = [
    ("seele", "Seele"),
    ("jingyuan", "Jing_Yuan"),
    ("firefly", "Firefly"),
    ("bronya", "Bronya"),
    ("pela", "Pela"),
    ("guinaifen", "Guinaifen"),
    ("sparkle", "Sparkle"),
    ("gallagher", "Gallagher"),
    ("huohuo", "Huohuo"),
    ("march7th", "March_7th_(Imaginary)"),
    ("danheng", "Dan_Heng"),
    ("himeko", "Himeko"),
    ("welt", "Welt"),
    ("kafka", "Kafka"),
    ("silverwolf", "Silver_Wolf"),
    ("luocha", "Luocha"),
    ("yukong", "Yukong"),
    ("blade", "Blade"),
    ("luka", "Luka"),
    ("danhengil", "Dan_Heng_Imbibitor_Lunae"),
    ("fuxuan", "Fu_Xuan"),
    ("lynx", "Lynx"),
    ("topaz", "Topaz_and_Numby"),
    ("jingliu", "Jingliu"),
    ("tingyun", "Tingyun"),
]

SLOTS = ["basic", "skill", "ult", "talent"]
# nav box slot keyword -> sim slot
SLOT_KEY = {"Basic ATK": "basic", "Skill": "skill", "Ultimate": "ult", "Talent": "talent"}
TYPE_MAP = {
    "single target": "single",
    "aoe": "aoe",
    "blast": "blast",
    "bounce": "bounce",
    "fan": "aoe",
    "all allies": "allies",
}


def fetch(page):
    url = f"{PARSE}&page={urllib.parse.quote(page)}&prop=text"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def plain(text_html):
    txt = re.sub(r"<[^>]+>", " ", text_html)
    # table cells become "| val |" tokens; keep them (hit split relies on it)
    return re.sub(r"\s+", " ", txt)


def parse_ability_page(page):
    """Return (tag, hits, dist) for one ability subpage."""
    try:
        d = fetch(page)
    except Exception as e:
        return None, None, str(e)
    text = d["parse"]["text"]
    text = text if isinstance(text, str) else text.get("*", "")
    txt = plain(text)
    tag = None
    tm = re.search(r"Tag\s*\n\s*(Single Target|AoE|Blast|Bounce|Fan|All allies|Self)", txt)
    if tm:
        tag = TYPE_MAP.get(tm.group(1).lower(), "single")
    hits, dist = 1, None
    # Hit Split table: "Hit Split |20% |10% |10% |60% |" (inside the infobox)
    hm = re.search(r"Hit Split([^\n]*\|)", txt)
    if hm:
        cells = re.findall(r"\|\s*(\d+(?:\.\d+)?)\s*%", hm.group(1))
        if cells:
            hits, dist = len(cells), [int(x) for x in cells]
    return tag, {"hits": hits, "dist": dist}, None


def parse_char_page(page):
    """Return (bySlot, errors): bySlot = {slot: ability_page_title}."""
    try:
        d = fetch(page)
    except Exception as e:
        return None, str(e)
    text = d["parse"]["text"]
    text = text if isinstance(text, str) else text.get("*", "")
    txt = plain(text)
    out = {}
    # nav box rows carry "...**Basic ATK** ... Ability <Title> ..." for the 4 slots
    for m in re.finditer(r"\*\*(Basic ATK|Skill|Ultimate|Talent)\*\*", txt):
        slot = SLOT_KEY[m.group(1)]
        if slot in out:
            continue
        tail = txt[m.end() : m.end() + 400]
        am = re.search(r"Ability\s+([A-Z0-9][A-Za-z0-9'()._ ,:&\-]{1,80}?)(?=\s{2,}|\|)", tail)
        if am:
            out[slot] = am.group(1).strip()
    return out, None


def main():
    results = {}
    multi = []
    for i, (kid, page) in enumerate(KITS):
        print(f"[{i+1}/{len(KITS)}] {kid} ({page}) ...", end=" ", flush=True)
        links, err = parse_char_page(page)
        if links is None:
            print(f"FAIL char: {err}")
            results[kid] = {"error": err}
            continue
        abilities = {}
        ok = 0
        for slot in SLOTS:
            title = links.get(slot)
            tag, hitinfo, hlerr = parse_ability_page(title) if title else (None, None, f"no link for {slot}")
            if hlerr:
                continue
            abilities[slot] = {"type": tag or "single", "hits": hitinfo["hits"], "dist": hitinfo["dist"]}
            ok += 1
            if hitinfo["hits"] > 1:
                multi.append(f"{kid}.{slot}: {hitinfo['hits']} hits ({', '.join(map(str, hitinfo['dist']))}) [{tag}]")
        print(f"ok  {ok}/4 mapped")
        results[kid] = {"name": next(p for k, p in KITS if k == kid), "abilities": abilities}
        time.sleep(0.15)

    print("\n== multi-hit abilities (hits > 1) ==")
    for line in multi:
        print(" ", line)

    with open("data/skill_hits.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nsaved data/skill_hits.json")


if __name__ == "__main__":
    main()