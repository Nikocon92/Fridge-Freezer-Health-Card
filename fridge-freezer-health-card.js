const HISTORY_LOOKBACK_HOURS = 24;
const MOVING_AVERAGE_WINDOW_MINUTES = 5;
const TREND_STABLE_RATE = 0.5;
const HEALTH_WARNING_BAND_CELSIUS = 2;
const HISTORY_REFRESH_MS = 60 * 1000;
const DEFAULT_RUNNING_WATTS = 50;
const DEFAULT_DEFROST_WATTS = 180;

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
      card_title: '',
      appliance_type: 'fridge',
      compressor_running_watts: DEFAULT_RUNNING_WATTS,
      defrost_watts: DEFAULT_DEFROST_WATTS,
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
      this._card.style.background =
        'radial-gradient(circle at top, rgba(12, 35, 64, 0.95) 0%, rgba(5, 19, 36, 0.95) 55%, rgba(3, 12, 24, 0.98) 100%)';
      this._card.style.border = '1px solid rgba(82, 129, 173, 0.35)';
      this._card.style.borderRadius = '20px';
      this._card.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';
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
        display: grid;
        gap: 12px;
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
        color: #98b2ce;
      }
      .health-value {
        font-size: 1rem;
        font-weight: 600;
      }
      .health-value.healthy {
        color: #66de6f;
      }
      .health-value.warning {
        color: #ffcc80;
      }
      .health-value.alert {
        color: #ef5350;
      }
      .summary-value {
        font-size: 4.2rem;
        font-weight: 700;
        line-height: 1;
        text-align: center;
      }
      .summary-sub-value {
        font-size: 0.9rem;
        color: #98b2ce;
        text-align: center;
      }
      .temperature-bar-section {
        display: grid;
        gap: 6px;
      }
      .temperature-scale-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.82rem;
        color: #98b2ce;
      }
      .temperature-bar {
        position: relative;
        height: 16px;
        border-radius: 999px;
      }
      .temperature-arrow {
        position: absolute;
        top: -26px;
        transform: translateX(-50%);
        font-size: 2rem;
        line-height: 1;
        color: #f5f5f5;
      }
      .section-separator {
        border-top: 1px solid rgba(82, 129, 173, 0.35);
        margin: 2px 0;
      }
      .section-title {
        font-size: 0.9rem;
        color: #98b2ce;
      }
      .temp-history-chart {
        width: 100%;
        height: 110px;
        border-radius: 8px;
        background: rgba(11, 36, 64, 0.45);
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }
      .stat-tile {
        border-right: 1px solid rgba(82, 129, 173, 0.35);
        padding: 8px;
      }
      .stat-tile:last-child {
        border-right: 0;
      }
      .stat-label {
        font-size: 0.75rem;
        color: #98b2ce;
      }
      .stat-value {
        margin-top: 4px;
        font-size: 1.9rem;
        font-weight: 600;
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
        background: rgba(127, 127, 127, 0.2);
      }
      .timeline-segment.off,
      .legend-swatch.off {
        background: #607d8b;
      }
      .timeline-segment.running,
      .legend-swatch.running {
        background: #43a047;
      }
      .timeline-segment.defrost,
      .legend-swatch.defrost {
        background: #fb8c00;
      }
      .timeline-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        font-size: 0.8rem;
        color: #98b2ce;
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
        .stats-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .stat-tile {
          border-right: 0;
          border-bottom: 1px solid rgba(82, 129, 173, 0.35);
        }
        .stat-tile:nth-last-child(-n + 2) {
          border-bottom: 0;
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
      compressorTimeline,
    };

    this._applyModeScale();
    this._renderCompressorTimeline([]);
    this._renderTempHistory([]);
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
      #1e88e5 0%,
      #64b5f6 ${goodStartPct}%,
      #43a047 ${goodStartPct}%,
      #43a047 ${goodEndPct}%,
      #ef9a9a ${goodEndPct}%,
      #e53935 100%)`;
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
    const entityIds = [interiorEntity];
    if (powerEntity) {
      entityIds.push(powerEntity);
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
    const powerPoints = entityIds[1] ? this._normalizeHistoryPoints(historyByEntity[entityIds[1]] || []) : [];

    return {
      tempMovingAverage: this._calculateMovingAverage(interiorPoints),
      powerPoints,
    };
  }

  _normalizeHistoryPoints(states) {
    return states
      .map((entry) => {
        const value = Number(entry.state);
        const timestamp = new Date(entry.last_changed || entry.last_updated || entry.lu || 0).getTime();
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

    this._updateCurrentTemperature(temperatureSeries);
    this._updateStats(temperatureSeries);
    this._renderTempHistory(temperatureSeries);
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
    const trend = this._getTrendArrow(temperatureSeries);

    this._elements.currentTempValue.textContent = `${latest.value.toFixed(1)}°C ${trend}`;
    this._setArrowPosition(latest.value);
    this._setHealthStatus(latest.value);
  }

  _setHealthStatus(temperatureValue) {
    if (!this._elements) {
      return;
    }

    const status = this._classifyHealth(temperatureValue);
    this._elements.healthValue.className = `health-value ${status.level}`;
    this._elements.healthValue.textContent = `● ${status.text}`;
  }

  _classifyHealth(value) {
    if (!Number.isFinite(value)) {
      return { level: '', text: 'Unavailable' };
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

  _getTrendArrow(series) {
    if (series.length < 2) {
      return '→';
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

    const minutes = Math.max((latest.timestamp - reference.timestamp) / (60 * 1000), 1);
    const rate = (latest.value - reference.value) / minutes;

    if (rate > TREND_STABLE_RATE) {
      return '↑';
    }

    if (rate < -TREND_STABLE_RATE) {
      return '↓';
    }

    return '→';
  }

  _updateStats(temperatureSeries) {
    if (!this._elements) {
      return;
    }

    if (!temperatureSeries.length) {
      this._elements.avgTempValue.textContent = '—';
      this._elements.lowTempValue.textContent = '—';
      this._elements.highTempValue.textContent = '—';
      return;
    }

    const values = temperatureSeries.map((point) => point.value);
    const average = values.reduce((total, value) => total + value, 0) / values.length;
    this._elements.avgTempValue.textContent = `${average.toFixed(1)}°C`;
    this._elements.lowTempValue.textContent = `${this._percentile(values, 0.05).toFixed(1)}°C`;
    this._elements.highTempValue.textContent = `${this._percentile(values, 0.95).toFixed(1)}°C`;
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

  _renderTempHistory(temperatureSeries) {
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
  }

  _normalizeTemp(value, spec) {
    const clamped = Math.max(spec.min, Math.min(spec.max, value));
    return (clamped - spec.min) / (spec.max - spec.min);
  }

  _temperatureColor(value) {
    const spec = this._getModeSpec();
    if (value < spec.goodMin) {
      return '#1e88e5';
    }

    if (value > spec.goodMax) {
      return '#e53935';
    }

    return '#43a047';
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

    const runningThreshold = Number(this._config.compressor_running_watts);
    const defrostThreshold = Number(this._config.defrost_watts);

    const running = Number.isFinite(runningThreshold) ? runningThreshold : DEFAULT_RUNNING_WATTS;
    const defrost = Number.isFinite(defrostThreshold) ? defrostThreshold : DEFAULT_DEFROST_WATTS;

    let index = 0;
    let currentValue = powerSeries[0].value;

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
      ? `Ambient: ${ambientValue.value.toFixed(1)}${ambientValue.unit ? ` ${ambientValue.unit}` : '°C'}`
      : 'Ambient: Unavailable';

    const powerValue = this._parseEntityValue(this._config.power_consumption_entity);
    this._elements.powerNowValue.textContent = powerValue
      ? `${powerValue.value.toFixed(1)}${powerValue.unit ? ` ${powerValue.unit}` : ' W'}`
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
      select {
        width: 100%;
      }
      select {
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
    root.appendChild(this._buildTextField('Card title (optional)', 'card_title'));
    root.appendChild(this._buildModeField());
    root.appendChild(this._buildNumberField('Compressor running threshold (W)', 'compressor_running_watts'));
    root.appendChild(this._buildNumberField('Defrost threshold (W)', 'defrost_watts'));

    root.addEventListener(
      'pointerdown',
      (event) => {
        if (event.target.closest && event.target.closest('ha-entity-picker')) {
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
    select.value = this._config.appliance_type || 'fridge';

    Object.entries(MODE_SPECS).forEach(([value, spec]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = spec.label;
      select.appendChild(option);
    });

    select.addEventListener('change', (event) => {
      this._valueChanged('appliance_type', event.target.value);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);

    return wrapper;
  }

  _buildNumberField(labelText, key) {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-group';

    const label = document.createElement('div');
    label.className = 'field-label';
    label.textContent = labelText;

    const input = document.createElement('ha-textfield');
    input.type = 'number';
    input.step = '1';
    input.value = this._config[key];
    input.addEventListener('change', (event) => {
      const parsedValue = Number(event.target.value);
      if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        event.target.value = this._config[key];
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

  _buildEntityField(labelText, key) {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-group';

    const label = document.createElement('div');
    label.className = 'field-label';
    label.textContent = labelText;
    wrapper.appendChild(label);

    const picker = document.createElement('ha-entity-picker');
    picker.hass = this._hass;
    picker.value = this._config[key] || '';
    picker.includeDomains = ['sensor'];
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
