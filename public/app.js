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
  mapLevel: 'state',
  mapSignature: '',
  autoUf: '',
  userMovedMap: false,
  selectedCity: null,
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
  navButtons: document.querySelectorAll('[data-view-target]'),
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
  stateCitiesLabel: document.querySelector('#stateCitiesLabel'),
  stateCategoriesLabel: document.querySelector('#stateCategoriesLabel'),
  stateCities: document.querySelector('#stateCities'),
  stateCategories: document.querySelector('#stateCategories'),
  topStatesLabel: document.querySelector('#topStatesLabel'),
  topStatesList: document.querySelector('#topStatesList'),
  stateRankingLabel: document.querySelector('#stateRankingLabel'),
  stateRankingList: document.querySelector('#stateRankingList'),
  stateCategoryLabel: document.querySelector('#stateCategoryLabel'),
  stateCategoryBars: document.querySelector('#stateCategoryBars'),
  categoryBars: document.querySelector('#categoryBars'),
  categoryTotalLabel: document.querySelector('#categoryTotalLabel'),
  rankingList: document.querySelector('#rankingList'),
  cityDetail: document.querySelector('#cityDetail'),
  detailTemplate: document.querySelector('#detailTemplate')
};

const formatDate = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '-';
const formatNumber = (value) => new Intl.NumberFormat('pt-BR').format(value || 0);
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
  els.ufFilter.innerHTML = '<option value="">Todas</option>' + ufs.map((uf) => `<option value="${uf}">${uf}</option>`).join('');
  els.stateAnalysisFilter.innerHTML = '<option value="">Todos os estados</option>' +
    ufs.map((uf) => `<option value="${uf}">${uf} - ${stateName(uf)}</option>`).join('');
  if (ufs.includes(selectedState)) {
    els.stateAnalysisFilter.value = selectedState;
  } else {
    els.stateAnalysisFilter.value = '';
  }
}

function fillCategoryFilter() {
  els.categoryFilter.innerHTML = '<option value="">Todas</option>' +
    state.categories.map((item) => `<option value="${item.category}">${item.category}</option>`).join('');
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


function renderMarkers() {
  state.markers.clearLayers();
  const bounds = [];

  state.rollups.forEach((item) => {
    if (!item.latitude || !item.longitude || !Number(item.total)) return;
    const markerLevel = state.mapLevel;
    const radius = Math.max(10, Math.min(42, Math.sqrt(Number(item.total)) / (markerLevel === 'city' ? 12 : 24)));
    const label = markerLevel === 'state'
        ? item.uf
        : `${item.name}/${item.uf}`;
    const marker = L.circleMarker([Number(item.latitude), Number(item.longitude)], {
      radius,
      color: markerLevel === 'city' ? '#1f7a5a' : '#2456a6',
      fillColor: markerLevel === 'city' ? '#d96c2c' : '#5d8bd9',
      fillOpacity: 0.62,
      weight: 2
    }).bindPopup(`<strong>${label}</strong><br>${formatNumber(item.total)} estabelecimentos`);
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
  els.totalEstablishments.textContent = formatNumber(totals.establishments);
  els.totalStates.textContent = formatNumber(totals.states);
  els.totalCities.textContent = formatNumber(totals.cities);
  els.totalCategories.textContent = formatNumber(totals.categories);
}

async function loadRanking() {
  const ranking = await api('/ranking/cities?limit=12');
  els.rankingList.innerHTML = ranking.map((item) =>
    `<li>
      <button class="linklike" data-uf="${item.uf}" data-city="${item.city}">
        <span>${item.city}/${item.uf}</span>
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
}

async function loadCategoryTotals() {
  const categories = await api('/categories/totals');
  const total = categories.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const max = Math.max(...categories.map((item) => Number(item.total || 0)), 1);
  els.categoryTotalLabel.textContent = formatNumber(total);
  els.categoryBars.innerHTML = categories.map((item) => {
    const percent = Math.max(2, Math.round((Number(item.total || 0) / max) * 100));
    return `
      <button class="bar-row" data-category="${item.category}">
        <span class="bar-heading">
          <span>${item.category}</span>
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

function renderStateCategoryBars(categories) {
  const total = categories.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const max = Math.max(...categories.map((item) => Number(item.total || 0)), 1);
  els.stateCategoryLabel.textContent = formatNumber(total);
  els.stateCategoryBars.innerHTML = categories.map((item) => {
    const percent = Math.max(2, Math.round((Number(item.total || 0) / max) * 100));
    return `
      <button class="bar-row" data-category="${item.category}">
        <span class="bar-heading">
          <span>${item.category}</span>
          <strong>${formatNumber(item.total)}</strong>
        </span>
        <span class="bar-track"><span class="bar-fill" style="width: ${percent}%"></span></span>
      </button>
    `;
  }).join('');
}

function renderTopStates() {
  const selectedUf = els.stateAnalysisFilter.value;
  const topStates = state.stateRankings.slice(0, 10);
  const selectedState = selectedUf ? state.stateRankings.find((item) => item.uf === selectedUf) : null;
  const orderedStates = selectedState
    ? [selectedState, ...topStates.filter((item) => item.uf !== selectedUf).slice(0, 9)]
    : topStates;

  els.topStatesLabel.textContent = `Estabelecimentos por estados: ${formatNumber(state.stateRankings.reduce((sum, item) => sum + Number(item.total || 0), 0))}`;
  els.topStatesList.innerHTML = orderedStates.map((item) => {
    const rankPosition = state.stateRankings.findIndex((stateItem) => stateItem.uf === item.uf) + 1;
    return `
    <li>
      <button class="linklike ranked-link${item.uf === selectedUf ? ' is-selected' : ''}" data-uf="${item.uf}">
        <span><b>#${rankPosition}</b> ${item.uf} - ${stateName(item.uf)}</span>
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
  renderTopStates();

  const uf = els.stateAnalysisFilter.value;
  if (!uf) {
    const totals = await api('/totals');
    const categories = await api('/categories/totals');
    const topCities = await api('/ranking/cities?limit=10');
    els.statePageTitle.textContent = 'Todos os estados';
    els.statePageSubtitle.textContent = 'Ranking estadual dos estabelecimentos ativos de alimentacao.';
    els.stateCitiesLabel.textContent = 'Cidades mapeadas';
    els.stateCategoriesLabel.textContent = 'Categorias mapeadas';
    els.stateCities.textContent = formatNumber(totals.cities);
    els.stateCategories.textContent = formatNumber(totals.categories);
    els.stateRankingLabel.textContent = 'Brasil';
    els.stateRankingList.innerHTML = topCities.map((item, index) => `
      <li>
        <button class="linklike ranked-link" data-uf="${item.uf}" data-city="${item.city}">
          <span><b>#${index + 1}</b> ${item.city}/${item.uf}</span>
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
    renderStateCategoryBars(categories);
    return;
  }

  const data = await api(`/states/${encodeURIComponent(uf)}/analysis`);
  const rankPosition = state.stateRankings.findIndex((item) => item.uf === uf) + 1;
  els.statePageTitle.textContent = `#${rankPosition || '-'} ${stateName(uf)} (${uf})`;
  els.statePageSubtitle.textContent = 'Top cidades e categorias mais relevantes no estado.';
  els.stateCitiesLabel.textContent = 'Cidades do estado';
  els.stateCategoriesLabel.textContent = 'Categorias no estado';
  els.stateCities.textContent = formatNumber(data.summary.cities);
  els.stateCategories.textContent = formatNumber(data.summary.categories);
  els.stateRankingLabel.textContent = uf;
  els.stateRankingList.innerHTML = data.topCities.slice(0, 10).map((item, index) => `
    <li>
      <button class="linklike ranked-link" data-uf="${item.uf}" data-city="${item.city}">
        <span><b>#${index + 1}</b> ${item.city}/${item.uf}</span>
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
  renderStateCategoryBars(data.categories);
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
  state.page = 1;
  state.q = '';
  await renderCityDetail();
}

async function renderCityDetail() {
  const city = state.selectedCity;
  const fragment = els.detailTemplate.content.cloneNode(true);
  const root = fragment.querySelector('div');
  root.querySelector('[data-city-title]').textContent = `${city.name}/${city.uf}`;

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
    `<span class="chip">${item.category}: ${formatNumber(item.total)}</span>`
  ).join('') || '<span class="chip">Sem agregados salvos</span>';

  const search = root.querySelector('[data-search]');
  search.value = state.q;
  search.addEventListener('input', async () => {
    state.q = search.value;
    state.page = 1;
    await renderCityDetail();
  });

  const establishments = await api(`/cities/${encodeURIComponent(city.uf)}/${encodeURIComponent(city.name)}/establishments?page=${state.page}&pageSize=15&q=${encodeURIComponent(state.q)}`);
  root.querySelector('[data-establishments]').innerHTML = establishments.data.map((item) => `
    <tr>
      <td>${item.trade_name && item.trade_name !== '-' ? item.trade_name : item.legal_name || '-'}</td>
      <td>${item.category || '-'}</td>
      <td>${item.neighborhood || '-'}</td>
      <td>${item.registration_status || '-'}</td>
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
