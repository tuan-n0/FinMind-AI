let catTab = 'all';
let pageState = null;
const EMOJI_PRESETS = ['🍜','🛵','🛍️','🎮','🧾','💊','📚','📦','💼','🎁','📈','💰','🏠','✈️','🐾','🎓','🧴','🎬','🏋️','🚗'];
const COLOR_PALETTE = ['#f65c6f','#2fb0f8','#8b6df2','#f6a623','#17b3ac','#ec6dab','#5b8def','#16b981'];

document.addEventListener('layout:ready', (e) => {
  pageState = e.detail.state;

  document.getElementById('plusIcon').innerHTML = icon('plus');
  document.getElementById('searchIcon').innerHTML = icon('search');
  document.getElementById('aiIcon').innerHTML = icon('sparkle');

  document.querySelectorAll('#tabBar .tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      document.querySelectorAll('#tabBar .tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active'); catTab = t.dataset.tab; render();
    });
  });
  document.getElementById('catSearch').addEventListener('input', render);

  render();
});

async function refresh(){
  pageState = await getData();
  render();
}

function categorySpend(state, id, type){
  return currentMonthTx(state).filter(t=>t.categoryId===id && t.type===type).reduce((s,t)=>s+t.amount,0);
}

/** Gợi ý gộp các danh mục có tỷ trọng rất nhỏ vào "Khác" — tiện ích client thuần, không cần gọi AI backend. */
function mergeSuggestions(state){
  const cats = groupByCategory(state, 'expense');
  const khacEntry = Object.entries(state.categories).find(([,c])=> c.name === 'Khác' && c.type === 'expense');
  const khacId = khacEntry ? khacEntry[0] : null;
  const small = cats.filter(c => c.percent < 5 && c.categoryId !== khacId);
  if(!small.length || !khacId) return null;
  return {
    candidates: small,
    message: `Phát hiện ${small.length} danh mục có tỷ trọng dưới 5% tổng chi. Gộp vào "Khác" giúp báo cáo gọn và dễ theo dõi hơn.`,
  };
}

function render(){
  const state = pageState;
  const entries = Object.entries(state.categories);
  const expenseCount = entries.filter(([,c])=>c.type==='expense').length;
  const incomeCount = entries.filter(([,c])=>c.type==='income').length;

  document.getElementById('statGrid').innerHTML = `
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon info">${icon('tag')}</div></div><div class="stat-label">Tổng danh mục</div><div class="stat-value">${entries.length}</div></div>
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon expense">${icon('arrowUp')}</div></div><div class="stat-label">Danh mục chi tiêu</div><div class="stat-value">${expenseCount}</div></div>
    <div class="card stat-card"><div class="stat-top"><div class="stat-icon income">${icon('arrowDown')}</div></div><div class="stat-label">Danh mục thu nhập</div><div class="stat-value">${incomeCount}</div></div>
  `;

  const q = document.getElementById('catSearch').value.trim().toLowerCase();
  const filtered = entries.filter(([,c]) => (catTab==='all' || c.type===catTab) && (!q || c.name.toLowerCase().includes(q)));

  const expTotal = currentMonthTx(state).filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const incTotal = currentMonthTx(state).filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);

  function cardHtml(id, c){
    const spend = categorySpend(state, id, c.type);
    const total = c.type === 'expense' ? expTotal : incTotal;
    const percent = pct(spend, total);
    return `
      <div class="category-card">
        <div class="cat-card-top">
          <div class="cat-icon-lg" style="background:${c.bg};">${c.emoji}</div>
          <span class="cat-percent">${total>0 ? percent.toFixed(0)+'%' : '—'}</span>
        </div>
        <div class="cat-name">${c.name}</div>
        <div class="cat-amount" style="color:${c.color}">${formatVND(spend)}</div>
        <div class="cat-actions">
          <button onclick="openCategoryForm('${id}')">${icon('edit')}</button>
          <button class="danger" onclick="deleteCategory('${id}')">${icon('trash')}</button>
        </div>
      </div>`;
  }

  let html = '';
  if(catTab !== 'income'){
    const list = filtered.filter(([,c])=>c.type==='expense');
    if(list.length) html += `<h4 style="font-size:13px;margin:0 0 12px;color:var(--ink-500);">Danh mục chi (${list.length})</h4><div class="grid grid-3">${list.map(([id,c])=>cardHtml(id,c)).join('')}</div>`;
  }
  if(catTab !== 'expense'){
    const list = filtered.filter(([,c])=>c.type==='income');
    if(list.length) html += `<h4 style="font-size:13px;margin:${catTab==='all'?'26px':'0'} 0 12px;color:var(--ink-500);">Danh mục thu (${list.length})</h4><div class="grid grid-3">${list.map(([id,c])=>cardHtml(id,c)).join('')}</div>`;
  }
  document.getElementById('catSections').innerHTML = html || `<p class="text-muted" style="padding:30px;text-align:center;">Không tìm thấy danh mục phù hợp.</p>`;

  const top = groupByCategory(state, 'expense').slice(0,5);
  const max = top[0]?.amount || 1;
  document.getElementById('topCatList').innerHTML = top.map(c=>`
    <div class="mt-12">
      <div class="flex items-center justify-between" style="font-size:12.5px;font-weight:700;margin-bottom:6px;">
        <span>${c.meta.emoji} ${c.meta.name}</span><span class="text-muted">${c.percent.toFixed(0)}%</span>
      </div>
      <div class="progress"><span style="width:${pct(c.amount,max)}%"></span></div>
    </div>`).join('') || `<p class="text-muted" style="font-size:12.5px;">Chưa có dữ liệu chi tiêu.</p>`;

  const merge = mergeSuggestions(state);
  document.getElementById('aiMergeBox').innerHTML = merge ? `
    <div class="ai-tip">
      <div class="ai-tip-icon" style="background:var(--purple-bg);color:var(--purple);">${icon('merge')}</div>
      <p>${merge.message}</p>
    </div>
    <div class="mt-12" style="font-size:12px;font-weight:700;color:var(--ink-500);">${merge.candidates.map(c=>c.meta.name).join(', ')} → <b>Khác</b></div>
    <button class="btn btn-soft w-full mt-12" style="justify-content:center;" onclick='applyMerge(${JSON.stringify(merge.candidates.map(c=>c.categoryId))})'>Hợp nhất thành "Khác"</button>
  ` : `<p class="text-muted" style="font-size:12.5px;">Không phát hiện danh mục nào cần gộp trong tháng này.</p>`;
}

async function applyMerge(ids){
  try{
    let moved = 0;
    for(const id of ids){
      const res = await Api.deleteCategory(id);
      moved += res.affected_transactions || 0;
    }
    showToast(`Đã hợp nhất danh mục vào "Khác" (chuyển ${moved} giao dịch)`);
    await refresh();
  }catch(err){ showToast(err.message, 'error'); }
}

function openCategoryForm(id){
  const state = pageState;
  const existing = id ? state.categories[id] : null;
  let type = existing ? existing.type : 'expense';
  let emoji = existing ? existing.emoji : EMOJI_PRESETS[0];

  openModal(`
    <div class="modal-head"><h3>${existing ? 'Sửa danh mục' : 'Tạo danh mục mới'}</h3><button class="modal-close" onclick="closeModal()">${icon('plus','rot45')}</button></div>
    <div class="field">
      <label>Loại danh mục</label>
      <div class="toggle-row">
        <div class="toggle-opt income ${type==='income'?'active':''}" id="typeIncomeOpt">${icon('arrowDown')}<span>Thu nhập</span></div>
        <div class="toggle-opt expense ${type==='expense'?'active':''}" id="typeExpenseOpt">${icon('arrowUp')}<span>Chi tiêu</span></div>
      </div>
    </div>
    <div class="field"><label>Tên danh mục</label><input class="input" id="catName" value="${existing?existing.name.replace(/"/g,'&quot;'):''}" placeholder="Ví dụ: Nuôi thú cưng" /></div>
    <div class="field">
      <label>Biểu tượng</label>
      <div id="emojiPicker" style="display:flex;flex-wrap:wrap;gap:8px;">
        ${EMOJI_PRESETS.map(e=>`<button type="button" class="emoji-opt" data-e="${e}" style="width:36px;height:36px;border-radius:10px;border:1.5px solid ${e===emoji?'var(--brand-1)':'var(--border)'};background:${e===emoji?'var(--purple-bg)':'#fff'};font-size:16px;cursor:pointer;">${e}</button>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" id="saveCatBtn">${existing?'Lưu thay đổi':'Tạo danh mục'}</button>
    </div>
  `, ()=>{
    document.getElementById('typeIncomeOpt').addEventListener('click', function(){ type='income'; this.classList.add('active'); document.getElementById('typeExpenseOpt').classList.remove('active'); });
    document.getElementById('typeExpenseOpt').addEventListener('click', function(){ type='expense'; this.classList.add('active'); document.getElementById('typeIncomeOpt').classList.remove('active'); });
    document.querySelectorAll('.emoji-opt').forEach(b=> b.addEventListener('click', ()=>{
      emoji = b.dataset.e;
      document.querySelectorAll('.emoji-opt').forEach(x=>{ x.style.borderColor='var(--border)'; x.style.background='#fff'; });
      b.style.borderColor='var(--brand-1)'; b.style.background='var(--purple-bg)';
    }));
    document.getElementById('saveCatBtn').addEventListener('click', async ()=>{
      const name = document.getElementById('catName').value.trim();
      if(!name){ showToast('Vui lòng nhập tên danh mục', 'error'); return; }
      const color = existing ? existing.color : COLOR_PALETTE[Math.floor(Math.random()*COLOR_PALETTE.length)];
      const btn = document.getElementById('saveCatBtn');
      btn.disabled = true;
      try{
        if(existing) await Api.updateCategory(id, { name, type, icon: emoji, color });
        else await Api.createCategory({ name, type, icon: emoji, color });
        closeModal();
        showToast(existing ? 'Đã cập nhật danh mục' : 'Đã tạo danh mục mới');
        await refresh();
      }catch(err){
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

function deleteCategory(id){
  confirmDialog('Xóa danh mục?', 'Nếu danh mục đang gắn với giao dịch nào, các giao dịch đó sẽ tự động được chuyển về danh mục "Khác".', async ()=>{
    try{
      const res = await Api.deleteCategory(id);
      showToast(res.affected_transactions ? `Đã xóa danh mục, chuyển ${res.affected_transactions} giao dịch sang "Khác"` : 'Đã xóa danh mục');
      await refresh();
    }catch(err){ showToast(err.message, 'error'); }
  });
}
