# Fridge Freezer Health Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

A Home Assistant Lovelace custom card that displays:

- Ambient Temperature
- Interior Temperature
- Power Consumption

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
- History period in days (supports decimals, e.g. `0.5` = 12 hours, `2.5` = 60 hours, max `365`)
