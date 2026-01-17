/**
 * ============================================================================
 * LIGHTHOUSE CI CONFIGURATION
 * ============================================================================
 * 
 * PURPOSE:
 * Lighthouse CI automates web performance, accessibility, SEO, and best practices
 * auditing. It runs Google Lighthouse on every build/PR to catch regressions.
 * 
 * HOW IT FITS IN THE SYSTEM:
 * - Runs in CI/CD pipeline after build completes
 * - Tests the built site (dist/) as users would experience it
 * - Fails builds if performance/accessibility drops below thresholds
 * - Provides detailed reports for debugging
 * 
 * WHAT IT MEASURES:
 * - Performance: Page load speed, metrics (FCP, LCP, TTI, CLS)
 * - Accessibility: WCAG compliance, ARIA usage, color contrast
 * - Best Practices: HTTPS, console errors, deprecated APIs
 * - SEO: Meta tags, mobile-friendliness, structured data
 * - PWA: Service worker, manifest (if applicable)
 * 
 * FEEDBACK LOOP:
 * This is a critical constraint - prevents deploying slow/inaccessible pages
 */

module.exports = {
  ci: {
    // ==========================================================================
    // COLLECT - What to audit and how
    // ==========================================================================
    collect: {
      /**
       * URLs to test
       * STRATEGY: Test critical user paths and page types
       * 
       * COVERAGE:
       * - Homepage (main entry point)
       * - Service page (SEO landing page)
       * - Legal pages (required for compliance)
       * - Guide page (content/blog structure)
       * - 404 page (error handling)
       */
      url: [
        'http://localhost:8080/',                                      // Homepage
        'http://localhost:8080/maths-tutoring-cape-town.html',        // SEO landing page
        'http://localhost:8080/privacy.html',                         // Legal
        'http://localhost:8080/terms.html',                           // Legal
        'http://localhost:8080/guides/matric-maths-mistakes-guide.html', // Content
        'http://localhost:8080/404.html',                             // Error handling
      ],
      
      /**
       * Number of times to run Lighthouse per URL
       * REASON: Lighthouse scores vary slightly between runs
       * STRATEGY: Multiple runs provide median score (more reliable)
       * TRADE-OFF: More runs = longer CI time vs more accuracy
       */
      numberOfRuns: 3,
      
      /**
       * Static server directory (for local testing)
       * USAGE: When running `npx lhci autorun` locally
       * CI: Server should already be running (started by workflow)
       */
      staticDistDir: './dist',
      
      /**
       * Lighthouse settings
       * DOCUMENTATION: https://github.com/GoogleChrome/lighthouse/blob/master/docs/configuration.md
       */
      settings: {
        /**
         * Device emulation
         * REASON: Mobile-first design means mobile performance is critical
         * COULD ADD: Desktop configuration for comparison
         */
        emulatedFormFactor: 'mobile',
        
        /**
         * Throttling: Simulates slower network/CPU
         * REASON: Most users don't have fast connections/devices
         * OPTIONS: 
         * - 'mobileSlow4G': Conservative (slower)
         * - 'mobileFast3G': Moderate (default)
         * - 'desktopDense4G': Fast (desktop)
         */
        throttling: {
          rttMs: 150,        // Round-trip time: 150ms
          throughputKbps: 1638.4,  // Download speed: ~1.6 Mbps
          cpuSlowdownMultiplier: 4  // CPU is 4x slower than test machine
        },
        
        /**
         * Chrome flags for testing
         * REASON: Headless Chrome needs these for CI environments
         */
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },

    // ==========================================================================
    // ASSERT - Performance budgets and quality gates
    // ==========================================================================
    assert: {
      /**
       * Assertion strategy
       * OPTIONS:
       * - 'pessimistic': Fail if ANY run fails (strict)
       * - 'optimistic': Pass if ANY run passes (lenient)
       * - 'median': Use median score (recommended)
       */
      preset: 'lighthouse:recommended',  // Start with Google's recommendations
      
      /**
       * Custom assertions - Override or add to preset
       * FORMAT: assertions[category][metric] = ['operator', threshold]
       * 
       * OPERATORS:
       * - 'error': Hard failure (blocks merge)
       * - 'warn': Warning only (doesn't block)
       * 
       * THRESHOLD:
       * - Scores: 0-100 (Lighthouse score)
       * - Metrics: milliseconds or bytes
       */
      assertions: {
        /**
         * PERFORMANCE BUDGETS
         * 
         * WHY: Performance directly impacts user experience and SEO
         * RESEARCH: 53% of mobile users abandon sites that take >3s to load
         */
        
        // Overall performance score (0-100)
        // THRESHOLD: 80+ is good, 90+ is excellent
        'categories:performance': ['error', { minScore: 0.80 }],
        
        // First Contentful Paint: When first text/image appears
        // THRESHOLD: <2s is good, <1s is excellent
        // REASON: User perceives page is loading
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
        
        // Largest Contentful Paint: When main content is visible
        // THRESHOLD: <2.5s is good, <1.5s is excellent
        // REASON: Core Web Vital, affects SEO ranking
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        
        // Total Blocking Time: Sum of all long tasks that block input
        // THRESHOLD: <300ms is good, <100ms is excellent
        // REASON: High TBT makes page feel sluggish
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        
        // Cumulative Layout Shift: Visual stability (elements shouldn't move)
        // THRESHOLD: <0.1 is good, <0.05 is excellent
        // REASON: Core Web Vital, bad CLS is frustrating for users
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        
        // Speed Index: How quickly content is visually populated
        // THRESHOLD: <3.4s for mobile
        'speed-index': ['error', { maxNumericValue: 3400 }],
        
        /**
         * ACCESSIBILITY REQUIREMENTS
         * 
         * WHY: Legal requirement (WCAG), ethical responsibility
         * THRESHOLD: 90+ ensures basic compliance
         */
        'categories:accessibility': ['error', { minScore: 0.90 }],
        
        /**
         * BEST PRACTICES
         * 
         * WHY: Modern web standards, security, UX patterns
         * THRESHOLD: 90+ means following industry standards
         */
        'categories:best-practices': ['error', { minScore: 0.90 }],
        
        /**
         * SEO FUNDAMENTALS
         * 
         * WHY: Discoverability, search ranking
         * THRESHOLD: 90+ ensures good meta tags, mobile-friendly, etc.
         */
        'categories:seo': ['error', { minScore: 0.90 }],
        
        /**
         * RESOURCE SIZES (commented out but available)
         * 
         * Uncomment to enforce bundle size budgets:
         */
        // 'resource-summary:script:size': ['error', { maxNumericValue: 150000 }], // 150KB JS
        // 'resource-summary:stylesheet:size': ['error', { maxNumericValue: 50000 }], // 50KB CSS
        // 'resource-summary:image:size': ['warn', { maxNumericValue: 500000 }], // 500KB images
        // 'resource-summary:total:size': ['warn', { maxNumericValue: 1000000 }], // 1MB total
      },
    },

    // ==========================================================================
    // UPLOAD - Where to send reports (optional)
    // ==========================================================================
    upload: {
      /**
       * Lighthouse CI Server (self-hosted)
       * USAGE: If you set up LHCI server for historical tracking
       * SETUP: https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/server.md
       */
      // target: 'lhci',
      // serverBaseUrl: 'https://your-lhci-server.com',
      // token: 'YOUR_BUILD_TOKEN',
      
      /**
       * Temporary public storage
       * USAGE: For PR comments, temporary reports
       * LIMITATION: Reports expire after ~7 days
       */
      target: 'temporary-public-storage',
      
      /**
       * GitHub App (for PR comments)
       * USAGE: Automatically comments on PRs with Lighthouse results
       * SETUP: Install LHCI GitHub App on your repo
       */
      // githubToken: process.env.GITHUB_TOKEN,
      // githubAppToken: process.env.LHCI_GITHUB_APP_TOKEN,
    },
  },
};

/**
 * ============================================================================
 * INTEGRATION WITH CI/CD
 * ============================================================================
 * 
 * GITHUB ACTIONS WORKFLOW (.github/workflows/lighthouse-ci.yml):
 * 
 * ```yaml
 * name: Lighthouse CI
 * on: [push, pull_request]
 * 
 * jobs:
 *   lighthouse:
 *     runs-on: ubuntu-latest
 *     steps:
 *       - uses: actions/checkout@v4
 *       - uses: actions/setup-node@v4
 *         with:
 *           node-version: '20'
 *       - run: npm ci
 *       - run: npm run build
 *       - run: npm install -g @lhci/cli@0.13.x
 *       - run: lhci autorun
 * ```
 * 
 * ============================================================================
 * LOCAL TESTING
 * ============================================================================
 * 
 * ```bash
 * # Install LHCI globally
 * npm install -g @lhci/cli
 * 
 * # Build your site
 * npm run build
 * 
 * # Run Lighthouse CI
 * lhci autorun
 * 
 * # Or manually start server and run
 * npm run serve &  # Start server in background
 * lhci collect --url=http://localhost:8080
 * lhci assert
 * ```
 * 
 * ============================================================================
 * INTERPRETING RESULTS
 * ============================================================================
 * 
 * GREEN ✅: All assertions passed
 * - Your site meets performance/accessibility standards
 * - Safe to merge/deploy
 * 
 * RED ❌: Assertion failures
 * - Click report links to see detailed breakdown
 * - Focus on failing metrics (highlighted in red)
 * - Common fixes:
 *   - Performance: Optimize images, reduce JS bundle, lazy load
 *   - Accessibility: Add alt text, fix color contrast, ARIA labels
 *   - SEO: Add meta tags, improve mobile layout
 * 
 * YELLOW ⚠️: Warnings
 * - Not blocking, but should investigate
 * - May become errors if scores drop further
 * 
 * ============================================================================
 * ADJUSTING THRESHOLDS
 * ============================================================================
 * 
 * WHEN TO LOWER THRESHOLDS:
 * - Initial setup: Start with current scores, gradually improve
 * - Complex features: Rich interactions may require trade-offs
 * - Document reasons: "Why we accept 75 instead of 80 for X"
 * 
 * WHEN TO RAISE THRESHOLDS:
 * - After optimizations: Lock in improvements
 * - New project stages: Tighten as site matures
 * - Competitive advantage: Faster = better UX/SEO
 * 
 * HOW TO ADJUST:
 * 1. Run lighthouse locally: `lhci autorun`
 * 2. Note current scores
 * 3. Update thresholds in this file
 * 4. Document in CHANGELOG.md
 * 5. Commit: "perf: adjust Lighthouse threshold for X to Y because Z"
 * 
 * ============================================================================
 * PERFORMANCE OPTIMIZATION TIPS
 * ============================================================================
 * 
 * If Performance Score < 80:
 * 
 * 1. IMAGES:
 *    - Use WebP format
 *    - Lazy load off-screen images
 *    - Responsive images (srcset)
 *    - Compress with tools like ImageOptim
 * 
 * 2. JAVASCRIPT:
 *    - Code split (critical vs non-critical)
 *    - Defer non-critical scripts
 *    - Remove unused code
 *    - Minify bundles
 * 
 * 3. CSS:
 *    - Inline critical CSS
 *    - Purge unused Tailwind classes
 *    - Minify stylesheets
 * 
 * 4. FONTS:
 *    - Use font-display: swap
 *    - Subset fonts (only needed characters)
 *    - Self-host instead of Google Fonts
 * 
 * 5. CACHING:
 *    - Set long cache headers for static assets
 *    - Use content hashing in filenames
 * 
 * ============================================================================
 * RESOURCES
 * ============================================================================
 * 
 * - Lighthouse CI Docs: https://github.com/GoogleChrome/lighthouse-ci
 * - Web Vitals: https://web.dev/vitals/
 * - Performance Budgets: https://web.dev/performance-budgets-101/
 * - WCAG Guidelines: https://www.w3.org/WAI/WCAG21/quickref/
 * - Lighthouse Scoring: https://web.dev/performance-scoring/
 * 
 * ============================================================================
 */
