const GOAL_EMOJIS = ['🛡️','🏖️','💻','🚗','🏠','🎓','💍','👶','✈️','📱','🐾','🎸'];
let pageState = null;

document.addEventListener('layout:ready', (e) => {
  pageState = e.detail.state;
  document.getElementById('plusIcon').innerHTML = icon('plus');
  document.getElementById('aiIcon').innerHTML = icon('sparkle');
  render();
});

async function refresh(){
  pageState = await getData();
  render();
}

function ringSvg(percent, color){
  const r = 34, c = 2*Math.PI*r;
  const offset = c * (1 - percent/100);
  return `<svg viewBox="0 0 84 84">
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="#eef1f8" stroke-width="8"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
  </svg>`;
}

function render(){
  const state = pageState;
  const goals = goalsWithProgress(state);
  const totalTarget = goals.reduce((s,g)=>s+g.target,0);
  const totalSaved = goals.reduce((s,g)=>s+g.saved,0);
  const soon = goals.filter(g=>g.percent<100 && g.daysLeft<=90).length;

  document.getElementById('statGrid').innerHTML = `
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon purple">${icon('target')}</div></div><div class="stat-label">Tổng mục tiêu</div><div class="stat-value">${goals.length}</div></div>
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon info">${icon('wallet')}</div></div><div class="stat-label">Tổng số tiền mục tiêu</div><div class="stat-value" style="font-size:19px;">${formatVND(totalTarget)}</div></div>
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon income">${icon('trend')}</div></div><div class="stat-label">Tổng đã tiết kiệm</div><div class="stat-value" style="font-size:19px;">${formatVND(totalSaved)}</div><div class="text-muted mt-8" style="font-size:11.5px;">${pct(totalSaved,totalTarget).toFixed(1)}% tổng mục tiêu</div></div>
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon warn">${icon('calendar')}</div></div><div class="stat-label">Sắp đến hạn (≤90 ngày)</div><div class="stat-value">${soon}</div></div>
  `;

  document.getElementById('goalList').innerHTML = goals.length ? goals.map(g=>{
    const color = g.percent>=100 ? '#16b981' : g.percent>=50 ? '#6d5efc' : '#f6a623';
    return `
    <div class="goal-card">
      <div class="goal-ring">${ringSvg(g.percent, color)}<div class="ring-pct">${g.percent.toFixed(0)}%</div></div>
      <div class="goal-body">
        <div class="goal-title-row">
          <div class="goal-emoji" style="background:var(--purple-bg);">${g.emoji}</div>
          <div>
            <div style="font-weight:800;font-size:14.5px;">${g.name}</div>
            <div class="text-muted" style="font-size:11.5px;">${g.note||''}</div>
          </div>
          <span class="pill purple" style="margin-left:auto;">${g.priority}</span>
        </div>
        <div class="progress mt-12"><span style="width:${g.percent}%;background:${color};"></span></div>
        <div class="goal-meta">
          <div>Mục tiêu<b>${formatVND(g.target)}</b></div>
          <div>Đã tiết kiệm<b>${formatVND(g.saved)}</b></div>
          <div>Còn thiếu<b>${formatVND(g.remaining)}</b></div>
          <div>Hạn chót<b>${formatDateVN(g.deadline)}</b></div>
        </div>
      </div>
      <div class="flex gap-8" style="align-self:flex-start;">
        <button class="icon-btn" style="width:34px;height:34px;" onclick="addFunds('${g.id}')">${icon('plus')}</button>
        <button class="icon-btn" style="width:34px;height:34px;" onclick="openGoalForm('${g.id}')">${icon('edit')}</button>
        <button class="icon-btn" style="width:34px;height:34px;" onclick="deleteGoal('${g.id}')">${icon('trash')}</button>
      </div>
    </div>`;
  }).join('') : `<p class="text-muted" style="text-align:center;padding:30px;">Chưa có mục tiêu nào. Hãy tạo mục tiêu đầu tiên của bạn!</p>`;

  renderAiCoach(state, goals);
  renderTimeline(goals);
}

function renderAiCoach(state, goals){
  if(!goals.length){
    document.getElementById('aiCoachSummary').innerHTML = `<p class="text-muted" style="font-size:12.5px;">Tạo mục tiêu để AI đồng hành cùng bạn lập kế hoạch tiết kiệm.</p>`;
    document.getElementById('goalStatusList').innerHTML = '';
    document.getElementById('aiTipsBox').innerHTML = '';
    document.getElementById('aiDisclaimer').innerHTML='';
    return;
  }
  const totals = computeTotals(state);
  const neededPerMonth = goals.reduce((s,g)=>{
    const monthsLeft = Math.max(1, g.daysLeft/30);
    return s + (g.remaining/monthsLeft);
  },0);

  document.getElementById('aiCoachSummary').innerHTML = `
    <div class="ai-tip">
      <div class="ai-tip-icon" style="background:var(--income-bg);color:var(--income);">${icon('checkCircle')}</div>
      <p>Bạn đã tiết kiệm được <b>${pct(goals.reduce((s,g)=>s+g.saved,0), goals.reduce((s,g)=>s+g.target,0)).toFixed(1)}%</b> tổng mục tiêu. Tiếp tục duy trì nhịp độ hiện tại!</p>
    </div>
    <div class="ai-tip">
      <div class="ai-tip-icon" style="background:var(--purple-bg);color:var(--purple);">${icon('trend')}</div>
      <p>Để hoàn thành đúng hạn tất cả mục tiêu, bạn nên để dành khoảng <b>${formatVND(neededPerMonth)}</b>/tháng — tương đương ${pct(neededPerMonth, totals.income).toFixed(0)}% thu nhập hiện tại.</p>
    </div>
  `;

  document.getElementById('goalStatusList').innerHTML = goals.map(g=>{
    const totalDays = Math.max(1, (new Date(g.deadline) - new Date(g.createdAt)) / 86400000);
    const elapsed = totalDays - g.daysLeft;
    const expectedPct = clampPct(pct(elapsed, totalDays));
    let label, cls;
    if(g.percent >= 100){ label='Đã hoàn thành'; cls='income'; }
    else if(g.percent >= expectedPct + 8){ label='Có thể hoàn thành sớm'; cls='income'; }
    else if(g.percent < expectedPct - 8){ label='Cần tăng tốc'; cls='expense'; }
    else { label='Đang đi đúng lộ trình'; cls='info'; }
    return `<div class="mini-stat"><div class="stat-icon ${cls}" style="width:30px;height:30px;">${g.emoji}</div><div style="flex:1;"><div class="ms-label">${g.name}</div></div><span class="pill ${cls}">${label}</span></div>`;
  }).join('');

  const tips = [];
  const behind = goals.filter(g=>g.percent<100).sort((a,b)=>a.daysLeft-b.daysLeft)[0];
  if(behind) tips.push(`Mục tiêu "${behind.name}" còn ${behind.daysLeft} ngày và thiếu ${formatVND(behind.remaining)}. Cân nhắc thiết lập chuyển khoản tự động định kỳ.`);
  tips.push(`Giảm 10% chi tiêu ở danh mục lớn nhất có thể giúp bạn tiết kiệm thêm ~${formatVND(computeTotals(state).expense*0.1)}/tháng cho các mục tiêu.`);
  document.getElementById('aiTipsBox').innerHTML = tips.map(t=>`<div class="ai-tip"><div class="ai-tip-icon" style="background:var(--warn-bg);color:var(--warn);">${icon('bulb')}</div><p>${t}</p></div>`).join('');
  document.getElementById('aiDisclaimer').innerHTML = icon('shield') + '<span>Gợi ý mang tính tham khảo dựa trên tiến độ và dữ liệu chi tiêu thực tế.</span>';
}

function renderTimeline(goals){
  const sorted = [...goals].sort((a,b)=> new Date(a.deadline)-new Date(b.deadline));
  const items = [
    { label:'Bắt đầu hành trình', date: sorted[0]?.createdAt, status:'done' },
    ...sorted.map(g=>({ label:g.name, date:g.deadline, status: g.percent>=100 ? 'done' : (g===sorted.find(x=>x.percent<100) ? 'next' : 'locked') }))
  ];
  document.getElementById('timelineBox').innerHTML = items.map((it,i)=>`
    <div class="tl-item ${it.status}">
      ${i>0?'<div class="tl-line"></div>':''}
      <div class="tl-dot ${it.status}">${it.status==='done'?icon('check'):it.status==='next'?icon('flag'):(i+1)}</div>
      <div class="tl-label">${it.label}</div>
      <div class="tl-date">${it.date?formatDateVN(it.date):''}</div>
      <div class="tl-status ${it.status}">${it.status==='done'?'Đã hoàn thành':it.status==='next'?'Đang thực hiện':'Chưa bắt đầu'}</div>
    </div>
  `).join('');
}

function addFunds(id){
  const g = pageState.goals.find(x=>x.id===id);
  openModal(`
    <div class="modal-head"><h3>Nạp thêm tiền vào mục tiêu</h3><button class="modal-close" onclick="closeModal()">${icon('plus','rot45')}</button></div>
    <div class="field"><label>Số tiền muốn thêm (VNĐ)</label><input class="input" type="number" id="addAmount" min="1" placeholder="500000" /></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" id="addFundsBtn">Xác nhận</button>
    </div>
  `, ()=>{
    document.getElementById('addFundsBtn').addEventListener('click', async ()=>{
      const amount = Number(document.getElementById('addAmount').value);
      if(!amount || amount<=0){ showToast('Số tiền phải lớn hơn 0','error'); return; }
      const btn = document.getElementById('addFundsBtn');
      btn.disabled = true;
      try{
        await Api.updateGoal(id, { saved_amount: g.saved + amount });
        closeModal();
        showToast('Đã cập nhật số tiền tiết kiệm');
        await refresh();
      }catch(err){
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

function openGoalForm(id){
  const state = pageState;
  const existing = id ? state.goals.find(g=>g.id===id) : null;
  let emoji = existing ? existing.emoji : GOAL_EMOJIS[0];

  openModal(`
    <div class="modal-head"><h3>${existing?'Sửa mục tiêu':'Tạo mục tiêu mới'}</h3><button class="modal-close" onclick="closeModal()">${icon('plus','rot45')}</button></div>
    <div class="field"><label>Tên mục tiêu</label><input class="input" id="goalName" value="${existing?existing.name.replace(/"/g,'&quot;'):''}" placeholder="Ví dụ: Mua xe máy" /></div>
    <div class="field">
      <label>Biểu tượng</label>
      <div id="goalEmojiPicker" style="display:flex;flex-wrap:wrap;gap:8px;">
        ${GOAL_EMOJIS.map(e=>`<button type="button" class="g-emoji-opt" data-e="${e}" style="width:36px;height:36px;border-radius:10px;border:1.5px solid ${e===emoji?'var(--brand-1)':'var(--border)'};background:${e===emoji?'var(--purple-bg)':'#fff'};font-size:16px;cursor:pointer;">${e}</button>`).join('')}
      </div>
    </div>
    <div class="grid grid-2">
      <div class="field"><label>Số tiền mục tiêu</label><input class="input" type="number" id="goalTarget" min="1" value="${existing?existing.target:''}" /></div>
      <div class="field"><label>Đã tiết kiệm</label><input class="input" type="number" id="goalSaved" min="0" value="${existing?existing.saved:0}" /></div>
    </div>
    <div class="grid grid-2">
      <div class="field"><label>Hạn hoàn thành</label><input class="input" type="date" id="goalDeadline" value="${existing?existing.deadline:''}" /></div>
      <div class="field"><label>Mức ưu tiên</label>
        <select class="input" id="goalPriority">
          ${['Ưu tiên cao','Trung bình','Dài hạn'].map(p=>`<option ${existing&&existing.priority===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field"><label>Ghi chú <span class="hint">(không bắt buộc)</span></label><input class="input" id="goalNote" value="${existing?(existing.note||'').replace(/"/g,'&quot;'):''}" /></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" id="saveGoalBtn">${existing?'Lưu thay đổi':'Tạo mục tiêu'}</button>
    </div>
  `, ()=>{
    document.querySelectorAll('.g-emoji-opt').forEach(b=> b.addEventListener('click', ()=>{
      emoji = b.dataset.e;
      document.querySelectorAll('.g-emoji-opt').forEach(x=>{ x.style.borderColor='var(--border)'; x.style.background='#fff'; });
      b.style.borderColor='var(--brand-1)'; b.style.background='var(--purple-bg)';
    }));
    document.getElementById('saveGoalBtn').addEventListener('click', async ()=>{
      const name = document.getElementById('goalName').value.trim();
      const target = Number(document.getElementById('goalTarget').value);
      const saved = Number(document.getElementById('goalSaved').value) || 0;
      const deadline = document.getElementById('goalDeadline').value;
      const priority = document.getElementById('goalPriority').value;
      const note = document.getElementById('goalNote').value.trim();
      if(!name){ showToast('Vui lòng nhập tên mục tiêu','error'); return; }
      if(!target || target<=0){ showToast('Số tiền mục tiêu phải lớn hơn 0','error'); return; }
      if(!deadline){ showToast('Vui lòng chọn hạn hoàn thành','error'); return; }

      const btn = document.getElementById('saveGoalBtn');
      btn.disabled = true;
      const payload = { name, emoji, target_amount: target, saved_amount: saved, deadline, priority, note };
      try{
        if(existing) await Api.updateGoal(id, payload);
        else await Api.createGoal(payload);
        closeModal();
        showToast(existing?'Đã cập nhật mục tiêu':'Đã tạo mục tiêu mới');
        await refresh();
      }catch(err){
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

function deleteGoal(id){
  confirmDialog('Xóa mục tiêu?', 'Toàn bộ tiến độ đã lưu của mục tiêu này sẽ bị xóa vĩnh viễn.', async ()=>{
    try{
      await Api.deleteGoal(id);
      showToast('Đã xóa mục tiêu');
      await refresh();
    }catch(err){ showToast(err.message, 'error'); }
  });
}
