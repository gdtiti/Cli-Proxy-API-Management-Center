# Tech Stack

## Build System

- **Vite 7.x** - Build tool and dev server
- **vite-plugin-singlefile** - Inlines all assets into a single HTML file
- **TypeScript 5.x** - Strict mode enabled

## Core Libraries

- **React 19** - UI framework
- **react-router-dom 7** - HashRouter for routing (single-file compatible)
- **Zustand 5** - State management with persist middleware
- **Axios** - HTTP client for API calls
- **i18next / react-i18next** - Internationalization (zh-CN, en)
- **Chart.js / react-chartjs-2** - Usage charts
- **CodeMirror** - YAML editor for config page
- **GSAP** - Animations (splash screen)

## Styling

- **SCSS** with CSS Modules (`.module.scss`)
- Global SCSS variables auto-imported via Vite config
- CSS class naming: `[name]__[local]___[hash:base64:5]`

## Path Aliases

```typescript
// Use @/ for src imports
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores';
```

## Common Commands

```bash
# Development
npm run dev          # Start Vite dev server (localhost:5173)

# Build
npm run build        # TypeScript check + Vite build → dist/index.html

# Quality
npm run lint         # ESLint (fails on warnings)
npm run type-check   # TypeScript --noEmit
npm run format       # Prettier formatting

# Preview
npm run preview      # Serve dist locally
```

## Build Output

- Single file: `dist/index.html` (all JS/CSS/assets inlined)
- Release workflow renames to `management.html` for bundling with CLI Proxy API
- Version injected at build time from: `VERSION` env → git tag → package.json
