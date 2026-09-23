const PAGE_SIZE = 8;
let txPage = 1;
let categories = {};
let currentPeriod = null;
let allTransactions = [];

document.addEventListener('layout:ready', async (e) => {
  categories = e.detail.state.categories;
  currentPeriod = e.detail.state.period;

  document.getElementById('dlIcon').innerHTML = icon('download');
  document.getElementById('plusIcon').innerHTML = icon('plus');
  document.getElementById('searchIcon').innerHTML = icon('search');
  document.getElementById('aiIcon1').innerHTML = icon('sparkle');

  buildCategoryFilterOptions();
  document.getElementById('fSearch').addEventListener('input', ()=>{ txPage=1; render(); });
  ['fType','fCategory'].forEach(id=> document.getElementById(id).addEventListener('change', ()=>{ txPage=1; render(); }));
  document.getElementById('exportBtn').addEventListener('click', exportCSV);

  await loadTransactions();
  buildMonthFilterOptions();
  render();
  renderAiPanel();
});

function buildCategoryFilterOptions(){
  const catSel = document.getElementById('fCategory');
  catSel.innerHTML = '<option value="all">Tất cả danh mục</option>' +
    Object.entries(categories).map(([id,c])=>`<option value="${id}">${c.emoji} ${c.name}</option>`).join('');
}

function buildMonthFilterOptions(){
  const months = [...new Set(allTransactions.map(t=>t.date.slice(0,7)))].sort().reverse();
  const monthSel = document.getElementById('fMonth');
  const currentVal = `${currentPeriod.year}-${String(currentPeriod.month).padStart(2,'0')}`;
  monthSel.innerHTML = '<option value="all">Tất cả thời gian</option>' +
    months.map(m=>{
      const [y,mm] = m.split('-');
      return `<option value="${m}" ${m===currentVal?'selected':''}>Tháng ${Number(mm)}/${y}</option>`;
    }).join('');
  monthSel.addEventListener('change', ()=>{ txPage=1; render(); });
}

async function loadTransactions(){
  const raw = await Api.listTransactions({});
  allTransactions = raw.map(mapTransaction).sort((a,b)=> b.date.localeCompare(a.date) || Number(b.id)-Number(a.id));
}

function getFiltered(){
  const type = document.getElementById('fType').value;
  const cat = document.getElementById('fCategory').value;
  const month = document.getElementById('fMonth').value;
  const q = document.getElementById('fSearch').value.trim().toLowerCase();

  return allTransactions
    .filter(t => type==='all' || t.type===type)
    .filter(t => cat==='all' || t.categoryId===cat)
    .filter(t => month==='all' || t.date.startsWith(month))
    .filter(t => !q || t.note.toLowerCase().includes(q));
}

function render(){
  const filtered = getFiltered();
  const income = filtered.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = filtered.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);

  document.getElementById('statGrid').innerHTML = `
    <div class="card stat-card">
      <div class="stat-top"><div class="stat-icon info">${icon('swap')}</div></div>
      <div class="stat-label">Tổng giao dịch (theo bộ lọc)</div>
      <div class="stat-value">${filtered.length}</div>
    </div>
    <div class="card stat-card">
      <div class="stat-top"><div class="stat-icon income">${icon('arrowDown')}</div></div>
      <div class="stat-label">Tổng thu</div>
      <div class="stat-value">${formatVND(income)}</div>
    </div>
    <div class="card stat-card">
      <div class="stat-top"><div class="stat-icon expense">${icon('arrowUp')}</div></div>
      <div class="stat-label">Tổng chi</div>
      <div class="stat-value">${formatVND(expense)}</div>
    </div>`;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  txPage = Math.min(txPage, totalPages);
  const pageItems = filtered.slice((txPage-1)*PAGE_SIZE, txPage*PAGE_SIZE);

  document.getElementById('txBody').innerHTML = pageItems.length ? pageItems.map(t=>{
    const meta = categories[t.categoryId] || { name:'Khác', emoji:'📦', bg:'#eef1f8' };
    return `<tr>
      <td>${formatDateVN(t.date)}</td>
      <td>${t.note}</td>
      <td><span class="cell-cat"><span class="cat-badge" style="background:${meta.bg}">${meta.emoji}</span>${meta.name}</span></td>
      <td>${t.account}</td>
      <td class="${t.type==='income'?'amount-pos':'amount-neg'}">${t.type==='income'?'+':'-'}${formatVND(t.amount)}</td>
      <td><span class="pill ${t.type}">${t.type==='income'?'Thu':'Chi'}</span></td>
      <td>
        <div class="flex gap-8">
          <button class="icon-btn" style="width:32px;height:32px;" onclick="editTx('${t.id}')">${icon('edit')}</button>
          <button class="icon-btn" style="width:32px;height:32px;" onclick="deleteTx('${t.id}')">${icon('trash')}</button>
        </div>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" style="text-align:center;color:var(--ink-400);padding:30px;">Không tìm thấy giao dịch phù hợp.</td></tr>`;

  document.getElementById('pInfo').textContent = filtered.length
    ? `Hiển thị ${(txPage-1)*PAGE_SIZE+1}–${Math.min(txPage*PAGE_SIZE, filtered.length)} trong tổng số ${filtered.length} giao dịch`
    : 'Không có giao dịch';

  const btns = document.getElementById('pBtns');
  let html = `<button class="p-btn" ${txPage===1?'disabled':''} onclick="gotoPage(${txPage-1})">${icon('chevronLeft')}</button>`;
  for(let p=1;p<=totalPages;p++){
    if(totalPages>7 && Math.abs(p-txPage)>2 && p!==1 && p!==totalPages){ if(p===2||p===totalPages-1) html+=`<span style="padding:0 4px;color:var(--ink-300);">…</span>`; continue; }
    html += `<button class="p-btn ${p===txPage?'active':''}" onclick="gotoPage(${p})">${p}</button>`;
  }
  html += `<button class="p-btn" ${txPage===totalPages?'disabled':''} onclick="gotoPage(${txPage+1})">${icon('chevronRight')}</button>`;
  btns.innerHTML = html;
}

function gotoPage(p){ txPage = p; render(); }

async function renderAiPanel(){
  const summaryBox = document.getElementById('aiSummaryText');
  const tipsBox = document.getElementById('aiTipsList');
  const anomalyBox = document.getElementById('anomalyList');
  summaryBox.textContent = 'Đang phân tích…';
  tipsBox.innerHTML = ''; anomalyBox.innerHTML = '';

  try{
    const ai = await Api.aiSummary(currentPeriod.month, currentPeriod.year);
    summaryBox.textContent = ai.summary;
    const tips = [...ai.warnings.map(w=>({icon:'alert',cls:'expense',text:w})), ...ai.suggestions.map(s=>({icon:'bulb',cls:'purple',text:s}))].slice(0,3);
    tipsBox.innerHTML = tips.map(t=>`
      <div class="ai-tip"><div class="ai-tip-icon" style="background:var(--${t.cls}-bg);color:var(--${t.cls});">${icon(t.icon)}</div><p>${t.text}</p></div>
    `).join('') || `<p class="text-muted" style="font-size:12.5px;">Chưa có cảnh báo nào trong kỳ này.</p>`;
  }catch(err){
    summaryBox.textContent = '';
    tipsBox.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Không lấy được phân tích AI: ${err.message}</p>`;
  }
  document.getElementById('aiDisclaimer').innerHTML = icon('shield') + '<span>AI chỉ phân tích trên dữ liệu giao dịch đã ghi nhận, không suy diễn số liệu ngoài hệ thống.</span>';

  try{
    const res = await Api.aiAnomalies(currentPeriod.month, currentPeriod.year);
    const anomalies = res.anomalies || [];
    anomalyBox.innerHTML = anomalies.length ? anomalies.map(a=>`
      <div class="ai-tip">
        <div class="ai-tip-icon" style="background:var(--warn-bg);color:var(--warn);">${a.category_icon || '📦'}</div>
        <p><b>${a.note}</b> — ${formatVND(a.amount)}<br><span style="color:var(--ink-400);font-weight:600;">${a.reason} · ${formatDateVN(a.txn_date)}</span></p>
      </div>`).join('') : `<p class="text-muted" style="font-size:12.5px;">Không phát hiện khoản chi bất thường trong tháng này.</p>`;
  }catch(err){
    anomalyBox.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Không lấy được dữ liệu bất thường: ${err.message}</p>`;
  }
}

function editTx(id){
  const t = allTransactions.find(x=>x.id===id);
  if(!t) return;
  const catOptions = Object.entries(categories).filter(([,c])=>c.type===t.type)
    .map(([cid,c])=>`<option value="${cid}" ${cid===t.categoryId?'selected':''}>${c.emoji} ${c.name}</option>`).join('');

  openModal(`
    <div class="modal-head"><h3>Sửa giao dịch</h3><button class="modal-close" onclick="closeModal()">${icon('plus','rot45')}</button></div>
    <div class="field"><label>Mô tả</label><input class="input" id="editNote" value="${t.note.replace(/"/g,'&quot;')}" /></div>
    <div class="grid grid-2">
      <div class="field"><label>Số tiền</label><input class="input" id="editAmount" type="number" value="${t.amount}" /></div>
      <div class="field"><label>Ngày</label><input class="input" id="editDate" type="date" value="${t.date}" /></div>
    </div>
    <div class="field"><label>Danh mục</label><select class="input" id="editCategory">${catOptions}</select></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" id="saveEditBtn">Lưu thay đổi</button>
    </div>
  `, ()=>{
    document.getElementById('saveEditBtn').addEventListener('click', async ()=>{
      const amount = Number(document.getElementById('editAmount').value);
      if(!amount || amount<=0){ showToast('Số tiền phải lớn hơn 0', 'error'); return; }
      const btn = document.getElementById('saveEditBtn');
      btn.disabled = true;
      try{
        await Api.updateTransaction(id, {
          note: document.getElementById('editNote').value.trim() || t.note,
          amount,
          txn_date: document.getElementById('editDate').value || t.date,
          category_id: Number(document.getElementById('editCategory').value),
        });
        closeModal();
        showToast('Đã cập nhật giao dịch');
        await loadTransactions();
        buildMonthFilterOptions();
        render();
      }catch(err){
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

function deleteTx(id){
  confirmDialog('Xóa giao dịch?', 'Thao tác này sẽ xóa vĩnh viễn giao dịch khỏi hệ thống và cập nhật lại số liệu tổng hợp.', async ()=>{
    try{
      await Api.deleteTransaction(id);
      showToast('Đã xóa giao dịch');
      await loadTransactions();
      buildMonthFilterOptions();
      render();
    }catch(err){ showToast(err.message, 'error'); }
  });
}

function exportCSV(){
  const rows = getFiltered();
  const header = ['Ngày','Mô tả','Danh mục','Tài khoản','Loại','Số tiền'];
  const lines = [header.join(',')].concat(rows.map(t=>{
    const meta = categories[t.categoryId] || { name:'Khác' };
    return [formatDateVN(t.date), `"${t.note}"`, meta.name, t.account, t.type==='income'?'Thu':'Chi', t.amount].join(',');
  }));
  const blob = new Blob(['﻿'+lines.join('\n')], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `giao-dich-${currentPeriod.year}-${currentPeriod.month}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('Đã xuất file CSV');
}
