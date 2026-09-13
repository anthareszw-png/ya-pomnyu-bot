var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
import { DurableObject } from "cloudflare:workers";

// src/parser.js
var TOKYO_OFFSET_MS = 9 * 60 * 60 * 1e3;
var NUMBER_WORDS = /* @__PURE__ */ new Map([
  ["\u043E\u0434\u0438\u043D", 1],
  ["\u043E\u0434\u043D\u0443", 1],
  ["\u0434\u0432\u0430", 2],
  ["\u0434\u0432\u0435", 2],
  ["\u0442\u0440\u0438", 3],
  ["\u0447\u0435\u0442\u044B\u0440\u0435", 4],
  ["\u043F\u044F\u0442\u044C", 5],
  ["\u0448\u0435\u0441\u0442\u044C", 6],
  ["\u0441\u0435\u043C\u044C", 7],
  ["\u0432\u043E\u0441\u0435\u043C\u044C", 8],
  ["\u0434\u0435\u0432\u044F\u0442\u044C", 9],
  ["\u0434\u0435\u0441\u044F\u0442\u044C", 10],
  ["\u043F\u044F\u0442\u043D\u0430\u0434\u0446\u0430\u0442\u044C", 15],
  ["\u0434\u0432\u0430\u0434\u0446\u0430\u0442\u044C", 20],
  ["\u0442\u0440\u0438\u0434\u0446\u0430\u0442\u044C", 30],
  ["\u0441\u043E\u0440\u043E\u043A", 40]
]);
var DAYPARTS = {
  \u0443\u0442\u0440\u043E\u043C: { hour: 9, minute: 0 },
  \u0434\u043D\u0435\u043C: { hour: 14, minute: 0 },
  "\u0434\u043D\u0451\u043C": { hour: 14, minute: 0 },
  \u0432\u0435\u0447\u0435\u0440\u043E\u043C: { hour: 19, minute: 0 },
  \u043D\u043E\u0447\u044C\u044E: { hour: 23, minute: 0 }
};
function numberFromToken(token) {
  const normalized = String(token).toLowerCase().replace(",", ".");
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  return NUMBER_WORDS.get(normalized) ?? null;
}
__name(numberFromToken, "numberFromToken");
function tokyoParts(epochMs) {
  const shifted = new Date(epochMs + TOKYO_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay()
  };
}
__name(tokyoParts, "tokyoParts");
function epochFromTokyo(year, month, day, hour = 0, minute = 0) {
  return Date.UTC(year, month - 1, day, hour, minute) - TOKYO_OFFSET_MS;
}
__name(epochFromTokyo, "epochFromTokyo");
function addTokyoDays(parts, amount) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}
__name(addTokyoDays, "addTokyoDays");
function tokyoDayBounds(epochMs) {
  const parts = tokyoParts(epochMs);
  const start = epochFromTokyo(parts.year, parts.month, parts.day);
  return { start, end: start + 24 * 60 * 60 * 1e3 };
}
__name(tokyoDayBounds, "tokyoDayBounds");
function cleanReminderText(input) {
  const cleaned = String(input).replace(/^\s*(?:пожалуйста[,.]?\s*)?(?:напомни(?:\s+мне)?|напоминание)\s*[:,-]?\s*/i, "").replace(/^[\s,;:—-]+|[\s,;:—-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return (cleaned || "\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435").slice(0, 500);
}
__name(cleanReminderText, "cleanReminderText");
function normalizeHour(hour, period) {
  if (!period) return hour;
  const word = period.toLowerCase();
  if (word === "\u0443\u0442\u0440\u0430" || word === "\u0443\u0442\u0440\u043E\u043C") return hour === 12 ? 0 : hour;
  if (["\u0434\u043D\u044F", "\u0434\u043D\u0435\u043C", "\u0434\u043D\u0451\u043C", "\u0432\u0435\u0447\u0435\u0440\u0430", "\u0432\u0435\u0447\u0435\u0440\u043E\u043C"].includes(word)) {
    return hour < 12 ? hour + 12 : hour;
  }
  if (word === "\u043D\u043E\u0447\u0438" || word === "\u043D\u043E\u0447\u044C\u044E") return hour === 12 ? 0 : hour;
  return hour;
}
__name(normalizeHour, "normalizeHour");
function relativeDuration(match) {
  const special = match.groups?.special?.toLowerCase();
  if (special === "\u043F\u043E\u043B\u0447\u0430\u0441\u0430") return 30 * 60 * 1e3;
  if (special === "\u0447\u0430\u0441" || special === "\u0447\u0430\u0441\u0438\u043A") return 60 * 60 * 1e3;
  if (special === "\u043F\u043E\u043B\u0442\u043E\u0440\u0430 \u0447\u0430\u0441\u0430" || special === "\u043F\u043E\u043B\u0442\u043E\u0440\u044B \u0447\u0430\u0441\u0430") return 90 * 60 * 1e3;
  const amount = numberFromToken(match.groups?.amount);
  const unit = String(match.groups?.unit || "").toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit.startsWith("\u043C")) return amount * 60 * 1e3;
  if (unit.startsWith("\u0447")) return amount * 60 * 60 * 1e3;
  if (unit.startsWith("\u0434") || unit.startsWith("\u0441\u0443\u0442")) return amount * 24 * 60 * 60 * 1e3;
  return null;
}
__name(relativeDuration, "relativeDuration");
function findExplicitTime(input) {
  const withPreposition = input.match(
    /(?<![\p{L}\p{N}])(?:в|на)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(утра|утром|дня|днем|днём|вечера|вечером|ночи|ночью)?(?![\p{L}\p{N}])/iu
  );
  if (withPreposition) {
    return {
      raw: withPreposition[0],
      hour: Number(withPreposition[1]),
      minute: Number(withPreposition[2] || 0),
      period: withPreposition[3]
    };
  }
  const clock = input.match(
    /(?<![\p{L}\p{N}])(\d{1,2})[:.](\d{2})\s*(утра|утром|дня|днем|днём|вечера|вечером|ночи|ночью)?(?![\p{L}\p{N}])/iu
  );
  if (clock) {
    return {
      raw: clock[0],
      hour: Number(clock[1]),
      minute: Number(clock[2]),
      period: clock[3]
    };
  }
  const hourWithPeriod = input.match(
    /(?<![\p{L}\p{N}])(\d{1,2})\s*(утра|утром|дня|днем|днём|вечера|вечером|ночи|ночью)(?![\p{L}\p{N}])/iu
  );
  if (!hourWithPeriod) return null;
  return {
    raw: hourWithPeriod[0],
    hour: Number(hourWithPeriod[1]),
    minute: 0,
    period: hourWithPeriod[2]
  };
}
__name(findExplicitTime, "findExplicitTime");
var MONTH_NAMES = [
  "\u044F\u043D\u0432\u0430\u0440\u044C \u044F\u043D\u0432\u0430\u0440\u044F \u0441\u0456\u0447\u0435\u043D\u044C \u0441\u0456\u0447\u043D\u044F",
  "\u0444\u0435\u0432\u0440\u0430\u043B\u044C \u0444\u0435\u0432\u0440\u0430\u043B\u044F \u043B\u044E\u0442\u0438\u0439 \u043B\u044E\u0442\u043E\u0433\u043E",
  "\u043C\u0430\u0440\u0442 \u043C\u0430\u0440\u0442\u0430 \u0431\u0435\u0440\u0435\u0437\u0435\u043D\u044C \u0431\u0435\u0440\u0435\u0437\u043D\u044F",
  "\u0430\u043F\u0440\u0435\u043B\u044C \u0430\u043F\u0440\u0435\u043B\u044F \u043A\u0432\u0456\u0442\u0435\u043D\u044C \u043A\u0432\u0456\u0442\u043D\u044F",
  "\u043C\u0430\u0439 \u043C\u0430\u044F \u0442\u0440\u0430\u0432\u0435\u043D\u044C \u0442\u0440\u0430\u0432\u043D\u044F",
  "\u0438\u044E\u043D\u044C \u0438\u044E\u043D\u044F \u0447\u0435\u0440\u0432\u0435\u043D\u044C \u0447\u0435\u0440\u0432\u043D\u044F",
  "\u0438\u044E\u043B\u044C \u0438\u044E\u043B\u044F \u043B\u0438\u043F\u0435\u043D\u044C \u043B\u0438\u043F\u043D\u044F",
  "\u0430\u0432\u0433\u0443\u0441\u0442 \u0430\u0432\u0433\u0443\u0441\u0442\u0430 \u0441\u0435\u0440\u043F\u0435\u043D\u044C \u0441\u0435\u0440\u043F\u043D\u044F",
  "\u0441\u0435\u043D\u0442\u044F\u0431\u0440\u044C \u0441\u0435\u043D\u0442\u044F\u0431\u0440\u044F \u0432\u0435\u0440\u0435\u0441\u0435\u043D\u044C \u0432\u0435\u0440\u0435\u0441\u043D\u044F",
  "\u043E\u043A\u0442\u044F\u0431\u0440\u044C \u043E\u043A\u0442\u044F\u0431\u0440\u044F \u0436\u043E\u0432\u0442\u0435\u043D\u044C \u0436\u043E\u0432\u0442\u043D\u044F",
  "\u043D\u043E\u044F\u0431\u0440\u044C \u043D\u043E\u044F\u0431\u0440\u044F \u043B\u0438\u0441\u0442\u043E\u043F\u0430\u0434 \u043B\u0438\u0441\u0442\u043E\u043F\u0430\u0434\u0430",
  "\u0434\u0435\u043A\u0430\u0431\u0440\u044C \u0434\u0435\u043A\u0430\u0431\u0440\u044F \u0433\u0440\u0443\u0434\u0435\u043D\u044C \u0433\u0440\u0443\u0434\u043D\u044F"
];
var MONTHS = new Map(MONTH_NAMES.flatMap((names, index) => names.split(" ").map((name) => [name, index + 1])));
var CALENDAR_DATE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:\u043D\u0430\\s+)?(\\d{1,2})(?:-?(?:\u0433\u043E|\u0435))?\\s+(${[...MONTHS.keys()].join("|")}|\u0447\u0438\u0441\u043B\u0430)(?![\\p{L}\\p{N}])(?:\\s+(\\d{4})(?![\\p{L}\\p{N}])(?:\\s*(?:\u0433\u043E\u0434\u0430|\u0433\\.|\u0440\u043E\u043A\u0443)(?![\\p{L}\\p{N}]))?)?`,
  "iu"
);
function resolveCalendarDate(match, nowMs, hour, minute) {
  const day = Number(match[1]);
  const month = MONTHS.get(match[2].toLowerCase());
  const year = match[3] ? Number(match[3]) : null;
  if (day < 1 || day > 31 || year !== null && (year < 100 || !month)) return null;
  const now = tokyoParts(nowMs);
  const attempts = year !== null ? 1 : month ? 9 : 13;
  for (let i = 0; i < attempts; i++) {
    const candidateYear = year ?? (month ? now.year + i : now.year + Math.floor((now.month - 1 + i) / 12));
    const candidateMonth = month ?? (now.month - 1 + i) % 12 + 1;
    const epoch = epochFromTokyo(candidateYear, candidateMonth, day, hour, minute);
    const parts = tokyoParts(epoch);
    if (parts.year === candidateYear && parts.month === candidateMonth && parts.day === day && epoch > nowMs) return epoch;
  }
  return null;
}
__name(resolveCalendarDate, "resolveCalendarDate");
function parseReminder(input, nowMs = Date.now()) {
  const original = String(input || "").trim();
  if (!original) return { ok: false, error: "\u041D\u0430\u043F\u0438\u0448\u0438, \u0447\u0442\u043E \u0438 \u043A\u043E\u0433\u0434\u0430 \u043D\u0430\u043F\u043E\u043C\u043D\u0438\u0442\u044C." };
  const relativePattern = /(?<![\p{L}\p{N}])через\s+(?:(?<special>полчаса|полтор[аы]\s+часа|часик|час)|(?<amount>\d+(?:[.,]\d+)?|один|одну|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|пятнадцать|двадцать|тридцать|сорок)\s*(?<unit>минут(?:у|ы)?|мин|м|час(?:а|ов)?|ч|день|дня|дней|сутки|суток))(?![\p{L}\p{N}])/iu;
  const relativeMatch = original.match(relativePattern);
  if (relativeMatch) {
    const duration = relativeDuration(relativeMatch);
    if (!duration) return { ok: false, error: "\u041D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C \u043F\u043E\u043D\u044F\u0442\u044C \u0434\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C." };
    const text = cleanReminderText(original.replace(relativeMatch[0], ""));
    return { ok: true, text, remindAt: Math.round(nowMs + duration), kind: "relative" };
  }
  const dayMatch = original.match(/(?<![\p{L}\p{N}])(сегодня|послезавтра|завтра)(?![\p{L}\p{N}])/iu);
  const dayWord = dayMatch?.[1]?.toLowerCase() ?? null;
  const dateMatch = original.match(CALENDAR_DATE);
  const withoutDate = dateMatch ? original.replace(dateMatch[0], "") : original;
  const timeMatch = findExplicitTime(withoutDate);
  const daypartMatch = timeMatch ? null : original.match(/(?<![\p{L}\p{N}])(утром|дн[её]м|вечером|ночью)(?![\p{L}\p{N}])/iu);
  if (!timeMatch && !daypartMatch && !dayWord && !dateMatch) {
    return {
      ok: false,
      error: "\u041D\u0435 \u043F\u043E\u043D\u044F\u043B \u0432\u0440\u0435\u043C\u044F. \u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \xAB\u0447\u0435\u0440\u0435\u0437 \u0447\u0430\u0441 \u043F\u043E\u0435\u0441\u0442\u044C\xBB, \xAB\u0443\u0442\u0440\u043E\u043C \u0432\u044B\u043F\u0438\u0442\u044C \u0447\u0430\u0439\xBB \u0438\u043B\u0438 \xAB\u0437\u0430\u0432\u0442\u0440\u0430 \u0432 9:30 \u0441\u044A\u0451\u043C\u043A\u0430\xBB."
    };
  }
  const now = tokyoParts(nowMs);
  const dayShift = dayWord === "\u043F\u043E\u0441\u043B\u0435\u0437\u0430\u0432\u0442\u0440\u0430" ? 2 : dayWord === "\u0437\u0430\u0432\u0442\u0440\u0430" ? 1 : 0;
  let date = addTokyoDays(now, dayShift);
  let hour = 9;
  let minute = 0;
  if (timeMatch) {
    hour = normalizeHour(timeMatch.hour, timeMatch.period);
    minute = timeMatch.minute;
  } else if (daypartMatch) {
    const daypart = DAYPARTS[daypartMatch[1].toLowerCase()];
    hour = daypart.hour;
    minute = daypart.minute;
  }
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    return { ok: false, error: "\u0422\u0430\u043A\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u043D\u0435 \u0431\u044B\u0432\u0430\u0435\u0442. \u041F\u0440\u043E\u0432\u0435\u0440\u044C \u0447\u0430\u0441\u044B \u0438 \u043C\u0438\u043D\u0443\u0442\u044B." };
  }
  let remindAt = epochFromTokyo(date.year, date.month, date.day, hour, minute);
  if (dateMatch) {
    if (dayWord) return { ok: false, error: "\u0423\u043A\u0430\u0436\u0438 \u043E\u0434\u043D\u0443 \u0434\u0430\u0442\u0443 \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F." };
    remindAt = resolveCalendarDate(dateMatch, nowMs, hour, minute);
    if (remindAt === null) return { ok: false, error: "\u0422\u0430\u043A\u043E\u0439 \u0434\u0430\u0442\u044B \u043D\u0435 \u0431\u044B\u0432\u0430\u0435\u0442 \u0438\u043B\u0438 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u0430\u044F \u0434\u0430\u0442\u0430 \u0443\u0436\u0435 \u043F\u0440\u043E\u0448\u043B\u0430." };
  } else if (!dayWord && remindAt <= nowMs) {
    date = addTokyoDays(now, 1);
    remindAt = epochFromTokyo(date.year, date.month, date.day, hour, minute);
  } else if (dayWord === "\u0441\u0435\u0433\u043E\u0434\u043D\u044F" && remindAt <= nowMs) {
    return { ok: false, error: "\u042D\u0442\u043E \u0432\u0440\u0435\u043C\u044F \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u0443\u0436\u0435 \u043F\u0440\u043E\u0448\u043B\u043E." };
  }
  let textSource = withoutDate;
  if (dayMatch) textSource = textSource.replace(dayMatch[0], "");
  if (timeMatch) textSource = textSource.replace(timeMatch.raw, "");
  if (daypartMatch) textSource = textSource.replace(daypartMatch[0], "");
  return {
    ok: true,
    text: cleanReminderText(textSource),
    remindAt,
    kind: "absolute"
  };
}
__name(parseReminder, "parseReminder");
function formatTokyo(epochMs) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(epochMs));
}
__name(formatTokyo, "formatTokyo");

// src/features.js
var DAY = 864e5;
var WEEKDAYS = ["\u0432\u043E\u0441\u043A\u0440\u0435\u0441\u0435\u043D\u044C\u0435", "\u043F\u043E\u043D\u0435\u0434\u0435\u043B\u044C\u043D\u0438\u043A", "\u0432\u0442\u043E\u0440\u043D\u0438\u043A", "\u0441\u0440\u0435\u0434\u0430", "\u0447\u0435\u0442\u0432\u0435\u0440\u0433", "\u043F\u044F\u0442\u043D\u0438\u0446\u0430", "\u0441\u0443\u0431\u0431\u043E\u0442\u0430"];
var DAY_FORMS = { \u0432\u043E\u0441\u043A\u0440\u0435\u0441\u0435\u043D\u044C\u0435: 0, \u043F\u043E\u043D\u0435\u0434\u0435\u043B\u044C\u043D\u0438\u043A: 1, \u0432\u0442\u043E\u0440\u043D\u0438\u043A: 2, \u0441\u0440\u0435\u0434\u0430: 3, \u0441\u0440\u0435\u0434\u0443: 3, \u0447\u0435\u0442\u0432\u0435\u0440\u0433: 4, \u043F\u044F\u0442\u043D\u0438\u0446\u0430: 5, \u043F\u044F\u0442\u043D\u0438\u0446\u0443: 5, \u0441\u0443\u0431\u0431\u043E\u0442\u0430: 6, \u0441\u0443\u0431\u0431\u043E\u0442\u0443: 6 };
var WEEKDAY = new RegExp(`(?<![\\p{L}\\p{N}])(?:\u0432|\u043D\u0430)\\s+(${Object.keys(DAY_FORMS).join("|")})(?![\\p{L}\\p{N}])`, "iu");
var REPEAT = new RegExp(`(?<![\\p{L}\\p{N}])(?:\u043A\u0430\u0436\u0434(?:\u044B\u0439|\u0443\u044E|\u043E\u0435|\u043E\u0433\u043E)\\s+(?:(\\d{1,2})\\s+\u0447\u0438\u0441\u043B\u0430|(${Object.keys(DAY_FORMS).join("|")})|(\u0434\u0435\u043D\u044C))|\u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u043E)(?![\\p{L}\\p{N}])`, "iu");
function nextOccurrence(rule, after) {
  const p = tokyoParts(after);
  if (rule.type === "monthly") {
    for (let i = 0; i < 24; i++) {
      const monthIndex = p.month - 1 + i;
      const year = p.year + Math.floor(monthIndex / 12);
      const month = monthIndex % 12 + 1;
      const t = epochFromTokyo(year, month, rule.day, rule.hour, rule.minute);
      if (t > after && tokyoParts(t).day === rule.day) return t;
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const t = epochFromTokyo(p.year, p.month, p.day + i, rule.hour, rule.minute);
      if (t > after && (rule.type === "daily" || tokyoParts(t).weekday === rule.weekday)) return t;
    }
  }
  throw new Error("Invalid recurrence");
}
__name(nextOccurrence, "nextOccurrence");
function repeatLabel(rule) {
  if (!rule) return "";
  if (typeof rule === "string") rule = JSON.parse(rule);
  if (rule.type === "monthly") return `\u043A\u0430\u0436\u0434\u043E\u0433\u043E ${rule.day} \u0447\u0438\u0441\u043B\u0430`;
  if (rule.type === "weekly") return `\u0435\u0436\u0435\u043D\u0435\u0434\u0435\u043B\u044C\u043D\u043E: ${WEEKDAYS[rule.weekday]}`;
  return "\u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C";
}
__name(repeatLabel, "repeatLabel");
function parseInput(input, now = Date.now()) {
  let text = String(input || "").trim().replace(/[.!?]+$/, "");
  const repeat = text.match(REPEAT);
  if (repeat) {
    if (repeat[1] && (+repeat[1] < 1 || +repeat[1] > 31)) return { ok: false, error: "\u0423\u043A\u0430\u0436\u0438 \u0447\u0438\u0441\u043B\u043E \u043E\u0442 1 \u0434\u043E 31." };
    const remainder = text.replace(repeat[0], "").trim();
    if (/(?:сегодня|завтра|через|числа|сентября|января)/iu.test(remainder)) return { ok: false, error: "\u0414\u043B\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u044F \u0443\u043A\u0430\u0436\u0438 \u0432\u0440\u0435\u043C\u044F, \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C \u0432 9:00 \u0437\u0430\u0440\u044F\u0434\u043A\u0430." };
    const parsed2 = parseReminder(`\u0437\u0430\u0432\u0442\u0440\u0430 ${remainder}`, now);
    if (!parsed2.ok) return parsed2;
    const p = tokyoParts(parsed2.remindAt);
    const rule = { type: repeat[1] ? "monthly" : repeat[2] ? "weekly" : "daily", hour: p.hour, minute: p.minute };
    if (repeat[1]) rule.day = +repeat[1];
    if (repeat[2]) rule.weekday = DAY_FORMS[repeat[2].toLowerCase()];
    return { ...parsed2, remindAt: nextOccurrence(rule, now), recurrence: rule };
  }
  if (/кажд|ежеднев/iu.test(text)) return { ok: false, error: "\u041F\u043E\u0432\u0442\u043E\u0440\u044B: \xAB\u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C\xBB, \xAB\u043A\u0430\u0436\u0434\u0443\u044E \u043F\u044F\u0442\u043D\u0438\u0446\u0443\xBB, \xAB\u043A\u0430\u0436\u0434\u043E\u0433\u043E 25 \u0447\u0438\u0441\u043B\u0430\xBB \u0438 \u0432\u0440\u0435\u043C\u044F." };
  const weekday = text.match(WEEKDAY);
  if (weekday) {
    const remainder = text.replace(weekday[0], "").trim();
    if (/(?:сегодня|завтра|через|числа)/iu.test(remainder)) return { ok: false, error: "\u0423\u043A\u0430\u0436\u0438 \u043E\u0434\u043D\u0443 \u0434\u0430\u0442\u0443 \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F." };
    const parsed2 = parseReminder(`\u0437\u0430\u0432\u0442\u0440\u0430 ${remainder}`, now);
    if (!parsed2.ok) return parsed2;
    const p = tokyoParts(parsed2.remindAt);
    return { ...parsed2, remindAt: nextOccurrence({ type: "weekly", weekday: DAY_FORMS[weekday[1].toLowerCase()], hour: p.hour, minute: p.minute }, now) };
  }
  text = text.replace(/^(\d{1,2})(?:-?(?:го|е))?(?=\s|$)(?!\s*(?:числа|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр|січ|лют|берез|квіт|трав|черв|лип|серп|верес|жовт|листоп|груд))/iu, "$1 \u0447\u0438\u0441\u043B\u0430");
  const parsed = parseReminder(text, now);
  if (!parsed.ok && parsed.error.startsWith("\u041D\u0435 \u043F\u043E\u043D\u044F\u043B \u0432\u0440\u0435\u043C\u044F.")) {
    return { ...parsed, needsTime: true, text: text.replace(/^напомни(?: мне)?\s*/iu, "").slice(0, 500) };
  }
  return parsed;
}
__name(parseInput, "parseInput");
function parseEdit(text) {
  const match = String(text).match(/^(?:перенеси|перенести|поменяй\s+время|измени\s+время|\/edit(?:@\w+)?)\s*№?\s*(\d+)\s+(.+)$/iu);
  if (match) return { number: +match[1], time: match[2].replace(/^на\s+/iu, "") };
  const rename = String(text).match(/^(?:переименуй|измени\s+текст)\s*№?\s*(\d+)\s+(.+)$/iu);
  return rename ? { number: +rename[1], title: rename[2].replace(/^на\s+/iu, "").slice(0, 500) } : null;
}
__name(parseEdit, "parseEdit");
function summaryTime(text) {
  const match = String(text).match(/^(?:\/summary(?:@\w+)?|сводка)(?:\s+(?:в\s+)?(.+))?$/iu);
  if (!match) return null;
  const value = (match[1] || "").toLowerCase();
  if (["\u0432\u044B\u043A\u043B", "\u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C", "off"].includes(value)) return { off: true };
  const clock = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!clock || +clock[1] > 23 || +clock[2] > 59) return { help: true };
  return { hour: +clock[1], minute: +clock[2], type: "daily" };
}
__name(summaryTime, "summaryTime");
var DRAFT_TTL = DAY;

// src/index.js
var HELP = [
  "\u042F \u0437\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u044E, \u0447\u0442\u043E\u0431\u044B \u0442\u0435\u0431\u0435 \u043D\u0435 \u043F\u0440\u0438\u0448\u043B\u043E\u0441\u044C.",
  "",
  "\u2022 27 \u0442\u0435\u0441\u0442 / 25 \u0447\u0438\u0441\u043B\u0430 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430",
  "\u2022 \u0432 \u043F\u044F\u0442\u043D\u0438\u0446\u0443 \u0432 18:00 \u0441\u044A\u0451\u043C\u043A\u0430",
  "\u2022 \u043A\u0430\u0436\u0434\u043E\u0433\u043E 25 \u0447\u0438\u0441\u043B\u0430 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430",
  "\u2022 \u043A\u0430\u0436\u0434\u043E\u0435 \u0432\u043E\u0441\u043A\u0440\u0435\u0441\u0435\u043D\u044C\u0435 \u0441\u0442\u0438\u0440\u043A\u0430",
  "\u2022 \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C \u0432 9:00 \u0437\u0430\u0440\u044F\u0434\u043A\u0430",
  "\u2022 \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0438 \u21163 \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430",
  "\u2022 \u043F\u043E\u043C\u0435\u043D\u044F\u0439 \u0432\u0440\u0435\u043C\u044F \u21162 \u043D\u0430 18:00",
  "\u2022 \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u0443\u0439 \u21162 \u043A\u0443\u043F\u0438\u0442\u044C \u0445\u043B\u0435\u0431",
  "\u0411\u0435\u0437 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u2014 \u0441\u043F\u0440\u043E\u0448\u0443, \u043A\u043E\u0433\u0434\u0430. \u041C\u043E\u0436\u043D\u043E \u043F\u0440\u0438\u0441\u043B\u0430\u0442\u044C \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0435 \u0434\u043E 2 \u043C\u0438\u043D\u0443\u0442.",
  "",
  "/today \u2014 \u0441\u0435\u0433\u043E\u0434\u043D\u044F; /list \u2014 \u0432\u0441\u0435 \u0437\u0430\u0434\u0430\u0447\u0438",
  "/done 3 \u2014 \u0433\u043E\u0442\u043E\u0432\u043E; /cancel 3 \u2014 \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C (\u0432\u043A\u043B\u044E\u0447\u0430\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u044B)",
  "/undo \u2014 \u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 (\u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 \u0441\u0443\u0442\u043E\u043A)",
  "/summary 09:00 \u2014 \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u0430\u044F \u0441\u0432\u043E\u0434\u043A\u0430; /summary off \u2014 \u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C",
  "/abort \u2014 \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0432\u0432\u043E\u0434; /help \u2014 \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430",
  "",
  "\u0412\u0440\u0435\u043C\u044F: \u042F\u043F\u043E\u043D\u0438\u044F. \u0421\u043F\u0438\u0441\u043E\u043A \u043E\u043F\u0443\u0441\u0442\u0435\u043B \u2014 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430 \u21161.",
  "\u041F\u043E\u0432\u0442\u043E\u0440 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043D\u0430 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0443\u044E \u0434\u0430\u0442\u0443 \u043F\u043E\u0441\u043B\u0435 \xAB\u0413\u043E\u0442\u043E\u0432\u043E\xBB. \u041E\u0442\u0441\u0440\u043E\u0447\u043A\u0430 \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u043E\u0432."
].join("\n");
var COMMANDS = [
  { command: "today", description: "\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F" },
  { command: "list", description: "\u0412\u0441\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F" },
  { command: "done", description: "\u0412\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u043F\u043E \u043D\u043E\u043C\u0435\u0440\u0443" },
  { command: "cancel", description: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u043E \u043D\u043E\u043C\u0435\u0440\u0443, \u0432\u043A\u043B\u044E\u0447\u0430\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u044B" },
  { command: "edit", description: "\u041F\u0435\u0440\u0435\u043D\u0435\u0441\u0442\u0438: /edit 3 \u0437\u0430\u0432\u0442\u0440\u0430 \u0432 18:00" },
  { command: "undo", description: "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435" },
  { command: "summary", description: "\u0421\u0432\u043E\u0434\u043A\u0430: /summary 09:00 \u0438\u043B\u0438 off" },
  { command: "abort", description: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0432\u0432\u043E\u0434" },
  { command: "help", description: "\u041F\u0440\u0438\u043C\u0435\u0440\u044B \u0438 \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430" }
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
__name(json, "json");
function setupPage() {
  const html = `<!doctype html>
<html lang="ru">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C \xAB\u042F \u043F\u043E\u043C\u043D\u044E\xBB</title>
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
  <h1>\u042F \u043F\u043E\u043C\u043D\u044E \u{1F916}</h1>
  <p>\u0412\u0441\u0442\u0430\u0432\u044C \u0441\u0435\u043A\u0440\u0435\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438. \u041E\u043D \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u044D\u0442\u043E\u043C\u0443 Worker \u0438 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435.</p>
  <form id="form">
    <input id="secret" type="password" autocomplete="off" placeholder="SETUP_SECRET" required>
    <button id="button">\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C Telegram</button>
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
    result.textContent = '\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u044E\u2026';
    try {
      const response = await fetch('/admin/setup', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + input.value }
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || '\u041E\u0448\u0438\u0431\u043A\u0430');
      input.value = '';
      result.textContent = '\u0413\u043E\u0442\u043E\u0432\u043E \u2705 \u0422\u0435\u043F\u0435\u0440\u044C \u043D\u0430\u043F\u0438\u0448\u0438 \u0431\u043E\u0442\u0443 /start \u0438 \u0441\u0432\u043E\u0439 CLAIM_CODE.';
    } catch (error) {
      result.textContent = '\u041D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C: ' + error.message;
    } finally {
      button.disabled = false;
    }
  });
<\/script>
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
__name(setupPage, "setupPage");
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
__name(telegram, "telegram");
function sendText(env, chatId, text, extra = {}) {
  return telegram(env, "sendMessage", {
    chat_id: String(chatId),
    text,
    disable_web_page_preview: true,
    ...extra
  });
}
__name(sendText, "sendText");
async function safeTelegram(env, method, payload) {
  try {
    return await telegram(env, method, payload);
  } catch (error) {
    console.warn(`Non-critical Telegram ${method} error`);
    return null;
  }
}
__name(safeTelegram, "safeTelegram");
function commandFrom(text) {
  return String(text).trim().split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");
}
__name(commandFrom, "commandFrom");
function isValidWebhookSecret(secret) {
  return typeof secret === "string" && /^[A-Za-z0-9_-]{16,256}$/.test(secret);
}
__name(isValidWebhookSecret, "isValidWebhookSecret");
function isAdmin(request, env) {
  if (!env.SETUP_SECRET) return false;
  return request.headers.get("authorization") === `Bearer ${env.SETUP_SECRET}`;
}
__name(isAdmin, "isAdmin");
var ReminderBot = class extends DurableObject {
  static {
    __name(this, "ReminderBot");
  }
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.queue = Promise.resolve();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS processed_updates (update_id INTEGER PRIMARY KEY, processed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_update_id INTEGER UNIQUE,
        chat_id TEXT NOT NULL, text TEXT NOT NULL, remind_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','done','cancelled')),
        created_at INTEGER NOT NULL, sending_at INTEGER, sent_at INTEGER, completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS reminders_due ON reminders(status, remind_at);
      CREATE INDEX IF NOT EXISTS reminders_by_chat ON reminders(chat_id, status, remind_at);
      CREATE TABLE IF NOT EXISTS undo_actions (
        token TEXT PRIMARY KEY, chat_id TEXT NOT NULL, reminder_id INTEGER NOT NULL,
        expected_revision INTEGER NOT NULL, snapshot TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
    `);
    const columns = new Set(this.sql.exec("PRAGMA table_info(reminders)").toArray().map((x) => x.name));
    const additions = { display_number: "INTEGER", recurrence: "TEXT", revision: "INTEGER NOT NULL DEFAULT 0" };
    for (const [name, type] of Object.entries(additions)) {
      if (!columns.has(name)) this.sql.exec(`ALTER TABLE reminders ADD COLUMN ${name} ${type}`);
    }
    this.sql.exec("UPDATE reminders SET display_number = id WHERE display_number IS NULL");
  }
  exclusive(work) {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {
    });
    return result;
  }
  first(query, ...bindings) {
    return this.sql.exec(query, ...bindings).toArray()[0] ?? null;
  }
  getSetting(key) {
    return this.first("SELECT value FROM settings WHERE key = ?", key)?.value ?? null;
  }
  setSetting(key, value) {
    this.sql.exec(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`, key, String(value), Date.now());
  }
  ownerChatId() {
    return this.getSetting("owner_chat_id");
  }
  active(row) {
    return row && ["pending", "sending", "sent"].includes(row.status);
  }
  byId(id, chatId) {
    return this.first("SELECT * FROM reminders WHERE id = ? AND chat_id = ?", id, chatId);
  }
  byNumber(number, chatId) {
    return this.first("SELECT * FROM reminders WHERE display_number = ? AND chat_id = ? AND status IN ('pending','sending','sent')", number, chatId);
  }
  allocateNumber(chatId) {
    const max = this.first("SELECT MAX(display_number) AS number FROM reminders WHERE chat_id = ? AND status IN ('pending','sending','sent')", chatId)?.number;
    const key = `reminder_number:${chatId}`;
    const number = max == null ? 1 : Math.max(Number(max), Number(this.getSetting(key) || 0)) + 1;
    this.setSetting(key, number);
    return number;
  }
  processUpdate(update) {
    return this.exclusive(async () => {
      const updateId = Number(update?.update_id);
      if (!Number.isSafeInteger(updateId)) return { ok: false };
      if (this.first("SELECT 1 AS found FROM processed_updates WHERE update_id = ?", updateId)) return { ok: true, duplicate: true };
      this.sql.exec("INSERT OR IGNORE INTO processed_updates VALUES(?,?)", updateId, Date.now());
      if (update.callback_query) await this.handleCallback(update.callback_query);
      else if (update.message) await this.handleMessage(update.message, updateId);
      this.sql.exec("DELETE FROM processed_updates WHERE update_id NOT IN (SELECT update_id FROM processed_updates ORDER BY processed_at DESC LIMIT 1000)");
      return { ok: true, duplicate: false };
    });
  }
  async requireOwner(message) {
    if (message.chat?.type && message.chat.type !== "private") return false;
    const chatId = String(message.chat.id);
    const owner = this.ownerChatId();
    if (owner) return owner === chatId;
    const start = String(message.text || "").match(/^\/start(?:@\w+)?\s+(\S+)/i);
    if (!this.env.CLAIM_CODE || start?.[1] !== this.env.CLAIM_CODE) {
      await sendText(this.env, chatId, "\u042D\u0442\u043E \u043B\u0438\u0447\u043D\u044B\u0439 \u0431\u043E\u0442. \u0414\u043B\u044F \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u0432\u0445\u043E\u0434\u0430: /start \u0422\u0412\u041E\u0419_\u041A\u041E\u0414");
      return false;
    }
    this.setSetting("owner_chat_id", chatId);
    await sendText(this.env, chatId, `\u042F \u0437\u0430\u043F\u043E\u043C\u043D\u0438\u043B \u0442\u0435\u0431\u044F.

${HELP}`);
    return false;
  }
  draft(chatId) {
    const raw = this.getSetting(`draft:${chatId}`);
    const draft = raw ? JSON.parse(raw) : null;
    return draft && draft.expires > Date.now() ? draft : null;
  }
  clearDraft(chatId) {
    this.sql.exec("DELETE FROM settings WHERE key = ?", `draft:${chatId}`);
  }
  saveDraft(chatId, value) {
    const draft = { ...value, token: crypto.randomUUID(), expires: Date.now() + DRAFT_TTL };
    this.setSetting(`draft:${chatId}`, JSON.stringify(draft));
    return draft;
  }
  timeKeyboard(token) {
    return { inline_keyboard: [
      [{ text: "\u0427\u0435\u0440\u0435\u0437 \u0447\u0430\u0441", callback_data: `time:${token}:hour` }, { text: "\u0412\u0435\u0447\u0435\u0440\u043E\u043C", callback_data: `time:${token}:evening` }],
      [{ text: "\u0417\u0430\u0432\u0442\u0440\u0430 \u0432 9:00", callback_data: `time:${token}:tomorrow` }],
      [{ text: "\u041E\u0442\u043C\u0435\u043D\u0430", callback_data: `drop:${token}` }]
    ] };
  }
  reminderKeyboard(row) {
    const key = `${row.id}:${row.revision}`;
    return { inline_keyboard: [
      [{ text: "\u2705 \u0413\u043E\u0442\u043E\u0432\u043E", callback_data: `done:${key}` }],
      [{ text: "+15 \u043C\u0438\u043D\u0443\u0442", callback_data: `s15:${key}` }, { text: "+1 \u0447\u0430\u0441", callback_data: `s60:${key}` }],
      [{ text: "\u0412\u0435\u0447\u0435\u0440\u043E\u043C", callback_data: `evening:${key}` }, { text: "\u0417\u0430\u0432\u0442\u0440\u0430", callback_data: `tomorrow:${key}` }],
      [{ text: "\u0414\u0440\u0443\u0433\u043E\u0435 \u0432\u0440\u0435\u043C\u044F", callback_data: `custom:${key}` }, { text: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C", callback_data: `cancel:${key}` }]
    ] };
  }
  describe(row) {
    return `\u2116${row.display_number}: \xAB${row.text}\xBB
${formatTokyo(Number(row.remind_at))}${row.recurrence ? `
\u{1F501} ${repeatLabel(row.recurrence)}` : ""}`;
  }
  async createReminder(chatId, parsed, sourceId) {
    let row = this.first("SELECT * FROM reminders WHERE source_update_id = ?", sourceId);
    if (!row) {
      const number = this.allocateNumber(chatId);
      this.sql.exec(
        `INSERT INTO reminders(source_update_id,chat_id,text,remind_at,created_at,display_number,recurrence)
        VALUES(?,?,?,?,?,?,?)`,
        sourceId,
        chatId,
        parsed.text,
        parsed.remindAt,
        Date.now(),
        number,
        parsed.recurrence ? JSON.stringify(parsed.recurrence) : null
      );
      row = this.first("SELECT * FROM reminders WHERE source_update_id = ?", sourceId);
    }
    await this.scheduleNextAlarm();
    await sendText(this.env, chatId, `\u0417\u0430\u043F\u043E\u043C\u043D\u0438\u043B ${this.describe(row)}

\u0415\u0441\u043B\u0438 \u0442\u044B \u0437\u0430\u0431\u0443\u0434\u0435\u0448\u044C \u2014 \u044F \u043D\u0435\u0442.`, { reply_markup: this.reminderKeyboard(row) });
    return row;
  }
  async askTime(chatId, title, sourceId, extra = {}) {
    const draft = this.saveDraft(chatId, { mode: "create", title, sourceId, ...extra });
    await sendText(this.env, chatId, `\u041A\u043E\u0433\u0434\u0430 \u043D\u0430\u043F\u043E\u043C\u043D\u0438\u0442\u044C: \xAB${title}\xBB?
\u0412\u044B\u0431\u0435\u0440\u0438 \u043A\u043D\u043E\u043F\u043A\u0443 \u0438\u043B\u0438 \u043D\u0430\u043F\u0438\u0448\u0438 \u0432\u0440\u0435\u043C\u044F, \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 \xAB\u0437\u0430\u0432\u0442\u0440\u0430 \u0432 18:00\xBB.`, { reply_markup: this.timeKeyboard(draft.token) });
  }
  async consumeDraft(chatId, draft, parsed) {
    if (draft.mode === "edit") {
      const row = this.byId(draft.id, chatId);
      if (!this.active(row) || row.revision !== draft.revision) {
        this.clearDraft(chatId);
        await sendText(this.env, chatId, "\u042D\u0442\u043E \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435 \u0443\u0436\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u043E\u0441\u044C. \u041E\u0442\u043A\u0440\u043E\u0439 /list.");
        return;
      }
      await this.changeReminder(row, {
        remind_at: parsed.remindAt,
        status: "pending",
        ...parsed.recurrence ? { recurrence: JSON.stringify(parsed.recurrence) } : {}
      }, "\u041F\u0435\u0440\u0435\u043D\u0451\u0441");
    } else {
      await this.createReminder(chatId, { ...parsed, text: draft.title }, draft.sourceId);
    }
    this.clearDraft(chatId);
  }
  async handleMessage(message, updateId) {
    if (!message?.chat?.id || !await this.requireOwner(message)) return;
    const chatId = String(message.chat.id);
    if (message.voice) {
      await this.handleVoice(message, updateId);
      return;
    }
    if (typeof message.text !== "string" || !message.text.trim()) return;
    await this.handleText(chatId, message.text.trim(), updateId, Number(message.date) * 1e3 || Date.now());
  }
  async handleText(chatId, text, sourceId, baseTime = Date.now()) {
    const command = commandFrom(text);
    if (command === "/start" || command === "/help") {
      await safeTelegram(this.env, "setMyCommands", { commands: COMMANDS });
      await sendText(this.env, chatId, HELP);
      return;
    }
    if (command === "/today" || command === "/list") {
      await sendText(this.env, chatId, this.listText(chatId, command === "/today"));
      return;
    }
    if (/^(?:отмена|\/abort(?:@\w+)?)$/iu.test(text)) {
      this.clearDraft(chatId);
      await sendText(this.env, chatId, "\u0412\u0432\u043E\u0434 \u043E\u0442\u043C\u0435\u043D\u0451\u043D. \u0421\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F.");
      return;
    }
    const page = text.match(/^\/page(?:@\w+)?\s+(\d+)(?:\s+(today))?$/i);
    if (page) {
      await sendText(this.env, chatId, this.listText(chatId, Boolean(page[2]), Math.max(0, Math.min(1e4, +page[1] - 1))));
      return;
    }
    const summary = summaryTime(text);
    if (summary) {
      if (summary.help) {
        const current = this.getSetting("summary_rule");
        await sendText(this.env, chatId, `\u0421\u0432\u043E\u0434\u043A\u0430: ${current ? this.getSetting("summary_clock") : "\u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u0430"}.
\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C: /summary 09:00
\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C: /summary off
\u0412\u0440\u0435\u043C\u044F \u042F\u043F\u043E\u043D\u0438\u0438.`);
      } else {
        this.setSetting("summary_rule", summary.off ? "" : JSON.stringify(summary));
        this.setSetting("summary_clock", summary.off ? "" : `${String(summary.hour).padStart(2, "0")}:${String(summary.minute).padStart(2, "0")}`);
        this.setSetting("summary_next", summary.off ? "" : nextOccurrence(summary, Date.now()));
        await this.scheduleNextAlarm();
        await sendText(this.env, chatId, summary.off ? "\u0421\u0432\u043E\u0434\u043A\u0430 \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u0430." : `\u0411\u0443\u0434\u0443 \u043F\u0440\u0438\u0441\u044B\u043B\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0438 \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C \u0432 ${this.getSetting("summary_clock")} \u043F\u043E \u042F\u043F\u043E\u043D\u0438\u0438.`);
      }
      return;
    }
    if (command === "/undo" || /^верни(?: последнее)?$/iu.test(text)) {
      const action = this.first("SELECT * FROM undo_actions WHERE chat_id = ? AND expires_at > ? ORDER BY rowid DESC LIMIT 1", chatId, Date.now());
      await this.undo(chatId, action?.token);
      return;
    }
    const cancel = text.match(/^(?:\/cancel(?:@\w+)?|отмени)\s*№?\s*(\d+)\s*$/iu);
    const done = text.match(/^(?:\/done(?:@\w+)?|готово)\s*№?\s*(\d+)\s*$/iu);
    if (cancel || done) {
      const number = +(cancel || done)[1];
      const row = this.byNumber(number, chatId);
      if (!row) await sendText(this.env, chatId, `\u041D\u0435 \u043D\u0430\u0448\u0451\u043B \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0435 \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435 \u2116${number}.`);
      else if (done) await this.complete(row);
      else await this.changeReminder(row, { status: "cancelled", completed_at: Date.now() }, "\u041E\u0442\u043C\u0435\u043D\u0438\u043B");
      return;
    }
    const edit = parseEdit(text);
    if (edit) {
      const row = this.byNumber(edit.number, chatId);
      if (!row) {
        await sendText(this.env, chatId, `\u041D\u0435 \u043D\u0430\u0448\u0451\u043B \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0435 \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435 \u2116${edit.number}.`);
        return;
      }
      if (edit.title) await this.changeReminder(row, { text: edit.title }, "\u0418\u0437\u043C\u0435\u043D\u0438\u043B \u0442\u0435\u043A\u0441\u0442");
      else {
        const parsed2 = parseInput(edit.time, Date.now());
        if (!parsed2.ok) {
          await sendText(this.env, chatId, parsed2.error);
          return;
        }
        await this.changeReminder(row, {
          remind_at: parsed2.remindAt,
          status: "pending",
          ...parsed2.recurrence ? { recurrence: JSON.stringify(parsed2.recurrence) } : {}
        }, "\u041F\u0435\u0440\u0435\u043D\u0451\u0441");
      }
      return;
    }
    if (text.startsWith("/")) {
      await sendText(this.env, chatId, "\u041A\u043E\u043C\u0430\u043D\u0434\u044B \u0438 \u043F\u0440\u0438\u043C\u0435\u0440\u044B: /help");
      return;
    }
    const parsed = parseInput(text, baseTime);
    const draft = this.draft(chatId);
    if (draft && draft.mode !== "voice" && parsed.ok && parsed.text === "\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435") {
      await this.consumeDraft(chatId, draft, parsed);
    } else if (parsed.ok) {
      this.clearDraft(chatId);
      await this.createReminder(chatId, parsed, sourceId);
    } else if (parsed.needsTime && !draft) {
      await this.askTime(chatId, parsed.text, sourceId);
    } else if (parsed.needsTime && draft) {
      await sendText(this.env, chatId, "\u0416\u0434\u0443 \u0432\u0440\u0435\u043C\u044F \u0434\u043B\u044F \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0433\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F. \u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 \xAB\u0437\u0430\u0432\u0442\u0440\u0430 \u0432 18:00\xBB. \u0427\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u043D\u043E\u0432\u043E, \u043D\u0430\u043F\u0438\u0448\u0438 \xAB\u043E\u0442\u043C\u0435\u043D\u0430\xBB.");
    } else await sendText(this.env, chatId, parsed.error);
  }
  async handleVoice(message, sourceId) {
    const chatId = String(message.chat.id);
    if (!this.env.AI) {
      await sendText(this.env, chatId, "\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u0435 \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u044B\u0445 \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E. \u041D\u0430\u043F\u0438\u0448\u0438 \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435 \u0442\u0435\u043A\u0441\u0442\u043E\u043C.");
      return;
    }
    if (message.voice.duration > 120 || message.voice.file_size > 4 * 1024 * 1024) {
      await sendText(this.env, chatId, "\u041F\u0440\u0438\u0448\u043B\u0438 \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0435 \u0434\u043E 2 \u043C\u0438\u043D\u0443\u0442 \u0438 4 \u041C\u0411.");
      return;
    }
    try {
      const file = await telegram(this.env, "getFile", { file_id: message.voice.file_id });
      if (file.file_size > 4 * 1024 * 1024 || !/^[\w/.-]+$/.test(file.file_path || "") || file.file_path.includes("..")) throw new Error("Invalid voice file");
      const response = await fetch(`https://api.telegram.org/file/bot${this.env.BOT_TOKEN}/${file.file_path}`, { signal: AbortSignal.timeout(2e4) });
      if (!response.ok) throw new Error("Voice download failed");
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 4 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Voice too large");
        }
        chunks.push(value);
      }
      let binary = "";
      for (const chunk of chunks) for (let i = 0; i < chunk.length; i += 8192) binary += String.fromCharCode(...chunk.subarray(i, i + 8192));
      const result = await this.env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: btoa(binary), task: "transcribe", vad_filter: true });
      const text = String(result.text || "").trim().slice(0, 1e3);
      if (!text) {
        await sendText(this.env, chatId, "\u041D\u0435 \u0440\u0430\u0441\u0441\u043B\u044B\u0448\u0430\u043B. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0435\u0449\u0451 \u0440\u0430\u0437 \u0438\u043B\u0438 \u043D\u0430\u043F\u0438\u0448\u0438 \u0442\u0435\u043A\u0441\u0442\u043E\u043C.");
        return;
      }
      const draft = this.saveDraft(chatId, { mode: "voice", title: text, sourceId, baseTime: Number(message.date) * 1e3 || Date.now() });
      await sendText(this.env, chatId, `\u{1F399}\uFE0F \u042F \u0443\u0441\u043B\u044B\u0448\u0430\u043B:
\xAB${text}\xBB

\u0412\u0441\u0451 \u0432\u0435\u0440\u043D\u043E?`, { reply_markup: { inline_keyboard: [
        [{ text: "\u0414\u0430, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C", callback_data: `voice:${draft.token}` }, { text: "\u041E\u0442\u043C\u0435\u043D\u0430", callback_data: `drop:${draft.token}` }]
      ] } });
    } catch {
      await sendText(this.env, chatId, "\u0421\u0435\u0439\u0447\u0430\u0441 \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0442\u044C \u0433\u043E\u043B\u043E\u0441. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0435\u0449\u0451 \u0440\u0430\u0437 \u0438\u043B\u0438 \u043D\u0430\u043F\u0438\u0448\u0438 \u0442\u0435\u043A\u0441\u0442\u043E\u043C.");
    }
  }
  async changeReminder(row, changes, label) {
    const current = this.byId(row.id, row.chat_id);
    if (!this.active(current) || current.revision !== row.revision) return;
    const next = { ...row, ...changes, revision: row.revision + 1 };
    if (changes.status === "pending") {
      next.sending_at = null;
      next.sent_at = null;
      next.completed_at = null;
    }
    const token = crypto.randomUUID();
    this.sql.exec(`INSERT INTO undo_actions VALUES(?,?,?,?,?,?)`, token, row.chat_id, row.id, next.revision, JSON.stringify(row), Date.now() + 24 * 36e5);
    this.sql.exec(
      `UPDATE reminders SET text=?,remind_at=?,status=?,recurrence=?,revision=?,sending_at=?,sent_at=?,completed_at=? WHERE id=?`,
      next.text,
      next.remind_at,
      next.status,
      next.recurrence,
      next.revision,
      next.sending_at,
      next.sent_at,
      next.completed_at,
      next.id
    );
    await this.scheduleNextAlarm();
    const keyboard = this.active(next) ? this.reminderKeyboard(next).inline_keyboard : [];
    keyboard.push([{ text: "\u21A9\uFE0F \u0412\u0435\u0440\u043D\u0443\u0442\u044C", callback_data: `undo:${token}` }]);
    await sendText(this.env, row.chat_id, `${label} ${this.describe(next)}${row.recurrence && changes.status === "pending" && label === "\u0413\u043E\u0442\u043E\u0432\u043E. \u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043F\u043E\u0432\u0442\u043E\u0440" ? "\n\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430." : ""}`, { reply_markup: { inline_keyboard: keyboard } });
    return next;
  }
  async complete(row) {
    if (row.recurrence) {
      return this.changeReminder(row, { status: "pending", remind_at: nextOccurrence(JSON.parse(row.recurrence), Math.max(Date.now(), row.remind_at)) }, "\u0413\u043E\u0442\u043E\u0432\u043E. \u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043F\u043E\u0432\u0442\u043E\u0440");
    }
    return this.changeReminder(row, { status: "done", completed_at: Date.now() }, "\u2705 \u0413\u043E\u0442\u043E\u0432\u043E");
  }
  async undo(chatId, token) {
    const action = token && this.first("SELECT * FROM undo_actions WHERE token = ? AND chat_id = ? AND expires_at > ?", token, chatId, Date.now());
    const current = action && this.byId(action.reminder_id, chatId);
    if (!action || !current || current.revision !== action.expected_revision) {
      await sendText(this.env, chatId, "\u042D\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0443\u0436\u0435 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u043E, \u0443\u0441\u0442\u0430\u0440\u0435\u043B\u043E \u0438\u043B\u0438 \u0437\u0430\u0434\u0430\u0447\u0430 \u043F\u043E\u0441\u043B\u0435 \u043D\u0435\u0433\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0430\u0441\u044C.");
      return;
    }
    const old = JSON.parse(action.snapshot);
    let number = old.display_number;
    const collision = this.byNumber(number, chatId);
    if (collision && collision.id !== old.id) number = this.allocateNumber(chatId);
    this.sql.exec(
      `UPDATE reminders SET text=?,remind_at=?,status='pending',recurrence=?,revision=?,display_number=?,sending_at=NULL,sent_at=NULL,completed_at=NULL WHERE id=?`,
      old.text,
      old.remind_at,
      old.recurrence,
      current.revision + 1,
      number,
      old.id
    );
    this.sql.exec("DELETE FROM undo_actions WHERE token = ?", token);
    await this.scheduleNextAlarm();
    const restored = this.byId(old.id, chatId);
    await sendText(this.env, chatId, `\u0412\u0435\u0440\u043D\u0443\u043B ${this.describe(restored)}`, { reply_markup: this.reminderKeyboard(restored) });
  }
  listText(chatId, todayOnly, page = 0) {
    const bounds = tokyoDayBounds(Date.now());
    const filter = `chat_id = ? AND status IN ('pending','sending','sent')${todayOnly ? " AND remind_at >= ? AND remind_at < ?" : ""}`;
    const args = todayOnly ? [chatId, bounds.start, bounds.end] : [chatId];
    const count = this.first(`SELECT COUNT(*) AS count FROM reminders WHERE ${filter}`, ...args).count;
    const rows = this.sql.exec(`SELECT * FROM reminders WHERE ${filter} ORDER BY CASE WHEN status='sent' THEN 0 ELSE 1 END,remind_at,id LIMIT 10 OFFSET ?`, ...args, page * 10).toArray();
    if (!rows.length) return todayOnly ? "\u041D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u2014 \u0442\u0438\u0448\u0438\u043D\u0430." : "\u042F \u043F\u043E\u043A\u0430 \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0436\u0434\u0443.";
    const lines = rows.map((row) => `${row.status === "sent" ? "\u{1F514}" : "\xB7"} \u2116${row.display_number} \u2014 ${formatTokyo(row.remind_at)} \u2014 ${row.text.slice(0, 180)}${row.text.length > 180 ? "\u2026" : ""}${row.recurrence ? ` [\u{1F501} ${repeatLabel(row.recurrence)}]` : ""}`);
    return `${todayOnly ? "\u0421\u0435\u0433\u043E\u0434\u043D\u044F" : "\u042F \u043F\u043E\u043C\u043D\u044E"} (${count}):

${lines.join("\n")}

${count > (page + 1) * 10 ? `\u0414\u0430\u043B\u044C\u0448\u0435: /page ${page + 2}${todayOnly ? " today" : ""}
` : ""}\u041F\u0435\u0440\u0435\u043D\u043E\u0441: \xAB\u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0438 \u21163 \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430\xBB. \u0413\u043E\u0442\u043E\u0432\u043E: /done 3`;
  }
  async handleCallback(callback) {
    const chatId = String(callback.message?.chat?.id || "");
    const answer = /* @__PURE__ */ __name((text) => safeTelegram(this.env, "answerCallbackQuery", { callback_query_id: callback.id, ...text ? { text } : {} }), "answer");
    if (!chatId || chatId !== this.ownerChatId()) {
      await answer("\u041D\u0435 \u0434\u043B\u044F \u0442\u0435\u0431\u044F.");
      return;
    }
    const data = String(callback.data || "");
    const undo = data.match(/^undo:([\w-]+)$/);
    if (undo) {
      await answer();
      await this.undo(chatId, undo[1]);
      return;
    }
    const draftAction = data.match(/^(time|drop|voice):([\w-]+)(?::(hour|evening|tomorrow))?$/);
    if (draftAction) {
      const draft = this.draft(chatId);
      if (!draft || draft.token !== draftAction[2]) {
        await answer("\u042D\u0442\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0443\u0436\u0435 \u0443\u0441\u0442\u0430\u0440\u0435\u043B\u043E.");
        return;
      }
      await answer();
      if (draftAction[1] === "drop") {
        this.clearDraft(chatId);
        await sendText(this.env, chatId, "\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E.");
      } else if (draftAction[1] === "voice" && draft.mode === "voice") {
        this.clearDraft(chatId);
        await this.handleText(chatId, draft.title, draft.sourceId, Math.max(draft.baseTime, Date.now()));
      } else if (draftAction[1] === "time" && draft.mode !== "voice") {
        const input = { hour: "\u0447\u0435\u0440\u0435\u0437 \u0447\u0430\u0441", evening: "\u0432\u0435\u0447\u0435\u0440\u043E\u043C", tomorrow: "\u0437\u0430\u0432\u0442\u0440\u0430 \u0432 9:00" }[draftAction[3]];
        const parsed = parseInput(input);
        if (parsed.ok) await this.consumeDraft(chatId, draft, parsed);
      }
      return;
    }
    const match = data.match(/^(done|s15|s60|evening|tomorrow|custom|cancel):(\d+)(?::(\d+))?$/);
    if (!match) {
      await answer();
      return;
    }
    const row = this.byId(+match[2], chatId);
    if (!this.active(row) || row.revision !== Number(match[3] || 0)) {
      await answer("\u0423\u0436\u0435 \u0441\u0434\u0435\u043B\u0430\u043D\u043E \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0435\u043D\u043E. \u041E\u0442\u043A\u0440\u043E\u0439 \u043D\u043E\u0432\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435.");
      return;
    }
    await answer();
    const action = match[1];
    if (action === "custom") {
      await this.askTime(chatId, row.text, null, { mode: "edit", id: row.id, revision: row.revision });
      return;
    }
    if (action === "done") await this.complete(row);
    else if (action === "cancel") await this.changeReminder(row, { status: "cancelled", completed_at: Date.now() }, "\u041E\u0442\u043C\u0435\u043D\u0438\u043B");
    else {
      const input = { s15: "\u0447\u0435\u0440\u0435\u0437 15 \u043C\u0438\u043D\u0443\u0442", s60: "\u0447\u0435\u0440\u0435\u0437 \u0447\u0430\u0441", evening: "\u0432\u0435\u0447\u0435\u0440\u043E\u043C", tomorrow: "\u0437\u0430\u0432\u0442\u0440\u0430 \u0432 9:00" }[action];
      await this.changeReminder(row, { status: "pending", remind_at: parseInput(input).remindAt }, "\u041F\u0435\u0440\u0435\u043D\u0451\u0441");
    }
    await safeTelegram(this.env, "editMessageReplyMarkup", { chat_id: chatId, message_id: callback.message.message_id, reply_markup: { inline_keyboard: [] } });
  }
  async scheduleNextAlarm(minimumDelayMs = 0) {
    const pending = this.first("SELECT MIN(remind_at) AS time FROM reminders WHERE status='pending'")?.time;
    const sending = this.first("SELECT MIN(sending_at + 300000) AS time FROM reminders WHERE status='sending'")?.time;
    const summary = this.getSetting("summary_rule") ? Number(this.getSetting("summary_next")) : null;
    const times = [pending, sending, summary].filter((t) => t != null && Number.isFinite(t) && t > 0);
    if (!times.length) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.max(Math.min(...times), Date.now() + minimumDelayMs));
  }
  alarm() {
    return this.exclusive(() => this.runAlarm());
  }
  async runAlarm() {
    const now = Date.now();
    this.sql.exec("UPDATE reminders SET status='pending',sending_at=NULL WHERE status='sending' AND sending_at <= ?", now - 3e5);
    const due = this.sql.exec("SELECT * FROM reminders WHERE status='pending' AND remind_at <= ? ORDER BY remind_at,id LIMIT 50", now).toArray();
    await this.ctx.storage.setAlarm(now + 3e5);
    let failed = false;
    for (const row of due) {
      this.sql.exec("UPDATE reminders SET status='sending',sending_at=? WHERE id=? AND status='pending'", Date.now(), row.id);
      try {
        await sendText(this.env, row.chat_id, `\u23F0 ${this.describe(row)}

\u0422\u044B \u043F\u0440\u043E\u0441\u0438\u043B \u043C\u0435\u043D\u044F \u043D\u0435 \u0437\u0430\u0431\u044B\u0442\u044C.`, { reply_markup: this.reminderKeyboard(row) });
        this.sql.exec("UPDATE reminders SET status='sent',sent_at=?,sending_at=NULL WHERE id=? AND status='sending'", Date.now(), row.id);
      } catch {
        failed = true;
        this.sql.exec("UPDATE reminders SET status='pending',sending_at=NULL WHERE id=? AND status='sending'", row.id);
      }
    }
    const rule = this.getSetting("summary_rule");
    if (rule && Number(this.getSetting("summary_next")) <= Date.now() && this.ownerChatId()) {
      try {
        await sendText(this.env, this.ownerChatId(), `\u2600\uFE0F \u0421\u0432\u043E\u0434\u043A\u0430 \u043D\u0430 \u0434\u0435\u043D\u044C

${this.listText(this.ownerChatId(), true)}`);
        this.setSetting("summary_next", nextOccurrence(JSON.parse(rule), Date.now()));
      } catch {
        failed = true;
      }
    }
    this.sql.exec("DELETE FROM reminders WHERE status IN ('done','cancelled') AND completed_at < ?", now - 90 * 864e5);
    this.sql.exec("DELETE FROM undo_actions WHERE expires_at < ?", now);
    await this.scheduleNextAlarm(failed ? 3e4 : 0);
  }
  status() {
    return { claimed: Boolean(this.ownerChatId()), active_reminders: this.first("SELECT COUNT(*) AS count FROM reminders WHERE status IN ('pending','sending','sent')").count, database_bytes: this.sql.databaseSize, version: "2.0.0", voice_enabled: Boolean(this.env.AI), summary_enabled: Boolean(this.getSetting("summary_rule")) };
  }
};
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
__name(setupWebhook, "setupWebhook");
async function adminStatus(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const webhook = await telegram(env, "getWebhookInfo");
  const bot = env.REMINDER_BOT.getByName("primary");
  const storage = await bot.status();
  return json({ ok: true, webhook, storage });
}
__name(adminStatus, "adminStatus");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return json({ ok: true, name: "\u042F \u043F\u043E\u043C\u043D\u044E", time_zone: "Asia/Tokyo" });
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
      console.error("Request failed");
      return json({ ok: false, error: "internal_error" }, 500);
    }
  }
};
export {
  ReminderBot,
  index_default as default
};

