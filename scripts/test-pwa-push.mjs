import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
function load(file, imports = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: (name) => {
      if (!(name in imports)) throw new Error("Unexpected dependency: " + name);
      return imports[name];
    },
    console: { warn() {}, error() {} }, setTimeout, clearTimeout, setInterval, clearInterval,
    Event, Uint8Array, atob, AbortSignal, URL, ...globals,
  }, { filename: file });
  return exports;
}

function browserClient({ permission = "default", saveOK = true, supported = true } = {}) {
  const calls = { permission: 0, register: 0, subscribe: 0, saves: 0 };
  const notification = {
    permission,
    requestPermission: () => { calls.permission++; notification.permission = "granted"; return Promise.resolve("granted"); },
  };
  const subscription = { options: {}, toJSON: () => ({ endpoint: "https://push.example/device", keys: { p256dh: "key", auth: "auth" } }) };
  const registration = { pushManager: {
    getSubscription: async () => subscription,
    subscribe: async () => { calls.subscribe++; return subscription; },
  } };
  const win = Object.assign(new EventTarget(), { isSecureContext: true, Notification: notification });
  if (supported) win.PushManager = {};
  const api = load("src/lib/push/index.ts", {}, {
    window: win, Notification: notification,
    navigator: { serviceWorker: { register: async () => { calls.register++; return registration; }, ready: Promise.resolve(registration) } },
    process: { env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "AQID" } },
    fetch: async () => { calls.saves++; return { ok: saveOK }; },
  });
  return { api, calls, registration, subscription, notification };
}

// First-user gesture requests permission before registration/network work.
{
  const { api, calls, registration } = browserClient();
  registration.pushManager.getSubscription = async () => null;
  const operation = api.subscribeToPush("student", "student-1");
  assert.equal(calls.permission, 1);
  assert.equal(calls.register, 0);
  await operation;
  assert.equal(calls.subscribe, 1);
  assert.equal(calls.saves, 1);
}
{
  const { api, calls } = browserClient({ permission: "granted" });
  await Promise.all([api.subscribeToPush("student", "one"), api.subscribeToPush("student", "one")]);
  await api.subscribeToPush("student", "one");
  assert.equal(calls.permission, 0);
  assert.equal(calls.register, 1);
  assert.equal(calls.saves, 1);
  await api.subscribeToPush("student", "two");
  assert.equal(calls.saves, 2, "different accounts must reconcile separately");
}
for (const [options, reason] of [[{ permission: "denied" }, "denied"], [{ supported: false }, "unsupported"]]) {
  const { api, calls } = browserClient(options);
  await assert.rejects(api.subscribeToPush("student", "one"), (error) => error.reason === reason);
  assert.equal(calls.register + calls.saves, 0);
}
{
  const { api, calls } = browserClient({ permission: "granted", saveOK: false });
  await assert.rejects(api.subscribeToPush("teacher", "one"));
  await assert.rejects(api.subscribeToPush("teacher", "one"));
  assert.equal(calls.saves, 2, "failed saves must not be cached");
}
{
  const { api, subscription, calls } = browserClient({ permission: "granted" });
  let removed = 0;
  subscription.options.applicationServerKey = new Uint8Array([9]).buffer;
  subscription.unsubscribe = async () => { removed++; };
  await api.subscribeToPush("student", "one");
  assert.equal(removed, 1);
  assert.equal(calls.subscribe, 1, "a rotated VAPID key requires a new browser subscription");
}
console.log("PASS permission gesture, unsupported/denied feedback, deduplication, retry and key rotation");

// Server push expiry handling: remove only 404/410, retain transient failures.
{
  const deleted = [];
  const rows = [200, 404, 410, 503].map((status) => ({ user_id: "u", endpoint: String(status), p256dh: "p", auth: "a" }));
  const db = { from: (table) => {
    assert.equal(table, "push_subscriptions");
    return {
      select: (columns) => {
        assert.equal(columns, "user_id, endpoint, p256dh, auth");
        return { in: async () => ({ data: rows }) };
      },
      delete: () => ({ eq: async (_, endpoint) => { deleted.push(endpoint); return {}; } }),
    };
  } };
  const api = load("src/lib/push/send-service.ts", {
    "@/lib/push/vapid": {
      ensureWebPushConfigured: () => true,
      webpush: { sendNotification: async ({ endpoint }) => {
        if (endpoint !== "200") throw { statusCode: Number(endpoint) };
      } },
    },
  });
  const result = await api.sendPushToUsersInDb(db, ["u", "u"], { title: "Title", body: "Body" });
  assert.equal(result.sent, 1);
  assert.equal(result.expired, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(deleted.sort(), ["404", "410"]);
}
console.log("PASS expired endpoints pruned; transient failures retained; minimal token query");

{
  const sent = [];
  const db = { rpc: async (name, args) => {
    assert.equal(name, "get_chat_push_recipients");
    assert.equal(args.p_message_id, "persisted-message");
    return { data: [
      { user_id: "s", portal_role: "student", locale: "zh-CN", room_id: "r", viewing: false },
      { user_id: "t", portal_role: "teacher", locale: "en", room_id: "r", viewing: true },
    ] };
  } };
  const api = load("src/lib/chat/notifications.ts", {
    "server-only": {},
    "@/lib/supabase/db-client": { createServiceDbClient: () => db },
    "@/lib/notifications/repository": { sendNotificationWithOptionalPushInDb: async (input, passedDb) => {
      assert.equal(passedDb, db); sent.push(input);
    } },
  });
  await api.notifyChatMessageInDb({ id: "persisted-message", senderName: "Sender", body: "Hello" });
  assert.equal(sent[0].push, true);
  assert.equal(sent[0].url, "/zh-CN/student/chat/r");
  assert.equal(sent[1].push, false, "an active recipient still gets in-app history without OS push");
  assert.equal(sent[1].url, "/teacher/chat/r");
  assert.equal(sent[0].payload.portalRole, "student");
}
{
  const api = load("src/lib/notifications/resolve-user-id.ts", {
    "@/lib/auth/session": { getAuthContext: async () => ({ userId: "teacher", profile: { role: "teacher" } }) },
  });
  assert.equal(await api.resolveNotificationUserId("student"), null);
  assert.equal(await api.resolveNotificationUserId("teacher"), "teacher");
}
console.log("PASS recipient-scoped push, active-room suppression, localized links and role enforcement");

// Shared inbox subscriptions and timers are stopped while the tab is hidden.
{
  const cleanup = [];
  const timeouts = new Map(), intervals = new Map();
  let nextId = 0, opened = 0, removed = 0, refreshed = 0;
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  let current;
  const db = {
    channel: () => {
      opened++;
      const channel = { on: () => channel, subscribe: (fn) => { channel.status = fn; return channel; } };
      current = channel;
      return channel;
    },
    removeChannel: async () => { removed++; },
  };
  const api = load("src/hooks/useChatInboxSync.ts", {
    react: { useRef: (value) => ({ current: value }), useEffect: (fn) => cleanup.push(fn()) },
    "@/lib/supabase/client": { createClient: () => db },
    "@/lib/chat-inbox-events": { CHAT_INBOX_CHANGED: "inbox" },
  }, {
    window: win, document: doc,
    setTimeout: (fn) => { const id = ++nextId; timeouts.set(id, fn); return id; },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (fn) => { const id = ++nextId; intervals.set(id, fn); return id; },
    clearInterval: (id) => intervals.delete(id),
  });
  const flush = () => { const callbacks = [...timeouts.values()]; timeouts.clear(); callbacks.forEach((fn) => fn()); };
  api.useChatInboxSync(() => refreshed++);
  api.useChatInboxSync(() => refreshed++);
  assert.equal(opened, 1);
  flush();
  assert.equal(refreshed, 2);
  current.status("SUBSCRIBED"); flush();
  const baseline = refreshed;
  [...intervals.values()].forEach((fn) => fn()); flush();
  assert.equal(refreshed, baseline, "healthy Realtime must not poll");
  doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(removed, 1);
  assert.equal(intervals.size, 0);
  win.dispatchEvent(new Event("inbox")); flush();
  assert.equal(refreshed, baseline);
  doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(opened, 2);
  flush();
  current.status("CHANNEL_ERROR");
  [...intervals.values()].forEach((fn) => fn()); flush();
  assert.ok(refreshed > baseline);
  cleanup[0](); assert.equal(removed, 1);
  cleanup[1](); assert.equal(removed, 2);
  assert.equal(intervals.size + timeouts.size, 0);
}
console.log("PASS shared Realtime, visible-only fallback polling and final-subscriber cleanup");

// DB privilege boundary checks complement the pre-deployment SQL integration test.
{
  const sql = read("supabase/migrations/043_chat_push_presence.sql");
  assert.match(sql, /viewer_id uuid := auth.uid\(\)/);
  assert.match(sql, /IF NOT public.can_access_chat_room\(p_room_id\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public.get_chat_push_recipients\(uuid\) TO service_role/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public.get_chat_push_recipients\(uuid\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /profile.id <> message.sender_id/);
  assert.match(sql, /presence.expires_at > now\(\)/);
  assert.doesNotMatch(sql, /ALTER PUBLICATION/);
  assert.doesNotMatch(read("src/lib/notifications/resolve-user-id.ts"), /Bootstrapped|ensureAccountSession/);
}
console.log("PASS presence lease SQL ownership, expiry and restricted function grants");

// Service-worker clicks navigate before a tracking request, and stay on this origin.
{
  const handlers = {}, calls = [];
  const self = {
    location: { origin: "https://passonenglish.com" },
    addEventListener: (name, fn) => { handlers[name] = fn; },
    clients: { matchAll: async () => [], openWindow: async (url) => { calls.push(["open", url]); } },
  };
  vm.runInNewContext(read("public/sw.js"), { self, URL, fetch: async () => { calls.push(["track"]); } });
  let finished;
  handlers.notificationclick({
    notification: { close() {}, data: { url: "/ko/student/chat/r", notificationId: "n" } },
    waitUntil: (promise) => { finished = promise; },
  });
  await finished;
  assert.equal(calls[0][0], "open");
  assert.equal(calls[0][1], "https://passonenglish.com/ko/student/chat/r");
  assert.equal(calls[1][0], "track");
}
console.log("PASS notification click opens the intended chat before analytics");

// Exercise install event/state transitions without browser permissions or production accounts.
{
  const cells = [];
  let cursor = 0, mounted = false, setup, cleanup, registrations = 0, prompts = 0;
  const storage = new Map();
  const display = Object.assign(new EventTarget(), { matches: false });
  const win = Object.assign(new EventTarget(), { matchMedia: () => display });
  const notification = { permission: "default" };
  const api = load("src/components/shared/PwaProvider.tsx", {
    react: {
      createContext: () => ({ Provider: "provider" }), useContext: () => null,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in cells)) cells[index] = initial;
        return [cells[index], (value) => { cells[index] = typeof value === "function" ? value(cells[index]) : value; }];
      },
      useEffect: (fn) => { if (!mounted) setup = fn; },
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    "@/lib/push": { registerServiceWorker: async () => { registrations++; } },
  }, {
    window: win, Notification: notification, navigator: { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 1 },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  });
  const render = () => { cursor = 0; return api.PwaProvider({ children: null }).props.value; };
  assert.equal(render().ready, false);
  mounted = true; cleanup = setup();
  let view = render();
  assert.equal(view.ready, true);
  assert.equal(view.ios, true);
  assert.equal(view.canPrompt, false);
  assert.equal(registrations, 1);
  const event = new Event("beforeinstallprompt", { cancelable: true });
  event.prompt = async () => { prompts++; };
  event.userChoice = Promise.resolve({ outcome: "dismissed" });
  win.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  await render().install();
  view = render();
  assert.equal(prompts, 1);
  assert.equal(view.canPrompt, false);
  assert.equal(view.dismissed, true);
  assert.ok(Number(storage.get("passon-pwa-dismissed-until")) > Date.now() + 6 * 86400000);
  notification.permission = "denied"; win.dispatchEvent(new Event("focus"));
  assert.equal(render().denied, true);
  win.dispatchEvent(new Event("appinstalled"));
  assert.equal(render().installed, true);
  cleanup();
}
console.log("PASS deferred install prompt, single consumption, iOS detection, seven-day dismissal and installed/denied state");

{
  const calls = [], intervals = new Map();
  let cleanup, focused = true, next = 0;
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible", hasFocus: () => focused });
  const api = load("src/hooks/useChatPresence.ts", {
    react: { useEffect: (fn) => { cleanup = fn(); } },
  }, {
    window: win, document: doc, crypto: { randomUUID: () => "tab-" + (++next) },
    fetch: async (_, options) => { calls.push(JSON.parse(options.body)); return { status: 204 }; },
    setInterval: (fn) => { intervals.set(next, fn); return next; },
    clearInterval: (id) => intervals.delete(id),
  });
  const drain = () => new Promise((resolve) => setImmediate(resolve));
  api.useChatPresence("room", true);
  await drain();
  assert.equal(calls[0].active, true);
  focused = false; win.dispatchEvent(new Event("blur"));
  await drain();
  assert.equal(calls[1].active, false);
  assert.equal(intervals.size, 0);
  focused = true; win.dispatchEvent(new Event("focus"));
  await drain();
  assert.equal(calls[2].active, true);
  assert.notEqual(calls[0].clientId, calls[2].clientId);
  cleanup(); await drain();
  assert.equal(calls[3].active, false);
  assert.equal(intervals.size, 0);
}
console.log("PASS presence enters only a focused connected room and leaves on blur/unmount");

for (const size of [192, 512]) {
  const png = readFileSync(new URL("../public/icons/pwa-" + size + ".png", import.meta.url));
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}
console.log("PASS installation icon dimensions match the manifest");
