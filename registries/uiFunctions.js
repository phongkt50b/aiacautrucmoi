

import { product_data, BM_SCL_PROGRAMS } from '../data.js';
import { roundDownTo1000, formatCurrency } from '../utils.js'; // Import shared utils
import { GLOBAL_CONFIG, PRODUCT_CATALOG } from '../structure.js';

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
      // --- BẮT ĐẦU PHẦN BỔ SUNG ĐỂ HIỂN THỊ PHÍ ---
       const program = programSelect.value;
        const ageToUse = customer.age;

        const ageBandIndex = product_data.health_scl_rates.age_bands.findIndex(b => ageToUse >= b.min && ageToUse <= b.max);
        
        if (program && ageBandIndex !== -1) {
            const rates = product_data.health_scl_rates;
            
            const outpatientFee = rates.outpatient?.[ageBandIndex]?.[program] || 0;
            const dentalFee = rates.dental?.[ageBandIndex]?.[program] || 0;
            
            const outpatientHintEl = section.querySelector('#scl-outpatient-fee-hint');
            const dentalHintEl = section.querySelector('#scl-dental-fee-hint');
            
            if (outpatientHintEl) {
                outpatientHintEl.textContent = (outpatientFee > 0 && outpatientCb.checked) ? `+ ${formatCurrency(outpatientFee)}` : '';
            }
            if (dentalHintEl) {
                dentalHintEl.textContent = (dentalFee > 0 && dentalCb.checked) ? `+ ${formatCurrency(dentalFee)}` : '';
            }
        }
        // --- KẾT THÚC PHẦN BỔ SUNG ---
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
  },
  
  // ===================================================
  // ===== NEW REGISTRIES FOR DATA-DRIVEN LOGIC
  // ===================================================

  displayName: {
    scl_dynamic_display: ({ data }) => {
        const programLabel = BM_SCL_PROGRAMS[data.program]?.label || '';
        const scopeLabel = data.scope === 'main_global' ? ' (Toàn cầu' : '(Việt Nam';
        const options = [];
        if (data.outpatient) options.push('Ngoại trú');
        if (data.dental) options.push('Nha khoa');
        const optionsLabel = options.length ? `, ${options.join(', ')})` : ')';
        return `Sức khỏe Bùng Gia Lực - ${programLabel} ${scopeLabel}${optionsLabel}`;
    }
  },

  valueTransformers: {
      roundToThousand: (raw) => roundDownTo1000(raw),
      roundToHospitalSupportMultiple: (raw) => {
          const multiple = GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE || 100000;
          return Math.floor(raw / multiple) * multiple;
      }
  },
  
  stbh: {
      from_control: ({ data }) => data.stbh || 0,
      scl_stbh_from_program: ({ data }) => {
          const config = PRODUCT_CATALOG['health_scl'];
          return config?.rules.stbhByProgram?.[data.program] || 0;
      }
  },

  bmColumnData: {
      default_stbh: ({ productKey, person, data }) => ({
          productKey,
          sumAssured: data.stbh || 0,
          persons: [person]
      }),
      hospital_support_column_data: ({ productKey, person, data }) => ({
        productKey,
        sumAssured: data.stbh || 0, // In this case, sumAssured is the daily amount
        persons: [person]
      }),
      scl_column_data: ({ productKey, person, data }) => ({
          productKey,
          program: data.program,
          sumAssured: 0, // STBH is derived from program inside the formula
          persons: [person],
          flags: {
              scope: data.scope,
              outpatient: data.outpatient,
              dental: data.dental,
              maternity: data.program === 'toan_dien' || data.program === 'hoan_hao' && person.gender === 'Nữ'
          }
      }),
      bhn_column_data: ({ productKey, person, data }) => ({
          productKey,
          sumAssured: data.stbh || 0,
          persons: [person],
          flags: {
              child: person.age < 21,
              elder: person.age >= 55
          }
      })
  },

  bmFormulas: {
    percentOfSa: (col, params) => (col.sumAssured || 0) * (params.percent || 0),
    percentOfSaWithCap: (col, params) => Math.min((col.sumAssured || 0) * (params.percent || 0), params.cap || Infinity),
    fromProg: (col, params) => BM_SCL_PROGRAMS[col.program]?.[params.field] || 0,
    fromProgFmt: (col, params) => {
        const val = BM_SCL_PROGRAMS[col.program]?.[params.field];
        return val ? `${formatCurrency(val)}${params.suffix || ''}` : '—';
    },
    fromProgFmtCommonDisease: (col, params) => {
        const val = BM_SCL_PROGRAMS[col.program]?.[params.field];
        return val ? formatCurrency(val) : 'Theo Chi phí y tế';
    },
    fromProgWithFallbackText: (col, params) => {
        const val = BM_SCL_PROGRAMS[col.program]?.[params.field];
        return val ? formatCurrency(val) : 'Không áp dụng';
    },
    daily: (col) => col.sumAssured || 0,
    dailyX2: (col) => (col.sumAssured || 0) * 2,
    rangeFromSa: (col, params) => {
        const min = (col.sumAssured || 0) * (params.minPercent || 0);
        const max = (col.sumAssured || 0) * (params.maxPercent || 0);
        return `Từ ${formatCurrency(min)} đến ${formatCurrency(max)}`;
    }
  }
};
