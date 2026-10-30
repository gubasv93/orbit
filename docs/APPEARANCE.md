# Appearance

The interface follows the light and dark usage-meter reference supplied for the UI refresh: neutral surfaces, rounded cards, restrained borders, clear figures, blue data accents and contrasting primary buttons.

Orbit starts in light mode. The appearance button in the public header, roadmap save bar and Poker project navigation switches between light and dark. An explicit choice is saved as `orbit-appearance` in this browser and applies across routes and tabs. No value is written on first load; blocked browser storage still permits changing the current page. Appearance does not modify or save workspace data.

`src/app/appearance.css` defines shared surface, text, accent and semantic tokens. `src/planner/visual-theme.css` and `src/components/planning-poker-visual.css` map the existing controls to those tokens. Scheduling geometry, segment proportions, user-defined colors and work-item identities remain in their original modules. Use `--ui-on-accent` for text on a blue fill and `--ui-on-primary` for text on primary buttons so both palettes remain readable.

The root bootstrap reads only the two permitted preference values before rendering the page, avoiding a light flash for a saved dark choice. The client provider synchronizes later changes without touching authentication storage.

`tests/browser/appearance.spec.ts` verifies keyboard switching, default behavior, reload/navigation/tab persistence, rendered text contrast, mobile overflow and real roadmap/Poker details against the disposable backend. Existing planning and multiplayer tests verify drag, resize, dependencies, estimation and publication behavior.
