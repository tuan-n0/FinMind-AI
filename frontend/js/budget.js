let pageState = null;
let complianceChartInstance = null;

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

function render(){
  const state = pageState;
  document.getElementById('periodLabel').textContent = `Quản lý và theo dõi ngân sách theo danh mục chi tiêu — ${state.period.label.toLowerCase()}.`;

  const budgets = budgetProgress(state);
  const totalLimit = budgets.reduce((s,b)=>s+b.limit,0);
  const totalSpent = budgets.reduce((s,b)=>s+b.spent,0);
  const remaining = totalLimit - totalSpent;
  const overCount = budgets.filter(b=>b.status==='danger').length;

  document.getElementById('overviewCard').innerHTML = `
    <div class="card-head"><h3>Tổng quan ngân sách ${state.period.label}</h3></div>
    <div class="grid grid-4">
      <div><div class="stat-label">Tổng ngân sách</div><div class="stat-value" style="font-size:19px;">${formatVND(totalLimit)}</div></div>
      <div><div class="stat-label">Đã chi tiêu</div><div class="stat-value" style="font-size:19px;color:var(--expense);">${formatVND(totalSpent)}</div></div>
      <div><div class="stat-label">Còn lại</div><div class="stat-value" style="font-size:19px;color:var(--income);">${formatVND(Math.max(0,remaining))}</div></div>
      <div><div class="stat-label">Danh mục vượt ngân sách</div><div class="stat-value" style="font-size:19px;color:${overCount?'var(--expense)':'var(--ink-900)'};">${overCount}</div></div>
    </div>
    <div class="progress ${totalSpent>totalLimit?'danger':pct(totalSpent,totalLimit)>=85?'warn':'ok'} mt-16"><span style="width:${clampPct(pct(totalSpent,totalLimit))}%"></span></div>
    <p class="text-muted mt-8" style="font-size:12px;">Đã dùng ${pct(totalSpent,totalLimit).toFixed(1)}% tổng ngân sách tháng này.</p>
  `;

  document.getElementById('budgetList').innerHTML = budgets.length ? budgets.map(b=>`
    <div class="mt-20" style="padding-bottom:16px;border-bottom:1px solid var(--ink-100);">
      <div class="flex items-center justify-between" style="margin-bottom:8px;">
        <div class="flex items-center gap-10">
          <div class="cat-badge" style="background:${b.meta.bg};width:36px;height:36px;font-size:16px;">${b.meta.emoji}</div>
          <div>
            <div style="font-weight:800;font-size:13.5px;">${b.meta.name}</div>
            <div class="text-muted" style="font-size:11.5px;">${formatVND(b.spent)} / ${formatVND(b.limit)}</div>
          </div>
        </div>
        <div class="flex items-center gap-10">
          <span class="pill ${b.status==='danger'?'expense':b.status==='warn'?'warn':'income'}">${b.status==='danger'?'Vượt ngân sách':b.status==='warn'?'Gần đạt giới hạn':'Bình thường'}</span>
          <button class="icon-btn" style="width:32px;height:32px;" onclick="openBudgetForm('${b.categoryId}')">${icon('edit')}</button>
        </div>
      </div>
      <div class="progress ${b.status}"><span style="width:${clampPct(b.usedPct)}%"></span></div>
      <div class="flex justify-between mt-8" style="font-size:11px;font-weight:700;color:var(--ink-400);">
        <span>${b.usedPct.toFixed(0)}% đã dùng</span>
        <span>${b.remaining>=0 ? 'Còn lại '+formatVND(b.remaining) : 'Vượt '+formatVND(-b.remaining)}</span>
      </div>
    </div>
  `).join('') : `<p class="text-muted" style="text-align:center;padding:24px;">Chưa thiết lập ngân sách nào. Bấm "Tạo ngân sách" để bắt đầu.</p>`;

  renderAiSuggestions(state);

  // Compliance trend chart (dùng tổng hạn mức hiện tại đối chiếu chi tiêu các tháng gần nhất)
  const months = state.trend.months.slice(-6);
  const expenseVals = state.trend.expense.slice(-6);
  const compliance = expenseVals.map(v => clampPct(pct(v, totalLimit)));
  const avg = compliance.length ? compliance.reduce((a,b)=>a+b,0)/compliance.length : 0;
  document.getElementById('avgCompliance').textContent = avg.toFixed(1) + '%';

  if(complianceChartInstance) complianceChartInstance.destroy();
  complianceChartInstance = new Chart(document.getElementById('complianceChart'), {
    type:'line',
    data:{ labels: months, datasets:[{ data: compliance, borderColor:'#6d5efc', backgroundColor:'rgba(109,94,252,.1)', fill:true, tension:.4, pointRadius:3, borderWidth:2.5 }] },
    options: chartBaseOptions({ noScales:false })
  });
}

async function renderAiSuggestions(state){
  const box = document.getElementById('aiSuggestList');
  box.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Đang phân tích…</p>`;
  document.getElementById('aiDisclaimer').innerHTML = icon('shield') + '<span>Đây là đề xuất tham khảo dựa trên lịch sử chi tiêu, quyết định cuối cùng luôn thuộc về bạn.</span>';
  try{
    const res = await Api.aiBudgetSuggest(state.period.month, state.period.year);
    const list = res.suggestions || [];
    box.innerHTML = list.length ? list.map(s=>{
      const meta = catMeta(state, String(s.category_id));
      const cssVar = s.tone==='danger' ? 'expense' : s.tone==='warn' ? 'warn' : 'info';
      const toneIcon = s.tone==='danger'?'alert':s.tone==='warn'?'trend':'bulb';
      return `<div class="ai-tip">
        <div class="ai-tip-icon" style="background:var(--${cssVar}-bg);color:var(--${cssVar});">${meta.emoji || icon(toneIcon)}</div>
        <p>${s.text}</p>
      </div>`;
    }).join('') : `<p class="text-muted" style="font-size:12.5px;">Ngân sách hiện đang cân đối tốt, chưa có đề xuất điều chỉnh.</p>`;
  }catch(err){
    box.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Không lấy được gợi ý AI: ${err.message}</p>`;
  }
}

function openBudgetForm(categoryId){
  const state = pageState;
  const expenseCats = Object.entries(state.categories).filter(([,c])=>c.type==='expense');
  const usedIds = new Set(state.budgets.map(b=>b.categoryId));
  const availableCats = categoryId ? expenseCats : expenseCats.filter(([id])=>!usedIds.has(id));
  const existing = categoryId ? state.budgets.find(b=>b.categoryId===categoryId) : null;

  if(!categoryId && availableCats.length===0){
    showToast('Tất cả danh mục chi đã có ngân sách. Hãy sửa ngân sách hiện có.', 'error');
    return;
  }

  openModal(`
    <div class="modal-head"><h3>${existing?'Sửa ngân sách':'Tạo ngân sách mới'}</h3><button class="modal-close" onclick="closeModal()">${icon('plus','rot45')}</button></div>
    <div class="field">
      <label>Danh mục</label>
      <select class="input" id="budgetCat" ${existing?'disabled':''}>${availableCats.map(([id,c])=>`<option value="${id}" ${id===categoryId?'selected':''}>${c.emoji} ${c.name}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>Hạn mức tháng (VNĐ)</label>
      <input class="input" type="number" id="budgetLimit" min="0" value="${existing?existing.limit:''}" placeholder="Ví dụ: 3000000" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" id="saveBudgetBtn">${existing?'Lưu thay đổi':'Tạo ngân sách'}</button>
    </div>
  `, ()=>{
    document.getElementById('saveBudgetBtn').addEventListener('click', async ()=>{
      const limit = Number(document.getElementById('budgetLimit').value);
      const cat = document.getElementById('budgetCat').value;
      if(!limit || limit < 0){ showToast('Hạn mức phải lớn hơn hoặc bằng 0', 'error'); return; }
      const btn = document.getElementById('saveBudgetBtn');
      btn.disabled = true;
      try{
        await Api.upsertBudget({ category_id: Number(cat), month: state.period.month, year: state.period.year, limit_amount: limit });
        closeModal();
        showToast(existing ? 'Đã cập nhật ngân sách' : 'Đã tạo ngân sách mới');
        await refresh();
      }catch(err){
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}
