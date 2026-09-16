#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
stack_smoke.py — T027 uni-jeeflow-app 十三栈契约冒烟（等价 App 全部 API 调用面）

分层：
  L1 硬门（任一 FAIL = 该栈红）：负向鉴权/登录/captcha/user-info/listByType/
      分页四件套+雪花id字符串/消息两件/stats overview
  L2 软检查（只记录不挡）：字典 biz_leave_reason_type / stats trend+group /
      rejectRate·countersignRate 形态 / listByType 请假卡片（App 工作台真实路径）/ dev schema / user select
  L3 请假发起-审批闭环（best-effort，任何失败记 skip 不挡）

调用面对齐（2026-09-14 日班复核）：脚本只测 App 真实会发的请求——
  /sys/menu/appList 与 /wf/processDefine/getLastByName **不是 App 调用面**
  （前者全仓零调用，后者仅 start-form 的 defineName 死分支，工作台卡片恒带 defineId），
  初版曾照任务书测过这两个端点， artifacts 里 L1-04/L2-05 旧行属超纲，读数时忽略。

约定：全 POST+JSON（特别注明的 GET 除外），Authorization: Bearer <token>，成功 code===0。
为什么是 python：Git Bash curl 发中文 body 是 GBK 字节（Windows 实弹坑），一律 urllib+UTF-8。

用法：
  python stack_smoke.py --base https://jeeflow-pro.mldong.com/api --stack goframe \
      --json-out goframe.json \
      --md-out  goframe.md
退出码：L1 全 PASS = 0，否则 1。
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

try:  # Windows 控制台 GBK 兜底
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

TOKEN_INVALID = 99990403


def http_json(method, url, body=None, token=None, timeout=30):
    """返回 (http_status, raw_text)。transport 异常时 status=0，raw 含 __transport_error__。"""
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


def clip(text, n=600):
    text = (text or "").strip().replace("\n", " ")
    return text if len(text) <= n else text[:n] + "…"


class Smoke:
    def __init__(self, base, stack):
        self.base = base.rstrip("/")
        self.stack = stack
        self.checks = []          # {id,layer,name,status,detail}
        self.token = None
        self.user_id = None
        self.leave_card = None    # listByType 里 App 工作台会渲染的请假卡片 {processDefineId,name}
        self.l3 = {"enabled": False, "status": "SKIP", "steps": []}

    def record(self, cid, layer, name, status, detail=""):
        self.checks.append({"id": cid, "layer": layer, "name": name,
                            "status": status, "detail": clip(detail, 800)})
        print("  [%s] %s %s %s" % (status, cid, name, clip(detail, 160)))

    def post(self, path, body, token=None):
        return http_json("POST", self.base + path, body=body, token=token)

    def get(self, path, token=None):
        return http_json("GET", self.base + path, token=token)

    # ── L1 ────────────────────────────────────────────────────────────────
    def l1_negative_auth(self):
        st, raw = self.post("/sys/user/info", {}, token=None)
        body = parse_body(raw)
        code = body.get("code") if isinstance(body, dict) else None
        if code == TOKEN_INVALID:
            self.record("L1-00", "L1", "负向:无token打user/info得99990403", "PASS",
                        "http=%s code=%s" % (st, code))
        else:
            self.record("L1-00", "L1", "负向:无token打user/info得99990403", "FAIL",
                        "http=%s raw=%s" % (st, clip(raw)))

    def l1_login(self):
        st, raw = self.post("/sys/login", {"userName": "admin", "password": "123456"})
        body = parse_body(raw)
        token = None
        user_id = None
        if isinstance(body, dict) and body.get("code") == 0:
            data = body.get("data")
            if isinstance(data, dict):
                token = data.get("token")
                user_id = data.get("userId")
            elif isinstance(data, str):
                token = data
        if isinstance(token, str) and len(token) > 0:
            self.token = token
            self.user_id = str(user_id) if user_id is not None else None
            self.record("L1-01", "L1", "登录 admin/123456", "PASS",
                        "userId=%s tokenLen=%d" % (self.user_id, len(token)))
        else:
            self.record("L1-01", "L1", "登录 admin/123456", "FAIL",
                        "http=%s raw=%s" % (st, clip(raw, 1200)))

    def l1_captcha(self):
        st, raw = self.post("/sys/getCaptchaOpenFlag", {})
        body = parse_body(raw)
        if isinstance(body, dict) and body.get("code") == 0:
            flag = (body.get("data") or {}).get("flag") if isinstance(body.get("data"), dict) else None
            if flag is True:
                self.record("L1-02", "L1", "getCaptchaOpenFlag", "WARN",
                            "code=0 但 flag=true，App 登录流需验证码，日班确认")
            else:
                self.record("L1-02", "L1", "getCaptchaOpenFlag", "PASS", "flag=%s" % flag)
        else:
            self.record("L1-02", "L1", "getCaptchaOpenFlag", "FAIL",
                        "http=%s raw=%s" % (st, clip(raw)))

    def l1_user_info(self):
        st, raw = self.post("/sys/user/info", {}, token=self.token)
        body = parse_body(raw)
        ok = isinstance(body, dict) and body.get("code") == 0
        self.record("L1-03", "L1", "带token user/info", "PASS" if ok else "FAIL",
                    "http=%s code=%s" % (st, body.get("code") if isinstance(body, dict) else "?"))
        # 注：/sys/menu/appList 不是 App 调用面（全仓零调用），不设硬门（初版 L1-04 超纲，见文件头）

    def l1_list_by_type(self):
        st, raw = self.post("/wf/processDesign/listByType", {}, token=self.token)
        body = parse_body(raw)
        data = body.get("data") if isinstance(body, dict) else None
        if isinstance(body, dict) and body.get("code") == 0 and isinstance(data, list):
            types = []
            for item in data:
                if isinstance(item, dict) and item.get("type") is not None:
                    types.append(item.get("type"))
                elif isinstance(item, (int, float, str)):
                    types.append(item)
            nums = [t for t in types if isinstance(t, (int, float))
                    or (isinstance(t, str) and t.lstrip("-").isdigit())]
            if len(nums) == len(types) and len(nums) >= 2:
                seq = [float(t) for t in nums]
                asc = all(seq[i] <= seq[i + 1] for i in range(len(seq) - 1))
                self.record("L1-05", "L1", "listByType code0+数组", "PASS",
                            "type序=%s 升序=%s" % (types, asc))
            else:
                self.record("L1-05", "L1", "listByType code0+数组", "PASS",
                            "type序=%s" % (types,))
            # 顺带抽出「App 工作台会渲染的卡片行」（mapListByType 口径：processDefineId 非空）
            self.leave_card = self._find_leave_card(data)
        else:
            self.record("L1-05", "L1", "listByType code0+数组", "FAIL",
                        "http=%s raw=%s" % (st, clip(raw)))
            self.leave_card = None

    def _find_leave_card(self, groups):
        """App 工作台口径：行带 processDefineId 才渲染；在此找 leave/请假 卡片。"""
        for grp in groups if isinstance(groups, list) else []:
            if not isinstance(grp, dict):
                continue
            for row in grp.get("items") or (grp.get("list") if isinstance(grp.get("list"), list) else []) or []:
                if not isinstance(row, dict):
                    continue
                did = row.get("processDefineId")
                if did is None or str(did) == "":
                    continue
                name = "%s %s" % (row.get("name") or "", row.get("displayName")
                                  or row.get("dDisplayName") or "")
                if "leave" in name.lower() or "请假" in name:
                    return {"processDefineId": str(did), "name": name.strip()}
        return None

    def l1_pagination(self, cid, path, id_keys):
        st, raw = self.post(path, {"pageNum": 1, "pageSize": 1}, token=self.token)
        body = parse_body(raw)
        data = body.get("data") if isinstance(body, dict) else None
        rc = data.get("recordCount") if isinstance(data, dict) else None
        rc_num = isinstance(rc, (int, float)) and not isinstance(rc, bool)
        if isinstance(body, dict) and body.get("code") == 0 and rc_num:
            if rc > 0:
                for key in id_keys:
                    if re.search(r'"%s"\s*:\s*"' % key, raw):
                        self.record(cid, "L1", "%s 分页+雪花字符串" % path, "PASS",
                                    "recordCount=%s idKey=%s" % (rc, key))
                        return
                self.record(cid, "L1", "%s 分页+雪花字符串" % path, "FAIL",
                            "recordCount=%s 但无字符串形态 id（keys 尝试 %s）raw=%s"
                            % (rc, id_keys, clip(raw, 500)))
            else:
                self.record(cid, "L1", "%s 分页+雪花字符串" % path, "PASS",
                            "recordCount=0 空列表无可断言行")
        else:
            self.record(cid, "L1", "%s 分页+雪花字符串" % path, "FAIL",
                        "http=%s code=%s recordCount=%s raw=%s"
                        % (st, body.get("code") if isinstance(body, dict) else "?",
                           rc, clip(raw, 500)))

    def l1_message(self):
        st1, raw1 = self.post("/sys/message/page", {"pageNum": 1, "pageSize": 1}, token=self.token)
        b1 = parse_body(raw1)
        ok1 = isinstance(b1, dict) and b1.get("code") == 0
        self.record("L1-07a", "L1", "message/page", "PASS" if ok1 else "FAIL",
                    "http=%s code=%s" % (st1, b1.get("code") if isinstance(b1, dict) else "?"))
        st2, raw2 = self.post("/sys/message/getUnreadCount", {}, token=self.token)
        b2 = parse_body(raw2)
        ok2 = isinstance(b2, dict) and b2.get("code") == 0
        self.record("L1-07b", "L1", "message/getUnreadCount", "PASS" if ok2 else "FAIL",
                    "http=%s code=%s" % (st2, b2.get("code") if isinstance(b2, dict) else "?"))

    def l1_stats_overview(self):
        st, raw = self.post("/wf/processInstance/stats/overview", {}, token=self.token)
        body = parse_body(raw)
        ok = isinstance(body, dict) and body.get("code") == 0
        self.record("L1-08", "L1", "stats/overview", "PASS" if ok else "FAIL",
                    "http=%s code=%s" % (st, body.get("code") if isinstance(body, dict) else "?"))
        return body if ok else None

    # ── L2 ────────────────────────────────────────────────────────────────
    def l2_dict(self):
        st, raw = self.post("/sys/dict/getByDictType", {"dictType": "biz_leave_reason_type"},
                            token=self.token)
        body = parse_body(raw)
        data = body.get("data") if isinstance(body, dict) else None
        n = len(data) if isinstance(data, list) else -1
        if n > 0:
            self.record("L2-01", "L2", "字典 biz_leave_reason_type", "PASS", "%d 项" % n)
        else:
            self.record("L2-01", "L2", "字典 biz_leave_reason_type", "WARN",
                        "无数据（code=%s），App 发起页走静态 options 兜底"
                        % (body.get("code") if isinstance(body, dict) else "?"))

    def l2_stats_extra(self, overview_body):
        today = date.today()
        # App 契约（analytics.uvue fmtDT）：YYYY-MM-DD HH:mm:ss，纯日期后端解析 99999999
        start = (today - timedelta(days=6)).isoformat() + " 00:00:00"
        end = today.isoformat() + " 23:59:59"
        st, raw = self.post("/wf/processInstance/stats/trend",
                            {"start": start, "end": end, "granularity": "day"}, token=self.token)
        body = parse_body(raw)
        ok = isinstance(body, dict) and body.get("code") == 0
        self.record("L2-02", "L2", "stats/trend 7d", "PASS" if ok else "WARN",
                    "code=%s" % (body.get("code") if isinstance(body, dict) else clip(raw, 200)))
        st2, raw2 = self.post("/wf/processInstance/stats/group", {"dimension": "state"}, token=self.token)
        b2 = parse_body(raw2)
        ok2 = isinstance(b2, dict) and b2.get("code") == 0
        self.record("L2-03", "L2", "stats/group", "PASS" if ok2 else "WARN",
                    "code=%s" % (b2.get("code") if isinstance(b2, dict) else clip(raw2, 200)))
        # 速率形态（pro/goframe 差异已知：字符串数字）
        forms = {}
        if isinstance(overview_body, dict) and isinstance(overview_body.get("data"), dict):
            for k in ("rejectRate", "countersignRate"):
                v = overview_body["data"].get(k)
                forms[k] = "%s(%s)" % (v, type(v).__name__)
        self.record("L2-04", "L2", "rejectRate/countersignRate 形态", "PASS",
                    json.dumps(forms, ensure_ascii=False) if forms else "overview.data 缺失未取到")

    def l2_leave_card(self):
        card = getattr(self, "leave_card", None)
        if card:
            self.record("L2-05", "L2", "工作台请假卡片（App 发起路径）", "PASS",
                        "name=%s processDefineId=%s" % (card["name"], card["processDefineId"]))
        else:
            self.record("L2-05", "L2", "工作台请假卡片（App 发起路径）", "WARN",
                        "listByType 无 leave/请假 卡片（App 工作台将无请假入口），L3 跳过")

    def l2_schema(self):
        st, raw = self.get("/dev/schema/getByTableName?tableName=biz_leave", token=self.token)
        body = parse_body(raw)
        ok = isinstance(body, dict) and body.get("code") == 0
        self.record("L2-06", "L2", "GET dev/schema getByTableName", "PASS" if ok else "WARN",
                    "http=%s code=%s" % (st, body.get("code") if isinstance(body, dict) else "?"))

    def l2_user_select(self):
        st, raw = self.post("/sys/user/select", {"pageNum": 1, "pageSize": 200}, token=self.token)
        body = parse_body(raw)
        ok = isinstance(body, dict) and body.get("code") == 0
        rows = body.get("data").get("rows") if ok and isinstance(body.get("data"), dict) else None
        self.user_rows = rows if isinstance(rows, list) else []
        self.record("L2-07", "L2", "user/select", "PASS" if ok else "WARN",
                    "rows=%s" % (len(self.user_rows) if isinstance(self.user_rows, list) else "?"))

    # ── L3 请假发起-审批闭环（App 真实路径：工作台卡片 → defineId → schema 字段 → 发起 → 审批）──
    def l3_step(self, name, ok, detail):
        self.l3["steps"].append({"step": name, "ok": bool(ok), "detail": clip(detail, 800)})
        print("    [L3] %s %s %s" % ("OK" if ok else "XX", name, clip(detail, 140)))
        return ok

    @staticmethod
    def _to_camel(name):
        out = []
        upper_next = False
        for ch in name:
            if ch == "_":
                upper_next = True
                continue
            out.append(ch.upper() if upper_next else ch)
            upper_next = False
        return "".join(out)

    def _schema_columns_for(self, define_id):
        """App start-form 口径：processDefine/detail → jsonObject.__schema__.columns，
        空则 GET dev/schema/getByTableName?tableName=<defineName>。"""
        st, raw = self.post("/wf/processDefine/detail", {"id": define_id}, token=self.token)
        body = parse_body(raw)
        columns, define_name, instance_url = [], "", ""
        if isinstance(body, dict) and isinstance(body.get("data"), dict):
            data = body["data"]
            define_name = data.get("name") or ""
            jo = data.get("jsonObject") if isinstance(data.get("jsonObject"), dict) else {}
            instance_url = (jo or {}).get("instance_url") or (jo or {}).get("instanceUrl") or ""
            sc = (jo or {}).get("__schema__") if isinstance(jo, dict) else None
            if isinstance(sc, dict) and isinstance(sc.get("columns"), list):
                columns = sc["columns"]
        if not columns and define_name:
            st2, raw2 = self.get("/dev/schema/getByTableName?tableName=%s" % define_name,
                                 token=self.token)
            b2 = parse_body(raw2)
            if isinstance(b2, dict) and isinstance(b2.get("data"), dict) \
                    and isinstance(b2["data"].get("columns"), list):
                columns = b2["data"]["columns"]
        return instance_url or "SchemaWfForm", columns, clip(raw, 200)

    def _build_schema_payload(self, columns):
        """镜像 App schemaFromColumns/shouldSkipInitiateColumn/withProcessFormPrefix 的最小实现。
        返回 (payload, 描述)。选择类取字典首项值（ext.code），数值类 1，日期今天，文本 'T027 smoke'。"""
        payload = {}
        desc = []
        for col in columns if isinstance(columns, list) else []:
            if not isinstance(col, dict):
                continue
            fn = col.get("fieldName") or ""
            if not fn:
                continue
            ext = col.get("ext") if isinstance(col.get("ext"), dict) else {}
            if ext.get("addHide") == 1:
                continue
            if str(fn).lower() == "id":
                continue
            primary = col.get("primary")
            if primary is None:
                primary = ext.get("primary") if ext.get("primary") is not None else ext.get("isPk")
            if primary == 1:
                continue
            if "主键" in (col.get("remark") or ""):
                continue
            camel = col.get("fieldCamelName") or ""
            fid = camel if camel else self._to_camel(fn)
            comp = col.get("component") or "Input"
            if comp in ("ApiDict", "Select", "ApiSelect", "ApiTreeSelect", "ApiCascader",
                        "RadioGroup", "ApiRadioGroup", "TreeSelect", "Cascader", "ApiSelectTable",
                        "ApiTransfer", "Transfer"):
                code = ext.get(comp + "_code") or ext.get("code") or ""
                val = None
                if code:
                    st, raw = self.post("/sys/dict/getByDictType", {"dictType": code}, token=self.token)
                    b = parse_body(raw)
                    items = b.get("data") if isinstance(b, dict) else None
                    if isinstance(items, list) and items and isinstance(items[0], dict):
                        val = items[0].get("value")
                if val is None:
                    val = "1"
            elif comp in ("InputNumber", "Rate", "Slider", "Switch"):
                val = 1
            elif comp in ("DatePicker", "TimePicker", "MonthPicker", "WeekPicker", "RangePicker"):
                val = date.today().isoformat()
            elif comp in ("Upload", "ImageUpload", "FileUpload"):
                continue  # 可选附件，冒烟不传
            else:
                val = "T027 smoke"
            key = fid if fid.startswith("f_") or fid.startswith("tf_") else "f_" + fid
            payload[key] = val
            desc.append("%s(%s)=%r" % (key, comp, val))
        return payload, "; ".join(desc)

    def l3_run(self):
        card = getattr(self, "leave_card", None)
        if not card:
            self.l3["status"] = "SKIP"
            self.l3["steps"].append({"step": "gate", "ok": False,
                                     "detail": "listByType 无请假卡片，无流程可发起（App 工作台口径）"})
            return
        self.l3["enabled"] = True
        did = card["processDefineId"]

        instance_url, columns, raw_head = self._schema_columns_for(did)
        self.l3_step("processDefine/detail 表单形态", True,
                     "instanceUrl=%s columns=%d" % (instance_url, len(columns)))
        payload, payload_desc = self._build_schema_payload(columns)
        if not payload:
            self.l3_step("schema 字段解析", False, "无可提交字段 raw=%s" % raw_head)
            self.l3["status"] = "SKIP"
            return
        self.l3_step("schema 字段解析", True, payload_desc)

        todo_before = self._page_count("/wf/processTask/todoList")
        done_before = self._page_count("/wf/processTask/doneList")

        body = {"processDefineId": did}
        body.update(payload)
        st, raw = self.post("/wf/processDefine/startAndExecute", body, token=self.token)
        parsed = parse_body(raw)
        if not (isinstance(parsed, dict) and parsed.get("code") == 0):
            self.l3_step("startAndExecute", False, "http=%s raw=%s" % (st, clip(raw, 800)))
            self.l3["status"] = "SKIP"
            return
        data = parsed.get("data")
        iid = None
        if isinstance(data, dict):
            iid = data.get("processInstanceId") or data.get("id") or data.get("instanceId")
        elif isinstance(data, (int, str)):
            iid = data
        if not self.l3_step("startAndExecute", iid is not None, "instanceId=%s" % iid):
            self.l3["status"] = "SKIP"
            return

        # App 真实路径：审批人处理自己的 todoList（部分栈 activeTaskList.assignee 为空串，不作依据）
        approver_token = self.token
        assignee = "admin"
        tid = None
        todo_rows = self._page_rows("/wf/processTask/todoList")
        ours = [r for r in todo_rows if isinstance(r, dict)
                and str(r.get("processInstanceId")) == str(iid)]
        if ours:
            tid = ours[0].get("id") or ours[0].get("processTaskId")
            self.l3_step("todoList 找到新任务", tid is not None,
                         "processTaskId=%s taskName=%s" % (tid, ours[0].get("taskName")))
        else:
            # admin 待办没有 → 回落 activeTaskList 的 assignee 映射其他审批人
            st, raw = self.post("/wf/processInstance/detail",
                                {"id": str(iid)}, token=self.token)
            body_json = parse_body(raw)
            tasks = []
            if isinstance(body_json, dict) and isinstance(body_json.get("data"), dict):
                tasks = body_json["data"].get("activeTaskList") or []
            task = tasks[0] if tasks else {}
            tid = task.get("processTaskId") or task.get("id")
            assignee = task.get("assignee") or task.get("operator")
            self.l3_step("activeTaskList 定位任务", tid is not None,
                         "processTaskId=%s assignee=%s taskName=%s"
                         % (tid, assignee, task.get("taskName")))
            is_admin = (self.user_id is not None and str(assignee) == self.user_id) \
                or str(assignee) == "admin"
            if tid is not None and not is_admin:
                uname = self._user_name_by_id(assignee)
                if not uname:
                    self.l3_step("assignee 映射", False,
                                 "user/select 找不到 assignee=%s（演示种子该视图为空）" % assignee)
                    self.l3["status"] = "SKIP"
                    return
                st2, raw2 = self.post("/sys/login", {"userName": uname, "password": "123456"})
                b2 = parse_body(raw2)
                t2 = (b2.get("data") or {}).get("token") \
                    if isinstance(b2, dict) and isinstance(b2.get("data"), dict) else None
                if not t2:
                    self.l3_step("assignee 登录", False,
                                 "userName=%s raw=%s" % (uname, clip(raw2, 300)))
                    self.l3["status"] = "SKIP"
                    return
                approver_token = t2
                assignee = uname
                self.l3_step("assignee 登录", True, "userName=%s" % uname)
        if tid is None:
            self.l3["status"] = "SKIP"
            return

        todo_mid = self._page_count("/wf/processTask/todoList", token=approver_token)
        self.l3_step("todoList +1", todo_mid == todo_before + 1,
                     "before=%s after=%s" % (todo_before, todo_mid))

        st, raw = self.post("/wf/processTask/execute",
                            {"processTaskId": str(tid), "submitType": 1,
                             "tf_approvalComment": "smoke-agree"}, token=approver_token)
        body_json = parse_body(raw)
        ok = isinstance(body_json, dict) and body_json.get("code") == 0
        self.l3_step("execute AGREE", ok, "http=%s code=%s raw=%s"
                     % (st, body_json.get("code") if isinstance(body_json, dict) else "?", clip(raw, 400)))

        todo_after = self._page_count("/wf/processTask/todoList", token=approver_token)
        done_after = self._page_count("/wf/processTask/doneList", token=approver_token)
        closed = todo_after == todo_before and (done_after >= done_before + 1)
        self.l3_step("闭环 todo 回落+done +1", closed,
                     "todo=%s->%s done=%s->%s" % (todo_before, todo_after, done_before, done_after))
        self.l3["status"] = "DONE" if closed else "PARTIAL"

    def _page_count(self, path, token=None):
        st, raw = self.post(path, {"pageNum": 1, "pageSize": 1}, token=token or self.token)
        body = parse_body(raw)
        if isinstance(body, dict) and isinstance(body.get("data"), dict):
            rc = body["data"].get("recordCount")
            if isinstance(rc, (int, float)):
                return int(rc)
        return None

    def _page_rows(self, path, token=None, size=50):
        st, raw = self.post(path, {"pageNum": 1, "pageSize": size}, token=token or self.token)
        body = parse_body(raw)
        if isinstance(body, dict) and isinstance(body.get("data"), dict) \
                and isinstance(body["data"].get("rows"), list):
            return body["data"]["rows"]
        return []

    def _user_name_by_id(self, uid):
        if not isinstance(getattr(self, "user_rows", None), list):
            return None
        for row in self.user_rows:
            if not isinstance(row, dict):
                continue
            if str(row.get("id")) == str(uid):
                return row.get("userName") or row.get("name")
        return None

    # ── 主流程 ───────────────────────────────────────────────────────────
    def run(self):
        print("== stack_smoke %s @ %s ==" % (self.stack, self.base))
        self.l1_negative_auth()
        self.l1_login()
        if not self.token:
            # 登录失败后续全废，直接终止（L1-01 已 FAIL）
            return self.summary()
        overview = None
        self.l1_captcha()
        self.l1_user_info()
        self.l1_list_by_type()
        self.l1_pagination("L1-06a", "/wf/processTask/todoList", ["processTaskId", "id"])
        self.l1_pagination("L1-06b", "/wf/processTask/doneList", ["processTaskId", "id"])
        self.l1_pagination("L1-06c", "/wf/processInstance/page", ["processInstanceId", "id"])
        self.l1_pagination("L1-06d", "/wf/processInstance/ccList", ["processInstanceId", "id"])
        self.l1_message()
        overview = self.l1_stats_overview()
        # L2
        self.l2_dict()
        self.l2_stats_extra(overview)
        self.l2_leave_card()
        self.l2_schema()
        self.l2_user_select()
        # L3
        self.l3_run()
        return self.summary()

    def summary(self):
        l1 = [c for c in self.checks if c["layer"] == "L1"]
        l1_fail = [c for c in l1 if c["status"] == "FAIL"]
        result = {
            "stack": self.stack,
            "base": self.base,
            "l1_all_pass": len(l1_fail) == 0 and len(l1) > 0,
            "l1_fail_ids": [c["id"] for c in l1_fail],
            "checks": self.checks,
            "l3": self.l3,
        }
        print("== 结果: %s（L1 %d 项，FAIL %d）L3=%s ==" %
              ("GREEN" if result["l1_all_pass"] else "RED", len(l1), len(l1_fail), self.l3["status"]))
        return result


def write_md(result, path):
    lines = []
    lines.append("# stack smoke · %s（%s）" % (result["stack"], result["base"]))
    lines.append("")
    lines.append("- 结论：**%s**（L1 FAIL: %s）；L3 闭环：%s"
                 % ("GREEN" if result["l1_all_pass"] else "RED",
                    result["l1_fail_ids"] or "无", result["l3"]["status"]))
    lines.append("")
    lines.append("| 层 | 项 | 结果 | 说明 |")
    lines.append("|---|---|---|---|")
    for c in result["checks"]:
        lines.append("| %s | %s %s | %s | %s |" % (c["layer"], c["id"], c["name"], c["status"],
                                                   c["detail"].replace("|", "\\|")))
    if result["l3"]["steps"]:
        lines.append("")
        lines.append("## L3 步骤")
        for s in result["l3"]["steps"]:
            lines.append("- [%s] %s：%s" % ("OK" if s["ok"] else "XX", s["step"], s["detail"]))
    lines.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--stack", required=True)
    ap.add_argument("--json-out", default=None)
    ap.add_argument("--md-out", default=None)
    args = ap.parse_args()

    smoke = Smoke(args.base, args.stack)
    result = smoke.run()
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    if args.md_out:
        write_md(result, args.md_out)
    sys.exit(0 if result["l1_all_pass"] else 1)


if __name__ == "__main__":
    main()
