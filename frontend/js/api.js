/* =========================================================
   FinMind AI — Lớp gọi API tới backend FastAPI thật (không còn localStorage giả lập)
   ========================================================= */
const API_BASE = 'http://localhost:8000/api';

const Api = {
  token(){ return localStorage.getItem('finmind_token'); },
  setToken(t){ localStorage.setItem('finmind_token', t); },
  clearToken(){ localStorage.removeItem('finmind_token'); },
  isLoggedIn(){ return !!this.token(); },

  async request(path, opts){
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = this.token();
    if(token) headers['Authorization'] = 'Bearer ' + token;

    // Máy chủ dev (uvicorn) đôi khi từ chối kết nối thoáng qua khi nhận nhiều
    // request cùng lúc ngay sau khi khởi động — thử lại 1 lần trước khi báo lỗi
    // cho người dùng, thay vì để cả trang tải thất bại vì một lỗi mạng tạm thời.
    let res;
    const MAX_ATTEMPTS = 5;
    for(let attempt = 0; attempt < MAX_ATTEMPTS; attempt++){
      try{
        res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
        break;
      }catch(e){
        if(attempt === MAX_ATTEMPTS - 1){
          throw new Error('Không thể kết nối tới máy chủ backend (http://localhost:8000). Hãy chắc chắn bạn đã chạy "start.bat" trong thư mục backend.');
        }
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      }
    }

    if(res.status === 401){
      this.clearToken();
      if(!location.pathname.endsWith('index.html') && location.pathname !== '/'){
        window.location.href = 'index.html';
      }
      throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    }

    if(!res.ok){
      let msg = `Lỗi ${res.status}`;
      try{
        const data = await res.json();
        if(Array.isArray(data.detail)) msg = data.detail.map(d=>d.msg).join(', ');
        else if(data.detail) msg = data.detail;
      }catch(e){}
      throw new Error(msg);
    }
    if(res.status === 204) return null;
    return res.json();
  },

  get(path){ return this.request(path); },
  post(path, body){ return this.request(path, { method:'POST', body: JSON.stringify(body) }); },
  patch(path, body){ return this.request(path, { method:'PATCH', body: JSON.stringify(body) }); },
  del(path){ return this.request(path, { method:'DELETE' }); },

  // ---- Auth ----
  login(email, password){ return this.post('/auth/login', { email, password }); },
  register(email, password, full_name){ return this.post('/auth/register', { email, password, full_name }); },
  me(){ return this.get('/auth/me'); },
  updateMe(data){ return this.patch('/auth/me', data); },
  changePassword(current_password, new_password){ return this.post('/auth/change-password', { current_password, new_password }); },

  // ---- Categories ----
  listCategories(type){ return this.get('/categories' + (type ? `?type=${type}` : '')); },
  createCategory(data){ return this.post('/categories', data); },
  updateCategory(id, data){ return this.patch(`/categories/${id}`, data); },
  deleteCategory(id){ return this.del(`/categories/${id}`); },

  // ---- Transactions ----
  listTransactions(params){
    const qs = new URLSearchParams(Object.entries(params||{}).filter(([,v])=>v!==undefined && v!==null && v!=='')).toString();
    return this.get('/transactions' + (qs ? '?'+qs : ''));
  },
  createTransaction(data){ return this.post('/transactions', data); },
  updateTransaction(id, data){ return this.patch(`/transactions/${id}`, data); },
  deleteTransaction(id){ return this.del(`/transactions/${id}`); },

  // ---- Budgets ----
  listBudgets(month, year){ return this.get(`/budgets?month=${month}&year=${year}`); },
  upsertBudget(data){ return this.post('/budgets', data); },
  deleteBudget(id){ return this.del(`/budgets/${id}`); },

  // ---- Goals ----
  listGoals(){ return this.get('/goals'); },
  createGoal(data){ return this.post('/goals', data); },
  updateGoal(id, data){ return this.patch(`/goals/${id}`, data); },
  deleteGoal(id){ return this.del(`/goals/${id}`); },

  // ---- Reports ----
  reportSummary(month, year){ return this.get(`/reports/summary?month=${month}&year=${year}`); },
  reportTrend(){ return this.get('/reports/trend'); },

  // ---- AI ----
  aiSummary(month, year){ return this.get(`/ai/summary?month=${month}&year=${year}`); },
  aiBudgetSuggest(month, year){ return this.get(`/ai/budget-suggest?month=${month}&year=${year}`); },
  aiTrend(month, year){ return this.get(`/ai/trend?month=${month}&year=${year}`); },
  aiAnomalies(month, year){ return this.get(`/ai/anomalies?month=${month}&year=${year}`); },
  aiQa(question, month, year){ return this.post(`/ai/qa?month=${month}&year=${year}`, { question }); },
  aiLogs(){ return this.get('/ai/logs'); },
};
