import urllib.request
import json
import sys
import re
import time
import os

sys.stdout.reconfigure(encoding='utf-8')

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"}
NANOKA_API = "https://static.nanoka.cc/hsr"
FANDOM_API = "https://honkai-star-rail.fandom.com/api.php"


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


def fandom_parse(page_title):
    """Fetch a fandom wiki page and return clean text."""
    data = json.loads(fetch(f"{FANDOM_API}?action=parse&page={urllib.request.quote(page_title)}&format=json"))
    html = data.get("parse", {}).get("text", {}).get("*", "")
    text = re.sub(r'<[^>]+>', '\n', html)
    text = re.sub(r'&#\d+;', '', text)
    text = re.sub(r'&[a-z]+;', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    return text


def fandom_parse_tables(page_title):
    """Fetch a fandom wiki page and return parsed HTML tables as lists of dicts."""
    data = json.loads(fetch(f"{FANDOM_API}?action=parse&page={urllib.request.quote(page_title)}&format=json&prop=text"))
    html = data.get("parse", {}).get("text", {}).get("*", "")
    tables = []
    for table_match in re.finditer(r'<table[^>]*>(.*?)</table>', html, re.DOTALL):
        table_html = table_match.group(1)
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL)
        if len(rows) < 2:
            continue
        headers = [re.sub(r'<[^>]+>', '', th).strip() for th in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', rows[0], re.DOTALL)]
        table_data = []
        for row in rows[1:]:
            cells = [re.sub(r'<[^>]+>', '', td).strip() for td in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', row, re.DOTALL)]
            if len(cells) == len(headers):
                table_data.append(dict(zip(headers, cells)))
        tables.append(table_data)
    return tables


def main():
    manifest = json.loads(fetch("https://static.nanoka.cc/manifest.json"))
    version = manifest["hsr"]["latest"]
    print(f"version: {version}")

    os.makedirs("combat_mechanics", exist_ok=True)
    os.makedirs("data", exist_ok=True)

    # === 1. Fandom Category:Combat ===
    print("\n=== Fetching Combat Mechanics (fandom) ===")
    cat_data = json.loads(fetch(f"{FANDOM_API}?action=query&list=categorymembers&cmtitle=Category:Combat&cmlimit=100&format=json"))
    members = [m for m in cat_data["query"]["categorymembers"] if m["ns"] == 0]
    print(f"Found {len(members)} combat articles")

    combat_data = {}
    for i, m in enumerate(members):
        title = m["title"]
        print(f"  [{i+1}/{len(members)}] {title} ...", end=" ", flush=True)
        try:
            text = fandom_parse(title)
            tables = fandom_parse_tables(title)
            combat_data[title] = {
                "text": text,
                "tables": tables,
            }
            with open(f"combat_mechanics/{title.replace('/', '_').replace(':', '_')}.txt", "w", encoding="utf-8") as f:
                f.write(text)
            print(f"ok ({len(text)} chars, {len(tables)} tables)")
        except Exception as e:
            print(f"FAIL: {e}")
        time.sleep(0.3)

    with open("data/combat_mechanics.json", "w", encoding="utf-8") as f:
        json.dump(combat_data, f, indent=2, ensure_ascii=False)

    # === 2. Relic/Stats from fandom ===
    print("\n=== Fetching Relic/Stats (fandom) ===")
    relic_stats_text = fandom_parse("Relic/Stats")
    relic_stats_tables = fandom_parse_tables("Relic/Stats")
    with open("data/relic_stats.txt", "w", encoding="utf-8") as f:
        f.write(relic_stats_text)
    with open("data/relic_stats.json", "w", encoding="utf-8") as f:
        json.dump({"text": relic_stats_text, "tables": relic_stats_tables}, f, indent=2, ensure_ascii=False)
    print(f"  Relic/Stats: {len(relic_stats_text)} chars, {len(relic_stats_tables)} tables")

    # Also fetch Relic (general info)
    relic_general_text = fandom_parse("Relic")
    with open("data/relic_general.txt", "w", encoding="utf-8") as f:
        f.write(relic_general_text)
    print(f"  Relic: {len(relic_general_text)} chars")

    # === 3. Nanoka lightcones ===
    print("\n=== Fetching Light Cones (nanoka) ===")
    lc_data = json.loads(fetch(f"{NANOKA_API}/{version}/lightcone.json"))
    print(f"Total light cones: {len(lc_data)}")
    # Enrich with locale names
    lc_en = json.loads(fetch(f"{NANOKA_API}/{version}/en/lightcone.json")) if True else {}
    for lid, lc in lc_data.items():
        en_lc = lc_en.get(lid, {})
        lc["name_en"] = en_lc.get("name", "")
        lc["desc"] = en_lc.get("desc", "")
        lc["skill_name"] = en_lc.get("skill_name", "")
        lc["skill_desc"] = en_lc.get("skill_desc", "")
    with open("data/lightcones.json", "w", encoding="utf-8") as f:
        json.dump(lc_data, f, indent=2, ensure_ascii=False)
    sample_key = list(lc_data.keys())[0]
    print(f"  Sample ({sample_key}) keys: {list(lc_data[sample_key].keys())}")

    # === 4. Nanoka relics ===
    print("\n=== Fetching Relics (nanoka) ===")
    relic_data = json.loads(fetch(f"{NANOKA_API}/{version}/relicset.json"))
    print(f"Total relic sets: {len(relic_data)}")
    # Enrich with locale names
    relic_en = json.loads(fetch(f"{NANOKA_API}/{version}/en/relicset.json")) if True else {}
    for rid, relic in relic_data.items():
        en_relic = relic_en.get(rid, {})
        relic["name_en"] = en_relic.get("name", "")
        relic["desc"] = en_relic.get("desc", "")
        relic["bonus_2pc"] = en_relic.get("bonus_2pc", "")
        relic["bonus_4pc"] = en_relic.get("bonus_4pc", "")
    with open("data/relicsets.json", "w", encoding="utf-8") as f:
        json.dump(relic_data, f, indent=2, ensure_ascii=False)
    sample_key = list(relic_data.keys())[0]
    print(f"  Sample ({sample_key}) keys: {list(relic_data[sample_key].keys())}")

    print("\nDone!")


if __name__ == "__main__":
    main()
