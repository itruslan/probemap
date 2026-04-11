# Frontend (Probemap)

Каталог **frontend** — часть монорепозитория **probemap**: React 19 + TypeScript + Vite + React Flow.

Сборка, линт, запуск в связке с API и описание проекта — в [корневом README.md](../README.md).

### Локально только фронтенд

```bash
npm ci
npm run dev
```

По умолчанию Vite проксирует `/api` на `http://127.0.0.1:8000`; поднимите backend (`make run` из корня) или укажите свой прокси в `vite.config.ts`.
