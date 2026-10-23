# DLauncher

Лаунчер Minecraft для сервера «Анархия»: вход по нику, любые версии, Fabric / Quilt / Forge / NeoForge,
моды, модпаки, ресурспаки и шейдеры из Modrinth, 3D-скины, новости и быстрый вход на сервер.

**Скачать:** [последний релиз](https://github.com/Daler2010/dlauncher/releases/latest) → `DLauncher-Setup-*.exe`.
Лаунчер обновляется сам.

## Разработка

```bash
npm install
npm run dev        # запуск с горячей перезагрузкой
npm run typecheck
npm run build:win  # установщик в dist/
npm run release    # сборка и публикация в GitHub Releases (нужен GH_TOKEN)
```

Данные лаунчера: `%APPDATA%\.dlauncher`.

## remote.json

Лаунчер читает [`remote.json`](remote.json) из ветки `main`. Так адрес сервера, сервер скинов и анонсы
меняются без выпуска новой версии:

- `server` — сервер на главной (имя, адрес, версия, слоты);
- `skinServer` — публичный адрес плагина скинов, например `http://example.ply.gg:12345`, или `null`;
- `announcements` — анонсы `{ id, title, text, date, url? }`.

## Плагин скинов

`server-plugin/` — плагин DLauncherSkins для Paper 1.21.1. Лаунчер загружает в него скин игрока,
а CustomSkinLoader у остальных игроков DLauncher показывает скины по протоколу CustomSkinAPI.

```powershell
powershell -ExecutionPolicy Bypass -File server-plugin\build.ps1 -Install
```

Порт задаётся в `plugins/DLauncherSkins/config.yml` (по умолчанию 8765), его нужно пробросить наружу.
Команды: `/dlskins list`, `/dlskins reset <ник>`.
