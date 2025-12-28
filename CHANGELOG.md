# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2024-12-28

### Added
- Support system enhancements with real-time notifications
- Health Dashboard with enhanced UI layout and metrics display

### Changed
- Admin panel cleanup with collapsible sections for better UX
- Improved metrics display and dashboard layout

## [0.0.0] - 2024-12-19

### Added
- Project restructure with proper `src/` directory organization
- Express backend server with Google Sheets integration
- Authentication context and services
- Real-time synchronization with Socket.IO
- Comprehensive documentation (docs/, setup guides)
- Dockerfile for containerization
- E2E tests with Playwright
- ESLint and Prettier configuration
- Google Sheets sync service with automatic debouncing
- Change log tracking and snapshot functionality
- Multiple view components (Table, Calendar, Metrics, Resources, Admin)
- Workflow builder and dependencies view
- Export functionality (PDF, Excel, CSV)

### Changed
- Reorganized codebase from flat structure to modular architecture
- Updated dependencies and build configuration
- Improved project structure with separation of concerns

### Security
- Added `.gitignore` to prevent committing sensitive files (.env, service account keys)
- Environment variable configuration for secure credential management

[1.1.0]: https://github.com/adarsobol/portfolio-management/releases/tag/v1.1.0
[0.0.0]: https://github.com/adarsobol/portfolio-management/releases/tag/v0.0.0

