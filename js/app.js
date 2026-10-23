/**
 * MessTrack - Main Application Controller
 */

const DEFAULT_SETTINGS = {
  messName: 'Hostel Mess B',
  userName: 'Nitin',
  roomNo: 'Room 204',
  currency: '₹',
  mealRates: {
    breakfast: 30,
    lunch: 60,
    snacks: 25,
    dinner: 65
  },
  theme: 'dark'
};

const MessApp = {
  settings: {},
  records: {},
  currentDate: new Date(),
  currentDateKey: '',
  activeTab: 'today',
  deferredInstallPrompt: null,

  init() {
    this.loadSettings();
    this.loadRecords();
    this.applyTheme(this.settings.theme || 'dark');
    this.currentDateKey = this.formatDateKey(this.currentDate);

    this.bindGlobalEvents();
    this.setupPWA();
    this.initTodayView();
    this.setupWeekStrip();
    this.setupSettingsView();
    this.updateAutoSaveIndicator();

    // Initialize calendar
    if (window.MessCalendar) {
      window.MessCalendar.init();
    }

    // Register Service Worker for offline PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('MessTrack ServiceWorker registered'))
        .catch(err => console.log('ServiceWorker registration error:', err));
    }

    // Request persistent storage protection against system cleanups
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(isPersisted => {
        console.log('MessTrack Persistent Storage status:', isPersisted);
      });
    }
  },

  /* ------------------- Data Persistence ------------------- */
  loadSettings() {
    try {
      const stored = localStorage.getItem('messtrack_settings');
      this.settings = stored ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(stored)) : Object.assign({}, DEFAULT_SETTINGS);
    } catch (e) {
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
    }
  },

  saveSettings() {
    try {
      localStorage.setItem('messtrack_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.error('Error saving settings', e);
    }
  },

  loadRecords() {
    try {
      const stored = localStorage.getItem('messtrack_records');
      this.records = stored ? JSON.parse(stored) : {};
    } catch (e) {
      this.records = {};
    }

    // If records are empty, pre-populate demo data for the current month so the app looks alive
    if (Object.keys(this.records).length === 0) {
      this.generateSampleData(false);
    }
  },

  saveRecords() {
    try {
      localStorage.setItem('messtrack_records', JSON.stringify(this.records));
      this.updateAutoSaveIndicator();
      this.saveToOPFS();
      this.saveToLinkedFolder();
    } catch (e) {
      console.error('Error saving records', e);
    }
  },

  async saveToLinkedFolder() {
    try {
      const handle = await this.getStoredDirectoryHandle();
      if (!handle) return;
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted' || (await handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
        const fileHandle = await handle.getFileHandle('messtrack_backup.json', { create: true });
        const writable = await fileHandle.createWritable();
        const data = {
          version: '1.0',
          appName: 'MessTrack',
          lastAutoSaved: new Date().toISOString(),
          settings: this.settings,
          records: this.records
        };
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
      }
    } catch (e) {
      console.log('Linked folder write skipped:', e);
    }
  },

  async getStoredDirectoryHandle() {
    return new Promise((resolve) => {
      const req = indexedDB.open('messtrack_fs', 1);
      req.onupgradeneeded = (e) => e.target.result.createObjectStore('handles');
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('handles', 'readonly');
        const getReq = tx.objectStore('handles').get('backup_dir');
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  },

  async storeDirectoryHandle(handle) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('messtrack_fs', 1);
      req.onupgradeneeded = (e) => e.target.result.createObjectStore('handles');
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'backup_dir');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async saveToOPFS() {
    if (navigator.storage && navigator.storage.getDirectory) {
      try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle('messtrack_records.json', { create: true });
        const writable = await fileHandle.createWritable();
        const data = {
          version: '1.0',
          appName: 'MessTrack',
          updatedAt: new Date().toISOString(),
          settings: this.settings,
          records: this.records
        };
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
      } catch (e) {
        // Silently continue if OPFS is not permitted
      }
    }
  },

  updateAutoSaveIndicator() {
    const textEl = document.getElementById('auto-save-text');
    if (!textEl) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    textEl.textContent = `Auto-saved to phone (${timeStr})`;
  },

  /* ------------------- Date Utilities ------------------- */
  formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  parseDateKey(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d);
  },

  /* ------------------- PWA & Theme Setup ------------------- */
  setupPWA() {
    const installBanner = document.getElementById('install-banner');
    const btnInstall = document.getElementById('btn-install-app');
    const btnCloseBanner = document.getElementById('btn-close-banner');
    const btnSettingsInstall = document.getElementById('btn-settings-install');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      if (installBanner) installBanner.style.display = 'flex';
    });

    const triggerInstall = async () => {
      if (this.deferredInstallPrompt) {
        this.deferredInstallPrompt.prompt();
        const { outcome } = await this.deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          this.showToast('MessTrack installed to your home screen!', 'success');
        }
        this.deferredInstallPrompt = null;
        if (installBanner) installBanner.style.display = 'none';
      } else {
        alert('To install on Android: Open browser menu (⋮) and tap "Add to Home Screen" or "Install app".');
      }
    };

    if (btnInstall) btnInstall.addEventListener('click', triggerInstall);
    if (btnSettingsInstall) btnSettingsInstall.addEventListener('click', triggerInstall);
    if (btnCloseBanner) {
      btnCloseBanner.addEventListener('click', () => {
        if (installBanner) installBanner.style.display = 'none';
      });
    }
  },

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.settings.theme = theme;
    this.saveSettings();

    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = theme === 'light' ? '🌙' : '☀️';
      themeToggleBtn.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
    }
  },

  toggleTheme() {
    const newTheme = (document.documentElement.getAttribute('data-theme') === 'light') ? 'dark' : 'light';
    this.applyTheme(newTheme);
  },

  /* ------------------- Navigation / Tabs ------------------- */
  bindGlobalEvents() {
    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Top Jump to Today button
    const jumpTodayBtn = document.getElementById('jump-today-btn');
    if (jumpTodayBtn) {
      jumpTodayBtn.addEventListener('click', () => {
        this.currentDate = new Date();
        this.currentDateKey = this.formatDateKey(this.currentDate);
        this.switchTab('today');
        this.loadDayRecord(this.currentDateKey);
        this.setupWeekStrip();
        if (window.MessCalendar) {
          window.MessCalendar.setMonthYear(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1);
        }
      });
    }

    // Bottom Navigation Tabs
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Close Day modal
    const btnCloseModal = document.getElementById('btn-close-modal');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        if (window.MessCalendar) window.MessCalendar.closeModal();
      });
    }

    const btnSaveModal = document.getElementById('btn-modal-save');
    if (btnSaveModal) {
      btnSaveModal.addEventListener('click', () => {
        if (window.MessCalendar) window.MessCalendar.saveDayFromModal();
      });
    }

    // Modal leave checkbox
    const modalChkLeave = document.getElementById('modal-chk-leave');
    if (modalChkLeave) {
      modalChkLeave.addEventListener('change', (e) => {
        if (window.MessCalendar) window.MessCalendar.updateModalMealDisableState(e.target.checked);
      });
    }

    // Close slip modal
    const btnCloseSlip = document.getElementById('btn-close-slip');
    if (btnCloseSlip) {
      btnCloseSlip.addEventListener('click', () => {
        document.getElementById('slip-modal').classList.remove('show');
      });
    }
  },

  switchTab(tabName) {
    this.activeTab = tabName;

    // Update nav icons
    document.querySelectorAll('.bottom-nav .nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tabName);
    });

    // Update views
    document.querySelectorAll('.view-section').forEach(view => {
      view.classList.remove('active');
    });

    const activeView = document.getElementById(`view-${tabName}`);
    if (activeView) {
      activeView.classList.add('active');
    }

    // Tab-specific refreshes
    if (tabName === 'calendar' && window.MessCalendar) {
      window.MessCalendar.render();
    } else if (tabName === 'analytics') {
      this.updateAnalyticsView();
    } else if (tabName === 'today') {
      this.loadDayRecord(this.currentDateKey);
      this.setupWeekStrip();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /* ------------------- TODAY / DAILY VIEW ------------------- */
  initTodayView() {
    // Prev / Next date buttons
    const prevDateBtn = document.getElementById('btn-prev-day');
    const nextDateBtn = document.getElementById('btn-next-day');
    const dateInput = document.getElementById('date-picker-hidden');
    const dateInfo = document.querySelector('.current-date-info');

    if (prevDateBtn) {
      prevDateBtn.addEventListener('click', () => {
        this.currentDate.setDate(this.currentDate.getDate() - 1);
        this.currentDateKey = this.formatDateKey(this.currentDate);
        this.loadDayRecord(this.currentDateKey);
        this.setupWeekStrip();
      });
    }

    if (nextDateBtn) {
      nextDateBtn.addEventListener('click', () => {
        this.currentDate.setDate(this.currentDate.getDate() + 1);
        this.currentDateKey = this.formatDateKey(this.currentDate);
        this.loadDayRecord(this.currentDateKey);
        this.setupWeekStrip();
      });
    }

    if (dateInfo && dateInput) {
      dateInfo.addEventListener('click', () => dateInput.showPicker ? dateInput.showPicker() : dateInput.click());
      dateInput.addEventListener('change', (e) => {
        if (e.target.value) {
          this.currentDate = this.parseDateKey(e.target.value);
          this.currentDateKey = e.target.value;
          this.loadDayRecord(this.currentDateKey);
          this.setupWeekStrip();
        }
      });
    }

    // Meal Card Toggles
    const mealCards = document.querySelectorAll('.meal-card');
    mealCards.forEach(card => {
      card.addEventListener('click', () => {
        const meal = card.dataset.meal;
        this.toggleMeal(meal);
      });
    });

    // Preset buttons
    const btnAllEaten = document.getElementById('btn-preset-all');
    if (btnAllEaten) {
      btnAllEaten.addEventListener('click', () => {
        this.markAllMeals(true);
      });
    }

    const btnMessLeave = document.getElementById('btn-preset-leave');
    if (btnMessLeave) {
      btnMessLeave.addEventListener('click', () => {
        this.toggleMessLeave();
      });
    }

    // Extras & Note inputs
    const inputExtra = document.getElementById('today-extra-charge');
    const inputNote = document.getElementById('today-daily-note');

    if (inputExtra) {
      inputExtra.addEventListener('input', () => {
        const val = Number(inputExtra.value) || 0;
        this.updateCurrentRecord({ extraCharge: val });
        this.updateTodayCostSummary();
      });
    }

    if (inputNote) {
      inputNote.addEventListener('input', () => {
        this.updateCurrentRecord({ note: inputNote.value });
      });
    }

    this.loadDayRecord(this.currentDateKey);
  },

  loadDayRecord(dateKey) {
    this.currentDateKey = dateKey;
    const rec = this.records[dateKey] || {
      date: dateKey,
      breakfast: false,
      lunch: false,
      snacks: false,
      dinner: false,
      isLeave: false,
      extraCharge: 0,
      note: ''
    };

    // Update Header Date Info
    const dayTitle = document.getElementById('today-day-name');
    const fullDate = document.getElementById('today-full-date');
    const dateInput = document.getElementById('date-picker-hidden');

    const d = this.parseDateKey(dateKey);
    const todayStr = this.formatDateKey(new Date());

    let relativeLabel = '';
    if (dateKey === todayStr) {
      relativeLabel = 'Today';
    } else {
      const diffDays = Math.round((d - new Date(todayStr)) / (1000 * 60 * 60 * 24));
      if (diffDays === -1) relativeLabel = 'Yesterday';
      else if (diffDays === 1) relativeLabel = 'Tomorrow';
      else relativeLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
    }

    if (dayTitle) dayTitle.textContent = `${relativeLabel}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    if (fullDate) fullDate.textContent = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric' });
    if (dateInput) dateInput.value = dateKey;

    // Update rates labels on cards
    const curr = this.settings.currency || '₹';
    const rates = this.settings.mealRates || { breakfast: 30, lunch: 60, snacks: 25, dinner: 65 };
    ['breakfast', 'lunch', 'snacks', 'dinner'].forEach(m => {
      const rateEl = document.getElementById(`rate-${m}`);
      if (rateEl) rateEl.textContent = `${curr}${rates[m]}`;
    });

    // Update Leave Banner and Preset Button
    const leaveBanner = document.getElementById('leave-active-banner');
    const btnMessLeave = document.getElementById('btn-preset-leave');

    if (rec.isLeave) {
      if (leaveBanner) leaveBanner.classList.add('show');
      if (btnMessLeave) btnMessLeave.classList.add('active');
    } else {
      if (leaveBanner) leaveBanner.classList.remove('show');
      if (btnMessLeave) btnMessLeave.classList.remove('active');
    }

    // Update Meal Cards State
    ['breakfast', 'lunch', 'snacks', 'dinner'].forEach(m => {
      const card = document.querySelector(`.meal-card[data-meal="${m}"]`);
      if (card) {
        if (rec.isLeave) {
          card.classList.add('disabled');
          card.classList.remove('eaten');
        } else {
          card.classList.remove('disabled');
          card.classList.toggle('eaten', !!rec[m]);
        }
      }
    });

    // Update Inputs
    const inputExtra = document.getElementById('today-extra-charge');
    const inputNote = document.getElementById('today-daily-note');
    if (inputExtra) inputExtra.value = rec.extraCharge || '';
    if (inputNote) inputNote.value = rec.note || '';

    this.updateTodayCostSummary();
  },

  toggleMeal(mealName) {
    if (navigator.vibrate) navigator.vibrate(25);

    const rec = this.getOrCreateRecord(this.currentDateKey);
    if (rec.isLeave) {
      rec.isLeave = false; // toggling a meal cancels leave
    }

    rec[mealName] = !rec[mealName];
    this.records[this.currentDateKey] = rec;
    this.saveRecords();
    this.loadDayRecord(this.currentDateKey);
    this.setupWeekStrip();
  },

  markAllMeals(status) {
    if (navigator.vibrate) navigator.vibrate(35);

    const rec = this.getOrCreateRecord(this.currentDateKey);
    rec.isLeave = false;
    rec.breakfast = status;
    rec.lunch = status;
    rec.snacks = status;
    rec.dinner = status;

    this.records[this.currentDateKey] = rec;
    this.saveRecords();
    this.loadDayRecord(this.currentDateKey);
    this.setupWeekStrip();
    this.showToast(status ? 'All meals marked eaten!' : 'Meals reset!', 'success');
  },

  toggleMessLeave() {
    if (navigator.vibrate) navigator.vibrate(35);

    const rec = this.getOrCreateRecord(this.currentDateKey);
    rec.isLeave = !rec.isLeave;

    if (rec.isLeave) {
      rec.breakfast = false;
      rec.lunch = false;
      rec.snacks = false;
      rec.dinner = false;
      this.showToast('Day marked as Mess Leave / Cut', 'info');
    } else {
      this.showToast('Mess Leave removed', 'info');
    }

    this.records[this.currentDateKey] = rec;
    this.saveRecords();
    this.loadDayRecord(this.currentDateKey);
    this.setupWeekStrip();
  },

  updateCurrentRecord(partial) {
    const rec = this.getOrCreateRecord(this.currentDateKey);
    Object.assign(rec, partial);
    this.records[this.currentDateKey] = rec;
    this.saveRecords();
  },

  getOrCreateRecord(dateKey) {
    if (!this.records[dateKey]) {
      this.records[dateKey] = {
        date: dateKey,
        breakfast: false,
        lunch: false,
        snacks: false,
        dinner: false,
        isLeave: false,
        extraCharge: 0,
        note: ''
      };
    }
    return this.records[dateKey];
  },

  updateTodayCostSummary() {
    const rec = this.records[this.currentDateKey];
    const curr = this.settings.currency || '₹';
    const rates = this.settings.mealRates || { breakfast: 30, lunch: 60, snacks: 25, dinner: 65 };

    const countEl = document.getElementById('today-meals-count');
    const costEl = document.getElementById('today-total-cost');

    if (!rec || rec.isLeave) {
      if (countEl) countEl.textContent = rec && rec.isLeave ? 'Leave' : '0/4';
      if (costEl) costEl.textContent = `${curr}0`;
      return;
    }

    let mealCount = 0;
    let cost = 0;
    if (rec.breakfast) { mealCount++; cost += rates.breakfast; }
    if (rec.lunch) { mealCount++; cost += rates.lunch; }
    if (rec.snacks) { mealCount++; cost += rates.snacks; }
    if (rec.dinner) { mealCount++; cost += rates.dinner; }
    if (rec.extraCharge) { cost += Number(rec.extraCharge); }

    if (countEl) countEl.textContent = `${mealCount}/4`;
    if (costEl) costEl.textContent = `${curr}${cost}`;
  },

  setupWeekStrip() {
    const container = document.getElementById('week-strip');
    if (!container) return;

    container.innerHTML = '';
    const current = new Date(this.currentDate);
    // Find Monday of the current week (or Sunday)
    const dayOfWeek = current.getDay();
    const mondayDiff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(current);
    startOfWeek.setDate(current.getDate() + mondayDiff);

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const key = this.formatDateKey(d);
      const rec = this.records[key];

      const pill = document.createElement('div');
      pill.className = 'week-day-pill';
      if (key === this.currentDateKey) pill.classList.add('active');

      const dayLetter = d.toLocaleDateString('en-US', { weekday: 'narrow' });
      const dayNum = d.getDate();

      let dotsHTML = '<div class="pill-dots">';
      if (rec) {
        if (rec.isLeave) {
          dotsHTML += '<span class="pill-dot leave"></span>';
        } else {
          ['breakfast', 'lunch', 'snacks', 'dinner'].forEach(m => {
            if (rec[m]) dotsHTML += '<span class="pill-dot eaten"></span>';
          });
        }
      }
      dotsHTML += '</div>';

      pill.innerHTML = `
        <span class="pill-day">${dayLetter}</span>
        <span class="pill-num">${dayNum}</span>
        ${dotsHTML}
      `;

      pill.addEventListener('click', () => {
        this.currentDate = d;
        this.currentDateKey = key;
        this.loadDayRecord(key);
        this.setupWeekStrip();
      });

      container.appendChild(pill);
    }
  },

  /* ------------------- ANALYTICS & BILL VIEW ------------------- */
  updateAnalyticsView() {
    const now = new Date();
    const curYear = window.MessCalendar ? window.MessCalendar.currentYear : now.getFullYear();
    const curMonth = window.MessCalendar ? window.MessCalendar.currentMonth : (now.getMonth() + 1);

    const stats = MessStats.calculateMonthlyStats(curYear, curMonth, this.records, this.settings);
    const curr = this.settings.currency || '₹';

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Hero card
    const heroMonth = document.getElementById('analytics-month-label');
    const heroAmount = document.getElementById('analytics-total-amount');
    const heroEatenDays = document.getElementById('analytics-eaten-days');
    const heroLeaveDays = document.getElementById('analytics-leave-days');
    const heroMealsTotal = document.getElementById('analytics-total-meals');

    if (heroMonth) heroMonth.textContent = `${monthNames[curMonth - 1]} ${curYear}`;
    if (heroAmount) heroAmount.textContent = `${curr}${stats.totalPayable.toLocaleString()}`;
    if (heroEatenDays) heroEatenDays.textContent = `${stats.daysWithMeals} Days`;
    if (heroLeaveDays) heroLeaveDays.textContent = `${stats.leaveDaysCount} Days`;
    if (heroMealsTotal) heroMealsTotal.textContent = `${stats.totalMealsCount}`;

    // Attendance Bar
    const pctLabel = document.getElementById('analytics-attendance-pct');
    const fillBar = document.getElementById('analytics-progress-fill');
    const subtext = document.getElementById('analytics-attendance-sub');

    if (pctLabel) pctLabel.textContent = `${stats.attendancePct}%`;
    if (fillBar) fillBar.style.width = `${stats.attendancePct}%`;
    if (subtext) subtext.textContent = `${stats.daysWithMeals} days ate out of ${stats.daysInMonth} days`;

    // Meals Metrics
    const setMetric = (id, count, cost) => {
      const cntEl = document.getElementById(`metric-cnt-${id}`);
      const cstEl = document.getElementById(`metric-cst-${id}`);
      if (cntEl) cntEl.textContent = count;
      if (cstEl) cstEl.textContent = `${curr}${cost}`;
    };

    setMetric('breakfast', stats.breakfastCount, stats.breakfastCost);
    setMetric('lunch', stats.lunchCount, stats.lunchCost);
    setMetric('snacks', stats.snacksCount, stats.snacksCost);
    setMetric('dinner', stats.dinnerCount, stats.dinnerCost);

    // Setup Generate Slip Button
    const btnGenerate = document.getElementById('btn-generate-slip');
    if (btnGenerate) {
      btnGenerate.onclick = () => this.showMessSlip(stats);
    }
  },

  showMessSlip(stats) {
    const modal = document.getElementById('slip-modal');
    const container = document.getElementById('slip-container');
    if (!modal || !container) return;

    container.innerHTML = MessStats.generateSlipHTML(stats, this.settings);
    modal.classList.add('show');

    // Print button
    const btnPrint = document.getElementById('btn-print-slip');
    if (btnPrint) {
      btnPrint.onclick = () => window.print();
    }

    // Share button
    const btnShare = document.getElementById('btn-share-slip');
    if (btnShare) {
      btnShare.onclick = () => {
        const text = MessStats.generateShareText(stats, this.settings);
        if (navigator.share) {
          navigator.share({
            title: `Mess Bill - ${this.settings.messName}`,
            text: text
          }).catch(() => {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => {
            this.showToast('Bill summary copied to clipboard!', 'success');
          });
        } else {
          prompt('Copy Mess Bill summary:', text);
        }
      };
    }
  },

  /* ------------------- SETTINGS VIEW ------------------- */
  setupSettingsView() {
    // Populate form fields
    const inMessName = document.getElementById('set-mess-name');
    const inUserName = document.getElementById('set-user-name');
    const inRoomNo = document.getElementById('set-room-no');
    const inCurrency = document.getElementById('set-currency');

    const inRateB = document.getElementById('set-rate-b');
    const inRateL = document.getElementById('set-rate-l');
    const inRateS = document.getElementById('set-rate-s');
    const inRateD = document.getElementById('set-rate-d');

    if (inMessName) inMessName.value = this.settings.messName || '';
    if (inUserName) inUserName.value = this.settings.userName || '';
    if (inRoomNo) inRoomNo.value = this.settings.roomNo || '';
    if (inCurrency) inCurrency.value = this.settings.currency || '₹';

    if (inRateB) inRateB.value = this.settings.mealRates.breakfast;
    if (inRateL) inRateL.value = this.settings.mealRates.lunch;
    if (inRateS) inRateS.value = this.settings.mealRates.snacks;
    if (inRateD) inRateD.value = this.settings.mealRates.dinner;

    // Save button
    const btnSave = document.getElementById('btn-save-settings');
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        this.settings.messName = inMessName.value.trim() || 'Mess';
        this.settings.userName = inUserName.value.trim() || 'Student';
        this.settings.roomNo = inRoomNo.value.trim() || '';
        this.settings.currency = inCurrency.value.trim() || '₹';

        this.settings.mealRates.breakfast = Number(inRateB.value) || 0;
        this.settings.mealRates.lunch = Number(inRateL.value) || 0;
        this.settings.mealRates.snacks = Number(inRateS.value) || 0;
        this.settings.mealRates.dinner = Number(inRateD.value) || 0;

        this.saveSettings();

        // Update header mess name subtitle
        const subtitle = document.querySelector('.mess-subtitle');
        if (subtitle) subtitle.textContent = this.settings.messName;

        this.loadDayRecord(this.currentDateKey);
        this.showToast('Settings saved successfully!', 'success');
      });
    }

    // Connect / Select Dedicated Folder
    const btnSelectFolder = document.getElementById('btn-select-folder');
    const folderNameLabel = document.getElementById('linked-folder-name');

    const updateFolderDisplay = async () => {
      const handle = await this.getStoredDirectoryHandle();
      if (handle && folderNameLabel) {
        folderNameLabel.textContent = `📁 ${handle.name} (Auto-saving)`;
        folderNameLabel.style.color = '#10b981';
      } else if (folderNameLabel) {
        folderNameLabel.textContent = 'Not connected';
        folderNameLabel.style.color = 'var(--text-muted)';
      }
    };
    updateFolderDisplay();

    if (btnSelectFolder) {
      btnSelectFolder.addEventListener('click', async () => {
        if ('showDirectoryPicker' in window) {
          try {
            const handle = await window.showDirectoryPicker({
              mode: 'readwrite',
              startIn: 'documents'
            });
            await this.storeDirectoryHandle(handle);
            await updateFolderDisplay();
            await this.saveToLinkedFolder();
            this.showToast(`Connected to ${handle.name}! Auto-saving enabled 📁`, 'success');
          } catch (err) {
            if (err.name !== 'AbortError') {
              alert('Could not link folder. You can use "Save Backup Now" instead.');
            }
          }
        } else {
          alert('Your browser does not support folder-level linking. Use "Save Backup Now" to save directly into your phone folder!');
        }
      });
    }

    // Save / Export Data to Phone Storage
    const btnExport = document.getElementById('btn-export-data');
    if (btnExport) {
      btnExport.addEventListener('click', async () => {
        const backup = {
          version: '1.0',
          appName: 'MessTrack',
          exportedAt: new Date().toISOString(),
          settings: this.settings,
          records: this.records
        };
        const jsonContent = JSON.stringify(backup, null, 2);
        const fileName = `messtrack_backup_${this.formatDateKey(new Date())}.json`;

        // Modern File System Access API (lets user pick specific folder if supported)
        if ('showSaveFilePicker' in window) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: fileName,
              types: [{
                description: 'JSON Backup File',
                accept: { 'application/json': ['.json'] }
              }]
            });
            const writable = await handle.createWritable();
            await writable.write(jsonContent);
            await writable.close();
            this.showToast('Saved directly to chosen phone folder! 📁', 'success');
            return;
          } catch (err) {
            if (err.name === 'AbortError') return; // User cancelled picker
          }
        }

        // Standard direct download to phone's Downloads folder
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('Saved to phone storage! (Check Downloads folder) 📁', 'success');
      });
    }

    // Import Data (JSON)
    const btnImport = document.getElementById('btn-import-data');
    const inputImport = document.getElementById('input-import-file');
    if (btnImport && inputImport) {
      btnImport.addEventListener('click', () => inputImport.click());
      inputImport.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            if (data.records) {
              this.records = data.records;
              this.saveRecords();
            }
            if (data.settings) {
              this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
              this.saveSettings();
            }
            this.loadDayRecord(this.currentDateKey);
            this.setupWeekStrip();
            if (window.MessCalendar) window.MessCalendar.render();
            this.showToast('Data imported successfully!', 'success');
          } catch (err) {
            alert('Invalid backup file. Could not parse JSON.');
          }
        };
        reader.readAsText(file);
      });
    }

    // Sample Data button
    const btnSample = document.getElementById('btn-load-sample');
    if (btnSample) {
      btnSample.addEventListener('click', () => {
        if (confirm('Load realistic sample data for the past 30 days?')) {
          this.generateSampleData(true);
        }
      });
    }

    // Clear Data button
    const btnClear = document.getElementById('btn-clear-data');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all meal records? This cannot be undone.')) {
          this.records = {};
          this.saveRecords();
          this.loadDayRecord(this.currentDateKey);
          this.setupWeekStrip();
          if (window.MessCalendar) window.MessCalendar.render();
          this.showToast('All meal records cleared.', 'error');
        }
      });
    }
  },

  generateSampleData(notify = false) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    // Generate for the current month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const sampleRecords = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      if (dateObj > today) break; // Don't generate past today

      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = dateObj.getDay();

      // Sample patterns:
      // Sundays (dayOfWeek === 0): sometimes out or skipped breakfast
      // Weekend trip: leave on days 12-14
      if (d === 12 || d === 13) {
        sampleRecords[key] = {
          date: key,
          breakfast: false,
          lunch: false,
          snacks: false,
          dinner: false,
          isLeave: true,
          extraCharge: 0,
          note: 'Weekend trip home'
        };
      } else {
        const ateBreakfast = d % 7 !== 0; // Skip Sunday breakfast
        const ateLunch = true;
        const ateSnacks = (d % 3 !== 0);
        const ateDinner = (d % 5 !== 0);

        sampleRecords[key] = {
          date: key,
          breakfast: ateBreakfast,
          lunch: ateLunch,
          snacks: ateSnacks,
          dinner: ateDinner,
          isLeave: false,
          extraCharge: (d === 5 || d === 20) ? 50 : 0,
          note: (d === 5) ? 'Special Ice Cream' : (d === 20 ? 'Guest meal' : '')
        };
      }
    }

    this.records = sampleRecords;
    this.saveRecords();
    if (notify) {
      this.loadDayRecord(this.currentDateKey);
      this.setupWeekStrip();
      if (window.MessCalendar) window.MessCalendar.render();
      this.showToast('Realistic 30-day sample data loaded!', 'success');
    }
  },

  /* ------------------- TOAST NOTIFICATIONS ------------------- */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2800);
  }
};

window.MessApp = MessApp;

document.addEventListener('DOMContentLoaded', () => {
  MessApp.init();
});
