

/**
 * @file data.js
 * @description
 * Tệp này chứa tất cả dữ liệu cấu hình cho các sản phẩm bảo hiểm, được thiết kế theo kiến trúc "hướng dữ liệu".
 * - GLOBAL_CONFIG: Chứa tất cả các hằng số và quy tắc nghiệp vụ toàn cục.
 * - PRODUCT_CATALOG: "Bộ não" của ứng dụng, định nghĩa tất cả sản phẩm (chính, bổ sung, gói).
 *   Mỗi sản phẩm là một "bản thiết kế" chi tiết mà logic.js sẽ đọc để tự động render UI, áp dụng quy tắc và tính phí.
 */
import { product_data, investment_data } from './data.js';

function formatCurrency(value) {
    return Number(value || 0).toLocaleString('vi-VN');
}
// ===================================================================================
// ===== CẤU HÌNH TOÀN CỤC (GLOBAL CONFIG & BUSINESS RULES)
// ===================================================================================
export const GLOBAL_CONFIG = {
    REFERENCE_DATE: new Date(),
    MAX_SUPPLEMENTARY_INSURED: 10,
    MAIN_PRODUCT_MIN_PREMIUM: 5000000,
    MAIN_PRODUCT_MIN_STBH: 100000000,
    PUL_MIN_PREMIUM_OR: 20000000,
    PUL_MIN_STBH_OR: 1000000000,
    EXTRA_PREMIUM_MAX_FACTOR: 5,
    PAYMENT_FREQUENCY_THRESHOLDS: {
        half: 7000000,
        quarter: 8000000,
    },
    HOSPITAL_SUPPORT_STBH_MULTIPLE: 100000,
};

// ===================================================================================
// ===== BỘ NÃO CỦA ỨNG DỤNG: CATALOG SẢN PHẨM (PRODUCT_CATALOG)
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
                { type: 'currencyInput', id: 'main-stbh', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true, validationMessages: { required: 'Vui lòng nhập STBH'}},
                { type: 'numberInput', id: 'payment-term', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 20', required: true, defaultValue: 20, getMinMax: (age) => ({ min: 4, max: 100 - age }), hintTextFn: (min, max) => `Nhập từ ${min} đến ${max} năm.`, validationMessages: { required: 'Vui lòng nhập thời gian đóng phí', range: ({min, max}) => `Nhập từ ${min} đến ${max} năm` } },
                { type: 'currencyInput', id: 'extra-premium', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa ${GLOBAL_CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính.`, validationMessages: { max: (factor) => `Tối đa ${factor} lần phí chính` } }
            ],
            validationMessages: {
                required: 'Vui lòng chọn sản phẩm chính',
                notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.',
                ridersDisabled: 'Cần STBH hoặc Phí chính hợp lệ để thêm sản phẩm bổ sung.'
            }
        },
        rules: {
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ],
            stbh: { special: 'PUL_ELIGIBILITY' },
            premium: { special: 'PUL_ELIGIBILITY' },
            paymentTerm: { min: 4, maxFn: (age) => 100 - age, default: 20 },
            extraPremium: { maxFactorOfBase: 5 }
        },
        calculation: {
            calculate: (prodConfig, customer, productInfo, helpers) => {
                if (productInfo.stbh === 0) return 0;
                const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
                const rate = helpers.findRate('pul_rates.PUL_TRON_DOI', customer.age, genderKey);
                const premium = Math.round((productInfo.stbh / 1000) * rate);
                return helpers.roundDownTo1000(premium);
            }
        },
        accountValue: {
            enabled: true,
            costOfInsuranceRef: 'pul_cost_of_insurance_rates',
            initialFeeRef: 'PUL_TRON_DOI',
            persistencyBonusRef: 'persistency_bonus',
            guaranteedInterestRef: 'guaranteed_interest_rates',
            useGuaranteedInterest: true,
            includeExtraPremium: true,
            bonusType: 'standard_pul',
            calculateProjection: calculateGenericAccountValueProjection,
        }
    },

    'PUL_15NAM': {
        type: 'main',
        name: 'Khoẻ trọn vẹn - 15 năm',
        slug: 'khoe-tron-ven',
        group: 'PUL',
        ui: {
            controls: [
                { type: 'currencyInput', id: 'main-stbh', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true, validationMessages: { required: 'Vui lòng nhập STBH'}},
                { type: 'numberInput', id: 'payment-term', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 15', required: true, defaultValue: 15, getMinMax: (age) => ({ min: 15, max: 100 - age }), hintTextFn: (min, max) => `Nhập từ ${min} đến ${max} năm.`, validationMessages: { required: 'Vui lòng nhập thời gian đóng phí', range: ({min, max}) => `Nhập từ ${min} đến ${max} năm` } },
                { type: 'currencyInput', id: 'extra-premium', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa ${GLOBAL_CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính.`, validationMessages: { max: (factor) => `Tối đa ${factor} lần phí chính` } }
            ],
            validationMessages: {
                required: 'Vui lòng chọn sản phẩm chính',
                notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.',
                ridersDisabled: 'Cần STBH hoặc Phí chính hợp lệ để thêm sản phẩm bổ sung.'
            }
        },
        rules: {
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ],
            stbh: { special: 'PUL_ELIGIBILITY' },
            premium: { special: 'PUL_ELIGIBILITY' },
            paymentTerm: { min: 15, maxFn: (age) => 100 - age, default: 15 },
            extraPremium: { maxFactorOfBase: 5 }
        },
        calculation: {
            calculate: (prodConfig, customer, productInfo, helpers) => {
                if (productInfo.stbh === 0) return 0;
                const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
                const rate = helpers.findRate('pul_rates.PUL_15NAM', customer.age, genderKey);
                const premium = Math.round((productInfo.stbh / 1000) * rate);
                return helpers.roundDownTo1000(premium);
            }
        },
        accountValue: {
            enabled: true,
            costOfInsuranceRef: 'pul_cost_of_insurance_rates',
            initialFeeRef: 'PUL_15NAM',
            persistencyBonusRef: 'persistency_bonus',
            guaranteedInterestRef: 'guaranteed_interest_rates',
            useGuaranteedInterest: true,
            includeExtraPremium: true,
            bonusType: 'standard_pul',
            calculateProjection: calculateGenericAccountValueProjection,
        }
    },

    'PUL_5NAM': {
        type: 'main',
        name: 'Khoẻ trọn vẹn - 5 năm',
        slug: 'khoe-tron-ven',
        group: 'PUL',
        ui: {
             controls: [
                { type: 'currencyInput', id: 'main-stbh', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true, validationMessages: { required: 'Vui lòng nhập STBH'}},
                { type: 'numberInput', id: 'payment-term', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 5', required: true, defaultValue: 5, getMinMax: (age) => ({ min: 5, max: 100 - age }), hintTextFn: (min, max) => `Nhập từ ${min} đến ${max} năm.`, validationMessages: { required: 'Vui lòng nhập thời gian đóng phí', range: ({min, max}) => `Nhập từ ${min} đến ${max} năm` } },
                { type: 'currencyInput', id: 'extra-premium', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa ${GLOBAL_CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính.`, validationMessages: { max: (factor) => `Tối đa ${factor} lần phí chính` } }
            ],
            validationMessages: {
                required: 'Vui lòng chọn sản phẩm chính',
                notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.',
                ridersDisabled: 'Cần STBH hoặc Phí chính hợp lệ để thêm sản phẩm bổ sung.'
            }
        },
        rules: {
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ],
            stbh: { special: 'PUL_ELIGIBILITY' },
            premium: { special: 'PUL_ELIGIBILITY' },
            paymentTerm: { min: 5, maxFn: (age) => 100 - age, default: 5 },
            extraPremium: { maxFactorOfBase: 5 }
        },
        calculation: {
            calculate: (prodConfig, customer, productInfo, helpers) => {
                if (productInfo.stbh === 0) return 0;
                const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
                const rate = helpers.findRate('pul_rates.PUL_5NAM', customer.age, genderKey);
                const premium = Math.round((productInfo.stbh / 1000) * rate);
                return helpers.roundDownTo1000(premium);
            }
        },
        accountValue: {
            enabled: true,
            costOfInsuranceRef: 'pul_cost_of_insurance_rates',
            initialFeeRef: 'PUL_5NAM',
            persistencyBonusRef: 'persistency_bonus',
            guaranteedInterestRef: 'guaranteed_interest_rates',
            useGuaranteedInterest: true,
            includeExtraPremium: true,
            bonusType: 'standard_pul',
            calculateProjection: calculateGenericAccountValueProjection,
        }
    },

    'KHOE_BINH_AN': {
        type: 'main',
        name: 'MUL - Khoẻ Bình An',
        slug: 'khoe-binh-an',
        group: 'MUL',
        ui: {
            controls: [
                { type: 'currencyInput', id: 'main-stbh', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true, validationMessages: { required: 'Vui lòng nhập STBH', min: (val) => `STBH tối thiểu ${formatCurrency(val)}` } },
                { type: 'currencyInput', id: 'main-premium', label: 'Phí sản phẩm chính', placeholder: 'Nhập phí', hintId: 'mul-fee-range', validationMessages: { required: 'Vui lòng nhập phí sản phẩm chính', invalid: 'Phí không hợp lệ so với STBH', min: (val) => `Phí tối thiểu ${formatCurrency(val)}`, rangeHint: ({min, max}) => `Phí hợp lệ từ ${min} đến ${max}.` } },
                { type: 'numberInput', id: 'payment-term', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 20', required: true, defaultValue: 20, getMinMax: (age) => ({ min: 4, max: 100 - age }), hintTextFn: (min, max) => `Nhập từ ${min} đến ${max} năm.`, validationMessages: { required: 'Vui lòng nhập thời gian đóng phí', range: ({min, max}) => `Nhập từ ${min} đến ${max} năm` } },
                { type: 'currencyInput', id: 'extra-premium', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa ${GLOBAL_CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính.`, validationMessages: { max: (factor) => `Tối đa ${factor} lần phí chính` } }
            ],
            validationMessages: {
                required: 'Vui lòng chọn sản phẩm chính',
                notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.',
            }
        },
        rules: {
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ],
            stbh: { min: 100000000 },
            premium: { min: 5000000, special: 'MUL_FACTOR_CHECK' },
            paymentTerm: { min: 4, maxFn: (age) => 100 - age, default: 20 },
            extraPremium: { maxFactorOfBase: 5 }
        },
        calculation: {
            calculate: (prodConfig, customer, productInfo, helpers) => {
                return helpers.roundDownTo1000(productInfo.premium);
            }
        },
        accountValue: {
            enabled: true,
            costOfInsuranceRef: 'mul_cost_of_insurance_rates',
            initialFeeRef: 'KHOE_BINH_AN',
            persistencyBonusRef: null,
            guaranteedInterestRef: 'guaranteed_interest_rates',
            useGuaranteedInterest: true,
            includeExtraPremium: false,
            bonusType: 'mul_periodic',
            calculateProjection: calculateGenericAccountValueProjection,
        }
    },

    'VUNG_TUONG_LAI': {
        type: 'main',
        name: 'MUL - Vững Tương Lai',
        slug: 'vung-tuong-lai',
        group: 'MUL',
        ui: {
            controls: [
                { type: 'currencyInput', id: 'main-stbh', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true, validationMessages: { required: 'Vui lòng nhập STBH', min: (val) => `STBH tối thiểu ${formatCurrency(val)}` } },
                { type: 'currencyInput', id: 'main-premium', label: 'Phí sản phẩm chính', placeholder: 'Nhập phí', hintId: 'mul-fee-range', validationMessages: { required: 'Vui lòng nhập phí sản phẩm chính', invalid: 'Phí không hợp lệ so với STBH', min: (val) => `Phí tối thiểu ${formatCurrency(val)}`, rangeHint: ({min, max}) => `Phí hợp lệ từ ${min} đến ${max}.` } },
                { type: 'numberInput', id: 'payment-term', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 20', required: true, defaultValue: 20, getMinMax: (age) => ({ min: 4, max: 100 - age }), hintTextFn: (min, max) => `Nhập từ ${min} đến ${max} năm.`, validationMessages: { required: 'Vui lòng nhập thời gian đóng phí', range: ({min, max}) => `Nhập từ ${min} đến ${max} năm` } },
                { type: 'currencyInput', id: 'extra-premium', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa ${GLOBAL_CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính.`, validationMessages: { max: (factor) => `Tối đa ${factor} lần phí chính` } }
            ],
            validationMessages: {
                required: 'Vui lòng chọn sản phẩm chính',
                notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.',
            }
        },
        rules: {
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ],
            stbh: { min: 100000000 },
            premium: { min: 5000000, special: 'MUL_FACTOR_CHECK' },
            paymentTerm: { min: 4, maxFn: (age) => 100 - age, default: 20 },
            extraPremium: { maxFactorOfBase: 5 }
        },
        calculation: {
             calculate: (prodConfig, customer, productInfo, helpers) => {
                return helpers.roundDownTo1000(productInfo.premium);
            }
        },
        accountValue: {
            enabled: true,
            costOfInsuranceRef: 'mul_cost_of_insurance_rates',
            initialFeeRef: 'VUNG_TUONG_LAI',
            persistencyBonusRef: null,
            guaranteedInterestRef: 'guaranteed_interest_rates',
            useGuaranteedInterest: true,
            includeExtraPremium: false,
            bonusType: 'mul_periodic',
            calculateProjection: calculateGenericAccountValueProjection,
        }
    },
    
    'TRON_TAM_AN': {
        type: 'main',
        name: 'Trọn tâm an',
        slug: 'tron-tam-an',
        group: 'PACKAGE',
        packageConfig: {
            underlyingMainProduct: 'AN_BINH_UU_VIET', 
            fixedValues: {
                stbh: 100000000,
                paymentTerm: 10,
            },
            mandatoryRiders: ['health_scl'] 
        },
        ui: {
            controls: [
                { type: 'currencyInput', id: 'main-stbh', label: 'Số tiền bảo hiểm (STBH)', defaultValue: 100000000, disabled: true },
                { type: 'staticText', text: '<p class="text-sm text-gray-600 mt-1">Thời hạn đóng phí: 10 năm (bằng thời hạn hợp đồng). Thời gian bảo vệ: 10 năm.</p>' }
            ],
             validationMessages: {
                required: 'Vui lòng chọn sản phẩm chính',
                notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.',
            }
        },
        rules: {
            eligibility: [
                { type: 'age', min: 12, max: 60, condition: (p) => p.gender === 'Nam' },
                { type: 'age', min: 28, max: 60, condition: (p) => p.gender === 'Nữ' },
                { type: 'riskGroup', exclude: [4], required: true }
            ],
            noSupplementaryInsured: true
        },
        calculation: {
            calculate: () => 0 // Phí được tính từ sản phẩm con, không có phí riêng
        }
    },
    
    'AN_BINH_UU_VIET': {
        type: 'main',
        name: 'An Bình Ưu Việt',
        slug: 'an-binh-uu-viet',
        group: 'TRADITIONAL',
        ui: {
            controls: [
                { type: 'currencyInput', id: 'main-stbh', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 100.000.000', required: true, validationMessages: { min: (val) => `STBH tối thiểu ${formatCurrency(val)}` } },
                { type: 'select', id: 'abuv-term', label: 'Thời hạn đóng phí', required: true, hintText: 'Thời hạn đóng phí bằng thời hạn hợp đồng.',
                    options: [
                        { value: '15', label: '15 năm', condition: (p) => p.age <= 55 },
                        { value: '10', label: '10 năm', condition: (p) => p.age <= 60 },
                        { value: '5', label: '5 năm', condition: (p) => p.age <= 65 },
                    ],
                    validationMessages: { required: 'Vui lòng chọn thời hạn' }
                }
            ],
            validationMessages: {
                required: 'Vui lòng chọn sản phẩm chính',
                notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.',
                minPremium: (val) => `Phí chính tối thiểu ${formatCurrency(val)}`
            }
        },
        rules: {
            eligibility: [
                { type: 'age', min: 12, max: 65, condition: (p) => p.gender === 'Nam' },
                { type: 'age', min: 28, max: 65, condition: (p) => p.gender === 'Nữ' },
            ],
            stbh: { min: 100000000 },
            premium: { min: 5000000 }
        },
        calculation: {
            calculate: (prodConfig, customer, productInfo, helpers) => {
                if (productInfo.stbh === 0) return 0;
                const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
                const termValue = productInfo.options.paymentTerm;
                if (!termValue) return 0;
                const rate = helpers.findRateByTerm('an_binh_uu_viet_rates', termValue, customer.age, genderKey);
                const premium = Math.round((productInfo.stbh / 1000) * rate);
                return helpers.roundDownTo1000(premium);
            }
        }
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
                { type: 'select', id: 'health_scl-program', label: 'Quyền lợi chính',
                  options: [
                      { value: 'co_ban', label: 'Cơ bản' },
                      { value: 'nang_cao', label: 'Nâng cao' },
                      { value: 'toan_dien', label: 'Toàn diện' },
                      { value: 'hoan_hao', label: 'Hoàn hảo' }
                  ],
                  defaultValue: 'nang_cao'
                },
                { type: 'select', id: 'health_scl-scope', label: 'Phạm vi địa lý',
                  options: [
                      { value: 'main_vn', label: 'Việt Nam' },
                      { value: 'main_global', label: 'Nước ngoài' }
                  ],
                  defaultValue: 'main_vn'
                },
                { type: 'checkboxGroup', label: 'Quyền lợi tùy chọn:', items: [
                    { id: 'health_scl-outpatient', label: 'Điều trị ngoại trú', hintId: 'scl-outpatient-fee-hint' },
                    { id: 'health_scl-dental', label: 'Chăm sóc nha khoa', hintId: 'scl-dental-fee-hint' }
                  ]
                }
            ],
            validationMessages: {
                programNotEligible: 'Phí chính không đủ điều kiện cho chương trình {program}, vui lòng chọn lại.'
            }
        },
        rules: {
            eligibility: [
                { type: 'daysFromBirth', min: 30 },
                { type: 'age', max: 65, renewalMax: 74 },
                { type: 'riskGroup', exclude: [4], required: true }
            ],
            dependencies: {
                premiumThresholdsForProgram: [
                    { minPremium: 5000000, allowed: ['co_ban', 'nang_cao'] },
                    { minPremium: 10000000, allowed: ['co_ban', 'nang_cao', 'toan_dien'] },
                    { minPremium: 15000000, allowed: ['co_ban', 'nang_cao', 'toan_dien', 'hoan_hao'] }
                ],
                dentalRequiresOutpatient: true
            },
            stbhByProgram: {
                co_ban: 100000000,
                nang_cao: 250000000,
                toan_dien: 500000000,
                hoan_hao: 1000000000,
            }
        },
        calculation: {
            calculate: (prodConfig, customer, helpers, ageOverride = null) => {
                const { total } = prodConfig.calculation.getFeeComponents(customer, helpers, ageOverride);
                return total;
            },
            getFeeComponents: (customer, helpers, ageOverride = null) => {
                const ageToUse = ageOverride ?? customer.age;
                const renewalMax = PRODUCT_CATALOG.health_scl.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
                if (ageToUse > renewalMax) return { base: 0, outpatient: 0, dental: 0, total: 0 };
                
                if (!customer?.supplements?.health_scl) return { base: 0, outpatient: 0, dental: 0, total: 0 };

                const { program, scope, outpatient, dental } = customer.supplements.health_scl;
                if (!program || !scope) return { base: 0, outpatient: 0, dental: 0, total: 0 };

                const ageBandIndex = helpers.data.health_scl_rates.age_bands.findIndex(b => ageToUse >= b.min && ageToUse <= b.max);
                if (ageBandIndex === -1) return { base: 0, outpatient: 0, dental: 0, total: 0 };

                const base = helpers.data.health_scl_rates[scope]?.[ageBandIndex]?.[program] || 0;
                const outpatientFee = outpatient ? (helpers.data.health_scl_rates.outpatient?.[ageBandIndex]?.[program] || 0) : 0;
                const dentalFee = dental ? (helpers.data.health_scl_rates.dental?.[ageBandIndex]?.[program] || 0) : 0;
                const total = base + outpatientFee + dentalFee;

                return {
                    base: helpers.roundDownTo1000(base),
                    outpatient: helpers.roundDownTo1000(outpatientFee),
                    dental: helpers.roundDownTo1000(dentalFee),
                    total: helpers.roundDownTo1000(total)
                };
            }
        }
    },
    
    'bhn': {
        type: 'rider',
        name: 'Bệnh Hiểm Nghèo 2.0',
        slug: 'benh-hiem-ngheo-20',
        ui: {
            controls: [
                { type: 'currencyInput', id: 'bhn-stbh', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 200.000.000', hintText: 'STBH từ 200 triệu đến 5 tỷ.', validationMessages: { min: (val) => `Tối thiểu ${formatCurrency(val)}`, max: (val) => `Tối đa ${formatCurrency(val)}` } }
            ]
        },
        rules: {
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70, renewalMax: 85 } ],
            stbh: { min: 200000000, max: 5000000000 }
        },
        calculation: {
            calculate: (prodConfig, customer, helpers, ageOverride = null) => {
                const ageToUse = ageOverride ?? customer.age;
                const renewalMax = prodConfig.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
                if (ageToUse > renewalMax) return 0;
                const { stbh } = customer.supplements[prodConfig.slug] || {};
                if (!stbh) return 0;
                const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
                const rate = helpers.findRateByRange('bhn_rates', ageToUse, genderKey);
                if (!rate) return 0;
                const premiumRaw = (stbh / 1000) * rate;
                return helpers.roundDownTo1000(premiumRaw);
            }
        }
    },

    'accident': {
        type: 'rider',
        name: 'Bảo hiểm Tai nạn',
        slug: 'tai-nan',
        ui: {
            controls: [
                { type: 'currencyInput', id: 'accident-stbh', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 500.000.000', hintText: 'STBH từ 10 triệu đến 8 tỷ.', validationMessages: { min: (val) => `Tối thiểu ${formatCurrency(val)}`, max: (val) => `Tối đa ${formatCurrency(val)}` } }
            ]
        },
        rules: {
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 64, renewalMax: 65 }, { type: 'riskGroup', required: true } ],
            stbh: { min: 10000000, max: 8000000000 }
        },
        calculation: {
            calculate: (prodConfig, customer, helpers, ageOverride = null) => {
                const ageToUse = ageOverride ?? customer.age;
                const renewalMax = prodConfig.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
                if (ageToUse > renewalMax) return 0;

                const { stbh } = customer.supplements[prodConfig.slug] || {};
                if (!stbh) return 0;
                if (customer.riskGroup === 0 || customer.riskGroup > 4) return 0;
                const rate = helpers.data.accident_rates[customer.riskGroup] || 0;
                if (!rate) return 0;
                const premiumRaw = (stbh / 1000) * rate;
                return helpers.roundDownTo1000(premiumRaw);
            }
        }
    },

    'hospital_support': {
        type: 'rider',
        name: 'Hỗ trợ chi phí nằm viện',
        slug: 'ho-tro-vien-phi',
        ui: {
            controls: [
                { type: 'currencyInput', id: 'hospital_support-stbh', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'Bội số 100.000 (đ/ngày)', customClass: 'hospital-support-stbh', hintText: `<p class="hospital-support-validation text-sm text-gray-500 mt-1"></p>`, validationMessages: { hint: ({max, multiple}) => `Tối đa: ${max}. Phải là bội số của ${multiple}.`, multipleOf: (val) => `Là bội số của ${formatCurrency(val)}`, limitExceeded: 'Vượt quá giới hạn cho phép' } }
            ]
        },
        rules: {
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 55, renewalMax: 59 } ],
            stbh: { 
                multipleOf: 100000,
                maxByAge: { under18: 300000, from18: 1000000 },
                special: 'HOSPITAL_SUPPORT_MAX_BY_MAIN_PREMIUM'
            }
        },
        calculation: {
             calculate: (prodConfig, customer, helpers, ageOverride = null) => {
                const ageToUse = ageOverride ?? customer.age;
                const renewalMax = prodConfig.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
                if (ageToUse > renewalMax) return 0;
                const { stbh } = customer.supplements[prodConfig.slug] || {};
                if (!stbh) return 0;
                const rate = helpers.findRateByRange('hospital_fee_support_rates', ageToUse, 'rate');
                if (!rate) return 0;
                const premiumRaw = (stbh / 100) * rate;
                return helpers.roundDownTo1000(premiumRaw);
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
            eligibility: [ { type: 'age', min: 18, max: 60, renewalMax: 60 } ],
        },
        calculation: {
            calculate: (personInfo, stbhBase, helpers) => {
                 const genderKey = personInfo.gender === 'Nữ' ? 'nu' : 'nam';
                 const rate = helpers.data.mdp3_rates.find(r => personInfo.age >= r.ageMin && personInfo.age <= r.ageMax)?.[genderKey] || 0;
                 return helpers.roundDownTo1000((stbhBase / 1000) * rate);
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
    const accountValueConfig = productConfig.accountValue;

    const { gender, age: initialAge } = mainPerson;
    const { key: productKey, stbh: stbhInitial = 0, paymentTerm } = mainProduct;
    
    const { 
        initial_fees, 
        guaranteed_interest_rates, 
        admin_fees, 
    } = investment_data;

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
        if (periods === 4 && (monthInYear === 1 || monthInYear === 4 || monthInYear === 7 || monthInYear === 10)) isPaymentMonth = true;

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
            const adminFee = getAdminFeeForYear(calendarYear);
            const stbhCurrent = getStbhForPolicyYear(policyYear);
            
            const riskRateRecord = costOfInsuranceRates.find(r => Number(r.age) === Number(attainedAge));
            const riskRate = riskRateRecord ? (riskRateRecord[genderKey] || 0) : 0;
            const sumAtRisk = Math.max(0, stbhCurrent - investmentAmount);

            let costOfInsurance = (sumAtRisk * riskRate) / 1000 / 12;
            costOfInsurance = roundVND(costOfInsurance);

            const netInvestmentAmount = investmentAmount - adminFee - costOfInsurance;
            
            let guaranteedRate = 0;
            if(accountValueConfig.useGuaranteedInterest) {
                const guaranteedRateRaw = (guaranteed_interest_rates && (guaranteed_interest_rates[policyYear] !== undefined))
                    ? guaranteed_interest_rates[policyYear]
                    : (guaranteed_interest_rates && guaranteed_interest_rates.default ? guaranteed_interest_rates.default : 0);
                guaranteedRate = Number(guaranteedRateRaw) || 0;
                guaranteedRate = (guaranteedRate > 1) ? (guaranteedRate / 100) : guaranteedRate;
            }

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
