# Appearance

The interface follows the light and dark usage-meter reference supplied for the UI refresh: neutral surfaces, rounded cards, restrained borders, clear figures, blue data accents and contrasting primary buttons.

Orbit starts in light mode. The appearance button in the public header, roadmap save bar and Poker project navigation switches between light and dark. An explicit choice is saved as `orbit-appearance` in this browser and applies across routes and tabs. No value is written on first load; blocked browser storage still permits changing the current page. Appearance does not modify or save workspace data.

`src/app/appearance.css` defines shared surface, text, accent and semantic tokens. `src/planner/visual-theme.css` and `src/components/planning-poker-visual.css` map the existing controls to those tokens. Scheduling geometry, segment proportions, user-defined colors and work-item identities remain in their original modules. Use `--ui-on-accent` for text on a blue fill and `--ui-on-primary` for text on primary buttons so both palettes remain readable.

The root bootstrap reads only the two permitted preference values before rendering the page, avoiding a light flash for a saved dark choice. The client provider synchronizes later changes without touching authentication storage.

`tests/browser/appearance.spec.ts` verifies keyboard switching, default behavior, reload/navigation/tab persistence, rendered text contrast, mobile overflow and real roadmap/Poker details against the disposable backend. Existing planning and multiplayer tests verify drag, resize, dependencies, estimation and publication behavior.

The public landing explains estimate versus calendar time, role-based stories, manual or automatic dependency scheduling, and Planning Poker. Its Roadmap/Poker preview is illustrative and supports keyboard tab navigation; it does not create or edit project data. Public copy and the preview use the same pastel palette and theme tokens as the app.

`LoadingState` supplies indeterminate, accessible loading feedback for route transitions and actual workspace/Poker requests, with reduced-motion support. The root `not-found.tsx` supplies a real HTTP 404 with routes home and to the roadmap.

The global cookie notice describes necessary sign-in and guest Poker cookies only. There are no optional analytics or advertising trackers. “Got it” records the versioned `orbit-cookie-notice` acknowledgment in local storage; this is not consent to future optional tracking. The footer can reopen the details, and `/cookies` explains the current storage behavior. Blocked storage does not prevent dismissal or sign-in. Any future optional tracker must add its own consent gating before it runs.

`tests/browser/public-experience.spec.ts` covers the public preview, mobile themes, cookie persistence and blocked storage, keyboard/focus behavior, the HTTP 404, and a real workspace request held long enough to verify its loading state.
