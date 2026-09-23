const WEEKDAY_NAMES = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
let pageState = null;
let lastAi = null;

document.addEventListener('layout:ready', (e) => {
  pageState = e.detail.state;
  document.getElementById('sparkIcon2').innerHTML = icon('sparkle');
  document.getElementById('dlIcon').innerHTML = icon('download');
  document.getElementById('heroIcon').innerHTML = icon('sparkle');

  document.getElementById('btnNew').addEventListener('click', regenerate);
  document.getElementById('btnSave').addEventListener('click', saveReport);

  render();
});

async function regenerate(){
  const btn = document.getElementById('btnNew');
  btn.innerHTML = `${icon('sparkle')}Đang phân tích…`;
  btn.disabled = true;
  pageState = await getData();
  await render();
  btn.innerHTML = `${icon('sparkle')}Tạo phân tích mới`;
  btn.disabled = false;
  showToast('Đã tạo phân tích AI mới');
}

function saveReport(){
  if(!lastAi){ showToast('Chưa có báo cáo để lưu', 'error'); return; }
  const lines = [
    `Báo cáo AI — ${pageState.period.label}`,
    '',
    lastAi.summary,
    '',
    'Khuyến nghị:',
    ...lastAi.suggestions.map(s=>`- ${s}`),
  ];
  const blob = new Blob([lines.join('\n')], { type:'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `bao-cao-ai-${pageState.period.year}-${pageState.period.month}.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('Đã lưu báo cáo AI (mọi lượt gọi AI đã được ghi vào nhật ký ở trang Cài đặt)');
}

async function render(){
  const state = pageState;
  const totals = computeTotals(state);
  const mom = monthOverMonthDelta(state);
  const goals = goalsWithProgress(state);

  document.getElementById('heroTitle').textContent = `Báo cáo AI — Phân tích chi tiêu ${state.period.label.toLowerCase()}`;
  document.getElementById('heroSub').textContent = `AI đã tổng hợp ${totals.count} giao dịch từ 01/${String(state.period.month).padStart(2,'0')} đến 31/${String(state.period.month).padStart(2,'0')}/${state.period.year}.`;
  const confidence = Math.min(97, 62 + totals.count * 0.5).toFixed(0);
  document.getElementById('confidenceChip').innerHTML = `${icon('checkCircle')} Độ tin cậy ${confidence}%`;

  document.getElementById('quadGrid').innerHTML = `<p class="text-muted" style="grid-column:1/-1;padding:20px;text-align:center;">Đang phân tích…</p>`;

  let ai, forecast;
  try{
    [ai, forecast] = await Promise.all([
      Api.aiSummary(state.period.month, state.period.year),
      Api.aiTrend(state.period.month, state.period.year),
    ]);
  }catch(err){
    document.getElementById('quadGrid').innerHTML = `<p class="text-muted" style="grid-column:1/-1;padding:20px;text-align:center;color:var(--expense);">Không lấy được phân tích AI: ${err.message}</p>`;
    return;
  }
  lastAi = ai;

  document.getElementById('quadGrid').innerHTML = `
    <div class="quad-card">
      <div class="qh"><div class="stat-icon info">${icon('trend')}</div>Xu hướng nổi bật</div>
      <ul class="quad-list">${ai.highlights.map((h,i)=>`<li><span class="dot-chip" style="background:${['#2fb0f8','#16b981','#8b6df2'][i%3]}"></span><span><b>${h.label}.</b> ${h.detail}</span></li>`).join('') || '<li><span class="text-muted">Chưa có dữ liệu.</span></li>'}</ul>
    </div>
    <div class="quad-card">
      <div class="qh"><div class="stat-icon expense">${icon('bolt')}</div>Nguyên nhân tăng chi</div>
      <ul class="quad-list">${ai.causes.map(c=>`<li><span class="dot-chip" style="background:#f65c6f"></span><span><b>${c.label}.</b> ${c.detail}</span></li>`).join('') || '<li><span class="text-muted">Chưa có dữ liệu.</span></li>'}</ul>
    </div>
    <div class="quad-card">
      <div class="qh"><div class="stat-icon purple">${icon('calendar')}</div>Dự báo tháng tới</div>
      <p style="font-size:12.3px;color:var(--ink-600);font-weight:600;margin-bottom:10px;">${forecast.note}</p>
      ${forecast.available ? `<div class="chart-box" style="height:90px;"><canvas id="forecastMini"></canvas></div><p style="font-size:12px;font-weight:800;margin-top:8px;">Chi phí dự kiến: <span style="color:var(--brand-1)">${formatVND(forecast.forecast_next)}</span></p>` : ''}
    </div>
    <div class="quad-card">
      <div class="qh"><div class="stat-icon income">${icon('bulb')}</div>Khuyến nghị tiết kiệm</div>
      <ul class="quad-list">${ai.suggestions.map(s=>`<li><span class="dot-chip" style="background:#16b981"></span><span>${s}</span></li>`).join('')}</ul>
    </div>
  `;

  if(forecast.available){
    const last3 = forecast.series.slice(-3);
    const fmonths = [...last3.map(s=>`T${s.month}/${String(s.year).slice(2)}`), 'Dự báo'];
    const fvalues = [...last3.map(s=>s.expense), forecast.forecast_next];
    new Chart(document.getElementById('forecastMini'), {
      type:'line',
      data:{ labels: fmonths, datasets:[{ data:fvalues, borderColor:'#6d5efc', backgroundColor:'rgba(109,94,252,.08)', fill:true, tension:.35, pointRadius:3, borderWidth:2,
        segment:{ borderDash: ctx => ctx.p1DataIndex === fvalues.length-1 ? [5,4] : undefined } }] },
      options: chartBaseOptions({ noScales:false })
    });
  }

  document.getElementById('compareStats').innerHTML = [
    { label:'Tổng chi', value: formatVND(totals.expense), delta: mom.expenseDelta, invert:true },
    { label:'Thu nhập', value: formatVND(totals.income), delta: mom.incomeDelta },
    { label:'Tỷ lệ tiết kiệm', value: totals.savingsRate.toFixed(1)+'%', delta: null },
    { label:'Giao dịch', value: totals.count, delta: null },
  ].map(s=>`
    <div>
      <div class="stat-label">${s.label}</div>
      <div class="stat-value" style="font-size:18px;">${s.value}</div>
      ${s.delta!==null ? `<span class="stat-trend ${ (s.invert? s.delta<=0 : s.delta>=0) ?'up':'down'} mt-8" style="display:inline-flex;">${icon(s.delta>=0?'arrowUp':'arrowDown')}${Math.abs(s.delta).toFixed(1)}% so với tháng trước</span>` : ''}
    </div>`).join('');

  const benchRows = [
    { label:'Bạn', value: totals.savingsRate, color:'#6d5efc' },
    { label:'Mức khuyến nghị tối thiểu', value: 20, color:'#8891ad' },
    { label:'Mức lý tưởng theo chuyên gia', value: 30, color:'#16b981' },
  ];
  const maxB = Math.max(...benchRows.map(b=>b.value), 40);
  document.getElementById('benchmarkBars').innerHTML = benchRows.map(b=>`
    <div class="mt-12">
      <div class="compare-legend"><span>${b.label}</span><span>${b.value.toFixed(1)}%</span></div>
      <div class="compare-bar-track"><span style="width:${pct(b.value,maxB)}%;background:${b.color};"></span></div>
    </div>`).join('');

  // ---- AI insights sâu hơn (tính client-side từ dữ liệu đã tải) ----
  const dayTotals = {};
  currentMonthTx(state).filter(t=>t.type==='expense').forEach(t=>{
    const d = new Date(t.date).getDay();
    dayTotals[d] = (dayTotals[d]||0) + t.amount;
  });
  const topDay = Object.entries(dayTotals).sort((a,b)=>b[1]-a[1])[0];
  const topCat = groupByCategory(state,'expense')[0];
  const recommendedMaxPct = 25;
  const potentialSaving = topCat ? topCat.amount * 0.2 : 0;
  const nearestGoal = [...goals].sort((a,b)=>a.daysLeft-b.daysLeft)[0];

  const insights = [
    { icon:'fileText', cls:'info', title:'Thói quen chi tiêu', text: topDay ? `Bạn thường chi tiêu nhiều nhất vào ${WEEKDAY_NAMES[topDay[0]]}, chiếm ${pct(topDay[1],totals.expense).toFixed(0)}% tổng chi cả tháng.` : 'Chưa đủ dữ liệu để nhận diện thói quen.' },
    { icon:'alert', cls: topCat && topCat.percent>recommendedMaxPct ? 'expense':'income', title:'Danh mục cần chú ý', text: topCat ? `${topCat.meta.name} chiếm ${topCat.percent.toFixed(0)}% tổng chi, ${topCat.percent>recommendedMaxPct?'cao hơn':'thấp hơn'} mức khuyến nghị (≤${recommendedMaxPct}%).` : '—' },
    { icon:'bulb', cls:'purple', title:'Cơ hội tiết kiệm', text: topCat ? `Nếu giảm 20% chi phí "${topCat.meta.name}", bạn có thể tiết kiệm thêm ~${formatVND(potentialSaving)}/tháng.` : '—' },
    { icon:'target', cls:'teal', title:'Tiến độ mục tiêu', text: nearestGoal ? `Mục tiêu "${nearestGoal.name}" đang đi ${nearestGoal.percent>=50?'đúng hướng':'chậm hơn kỳ vọng'}, đạt ${nearestGoal.percent.toFixed(0)}% — còn ${nearestGoal.daysLeft} ngày.` : 'Chưa có mục tiêu tiết kiệm nào.' },
  ];
  document.getElementById('insightGrid').innerHTML = insights.map(i=>`
    <div class="card card-pad">
      <div class="stat-icon ${i.cls}" style="margin-bottom:12px;">${icon(i.icon)}</div>
      <div style="font-weight:800;font-size:13.5px;margin-bottom:6px;">${i.title}</div>
      <p style="font-size:12.3px;color:var(--ink-600);font-weight:600;line-height:1.55;">${i.text}</p>
    </div>`).join('');
}
