import { DurableObject } from "cloudflare:workers";
import { formatTokyo, parseReminder, tokyoDayBounds } from "./parser.js";

const HELP = [
  "Я запоминаю, чтобы тебе не пришлось.",
  "",
  "Примеры:",
  "• через 40 минут поесть",
  "• утром выпить чай",
  "• завтра вечером написать фотографу",
  "• сегодня в 18:00 купить еду",
  "• завтра позвонить маме — напомню в 9:00",
  "",
  "/today — напоминания на сегодня",
  "/list — ближайшие напоминания",
  "/cancel 12 — отменить напоминание №12",
  "/help — показать подсказку",
  "",
  "Время: Япония (Tokyo)."
].join("\n");

const COMMANDS = [
  { command: "today", description: "Напоминания на сегодня" },
  { command: "list", description: "Ближайшие напоминания" },
  { command: "cancel", description: "Отменить напоминание по номеру" },
  { command: "help", description: "Примеры и подсказка" }
];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function setupPage() {
  const html = `<!doctype html>
<html lang="ru">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Подключить «Я помню»</title>
<style>
  :root { color-scheme: dark; font-family: system-ui, -apple-system, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0d10; color: #f5f7fa; }
  main { width: min(420px, calc(100% - 32px)); }
  h1 { margin-bottom: 8px; }
  p { color: #aeb6c2; line-height: 1.5; }
  input, button { box-sizing: border-box; width: 100%; min-height: 50px; margin-top: 12px; border-radius: 14px; font: inherit; }
  input { border: 1px solid #343a46; background: #151921; color: white; padding: 0 14px; }
  button { border: 0; background: #36a852; color: white; font-weight: 700; cursor: pointer; }
  button:disabled { opacity: .6; }
  #result { min-height: 24px; color: #dce4ef; }
</style>
<main>
  <h1>Я помню 🤖</h1>
  <p>Вставь секрет настройки. Он отправится только этому Worker и не сохранится в браузере.</p>
  <form id="form">
    <input id="secret" type="password" autocomplete="off" placeholder="SETUP_SECRET" required>
    <button id="button">Подключить Telegram</button>
  </form>
  <p id="result"></p>
</main>
<script>
  const form = document.querySelector('#form');
  const input = document.querySelector('#secret');
  const button = document.querySelector('#button');
  const result = document.querySelector('#result');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    result.textContent = 'Подключаю…';
    try {
      const response = await fetch('/admin/setup', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + input.value }
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || 'Ошибка');
      input.value = '';
      result.textContent = 'Готово ✅ Теперь напиши боту /start и свой CLAIM_CODE.';
    } catch (error) {
      result.textContent = 'Не получилось: ' + error.message;
    } finally {
      button.disabled = false;
    }
  });
</script>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}

async function telegram(env, method, payload = {}) {
  if (!env.BOT_TOKEN) throw new Error("BOT_TOKEN is missing");

  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method}: ${data.description || response.status}`);
  }
  return data.result;
}

function sendText(env, chatId, text, extra = {}) {
  return telegram(env, "sendMessage", {
    chat_id: String(chatId),
    text,
    disable_web_page_preview: true,
    ...extra
  });
}

async function safeTelegram(env, method, payload) {
  try {
    return await telegram(env, method, payload);
  } catch (error) {
    console.warn(`Non-critical Telegram ${method} error`, error);
    return null;
  }
}

function commandFrom(text) {
  return String(text).trim().split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");
}

function isValidWebhookSecret(secret) {
  return typeof secret === "string" && /^[A-Za-z0-9_-]{16,256}$/.test(secret);
}

function isAdmin(request, env) {
  if (!env.SETUP_SECRET) return false;
  return request.headers.get("authorization") === `Bearer ${env.SETUP_SECRET}`;
}

export class ReminderBot extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS processed_updates (
        update_id INTEGER PRIMARY KEY,
        processed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_update_id INTEGER UNIQUE,
        chat_id TEXT NOT NULL,
        text TEXT NOT NULL,
        remind_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'sending', 'sent', 'done', 'cancelled')),
        created_at INTEGER NOT NULL,
        sending_at INTEGER,
        sent_at INTEGER,
        completed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS reminders_due
        ON reminders(status, remind_at);

      CREATE INDEX IF NOT EXISTS reminders_by_chat
        ON reminders(chat_id, status, remind_at);
    `);
  }

  first(query, ...bindings) {
    return this.sql.exec(query, ...bindings).toArray()[0] ?? null;
  }

  getSetting(key) {
    return this.first("SELECT value FROM settings WHERE key = ?", key)?.value ?? null;
  }

  setSetting(key, value) {
    this.sql.exec(
      `INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      String(value),
      Date.now()
    );
  }

  rememberUpdate(updateId) {
    if (!Number.isSafeInteger(updateId)) return false;
    if (this.first("SELECT 1 AS found FROM processed_updates WHERE update_id = ?", updateId)) {
      return false;
    }

    this.sql.exec(
      "INSERT INTO processed_updates(update_id, processed_at) VALUES(?, ?)",
      updateId,
      Date.now()
    );
    this.sql.exec(`
      DELETE FROM processed_updates
      WHERE update_id NOT IN (
        SELECT update_id FROM processed_updates ORDER BY processed_at DESC LIMIT 500
      )
    `);
    return true;
  }

  async processUpdate(update) {
    const updateId = Number(update?.update_id);
    if (!this.rememberUpdate(updateId)) return { ok: true, duplicate: true };

    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
    } else if (update.message) {
      await this.handleMessage(update.message, updateId);
    }

    return { ok: true, duplicate: false };
  }

  ownerChatId() {
    return this.getSetting("owner_chat_id");
  }

  async requireOwner(message) {
    const chatId = String(message.chat.id);
    let owner = this.ownerChatId();
    const startMatch = String(message.text || "").match(/^\/start(?:@\w+)?(?:\s+(\S+))?/i);

    if (!owner) {
      if (!this.env.CLAIM_CODE) {
        await sendText(this.env, chatId, "Бот ещё не настроен: отсутствует код первого входа.");
        return false;
      }
      if (!startMatch || startMatch[1] !== this.env.CLAIM_CODE) {
        await sendText(this.env, chatId, "Это личный бот. Для первого входа используй: /start ТВОЙ_КОД");
        return false;
      }

      this.setSetting("owner_chat_id", chatId);
      owner = this.ownerChatId();
      if (owner !== chatId) return false;

      await sendText(this.env, chatId, `Я запомнил тебя.\n\n${HELP}`);
      return false;
    }

    // После первого входа бот молча игнорирует всех посторонних.
    return owner === chatId;
  }

  async handleMessage(message, updateId) {
    if (!message?.chat?.id || typeof message.text !== "string") return;
    if (!(await this.requireOwner(message))) return;

    const chatId = String(message.chat.id);
    const text = message.text.trim();
    const command = commandFrom(text);

    if (command === "/start" || command === "/help") {
      await sendText(this.env, chatId, HELP);
      return;
    }

    if (command === "/today") {
      await sendText(this.env, chatId, this.listText(chatId, true));
      return;
    }

    if (command === "/list") {
      await sendText(this.env, chatId, this.listText(chatId, false));
      return;
    }

    if (command === "/cancel") {
      const id = Number(text.match(/^\/cancel(?:@\w+)?\s+(\d+)/i)?.[1]);
      if (!id) {
        await sendText(this.env, chatId, "Напиши номер: /cancel 12");
        return;
      }

      const changed = this.sql.exec(
        `UPDATE reminders SET status = 'cancelled', completed_at = ?
         WHERE id = ? AND chat_id = ? AND status IN ('pending', 'sending', 'sent')`,
        Date.now(),
        id,
        chatId
      ).rowsWritten;
      await this.scheduleNextAlarm();
      await sendText(
        this.env,
        chatId,
        changed ? `№${id} забыт.` : `Не нашёл активное напоминание №${id}.`
      );
      return;
    }

    if (text.startsWith("/")) {
      await sendText(this.env, chatId, "Такой команды я не помню. Попробуй /help");
      return;
    }

    const sentAt = Number(message.date) * 1000;
    const baseTime = Number.isFinite(sentAt) && sentAt > 0 ? sentAt : Date.now();
    const parsed = parseReminder(text, baseTime);
    if (!parsed.ok) {
      await sendText(this.env, chatId, parsed.error);
      return;
    }

    this.sql.exec(
      `INSERT OR IGNORE INTO reminders
       (source_update_id, chat_id, text, remind_at, status, created_at)
       VALUES(?, ?, ?, ?, 'pending', ?)`,
      updateId,
      chatId,
      parsed.text,
      parsed.remindAt,
      Date.now()
    );
    const reminder = this.first(
      "SELECT id, text, remind_at FROM reminders WHERE source_update_id = ?",
      updateId
    );

    await this.scheduleNextAlarm();
    await sendText(
      this.env,
      chatId,
      `Запомнил №${reminder.id}: «${reminder.text}»\n${formatTokyo(Number(reminder.remind_at))}\n\nЕсли ты забудешь — я нет.`
    );
  }

  listText(chatId, todayOnly) {
    let rows;
    if (todayOnly) {
      const { start, end } = tokyoDayBounds(Date.now());
      rows = this.sql.exec(
        `SELECT id, text, remind_at, status FROM reminders
         WHERE chat_id = ? AND status IN ('pending', 'sending', 'sent')
           AND remind_at >= ? AND remind_at < ?
         ORDER BY remind_at ASC LIMIT 20`,
        chatId,
        start,
        end
      ).toArray();
    } else {
      rows = this.sql.exec(
        `SELECT id, text, remind_at, status FROM reminders
         WHERE chat_id = ? AND status IN ('pending', 'sending', 'sent')
         ORDER BY CASE WHEN status = 'sent' THEN 0 ELSE 1 END, remind_at ASC LIMIT 20`,
        chatId
      ).toArray();
    }

    if (!rows.length) return todayOnly ? "На сегодня — тишина." : "Я пока ничего не жду.";
    const lines = rows.map((item) => {
      const mark = item.status === "sent" ? "🔔" : "·";
      return `${mark} №${item.id} — ${formatTokyo(Number(item.remind_at))} — ${item.text}`;
    });
    return `${todayOnly ? "Сегодня:" : "Я помню:"}\n\n${lines.join("\n")}`;
  }

  async handleCallback(callback) {
    const chatId = String(callback.message?.chat?.id || "");
    if (!chatId || chatId !== this.ownerChatId()) {
      await safeTelegram(this.env, "answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Не для тебя."
      });
      return;
    }

    const match = String(callback.data || "").match(/^(done|s15|s60):(\d+)$/);
    if (!match) {
      await safeTelegram(this.env, "answerCallbackQuery", { callback_query_id: callback.id });
      return;
    }

    const action = match[1];
    const id = Number(match[2]);
    const reminder = this.first(
      "SELECT id, text, status FROM reminders WHERE id = ? AND chat_id = ?",
      id,
      chatId
    );

    if (!reminder || !["pending", "sending", "sent"].includes(reminder.status)) {
      await safeTelegram(this.env, "answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Уже сделано."
      });
      return;
    }

    if (action === "done") {
      this.sql.exec(
        `UPDATE reminders SET status = 'done', completed_at = ?
         WHERE id = ? AND chat_id = ? AND status IN ('pending', 'sending', 'sent')`,
        Date.now(),
        id,
        chatId
      );
      await this.scheduleNextAlarm();
      await safeTelegram(this.env, "answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Готово."
      });
      await safeTelegram(this.env, "editMessageText", {
        chat_id: chatId,
        message_id: callback.message.message_id,
        text: `✅ ${reminder.text}\n\nТеперь можно отпустить.`
      });
      return;
    }

    const minutes = action === "s15" ? 15 : 60;
    const next = Date.now() + minutes * 60 * 1000;
    this.sql.exec(
      `UPDATE reminders
       SET status = 'pending', remind_at = ?, sending_at = NULL, sent_at = NULL
       WHERE id = ? AND chat_id = ? AND status IN ('pending', 'sending', 'sent')`,
      next,
      id,
      chatId
    );
    await this.scheduleNextAlarm();
    await safeTelegram(this.env, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: `Ещё ${minutes} мин.`
    });
    await safeTelegram(this.env, "editMessageText", {
      chat_id: chatId,
      message_id: callback.message.message_id,
      text: `Отпустил до ${formatTokyo(next)}.\n\nЯ вернусь.`
    });
  }

  async scheduleNextAlarm(minimumDelayMs = 0) {
    const next = this.first(
      "SELECT MIN(remind_at) AS remind_at FROM reminders WHERE status = 'pending'"
    )?.remind_at;

    if (next === null || next === undefined) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    const target = Math.max(Number(next), Date.now() + minimumDelayMs);
    await this.ctx.storage.setAlarm(target);
  }

  async alarm() {
    const now = Date.now();

    // Если предыдущий запуск оборвался, возвращаем зависшее напоминание в очередь.
    this.sql.exec(
      `UPDATE reminders SET status = 'pending', sending_at = NULL
       WHERE status = 'sending' AND sending_at <= ?`,
      now - 5 * 60 * 1000
    );

    const due = this.sql.exec(
      `SELECT id, chat_id, text FROM reminders
       WHERE status = 'pending' AND remind_at <= ?
       ORDER BY remind_at ASC LIMIT 50`,
      now
    ).toArray();

    if (due.length) {
      // Watchdog: если выполнение оборвётся, объект проснётся и восстановит очередь.
      await this.ctx.storage.setAlarm(now + 5 * 60 * 1000);
    }

    let hadFailure = false;
    for (const reminder of due) {
      const claimed = this.sql.exec(
        `UPDATE reminders SET status = 'sending', sending_at = ?
         WHERE id = ? AND status = 'pending'`,
        Date.now(),
        reminder.id
      ).rowsWritten;
      if (!claimed) continue;

      try {
        await sendText(this.env, reminder.chat_id, `⏰ ${reminder.text}\n\nТы просил меня не забыть.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Готово", callback_data: `done:${reminder.id}` }],
              [
                { text: "+15 минут", callback_data: `s15:${reminder.id}` },
                { text: "+1 час", callback_data: `s60:${reminder.id}` }
              ]
            ]
          }
        });
        this.sql.exec(
          `UPDATE reminders
           SET status = 'sent', sent_at = ?, sending_at = NULL
           WHERE id = ? AND status = 'sending'`,
          Date.now(),
          reminder.id
        );
      } catch (error) {
        hadFailure = true;
        console.error("Could not send reminder", reminder.id, error);
        this.sql.exec(
          `UPDATE reminders SET status = 'pending', sending_at = NULL
           WHERE id = ? AND status = 'sending'`,
          reminder.id
        );
      }
    }

    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    this.sql.exec(
      `DELETE FROM reminders
       WHERE status IN ('done', 'cancelled') AND completed_at < ?`,
      cutoff
    );
    await this.scheduleNextAlarm(hadFailure ? 30_000 : 0);
  }

  status() {
    const active = Number(
      this.first(
        "SELECT COUNT(*) AS count FROM reminders WHERE status IN ('pending', 'sending', 'sent')"
      )?.count || 0
    );
    return {
      claimed: Boolean(this.ownerChatId()),
      active_reminders: active,
      database_bytes: this.sql.databaseSize
    };
  }
}

async function setupWebhook(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!isValidWebhookSecret(env.TELEGRAM_WEBHOOK_SECRET)) {
    return json({ ok: false, error: "TELEGRAM_WEBHOOK_SECRET must be 16-256 safe characters" }, 500);
  }
  if (!env.CLAIM_CODE || !env.BOT_TOKEN) {
    return json({ ok: false, error: "BOT_TOKEN or CLAIM_CODE is missing" }, 500);
  }

  const origin = new URL(request.url).origin;
  await telegram(env, "setMyCommands", { commands: COMMANDS });
  const webhook = await telegram(env, "setWebhook", {
    url: `${origin}/telegram`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
    max_connections: 10
  });

  return json({ ok: true, webhook: Boolean(webhook), url: `${origin}/telegram` });
}

async function adminStatus(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const webhook = await telegram(env, "getWebhookInfo");
  const bot = env.REMINDER_BOT.getByName("primary");
  const storage = await bot.status();
  return json({ ok: true, webhook, storage });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return json({ ok: true, name: "Я помню", time_zone: "Asia/Tokyo" });
      }

      if (request.method === "GET" && url.pathname === "/setup") {
        return setupPage();
      }

      if (request.method === "POST" && url.pathname === "/admin/setup") {
        return await setupWebhook(request, env);
      }

      if (request.method === "GET" && url.pathname === "/admin/status") {
        return await adminStatus(request, env);
      }

      if (request.method === "POST" && url.pathname === "/telegram") {
        const secret = request.headers.get("x-telegram-bot-api-secret-token");
        if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
          return json({ ok: false }, 403);
        }

        const update = await request.json();
        if (!Number.isSafeInteger(Number(update?.update_id))) {
          return json({ ok: false, error: "invalid_update" }, 400);
        }

        const bot = env.REMINDER_BOT.getByName("primary");
        const result = await bot.processUpdate(update);
        return json(result);
      }

      return json({ ok: false, error: "not_found" }, 404);
    } catch (error) {
      console.error(error);
      return json({ ok: false, error: "internal_error" }, 500);
    }
  }
};
