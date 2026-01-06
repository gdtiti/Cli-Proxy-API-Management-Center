# Project Structure

```
src/
├── main.tsx              # Entry point
├── App.tsx               # Root component, routing setup
├── index.css             # Global CSS imports
│
├── components/
│   ├── common/           # Shared components (notifications, splash, transitions)
│   ├── layout/           # MainLayout, navigation
│   ├── ui/               # Reusable UI primitives (Button, Modal, Input, Card, etc.)
│   ├── providers/        # AI provider sections (Claude, Gemini, OpenAI, Codex, Ampcode)
│   ├── quota/            # Quota display components
│   ├── usage/            # Usage charts and statistics
│   ├── kiro/             # Kiro import functionality
│   └── antigravity/      # Antigravity import functionality
│
├── pages/                # Route pages (Dashboard, Settings, Logs, etc.)
│   └── *.module.scss     # Page-specific styles
│
├── services/
│   ├── api/              # API client and endpoint modules
│   │   ├── client.ts     # Axios singleton with interceptors
│   │   └── *.ts          # Domain-specific API functions
│   ├── storage/          # Secure localStorage wrapper
│   ├── kiro/             # Kiro data converters/validators
│   └── antigravity/      # Antigravity data converters/validators
│
├── stores/               # Zustand stores
│   ├── useAuthStore.ts   # Authentication state
│   ├── useConfigStore.ts # Server config state
│   ├── useThemeStore.ts  # Theme (light/dark)
│   └── use*.ts           # Other domain stores
│
├── hooks/                # Custom React hooks
├── types/                # TypeScript type definitions (barrel export via index.ts)
├── utils/                # Utility functions
├── styles/               # Global SCSS (variables, mixins, themes, reset)
├── i18n/                 # Internationalization
│   └── locales/          # Translation JSON files (en.json, zh-CN.json)
└── assets/               # Static assets (icons, logos)
```

## Conventions

- **Components**: Function components, named exports, PascalCase files
- **Stores**: `use[Domain]Store.ts` pattern with Zustand
- **API services**: Grouped by domain in `services/api/`
- **Types**: Separate files per domain, re-exported from `types/index.ts`
- **Styles**: CSS Modules for components, global SCSS variables in `styles/variables.scss`
- **Pages**: One file per route, co-located `.module.scss` for page styles
- **Providers**: Each AI provider has its own folder with Section, Modal, and index.ts
