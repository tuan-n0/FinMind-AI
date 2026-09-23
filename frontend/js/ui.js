/* Tiện ích UI dùng chung: toast thông báo + modal xác nhận/form */
function showToast(message, tone){
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon(tone==='error'?'alert':'checkCircle')}<span>${message}</span>`;
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 2800);
}

function openModal(innerHtml, onMount){
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'activeModal';
  overlay.innerHTML = `<div class="modal-card">${innerHtml}</div>`;
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  if(onMount) onMount(overlay);
}
function closeModal(){
  const m = document.getElementById('activeModal');
  if(m) m.remove();
}
function confirmDialog(title, message, onConfirm){
  openModal(`
    <div class="modal-head"><h3>${title}</h3><button class="modal-close" onclick="closeModal()">${icon('plus')}</button></div>
    <p style="font-size:13px;color:var(--ink-600);font-weight:600;line-height:1.6;">${message}</p>
    <div class="modal-actions mt-20">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" id="confirmYes" style="background:linear-gradient(135deg,#f65c6f,#ff8b6b);box-shadow:none;">Xác nhận</button>
    </div>
  `, (overlay)=>{
    overlay.querySelector('.modal-close').innerHTML = icon('plus', 'rot45');
    document.getElementById('confirmYes').addEventListener('click', ()=>{ onConfirm(); closeModal(); });
  });
}
