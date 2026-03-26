# UX Strategy And Governance

## Personas

- Student Achiever: Needs clear progress, low-friction practice, confidence cues.
- Tutor Operator: Needs fast session logging, low-error workflows, clear risk context.
- Admin Controller: Needs safe bulk actions, traceability, and exception handling.

## Core Journeys

- Student weekly loop: Login -> Dashboard snapshot -> Practice/session actions -> Progress feedback.
- Tutor delivery loop: Login -> Today sessions -> Log/update sessions -> Review reports.
- Admin governance loop: Login -> Review approvals/payroll/privacy queues -> Resolve/audit.

## Task Flows

- Session logging: Select assignment -> Enter times/notes -> Submit -> Confirmation/audit.
- Privacy request handling: Filter queue -> View request -> Fulfill/reject -> Record decision.
- Risk review: Open dashboard -> Inspect student risk reasons -> Action recommendation.

## Information Architecture Map

- Public: Home, Login, Guides, Privacy, Terms.
- Student: Dashboard, Career, Community, Reports.
- Tutor: Dashboard, Sessions, Assignments, Reports, Risk.
- Admin: Students, Tutors, Assignments, Approvals, Payroll, Audit, Privacy Requests, Retention.

## Design System Governance

- Tokens: color, spacing, typography, radius, elevation stored in shared CSS variables.
- Components: buttons, inputs, cards, tables, toasts, dialogs must support default/hover/focus/disabled/error states.
- Accessibility behavior: keyboard focus visible, semantic roles, ARIA for dynamic messaging.
- Change policy: visual breaking changes require before/after evidence and accessibility re-check.

## Content Design Standards

- Microcopy: use direct action verbs and plain language.
- Error messages: describe what failed, why, and the next action.
- Empty states: explain status and provide an obvious CTA.
- Security-sensitive messages: avoid leaking internal implementation details.

## UX KPI Framework

Mapped to analytics events in `ANALYTICS_EVENTS.md`.

- Activation: login success rate, first dashboard_viewed within 5 minutes.
- Engagement: game_session_start -> game_session_end completion rate.
- Conversion: dashboard_viewed -> score_submitted ratio.
- Reliability: score_submitted -> score_validated success rate.
- Retention proxy: streak_credited events per active user/week.

## Mobile-First And Accessibility Design Gates

- Mobile-first layouts at <= 390px and <= 768px must keep primary actions above first fold.
- Touch target minimum: 44x44 px.
- Keyboard flow: all interactive controls reachable and operable without pointer.
- Contrast: WCAG AA minimum for text and essential UI states.
- Regression gate: PRs changing major flows must include desktop/mobile screenshots and a11y verification notes.
