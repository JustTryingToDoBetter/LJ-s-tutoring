/**
 * ============================================================================
 * HTML-VALIDATE CONFIGURATION
 * ============================================================================
 * 
 * PURPOSE:
 * Validates HTML syntax, structure, and accessibility against W3C standards.
 * Catches typos, missing tags, invalid nesting, and semantic issues.
 * 
 * HOW IT FITS IN THE SYSTEM:
 * - Runs on: npm run qa:html
 * - Pre-commit: Included in lint checks (Husky)
 * - CI/CD: Part of QA workflow (.github/workflows/qa.yml)
 * - Files checked: *.html, guides/*.html
 * 
 * PHILOSOPHY:
 * Start with 'html-validate:recommended' (strict W3C compliance), then selectively
 * disable rules that conflict with real-world needs (SEO, accessibility, pragmatism).
 */

module.exports = {
  extends: ["html-validate:recommended"],
  
  rules: {
    /**
     * no-trailing-whitespace: OFF
     * REASON: Trailing whitespace doesn't affect HTML rendering or semantics
     * TRADE-OFF: EditorConfig/Prettier can handle whitespace cleanup
     * DECISION: Don't fail builds over cosmetic whitespace issues
     */
    "no-trailing-whitespace": "off",
    
    /**
     * long-title: OFF
     * REASON: SEO benefits from descriptive titles (even if they're long)
     * CONTEXT: Titles like "Maths Tutoring Cape Town & South Africa | Grade 8-12..."
     *          are intentionally detailed for search engine optimization
     * DECISION: Prioritize SEO over arbitrary length limits
     */
    "long-title": "off",
    
    /**
     * no-implicit-button-type: OFF
     * REASON: Browsers default to type="submit" which is usually correct
     * CONTEXT: Our forms intentionally use default submit behavior
     * TRADE-OFF: Explicit is better, but doesn't cause functional issues
     * DECISION: Accept browser defaults, be explicit only when needed
     */
    "no-implicit-button-type": "off",
    
    /**
     * no-redundant-role: OFF
     * REASON: Explicit ARIA roles improve compatibility with older assistive tech
     * CONTEXT: role="navigation" on <nav> is redundant in modern browsers
     *          but improves backward compatibility
     * DECISION: Favor accessibility over perfect semantic purity
     */
    "no-redundant-role": "off",
    
    /**
     * aria-label-misuse: OFF
     * REASON: We use aria-label defensively for better screen reader support
     * CONTEXT: Adding aria-label to elements with visible text can be helpful
     *          when the text content might be ambiguous out of context
     * EXAMPLE: <button>×</button> benefits from aria-label="Close"
     * DECISION: Err on the side of too much accessibility information
     */
    "aria-label-misuse": "off",
    
    /**
     * attribute-allowed-values: OFF
     * REASON: Some HTML5 features use custom/non-standard attribute values
     * CONTEXT: We may use data attributes or newer HTML features
     * TRADE-OFF: Could catch real errors, but also flags valid modern HTML
     * DECISION: Trust developer intent, catch actual issues in browser testing
     */
    "attribute-allowed-values": "off"
  },
  
  elements: [
    "html5"
  ]
};

/**
 * ============================================================================
 * HTML-VALIDATE CONFIGURATION
 * ============================================================================
 * 
 * PURPOSE:
 * Validates HTML syntax, structure, and accessibility against W3C standards.
 * Catches typos, missing tags, invalid nesting, and semantic issues.
 * 
 * HOW IT FITS IN THE SYSTEM:
 * - Runs on: npm run qa:html
 * - Pre-commit: Included in lint checks (Husky)
 * - CI/CD: Part of QA workflow (.github/workflows/qa.yml)
 * - Files checked: *.html, guides/*.html
 * 
 * PHILOSOPHY:
 * Start with 'html-validate:recommended' (strict W3C compliance), then selectively
 * disable rules that conflict with real-world needs (SEO, accessibility, pragmatism).
 * 
 * ============================================================================
 * RULES WE KEEP ENABLED (from recommended preset)
 * ============================================================================
 * 
 * These catch real problems and stay enabled:
 * 
 * - no-dup-id: Duplicate ID attributes (breaks JS selectors, accessibility)
 * - no-missing-references: Missing hrefs, srcs (broken links/images)
 * - require-closing-tags: Unclosed tags (malformed HTML)
 * - valid-nesting: Invalid tag nesting (e.g., <p> inside <p>)
 * - attribute-misuse: Attributes on wrong elements
 * - required-attributes: Missing required attrs (e.g., img without alt)
 * - semantic-structure: Proper heading hierarchy (h1 → h2 → h3, not h1 → h4)
 * - no-inline-style: Discourage inline styles (use classes instead)
 * - deprecated-element: Ban deprecated HTML4 tags (<font>, <center>, etc.)
 * 
 * ============================================================================
 * DISABLED RULES SUMMARY
 * ============================================================================
 * 
 * 6 rules disabled (documented above):
 * 1. no-trailing-whitespace   → Cosmetic, not functional
 * 2. long-title                → SEO benefits outweigh brevity
 * 3. no-implicit-button-type   → Browser defaults are correct
 * 4. no-redundant-role         → Backward compatibility > purity
 * 5. aria-label-misuse         → Favor over-annotation for a11y
 * 6. attribute-allowed-values  → Modern HTML patterns may flag
 * 
 * ============================================================================
 * RULE ADJUSTMENT PROCESS
 * ============================================================================
 * 
 * If a rule needs changing:
 * 
 * 1. Identify the rule causing issues:
 *    npm run qa:html (shows rule IDs in output)
 * 
 * 2. Research the rule:
 *    https://html-validate.org/rules/rule-name.html
 * 
 * 3. Determine if issue is real or false positive:
 *    - Real issue: Fix the HTML
 *    - False positive: Consider disabling with documentation
 * 
 * 4. Document the decision:
 *    - Add comment explaining why rule is off
 *    - Include context and trade-offs
 *    - Note in CHANGELOG.md
 * 
 * 5. Get team approval for rule changes
 * 
 * ============================================================================
 * INTEGRATION POINTS
 * ============================================================================
 * 
 * 1. MANUAL VALIDATION:
 *    npm run qa:html          # Validate all HTML files
 *    npm run lint:html        # Alias for qa:html
 * 
 * 2. PRE-COMMIT HOOK:
 *    .husky/pre-commit → npm run lint → includes HTML validation
 * 
 * 3. CI/CD PIPELINE:
 *    .github/workflows/qa.yml → qa:html step
 *    Blocks merge if HTML invalid
 * 
 * 4. WATCH MODE:
 *    Not available (HTML doesn't need compilation)
 *    Use Live Server in editor for preview
 * 
 * ============================================================================
 * ELEMENTS CONFIGURATION
 * ============================================================================
 * 
 * "elements": ["html5"]
 * 
 * This tells html-validate to use HTML5 element definitions.
 * Enables modern elements like <nav>, <article>, <section>, <main>, etc.
 * 
 * Alternative options (not used):
 * - "html4": Legacy HTML4 elements only
 * - Custom element definitions: For web components
 * 
 * ============================================================================
 * COMMON VALIDATION ERRORS & FIXES
 * ============================================================================
 * 
 * ERROR: "Element <img> is missing required attribute 'alt'"
 * FIX: Add alt="" for decorative images, alt="description" for content
 * 
 * ERROR: "Duplicate ID 'menu'"
 * FIX: Ensure all IDs are unique across the page
 * 
 * ERROR: "Element <div> is not permitted as child of <ul>"
 * FIX: Only <li> elements allowed directly inside <ul>
 * 
 * ERROR: "Heading level h4 skipped (expected h2)"
 * FIX: Maintain proper heading hierarchy: h1 → h2 → h3
 * 
 * ERROR: "Attribute 'onclick' is not allowed"
 * FIX: Use addEventListener in JavaScript instead of inline handlers
 * 
 * ============================================================================
 * ACCESSIBILITY INTEGRATION
 * ============================================================================
 * 
 * HTML validation is the FIRST LAYER of accessibility:
 * 
 * 1. HTML-VALIDATE (this tool):
 *    - Validates semantic structure
 *    - Checks ARIA attribute usage
 *    - Ensures alt text exists
 * 
 * 2. PA11Y-CI (npm run qa:a11y):
 *    - Tests actual accessibility in a browser
 *    - Checks color contrast
 *    - Validates ARIA implementation
 * 
 * 3. MANUAL TESTING:
 *    - Screen reader testing
 *    - Keyboard navigation
 *    - Different viewport sizes
 * 
 * Together these provide comprehensive HTML quality assurance.
 * 
 * ============================================================================
 */
