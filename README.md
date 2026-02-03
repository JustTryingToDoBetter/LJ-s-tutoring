# Project Odysseus Website

Professional Mathematics tutoring website for Grades 8-12 in South Africa.

## 🚀 Quick Start

```bash
# 1. Clone this repository
git clone <repository-url>

# 2. Install dependencies (includes build tools, linters, QA tools)
npm install

# 3. Set up environment configuration
cp .env.example .env
# Edit .env with your actual values (WhatsApp, Formspree, email, etc.)

# 4. Build the project (compiles CSS, copies files, injects config)
npm run build

# 5. Serve locally to test
npm run serve
# Visit http://localhost:8080

# 6. For production, deploy dist/ folder to static hosting
```

## 🏗️ Build Process Overview

**The build system follows this sequence:**

1. **Clean**: Removes old `dist/` folder
2. **Create directories**: Sets up `dist/` and `dist/assets/`
3. **Build CSS**: Compiles Tailwind from `assets/tailwind-input.css` → `dist/assets/tailwind-input.css`
4. **Build HTML**: Copies `*.html` to `dist/` 
5. **Inject Config**: Reads `.env` and injects values into `dist/assets/app-critical.js`
6. **Copy Assets**: Copies JavaScript, CSS, images, guides to `dist/`
7. **Deploy**: The `dist/` directory contains the production-ready site

**Key Point**: Configuration is managed via `.env` (from `.env.example`) and injected at build time.

## ⚙️ Configuration (Environment Variables)

**All configuration is managed through the `.env` file (copy from `.env.example`).**

### Setup Instructions

1. **Copy the template**:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your values**:
   ```env
   WHATSAPP_NUMBER=27679327754          # Your WhatsApp number (country code + number, no +)
   FORMSPREE_ENDPOINT=https://formspree.io/f/YOUR_FORM_ID
   CONTACT_EMAIL=your-email@example.com
   COUNTDOWN_DATE=2026-02-15T17:00:00   # ISO 8601 format
   ERROR_MONITOR_ENDPOINT=             # Optional
   ERROR_MONITOR_SAMPLE_RATE=1         # Optional
   ```

3. **Never commit `.env`** (already in `.gitignore`)

### Environment Variables Reference

| Variable | Purpose | Format | Used In |
|----------|---------|--------|---------|
| `WHATSAPP_NUMBER` | WhatsApp contact link | `27679327754` (no + or spaces) | `app-critical.js` |
| `FORMSPREE_ENDPOINT` | Form submission URL | `https://formspree.io/f/xxxxx` | `app-critical.js` |
| `CONTACT_EMAIL` | Contact email address | `email@example.com` | `app-critical.js` |
| `COUNTDOWN_DATE` | Registration countdown target | `YYYY-MM-DDTHH:mm:ss` | `app-critical.js` |
| `ERROR_MONITOR_ENDPOINT` | Optional error monitor endpoint | URL or empty | `error-monitor.js` (optional) |
| `ERROR_MONITOR_SAMPLE_RATE` | Optional error sample rate | `0`–`1` | `error-monitor.js` (optional) |

### How Config Injection Works

- **Source**: `.env` file (gitignored, local/CI-specific)
- **Injection Script**: `scripts/inject-config.js`
- **Target**: `dist/assets/app-critical.js` (CONFIG object)
- **When**: During `npm run build` (post-copy inject step)
- **Fallback**: Uses defaults if `.env` missing (fail-safe approach)

### Google Analytics Setup

**Note**: Analytics is NOT configured via `.env` (different pattern).

1. Create a property at [analytics.google.com](https://analytics.google.com)
2. Get your Measurement ID (starts with `G-`)
3. Edit `assets/analytics.js` and update the `GA_MEASUREMENT_ID` constant
4. Rebuild: `npm run build`

**Privacy**: Analytics only loads after user opt-in via cookie banner. "Do Not Track" browsers auto-decline.

### Domain & URLs

Update these **directly in the HTML files**:
- `index.html`: Canonical URL, Open Graph URLs
- `sitemap.xml`: Domain references
- `robots.txt`: Sitemap URL

### Open Graph Image

Create a 1200x630px image named `og-image.jpg` for social media sharing.

## 🔄 Environment-Specific Builds

### Local Development
```bash
# Use .env with dev/test values
npm run build
npm run serve
```

### Production (CI/CD)
```bash
# Set environment variables in CI system (GitHub Secrets, Netlify Env Vars)
# CI automatically runs: npm run build
# Deploy dist/ folder
```

### Staging
```bash
# Create separate staging config
cp .env.example .env.staging
# Edit .env.staging with staging values
cp .env.staging .env
npm run build
# Deploy to staging server
```

## 📁 File Structure

```
├── index.html                    # Main website (source)
├── privacy.html                  # Privacy Policy page
├── terms.html                    # Terms of Service page
├── 404.html                      # Custom 404 error page
├── maths-tutoring-cape-town.html # SEO landing page
├── .env                          # Environment config (gitignored, local only)
├── .env.example                  # Environment template (committed)
├── assets/                       # Source JavaScript & CSS
│   ├── analytics.js              # Google Analytics (opt-in tracking)
│   ├── app-critical.js           # Core JS (mobile menu, dark mode, countdown, forms)
│   ├── app-noncritical.js        # Progressive enhancement (animations, popups)
│   ├── site.css                  # Custom CSS (supplements Tailwind)
│   └── tailwind-input.css        # Tailwind source (compiled to dist/)
├── scripts/
│   └── inject-config.js          # Build-time config injection (.env → JS)
├── guides/                       # Blog/guide content
│   └── matric-maths-mistakes-guide.html
├── images/                       # Image assets
├── dist/                         # Build output (gitignored, generated by npm run build)
├── favicon.svg                   # Browser favicon
├── sitemap.xml                   # SEO sitemap
├── robots.txt                    # Search engine crawling rules
├── package.json                  # Dependencies & npm scripts
├── tailwind.config.js            # Tailwind customization (brand colors, fonts)
├── netlify.toml                  # Netlify deployment config (headers, caching)
├── .eslintrc.js                  # JavaScript linting rules
├── .htmlvalidate.json            # HTML validation config
├── .pa11yci                      # Accessibility testing config
├── .husky/pre-commit             # Git pre-commit hook (runs linters)
├── .github/workflows/            # CI/CD pipelines
│   ├── qa.yml                    # Runs QA suite on PR/push
│   └── formspree-healthcheck.yml # Daily form endpoint monitoring
└── README.md                     # This file
```

## 🛠️ Development Workflow

### Day-to-Day Development
```bash
# Start watch mode (auto-recompile CSS on changes)
npm run dev

# In another terminal, serve the site
npm run serve

# Visit http://localhost:8080
```

### Before Committing
```bash
# Run linters (or let pre-commit hook do it automatically)
npm run lint

# Full QA suite (HTML, links, accessibility)
npm run qa
```

### Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Watch mode: auto-recompile CSS on file changes |
| `npm run build` | Full production build (clean, compile, copy, inject) |
| `npm run serve` | Start local server on http://localhost:8080 |
| `npm run lint` | Run all linters (JavaScript + HTML) |
| `npm run lint:js` | Lint JavaScript files only |
| `npm run lint:html` | Validate HTML files only |
| `npm run qa` | Full QA suite (validation, links, accessibility) |
| `npm run clean` | Remove dist/ folder |

## ✅ Quality Assurance

### Automated Checks (CI/CD)

Every PR/push triggers:
- ✅ HTML validation (W3C standards)
- ✅ Internal link checking (no broken links)
- ✅ Accessibility testing (WCAG 2.0 AA)
- ✅ JavaScript linting (ESLint)
- ✅ Security audits (npm audit)

### Pre-Commit Hooks

Husky automatically runs before every commit:
- Runs `npm run lint`
- Blocks commit if errors found

If hooks aren’t installed after `npm install`, run:
```bash
npx husky install
```

### Manual Testing Checklist

- [ ] Test on mobile devices (responsive design)
- [ ] Test dark mode toggle
- [ ] Submit contact form (verify Formspree works)
- [ ] Click WhatsApp link (opens chat correctly)
- [ ] Test cookie consent banner (accepts/declines analytics)
- [ ] Verify countdown timer displays correctly
- [ ] Check all internal links work
- [ ] Test 404 page (visit non-existent URL)

## 🎨 Customization

### Brand Colors

Defined in `tailwind.config.js`:
```javascript
colors: {
  brand: {
    dark: '#0f172a',   // Navy (headers, backgrounds)
    gold: '#fbbf24',   // Gold (accents, CTAs)
    light: '#f8fafc',  // Light gray (backgrounds)
  },
}
```

### Typography

Font family in `tailwind.config.js`:
```javascript
fontFamily: {
  sans: ['Inter', 'sans-serif'],
}
```

### Content Updates

| Content | Location | Notes |
|---------|----------|-------|
| Pricing packages | `index.html` | Search for "Pricing & Packages" section |
| Testimonials | `index.html` | Get permission before using real names |
| Statistics (counters) | `index.html` | Update `data-target` attributes |
| FAQ items | `index.html` | Accordion in FAQ section |
| Privacy Policy | `privacy.html` | Must reflect actual data handling |
| Terms of Service | `terms.html` | Customize for your policies |

## 📱 Features

- ✅ Fully responsive design (mobile-first)
- ✅ Dark mode toggle with persistence
- ✅ Progressive enhancement (works without JS)
- ✅ Animated counters and scroll effects
- ✅ FAQ accordion
- ✅ Contact form with client-side validation
- ✅ WhatsApp integration
- ✅ Exit-intent popup (desktop only)
- ✅ Cookie consent banner (GDPR/POPIA compliant)
- ✅ SEO optimized (meta tags, structured data, sitemap)
- ✅ Open Graph meta tags (social media previews)
- ✅ Accessibility features (ARIA labels, keyboard navigation)
- ✅ Privacy Policy & Terms pages
- ✅ Custom 404 page
- ✅ Security headers (CSP, HSTS, X-Frame-Options)
- ✅ Asset caching strategy

## 🚀 Deployment

### Netlify (Recommended)

1. Push to GitHub
2. Connect repository to Netlify
3. Configure build settings (auto-detected from `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Set environment variables in Netlify dashboard:
   - `WHATSAPP_NUMBER`
   - `FORMSPREE_ENDPOINT`
   - `CONTACT_EMAIL`
   - `COUNTDOWN_DATE`
5. Deploy!

**Features**:
- Automatic deployments on push
- Preview deployments for PRs
- Free SSL certificates
- CDN distribution
- Security headers (configured in `netlify.toml`)
- Form submissions (if using Netlify Forms instead of Formspree)

### Vercel

1. Import repository from GitHub
2. Configure build:
   - Build command: `npm run build`
   - Output directory: `dist`
3. Set environment variables in Vercel dashboard
4. Deploy

### GitHub Pages

```bash
# Build locally
npm run build

# Deploy dist/ folder
# Use a GitHub Pages deployment tool or manual upload
```

**Note**: GitHub Pages serves from repository root or `docs/` folder. You may need to rename `dist/` to `docs/` or use a deployment action.

### DigitalOcean App Platform

Deploy as a **Static Site**:
- Auto-build from repository
- Build command: `npm run build`
- Output directory: `dist`

Set environment variables in app settings.

## 🔒 Security

### Implemented Protections

- **Content Security Policy (CSP)**: Restricts script/style sources
- **HSTS**: Forces HTTPS connections
- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME sniffing
- **Referrer Policy**: Controls referrer information
- **Permissions Policy**: Restricts browser features

All configured in `netlify.toml`.

### Security Best Practices

- ✅ Never commit `.env` file (already in `.gitignore`)
- ✅ Use environment variables for sensitive config
- ✅ Run `npm audit` regularly (automated in CI)
- ✅ Keep dependencies updated
- ✅ Validate all form inputs (client + server side)
- ✅ HTTPS-only in production

## 📊 Analytics & Monitoring

### Google Analytics

- **Privacy-first**: Only loads after user opt-in
- **Respects DNT**: Do Not Track browsers auto-decline
- **Cookie consent**: GDPR/POPIA compliant banner
- **Configuration**: `assets/analytics.js`

### Monitoring

- **Formspree health check**: Daily automated check (`.github/workflows/formspree-healthcheck.yml`)
- **Uptime monitoring**: Configure external service (e.g., UptimeRobot, Pingdom)
- **Error tracking**: Consider adding Sentry for JavaScript errors

## 📄 Legal & Compliance

### GDPR / POPIA Compliance

- ✅ Cookie consent banner implemented
- ✅ Privacy Policy page (`privacy.html`)
- ✅ Terms of Service page (`terms.html`)
- ⚠️ **Action Required**: Update privacy.html with YOUR actual data handling practices
- ⚠️ **Action Required**: Customize terms.html for YOUR specific policies

### Content Licensing

- Website code: © 2026 Project Odysseus. All rights reserved.
- Images: Ensure you have rights/licenses for all images used
- Testimonials: Get written permission before publishing

## 🐛 Troubleshooting

### Build Fails

**Error: Missing environment variables**
```bash
# Solution: Create .env file
cp .env.example .env
# Edit .env with your values
```

**Error: Command not found**
```bash
# Solution: Install dependencies
npm install
```

### Config Not Updating

**Problem**: Changed .env but site still shows old values

```bash
# Solution: Rebuild to inject new config
npm run clean
npm run build
```

### Husky Hooks Not Running

```bash
# Solution: Reinstall hooks
npx husky install
```

### ESLint Errors on Existing Code

```bash
# Option 1: Auto-fix
npm run lint:js -- --fix

# Option 2: Adjust rules in .eslintrc.js
```

## 📚 Additional Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Formspree Documentation](https://help.formspree.io/)
- [Google Analytics Setup](https://support.google.com/analytics/answer/9304153)
- [Netlify Documentation](https://docs.netlify.com/)
- [WCAG 2.0 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development guidelines.

## 📞 Support

For technical issues with this website template, please open an issue on GitHub.

---

© 2026 Project Odysseus. All rights reserved.
