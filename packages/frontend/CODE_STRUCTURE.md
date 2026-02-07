# Frontend code structure

- **Views** (`src/views/`): Keep thin (~50 lines). Template structure, composables for state, and child components only. No long functions or event wiring in the view.
- **Components** (`src/components/`): One main responsibility. Small template, minimal inline logic. Extract to composables or `utils/` when a file grows.
- **Composables** (`src/composables/`): Reusable logic (e.g. `useDashboardCrawlEvents`, `useSettings`, `useAppNavigation`).
- **Utils** (`src/utils/`): Pure helpers and constants (e.g. `crawlJobStatus.ts`). No Vue refs or lifecycle.
- **Stores** (`src/stores/`): Pinia stores for global state. Use via composables or `useXyzStore()`.
- Prefer splitting large or multi-concern files for readability.
