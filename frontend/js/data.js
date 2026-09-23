/* =========================================================
   FinMind AI — Lắp ráp dữ liệu từ API backend thật (SQLite)
   Các hàm tính toán (computeTotals, groupByCategory, ...) được
   GIỮ NGUYÊN không đổi — chúng chỉ đọc từ đối tượng `state` đã
   lắp ráp sẵn, nên không quan trọng dữ liệu tới từ đâu.
   ========================================================= */

const ACCOUNTS = ['Vietcombank', 'Momo', 'Tiền mặt', 'Thẻ tín dụng'];
const VIEW_PERIOD_KEY = 'finmind_view_period';

function computeInitials(nameOrEmail){
  const base = (nameOrEmail || '').split('@')[0].trim();
  const parts = base.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0][0], parts[parts.length-1][0]] : [base[0] || '?'];
  return letters.join('').toUpperCase();
}

function softBg(hex){
  if(!hex || hex[0] !== '#') return '#eef1f8';
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  if([r,g,b].some(Number.isNaN)) return '#eef1f8';
  return `rgba(${r},${g},${b},.12)`;
}

/* ---- Ánh xạ dữ liệu backend (snake_case, id số) sang hình dạng frontend đang dùng ---- */
function mapCategory(c){
  return { name: c.name, type: c.type, emoji: c.icon || '📦', color: c.color || '#8891ad', bg: softBg(c.color) };
}
function mapTransaction(t){
  return { id: String(t.id), date: t.txn_date, type: t.type, categoryId: String(t.category_id), amount: t.amount, note: t.note || '', account: t.account || '' };
}
function mapBudget(b){
  return { id: String(b.id), categoryId: String(b.category_id), limit: b.limit_amount };
}
function mapGoal(g){
  return {
    id: String(g.id), name: g.name, emoji: g.emoji || '🎯', note: g.note || '',
    target: g.target_amount, saved: g.saved_amount, deadline: g.deadline,
    priority: g.priority || 'Trung bình', createdAt: (g.created_at || '').slice(0,10),
  };
}

/* ---- Kỳ đang xem (year/month) — chỉ là lựa chọn hiển thị phía client, không lưu ở backend ---- */
function getViewPeriod(){
  try{ return JSON.parse(localStorage.getItem(VIEW_PERIOD_KEY)); }catch(e){ return null; }
}
function setPeriod(year, month){
  localStorage.setItem(VIEW_PERIOD_KEY, JSON.stringify({ year, month }));
}
function clearViewPeriod(){ localStorage.removeItem(VIEW_PERIOD_KEY); }

/** Danh sách các kỳ có thể chọn ở bộ chọn kỳ trên topbar, mới nhất trước.
    Luôn gồm 12 tháng gần nhất tính từ hôm nay (kể cả tháng chưa có giao dịch nào,
    để người dùng xem lại lịch sử trống hoặc bắt đầu ghi nhận cho tháng cũ), cộng
    thêm mọi tháng THẬT SỰ có giao dịch (từ chuỗi xu hướng thật) nằm ngoài phạm vi đó. */
function availablePeriods(state){
  const seen = new Set();
  const list = [];
  const addMonth = (year, month) => {
    const value = `${year}-${String(month).padStart(2,'0')}`;
    if(seen.has(value)) return;
    seen.add(value);
    list.push({ year, month, value, label: `Tháng ${month}/${year}` });
  };

  const today = new Date();
  for(let i = 0; i < 12; i++){
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    addMonth(d.getFullYear(), d.getMonth() + 1);
  }
  (state.trend.series || []).forEach(s => addMonth(s.year, s.month));

  return list.sort((a, b) => (b.year - a.year) || (b.month - a.month));
}

/** Tải toàn bộ dữ liệu cần thiết cho một lượt hiển thị trang, từ backend thật qua JWT hiện có.
    Gọi tuần tự (không Promise.all) để tránh dồn quá nhiều kết nối cùng lúc vào
    máy chủ dev uvicorn trên Windows — từng gặp lỗi kết nối chập chờn khi bắn
    5-6 request song song ngay khi tải trang. */
async function getData(){
  const me = await Api.me();
  const trend = await Api.reportTrend();
  const series = trend.series || [];

  let period = getViewPeriod();
  if(!period){
    if(series.length){ const last = series[series.length-1]; period = { year: last.year, month: last.month }; }
    else{ const now = new Date(); period = { year: now.getFullYear(), month: now.getMonth()+1 }; }
  }

  const categoriesRaw = await Api.listCategories();
  const transactionsRaw = await Api.listTransactions({ year: period.year, month: period.month });
  const budgetsRaw = await Api.listBudgets(period.month, period.year);
  const goalsRaw = await Api.listGoals();

  const categories = {};
  categoriesRaw.forEach(c => { categories[String(c.id)] = mapCategory(c); });

  return {
    user: {
      name: me.full_name || me.email.split('@')[0],
      role: 'Chủ tài khoản',
      email: me.email,
      initials: computeInitials(me.full_name || me.email),
    },
    period: { year: period.year, month: period.month, label: `Tháng ${period.month}/${period.year}` },
    categories,
    transactions: transactionsRaw.map(mapTransaction),
    budgets: budgetsRaw.map(mapBudget),
    goals: goalsRaw.map(mapGoal),
    trend: {
      series,
      months: series.map(s => `T${s.month}/${String(s.year).slice(2)}`),
      income: series.map(s => s.income),
      expense: series.map(s => s.expense),
    },
  };
}

/* =========================================================
   HÀM TIỆN ÍCH ĐỊNH DẠNG & TÍNH TOÁN
   (không đổi so với bản trước — chỉ đọc từ `state` đã lắp ráp)
   ========================================================= */
function formatVND(n){
  const v = Math.round(n || 0);
  return v.toLocaleString('vi-VN') + ' đ';
}
function formatCompact(n){
  const v = n || 0;
  if(Math.abs(v) >= 1000000) return (v/1000000).toFixed(v % 1000000 === 0 ? 0 : 1).replace('.0','') + 'M';
  if(Math.abs(v) >= 1000) return Math.round(v/1000) + 'K';
  return String(v);
}
function formatDateVN(iso){
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function pct(part, whole){ return whole > 0 ? (part/whole*100) : 0; }
function clampPct(p){ return Math.max(0, Math.min(100, p)); }

function catMeta(state, id){
  return state.categories[id] || { name:'Khác', type:'expense', emoji:'📦', color:'#8891ad', bg:'#eef1f8' };
}

function currentMonthTx(state){
  const { year, month } = state.period;
  const mm = String(month).padStart(2,'0');
  return state.transactions.filter(t => t.date.startsWith(`${year}-${mm}`));
}

function computeTotals(state){
  const list = currentMonthTx(state);
  const income = list.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = list.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const balance = income - expense;
  const savingsRate = income > 0 ? (balance/income*100) : 0;
  return { income, expense, balance, savingsRate, count: list.length };
}

function groupByCategory(state, type){
  const list = currentMonthTx(state).filter(t=>t.type===type);
  const map = {};
  list.forEach(t=>{ map[t.categoryId] = (map[t.categoryId]||0) + t.amount; });
  const total = Object.values(map).reduce((a,b)=>a+b,0);
  return Object.entries(map)
    .map(([categoryId, amount])=>({
      categoryId, amount,
      percent: pct(amount, total),
      meta: state.categories[categoryId] || { name:'Khác', emoji:'📦', color:'#8891ad', bg:'#eef1f8' },
    }))
    .sort((a,b)=>b.amount-a.amount);
}

function budgetProgress(state){
  const spentMap = {};
  groupByCategory(state,'expense').forEach(c=>{ spentMap[c.categoryId] = c.amount; });
  return state.budgets.map(b=>{
    const spent = spentMap[b.categoryId] || 0;
    const usedPct = pct(spent, b.limit);
    let status = 'ok';
    if(usedPct >= 100) status = 'danger';
    else if(usedPct >= 85) status = 'warn';
    return {
      categoryId: b.categoryId, budgetId: b.id, limit: b.limit, spent, usedPct, status,
      remaining: b.limit - spent,
      meta: catMeta(state, b.categoryId),
    };
  }).sort((a,b)=>b.usedPct-a.usedPct);
}

function goalsWithProgress(state){
  return state.goals.map(g=>({
    ...g,
    percent: clampPct(pct(g.saved, g.target)),
    remaining: Math.max(0, g.target - g.saved),
    daysLeft: Math.max(0, Math.ceil((new Date(g.deadline) - new Date(state.period.year, state.period.month-1, 15)) / 86400000)),
  }));
}

function topExpenses(state, n){
  return currentMonthTx(state)
    .filter(t=>t.type==='expense')
    .sort((a,b)=>b.amount-a.amount)
    .slice(0, n||5);
}

function monthOverMonthDelta(state){
  // so sánh gần đúng với tháng liền trước dựa trên chuỗi xu hướng thật từ backend
  const { income, expense } = state.trend;
  const i2 = income[income.length-1], i1 = income[income.length-2];
  const e2 = expense[expense.length-1], e1 = expense[expense.length-2];
  return {
    incomeDelta: i1 ? pct(i2-i1, i1) : 0,
    expenseDelta: e1 ? pct(e2-e1, e1) : 0,
  };
}
