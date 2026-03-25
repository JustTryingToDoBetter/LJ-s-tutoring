<!--
============================================================================
PULL REQUEST TEMPLATE
============================================================================

PURPOSE:
This template ensures consistent, high-quality pull requests by providing
a structured checklist and documentation format.

HOW IT FITS IN THE SYSTEM:
- Appears automatically when creating a PR
- Enforces the "rules" part of the mental model
- Creates feedback loop between code and documentation
- Ensures reviewers have context for changes

INSTRUCTIONS:
1. Fill in all sections below
2. Check all applicable boxes
3. Delete sections that don't apply
4. Provide enough detail for reviewers to understand changes
============================================================================
-->

## 📝 Description

### What does this PR do?
<!-- Provide a clear, concise summary of the changes -->



### Why is this change necessary?
<!-- Explain the motivation behind this PR -->



### Related Issues
<!-- Link to related issues (e.g., Fixes #123, Relates to #456) -->



---

## 🔍 Type of Change

<!-- Check all that apply -->

- [ ] 🐛 **Bug fix** (non-breaking change that fixes an issue)
- [ ] ✨ **New feature** (non-breaking change that adds functionality)
- [ ] 💥 **Breaking change** (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📝 **Documentation update** (changes to README, comments, or docs)
- [ ] 🎨 **Style/UI change** (CSS, layout, visual updates)
- [ ] ♻️ **Refactoring** (code restructuring without behavior change)
- [ ] ⚡ **Performance improvement** (faster load times, optimization)
- [ ] 🔒 **Security fix** (addresses vulnerability or security concern)
- [ ] ⚙️ **Configuration change** (build, CI/CD, dependencies)
- [ ] 🧪 **Test update** (adding or updating tests)

---

## ✅ Pre-Submission Checklist

### Code Quality
- [ ] Code follows project style guidelines (ESLint passes)
- [ ] HTML validates correctly (`npm run qa:html`)
- [ ] No console.log statements left in production code
- [ ] Comments added for complex logic
- [ ] Functions are documented with purpose and parameters

### Testing
- [ ] Tested locally on desktop
- [ ] Tested locally on mobile/responsive viewports
- [ ] Tested in multiple browsers (Chrome, Firefox, Safari, Edge)
- [ ] Dark mode tested (if applicable)
- [ ] All interactive features work (forms, buttons, links)

### Quality Assurance
- [ ] `npm run lint` passes without errors
- [ ] `npm run qa:quick` passes (HTML + links)
- [ ] `npm run build` completes successfully
- [ ] No new console errors or warnings

### Accessibility
- [ ] All images have appropriate alt text
- [ ] Interactive elements are keyboard accessible (tab navigation works)
- [ ] Color contrast meets WCAG 2.0 AA standards
- [ ] ARIA labels added where necessary
- [ ] Screen reader tested (if major UI changes)

### Performance
- [ ] Images optimized (compressed, appropriate sizes)
- [ ] No unnecessary dependencies added
- [ ] CSS/JS changes don't significantly increase bundle size
- [ ] Lazy loading implemented for below-the-fold content (if applicable)

### Security
- [ ] No sensitive data (API keys, passwords) committed
- [ ] User input properly sanitized (if applicable)
- [ ] External links use `rel="noopener noreferrer"` where appropriate
- [ ] No new XSS or injection vulnerabilities introduced

### Documentation
- [ ] README.md updated (if needed)
- [ ] CHANGELOG.md updated with changes
- [ ] Code comments explain "why", not just "what"
- [ ] Configuration changes documented

### Git Hygiene
- [ ] Commit messages are clear and descriptive
- [ ] No unnecessary files committed (node_modules, .env, .DS_Store, etc.)
- [ ] Branch is up to date with main
- [ ] No merge conflicts

---

## 🖼️ Screenshots / Screen Recordings

<!-- If this PR includes visual changes, add screenshots or recordings -->
<!-- Desktop and mobile screenshots are helpful -->

### Before
<!-- Screenshot of UI/behavior before changes -->



### After
<!-- Screenshot of UI/behavior after changes -->



---

## 🧪 Testing Instructions

<!-- Step-by-step instructions for reviewers to test your changes -->

1. 
2. 
3. 

**Expected Behavior:**
<!-- What should happen when following the above steps -->



---

## 📊 Performance Impact

<!-- Complete this section if changes affect performance -->

### Bundle Size Changes
- JavaScript: <!-- e.g., +2KB, -5KB, no change -->
- CSS: <!-- e.g., +1KB, -3KB, no change -->
- Images: <!-- e.g., added 3 images (100KB total) -->

### Lighthouse Scores
<!-- Run `lhci autorun` locally and note any significant changes -->
- Performance: <!-- e.g., 95 → 93 (acceptable due to...) -->
- Accessibility: <!-- e.g., 98 (no change) -->
- Best Practices: <!-- e.g., 100 (no change) -->
- SEO: <!-- e.g., 100 (no change) -->

**Explanation of Changes:**
<!-- If scores dropped, explain why it's acceptable or how you'll address it -->



---

## 🔗 Dependencies

<!-- List any new dependencies added and justify them -->

### New Dependencies
- None

<!-- If adding dependencies:
- Package name: `package-name@version`
- Purpose: Why this package is needed
- Size impact: How much does it add to bundle?
- Alternatives considered: What other options did you evaluate?
-->

---

## 🚀 Deployment Considerations

<!-- Check all that apply -->

- [ ] No special deployment steps needed
- [ ] Environment variables need to be updated (list below)
- [ ] Database migration required (N/A for static site)
- [ ] Cache needs to be cleared after deployment
- [ ] Requires configuration changes in hosting platform

### Environment Variables to Update
<!-- List any new or changed environment variables -->



### Rollback Plan
<!-- How to revert if this causes issues in production -->



---

## 📚 Additional Context

<!-- Any other information reviewers should know -->
<!-- Links to design mockups, external resources, related PRs, etc. -->



---

## 🎯 Reviewer Focus Areas

<!-- Guide reviewers on what to pay special attention to -->

Please especially review:
- 
- 
- 

---

## ✍️ Author's Note to Reviewers

<!-- Personal message to reviewers about this PR -->
<!-- Highlight areas where you want feedback -->
<!-- Explain any unusual decisions or trade-offs -->



---

<!--
============================================================================
REVIEW GUIDELINES FOR REVIEWERS
============================================================================

When reviewing this PR, check:

1. CODE QUALITY:
   - Is the code readable and maintainable?
   - Are there any obvious bugs or edge cases?
   - Does it follow project conventions?

2. FUNCTIONALITY:
   - Does it actually solve the stated problem?
   - Are there unintended side effects?
   - Does it work in all scenarios?

3. TESTING:
   - Are the manual tests sufficient?
   - Do we need additional test coverage?

4. PERFORMANCE:
   - Will this slow down the site?
   - Are there optimization opportunities?

5. SECURITY:
   - Any potential vulnerabilities?
   - Is user input properly handled?

6. DOCUMENTATION:
   - Is the code self-documenting or well-commented?
   - Are breaking changes clearly explained?

7. COMPATIBILITY:
   - Works in target browsers?
   - Mobile-friendly?
   - Accessible?

============================================================================
APPROVAL CRITERIA
============================================================================

✅ Approve when:
- All checklist items completed
- CI/CD passes (QA + Lighthouse)
- Code is clean and well-documented
- No security concerns
- Functionality tested and verified

❌ Request changes when:
- Checklist incomplete
- CI/CD failing
- Security issues present
- Breaking changes not documented
- Code quality concerns

💬 Comment when:
- Suggestions for improvement (non-blocking)
- Questions about approach
- Praise for good work
- Learning opportunities

============================================================================
-->
