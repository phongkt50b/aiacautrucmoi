

import { product_data } from '../data.js';
import { roundDownTo1000, formatCurrency } from '../utils.js'; // Import shared utils
import { GLOBAL_CONFIG } from '../structure.js';

export const UI_FUNCTIONS = {
  validate: {
    stbhMinWithBaseTiers: ({ value, basePremium, params }) => {
        if (!value || value <= 0) return 'Vui lòng nhập Số tiền bảo hiểm';
        if (params.min && value < params.min) return `STBH tối thiểu ${formatCurrency(params.min)}`;
        
        if (basePremium > 0 && params.tiers) {
            const tier = params.tiers.find(t => (t.stbhGte == null || value >= t.stbhGte) && (t.stbhLt == null || value < t.stbhLt));
            if (tier && basePremium < tier.minBase) {
                return `Với STBH này, phí tối thiểu là ${formatCurrency(tier.minBase)}`;
            }
        }
        return null;
    },
    termInRangeByAge: ({ value, customer, params }) => {
      if (!value) return 'Vui lòng nhập thời gian đóng phí';
      const min = params.min || 1;
      const max = params.maxFormulaKey === '100MinusAge' ? (100 - (customer.age || 0)) : params.max;
      if (value < min || value > max) return `Nhập từ ${min} đến ${max} năm`;
      return null;
    },
    extraMaxTimesBase: ({ value, basePremium, params }) => {
      if (value > 0 && basePremium > 0 && value > (params.maxTimes || 5) * basePremium) return `Tối đa ${params.maxTimes || 5} lần phí chính`;
      return null;
    },
    required: ({ value }) => (!value ? 'Vui lòng chọn/nhập' : null),
    mul_stbh_min: ({ value }) => {
        if (!value || value <= 0) return 'Vui lòng nhập Số tiền bảo hiểm';
        if (value < 100000000) return 'STBH tối thiểu 100.000.000';
        return null;
    },
    mul_main_premium_vs_stbh: ({ value, allValues, customer }) => {
        if (!value) return 'Vui lòng nhập phí sản phẩm chính';
        if (value < 5000000) return 'Phí tối thiểu 5.000.000';
        const stbh = allValues['main-stbh'] || 0;
        const factorRow = product_data.mul_factors.find(f => customer.age >= f.ageMin && customer.age <= f.ageMax);
        if (stbh > 0 && factorRow) {
            const minFee = roundDownTo1000(stbh / factorRow.maxFactor);
            const maxFee = roundDownTo1000(stbh / factorRow.minFactor);
            if (value < minFee || value > maxFee) return 'Phí không hợp lệ so với STBH';
        }
        return null;
    },
    rider_stbh_range: ({ value, params }) => {
        if (value > 0 && value < params.min) return `Tối thiểu ${formatCurrency(params.min)}`;
        if (value > params.max) return `Tối đa ${formatCurrency(params.max)}`;
        return null;
    },
    hospital_support_stbh: ({ value, customer, state }) => {
        if (value <= 0) return null;
        if (value % GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE !== 0) return `Phải là bội số của ${formatCurrency(GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE)}`;

        const maxByAge = customer.age >= 18 ? 1000000 : 300000;
        if (value > maxByAge) return `STBH tối đa cho tuổi ${customer.age} là ${formatCurrency(maxByAge)}`;

        const mainPremium = state.fees.baseMain;
        const maxSupportTotal = Math.floor(mainPremium / 4000000) * GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE;
        let currentTotalStbh = 0;
        state.persons.forEach(p => {
            if (p.supplements?.hospital_support?.stbh) {
                currentTotalStbh += p.supplements.hospital_support.stbh;
            }
        });
        
        if (currentTotalStbh > maxSupportTotal) return `Tổng STBH Hỗ trợ viện phí (${formatCurrency(currentTotalStbh)}) vượt quá giới hạn theo phí chính (${formatCurrency(maxSupportTotal)})`;
        
        return null;
    }
  },
  onRender: {
    mul_main_premium_hint_vs_stbh: ({ el, allValues, customer }) => {
        const stbh = allValues['main-stbh'] || 0;
        const factorRow = product_data.mul_factors.find(f => customer.age >= f.ageMin && customer.age <= f.ageMax);
        const hintEl = el.parentElement.querySelector('#main-premium-hint');
        if (stbh > 0 && factorRow && hintEl) {
            const minFee = roundDownTo1000(stbh / factorRow.maxFactor);
            const maxFee = roundDownTo1000(stbh / factorRow.minFactor);
            hintEl.textContent = `Phí hợp lệ từ ${formatCurrency(minFee)} đến ${formatCurrency(maxFee)}.`;
        } else if(hintEl) {
            hintEl.textContent = '';
        }
    },
    scl_program_by_threshold: ({ section, customer, mainPremium, mainProductConfig, state, params }) => {
        const programSelect = section.querySelector('#health_scl-program');
        const outpatientCb = section.querySelector('#health_scl-outpatient');
        const dentalCb = section.querySelector('#health_scl-dental');
        const msgEl = section.querySelector('.dynamic-validation-msg');
        
        dentalCb.disabled = !outpatientCb.checked;
        if (!outpatientCb.checked && dentalCb.checked) dentalCb.checked = false;

        let highestAllowed = ['co_ban', 'nang_cao', 'toan_dien', 'hoan_hao'];
        if(mainProductConfig?.group !== 'PACKAGE') {
            highestAllowed = ['nang_cao']; 
            params.premiumThresholds.forEach(tier => {
                if (mainPremium >= tier.minPremium) highestAllowed = tier.allowed;
            });
        }
        
        programSelect.querySelectorAll('option').forEach(opt => {
            const isAllowed = highestAllowed.includes(opt.value);
            opt.style.display = isAllowed ? '' : 'none'; // Hide instead of disabling
        });
        
        if (!highestAllowed.includes(programSelect.value)) {
            msgEl.textContent = `Phí chính không đủ điều kiện cho chương trình này.`;
            msgEl.classList.remove('hidden');
            // Attempt to select the highest available option instead of a fixed default
            const bestAllowed = highestAllowed.slice().reverse().find(p => programSelect.querySelector(`option[value="${p}"]`));
            if(bestAllowed) programSelect.value = bestAllowed;

        } else {
            msgEl.classList.add('hidden');
        }
    },
    hospital_support_hint: ({ section, customer, state }) => {
        const hintEl = section.querySelector('.text-sm');
        if(hintEl) {
           const mainPremium = state.fees.baseMain;
           const maxByAge = customer.age >= 18 ? 1000000 : 300000;
           const maxSupportTotal = Math.floor(mainPremium / 4000000) * GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE;
           let currentTotalStbh = 0;
           state.persons.forEach(p => {
                if (p.id !== customer.id && p.supplements?.hospital_support?.stbh) {
                   currentTotalStbh += p.supplements.hospital_support.stbh;
               }
           });
           const remaining = Math.max(0, maxSupportTotal - currentTotalStbh);
           hintEl.textContent = `Tối đa ${formatCurrency(Math.min(maxByAge, remaining))} đ/ngày. Phải là bội số của ${formatCurrency(GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE)}.`;
        }
   }
  }
};
