

/**
 * @file structure.js
 * @description
 * Tệp này là "bộ não" của ứng dụng, chứa tất cả dữ liệu cấu hình cho các sản phẩm bảo hiểm.
 * - GLOBAL_CONFIG: Các hằng số và quy tắc nghiệp vụ toàn cục.
 * - PRODUCT_CATALOG: Định nghĩa tất cả sản phẩm. Mỗi sản phẩm là một "bản thiết kế" chi tiết 
 *   mà logic.js sẽ đọc để tự động render UI, áp dụng quy tắc và tính phí.
 */
import { product_data, investment_data } from './data.js';

function formatCurrency(value) {
    return Number(value || 0).toLocaleString('vi-VN');
}
function roundDownTo1000(n) {
    return Math.floor(Number(n || 0) / 1000) * 1000;
}
// ===================================================================================
// ===== CẤU HÌNH TOÀN CỤC
// ===================================================================================
export const GLOBAL_CONFIG = {
    REFERENCE_DATE: new Date(),
    MAX_SUPPLEMENTARY_INSURED: 10,
    HOSPITAL_SUPPORT_STBH_MULTIPLE: 100000,
    PAYMENT_FREQUENCY_THRESHOLDS: {
        half: 7000000,
        quarter: 8000000,
    },
};

// ===================================================================================
// ===== HELPER FUNCTIONS (used inside PRODUCT_CATALOG)
// ===================================================================================
const HELPERS = {
    data: product_data,
    roundDownTo1000,
    findRate: (tablePath, age, genderKey, ageField = 'age') => {
        let table = tablePath.split('.').reduce((obj, key) => obj?.[key], product_data);
        return table?.find(r => r[ageField] === age)?.[genderKey] || 0;
    },
    findRateByRange: (tablePath, age, genderKey) => {
        let table = tablePath.split('.').reduce((obj, key) => obj?.[key], product_data);
        return table?.find(r => age >= r.ageMin && age <= r.ageMax)?.[genderKey] || 0;
    },
    findRateByTerm: (tablePath, term, age, genderKey) => {
        let table = tablePath.split('.').reduce((obj, key) => obj?.[key], product_data);
        return table?.[term]?.find(r => r.age === age)?.[genderKey] || 0;
    }
};

// ===================================================================================
// ===== BỘ NÃO CỦA ỨNG DỤNG: CATALOG SẢN PHẨM
// ===================================================================================
export const PRODUCT_CATALOG = {
    // =======================================================================
    // ===== SẢN PHẨM CHÍNH (MAIN PRODUCTS)
    // =======================================================================

    'PUL_TRON_DOI': {
        type: 'main',
        name: 'Khoẻ trọn vẹn - Trọn đời',
        slug: 'khoe-tron-ven',
        group: 'PUL',
        ui: {
            controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true,
                  validate: ({ value: stbh, basePremium }) => {
                    if (!stbh || stbh <= 0) return 'Vui lòng nhập Số tiền bảo hiểm';
                    if (stbh > 0 && stbh < 100000000) return 'STBH tối thiểu 100.000.000';
                    if (stbh < 1000000000 && basePremium > 0 && basePremium < 20000000) return 'Với STBH < 1 tỷ, phí tối thiểu là 20.000.000';
                    if (stbh >= 1000000000 && basePremium > 0 && basePremium < 5000000) return 'Với STBH >= 1 tỷ, phí tối thiểu là 5.000.000';
                    return null;
                  }
                },
                { id: 'payment-term', type: 'numberInput', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 20', required: true, defaultValue: 20,
                  getMinMax: (age) => ({ min: 4, max: 100 - age }), hintTextFn: (min, max) => `Nhập từ ${min} đến ${max} năm.`,
                  validate: ({ value, customer, config }) => {
                      if (!value) return 'Vui lòng nhập thời gian đóng phí';
                      const { min, max } = config.getMinMax(customer.age);
                      if (value < min || value > max) return `Nhập từ ${min} đến ${max} năm`;
                      return null;
                  }
                },
                { id: 'extra-premium', type: 'currencyInput', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa 5 lần phí chính.`,
                  validate: ({ value, basePremium }) => {
                    if (value > 0 && basePremium > 0 && value > 5 * basePremium) return 'Tối đa 5 lần phí chính';
                    return null;
                  }
                }
            ],
            validationMessages: { notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.' }
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ] },
        calculation: {
            calculate: ({ productInfo, customer }) => {
                if (!productInfo.values['main-stbh']) return 0;
                const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
                const rate = HELPERS.findRate('pul_rates.PUL_TRON_DOI', customer.age, genderKey);
                const premium = Math.round((productInfo.values['main-stbh'] / 1000) * rate);
                return HELPERS.roundDownTo1000(premium);
            }
        },
        accountValue: {
            enabled: true,
            calculateProjection: calculateGenericAccountValueProjection,
            config: {
                costOfInsuranceRef: 'pul_cost_of_insurance_rates',
                initialFeeRef: 'PUL_TRON_DOI',
                persistencyBonusRef: 'persistency_bonus',
                guaranteedInterestRef: 'guaranteed_interest_rates',
                includeExtraPremium: true,
                bonusType: 'standard_pul',
            }
        }
    },

    'PUL_15NAM': {
        type: 'main',
        name: 'Khoẻ trọn vẹn - 15 năm',
        slug: 'khoe-tron-ven',
        group: 'PUL',
        ui: {
             controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true,
                  validate: ({ value: stbh, basePremium }) => {
                    if (!stbh || stbh <= 0) return 'Vui lòng nhập Số tiền bảo hiểm';
                    if (stbh > 0 && stbh < 100000000) return 'STBH tối thiểu 100.000.000';
                    if (stbh < 1000000000 && basePremium > 0 && basePremium < 20000000) return 'Với STBH < 1 tỷ, phí tối thiểu là 20.000.000';
                    if (stbh >= 1000000000 && basePremium > 0 && basePremium < 5000000) return 'Với STBH >= 1 tỷ, phí tối thiểu là 5.000.000';
                    return null;
                  }
                },
                { id: 'payment-term', type: 'numberInput', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 15', required: true, defaultValue: 15,
                  getMinMax: (age) => ({ min: 15, max: 100 - age }), hintTextFn: (min, max) => `Nhập từ ${min} đến ${max} năm.`,
                  validate: ({ value, customer, config }) => {
                      if (!value) return 'Vui lòng nhập thời gian đóng phí';
                      const { min, max } = config.getMinMax(customer.age);
                      if (value < min || value > max) return `Nhập từ ${min} đến ${max} năm`;
                      return null;
                  }
                },
                { id: 'extra-premium', type: 'currencyInput', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa 5 lần phí chính.`,
                  validate: ({ value, basePremium }) => {
                    if (value > 0 && basePremium > 0 && value > 5 * basePremium) return 'Tối đa 5 lần phí chính';
                    return null;
                  }
                }
            ],
            validationMessages: { notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.' }
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ] },
        calculation: {
            calculate: ({ productInfo, customer }) => {
                if (!productInfo.values['main-stbh']) return 0;
                const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
                const rate = HELPERS.findRate('pul_rates.PUL_15NAM', customer.age, genderKey);
                const premium = Math.round((productInfo.values['main-stbh'] / 1000) * rate);
                return HELPERS.roundDownTo1000(premium);
            }
        },
        accountValue: {
            enabled: true,
            calculateProjection: calculateGenericAccountValueProjection,
            config: {
                costOfInsuranceRef: 'pul_cost_of_insurance_rates',
                initialFeeRef: 'PUL_15NAM',
                persistencyBonusRef: 'persistency_bonus',
                guaranteedInterestRef: 'guaranteed_interest_rates',
                includeExtraPremium: true,
                bonusType: 'standard_pul',
            }
        }
    },

    'PUL_5NAM': {
        type: 'main',
        name: 'Khoẻ trọn vẹn - 5 năm',
        slug: 'khoe-tron-ven',
        group: 'PUL',
        ui: {
             controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true,
                  validate: ({ value: stbh, basePremium }) => {
                    if (!stbh || stbh <= 0) return 'Vui lòng nhập Số tiền bảo hiểm';
                    if (stbh > 0 && stbh < 100000000) return 'STBH tối thiểu 100.000.000';
                    if (stbh < 1000000000 && basePremium > 0 && basePremium < 20000000) return 'Với STBH < 1 tỷ, phí tối thiểu là 20.000.000';
                    if (stbh >= 1000000000 && basePremium > 0 && basePremium < 5000000) return 'Với STBH >= 1 tỷ, phí tối thiểu là 5.000.000';
                    return null;
                  }
                },
                { id: 'payment-term', type: 'numberInput', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 5', required: true, defaultValue: 5,
                  getMinMax: (age) => ({ min: 5, max: 100 - age }), hintTextFn: (min, max) => `Nhập từ ${min} đến ${max} năm.`,
                  validate: ({ value, customer, config }) => {
                      if (!value) return 'Vui lòng nhập thời gian đóng phí';
                      const { min, max } = config.getMinMax(customer.age);
                      if (value < min || value > max) return `Nhập từ ${min} đến ${max} năm`;
                      return null;
                  }
                },
                { id: 'extra-premium', type: 'currencyInput', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa 5 lần phí chính.`,
                  validate: ({ value, basePremium }) => {
                    if (value > 0 && basePremium > 0 && value > 5 * basePremium) return 'Tối đa 5 lần phí chính';
                    return null;
                  }
                }
            ],
            validationMessages: { notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.' }
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ] },
        calculation: {
            calculate: ({ productInfo, customer }) => {
                if (!productInfo.values['main-stbh']) return 0;
                const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
                const rate = HELPERS.findRate('pul_rates.PUL_5NAM', customer.age, genderKey);
                const premium = Math.round((productInfo.values['main-stbh'] / 1000) * rate);
                return HELPERS.roundDownTo1000(premium);
            }
        },
        accountValue: {
            enabled: true,
            calculateProjection: calculateGenericAccountValueProjection,
            config: {
                costOfInsuranceRef: 'pul_cost_of_insurance_rates',
                initialFeeRef: 'PUL_5NAM',
                persistencyBonusRef: 'persistency_bonus',
                guaranteedInterestRef: 'guaranteed_interest_rates',
                includeExtraPremium: true,
                bonusType: 'standard_pul',
            }
        }
    },

    'KHOE_BINH_AN': {
        type: 'main',
        name: 'MUL - Khoẻ Bình An',
        slug: 'khoe-binh-an',
        group: 'MUL',
        ui: {
            controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true,
                  validate: ({ value }) => {
                      if (!value || value <= 0) return 'Vui lòng nhập Số tiền bảo hiểm';
                      if (value < 100000000) return 'STBH tối thiểu 100.000.000';
                      return null;
                  }
                },
                { id: 'main-premium', type: 'currencyInput', label: 'Phí sản phẩm chính', placeholder: 'Nhập phí', required: true, hintId: 'main-premium-hint',
                  onRender: ({ el, allValues, customer }) => {
                      const stbh = allValues['main-stbh'] || 0;
                      const factorRow = HELPERS.data.mul_factors.find(f => customer.age >= f.ageMin && customer.age <= f.ageMax);
                      const hintEl = el.parentElement.querySelector('#main-premium-hint');
                      if (stbh > 0 && factorRow && hintEl) {
                          const minFee = roundDownTo1000(stbh / factorRow.maxFactor);
                          const maxFee = roundDownTo1000(stbh / factorRow.minFactor);
                          hintEl.textContent = `Phí hợp lệ từ ${formatCurrency(minFee)} đến ${formatCurrency(maxFee)}.`;
                      } else if(hintEl) {
                          hintEl.textContent = '';
                      }
                  },
                  validate: ({ value, allValues, customer }) => {
                      if (!value) return 'Vui lòng nhập phí sản phẩm chính';
                      if (value < 5000000) return 'Phí tối thiểu 5.000.000';
                      const stbh = allValues['main-stbh'] || 0;
                      const factorRow = HELPERS.data.mul_factors.find(f => customer.age >= f.ageMin && customer.age <= f.ageMax);
                      if (stbh > 0 && factorRow) {
                          const minFee = roundDownTo1000(stbh / factorRow.maxFactor);
                          const maxFee = roundDownTo1000(stbh / factorRow.minFactor);
                          if (value < minFee || value > maxFee) return 'Phí không hợp lệ so với STBH';
                      }
                      return null;
                  }
                },
                { id: 'payment-term', type: 'numberInput', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 20', required: true, defaultValue: 20,
                  getMinMax: (age) => ({ min: 4, max: 100 - age }), hintTextFn: (min, max) => `Nhập từ ${min} đến ${max} năm.`,
                  validate: ({ value, customer, config }) => {
                      if (!value) return 'Vui lòng nhập thời gian đóng phí';
                      const { min, max } = config.getMinMax(customer.age);
                      if (value < min || value > max) return `Nhập từ ${min} đến ${max} năm`;
                      return null;
                  }
                },
                { id: 'extra-premium', type: 'currencyInput', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa 5 lần phí chính.`,
                  validate: ({ value, basePremium }) => {
                    if (value > 0 && basePremium > 0 && value > 5 * basePremium) return 'Tối đa 5 lần phí chính';
                    return null;
                  }
                }
            ],
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ] },
        calculation: { calculate: ({ productInfo }) => HELPERS.roundDownTo1000(productInfo.values['main-premium']) },
        accountValue: {
            enabled: true,
            calculateProjection: calculateGenericAccountValueProjection,
            config: {
                costOfInsuranceRef: 'mul_cost_of_insurance_rates',
                initialFeeRef: 'KHOE_BINH_AN',
                persistencyBonusRef: null,
                guaranteedInterestRef: 'guaranteed_interest_rates',
                includeExtraPremium: false,
                bonusType: 'mul_periodic',
            }
        }
    },

    'VUNG_TUONG_LAI': {
        type: 'main',
        name: 'MUL - Vững Tương Lai',
        slug: 'vung-tuong-lai',
        group: 'MUL',
        ui: {
             controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true,
                  validate: ({ value }) => {
                      if (!value || value <= 0) return 'Vui lòng nhập Số tiền bảo hiểm';
                      if (value < 100000000) return 'STBH tối thiểu 100.000.000';
                      return null;
                  }
                },
                { id: 'main-premium', type: 'currencyInput', label: 'Phí sản phẩm chính', placeholder: 'Nhập phí', required: true, hintId: 'main-premium-hint',
                  onRender: ({ el, allValues, customer }) => {
                      const stbh = allValues['main-stbh'] || 0;
                      const factorRow = HELPERS.data.mul_factors.find(f => customer.age >= f.ageMin && customer.age <= f.ageMax);
                      const hintEl = el.parentElement.querySelector('#main-premium-hint');
                      if (stbh > 0 && factorRow && hintEl) {
                          const minFee = roundDownTo1000(stbh / factorRow.maxFactor);
                          const maxFee = roundDownTo1000(stbh / factorRow.minFactor);
                          hintEl.textContent = `Phí hợp lệ từ ${formatCurrency(minFee)} đến ${formatCurrency(maxFee)}.`;
                      } else if(hintEl) {
                          hintEl.textContent = '';
                      }
                  },
                  validate: ({ value, allValues, customer }) => {
                      if (!value) return 'Vui lòng nhập phí sản phẩm chính';
                      if (value < 5000000) return 'Phí tối thiểu 5.000.000';
                      const stbh = allValues['main-stbh'] || 0;
                      const factorRow = HELPERS.data.mul_factors.find(f => customer.age >= f.ageMin && customer.age <= f.ageMax);
                      if (stbh > 0 && factorRow) {
                          const minFee = roundDownTo1000(stbh / factorRow.maxFactor);
                          const maxFee = roundDownTo1000(stbh / factorRow.minFactor);
                          if (value < minFee || value > maxFee) return 'Phí không hợp lệ so với STBH';
                      }
                      return null;
                  }
                },
                { id: 'payment-term', type: 'numberInput', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 20', required: true, defaultValue: 20,
                  getMinMax: (age) => ({ min: 4, max: 100 - age }), hintTextFn: (min, max) => `Nhập từ ${min} đến ${max} năm.`,
                  validate: ({ value, customer, config }) => {
                      if (!value) return 'Vui lòng nhập thời gian đóng phí';
                      const { min, max } = config.getMinMax(customer.age);
                      if (value < min || value > max) return `Nhập từ ${min} đến ${max} năm`;
                      return null;
                  }
                },
                { id: 'extra-premium', type: 'currencyInput', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa 5 lần phí chính.`,
                  validate: ({ value, basePremium }) => {
                    if (value > 0 && basePremium > 0 && value > 5 * basePremium) return 'Tối đa 5 lần phí chính';
                    return null;
                  }
                }
            ],
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ] },
        calculation: { calculate: ({ productInfo }) => HELPERS.roundDownTo1000(productInfo.values['main-premium']) },
        accountValue: {
            enabled: true,
            calculateProjection: calculateGenericAccountValueProjection,
            config: {
                costOfInsuranceRef: 'mul_cost_of_insurance_rates',
                initialFeeRef: 'VUNG_TUONG_LAI',
                persistencyBonusRef: null,
                guaranteedInterestRef: 'guaranteed_interest_rates',
                includeExtraPremium: false,
                bonusType: 'mul_periodic',
            }
        }
    },

    'AN_BINH_UU_VIET': {
        type: 'main',
        name: 'An Bình Ưu Việt',
        slug: 'an-binh-uu-viet',
        group: 'TRADITIONAL',
        ui: {
            controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 100.000.000', required: true, 
                  validate: ({ value }) => {
                       if (!value || value <= 0) return 'Vui lòng nhập Số tiền bảo hiểm';
                       if (value < 100000000) return 'STBH tối thiểu 100.000.000';
                       return null;
                  }
                },
                { id: 'abuv-term', type: 'select', label: 'Thời hạn đóng phí', required: true, hintText: 'Thời hạn đóng phí bằng thời hạn hợp đồng.',
                    options: [
                        { value: '15', label: '15 năm', condition: (p) => p.age <= 55 },
                        { value: '10', label: '10 năm', condition: (p) => p.age <= 60 },
                        { value: '5', label: '5 năm', condition: (p) => p.age <= 65 },
                    ],
                    validate: ({ value }) => !value ? 'Vui lòng chọn thời hạn' : null
                }
            ],
             validationMessages: { 
                 notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.',
                 minPremium: `Phí chính tối thiểu ${formatCurrency(5000000)}`
            }
        },
        rules: {
            eligibility: [
                { type: 'age', min: 12, max: 65, condition: (p) => p.gender === 'Nam' },
                { type: 'age', min: 28, max: 65, condition: (p) => p.gender === 'Nữ' },
            ],
            premium: { min: 5000000 }
        },
        calculation: {
            calculate: ({ productInfo, customer }) => {
                const stbh = productInfo.values['main-stbh'];
                const term = productInfo.values['abuv-term'];
                if (!stbh || !term) return 0;
                const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
                const rate = HELPERS.findRateByTerm('an_binh_uu_viet_rates', term, customer.age, genderKey);
                const premium = Math.round((stbh / 1000) * rate);
                return HELPERS.roundDownTo1000(premium);
            }
        }
    },
    
    'TRON_TAM_AN': {
        type: 'main',
        name: 'Trọn tâm an',
        slug: 'tron-tam-an',
        group: 'PACKAGE',
        packageConfig: {
            underlyingMainProduct: 'AN_BINH_UU_VIET', 
            fixedValues: { stbh: 100000000, paymentTerm: '10' },
            mandatoryRiders: ['health_scl'] 
        },
        ui: {
            controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', defaultValue: 100000000, disabled: true },
                { id: 'static-text', type: 'staticText', text: '<p class="text-sm text-gray-600 mt-1">Thời hạn đóng phí: 10 năm (bằng thời hạn hợp đồng). Thời gian bảo vệ: 10 năm.</p>' }
            ],
            validationMessages: { notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.' }
        },
        rules: {
            eligibility: [
                { type: 'age', min: 12, max: 60, condition: (p) => p.gender === 'Nam' },
                { type: 'age', min: 28, max: 60, condition: (p) => p.gender === 'Nữ' },
                { type: 'riskGroup', exclude: [4], required: true }
            ],
            noSupplementaryInsured: true
        },
        calculation: { calculate: () => 0 } // Phí được tính từ sản phẩm con
    },
    
    // =======================================================================
    // ===== SẢN PHẨM BỔ SUNG (RIDERS)
    // =======================================================================
    'health_scl': {
        type: 'rider',
        name: 'Sức khỏe Bùng Gia Lực',
        slug: 'bung-gia-luc',
        ui: {
            controls: [
                { id: 'health_scl-program', type: 'select', label: 'Quyền lợi chính',
                  options: [ { value: 'co_ban', label: 'Cơ bản' }, { value: 'nang_cao', label: 'Nâng cao' }, { value: 'toan_dien', label: 'Toàn diện' }, { value: 'hoan_hao', label: 'Hoàn hảo' } ],
                  defaultValue: 'nang_cao'
                },
                { id: 'health_scl-scope', type: 'select', label: 'Phạm vi địa lý',
                  options: [ { value: 'main_vn', label: 'Việt Nam' }, { value: 'main_global', label: 'Nước ngoài' } ],
                  defaultValue: 'main_vn'
                },
                { id: 'health_scl-options', type: 'checkboxGroup', label: 'Quyền lợi tùy chọn:', items: [
                    { id: 'health_scl-outpatient', label: 'Điều trị ngoại trú', hintId: 'scl-outpatient-fee-hint' },
                    { id: 'health_scl-dental', label: 'Chăm sóc nha khoa', hintId: 'scl-dental-fee-hint' }
                  ]
                }
            ],
            onRender: ({ section, customer, mainPremium, mainProductConfig }) => {
                const programSelect = section.querySelector('#health_scl-program');
                const outpatientCb = section.querySelector('#health_scl-outpatient');
                const dentalCb = section.querySelector('#health_scl-dental');
                const msgEl = section.querySelector('.dynamic-validation-msg');
                const outSpan = section.querySelector(`#scl-outpatient-fee-hint`);
                const dentalSpan = section.querySelector(`#scl-dental-fee-hint`);

                dentalCb.disabled = !outpatientCb.checked;
                if (!outpatientCb.checked && dentalCb.checked) dentalCb.checked = false;

                let highestAllowed = ['co_ban', 'nang_cao', 'toan_dien', 'hoan_hao'];
                if(mainProductConfig?.group !== 'PACKAGE') {
                    highestAllowed = ['nang_cao']; 
                    PRODUCT_CATALOG.health_scl.rules.dependencies.premiumThresholdsForProgram.forEach(tier => {
                        if (mainPremium >= tier.minPremium) highestAllowed = tier.allowed;
                    });
                }
                programSelect.querySelectorAll('option').forEach(opt => opt.disabled = !highestAllowed.includes(opt.value));
                
                if (programSelect.options[programSelect.selectedIndex]?.disabled) {
                    msgEl.textContent = `Phí chính không đủ điều kiện cho chương trình này.`;
                    msgEl.classList.remove('hidden');
                    programSelect.value = 'nang_cao';
                } else {
                    msgEl.classList.add('hidden');
                }

                // Update fee hints for options
                const comps = PRODUCT_CATALOG.health_scl.calculation.getFeeComponents(customer);
                if (outSpan) outSpan.textContent = (outpatientCb?.checked && comps.outpatient > 0) ? `(+${formatCurrency(comps.outpatient)})` : '';
                if (dentalSpan) dentalSpan.textContent = (dentalCb?.checked && comps.dental > 0) ? `(+${formatCurrency(comps.dental)})` : '';
            }
        },
        rules: {
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 65, renewalMax: 74 }, { type: 'riskGroup', exclude: [4], required: true } ],
            dependencies: {
                premiumThresholdsForProgram: [
                    { minPremium: 5000000, allowed: ['co_ban', 'nang_cao'] }, { minPremium: 10000000, allowed: ['co_ban', 'nang_cao', 'toan_dien'] }, { minPremium: 15000000, allowed: ['co_ban', 'nang_cao', 'toan_dien', 'hoan_hao'] }
                ]
            },
            stbhByProgram: { co_ban: 100000000, nang_cao: 250000000, toan_dien: 500000000, hoan_hao: 1000000000 }
        },
        calculation: {
            calculate: ({ customer, ageOverride }) => PRODUCT_CATALOG.health_scl.calculation.getFeeComponents(customer, ageOverride).total,
            getFeeComponents: (customer, ageOverride = null) => {
                const ageToUse = ageOverride ?? customer.age;
                const renewalMax = PRODUCT_CATALOG.health_scl.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
                if (ageToUse > renewalMax) return { base: 0, outpatient: 0, dental: 0, total: 0 };
                
                const suppData = customer.supplements?.health_scl || {};
                const { program, scope, outpatient, dental } = suppData;
                if (!program || !scope) return { base: 0, outpatient: 0, dental: 0, total: 0 };

                const ageBandIndex = HELPERS.data.health_scl_rates.age_bands.findIndex(b => ageToUse >= b.min && ageToUse <= b.max);
                if (ageBandIndex === -1) return { base: 0, outpatient: 0, dental: 0, total: 0 };
                
                const rates = HELPERS.data.health_scl_rates;
                const base = rates[scope]?.[ageBandIndex]?.[program] || 0;
                const outpatientFee = outpatient ? (rates.outpatient?.[ageBandIndex]?.[program] || 0) : 0;
                const dentalFee = (outpatient && dental) ? (rates.dental?.[ageBandIndex]?.[program] || 0) : 0;
                
                return { base, outpatient: outpatientFee, dental: dentalFee, total: HELPERS.roundDownTo1000(base + outpatientFee + dentalFee) };
            }
        }
    },

    'bhn': {
        type: 'rider',
        name: 'Bệnh Hiểm Nghèo 2.0',
        slug: 'bhn',
        ui: {
            controls: [ { id: 'bhn-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 200.000.000', hintText: 'STBH từ 200 triệu đến 5 tỷ.',
                          validate: ({ value }) => {
                            if (value > 0 && value < 200000000) return 'Tối thiểu 200.000.000';
                            if (value > 5000000000) return 'Tối đa 5.000.000.000';
                            return null;
                          }
            }]
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70, renewalMax: 85 } ] },
        calculation: {
            calculate: ({ customer, ageOverride }) => {
                const ageToUse = ageOverride ?? customer.age;
                const { stbh } = customer.supplements.bhn || {};
                if (!stbh) return 0;
                const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
                const rate = HELPERS.findRateByRange('bhn_rates', ageToUse, genderKey);
                return HELPERS.roundDownTo1000((stbh / 1000) * rate);
            }
        }
    },

    'accident': {
        type: 'rider',
        name: 'Bảo hiểm Tai nạn',
        slug: 'accident',
        ui: {
            controls: [ { id: 'accident-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 500.000.000', hintText: 'STBH từ 10 triệu đến 8 tỷ.',
                         validate: ({ value }) => {
                            if (value > 0 && value < 10000000) return 'Tối thiểu 10.000.000';
                            if (value > 8000000000) return 'Tối đa 8.000.000.000';
                            return null;
                          }
            }]
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 64, renewalMax: 65 }, { type: 'riskGroup', required: true } ] },
        calculation: {
            calculate: ({ customer, ageOverride }) => {
                const { stbh } = customer.supplements.accident || {};
                if (!stbh || !customer.riskGroup || customer.riskGroup > 4) return 0;
                const rate = HELPERS.data.accident_rates[customer.riskGroup] || 0;
                return HELPERS.roundDownTo1000((stbh / 1000) * rate);
            }
        }
    },

    'hospital_support': {
        type: 'rider',
        name: 'Hỗ trợ chi phí nằm viện',
        slug: 'hospital_support',
        category: 'hospital_support',
        ui: {
            controls: [
                { id: 'hospital_support-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'Bội số 100.000 (đ/ngày)',
                  validate: ({ value, customer, mainPremium, allPersons }) => {
                      if (value <= 0) return null;
                      if (value % 100000 !== 0) return 'Phải là bội số của 100.000';

                      const maxByAge = customer.age >= 18 ? 1000000 : 300000;
                      if (value > maxByAge) return `STBH tối đa cho tuổi ${customer.age} là ${formatCurrency(maxByAge)}`;

                      const maxSupportTotal = Math.floor(mainPremium / 4000000) * 100000;
                      let currentTotalStbh = 0;
                      allPersons.forEach(p => {
                          if (p.supplements?.hospital_support?.stbh) {
                              currentTotalStbh += p.supplements.hospital_support.stbh;
                          }
                      });
                      
                      if (currentTotalStbh > maxSupportTotal) return `Tổng STBH Hỗ trợ viện phí (${formatCurrency(currentTotalStbh)}) vượt quá giới hạn cho phép theo phí chính (${formatCurrency(maxSupportTotal)})`;
                      
                      return null;
                  }
                }
            ],
            onRender: ({ section, customer, mainPremium, allPersons }) => {
                 const hintEl = section.querySelector('.text-sm');
                 if(hintEl) {
                    const maxByAge = customer.age >= 18 ? 1000000 : 300000;
                    const maxSupportTotal = Math.floor(mainPremium / 4000000) * 100000;
                    let currentTotalStbh = 0;
                      allPersons.forEach(p => {
                           if (p.id !== customer.id && p.supplements?.hospital_support?.stbh) {
                              currentTotalStbh += p.supplements.hospital_support.stbh;
                          }
                      });
                    const remaining = Math.max(0, maxSupportTotal - currentTotalStbh);
                    hintEl.textContent = `Tối đa ${formatCurrency(Math.min(maxByAge, remaining))} đ/ngày. Phải là bội số của 100.000.`;
                 }
            }
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 55, renewalMax: 59 } ] },
        calculation: {
            calculate: ({ customer, ageOverride }) => {
                const ageToUse = ageOverride ?? customer.age;
                const { stbh } = customer.supplements.hospital_support || {};
                if (!stbh) return 0;
                const rate = HELPERS.findRateByRange('hospital_fee_support_rates', ageToUse, 'rate');
                return HELPERS.roundDownTo1000((stbh / 100) * rate);
            }
        }
    },
    'mdp3': {
        type: 'rider',
        name: 'Miễn đóng phí 3.0',
        slug: 'mien-dong-phi-3',
        isStandalone: true,
        ui: {
            controls: []
        },
        rules: {
            eligibility: [ { type: 'age', min: 18, max: 60, renewalMax: 64 }, { type: 'riskGroup', required: true } ],
        },
        calculation: {
            calculate: (personInfo, stbhBase, helpers) => {
                 if(!personInfo || !stbhBase || personInfo.age < 18 || personInfo.age > 60 || !personInfo.riskGroup) return 0;
                 
                 const riskGroup = personInfo.riskGroup;
                 let riskFactor = 1.0;
                 if (riskGroup === 2 || riskGroup === 3) {
                     riskFactor = 1.5;
                 } else if (riskGroup === 4) {
                     riskFactor = 2.0;
                 }
                 
                 const genderKey = personInfo.gender === 'Nữ' ? 'nu' : 'nam';
                 const rate = helpers.data.mdp3_rates.find(r => personInfo.age >= r.ageMin && personInfo.age <= r.ageMax)?.[genderKey] || 0;
                 
                 const premium = (stbhBase / 1000) * rate * riskFactor;
                 
                 return helpers.roundDownTo1000(premium);
            }
        }
    }
};

/**
 * Generic function to calculate account value projection.
 * It reads configuration from the product definition.
 */
function calculateGenericAccountValueProjection(productConfig, args, helpers) {
    const { mainPerson, mainProduct, basePremium, extraPremium, targetAge, customInterestRate, paymentFrequency } = args;
    const { investment_data, roundDownTo1000, GLOBAL_CONFIG } = helpers;
    const accountValueConfig = productConfig.accountValue.config;

    const { gender, age: initialAge } = mainPerson;
    const { key: productKey, values } = mainProduct;
    const stbhInitial = values['main-stbh'] || 0;
    const paymentTerm = values['payment-term'] || 0;
    
    const { initial_fees, guaranteed_interest_rates, admin_fees } = investment_data;

    const costOfInsuranceRates = investment_data[accountValueConfig.costOfInsuranceRef] || [];
    const persistencyBonusRates = investment_data[accountValueConfig.persistencyBonusRef] || [];

    const totalYears = targetAge - initialAge + 1;
    const totalMonths = totalYears * 12;

    let parsedCustom = parseFloat(customInterestRate) || 0;
    const customRate = (parsedCustom > 1) ? (parsedCustom / 100) : parsedCustom;

    const roundVND = (v) => Math.round(v || 0);

    let scenarios = {
        guaranteed: { accountValue: 0, yearEndValues: [] },
        customCapped: { accountValue: 0, yearEndValues: [] },
        customFull: { accountValue: 0, yearEndValues: [] },
    };
    
    let periods = 1;
    if (paymentFrequency === 'half') periods = 2;
    if (paymentFrequency === 'quarter') periods = 4;

    const annualBasePremium = Number(basePremium || 0);
    const annualExtraPremium = Number(extraPremium || 0);
    const basePremiumPerPeriod = periods > 1 ? roundDownTo1000(annualBasePremium / periods) : annualBasePremium;
    const extraPremiumPerPeriod = periods > 1 ? roundDownTo1000(annualExtraPremium / periods) : annualExtraPremium;

    const startDate = (typeof GLOBAL_CONFIG !== 'undefined' && GLOBAL_CONFIG.REFERENCE_DATE) ? GLOBAL_CONFIG.REFERENCE_DATE : new Date();
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;

    const getCalendarYearFromStart = (month) => {
        const startMonthZero = startMonth - 1;
        const monthIndexFromStart = startMonthZero + (month - 1);
        return startYear + Math.floor(monthIndexFromStart / 12);
    };

    const getStbhForPolicyYear = (policyYear) => {
        if (productKey === 'KHOE_BINH_AN') {
            const initial = Number(stbhInitial) || 0;
            if (policyYear === 1) return initial;
            if (policyYear >= 2 && policyYear <= 11) {
                const extraYears = policyYear - 1;
                return initial + Math.round(initial * 0.05 * extraYears);
            }
            return initial + Math.round(initial * 0.05 * 10);
        }
        return Number(stbhInitial) || 0;
    };

    const getAdminFeeForYear = (calendarYear) => {
        if (!admin_fees) return 0;
        if (admin_fees[calendarYear] !== undefined) return Number(admin_fees[calendarYear]) || 0;
        if (admin_fees[String(calendarYear)] !== undefined) return Number(admin_fees[String(calendarYear)]) || 0;
        return Number(admin_fees.default) || 0;
    };

    for (let month = 1; month <= totalMonths; month++) {
        const policyYear = Math.floor((month - 1) / 12) + 1;
        const attainedAge = initialAge + policyYear - 1;
        const genderKey = (gender === 'Nữ' || gender === 'Nu' || gender === 'nu') ? 'nu' : 'nam';
        const calendarYear = getCalendarYearFromStart(month);
        
        let isPaymentMonth = false;
        const monthInYear = ((month - 1) % 12) + 1;

        if (periods === 1 && monthInYear === 1) isPaymentMonth = true;
        if (periods === 2 && (monthInYear === 1 || monthInYear === 7)) isPaymentMonth = true;
        if (periods === 4 && (monthInYear === 1 || monthInYear === 4 || monthInYear === 10)) isPaymentMonth = true;

        for (const key in scenarios) {
            let currentAccountValue = scenarios[key].accountValue || 0;
            let premiumIn = 0;
            let initialFee = 0;
            
            if (isPaymentMonth && policyYear <= paymentTerm) {
                let baseIn = basePremiumPerPeriod;
                let extraIn = accountValueConfig.includeExtraPremium ? extraPremiumPerPeriod : 0;
                premiumIn = baseIn + extraIn;
                
                const initialFeeRateBase = ((initial_fees && initial_fees[accountValueConfig.initialFeeRef]) || {})[policyYear] || 0;
                const extraInitRate = (initial_fees && initial_fees.EXTRA) ? initial_fees.EXTRA : 0;
                initialFee = roundVND((baseIn * Number(initialFeeRateBase || 0)) +
                                      (extraIn * Number(extraInitRate || 0)));
            }

            const investmentAmount = currentAccountValue + premiumIn - initialFee;
            const adminFee = getAdminFeeForYear(calendarYear) / 12;
            const stbhCurrent = getStbhForPolicyYear(policyYear);
            
            const riskRateRecord = costOfInsuranceRates.find(r => Number(r.age) === Number(attainedAge));
            const riskRate = riskRateRecord ? (riskRateRecord[genderKey] || 0) : 0;
            const sumAtRisk = Math.max(0, stbhCurrent - investmentAmount);

            let costOfInsurance = (sumAtRisk * riskRate) / 1000 / 12;
            costOfInsurance = roundVND(costOfInsurance);

            const netInvestmentAmount = investmentAmount - adminFee - costOfInsurance;
            
            let guaranteedRate = 0;
            const guaranteedRateRaw = (guaranteed_interest_rates && (guaranteed_interest_rates[policyYear] !== undefined))
                ? guaranteed_interest_rates[policyYear]
                : (guaranteed_interest_rates && guaranteed_interest_rates.default ? guaranteed_interest_rates.default : 0);
            guaranteedRate = Number(guaranteedRateRaw) || 0;
            guaranteedRate = (guaranteedRate > 1) ? (guaranteedRate / 100) : guaranteedRate;

            let interestRateYearly = 0;
            if (key === 'guaranteed') {
                interestRateYearly = guaranteedRate;
            } else if (key === 'customCapped') {
                interestRateYearly = (policyYear <= 20) ? Math.max(customRate, guaranteedRate) : guaranteedRate;
            } else {
                interestRateYearly = Math.max(customRate, guaranteedRate);
            }

            const monthlyInterestRate = Math.pow(1 + interestRateYearly, 1 / 12) - 1;
            let interest = netInvestmentAmount * monthlyInterestRate;
            interest = roundVND(interest);

            let bonus = 0;
            const isLastMonthOfPolicyYear = (month % 12 === 0);

            if (accountValueConfig.bonusType === 'mul_periodic') {
                if (policyYear >= 5 && policyYear <= paymentTerm && isLastMonthOfPolicyYear) {
                    bonus = annualBasePremium * 0.03;
                }
            } else if (accountValueConfig.bonusType === 'standard_pul') {
                const bonusInfo = (persistencyBonusRates || []).find(b => b.year === policyYear);
                if (bonusInfo && isLastMonthOfPolicyYear) {
                    const bonusYear = bonusInfo.year;
                    if ( (bonusYear === 10 && paymentTerm >= 10) ||
                         (bonusYear === 20 && paymentTerm >= 20) ||
                         (bonusYear === 30 && paymentTerm >= 30) ) {
                        bonus = annualBasePremium * bonusInfo.rate;
                    }
                }
            }
            bonus = roundVND(bonus);

            scenarios[key].accountValue = Math.max(0, roundVND(netInvestmentAmount + interest + bonus));

            if (month % 12 === 0) {
                scenarios[key].yearEndValues.push(scenarios[key].accountValue);
            }
        }
    }

    return {
        guaranteed: scenarios.guaranteed.yearEndValues,
        customCapped: scenarios.customCapped.yearEndValues,
        customFull: scenarios.customFull.yearEndValues,
    };
}
// ===== THÊM VÀO structure.js =====
// ===== THÊM VÀO structure.js =====

// Danh sách TẤT CẢ các sản phẩm Waiver of Premium
export const WAIVER_PRODUCTS = {
    'mdp3': {
        id: 'mdp3',
        name: 'Miễn đóng phí 3.0',
        productKey: 'mdp3', // Link to PRODUCT_CATALOG
        enabled: true, // Bật/tắt sản phẩm này
        
        ui: {
            enableCheckboxLabel: 'Bật Miễn đóng phí 3.0',
            personSelectLabel: 'Áp dụng cho',
            personSelectPlaceholder: '-- Chọn người --',
            otherPersonOption: { value: 'other', label: 'Người khác' },
            
            otherPersonForm: {
                title: 'Người được miễn đóng phí',
            },
            
            feeDisplayTemplate: 'STBH: {stbhBase} | Phí: {premium}',
            noEligibleMessage: 'STBH: {stbhBase} | Phí: — (Người không hợp lệ)'
        },
        
        rules: {
            eligibility: {
                minAge: 18,
                maxAge: 60,
                excludeMainPerson: true,
                message: 'Tuổi phải từ 18-60'
            },
            
            stbhCalculation: {
                includeMainBasePremium: true,
                includeAllRiders: true,
                excludeRidersOfWaivedPerson: true,
                excludeRiderCategories: ['waiver_of_premium']
            }
        },
        
        validationMessages: {
            noPersonSelected: 'Vui lòng chọn người được miễn đóng phí',
            invalidAge: 'Tuổi phải từ {minAge}-{maxAge}',
            invalidDob: 'Ngày sinh không hợp lệ'
        }
    },
    
    // ===== THÊM MDP4 (ví dụ) =====
    'mdp4': {
        id: 'mdp4',
        name: 'Miễn đóng phí 4.0',
        productKey: 'mdp4',
        enabled: false, // Tắt tạm thời, bật khi ra mắt
        
        ui: {
            enableCheckboxLabel: 'Bật Miễn đóng phí 4.0 (Mới!)',
            personSelectLabel: 'Chọn người được miễn',
            personSelectPlaceholder: '-- Chọn --',
            otherPersonOption: { value: 'other', label: 'Người khác' },
            
            otherPersonForm: {
                title: 'Thông tin người được miễn',
                fields: [
                    { id: 'name', type: 'text', label: 'Họ và Tên', required: true },
                    { id: 'dob', type: 'date', label: 'Ngày sinh', placeholder: 'DD/MM/YYYY', required: true },
                    { id: 'gender', type: 'select', label: 'Giới tính', options: [
                        { value: 'Nam', label: 'Nam' },
                        { value: 'Nữ', label: 'Nữ' }
                    ]},
                    // MDP4 có thêm trường mới
                    { id: 'occupation', type: 'text', label: 'Nghề nghiệp', required: true }
                ]
            },
            
            feeDisplayTemplate: 'Cơ sở: {stbhBase} | Phí MDP4: {premium}',
            noEligibleMessage: 'Cơ sở: {stbhBase} | Không đủ điều kiện'
        },
        
        rules: {
            eligibility: {
                minAge: 20, // MDP4 khác: 20-65 tuổi
                maxAge: 65,
                excludeMainPerson: false, // MDP4 cho phép NĐBH chính
                message: 'Tuổi phải từ 20-65'
            },
            
            stbhCalculation: {
                includeMainBasePremium: true,
                includeAllRiders: true,
                excludeRidersOfWaivedPerson: false, // MDP4 không trừ
                excludeRiderCategories: ['waiver_of_premium'],
                multiplier: 1.2 // MDP4 có hệ số nhân khác
            }
        },
        
        validationMessages: {
            noPersonSelected: 'Vui lòng chọn người',
            invalidAge: 'Tuổi từ {minAge}-{maxAge}',
            invalidDob: 'Ngày sinh không hợp lệ',
            invalidOccupation: 'Vui lòng nhập nghề nghiệp'
        }
    }
};

// Helper: Lấy danh sách sản phẩm đang enabled
export function getEnabledWaiverProducts() {
    return Object.values(WAIVER_PRODUCTS).filter(p => p.enabled);
}
