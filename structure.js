/**
 * @file structure.js
 * @description
 * Tệp này là "bộ não" của ứng dụng, chứa tất cả dữ liệu cấu hình cho các sản phẩm bảo hiểm.
 * - GLOBAL_CONFIG: Các hằng số và quy tắc nghiệp vụ toàn cục.
 * - PRODUCT_CATALOG: Định nghĩa tất cả sản phẩm. Mỗi sản phẩm là một "bản thiết kế" chi tiết 
 *   mà logic.js sẽ đọc để tự động render UI, áp dụng quy tắc và tính phí.
 */
import { product_data, investment_data, BM_SCL_PROGRAMS } from './data.js';
import { RULE_ENGINE } from './registries/ruleEngine.js';


function formatCurrency(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('vi-VN');
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
    WAIVER_OTHER_PERSON_SELECT_VALUE: 'other',
    WAIVER_OTHER_PERSON_ID: 'waiver_other',
    LABELS: {
        EXTRA_PREMIUM: 'Phí đóng thêm',
        POLICY_OWNER: 'Bên mua bảo hiểm'
    },
    PAYMENT_FREQUENCY_LABELS: {
        year: 'Năm',
        half: 'Nửa năm',
        quarter: 'Quý'
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
        benefitMatrixKey: 'PUL_FAMILY',
        paymentTermKey: 'from_control:payment-term',
        targetAgeConfig: {
            isEditable: true,
            valueKey: 'fixed_99',
            hintKey: 'pul_mul',
            constraints: {
                minKey: 'min_agePlusTerm',
                maxKey: 'max_fixed_99'
            }
        },
        ui: {
            controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true,
                  validateKey: 'stbhMinWithBaseTiers',
                  validateParams: {
                      min: 100000000,
                      tiers: [
                          { stbhLt: 1000000000, minBase: 20000000 },
                          { stbhGte: 1000000000, minBase: 5000000 }
                      ]
                  }
                },
                { id: 'payment-term', type: 'numberInput', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 20', required: true, defaultValue: 20,
                  validateKey: 'termInRangeByAge',
                  validateParams: { min: 4, maxFormulaKey: '100MinusAge' }
                },
                { id: 'extra-premium', type: 'currencyInput', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa 5 lần phí chính.`,
                  validateKey: 'extraMaxTimesBase',
                  validateParams: { maxTimes: 5 }
                }
            ],
            validationMessages: { notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.' }
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ] },
        calculation: {
            calculateKey: 'pul_main_by_rate_table',
            params: { rateTableKey: 'pul_rates.PUL_TRON_DOI' }
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
        benefitMatrixKey: 'PUL_FAMILY',
        paymentTermKey: 'from_control:payment-term',
        targetAgeConfig: {
            isEditable: true,
            valueKey: 'fixed_99',
            hintKey: 'pul_mul',
            constraints: {
                minKey: 'min_agePlusTerm',
                maxKey: 'max_fixed_99'
            }
        },
        ui: {
             controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true,
                  validateKey: 'stbhMinWithBaseTiers',
                  validateParams: {
                      min: 100000000,
                      tiers: [
                          { stbhLt: 1000000000, minBase: 20000000 },
                          { stbhGte: 1000000000, minBase: 5000000 }
                      ]
                  }
                },
                { id: 'payment-term', type: 'numberInput', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 15', required: true, defaultValue: 15,
                  validateKey: 'termInRangeByAge',
                  validateParams: { min: 15, maxFormulaKey: '100MinusAge' }
                },
                { id: 'extra-premium', type: 'currencyInput', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa 5 lần phí chính.`,
                  validateKey: 'extraMaxTimesBase',
                  validateParams: { maxTimes: 5 }
                }
            ],
            validationMessages: { notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.' }
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ] },
        calculation: {
            calculateKey: 'pul_main_by_rate_table',
            params: { rateTableKey: 'pul_rates.PUL_15NAM' }
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
        benefitMatrixKey: 'PUL_FAMILY',
        paymentTermKey: 'from_control:payment-term',
        targetAgeConfig: {
            isEditable: true,
            valueKey: 'fixed_99',
            hintKey: 'pul_mul',
            constraints: {
                minKey: 'min_agePlusTerm',
                maxKey: 'max_fixed_99'
            }
        },
        ui: {
             controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true,
                  validateKey: 'stbhMinWithBaseTiers',
                  validateParams: {
                      min: 100000000,
                      tiers: [
                          { stbhLt: 1000000000, minBase: 20000000 },
                          { stbhGte: 1000000000, minBase: 5000000 }
                      ]
                  }
                },
                { id: 'payment-term', type: 'numberInput', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 5', required: true, defaultValue: 5,
                  validateKey: 'termInRangeByAge',
                  validateParams: { min: 5, maxFormulaKey: '100MinusAge' }
                },
                { id: 'extra-premium', type: 'currencyInput', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa 5 lần phí chính.`,
                  validateKey: 'extraMaxTimesBase',
                  validateParams: { maxTimes: 5 }
                }
            ],
            validationMessages: { notEligible: 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.' }
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ] },
        calculation: {
            calculateKey: 'pul_main_by_rate_table',
            params: { rateTableKey: 'pul_rates.PUL_5NAM' }
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
        benefitMatrixKey: 'KHOE_BINH_AN',
        paymentTermKey: 'from_control:payment-term',
        targetAgeConfig: {
            isEditable: true,
            valueKey: 'fixed_99',
            hintKey: 'pul_mul',
            constraints: {
                minKey: 'min_agePlusTerm',
                maxKey: 'max_fixed_99'
            }
        },
        ui: {
            controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true,
                  validateKey: 'mul_stbh_min',
                },
                { id: 'main-premium', type: 'currencyInput', label: 'Phí sản phẩm chính', placeholder: 'Nhập phí', required: true, hintId: 'main-premium-hint',
                  onRender: 'mul_main_premium_hint_vs_stbh',
                  validateKey: 'mul_main_premium_vs_stbh',
                },
                { id: 'payment-term', type: 'numberInput', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 20', required: true, defaultValue: 20,
                  validateKey: 'termInRangeByAge',
                  validateParams: { min: 4, maxFormulaKey: '100MinusAge' }
                },
                { id: 'extra-premium', type: 'currencyInput', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa 5 lần phí chính.`,
                  validateKey: 'extraMaxTimesBase',
                  validateParams: { maxTimes: 5 }
                }
            ],
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ] },
        calculation: { calculateKey: 'mul_main_direct_input' },
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
        benefitMatrixKey: 'VUNG_TUONG_LAI',
        paymentTermKey: 'from_control:payment-term',
        targetAgeConfig: {
            isEditable: true,
            valueKey: 'fixed_99',
            hintKey: 'pul_mul',
            constraints: {
                minKey: 'min_agePlusTerm',
                maxKey: 'max_fixed_99'
            }
        },
        ui: {
             controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 1.000.000.000', required: true,
                  validateKey: 'mul_stbh_min'
                },
                { id: 'main-premium', type: 'currencyInput', label: 'Phí sản phẩm chính', placeholder: 'Nhập phí', required: true, hintId: 'main-premium-hint',
                  onRender: 'mul_main_premium_hint_vs_stbh',
                  validateKey: 'mul_main_premium_vs_stbh',
                },
                { id: 'payment-term', type: 'numberInput', label: 'Thời gian đóng phí (năm)', placeholder: 'VD: 20', required: true, defaultValue: 20,
                  validateKey: 'termInRangeByAge',
                  validateParams: { min: 4, maxFormulaKey: '100MinusAge' }
                },
                { id: 'extra-premium', type: 'currencyInput', label: 'Phí đóng thêm', placeholder: 'VD: 10.000.000', hintText: `Tối đa 5 lần phí chính.`,
                  validateKey: 'extraMaxTimesBase',
                  validateParams: { maxTimes: 5 }
                }
            ],
        },
        rules: { eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70 } ] },
        calculation: { calculateKey: 'mul_main_direct_input' },
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
        benefitMatrixKey: 'AN_BINH_UU_VIET',
        paymentTermKey: 'from_control:abuv-term',
        targetAgeConfig: {
            isEditable: false,
            valueKey: 'agePlusTerm',
            hintKey: 'abuv',
            constraints: {}
        },
        ui: {
            controls: [
                { id: 'main-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 100.000.000', required: true, 
                  validateKey: 'rider_stbh_range',
                  validateParams: { min: 100000000, max: Infinity }
                },
                { id: 'abuv-term', type: 'select', label: 'Thời hạn đóng phí', required: true, hintText: 'Thời hạn đóng phí bằng thời hạn hợp đồng.',
                    options: [
                        { value: '15', label: '15 năm', condition: (p) => p.age <= 55 },
                        { value: '10', label: '10 năm', condition: (p) => p.age <= 60 },
                        { value: '5', label: '5 năm', condition: (p) => p.age <= 65 },
                    ],
                    validateKey: 'required'
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
            calculateKey: 'abuv_main_by_term_rate',
            params: {}
        }
    },
    
    'TRON_TAM_AN': {
        type: 'main',
        name: 'Trọn tâm an',
        slug: 'tron-tam-an',
        group: 'PACKAGE',
        paymentTermKey: 'fixed_value:10',
        targetAgeConfig: {
            isEditable: false,
            valueKey: 'agePlusFixedTerm',
            valueParams: { term: '10' },
            hintKey: 'tta',
            constraints: {}
        },
        packageConfig: {
            underlyingMainProduct: 'AN_BINH_UU_VIET', 
            fixedValues: { stbh: 100000000, paymentTerm: '10' },
            mandatoryRiders: ['health_scl'],
            addBenefitMatrixFrom: [
                { productKey: 'AN_BINH_UU_VIET', sumAssured: 100000000 }
            ]
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
        calculation: {
            calculateKey: 'package_main_proxy',
            params: {
                underlyingKey: 'AN_BINH_UU_VIET',
                fixedValues: { stbh: 100000000, paymentTerm: '10' }
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
        benefitMatrixKey: 'HEALTH_SCL',
        displayNameKey: 'scl_dynamic_display',
        stbhKey: 'scl_stbh_from_program',
        columnDataKey: 'scl_column_data',
        ui: {
            controls: [
                { id: 'health_scl-program', type: 'select', label: 'Quyền lợi chính',
                  options: [ { value: 'co_ban', label: 'Cơ bản - STBH: 100.000.000' }, { value: 'nang_cao', label: 'Nâng cao - STBH: 250.000.000' }, { value: 'toan_dien', label: 'Toàn diện - STBH: 500.000.000' }, { value: 'hoan_hao', label: 'Hoàn hảo - STBH: 1.000.000.000' } ],
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
            onRender: 'scl_program_by_threshold',
            onRenderParams: {
                premiumThresholds: [
                    { minPremium: 5000000, allowed: ['co_ban', 'nang_cao'] }, 
                    { minPremium: 10000000, allowed: ['co_ban', 'nang_cao', 'toan_dien'] }, 
                    { minPremium: 15000000, allowed: ['co_ban', 'nang_cao', 'toan_dien', 'hoan_hao'] }
                ]
            }
        },
        rules: {
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 65, renewalMax: 74 }, { type: 'riskGroup', exclude: [4], required: true } ],
            disabled: [{ type: 'disabledByPackage' }],
            mandatory: [{ type: 'mandatoryInPackage' }],
            stbhByProgram: { co_ban: 100000000, nang_cao: 250000000, toan_dien: 500000000, hoan_hao: 1000000000 }
        },
        calculation: {
            calculateKey: 'scl_calc',
            accumulatorKeys: [] // None for this one
        }
    },

    'bhn': {
        type: 'rider',
        name: 'Bệnh Hiểm Nghèo 2.0',
        slug: 'bhn',
        benefitMatrixKey: 'BHN_2_0',
        stbhKey: 'from_control:stbh',
        columnDataKey: 'bhn_column_data',
        ui: {
            controls: [ { id: 'bhn-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 200.000.000', hintText: 'STBH từ 200 triệu đến 5 tỷ.',
                          validateKey: 'rider_stbh_range',
                          validateParams: { min: 200000000, max: 5000000000 }
            }]
        },
        rules: { 
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 70, renewalMax: 85 } ],
            disabled: [{ type: 'disabledByPackage' }],
            visibility: [{ type: 'mainProductIsNot', value: 'TRON_TAM_AN' }],
            mandatory: [{ type: 'mandatoryInPackage' }],
        },
        calculation: {
            calculateKey: 'bhn_calc'
        }
    },

    'accident': {
        type: 'rider',
        name: 'Bảo hiểm Tai nạn',
        slug: 'accident',
        benefitMatrixKey: 'ACCIDENT',
        stbhKey: 'from_control:stbh',
        columnDataKey: 'default_stbh',
        ui: {
            controls: [ { id: 'accident-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'VD: 500.000.000', hintText: 'STBH từ 10 triệu đến 8 tỷ.',
                         validateKey: 'rider_stbh_range',
                         validateParams: { min: 10000000, max: 8000000000 }
            }]
        },
        rules: { 
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 64, renewalMax: 65 }, { type: 'riskGroup', required: true } ],
            disabled: [{ type: 'disabledByPackage' }],
            visibility: [{ type: 'mainProductIsNot', value: 'TRON_TAM_AN' }],
            mandatory: [{ type: 'mandatoryInPackage' }],
        },
        calculation: {
            calculateKey: 'accident_calc'
        }
    },

    'hospital_support': {
        type: 'rider',
        name: 'Hỗ trợ chi phí nằm viện',
        slug: 'hospital_support',
        category: 'hospital_support',
        benefitMatrixKey: 'HOSPITAL_SUPPORT',
        stbhKey: 'from_control:stbh',
        columnDataKey: 'hospital_support_column_data',
        ui: {
            controls: [
                { id: 'hospital_support-stbh', type: 'currencyInput', label: 'Số tiền bảo hiểm (STBH)', placeholder: 'Bội số 100.000 (đ/ngày)',
                  validateKey: 'hospital_support_stbh',
                  valueTransformerKey: 'roundToHospitalSupportMultiple'
                }
            ],
            onRender: 'hospital_support_hint'
        },
        rules: { 
            eligibility: [ { type: 'daysFromBirth', min: 30 }, { type: 'age', max: 55, renewalMax: 59 } ],
            disabled: [{ type: 'disabledByPackage' }],
            visibility: [{ type: 'mainProductIsNot', value: 'TRON_TAM_AN' }],
            mandatory: [{ type: 'mandatoryInPackage' }],
        },
        calculation: {
            calculateKey: 'hospital_support_calc',
            accumulatorKeys: ['totalHospitalSupportStbh']
        }
    },
    'mdp3': {
        type: 'rider',
        name: 'Miễn đóng phí 3.0',
        slug: 'mdp3',
        category: 'waiver', // Đánh dấu đây là sản phẩm Miễn đóng phí
        waiverTermKey: 'getTerm_mdp3',
        waiverEligibilityKey: 'isEligible_mdp3',
        ui: {
            controls: [] // Không cần control riêng vì được quản lý bởi UI chung của waiver
        },
        rules: {
            eligibility: [
                { type: 'age', min: 18, max: 60 },
                { type: 'riskGroup', required: true },
                { type: 'isNotMain' } // Không áp dụng cho NĐBH chính
            ]
        },
        stbhCalculation: {
            includeMainBasePremium: true,
            includeAllRiders: true,
            excludeRidersOfWaivedPerson: true,
        },
        calculation: {
            calculateKey: 'wop_mdp3',
            pass: 2,
        }
    }
};

// ===================================================================================
// ===== CẤU HÌNH CHO TRANG VIEWER (BẢNG 1 & 3)
// ===================================================================================
export const VIEWER_CONFIG = {
    part1_summary: {
        title: 'Phần 1 · Tóm tắt sản phẩm',
        columns: [
            { id: 'personName', header: 'Tên NĐBH', getValue: (row) => row.personName },
            { id: 'productName', header: 'Sản phẩm', getValue: (row) => row.prodName },
            { id: 'stbh', header: 'STBH', align: 'right', getValue: (row) => row.stbhDisplay },
            { id: 'term', header: 'Số năm đóng phí', align: 'center', getValue: (row) => row.years },
            { 
                id: 'periodicFee', 
                header: (data) => `Phí (${data.freqLabel})`, 
                align: 'right', 
                condition: (data) => !data.isAnnual, 
                getValue: (row) => formatCurrency(row.perPeriod) 
            },
            { 
                id: 'annualEquivalent', 
                header: 'Phí quy năm', 
                align: 'right', 
                condition: (data) => !data.isAnnual, 
                getValue: (row) => formatCurrency(row.annualEq) 
            },
            { 
                id: 'annualFee', 
                header: 'Phí theo năm', 
                align: 'right', 
                getValue: (row) => formatCurrency(row.annualBase) 
            },
            { 
                id: 'diff', 
                header: 'Chênh lệch', 
                align: 'right', 
                condition: (data) => !data.isAnnual, 
                getValue: (row) => row.diff === 0 ? '0' : `<span class="text-red-600 font-bold">${formatCurrency(row.diff)}</span>`
            }
        ],
        summaryRows: [
            { type: 'perPerson', label: 'Tổng theo người' },
            { type: 'grandTotal', label: 'Tổng tất cả' }
        ]
    },
    part3_schedule: {
        titleTemplate: (summaryData) => {
            const hasAccountValue = summaryData.projection?.guaranteed?.length > 0;
            return `Phần 3 · Bảng phí ${hasAccountValue ? 'và minh họa giá trị tài khoản' : ''}`;
        },
        columns: [
            { id: 'policyYear', header: 'Năm HĐ', align: 'center', getValue: (row) => row.year, getFooter: () => 'Tổng' },
            { id: 'age', header: 'Tuổi', align: 'center', getValue: (row) => row.age, getFooter: () => '' },
            { id: 'mainPremium', header: 'Phí chính', align: 'right', getValue: (row) => formatCurrency(row.mainYearBase), getFooter: (summary) => formatCurrency(summary.sums.main) },
            { id: 'extraPremium', header: 'Phí đóng thêm', align: 'right', condition: (summary) => !summary.schedule.extraAllZero, getValue: (row) => formatCurrency(row.extraYearBase), getFooter: (summary) => formatCurrency(summary.sums.extra) },
            {
                id: 'riderPremium', type: 'dynamic',
                headerTemplate: (person) => `Phí BS (${person.name})`,
                align: 'right',
                getValue: (row, personIndex) => formatCurrency(row.perPersonSuppAnnualEq[personIndex]),
                getFooter: (summary, personIndex) => formatCurrency(summary.sums.supp[personIndex])
            },
            { 
                id: 'totalPremiumEq', header: 'Tổng đóng/năm', align: 'right', isBold: true, 
                condition: (summary) => !summary.isAnnual, 
                getValue: (row) => formatCurrency(row.totalAnnualEq), 
                getFooter: (summary) => formatCurrency(summary.sums.totalEq) 
            },
            { 
                id: 'totalPremium', header: 'Tổng nếu đóng theo năm', align: 'right', isBold: false, 
                getValue: (row) => formatCurrency(row.totalYearBase), 
                getFooter: (summary) => formatCurrency(summary.sums.totalBase) 
            },
            { 
                id: 'diff', header: 'Chênh lệch', align: 'right', isBold: false, 
                condition: (summary) => !summary.isAnnual, 
                getValue: (row) => row.diff === 0 ? '0' : `<span class="text-red-600 font-bold">${formatCurrency(row.diff)}</span>`,
                getFooter: (summary) => summary.sums.diff === 0 ? '0' : `<span class="text-red-600 font-bold">${formatCurrency(summary.sums.diff)}</span>`
            },
            {
                id: 'gttk_guaranteed', header: 'GTTK (Lãi suất cam kết)', align: 'right',
                condition: (summary) => !!summary.projection?.guaranteed,
                getValue: (row, summary) => formatCurrency(roundDownTo1000(summary.projection.guaranteed[row.year - 1])),
                getFooter: () => ''
            },
            {
                id: 'gttk_customCapped', header: (summary) => `GTTK (LS ${summary.customRate}%-20 năm)`, align: 'right',
                condition: (summary) => !!summary.projection?.customCapped,
                getValue: (row, summary) => formatCurrency(roundDownTo1000(summary.projection.customCapped[row.year - 1])),
                getFooter: () => ''
            },
            {
                id: 'gttk_customFull', header: (summary) => `GTTK (LS ${summary.customRate}%-Toàn thời gian)`, align: 'right',
                condition: (summary) => !!summary.projection?.customFull,
                getValue: (row, summary) => formatCurrency(roundDownTo1000(summary.projection.customFull[row.year - 1])),
                getFooter: () => ''
            }
        ]
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
    const paymentTerm = RULE_ENGINE.resolveFieldByKey(productConfig.paymentTermKey, { values }) || 0;
    
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
