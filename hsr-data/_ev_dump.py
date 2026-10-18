import json
d = json.load(open('hsr-data/characters.json', encoding='utf-8'))
c = next((x for x in d if x.get('id') == 118), None)
if not c:
    c = next(x for x in d if 'evernight' in json.dumps(x, ensure_ascii=False).lower())
print('NAME', c['name'], '| id', c.get('id'))
print('path', c.get('base_type'), '| elem', c.get('damage_type'), '| sp_need', c.get('sp_need'))
bl = c.get('byLevel', {}).get('80', {})
print('byLevel80', json.dumps(bl, ensure_ascii=False))
for k, v in c.get('skills', {}).items():
    if not v:
        continue
    print('SKILL', k, v.get('name'))
    params = v.get('params')
    if params:
        print('  params[0]', json.dumps(params[0], ensure_ascii=False))
        print('  params[1]', json.dumps(params[1], ensure_ascii=False))
    if params and len(params) > 2:
        print('  params[2]', json.dumps(params[2], ensure_ascii=False))
    notes = v.get('notes')
    if notes:
        print('  notes', json.dumps(notes, ensure_ascii=False)[:400])
msk = c.get('memosprite', {})
if msk:
    print('MEMOSPRITE flag present')
    sk = msk.get('skills', {})
    for k, v in sk.items():
        if not v:
            continue
        print('  MEMSKILL', k, v.get('name'))
        p = v.get('params')
        if p:
            print('    params[0]', json.dumps(p[0], ensure_ascii=False))
            print('    params[1]', json.dumps(p[1], ensure_ascii=False))
            if len(p) > 2:
                print('    params[2]', json.dumps(p[2], ensure_ascii=False))
            if len(p) > 3:
                print('    params[3]', json.dumps(p[3], ensure_ascii=False))
        n2 = v.get('notes')
        if n2:
            print('    notes', json.dumps(n2, ensure_ascii=False)[:300])
for k, v in c.get('ranks', {}).items():
    if not v:
        continue
    print('RANK', k, v.get('name'))
    p = v.get('params', v.get('param_list', []))
    print('  params', json.dumps(p, ensure_ascii=False))
for b in c.get('bonus_abilities', []) or []:
    print('BONUS', b.get('name'), json.dumps(b.get('desc', ''), ensure_ascii=False)[:200])
tp = c.get('traces', {})
if tp:
    for k, v in tp.items():
        print('TRACE', k, json.dumps(v, ensure_ascii=False)[:200])