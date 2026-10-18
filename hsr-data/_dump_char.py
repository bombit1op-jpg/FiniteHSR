import json, sys

key = sys.argv[1].lower()
d = json.load(open('hsr-data/characters.json', encoding='utf-8'))
hits = [x for x in d if key in json.dumps(x, ensure_ascii=False).lower()]
print('MATCHES', len(hits), [x.get('id') for x in hits])
for c in hits:
    print('=' * 70)
    print('NAME', c['name'], '| id', c.get('id'), '| rarity', c.get('rarity'))
    print('path', c.get('base_type'), '| elem', c.get('damage_type'), '| sp_need', c.get('sp_need'))
    bl = c.get('byLevel', {}).get('80', {})
    print('byLevel80', json.dumps(bl, ensure_ascii=False))
    if c.get('byLevel', {}).get('80', {}).get('by_base_hp'):
        pass
    for k, v in c.get('skills', {}).items():
        if not v:
            continue
        print('-' * 60)
        print('SKILL', k, '|', v.get('name'))
        if v.get('desc'):
            print('  desc', json.dumps(v['desc'], ensure_ascii=False))
        p = v.get('params')
        for i in range(len(p or [])):
            print('  params[%d]' % i, json.dumps(p[i], ensure_ascii=False))
        if v.get('notes'):
            print('  notes', json.dumps(v['notes'], ensure_ascii=False))
    msk = c.get('memosprite', {})
    if msk:
        print('MEMOSPRITE present')
        for k, v in (msk.get('skills', {}) or {}).items():
            if not v:
                continue
            print('  MEMSKILL', k, '|', v.get('name'))
            if v.get('desc'):
                print('    desc', json.dumps(v['desc'], ensure_ascii=False))
            p = v.get('params')
            for i in range(len(p or [])):
                print('    params[%d]' % i, json.dumps(p[i], ensure_ascii=False))
            if v.get('notes'):
                print('    notes', json.dumps(v['notes'], ensure_ascii=False))
    for k, v in c.get('ranks', {}).items():
        if not v:
            continue
        print('RANK', k, '|', v.get('name'))
        print('  params', json.dumps(v.get('params', v.get('param_list', [])), ensure_ascii=False))
    for b in c.get('bonus_abilities', []) or []:
        print('=' * 60)
        print('BONUS', b.get('name'), '| type', b.get('type'), '| rank', b.get('rank'))
        print('  desc', json.dumps(b.get('desc', ''), ensure_ascii=False))
    for k, v in (c.get('traces', {}) or {}).items():
        print('TRACE', k, json.dumps(v, ensure_ascii=False)[:300])
