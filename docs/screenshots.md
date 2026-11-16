# README screenshots

Keep these images current with the UI they show. Refresh affected screenshots in the same change as a visible feature or design update, and replace the existing files so README links stay stable. This is a manual capture workflow, not an automated CI job.

## Capture

1. Run `bun run dev` and open `http://localhost:4200` in a separate Chrome profile with no personal ride data. Do not clear your regular browser's data or connect real devices for screenshots.
2. Dismiss the welcome screen and transient notices. Use dark mode, Imperial units, and the default tray width. Leave the rider name and photo blank.
3. For the dashboard, load [screenshot-dashboard.json](screenshot-dashboard.json), a synthetic 32-minute Prairie Roll ride, using the DevTools snippet below in this separate local-development browser profile. It replaces that profile's active ride. Reload, dismiss the restored-session notice, and close all trays. Leave the ride auto-paused: instantaneous metrics remain zero without real devices, while averages, maximums, totals, route progress, and all eight history charts show demo data.
4. In Chrome DevTools, enable the device toolbar, select a responsive desktop viewport of **1440 × 1000**, set device pixel ratio to **1**, and use **Capture full size screenshot**. Save the PNG as `docs/images/dashboard.png`. Include the entire dashboard, all ride-history charts, and the footer; the image height follows the page content.
5. Open **Profile → Personal details**. Leave notifications disabled, select **5 minutes**, enable encouragement, and enter **Spring century** with an event date 30 calendar days from capture. These settings save immediately in this separate browser profile; no notification permission is needed to show the preview.
6. Change the viewport to **1440 × 1300**, ensure the profile content is scrolled to the top, and use **Capture screenshot** (viewport only) for `docs/images/profile.png`. Use viewport-only captures for the remaining images too. The notification controls, event countdown preview, and save/cancel footer should all be visible.
7. Return to a **1440 × 1000** viewport. Close Profile, open **Pair devices**, and capture `docs/images/pairing.png` with the trainer, heart-rate monitor, and Zwift Click V2 pairing controls visible. Do not initiate pairing.
8. Close the pairing tray and open **Sessions → Calendar**. Use **Import FIT/TCX** to import [screenshot-sessions.tcx](screenshot-sessions.tcx) into this separate browser profile. It contains eight synthetic rides dated November 2–15, 2026, with descriptions explicitly labeled as demo data. Navigate the calendar to **November 2026**, select **November 15**, and capture `docs/images/sessions.png` at **1440 × 1000** with the populated calendar, selected ride metrics, demo description, and charts visible. Never import this fixture into a personal training history. Reuse the fixture rather than manufacturing app state or altering the DOM.
9. With the same eight demo rides imported, open **Sessions → List**, select **November 15**, and capture `docs/images/sessions-list.png` at **1440 × 1300**. Keep the list scrolled to the top so all eight rides are visible, and include the selected ride's synthetic-data description and the complete chart stack.
10. Open **Sessions → Statistics**, select **All** in the trend metric menu and **Week** for the period, and capture `docs/images/sessions-statistics.png` at **1440 × 1700**. Scroll the statistics panel to the top; include all-time totals, personal bests, and the entire weekly trend grid. The fixture has no rider-weight history, gear, or resistance samples; leave those truthful empty states rather than inventing measurements.
11. For `docs/images/tour-de-france.png`, use a **1200 × 1100** viewport and open **Workouts → Browse routes → Grand Tours → Tour de France 2026 → Stage 6: Pau - Gavarnie-Cèdre**. Keep the geographic map preview open rather than importing the route or capturing the dashboard outline. Set the viewport before opening the route, or reload afterward so the map fits its new dimensions. The full route and both endpoint markers must sit clear of the elevation overlays. Wait for map tiles and collection labels to finish loading before capturing. The current image comes from the [published stage page](https://ridecontrol.xyz/gpx/grand-tours/tour-de-france-2026/6), because the local route API was unavailable. Prefer the current local build when its route API is available; never substitute fabricated route data.
12. Visually review all PNGs and their README placement. Wait for tray transitions before capturing. Do not include browser chrome, DevTools, permission prompts, personal data, or transient toasts; do not alter the DOM or paint over the images.

If the layout outgrows these dimensions, adjust the capture dimensions and update this procedure together. Browser automation may follow the same steps through normal UI interactions; the saved images must still come from the real running app.

### Dashboard demo fixture

Run this only on the local development server in the disposable screenshot profile, never in a browser with a real active ride:

```js
const { persistActiveSession } = await import('/src/lib/saved-sessions.ts');
const response = await fetch('/docs/screenshot-dashboard.json');
if (!response.ok) throw new Error('Dashboard demo fixture unavailable');
await persistActiveSession(await response.json());
location.reload();
```

The fixture was generated through the session recorder with 192 synthetic ten-second samples, using the real Prairie Roll course to calculate grade and elevation. It is screenshot data, not real telemetry or a production demo mode. Keep the README demo-data caption. Capture the actual rendered app without changing the DOM or painting over the image.

## Review

- Dashboard: averages, maximums, totals, route progress, virtual shifting, and footer are visible without cropping. All eight history charts—speed, power, cadence, heart rate, gear, resistance, grade, and elevation—contain data. The README labels the paused ride as synthetic.
- Profile: current notification controls and the event countdown example are readable and unclipped.
- Pairing: all three device categories and reconnect instructions are visible, with no permission chooser open.
- Sessions: eight demo rides populate the calendar; the selected ride's metrics, charts, and synthetic-data description are visible. No personal activity data is included.
- Sessions list: all eight demo rides, the selected ride's metrics and demo description, and its full chart stack are visible.
- Sessions statistics: the eight-ride totals, personal bests, and weekly trends are visible without clipping. The README labels both new views as demo data.
- Tour de France: the collection and stage name, geographic map, entire route, start/finish markers, and elevation previews are clearly visible. Keep map attribution visible and ensure preview cards do not cover the route.
- README: the dashboard is visible directly; additional screenshots are in labeled expandable sections to keep the page short.
- Commit refreshed images with the UI change; do not leave screenshot refreshes for a later release.
