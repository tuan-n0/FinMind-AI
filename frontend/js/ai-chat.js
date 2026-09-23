let activeConvId = null;
let pageState = null;
let conversations = [];

document.addEventListener('layout:ready', (e) => {
  pageState = e.detail.state;

  document.getElementById('newConvBtn').innerHTML = icon('plus');
  document.getElementById('attachBtn').innerHTML = icon('paperclip');
  document.getElementById('sendBtn').innerHTML = icon('send');
  document.getElementById('tipIcon').innerHTML = icon('bulb');
  document.getElementById('clearBtn').addEventListener('click', clearActiveConversation);
  document.getElementById('newConvBtn').addEventListener('click', ()=> createConversation(true));
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('chatInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') sendMessage(); });

  conversations = loadConversations();
  ensureConversations();
  activeConvId = conversations[0].id;

  renderSidebarPanels();
  renderConvList();
  renderMessages();
  renderQuickPrompts();

  const params = new URLSearchParams(location.search);
  const q = params.get('q');
  if(q){ document.getElementById('chatInput').value = q; sendMessage(); }
});

function chatStorageKey(){ return `finmind_chat_${pageState.user.email}`; }
function loadConversations(){
  try{ return JSON.parse(localStorage.getItem(chatStorageKey())) || []; }
  catch(e){ return []; }
}
function saveConversations(){ localStorage.setItem(chatStorageKey(), JSON.stringify(conversations)); }

function ensureConversations(){
  if(!conversations.length){
    conversations = [{
      id: 'conv_' + Date.now(),
      title: 'Phân tích chi tiêu tháng này',
      messages: [{ role:'ai', text:`Xin chào ${pageState.user.name.split(' ').slice(-1)[0]}! Tôi có thể giúp bạn phân tích chi tiêu, ngân sách và mục tiêu tiết kiệm dựa trên dữ liệu thật của bạn. Bạn muốn hỏi gì?` }],
    }];
    saveConversations();
  }
}

function createConversation(switchTo){
  const conv = { id:'conv_'+Date.now(), title:'Cuộc trò chuyện mới', messages:[{ role:'ai', text:'Xin chào! Bạn muốn hỏi gì về tình hình tài chính của mình?' }] };
  conversations.unshift(conv);
  saveConversations();
  if(switchTo) activeConvId = conv.id;
  renderConvList();
  renderMessages();
}

function getActiveConv(){ return conversations.find(c=>c.id===activeConvId) || conversations[0]; }

function renderConvList(){
  document.getElementById('chatList').innerHTML = conversations.map(c=>{
    const last = c.messages[c.messages.length-1];
    return `<div class="chat-list-item ${c.id===activeConvId?'active':''}" onclick="switchConv('${c.id}')">
      <b>${c.title}</b>
      <p>${(last?.text||'').slice(0,46)}${(last?.text||'').length>46?'…':''}</p>
    </div>`;
  }).join('');
}

function switchConv(id){
  activeConvId = id;
  renderConvList();
  renderMessages();
}

function renderMessages(){
  const conv = getActiveConv();
  const box = document.getElementById('chatMessages');
  box.innerHTML = conv.messages.map((m,i)=>{
    if(m.role === 'user'){
      return `<div class="msg me"><div class="msg-avatar me">${pageState.user.initials}</div><div><div class="msg-bubble">${escapeHtml(m.text)}</div></div></div>`;
    }
    const chartId = m.chart ? `chart_${conv.id}_${i}` : null;
    return `<div class="msg ai">
      <div class="msg-avatar ai">${icon('sparkle')}</div>
      <div>
        <div class="msg-bubble">${escapeHtml(m.text)}</div>
        ${m.chart ? `<div class="msg-rich mt-8"><div class="chart-box" style="height:170px;"><canvas id="${chartId}"></canvas></div></div>` : ''}
      </div>
    </div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;

  conv.messages.forEach((m,i)=>{
    if(m.chart){
      const chartId = `chart_${conv.id}_${i}`;
      const el = document.getElementById(chartId);
      if(el && m.chart.type==='donut'){
        const cats = m.chart.data;
        new Chart(el, {
          type:'doughnut',
          data:{
            labels: cats.map(c=>c.name),
            datasets:[{ data: cats.map(c=>c.amount), backgroundColor: cats.map(c=> (pageState.categories[String(c.category_id)]||{}).color || '#8891ad'), borderWidth:0 }],
          },
          options:{ cutout:'62%', plugins:{ legend:{ position:'right', labels:{ boxWidth:8, font:{size:10.5,weight:'700'} } }, tooltip:{ callbacks:{ label:(ctx)=>`${ctx.label}: ${formatVND(ctx.raw)}` } } } }
        });
      }
    }
  });
}

function renderQuickPrompts(){
  const prompts = ['Tháng này tôi chi nhiều nhất vào đâu?','So sánh với tháng trước','Tôi đã tiết kiệm được bao nhiêu?','Ngân sách có bị vượt không?','Lập kế hoạch tháng tới'];
  document.getElementById('quickPrompts').innerHTML = prompts.map(p=>`<button onclick="askQuick('${p.replace(/'/g,"\\'")}')">${p}</button>`).join('');
}
function askQuick(text){ document.getElementById('chatInput').value = text; sendMessage(); }

async function sendMessage(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text) return;
  const conv = getActiveConv();
  conv.messages.push({ role:'user', text });
  if(conv.title === 'Cuộc trò chuyện mới') conv.title = text.slice(0,32);
  input.value = '';
  input.disabled = true;
  renderConvList();
  renderMessages();

  try{
    const result = await Api.aiQa(text, pageState.period.month, pageState.period.year);
    conv.messages.push({ role:'ai', text: result.text, chart: (result.data && result.data.categories) ? { type:'donut', data: result.data.categories } : null });
  }catch(err){
    conv.messages.push({ role:'ai', text: `Xin lỗi, tôi gặp lỗi khi phân tích: ${err.message}` });
  }
  saveConversations();
  input.disabled = false;
  input.focus();
  renderConvList();
  renderMessages();
}

function clearActiveConversation(){
  confirmDialog('Xóa cuộc trò chuyện?', 'Toàn bộ tin nhắn trong cuộc trò chuyện này sẽ bị xóa.', ()=>{
    const conv = getActiveConv();
    conv.messages = [{ role:'ai', text:'Cuộc trò chuyện đã được làm mới. Bạn muốn hỏi gì?' }];
    conv.title = 'Cuộc trò chuyện mới';
    saveConversations();
    renderConvList();
    renderMessages();
    showToast('Đã xóa cuộc trò chuyện');
  });
}

function renderSidebarPanels(){
  const state = pageState;
  const totals = computeTotals(state);
  document.getElementById('contextStats').innerHTML = `
    <div class="mini-stat"><div class="stat-icon info">${icon('calendar')}</div><div style="flex:1;"><div class="ms-label">Khoảng thời gian</div><div class="ms-value" style="font-size:12.5px;">${state.period.label}</div></div></div>
    <div class="mini-stat"><div class="stat-icon expense">${icon('arrowUp')}</div><div style="flex:1;"><div class="ms-label">Tổng chi tiêu</div><div class="ms-value">${formatVND(totals.expense)}</div></div></div>
    <div class="mini-stat"><div class="stat-icon teal">${icon('swap')}</div><div style="flex:1;"><div class="ms-label">Số giao dịch</div><div class="ms-value">${totals.count} giao dịch</div></div></div>
  `;
  const top = groupByCategory(state,'expense').slice(0,3);
  document.getElementById('topCats').innerHTML = top.map(c=>`
    <div class="mini-stat"><div class="stat-icon" style="background:${c.meta.bg};color:${c.meta.color};">${c.meta.emoji}</div><div style="flex:1;"><div class="ms-label">${c.meta.name}</div></div><span class="pill neutral">${c.percent.toFixed(0)}%</span></div>
  `).join('') || `<p class="text-muted" style="font-size:12px;">Chưa có dữ liệu.</p>`;

  const tips = [
    'Bạn có thể hỏi AI những câu cụ thể như "Tháng này tôi chi nhiều nhất vào đâu?" để nhận câu trả lời tức thì.',
    'Thử hỏi "Ngân sách có bị vượt không?" để AI rà soát nhanh các danh mục sắp vượt hạn mức.',
    'Hỏi "Lập kế hoạch tháng tới" để nhận dự báo chi tiêu dựa trên xu hướng gần đây.',
  ];
  document.getElementById('tipText').textContent = tips[Math.floor(new Date(state.period.year, state.period.month-1).getTime()/86400000) % tips.length];
}

function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
