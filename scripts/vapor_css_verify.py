# -*- coding: utf-8 -*-
"""校验压平正确性：对比 HEAD~2（压平前）与工作区每个 class 的属性集合，报告丢失/变化"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

AUTO_FLATTENED = [  # 轮次A由脚本压平的文件（手工重写的两个不在内）
    'components/m-bar-list/m-bar-list.uvue',
    'components/m-flow-native/m-flow-native.uvue',
    'components/m-flow-native/m-flow-tree.uvue',
    'components/m-mini-bars/m-mini-bars.uvue',
    'components/m-navigation-bar/index.uvue',
    'components/m-picker-year-month/index.uvue',
    'components/m-timeline/m-timeline.uvue',
    'components/m-user-picker/index.uvue',
    'pages/analytics/analytics.uvue',
    'pages/approval/approval.uvue',
    'pages/index/index.uvue',
    'pages/login/login.uvue',
    'pages/personal/surrogate-form.uvue',
    'pages/personal/surrogate.uvue',
    'pages/workflow/instance-detail.uvue',
    'pages/workflow/my-instances.uvue',
    'pages/workflow/start-form.uvue',
    'pages/workflow/start.uvue',
]


def strip_comments(src):
    src = re.sub(r'/\*[\s\S]*?\*/', '', src)
    src = re.sub(r'//[^\n]*', '', src)
    return src


def parse_css(src):
    """解析（可能嵌套的）样式为 {类名: {prop: 值}}，类名取最内层"""
    src = strip_comments(src)
    out = {}

    def classify(body):
        props, rules = [], []
        i, n = 0, len(body)
        while i < n:
            while i < n and body[i] in ' \t\r\n':
                i += 1
            if i >= n:
                break
            brace = body.find('{', i)
            semi = body.find(';', i)
            if brace < 0 and semi < 0:
                break
            if semi >= 0 and (brace < 0 or semi < brace):
                p = body[i:semi].strip().rstrip(';').strip()
                if p and ':' in p:
                    k, v = p.split(':', 1)
                    props.append((k.strip(), v.strip()))
                i = semi + 1
            else:
                sel = body[i:brace].strip()
                depth, j = 1, brace + 1
                while j < n and depth > 0:
                    if body[j] == '{':
                        depth += 1
                    elif body[j] == '}':
                        depth -= 1
                    j += 1
                rules.append((sel, body[brace + 1:j - 1]))
                i = j
        return props, rules

    def walk(body, prefix):
        props, rules = classify(body)
        for k, v in props:
            # prefix 决定归属类：无 prefix 的属性属于最近规则，由调用方处理
            pass
    # 更直接：递归收集
    def collect(body, owner):
        props, rules = classify(body)
        if owner:
            out.setdefault(owner, {}).update(props)
        for sel, b in rules:
            # 取选择器的类名（本仓均为单类或逗号分组）
            for part in sel.split(','):
                nm = part.strip().lstrip('.').split(':')[0].split(' ')[0]
                if nm:
                    collect(b, nm)
        else:
            if not rules and owner is None:
                pass

    # 顶层
    props, rules = classify(src)
    top_props = dict(props)
    for sel, b in rules:
        nm = sel.strip().lstrip('.').split(':')[0].split(' ')[0]
        collect(b, nm)
    return out, top_props


def style_of(text):
    m = re.search(r'<style[^>]*>([\s\S]*)</style>', text)
    return m.group(1) if m else ''


def norm(props):
    return {k.replace(' ', '').lower(): re.sub(r'\s+', ' ', v) for k, v in props.items()}


def main():
    bad = 0
    for rel in AUTO_FLATTENED:
        old = subprocess.run(['git', 'show', f'HEAD~2:{rel}'], capture_output=True, text=True,
                             encoding='utf-8', cwd=ROOT).stdout
        new = (ROOT / rel).read_text(encoding='utf-8')
        old_map, _ = parse_css(style_of(old))
        new_map, _ = parse_css(style_of(new))
        for cls, oprops in old_map.items():
            if cls not in new_map:
                print(f'{rel}: 类 .{cls} 丢失!')
                bad += 1
                continue
            o, n = norm(oprops), norm(new_map[cls])
            for k, v in o.items():
                if k not in n:
                    print(f'{rel}: .{cls} 丢失属性 {k}: {v}')
                    bad += 1
                elif n[k] != v:
                    print(f'{rel}: .{cls} 属性 {k} 变化: {v!r} -> {n[k]!r}')
                    bad += 1
    print(f'\nTOTAL issues: {bad}')


if __name__ == '__main__':
    main()
