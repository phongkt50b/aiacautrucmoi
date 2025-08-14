
/**
 * logic.safe.js — lớp vá "không xâm lấn"
 * - Không tạo global $, $$; chỉ dùng biến cục bộ
 * - Không sửa đổi/g GHI ĐÈ các hàm đang có; chỉ hậu xử lý DOM
 * - Mục tiêu: giữ nhãn nút "Xem từng người", cộng MDP3 vào tổng từng người,
 *   dọn khối "Kỳ đóng phí", và hậu xử lý báo cáo.
 */
(function(){
  'use strict';
  const q  = (sel, root=document) => root.querySelector(sel);
  const qa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const num = (t) => {
    if (t == null) return 0;
    const s = (typeof t === 'number') ? String(t) : String(t);
    const m = s.replace(/[^\d\-]/g,'');
    const v = parseInt(m,10);
    return isNaN(v) ? 0 : v;
  };
  const fmt = (n) => (Number(n)||0).toLocaleString('vi-VN');

  // ===== 1) Giữ nhãn nút "Xem từng người" cố định + toggle list =====
  function lockToggleButton(){
    const btn  = q('#toggle-supp-list-btn');
    const list = q('#supp-insured-summaries');
    if (!btn || !list) return;

    // Tránh đổi label do code khác
    let internalSet = false;
    const FIXED = 'Xem từng người';
    const mo = new MutationObserver(muts => {
      if (internalSet) return;
      const cur = (btn.textContent||'').trim();
      if (cur !== FIXED) {
        internalSet = true;
        btn.textContent = FIXED;
        requestAnimationFrame(()=>{ internalSet = false; });
      }
    });
    mo.observe(btn, {childList:true, characterData:true, subtree:true});

    // Bỏ tất cả listener cũ bằng cloneNode (NHƯNG không thay đổi id/class)
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);
    clone.textContent = FIXED;
    clone.addEventListener('click', (e) => {
      try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
      list.classList.toggle('hidden');
      clone.textContent = FIXED;
    }, true);
  }

  // ===== 2) Danh sách từng người — cộng thêm MDP3 vào đúng người =====
  function renderSuppListSimpleSafe(){
    const wrap = q('#supp-insured-summaries');
    if (!wrap) return;
    wrap.innerHTML = '';

    const pf = (window.personFees || {});

    // Lấy MDP3 (nếu bật)
    let mdpSel = null, mdpFee = 0;
    try {
      if (q('#mdp3-enable')?.checked && window.MDP3) {
        mdpSel = window.MDP3.getSelectedId && window.MDP3.getSelectedId();
        mdpFee = Number(window.MDP3.getPremium ? (window.MDP3.getPremium()||0) : 0);
      }
    } catch(_){}

    // NĐBH chính
    const mainId = 'main-person-container';
    const mainName = q('#main-person-container .name-input')?.value?.trim() || 'NĐBH chính';
    const mainSupp = (pf[mainId]?.supp) || 0;
    const mainSum  = mainSupp + ((mdpSel === mainId) ? mdpFee : 0);
    wrap.insertAdjacentHTML('beforeend',
      `<div class="flex justify-between items-center py-1 text-sm">
         <span>${(mainName||'NĐBH chính').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]))}</span>
         <span class="font-semibold">${fmt(mainSum)}</span>
       </div>`);

    // Những người bổ sung
    qa('#supplementary-insured-container .person-container').forEach((cont, idx) => {
      const id   = cont.id;
      const name = cont.querySelector('.name-input')?.value?.trim() || `NĐBH bổ sung ${idx+1}`;
      const fee  = (pf[id]?.supp) || 0;
      const sum  = fee + ((mdpSel === id) ? mdpFee : 0);
      wrap.insertAdjacentHTML('beforeend',
        `<div class="flex justify-between items-center py-1 text-sm">
           <span>${(name||'NĐBH bổ sung').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]))}</span>
           <span class="font-semibold">${fmt(sum)}</span>
         </div>`);
    });

    if (mdpSel === 'other' && mdpFee > 0) {
      wrap.insertAdjacentHTML('beforeend',
        `<div class="flex justify-between items-center py-1 text-sm">
           <span>Miễn đóng phí 3.0 (Người khác)</span>
           <span class="font-semibold">${fmt(mdpFee)}</span>
         </div>`);
    }
  }

  // ===== 3) Khối Kỳ đóng phí — xóa dòng "Kỳ: …" & ẩn dòng bằng 0 & ẩn khi chọn Năm =====
  function cleanupFrequencyPanel(){
    const pane = q('#frequency-breakdown');
    if (!pane) return;
    const freq = q('#payment-frequency')?.value || 'year';

    // Xóa dòng "Kỳ: ..."
    const first = pane.querySelector(':scope > div');
    if (first && /^\s*Kỳ\s*:/.test(first.textContent||'')) first.remove();

    // Ẩn dòng = 0
    const ids = ['freq-main-plus-extra','freq-supp-total','freq-total-period','freq-total-year','freq-diff'];
    ids.forEach(id => {
      const el = q('#'+id);
      if (!el) return;
      const row = el.closest('div');
      if (!row) return;
      const v = num(el.textContent);
      row.classList.toggle('hidden', v === 0 || (id==='freq-diff' && freq==='year'));
    });

    // Ẩn toàn bộ khi là Năm
    pane.classList.toggle('hidden', freq === 'year');
  }

  // ===== 4) Hậu xử lý báo cáo: đổi "Năm đóng phí" -> "Số năm đóng phí" & ẩn ô = 0 khi có =====
  function postProcessReport(){
    const ctn = q('#summary-content-container');
    if (!ctn) return;
    qa('th', ctn).forEach(th => {
      if ((th.textContent||'').trim() === 'Năm đóng phí') {
        th.textContent = 'Số năm đóng phí';
      }
    });
    // Ẩn các TD có giá trị 0 (để trống)
    qa('td', ctn).forEach(td => {
      const v = num(td.textContent);
      if (v === 0) td.textContent = '';
    });
    // Ẩn cột "Chênh lệch" nếu đang chọn Năm
    const freq = q('#payment-frequency')?.value || 'year';
    if (freq === 'year') {
      qa('th,td', ctn).forEach(el => {
        if (/Chênh lệch/i.test(el.textContent||'')) {
          const idx = Array.from(el.parentElement.children).indexOf(el);
          qa('tr', el.closest('table')).forEach(row => {
            const cell = row.children[idx];
            if (cell) cell.style.display = 'none';
          });
        }
      });
    }
  }

  // ===== 5) Kết nối các hook mà KHÔNG đụng code cũ =====
  function safeRefresh(){
    try { renderSuppListSimpleSafe(); } catch(e){}
    try { cleanupFrequencyPanel(); } catch(e){}
  }

  document.addEventListener('DOMContentLoaded', () => {
    try { lockToggleButton(); } catch(e){}
    safeRefresh();
  });

  // Khi thay đổi kỳ / MDP3 / tên → refresh
  ['change','input'].forEach(evt => {
    document.addEventListener(evt, (e) => {
      const t = e.target;
      if (!t) return;
      if (t.id === 'payment-frequency' || t.id === 'mdp3-enable' || t.classList?.contains('name-input')) {
        safeRefresh();
      }
    }, true);
  });

  // Khi người dùng mở/regen báo cáo, hậu xử lý sau 1 tick
  const repBtn = () => q('#view-summary-btn') || q('#generate-summary-btn');
  const attachReportHook = () => {
    const b = repBtn();
    if (!b) return;
    b.addEventListener('click', () => setTimeout(postProcessReport, 50), true);
  };
  document.addEventListener('DOMContentLoaded', attachReportHook);
  const moButtons = new MutationObserver(() => attachReportHook());
  moButtons.observe(document.documentElement, {subtree:true, childList:true});
})();
