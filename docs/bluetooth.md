# Bluetooth compatibility and reconnect

Bike trainer control web app using Web Bluetooth. Tested with Wahoo KICKR Core 2 and Zwift Cog, with standards-based support for Bluetooth FTMS trainers such as the Elite DIRETO XR-T and initial support for Zwift Click V2.

Ride Control currently tests Web Bluetooth only in desktop Chrome. Bluetooth does not work in
Brave.

Persistent Web Bluetooth permissions are disabled by default in current Chromium builds. To allow the app to reconnect after a page reload:

1. Open `chrome://flags/#enable-web-bluetooth-new-permissions-backend`.
2. Enable **Use the new permissions backend for Web Bluetooth**.
3. Relaunch Chrome and pair the device once more from the app.

The paired-devices panel detects Chrome's persistent reconnect capability and replaces these setup steps with a configured confirmation when it is available.

Remembered permission alone does not guarantee that Chrome can connect to a device: it may still
need advertisement discovery to refresh that device's availability. In a live TRACKR HR recovery,
direct GATT retries repeatedly reported “Bluetooth Device is no longer in range” until advertisement
watching was enabled on the same remembered device; it then connected and delivered heart-rate
measurements without a refresh or re-pair. Heart-rate monitors therefore use the same discovery
policy as trainers, alongside bounded direct GATT retries that do not depend on an advertisement
arriving or watching succeeding. This recovery was observed on that device in Chrome, not verified
across all heart-rate hardware.
