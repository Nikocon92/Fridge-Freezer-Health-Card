# Fridge Freezer Health Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

A Home Assistant Lovelace custom card that displays fridge/freezer health using:

- 5-minute moving-average interior temperature with trend arrow (↑ / → / ↓)
- Fridge or freezer temperature scale bar with ideal range highlighting
- Temperature position marker rendered below the color bar
- 24-hour moving-average temperature trend line (color-coded for cold/ideal/hot)
- Door-open events overlaid on the 24-hour trend as orange diamonds
- 24-hour primary stats (average temp, 5% low, 95% high, current power)
- Additional analytics tiles (24h energy in kWh, 24h duty cycle, current °C/min rate, and door opens in last hour)
- Responsive stat tile typography that auto-scales for compact/narrow card widths
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
- Door Sensor entity (optional)
- Card title (optional)
- Appliance type (`Fridge` or `Freezer`)
- Compressor running threshold (W)
- Defrost threshold (W)
- Maximum change rate (°C/min)

Additional behavior:

- `max_change_rate_celsius_per_minute` defaults to `0.5`.
- If the absolute 5-minute average rate exceeds this value, card health is flagged as **Alert**.
- Set this value to `0` to disable rate-based alerting.
- If a door sensor entity is set, the **Door Opens (1h)** tile counts closed→open transitions in the last hour.

Door sensor states treated as **open**:

- `on`
- `open`
- `opening`
- `true`
- `1`

All other states are treated as not open.

## Analytics Tiles

Primary row:

- **Avg Temp (24h)**: Mean of the 5-minute moving-average interior temperature values in the last 24 hours.
- **5% Low (24h)**: 5th percentile of the 24-hour moving-average temperature values.
- **95% High (24h)**: 95th percentile of the 24-hour moving-average temperature values.
- **Power Now**: Current power entity value.

Secondary row:

- **Energy (24h)**: Integrated energy from power history over the last 24 hours, shown in kWh.
- **Duty Cycle (24h)**: Percentage of the last 24 hours where power is above `compressor_running_watts`.
- **Temp Rate (Now)**: Current temperature change rate in °C/min from the moving-average history window.
- **Door Opens (1h)**: Number of closed→open transitions in the last hour (requires optional door sensor entity).

Door markers on temperature chart:

- Each door opening event is marked with an orange diamond at the event timestamp.
- Openings clustered within a 10-minute window are merged into one diamond.
- For merged clusters of 2 or more openings, the diamond displays the opening count.

Temperature ranges used by the bar and history colors:

- **Fridge** scale `-5°C to 15°C`, ideal `3°C to 10°C`
- **Freezer** scale `-35°C to 5°C`, ideal `-20°C to -10°C`
