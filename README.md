# Ride Control

Bike trainer control web app using Web Bluetooth. Tested with Wahoo Kickr Core 2 with Zwift Cog.

## Run

```bash
bun install
bun run dev
```

Open <http://localhost:4200> in current Chrome.

## Automatic reconnect

Persistent Web Bluetooth permissions are disabled by default in current Chromium builds. To allow the app to reconnect after a page reload:

1. Open `chrome://flags/#enable-web-bluetooth-new-permissions-backend`.
2. Enable **Use the new permissions backend for Web Bluetooth**.
3. Relaunch Chrome and pair the device once more from the app.
