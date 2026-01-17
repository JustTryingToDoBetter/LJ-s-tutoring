# Changelog

All notable changes to the Project Odysseus website will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **CRITICAL**: Build pipeline now properly copies guides and images to subdirectories
  - `build:guides` now creates `dist/guides/` (was flattening to dist root)
  - `build:images` now creates `dist/images/` (was flattening to dist root)
  - Fixed Lighthouse CI 404 errors on `/guides/matric-maths-mistakes-guide.html`
  - Updated `prebuild` to create necessary subdirectories

### Added
- Comprehensive inline documentation for all configuration and build scripts
- Environment-based configuration system via `.env` file
- `scripts/inject-config.js` - Build-time config injection script
- `.editorconfig` for consistent code formatting across editors
- Lighthouse CI workflow for performance budgets and monitoring
- npm audit security checks in CI pipeline
- Pull request template with review checklist
- Detailed code comments explaining system architecture
- CHANGELOG.md to track project evolution

### Changed
- **BREAKING**: Configuration now via `.env` instead of editing source files
- README.md completely rewritten with accurate workflow documentation
- Build process now includes config injection step
- ESLint configuration includes rationale for all rules
- HTML validation configuration documented with reasoning
- Fixed placeholder WhatsApp number in terms.html (+27 67 932 7754)
- **FIXED**: `.htmlvalidate.json` → `.htmlvalidate.js` (JSON doesn't support comments)

### Documentation
- Added comprehensive file purpose documentation
- Documented all build pipeline steps with comments
- Explained how each component fits into the system
- Added integration diagrams in script comments
- Documented security considerations and best practices

### Fixed
- Configuration documentation now matches actual implementation
- Terms.html now has correct WhatsApp number (was placeholder)
- Build scripts properly inject environment variables
- HTML validation config file now parseable (was invalid JSON with comments)

---

## [1.0.0] - 2026-01-15

### Added
- Initial website release
- Responsive design with mobile-first approach
- Dark mode toggle with local storage persistence
- Contact form with Formspree integration
- WhatsApp integration for instant communication
- Google Analytics with privacy-first cookie consent
- Countdown timer for registration deadline
- FAQ accordion component
- Exit-intent popup (desktop only)
- Animated statistics counters
- Scroll-triggered fade-in animations
- SEO optimizations:
  - Meta tags for social media (Open Graph, Twitter Cards)
  - Structured data (JSON-LD schema)
  - Sitemap.xml
  - Robots.txt
- Accessibility features:
  - ARIA labels and roles
  - Keyboard navigation support
  - WCAG 2.0 AA compliance target
- Security headers via Netlify configuration:
  - Content Security Policy (CSP)
  - HSTS
  - X-Frame-Options
  - X-Content-Type-Options
  - Referrer Policy
  - Permissions Policy
- Legal pages:
  - Privacy Policy
  - Terms of Service
  - Custom 404 page
- Build system:
  - Tailwind CSS compilation
  - Cross-platform build scripts (Windows/macOS/Linux)
  - Parallel build processing for performance
  - Development watch mode
- Quality assurance:
  - HTML validation (html-validate)
  - Link checking (linkinator)
  - Accessibility testing (pa11y-ci)
  - JavaScript linting (ESLint)
  - Pre-commit hooks (Husky)
- CI/CD:
  - GitHub Actions workflow for QA
  - Automated Formspree health checks
- Content:
  - Hero section with value proposition
  - About section with tutor credentials
  - Pricing packages (3 tiers)
  - Student testimonials
  - Results showcase with animated counters
  - Problem/solution framework
  - Comprehensive FAQ
  - Lead capture form
  - Blog/guides section structure

### Technical Stack
- **Frontend**: HTML5, CSS3 (Tailwind), Vanilla JavaScript
- **Build Tools**: Node.js, npm
- **CSS Framework**: Tailwind CSS v3.4
- **Linting**: ESLint, html-validate
- **Testing**: pa11y-ci, linkinator
- **Version Control**: Git, GitHub
- **Hosting**: Netlify (recommended), Vercel compatible
- **Forms**: Formspree
- **Analytics**: Google Analytics 4 (privacy-first)

### Dependencies
```json
{
  "dependencies": {
    "http-server": "^14.1.1"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.16",
    "cpy-cli": "^5.0.0",
    "dotenv": "^16.4.5",
    "eslint": "^8.57.0",
    "html-validate": "^9.5.3",
    "husky": "^9.0.11",
    "linkinator": "^6.1.2",
    "mkdirp": "^3.0.1",
    "npm-run-all": "^4.1.5",
    "pa11y-ci": "^4.0.1",
    "rimraf": "^5.0.5",
    "tailwindcss": "^3.4.17",
    "wait-on": "^7.2.0"
  }
}
```

---

## Version History Legend

### Categories
- **Added**: New features, files, or functionality
- **Changed**: Changes to existing functionality
- **Deprecated**: Features that will be removed in future versions
- **Removed**: Features that have been removed
- **Fixed**: Bug fixes
- **Security**: Security patches or improvements
- **Documentation**: Documentation updates
- **Performance**: Performance improvements

### Breaking Changes
Breaking changes are marked with **BREAKING** and describe the migration path.

### Semantic Versioning
- **MAJOR** (X.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.X.0): New features, backwards-compatible
- **PATCH** (0.0.X): Bug fixes, backwards-compatible

---

## Notes

### Maintaining This Changelog

**When making changes:**
1. Add entry to `[Unreleased]` section
2. Use appropriate category (Added, Changed, Fixed, etc.)
3. Write for human readers, not machines
4. Include rationale for significant changes
5. Link to issues/PRs when relevant
6. Mark breaking changes clearly

**When releasing:**
1. Create new version section with date
2. Move entries from `[Unreleased]` to new version
3. Update version in package.json
4. Tag release in git: `git tag v1.0.0`
5. Push tag: `git push origin v1.0.0`

### Versioning Strategy

**Patch (0.0.X)**: Content updates, bug fixes, dependency patches
**Minor (0.X.0)**: New features, new pages, new integrations
**Major (X.0.0)**: Breaking changes, architecture rewrites

---

## Archive

Previous versions will be listed here as the project evolves.

