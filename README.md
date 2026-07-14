# Fridge Freezer Health Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

A Home Assistant Lovelace custom card that displays fridge/freezer health using:

- 5-minute moving-average interior temperature with trend arrow (↑ / → / ↓)
- Fridge or freezer temperature scale bar with ideal range highlighting
- 24-hour moving-average temperature trend line (color-coded for cold/ideal/hot)
- 24-hour stats (average, 5% low, 95% high, and current power)
- 24-hour compressor activity timeline (off/running/defrost)

Each entity is selected through Home Assistant's built-in entity picker in the card editor.

## Installation

### HACS (Recommended)

1. Open HACS in your Home Assistant instance.
2. Go to **Frontend**.
3. Click the menu (⋮) in the top-right corner and select **Custom repositories**.
4. Add `https://github.com/Nikocon92/Fridge-Freezer-Health-Card` as a **Dashboard** (Lovelace) category repository.
5. Find **Fridge Freezer Health Card** in the list and click **Download**.
6. Reload your browser.
7. Add a **Custom: Fridge Freezer Health Card** card to your dashboard.

### Manual

1. Download `fridge-freezer-health-card.js` from the [latest release](https://github.com/Nikocon92/Fridge-Freezer-Health-Card/releases/latest) (or directly from this repository).
2. Copy the file to your Home Assistant `config/www/` folder.
3. Add `/local/fridge-freezer-health-card.js` as a Lovelace resource (**Settings → Dashboards → Resources**).
4. Reload your browser.
5. Add a **Custom: Fridge Freezer Health Card** card to your dashboard.

## Configuration

In the card editor, choose:

- Ambient Temperature entity (°C)
- Interior Temperature entity (°C)
- Power Consumption entity (W)
- Card title (optional)
- Appliance type (`Fridge` or `Freezer`)
- Compressor running threshold (W)
- Defrost threshold (W)
- Maximum change rate (°C/min)

Additional behavior:

- `max_change_rate_celsius_per_minute` defaults to `0.5`.
- If the absolute 5-minute average rate exceeds this value, card health is flagged as **Alert**.
- Set this value to `0` to disable rate-based alerting.

Temperature ranges used by the bar and history colors:

- **Fridge** scale `-5°C to 15°C`, ideal `3°C to 10°C`
- **Freezer** scale `-35°C to 5°C`, ideal `-20°C to -10°C`
