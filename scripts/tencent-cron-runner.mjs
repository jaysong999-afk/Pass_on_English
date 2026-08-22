const baseUrl = (process.env.INTERNAL_APP_URL ?? "http://app:3000").replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET?.trim();
const routes = [
  "/api/cron/process-scheduled-broadcasts",
  "/api/cron/expire-enrollment-holds",
];

if (!cronSecret) {
  throw new Error("CRON_SECRET is required");
}

let running = false;
let stopped = false;

async function runRoute(route) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cronSecret}`,
      "content-type": "application/json",
      "user-agent": "pass-on-english-lighthouse-cron/1.0",
    },
    signal: AbortSignal.timeout(55_000),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${route} returned ${response.status}: ${body.slice(0, 500)}`);
  }

  console.log(`[cron] ${new Date().toISOString()} ${route} ${body}`);
}

async function runAll() {
  if (running || stopped) return;
  running = true;

  try {
    for (const route of routes) {
      try {
        await runRoute(route);
      } catch (error) {
        console.error(`[cron] ${new Date().toISOString()} ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    running = false;
  }
}

function scheduleNextMinute() {
  if (stopped) return;
  const delay = 60_000 - (Date.now() % 60_000) + 250;
  setTimeout(async () => {
    await runAll();
    scheduleNextMinute();
  }, delay);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopped = true;
    console.log(`[cron] received ${signal}; stopping`);
  });
}

console.log(`[cron] scheduler started for ${baseUrl}`);
scheduleNextMinute();
