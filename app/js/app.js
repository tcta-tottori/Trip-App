// Main app
const App = (() => {
  // Updated at each commit; surfaces on the 設定 → アプリ情報 row
  const BUILD_TIME = '2026-05-18 21:30';
  const SCREENS = ['home', 'itinerary', 'attractions', 'map', 'checklist', 'emergency', 'memos', 'settings'];
  let currentScreen = 'home';
  let currentDayIdx = 0;
  let currentParkTab = 'land';
  let currentCategoryTab = 'ride';
  let currentMapCategory = 'ride';
  let currentChecklistCat = 'all';
  let countdownInterval = null;

  // ---------- Boot ----------
  async function init() {
    applyTheme();
    await DataStore.load();
    bindNav();
    bindGlobal();
    setupPullToRefresh();
    registerSW();
    handleHash();
    window.addEventListener('hashchange', handleHash);
    if (TripTimer.isDuringTrip()) {
      currentDayIdx = Math.max(0, TripTimer.currentDayIndex());
    }
    // Schedule reminders (no-op if disabled/unsupported)
    Notify.gc();
    Notify.schedule();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) Notify.schedule();
    });
  }

  // ---------- Pull-to-refresh ----------
  function setupPullToRefresh() {
    const indicator = document.createElement('div');
    indicator.className = 'ptr';
    indicator.innerHTML = '<div class="ptr-circle"><span class="ptr-arrow">↓</span></div>';
    document.body.appendChild(indicator);
    const circle = indicator.querySelector('.ptr-circle');
    const arrow = indicator.querySelector('.ptr-arrow');

    const THRESHOLD = 70;
    const MAX_PULL = 130;
    let startY = 0;
    let lastY = 0;
    let pulling = false;
    let refreshing = false;

    function reset() {
      pulling = false;
      indicator.style.transform = '';
      indicator.classList.remove('visible', 'ready');
      arrow.textContent = '↓';
    }

    function shouldIgnore(target) {
      if (refreshing) return true;
      if (!document.getElementById('modal').hidden) return true;
      if (currentScreen === 'map') return true;
      if (target && target.closest && target.closest('input, textarea, select, [contenteditable]')) return true;
      if (window.scrollY > 0) return true;
      return false;
    }

    document.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      if (shouldIgnore(e.target)) return;
      startY = e.touches[0].clientY;
      lastY = startY;
      pulling = true;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!pulling) return;
      lastY = e.touches[0].clientY;
      const dy = lastY - startY;
      if (dy <= 0) { reset(); return; }
      // dampen the pull so it feels rubbery
      const pull = Math.min(dy * 0.55, MAX_PULL);
      indicator.classList.add('visible');
      indicator.classList.toggle('ready', pull >= THRESHOLD);
      arrow.textContent = pull >= THRESHOLD ? '↑' : '↓';
      indicator.style.transform = `translateX(-50%) translateY(${pull}px)`;
      // prevent body scroll/jiggle while pulling
      if (dy > 6 && e.cancelable) e.preventDefault();
    }, { passive: false });

    function finish() {
      if (!pulling) return;
      const dy = lastY - startY;
      const pull = Math.min(dy * 0.55, MAX_PULL);
      if (pull >= THRESHOLD) {
        refreshing = true;
        indicator.classList.add('refreshing', 'ready');
        indicator.style.transform = `translateX(-50%) translateY(${THRESHOLD}px)`;
        arrow.textContent = '↻';
        forceReload();
      } else {
        reset();
      }
      pulling = false;
    }
    document.addEventListener('touchend', finish, { passive: true });
    document.addEventListener('touchcancel', () => { reset(); }, { passive: true });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('新しいバージョンが利用可能です。設定 → 再読込で更新できます');
          }
        });
      });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'open-itinerary') go('itinerary');
    });
  }

  function applyTheme() {
    const settings = Storage.get('settings', {});
    if (settings.dark) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
  }

  function handleHash() {
    const h = location.hash.slice(1);
    if (SCREENS.includes(h)) go(h);
    else go('home');
  }

  // ---------- Navigation ----------
  function go(screen) {
    if (!SCREENS.includes(screen)) return;
    currentScreen = screen;
    SCREENS.forEach(s => {
      const el = document.getElementById('screen-' + s);
      if (el) el.hidden = (s !== screen);
    });
    document.querySelectorAll('.tabbar .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.go === screen);
    });
    document.getElementById('more-menu').hidden = true;
    if (location.hash !== '#' + screen) history.replaceState(null, '', '#' + screen);
    render(screen);
    window.scrollTo(0, 0);
  }

  function render(screen) {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    switch (screen) {
      case 'home':        renderHome(); break;
      case 'itinerary':   renderItinerary(); break;
      case 'attractions': renderAttractions(); break;
      case 'map':         renderMap(); break;
      case 'checklist':   renderChecklist(); break;
      case 'emergency':   renderEmergency(); break;
      case 'memos':       renderMemos(); break;
      case 'settings':    renderSettings(); break;
    }
  }

  function bindNav() {
    document.querySelectorAll('[data-go]').forEach(el => {
      el.addEventListener('click', () => {
        const target = el.dataset.go;
        if (target === 'more') {
          const menu = document.getElementById('more-menu');
          menu.hidden = !menu.hidden;
        } else go(target);
      });
    });
    document.addEventListener('click', e => {
      const menu = document.getElementById('more-menu');
      if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[data-go="more"]')) {
        menu.hidden = true;
      }
    });
  }

  function bindGlobal() {
    document.addEventListener('click', e => {
      if (e.target.matches('[data-action="settings"]')) go('settings');
      if (e.target.matches('[data-close]')) closeModal();
      if (e.target.matches('[data-action="toggle-itin-edit"]')) toggleItineraryEdit();
    });
  }

  // ---------- Itinerary edit ----------
  let itineraryEditing = false;
  function toggleItineraryEdit() {
    itineraryEditing = !itineraryEditing;
    renderItinerary();
  }

  // ---------- Home ----------
  function renderHome() {
    const root = document.getElementById('home-content');
    const inTrip = TripTimer.isDuringTrip();
    const dayIdx = TripTimer.currentDayIndex();
    const next = TripTimer.nextEvent();

    let heroHtml = '';
    if (inTrip && dayIdx >= 0) {
      const day = DataStore.itinerary().days[dayIdx];
      heroHtml = `
        <div class="hero">
          <div class="eyebrow">Day ${day.dayNumber} / ${DataStore.itinerary().days.length}</div>
          <div class="big">${escape(day.title)}</div>
          <div class="label">${formatDateJa(day.date)}</div>
        </div>`;
    } else {
      const c = TripTimer.countdown();
      heroHtml = `
        <div class="hero">
          <div class="eyebrow">Trip starts in</div>
          <div class="countdown-units" id="countdown-units">
            <div><strong>${c.days}</strong><small>日</small></div>
            <div><strong>${pad(c.hours)}</strong><small>時間</small></div>
            <div><strong>${pad(c.mins)}</strong><small>分</small></div>
            <div><strong>${pad(c.secs)}</strong><small>秒</small></div>
          </div>
          <div class="label">2026年6月6日（土）出発</div>
        </div>`;
    }

    let nextHtml = '';
    if (next) {
      const tu = TripTimer.timeUntil(next.when);
      nextHtml = `
        <div class="next-event">
          <div class="muted">⏰ 次の予定</div>
          <div class="time">${next.ev.time} ${escape(next.ev.title)}</div>
          ${tu ? `<div class="countdown-mini">${tu}</div>` : ''}
        </div>`;
    }

    root.innerHTML = `
      ${heroHtml}
      <div id="weather-slot"></div>
      ${nextHtml}
      <div class="quick-grid">
        <button class="quick-tile" data-go-tile="map"><span>🗺️</span>地図</button>
        <button class="quick-tile" data-go-tile="itinerary"><span>📅</span>旅程</button>
        <button class="quick-tile" data-go-tile="checklist"><span>✅</span>持ち物</button>
        <button class="quick-tile" data-go-tile="attractions"><span>🎢</span>アトラクション</button>
        <button class="quick-tile" data-go-tile="emergency"><span>🆘</span>緊急情報</button>
        <button class="quick-tile" data-go-tile="memos"><span>📝</span>メモ</button>
      </div>
    `;
    root.querySelectorAll('[data-go-tile]').forEach(b => {
      b.addEventListener('click', () => go(b.dataset.goTile));
    });

    loadWeather();
    if (!inTrip) startCountdown();
  }

  async function loadWeather() {
    const slot = document.getElementById('weather-slot');
    if (!slot) return;
    slot.innerHTML = '<div class="weather-card loading">☁️ 天気を取得中...</div>';
    const parsed = await Weather.fetchForecast();
    if (!parsed || !parsed.days || !parsed.days.length) {
      slot.innerHTML = '<div class="weather-card error">天気情報を取得できませんでした</div>';
      return;
    }
    const trip = DataStore.itinerary().days.map(d => d.date);
    // 旅行期間中なら旅行3日分を、期間外なら直近3日を表示
    const days = parsed.days.filter(d => trip.includes(d.date));
    const list = (days.length ? days : parsed.days).slice(0, 3);
    slot.innerHTML = `
      <div class="weather-card">
        <div class="wx-head">
          <span class="wx-area">📍 ${escape(parsed.area)}</span>
          <span class="wx-meta">${parsed.publishingOffice ? escape(parsed.publishingOffice) : ''}</span>
        </div>
        <div class="wx-grid">
          ${list.map(d => `
            <div class="wx-day">
              <div class="wx-date">${formatDateShort(d.date)}</div>
              <div class="wx-icon">${d.icon}</div>
              <div class="wx-text">${escape(d.weather || '-')}</div>
              <div class="wx-pop">${d.popMax != null ? '☔ ' + d.popMax + '%' : ''}</div>
              <div class="wx-temp">${d.tempMax != null ? d.tempMax + '°' : ''}${d.tempMin != null ? ' / ' + d.tempMin + '°' : ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function formatDateShort(s) {
    const [, m, d] = s.split('-');
    const w = ['日','月','火','水','木','金','土'][new Date(s + 'T00:00:00+09:00').getDay()];
    return `${+m}/${+d}（${w}）`;
  }

  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      const el = document.getElementById('countdown-units');
      if (!el) { clearInterval(countdownInterval); return; }
      const c = TripTimer.countdown();
      if (c.total <= 0) { clearInterval(countdownInterval); renderHome(); return; }
      el.innerHTML = `
        <div><strong>${c.days}</strong><small>日</small></div>
        <div><strong>${pad(c.hours)}</strong><small>時間</small></div>
        <div><strong>${pad(c.mins)}</strong><small>分</small></div>
        <div><strong>${pad(c.secs)}</strong><small>秒</small></div>`;
    }, 1000);
  }

  // ---------- Itinerary ----------
  function renderItinerary() {
    const days = DataStore.itinerary().days;
    const tabs = document.getElementById('day-tabs');
    tabs.innerHTML = days.map((d, i) =>
      `<button class="day-tab ${i === currentDayIdx ? 'active' : ''}" data-day="${i}">Day ${d.dayNumber} ・ ${d.date.slice(5)}</button>`
    ).join('');
    tabs.querySelectorAll('.day-tab').forEach(b => {
      b.addEventListener('click', () => { currentDayIdx = +b.dataset.day; renderItinerary(); });
    });

    const editBtn = document.querySelector('[data-action="toggle-itin-edit"]');
    if (editBtn) {
      editBtn.textContent = itineraryEditing ? '✓' : '✏️';
      editBtn.setAttribute('aria-label', itineraryEditing ? '編集を終了' : '編集');
    }

    const day = days[currentDayIdx];
    const completed = new Set(Storage.get('completedEvents', []));
    const now = TripTimer.now();
    const root = document.getElementById('itinerary-content');
    if (!day) { root.innerHTML = '<div class="empty">予定がありません</div>'; return; }

    let nextEventTime = null;
    for (const ev of day.events) {
      const t = TripTimer.eventDate(day, ev);
      if (t > now) { nextEventTime = ev.time; break; }
    }

    const editBanner = itineraryEditing
      ? `<div class="edit-banner">
           <span>✏️ 編集モード — タップで編集、長押しで並べ替え</span>
           ${DataStore.isItineraryEdited() ? `<button class="link" data-action="reset-itin">初期化</button>` : ''}
         </div>`
      : '';

    root.innerHTML = `
      <h2 style="font-size:18px;margin-bottom:6px;">${formatDateJa(day.date)}</h2>
      <p class="muted" style="margin-bottom:14px;">${escape(day.title)}</p>
      ${editBanner}
      <ol class="timeline ${itineraryEditing ? 'editing' : ''}" id="itin-timeline">
        ${day.events.map((ev, idx) => {
          const evKey = day.date + '_' + ev.time + '_' + idx;
          const isDone = completed.has(evKey);
          const isNow = ev.time === nextEventTime;
          return `
            <li class="${isDone ? 'done' : ''} ${ev.highlight ? 'hl' : ''} ${isNow ? 'now' : ''}" data-evidx="${idx}">
              <time>${ev.time}</time>
              <div class="ev" data-evkey="${evKey}" data-evidx="${idx}">
                ${itineraryEditing ? '<span class="drag-handle" aria-hidden="true">⠿</span>' : ''}
                <div class="ev-body">
                  <strong>${ev.highlight ? '★ ' : ''}${escape(ev.title)}</strong>
                  ${ev.location ? `<div class="loc">📍 ${escape(ev.location)}</div>` : ''}
                  ${ev.description ? `<div class="loc">${escape(ev.description)}</div>` : ''}
                </div>
                ${itineraryEditing ? `<button class="ev-del" data-del="${idx}" aria-label="削除">✕</button>` : ''}
              </div>
            </li>`;
        }).join('')}
      </ol>
      ${itineraryEditing ? `<button class="btn outline" id="add-event" style="width:100%;margin-top:12px;">＋ イベントを追加</button>` : ''}
    `;

    if (itineraryEditing) {
      root.querySelectorAll('.ev').forEach(el => {
        el.addEventListener('click', e => {
          if (e.target.closest('.ev-del') || e.target.closest('.drag-handle')) return;
          const idx = +el.dataset.evidx;
          showEventEditor(day, idx);
        });
      });
      root.querySelectorAll('.ev-del').forEach(b => {
        b.addEventListener('click', e => {
          e.stopPropagation();
          const idx = +b.dataset.del;
          if (!confirm(`「${day.events[idx].title}」を削除しますか？`)) return;
          deleteEvent(currentDayIdx, idx);
        });
      });
      const addBtn = document.getElementById('add-event');
      if (addBtn) addBtn.addEventListener('click', () => showEventEditor(day, -1));
      const resetBtn = root.querySelector('[data-action="reset-itin"]');
      if (resetBtn) resetBtn.addEventListener('click', () => {
        if (confirm('編集内容を破棄して初期状態に戻しますか？')) {
          DataStore.resetItinerary();
          renderItinerary();
          toast('初期状態に戻しました');
        }
      });
      enableDragSort();
    } else {
      root.querySelectorAll('.ev').forEach(el => {
        el.addEventListener('click', () => {
          const idx = +el.dataset.evidx;
          showEventDetail(day, idx, el.dataset.evkey);
        });
      });
    }
  }

  function enableDragSort() {
    if (typeof Sortable === 'undefined') return;
    const list = document.getElementById('itin-timeline');
    if (!list) return;
    Sortable.create(list, {
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'drag-ghost',
      onEnd: (evt) => {
        if (evt.oldIndex === evt.newIndex) return;
        const itin = JSON.parse(JSON.stringify(DataStore.itinerary()));
        const events = itin.days[currentDayIdx].events;
        const [moved] = events.splice(evt.oldIndex, 1);
        events.splice(evt.newIndex, 0, moved);
        DataStore.setItinerary(itin);
        renderItinerary();
      }
    });
  }

  function deleteEvent(dayIdx, evIdx) {
    const itin = JSON.parse(JSON.stringify(DataStore.itinerary()));
    itin.days[dayIdx].events.splice(evIdx, 1);
    DataStore.setItinerary(itin);
    renderItinerary();
    toast('削除しました');
  }

  function showEventEditor(day, idx) {
    const isNew = idx < 0;
    const ev = isNew
      ? { time: '12:00', title: '', type: 'park', location: '', description: '', highlight: false }
      : day.events[idx];
    const typeOpts = [
      ['park', '🎢 パーク'], ['meal', '🍴 食事'], ['hotel', '🏨 宿泊'],
      ['flight', '✈️ フライト'], ['transit', '🚃 移動'],
      ['shopping', '🛍️ 買物'], ['note', '📝 メモ']
    ];
    openModal(`
      <h2>${isNew ? 'イベントを追加' : 'イベントを編集'}</h2>
      <div class="event-form">
        <label>
          <span>時刻</span>
          <input type="time" id="ev-time" value="${escape(ev.time || '12:00')}">
        </label>
        <label>
          <span>タイトル</span>
          <input type="text" id="ev-title" value="${escape(ev.title || '')}" placeholder="例: ランチ">
        </label>
        <label>
          <span>場所</span>
          <input type="text" id="ev-loc" value="${escape(ev.location || '')}" placeholder="例: クイーン・オブ・ハート">
        </label>
        <label>
          <span>種別</span>
          <select id="ev-type">
            ${typeOpts.map(([v, l]) => `<option value="${v}" ${ev.type === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label>
          <span>メモ</span>
          <textarea id="ev-desc" rows="3" placeholder="任意">${escape(ev.description || '')}</textarea>
        </label>
        <label class="event-form-row-check">
          <input type="checkbox" id="ev-hl" ${ev.highlight ? 'checked' : ''}>
          <span>★ ハイライト（特に重要な予定）</span>
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn gold" id="ev-save">${isNew ? '追加' : '保存'}</button>
        <button class="btn outline" data-close>キャンセル</button>
        ${!isNew ? `<button class="btn danger" id="ev-delete">削除</button>` : ''}
      </div>
    `);
    document.getElementById('ev-save').addEventListener('click', () => {
      const next = {
        time: document.getElementById('ev-time').value || '00:00',
        title: document.getElementById('ev-title').value.trim() || '無題',
        type: document.getElementById('ev-type').value,
        location: document.getElementById('ev-loc').value.trim(),
        description: document.getElementById('ev-desc').value.trim(),
        highlight: document.getElementById('ev-hl').checked
      };
      if (!next.location) delete next.location;
      if (!next.description) delete next.description;
      if (!next.highlight) delete next.highlight;
      saveEvent(currentDayIdx, idx, next);
      closeModal();
      renderItinerary();
      toast(isNew ? '追加しました' : '保存しました');
    });
    const delBtn = document.getElementById('ev-delete');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (!confirm(`「${ev.title}」を削除しますか？`)) return;
        deleteEvent(currentDayIdx, idx);
        closeModal();
      });
    }
  }

  function saveEvent(dayIdx, evIdx, payload) {
    const itin = JSON.parse(JSON.stringify(DataStore.itinerary()));
    const events = itin.days[dayIdx].events;
    if (evIdx < 0) {
      // New event: insert at the chronological position by time
      let insertAt = events.findIndex(e => (e.time || '') > (payload.time || ''));
      if (insertAt < 0) insertAt = events.length;
      events.splice(insertAt, 0, payload);
    } else {
      // Edit in place — preserves any drag-defined order
      events[evIdx] = payload;
    }
    DataStore.setItinerary(itin);
  }

  function showEventDetail(day, idx, evKey) {
    const ev = day.events[idx];
    const completed = new Set(Storage.get('completedEvents', []));
    const isDone = completed.has(evKey);

    openModal(`
      <h2>${escape(ev.title)}</h2>
      <ul class="meta-list">
        <li><strong>時刻</strong> ${ev.time}（${formatDateJa(day.date)}）</li>
        ${ev.location ? `<li><strong>場所</strong> ${escape(ev.location)}</li>` : ''}
        ${ev.type ? `<li><strong>種別</strong> ${typeLabel(ev.type)}</li>` : ''}
        ${ev.description ? `<li><strong>備考</strong> ${escape(ev.description)}</li>` : ''}
      </ul>
      <div class="modal-actions">
        <button class="btn ${isDone ? 'outline' : ''}" id="toggle-done">${isDone ? '✓ 完了済み' : '✓ 完了にする'}</button>
      </div>
    `);
    document.getElementById('toggle-done').addEventListener('click', () => {
      const set = new Set(Storage.get('completedEvents', []));
      if (set.has(evKey)) set.delete(evKey); else set.add(evKey);
      Storage.set('completedEvents', [...set]);
      closeModal();
      renderItinerary();
      toast(set.has(evKey) ? '完了にしました' : '完了を解除しました');
    });
  }

  // ---------- Attractions ----------
  function renderAttractions() {
    document.querySelectorAll('.park-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.park === currentParkTab);
      b.onclick = () => { currentParkTab = b.dataset.park; renderAttractions(); };
    });

    document.querySelectorAll('.cat-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === currentCategoryTab);
      b.onclick = () => { currentCategoryTab = b.dataset.cat; renderAttractions(); };
    });

    // Ride-only filters are not meaningful for restaurants/shows/etc.,
    // so hide them when a non-ride category is selected.
    const filterBlock = document.getElementById('attraction-filters');
    const showRideFilters = currentCategoryTab === 'ride';
    if (filterBlock) filterBlock.style.display = showRideFilters ? '' : 'none';

    ['f-safe', 'f-height', 'f-fav', 'f-unrid', 'f-open'].forEach(id => {
      const el = document.getElementById(id);
      el.onchange = () => renderAttractions();
    });

    const safeOnly  = document.getElementById('f-safe').checked && showRideFilters;
    const heightOk  = document.getElementById('f-height').checked && showRideFilters;
    const favOnly   = document.getElementById('f-fav').checked;
    const unridden  = document.getElementById('f-unrid').checked && showRideFilters;
    const openOnly  = document.getElementById('f-open').checked;
    const settings  = Storage.get('settings', {});
    const kidMode   = !!settings.kidMode && showRideFilters;
    const childHeight = Number.isFinite(settings.childHeight) ? settings.childHeight : 102;
    const favs = new Set(Storage.get('favorites', []));
    const exp  = new Set(Storage.get('experienced', []));

    const parkList = DataStore.attractions().filter(
      a => a.park === currentParkTab && (a.category || 'ride') === currentCategoryTab
    );
    let list = parkList;
    if (kidMode)  list = list.filter(a => a.fearLevel < 4);
    if (heightOk) list = list.filter(a => !a.heightLimit || a.heightLimit <= childHeight);
    if (safeOnly) list = list.filter(a => a.fearLevel <= 2);
    if (favOnly)  list = list.filter(a => favs.has(a.id));
    if (unridden) list = list.filter(a => !exp.has(a.id));
    if (openOnly) list = list.filter(a => !a.closed);
    if (showRideFilters) {
      list.sort((a, b) => (b.mustRide - a.mustRide) || (a.fearLevel - b.fearLevel));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }

    const hiddenByKid = kidMode ? parkList.filter(a => a.fearLevel >= 4).length : 0;
    const banner = kidMode ? `
      <div class="kid-banner" role="status">
        <span>👶 子ども配慮モード ON：怖さ Lv4 以上を ${hiddenByKid} 件 非表示中</span>
        <button type="button" class="link" id="kid-disable">解除</button>
      </div>` : '';

    const root = document.getElementById('attractions-content');
    const catLabels = { ride: '乗物', restaurant: 'レストラン', food: 'フード', show: 'ショー', shop: 'ショップ' };
    if (!list.length) {
      root.innerHTML = banner + `<div class="empty">${catLabels[currentCategoryTab] || '項目'}が見つかりません</div>`;
    } else {
      root.innerHTML = banner + `<div class="attr-grid">
        ${list.map(a => attractionCardHtml(a, favs.has(a.id), exp.has(a.id), childHeight)).join('')}
      </div>`;
      root.querySelectorAll('.attr-card').forEach(el => {
        el.addEventListener('click', () => showAttractionDetail(el.dataset.id));
      });
    }
    const disableBtn = document.getElementById('kid-disable');
    if (disableBtn) {
      disableBtn.addEventListener('click', () => {
        const settings = Storage.get('settings', {});
        settings.kidMode = false;
        Storage.set('settings', settings);
        toast('子ども配慮モードを解除しました');
        renderAttractions();
      });
    }
  }

  function attractionCardHtml(a, isFav, isExp, childHeight) {
    const cat = a.category || 'ride';
    const isRide = cat === 'ride';
    const dots = [1,2,3,4,5].map(n => `<span class="dot ${n <= a.fearLevel ? 'on' : ''}"></span>`).join('');
    const emoji = categoryEmoji(a);
    const overHeight = a.heightLimit && childHeight && a.heightLimit > childHeight;
    return `
      <div class="attr-card l${isRide ? a.fearLevel : 0} ${a.closed ? 'closed' : ''}" data-id="${a.id}">
        <div class="thumb">
          <img src="../${a.image}" alt="" loading="lazy" onerror="this.style.display='none'">
          <span>${emoji}</span>
        </div>
        <div class="body">
          ${isRide ? `<div class="level">Lv ${a.fearLevel} ${dots}</div>` : `<div class="muted" style="font-size:11px;">${escape(a.area)}</div>`}
          <h4>${escape(a.name)}</h4>
          <div class="badges">
            ${isRide && a.mustRide ? '<span class="badge must">必乗</span>' : ''}
            ${isFav ? '<span class="badge fav">⭐</span>' : ''}
            ${isRide && isExp ? '<span class="badge exp">✓</span>' : ''}
            ${isRide && a.heightLimit ? `<span class="badge ${overHeight ? 'over' : ''}">${a.heightLimit}cm〜</span>` : ''}
          </div>
        </div>
      </div>`;
  }

  function categoryEmoji(a) {
    const cat = a.category || 'ride';
    if (cat === 'restaurant') return '🍽️';
    if (cat === 'food')       return '🍿';
    if (cat === 'show')       return '🎪';
    if (cat === 'shop')       return '🛍️';
    return parkEmoji(a);
  }

  function showAttractionDetail(id) {
    const a = DataStore.findAttraction(id);
    if (!a) return;
    const favs = new Set(Storage.get('favorites', []));
    const exp  = new Set(Storage.get('experienced', []));
    const isFav = favs.has(id), isExp = exp.has(id);
    const lvBars = [1,2,3,4,5].map(n => `<span class="lv ${n <= a.fearLevel ? 'on' + a.fearLevel : ''}"></span>`).join('');

    openModal(`
      <div class="detail-image">
        <img src="../${a.image}" alt="" onerror="this.style.display='none'">
        <span>${parkEmoji(a)}</span>
      </div>
      <h2>${escape(a.name)}</h2>
      <div class="muted" style="margin-bottom:8px;">${escape(a.area)}・${a.park === 'land' ? 'ランド' : 'シー'}</div>
      <div class="fearbar">${lvBars}</div>
      <ul class="meta-list">
        <li><strong>怖さ</strong> Lv ${a.fearLevel} / 5</li>
        <li><strong>暗さ</strong> ${escape(a.darkness)}</li>
        <li><strong>身長制限</strong> ${a.heightLimit ? a.heightLimit + ' cm 以上' : 'なし'}</li>
        <li><strong>所要時間</strong> 約 ${a.duration} 分</li>
        ${a.closed ? '<li><strong>状態</strong> 休止中</li>' : ''}
        ${a.tips ? `<li><strong>💡 メモ</strong> ${escape(a.tips)}</li>` : ''}
      </ul>
      <p style="margin-top:8px;font-size:14px;">${escape(a.description)}</p>
      <div class="modal-actions">
        <button class="btn ${isFav ? 'gold' : 'outline'}" id="d-fav">${isFav ? '⭐ お気に入り済' : '⭐ お気に入り'}</button>
        <button class="btn ${isExp ? '' : 'outline'}" id="d-exp">${isExp ? '✓ 体験済み' : '✓ 体験する'}</button>
        <button class="btn outline" id="d-memo">📝 メモ</button>
        <button class="btn outline" id="d-map">🗺️ 地図</button>
        ${a.url ? `<a class="btn outline" href="${escape(a.url)}" target="_blank" rel="noopener noreferrer">🔗 公式ページ</a>` : ''}
      </div>
    `);

    const refresh = () => showAttractionDetail(id);

    document.getElementById('d-fav').addEventListener('click', () => {
      const set = new Set(Storage.get('favorites', []));
      if (set.has(id)) set.delete(id); else set.add(id);
      Storage.set('favorites', [...set]);
      toast(set.has(id) ? 'お気に入りに追加' : 'お気に入りを解除');
      refresh();
    });
    document.getElementById('d-exp').addEventListener('click', () => {
      const set = new Set(Storage.get('experienced', []));
      if (set.has(id)) set.delete(id); else set.add(id);
      Storage.set('experienced', [...set]);
      toast(set.has(id) ? '体験済みに記録' : '体験済みを解除');
      refresh();
    });
    document.getElementById('d-memo').addEventListener('click', () => {
      closeModal();
      openMemoEditor({ targetId: id, targetName: a.name });
    });
    document.getElementById('d-map').addEventListener('click', () => {
      closeModal();
      go('map');
      setTimeout(() => TripMap.setView(a.park), 100);
    });
  }

  // ---------- Map ----------
  function renderMap() {
    document.querySelectorAll('.map-tab').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('.map-tab').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        TripMap.setView(b.dataset.mapview);
      };
    });
    document.querySelectorAll('.map-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.mapcat === currentMapCategory);
      b.onclick = () => {
        currentMapCategory = b.dataset.mapcat;
        document.querySelectorAll('.map-chip').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        TripMap.setCategory(currentMapCategory);
      };
    });
    const fitBtn = document.querySelector('[data-action="map-fit"]');
    if (fitBtn) fitBtn.onclick = () => TripMap.fitAll();
    TripMap.init('map');
    TripMap.setCategory(currentMapCategory);
    TripMap.invalidate();
  }

  // ---------- Checklist ----------
  function renderChecklist() {
    const root = document.getElementById('checklist-content');
    const prog = Checklist.progress();
    const cats = Checklist.CATEGORIES;
    const done = Checklist.getDoneSet();
    let items = Checklist.getAll();
    if (currentChecklistCat !== 'all') items = items.filter(i => i.category === currentChecklistCat);

    root.innerHTML = `
      <div class="progress-bar"><div style="width:${prog.pct}%"></div></div>
      <div class="progress-label">${prog.completed} / ${prog.total} 完了（${prog.pct}%）</div>

      <div class="cat-tabs">
        ${cats.map(c => `<button class="cat-tab ${c.key === currentChecklistCat ? 'active' : ''}" data-cat="${c.key}">${c.label}</button>`).join('')}
      </div>

      <ul class="checklist">
        ${items.length ? items.map(i => `
          <li class="${done.has(i.id) ? 'done' : ''}" data-id="${i.id}" data-custom="${i.custom ? '1' : ''}">
            <div class="check">${done.has(i.id) ? '✓' : ''}</div>
            <div class="text">${escape(i.text)}</div>
            ${i.custom ? '<button class="delete-btn" data-del="1">🗑</button>' : ''}
          </li>
        `).join('') : '<li class="empty" style="display:block;text-align:center;">項目がありません</li>'}
      </ul>

      <div class="add-row">
        <input type="text" id="add-input" placeholder="カスタム項目を追加..." maxlength="60">
        <button class="btn" id="add-btn">追加</button>
      </div>
    `;

    root.querySelectorAll('.cat-tab').forEach(b => {
      b.onclick = () => { currentChecklistCat = b.dataset.cat; renderChecklist(); };
    });
    root.querySelectorAll('.checklist li[data-id]').forEach(li => {
      li.addEventListener('click', e => {
        if (e.target.closest('[data-del]')) {
          if (confirm('この項目を削除しますか？')) {
            Checklist.deleteCustom(li.dataset.id);
            renderChecklist();
          }
          return;
        }
        const id = li.dataset.id;
        const wasDone = done.has(id);
        Checklist.setDone(id, !wasDone);
        renderChecklist();
      });
    });
    const addBtn = document.getElementById('add-btn');
    const addInp = document.getElementById('add-input');
    const addItem = () => {
      const v = addInp.value.trim();
      if (!v) return;
      const cat = currentChecklistCat === 'all' ? 'pack' : currentChecklistCat;
      Checklist.addCustom(v, cat);
      addInp.value = '';
      renderChecklist();
    };
    addBtn.onclick = addItem;
    addInp.onkeydown = e => { if (e.key === 'Enter') addItem(); };
  }

  // ---------- Emergency ----------
  function renderEmergency() {
    const root = document.getElementById('emergency-content');
    root.innerHTML = `
      <div class="eg-block urgent">
        <h3>🆘 緊急時連絡先</h3>
        <div class="row"><span class="label">東京ディズニーリゾート総合</span><a href="tel:0570008632">0570-00-8632</a></div>
        <div class="row"><span class="label">救急（消防）</span><a href="tel:119">119</a></div>
        <div class="row"><span class="label">警察</span><a href="tel:110">110</a></div>
      </div>

      <div class="eg-block">
        <h3>👨‍👩‍👧 家族合流場所</h3>
        <div class="row"><span class="label">ディズニーランド</span>シンデレラ城 前</div>
        <div class="row"><span class="label">ディズニーシー</span>黄金の指輪のモニュメント前</div>
        <div class="row"><span class="label">迷子センター（ランド）</span>ベビーセンター内</div>
      </div>

      <div class="eg-block">
        <h3>👶 子ども向け施設</h3>
        <div class="row"><span class="label">ベビーセンター（ランド）</span>ワールドバザール 入って左</div>
        <div class="row"><span class="label">ベビーセンター（シー）</span>マーメイドラグーン</div>
        <div class="row"><span class="label">救護室（ランド）</span>ワールドバザール 救護室</div>
        <div class="row"><span class="label">救護室（シー）</span>メディテレーニアンハーバー</div>
      </div>

      <div class="eg-block">
        <h3>🏨 ホテル連絡先</h3>
        <div class="row"><span class="label">浦安ブライトンホテル</span><a href="tel:0473557777">047-355-7777</a></div>
        <div class="row"><span class="label">舞浜ユーラシア</span><a href="tel:0473514126">047-351-4126</a></div>
      </div>

      <div class="eg-block">
        <h3>✈️ フライト</h3>
        <div class="row"><span class="label">往路</span>ANA292 鳥取 07:05 → 羽田 08:15</div>
        <div class="row"><span class="label">復路</span>ANA297 羽田 16:30 → 鳥取 17:50</div>
        <div class="row"><span class="label">ANA予約センター</span><a href="tel:0570029222">0570-029-222</a></div>
      </div>
    `;
  }

  // ---------- Memos ----------
  const MEMO_CATEGORIES = [
    { key: 'memory',   label: '思い出',   emoji: '💭' },
    { key: 'food',     label: '食事',     emoji: '🍴' },
    { key: 'souvenir', label: 'お土産',   emoji: '🛍️' },
    { key: 'tip',      label: 'Tips',     emoji: '💡' },
    { key: 'other',    label: 'その他',   emoji: '📝' },
  ];
  const MEMO_FILTER_KEY = 'memoFilter';

  function memoCategory(key) {
    return MEMO_CATEGORIES.find(c => c.key === key) || MEMO_CATEGORIES[0];
  }

  function memoDayLabel(dateStr) {
    if (!dateStr) return '日付未指定';
    const day = DataStore.itinerary().days.find(d => d.date === dateStr);
    return day ? `Day ${day.dayNumber}・${formatDateJa(day.date)}` : formatDateJa(dateStr);
  }

  function renderMemos() {
    const root = document.getElementById('memos-content');
    const memos = Storage.get('memos', []);
    const filter = Storage.get(MEMO_FILTER_KEY, { q: '', cat: 'all' });

    const filtered = memos.filter(m => {
      if (filter.cat && filter.cat !== 'all' && (m.category || 'memory') !== filter.cat) return false;
      if (filter.q) {
        const hay = [m.title, m.body, m.targetName].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(filter.q.toLowerCase())) return false;
      }
      return true;
    });

    const tripDates = DataStore.itinerary().days.map(d => d.date);
    const groups = new Map();
    tripDates.forEach(d => groups.set(d, []));
    groups.set('', []);
    filtered.forEach(m => {
      const key = tripDates.includes(m.day) ? m.day : '';
      groups.get(key).push(m);
    });
    groups.forEach(arr => arr.sort((a, b) => (b.created || 0) - (a.created || 0)));

    const catChips = ['all', ...MEMO_CATEGORIES.map(c => c.key)].map(k => {
      const label = k === 'all' ? 'すべて' : `${memoCategory(k).emoji} ${memoCategory(k).label}`;
      const active = (filter.cat || 'all') === k;
      return `<button type="button" class="chip cat-chip ${active ? 'active' : ''}" data-cat="${k}">${label}</button>`;
    }).join('');

    const sections = [...groups.entries()]
      .filter(([, arr]) => arr.length)
      .map(([dateKey, arr]) => `
        <div class="memo-section">
          <h3 class="memo-day-header">${escape(memoDayLabel(dateKey))}　<span class="muted">(${arr.length})</span></h3>
          ${arr.map(memoCardHtml).join('')}
        </div>
      `).join('');

    const emptyMsg = memos.length
      ? '<div class="empty">条件に一致するメモがありません</div>'
      : '<div class="empty">まだメモがありません<br><small>アトラクション詳細の「📝 メモ」からも追加できます</small></div>';

    root.innerHTML = `
      <div class="memo-toolbar">
        <button class="btn" id="add-memo">+ メモを追加</button>
        <button class="btn small outline" id="export-memo" ${memos.length ? '' : 'disabled'}>⬇ エクスポート</button>
      </div>
      <input type="search" id="memo-search" class="memo-search" placeholder="🔍 タイトル・本文・対象を検索"
             value="${escape(filter.q || '')}">
      <div class="memo-cats">${catChips}</div>
      ${sections || emptyMsg}
    `;

    document.getElementById('add-memo').onclick = () => openMemoEditor({});
    document.getElementById('export-memo').onclick = () => exportMemosMarkdown();
    const searchEl = document.getElementById('memo-search');
    searchEl.addEventListener('input', () => {
      const next = { ...filter, q: searchEl.value };
      Storage.set(MEMO_FILTER_KEY, next);
      renderMemos();
      const again = document.getElementById('memo-search');
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
    root.querySelectorAll('.cat-chip').forEach(b => {
      b.onclick = () => {
        Storage.set(MEMO_FILTER_KEY, { ...filter, cat: b.dataset.cat });
        renderMemos();
      };
    });
    root.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => {
        const m = Storage.get('memos', []).find(x => x.id === b.dataset.edit);
        if (m) openMemoEditor(m);
      };
    });
    root.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        if (!confirm('削除しますか？')) return;
        const memos = Storage.get('memos', []).filter(m => m.id !== b.dataset.del);
        Storage.set('memos', memos);
        renderMemos();
      };
    });
  }

  function memoCardHtml(m) {
    const cat = memoCategory(m.category || 'memory');
    const photo = m.photoUrl
      ? `<a class="memo-photo" href="${escape(m.photoUrl)}" target="_blank" rel="noopener">
           <img src="${escape(m.photoUrl)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('broken')">
           <span class="memo-photo-fallback">🖼️ 写真を開く</span>
         </a>`
      : '';
    return `
      <div class="memo-card cat-${cat.key}" data-id="${m.id}">
        <div class="head">
          <span class="cat-badge cat-${cat.key}">${cat.emoji} ${cat.label}</span>
          <time>${formatTimestamp(m.created)}${m.updated ? ' (編集済)' : ''}</time>
        </div>
        ${m.targetName ? `<div class="target">🎢 ${escape(m.targetName)}</div>` : ''}
        ${m.title ? `<strong class="memo-title">${escape(m.title)}</strong>` : ''}
        ${photo}
        ${m.body ? `<div class="body">${escape(m.body)}</div>` : ''}
        <div class="modal-actions" style="margin-top:8px;">
          <button class="btn small outline" data-edit="${m.id}">編集</button>
          <button class="btn small danger" data-del="${m.id}">削除</button>
        </div>
      </div>`;
  }

  function openMemoEditor(seed) {
    const isEdit = !!seed.id;
    const days = DataStore.itinerary().days;
    const dayOptions = ['<option value="">日付未指定</option>']
      .concat(days.map(d => `<option value="${d.date}" ${seed.day === d.date ? 'selected' : ''}>Day ${d.dayNumber}・${formatDateJa(d.date)}</option>`))
      .join('');
    const catOptions = MEMO_CATEGORIES.map(c =>
      `<option value="${c.key}" ${(seed.category || 'memory') === c.key ? 'selected' : ''}>${c.emoji} ${c.label}</option>`
    ).join('');

    openModal(`
      <h2>${isEdit ? 'メモを編集' : 'メモを追加'}</h2>
      ${seed.targetName ? `<div class="target" style="color:var(--gold);font-size:13px;margin-bottom:8px;">🎢 ${escape(seed.targetName)}</div>` : ''}
      <div class="memo-form-row">
        <label>カテゴリ
          <select id="m-cat">${catOptions}</select>
        </label>
        <label>日付
          <select id="m-day">${dayOptions}</select>
        </label>
      </div>
      <input type="text" id="m-title" placeholder="タイトル" value="${escape(seed.title || '')}"
             style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;background:var(--card);color:var(--ink);font-family:inherit;font-size:14px;">
      <input type="url" id="m-photo" placeholder="写真URL（Google Photos の共有リンクなど）" value="${escape(seed.photoUrl || '')}"
             style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;background:var(--card);color:var(--ink);font-family:inherit;font-size:13px;">
      <textarea class="memo-input" id="m-body" placeholder="思い出を書く...">${escape(seed.body || '')}</textarea>
      <div class="modal-actions">
        <button class="btn" id="m-save">保存</button>
        <button class="btn outline" data-close>キャンセル</button>
      </div>
    `);
    document.getElementById('m-save').onclick = () => {
      const title = document.getElementById('m-title').value.trim();
      const body  = document.getElementById('m-body').value.trim();
      const category = document.getElementById('m-cat').value || 'memory';
      const day = document.getElementById('m-day').value || null;
      const photoUrl = document.getElementById('m-photo').value.trim() || null;
      if (!title && !body && !photoUrl) { toast('内容を入力してください'); return; }
      const memos = Storage.get('memos', []);
      if (isEdit) {
        const m = memos.find(x => x.id === seed.id);
        if (m) {
          m.title = title; m.body = body; m.category = category;
          m.day = day; m.photoUrl = photoUrl; m.updated = Date.now();
        }
      } else {
        memos.push({
          id: 'm' + Date.now(), title, body, category,
          day, photoUrl,
          targetId: seed.targetId || null, targetName: seed.targetName || null,
          created: Date.now()
        });
      }
      Storage.set('memos', memos);
      closeModal();
      go('memos');
      toast('保存しました');
    };
  }

  function exportMemosMarkdown() {
    const memos = Storage.get('memos', []);
    if (!memos.length) { toast('メモがありません'); return; }
    const trip = DataStore.itinerary().trip || {};
    const tripDates = DataStore.itinerary().days.map(d => d.date);
    const groups = new Map();
    tripDates.forEach(d => groups.set(d, []));
    groups.set('', []);
    memos.forEach(m => {
      const k = tripDates.includes(m.day) ? m.day : '';
      groups.get(k).push(m);
    });
    groups.forEach(arr => arr.sort((a, b) => (a.created || 0) - (b.created || 0)));

    const lines = [`# ${trip.title || 'メモ'}`, ''];
    [...groups.entries()].forEach(([dateKey, arr]) => {
      if (!arr.length) return;
      lines.push(`## ${memoDayLabel(dateKey)}`, '');
      arr.forEach(m => {
        const cat = memoCategory(m.category || 'memory');
        const heading = m.title || cat.label;
        lines.push(`### ${cat.emoji} ${heading}`);
        if (m.targetName) lines.push(`- 対象: 🎢 ${m.targetName}`);
        lines.push(`- 記録: ${formatTimestamp(m.created)}${m.updated ? ' (編集: ' + formatTimestamp(m.updated) + ')' : ''}`);
        if (m.photoUrl) lines.push(`- 写真: ${m.photoUrl}`);
        if (m.body) { lines.push('', m.body); }
        lines.push('');
      });
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url; a.download = `trip-memos-${stamp}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('エクスポートしました');
  }

  // ---------- Settings ----------
  function renderSettings() {
    const root = document.getElementById('settings-content');
    const s = Storage.get('settings', { dark: false, kidMode: false, childHeight: 102 });
    if (typeof s.childHeight !== 'number') s.childHeight = 102;
    const n = Notify.settings();
    const permLabel = !Notify.isSupported() ? '非対応'
      : Notification.permission === 'granted' ? '許可済'
      : Notification.permission === 'denied'  ? 'ブラウザ設定で拒否'
      : '未確認';
    root.innerHTML = `
      <div class="setting-section">
        <h3>表示</h3>
        <div class="setting-row">
          <div><div class="label">🌙 ダークモード</div><div class="desc">画面を暗く表示</div></div>
          <label class="switch"><input type="checkbox" id="s-dark" ${s.dark ? 'checked' : ''}><span class="slider"></span></label>
        </div>
        <div class="setting-row">
          <div><div class="label">👶 子ども配慮モード</div><div class="desc">怖さLv4以上を初期で非表示</div></div>
          <label class="switch"><input type="checkbox" id="s-kid" ${s.kidMode ? 'checked' : ''}><span class="slider"></span></label>
        </div>
        <div class="setting-row">
          <div><div class="label">📏 子どもの身長</div><div class="desc">「身長OKのみ」フィルタの基準値（cm）</div></div>
          <input type="number" id="s-height" min="60" max="200" step="1" value="${s.childHeight}"
                 style="width:80px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font-family:inherit;font-size:14px;text-align:right;">
        </div>
      </div>

      <div class="setting-section">
        <h3>通知</h3>
        <div class="setting-row">
          <div><div class="label">🔔 リマインダ</div><div class="desc">権限: ${permLabel}</div></div>
          <label class="switch"><input type="checkbox" id="s-notify" ${n.enabled ? 'checked' : ''} ${!Notify.isSupported() ? 'disabled' : ''}><span class="slider"></span></label>
        </div>
        <div class="setting-row">
          <div><div class="label">　60分前に通知</div><div class="desc">予定の1時間前</div></div>
          <label class="switch"><input type="checkbox" id="s-n60" ${n.mins.includes(60) ? 'checked' : ''}><span class="slider"></span></label>
        </div>
        <div class="setting-row">
          <div><div class="label">　30分前に通知</div><div class="desc">予定の30分前</div></div>
          <label class="switch"><input type="checkbox" id="s-n30" ${n.mins.includes(30) ? 'checked' : ''}><span class="slider"></span></label>
        </div>
        <div class="setting-row">
          <div><div class="label">　通知をテスト</div><div class="desc">いますぐ1件発火</div></div>
          <button class="btn small outline" id="s-ntest">テスト</button>
        </div>
      </div>

      <div class="setting-section">
        <h3>データ</h3>
        <div class="setting-row">
          <div><div class="label">📤 エクスポート</div><div class="desc">JSONとして書き出し</div></div>
          <button class="btn small outline" id="s-export">出力</button>
        </div>
        <div class="setting-row">
          <div><div class="label">📥 インポート</div><div class="desc">JSONを読み込み</div></div>
          <button class="btn small outline" id="s-import">読込</button>
        </div>
        <div class="setting-row">
          <div><div class="label">🗑️ リセット</div><div class="desc">すべてのデータを削除</div></div>
          <button class="btn small danger" id="s-reset">削除</button>
        </div>
      </div>

      <div class="setting-section">
        <h3>アプリ情報</h3>
        <div class="setting-row"><div><div class="label">バージョン</div></div><div class="desc">1.3.0</div></div>
        <div class="setting-row"><div><div class="label">最終更新</div></div><div class="desc">${BUILD_TIME}</div></div>
        <div class="setting-row">
          <div><div class="label">🔄 キャッシュを破棄して再読込</div><div class="desc">最新のアプリを取得し直す</div></div>
          <button class="btn small outline" id="s-reload">再読込</button>
        </div>
        <div class="setting-row"><div><div class="label">📋 旅程資料</div><div class="desc">印刷用ページ</div></div><a class="btn small outline" href="../docs/" style="text-decoration:none;">開く</a></div>
      </div>
    `;
    document.getElementById('s-dark').onchange = e => {
      const settings = Storage.get('settings', {}); settings.dark = e.target.checked;
      Storage.set('settings', settings); applyTheme();
    };
    document.getElementById('s-kid').onchange = e => {
      const settings = Storage.get('settings', {}); settings.kidMode = e.target.checked;
      Storage.set('settings', settings);
      toast(e.target.checked ? '子ども配慮モード ON' : '子ども配慮モード OFF');
      const attrScreen = document.getElementById('screen-attractions');
      if (attrScreen && !attrScreen.hidden) renderAttractions();
    };
    document.getElementById('s-height').onchange = e => {
      const v = parseInt(e.target.value, 10);
      const settings = Storage.get('settings', {});
      settings.childHeight = (Number.isFinite(v) && v >= 60 && v <= 200) ? v : 102;
      e.target.value = settings.childHeight;
      Storage.set('settings', settings);
      toast(`基準身長を ${settings.childHeight}cm に設定`);
      const attrScreen = document.getElementById('screen-attractions');
      if (attrScreen && !attrScreen.hidden) renderAttractions();
    };
    const saveNotify = () => {
      const cur = Notify.settings();
      const enabled = document.getElementById('s-notify').checked;
      const mins = [];
      if (document.getElementById('s-n60').checked) mins.push(60);
      if (document.getElementById('s-n30').checked) mins.push(30);
      Storage.set('notifySettings', { enabled, mins: mins.length ? mins : cur.mins });
      Notify.schedule();
    };
    document.getElementById('s-notify').onchange = async (e) => {
      if (e.target.checked) {
        const perm = await Notify.requestPermission();
        if (perm !== 'granted') {
          e.target.checked = false;
          toast('通知が許可されていません');
          renderSettings();
          return;
        }
      }
      saveNotify();
      renderSettings();
    };
    document.getElementById('s-n60').onchange = saveNotify;
    document.getElementById('s-n30').onchange = saveNotify;
    document.getElementById('s-ntest').onclick = async () => {
      const perm = await Notify.requestPermission();
      if (perm !== 'granted') { toast('通知が許可されていません'); return; }
      Notify.show('🏰 ディズニー旅行 2026', 'リマインダのテスト通知です', 'test-' + Date.now());
      toast('テスト通知を送信');
    };
    document.getElementById('s-export').onclick = () => exportData();
    document.getElementById('s-import').onclick = () => importData();
    document.getElementById('s-reset').onclick = () => {
      if (confirm('すべてのアプリデータ（お気に入り・チェック状態・メモ等）を削除します。元に戻せません。続行しますか？')) {
        Storage.clearAll();
        toast('リセットしました');
        applyTheme(); render(currentScreen);
      }
    };
    document.getElementById('s-reload').onclick = () => forceReload();
  }

  async function forceReload() {
    const btn = document.getElementById('s-reload');
    if (btn) { btn.disabled = true; btn.textContent = '更新中…'; }
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {
      console.warn('forceReload cleanup failed', e);
    }
    const url = new URL(location.href);
    url.searchParams.set('_r', Date.now().toString());
    location.replace(url.toString());
  }

  function exportData() {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `disney2026-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('エクスポートしました');
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = () => {
      const f = input.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          if (!confirm('既存データを上書きしてインポートしますか？')) return;
          Storage.importAll(data);
          toast('インポートしました');
          applyTheme(); render(currentScreen);
        } catch { toast('読み込みに失敗しました'); }
      };
      r.readAsText(f);
    };
    input.click();
  }

  // ---------- Modal / toast ----------
  function openModal(html) {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    document.getElementById('modal').hidden = true;
    document.body.style.overflow = '';
  }
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2000);
  }

  // ---------- Helpers ----------
  function escape(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function formatDateJa(s) {
    const [y, m, d] = s.split('-');
    const w = ['日', '月', '火', '水', '木', '金', '土'][new Date(s + 'T00:00:00+09:00').getDay()];
    return `${y}/${+m}/${+d}（${w}）`;
  }
  function formatTimestamp(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function typeLabel(t) {
    return ({
      flight: '✈️ フライト', transit: '🚃 移動', park: '🎢 パーク',
      meal: '🍴 食事', hotel: '🏨 宿泊', shopping: '🛍️ 買物', note: '📝 メモ'
    })[t] || t;
  }
  function parkEmoji(a) {
    if (a.fearLevel >= 4) return '⚠️';
    if (a.darkness === '完全暗闇') return '🌑';
    if (a.park === 'sea') return '🌊';
    return '🎢';
  }

  // ---------- Public ----------
  return { init, go, showAttractionDetail, toast };
})();

document.addEventListener('DOMContentLoaded', App.init);
