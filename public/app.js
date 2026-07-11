const api = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Erro na API');
  return data;
};

const state = {
  cities: [],
  allUfs: [],
  categories: [],
  rollups: [],
  stateCenters: [],
  stateRankings: [],
  nationalRanking: [],
  totals: null,
  mapLevel: 'state',
  mapSignature: '',
  autoUf: '',
  userMovedMap: false,
  selectedCity: null,
  selectedCityRank: null,
  cityCategory: '',
  markers: L.layerGroup(),
  page: 1,
  q: ''
};

const map = L.map('map', { zoomControl: true, doubleClickZoom: false }).setView([-14.235, -51.9253], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
state.markers.addTo(map);

const els = {
  viewTriggers: document.querySelectorAll('[data-view-target]'),
  navButtons: document.querySelectorAll('.nav-button[data-view-target]'),
  views: document.querySelectorAll('.view'),
  ufFilter: document.querySelector('#ufFilter'),
  categoryFilter: document.querySelector('#categoryFilter'),
  filterToggle: document.querySelector('#filterToggle'),
  filterPanel: document.querySelector('#filterPanel'),
  filterSummary: document.querySelector('#filterSummary'),
  clearFiltersButton: document.querySelector('#clearFiltersButton'),
  cityPageInput: document.querySelector('#cityPageInput'),
  cityPageSearchButton: document.querySelector('#cityPageSearchButton'),
  mapEmpty: document.querySelector('#mapEmpty'),
  mapMode: document.querySelector('#mapMode'),
  sourceDate: document.querySelector('#sourceDate'),
  totalEstablishments: document.querySelector('#totalEstablishments'),
  totalStates: document.querySelector('#totalStates'),
  totalCities: document.querySelector('#totalCities'),
  totalCategories: document.querySelector('#totalCategories'),
  statePageTitle: document.querySelector('#statePageTitle'),
  statePageSubtitle: document.querySelector('#statePageSubtitle'),
  stateAnalysisFilter: document.querySelector('#stateAnalysisFilter'),
  topStatesLabel: document.querySelector('#topStatesLabel'),
  topStatesList: document.querySelector('#topStatesList'),
  stateRankingLabel: document.querySelector('#stateRankingLabel'),
  stateRankingList: document.querySelector('#stateRankingList'),
  stateCategoryLabel: document.querySelector('#stateCategoryLabel'),
  stateCategoryBars: document.querySelector('#stateCategoryBars'),
  categoryBars: document.querySelector('#categoryBars'),
  categoryTotalLabel: document.querySelector('#categoryTotalLabel'),
  insightScope: document.querySelector('#insightScope'),
  insightGrid: document.querySelector('#insightGrid'),
  insightCategoryTotal: document.querySelector('#insightCategoryTotal'),
  insightCategoryBars: document.querySelector('#insightCategoryBars'),
  insightGeoTotal: document.querySelector('#insightGeoTotal'),
  insightGeoBars: document.querySelector('#insightGeoBars'),
  insightCityBars: document.querySelector('#insightCityBars'),
  insightMarketBands: document.querySelector('#insightMarketBands'),
  insightNarratives: document.querySelector('#insightNarratives'),
  rankingList: document.querySelector('#rankingList'),
  rankingTotalLabel: document.querySelector('#rankingTotalLabel'),
  cityDetail: document.querySelector('#cityDetail'),
  detailTemplate: document.querySelector('#detailTemplate')
};

const formatDate = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '-';
const formatNumber = (value) => new Intl.NumberFormat('pt-BR').format(value || 0);
const formatPercent = (value, digits = 1) => `${new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
}).format(value || 0)}%`;
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const stateRankingLimit = 50;
const heatScale = [
  { stop: 0, fill: '#2b83ba', stroke: '#1f5f88' },
  { stop: .28, fill: '#44b7a5', stroke: '#2b8176' },
  { stop: .52, fill: '#abdda4', stroke: '#6d9f66' },
  { stop: .72, fill: '#fdae61', stroke: '#c97825' },
  { stop: .9, fill: '#f46d43', stroke: '#b94527' },
  { stop: 1, fill: '#d73027', stroke: '#8f1f1a' }
];
const chartColors = ['#1f7a5a', '#2456a6', '#d96c2c', '#8b5cf6', '#0f9f9a', '#d1495b', '#6d9f66', '#7a6a53', '#9aa3a0'];
const stateNames = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapa',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceara',
  DF: 'Distrito Federal',
  ES: 'Espirito Santo',
  GO: 'Goias',
  MA: 'Maranhao',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Para',
  PB: 'Paraiba',
  PR: 'Parana',
  PE: 'Pernambuco',
  PI: 'Piaui',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondonia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'Sao Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins'
};
const stateName = (uf) => stateNames[uf] || uf;

function activateView(viewId) {
  els.views.forEach((view) => {
    const active = view.id === viewId;
    view.hidden = !active;
    view.classList.toggle('active', active);
  });
  els.navButtons.forEach((button) => button.classList.toggle('active', button.dataset.viewTarget === viewId));
  if (viewId === 'mapView') {
    setTimeout(() => map.invalidateSize(), 0);
  }
}

function fillUfFilter() {
  const ufs = state.allUfs.length ? state.allUfs : [...new Set(state.cities.map((city) => city.uf))].sort();
  const selectedState = els.stateAnalysisFilter.value || '';
  els.ufFilter.innerHTML = '<option value="">Todas</option>' + ufs.map((uf) => `<option value="${escapeHtml(uf)}">${escapeHtml(uf)}</option>`).join('');
  els.stateAnalysisFilter.innerHTML = '<option value="">Todos os estados</option>' +
    ufs.map((uf) => `<option value="${escapeHtml(uf)}">${escapeHtml(uf)} - ${escapeHtml(stateName(uf))}</option>`).join('');
  if (ufs.includes(selectedState)) {
    els.stateAnalysisFilter.value = selectedState;
  } else {
    els.stateAnalysisFilter.value = '';
  }
}

function fillCategoryFilter() {
  els.categoryFilter.innerHTML = '<option value="">Todas</option>' +
    state.categories.map((item) => `<option value="${escapeHtml(item.category)}">${escapeHtml(item.category)}</option>`).join('');
}

function renderFilterState() {
  const chips = [];
  if (els.ufFilter.value) {
    chips.push(`UF ${els.ufFilter.value}`);
  } else if (state.autoUf && state.mapLevel === 'city') {
    chips.push(`UF auto ${state.autoUf}`);
  }
  if (els.categoryFilter.value) chips.push(els.categoryFilter.value);

  els.filterSummary.hidden = chips.length === 0;
  els.filterSummary.textContent = chips.join(' | ');
  els.clearFiltersButton.hidden = chips.length === 0;
}

function nearestStateUf() {
  if (!state.stateCenters.length) return '';
  const center = map.getCenter();
  let nearest = state.stateCenters[0];
  let nearestDistance = Infinity;
  state.stateCenters.forEach((item) => {
    const distance = Math.abs(Number(item.latitude) - center.lat) + Math.abs(Number(item.longitude) - center.lng);
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  });
  return nearest?.uf || '';
}

async function ensureStateCenters() {
  if (state.stateCenters.length) return;
  const params = new URLSearchParams({ level: 'state' });
  if (els.categoryFilter.value) params.set('category', els.categoryFilter.value);
  const centers = await api(`/map/rollups?${params.toString()}`);
  state.stateCenters = centers.filter((item) => item.latitude && item.longitude);
}

function heatColor(value, min, max) {
  if (max <= min) return heatScale[heatScale.length - 1];
  const minLog = Math.log10(min + 1);
  const maxLog = Math.log10(max + 1);
  const position = Math.max(0, Math.min(1, (Math.log10(value + 1) - minLog) / (maxLog - minLog)));
  return heatScale.find((item) => position <= item.stop) || heatScale[heatScale.length - 1];
}

function renderMarkers() {
  state.markers.clearLayers();
  const bounds = [];
  const totals = state.rollups
    .map((item) => Number(item.total || 0))
    .filter((total) => total > 0);
  const minTotal = Math.min(...totals, 0);
  const maxTotal = Math.max(...totals, 0);

  state.rollups.forEach((item) => {
    if (!item.latitude || !item.longitude || !Number(item.total)) return;
    const markerLevel = state.mapLevel;
    const total = Number(item.total);
    const radius = Math.max(10, Math.min(42, Math.sqrt(total) / (markerLevel === 'city' ? 12 : 24)));
    const color = heatColor(total, minTotal, maxTotal);
    const label = markerLevel === 'state'
        ? item.uf
        : `${item.name}/${item.uf}`;
    const marker = L.circleMarker([Number(item.latitude), Number(item.longitude)], {
      radius,
      color: color.stroke,
      fillColor: color.fill,
      fillOpacity: 0.72,
      weight: 2
    }).bindPopup(`<strong>${escapeHtml(label)}</strong><br>${formatNumber(total)} estabelecimentos`);
    marker.on('click', () => handleMarkerClick(item, markerLevel));
    marker.on('dblclick', () => handleMarkerDoubleClick(item, markerLevel));
    marker.addTo(state.markers);
    bounds.push([Number(item.latitude), Number(item.longitude)]);
  });

  els.mapEmpty.hidden = bounds.length > 0;
  if (bounds.length && !state.userMovedMap) {
    if (bounds.length === 1) {
      const zoom = state.mapLevel === 'state' ? 5 : 9;
      map.setView(bounds[0], zoom, { animate: false });
    } else {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: state.mapLevel === 'city' ? 9 : 6 });
    }
  }
}

function getLevelForZoom() {
  const zoom = map.getZoom();
  if (els.ufFilter.value && zoom < 7) return 'state';
  if (zoom < 7) return 'state';
  return 'city';
}

function updateMapModeLabel() {
  const labels = {
    state: 'Estados',
    city: 'Cidades'
  };
  els.mapMode.textContent = labels[state.mapLevel];
}

async function loadMapRollups() {
  const nextLevel = getLevelForZoom();
  if (nextLevel === 'city' && !els.ufFilter.value) {
    await ensureStateCenters();
    state.autoUf = nearestStateUf();
  } else if (nextLevel === 'state' || els.ufFilter.value) {
    state.autoUf = '';
  }
  const params = new URLSearchParams({ level: nextLevel });
  const effectiveUf = els.ufFilter.value || state.autoUf;
  if (effectiveUf) params.set('uf', effectiveUf);
  if (els.categoryFilter.value) params.set('category', els.categoryFilter.value);
  const signature = params.toString();
  if (signature === state.mapSignature) return;
  state.mapSignature = signature;
  state.mapLevel = nextLevel;
  state.rollups = await api(`/map/rollups?${params.toString()}`);
  if (nextLevel === 'state' && !els.ufFilter.value) {
    state.stateCenters = state.rollups.filter((item) => item.latitude && item.longitude);
    state.stateRankings = state.rollups;
  }
  updateMapModeLabel();
  renderFilterState();
  renderMarkers();
}

async function handleMarkerClick(item, markerLevel) {
  if (markerLevel === 'state') {
    state.autoUf = item.uf;
    state.userMovedMap = false;
    state.mapSignature = '';
    map.setView([Number(item.latitude), Number(item.longitude)], 7);
    await loadMapRollups();
    return;
  }
}

async function handleMarkerDoubleClick(item, markerLevel) {
  if (markerLevel === 'state') {
    els.stateAnalysisFilter.value = item.uf;
    await loadStateAnalysis();
    activateView('statesView');
    return;
  }
  await selectCity({ uf: item.uf, name: item.name });
  activateView('citiesView');
}

async function loadTotals() {
  const totals = await api('/totals');
  state.totals = totals;
  els.totalEstablishments.textContent = formatNumber(totals.establishments);
  els.totalStates.textContent = formatNumber(totals.states);
  els.totalCities.textContent = formatNumber(totals.cities);
  els.totalCategories.textContent = formatNumber(totals.categories);
}

async function ensureTotals() {
  if (!state.totals) {
    state.totals = await api('/totals');
  }
  return state.totals;
}

async function loadRanking() {
  state.nationalRanking = (await api(`/ranking/cities?limit=${stateRankingLimit}`))
    .map((item, index) => ({ ...item, national_rank: index + 1 }));
  renderNationalRanking();
}

function renderNationalRanking() {
  const selectedItem = state.selectedCity && state.selectedCityRank
    ? {
      uf: state.selectedCity.uf,
      city: state.selectedCity.name,
      total: state.selectedCityRank.total,
      national_rank: state.selectedCityRank.national_rank
    }
    : null;
  const selectedKey = selectedItem ? `${selectedItem.uf}|${selectedItem.city}` : '';
  const orderedRanking = selectedItem
    ? [selectedItem, ...state.nationalRanking.filter((item) => `${item.uf}|${item.city}` !== selectedKey)]
    : state.nationalRanking;

  els.rankingTotalLabel.textContent = `Top ${state.nationalRanking.length}`;
  els.rankingList.innerHTML = orderedRanking.map((item) =>
    `<li>
      <button class="linklike ranked-link" data-uf="${escapeHtml(item.uf)}" data-city="${escapeHtml(item.city)}">
        <span><b>#${formatNumber(item.national_rank)}</b> ${escapeHtml(item.city)}/${escapeHtml(item.uf)}</span>
        <strong>${formatNumber(item.total)}</strong>
      </button>
    </li>`
  ).join('') || '<li>Nenhuma cidade carregada.</li>';
  els.rankingList.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', async () => {
      await selectCity({ uf: button.dataset.uf, name: button.dataset.city });
      activateView('citiesView');
    });
  });
  updateCityRankingSelection();
}

function updateCityRankingSelection() {
  els.rankingList.querySelectorAll('button').forEach((button) => {
    const active = state.selectedCity?.uf === button.dataset.uf &&
      state.selectedCity?.name === button.dataset.city;
    button.classList.toggle('is-selected', active);
  });
}

async function loadCategoryTotals() {
  const categories = await api('/categories/totals');
  const total = categories.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const max = Math.max(...categories.map((item) => Number(item.total || 0)), 1);
  els.categoryTotalLabel.textContent = formatNumber(total);
  els.categoryBars.innerHTML = categories.map((item) => {
    const percent = Math.max(2, Math.round((Number(item.total || 0) / max) * 100));
    return `
      <button class="bar-row" data-category="${escapeHtml(item.category)}">
        <span class="bar-heading">
          <span>${escapeHtml(item.category)}</span>
          <strong>${formatNumber(item.total)}</strong>
        </span>
        <span class="bar-track"><span class="bar-fill" style="width: ${percent}%"></span></span>
      </button>
    `;
  }).join('');
  els.categoryBars.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', async () => {
      els.categoryFilter.value = button.dataset.category;
      await loadCities();
    });
  });
}

function renderInsightDonut(target, items, total, labelKey = 'category') {
  let offset = 0;
  const segments = items.map((item, index) => {
    const value = Number(item.total || 0);
    const percent = total ? (value / total) * 100 : 0;
    const segment = {
      ...item,
      value,
      percent,
      color: chartColors[index % chartColors.length],
      offset
    };
    offset += percent;
    return segment;
  });

  target.innerHTML = `
    <div class="donut-wrap">
      <svg class="donut-chart" viewBox="0 0 44 44" role="img" aria-label="Distribuicao percentual">
        <circle class="donut-bg" cx="22" cy="22" r="15.9155"></circle>
        ${segments.map((item) => `
          <circle
            class="donut-segment"
            cx="22"
            cy="22"
            r="15.9155"
            stroke="${item.color}"
            stroke-dasharray="${item.percent} ${100 - item.percent}"
            stroke-dashoffset="${25 - item.offset}">
          </circle>
        `).join('')}
      </svg>
      <div class="donut-center">
        <strong>${formatPercent(segments[0]?.percent || 0)}</strong>
        <span>${escapeHtml(segments[0]?.[labelKey] || '-')}</span>
      </div>
    </div>
    <div class="donut-legend">
      ${segments.map((item) => `
        <div class="legend-row">
          <span class="legend-dot" style="background: ${item.color}"></span>
          <span>${escapeHtml(item[labelKey])}</span>
          <strong>${formatPercent(item.percent)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRankBars(target, items, total) {
  const max = Math.max(...items.map((item) => Number(item.total || 0)), 1);
  target.innerHTML = items.map((item, index) => {
    const value = Number(item.total || 0);
    const percent = total ? (value / total) * 100 : 0;
    const width = Math.max(3, Math.round((value / max) * 100));
    return `
      <div class="rank-bar-row">
        <div class="rank-bar-label">
          <span><b>#${index + 1}</b> ${escapeHtml(item.city)}/${escapeHtml(item.uf)}</span>
          <strong>${formatPercent(percent)}</strong>
        </div>
        <span class="bar-track"><span class="bar-fill" style="width: ${width}%"></span></span>
      </div>
    `;
  }).join('');
}

async function loadInsights() {
  const totals = await ensureTotals();
  const [categories, topCities] = await Promise.all([
    api('/categories/totals'),
    api('/ranking/cities?limit=50')
  ]);
  if (!state.stateRankings.length) {
    state.stateRankings = await api('/map/rollups?level=state');
  }

  const totalEstablishments = Number(totals.establishments || 0);
  const topCategory = categories[0] || { category: '-', total: 0 };
  const topTwoCategories = categories.slice(0, 2).reduce((sum, item) => sum + Number(item.total || 0), 0);
  const topFiveCities = topCities.slice(0, 5).reduce((sum, item) => sum + Number(item.total || 0), 0);
  const topState = state.stateRankings[0] || { uf: '-', total: 0 };
  const topFiveStates = state.stateRankings.slice(0, 5).reduce((sum, item) => sum + Number(item.total || 0), 0);
  const averagePerCity = totalEstablishments / Math.max(Number(totals.cities || 0), 1);
  const topTwoCategoryNames = categories.slice(0, 2).map((item) => item.category).join(' + ');
  const topFiveCityNames = topCities.slice(0, 5).map((item) => `${item.city}/${item.uf}`).join(', ');
  const topFiveStateNames = state.stateRankings.slice(0, 5).map((item) => item.uf).join(', ');
  const cityBands = [
    { label: 'Megapolos', range: '10 mil+', count: 0, total: 0 },
    { label: 'Polos regionais', range: '2 mil a 9.999', count: 0, total: 0 },
    { label: 'Mercado medio', range: '500 a 1.999', count: 0, total: 0 },
    { label: 'Cauda longa', range: 'Ate 499', count: 0, total: 0 }
  ];
  state.cities.forEach((city) => {
    const value = Number(city.total || 0);
    if (value >= 10000) {
      cityBands[0].count += 1;
      cityBands[0].total += value;
    } else if (value >= 2000) {
      cityBands[1].count += 1;
      cityBands[1].total += value;
    } else if (value >= 500) {
      cityBands[2].count += 1;
      cityBands[2].total += value;
    } else {
      cityBands[3].count += 1;
      cityBands[3].total += value;
    }
  });
  const topTenCities = topCities.slice(0, 10).reduce((sum, item) => sum + Number(item.total || 0), 0);
  const topTenStates = state.stateRankings.slice(0, 10).reduce((sum, item) => sum + Number(item.total || 0), 0);
  const longTailCities = cityBands[3];

  els.insightScope.textContent = `${formatNumber(totals.cities)} cidades | ${formatNumber(totalEstablishments)} estabelecimentos`;
  els.insightGrid.innerHTML = `
    <div class="insight-card is-primary">
      <span>Categoria dominante</span>
      <strong>${formatPercent((Number(topCategory.total || 0) / totalEstablishments) * 100)}</strong>
      <p>${escapeHtml(topCategory.category)}: ${formatNumber(topCategory.total)} estabelecimentos ativos.</p>
    </div>
    <div class="insight-card">
      <span>Dupla que puxa o setor</span>
      <strong>${formatPercent((topTwoCategories / totalEstablishments) * 100)}</strong>
      <p>${escapeHtml(topTwoCategoryNames)}: ${formatNumber(topTwoCategories)} estabelecimentos.</p>
    </div>
    <div class="insight-card">
      <span>Concentracao urbana</span>
      <strong>${formatPercent((topFiveCities / totalEstablishments) * 100)}</strong>
      <p>${escapeHtml(topFiveCityNames)}: ${formatNumber(topFiveCities)} estabelecimentos.</p>
    </div>
    <div class="insight-card">
      <span>Estado lider</span>
      <strong>${formatPercent((Number(topState.total || 0) / totalEstablishments) * 100)}</strong>
      <p>${escapeHtml(topState.uf)}: ${formatNumber(topState.total)} estabelecimentos.</p>
    </div>
    <div class="insight-card">
      <span>Top 5 estados</span>
      <strong>${formatPercent((topFiveStates / totalEstablishments) * 100)}</strong>
      <p>${escapeHtml(topFiveStateNames)}: ${formatNumber(topFiveStates)} estabelecimentos.</p>
    </div>
    <div class="insight-card">
      <span>Densidade media</span>
      <strong>${formatNumber(Math.round(averagePerCity))}</strong>
      <p>${formatNumber(totalEstablishments)} estabelecimentos em ${formatNumber(totals.cities)} cidades.</p>
    </div>
  `;

  els.insightCategoryTotal.textContent = `${formatNumber(categories.length)} categorias`;
  renderInsightDonut(els.insightCategoryBars, categories, totalEstablishments);
  els.insightGeoTotal.textContent = `${formatNumber(state.stateRankings.length)} estados`;
  const geoSlices = state.stateRankings.slice(0, 8).map((item) => ({ name: `${item.uf} - ${stateName(item.uf)}`, total: item.total }));
  const geoOthers = state.stateRankings.slice(8).reduce((sum, item) => sum + Number(item.total || 0), 0);
  if (geoOthers) geoSlices.push({ name: 'Outros estados', total: geoOthers });
  renderInsightDonut(
    els.insightGeoBars,
    geoSlices,
    totalEstablishments,
    'name'
  );
  renderRankBars(els.insightCityBars, topCities.slice(0, 8), totalEstablishments);
  els.insightMarketBands.innerHTML = cityBands.map((band) => `
    <div class="band-card">
      <span>${escapeHtml(band.label)}</span>
      <strong>${formatPercent((band.total / totalEstablishments) * 100)}</strong>
      <p>${formatNumber(band.count)} cidades | ${escapeHtml(band.range)}</p>
    </div>
  `).join('');
  els.insightNarratives.innerHTML = `
    <div>
      <span>Top 10 cidades</span>
      <strong>${formatPercent((topTenCities / totalEstablishments) * 100)}</strong>
      <p>Uma pequena elite urbana concentra demanda, oferta e concorrencia.</p>
    </div>
    <div>
      <span>Top 10 estados</span>
      <strong>${formatPercent((topTenStates / totalEstablishments) * 100)}</strong>
      <p>A expansao tende a seguir renda, populacao e densidade empresarial.</p>
    </div>
    <div>
      <span>Cauda longa</span>
      <strong>${formatPercent((longTailCities.total / totalEstablishments) * 100)}</strong>
      <p>${formatNumber(longTailCities.count)} cidades pequenas sustentam capilaridade nacional.</p>
    </div>
  `;
}

function renderStateCategoryBars(categories, categoryCount = categories.length) {
  const max = Math.max(...categories.map((item) => Number(item.total || 0)), 1);
  els.stateCategoryLabel.textContent = `Categorias: ${formatNumber(categoryCount)}`;
  els.stateCategoryBars.innerHTML = categories.map((item) => {
    const percent = Math.max(2, Math.round((Number(item.total || 0) / max) * 100));
    return `
      <button class="bar-row" data-category="${escapeHtml(item.category)}">
        <span class="bar-heading">
          <span>${escapeHtml(item.category)}</span>
          <strong>${formatNumber(item.total)}</strong>
        </span>
        <span class="bar-track"><span class="bar-fill" style="width: ${percent}%"></span></span>
      </button>
    `;
  }).join('');
}

function renderTopStates() {
  const selectedUf = els.stateAnalysisFilter.value;
  const selectedState = selectedUf ? state.stateRankings.find((item) => item.uf === selectedUf) : null;
  const orderedStates = selectedState
    ? [selectedState, ...state.stateRankings.filter((item) => item.uf !== selectedUf)]
    : state.stateRankings;

  const total = state.totals?.establishments ??
    state.stateRankings.reduce((sum, item) => sum + Number(item.total || 0), 0);
  els.topStatesLabel.textContent = `Total: ${formatNumber(total)}`;
  els.topStatesList.innerHTML = orderedStates.map((item) => {
    const rankPosition = state.stateRankings.findIndex((stateItem) => stateItem.uf === item.uf) + 1;
    return `
    <li>
      <button class="linklike ranked-link${item.uf === selectedUf ? ' is-selected' : ''}" data-uf="${escapeHtml(item.uf)}">
        <span><b>#${rankPosition}</b> ${escapeHtml(item.uf)} - ${escapeHtml(stateName(item.uf))}</span>
        <strong>${formatNumber(item.total)}</strong>
      </button>
    </li>
  `;
  }).join('');
  els.topStatesList.closest('.state-card')?.classList.toggle('is-selected', Boolean(selectedUf));
  els.topStatesList.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', async () => {
      els.stateAnalysisFilter.value = button.dataset.uf;
      await loadStateAnalysis();
    });
  });
}

async function loadStateAnalysis() {
  if (!state.stateRankings.length) {
    state.stateRankings = await api('/map/rollups?level=state');
  }
  const totals = await ensureTotals();
  renderTopStates();

  const uf = els.stateAnalysisFilter.value;
  if (!uf) {
    const categories = await api('/categories/totals');
    const topCities = await api(`/ranking/cities?limit=${stateRankingLimit}`);
    els.statePageTitle.textContent = 'Todos os estados';
    els.statePageSubtitle.textContent = 'Ranking estadual dos estabelecimentos ativos de alimentacao.';
    els.stateRankingLabel.textContent = `Cidades: ${formatNumber(totals.cities)}`;
    els.stateRankingList.innerHTML = topCities.map((item, index) => `
      <li>
        <button class="linklike ranked-link" data-uf="${escapeHtml(item.uf)}" data-city="${escapeHtml(item.city)}">
          <span><b>#${index + 1}</b> ${escapeHtml(item.city)}/${escapeHtml(item.uf)}</span>
          <strong>${formatNumber(item.total)}</strong>
        </button>
      </li>
    `).join('');
    els.stateRankingList.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', async () => {
        await selectCity({ uf: button.dataset.uf, name: button.dataset.city });
        activateView('citiesView');
      });
    });
    renderStateCategoryBars(categories, totals.categories);
    return;
  }

  const data = await api(`/states/${encodeURIComponent(uf)}/analysis`);
  const rankPosition = state.stateRankings.findIndex((item) => item.uf === uf) + 1;
  els.statePageTitle.textContent = `#${rankPosition || '-'} ${stateName(uf)} (${uf})`;
  els.statePageSubtitle.textContent = 'Top cidades e categorias mais relevantes no estado.';
  els.stateRankingLabel.textContent = `Cidades: ${formatNumber(data.summary.cities)}`;
  els.stateRankingList.innerHTML = data.topCities.map((item, index) => `
    <li>
      <button class="linklike ranked-link" data-uf="${escapeHtml(item.uf)}" data-city="${escapeHtml(item.city)}">
        <span><b>#${index + 1}</b> ${escapeHtml(item.city)}/${escapeHtml(item.uf)}</span>
        <strong>${formatNumber(item.total)}</strong>
      </button>
    </li>
  `).join('');
  els.stateRankingList.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', async () => {
      await selectCity({ uf: button.dataset.uf, name: button.dataset.city });
      activateView('citiesView');
    });
  });
  renderStateCategoryBars(data.categories, data.summary.categories);
}

async function loadCities() {
  const params = new URLSearchParams();
  if (els.ufFilter.value) params.set('uf', els.ufFilter.value);
  if (els.categoryFilter.value) params.set('category', els.categoryFilter.value);
  state.cities = await api(`/cities?${params.toString()}`);
  if (!params.get('uf')) {
    state.allUfs = [...new Set(state.cities
      .filter((city) => city.latitude && city.longitude)
      .map((city) => city.uf))].sort();
  }
  fillUfFilter();
  els.ufFilter.value = params.get('uf') || '';
  renderFilterState();
  await loadMapRollups();
  await loadStateAnalysis();
}

async function loadSources() {
  const totals = await api('/totals');
  els.sourceDate.textContent = `Carga ${formatDate(totals.last_update_at)}`;
}

async function selectCity(city) {
  state.selectedCity = city;
  state.selectedCityRank = null;
  state.cityCategory = '';
  state.page = 1;
  state.q = '';
  renderNationalRanking();
  await renderCityDetail();
}

async function renderCityDetail() {
  const city = state.selectedCity;
  const fragment = els.detailTemplate.content.cloneNode(true);
  const root = fragment.querySelector('div');
  root.querySelector('[data-city-title]').textContent = `${city.name}/${city.uf}`;
  const rankLabel = root.querySelector('[data-city-rank]');
  rankLabel.textContent = 'Ranking nacional';

  try {
    const rank = await api(`/cities/${encodeURIComponent(city.uf)}/${encodeURIComponent(city.name)}/rank`);
    state.selectedCityRank = rank;
    rankLabel.textContent = `#${formatNumber(rank.national_rank)} no ranking nacional`;
    renderNationalRanking();
  } catch {
    rankLabel.textContent = 'Sem ranking nacional';
  }

  let statusText = 'Dados importados da Receita Federal.';
  try {
    const status = await api(`/cities/${encodeURIComponent(city.uf)}/${encodeURIComponent(city.name)}/status`);
    statusText = `Ultima carga local: ${formatDate(status.city.last_update_at)}`;
    if (status.city.last_error) {
      const notice = document.createElement('div');
      notice.className = 'notice error';
      notice.textContent = status.city.last_error;
      root.appendChild(notice);
    }
  } catch {
    statusText = 'Cidade importada na base local.';
  }
  root.querySelector('[data-city-status]').textContent = statusText;

  const categories = await api(`/cities/${encodeURIComponent(city.uf)}/${encodeURIComponent(city.name)}/aggregates`);
  root.querySelector('[data-categories]').innerHTML = categories.map((item) =>
    `<button class="chip category-chip${state.cityCategory === item.category ? ' is-selected' : ''}" data-category="${escapeHtml(item.category)}" type="button">${escapeHtml(item.category)}: ${formatNumber(item.total)}</button>`
  ).join('') || '<span class="chip">Sem agregados salvos</span>';
  root.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.cityCategory = state.cityCategory === button.dataset.category ? '' : button.dataset.category;
      state.page = 1;
      await renderCityDetail();
    });
  });

  const search = root.querySelector('[data-search]');
  const searchButton = root.querySelector('[data-search-button]');
  search.value = state.q;
  const runEstablishmentSearch = async () => {
    state.q = search.value;
    state.page = 1;
    await renderCityDetail();
  };
  searchButton.addEventListener('click', runEstablishmentSearch);
  search.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') await runEstablishmentSearch();
  });

  const establishmentParams = new URLSearchParams({
    page: String(state.page),
    pageSize: '15',
    q: state.q
  });
  if (state.cityCategory) establishmentParams.set('category', state.cityCategory);
  const establishments = await api(`/cities/${encodeURIComponent(city.uf)}/${encodeURIComponent(city.name)}/establishments?${establishmentParams.toString()}`);
  root.querySelector('[data-establishments]').innerHTML = establishments.data.map((item) => `
    <tr>
      <td>${escapeHtml(item.trade_name && item.trade_name !== '-' ? item.trade_name : item.legal_name || '-')}</td>
      <td>${escapeHtml(item.category || '-')}</td>
      <td>${escapeHtml(item.neighborhood || '-')}</td>
      <td>${escapeHtml(item.registration_status || '-')}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">Nenhum estabelecimento salvo para esta cidade.</td></tr>';

  const maxPage = Math.max(1, Math.ceil(establishments.total / establishments.pageSize));
  root.querySelector('[data-page]').textContent = `${state.page} / ${maxPage}`;
  root.querySelector('[data-prev]').disabled = state.page <= 1;
  root.querySelector('[data-next]').disabled = state.page >= maxPage;
  root.querySelector('[data-prev]').addEventListener('click', async () => {
    state.page -= 1;
    await renderCityDetail();
  });
  root.querySelector('[data-next]').addEventListener('click', async () => {
    state.page += 1;
    await renderCityDetail();
  });

  els.cityDetail.innerHTML = '';
  els.cityDetail.appendChild(fragment);
}

async function searchImportedCity() {
  const q = els.cityPageInput.value.trim();
  if (!q) return;
  const params = new URLSearchParams({ q });
  const results = await api(`/cities/search?${params.toString()}`);
  if (!results.length) {
    els.cityDetail.innerHTML = '<h2>Detalhe da cidade</h2><p class="empty">Nenhuma cidade encontrada na base local para essa busca.</p>';
    activateView('citiesView');
    return;
  }
  const city = results[0];
  await selectCity({ uf: city.uf, name: city.name });
  els.cityPageInput.value = q;
  if (city.latitude && city.longitude) {
    map.setView([Number(city.latitude), Number(city.longitude)], 9);
  }
  activateView('citiesView');
}

async function refreshAll() {
  await Promise.all([loadTotals(), loadRanking(), loadCities(), loadSources(), loadCategoryTotals()]);
  await loadInsights();
}

els.cityPageSearchButton.addEventListener('click', searchImportedCity);
els.cityPageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') searchImportedCity();
});
els.ufFilter.addEventListener('change', loadCities);
els.categoryFilter.addEventListener('change', loadCities);
els.filterToggle.addEventListener('click', () => {
  const expanded = els.filterPanel.hidden;
  els.filterPanel.hidden = !expanded;
  els.filterToggle.setAttribute('aria-expanded', String(expanded));
});
els.clearFiltersButton.addEventListener('click', async () => {
  els.ufFilter.value = '';
  els.categoryFilter.value = '';
  state.autoUf = '';
  state.userMovedMap = false;
  state.mapSignature = '';
  await loadCities();
});
els.stateAnalysisFilter.addEventListener('change', loadStateAnalysis);
els.navButtons.forEach((button) => {
  button.addEventListener('click', () => activateView(button.dataset.viewTarget));
});
els.viewTriggers.forEach((trigger) => {
  if (trigger.classList.contains('nav-button')) return;
  trigger.addEventListener('click', () => activateView(trigger.dataset.viewTarget));
});
map.on('zoomend', async () => {
  state.userMovedMap = true;
  await loadMapRollups();
});
map.on('moveend', async () => {
  if (state.mapLevel !== 'city' || els.ufFilter.value) return;
  state.userMovedMap = true;
  await loadMapRollups();
});

state.categories = await api('/cnaes');
fillCategoryFilter();
await refreshAll();
await selectCity({ uf: 'SP', name: 'SAO PAULO' });
