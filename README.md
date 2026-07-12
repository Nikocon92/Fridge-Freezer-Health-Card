# Fridge Freezer Health Card

A Home Assistant Lovelace custom card that displays:

- Ambient Temperature
- Interior Temperature
- Power Consumption

Each entity is selected through Home Assistant's built-in entity picker in the card editor.

## Installation

1. Add `fridge-freezer-health-card.js` as a Lovelace resource.
2. Add a **Custom: Fridge Freezer Health Card** card to your dashboard.
3. In the card editor, choose:
   - Ambient Temperature entity (°C)
   - Interior Temperature entity (°C)
   - Power Consumption entity (W)
   - History period in days (supports decimals, e.g. `0.5` = 12 hours, `2.5` = 60 hours)
