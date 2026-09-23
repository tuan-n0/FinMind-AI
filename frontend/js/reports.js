let pageState = null;

document.addEventListener('layout:ready', (e) => {
  pageState = e.detail.state;
  document.getElementById('fileIcon').innerHTML = icon('fileText');
  document.getElementById('dlIcon').innerHTML = icon('download');
  document.getElementById('aiIcon').innerHTML = icon('sparkle');
  document.getElementById('btnPdf').addEventListener('click', ()=> window.print());
  document.getElementById('btnCsv').addEventListener('click', exportReportCsv);
  render();
});

async function render(){
  const state = pageState;
  const totals = computeTotals(state);
  const mom = monthOverMonthDelta(state);
  const catExpense = groupByCategory(state, 'expense');
  const top5 = topExpenses(state, 5);
  const netTotal = totals.income - totals.expense;

  document.getElementById('periodLabel').textContent = `Thống kê chi tiết tình hình tài chính của bạn — ${state.period.label.toLowerCase()}, so với tháng liền trước.`;
  document.getElementById('footNote').textContent = `Dữ liệu báo cáo được tổng hợp đến ngày cuối cùng của ${state.period.label.toLowerCase()}.`;

  document.getElementById('statGrid').innerHTML = `
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon income">${icon('arrowDown')}</div><span class="stat-trend ${mom.incomeDelta>=0?'up':'down'}">${icon(mom.incomeDelta>=0?'arrowUp':'arrowDown')}${Math.abs(mom.incomeDelta).toFixed(1)}%</span></div><div class="stat-label">Tổng thu</div><div class="stat-value" style="font-size:19px;">${formatVND(totals.income)}</div></div>
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon expense">${icon('arrowUp')}</div><span class="stat-trend ${mom.expenseDelta>=0?'down':'up'}">${icon(mom.expenseDelta>=0?'arrowUp':'arrowDown')}${Math.abs(mom.expenseDelta).toFixed(1)}%</span></div><div class="stat-label">Tổng chi</div><div class="stat-value" style="font-size:19px;">${formatVND(totals.expense)}</div></div>
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon info">${icon('wallet')}</div></div><div class="stat-label">Số dư ròng</div><div class="stat-value" style="font-size:19px;">${formatVND(netTotal)}</div></div>
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon purple">${icon('target')}</div></div><div class="stat-label">Tỷ lệ tiết kiệm</div><div class="stat-value" style="font-size:19px;">${totals.savingsRate.toFixed(1)}%</div></div>
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon teal">${icon('swap')}</div></div><div class="stat-label">Giao dịch</div><div class="stat-value" style="font-size:19px;">${totals.count}</div></div>
  `;

  new Chart(document.getElementById('barChart'), {
    type:'bar',
    data:{ labels: state.trend.months, datasets:[
      { label:'Thu nhập', data: state.trend.income, backgroundColor:'#16b98199', borderRadius:5, maxBarThickness:16 },
      { label:'Chi tiêu', data: state.trend.expense, backgroundColor:'#f65c6f99', borderRadius:5, maxBarThickness:16 },
    ]},
    options: chartBaseOptions({ legend:true, yTicks:true })
  });

  new Chart(document.getElementById('donutChart'), {
    type:'doughnut',
    data:{ labels: catExpense.map(c=>c.meta.name), datasets:[{ data: catExpense.map(c=>c.amount), backgroundColor: catExpense.map(c=>c.meta.color), borderWidth:0, hoverOffset:6 }] },
    options:{ cutout:'66%', plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(ctx)=> `${ctx.label}: ${formatVND(ctx.raw)}` } } } }
  });
  document.getElementById('donutLegend').innerHTML = catExpense.map(c=>`
    <div class="flex items-center justify-between" style="padding:4px 0;font-size:11.8px;font-weight:700;">
      <span class="flex items-center gap-8"><span style="width:9px;height:9px;border-radius:99px;background:${c.meta.color};display:inline-block;"></span>${c.meta.name}</span>
      <span class="text-muted">${c.percent.toFixed(0)}%</span>
    </div>`).join('');

  const netSeries = state.trend.income.map((v,i)=> v - state.trend.expense[i]);
  new Chart(document.getElementById('netChart'), {
    type:'line',
    data:{ labels: state.trend.months, datasets:[{ label:'Dòng tiền ròng', data: netSeries, borderColor:'#6d5efc', backgroundColor:'rgba(109,94,252,.1)', fill:true, tension:.4, pointRadius:3, borderWidth:2.5 }] },
    options: chartBaseOptions({ yTicks:true })
  });

  const prevIncome = state.trend.income[state.trend.income.length-2];
  const prevExpense = state.trend.expense[state.trend.expense.length-2];
  const compareRows = [
    { label:'Tổng thu', cur: totals.income, prev: prevIncome, color:'#16b981' },
    { label:'Tổng chi', cur: totals.expense, prev: prevExpense, color:'#f65c6f' },
    { label:'Số dư ròng', cur: netTotal, prev: prevIncome-prevExpense, color:'#2fb0f8' },
  ];
  const maxVal = Math.max(...compareRows.flatMap(r=>[r.cur,r.prev]));
  document.getElementById('compareBars').innerHTML = compareRows.map(r=>`
    <div class="mt-16">
      <div class="compare-legend"><span>${r.label}</span><span>${formatVND(r.cur)} <span class="text-muted">(trước: ${formatVND(r.prev)})</span></span></div>
      <div class="compare-row"><div class="compare-bar-track"><span style="width:${pct(r.cur,maxVal)}%;background:${r.color};"></span></div></div>
      <div class="compare-row" style="margin-top:6px;"><div class="compare-bar-track" style="opacity:.45;"><span style="width:${pct(r.prev,maxVal)}%;background:${r.color};"></span></div></div>
    </div>`).join('');

  document.getElementById('topBody').innerHTML = top5.map((t,i)=>{
    const meta = catMeta(state, t.categoryId);
    return `<tr>
      <td>${i+1}</td><td>${t.note}</td>
      <td><span class="cell-cat"><span class="cat-badge" style="background:${meta.bg}">${meta.emoji}</span>${meta.name}</span></td>
      <td class="amount-neg">-${formatVND(t.amount)}</td>
      <td>${pct(t.amount, totals.expense).toFixed(1)}%</td>
    </tr>`;
  }).join('');

  const aiBox = document.getElementById('aiTipsList');
  aiBox.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Đang phân tích…</p>`;
  try{
    const ai = await Api.aiSummary(state.period.month, state.period.year);
    aiBox.innerHTML = [
      { icon:'trend', cls:'info', text: ai.summary },
      ...ai.suggestions.slice(0,2).map(s=>({icon:'bulb',cls:'purple',text:s})),
    ].map(t=>`<div class="ai-tip"><div class="ai-tip-icon" style="background:var(--${t.cls}-bg);color:var(--${t.cls});">${icon(t.icon)}</div><p>${t.text}</p></div>`).join('');
  }catch(err){
    aiBox.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Không lấy được phân tích AI: ${err.message}</p>`;
  }
  document.getElementById('aiDisclaimer').innerHTML = icon('shield') + '<span>Báo cáo do AI tổng hợp chỉ mang tính tham khảo, dựa trên dữ liệu giao dịch thực tế.</span>';
}

function exportReportCsv(){
  const state = pageState;
  const catExpense = groupByCategory(state,'expense');
  const lines = ['Danh mục,Số tiền,Tỷ trọng'].concat(catExpense.map(c=>`${c.meta.name},${c.amount},${c.percent.toFixed(1)}%`));
  const blob = new Blob(['﻿'+lines.join('\n')], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `bao-cao-${state.period.year}-${state.period.month}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('Đã xuất báo cáo (CSV)');
}
