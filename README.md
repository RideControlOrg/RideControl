# Ride Control

Control your indoor bike trainer from Google Chrome. No account required; your ride data stays in your browser.

**[Open Ride Control](https://ridecontrol.xyz)**

- Connect Bluetooth FTMS trainers, heart-rate monitors, and supported shifting controls.
- Ride terrain workouts or import GPX routes, with virtual shifting and live ride metrics.
- Save, review, export, and resume sessions.
- Customize ride reminders, motivational messages, and event countdowns in your profile.

![Dashboard with a synthetic Prairie Roll ride and data in every history chart](docs/images/dashboard.png)

*Demo data; ride paused.*

<details>
<summary>Profile and desktop notification settings</summary>

![Profile settings with five-minute ride updates and a customizable event countdown](docs/images/profile.png)

</details>

<details>
<summary>Device pairing</summary>

![Pairing controls for a smart trainer, heart-rate monitor, and Zwift Click V2](docs/images/pairing.png)

</details>

<details>
<summary>Sessions calendar</summary>

![Sessions calendar populated with eight synthetic demo rides, showing selected ride metrics and charts](docs/images/sessions.png)

</details>

<details>
<summary>Sessions list</summary>

![Sessions list with eight synthetic demo rides and the selected ride's metrics and charts](docs/images/sessions-list.png)

*Demo data.*

</details>

<details>
<summary>Sessions statistics</summary>

![Statistics for eight synthetic demo rides, including all-time totals, personal bests, and weekly trends](docs/images/sessions-statistics.png)

*Demo data.*

</details>

<details>
<summary>Tour de France route</summary>

Tour de France 2026, Stage 6: Pau–Gavarnie-Cèdre, in the route browser.

![Tour de France Stage 6 on a geographic map, with the full route, start and finish markers, and elevation previews visible](docs/images/tour-de-france.png)

</details>

## Run locally

Use Bun 1.4.4 and Node.js 26.13.1:

```sh
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:4200` in Google Chrome. Bluetooth requires a supported device and permission to connect; see [compatibility and reconnect setup](docs/bluetooth.md).

## Documentation

- [Features and behavior](docs/features.md)
- [Architecture](docs/architecture.md)
- [Development and deployment](docs/development.md)
- [Refreshing screenshots](docs/screenshots.md)

## License

Copyright (C) 2026 Ride Control. [GNU GPL v3](LICENSE).
