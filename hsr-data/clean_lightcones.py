#!/usr/bin/env python3
"""Clean lightcone data: remove promotion costs, fix path names."""
import json, re, os

PATH_MAP = {
    'Warrior': 'Destruction',
    'Rogue': 'The Hunt',
    'Mage': 'Erudition',
    'Shaman': 'Harmony',
    'Warlock': 'Nihility',
    'Knight': 'Preservation',
    'Priest': 'Abundance',
    'Memory': 'Remembrance',
    'Elation': 'Elation',
}

def clean_desc(text):
    if not text:
        return text
    text = re.sub(r'<color=[^>]*>', '', text)
    text = text.replace('</color>', '')
    text = text.replace('<unbreak>', '').replace('</unbreak>', '')
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def main():
    base = os.path.dirname(os.path.abspath(__file__))
    src = os.path.join(base, 'data', 'lightcones.json')
    
    with open(src, encoding='utf-8') as f:
        data = json.load(f)
    
    desc_count = 0
    cost_count = 0
    path_count = 0
    
    for lid, lc in data.items():
        # Clean descriptions
        if lc.get('refinements', {}).get('desc'):
            old = lc['refinements']['desc']
            new = clean_desc(old)
            if old != new:
                lc['refinements']['desc'] = new
                desc_count += 1
        
        if lc.get('desc'):
            old = lc['desc']
            new = clean_desc(old)
            if old != new:
                lc['desc'] = new
                desc_count += 1
        
        # Fix path names
        if lc.get('base_type') in PATH_MAP:
            lc['base_type'] = PATH_MAP[lc['base_type']]
            path_count += 1
        
        # Remove promotion_cost_list from stats
        if lc.get('stats'):
            for stat in lc['stats']:
                if 'promotion_cost_list' in stat:
                    del stat['promotion_cost_list']
                    cost_count += 1
    
    with open(src, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f'Cleaned {desc_count} descriptions')
    print(f'Removed {cost_count} promotion_cost_lists')
    print(f'Fixed {path_count} path names')
    print(f'Total: {len(data)} lightcones')

if __name__ == '__main__':
    main()
