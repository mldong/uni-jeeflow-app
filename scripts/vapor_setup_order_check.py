# -*- coding: utf-8 -*-
"""UTS setup 前向引用静态检查：setup 内名字必须先声明后引用（Kotlin 局部作用域语义）"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [p for p in (ROOT / 'pages').rglob('*.uvue')] + \
        [p for p in (ROOT / 'components').rglob('*.uvue')] + \
        [ROOT / 'App.uvue']

DECL_PATTERNS = [
    re.compile(r'^\s*(?:const|let|function|type)\s+(\w+)'),
]


def main():
    issues = 0
    for fp in FILES:
        text = fp.read_text(encoding='utf-8')
        m = re.search(r'<script setup[^>]*>([\s\S]*?)</script>', text)
        if not m:
            continue
        lines = m.group(1).split('\n')
        decls = {}  # name -> decl line index
        for i, line in enumerate(lines):
            if line.strip().startswith('import '):
                continue
            for pat in DECL_PATTERNS:
                dm = pat.match(line)
                if dm:
                    decls.setdefault(dm.group(1), i)
                    # 函数参数名也算在该行声明（避免与其他函数内局部变量同名误报）
                    if line.strip().startswith('function'):
                        pm = re.match(r'function\s+\w+\s*\(([^)]*)\)', line.strip())
                        if pm:
                            for p in pm.group(1).split(','):
                                pn = p.strip().split(':')[0].strip()
                                if re.match(r'^\w+$', pn):
                                    decls.setdefault(pn, i)
                    break
        if not decls:
            continue
        for i, line in enumerate(lines):
            code = re.sub(r'//.*', '', line)
            code = re.sub(r"'[^']*'", "''", code)
            code = re.sub(r'"[^"]*"', '""', code)
            if code.strip() == '' or code.strip().startswith('*'):
                continue
            # lambda 参数名视为该行声明：((a: T, b) => ...) 或 (a: T): Ret => ...
            for pm in re.finditer(r'\(([^()]*)\)\s*(?::\s*[^=)]+)?=>', code):
                for p in pm.group(1).split(','):
                    pn = p.strip().split(':')[0].strip()
                    if re.match(r'^\w+$', pn):
                        decls.setdefault(pn, i)
            for name, dl in decls.items():
                if dl > i and re.search(r'(?<![.\w])' + re.escape(name) + r'\b', code):
                    print(f'{fp.relative_to(ROOT)}:{i + 1}: 前向引用「{name}」（声明在第{dl + 1}行）: {code.strip()[:80]}')
                    issues += 1
    print(f'\nTOTAL forward-ref issues: {issues}')


if __name__ == '__main__':
    main()
