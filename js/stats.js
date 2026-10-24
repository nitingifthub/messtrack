/**
 * MessTrack - Billing & Statistics Module
 */

const MessStats = {
  /**
   * Helper to escape HTML characters in user text
   */
  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Calculates monthly financial and attendance statistics
   * @param {number} year - YYYY
   * @param {number} month - 1-12
   * @param {Object} records - Map of 'YYYY-MM-DD' -> meal record
   * @param {Object} settings - Mess settings
   */
  calculateMonthlyStats(year, month, records, settings) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const rates = (settings && settings.mealRates) || { breakfast: 30, lunch: 60, snacks: 25, dinner: 65 };

    let breakfastCount = 0;
    let lunchCount = 0;
    let snacksCount = 0;
    let dinnerCount = 0;
    let leaveDaysCount = 0;
    let daysWithMeals = 0;
    let totalExtraCharges = 0;

    const monthNamesShort = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const attendedDays = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${prefix}-${String(d).padStart(2, '0')}`;
      const rec = records ? records[dateKey] : null;

      if (rec) {
        const extra = (!isNaN(Number(rec.extraCharge))) ? Math.max(0, Number(rec.extraCharge)) : 0;
        if (extra > 0) {
          totalExtraCharges += extra;
        }

        if (rec.isLeave) {
          leaveDaysCount++;
          // If a day was on leave but had an extra charge (e.g. snack/guest charge), still list in itemized log
          if (extra > 0) {
            const dateObj = new Date(year, month - 1, d);
            const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            attendedDays.push({
              day: d,
              dateStr: `${String(d).padStart(2, '0')} ${monthNamesShort[month - 1]} (${dayOfWeek})`,
              meals: [],
              mealsText: 'Extra / Guest charge (Leave)',
              cost: extra,
              extraCharge: extra,
              note: rec.note ? rec.note.trim() : ''
            });
          }
        } else {
          const meals = [];
          let dayMealCost = 0;
          if (rec.breakfast) {
            breakfastCount++;
            meals.push('Breakfast');
            dayMealCost += (rates.breakfast || 0);
          }
          if (rec.lunch) {
            lunchCount++;
            meals.push('Lunch');
            dayMealCost += (rates.lunch || 0);
          }
          if (rec.snacks) {
            snacksCount++;
            meals.push('Snacks');
            dayMealCost += (rates.snacks || 0);
          }
          if (rec.dinner) {
            dinnerCount++;
            meals.push('Dinner');
            dayMealCost += (rates.dinner || 0);
          }

          if (meals.length > 0 || extra > 0) {
            if (meals.length > 0) {
              daysWithMeals++;
            }
            const dateObj = new Date(year, month - 1, d);
            const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            attendedDays.push({
              day: d,
              dateStr: `${String(d).padStart(2, '0')} ${monthNamesShort[month - 1]} (${dayOfWeek})`,
              meals: meals,
              mealsText: meals.length > 0 ? meals.join(', ') : 'Extra charges only',
              cost: dayMealCost + extra,
              extraCharge: extra,
              note: rec.note ? rec.note.trim() : ''
            });
          }
        }
      }
    }

    const breakfastCost = breakfastCount * (rates.breakfast || 0);
    const lunchCost = lunchCount * (rates.lunch || 0);
    const snacksCost = snacksCount * (rates.snacks || 0);
    const dinnerCost = dinnerCount * (rates.dinner || 0);
    const totalMealsCost = breakfastCost + lunchCost + snacksCost + dinnerCost;
    const totalMealsCount = breakfastCount + lunchCount + snacksCount + dinnerCount;
    const totalPayable = totalMealsCost + totalExtraCharges;
    const attendancePct = daysInMonth > 0 ? Math.round((daysWithMeals / daysInMonth) * 100) : 0;

    return {
      year,
      month,
      daysInMonth,
      breakfastCount,
      lunchCount,
      snacksCount,
      dinnerCount,
      totalMealsCount,
      breakfastCost,
      lunchCost,
      snacksCost,
      dinnerCost,
      totalMealsCost,
      leaveDaysCount,
      daysWithMeals,
      totalExtraCharges,
      totalPayable,
      attendancePct,
      attendedDays
    };
  },

  /**
   * Generates formatted Mess Bill Slip HTML
   */
  generateSlipHTML(stats, settings) {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[stats.month - 1];
    const curr = (settings && settings.currency) || '₹';
    const rates = (settings && settings.mealRates) || { breakfast: 30, lunch: 60, snacks: 25, dinner: 65 };

    const safeMessName = this.escapeHTML((settings && settings.messName) || 'Hostel Mess');
    const safeUserName = this.escapeHTML((settings && settings.userName) || 'Student');
    const safeRoomNo = this.escapeHTML((settings && settings.roomNo) || 'N/A');

    let billingRows = `
      <tr>
        <td>Breakfast (${curr}${rates.breakfast || 0} ea)</td>
        <td>${stats.breakfastCount}</td>
        <td>${curr}${stats.breakfastCost}</td>
      </tr>
      <tr>
        <td>Lunch (${curr}${rates.lunch || 0} ea)</td>
        <td>${stats.lunchCount}</td>
        <td>${curr}${stats.lunchCost}</td>
      </tr>
      <tr>
        <td>Snacks (${curr}${rates.snacks || 0} ea)</td>
        <td>${stats.snacksCount}</td>
        <td>${curr}${stats.snacksCost}</td>
      </tr>
      <tr>
        <td>Dinner (${curr}${rates.dinner || 0} ea)</td>
        <td>${stats.dinnerCount}</td>
        <td>${curr}${stats.dinnerCost}</td>
      </tr>
    `;

    if (stats.totalExtraCharges > 0) {
      billingRows += `
        <tr>
          <td>Extra / Guest Charges</td>
          <td>-</td>
          <td>${curr}${stats.totalExtraCharges}</td>
        </tr>
      `;
    }

    // Daily breakdown for ONLY the days food was eaten or extra charges incurred
    let dailyEatenRows = '';
    if (stats.attendedDays && stats.attendedDays.length > 0) {
      dailyEatenRows = stats.attendedDays.map(item => `
        <tr>
          <td><strong>${this.escapeHTML(item.dateStr)}</strong></td>
          <td>
            ${this.escapeHTML(item.mealsText)}
            ${item.note ? `<div style="font-size: 10px; color: #64748b; margin-top: 1px;"><em>Note: ${this.escapeHTML(item.note)}</em></div>` : ''}
          </td>
          <td style="text-align: right; font-weight: 600;">${curr}${item.cost}</td>
        </tr>
      `).join('');
    } else {
      dailyEatenRows = `
        <tr>
          <td colspan="3" style="text-align: center; color: #94a3b8; padding: 14px;">No mess meals recorded for this month.</td>
        </tr>
      `;
    }

    return `
      <div class="mess-slip-paper" id="printable-slip">
        <div class="slip-header">
          <h3>${safeMessName}</h3>
          <p>Monthly Meal Statement & Bill</p>
          <p style="font-size:11px; margin-top:2px;">Month: <strong>${monthName} ${stats.year}</strong></p>
        </div>

        <div class="slip-info-row">
          <span><strong>Student:</strong> ${safeUserName}</span>
          <span><strong>Room / Roll:</strong> ${safeRoomNo}</span>
        </div>
        <div class="slip-info-row">
          <span><strong>Days In Month:</strong> ${stats.daysInMonth}</span>
          <span><strong>Days Attended:</strong> ${stats.daysWithMeals}</span>
        </div>
        <div class="slip-info-row">
          <span><strong>Mess Leaves / Off:</strong> ${stats.leaveDaysCount} days</span>
          <span><strong>Attendance:</strong> ${stats.attendancePct}%</span>
        </div>

        <div class="slip-divider"></div>

        <!-- Billing Summary Table -->
        <table class="slip-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${billingRows}
          </tbody>
        </table>

        <!-- Itemized Log of ONLY Days Eaten -->
        <div style="margin-top: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; border-bottom: 1px solid #94a3b8; padding-bottom: 3px;">
            <strong style="font-size: 11px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">
              Itemized Food Log (Only Days Eaten - ${stats.attendedDays.length} Records)
            </strong>
          </div>

          <table class="slip-table slip-detail-table">
            <thead>
              <tr>
                <th style="width: 32%;">Date</th>
                <th>Meals Taken</th>
                <th style="text-align: right; width: 22%;">Day Total</th>
              </tr>
            </thead>
            <tbody>
              ${dailyEatenRows}
            </tbody>
          </table>
        </div>

        <div class="slip-divider"></div>

        <div class="slip-total-row">
          <span>NET PAYABLE:</span>
          <span>${curr}${stats.totalPayable.toLocaleString()}</span>
        </div>

        <div class="slip-sign-row">
          <div class="slip-sign-box">
            Student Signature
          </div>
          <div class="slip-sign-box">
            Mess Manager / Warden
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Generates clean shareable text summary for WhatsApp / messaging
   */
  generateShareText(stats, settings) {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[stats.month - 1];
    const curr = settings.currency || '₹';

    let datesAttendedList = '';
    if (stats.attendedDays && stats.attendedDays.length > 0) {
      datesAttendedList = '\n\n📋 *Dates Attended (Only Days Eaten):*\n' + 
        stats.attendedDays.map(item => `• ${item.dateStr}: ${item.mealsText}${item.note ? ` [${item.note}]` : ''} = ${curr}${item.cost}`).join('\n');
    }

    return `🍽️ *MESS BILL SUMMARY - ${settings.messName || 'Mess'}*
📅 *Period:* ${monthName} ${stats.year}
👤 *Name:* ${settings.userName || 'Student'} (${settings.roomNo || 'Room N/A'})

📊 *Attendance:*
- Days Attended: ${stats.daysWithMeals} / ${stats.daysInMonth} (${stats.attendancePct}%)
- Mess Leaves (Cuts): ${stats.leaveDaysCount} days

🍲 *Meals Breakdown:*
- Breakfasts: ${stats.breakfastCount} (${curr}${stats.breakfastCost})
- Lunches: ${stats.lunchCount} (${curr}${stats.lunchCost})
- Snacks: ${stats.snacksCount} (${curr}${stats.snacksCost})
- Dinners: ${stats.dinnerCount} (${curr}${stats.dinnerCost})
- Total Meals: ${stats.totalMealsCount}
${datesAttendedList}

💰 *TOTAL PAYABLE: ${curr}${stats.totalPayable}*
Generated with MessTrack App`;
  }
};

window.MessStats = MessStats;
