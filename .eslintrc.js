/**
 * ============================================================================
 * ESLINT CONFIGURATION
 * ============================================================================
 * 
 * PURPOSE:
 * Enforces JavaScript code quality and style consistency across the project.
 * Catches common errors, enforces best practices, and maintains readable code.
 * 
 * HOW IT FITS IN THE SYSTEM:
 * - Runs automatically on pre-commit (via Husky hooks)
 * - Manual execution: npm run lint:js
 * - CI/CD: Inherits from pre-commit hook validation
 * - IDE integration: Most editors auto-detect and show inline warnings
 * 
 * PHILOSOPHY:
 * - Strict enough to catch real problems
 * - Lenient enough to not obstruct development
 * - Focused on maintainability and team consistency
 */

module.exports = {
  // ============================================================================
  // ENVIRONMENT - Defines global variables available in the code
  // ============================================================================
  env: {
    browser: true,  // Browser globals (window, document, navigator, etc.)
    es2021: true,   // ES2021 globals and syntax (Promise, Map, Set, etc.)
    node: true,     // Node.js globals (require, module, __dirname, etc.)
  },

  // ============================================================================
  // BASE RULESET - Start with ESLint recommended rules
  // ============================================================================
  // This provides sensible defaults for catching common errors
  // Example rules: no-undef, no-unused-vars, no-unreachable, etc.
  extends: 'eslint:recommended',

  // ============================================================================
  // PARSER OPTIONS - How to parse JavaScript code
  // ============================================================================
  parserOptions: {
    ecmaVersion: 'latest',  // Use latest ECMAScript features
    sourceType: 'script',   // Files are scripts (not ES modules), use IIFE pattern
  },

  // ============================================================================
  // CUSTOM RULES - Project-specific overrides and additions
  // ============================================================================
  rules: {
    // --------------------------------------------------------------------------
    // BEST PRACTICES - Catch common mistakes and enforce good patterns
    // --------------------------------------------------------------------------
    
    /**
     * no-unused-vars: Warn about variables that are declared but never used
     * LEVEL: 'warn' (not 'error') - doesn't block commits, just reminds
     * REASON: Helps clean up code, but sometimes you need temporary variables
     * EXCEPTION: Variables starting with _ are ignored (e.g., _unusedParam)
     */
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    
    /**
     * no-console: Warn about console.log/info/debug (but allow warn/error)
     * LEVEL: 'warn' - console.log is useful for debugging, don't block it
     * REASON: Prevents accidental console.log in production
     * ALLOWED: console.warn() and console.error() are intentional
     */
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    
    /**
     * eqeqeq: Require === and !== (never use == or !=)
     * LEVEL: 'error' - this blocks commits
     * REASON: == has confusing type coercion rules ([] == false is true!)
     * EXAMPLE FAIL: if (x == 0) ❌
     * EXAMPLE PASS: if (x === 0) ✅
     */
    'eqeqeq': ['error', 'always'],
    
    /**
     * curly: Require curly braces around all control structures
     * LEVEL: 'error' - blocks commits
     * REASON: Prevents subtle bugs from missing braces
     * EXAMPLE FAIL: if (x) return; ❌
     * EXAMPLE PASS: if (x) { return; } ✅
     */
    'curly': ['error', 'all'],
    
    /**
     * no-var: Ban var keyword (use const/let instead)
     * LEVEL: 'error' - blocks commits
     * REASON: var has confusing hoisting behavior and function scope
     * MIGRATION: Use const for immutable, let for mutable variables
     */
    'no-var': 'error',
    
    /**
     * prefer-const: Suggest const if variable is never reassigned
     * LEVEL: 'error' - blocks commits
     * REASON: const makes code more predictable and catches accidental mutations
     * EXAMPLE: let x = 5; (never changes) → should be const x = 5;
     */
    'prefer-const': 'error',
    
    // --------------------------------------------------------------------------
    // STYLE - Enforce consistent code formatting
    // --------------------------------------------------------------------------
    
    /**
     * indent: Require 2-space indentation
     * LEVEL: 'error' - blocks commits
     * REASON: Consistent indentation improves readability
     * NOTE: Most editors auto-format to this
     */
    'indent': ['error', 2],
    
    /**
     * quotes: Require single quotes for strings (except to avoid escaping)
     * LEVEL: 'error' - blocks commits
     * REASON: Consistency, single quotes are easier to type
     * EXCEPTION: "Don't" is allowed (avoids escaping apostrophe)
     */
    'quotes': ['error', 'single', { avoidEscape: true }],
    
    /**
     * semi: Require semicolons at end of statements
     * LEVEL: 'error' - blocks commits
     * REASON: Prevents ASI (Automatic Semicolon Insertion) bugs
     * EXAMPLE: Missing semicolon can break on minification
     */
    'semi': ['error', 'always'],
    
    /**
     * comma-dangle: Require trailing commas in multi-line structures
     * LEVEL: 'error' - blocks commits
     * REASON: Cleaner git diffs when adding/removing array items
     * EXAMPLE:
     *   const arr = [
     *     'item1',
     *     'item2', ← trailing comma
     *   ];
     */
    'comma-dangle': ['error', 'always-multiline'],
  },

  // ============================================================================
  // IGNORE PATTERNS - Directories/files to skip linting
  // ============================================================================
  // REASON: These are generated/external files we don't control
  ignorePatterns: ['dist/', 'node_modules/'],

  // ============================================================================
  // FILE OVERRIDES - Targeted parser/setting tweaks for specific files
  // ============================================================================
  overrides: [
    {
      files: ['assets/arcade.js'],
      parserOptions: {
        sourceType: 'module',
      },
    },
  ],
};

/**
 * ============================================================================
 * DISABLED RULES RATIONALE
 * ============================================================================
 * 
 * Rules NOT enabled (and why):
 * 
 * 1. max-len (line length limit):
 *    - REASON: Modern editors wrap automatically
 *    - TRADE-OFF: Would require breaking many readable lines
 * 
 * 2. no-magic-numbers:
 *    - REASON: Too strict for our use case (many valid literals)
 *    - EXAMPLE: setTimeout(fn, 1000) is clear, no need for constant
 * 
 * 3. complexity (cyclomatic complexity limit):
 *    - REASON: Would flag legitimate complex UI logic
 *    - ALTERNATIVE: Code review catches overly complex functions
 * 
 * 4. max-lines-per-function:
 *    - REASON: Some functions (like form handlers) are naturally long
 *    - ALTERNATIVE: Split when it makes sense, not by arbitrary line count
 * 
 * 5. no-param-reassign:
 *    - REASON: Some DOM manipulation patterns benefit from mutation
 *    - TRADE-OFF: Team is aware of mutation risks
 * 
 * 6. require-jsdoc:
 *    - REASON: Not using JSDoc typing system (not TypeScript)
 *    - ALTERNATIVE: Inline comments explain complex logic
 * 
 * ============================================================================
 * RULE ADJUSTMENT PROCESS
 * ============================================================================
 * 
 * If a rule is too strict or too lenient:
 * 
 * 1. Discuss with team (don't unilaterally change)
 * 2. Update this file with rationale
 * 3. Run: npm run lint:js -- --fix (auto-fix existing code)
 * 4. Commit changes: "chore: adjust ESLint rule X because Y"
 * 5. Update CHANGELOG.md
 * 
 * ============================================================================
 * INTEGRATION POINTS
 * ============================================================================
 * 
 * 1. PRE-COMMIT HOOK (.husky/pre-commit):
 *    - Runs: npm run lint
 *    - Blocks commit if errors found
 *    - Only checks staged files (fast)
 * 
 * 2. CI/CD PIPELINE (.github/workflows/qa.yml):
 *    - Inherits pre-commit validation
 *    - Double-check in case hooks bypassed
 * 
 * 3. IDE INTEGRATION:
 *    - VS Code: ESLint extension shows inline warnings
 *    - WebStorm: Built-in support
 *    - Others: Check editor ESLint plugin
 * 
 * 4. MANUAL EXECUTION:
 *    - Check all files: npm run lint:js
 *    - Auto-fix: npm run lint:js -- --fix
 *    - Specific file: npx eslint path/to/file.js
 * 
 * ============================================================================
 */
