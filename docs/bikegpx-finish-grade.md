# BikeGPX finish grade investigation

Checked on October 1, 2026 against Ride Control's public prepared-route catalog.

## Cause and correction

`workoutTerrainAtDistance` looks up to 150 meters ahead to calculate trainer grade.
For point-to-point courses, it shortens that distance to the finish. The point lookup
interprets the exact course distance as the start of the next lap, however, so the
calculation substituted the starting elevation for the finishing elevation. The error
grows as the remaining distance shrinks. The displayed profile uses the actual course
geometry and therefore does not show this artificial hill or descent.

The terrain engine now samples the actual final point when point-to-point lookahead
reaches the finish. Normal lap repetition and loop/out-and-back lookahead are unchanged.
This applies to existing imported workouts as well as future imports; it does not
require changing provider data or reimporting routes.

## Cykelbana Godby - Finby (2635)

The current prepared course is 12.403419 km long. Its starting elevation is 11.4 m,
and its finishing elevation is 0.347576 m. The final stretch descends gently.

| Distance to finish | Previous grade | Corrected grade | Previous base resistance | Corrected base resistance |
| --- | --- | --- | --- | --- |
| 150 m | +6.97% | -0.40% | 28% | 11% |
| 100 m | +10.62% | -0.44% | 36% | 11% |
| 50 m | +15.00% | -0.45% | 46% | 11% |
| 10 m | +15.00% | -0.43% | 46% | 11% |

Resistance values precede virtual gearing. The previous grade hits the terrain
engine's +15% cap despite the descent visible in the profile.

The regression fixture retains the real starting point and the final 300 meters
plus their preceding interpolation point. Tests cover the 150-meter boundary,
positions down to 10 cm before the finish, and repeated laps. Synthetic courses
also cover flat, climbing, and descending finishes with both higher and lower starts.

## Other routes and audit limits

The catalog contained 6,124 routes. Complete prepared geometry was retrieved for the
first 95 routes in catalog order before the public API returned HTTP 429. These are
not a random sample, and the counts below must not be extrapolated to the full catalog.

- 94 point-to-point routes and one loop were valid after the application's normal restoration.
- 41 point-to-point routes had artificial increases in finish resistance.
- 53 point-to-point routes had artificial decreases in finish resistance.
- All 2,177 endpoint checks against the corrected engine passed, including repeated laps.
- Other affected routes include Lago del Desierto - Candelario Mancilla (682),
  Eastern Dandenong Ranges Trail (11781), Brisbane Valley Rail Trail (3600),
  Darwin Rail Trail (8139), and Mascot - Darlinghurst (4979).

The remaining 6,029 routes have **not** had their geometry checked. Authenticated
bulk access to the stored public route data was unavailable because the Cloudflare
CLI had no active authentication token. Completing that inventory requires restoring
the existing Cloudflare login or supplying an export of the prepared-route records.

The code correction covers the common endpoint-wrap defect for every point-to-point
course. It does not establish that every route is free of unrelated source-data issues.

## Queued production audit

The backend now implements a dedicated, resumable audit on the existing
`ridecontrol-gpx-processing` Queue. After deploying both repositories, run
`bun run gpx:audit:production start` from the backend checkout. The production job has
not been started. See the backend's `docs/gpx-audit.md` for status, export, and retries.

The job snapshots the stored catalog, checks every route directly in KV (including
already prepared routes), and records per-route geometry findings and exposure to the
old finish-wrap defect. The latter uses the exact endpoint-elevation difference, avoiding
any duplicate implementation of frontend interpolation. This is an audit of stored data;
frontend regression tests exercise the corrected live terrain calculation.

A paginated finalizer accounts for every catalog ID before creating a completed summary.
Storage failures remain pending for retries, and resubmitting the same run ID resumes
unfinished work. Audit records expire seven days after the original start, so they do not
accumulate indefinitely. Valid route geometry is preserved. Reprocessing is reserved for
separate data defects found during the full audit.

The audit code was also checked locally against the same 95 downloaded routes: 41 exposed
to a harder finish, 53 to an easier finish, and one unaffected loop. All 95 passed its
geometry checks. This is not a substitute for the full production run.

Validation: `bun run ci` passed Biome, Tailwind diagnostics, 418 unit tests, TypeScript,
and the production build. Browser verification of the fix was unavailable because no
Ride Control frontend development process was running; no server was started.
