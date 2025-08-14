
/* ================================================================
 * LOGIC.HOTFIX.JS  —  Giữ nguyên toàn bộ code cũ, chỉ vá các lỗi nhỏ.
 * Cách dùng: đặt sau <script type="module" src="logic.js"></script>
 *           <script type="module" src="logic.hotfix.js"></script>
 * ================================================================ */

/* 1) Giữ nhãn nút "Xem từng người" cố định, tránh đổi text khi đổi kỳ */
(function(){
  function fixToggleBtn(){
    const btn = document.getElementById('toggle-supp-list-btn');
    const list = document.getElementById('supp-insured-summaries');
    if(!btn || !list) return;
    const LABEL = 'Xem từng người';
    // Thay bằng clone để bỏ mọi listener cũ gây đổi chữ
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);
    clone.textContent = LABEL;
    clone.addEventListener('click', (e)=>{
      e.preventDefault();
      list.classList.toggle('hidden');
      clone.textContent = LABEL; // luôn cố định
    }, true);
    // Nếu có code nào khác cố đổi text → ép về LABEL
    const mo = new MutationObserver(()=>{
      if ((clone.textContent||'').trim() !== LABEL) clone.textContent = LABEL;
    });
    mo.observe(clone, {childList:true, characterData:true, subtree:true});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixToggleBtn);
  } else { fixToggleBtn(); }
})();

/* 2) Danh sách "Xem từng người": cộng phí MDP3 vào đúng người được chọn (kể cả NĐBH chính).
      Không thêm dòng "Người khác" để giữ đúng yêu cầu chỉ hiển thị theo từng người có trong danh sách. */
(function(){
  const orig = window.renderSuppListSimple;
  window.renderSuppListSimple = function(){
    try{
      const wrap = document.getElementById('supp-insured-summaries');
      if(!wrap) return;
      wrap.innerHTML = '';

      let mdpFee = 0, mdpId = null;
      try{
        if (window.MDP3) {
          mdpFee = Number(window.MDP3.getPremium ? (window.MDP3.getPremium()||0) : 0);
          mdpId  = window.MDP3.getSelectedId ? window.MDP3.getSelectedId() : null;
        }
      }catch(_){}

      // NĐBH chính
      const mainId = 'main-person-container';
      const mainName = document.querySelector('#main-person-container .name-input')?.value?.trim() || 'NĐBH chính';
      let mainSupp = (window.personFees?.[mainId]?.supp) || 0;
      if (mdpFee>0 && mdpId===mainId) mainSupp += mdpFee;
      const rowMain = document.createElement('div');
      rowMain.className = 'flex justify-between items-center py-1 text-sm';
      rowMain.innerHTML = `<span>${sanitizeHtml(mainName)}</span><span class="font-semibold">${formatCurrency(mainSupp)}</span>`;
      wrap.appendChild(rowMain);

      // NĐBH bổ sung
      document.querySelectorAll('#supplementary-insured-container .person-container').forEach((cont, idx)=>{
        const name = cont.querySelector('.name-input')?.value?.trim() || \`NĐBH bổ sung \${idx+1}\`;
        let fee = (window.personFees?.[cont.id]?.supp) || 0;
        if (mdpFee>0 && mdpId===cont.id) fee += mdpFee;
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center py-1 text-sm';
        row.innerHTML = `<span>${sanitizeHtml(name)}</span><span class="font-semibold">${formatCurrency(fee)}</span>`;
        wrap.appendChild(row);
      });
    }catch(e){
      // fallback sang bản gốc nếu có lỗi
      if (typeof orig === 'function') try{ orig(); }catch(_){}
    }
  };
})();

/* 3) Breakdown Kỳ đóng phí: ẩn dòng nếu = 0, ẩn toàn khối & cột chênh lệch khi kỳ = Năm;
      đồng thời loại bỏ hậu tố "VNĐ" nếu có từ các enhancer cũ. */
(function(){
  function intVal(txt){ return parseInt(String(txt||'').replace(/[^\d\-]/g,''),10) || 0; }
  function cleanupFreqBox(){
    const sel = document.getElementById('payment-frequency');
    const box = document.getElementById('frequency-breakdown');
    if(!sel || !box) return;
    const isYear = (sel.value === 'year');

    // Bỏ "VNĐ" (nếu có)
    ['freq-main-plus-extra','freq-supp-total','freq-total-period','freq-total-year','freq-diff'].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = (el.textContent||'').replace(/\s*VNĐ\s*$/i, '');
    });

    // Ẩn/hiện khối theo kỳ
    box.classList.toggle('hidden', isYear);

    // Ẩn từng dòng nếu = 0 hoặc là 'Chênh lệch' khi kỳ = Năm
    ['freq-main-plus-extra','freq-supp-total','freq-total-period','freq-total-year','freq-diff'].forEach(id=>{
      const el = document.getElementById(id); if(!el) return;
      const row = el.closest('div'); if(!row) return;
      const v = intVal(el.textContent);
      const hide = (v===0) || (id==='freq-diff' && isYear);
      row.classList.toggle('hidden', hide);
    });
  }

  // gọi khi load, khi đổi kỳ, và sau mỗi lần updateSummaryUI
  function bind(){
    document.addEventListener('change', (e)=>{
      if (e.target && e.target.id==='payment-frequency') cleanupFreqBox();
    }, true);
    const prev = window.updateSummaryUI;
    window.updateSummaryUI = function(){
      const r = prev && prev.apply(this, arguments);
      try{ cleanupFreqBox(); }catch(_){}
      return r;
    };
    // nếu có renderSection6V2 thì dùng luôn (loại bản cũ có dòng "Kỳ: ...")
    if (typeof window.renderSection6V2 === 'function') {
      window.renderSection6 = function(){ try{ window.renderSection6V2(); cleanupFreqBox(); }catch(_){} };
    }
    cleanupFreqBox();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else { bind(); }
})();

/* 4) Bảng minh hoạ chi tiết:
      - Bổ sung STBH cho dòng "Miễn đóng phí 3.0"
      - Ẩn các ô số tiền = 0 (để trống)
      (Không thay đổi thuật toán tính phí gốc của bạn) */
(function(){
  function computeMdp3StbhBase(){
    const pf = window.personFees || {};
    let stbhBase = 0;
    for (const pid in pf) {
      stbhBase += (pf[pid].mainBase||0) + (pf[pid].supp||0);
    }
    try{
      const selId = window.MDP3 && window.MDP3.getSelectedId ? window.MDP3.getSelectedId() : null;
      if(selId && selId!=='other' && pf[selId]) stbhBase -= (pf[selId].supp||0);
    }catch(_){}
    return stbhBase;
  }
  function blankZeroCells(container){
    container.querySelectorAll('td').forEach(td=>{
      const v = parseInt((td.textContent||'').replace(/[^\d\-]/g,''),10) || 0;
      if (v === 0) td.textContent = '';
    });
  }
  const orig = window.generateSummaryTable;
  window.generateSummaryTable = function(){
    // gọi bản gốc để giữ toàn bộ logic hiện tại
    if (typeof orig === 'function') orig.apply(this, arguments);
    try{
      const container = document.getElementById('summary-content-container');
      if(!container) return;

      // Điền STBH cho "Miễn đóng phí 3.0" nếu đang là "—"
      container.querySelectorAll('table tbody tr').forEach(tr=>{
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 5 && /Miễn đóng phí\s*3\.0/i.test(tds[1].textContent||'')) {
          const stbhCell = tds[2];
          const curr = (stbhCell.textContent||'').trim();
          if (curr === '—' || curr === '-') {
            const stbh = computeMdp3StbhBase();
            stbhCell.textContent = (typeof formatCurrency==='function') ? formatCurrency(stbh) : (stbh.toLocaleString('vi-VN'));
          }
        }
      });

      // Ẩn các ô bằng 0
      blankZeroCells(container);
    }catch(_){}
  };
})();
