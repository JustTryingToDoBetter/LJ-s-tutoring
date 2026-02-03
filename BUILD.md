# Build System Documentation

## Overview

The build system transforms source files into production-ready artifacts in the `dist/` folder.

## Build Scripts Reference

### Core Build Commands

#### `npm run build`
Full production build. Runs all build steps in a defined order (currently sequential).

**Sequence:**
1. `prebuild` - Clean and create directory structure
2. `build:css` - Compile and minify Tailwind CSS
3. `build:html` - Copy HTML files
4. `build:static` - Copy static files (favicon, robots.txt, sitemap.xml)
5. `build:guides` - Copy guides folder with subdirectory structure
6. `build:images` - Copy images folder with subdirectory structure
7. `build:arcade` - Copy `arcade/` pages
8. `build:assets` - Copy root `assets/*` JS/CSS
9. `build:games` - Copy `assets/games/*`
10. `build:lib` - Copy `assets/lib/*`
11. `build:arcade-mod` - Copy `assets/arcade/*`
12. `build:sw` - Copy `sw.js`
13. `inject:config` - Inject `.env` configuration into built assets (and built HTML error monitor config)

**Output:** `dist/` folder ready for deployment

---

### Individual Build Steps

#### `npm run clean`
Removes the entire `dist/` folder.

**Command:** `rimraf dist`

**When to use:** Before rebuilding from scratch

---

#### `npm run prebuild`
Prepares the build environment.

**Steps:**
1. Runs `clean` (removes old dist/)
2. Creates directory structure:
   - `dist/assets/` - For JavaScript, CSS
   - `dist/guides/` - For blog/guide content
   - `dist/images/` - For image files

**Command:** `npm run clean && mkdirp dist/assets dist/guides dist/images`

**Note:** These directories MUST exist before copy/build steps run, otherwise file copies can fail.

---

#### `npm run build:css`
Compiles Tailwind CSS to production-optimized CSS.

**Command:** `tailwindcss -c tailwind.config.js -i ./assets/tailwind-input.css -o ./dist/assets/tailwind-input.css --minify`

**Input:** `assets/tailwind-input.css`  
**Output:** `dist/assets/tailwind-input.css` (minified)

**What it does:**
- Reads `tailwind.config.js` for configuration
- Scans HTML files for Tailwind classes (PurgeCSS)
- Generates only the CSS actually used (tree-shaking)
- Minifies output (removes whitespace, comments)

**Why minify:** Reduces file size by ~70%, faster page loads

---

#### `npm run build:html`
Copies HTML files.

**Command:** `cpy "*.html" dist --flat`

**Steps:**
1. Copies all `.html` files from root to `dist/` (preserves file names, removes paths)

**Files copied:**
- `index.html` → `dist/index.html`
- `maths-tutoring-cape-town.html` → `dist/maths-tutoring-cape-town.html`
- `privacy.html` → `dist/privacy.html`
- `terms.html` → `dist/terms.html`
- `404.html` → `dist/404.html`
- `og-image-placeholder.html` → `dist/og-image-placeholder.html`

**Config injection:** Run separately via `npm run inject:config`

**Flag explanation:** `--flat` removes directory structure (all files go to `dist/` root)

---

#### `npm run inject:config`
Injects environment configuration into the built site.

**Command:** `node scripts/inject-config.js`

**What it does:**
- Rewrites the `const CONFIG = { ... }` block in `dist/assets/app-critical.js` using values from `.env`
- Injects `window.PO_ERROR_MONITOR = { ... }` into built HTML pages in `dist/`

**Notes:**
- `ERROR_MONITOR_ENDPOINT` and `ERROR_MONITOR_SAMPLE_RATE` are optional; leaving the endpoint blank disables sending.
- `.env` is gitignored; use `.env.example` as the committed template.

---

#### `npm run build:static`
Copies static files that don't need processing.

**Command:** `cpy "favicon.svg" "robots.txt" "sitemap.xml" dist --flat`

**Files copied:**
- `favicon.svg` → Browser icon
- `robots.txt` → Search engine crawling rules
- `sitemap.xml` → SEO sitemap

**Why separate:** These files never change, can be cached aggressively

---

#### `npm run build:guides`
Copies guide/blog content with subdirectory structure preserved.

**Command:** `cpy "guides/*.html" "dist/guides"`

**Critical detail:** Does NOT use `--flat` flag, preserves folder structure

**Input:** `guides/matric-maths-mistakes-guide.html`  
**Output:** `dist/guides/matric-maths-mistakes-guide.html`

**Why this matters:** URLs like `/guides/matric-maths-mistakes-guide.html` depend on this structure

**Common mistake:** Using `cpy "guides/**" dist` will flatten files to `dist/` root (404 errors)

---

#### `npm run build:images`
Copies image files with subdirectory structure preserved.

**Command:** `cpy "images/*" "dist/images"`

**Critical detail:** Does NOT use `--flat` flag, preserves folder structure

**Files copied:**
- `images/jaydin-morrison.jpg` → `dist/images/jaydin-morrison.jpg`
- `images/liam-newton.jpg` → `dist/images/liam-newton.jpg`

**Why subdirectory:** Keeps images organized, supports future expansion (e.g., `images/guides/`, `images/icons/`)

---

#### `npm run build:assets`
Copies JavaScript and CSS assets.

**Command:** `cpy "assets/*.js" "assets/site.css" "assets/tailwind-input.css" dist/assets --flat`

**Files copied:**
- `assets/app-critical.js` → `dist/assets/app-critical.js`
- `assets/app-noncritical.js` → `dist/assets/app-noncritical.js`
- `assets/analytics.js` → `dist/assets/analytics.js`
- `assets/site.css` → `dist/assets/site.css`
- `assets/tailwind-input.css` → `dist/assets/tailwind-input.css` (for source maps)

**Why `--flat`:** Assets are already in `assets/` folder, maintain same structure in `dist/assets/`

---

### Development Commands

#### `npm run dev`
Watch mode for CSS development.

**Command:** `tailwindcss -c tailwind.config.js -i ./assets/tailwind-input.css -o ./dist/assets/tailwind-input.css --watch`

**What it does:**
- Monitors HTML files for Tailwind class changes
- Rebuilds CSS automatically on save
- Does NOT minify (faster rebuilds)

**Use case:** Actively developing styles

**Workflow:**
```bash
npm run dev:full  # Initial setup
# Then in separate terminal:
npm run serve     # Start local server
# Edit HTML/CSS, see changes instantly
```

---

#### `npm run dev:full`
Complete development build (one-off build of all assets, including config injection).

**Command:** `npm run dev:full`

**When to use:** Starting development session

---

#### `npm run serve`
Starts local development server.

**Command:** `http-server dist -p 8080 -c-1`

**Details:**
- Port: `8080`
- Directory: `dist/` (serves production build)
- Cache: `-c-1` (disables caching for development)

**Access:** http://localhost:8080

---

#### `npm run start`
Production server (used by Netlify).

**Command:** `http-server dist -a 0.0.0.0 -p ${PORT:-8080} -c-1`

**Differences from `serve`:**
- Binds to all interfaces (`0.0.0.0` vs localhost)
- Dynamic port from `$PORT` environment variable
- Fallback to 8080 if PORT not set

---

## Directory Structure

### Source (what you edit)
```
project-root/
├── *.html              # Root-level pages
├── assets/             # JavaScript, CSS source
│   ├── *.js
│   └── tailwind-input.css
├── guides/             # Blog/content pages
│   └── *.html
├── images/             # Image files
│   └── *.jpg
├── favicon.svg         # Browser icon
├── robots.txt          # SEO directives
└── sitemap.xml         # SEO sitemap
```

### Build Output (what gets deployed)
```
dist/
├── *.html              # Root-level pages (copied)
├── assets/             # Compiled assets
│   ├── *.js           # (copied from source)
│   ├── site.css       # (copied from source)
│   └── tailwind-input.css   # (COMPILED from tailwind-input.css)
├── guides/             # Content (preserves structure)
│   └── *.html
├── images/             # Images (preserves structure)
│   └── *.jpg
├── favicon.svg         # (copied)
├── robots.txt          # (copied)
└── sitemap.xml         # (copied)
```

---

## Common Issues & Solutions

### Issue: Guides returning 404 in production/CI

**Symptom:** `/guides/matric-maths-mistakes-guide.html` returns 404

**Cause:** `build:guides` script not preserving directory structure

**Fix:** Ensure `build:guides` uses `cpy "guides/*.html" "dist/guides"` (NOT `cpy "guides/**" dist`)

**Verify:**
```bash
npm run build
ls dist/guides/  # Should show matric-maths-mistakes-guide.html
```

---

### Issue: Images not loading in deployed site

**Symptom:** `<img src="/images/photo.jpg">` returns 404

**Cause:** `build:images` script flattening directory structure

**Fix:** Ensure `build:images` uses `cpy "images/*" "dist/images"` (NOT `--flat` flag)

**Verify:**
```bash
npm run build
ls dist/images/  # Should show all images
```

---

### Issue: CSS changes not appearing

**Symptom:** Updated Tailwind classes don't apply

**Solutions:**
1. **In development:** Run `npm run dev` (watch mode)
2. **Before deployment:** Run full `npm run build`
3. **Cache issue:** Hard refresh browser (Ctrl+Shift+R)

---

### Issue: Config not injecting

**Symptom:** WhatsApp/Formspree links show placeholder values

**Cause:** `.env` file missing or `inject:config` not running

**Fix:**
1. Verify `.env` exists: `ls .env`
2. Check values: `cat .env`
3. Rebuild: `npm run build`
4. Check injection: `grep WHATSAPP_NUMBER dist/assets/app-critical.js`

**Expected:** Should show actual number, not placeholder

---

### Issue: Build fails with "directory not found"

**Symptom:** `cpy` commands fail silently

**Cause:** Target directories don't exist

**Fix:** Ensure `prebuild` creates all necessary directories:
```json
"prebuild": "npm run clean && mkdirp dist/assets dist/guides dist/images"
```

**Why this matters:** If directories don't exist when copy/build steps run, file copies can fail.

---

### Issue: Lighthouse CI fails after build succeeds locally

**Symptom:** Local build works, CI fails with 404s

**Likely causes:**
1. Different file paths (Windows vs Linux)
2. Missing directories in CI environment
3. `.env` values not set in GitHub Secrets

**Debug:**
1. Check CI logs for build output
2. Verify `dist/` structure in CI
3. Confirm environment variables are set

---

## Performance Optimization

### Parallel Builds (Optional)
The current `build` script runs in a defined order (sequential). It could be changed to use `npm-run-all --parallel` for independent steps if you want faster builds.

**Sequential (slow):**
```
build:css    (2s) →
build:html   (1s) →
build:guides (0.5s) →
build:images (0.5s) →
build:assets (1s)
Total: 5 seconds
```

**Parallel (fast):**
```
build:css    ─┐
build:html   ─┤
build:guides ─┼→ All run together
build:images ─┤
build:assets ─┘
Total: 2 seconds (longest individual task)
```

**Trade-off:** Parallel builds require more CPU but finish faster

---

### CSS Optimization
Tailwind's PurgeCSS removes unused classes:

**Development (all classes):** 3.5MB  
**Production (purged):** ~15KB  

**Savings:** ~99% size reduction

**Why this matters:** Faster page loads, better SEO, lower bandwidth costs

---

## Deployment

### Netlify Configuration
Netlify runs these commands automatically:

**Build command:** `npm run build`  
**Publish directory:** `dist`

**Environment variables:**
Set in Netlify dashboard → Site settings → Environment variables:
- `WHATSAPP_NUMBER`
- `FORMSPREE_ENDPOINT`
- `CONTACT_EMAIL`
- `COUNTDOWN_DATE`
- `ERROR_MONITOR_ENDPOINT` (optional)
- `ERROR_MONITOR_SAMPLE_RATE` (optional)

**Deploy trigger:** Automatic on git push to `main` branch

---

### Manual Deployment
If deploying elsewhere:

1. **Install dependencies:**
   ```bash
   npm ci  # Uses package-lock.json for reproducibility
   ```

2. **Set environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

3. **Build:**
   ```bash
   npm run build
   ```

4. **Test locally:**
   ```bash
   npm run serve
   # Visit http://localhost:8080
   ```

5. **Deploy `dist/` folder** to hosting provider

---

## Troubleshooting Checklist

Before reporting build issues, verify:

- [ ] `node --version` shows 20.x
- [ ] `npm --version` shows 10.x or higher
- [ ] `.env` file exists (copy from `.env.example`)
- [ ] `npm install` completed without errors
- [ ] `dist/` folder structure matches expected layout
- [ ] `npm run lint` passes
- [ ] `npm run serve` starts server successfully
- [ ] Browser console shows no 404 errors

---

## Advanced: Build Pipeline Debugging

### Enable verbose output
```bash
DEBUG=* npm run build
```

### Check individual build steps
```bash
npm run prebuild          # Create directories
npm run build:css         # Just CSS
npm run build:html        # Just HTML
npm run inject:config     # Inject .env into built assets / HTML
npm run build:guides      # Just guides
npm run build:images      # Just images
npm run build:assets      # Just JS/CSS
```

### Verify file counts
```bash
find dist -type f | wc -l  # Total files
ls -R dist/               # Full listing
```

### Compare source vs dist
```bash
diff <(ls guides/) <(ls dist/guides/)
diff <(ls images/) <(ls dist/images/)
```

---

## Related Documentation

- [README.md](README.md) - Getting started guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture overview
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development workflow improvements
- [scripts/inject-config.js](scripts/inject-config.js) - Config injection details
- [package.json](package.json) - All npm scripts
- [netlify.toml](netlify.toml) - Deployment configuration

---

## Version History

**v1.1.0** (2026-01-17)
- Fixed guides/images subdirectory preservation in build
- Added directory creation to prebuild step
- Updated cpy commands to use explicit destination paths

**v1.0.0** (Initial)
- Basic build system with scripted build pipeline
- Tailwind CSS compilation
- Config injection system
