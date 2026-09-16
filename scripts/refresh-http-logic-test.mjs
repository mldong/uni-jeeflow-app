// refresh-http-logic-test.mjs
// uni-jeeflow-app util/http.uts UC-0113 静默续命状态机 · JS 1:1 转录模拟单测
// （web 目标存在存量挂载缺陷无法跑真浏览器 E2E，此处对拦截器算法做逐分支验证）
// 转录源：util/http.uts @ 2026-09-16 改造版

const SUCCESS_CODE = 0;
const TOKEN_INVALID_CODE = 99990403;
const REFRESH_TOKEN_PATH = "/sys/refreshToken";

// ---------- mock uni ----------
function makeUni() {
    const storage = new Map();
    const calls = [];        // 网络调用日志 {path, token}
    const routes = new Map(); // path -> (token) => body | Promise<body>
    let reLaunched = 0;
    const uni = {
        _storage: storage, _calls: calls, _routes: routes,
        getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ""),
        setStorageSync: (k, v) => storage.set(k, v),
        removeStorageSync: (k) => storage.delete(k),
        reLaunch: () => { reLaunched++ },
        request: (opts) => {
            const path = opts.url.replace("https://mock", "");
            const auth = opts.header["Authorization"] || "";
            const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
            calls.push({ path, token });
            const h = routes.get(path);
            Promise.resolve().then(async () => {
                const body = h ? await h(token, opts.data) : { code: 0, data: "ok" };
                opts.success({ data: body });
            });
        },
    };
    return { uni, storage, calls, routes, kicked: () => reLaunched };
}

// ---------- 1:1 转录 http.uts ----------
function makeHttp(uni) {
    function redirectToLogin() {
        uni.removeStorageSync("user:token");
        uni.removeStorageSync("user:refresh_token");
        uni.removeStorageSync("user:is_login");
        uni.reLaunch({ url: "/pages/login/login" });
    }
    function readAccessToken() {
        const tokenRaw = uni.getStorageSync("user:token");
        return typeof tokenRaw === "string" ? tokenRaw : "";
    }
    let refreshInflight = null;
    function doRefreshToken() {
        return new Promise((resolve) => {
            const refreshRaw = uni.getStorageSync("user:refresh_token");
            const refreshToken = typeof refreshRaw === "string" ? refreshRaw : "";
            if (refreshToken.length === 0) { resolve(false); return; }
            uni.request({
                url: "https://mock" + REFRESH_TOKEN_PATH,
                method: "POST",
                data: { refreshToken },
                header: { "Content-Type": "application/json" },
                success: (res) => {
                    const body = res.data;
                    if (body == null) { resolve(false); return; }
                    const code = body.code;
                    if (code == null || code !== SUCCESS_CODE) { resolve(false); return; }
                    const data = body.data;
                    if (data == null) { resolve(false); return; }
                    const newToken = data.token, newRefresh = data.refreshToken;
                    if (!newToken || !newRefresh) { resolve(false); return; }
                    uni.setStorageSync("user:token", newToken);
                    uni.setStorageSync("user:refresh_token", newRefresh);
                    resolve(true);
                },
                fail: () => resolve(false),
            });
        });
    }
    function refreshOnce() {
        const inflight = refreshInflight;
        if (inflight != null) return inflight;
        const p = doRefreshToken();
        refreshInflight = p;
        p.finally(() => { refreshInflight = null; });
        return p;
    }
    class Http {
        post(path, config) { return this._request(path, "POST", config); }
        _send(path, method, config, token) {
            return new Promise((resolve, reject) => {
                const header = {};
                if (token.length > 0) header["Authorization"] = "Bearer " + token;
                uni.request({
                    url: "https://mock" + path,
                    method, data: config ? config.data : null, header,
                    success: (res) => {
                        const body = res.data;
                        if (body == null) { reject("[" + path + "] 响应为空"); return; }
                        resolve(body);
                    },
                    fail: (err) => reject(err.errMsg),
                });
            });
        }
        _request(path, method, config) {
            return new Promise((resolve, reject) => {
                const usedToken = readAccessToken();
                this._send(path, method, config, usedToken).then((body) => {
                    this._dispatch(path, method, config, usedToken, body, false, resolve, reject);
                }).catch((e) => reject(e));
            });
        }
        _replay(path, method, config, token, resolve, reject) {
            this._send(path, method, config, token).then((body) => {
                this._dispatch(path, method, config, token, body, true, resolve, reject);
            }).catch((e) => reject(e));
        }
        _dispatch(path, method, config, usedToken, body, retried, resolve, reject) {
            const code = body.code != null ? body.code : -1;
            if (code === SUCCESS_CODE) {
                resolve(body.data != null ? body.data : true);
            } else if (code === TOKEN_INVALID_CODE) {
                if (retried || path === REFRESH_TOKEN_PATH) {
                    redirectToLogin();
                    reject("登录已失效，请重新登录");
                    return;
                }
                const storedToken = readAccessToken();
                if (storedToken.length > 0 && storedToken !== usedToken) {
                    this._replay(path, method, config, storedToken, resolve, reject);
                    return;
                }
                refreshOnce().then((ok) => {
                    if (!ok) {
                        redirectToLogin();
                        reject("登录已失效，请重新登录");
                        return;
                    }
                    const fresh = readAccessToken();
                    if (fresh.length > 0 && fresh !== usedToken) {
                        this._replay(path, method, config, fresh, resolve, reject);
                    } else {
                        redirectToLogin();
                        reject("登录已失效，请重新登录");
                    }
                });
            } else {
                reject(body.msg || "业务错误");
            }
        }
    }
    return new Http();
}

// ---------- 场景 ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond, detail = "") {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${detail ? " | " + detail : ""}`); }
}
const INV = { code: 99990403, msg: "token invalid" };
const KICK = (c) => ({ code: c, msg: "refresh invalid" });

// S1 正向：access 失效 → 换新 → 重放成功
{
    const { uni, storage, calls, routes } = makeUni();
    const http = makeHttp(uni);
    uni.setStorageSync("user:token", "T1");
    uni.setStorageSync("user:refresh_token", "RF1");
    routes.set("/a", (t) => (t === "T2" ? { code: 0, data: "ok" } : INV));
    routes.set(REFRESH_TOKEN_PATH, (t, d) => (d && d.refreshToken === "RF1" ? { code: 0, data: { token: "T2", refreshToken: "RF2" } } : KICK(99990410)));
    const r = await http.post("/a");
    check("S1 换新后重放成功", r === "ok");
    check("S1 storage 存新对", storage.get("user:token") === "T2" && storage.get("user:refresh_token") === "RF2");
    check("S1 refresh 只发一次", calls.filter(c => c.path === REFRESH_TOKEN_PATH).length === 1);
    check("S1 /a 重放一次（共两次：T1→T2）", calls.filter(c => c.path === "/a").map(c => c.token).join(",") === "T1,T2");
}

// S2 并发单飞：两请求同时失效只发一次 refresh
{
    const { uni, calls, routes } = makeUni();
    const http = makeHttp(uni);
    uni.setStorageSync("user:token", "T1");
    uni.setStorageSync("user:refresh_token", "RF1");
    const slow = async (t) => { await sleep(30); return t === "T2" ? { code: 0, data: "ok" } : INV; };
    routes.set("/a", slow); routes.set("/b", slow);
    routes.set(REFRESH_TOKEN_PATH, async (t, d) => { await sleep(30); return d && d.refreshToken === "RF1" ? { code: 0, data: { token: "T2", refreshToken: "RF2" } } : KICK(99990410); });
    const rs = await Promise.allSettled([http.post("/a"), http.post("/b")]);
    check("S2 并发请求都续命成功", rs.every(r => r.status === "fulfilled" && r.value === "ok"));
    check("S2 refresh 只发一次", calls.filter(c => c.path === REFRESH_TOKEN_PATH).length === 1);
}

// S3 已轮转兜底：响应回来时本地 token 已被同批换新 → 直接重放不再轮转
{
    const { uni, storage, calls, routes } = makeUni();
    const http = makeHttp(uni);
    uni.setStorageSync("user:token", "T1");
    uni.setStorageSync("user:refresh_token", "RF1");
    routes.set("/a", async (t) => {
        // 模拟：响应途中，另一并发请求的 refresh 已完成，本地已是新对
        await sleep(20);
        uni.setStorageSync("user:token", "T2");
        uni.setStorageSync("user:refresh_token", "RF2");
        return t === "T2" ? { code: 0, data: "ok" } : INV;
    });
    const r = await http.post("/a");
    check("S3 直接用新 token 重放成功", r === "ok");
    check("S3 未触发第二次轮转", calls.filter(c => c.path === REFRESH_TOKEN_PATH).length === 0);
    check("S3 /a 以 T2 重放", calls.filter(c => c.path === "/a").map(c => c.token).join(",") === "T1,T2");
}

// S4 无 refresh 凭据 → 直接回登录
{
    const { uni, storage, calls, routes, kicked } = makeUni();
    const http = makeHttp(uni);
    uni.setStorageSync("user:token", "T1");
    routes.set("/a", () => INV);
    let err = null;
    await http.post("/a").catch(e => { err = e; });
    check("S4 拒绝且提示重登", err === "登录已失效，请重新登录");
    check("S4 回登录页", kicked() === 1);
    check("S4 凭证清空", !storage.has("user:token") && !storage.has("user:refresh_token"));
    check("S4 未发 refresh", calls.filter(c => c.path === REFRESH_TOKEN_PATH).length === 0);
}

// S5 refresh 失效 99990410 → 回登录
{
    const { uni, storage, calls, routes, kicked } = makeUni();
    const http = makeHttp(uni);
    uni.setStorageSync("user:token", "T1");
    uni.setStorageSync("user:refresh_token", "RF1");
    routes.set("/a", () => INV);
    routes.set(REFRESH_TOKEN_PATH, () => KICK(99990410));
    let err = null;
    await http.post("/a").catch(e => { err = e; });
    check("S5 拒绝且提示重登", err === "登录已失效，请重新登录");
    check("S5 回登录页", kicked() === 1);
    check("S5 凭证清空", !storage.has("user:token") && !storage.has("user:refresh_token"));
    check("S5 /a 未重放", calls.filter(c => c.path === "/a").length === 1);
}

// S6 回环守卫：refresh 端点自身被拦不进续命（防死循环）
{
    const { uni, calls, routes, kicked } = makeUni();
    const http = makeHttp(uni);
    uni.setStorageSync("user:token", "T1");
    uni.setStorageSync("user:refresh_token", "RF1");
    routes.set(REFRESH_TOKEN_PATH, () => INV);
    let err = null;
    await http.post(REFRESH_TOKEN_PATH).catch(e => { err = e; });
    check("S6 拒绝", err === "登录已失效，请重新登录");
    check("S6 无二次 refresh 网络调用", calls.filter(c => c.path === REFRESH_TOKEN_PATH).length === 1);
    check("S6 回登录页", kicked() === 1);
}

// S7 重放仍失效 → 重放只此一次
{
    const { uni, calls, routes, kicked, storage } = makeUni();
    const http = makeHttp(uni);
    uni.setStorageSync("user:token", "T1");
    uni.setStorageSync("user:refresh_token", "RF1");
    routes.set("/a", () => INV); // 新 token 也失效
    routes.set(REFRESH_TOKEN_PATH, (t, d) => (d && d.refreshToken === "RF1" ? { code: 0, data: { token: "T2", refreshToken: "RF2" } } : KICK(99990410)));
    let err = null;
    await http.post("/a").catch(e => { err = e; });
    check("S7 拒绝", err === "登录已失效，请重新登录");
    check("S7 /a 只重放一次", calls.filter(c => c.path === "/a").length === 2);
    check("S7 refresh 只发一次（无乒乓）", calls.filter(c => c.path === REFRESH_TOKEN_PATH).length === 1);
    check("S7 最终回登录页", kicked() === 1 && !storage.has("user:token"));
}

// S8 回归：正常带 token 请求不受影响
{
    const { uni, calls, routes, kicked } = makeUni();
    const http = makeHttp(uni);
    uni.setStorageSync("user:token", "T1");
    uni.setStorageSync("user:refresh_token", "RF1");
    routes.set("/a", () => ({ code: 0, data: { n: 42 } }));
    const r = await http.post("/a");
    check("S8 正常请求成功", r && r.n === 42);
    check("S8 零 refresh 零跳转", calls.filter(c => c.path === REFRESH_TOKEN_PATH).length === 0 && kicked() === 0);
}

console.log(`\n=== http-logic: ${pass}/${pass + fail} PASS ===`);
process.exit(fail ? 1 : 0);
