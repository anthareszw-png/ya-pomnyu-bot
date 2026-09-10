import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";

function usage() {
  console.error("Использование: npm run setup -- https://ИМЯ.workers.dev");
  process.exit(1);
}

async function promptSecret(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const value = await rl.question(`${label}: `);
    rl.close();
    return value.trim();
  }

  stdout.write(`${label}: `);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    function finish() {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      resolve(value.trim());
    }

    function onData(chunk) {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          finish();
          return;
        }
        if (char === "\u0003") {
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          reject(new Error("Отменено"));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    }

    stdin.on("data", onData);
  });
}

const workerUrl = process.argv[2];
if (!workerUrl) usage();

let origin;
try {
  origin = new URL(workerUrl).origin;
} catch {
  usage();
}

const setupSecret = process.env.SETUP_SECRET || await promptSecret("Вставь SETUP_SECRET (он не отобразится)");
if (!setupSecret) throw new Error("SETUP_SECRET пустой");

const response = await fetch(`${origin}/admin/setup`, {
  method: "POST",
  headers: { authorization: `Bearer ${setupSecret}` },
  signal: AbortSignal.timeout(20_000)
});
const body = await response.json();

if (!response.ok || !body.ok) {
  throw new Error(`Настройка не удалась: ${body.error || response.status}`);
}

console.log("Webhook подключён ✅");
console.log(`Теперь отправь боту: /start ТВОЙ_CLAIM_CODE`);
