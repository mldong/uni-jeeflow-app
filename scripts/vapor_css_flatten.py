# -*- coding: utf-8 -*-
"""蒸汽模式迁移 · CSS 嵌套压平脚本
把 .uvue <style> 里的嵌套 less（编译后为后代选择器，蒸汽运行时不支持）
压平为顶层单类选择器。约定：类名全局唯一（本仓 BEM 命名），
压平 = 丢弃祖先链只保留最内层选择器；同名类出现在不同嵌套语境时报告冲突不压平。
用法：python scripts/vapor_css_flatten.py [--write]   # 缺省只输出报告
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def find_style_block(text):
    m = re.search(r'<style[^>]*>', text)
    if not m:
        return None
    start = m.end()
    end = text.rfind('</style>')
    return start, end


def parse_block(src, base_indent):
    """解析一层规则，返回 [(selector, body_or_children, comment)]"""
    rules = []
    i = 0
    n = len(src)
    while i < n:
        # 跳过空白
        while i < n and src[i] in ' \t\r\n':
            i += 1
        if i >= n:
            break
        # 收集前置注释
        comment = None
        if src.startswith('//', i):
            j = src.find('\n', i)
            comment = src[i:j].strip()
            i = j
            while i < n and src[i] in ' \t\r\n':
                i += 1
        elif src.startswith('/*', i):
            j = src.find('*/', i) + 2
            comment = src[i:j]
            i = j
            while i < n and src[i] in ' \t\r\n':
                i += 1
        # 选择器到 {
        brace = src.find('{', i)
        if brace < 0:
            break
        selector = src[i:brace].strip()
        # 匹配配对大括号
        depth = 1
        j = brace + 1
        while j < n and depth > 0:
            if src[j] == '{':
                depth += 1
            elif src[j] == '}':
                depth -= 1
            j += 1
        body = src[brace + 1:j - 1]
        rules.append((selector, body, comment))
        i = j
    return rules


def flatten(selector, body, out, path, conflicts):
    path = path + [selector] if selector else path
    children = parse_block(body, 1)
    own_props = []
    nested = []
    for sel, b, _c in children:
        if re.match(r'^[a-z-]+\s*:', sel) or ':' in sel.split(',')[0]:
            # 属性行 width: xxx; （selector 里含冒号且以属性名开头）
            own_props.append(sel.rstrip(';'))
        else:
            nested.append((sel, b))
    # 更稳的判定：逐行扫描 body，行尾不是 { 的都是属性
    own_props = []
    nested = []
    lines = body.split('\n')
    buf = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.endswith('{'):
            # 选择器行，找到配对
            sel = stripped[:-1].strip()
            if ',' in sel or re.match(r'^\.[A-Za-z]', sel):
                nested.append(sel)
                buf = []
                continue
        if stripped.endswith('}'):
            continue
        buf.append(stripped)
    # 重新用结构化方式：直接递归解析
    own_props = []
    nested_rules = []
    for sel, b, c in children:
        # 判断是属性还是嵌套规则：属性形如 name: value（不含 { }
        if b.strip() == '' and ('{' not in sel):
            pass
        nested_rules.append((sel, b, c))
    # 简化：交给 classify
    props, rules = classify(body)
    for p in props:
        out.append((path, None, p))
    for sel, b, c in rules:
        flatten(sel, b, out, path, conflicts)


def classify(body):
    """把 body 分成属性行与子规则"""
    props = []
    rules = []
    i = 0
    n = len(body)
    while i < n:
        while i < n and body[i] in ' \t\r\n':
            i += 1
        if i >= n:
            break
        brace = body.find('{', i)
        semi = body.find(';', i)
        if brace < 0 and semi < 0:
            # 剩余全是垃圾/注释
            break
        if semi >= 0 and (brace < 0 or semi < brace):
            prop = body[i:semi].strip().rstrip(';')
            if prop and not prop.startswith('//') and not prop.startswith('/*'):
                props.append(prop)
            i = semi + 1
        else:
            sel = body[i:brace].strip()
            depth = 1
            j = brace + 1
            while j < n and depth > 0:
                if body[j] == '{':
                    depth += 1
                elif body[j] == '}':
                    depth -= 1
                j += 1
            rules.append((sel, body[brace + 1:j - 1], None))
            i = j
    return props, rules


def process_file(fp, write):
    text = fp.read_text(encoding='utf-8')
    blk = find_style_block(text)
    if not blk:
        return None
    s, e = blk
    style_src = text[s:e]
    top_rules = parse_block(style_src, 0)
    out_rules = []  # (comment, selector, [props])
    conflicts = []
    seen = {}  # inner selector -> path

    def emit(comment, sel, props):
        base = sel.split(',')[0].strip()
        if base in seen and seen[base] != 'TOP':
            conflicts.append((fp.name, base, '重复定义 @ ' + ' > '.join(seen[base])))
        seen.setdefault(base, ['TOP'] if comment != '__NESTED__' else seen.get(base, ['TOP']))
        out_rules.append((comment, sel, props))

    def walk(rules, path, in_comment):
        for sel, body, comment in rules:
            props, children = classify(body)
            cmt = comment if comment else None
            if not children:
                out_rules.append((cmt, sel, props))
                key = sel
                if key in seen and seen[key] != path + [sel]:
                    conflicts.append((fp.name, key, '顶层重复'))
                seen[key] = path + [sel]
            else:
                if props:
                    out_rules.append((cmt, sel, props))
                    seen[sel] = path + [sel]
                for csel, cbody, ccomment in children:
                    walk([ (csel, cbody, ccomment) ], path + [sel], cmt)

    for sel, body, comment in top_rules:
        walk([(sel, body, comment)], [], None)

    # 生成新 style
    lines = []
    for cmt, sel, props in out_rules:
        if cmt:
            lines.append('\t' + cmt)
        lines.append('\t' + sel + ' {')
        for p in props:
            lines.append('\t\t' + p + ';')
        lines.append('\t}')
        lines.append('')
    new_style = '\n' + '\n'.join(lines).rstrip() + '\n'
    new_text = text[:s] + new_style + text[e:]
    return new_text, out_rules, conflicts


def main():
    write = '--write' in sys.argv
    files = sorted([p for p in (ROOT / 'pages').rglob('*.uvue')] +
                   [p for p in (ROOT / 'components').rglob('*.uvue')] +
                   [ROOT / 'App.uvue'])
    total_nested = 0
    for fp in files:
        text = fp.read_text(encoding='utf-8')
        blk = find_style_block(text)
        if not blk:
            continue
        style_src = text[blk[0]:blk[1]]
        top_rules = parse_block(style_src, 0)

        def count_nested(rules):
            cnt = 0
            for sel, body, _ in rules:
                props, children = classify(body)
                if children:
                    cnt += len(children) + count_nested(children)
            return cnt

        n_nested = count_nested(top_rules)
        if n_nested == 0:
            continue
        total_nested += n_nested
        res = process_file(fp, write)
        if res is None:
            continue
        new_text, out_rules, conflicts = res
        print(f'{fp.relative_to(ROOT)}: nested={n_nested} -> flat={len(out_rules)} conflicts={len(conflicts)}')
        for c in conflicts:
            print('   CONFLICT:', c)
        if write and not conflicts:
            fp.write_text(new_text, encoding='utf-8')
    print(f'TOTAL nested rules: {total_nested}')


if __name__ == '__main__':
    main()
