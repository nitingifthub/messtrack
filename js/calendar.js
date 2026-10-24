/**
 * MessTrack - Interactive Monthly Calendar Component
 */

const MessCalendar = {
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1, // 1-12
  selectedDate: null,

  init() {
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    const prevBtn = document.getElementById('cal-prev-month');
    const nextBtn = document.getElementById('cal-next-month');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.currentMonth--;
        if (this.currentMonth < 1) {
          this.currentMonth = 12;
          this.currentYear--;
        }
        this.render();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.currentMonth++;
        if (this.currentMonth > 12) {
          this.currentMonth = 1;
          this.currentYear++;
        }
        this.render();
      });
    }
  },

  setMonthYear(year, month) {
    this.currentYear = year;
    this.currentMonth = month;
    this.render();
  },

  render() {
    const gridEl = document.getElementById('calendar-grid');
    const titleEl = document.getElementById('calendar-month-label');
    const statsPillEl = document.getElementById('calendar-stats-pill');
    if (!gridEl || !titleEl) return;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    titleEl.textContent = `${monthNames[this.currentMonth - 1]} ${this.currentYear}`;

    // Calculate month stats
    const stats = MessStats.calculateMonthlyStats(
      this.currentYear,
      this.currentMonth,
      window.MessApp.records,
      window.MessApp.settings
    );

    if (statsPillEl) {
      statsPillEl.textContent = `${stats.daysWithMeals} Days Ate • ${stats.leaveDaysCount} Leaves`;
    }

    gridEl.innerHTML = '';

    const firstDayIndex = new Date(this.currentYear, this.currentMonth - 1, 1).getDay(); // 0 is Sun
    const daysInCurrentMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();
    const daysInPrevMonth = new Date(this.currentYear, this.currentMonth - 1, 0).getDate();

    // Adjust for Monday start (0=Sun -> 6, 1=Mon -> 0)
    let startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    // Previous month cells
    for (let i = startOffset - 1; i >= 0; i--) {
      const prevDate = daysInPrevMonth - i;
      const cell = document.createElement('div');
      cell.className = 'calendar-day-cell other-month';
      cell.innerHTML = `<span class="cell-date-num">${prevDate}</span>`;
      gridEl.appendChild(cell);
    }

    const todayStr = window.MessApp.formatDateKey(new Date());
    const curr = window.MessApp.settings.currency || '₹';
    const rates = window.MessApp.settings.mealRates || { breakfast: 30, lunch: 60, snacks: 25, dinner: 65 };

    // Current month cells
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateKey = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rec = window.MessApp.records[dateKey];

      const cell = document.createElement('div');
      cell.className = 'calendar-day-cell';
      cell.dataset.date = dateKey;

      if (dateKey === todayStr) {
        cell.classList.add('today');
      }

      let innerHTML = `<span class="cell-date-num">${d}</span>`;

      if (rec) {
        if (rec.isLeave) {
          cell.classList.add('leave-day');
          innerHTML += `<span class="cell-badge-leave">LEAVE</span>`;
          innerHTML += `<span class="cell-cost">-</span>`;
        } else {
          let dayCost = 0;
          let mealCount = 0;
          let dotsHTML = '<div class="cell-meal-dots">';

          if (rec.breakfast) {
            mealCount++;
            dayCost += rates.breakfast;
            dotsHTML += '<span class="meal-dot b-active" title="Breakfast"></span>';
          }
          if (rec.lunch) {
            mealCount++;
            dayCost += rates.lunch;
            dotsHTML += '<span class="meal-dot l-active" title="Lunch"></span>';
          }
          if (rec.snacks) {
            mealCount++;
            dayCost += rates.snacks;
            dotsHTML += '<span class="meal-dot s-active" title="Snacks"></span>';
          }
          if (rec.dinner) {
            mealCount++;
            dayCost += rates.dinner;
            dotsHTML += '<span class="meal-dot d-active" title="Dinner"></span>';
          }
          dotsHTML += '</div>';

          if (rec.extraCharge) {
            dayCost += Number(rec.extraCharge) || 0;
          }

          if (mealCount === 4) {
            cell.classList.add('all-eaten');
          }

          innerHTML += dotsHTML;
          innerHTML += `<span class="cell-cost">${dayCost > 0 ? curr + dayCost : ''}</span>`;
        }
      } else {
        innerHTML += `<div class="cell-meal-dots"></div><span class="cell-cost"></span>`;
      }

      cell.innerHTML = innerHTML;

      cell.addEventListener('click', () => {
        this.openDayEditorModal(dateKey);
      });

      gridEl.appendChild(cell);
    }

    // Trailing days for grid completeness (42 total slots or 35 slots)
    const totalRendered = startOffset + daysInCurrentMonth;
    const remainingSlots = (Math.ceil(totalRendered / 7) * 7) - totalRendered;
    for (let j = 1; j <= remainingSlots; j++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-day-cell other-month';
      cell.innerHTML = `<span class="cell-date-num">${j}</span>`;
      gridEl.appendChild(cell);
    }
  },

  /**
   * Opens the Day Editor Sheet from calendar click
   */
  openDayEditorModal(dateKey) {
    const modal = document.getElementById('day-modal');
    if (!modal) return;

    this.selectedDate = dateKey;
    const rec = window.MessApp.records[dateKey] || {
      date: dateKey,
      breakfast: false,
      lunch: false,
      snacks: false,
      dinner: false,
      isLeave: false,
      extraCharge: 0,
      note: ''
    };

    const modalTitle = document.getElementById('modal-day-title');
    const dateObj = window.MessApp ? window.MessApp.parseDateKey(dateKey) : new Date(dateKey + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    if (modalTitle) modalTitle.textContent = dayName;

    // Set form fields
    const chkB = document.getElementById('modal-chk-b');
    const chkL = document.getElementById('modal-chk-l');
    const chkS = document.getElementById('modal-chk-s');
    const chkD = document.getElementById('modal-chk-d');
    const chkLeave = document.getElementById('modal-chk-leave');
    const inputExtra = document.getElementById('modal-input-extra');
    const inputNote = document.getElementById('modal-input-note');

    if (chkB) chkB.checked = !!rec.breakfast;
    if (chkL) chkL.checked = !!rec.lunch;
    if (chkS) chkS.checked = !!rec.snacks;
    if (chkD) chkD.checked = !!rec.dinner;
    if (chkLeave) chkLeave.checked = !!rec.isLeave;
    if (inputExtra) inputExtra.value = rec.extraCharge || '';
    if (inputNote) inputNote.value = rec.note || '';

    // Handle leave disable toggle
    this.updateModalMealDisableState(chkLeave ? chkLeave.checked : false);

    modal.classList.add('show');
  },

  updateModalMealDisableState(isLeave) {
    const mealToggles = document.querySelectorAll('.modal-meal-row');
    mealToggles.forEach(row => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (isLeave) {
        row.style.opacity = '0.4';
        row.style.pointerEvents = 'none';
        if (checkbox) checkbox.checked = false;
      } else {
        row.style.opacity = '1';
        row.style.pointerEvents = 'auto';
      }
    });
  },

  saveDayFromModal() {
    if (!this.selectedDate) return;

    const chkB = document.getElementById('modal-chk-b');
    const chkL = document.getElementById('modal-chk-l');
    const chkS = document.getElementById('modal-chk-s');
    const chkD = document.getElementById('modal-chk-d');
    const chkLeave = document.getElementById('modal-chk-leave');
    const inputExtra = document.getElementById('modal-input-extra');
    const inputNote = document.getElementById('modal-input-note');

    const isLeave = chkLeave ? chkLeave.checked : false;

    window.MessApp.records[this.selectedDate] = {
      date: this.selectedDate,
      breakfast: isLeave ? false : (chkB ? chkB.checked : false),
      lunch: isLeave ? false : (chkL ? chkL.checked : false),
      snacks: isLeave ? false : (chkS ? chkS.checked : false),
      dinner: isLeave ? false : (chkD ? chkD.checked : false),
      isLeave: isLeave,
      extraCharge: inputExtra ? Math.max(0, Number(inputExtra.value) || 0) : 0,
      note: inputNote ? inputNote.value.trim() : ''
    };

    window.MessApp.saveRecords();
    this.closeModal();
    this.render();

    // If edited date is current selected date on Today screen, update that screen too
    if (window.MessApp.currentDateKey === this.selectedDate) {
      window.MessApp.loadDayRecord(this.selectedDate);
      window.MessApp.setupWeekStrip();
    }

    // Refresh analytics view if active
    if (window.MessApp.activeTab === 'analytics') {
      window.MessApp.updateAnalyticsView();
    }

    window.MessApp.showToast('Day updated successfully!', 'success');
  },

  closeModal() {
    const modal = document.getElementById('day-modal');
    if (modal) modal.classList.remove('show');
    this.selectedDate = null;
  }
};

window.MessCalendar = MessCalendar;
