#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
refresh_smoke.py — UC-0113 refreshToken 静默续命 · App 客户端契约冒烟

验证 uni-jeeflow-app 客户端静默续命所依赖的服务端契约（三场景，AGENTS.md §6.9）：
  正向  R1 access 失效（篡改 token）→ 99990403
        R2 用 refreshToken 换新 → code=0，新 (token, refreshToken) 对且 ≠ 旧对
        R3 新 token 重放业务请求 → code=0（用户无感）
  负向  R4 旧 refreshToken 重放（全量轮转已作废）→ 99990410
        R5 垃圾 refreshToken → 99990410
  回归  R6 正常带 token 请求 → code=0
        R7 登出 → code=0，登出后旧 access → 99990403
        R8 登出后旧 refresh 联动失效（按 access 注销单一漏斗）→ 99990410
  前置  R0 登录响应含 token+refreshToken（客户端同对保存的前提）

为什么是 python：Git Bash curl 发中文 body 是 GBK 字节（Windows 实弹坑），一律 urllib+UTF-8。
用法：python scripts/refresh_smoke.py --base https://jeeflow-pro.mldong.com/api
退出码：全 PASS = 0，否则 1。
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

try:  # Windows 控制台 GBK 兜底
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

TOKEN_INVALID = 99990403
REFRESH_INVALID = 99990410
SUCCESS = 0


def http_json(method, url, body=None, token=None, timeout=30):
    headers = {"Content-Type": "application/json;charset=UTF-8"}
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.getcode(), resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read().decode("utf-8", "replace")
        except Exception:
            return e.code, ""
    except Exception as e:
        return 0, json.dumps({"__transport_error__": repr(e)}, ensure_ascii=False)


def parse_body(raw):
    try:
        return json.loads(raw)
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://jeeflow-pro.mldong.com/api")
    ap.add_argument("--user", default="admin")
    ap.add_argument("--password", default="123456")
    args = ap.parse_args()
    base = args.base.rstrip("/")

    results = []

    def record(cid, name, ok, detail=""):
        results.append((cid, name, ok, detail))
        print(f"[{'PASS' if ok else 'FAIL'}] {cid} {name}" + (f" | {detail}" if detail else ""))

    # R0 登录：响应须含 token + refreshToken（客户端同对保存的前提）
    st, raw = http_json("POST", base + "/sys/login",
                        {"userName": args.user, "password": args.password})
    login_body = parse_body(raw)
    ok = (st == 200 and login_body and login_body.get("code") == SUCCESS)
    token = refresh = ""
    if ok:
        data = login_body.get("data") or {}
        token = data.get("token") or ""
        refresh = data.get("refreshToken") or ""
        ok = bool(token) and bool(refresh)
    record("R0", "登录响应含 token+refreshToken", ok,
           "" if ok else f"http={st} body={raw[:200]}")

    if not ok:
        print("R0 未过（后端可能未部署 UC-0113），后续用例无意义，终止。")
        _summary(results)
        return 1

    # R1 正向：access 失效（篡改 token 模拟过期/被注销）→ 99990403
    st, raw = http_json("POST", base + "/sys/user/info", token=token + "x-tampered")
    body = parse_body(raw)
    ok = (body is not None and body.get("code") == TOKEN_INVALID)
    record("R1", "access 失效 → 99990403", ok, f"http={st} code={body.get('code') if body else '?'}")

    # R2 正向：refreshToken 换新对（全量轮转）
    st, raw = http_json("POST", base + "/sys/refreshToken", {"refreshToken": refresh})
    body = parse_body(raw)
    new_token = new_refresh = ""
    ok = (st == 200 and body and body.get("code") == SUCCESS)
    if ok:
        data = body.get("data") or {}
        new_token = data.get("token") or ""
        new_refresh = data.get("refreshToken") or ""
        ok = (bool(new_token) and bool(new_refresh)
              and new_token != token and new_refresh != refresh)
    record("R2", "refresh 换新对（新对≠旧对）", ok, f"http={st} code={body.get('code') if body else '?'}")

    # R3 正向：新 token 重放业务请求 → code=0（静默续命重放的落点）
    st, raw = http_json("POST", base + "/sys/user/info", token=new_token)
    body = parse_body(raw)
    ok = (body is not None and body.get("code") == SUCCESS)
    record("R3", "新 token 重放业务请求成功", ok, f"http={st} code={body.get('code') if body else '?'}")

    # R4 负向：旧 refreshToken 重放（全量轮转已作废）→ 99990410
    st, raw = http_json("POST", base + "/sys/refreshToken", {"refreshToken": refresh})
    body = parse_body(raw)
    ok = (body is not None and body.get("code") == REFRESH_INVALID)
    record("R4", "旧 refresh 重放 → 99990410", ok, f"http={st} code={body.get('code') if body else '?'}")

    # R5 负向：垃圾 refreshToken → 99990410
    st, raw = http_json("POST", base + "/sys/refreshToken", {"refreshToken": "garbage-not-a-token"})
    body = parse_body(raw)
    ok = (body is not None and body.get("code") == REFRESH_INVALID)
    record("R5", "垃圾 refresh → 99990410", ok, f"http={st} code={body.get('code') if body else '?'}")

    # R6 回归：新开登录，正常带 token 请求不受影响
    st, raw = http_json("POST", base + "/sys/login",
                        {"userName": args.user, "password": args.password})
    body = parse_body(raw)
    ok = (st == 200 and body and body.get("code") == SUCCESS)
    reg_token = reg_refresh = ""
    if ok:
        data = body.get("data") or {}
        reg_token = data.get("token") or ""
        reg_refresh = data.get("refreshToken") or ""
    st, raw = http_json("POST", base + "/sys/user/info", token=reg_token)
    body = parse_body(raw)
    ok = ok and body is not None and body.get("code") == SUCCESS
    record("R6", "回归：正常登录+带 token 请求", ok, f"http={st} code={body.get('code') if body else '?'}")

    # R7 回归：登出 → 0；登出后旧 access → 99990403
    st, raw = http_json("POST", base + "/sys/logout", token=reg_token)
    body = parse_body(raw)
    ok = (body is not None and body.get("code") == SUCCESS)
    st2, raw2 = http_json("POST", base + "/sys/user/info", token=reg_token)
    body2 = parse_body(raw2)
    ok = ok and body2 is not None and body2.get("code") == TOKEN_INVALID
    record("R7", "回归：登出后旧 access 失效", ok,
           f"logout http={st} code={body.get('code') if body else '?'}; after code={body2.get('code') if body2 else '?'}")

    # R8 登出后旧 refresh 联动失效（按 access 注销单一漏斗）→ 99990410
    st, raw = http_json("POST", base + "/sys/refreshToken", {"refreshToken": reg_refresh})
    body = parse_body(raw)
    ok = (body is not None and body.get("code") == REFRESH_INVALID)
    record("R8", "登出联动 refresh 失效 → 99990410", ok, f"http={st} code={body.get('code') if body else '?'}")

    return _summary(results)


def _summary(results):
    fails = [r for r in results if not r[2]]
    print(f"\n=== refresh_smoke: {len(results) - len(fails)}/{len(results)} PASS ===")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
