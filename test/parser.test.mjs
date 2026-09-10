import assert from "node:assert/strict";
import test from "node:test";
import { epochFromTokyo, parseReminder, tokyoDayBounds, tokyoParts } from "../src/parser.js";

const EVENING = Date.parse("2026-09-09T12:00:00.000Z"); // 21:00 в Токио
const NIGHT = Date.parse("2026-09-09T17:35:00.000Z"); // 02:35 10 сентября в Токио

test("понимает минуты от текущего момента", () => {
  const result = parseReminder("через 15 минут поесть", EVENING);
  assert.equal(result.ok, true);
  assert.equal(result.text, "поесть");
  assert.equal(result.remindAt, EVENING + 15 * 60 * 1000);
});

test("понимает длительность после задачи", () => {
  const result = parseReminder("написать фотографу через два часа", EVENING);
  assert.equal(result.ok, true);
  assert.equal(result.text, "написать фотографу");
  assert.equal(result.remindAt, EVENING + 2 * 60 * 60 * 1000);
});

test("понимает через час без числа", () => {
  const result = parseReminder("напомни мне проверить стирку через час", EVENING);
  assert.equal(result.ok, true);
  assert.equal(result.text, "проверить стирку");
  assert.equal(result.remindAt, EVENING + 60 * 60 * 1000);
});

test("понимает полчаса и полтора часа", () => {
  assert.equal(parseReminder("через полчаса чай", EVENING).remindAt, EVENING + 30 * 60 * 1000);
  assert.equal(parseReminder("через полтора часа чай", EVENING).remindAt, EVENING + 90 * 60 * 1000);
});

test("понимает десятичное количество", () => {
  const result = parseReminder("через 1,5 часа выйти", EVENING);
  assert.equal(result.ok, true);
  assert.equal(result.remindAt, EVENING + 90 * 60 * 1000);
});

test("понимает завтра утром с явным часом", () => {
  const result = parseReminder("завтра в 9 утра съёмка", EVENING);
  assert.equal(result.ok, true);
  assert.equal(result.text, "съёмка");
  assert.equal(result.remindAt, Date.parse("2026-09-10T00:00:00.000Z"));
});

test("понимает час без минут", () => {
  const result = parseReminder("завтра в 9 съёмка", EVENING);
  assert.equal(result.ok, true);
  assert.equal(result.text, "съёмка");
  assert.equal(result.remindAt, Date.parse("2026-09-10T00:00:00.000Z"));
});

test("понимает разговорное 'утром'", () => {
  const result = parseReminder("утром выпить чай", NIGHT);
  assert.equal(result.ok, true);
  assert.equal(result.text, "выпить чай");
  assert.equal(result.remindAt, Date.parse("2026-09-10T00:00:00.000Z"));
});

test("переносит 'утром' на завтра, если утро прошло", () => {
  const result = parseReminder("утром выпить чай", EVENING);
  assert.equal(result.ok, true);
  assert.equal(result.remindAt, Date.parse("2026-09-10T00:00:00.000Z"));
});

test("понимает день, вечер и ночь", () => {
  assert.equal(
    parseReminder("завтра днём поесть", EVENING).remindAt,
    Date.parse("2026-09-10T05:00:00.000Z")
  );
  assert.equal(
    parseReminder("завтра вечером написать", EVENING).remindAt,
    Date.parse("2026-09-10T10:00:00.000Z")
  );
  assert.equal(
    parseReminder("завтра ночью проверить", EVENING).remindAt,
    Date.parse("2026-09-10T14:00:00.000Z")
  );
});

test("понимает разговорный период после часа", () => {
  const result = parseReminder("завтра в 7 вечером позвонить", EVENING);
  assert.equal(result.ok, true);
  assert.equal(result.text, "позвонить");
  assert.equal(result.remindAt, Date.parse("2026-09-10T10:00:00.000Z"));
});

test("использует сегодня, когда время ещё впереди", () => {
  const result = parseReminder("сегодня в 9:00 выпить чай", NIGHT);
  assert.equal(result.ok, true);
  assert.equal(result.text, "выпить чай");
  assert.equal(result.remindAt, Date.parse("2026-09-10T00:00:00.000Z"));
});

test("использует завтра, когда голое время уже прошло", () => {
  const result = parseReminder("в 20:00 купить еду", EVENING);
  assert.equal(result.ok, true);
  assert.equal(result.remindAt, Date.parse("2026-09-10T11:00:00.000Z"));
});

test("использует 09:00 для дня без времени", () => {
  const result = parseReminder("завтра позвонить маме", EVENING);
  assert.equal(result.ok, true);
  assert.equal(result.text, "позвонить маме");
  assert.equal(result.remindAt, Date.parse("2026-09-10T00:00:00.000Z"));
});

test("отклоняет явно прошедшее время сегодня", () => {
  const result = parseReminder("сегодня в 18:30 купить еду", EVENING);
  assert.equal(result.ok, false);
  assert.match(result.error, /уже прошло/);
});

test("отклоняет невозможное время", () => {
  const result = parseReminder("завтра в 28:75 телепортироваться", EVENING);
  assert.equal(result.ok, false);
  assert.match(result.error, /не бывает/);
});

test("не принимает сообщение без времени", () => {
  const result = parseReminder("просто выпить чай", EVENING);
  assert.equal(result.ok, false);
  assert.match(result.error, /Не понял время/);
});

test("границы токийского дня не зависят от UTC", () => {
  assert.deepEqual(tokyoParts(EVENING), {
    year: 2026,
    month: 9,
    day: 9,
    hour: 21,
    minute: 0,
    weekday: 3
  });
  assert.deepEqual(tokyoDayBounds(EVENING), {
    start: epochFromTokyo(2026, 9, 9),
    end: epochFromTokyo(2026, 9, 10)
  });
});
