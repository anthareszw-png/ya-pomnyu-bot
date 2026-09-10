const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

const NUMBER_WORDS = new Map([
  ["один", 1],
  ["одну", 1],
  ["два", 2],
  ["две", 2],
  ["три", 3],
  ["четыре", 4],
  ["пять", 5],
  ["шесть", 6],
  ["семь", 7],
  ["восемь", 8],
  ["девять", 9],
  ["десять", 10],
  ["пятнадцать", 15],
  ["двадцать", 20],
  ["тридцать", 30],
  ["сорок", 40]
]);

const DAYPARTS = {
  утром: { hour: 9, minute: 0 },
  днем: { hour: 14, minute: 0 },
  "днём": { hour: 14, minute: 0 },
  вечером: { hour: 19, minute: 0 },
  ночью: { hour: 23, minute: 0 }
};

function numberFromToken(token) {
  const normalized = String(token).toLowerCase().replace(",", ".");
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  return NUMBER_WORDS.get(normalized) ?? null;
}

export function tokyoParts(epochMs) {
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

export function epochFromTokyo(year, month, day, hour = 0, minute = 0) {
  return Date.UTC(year, month - 1, day, hour, minute) - TOKYO_OFFSET_MS;
}

function addTokyoDays(parts, amount) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

export function tokyoDayBounds(epochMs) {
  const parts = tokyoParts(epochMs);
  const start = epochFromTokyo(parts.year, parts.month, parts.day);
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function cleanReminderText(input) {
  const cleaned = String(input)
    .replace(/^\s*(?:пожалуйста[,.]?\s*)?(?:напомни(?:\s+мне)?|напоминание)\s*[:,-]?\s*/i, "")
    .replace(/^[\s,;:—-]+|[\s,;:—-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return (cleaned || "Напоминание").slice(0, 500);
}

function normalizeHour(hour, period) {
  if (!period) return hour;
  const word = period.toLowerCase();
  if (word === "утра" || word === "утром") return hour === 12 ? 0 : hour;
  if (["дня", "днем", "днём", "вечера", "вечером"].includes(word)) {
    return hour < 12 ? hour + 12 : hour;
  }
  if (word === "ночи" || word === "ночью") return hour === 12 ? 0 : hour;
  return hour;
}

function relativeDuration(match) {
  const special = match.groups?.special?.toLowerCase();
  if (special === "полчаса") return 30 * 60 * 1000;
  if (special === "час" || special === "часик") return 60 * 60 * 1000;
  if (special === "полтора часа" || special === "полторы часа") return 90 * 60 * 1000;

  const amount = numberFromToken(match.groups?.amount);
  const unit = String(match.groups?.unit || "").toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit.startsWith("м")) return amount * 60 * 1000;
  if (unit.startsWith("ч")) return amount * 60 * 60 * 1000;
  if (unit.startsWith("д") || unit.startsWith("сут")) return amount * 24 * 60 * 60 * 1000;
  return null;
}

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

/**
 * Разбирает короткое русское напоминание относительно времени отправки.
 * Все календарные значения трактуются в часовом поясе Asia/Tokyo.
 */
export function parseReminder(input, nowMs = Date.now()) {
  const original = String(input || "").trim();
  if (!original) return { ok: false, error: "Напиши, что и когда напомнить." };

  const relativePattern = /(?<![\p{L}\p{N}])через\s+(?:(?<special>полчаса|полтор[аы]\s+часа|часик|час)|(?<amount>\d+(?:[.,]\d+)?|один|одну|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|пятнадцать|двадцать|тридцать|сорок)\s*(?<unit>минут(?:у|ы)?|мин|м|час(?:а|ов)?|ч|день|дня|дней|сутки|суток))(?![\p{L}\p{N}])/iu;
  const relativeMatch = original.match(relativePattern);

  if (relativeMatch) {
    const duration = relativeDuration(relativeMatch);
    if (!duration) return { ok: false, error: "Не получилось понять длительность." };
    const text = cleanReminderText(original.replace(relativeMatch[0], ""));
    return { ok: true, text, remindAt: Math.round(nowMs + duration), kind: "relative" };
  }

  const dayMatch = original.match(/(?<![\p{L}\p{N}])(сегодня|послезавтра|завтра)(?![\p{L}\p{N}])/iu);
  const dayWord = dayMatch?.[1]?.toLowerCase() ?? null;
  const timeMatch = findExplicitTime(original);
  const daypartMatch = timeMatch
    ? null
    : original.match(/(?<![\p{L}\p{N}])(утром|дн[её]м|вечером|ночью)(?![\p{L}\p{N}])/iu);

  if (!timeMatch && !daypartMatch && !dayWord) {
    return {
      ok: false,
      error: "Не понял время. Например: «через час поесть», «утром выпить чай» или «завтра в 9:30 съёмка»."
    };
  }

  const now = tokyoParts(nowMs);
  const dayShift = dayWord === "послезавтра" ? 2 : dayWord === "завтра" ? 1 : 0;
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
    return { ok: false, error: "Такого времени не бывает. Проверь часы и минуты." };
  }

  let remindAt = epochFromTokyo(date.year, date.month, date.day, hour, minute);
  if (!dayWord && remindAt <= nowMs) {
    date = addTokyoDays(now, 1);
    remindAt = epochFromTokyo(date.year, date.month, date.day, hour, minute);
  } else if (dayWord === "сегодня" && remindAt <= nowMs) {
    return { ok: false, error: "Это время сегодня уже прошло." };
  }

  let textSource = original;
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

export function formatTokyo(epochMs) {
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
