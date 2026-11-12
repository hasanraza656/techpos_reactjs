# Tech POS tenant application

React/TypeScript/Vite client. All business operations use Laravel APIs; there is no second backend.

See the [root setup guide](../README.md) and [current implementation status](../AI.md). `npm run dev` serves port 5173 with Laravel API/CSRF proxies. `npm run build` checks TypeScript and builds the PWA. `npm run test:e2e` and `npm run test:offline` provide browser verification; build before the offline test.

The service worker caches application code only. Offline checkout is not implemented.
