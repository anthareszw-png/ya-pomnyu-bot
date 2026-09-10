# «Я помню» 🤖

Личный Telegram-бот для напоминаний обычными русскими фразами. Работает круглосуточно на Cloudflare Workers, хранит данные в SQLite внутри Durable Object и использует время Японии (`Asia/Tokyo`).

```text
через 40 минут поесть
утром выпить чай
завтра вечером написать фотографу
сегодня в 18:00 купить еду
```

Когда наступает время, бот присылает кнопки **«Готово»**, **«+15 минут»** и **«+1 час»**.

## Почему эта версия надёжнее

- Каждый Telegram `update_id` сохраняется и обрабатывается только один раз — повторный webhook не создаст дубликаты.
- Напоминания будят Durable Object собственным Alarm, поэтому не нужен ежеминутный cron.
- SQLite и Alarm создаются вместе с Worker: отдельную базу данных настраивать не требуется.
- Telegram-токен и личные коды хранятся только в зашифрованных Cloudflare Secrets, а не в GitHub.
- После первого входа бот привязывается к одному Telegram chat ID и молча игнорирует остальных.

Durable Objects с SQLite доступны на Workers Free plan; для одного личного бота бесплатных лимитов более чем достаточно: [официальные лимиты и цены](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Запуск через GitHub и Cloudflare

### 0. Опубликуйте проект через GitHub Desktop

Если вы получили проект архивом от ChatGPT:

1. Скачайте и установите [GitHub Desktop](https://desktop.github.com/download/), затем войдите в свой GitHub-аккаунт.
2. Распакуйте архив `ya-pomnyu-bot.zip`.
3. В GitHub Desktop нажмите **File → Add Local Repository → Choose** и выберите распакованную папку `ya-pomnyu-bot`.
4. Нажмите **Publish repository**.
5. Оставьте имя `ya-pomnyu-bot`, снимите галочку **Keep this code private** и снова нажмите **Publish repository**.

Токен Telegram в проект не входит: публичный репозиторий безопасен, пока секреты добавляются только в Cloudflare.

### 1. Импортируйте репозиторий

1. Создайте бесплатный аккаунт [Cloudflare](https://dash.cloudflare.com/sign-up).
2. Откройте **Workers & Pages → Create application → Import a repository**.
3. Подключите GitHub и выберите этот репозиторий.
4. Имя Worker оставьте `ya-pomnyu-bot`.
5. Build command: `npm test`.
6. Deploy command: `npx wrangler deploy`.
7. Нажмите **Deploy**.

После подключения каждый push в основную ветку будет автоматически публиковать новую версию. Это штатная интеграция Cloudflare: [документация Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/).

### 2. Добавьте четыре секрета

В Cloudflare откройте Worker → **Settings → Variables and Secrets → Add** и создайте:

| Имя | Что вставить |
|---|---|
| `BOT_TOKEN` | Токен от [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_WEBHOOK_SECRET` | Случайная строка минимум из 16 латинских букв и цифр |
| `SETUP_SECRET` | Другая длинная случайная строка |
| `CLAIM_CODE` | Личный код первого входа в Telegram |

Для трёх последних значений можно получить безопасные строки в Терминале MacBook:

```bash
openssl rand -hex 24
```

Запустите команду три раза и сохраните каждую строку в менеджере паролей. Все четыре переменные добавляйте именно как **Secret**, не как обычный текстовый Variable.

После добавления секретов нажмите **Deploy** ещё раз, если Cloudflare не сделал это автоматически.

### 3. Подключите webhook

Cloudflare покажет адрес вида:

```text
https://ya-pomnyu-bot.ВАШ-ПОДДОМЕН.workers.dev
```

Откройте в браузере:

```text
https://ya-pomnyu-bot.ВАШ-ПОДДОМЕН.workers.dev/setup
```

Вставьте значение `SETUP_SECRET` и нажмите **«Подключить Telegram»**. Затем напишите своему боту:

```text
/start ВАШ_CLAIM_CODE
```

Первый правильный код навсегда привяжет эту установку к вашему Telegram chat ID.

> Новый webhook автоматически заменит старый адрес Google Apps Script. Старый Apps Script после этого можно удалить.

## Команды

| Команда | Действие |
|---|---|
| `/today` | Напоминания на сегодня |
| `/list` | Ближайшие активные напоминания |
| `/cancel 12` | Отменить напоминание №12 |
| `/help` | Показать примеры |

Слова без точного часа получают удобное время по умолчанию:

| Фраза | Время |
|---|---:|
| `утром` | 09:00 |
| `днём` | 14:00 |
| `вечером` | 19:00 |
| `ночью` | 23:00 |
| `завтра` без времени | 09:00 |

Если просто указан час и он сегодня уже прошёл, бот выбирает завтра. Если написано именно `сегодня`, прошедшее время будет отклонено.

## Локальная проверка на MacBook

Понадобится Node.js 20 или новее.

```bash
npm install
npm test
npx wrangler dev
```

Для локального запуска скопируйте `.dev.vars.example` в `.dev.vars` и заполните тестовыми значениями. `.dev.vars` исключён из Git.

Публикация через Терминал вместо Git-интеграции:

```bash
npx wrangler login
npm run deploy
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put SETUP_SECRET
npx wrangler secret put CLAIM_CODE
```

Затем откройте `/setup` или выполните:

```bash
npm run setup -- https://ya-pomnyu-bot.ВАШ-ПОДДОМЕН.workers.dev
```

## Проверка состояния

- `GET /health` — безопасная публичная проверка, что Worker работает.
- `GET /admin/status` с заголовком `Authorization: Bearer SETUP_SECRET` — статус webhook и число активных напоминаний.

## Безопасность

Не публикуйте и не присылайте сообщениями:

- токен `BOT_TOKEN`;
- значения `SETUP_SECRET`, `CLAIM_CODE` и `TELEGRAM_WEBHOOK_SECRET`;
- скриншоты страницы Cloudflare Variables and Secrets.

Если токен BotFather утёк, немедленно отзовите его в `@BotFather`, создайте новый и замените `BOT_TOKEN` в Cloudflare.

Подробнее: [SECURITY.md](SECURITY.md).

## Разработка

```bash
npm test
npm run check
```

Тесты проверяют относительное время, токийский календарь, прошедшие часы и разговорные фразы вроде `утром выпить чай`.
