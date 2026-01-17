# System Architecture & File Purpose

## Overview: Rules + Constraints + Feedback Loops + Execution

This document explains how every file in the system fits together to create a **predictable, maintainable web development workflow** based on the mental model:

**Website = Rules + Constraints + Feedback Loops + Execution**

When rules are visible, enforced, and automated, progress becomes predictable.

---

## 🏗️ System Layers

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: SOURCE CODE (What developers write)              │
│  • HTML files (*.html)                                      │
│  • JavaScript (assets/*.js)                                 │
│  • CSS (assets/*.css, tailwind-input.css)                   │
│  • Content (guides/*.html, images/*)                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: RULES (How code should be written)               │
│  • .editorconfig        → Formatting rules                  │
│  • .eslintrc.js         → JavaScript quality rules          │
│  • .htmlvalidate.json   → HTML standards                    │
│  • tailwind.config.js   → Design tokens                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: CONSTRAINTS (What's enforced)                    │
│  • .husky/pre-commit    → Git commit gate                   │
│  • package.json scripts → Command definitions               │
│  • lighthouserc.js      → Performance budgets               │
│  • .gitignore           → What can't be committed           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  LAYER 4: FEEDBACK LOOPS (Quality signals)                 │
│  • .github/workflows/qa.yml          → CI validation        │
│  • .github/workflows/lighthouse-ci.yml → Performance        │
│  • .github/workflows/formspree-healthcheck.yml → Monitoring │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  LAYER 5: EXECUTION (Build & Deploy)                       │
│  • scripts/inject-config.js  → Config injection             │
│  • npm run build             → Production build             │
│  • netlify.toml              → Deployment config            │
│  • dist/                     → Deployed artifact            │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 File-by-File Purpose

### Core HTML Files (Source Code Layer)

| File | Purpose | How It Fits |
|------|---------|-------------|
| **index.html** | Main website homepage | Entry point, primary user experience, SEO focus |
| **maths-tutoring-cape-town.html** | SEO landing page | Geographic targeting, conversion-optimized |
| **privacy.html** | Privacy policy | Legal compliance (GDPR/POPIA) |
| **terms.html** | Terms of service | Legal protection |
| **404.html** | Error page | User experience for broken links |
| **guides/*.html** | Blog/content pages | SEO content strategy, educational resources |

**Rule**: All HTML must pass W3C validation (enforced by .htmlvalidate.json)  
**Constraint**: Can't commit if validation fails (pre-commit hook)  
**Feedback**: HTML validation runs in CI on every PR

---

### JavaScript Files (Source Code Layer)

#### **assets/app-critical.js**
- **Purpose**: Core functionality that must load immediately
- **Contains**: Mobile menu, dark mode, countdown timer, form handling
- **Pattern**: IIFE (Immediately Invoked Function Expression) for encapsulation
- **Config**: CONFIG object gets injected at build time (from .env)
- **Loading**: Synchronous in `<head>` (blocking, but critical)
- **Rule**: Must use `const` not `var` (ESLint enforces)

#### **assets/app-noncritical.js**
- **Purpose**: Progressive enhancement (animations, popups, etc.)
- **Contains**: Scroll effects, exit intent, carousels, counters
- **Pattern**: Depends on PO_APP global from app-critical.js
- **Loading**: Deferred or async (non-blocking)
- **Why separate**: Improves First Contentful Paint metric

#### **assets/analytics.js**
- **Purpose**: Privacy-first Google Analytics integration
- **Contains**: Cookie consent, DNT detection, GA4 loader
- **Pattern**: Opt-in only (GDPR/POPIA compliant)
- **Loading**: Only after user consent
- **Config**: GA_MEASUREMENT_ID hardcoded (not in .env)

#### **assets/site.css**
- **Purpose**: Custom CSS not handled by Tailwind
- **Contains**: Animations, special effects, fixes
- **Pattern**: Supplements Tailwind (doesn't replace it)

#### **assets/tailwind-input.css**
- **Purpose**: Tailwind source file
- **Compiles to**: dist/assets/tailwind.css
- **Process**: `npm run build:css` → minified production CSS

---

### Configuration Files (Rules Layer)

#### **.env.example**
- **Purpose**: Template for environment variables
- **Rule**: NEVER commit actual .env (contains sensitive data)
- **How it works**: Developers copy to .env and fill in real values
- **Integration**: Used by scripts/inject-config.js at build time

#### **.editorconfig**
- **Purpose**: Foundational formatting rules (spaces, line endings, etc.)
- **Rule**: All editors must respect these settings
- **Why first**: Prevents formatting issues at source (before linting)
- **Integration**: Automatic in most modern editors

#### **.eslintrc.js**
- **Purpose**: JavaScript code quality and style rules
- **Extends**: eslint:recommended (strict baseline)
- **Custom rules**: 10 rules tailored for this project
- **Enforced by**: Pre-commit hook + CI pipeline
- **Philosophy**: Strict enough to catch bugs, lenient enough to develop

#### **.htmlvalidate.json**
- **Purpose**: HTML validation rules (W3C compliance)
- **Extends**: html-validate:recommended
- **Disabled rules**: 6 rules (all documented with rationale)
- **Enforced by**: Pre-commit hook + CI pipeline
- **Focus**: Semantic HTML, accessibility, proper structure

#### **tailwind.config.js**
- **Purpose**: Tailwind CSS customization
- **Defines**: Brand colors, fonts, content paths
- **Rule**: Design tokens centralized here (single source of truth)
- **Integration**: Used by `npm run build:css` to generate CSS

#### **lighthouserc.js**
- **Purpose**: Performance budgets and thresholds
- **Defines**: Minimum acceptable scores for perf/a11y/SEO
- **Rule**: Can't deploy if scores drop below thresholds
- **Feedback**: Lighthouse CI workflow tests every PR
- **Metrics**: FCP, LCP, TBT, CLS, accessibility score, SEO score

#### **package.json**
- **Purpose**: Dependencies and npm scripts
- **Scripts**: Build pipeline, dev tools, QA commands
- **Dependencies**: Runtime (http-server)
- **DevDependencies**: Build tools, linters, testers
- **Rule**: All commands documented in README

---

### Build & Deployment (Execution Layer)

#### **scripts/inject-config.js**
- **Purpose**: Inject .env variables into built JavaScript
- **When**: Runs during `npm run build:html`
- **How**: Reads .env → modifies dist/assets/app-critical.js
- **Why**: Enables environment-specific builds (dev/staging/prod)
- **Fallback**: Uses defaults if .env missing (fail-safe)
- **Pattern**: Find/replace CONFIG object via regex

**Build Pipeline Sequence:**
```
1. npm run clean          → Remove old dist/
2. npm run prebuild       → Create dist/ directories
3. npm run build:css      → Compile Tailwind CSS
4. npm run build:html     → Copy HTML + inject config ← inject-config.js runs here
5. npm run build:assets   → Copy JS/CSS/images
6. Result: dist/ folder ready for deployment
```

#### **netlify.toml**
- **Purpose**: Netlify deployment configuration
- **Defines**: Build command, publish directory, headers
- **Security**: CSP, HSTS, X-Frame-Options, etc.
- **Caching**: Asset caching strategy (7 days for JS/CSS, 1 year for images)
- **Integration**: Automatic on Netlify deploy

---

### Quality Assurance (Feedback Loops Layer)

#### **Pre-Commit Hook (.husky/pre-commit)**
- **Purpose**: First line of defense - catch issues before commit
- **Runs**: `npm run lint` (ESLint + html-validate)
- **Effect**: Blocks commit if errors found
- **Why**: Prevents bad code from entering git history
- **Bypass**: Possible with `--no-verify` (not recommended)

#### **GitHub Actions Workflows**

##### **.github/workflows/qa.yml**
- **Triggers**: Every push, every PR
- **Steps**:
  1. Checkout code
  2. Install dependencies
  3. **Run npm audit** (security check) ← NEW
  4. Build site
  5. Start local server
  6. Validate HTML
  7. Check internal links
  8. Test accessibility (pa11y)
- **Purpose**: Comprehensive quality validation
- **Effect**: Blocks PR merge if fails

##### **.github/workflows/lighthouse-ci.yml**
- **Triggers**: Every push, every PR
- **Steps**:
  1. Build site
  2. Run Lighthouse on 6 pages (3 runs each)
  3. Check scores vs lighthouserc.js thresholds
  4. Upload reports
- **Purpose**: Performance budget enforcement
- **Effect**: Blocks PR merge if performance degrades

##### **.github/workflows/formspree-healthcheck.yml**
- **Triggers**: Daily at 6am, manual trigger
- **Purpose**: Monitor form endpoint availability
- **Effect**: Alerts if Formspree down

#### **.pa11yci**
- **Purpose**: Accessibility testing configuration
- **Tests**: 6 pages against WCAG 2.0 AA standard
- **Integration**: Called by qa.yml workflow
- **Tool**: pa11y-ci (headless Chrome accessibility tester)

---

### Version Control (Constraints Layer)

#### **.gitignore**
- **Purpose**: Prevent committing generated/sensitive files
- **Blocks**: node_modules/, dist/, .env, IDE files
- **Rule**: Only source code goes in git, not build artifacts
- **Why**: Keeps repo clean, protects secrets

#### **.github/PULL_REQUEST_TEMPLATE/pull_request_template.md**
- **Purpose**: Standardized PR format
- **Contains**: Checklist, description template, review guidelines
- **Rule**: All PRs must complete checklist
- **Effect**: Improves code review quality and consistency

---

### Documentation (Rules Layer)

#### **README.md**
- **Purpose**: Main documentation - getting started, configuration, deployment
- **Audience**: New developers, future maintainers
- **Rule**: Must stay accurate (part of PR checklist)
- **Structure**: Quick start → detailed reference
- **Philosophy**: Accurate over comprehensive

#### **DEVELOPMENT.md**
- **Purpose**: Development workflow improvements log
- **Contains**: Performance improvements, new scripts, migration guides
- **Rule**: Historical record of why things changed
- **Integration**: Referenced by README for context

#### **CHANGELOG.md**
- **Purpose**: Version history and release notes
- **Format**: Keep a Changelog standard
- **Rule**: Update with every significant change
- **Versions**: Semantic versioning (MAJOR.MINOR.PATCH)
- **Future**: Enables reproducible builds

#### **ARCHITECTURE.md** (this file)
- **Purpose**: System-level understanding
- **Audience**: Developers who need the "why" and "how"
- **Rule**: Update when system changes
- **Philosophy**: Mental model over implementation details

---

## 🔄 Workflow: From Idea to Production

### 1. Developer Makes Changes (Local)
```
Developer writes code
    ↓
.editorconfig formats on save
    ↓
Developer runs: npm run dev (watch CSS changes)
    ↓
Developer tests in browser (localhost:8080)
    ↓
Developer runs: npm run lint (check for errors)
    ↓
Developer runs: npm run qa:quick (fast validation)
    ↓
Developer commits
```

### 2. Git Pre-Commit Hook Runs
```
git commit triggered
    ↓
Husky runs .husky/pre-commit
    ↓
Executes: npm run lint
    ↓
ESLint checks JavaScript → PASS/FAIL
    ↓
html-validate checks HTML → PASS/FAIL
    ↓
If PASS: Commit succeeds
If FAIL: Commit blocked, fix errors
```

### 3. Push to GitHub
```
git push origin feature-branch
    ↓
GitHub receives push
    ↓
Triggers: .github/workflows/qa.yml
    ↓
Triggers: .github/workflows/lighthouse-ci.yml
    ↓
Both run in parallel
```

### 4. CI/CD Pipeline Validates
```
QA Workflow:
- npm audit (security)
- Build site
- Validate HTML
- Check links
- Test accessibility
    ↓
Lighthouse CI Workflow:
- Build site
- Run performance audits
- Check against budgets
    ↓
Both must PASS
```

### 5. Code Review
```
Developer creates Pull Request
    ↓
PR template auto-populates
    ↓
Developer fills checklist
    ↓
CI status badges show:
  ✅ QA passed
  ✅ Lighthouse passed
    ↓
Reviewer checks:
  - Code quality
  - Functionality
  - Documentation
    ↓
Reviewer approves
```

### 6. Merge & Deploy
```
PR merged to main
    ↓
GitHub main branch updated
    ↓
Netlify detects change
    ↓
Netlify runs: npm run build
    ↓
Builds dist/ with production .env
    ↓
Deploys to production
    ↓
Site live with new changes
```

---

## 🎯 Key Principles

### 1. **Fail Fast, Fail Loud**
- Errors caught at earliest possible stage
- Pre-commit hook → CI → Code review → Deploy
- Loud failures better than silent bugs in production

### 2. **Single Source of Truth**
- Config: .env file
- Design tokens: tailwind.config.js
- Dependencies: package.json
- Never duplicate, always reference

### 3. **Enforce Through Automation**
- Humans forget checklists
- Computers don't
- Manual review is last resort, not first line

### 4. **Document Everything**
- Every rule has a "why"
- Every constraint has a rationale
- Future maintainers understand decisions

### 5. **Optimize for Change**
- System designed to be modified safely
- Clear process for adjusting rules
- CHANGELOG tracks what and why

---

## 🔧 Maintenance & Evolution

### When to Update This Document
- New file added to project
- Build pipeline changes
- Quality gates adjusted
- Architecture decisions made

### When to Update Rules
1. Identify problem (false positive, too strict, too lenient)
2. Discuss with team
3. Update relevant config file
4. Document rationale in comments
5. Update CHANGELOG.md
6. Update this ARCHITECTURE.md

### When to Add Constraints
- Pattern of repeated mistakes
- Important but easy to forget
- High-risk operations
- Team agreement on standard

### When to Add Feedback Loops
- Manual testing too time-consuming
- Regressions happening repeatedly
- Need quantitative metrics
- Want to enforce standards

---

## 📊 Success Metrics

**The system is working when:**
- ✅ PRs pass CI on first try (rules are clear)
- ✅ No "works on my machine" issues (environment consistent)
- ✅ New developers onboard quickly (documentation accurate)
- ✅ Changes don't break unexpectedly (constraints enforced)
- ✅ Performance stays fast (budgets enforced)
- ✅ Code reviews focus on logic, not style (automation handles style)
- ✅ Deployments are confident, not scary (validation comprehensive)

**The system needs improvement when:**
- ❌ CI fails frequently for trivial reasons (rules too strict)
- ❌ Developers bypass checks regularly (constraints too painful)
- ❌ Documentation outdated (feedback loop broken)
- ❌ Long time between commit and feedback (pipeline too slow)
- ❌ Same bugs keep recurring (missing constraint)

---

## 🚀 Future Enhancements

**Potential additions to strengthen the system:**

1. **Visual Regression Testing**
   - Tool: Percy, Chromatic, BackstopJS
   - Purpose: Catch unintended UI changes
   - Integration: GitHub Actions workflow

2. **Dependency Version Pinning**
   - Tool: Renovate, Dependabot
   - Purpose: Automated dependency updates with testing
   - Integration: GitHub Apps

3. **Bundle Size Monitoring**
   - Tool: bundlesize, size-limit
   - Purpose: Prevent JS/CSS bloat
   - Integration: CI assertion

4. **E2E Testing**
   - Tool: Playwright, Cypress
   - Purpose: Test critical user flows
   - Integration: GitHub Actions workflow

5. **Staging Environment**
   - Purpose: Test before production
   - Integration: Netlify deploy previews

6. **A/B Testing Framework**
   - Purpose: Data-driven decisions
   - Integration: Split.io, Optimizely

---

## 📚 Learning Resources

- **EditorConfig**: https://editorconfig.org/
- **ESLint**: https://eslint.org/docs/latest/
- **HTML Validate**: https://html-validate.org/
- **Lighthouse**: https://developers.google.com/web/tools/lighthouse
- **Husky**: https://typicode.github.io/husky/
- **Semantic Versioning**: https://semver.org/
- **Keep a Changelog**: https://keepachangelog.com/
- **12 Factor App**: https://12factor.net/

---

**Remember**: This is not just code, it's a system. Every piece has a purpose. Every rule has a reason. When rules are visible, enforced, and automated, progress becomes predictable.
