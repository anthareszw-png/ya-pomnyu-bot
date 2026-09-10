# Безопасность

## Модель доступа

- Worker принимает Telegram updates только на `POST /telegram` и только с корректным заголовком `X-Telegram-Bot-Api-Secret-Token`.
- Первый пользователь, приславший правильный `CLAIM_CODE`, сохраняется как владелец. После этого сообщения других chat ID игнорируются.
- Повторный Telegram `update_id` не выполняется второй раз.
- `POST /admin/setup` и `GET /admin/status` защищены отдельным `SETUP_SECRET`.
- Публичные `GET /` и `GET /health` не читают и не возвращают пользовательские данные.

## Секреты

`BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SETUP_SECRET` и `CLAIM_CODE` должны храниться в Cloudflare Variables and Secrets с типом **Secret**.

Никогда не добавляйте реальные значения в:

- исходный код;
- `.dev.vars.example`;
- GitHub Actions logs;
- issues, pull requests и скриншоты.

Локальный `.dev.vars` исключён через `.gitignore`.

## Если секрет утёк

1. Для `BOT_TOKEN`: отзовите токен через `@BotFather`, выпустите новый и замените Cloudflare Secret.
2. Для `TELEGRAM_WEBHOOK_SECRET`: создайте новое значение, замените Secret и снова откройте `/setup`.
3. Для `SETUP_SECRET`: замените его в Cloudflare; webhook перенастраивать не нужно.
4. Для `CLAIM_CODE`: если владелец уже закреплён, код больше не позволяет захватить бота. Всё равно замените его при подозрении на утечку.

## Данные

В SQLite сохраняются только:

- Telegram chat ID владельца;
- текст и время напоминаний;
- служебные статусы;
- последние Telegram update ID для защиты от дублей.

Бот не запрашивает доступ к Gmail, Google Drive, фотографиям, контактам или другим чатам Telegram.

## Сообщить об уязвимости

Не публикуйте токены или рабочие exploit-детали в публичном issue. Сначала отзовите затронутые секреты, затем свяжитесь с владельцем репозитория приватным способом.
