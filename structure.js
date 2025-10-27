/**
 * @file data.js
 * @description
 * Tệp này chứa tất cả dữ liệu cấu hình cho các sản phẩm bảo hiểm, được thiết kế theo kiến trúc "hướng dữ liệu".
 * - GLOBAL_CONFIG: Chứa tất cả các hằng số và quy tắc nghiệp vụ toàn cục.
 * - PRODUCT_CATALOG: "Bộ não" của ứng dụng, định nghĩa tất cả sản phẩm (chính, bổ sung, gói).
 *   Mỗi sản phẩm là một "bản thiết kế" chi tiết mà logic.js sẽ đọc để tự động render UI, áp dụng quy tắc và tính phí.
 */

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
        group: 'PUL',
        ui: {
            inputs: ['stbh', 'paymentTerm', 'extraPremium']
        },
        rules: {
            eligibility: [
                { type: 'daysFromBirth', min: 30 },
                { type: 'age', max: 70 },
            ],
            stbh: { special: 'PUL_ELIGIBILITY' },
            premium: { special: 'PUL_ELIGIBILITY' },
            paymentTerm: { min: 4, maxFn: (age) => 100 - age, default: 20 },
            extraPremium: { maxFactorOfBase: 5 }
        },
        calculation: {
            method: 'ratePer1000Stbh',
            rateTableRef: 'pul_rates.PUL_TRON_DOI'
        }
    },

    'PUL_15NAM': {
        type: 'main',
        name: 'Khoẻ trọn vẹn - 15 năm',
        group: 'PUL',
        ui: {
            inputs: ['stbh', 'paymentTerm', 'extraPremium']
        },
        rules: {
            eligibility: [
                { type: 'daysFromBirth', min: 30 },
                { type: 'age', max: 70 },
            ],
            stbh: { special: 'PUL_ELIGIBILITY' },
            premium: { special: 'PUL_ELIGIBILITY' },
            paymentTerm: { min: 15, maxFn: (age) => 100 - age, default: 15 },
            extraPremium: { maxFactorOfBase: 5 }
        },
        calculation: {
            method: 'ratePer1000Stbh',
            rateTableRef: 'pul_rates.PUL_15NAM'
        }
    },

    'PUL_5NAM': {
        type: 'main',
        name: 'Khoẻ trọn vẹn - 5 năm',
        group: 'PUL',
        ui: {
            inputs: ['stbh', 'paymentTerm', 'extraPremium']
        },
        rules: {
            eligibility: [
                { type: 'daysFromBirth', min: 30 },
                { type: 'age', max: 70 },
            ],
            stbh: { special: 'PUL_ELIGIBILITY' },
            premium: { special: 'PUL_ELIGIBILITY' },
            paymentTerm: { min: 5, maxFn: (age) => 100 - age, default: 5 },
            extraPremium: { maxFactorOfBase: 5 }
        },
        calculation: {
            method: 'ratePer1000Stbh',
            rateTableRef: 'pul_rates.PUL_5NAM'
        }
    },

    'KHOE_BINH_AN': {
        type: 'main',
        name: 'MUL - Khoẻ Bình An',
        group: 'MUL',
        ui: {
            inputs: ['stbh', 'premium', 'paymentTerm', 'extraPremium']
        },
        rules: {
            eligibility: [
                { type: 'daysFromBirth', min: 30 },
                { type: 'age', max: 70 },
            ],
            stbh: { min: 100000000 },
            premium: { min: 5000000, special: 'MUL_FACTOR_CHECK' },
            paymentTerm: { min: 4, maxFn: (age) => 100 - age, default: 20 },
            extraPremium: { maxFactorOfBase: 5 }
        },
        calculation: {
            method: 'fromInput'
        }
    },

    'VUNG_TUONG_LAI': {
        type: 'main',
        name: 'MUL - Vững Tương Lai',
        group: 'MUL',
        ui: {
            inputs: ['stbh', 'premium', 'paymentTerm', 'extraPremium']
        },
        rules: {
            eligibility: [
                { type: 'daysFromBirth', min: 30 },
                { type: 'age', max: 70 },
            ],
            stbh: { min: 100000000 },
            premium: { min: 5000000, special: 'MUL_FACTOR_CHECK' },
            paymentTerm: { min: 4, maxFn: (age) => 100 - age, default: 20 },
            extraPremium: { maxFactorOfBase: 5 }
        },
        calculation: {
            method: 'fromInput'
        }
    },
    
    'TRON_TAM_AN': {
        type: 'main',
        name: 'Trọn tâm an',
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
            inputs: [] // Gói này không có input riêng, nó điều khiển sản phẩm con
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
            method: 'none' // Phí được tính từ sản phẩm con
        }
    },
    
    'AN_BINH_UU_VIET': {
        type: 'main',
        name: 'An Bình Ưu Việt',
        group: 'TRADITIONAL',
        ui: {
            inputs: ['stbh'],
            options: {
                paymentTerm: {
                    id: 'abuv-term',
                    label: 'Thời hạn đóng phí',
                    values: [
                        { value: '15', label: '15 năm', condition: (p) => p.age <= 55 },
                        { value: '10', label: '10 năm', condition: (p) => p.age <= 60 },
                        { value: '5', label: '5 năm', condition: (p) => p.age <= 65 },
                    ]
                }
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
            method: 'ratePer1000StbhWithTerm',
            rateTableRef: 'an_binh_uu_viet_rates'
        }
    },

    // =======================================================================
    // ===== SẢN PHẨM BỔ SUNG (RIDERS)
    // =======================================================================

    'health_scl': {
        id: 'health_scl',
        type: 'rider',
        name: 'Sức khỏe Bùng Gia Lực',
        ui: {
            options: ['program', 'scope', 'outpatient', 'dental']
        },
        rules: {
            eligibility: [
                { type: 'daysFromBirth', min: 30 },
                { type: 'age', max: 65, renewalMax: 74 },
                { type: 'riskGroup', exclude: [4], required: true }
            ],
            dependencies: {
                premiumThresholdForProgram: true,
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
            method: 'custom',
            functionName: 'calculateHealthSclPremium'
        }
    },
    
    'bhn': {
        id: 'bhn',
        type: 'rider',
        name: 'Bệnh Hiểm Nghèo 2.0',
        ui: {
            inputs: ['stbh']
        },
        rules: {
            eligibility: [
                { type: 'daysFromBirth', min: 30 },
                { type: 'age', max: 70, renewalMax: 85 },
            ],
            stbh: { min: 200000000, max: 5000000000 }
        },
        calculation: {
            method: 'custom',
            functionName: 'calculateBhnPremium'
        }
    },

    'accident': {
        id: 'accident',
        type: 'rider',
        name: 'Bảo hiểm Tai nạn',
        ui: {
            inputs: ['stbh']
        },
        rules: {
            eligibility: [
                { type: 'daysFromBirth', min: 30 },
                { type: 'age', max: 64, renewalMax: 65 },
                { type: 'riskGroup', required: true }
            ],
            stbh: { min: 10000000, max: 8000000000 }
        },
        calculation: {
            method: 'custom',
            functionName: 'calculateAccidentPremium'
        }
    },

    'hospital_support': {
        id: 'hospital_support',
        type: 'rider',
        name: 'Hỗ trợ chi phí nằm viện',
        ui: {
            inputs: ['stbh']
        },
        rules: {
            eligibility: [
                { type: 'daysFromBirth', min: 30 },
                { type: 'age', max: 55, renewalMax: 59 },
            ],
            stbh: { 
                multipleOf: 100000,
                maxByAge: { under18: 300000, from18: 1000000 },
                special: 'HOSPITAL_SUPPORT_MAX_BY_MAIN_PREMIUM'
            }
        },
        calculation: {
            method: 'custom',
            functionName: 'calculateHospitalSupportPremium'
        }
    }
};
