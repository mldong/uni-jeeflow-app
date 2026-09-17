#!/usr/bin/env python3
# 蒲公英 API 直传（分步式：getCOSToken → COS multipart → buildInfo）
# 用法: python scripts/pgyer_upload.py <apk路径> [更新说明] [_api_key]
# _api_key 缺省读 hub 私有仓 certs/pgyer-api-key.txt（严禁写进任何公开仓）
# 首选先取 COS 凭证再 multipart 直传对象存储，最后 buildInfo 触发蒲公英解析入库
import io
import json
import os
import sys
import urllib.parse
import urllib.request

API = "https://www.pgyer.com/apiv2"
DEFAULT_KEY_FILE = "G:/mldong-bot/mldong-hub/jeeflow-integrations/certs/pgyer-api-key.txt"


def read_api_key() -> str:
    if len(sys.argv) >= 4:
        return sys.argv[3]
    with io.open(DEFAULT_KEY_FILE, encoding="utf-8") as f:
        for line in f:
            if line.startswith("API_KEY="):
                return line.strip().split("=", 1)[1]
    raise SystemExit("api key not found: " + DEFAULT_KEY_FILE)


def post_form(url: str, fields: dict):
    payload = "&".join(
        f"{k}={urllib.parse.quote(str(v), safe='')}" for k, v in fields.items()
    ).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST")
    return json.load(urllib.request.urlopen(req, timeout=60))


def upload_cos(endpoint: str, params: dict, apk_path: str) -> None:
    boundary = os.urandom(16).hex()
    parts = []
    for k, v in params.items():
        parts.append(
            (
                f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'
            ).encode("utf-8")
        )
    with open(apk_path, "rb") as f:
        apk_bytes = f.read()
    parts.append(
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
            f'filename="{os.path.basename(apk_path)}"\r\n'
            f"Content-Type: application/vnd.android.package-archive\r\n\r\n"
        ).encode("utf-8")
    )
    parts.append(apk_bytes)
    parts.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    req = urllib.request.Request(endpoint, data=b"".join(parts), method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    resp = urllib.request.urlopen(req, timeout=1800)
    if resp.status not in (200, 204):
        raise SystemExit(f"COS upload http {resp.status}")


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: pgyer_upload.py <apk> [updateDescription] [_api_key]")
    apk = sys.argv[1]
    desc = sys.argv[2] if len(sys.argv) >= 3 else ""
    api_key = read_api_key()

    r1 = post_form(
        f"{API}/app/getCOSToken",
        {"_api_key": api_key, "buildType": "adhoc", "updateDescription": desc},
    )
    if r1.get("code") != 0:
        raise SystemExit("getCOSToken failed: " + json.dumps(r1, ensure_ascii=False))
    d = r1["data"]
    print("costoken ok, buildKey =", d["key"])

    upload_cos(d["endpoint"], d["params"], apk)
    print("cos upload ok")

    # 刚传完会报 code 1247「App is being processed」，需轮询直到 code 0（v0.1.3 实弹：
    # 首调即 1247，20s 后 code 0）；最多等 15 分钟。
    # 非 1247/0 的 code 视为真错误（如 buildKey 失效），立即退出，不空等 15 分钟。
    import time
    r3 = None
    for i in range(45):
        r3 = post_form(f"{API}/app/buildInfo", {"_api_key": api_key, "buildKey": d["key"]})
        c = r3.get("code")
        if c == 0:
            break
        if c != 1247:
            raise SystemExit("buildInfo failed: " + json.dumps(r3, ensure_ascii=False))
        if i < 44:
            print("buildInfo code=1247 解析中，20s 后重试（{}/45）".format(i + 1))
            time.sleep(20)
    if r3 is None or r3.get("code") != 0:
        raise SystemExit("buildInfo failed: " + json.dumps(r3, ensure_ascii=False))
    b = r3.get("data", {})
    # 版本字段三分（勿混）：buildVersion=versionName / buildVersionNo=versionCode（升级判定看它）
    # / buildBuildVersion=蒲公英侧上传计数
    print(
        "buildInfo ok: v{}(versionCode {}) pgyer-#{}/{} isLastest={} shortcut={}".format(
            b.get("buildVersion"),
            b.get("buildVersionNo"),
            b.get("buildBuildVersion"),
            b.get("buildKey"),
            b.get("buildIsLastest"),
            b.get("buildShortcutUrl"),
        )
    )


if __name__ == "__main__":
    main()
