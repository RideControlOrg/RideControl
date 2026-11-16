# Architecture

Ride session data is held in a per-app TanStack Store and changed through atomic domain actions.
The `useSession` adapter owns recording timers and periodic IndexedDB checkpoints while exposing the
existing session controller API to the interface. Active-session metadata is stored separately from
chunked 100-sample records, while saved rides and immutable workout snapshots remain in their
existing IndexedDB stores. A gated one-time migration moves the former localStorage recovery record
and deletes it only after a successful write. Each Bluetooth hook exposes one explicit
connection phase instead of independently managed status flags. A single remembered-device catalog
loads browser-authorized devices once, then the trainer, heart-rate, and Click adapters start their
independent reconnections together. One GATT coordinator deduplicates overlapping requests
to the same physical device while allowing the trainer, heart-rate monitor, and controllers to
connect in parallel. Each device sequences its own service setup, so a sleeping device cannot block
an awake one and concurrent ATT requests cannot fight over one connection.
Shared bounded connection probes, required service and notification
setup, persistent advertisement-driven wake detection, retry backoff, scheduling, and notification subscriptions live in
plain domain controllers, while device-specific adapters own their GATT services. Bluetooth objects
and timers stay outside shared application state. The application component coordinates focused
dashboard regions,
uses an explicit overlay state for mutually exclusive trays, renders every side tray through one
animated and accessible shell, and delegates save/discard/start/continue transitions to a
store-backed session workflow. Temporary form inputs remain local React state.
Terrain workouts are an independent course domain layered over session distance. Each bundled
course keeps its editable metadata, map geometry, and elevation in an
individual JSON definition under `src/workouts`; shared factories derive the normalized runtime
course geometry and terrain behavior. Course geometry
produces grade, elevation, current and completed course counts, and map position. A shared terrain
engine turns grade into one bounded resistance target, independent of which route supplied it.
Virtual gearing applies a calibrated load curve across the active bike's modeled drivetrain ratios—including
1×11 and 1×12 setups—without feeding
the trainer's resulting speed, power, and cadence back into the same resistance target, so terrain
changes ramp smoothly while button-driven gear changes remain immediate. An optional IndexedDB
profile supplies total rider-and-bike mass and the configured drivetrain ratios to that calculation,
and retains a timestamped history whenever the rider weight actually changes;
the existing 53/39 chainrings, 12-speed 12–24 cassette, and neutral reference mass remain the
defaults. Recorded grade, resistance,
and elevation appear alongside the other session graphs for the full ride, and the course profile
repeats on every loop or out-and-back trip while point-to-point routes stop at their finish; route
progress, selected gear, and applied resistance stay portable in saved sessions and TCX files;
standard ride metrics also stay portable through FIT files.
Saved-session writes also maintain a versioned IndexedDB analytics cache containing compact
per-session contributions plus daily, weekly, monthly, yearly, and all-time rollups. New sessions
update those totals incrementally; replacement and deletion subtract the prior contribution, and
only a removed personal-best holder requires a scan of the compact contribution store to select
the next peak. Existing saved rides are indexed and backfilled once when the analytics stores are
created, so opening the calendar or statistics view never walks complete telemetry histories.
Shared domain utilities own unit conversions, numeric bounds, storage keys, metric presentation,
and repeated dialog and keyboard behavior so those rules stay consistent across views and exports.
