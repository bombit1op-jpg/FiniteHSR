import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
name = sys.argv[1]
d = json.load(open('hsr-data/characters.json', encoding='utf-8'))
c = [x for x in d if x['name'] == name][0]
print('NAME', c['name'], '| path', c['base_type'], '| elem', c['damage_type'], '| sp_need', c['sp_need'], '| rarity', c['rarity'])
print('byLevel80', json.dumps(c['byLevel']['80'], ensure_ascii=False))
print('stat_bonus', json.dumps(c.get('stat_bonus'), ensure_ascii=False))
for k, v in c['skills'].items():
    if not v:
        continue
    print('=' * 60)
    print('SKILL', k, '|', v['name'], '| type', v.get('type_name'), '| sp_base', v.get('sp_base'), '| tag', v.get('tag'))
    print('  desc', v['desc'])
    lv = v.get('levels', {})
    nums = sorted(int(x) for x in lv)
    print('  levels', nums)
    for i in nums:
        p = lv[str(i)].get('params')
        print('   L%d' % i, json.dumps(p, ensure_ascii=False))
for k, v in c['ranks'].items():
    if not v:
        continue
    print('=' * 60)
    print('RANK', k, '|', v.get('name'), '|', v.get('type_name'), v.get('type'))
    if v.get('desc'):
        print('  desc', v['desc'])
    lv = v.get('levels', {})
    if lv:
        for i in sorted((int(x) for x in lv)):
            print('   L%d' % i, json.dumps(lv[str(i)].get('params'), ensure_ascii=False))
    else:
        print('  params', json.dumps(v.get('params'), ensure_ascii=False))
for b in c.get('bonus_abilities', []) or []:
    print('=' * 60)
    print('BONUS', b.get('name'))
    print('  desc', json.dumps(b.get('desc', ''), ensure_ascii=False))
    lv = b.get('levels', {})
    if lv:
        for i in sorted((int(x) for x in lv)):
            print('   L%d' % i, json.dumps(lv[str(i)].get('params'), ensure_ascii=False))
