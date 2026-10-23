/**
 * MessTrack - Billing & Statistics Module
 */

const MessStats = {
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

    let breakfastCount = 0;
    let lunchCount = 0;
    let snacksCount = 0;
    let dinnerCount = 0;
    let leaveDaysCount = 0;
    let daysWithMeals = 0;
    let totalExtraCharges = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${prefix}-${String(d).padStart(2, '0')}`;
      const rec = records[dateKey];

      if (rec) {
        if (rec.isLeave) {
          leaveDaysCount++;
        } else {
          let hasAnyMeal = false;
          if (rec.breakfast) { breakfastCount++; hasAnyMeal = true; }
          if (rec.lunch) { lunchCount++; hasAnyMeal = true; }
          if (rec.snacks) { snacksCount++; hasAnyMeal = true; }
          if (rec.dinner) { dinnerCount++; hasAnyMeal = true; }

          if (hasAnyMeal) {
            daysWithMeals++;
          }
        }
        if (rec.extraCharge && !isNaN(Number(rec.extraCharge))) {
          totalExtraCharges += Number(rec.extraCharge);
        }
      }
    }

    const rates = settings.mealRates || { breakfast: 30, lunch: 60, snacks: 25, dinner: 65 };
    const breakfastCost = breakfastCount * (rates.breakfast || 0);
    const lunchCost = lunchCount * (rates.lunch || 0);
    const snacksCost = snacksCount * (rates.snacks || 0);
    const dinnerCost = dinnerCount * (rates.dinner || 0);
    const totalMealsCost = breakfastCost + lunchCost + snacksCost + dinnerCost;
    const totalMealsCount = breakfastCount + lunchCount + snacksCount + dinnerCount;

    let totalPayable = 0;
    let rebateAmount = 0;
    const model = settings.billingModel || 'per_meal';

    if (model === 'fixed_monthly') {
      const baseFee = Number(settings.fixedMonthlyFee) || 3500;
      const rebateRate = Number(settings.dailyLeaveRebate) || 100;
      rebateAmount = leaveDaysCount * rebateRate;
      totalPayable = Math.max(0, baseFee - rebateAmount) + totalExtraCharges;
    } else {
      // Per meal billing
      totalPayable = totalMealsCost + totalExtraCharges;
    }

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
      rebateAmount,
      totalPayable,
      attendancePct,
      billingModel: model
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
    const curr = settings.currency || '₹';

    let billingRows = '';
    if (stats.billingModel === 'fixed_monthly') {
      billingRows = `
        <tr>
          <td>Fixed Monthly Fee</td>
          <td>1 Month</td>
          <td>${curr}${settings.fixedMonthlyFee || 3500}</td>
        </tr>
        <tr>
          <td>Leave Rebate (${stats.leaveDaysCount} days @ ${curr}${settings.dailyLeaveRebate}/day)</td>
          <td>-${stats.leaveDaysCount} days</td>
          <td style="color:#dc2626;">-${curr}${stats.rebateAmount}</td>
        </tr>
      `;
    } else {
      billingRows = `
        <tr>
          <td>Breakfast (${curr}${settings.mealRates.breakfast} ea)</td>
          <td>${stats.breakfastCount}</td>
          <td>${curr}${stats.breakfastCost}</td>
        </tr>
        <tr>
          <td>Lunch (${curr}${settings.mealRates.lunch} ea)</td>
          <td>${stats.lunchCount}</td>
          <td>${curr}${stats.lunchCost}</td>
        </tr>
        <tr>
          <td>Snacks (${curr}${settings.mealRates.snacks} ea)</td>
          <td>${stats.snacksCount}</td>
          <td>${curr}${stats.snacksCost}</td>
        </tr>
        <tr>
          <td>Dinner (${curr}${settings.mealRates.dinner} ea)</td>
          <td>${stats.dinnerCount}</td>
          <td>${curr}${stats.dinnerCost}</td>
        </tr>
      `;
    }

    if (stats.totalExtraCharges > 0) {
      billingRows += `
        <tr>
          <td>Extra / Guest Charges</td>
          <td>-</td>
          <td>${curr}${stats.totalExtraCharges}</td>
        </tr>
      `;
    }

    return `
      <div class="mess-slip-paper" id="printable-slip">
        <div class="slip-header">
          <h3>${settings.messName || 'Hostel / Mess'}</h3>
          <p>Monthly Meal Statement & Bill</p>
          <p style="font-size:11px; margin-top:2px;">Month: <strong>${monthName} ${stats.year}</strong></p>
        </div>

        <div class="slip-info-row">
          <span><strong>Student:</strong> ${settings.userName || 'Student'}</span>
          <span><strong>Room / Roll:</strong> ${settings.roomNo || 'N/A'}</span>
        </div>
        <div class="slip-info-row">
          <span><strong>Days In Month:</strong> ${stats.daysInMonth}</span>
          <span><strong>Days Attended:</strong> ${stats.daysWithMeals}</span>
        </div>
        <div class="slip-info-row">
          <span><strong>Mess Leaves / Off:</strong> ${stats.leaveDaysCount} days</span>
          <span><strong>Attendance:</strong> ${stats.attendancePct}%</span>
        </div>

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

💰 *TOTAL PAYABLE: ${curr}${stats.totalPayable}*
Generated with MessTrack App`;
  }
};

window.MessStats = MessStats;
