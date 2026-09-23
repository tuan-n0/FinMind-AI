document.addEventListener('layout:ready', async (e) => {
  const state = e.detail.state;
  const totals = computeTotals(state);
  const mom = monthOverMonthDelta(state);
  const catExpense = groupByCategory(state, 'expense');
  const budgets = budgetProgress(state);
  const recent = [...currentMonthTx(state)].sort((a,b)=> b.date.localeCompare(a.date)).slice(0,8);

  document.getElementById('greeting').textContent = `Xin chào, ${state.user.name.split(' ').slice(-1)[0]}! 👋`;
  document.getElementById('greetingSub').textContent = `Đây là tổng quan tài chính của bạn trong ${state.period.label.toLowerCase()}.`;
  document.getElementById('plusIcon').innerHTML = icon('plus');
  document.getElementById('chevRight1').innerHTML = icon('chevronRight');
  document.getElementById('chevRight2').innerHTML = icon('chevronRight');
  document.getElementById('chevRight3').innerHTML = icon('chevronRight');
  document.getElementById('aiHeadIcon').innerHTML = icon('sparkle');
  document.getElementById('chatHeadIcon').innerHTML = icon('robot');
  document.getElementById('chatAvatarIcon').innerHTML = icon('sparkle');

  // ---- KPI cards ----
  const kpis = [
    { label:'Tổng thu', value: totals.income, icon:'arrowDown', cls:'income', trend: mom.incomeDelta },
    { label:'Tổng chi', value: totals.expense, icon:'arrowUp', cls:'expense', trend: mom.expenseDelta },
    { label:'Số dư khả dụng', value: totals.balance, icon:'wallet', cls:'info', trend: null },
    { label:'Tỷ lệ tiết kiệm', value: null, custom:`${totals.savingsRate.toFixed(1)}%`, icon:'target', cls:'purple', trend: null },
  ];
  document.getElementById('kpiGrid').innerHTML = kpis.map(k=>`
    <div class="card stat-card">
      <div class="stat-top">
        <div class="stat-icon ${k.cls}">${icon(k.icon)}</div>
        ${k.trend!==null ? `<span class="stat-trend ${k.trend>=0?'up':'down'}">${icon(k.trend>=0?'arrowUp':'arrowDown')}${Math.abs(k.trend).toFixed(1)}%</span>` : ''}
      </div>
      <div class="stat-label">${k.label}</div>
      <div class="stat-value">${k.custom || formatVND(k.value)}</div>
    </div>
  `).join('');

  // ---- Trend line chart ----
  new Chart(document.getElementById('trendChart'), {
    type:'line',
    data:{
      labels: state.trend.months,
      datasets:[
        { label:'Thu nhập', data:state.trend.income, borderColor:'#16b981', backgroundColor:'rgba(22,185,129,.08)', tension:.4, fill:true, pointRadius:3, borderWidth:2.5 },
        { label:'Chi tiêu', data:state.trend.expense, borderColor:'#f65c6f', backgroundColor:'rgba(246,92,111,.08)', tension:.4, fill:true, pointRadius:3, borderWidth:2.5 },
      ]
    },
    options: chartBaseOptions({ legend:true, yTicks:true })
  });

  // ---- Donut chart ----
  new Chart(document.getElementById('donutChart'), {
    type:'doughnut',
    data:{
      labels: catExpense.map(c=>c.meta.name),
      datasets:[{ data: catExpense.map(c=>c.amount), backgroundColor: catExpense.map(c=>c.meta.color), borderWidth:0, hoverOffset:6 }]
    },
    options:{ cutout:'68%', plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(ctx)=> `${ctx.label}: ${formatVND(ctx.raw)}` } } } }
  });
  document.getElementById('donutLegend').innerHTML = catExpense.slice(0,6).map(c=>`
    <div class="flex items-center justify-between" style="padding:5px 0;font-size:12px;font-weight:700;">
      <span class="flex items-center gap-8"><span style="width:9px;height:9px;border-radius:99px;background:${c.meta.color};display:inline-block;"></span>${c.meta.name}</span>
      <span class="text-muted">${c.percent.toFixed(0)}%</span>
    </div>`).join('') || `<p class="text-muted" style="font-size:12px;">Chưa có dữ liệu chi tiêu.</p>`;

  // ---- Budget mini list ----
  document.getElementById('budgetMiniList').innerHTML = budgets.slice(0,4).map(b=>`
    <div class="mt-12">
      <div class="flex items-center justify-between" style="font-size:12.5px;font-weight:700;margin-bottom:6px;">
        <span>${b.meta.emoji} ${b.meta.name}</span>
        <span class="text-muted">${formatVND(b.spent)} / ${formatVND(b.limit)}</span>
      </div>
      <div class="progress ${b.status==='danger'?'danger':b.status==='warn'?'warn':'ok'}"><span style="width:${clampPct(b.usedPct)}%"></span></div>
    </div>`).join('') || `<p class="text-muted" style="font-size:12px;">Chưa thiết lập ngân sách nào.</p>`;

  // ---- Recent transactions ----
  document.getElementById('recentTxBody').innerHTML = recent.length ? recent.map(t=>{
    const meta = catMeta(state, t.categoryId);
    return `<tr>
      <td>${formatDateVN(t.date)}</td>
      <td>${t.note}</td>
      <td><span class="cell-cat"><span class="cat-badge" style="background:${meta.bg}">${meta.emoji}</span>${meta.name}</span></td>
      <td>${t.account}</td>
      <td class="${t.type==='income'?'amount-pos':'amount-neg'}">${t.type==='income'?'+':'-'}${formatVND(t.amount)}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--ink-400);padding:24px;">Chưa có giao dịch nào trong kỳ này.</td></tr>`;

  document.getElementById('dashQuick').innerHTML = ['Tháng này tôi chi nhiều nhất vào đâu?','So sánh với tháng trước','Tôi đã tiết kiệm được bao nhiêu?']
    .map(q=>`<button onclick="location.href='ai-chat.html?q=${encodeURIComponent(q)}'">${q}</button>`).join('');

  // ---- AI panel (gọi backend thật) ----
  const aiBox = document.getElementById('aiTipsList');
  aiBox.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Đang phân tích…</p>`;
  try{
    const ai = await Api.aiSummary(state.period.month, state.period.year);
    const tips = [
      ...ai.warnings.map(w=>({icon:'alert', cls:'expense', text:w})),
      ...ai.suggestions.map(s=>({icon:'bulb', cls:'purple', text:s})),
      { icon:'trend', cls:'info', text: ai.summary },
    ].slice(0,4);
    aiBox.innerHTML = tips.map(t=>`
      <div class="ai-tip">
        <div class="ai-tip-icon" style="background:var(--${t.cls}-bg);color:var(--${t.cls});">${icon(t.icon)}</div>
        <p>${t.text}<a href="ai-analysis.html">Xem chi tiết →</a></p>
      </div>`).join('');
  }catch(err){
    aiBox.innerHTML = `<div class="ai-tip"><div class="ai-tip-icon" style="background:var(--expense-bg);color:var(--expense);">${icon('alert')}</div><p>Không lấy được phân tích AI: ${err.message}</p></div>`;
  }
  document.getElementById('aiDisclaimer1').innerHTML = icon('shield') + '<span>Gợi ý chỉ mang tính tham khảo, dựa trên dữ liệu chi tiêu thực tế của bạn.</span>';
});
