const HISTORY_LOOKBACK_HOURS = 24;
const MOVING_AVERAGE_WINDOW_MINUTES = 5;
// Default maximum change rate threshold in °C/min.
const TREND_STABLE_RATE_CELSIUS_PER_MINUTE = 0.5;
const HEALTH_WARNING_BAND_CELSIUS = 2;
const HISTORY_REFRESH_MS = 60 * 1000;
const DEFAULT_RUNNING_WATTS = 50;
const DEFAULT_DEFROST_WATTS = 180;
const MAX_POWER_THRESHOLD_WATTS = 10000;

const MODE_SPECS = {
  fridge: {
    label: 'Fridge',
    min: -5,
    max: 15,
    goodMin: 3,
    goodMax: 10,
  },
  freezer: {
    label: 'Freezer',
    min: -35,
    max: 5,
    goodMin: -20,
    goodMax: -10,
  },
};

class FridgeFreezerHealthCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement('fridge-freezer-health-card-editor');
  }

  static getStubConfig() {
    return {
      ambient_temperature_entity: '',
      interior_temperature_entity: '',
      power_consumption_entity: '',
      door_sensor_entity: '',
      card_title: '',
      appliance_type: 'fridge',
      compressor_running_watts: DEFAULT_RUNNING_WATTS,
      defrost_watts: DEFAULT_DEFROST_WATTS,
      max_change_rate_celsius_per_minute: TREND_STABLE_RATE_CELSIUS_PER_MINUTE,
    };
  }

  setConfig(config) {
    this._config = {
      ...FridgeFreezerHealthCard.getStubConfig(),
      ...config,
    };

    if (!this._card) {
      this._card = document.createElement('ha-card');
      this._content = document.createElement('div');
      this._content.className = 'card-content';
      this._card.style.background = 'var(--ha-card-background, var(--card-background-color))';
      this._card.style.color = 'var(--primary-text-color)';
      this._card.appendChild(this._content);
      this.appendChild(this._card);
    }

    this._buildLayout();
    this._historyCache = null;
    if (this._hass) {
      this.hass = this._hass;
    }
  }

  _buildLayout() {
    this._content.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'health-layout';

    const summaryHeader = document.createElement('div');
    summaryHeader.className = 'summary-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'title-row';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'title-block';
    const applianceIcon = document.createElement('span');
    applianceIcon.className = 'appliance-icon';
    const titleValue = document.createElement('span');
    titleValue.className = 'title-value';
    titleBlock.appendChild(applianceIcon);
    titleBlock.appendChild(titleValue);

    const healthValue = document.createElement('div');
    healthValue.className = 'health-value';
    healthValue.textContent = '● Unavailable';

    titleRow.appendChild(titleBlock);
    titleRow.appendChild(healthValue);

    const currentTempLabel = document.createElement('div');
    currentTempLabel.className = 'summary-label';
    currentTempLabel.textContent = 'Current Temperature (5 min avg)';

    const currentTempValue = document.createElement('div');
    currentTempValue.className = 'summary-value';
    currentTempValue.textContent = '—';

    const ambientTempValue = document.createElement('div');
    ambientTempValue.className = 'summary-sub-value';
    ambientTempValue.textContent = 'Ambient: —';

    summaryHeader.appendChild(titleRow);
    summaryHeader.appendChild(currentTempLabel);
    summaryHeader.appendChild(currentTempValue);
    summaryHeader.appendChild(ambientTempValue);

    const tempBarSection = document.createElement('div');
    tempBarSection.className = 'temperature-bar-section';

    const tempScaleLabels = document.createElement('div');
    tempScaleLabels.className = 'temperature-scale-labels';

    const scaleMin = document.createElement('span');
    const scaleIdeal = document.createElement('span');
    const scaleMax = document.createElement('span');
    tempScaleLabels.appendChild(scaleMin);
    tempScaleLabels.appendChild(scaleIdeal);
    tempScaleLabels.appendChild(scaleMax);

    const tempBar = document.createElement('div');
    tempBar.className = 'temperature-bar';

    const tempArrow = document.createElement('div');
    tempArrow.className = 'temperature-arrow';
    tempArrow.textContent = '▼';
    tempBar.appendChild(tempArrow);

    tempBarSection.appendChild(tempScaleLabels);
    tempBarSection.appendChild(tempBar);

    const separator1 = document.createElement('div');
    separator1.className = 'section-separator';

    const tempHistorySection = document.createElement('div');
    tempHistorySection.className = 'temp-history-section';

    const tempHistoryTitle = document.createElement('div');
    tempHistoryTitle.className = 'section-title';
    tempHistoryTitle.textContent = 'Last 24h Temperature Trend (5 min avg)';

    const tempHistorySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tempHistorySvg.setAttribute('viewBox', '0 0 1000 180');
    tempHistorySvg.setAttribute('preserveAspectRatio', 'none');
    tempHistorySvg.classList.add('temp-history-chart');

    tempHistorySection.appendChild(tempHistoryTitle);
    tempHistorySection.appendChild(tempHistorySvg);

    const separator2 = document.createElement('div');
    separator2.className = 'section-separator';

    const statsGrid = document.createElement('div');
    statsGrid.className = 'stats-grid';

    const avgTemp = this._buildStatTile('Avg Temp (24h)', '—');
    const lowTemp = this._buildStatTile('5% Low (24h)', '—');
    const highTemp = this._buildStatTile('95% High (24h)', '—');
    const powerNow = this._buildStatTile('Power Now', '—');

    statsGrid.appendChild(avgTemp.tile);
    statsGrid.appendChild(lowTemp.tile);
    statsGrid.appendChild(highTemp.tile);
    statsGrid.appendChild(powerNow.tile);

    const separator3 = document.createElement('div');
    separator3.className = 'section-separator';

    const derivedStatsGrid = document.createElement('div');
    derivedStatsGrid.className = 'stats-grid secondary-stats-grid';

    const energy24h = this._buildStatTile('Energy (24h)', '—');
    const dutyCycle24h = this._buildStatTile('Duty Cycle (24h)', '—');
    const rateNow = this._buildStatTile('Temp Rate (Now)', '—');
    const doorOpenings = this._buildStatTile('Door Opens (1h)', '—');

    derivedStatsGrid.appendChild(energy24h.tile);
    derivedStatsGrid.appendChild(dutyCycle24h.tile);
    derivedStatsGrid.appendChild(rateNow.tile);
    derivedStatsGrid.appendChild(doorOpenings.tile);

    const separator4 = document.createElement('div');
    separator4.className = 'section-separator';

    const compressorSection = document.createElement('div');
    compressorSection.className = 'compressor-section';

    const compressorTitle = document.createElement('div');
    compressorTitle.className = 'section-title';
    compressorTitle.textContent = 'Compressor Activity (24h)';

    const compressorTimeline = document.createElement('div');
    compressorTimeline.className = 'compressor-timeline';

    const timelineLegend = document.createElement('div');
    timelineLegend.className = 'timeline-legend';
    timelineLegend.innerHTML = `
      <span><i class="legend-swatch off"></i>Not running</span>
      <span><i class="legend-swatch running"></i>Running</span>
      <span><i class="legend-swatch defrost"></i>Defrost</span>
    `;

    compressorSection.appendChild(compressorTitle);
    compressorSection.appendChild(compressorTimeline);
    compressorSection.appendChild(timelineLegend);

    const style = document.createElement('style');
    style.textContent = `
      .health-layout {
        --ffhc-color-text-primary: var(--primary-text-color);
        --ffhc-color-text-secondary: var(--secondary-text-color);
        --ffhc-color-divider: var(--divider-color, rgba(127, 127, 127, 0.35));
        --ffhc-color-surface: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 85%, var(--primary-text-color) 15%);
        --ffhc-color-bar-cold: var(--info-color, #1e88e5);
        --ffhc-color-bar-cool: color-mix(in srgb, var(--info-color, #1e88e5) 60%, var(--primary-text-color) 40%);
        --ffhc-color-bar-good: var(--success-color, #43a047);
        --ffhc-color-bar-warm: color-mix(in srgb, var(--warning-color, #fb8c00) 40%, var(--error-color, #e53935) 60%);
        --ffhc-color-bar-hot: var(--error-color, #e53935);
        --ffhc-color-health-healthy: var(--success-color, #43a047);
        --ffhc-color-health-warning: var(--warning-color, #fb8c00);
        --ffhc-color-health-alert: var(--error-color, #e53935);
        --ffhc-color-timeline-off: color-mix(in srgb, var(--disabled-text-color, #9e9e9e) 65%, var(--ha-card-background, var(--card-background-color)) 35%);
        --ffhc-color-marker-stroke: color-mix(in srgb, var(--primary-text-color) 35%, transparent);
        display: grid;
        gap: 12px;
        container-type: inline-size;
        color: var(--ffhc-color-text-primary);
      }
      .summary-header {
        display: grid;
        gap: 8px;
      }
      .title-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .title-block {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .appliance-icon {
        font-size: 1.6rem;
        line-height: 1;
      }
      .title-value {
        font-size: 1.6rem;
        font-weight: 600;
      }
      .summary-label {
        font-size: 0.9rem;
        color: var(--ffhc-color-text-secondary);
      }
      .health-value {
        font-size: 1rem;
        font-weight: 600;
      }
      .health-value.healthy {
        color: var(--ffhc-color-health-healthy);
      }
      .health-value.warning {
        color: var(--ffhc-color-health-warning);
      }
      .health-value.alert {
        color: var(--ffhc-color-health-alert);
      }
      .summary-value {
        font-size: 4.2rem;
        font-weight: 700;
        line-height: 1;
        text-align: center;
      }
      .summary-sub-value {
        font-size: 0.9rem;
        color: var(--ffhc-color-text-secondary);
        text-align: center;
      }
      .temperature-bar-section {
        display: grid;
        gap: 6px;
        padding-bottom: 22px;
      }
      .temperature-scale-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.82rem;
        color: var(--ffhc-color-text-secondary);
      }
      .temperature-bar {
        position: relative;
        height: 16px;
        border-radius: 999px;
        overflow: visible;
      }
      .temperature-arrow {
        position: absolute;
        top: 18px;
        transform: translateX(-50%);
        font-size: 1.5rem;
        line-height: 1;
        color: var(--ffhc-color-text-primary);
      }
      .section-separator {
        border-top: 1px solid var(--ffhc-color-divider);
        margin: 2px 0;
      }
      .section-title {
        font-size: 0.9rem;
        color: var(--ffhc-color-text-secondary);
      }
      .temp-history-chart {
        width: 100%;
        height: 110px;
        border-radius: 8px;
        background: var(--ffhc-color-surface);
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }
      .secondary-stats-grid {
        margin-top: -2px;
      }
      .stat-tile {
        border-right: 1px solid var(--ffhc-color-divider);
        padding: 8px;
        min-width: 0;
      }
      .stat-tile:last-child {
        border-right: 0;
      }
      .stat-label {
        font-size: clamp(0.62rem, 2.3cqw, 0.76rem);
        color: var(--ffhc-color-text-secondary);
      }
      .stat-value {
        margin-top: 4px;
        font-size: clamp(1rem, 6.2cqw, 1.6rem);
        font-weight: 600;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .compressor-section {
        display: grid;
        gap: 8px;
      }
      .compressor-timeline {
        display: grid;
        grid-template-columns: repeat(96, minmax(0, 1fr));
        gap: 1px;
        min-height: 20px;
      }
      .timeline-segment {
        border-radius: 1px;
        min-height: 20px;
        background: var(--ffhc-color-timeline-off);
      }
      .timeline-segment.off,
      .legend-swatch.off {
        background: var(--ffhc-color-timeline-off);
      }
      .timeline-segment.running,
      .legend-swatch.running {
        background: var(--ffhc-color-health-healthy);
      }
      .timeline-segment.defrost,
      .legend-swatch.defrost {
        background: var(--ffhc-color-health-warning);
      }
      .timeline-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        font-size: 0.8rem;
        color: var(--ffhc-color-text-secondary);
      }
      .timeline-legend span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .legend-swatch {
        width: 10px;
        height: 10px;
        border-radius: 2px;
        display: inline-block;
      }
      @media (max-width: 800px) {
        .summary-value {
          font-size: 3.2rem;
        }
        .title-value {
          font-size: 1.25rem;
        }
        .stat-value {
          font-size: clamp(1.05rem, 7.4cqw, 1.7rem);
        }
      }
    `;

    root.appendChild(summaryHeader);
    root.appendChild(tempBarSection);
    root.appendChild(separator1);
    root.appendChild(tempHistorySection);
    root.appendChild(separator2);
    root.appendChild(statsGrid);
    root.appendChild(separator3);
    root.appendChild(derivedStatsGrid);
    root.appendChild(separator4);
    root.appendChild(compressorSection);

    this._content.appendChild(style);
    this._content.appendChild(root);

    this._elements = {
      currentTempValue,
      ambientTempValue,
      applianceIcon,
      titleValue,
      healthValue,
      tempBar,
      tempArrow,
      scaleMin,
      scaleIdeal,
      scaleMax,
      tempHistorySvg,
      avgTempValue: avgTemp.value,
      lowTempValue: lowTemp.value,
      highTempValue: highTemp.value,
      powerNowValue: powerNow.value,
      energy24hValue: energy24h.value,
      dutyCycle24hValue: dutyCycle24h.value,
      rateNowValue: rateNow.value,
      doorOpeningsValue: doorOpenings.value,
      compressorTimeline,
    };

    this._applyModeScale();
    this._renderCompressorTimeline([]);
    this._renderTempHistory([], []);
  }

  _buildStatTile(labelText, initialValue) {
    const tile = document.createElement('div');
    tile.className = 'stat-tile';

    const label = document.createElement('div');
    label.className = 'stat-label';
    label.textContent = labelText;

    const value = document.createElement('div');
    value.className = 'stat-value';
    value.textContent = initialValue;

    tile.appendChild(label);
    tile.appendChild(value);

    return { tile, value };
  }

  _getModeSpec() {
    return MODE_SPECS[this._config.appliance_type] || MODE_SPECS.fridge;
  }

  _applyModeScale() {
    if (!this._elements) {
      return;
    }

    const spec = this._getModeSpec();
    const total = spec.max - spec.min;
    const goodStartPct = ((spec.goodMin - spec.min) / total) * 100;
    const goodEndPct = ((spec.goodMax - spec.min) / total) * 100;

    this._elements.scaleMin.textContent = `${spec.min}°C`;
    this._elements.scaleIdeal.textContent = `Ideal ${spec.goodMin}°C to ${spec.goodMax}°C`;
    this._elements.scaleMax.textContent = `${spec.max}°C`;
    this._elements.applianceIcon.textContent = this._config.appliance_type === 'freezer' ? '❄️' : '🌡️';
    this._elements.titleValue.textContent = this._config.card_title || `${spec.label} Health`;

    this._elements.tempBar.style.background = `linear-gradient(to right,
      var(--ffhc-color-bar-cold) 0%,
      var(--ffhc-color-bar-cool) ${goodStartPct}%,
      var(--ffhc-color-bar-good) ${goodStartPct}%,
      var(--ffhc-color-bar-good) ${goodEndPct}%,
      var(--ffhc-color-bar-warm) ${goodEndPct}%,
      var(--ffhc-color-bar-hot) 100%)`;

    this._elements.tempArrow.textContent = '▲';
  }

  _setArrowPosition(value) {
    if (!this._elements) {
      return;
    }

    const spec = this._getModeSpec();
    const clamped = Math.max(spec.min, Math.min(spec.max, value));
    const ratio = (clamped - spec.min) / (spec.max - spec.min);
    this._elements.tempArrow.style.left = `${ratio * 100}%`;
  }

  _parseEntityValue(entityId) {
    if (!entityId || !this._hass || !this._hass.states[entityId]) {
      return null;
    }

    const stateObj = this._hass.states[entityId];
    const parsed = Number(stateObj.state);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return {
      value: parsed,
      unit: stateObj.attributes.unit_of_measurement || '',
    };
  }

  async _refreshHistoryData(force = false) {
    const interiorEntity = this._config.interior_temperature_entity;
    if (!this._hass || !interiorEntity) {
      return;
    }

    const now = Date.now();
    if (!force && this._historyCache && now - this._historyCache.timestamp < HISTORY_REFRESH_MS) {
      this._applyHistoryData(this._historyCache.data);
      return;
    }

    if (this._historyRequest) {
      return;
    }

    const powerEntity = this._config.power_consumption_entity;
    const doorEntity = this._config.door_sensor_entity;
    const entityIds = [interiorEntity];
    if (powerEntity) {
      entityIds.push(powerEntity);
    }
    if (doorEntity) {
      entityIds.push(doorEntity);
    }

    const startTime = new Date(now - HISTORY_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    const endTime = new Date(now).toISOString();

    this._historyRequest = this._hass.callWS({
      type: 'history/history_during_period',
      start_time: startTime,
      end_time: endTime,
      entity_ids: entityIds,
      minimal_response: true,
      no_attributes: true,
    });

    try {
      const response = await this._historyRequest;
      const data = this._parseHistoryResponse(response, entityIds);
      this._historyCache = {
        timestamp: now,
        data,
      };
      this._applyHistoryData(data);
    } catch (error) {
      this._applyHistoryData({
        tempMovingAverage: [],
        powerPoints: [],
        doorPoints: [],
      });
    } finally {
      this._historyRequest = null;
    }
  }

  _parseHistoryResponse(response, entityIds) {
    const historyByEntity = {};

    if (Array.isArray(response)) {
      entityIds.forEach((entityId, index) => {
        historyByEntity[entityId] = Array.isArray(response[index]) ? response[index] : [];
      });
    } else if (response && typeof response === 'object') {
      entityIds.forEach((entityId) => {
        historyByEntity[entityId] = Array.isArray(response[entityId]) ? response[entityId] : [];
      });
    }

    const interiorPoints = this._normalizeHistoryPoints(historyByEntity[entityIds[0]] || []);
    const powerPoints = this._config.power_consumption_entity
      ? this._normalizeHistoryPoints(historyByEntity[this._config.power_consumption_entity] || [])
      : [];
    const doorPoints = this._config.door_sensor_entity
      ? this._normalizeStateHistoryPoints(historyByEntity[this._config.door_sensor_entity] || [])
      : [];

    return {
      tempMovingAverage: this._calculateMovingAverage(interiorPoints),
      powerPoints,
      doorPoints,
    };
  }

  _normalizeHistoryPoints(states) {
    return states
      .map((entry) => {
        // Home Assistant minimal/compact responses use 's' instead of 'state'.
        const value = Number(entry.state !== undefined ? entry.state : entry.s);
        // Home Assistant history entries may provide timestamp fields as:
        // - last_changed / last_updated (ISO strings, classic format)
        // - lu (Unix timestamp in SECONDS, compact minimal_response format)
        // Fallback to 0 so invalid entries are intentionally filtered out by timestamp validation below.
        const luMs = entry.lu != null ? entry.lu * 1000 : 0;
        const timestamp = new Date(
          entry.last_changed || entry.last_updated || luMs,
        ).getTime();
        if (!Number.isFinite(value) || !Number.isFinite(timestamp) || timestamp <= 0) {
          return null;
        }

        return {
          timestamp,
          value,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  _normalizeStateHistoryPoints(states) {
    return states
      .map((entry) => {
        const rawState = entry.state !== undefined ? entry.state : entry.s;
        const state = rawState == null ? '' : String(rawState).toLowerCase();
        const luMs = entry.lu != null ? entry.lu * 1000 : 0;
        const timestamp = new Date(
          entry.last_changed || entry.last_updated || luMs,
        ).getTime();

        if (!state || !Number.isFinite(timestamp) || timestamp <= 0) {
          return null;
        }

        return {
          timestamp,
          state,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  _calculateMovingAverage(points) {
    if (!points.length) {
      return [];
    }

    const windowMs = MOVING_AVERAGE_WINDOW_MINUTES * 60 * 1000;
    const window = [];
    let sum = 0;

    return points.map((point) => {
      window.push(point);
      sum += point.value;

      while (window.length > 0 && point.timestamp - window[0].timestamp > windowMs) {
        sum -= window.shift().value;
      }

      return {
        timestamp: point.timestamp,
        value: sum / window.length,
      };
    });
  }

  _applyHistoryData(data) {
    const temperatureSeries = data.tempMovingAverage || [];
    const powerSeries = data.powerPoints || [];
    const doorSeries = data.doorPoints || [];

    this._updateCurrentTemperature(temperatureSeries);
    this._updateStats(temperatureSeries, powerSeries, doorSeries);
    this._renderTempHistory(temperatureSeries, doorSeries);
    this._renderCompressorTimeline(powerSeries);
  }

  _updateCurrentTemperature(temperatureSeries) {
    if (!this._elements) {
      return;
    }

    if (!temperatureSeries.length) {
      this._elements.currentTempValue.textContent = 'Unavailable';
      this._setArrowPosition(this._getModeSpec().min);
      this._setHealthStatus(null);
      return;
    }

    const latest = temperatureSeries[temperatureSeries.length - 1];
    const rate = this._getTemperatureRateCelsiusPerMinute(temperatureSeries);
    const trend = this._getTrendArrow(rate);

    this._elements.currentTempValue.textContent = `${latest.value.toFixed(1)}°C ${trend}`;
    this._setArrowPosition(latest.value);
    this._setHealthStatus(latest.value, rate);
  }

  _setHealthStatus(temperatureValue, rate) {
    if (!this._elements) {
      return;
    }

    const status = this._classifyHealth(temperatureValue, rate);
    this._elements.healthValue.className = `health-value ${status.level}`;
    this._elements.healthValue.textContent = `● ${status.text}`;
  }

  _classifyHealth(value, rate) {
    if (!Number.isFinite(value)) {
      return { level: '', text: 'Unavailable' };
    }

    const maxRate = this._getMaxChangeRateThreshold();
    if (maxRate > 0 && Number.isFinite(rate) && Math.abs(rate) > maxRate) {
      return { level: 'alert', text: 'Rapid change' };
    }

    const spec = this._getModeSpec();
    if (value >= spec.goodMin && value <= spec.goodMax) {
      return { level: 'healthy', text: 'Healthy' };
    }

    if (
      value >= spec.goodMin - HEALTH_WARNING_BAND_CELSIUS
      && value <= spec.goodMax + HEALTH_WARNING_BAND_CELSIUS
    ) {
      return { level: 'warning', text: 'Watch' };
    }

    return { level: 'alert', text: 'Alert' };
  }

  _getTrendArrow(rate) {
    if (!Number.isFinite(rate)) {
      return '→';
    }
    const threshold = this._getMaxChangeRateThreshold();

    if (rate > threshold) {
      return '↑';
    }

    if (rate < -threshold) {
      return '↓';
    }

    return '→';
  }

  _getTemperatureRateCelsiusPerMinute(series) {
    if (series.length < 2) {
      return null;
    }

    const latest = series[series.length - 1];
    const targetTime = latest.timestamp - MOVING_AVERAGE_WINDOW_MINUTES * 60 * 1000;

    let reference = series[0];
    for (let index = series.length - 2; index >= 0; index -= 1) {
      if (series[index].timestamp <= targetTime) {
        reference = series[index];
        break;
      }
    }

    const minutes = (latest.timestamp - reference.timestamp) / (60 * 1000);
    if (minutes < 0.25) {
      return null;
    }

    return (latest.value - reference.value) / minutes;
  }

  _getMaxChangeRateThreshold() {
    const configuredThreshold = Number(this._config.max_change_rate_celsius_per_minute);
    if (Number.isFinite(configuredThreshold) && configuredThreshold >= 0) {
      return configuredThreshold;
    }

    return TREND_STABLE_RATE_CELSIUS_PER_MINUTE;
  }

  _updateStats(temperatureSeries, powerSeries, doorSeries) {
    if (!this._elements) {
      return;
    }

    if (!temperatureSeries.length) {
      this._elements.avgTempValue.textContent = '—';
      this._elements.lowTempValue.textContent = '—';
      this._elements.highTempValue.textContent = '—';
    } else {
      const values = temperatureSeries.map((point) => point.value);
      const average = values.reduce((total, value) => total + value, 0) / values.length;
      this._elements.avgTempValue.textContent = `${average.toFixed(1)}°C`;
      this._elements.lowTempValue.textContent = `${this._percentile(values, 0.05).toFixed(1)}°C`;
      this._elements.highTempValue.textContent = `${this._percentile(values, 0.95).toFixed(1)}°C`;
    }

    const rate = this._getTemperatureRateCelsiusPerMinute(temperatureSeries);
    if (Number.isFinite(rate)) {
      this._elements.rateNowValue.textContent = `${rate.toFixed(2)}°C/min`;
    } else {
      this._elements.rateNowValue.textContent = '—';
    }

    if (!powerSeries.length) {
      this._elements.energy24hValue.textContent = '—';
      this._elements.dutyCycle24hValue.textContent = '—';
    } else {
      const now = Date.now();
      const startTime = now - HISTORY_LOOKBACK_HOURS * 60 * 60 * 1000;
      const energyKWh = this._calculateEnergyKwh(powerSeries, startTime, now);
      const dutyCyclePct = this._calculateDutyCyclePercent(powerSeries, startTime, now);

      this._elements.energy24hValue.textContent = Number.isFinite(energyKWh)
        ? `${energyKWh.toFixed(2)} kWh`
        : '—';
      this._elements.dutyCycle24hValue.textContent = Number.isFinite(dutyCyclePct)
        ? `${dutyCyclePct.toFixed(1)}%`
        : '—';
    }

    if (!this._config.door_sensor_entity) {
      this._elements.doorOpeningsValue.textContent = '—';
      return;
    }

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const openings = this._countDoorOpenings(doorSeries, oneHourAgo, now);
    this._elements.doorOpeningsValue.textContent = Number.isFinite(openings)
      ? String(openings)
      : '—';
  }

  _countDoorOpenings(doorSeries, startTime, endTime) {
    if (!Array.isArray(doorSeries) || endTime <= startTime) {
      return NaN;
    }

    if (!doorSeries.length) {
      return 0;
    }

    let previousOpen = false;
    for (let index = 0; index < doorSeries.length; index += 1) {
      if (doorSeries[index].timestamp <= startTime) {
        previousOpen = this._isDoorOpenState(doorSeries[index].state);
      } else {
        break;
      }
    }

    let openings = 0;
    for (let index = 0; index < doorSeries.length; index += 1) {
      const point = doorSeries[index];
      if (point.timestamp < startTime || point.timestamp > endTime) {
        continue;
      }

      const currentOpen = this._isDoorOpenState(point.state);
      if (!previousOpen && currentOpen) {
        openings += 1;
      }

      previousOpen = currentOpen;
    }

    return openings;
  }

  _isDoorOpenState(state) {
    return state === 'on' || state === 'open' || state === 'opening' || state === 'true' || state === '1';
  }

  _calculateEnergyKwh(powerSeries, startTime, endTime) {
    if (!powerSeries.length || endTime <= startTime) {
      return NaN;
    }

    let index = 0;
    let currentValue = 0;
    while (index < powerSeries.length && powerSeries[index].timestamp <= startTime) {
      currentValue = powerSeries[index].value;
      index += 1;
    }

    if (!Number.isFinite(currentValue)) {
      const firstFinite = powerSeries.find((point) => Number.isFinite(point.value));
      currentValue = firstFinite ? firstFinite.value : 0;
    }

    let previousTime = startTime;
    let wattHours = 0;
    while (index < powerSeries.length && powerSeries[index].timestamp <= endTime) {
      const point = powerSeries[index];
      const pointTime = point.timestamp;
      const durationHours = (pointTime - previousTime) / (60 * 60 * 1000);
      if (durationHours > 0 && Number.isFinite(currentValue)) {
        wattHours += currentValue * durationHours;
      }

      currentValue = point.value;
      previousTime = pointTime;
      index += 1;
    }

    const tailHours = (endTime - previousTime) / (60 * 60 * 1000);
    if (tailHours > 0 && Number.isFinite(currentValue)) {
      wattHours += currentValue * tailHours;
    }

    return wattHours / 1000;
  }

  _calculateDutyCyclePercent(powerSeries, startTime, endTime) {
    if (!powerSeries.length || endTime <= startTime) {
      return NaN;
    }

    const runningConfig = Number(this._config.compressor_running_watts);
    const runningThreshold = Number.isFinite(runningConfig)
      ? runningConfig
      : DEFAULT_RUNNING_WATTS;

    let index = 0;
    let currentValue = 0;
    while (index < powerSeries.length && powerSeries[index].timestamp <= startTime) {
      currentValue = powerSeries[index].value;
      index += 1;
    }

    if (!Number.isFinite(currentValue)) {
      const firstFinite = powerSeries.find((point) => Number.isFinite(point.value));
      currentValue = firstFinite ? firstFinite.value : 0;
    }

    let previousTime = startTime;
    let runningMs = 0;
    while (index < powerSeries.length && powerSeries[index].timestamp <= endTime) {
      const point = powerSeries[index];
      const pointTime = point.timestamp;
      const durationMs = pointTime - previousTime;
      if (durationMs > 0 && currentValue >= runningThreshold) {
        runningMs += durationMs;
      }

      currentValue = point.value;
      previousTime = pointTime;
      index += 1;
    }

    const tailMs = endTime - previousTime;
    if (tailMs > 0 && currentValue >= runningThreshold) {
      runningMs += tailMs;
    }

    const totalMs = endTime - startTime;
    if (totalMs <= 0) {
      return NaN;
    }

    return (runningMs / totalMs) * 100;
  }

  _percentile(values, percentile) {
    if (!values.length) {
      return NaN;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sorted[lower];
    }

    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  _renderTempHistory(temperatureSeries, doorSeries = []) {
    if (!this._elements) {
      return;
    }

    const svg = this._elements.tempHistorySvg;
    svg.innerHTML = '';

    if (temperatureSeries.length < 2) {
      return;
    }

    const spec = this._getModeSpec();
    const firstTimestamp = temperatureSeries[0].timestamp;
    const lastTimestamp = temperatureSeries[temperatureSeries.length - 1].timestamp;
    const span = Math.max(lastTimestamp - firstTimestamp, 1);
    const chartHeight = 170;

    for (let index = 1; index < temperatureSeries.length; index += 1) {
      const previous = temperatureSeries[index - 1];
      const current = temperatureSeries[index];

      const x1 = ((previous.timestamp - firstTimestamp) / span) * 1000;
      const x2 = ((current.timestamp - firstTimestamp) / span) * 1000;
      const y1 = chartHeight - this._normalizeTemp(previous.value, spec) * chartHeight;
      const y2 = chartHeight - this._normalizeTemp(current.value, spec) * chartHeight;
      const segmentValue = (previous.value + current.value) / 2;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke', this._temperatureColor(segmentValue));
      line.setAttribute('stroke-width', '4');
      line.setAttribute('stroke-linecap', 'round');

      svg.appendChild(line);
    }

    this._renderDoorOpenMarkers(svg, temperatureSeries, doorSeries, firstTimestamp, lastTimestamp, span, chartHeight);
  }

  _renderDoorOpenMarkers(svg, temperatureSeries, doorSeries, firstTimestamp, lastTimestamp, span, chartHeight) {
    if (!this._config.door_sensor_entity || !Array.isArray(doorSeries) || !doorSeries.length) {
      return;
    }

    const openingEvents = this._extractDoorOpeningEvents(doorSeries, firstTimestamp, lastTimestamp);
    if (!openingEvents.length) {
      return;
    }

    const groupedEvents = this._groupOpeningEventsByTenMinutes(openingEvents);
    groupedEvents.forEach((group) => {
      const eventTime = group.timestamps[0];
      const temperature = this._getTemperatureAtTimestamp(temperatureSeries, eventTime);
      if (!Number.isFinite(temperature)) {
        return;
      }

      const x = ((eventTime - firstTimestamp) / span) * 1000;
      const y = chartHeight - this._normalizeTemp(temperature, this._getModeSpec()) * chartHeight;

      const markerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const markerSize = 28;
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      marker.setAttribute('x', String(x - markerSize / 2));
      marker.setAttribute('y', String(y - markerSize / 2));
      marker.setAttribute('width', String(markerSize));
      marker.setAttribute('height', String(markerSize));
      marker.setAttribute('rx', '1.5');
      marker.setAttribute('fill', 'var(--ffhc-color-health-warning)');
      marker.setAttribute('stroke', 'var(--ffhc-color-marker-stroke)');
      marker.setAttribute('stroke-width', '0.8');
      marker.setAttribute('transform', `rotate(45 ${x} ${y})`);

      markerGroup.appendChild(marker);

      if (group.count > 1) {
        const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        countText.setAttribute('x', String(x));
        countText.setAttribute('y', String(y + 3));
        countText.setAttribute('text-anchor', 'middle');
        countText.setAttribute('font-size', '9');
        countText.setAttribute('font-weight', '700');
        countText.setAttribute('fill', 'var(--ffhc-color-marker-count, #000)');
        countText.textContent = String(group.count);
        markerGroup.appendChild(countText);
      }

      svg.appendChild(markerGroup);
    });
  }

  _extractDoorOpeningEvents(doorSeries, startTime, endTime) {
    const events = [];
    let previousOpen = false;

    for (let index = 0; index < doorSeries.length; index += 1) {
      const point = doorSeries[index];
      if (point.timestamp <= startTime) {
        previousOpen = this._isDoorOpenState(point.state);
        continue;
      }

      if (point.timestamp > endTime) {
        break;
      }

      const currentOpen = this._isDoorOpenState(point.state);
      if (!previousOpen && currentOpen) {
        events.push(point.timestamp);
      }

      previousOpen = currentOpen;
    }

    return events;
  }

  _groupOpeningEventsByTenMinutes(openingEvents) {
    if (!openingEvents.length) {
      return [];
    }

    const tenMinutesMs = 10 * 60 * 1000;
    const groups = [];
    let currentGroup = {
      start: openingEvents[0],
      timestamps: [openingEvents[0]],
      count: 1,
    };

    for (let index = 1; index < openingEvents.length; index += 1) {
      const timestamp = openingEvents[index];
      if (timestamp - currentGroup.start <= tenMinutesMs) {
        currentGroup.timestamps.push(timestamp);
        currentGroup.count += 1;
        continue;
      }

      groups.push(currentGroup);
      currentGroup = {
        start: timestamp,
        timestamps: [timestamp],
        count: 1,
      };
    }

    groups.push(currentGroup);
    return groups;
  }

  _getTemperatureAtTimestamp(temperatureSeries, targetTimestamp) {
    if (!temperatureSeries.length) {
      return NaN;
    }

    if (targetTimestamp <= temperatureSeries[0].timestamp) {
      return temperatureSeries[0].value;
    }

    for (let index = 1; index < temperatureSeries.length; index += 1) {
      const previous = temperatureSeries[index - 1];
      const current = temperatureSeries[index];
      if (targetTimestamp > current.timestamp) {
        continue;
      }

      const delta = current.timestamp - previous.timestamp;
      if (delta <= 0) {
        return current.value;
      }

      const ratio = (targetTimestamp - previous.timestamp) / delta;
      return previous.value + (current.value - previous.value) * ratio;
    }

    return temperatureSeries[temperatureSeries.length - 1].value;
  }

  _normalizeTemp(value, spec) {
    const clamped = Math.max(spec.min, Math.min(spec.max, value));
    return (clamped - spec.min) / (spec.max - spec.min);
  }

  _temperatureColor(value) {
    const spec = this._getModeSpec();
    if (value < spec.goodMin) {
      return 'var(--ffhc-color-bar-cold)';
    }

    if (value > spec.goodMax) {
      return 'var(--ffhc-color-bar-hot)';
    }

    return 'var(--ffhc-color-bar-good)';
  }

  _renderCompressorTimeline(powerSeries) {
    if (!this._elements) {
      return;
    }

    const timeline = this._elements.compressorTimeline;
    timeline.innerHTML = '';

    const steps = this._buildPowerSteps(powerSeries, 96);
    steps.forEach((state) => {
      const segment = document.createElement('div');
      segment.className = `timeline-segment ${state}`;
      timeline.appendChild(segment);
    });
  }

  _buildPowerSteps(powerSeries, count) {
    if (!count) {
      return [];
    }

    if (!powerSeries.length) {
      return Array(count).fill('off');
    }

    const endTime = Date.now();
    const startTime = endTime - HISTORY_LOOKBACK_HOURS * 60 * 60 * 1000;
    const stepMs = (endTime - startTime) / count;

    const runningConfig = Number(this._config.compressor_running_watts);
    const defrostConfig = Number(this._config.defrost_watts);
    const running = Number.isFinite(runningConfig)
      ? runningConfig
      : DEFAULT_RUNNING_WATTS;
    const defrost = Number.isFinite(defrostConfig)
      ? defrostConfig
      : DEFAULT_DEFROST_WATTS;

    let index = 0;
    const firstPoint = powerSeries.find((point) => Number.isFinite(point.value));
    let currentValue = firstPoint ? firstPoint.value : 0;

    return Array.from({ length: count }).map((_, step) => {
      const targetTime = startTime + step * stepMs;
      while (index + 1 < powerSeries.length && powerSeries[index + 1].timestamp <= targetTime) {
        index += 1;
        currentValue = powerSeries[index].value;
      }

      if (currentValue >= defrost) {
        return 'defrost';
      }

      if (currentValue >= running) {
        return 'running';
      }

      return 'off';
    });
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config || !this._content || !this._elements) {
      return;
    }

    const ambientValue = this._parseEntityValue(this._config.ambient_temperature_entity);
    this._elements.ambientTempValue.textContent = ambientValue
      ? `Ambient: ${ambientValue.value.toFixed(1)}${ambientValue.unit ? ` ${ambientValue.unit}` : ''}`
      : 'Ambient: Unavailable';

    const powerValue = this._parseEntityValue(this._config.power_consumption_entity);
    this._elements.powerNowValue.textContent = powerValue
      ? `${powerValue.value.toFixed(1)}${powerValue.unit ? ` ${powerValue.unit}` : ''}`
      : 'Unavailable';

    this._applyModeScale();
    this._refreshHistoryData();
  }

  getCardSize() {
    return 9;
  }
}

class FridgeFreezerHealthCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = {
      ...FridgeFreezerHealthCard.getStubConfig(),
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    const needsRender = !this._hass;
    this._hass = hass;

    if (needsRender) {
      this._render();
      return;
    }

    if (this._entityPickers) {
      this._entityPickers.forEach((picker) => {
        picker.hass = hass;
      });
    }
  }

  _render() {
    if (!this._hass || !this._config) {
      return;
    }

    this.innerHTML = '';
    this._entityPickers = [];

    const root = document.createElement('div');
    root.className = 'card-config';

    const style = document.createElement('style');
    style.textContent = `
      .card-config {
        display: grid;
        gap: 12px;
      }
      .field-label {
        font-size: 0.95rem;
        color: var(--secondary-text-color);
        margin-bottom: 4px;
      }
      .input-group {
        display: grid;
        gap: 4px;
      }
      ha-textfield,
      select,
      .number-input {
        width: 100%;
      }
      select,
      .number-input {
        box-sizing: border-box;
        padding: 10px;
        border: 1px solid var(--divider-color);
        border-radius: 6px;
        background: var(--card-background-color, var(--ha-card-background));
        color: var(--primary-text-color);
      }
    `;

    root.appendChild(style);
    root.appendChild(this._buildEntityField('Ambient Temperature (°C)', 'ambient_temperature_entity'));
    root.appendChild(this._buildEntityField('Interior Temperature (°C)', 'interior_temperature_entity'));
    root.appendChild(this._buildEntityField('Power Consumption (W)', 'power_consumption_entity'));
    root.appendChild(
      this._buildEntityField('Door Sensor (optional)', 'door_sensor_entity', ['binary_sensor', 'sensor']),
    );
    root.appendChild(this._buildTextField('Card title (optional)', 'card_title'));
    root.appendChild(this._buildModeField());
    root.appendChild(this._buildNumberField('Compressor running threshold (W)', 'compressor_running_watts'));
    root.appendChild(this._buildNumberField('Defrost threshold (W)', 'defrost_watts'));
    root.appendChild(
      this._buildNumberField('Maximum change rate (°C/min)', 'max_change_rate_celsius_per_minute', {
        min: 0,
        step: 0.1,
      }),
    );

    root.addEventListener(
      'pointerdown',
      (event) => {
        // Prevent Lovelace editor drag/reorder handlers from interfering with picker interactions.
        if (event.target.closest('ha-entity-picker')) {
          event.stopPropagation();
        }
      },
      true,
    );

    this.appendChild(root);
  }

  _buildModeField() {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-group';

    const label = document.createElement('div');
    label.className = 'field-label';
    label.textContent = 'Appliance type';

    const select = document.createElement('select');
    const currentAppliance = this._config.appliance_type || 'fridge';

    Object.entries(MODE_SPECS).forEach(([value, spec]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = spec.label;
      option.selected = value === currentAppliance;
      select.appendChild(option);
    });

    select.addEventListener('change', (event) => {
      this._valueChanged('appliance_type', event.target.value);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);

    return wrapper;
  }

  _buildNumberField(labelText, key, options = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-group';

    const label = document.createElement('div');
    label.className = 'field-label';
    label.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'number-input';
    const min = Number.isFinite(options.min) ? options.min : 0;
    const max = Number.isFinite(options.max) ? options.max : MAX_POWER_THRESHOLD_WATTS;
    const step = Number.isFinite(options.step) ? options.step : 1;

    input.min = String(min);
    input.step = String(step);
    if (Number.isFinite(max)) {
      input.max = String(max);
    }
    input.value = String(this._config[key]);
    input.addEventListener('change', (event) => {
      const parsedValue = Number(event.target.value);
      if (!Number.isFinite(parsedValue) || parsedValue < min || parsedValue > max) {
        event.target.value = String(this._config[key]);
        return;
      }

      this._valueChanged(key, parsedValue);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }

  _buildTextField(labelText, key) {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-group';

    const label = document.createElement('div');
    label.className = 'field-label';
    label.textContent = labelText;

    const input = document.createElement('ha-textfield');
    input.value = this._config[key] || '';
    input.addEventListener('change', (event) => {
      this._valueChanged(key, event.target.value || '');
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }

  _buildEntityField(labelText, key, includeDomains = ['sensor']) {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-group';

    const label = document.createElement('div');
    label.className = 'field-label';
    label.textContent = labelText;
    wrapper.appendChild(label);

    const picker = document.createElement('ha-entity-picker');
    picker.hass = this._hass;
    picker.value = this._config[key] || '';
    picker.includeDomains = includeDomains;
    picker.allowCustomEntity = false;
    picker.addEventListener('value-changed', (event) => {
      this._valueChanged(key, event.detail.value);
    });

    this._entityPickers.push(picker);

    wrapper.appendChild(picker);
    return wrapper;
  }

  _valueChanged(key, value) {
    const nextConfig = {
      ...this._config,
      [key]: value,
    };

    this._config = nextConfig;
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: nextConfig },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

if (!customElements.get('fridge-freezer-health-card')) {
  customElements.define('fridge-freezer-health-card', FridgeFreezerHealthCard);
}

if (!customElements.get('fridge-freezer-health-card-editor')) {
  customElements.define('fridge-freezer-health-card-editor', FridgeFreezerHealthCardEditor);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'fridge-freezer-health-card',
  name: 'Fridge Freezer Health Card',
  description: 'Shows fridge/freezer temperature health, history, and compressor behavior.',
});
