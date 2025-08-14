/* =========================
 * SAFE PATCH LAYER (module-friendly)
 * - Không ghi đè formatter ngày/nghề
 * - Hoạt động song song với logic.js đang chạy
 * - Fix: nhãn nút "Xem từng người", cộng MDP3 vào tổng từng người
 * - Dọn khối "Kỳ đóng phí": xóa "Kỳ: …", ẩn dòng = 0, ẩn toàn khối khi chọn Năm
 * - Sửa báo cáo generateSummaryTable theo đặc tả (Phần 1 & 2)
 * ========================= */
(function(){
  const q  = (sel, root=document) => root.querySelector(sel);
  const qa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const num = (t) => {
    const s = String(t ?? '').replace(/[^\d\-]/g,'');
    const v = parseInt(s,10);
    return isNaN(v) ? 0 : v;
  };
  const fmt = (n) => (Number(n)||0).toLocaleString('vi-VN');
  const safe = (s) => String(s||'').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

  function readPersonFees(id){
    const pf = (window.personFees||{});
    return { mainBase: pf[id]?.mainBase||0, supp: pf[id]?.supp||0 };
  }

  function mdp3Info(){
    try{
      if (!q('#mdp3-enable')?.checked) return {id:null, fee:0};
      const api = window.MDP3;
      const id = api?.getSelectedId ? api.getSelectedId() : null;
      const fee = api?.getPremium ? Number(api.getPremium()||0) : 0;
      return {id, fee: fee||0};
    }catch(_){ return {id:null, fee:0}; }
  }

  // ===== 1) Giữ nhãn "Xem từng người" cố định và chỉ toggle list =====
  function lockToggleBtn(){
    const btn = q('#toggle-supp-list-btn');
    const list = q('#supp-insured-summaries');
    if (!btn || !list) return;
    const FIXED = 'Xem từng người';

    // Thay listener cũ bằng clone để tránh loop/đơ
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);
    clone.textContent = FIXED;
    clone.addEventListener('click', (e) => {
      try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
      list.classList.toggle('hidden');
      clone.textContent = FIXED;
    }, true);

    // Chốt không cho ai đổi label
    const mo = new MutationObserver(() => {
      if ((clone.textContent||'').trim() !== FIXED) clone.textContent = FIXED;
    });
    mo.observe(clone, {childList:true, characterData:true, subtree:true});
  }

  // ===== 2) Danh sách từng người — có cộng MDP3 đúng người =====
  function renderSuppListSimplePatched(){
    const wrap = q('#supp-insured-summaries');
    if (!wrap) return;
    wrap.innerHTML = '';

    const {id:mdpId, fee:mdpFee} = mdp3Info();

    // NĐBH chính
    const mainId   = 'main-person-container';
    const mainName = q('#main-person-container .name-input')?.value?.trim() || 'NĐBH chính';
    const pfMain   = readPersonFees(mainId);
    const mainSum  = pfMain.supp + ((mdpId === mainId) ? mdpFee : 0);
    wrap.insertAdjacentHTML('beforeend',
      `<div class="flex justify-between items-center py-1 text-sm">
        <span>${safe(mainName)}</span>
        <span class="font-semibold">${fmt(mainSum)}</span>
      </div>`);

    // NĐBH bổ sung
    qa('#supplementary-insured-container .person-container').forEach((cont, i) => {
      const name = cont.querySelector('.name-input')?.value?.trim() || `NĐBH bổ sung ${i+1}`;
      const fee  = readPersonFees(cont.id).supp + ((mdpId === cont.id) ? mdpFee : 0);
      wrap.insertAdjacentHTML('beforeend',
        `<div class="flex justify-between items-center py-1 text-sm">
          <span>${safe(name)}</span>
          <span class="font-semibold">${fmt(fee)}</span>
        </div>`);
    });

    if (mdpId === 'other' && mdpFee > 0) {
      wrap.insertAdjacentHTML('beforeend',
        `<div class="flex justify-between items-center py-1 text-sm">
          <span>Miễn đóng phí 3.0 (Người khác)</span>
          <span class="font-semibold">${fmt(mdpFee)}</span>
        </div>`);
    }
  }

  // ===== 3) Khối Kỳ đóng phí — dọn và ẩn khi cần =====
  function cleanupFrequencyPanel(){
    const pane = q('#frequency-breakdown');
    const sel  = q('#payment-frequency');
    if (!pane || !sel) return;

    // Xóa dòng "Kỳ: ..."
    const first = pane.querySelector(':scope > div');
    if (first && /^\s*Kỳ\s*:/.test(first.textContent||'')) first.remove();

    const isYear = sel.value === 'year';
    pane.classList.toggle('hidden', isYear);

    // Ẩn dòng = 0 và ẩn chênh lệch khi là năm
    ['freq-main-plus-extra','freq-supp-total','freq-total-period','freq-total-year','freq-diff'].forEach(id => {
      const el = q('#'+id);
      if (!el) return;
      const row = el.closest('div');
      if (!row) return;
      const v = num(el.textContent);
      const hide = (v === 0) || (id==='freq-diff' && isYear);
      row.classList.toggle('hidden', hide);
    });
  }

  // ===== 4) Gắn vào chu trình update UI hiện có (nếu có) =====
  (function wrapUpdateUI(){
    const prev = window.updateSummaryUI;
    window.updateSummaryUI = function(){
      try{ prev && prev.apply(this, arguments); }catch(_){}
      try{ renderSuppListSimplePatched(); }catch(_){}
      try{ cleanupFrequencyPanel(); }catch(_){}
    };
  })();

  // ===== 5) Báo cáo theo đặc tả =====
  function generateSummaryTablePatched(){
    const container = q('#summary-content-container');
    if (!container) return;
    container.innerHTML = '';

    const San = window.sanitizeHtml || ((s)=>String(s));
    const N   = window.roundDownTo1000 || ((x)=>Math.floor((Number(x)||0)/1000)*1000);
    const parse = window.parseFormattedNumber || num;
    const fcur  = window.formatCurrency || ((n)=> (Number(n)||0).toLocaleString('vi-VN'));

    try{
      const mainCont = q('#main-person-container');
      const mainInfo = (window.getCustomerInfo ? window.getCustomerInfo(mainCont, true) : null);
      if (!mainInfo) throw new Error('Không đọc được thông tin NĐBH chính.');

      const targetAge = parseInt(q('#target-age-input')?.value||'0',10);
      if (!targetAge || targetAge <= mainInfo.age) throw new Error('Vui lòng nhập độ tuổi mục tiêu hợp lệ (> tuổi hiện tại).');

      const product = mainInfo.mainProduct;
      let term = 0;
      if (product === 'TRON_TAM_AN') term = 10;
      else if (product === 'AN_BINH_UU_VIET') term = parseInt(q('#abuv-term')?.value||'0',10)||0;
      else term = parseInt(q('#payment-term')?.value||'0',10)||0;

      const prodLabel = (window.getProductLabel ? window.getProductLabel(product) : product);
      const stbhMain  = (product === 'TRON_TAM_AN') ? 100_000_000 : parse(q('#main-stbh')?.value);
      const baseMainAnnual = (window.calculateMainPremium ? window.calculateMainPremium(mainInfo) : 0);
      const extraAnnual    = (window.getExtraPremiumValue ? window.getExtraPremiumValue() : 0);

      const freqSel = q('#payment-frequency')?.value || 'year';
      const per     = (freqSel==='half')?2:((freqSel==='quarter')?4:1);
      const suppK   = (freqSel==='half')?1.02:((freqSel==='quarter')?1.04:1.0);

      const mdp = mdp3Info();

      function calcSuppAnnual(person, cont){
        if (!cont) return 0;
        const mBase = baseMainAnnual;
        let s = 0;
        s += window.calculateHealthSclPremium ? window.calculateHealthSclPremium(person, cont, person.age) : 0;
        s += window.calculateBhnPremium       ? window.calculateBhnPremium(person, cont, person.age)       : 0;
        s += window.calculateAccidentPremium  ? window.calculateAccidentPremium(person, cont, person.age)  : 0;
        s += window.calculateHospitalSupportPremium ? window.calculateHospitalSupportPremium(person, mBase, cont, 0, person.age) : 0;
        return N(s * suppK);
      }

      function suppRows(person, cont, includeMdp){
        let html = '';
        if (!cont) return html;

        const addRow = (label, stbh, yrs, fee) => {
          const feeTxt = fee>0 ? fcur(fee) : '';
          html += `<tr>
            <td class="p-2 border"></td>
            <td class="p-2 border">${San(label)}</td>
            <td class="p-2 border text-right">${stbh?fcur(stbh):'—'}</td>
            <td class="p-2 border text-center">${yrs||'—'}</td>
            <td class="p-2 border text-right">${feeTxt}</td>
          </tr>`;
        };

        const ageMax = {scl:75, bhn:85, other:65};

        const scl = cont.querySelector('.health-scl-section .health-scl-checkbox');
        if (scl?.checked) {
          const program = cont.querySelector('.health-scl-program')?.value || '';
          const labelProgram = ({co_ban:'Cơ bản',nang_cao:'Nâng cao',toan_dien:'Toàn diện',hoan_hao:'Hoàn hảo'})[program] || '';
          const stbh = window.getHealthSclStbhByProgram ? window.getHealthSclStbhByProgram(program) : 0;
          const fee  = N((window.calculateHealthSclPremium?window.calculateHealthSclPremium(person, cont, person.age):0)*suppK);
          const yrs  = Math.max(0, Math.min(targetAge, ageMax.scl) - person.age + 1);
          addRow(`Sức khoẻ Bùng Gia Lực${labelProgram?(' - '+labelProgram):''}`, stbh, yrs, fee);
        }

        const bhn = cont.querySelector('.bhn-section .bhn-checkbox');
        if (bhn?.checked) {
          const stbh = parse(cont.querySelector('.bhn-stbh')?.value);
          const fee  = N((window.calculateBhnPremium?window.calculateBhnPremium(person, cont, person.age):0)*suppK);
          const yrs  = Math.max(0, Math.min(targetAge, 85) - person.age + 1);
          addRow('Bệnh hiểm nghèo 2.0', stbh, yrs, fee);
        }

        const acc = cont.querySelector('.accident-section .accident-checkbox');
        if (acc?.checked) {
          const stbh = parse(acc.closest('.accident-section')?.querySelector('.accident-stbh')?.value);
          const fee  = N((window.calculateAccidentPremium?window.calculateAccidentPremium(person, cont, person.age):0)*suppK);
          const yrs  = Math.max(0, Math.min(targetAge, 65) - person.age + 1);
          addRow('Bảo hiểm Tai nạn', stbh, yrs, fee);
        }

        const hs = cont.querySelector('.hospital-support-section .hospital-support-checkbox');
        if (hs?.checked) {
          const stbh = parse(hs.closest('.hospital-support-section')?.querySelector('.hospital-support-stbh')?.value);
          const fee  = N((window.calculateHospitalSupportPremium?window.calculateHospitalSupportPremium(person, baseMainAnnual, cont, 0, person.age):0)*suppK);
          const yrs  = Math.max(0, Math.min(targetAge, 65) - person.age + 1);
          addRow('Hỗ trợ chi phí nằm viện (đ/ngày)', stbh, yrs, fee);
        }

        if (includeMdp && mdp.fee>0) {
          const stbhBase = calcSuppAnnual(person, cont);
          const feeAdj   = N(mdp.fee * suppK);
          const yrs      = Math.max(0, Math.min(targetAge, 65) - person.age + 1);
          addRow('Miễn đóng phí 3.0', stbhBase, yrs, feeAdj);
        }
        return html;
      }

      const suppPersons = qa('.person-container').filter(x=>x.id!=='main-person-container').map(x => window.getCustomerInfo?window.getCustomerInfo(x,false):null).filter(Boolean);
      const mainSuppCont = q('#main-supp-container .supplementary-products-container');
      const mainSuppNow  = calcSuppAnnual(mainInfo, mainSuppCont);
      const mainHeaderTotal = baseMainAnnual + extraAnnual + mainSuppNow + ((mdp.id==='main-person-container')? N(mdp.fee*suppK):0);

      let html1 = `<div class="mb-4">
        <div class="text-lg font-semibold mb-1">Phần 1 · Tóm tắt sản phẩm</div>
        <div class="text-xs italic text-gray-500 mb-2">Các khoản phí đã tính theo kỳ đang chọn (Năm/Nửa năm/Quý). Chỉ phí bổ sung áp dụng hệ số theo kỳ.</div>
        <table class="w-full text-left border-collapse">
          <thead class="bg-gray-100">
            <tr>
              <th class="p-2 border">Tên NĐBH</th>
              <th class="p-2 border">Sản phẩm</th>
              <th class="p-2 border">STBH</th>
              <th class="p-2 border">Số năm đóng phí</th>
              <th class="p-2 border">Phí đóng (năm)</th>
            </tr>
          </thead>
          <tbody>`;

      html1 += `<tr class="bg-gray-50">
        <td class="p-2 border font-semibold">${San(mainInfo.name||'NĐBH chính')}</td>
        <td class="p-2 border">—</td><td class="p-2 border text-right">—</td><td class="p-2 border text-center">—</td>
        <td class="p-2 border text-right font-bold">${fcur(mainHeaderTotal)}</td>
      </tr>`;

      html1 += `<tr>
        <td class="p-2 border"></td>
        <td class="p-2 border">${San(prodLabel)}</td>
        <td class="p-2 border text-right">${product==='TRON_TAM_AN'?'100.000.000':fcur(stbhMain)}</td>
        <td class="p-2 border text-center">${term||'—'}</td>
        <td class="p-2 border text-right">${baseMainAnnual?fcur(baseMainAnnual):''}</td>
      </tr>`;

      if (extraAnnual>0){
        html1 += `<tr>
          <td class="p-2 border"></td>
          <td class="p-2 border">Phí đóng thêm</td>
          <td class="p-2 border text-right">—</td>
          <td class="p-2 border text-center">${term||'—'}</td>
          <td class="p-2 border text-right">${fcur(extraAnnual)}</td>
        </tr>`;
      }

      html1 += suppRows(mainInfo, mainSuppCont, mdp.id==='main-person-container');

      qa('#supplementary-insured-container .person-container').forEach(cont => {
        const p = window.getCustomerInfo?window.getCustomerInfo(cont,false):null;
        if (!p) return;
        const suppCont = cont.querySelector('.supplementary-products-container');
        const pSuppNow = calcSuppAnnual(p, suppCont);
        const pHeaderTotal = pSuppNow + ((mdp.id===cont.id)? N(mdp.fee*suppK) : 0);
        html1 += `<tr class="bg-gray-50">
          <td class="p-2 border font-semibold">${San(p.name||'NĐBH bổ sung')}</td>
          <td class="p-2 border">—</td><td class="p-2 border text-right">—</td><td class="p-2 border text-center">—</td>
          <td class="p-2 border text-right font-bold">${fcur(pHeaderTotal)}</td>
        </tr>`;
        html1 += suppRows(p, suppCont, mdp.id===cont.id);
      });

      if (mdp.id==='other' && mdp.fee>0){
        const baseShow = mainHeaderTotal;
        html1 += `<tr>
          <td class="p-2 border">Người khác</td>
          <td class="p-2 border">Miễn đóng phí 3.0</td>
          <td class="p-2 border text-right">${fcur(baseShow)}</td>
          <td class="p-2 border text-center">—</td>
          <td class="p-2 border text-right">${fcur(N(mdp.fee*suppK))}</td>
        </tr>`;
      }

      html1 += `</tbody></table></div>`;

      const suppPersons2 = qa('.person-container').filter(x=>x.id!=='main-person-container').map(x => window.getCustomerInfo?window.getCustomerInfo(x,false):null).filter(Boolean);

      let html2 = `<div class="mb-4"><div class="text-lg font-semibold mb-2">Phần 2 · Bảng phí</div>`;
      html2 += `<table class="w-full text-left border-collapse"><thead class="bg-gray-100"><tr>`;
      html2 += `<th class="p-2 border">Năm HĐ</th>`;
      html2 += `<th class="p-2 border">Tuổi NĐBH chính<br>(${San(mainInfo.name)})</th>`;
      html2 += `<th class="p-2 border">Phí chính</th>`;
      html2 += `<th class="p-2 border">Phí đóng thêm</th>`;
      html2 += `<th class="p-2 border">Phí bổ sung<br>(${San(mainInfo.name)})</th>`;
      suppPersons2.forEach(sp => { html2 += `<th class="p-2 border">Phí bổ sung<br>(${San(sp.name)})</th>`; });
      html2 += `<th class="p-2 border">Tổng cộng</th>`;
      // Chỉ hiện chênh lệch nếu chọn nửa năm/quý
      const per = (freqSel==='half')?2:((freqSel==='quarter')?4:1); // dùng lại biến ở trên qua closure
      if (per>1) html2 += `<th class="p-2 border">Chênh lệch so với năm</th>`;
      html2 += `</tr></thead><tbody>`;

      for (let i=0; mainInfo.age+i<=targetAge; i++){
        const year = i+1;
        const age  = mainInfo.age + i;
        const mainY = (year<=term) ? baseMainAnnual : 0;
        const extraY= (year<=term) ? extraAnnual : 0;

        let suppMainY = 0;
        const mCont = q('#main-supp-container .supplementary-products-container');
        if (mCont){
          const personForYear = {...mainInfo, age};
          suppMainY += window.calculateHealthSclPremium? window.calculateHealthSclPremium(personForYear, mCont, age) : 0;
          suppMainY += window.calculateBhnPremium?       window.calculateBhnPremium(personForYear, mCont, age)       : 0;
          suppMainY += window.calculateAccidentPremium?  window.calculateAccidentPremium(personForYear, mCont, age)  : 0;
          suppMainY += window.calculateHospitalSupportPremium? window.calculateHospitalSupportPremium(personForYear, baseMainAnnual, mCont, 0, age) : 0;
        }

        const suppEachY = suppPersons2.map(p => {
          const cont = p.container.querySelector('.supplementary-products-container');
          let s = 0;
          if (cont){
            const ageP = p.age + i;
            const personForYear = {...p, age:ageP};
            s += window.calculateHealthSclPremium? window.calculateHealthSclPremium(personForYear, cont, ageP) : 0;
            s += window.calculateBhnPremium?       window.calculateBhnPremium(personForYear, cont, ageP)       : 0;
            s += window.calculateAccidentPremium?  window.calculateAccidentPremium(personForYear, cont, ageP)  : 0;
            s += window.calculateHospitalSupportPremium? window.calculateHospitalSupportPremium(personForYear, baseMainAnnual, cont, 0, ageP) : 0;
          }
          return s;
        });

        if (mdp.fee>0 && mdp.id){
          if (mdp.id==='main-person-container') suppMainY += mdp.fee;
          else if (mdp.id!=='other'){
            const idx = suppPersons2.findIndex(x => x.container?.id === mdp.id);
            if (idx>=0) suppEachY[idx] += mdp.fee;
          }
        }

        const annualSupp = suppMainY + suppEachY.reduce((a,b)=>a+b,0);

        // Quy đổi theo kỳ
        const perMainExtra = (per===1) ? (mainY + extraY) : Math.floor((mainY + extraY)/per);
        const suppK2 = (per===2)?1.02:((per===4)?1.04:1.0);
        const perSupp      = (per===1) ? annualSupp : Math.round((annualSupp/1000 * suppK2 / per))*1000;
        const perTotal     = perMainExtra + perSupp;
        const totalFromPer = perTotal * per;
        const diff         = totalFromPer - (mainY + extraY + annualSupp);

        const cell = (v)=> v>0 ? fcur(v) : '';

        html2 += `<tr>
          <td class="p-2 border text-center">${year}</td>
          <td class="p-2 border text-center">${age}</td>
          <td class="p-2 border text-right">${cell(mainY)}</td>
          <td class="p-2 border text-right">${cell(extraY)}</td>
          <td class="p-2 border text-right">${cell(suppMainY)}</td>`;
        suppEachY.forEach(s=>{ html2 += `<td class="p-2 border text-right">${cell(s)}</td>`; });
        html2 += `<td class="p-2 border text-right font-semibold">${fcur(totalFromPer)}</td>`;
        if (per>1) html2 += `<td class="p-2 border text-right">${fcur(diff)}</td>`;
        html2 += `</tr>`;
      }

      html2 += `</tbody></table></div>`;

      container.innerHTML = html1 + html2 + `<div class="mt-4 text-center"><button id="export-html-btn" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Xuất HTML</button></div>`;
      q('#summary-modal')?.classList.remove('hidden');
      q('#export-html-btn')?.addEventListener('click', ()=>window.print());
    }catch(e){
      container.innerHTML = `<p class="text-red-600 font-semibold text-center">${safe(e.message||String(e))}</p>`;
      q('#summary-modal')?.classList.remove('hidden');
    }
  }

  // ===== 6) Bind sự kiện, không gây loop =====
  document.addEventListener('DOMContentLoaded', () => {
    try{ lockToggleBtn(); }catch(_){}
    try{ renderSuppListSimplePatched(); }catch(_){}
    try{ cleanupFrequencyPanel(); }catch(_){}
  });
  document.addEventListener('change', (e)=>{
    const id = e.target?.id;
    if (id==='payment-frequency' || id==='mdp3-enable') {
      try{ renderSuppListSimplePatched(); }catch(_){}
      try{ cleanupFrequencyPanel(); }catch(_){}
    }
  }, true);

  // ===== 7) Xuất ra window để nút báo cáo gọi được =====
  try {
    window.generateSummaryTable = generateSummaryTablePatched;
  } catch(_){}

})(); // end patch
