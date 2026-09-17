# -*- coding: utf-8 -*-
"""审计：同一元素多 class 时各类样式属性是否重叠（蒸汽下不依赖规则顺序，重叠必须改内联）"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 公共类样式（common.less 展开后）
COMMON_CSS = ROOT / 'static' / 'css' / 'common.less'


def parse_flat_css(src):
    """从压平后的样式源码提取 {类名: {prop: value}}"""
    out = {}
    # 去注释
    src = re.sub(r'//[^\n]*', '', src)
    src = re.sub(r'/\*[\s\S]*?\*/', '', src)
    for m in re.finditer(r'\.([A-Za-z][A-Za-z0-9_-]*)\s*\{([^{}]*)\}', src):
        name, body = m.group(1), m.group(2)
        props = {}
        for line in body.split(';'):
            line = line.strip()
            if ':' in line:
                k, v = line.split(':', 1)
                props[k.strip()] = v.strip()
        out.setdefault(name, {}).update(props)
    return out


def template_class_usage(text):
    """提取模板中静态多 class 元素：[(行号, [类...])]；跳过 :class 动态绑定"""
    rows = []
    for i, line in enumerate(text.split('\n'), 1):
        for m in re.finditer(r'\sclass="([^":{}]+)"', line):
            classes = m.group(1).split()
            if len(classes) > 1:
                rows.append((i, classes))
    return rows


def main():
    common = parse_flat_css(COMMON_CSS.read_text(encoding='utf-8')) if COMMON_CSS.exists() else {}
    files = sorted([p for p in (ROOT / 'pages').rglob('*.uvue')] +
                   [p for p in (ROOT / 'components').rglob('*.uvue')] +
                   [ROOT / 'App.uvue'])
    issues = 0
    for fp in files:
        text = fp.read_text(encoding='utf-8')
        sm = re.search(r'<style[^>]*>([\s\S]*)</style>', text)
        local = parse_flat_css(sm.group(1)) if sm else {}
        merged = dict(common)
        merged.update(local)
        for lineno, classes in template_class_usage(text[:text.find('<script') if '<script' in text else len(text)]):
            known = [c for c in classes if c in merged]
            # 两两求属性交集
            for a_i in range(len(known)):
                for b_i in range(a_i + 1, len(known)):
                    a, b = known[a_i], known[b_i]
                    overlap = set(merged[a]) & set(merged[b])
                    if overlap:
                        issues += 1
                        print(f'{fp.relative_to(ROOT)}:{lineno} class="{" ".join(classes)}"')
                        print(f'   {a} ∩ {b}: {sorted(overlap)}')
    print(f'\nTOTAL conflicts: {issues}')


if __name__ == '__main__':
    main()
