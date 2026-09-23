/* =========================================================
   FinMind AI — Sidebar & Topbar dùng chung cho mọi trang
   Mỗi trang chỉ cần: <body data-page="dashboard" data-title="..." data-subtitle="...">
   và 2 khung rỗng #sidebar / #topbar để layout.js render vào.
   ========================================================= */

const NAV_ITEMS = [
  { section: 'Quản lý' },
  { key:'dashboard',   href:'dashboard.html',    icon:'home',  label:'Tổng quan' },
  { key:'transactions',href:'transactions.html', icon:'swap',  label:'Giao dịch' },
  { key:'categories',  href:'categories.html',   icon:'tag',   label:'Danh mục' },
  { key:'budget',      href:'budget.html',       icon:'wallet',label:'Ngân sách' },
  { key:'goals',       href:'goals.html',        icon:'target',label:'Mục tiêu tiết kiệm' },
  { key:'reports',     href:'reports.html',      icon:'chart', label:'Báo cáo' },
  { section: 'Trợ lý AI' },
  { key:'ai-analysis', href:'ai-analysis.html',  icon:'sparkle', label:'AI phân tích', badge:'AI' },
  { key:'ai-chat',     href:'ai-chat.html',      icon:'chat',    label:'AI Chat', badge:'AI' },
  { section: 'Cá nhân' },
  { key:'account',     href:'account.html',      icon:'user',     label:'Tài khoản' },
  { key:'settings',    href:'settings.html',     icon:'settings', label:'Cài đặt' },
];

function renderSidebar(state, activeKey){
  const el = document.getElementById('sidebar');
  if(!el) return;
  const collapsed = localStorage.getItem('finmind_sidebar_collapsed') === '1';
  if(collapsed) el.classList.add('collapsed');

  const topBudget = budgetProgress(state)[0];
  const ctaText = topBudget
    ? (topBudget.status === 'danger'
        ? `Bạn đã vượt ngân sách "${topBudget.meta.name}" ${topBudget.usedPct.toFixed(0)}%. Xem gợi ý điều chỉnh ngay.`
        : `Bạn đã dùng ${topBudget.usedPct.toFixed(0)}% ngân sách "${topBudget.meta.name}". Xem phân tích chi tiết.`)
    : 'Thêm giao dịch để AI bắt đầu phân tích thói quen chi tiêu của bạn.';

  let navHtml = '';
  NAV_ITEMS.forEach(item=>{
    if(item.section){ navHtml += `<div class="nav-section-title">${item.section}</div>`; return; }
    navHtml += `<a class="nav-item ${item.key===activeKey?'active':''}" href="${item.href}">
      ${icon(item.icon)}<span class="nav-label">${item.label}</span>
      ${item.badge ? `<span class="nav-badge ai">${item.badge}</span>` : ''}
    </a>`;
  });

  el.innerHTML = `
    <div class="sidebar-top">
      <div class="brand">
        <div class="brand-mark">${icon('logoMark')}</div>
        <div class="brand-text"><b>FinMind AI</b><span>Chi tiêu &amp; tiết kiệm</span></div>
      </div>
      <button class="sidebar-toggle" id="sidebarToggle" title="Thu gọn menu">${icon('doubleChevronLeft')}</button>
    </div>
    <div class="nav-scroll">${navHtml}</div>
    <div class="sidebar-cta">
      <h4>✨ Đề xuất từ AI</h4>
      <p>${ctaText}</p>
      <button onclick="location.href='ai-analysis.html'">Xem phân tích</button>
    </div>
    <div class="sidebar-foot">
      <div class="sidebar-user" onclick="location.href='account.html'">
        <div class="avatar">${state.user.initials}</div>
        <div>
          <div class="u-name">${state.user.name}</div>
          <div class="u-role">${state.user.role || 'Chủ tài khoản'}</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('sidebarToggle').addEventListener('click', ()=>{
    el.classList.toggle('collapsed');
    localStorage.setItem('finmind_sidebar_collapsed', el.classList.contains('collapsed') ? '1':'0');
  });
}

function renderTopbar(state, title, subtitle){
  const el = document.getElementById('topbar');
  if(!el) return;
  const periods = availablePeriods(state);
  const currentValue = `${state.period.year}-${String(state.period.month).padStart(2,'0')}`;

  el.innerHTML = `
    <div class="topbar-title">
      <h1>${title}</h1>
      ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
    </div>
    <div class="topbar-spacer"></div>
    <div class="search-box">
      ${icon('search')}<input type="text" placeholder="Tìm giao dịch, danh mục…" />
    </div>
    <label class="period-select-wrap" title="Chọn kỳ xem dữ liệu">
      ${icon('calendar')}
      <select id="periodSelect">
        ${periods.map(p=>`<option value="${p.value}" ${p.value===currentValue?'selected':''}>${p.label}</option>`).join('')}
      </select>
      ${icon('chevronDown')}
    </label>
    <button class="icon-btn" title="Thông báo">${icon('bell')}<span class="dot-badge">3</span></button>
    <div class="topbar-user" onclick="location.href='account.html'">
      <div class="avatar">${state.user.initials}</div>
      <div class="topbar-user-info"><b>${state.user.name}</b><span>${state.user.role || 'Chủ tài khoản'}</span></div>
      ${icon('chevronDown')}
    </div>
  `;

  const periodSelect = document.getElementById('periodSelect');
  if(periodSelect){
    periodSelect.addEventListener('change', (e)=>{
      const [y,m] = e.target.value.split('-').map(Number);
      setPeriod(y, m);
      location.reload();
    });
  }
}

function renderLayoutError(message){
  const content = document.querySelector('.content') || document.body;
  content.innerHTML = `
    <div class="card card-pad" style="max-width:560px;margin:60px auto;text-align:center;">
      <div class="stat-icon expense" style="margin:0 auto 16px;">${icon('alert')}</div>
      <h3 style="margin-bottom:8px;">Không tải được dữ liệu</h3>
      <p style="color:var(--ink-500);font-weight:600;font-size:13px;line-height:1.6;">${message}</p>
      <button class="btn btn-primary mt-20" onclick="location.reload()">Thử lại</button>
    </div>`;
}

async function initLayout(){
  const body = document.body;
  const page = body.dataset.page || '';
  if(!page) return;

  if(!Api.isLoggedIn()){
    window.location.href = 'index.html';
    return;
  }

  const title = body.dataset.title || '';
  const subtitle = body.dataset.subtitle || '';

  try{
    const state = await getData();
    renderSidebar(state, page);
    renderTopbar(state, title, subtitle);
    document.dispatchEvent(new CustomEvent('layout:ready', { detail: { state } }));
  }catch(err){
    renderLayoutError(err.message || 'Có lỗi không xác định khi tải dữ liệu.');
  }
}

document.addEventListener('DOMContentLoaded', initLayout);
