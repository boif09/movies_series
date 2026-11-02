const state = {
  users: [],
  selectedResult: null,
  editing: null,
  lastSearch: [],
  libraryRows: [],
  libraryFilterTimer: null
};

const els = {
  searchForm: document.querySelector('#searchForm'),
  searchInput: document.querySelector('#searchInput'),
  searchMessage: document.querySelector('#searchMessage'),
  searchResults: document.querySelector('#searchResults'),
  libraryMessage: document.querySelector('#libraryMessage'),
  library: document.querySelector('#library'),
  statusFilter: document.querySelector('#statusFilter'),
  mediaTypeFilter: document.querySelector('#mediaTypeFilter'),
  userFilter: document.querySelector('#userFilter'),
  verdictFilter: document.querySelector('#verdictFilter'),
  libraryTextFilter: document.querySelector('#libraryTextFilter'),
  stats: document.querySelector('#stats'),
  saveDialog: document.querySelector('#saveDialog'),
  saveForm: document.querySelector('#saveForm'),
  closeDialog: document.querySelector('#closeDialog'),
  cancelSave: document.querySelector('#cancelSave'),
  dialogPoster: document.querySelector('#dialogPoster'),
  dialogType: document.querySelector('#dialogType'),
  dialogTitle: document.querySelector('#dialogTitle'),
  dialogMeta: document.querySelector('#dialogMeta'),
  dialogOverview: document.querySelector('#dialogOverview'),
  saveStatus: document.querySelector('#saveStatus'),
  saveRating: document.querySelector('#saveRating'),
  saveWatchedAt: document.querySelector('#saveWatchedAt'),
  watchedTogether: document.querySelector('#watchedTogether'),
  saveComment: document.querySelector('#saveComment'),
  ratingLabel: document.querySelector('#ratingLabel'),
  watchedAtLabel: document.querySelector('#watchedAtLabel'),
  watchedTogetherLabel: document.querySelector('#watchedTogetherLabel'),
  userCheckboxes: document.querySelector('#userCheckboxes'),
  usersField: document.querySelector('#usersField'),
  verdictField: document.querySelector('#verdictField'),
  editHint: document.querySelector('#editHint')
};

const VERDICTS = {
  recommend: { label: 'La recomendaría', icon: '👍' },
  meh: { label: 'Meh', icon: '😐' },
  crap: { label: 'Mierdón', icon: '💩' }
};

function mediaTypeLabel(type) {
  return type === 'movie' ? 'Película' : 'Serie';
}

function statusLabel(status) {
  return status === 'watched' ? 'Vista' : 'Pendiente';
}

function verdictBadge(verdict) {
  const info = VERDICTS[verdict];
  if (!info) return '';
  return `<span class="verdict-badge verdict-${verdict}">${info.icon} ${info.label}</span>`;
}

function selectedVerdict() {
  return els.saveForm.querySelector('input[name="verdict"]:checked')?.value || '';
}

function setSelectedVerdict(value) {
  for (const radio of els.saveForm.querySelectorAll('input[name="verdict"]')) {
    radio.checked = radio.value === (value || '');
  }
}

function yearFromDate(value) {
  if (!value) return 'Sin fecha';
  return String(value).slice(0, 4);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || 'Ha ocurrido un error');
  }

  return data;
}

function setMessage(element, text, type = '') {
  element.textContent = text || '';
  element.dataset.type = type;
}

function posterHtml(item, className = 'poster') {
  if (item.poster_url) {
    return `<img class="${className}" src="${escapeHtml(item.poster_url)}" alt="${escapeHtml(item.title)}" loading="lazy" />`;
  }
  return `<div class="${className} no-poster">Sin portada</div>`;
}

async function loadUsers() {
  state.users = await api('api/users');

  els.userFilter.innerHTML = '<option value="">Todos</option>' + state.users
    .map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`)
    .join('');

  els.userCheckboxes.innerHTML = state.users.map((user) => `
    <label>
      <input type="checkbox" name="userIds" value="${user.id}" checked />
      ${escapeHtml(user.name)}
    </label>
  `).join('');
}

async function searchMedia(query) {
  setMessage(els.searchMessage, 'Buscando...');
  els.searchResults.innerHTML = '';

  const results = await api(`api/search?q=${encodeURIComponent(query)}`);
  state.lastSearch = results;

  if (!results.length) {
    setMessage(els.searchMessage, 'No he encontrado resultados. Prueba con otro título.');
    return;
  }

  setMessage(els.searchMessage, `${results.length} resultados encontrados`);
  els.searchResults.innerHTML = results.map((item, index) => `
    <article class="card result-card">
      ${posterHtml(item)}
      <div>
        <span class="pill">${mediaTypeLabel(item.media_type)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="meta">${yearFromDate(item.release_date)} · TMDB ${Number(item.tmdb_vote_average || 0).toFixed(1)}</p>
        <p class="overview clamp-3">${escapeHtml(item.overview || 'Sin descripción disponible.')}</p>
        <div class="result-actions">
          <button type="button" data-action="save" data-index="${index}" data-status="watchlist">Pendiente</button>
          <button type="button" class="secondary" data-action="save" data-index="${index}" data-status="watched">Vista</button>
        </div>
      </div>
    </article>
  `).join('');
}

function fillDialogMedia(item) {
  els.dialogPoster.src = item.poster_url || '';
  els.dialogPoster.alt = item.title || '';
  els.dialogPoster.style.display = item.poster_url ? 'block' : 'none';
  els.dialogType.textContent = mediaTypeLabel(item.media_type);
  els.dialogTitle.textContent = item.title;
  els.dialogMeta.textContent = `${yearFromDate(item.release_date)} · TMDB ${Number(item.tmdb_vote_average || 0).toFixed(1)}`;
  els.dialogOverview.textContent = item.overview || 'Sin descripción disponible.';
}

function openSaveDialog(item, status = 'watchlist') {
  state.selectedResult = item;
  state.editing = null;
  els.saveForm.reset();
  fillDialogMedia(item);
  els.usersField.style.display = '';
  els.editHint.textContent = '';

  els.saveStatus.value = status;
  els.saveWatchedAt.value = new Date().toISOString().slice(0, 10);

  for (const checkbox of els.userCheckboxes.querySelectorAll('input[type="checkbox"]')) {
    checkbox.checked = true;
  }

  toggleWatchedFields();
  els.saveDialog.showModal();
}

// Abre el mismo diálogo para editar algo ya guardado (individual o visto juntos).
function openEditDialog(row, status = row.status) {
  state.selectedResult = null;
  state.editing = row;
  els.saveForm.reset();
  fillDialogMedia(row);

  const isShared = row.entry_type === 'shared';
  els.usersField.style.display = 'none';
  els.editHint.textContent = isShared
    ? `Visto juntos: los cambios se aplican a ${row.user_name}.`
    : `Registro de ${row.user_name}.`;

  els.saveStatus.value = status;
  els.saveRating.value = row.rating ?? '';
  els.saveWatchedAt.value = row.watched_at ? String(row.watched_at).slice(0, 10) : '';
  els.saveComment.value = row.comment || '';
  setSelectedVerdict(row.verdict);

  toggleWatchedFields();
  els.saveDialog.showModal();
}

function toggleWatchedFields() {
  const isWatched = els.saveStatus.value === 'watched';
  const selectedUsers = els.userCheckboxes.querySelectorAll('input[name="userIds"]:checked').length;
  const canWatchTogether = isWatched && selectedUsers > 1 && !state.editing;
  els.ratingLabel.style.display = isWatched ? 'grid' : 'none';
  els.watchedAtLabel.style.display = isWatched ? 'grid' : 'none';
  els.verdictField.style.display = isWatched ? 'grid' : 'none';
  els.watchedTogetherLabel.style.display = canWatchTogether ? 'flex' : 'none';
  els.saveRating.required = isWatched;
  els.saveWatchedAt.required = isWatched;

  if (!isWatched) {
    els.saveRating.value = '';
    els.saveWatchedAt.value = '';
    els.watchedTogether.checked = false;
    setSelectedVerdict('');
  } else if (!els.saveWatchedAt.value) {
    els.saveWatchedAt.value = new Date().toISOString().slice(0, 10);
  }

  if (!canWatchTogether) {
    els.watchedTogether.checked = false;
  }
}

async function saveSelectedMedia() {
  const item = state.selectedResult;
  if (!item) return;

  const userIds = [...els.userCheckboxes.querySelectorAll('input[name="userIds"]:checked')]
    .map((input) => Number(input.value));

  if (!userIds.length) {
    alert('Selecciona al menos un usuario.');
    return;
  }

  const payload = {
    tmdb_id: item.tmdb_id,
    media_type: item.media_type,
    status: els.saveStatus.value,
    userIds,
    rating: els.saveStatus.value === 'watched' ? Number(els.saveRating.value) : null,
    watched_at: els.saveStatus.value === 'watched' ? els.saveWatchedAt.value : null,
    watchedTogether: els.saveStatus.value === 'watched' && els.watchedTogether.checked,
    verdict: els.saveStatus.value === 'watched' ? selectedVerdict() || null : null,
    comment: els.saveComment.value.trim()
  };

  await api('api/library', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  els.saveDialog.close();
  await loadLibrary();
}

async function saveEditedEntry() {
  const row = state.editing;
  if (!row) return;

  const status = els.saveStatus.value;
  const isShared = row.entry_type === 'shared';

  if (status === 'watchlist') {
    if (isShared && !confirm('Se borrará el visionado compartido y volverá a pendiente para todos. ¿Seguir?')) return;
    if (isShared) await markSharedWatchlist(row.shared_watch_event_id);
    else await markWatchlist(row.user_media_id);
    els.saveDialog.close();
    return;
  }

  const payload = {
    status,
    rating: Number(els.saveRating.value),
    watched_at: els.saveWatchedAt.value,
    verdict: selectedVerdict() || null,
    comment: els.saveComment.value.trim()
  };

  const path = isShared ? `api/watch-events/${row.shared_watch_event_id}` : `api/library/${row.user_media_id}`;
  await api(path, { method: 'PATCH', body: JSON.stringify(payload) });

  els.saveDialog.close();
  await loadLibrary();
}

async function loadLibrary() {
  setMessage(els.libraryMessage, 'Cargando lista...');

  const params = new URLSearchParams();
  params.set('status', els.statusFilter.value);
  params.set('mediaType', els.mediaTypeFilter.value);
  if (els.userFilter.value) params.set('userId', els.userFilter.value);
  params.set('verdict', els.verdictFilter.value);
  if (els.libraryTextFilter.value.trim()) params.set('q', els.libraryTextFilter.value.trim());

  const rows = await api(`api/library?${params.toString()}`);
  state.libraryRows = rows;

  if (!rows.length) {
    els.library.innerHTML = '';
    setMessage(els.libraryMessage, 'Todavía no hay nada guardado con estos filtros.');
    await updateStats();
    return;
  }

  setMessage(els.libraryMessage, `${rows.length} registros guardados`);
  els.library.innerHTML = rows.map((row, index) => renderLibraryCard(row, index)).join('');
  await updateStats();
}

function renderLibraryCard(row, index) {
  const isWatched = row.status === 'watched';
  const isShared = row.entry_type === 'shared';
  const entryAttrs = (isShared
    ? `data-entry-type="shared" data-event-id="${row.shared_watch_event_id}"`
    : `data-entry-type="user" data-id="${row.user_media_id}"`) + ` data-index="${index}"`;
  const extra = row.media_type === 'movie'
    ? (row.runtime ? `${row.runtime} min` : '')
    : [row.number_of_seasons ? `${row.number_of_seasons} temp.` : '', row.number_of_episodes ? `${row.number_of_episodes} eps.` : ''].filter(Boolean).join(' · ');

  return `
    <article class="card library-card">
      <div class="poster-wrap">
        ${posterHtml(row)}
        <span class="pill status-badge">${isShared ? 'Vista juntos' : statusLabel(row.status)}</span>
        ${isWatched && row.rating ? `<span class="rating-badge">${row.rating}/10</span>` : ''}
      </div>
      <div class="library-body">
        <span class="pill">${mediaTypeLabel(row.media_type)}</span>
        <h3>${escapeHtml(row.title)}</h3>
        ${isWatched ? verdictBadge(row.verdict) : ''}
        <p class="meta">${escapeHtml(row.user_name)} · ${yearFromDate(row.release_date)}${extra ? ` · ${escapeHtml(extra)}` : ''}</p>
        ${isWatched && row.watched_at ? `<p class="meta">Vista el ${escapeHtml(row.watched_at)}</p>` : ''}
        ${row.comment ? `<p class="comment clamp-3">${escapeHtml(row.comment)}</p>` : `<p class="overview clamp-3">${escapeHtml(row.overview || '')}</p>`}
        <div class="card-actions">
          <button type="button" class="secondary" data-action="edit" ${entryAttrs}>Editar</button>
          ${isWatched
            ? `<button type="button" class="secondary" data-action="mark-watchlist" ${entryAttrs}>A pendiente</button>`
            : `<button type="button" data-action="mark-watched" ${entryAttrs}>Vista</button>`
          }
          <button type="button" class="danger" data-action="delete" ${entryAttrs}>Eliminar</button>
        </div>
      </div>
    </article>
  `;
}

async function updateStats() {
  const stats = await api('api/stats');

  els.stats.innerHTML = `
    <div><strong>${stats.watched}</strong><span>vistas</span></div>
    <div><strong>${stats.watchlist}</strong><span>pendientes</span></div>
  `;
}

async function markWatchlist(userMediaId) {
  await api(`api/library/${userMediaId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'watchlist' })
  });
  await loadLibrary();
}

async function deleteEntry(userMediaId) {
  if (!confirm('¿Eliminar este registro de vuestra lista?')) return;

  await api(`api/library/${userMediaId}`, { method: 'DELETE' });
  await loadLibrary();
}

async function markSharedWatchlist(watchEventId) {
  await api(`api/watch-events/${watchEventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'watchlist' })
  });
  await loadLibrary();
}

async function deleteSharedEntry(watchEventId) {
  if (!confirm('Eliminar este visionado compartido de vuestra lista?')) return;

  await api(`api/watch-events/${watchEventId}`, { method: 'DELETE' });
  await loadLibrary();
}

function scheduleLibraryFilter() {
  clearTimeout(state.libraryFilterTimer);
  state.libraryFilterTimer = setTimeout(() => {
    loadLibrary().catch((error) => setMessage(els.libraryMessage, error.message, 'error'));
  }, 180);
}

function bindEvents() {
  els.searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = els.searchInput.value.trim();
    if (query.length < 2) {
      setMessage(els.searchMessage, 'Escribe al menos 2 caracteres.');
      return;
    }

    try {
      await searchMedia(query);
    } catch (error) {
      setMessage(els.searchMessage, error.message, 'error');
    }
  });

  els.searchResults.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="save"]');
    if (!button) return;

    const item = state.lastSearch[Number(button.dataset.index)];
    if (item) openSaveDialog(item, button.dataset.status);
  });

  els.saveStatus.addEventListener('change', toggleWatchedFields);
  els.userCheckboxes.addEventListener('change', toggleWatchedFields);
  els.closeDialog.addEventListener('click', () => els.saveDialog.close());
  els.cancelSave.addEventListener('click', () => els.saveDialog.close());

  els.saveForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      if (state.editing) await saveEditedEntry();
      else await saveSelectedMedia();
    } catch (error) {
      alert(error.message);
    }
  });

  for (const filter of [els.statusFilter, els.verdictFilter, els.mediaTypeFilter, els.userFilter]) {
    filter.addEventListener('change', () => loadLibrary().catch((error) => setMessage(els.libraryMessage, error.message, 'error')));
  }

  els.libraryTextFilter.addEventListener('input', scheduleLibraryFilter);

  els.library.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    try {
      const id = Number(button.dataset.id);
      const eventId = Number(button.dataset.eventId);
      const isShared = button.dataset.entryType === 'shared';
      const row = state.libraryRows[Number(button.dataset.index)];

      if (button.dataset.action === 'edit' && row) openEditDialog(row);
      if (button.dataset.action === 'mark-watched' && row) openEditDialog(row, 'watched');
      if (button.dataset.action === 'mark-watchlist') {
        if (isShared) await markSharedWatchlist(eventId);
        else await markWatchlist(id);
      }
      if (button.dataset.action === 'delete') {
        if (isShared) await deleteSharedEntry(eventId);
        else await deleteEntry(id);
      }
    } catch (error) {
      setMessage(els.libraryMessage, error.message, 'error');
    }
  });
}

async function init() {
  bindEvents();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  try {
    await loadUsers();
    await loadLibrary();
  } catch (error) {
    setMessage(els.libraryMessage, error.message, 'error');
  }
}

init();
