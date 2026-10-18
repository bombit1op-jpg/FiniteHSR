#!/usr/bin/env python3
"""Parse combat_mechanics.json text into structured sections, generate .md"""
import json, re, os, html

def decode_entities(text):
    def replace_hex(m):
        try: return chr(int(m.group(1), 16))
        except: return m.group(0)
    text = re.sub(r'&#x([0-9a-fA-F]+);', replace_hex, text)
    text = html.unescape(text)
    return text

def clean_text(text):
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    lines = text.split('\n')
    out = []
    for line in lines:
        stripped = line.rstrip()
        if stripped and not all(c in '\t ' for c in stripped):
            out.append(stripped)
    result = []
    blank = 0
    for line in out:
        if line == '':
            blank += 1
            if blank <= 1:
                result.append('')
        else:
            blank = 0
            result.append(line)
    return '\n'.join(result)

def extract_displaystyle(text):
    def fmt(content):
        inner = content[len('{\\displaystyle '):-1]
        inner = re.sub(r'\\text\{([^}]*)\}', r'\1', inner)
        inner = re.sub(r'\\d?frac\{([^}]*)\}\{([^}]*)\}', r'(\1)/(\2)', inner)
        inner = re.sub(r'\\times', '×', inner)
        inner = re.sub(r'\\cdot', '·', inner)
        inner = re.sub(r'\\max', 'max', inner)
        inner = re.sub(r'\\min', 'min', inner)
        inner = re.sub(r'\\leq', '≤', inner)
        inner = re.sub(r'\\geq', '≥', inner)
        inner = re.sub(r'\\neq', '≠', inner)
        inner = re.sub(r'\\[a-zA-Z]+', ' ', inner)
        inner = inner.replace('{', '').replace('}', '')
        inner = inner.strip()
        inner = re.sub(r'^\s*aligned\s*', '', inner)
        inner = re.sub(r'\s*aligned\s*$', '', inner)
        inner = re.sub(r'\s+', ' ', inner).strip()
        return f'**`{inner}`**'
    result = []
    i = 0
    while i < len(text):
        m = re.search(r'\{\\displaystyle\s', text[i:])
        if not m:
            result.append(text[i:])
            break
        start = i + m.start()
        result.append(text[i:start])
        depth = 0
        j = start
        while j < len(text):
            if text[j] == '{': depth += 1
            elif text[j] == '}':
                depth -= 1
                if depth == 0:
                    result.append(fmt(text[start:j+1]))
                    i = j + 1
                    break
            j += 1
        else:
            result.append(text[start:])
            i = len(text)
    return ''.join(result)

def parse_sections(text):
    """Extract main sections from the text."""
    lines = text.split('\n')
    
    title = ''
    type_ = ''
    description_lines = []
    
    section_markers = [
        'Contents', 'Description', 'Enemies', 'Abilities', 'Bonus Abilities',
        'Eidolons', 'Light Cones', 'Other Languages', 'Change History',
        'Navigation', 'Related Characters', 'Factions',
    ]
    
    i = 0
    state = 'seeking_title'
    sections = {}
    current_section = None
    found_type = False
    
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        
        if not line:
            continue
        
        # Skip noise
        if line in ['[', ']', '[ ]', '[  ]']:
            continue
        if line == 'Toggle Descriptions':
            continue
        if re.match(r'^\d+\s*$', line):
            continue
        
        # Skip TOC
        if state == 'seeking_title' and line == 'Contents':
            while i < len(lines):
                l = lines[i].strip()
                i += 1
                if l in section_markers and l != 'Contents':
                    current_section = l
                    sections[l] = []
                    state = 'in_sections'
                    break
            continue
        
        # Detect type
        if line in ['Combat', 'Status Effect', 'Support'] and not found_type:
            type_ = line
            found_type = True
            continue
        
        if line == 'Type' and not found_type:
            continue
        
        # Detect section start
        if line in section_markers:
            if line == 'Contents':
                while i < len(lines):
                    l = lines[i].strip()
                    i += 1
                    if l in section_markers and l != 'Contents':
                        current_section = l
                        sections[l] = []
                        break
                continue
            current_section = line
            sections[line] = []
            state = 'in_sections'
            continue
        
        # Title: first significant text after header
        if state == 'seeking_title' and not title:
            # Skip navigation-like lines
            if len(line) > 200:
                continue
            title = line
            state = 'got_title'
            continue
        
        # Description: lines after title, before sections
        if state in ('got_title',):
            if not re.match(r'^\d+$', line):
                # Skip lines that are just the mechanic name repeated
                if line != title:
                    description_lines.append(line)
            continue
        
        # Section content
        if current_section is not None:
            sections[current_section].append(line)
    
    return {
        'title': title,
        'type': type_,
        'description': ' '.join(description_lines),
        'sections': sections,
    }

def merge_formula_lines(text):
    lines = text.split('\n')
    result = []
    buf = []
    
    def flush():
        if buf:
            merged = ' '.join(buf)
            merged = re.sub(r'\s+', ' ', merged).strip()
            result.append(merged)
            buf.clear()
    
    ops = set('= + - × · ( ) [ ] { } / % ≤ ≥ ≠ ≈ ±'.split())
    ops |= {'=', '+', '-', '×', '·', '(', ')'}
    
    def is_token(s):
        if not s: return False
        if s in ops: return True
        if re.match(r'^[\d.%—–]+[%]?$', s): return True
        if len(s) <= 40: return True
        return False
    
    def is_cont(s):
        if not s: return False
        if s in ops: return True
        if re.match(r'^[\d.%—–]+[%]?$', s): return True
        if len(s) <= 30 and s[0].islower(): return True
        if s[0].islower(): return True
        return False
    
    for i, line in enumerate(lines):
        s = line.strip()
        if s == '':
            flush()
            result.append('')
            continue
        
        if is_token(s) and i + 1 < len(lines):
            ns = lines[i+1].strip()
            if ns and is_cont(lines[i+1]):
                buf.append(s)
                continue
        
        if buf and is_cont(line):
            buf.append(s)
            continue
        
        flush()
        result.append(line)
    
    flush()
    return '\n'.join(result)

def md_table(rows, headers=None):
    """Convert list of dicts to markdown table."""
    if not rows:
        return ''
    if not headers:
        headers = list(rows[0].keys())
    header_line = '| ' + ' | '.join(headers) + ' |'
    sep_line = '| ' + ' | '.join(['---'] * len(headers)) + ' |'
    data_lines = []
    for row in rows:
        vals = [str(row.get(h, '')).replace('\n', ' ') for h in headers]
        data_lines.append('| ' + ' | '.join(vals) + ' |')
    return '\n'.join([header_line, sep_line] + data_lines)

def mechanic_to_md(name, entry):
    parsed = parse_sections(clean_text(decode_entities(entry.get('text', ''))))
    tables = entry.get('tables', [])
    
    lines = []
    
    # Title
    title = parsed['title'] or name
    lines.append(f'# {title}')
    lines.append('')
    
    # Type
    ptype = parsed['type']
    if ptype:
        lines.append(f'**Type:** {ptype}')
        lines.append('')
    
    # Description
    desc = parsed['description']
    if desc:
        # Remove TOC-like content
        desc = re.sub(r'\d+\s+\w+.*?(?=\w+\s)', '', desc)
        desc = re.sub(r'\s+', ' ', desc).strip()
        if desc:
            lines.append(desc)
            lines.append('')
    
    # Extract formulas from description/text
    raw_text = entry.get('text', '')
    formulas = extract_displaystyle(decode_entities(raw_text))
    formula_blocks = re.findall(r'\*\*`[^`]+`\*\*', formulas)
    if formula_blocks:
        lines.append('## Formulas')
        lines.append('')
        for f in formula_blocks:
            lines.append(f)
            lines.append('')
    
    # Tables
    if tables:
        for table in tables:
            if not table:
                continue
            headers = list(table[0].keys())
            # Skip navigation tables (single column with empty values)
            if len(headers) == 1 and all(not v for row in table for v in row.values()):
                continue
            # Skip language tables
            if 'Language' in headers and 'Official Name' in headers:
                continue
            # Clean header names
            clean_headers = [h.replace('&#160;', '').strip() for h in headers]
            lines.append(md_table(table, headers))
            lines.append('')
    
    return '\n'.join(lines)

def main():
    base = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(base, 'data', 'combat_mechanics.json')
    dst_dir = os.path.join(base, '..', 'docs', 'combat_mechanics')
    os.makedirs(dst_dir, exist_ok=True)
    
    with open(data_path, encoding='utf-8') as f:
        data = json.load(f)
    
    for name, entry in data.items():
        md = mechanic_to_md(name, entry)
        dst = os.path.join(dst_dir, f'{name}.md')
        with open(dst, 'w', encoding='utf-8') as f:
            f.write(md)
        print(f'  {name}.md ({len(md)//1024}KB)')
    
    print(f'\nDone! {len(data)} files')

if __name__ == '__main__':
    main()
