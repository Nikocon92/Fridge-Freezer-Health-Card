class FridgeFreezerHealthCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement('fridge-freezer-health-card-editor');
  }

  static getStubConfig() {
    return {
      ambient_temperature_entity: '',
      interior_temperature_entity: '',
      power_consumption_entity: '',
      history_days: 1,
    };
  }

  setConfig(config) {
    this._config = {
      ...FridgeFreezerHealthCard.getStubConfig(),
      ...config,
    };

    if (!this._card) {
      this._card = document.createElement('ha-card');
      this._card.header = 'Fridge Freezer Health';
      this._content = document.createElement('div');
      this._content.className = 'card-content';
      this._card.appendChild(this._content);
      this.appendChild(this._card);
    }

    this._buildLayout();
    if (this._hass) {
      this.hass = this._hass;
    }
  }

  _buildLayout() {
    this._content.innerHTML = '';

    const sensors = [
      {
        key: 'ambient_temperature_entity',
        name: 'Ambient Temperature',
      },
      {
        key: 'interior_temperature_entity',
        name: 'Interior Temperature',
      },
      {
        key: 'power_consumption_entity',
        name: 'Power Consumption',
      },
    ];

    const infoGrid = document.createElement('div');
    infoGrid.className = 'sensor-grid';

    sensors.forEach(({ key, name }) => {
      const sensorTile = document.createElement('div');
      sensorTile.className = 'sensor-tile';

      const label = document.createElement('div');
      label.className = 'sensor-label';
      label.textContent = name;
      sensorTile.appendChild(label);

      const value = document.createElement('div');
      value.className = 'sensor-value';
      value.dataset.entityKey = key;
      value.textContent = '—';
      sensorTile.appendChild(value);

      infoGrid.appendChild(sensorTile);
    });

    const graphContainer = document.createElement('div');
    graphContainer.className = 'graph-list';

    sensors.forEach(({ key, name }) => {
      const entity = this._config[key];
      if (!entity) {
        return;
      }

      const title = document.createElement('h3');
      title.className = 'graph-title';
      title.textContent = `${name} History`;
      graphContainer.appendChild(title);

      const graph = document.createElement('hui-history-graph-card');
      graph.setConfig({
        entities: [entity],
        hours_to_show: this._getHoursToShow(),
        refresh_interval: 0,
      });
      graphContainer.appendChild(graph);
    });

    const style = document.createElement('style');
    style.textContent = `
      .sensor-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      .sensor-tile {
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        padding: 12px;
        background: var(--card-background-color, var(--ha-card-background));
      }
      .sensor-label {
        font-size: 0.9rem;
        color: var(--secondary-text-color);
      }
      .sensor-value {
        margin-top: 6px;
        font-size: 1.6rem;
        font-weight: 600;
      }
      .graph-list {
        display: grid;
        gap: 8px;
      }
      .graph-title {
        margin: 8px 0 0;
        font-size: 1rem;
      }
    `;

    this._content.appendChild(style);
    this._content.appendChild(infoGrid);
    this._content.appendChild(graphContainer);
  }

  _getHoursToShow() {
    const days = Number(this._config.history_days);
    if (!Number.isFinite(days) || days <= 0) {
      return 24;
    }

    return days * 24;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config || !this._content) {
      return;
    }

    this._content.querySelectorAll('.sensor-value').forEach((element) => {
      const key = element.dataset.entityKey;
      const entityId = this._config[key];
      if (!entityId || !hass.states[entityId]) {
        element.textContent = 'Unavailable';
        return;
      }

      const entity = hass.states[entityId];
      const unit = entity.attributes.unit_of_measurement ? ` ${entity.attributes.unit_of_measurement}` : '';
      element.textContent = `${entity.state}${unit}`;
    });

    this._content.querySelectorAll('hui-history-graph-card').forEach((graph) => {
      graph.hass = hass;
    });
  }

  getCardSize() {
    return 7;
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
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) {
      return;
    }

    this.innerHTML = '';

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
      ha-textfield {
        width: 100%;
      }
    `;

    root.appendChild(style);
    root.appendChild(this._buildEntityField('Ambient Temperature (°C)', 'ambient_temperature_entity'));
    root.appendChild(this._buildEntityField('Interior Temperature (°C)', 'interior_temperature_entity'));
    root.appendChild(this._buildEntityField('Power Consumption (W)', 'power_consumption_entity'));

    const dayField = document.createElement('div');
    dayField.className = 'input-group';

    const dayLabel = document.createElement('div');
    dayLabel.className = 'field-label';
    dayLabel.textContent = 'History period (days)';
    dayField.appendChild(dayLabel);

    const dayInput = document.createElement('ha-textfield');
    dayInput.type = 'number';
    dayInput.step = '0.1';
    dayInput.min = '0.1';
    dayInput.value = this._config.history_days;
    dayInput.addEventListener('change', (event) => {
      this._valueChanged('history_days', Number(event.target.value));
    });
    dayField.appendChild(dayInput);

    root.appendChild(dayField);
    this.appendChild(root);
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
  description: 'Shows ambient/interior temperature and power usage with history graphs.',
});
