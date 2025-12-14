# Portfolio Work Plan Manager

A React-based web application for managing portfolio initiatives, tracking work items, and monitoring team capacity.

## Features

- **Initiative Management**: Create, edit, and track initiatives with status, priority, effort metrics, and ETAs
- **5-Level Hierarchy**: Organize work by Asset Class → Pillar → Responsibility → Target → Initiative
- **Role-Based Access Control**: Admin, Team Lead, Group Lead, Portfolio Ops, VP roles with granular permissions
- **Multiple Views**: Table, Tree, Calendar/Timeline, and Resources dashboards
- **Metrics Dashboard**: Real-time capacity load, BAU buffer health, status breakdowns
- **Audit Trail**: Change history tracking, snapshots, and export capabilities
- **Data Persistence**: LocalStorage persistence for initiatives and configuration

## Project Structure

```
src/
├── components/
│   ├── shared/          # Reusable UI components (Sidebar, FilterBar, Badges)
│   ├── views/           # Main view components (Dashboard, Calendar, Admin)
│   └── modals/          # Modal components (InitiativeModal, BulkActions)
├── hooks/               # Custom React hooks
│   ├── useFilters.ts    # Filter state management
│   └── useLocalStorage.ts # LocalStorage persistence
├── utils/               # Utility functions
│   └── index.ts         # Shared utilities (getOwnerName, generateId, etc.)
├── types/               # TypeScript type definitions
│   └── index.ts         # All interfaces and enums
├── constants/           # Static data and configuration
│   └── index.ts         # Users, hierarchy, initial data
├── App.tsx              # Main application component
└── index.tsx            # Application entry point
```

## Prerequisites

- Node.js 18+
- npm or yarn

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check code formatting |
| `npm run typecheck` | Run TypeScript type checking |

## Tech Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling (via CDN)
- **Recharts** - Charts and visualizations
- **Lucide React** - Icons
- **ESLint + Prettier** - Code quality

## Architecture Decisions

- **LocalStorage Persistence**: Data is persisted in browser localStorage for session continuity
- **Role-Based Permissions**: Granular permission system configured in AppConfig
- **Custom Hooks**: Business logic extracted into reusable hooks
- **Barrel Exports**: Components organized with index.ts files for clean imports
- **TypeScript Strict Mode**: Enabled for better type safety

## License

Private - Internal use only
