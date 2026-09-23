const KEYWORD_MAP = [
  [/cà phê|coffee|trà sữa|highlands|toco/, 'Ăn uống'],
  [/cơm|ăn|siêu thị|quán|nhà hàng|lẩu|phở|chợ|food|thực phẩm/, 'Ăn uống'],
  [/grab|taxi|xăng|xe|gửi xe|vé xe|bảo dưỡng/, 'Đi lại'],
  [/shopee|tiki|lazada|mua sắm|quần áo|giày|gia dụng/, 'Mua sắm'],
  [/netflix|spotify|phim|karaoke|du lịch|giải trí|game/, 'Giải trí'],
  [/điện|nước|internet|truyền hình|cước|tiền nhà|thuê nhà|gửi xe chung cư/, 'Hóa đơn'],
  [/thuốc|khám|gym|sức khỏe|vitamin|bệnh viện/, 'Sức khỏe'],
  [/khóa học|sách|học phí|chứng chỉ|giáo dục/, 'Giáo dục'],
  [/lương|salary/, 'Lương'],
  [/thưởng|bonus/, 'Thưởng'],
  [/đầu tư|cổ tức|lãi|chứng khoán|dividend/, 'Đầu tư'],
  [/freelance|hoàn tiền|cashback|bán đồ|thu nhập khác/, 'Thu nhập khác'],
];

let currentType = 'income';
let suggestedCategoryId = null;
let pageState = null;

document.addEventListener('layout:ready', (e) => {
  pageState = e.detail.state;

  document.getElementById('aiIcon').innerHTML = icon('sparkle');
  document.getElementById('dzIcon').innerHTML = icon('cloudUp');
  document.getElementById('tipIcon').innerHTML = icon('bulb');
  document.getElementById('incomeIcon').innerHTML = icon('arrowDown');
  document.getElementById('expenseIcon').innerHTML = icon('arrowUp');
  document.getElementById('fDate').value = new Date().toISOString().slice(0,10);

  document.getElementById('fAccount').innerHTML = ACCOUNTS.map(a=>`<option>${a}</option>`).join('');

  document.querySelectorAll('.toggle-opt').forEach(opt=>{
    opt.addEventListener('click', ()=>{
      document.querySelectorAll('.toggle-opt').forEach(o=>o.classList.remove('active'));
      opt.classList.add('active');
      currentType = opt.dataset.type;
      populateCategories();
      renderBudgetWarn();
      renderForecast();
    });
  });

  populateCategories();
  document.getElementById('fCategory').addEventListener('change', ()=>{ renderBudgetWarn(); renderForecast(); });
  document.getElementById('fAmount').addEventListener('input', renderForecast);
  document.getElementById('fNote').addEventListener('input', handleNoteInput);

  document.getElementById('dropZone').addEventListener('click', ()=> document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', (ev)=>{
    const f = ev.target.files[0];
    document.getElementById('fileName').textContent = f ? `Đã chọn: ${f.name}` : '';
  });

  document.getElementById('txForm').addEventListener('submit', onSubmit);

  renderBudgetWarn();
  renderForecast();
  renderAiSuggestPlaceholder();
});

function populateCategories(){
  const sel = document.getElementById('fCategory');
  const opts = Object.entries(pageState.categories).filter(([,c])=>c.type===currentType);
  sel.innerHTML = opts.map(([id,c])=>`<option value="${id}">${c.emoji} ${c.name}</option>`).join('');
}

function findCategoryIdByName(name, type){
  const found = Object.entries(pageState.categories).find(([,c])=> c.name === name && c.type === type);
  return found ? found[0] : null;
}

function handleNoteInput(){
  const note = document.getElementById('fNote').value.toLowerCase();
  const match = KEYWORD_MAP.find(([re]) => re.test(note));
  const catId = match ? findCategoryIdByName(match[1], currentType) : null;
  if(catId){
    suggestedCategoryId = catId;
    const meta = pageState.categories[catId];
    document.getElementById('aiSuggestBox').innerHTML = `
      <div class="ai-tip">
        <div class="ai-tip-icon" style="background:${meta.bg};color:${meta.color};">${meta.emoji}</div>
        <p>AI nhận thấy giao dịch này có thể thuộc danh mục <b>${meta.name}</b>.
        <a href="#" onclick="applySuggestion();return false;">Dùng gợi ý này →</a></p>
      </div>`;
  } else {
    renderAiSuggestPlaceholder();
  }
}
function applySuggestion(){
  if(!suggestedCategoryId) return;
  document.getElementById('fCategory').value = suggestedCategoryId;
  renderBudgetWarn(); renderForecast();
  showToast('Đã áp dụng gợi ý danh mục từ AI');
}
function renderAiSuggestPlaceholder(){
  document.getElementById('aiSuggestBox').innerHTML = `
    <div class="ai-tip">
      <div class="ai-tip-icon" style="background:var(--info-bg);color:var(--info);">${icon('sparkle')}</div>
      <p>Nhập mô tả giao dịch (ví dụ "Cà phê Highlands"), AI sẽ tự gợi ý danh mục phù hợp.</p>
    </div>`;
}

function renderBudgetWarn(){
  const box = document.getElementById('budgetWarnBox');
  if(currentType !== 'expense'){
    box.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Giao dịch thu nhập không áp dụng ngân sách.</p>`;
    return;
  }
  const catId = document.getElementById('fCategory').value;
  const budgets = budgetProgress(pageState);
  const b = budgets.find(x=>x.categoryId===catId);
  if(!b){ box.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Danh mục này chưa được thiết lập ngân sách.</p>`; return; }
  box.innerHTML = `
    <div class="flex items-center justify-between" style="font-size:12.5px;font-weight:700;margin-bottom:8px;">
      <span>${b.meta.emoji} ${b.meta.name}</span>
      <span class="text-muted">${formatVND(b.spent)} / ${formatVND(b.limit)}</span>
    </div>
    <div class="progress ${b.status==='danger'?'danger':b.status==='warn'?'warn':'ok'}"><span style="width:${clampPct(b.usedPct)}%"></span></div>
    <p style="font-size:11.5px;color:var(--ink-500);font-weight:600;margin-top:8px;">Đã dùng ${b.usedPct.toFixed(0)}% ngân sách tháng này.${b.status!=='ok' ? ' Thêm giao dịch mới có thể khiến bạn vượt hạn mức.' : ''}</p>
  `;
}

function renderForecast(){
  const box = document.getElementById('forecastBox');
  const amount = Number(document.getElementById('fAmount').value) || 0;
  if(currentType !== 'expense'){
    box.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Dự báo tác động chỉ áp dụng cho giao dịch chi tiêu.</p>`;
    return;
  }
  const catId = document.getElementById('fCategory').value;
  const b = budgetProgress(pageState).find(x=>x.categoryId===catId);
  if(!b){ box.innerHTML = ''; return; }
  const after = b.spent + amount;
  const afterPct = pct(after, b.limit);
  box.innerHTML = `
    <p style="font-size:12.5px;color:var(--ink-600);font-weight:600;">Sau giao dịch này, ngân sách "${b.meta.name}" sẽ đạt
      <b style="color:${afterPct>100?'var(--expense)':'var(--ink-900)'}">${afterPct.toFixed(0)}%</b>.</p>
    <div class="flex justify-between mt-8" style="font-size:11.5px;font-weight:700;color:var(--ink-500);">
      <span>Trước: ${formatVND(b.spent)}</span><span>Sau: ${formatVND(after)}</span>
    </div>
    ${afterPct>100 ? `<div class="ai-tip mt-12"><div class="ai-tip-icon" style="background:var(--expense-bg);color:var(--expense);">${icon('alert')}</div><p>Giao dịch này sẽ khiến bạn vượt ngân sách ${formatVND(after-b.limit)}.</p></div>` : ''}
  `;
}

async function onSubmit(e){
  e.preventDefault();
  const amount = Number(document.getElementById('fAmount').value);
  const date = document.getElementById('fDate').value;
  const categoryId = document.getElementById('fCategory').value;
  const note = document.getElementById('fNote').value.trim();
  const account = document.getElementById('fAccount').value;

  if(!amount || amount <= 0){ showToast('Số tiền phải lớn hơn 0', 'error'); return; }
  if(!date){ showToast('Vui lòng chọn ngày giao dịch', 'error'); return; }
  if(!categoryId){ showToast('Vui lòng chọn danh mục', 'error'); return; }
  if(!note){ showToast('Vui lòng nhập mô tả giao dịch', 'error'); return; }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try{
    await Api.createTransaction({ category_id: Number(categoryId), amount, type: currentType, txn_date: date, note, account });
    showToast('Đã lưu giao dịch thành công');
    setTimeout(()=> window.location.href = 'transactions.html', 500);
  }catch(err){
    showToast(err.message, 'error');
    submitBtn.disabled = false;
  }
}
