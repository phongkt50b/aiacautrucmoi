
import { product_data, investment_data } from './data.js';

// ===================================================================================
// ===== MODULE: CONFIG & BUSINESS RULES
// ===================================================================================
const CONFIG = {
    REFERENCE_DATE: new Date(),
    MAX_SUPPLEMENTARY_INSURED: 10,
    MAIN_PRODUCT_MIN_PREMIUM: 5000000,
    MAIN_PRODUCT_MIN_STBH: 100000000,
    PUL_MIN_PREMIUM_OR: 5000000,
    PUL_MIN_STBH_OR: 100000000,
    EXTRA_PREMIUM_MAX_FACTOR: 5,
    PAYMENT_FREQUENCY_THRESHOLDS: {
        half: 7000000,
        quarter: 8000000,
    },
    HOSPITAL_SUPPORT_STBH_MULTIPLE: 100000,
    MAIN_PRODUCTS: {
        PUL_TRON_DOI: { name: 'Khoẻ trọn vẹn-Trọn đời' },
        PUL_15NAM: { name: 'Khoẻ trọn vẹn-15 năm' },
        PUL_5NAM: { name: 'Khoẻ trọn vẹn-5 năm' },
        KHOE_BINH_AN: { name: 'MUL - Khoẻ Bình An' },
        VUNG_TUONG_LAI: { name: 'MUL - Vững Tương Lai' },
        TRON_TAM_AN: { name: 'Trọn tâm an' },
        AN_BINH_UU_VIET: { name: 'An Bình Ưu Việt' },
    },
    PRODUCT_GROUPS: {
        PUL: ['PUL_TRON_DOI', 'PUL_15NAM', 'PUL_5NAM'],
        MUL: ['KHOE_BINH_AN', 'VUNG_TUONG_LAI'],
        PUL_MUL: ['PUL_TRON_DOI', 'PUL_15NAM', 'PUL_5NAM', 'KHOE_BINH_AN', 'VUNG_TUONG_LAI'],
        BASE_PRODUCTS: [
            'PUL_TRON_DOI', 'PUL_15NAM', 'PUL_5NAM',
            'KHOE_BINH_AN', 'VUNG_TUONG_LAI',
            'AN_BINH_UU_VIET', 'TRON_TAM_AN'
        ]
    },
    supplementaryProducts: [
        {
            id: 'health_scl',
            name: 'Sức khỏe Bùng Gia Lực',
            maxEntryAge: 65,
            maxRenewalAge: 74,
            calculationFunc: calculateHealthSclPremium,
            stbhByProgram: {
                co_ban: 100000000,
                nang_cao: 250000000,
                toan_dien: 500000000,
                hoan_hao: 1000000000,
            }
        },
        {
            id: 'bhn',
            name: 'Bệnh Hiểm Nghèo 2.0',
            maxEntryAge: 70,
            maxRenewalAge: 85,
            calculationFunc: calculateBhnPremium,
            minStbh: 200000000,
            maxStbh: 5000000000,
        },
        {
            id: 'accident',
            name: 'Bảo hiểm Tai nạn',
            maxEntryAge: 64,
            maxRenewalAge: 65,
            calculationFunc: calculateAccidentPremium,
            minStbh: 10000000,
            maxStbh: 8000000000,
        },
        {
            id: 'hospital_support',
            name: 'Hỗ trợ chi phí nằm viện',
            maxEntryAge: 55,
            maxRenewalAge: 59,
            calculationFunc: calculateHospitalSupportPremium,
            maxStbhByAge: {
                under18: 300000,
                from18: 1000000,
            }
        }
    ]
};



// ===================================================================================
// ===== SMALL UTILS
// ===================================================================================
function debounce(fn, wait = 40) {
  let t = null;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
// ===================================================================================
// ===== MODULE: STATE MANAGEMENT
// ===================================================================================
let appState = {};

function initState() {
    appState = {
        mainProduct: {
            key: '',
            stbh: 0,
            premium: 0,
            paymentTerm: 0,
            extraPremium: 0,
            abuvTerm: '',
        },
        paymentFrequency: 'year',
        mainPerson: {
            id: 'main-person-container',
            container: document.getElementById('main-person-container'),
            isMain: true,
            name: '',
            dob: '',
            age: 0,
            daysFromBirth: 0,
            gender: 'Nam',
            riskGroup: 0,
            supplements: {}
        },
        supplementaryPersons: [],
        fees: {
            baseMain: 0,
            extra: 0,
            totalMain: 0,
            totalSupp: 0,
            total: 0,
            byPerson: {},
        },
        mdp3: {
            enabled: false,
            selectedId: null,
            fee: 0,
        }
    };
}


// ===================================================================================
// ===== MODULE: HELPERS (Pure utility functions)
// ===================================================================================

function roundDownTo1000(n) {
    return Math.floor(Number(n || 0) / 1000) * 1000;
}
// PATCH #1: chuẩn hoá tính phí riders theo kỳ
function riderPerPeriod(baseAnnual, periods, riderFactor) {
  if (!baseAnnual || periods === 1) return 0;
  return roundDownTo1000((baseAnnual * riderFactor) / periods);
}
function riderAnnualEquivalent(baseAnnual, periods, riderFactor) {
  if (periods === 1) return baseAnnual;
  return riderPerPeriod(baseAnnual, periods, riderFactor) * periods;
}

function parseFormattedNumber(formattedString) {
  if (formattedString == null) return 0;
  let v = String(formattedString);
  v = v.replace(/[\u00A0\u202F\s]/g, '');
  v = v.replace(/[.,](?=\d{3}\b)/g, '');
  v = v.replace(/[.,]/g, '');
  const m2 = v.match(/-?\d+/);
  return m2 ? parseInt(m2[0], 10) : 0;
}

function formatCurrency(value, suffix = '') {
    const num = Number(value) || 0;
    return num.toLocaleString('vi-VN') + (suffix || '');
}

function formatDisplayCurrency(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0';
}

function sanitizeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getPaymentTermBounds(age) {
    return { min: 4, max: Math.max(0, 100 - age - 1) };
}


// ===================================================================================
// ===== MODULE: DATA COLLECTION (Reading from DOM into State)
// ===================================================================================

function updateStateFromUI() {
    const mainProductKey = document.getElementById('main-product')?.value || '';
    appState.mainProduct.key = mainProductKey;
    appState.mainProduct.stbh = parseFormattedNumber(document.getElementById('main-stbh')?.value);
    appState.mainProduct.premium = parseFormattedNumber(document.getElementById('main-premium-input')?.value);
    appState.mainProduct.paymentTerm = parseInt(document.getElementById('payment-term')?.value, 10) || 0;
    appState.mainProduct.extraPremium = parseFormattedNumber(document.getElementById('extra-premium-input')?.value);
    appState.mainProduct.abuvTerm = document.getElementById('abuv-term')?.value || '';
    appState.paymentFrequency = document.getElementById('payment-frequency')?.value || 'year';

    appState.mainPerson = collectPersonData(document.getElementById('main-person-container'), true);

    appState.supplementaryPersons = Array.from(
        document.querySelectorAll('#supplementary-insured-container .person-container')
    ).map(container => collectPersonData(container, false));
    
    if (window.MDP3) {
        appState.mdp3.enabled = MDP3.isEnabled();
        appState.mdp3.selectedId = MDP3.getSelectedId();
    }
}

function collectPersonData(container, isMain) {
    if (!container) return null;

    const dobInput = container.querySelector('.dob-input');
    const dobStr = dobInput ? dobInput.value : '';
    let age = 0;
    let daysFromBirth = 0;

    if (dobStr && /^\d{2}\/\d{2}\/\d{4}$/.test(dobStr)) {
        const [dd, mm, yyyy] = dobStr.split('/').map(n => parseInt(n, 10));
        const birthDate = new Date(yyyy, mm - 1, dd);
        if (birthDate.getFullYear() === yyyy && birthDate.getMonth() === mm - 1 && birthDate.getDate() === dd && birthDate <= CONFIG.REFERENCE_DATE) {
            daysFromBirth = Math.floor((CONFIG.REFERENCE_DATE - birthDate) / (1000 * 60 * 60 * 24));
            age = CONFIG.REFERENCE_DATE.getFullYear() - birthDate.getFullYear();
            const m = CONFIG.REFERENCE_DATE.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && CONFIG.REFERENCE_DATE.getDate() < birthDate.getDate())) {
                age--;
            }
        }
    }

    const supplementsContainer = isMain 
        ? document.querySelector('#main-supp-container .supplementary-products-container')
        : container.querySelector('.supplementary-products-container');
    
    const supplements = {};
    if (supplementsContainer) {
        CONFIG.supplementaryProducts.forEach(prod => {
            const section = supplementsContainer.querySelector(`.${prod.id}-section`);
            if (section && section.querySelector(`.${prod.id}-checkbox`)?.checked) {
                supplements[prod.id] = {
                    stbh: parseFormattedNumber(section.querySelector(`.${prod.id}-stbh`)?.value),
                    program: section.querySelector(`.health-scl-program`)?.value,
                    scope: section.querySelector(`.health-scl-scope`)?.value,
                    outpatient: section.querySelector(`.health-scl-outpatient`)?.checked,
                    dental: section.querySelector(`.health-scl-dental`)?.checked,
                };
            }
        });
    }

    return {
        id: container.id,
        container: container,
        isMain: isMain,
        name: container.querySelector('.name-input')?.value || (isMain ? 'NĐBH Chính' : 'NĐBH Bổ sung'),
        dob: dobStr,
        age,
        daysFromBirth,
        gender: container.querySelector('.gender-select')?.value || 'Nam',
        riskGroup: parseInt(container.querySelector('.occupation-input')?.dataset.group, 10) || 0,
        supplements
    };
}


// ===================================================================================
// ===== MODULE: LOGIC & CALCULATIONS (Pure functions)
// ===================================================================================
function performCalculations(state) {
    const fees = {
        baseMain: 0,
        extra: 0,
        totalSupp: 0,
        byPerson: {},
    };

    fees.baseMain = calculateMainPremium(state.mainPerson, state.mainProduct);
    fees.extra = state.mainProduct.extraPremium;
    
    const allPersons = [state.mainPerson, ...state.supplementaryPersons].filter(p => p);
    allPersons.forEach(p => {
        fees.byPerson[p.id] = { main: 0, supp: 0, total: 0, suppDetails: {} };
    });

    if (fees.byPerson[state.mainPerson.id]) {
        fees.byPerson[state.mainPerson.id].main = fees.baseMain + fees.extra;
    }
    
    let totalHospitalSupportStbh = 0;
    allPersons.forEach(person => {
        let personSuppFee = 0;
        CONFIG.supplementaryProducts.forEach(prod => {
            if (person.supplements[prod.id]) {
                const fee = prod.calculationFunc(person, fees.baseMain, totalHospitalSupportStbh);
                personSuppFee += fee;
                fees.byPerson[person.id].suppDetails[prod.id] = fee;
                if (prod.id === 'hospital_support') {
                    totalHospitalSupportStbh += person.supplements[prod.id].stbh;
                }
            }
        });
        fees.byPerson[person.id].supp = personSuppFee;
        fees.totalSupp += personSuppFee;
    });

    // Tạo personFees (chưa có MDP3 ở thời điểm này)
    window.personFees = {};
    allPersons.forEach(p => {
        const totalMainForPerson = p.isMain ? (fees.baseMain + fees.extra) : 0;
        window.personFees[p.id] = {
            main: totalMainForPerson,
            mainBase: p.isMain ? fees.baseMain : 0,
            supp: fees.byPerson[p.id]?.supp || 0,
            total: totalMainForPerson + (fees.byPerson[p.id]?.supp || 0)
        };
    });

    // === MDP3 block (đặt SAU khi có window.personFees) ===
    try {
        const mdpEnabled = !!(window.MDP3 && MDP3.isEnabled && MDP3.isEnabled());
        const mdpTargetId = mdpEnabled ? (MDP3.getSelectedId && MDP3.getSelectedId()) : null;
        const mdp3Fee = (mdpEnabled && window.MDP3 && MDP3.getPremium) ? MDP3.getPremium() : 0;

        if (mdpEnabled && mdp3Fee > 0) {
            fees.totalSupp += mdp3Fee;

            if (mdpTargetId && mdpTargetId !== 'other' && fees.byPerson[mdpTargetId]) {
                // Cập nhật model gốc
                fees.byPerson[mdpTargetId].supp += mdp3Fee;
                fees.byPerson[mdpTargetId].suppDetails.mdp3 = mdp3Fee;
                // Đồng bộ sang window.personFees để UI đọc đúng
                if (window.personFees[mdpTargetId]) {
                    window.personFees[mdpTargetId].supp += mdp3Fee;
                    window.personFees[mdpTargetId].total += mdp3Fee;
                }
            } else if (mdpTargetId === 'other') {
                // Tạo node riêng
                if (!fees.byPerson['mdp3_other']) {
                    fees.byPerson['mdp3_other'] = { main: 0, supp: 0, total: 0, suppDetails: {} };
                }
                fees.byPerson['mdp3_other'].supp += mdp3Fee;
                fees.byPerson['mdp3_other'].suppDetails.mdp3 = mdp3Fee;

                window.personFees['mdp3_other'] = {
                    main: 0,
                    mainBase: 0,
                    supp: fees.byPerson['mdp3_other'].supp,
                    total: fees.byPerson['mdp3_other'].supp
                };
            }
        }
    } catch (e) {
        console.warn('[MDP3] tính phí lỗi:', e);
    }

    const totalMain = fees.baseMain + fees.extra;
    const total = totalMain + fees.totalSupp;

    return { ...fees, totalMain, total };
}

function calculateMainPremium(customer, productInfo, ageOverride = null) {
  const ageToUse = ageOverride ?? customer.age;
  const { gender } = customer;
  const { key: mainProduct, stbh, premium: enteredPremium, abuvTerm } = productInfo;
  let premium = 0;

  if (!mainProduct) return 0;

  if (CONFIG.PRODUCT_GROUPS.PUL.includes(mainProduct) || mainProduct === 'AN_BINH_UU_VIET' || mainProduct === 'TRON_TAM_AN') {
    let rate = 0;
    const effectiveStbh = (mainProduct === 'TRON_TAM_AN') ? 100000000 : stbh;
    if (effectiveStbh === 0) return 0;
    
    const genderKey = gender === 'Nữ' ? 'nu' : 'nam';

    if (CONFIG.PRODUCT_GROUPS.PUL.includes(mainProduct)) {
        rate = product_data.pul_rates[mainProduct]?.find(r => r.age === ageToUse)?.[genderKey] || 0;
    } else if (mainProduct === 'AN_BINH_UU_VIET') {
        if (!abuvTerm) return 0;
        rate = product_data.an_binh_uu_viet_rates[abuvTerm]?.find(r => r.age === ageToUse)?.[genderKey] || 0;
    } else if (mainProduct === 'TRON_TAM_AN') {
        rate = product_data.an_binh_uu_viet_rates['10']?.find(r => r.age === ageToUse)?.[genderKey] || 0;
    }
    premium = (effectiveStbh / 1000) * rate;

  } else if (CONFIG.PRODUCT_GROUPS.MUL.includes(mainProduct)) {
      premium = enteredPremium;
  }

  return roundDownTo1000(premium);
}

function calculateHealthSclPremium(customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const ageToUse = ageOverride ?? customer.age;
    const config = CONFIG.supplementaryProducts.find(p => p.id === 'health_scl');
    if (ageToUse > config.maxRenewalAge) return 0;

    const { program, scope, outpatient, dental } = (customer && customer.supplements && customer.supplements.health_scl) ? customer.supplements.health_scl : {};
    if (!program || !scope) return 0;

    const ageBandIndex = product_data.health_scl_rates.age_bands.findIndex(b => ageToUse >= b.min && ageToUse <= b.max);
    if (ageBandIndex === -1) return 0;

    let totalPremium = product_data.health_scl_rates[scope]?.[ageBandIndex]?.[program] || 0;
    if (outpatient) totalPremium += product_data.health_scl_rates.outpatient?.[ageBandIndex]?.[program] || 0;
    if (dental) totalPremium += product_data.health_scl_rates.dental?.[ageBandIndex]?.[program] || 0;

    return roundDownTo1000(totalPremium);
}
// Tách phí từng phần của Sức khỏe Bùng Gia Lực
function getHealthSclFeeComponents(customer, ageOverride = null) {
  try {
    if (!customer || !customer.supplements || !customer.supplements.health_scl) {
      return { base:0, outpatient:0, dental:0, total:0 };
    }
    const ageToUse = ageOverride ?? customer.age;
    const { program, scope, outpatient, dental } = customer.supplements.health_scl;
    if (!program || !scope) return { base:0, outpatient:0, dental:0, total:0 };

    const ageBandIndex = product_data.health_scl_rates.age_bands.findIndex(
      b => ageToUse >= b.min && ageToUse <= b.max
    );
    if (ageBandIndex === -1) return { base:0, outpatient:0, dental:0, total:0 };

    const base = product_data.health_scl_rates[scope]?.[ageBandIndex]?.[program] || 0;
    const outpatientFee = outpatient
        ? (product_data.health_scl_rates.outpatient?.[ageBandIndex]?.[program] || 0)
        : 0;
    const dentalFee = dental
        ? (product_data.health_scl_rates.dental?.[ageBandIndex]?.[program] || 0)
        : 0;

    const total = base + outpatientFee + dentalFee;
    return {
      base: roundDownTo1000(base),
      outpatient: roundDownTo1000(outpatientFee),
      dental: roundDownTo1000(dentalFee),
      total: roundDownTo1000(total)
    };
  } catch(e){
    return { base:0, outpatient:0, dental:0, total:0 };
  }
}

/**
 * Helper to calculate premiums for simple rate-based riders.
 * @param {object} customer - The customer object.
 * @param {object} config - The product configuration from CONFIG.supplementaryProducts.
 * @param {function} rateFinder - A function that returns the premium rate.
 * @param {number} divisor - The divisor for the STBH (e.g., 1000 or 100).
 * @param {number|null} ageOverride - Optional age to use for calculation.
 * @returns {number} The calculated premium.
 */
function calculateSimpleRiderPremium(customer, config, rateFinder, divisor, ageOverride = null) {
    const ageToUse = ageOverride ?? customer.age;
    if (ageToUse > config.maxRenewalAge) return 0;

    const { stbh } = customer.supplements[config.id] || {};
    if (!stbh) return 0;

    const rate = rateFinder(customer, ageToUse);
    if (!rate) return 0;

    const premiumRaw = (stbh / divisor) * rate;
    return roundDownTo1000(premiumRaw);
}

function calculateBhnPremium(customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const config = CONFIG.supplementaryProducts.find(p => p.id === 'bhn');
    const rateFinder = (cust, age) => product_data.bhn_rates
        .find(r => age >= r.ageMin && age <= r.ageMax)?.[cust.gender === 'Nữ' ? 'nu' : 'nam'] || 0;
    return calculateSimpleRiderPremium(customer, config, rateFinder, 1000, ageOverride);
}

function calculateAccidentPremium(customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const config = CONFIG.supplementaryProducts.find(p => p.id === 'accident');
    const rateFinder = (cust) => {
        if (cust.riskGroup === 0 || cust.riskGroup > 4) return 0;
        return product_data.accident_rates[cust.riskGroup] || 0;
    };
    return calculateSimpleRiderPremium(customer, config, rateFinder, 1000, ageOverride);
}

function calculateHospitalSupportPremium(customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const config = CONFIG.supplementaryProducts.find(p => p.id === 'hospital_support');
    const rateFinder = (cust, age) => product_data.hospital_fee_support_rates
        .find(r => age >= r.ageMin && age <= r.ageMax)?.rate || 0;
    return calculateSimpleRiderPremium(customer, config, rateFinder, 100, ageOverride);
}
// Dán hàm mới này vào logic.js
function calculateAccountValueProjection(mainPerson, mainProduct, basePremium, extraPremium, targetAge, customInterestRate) {
    const { gender, age: initialAge } = mainPerson;
    const { key: productKey, stbh, paymentTerm } = mainProduct;
    const { cost_of_insurance_rates, initial_fees, guaranteed_interest_rates, admin_fees, persistency_bonus } = investment_data;

    const totalYears = targetAge - initialAge + 1;
    const totalMonths = totalYears * 12;
    const customRate = (parseFloat(customInterestRate) || 0) / 100;

    let scenarios = {
        guaranteed: { accountValue: 0, yearEndValues: [] },
        customCapped: { accountValue: 0, yearEndValues: [] },
        customFull: { accountValue: 0, yearEndValues: [] },
    };

    const startYear = new Date().getFullYear();

    for (let month = 1; month <= totalMonths; month++) {
        const policyYear = Math.floor((month - 1) / 12) + 1;
        const attainedAge = initialAge + policyYear - 1;
        const genderKey = gender === 'Nữ' ? 'nu' : 'nam';

        for (const key in scenarios) {
            let currentAccountValue = scenarios[key].accountValue;
            let premiumIn = 0;
            let initialFee = 0;

            if (month % 12 === 1 && policyYear <= paymentTerm) {
                premiumIn = basePremium + extraPremium;
                const initialFeeRateBase = (initial_fees[productKey] || {})[policyYear] || 0;
                initialFee = (basePremium * initialFeeRateBase) + (extraPremium * initial_fees.EXTRA);
            }

            const investmentAmount = currentAccountValue + premiumIn - initialFee;

            const calendarYear = startYear + policyYear - 1;
            const adminFee = admin_fees[calendarYear] || admin_fees.default;

            const riskRateRecord = cost_of_insurance_rates.find(r => r.age === attainedAge);
            const riskRate = riskRateRecord ? riskRateRecord[genderKey] : 0;
            const sumAtRisk = Math.max(0, stbh - investmentAmount);
            
            const costOfInsurance = (sumAtRisk * riskRate) / 1000 / 12;

            let netInvestmentAmount = Math.max(0, investmentAmount - adminFee - costOfInsurance);

            let interestRateYearly = 0;
            const guaranteedRate = guaranteed_interest_rates[policyYear] || guaranteed_interest_rates.default;
            if (key === 'guaranteed') {
                interestRateYearly = guaranteedRate;
            } else if (key === 'customCapped') {
                interestRateYearly = (policyYear <= 20) ? customRate : guaranteedRate;
            } else {
                interestRateYearly = customRate;
            }
            const interest = netInvestmentAmount * (interestRateYearly / 12);

            // ==========================================================
            // ===== LOGIC THƯỞNG ĐÃ ĐƯỢC CẬP NHẬT =====
            // ==========================================================
            let bonus = 0;
            const bonusInfo = persistency_bonus.find(b => b.year === policyYear);
            if (bonusInfo && month % 12 === 0) {
                const bonusYear = bonusInfo.year;
                // Chỉ áp dụng thưởng nếu thời gian đóng phí đủ dài
                if (bonusYear === 10 && paymentTerm >= 10) {
                    bonus = basePremium * bonusInfo.rate;
                } else if (bonusYear === 20 && paymentTerm >= 20) {
                    bonus = basePremium * bonusInfo.rate;
                } else if (bonusYear === 30 && paymentTerm >= 30) {
                    bonus = basePremium * bonusInfo.rate;
                }
            }
            
            scenarios[key].accountValue = netInvestmentAmount + interest + bonus;

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

/**
 * Checks eligibility for PUL products based on STBH and premium.
 * @param {number} stbh - The sum assured for the main product.
 * @param {number} premium - The calculated base premium for the main product.
 * @returns {object} An object with validation status and reasons.
 */
function getPulEligibilityState(stbh, premium) {
    const { MAIN_PRODUCT_MIN_STBH, PUL_MIN_STBH_OR, PUL_MIN_PREMIUM_OR, MAIN_PRODUCT_MIN_PREMIUM } = CONFIG;

    const result = {
        stbhValid: true,
        premiumValid: true,
        stbhReason: '',
        premiumReason: '',
        ridersEnabled: true,
        ridersReason: ''
    };

    if (stbh > 0 && stbh < MAIN_PRODUCT_MIN_STBH) {
        result.stbhValid = false;
        result.stbhReason = `STBH tối thiểu: ${MAIN_PRODUCT_MIN_STBH.toLocaleString('vi-VN')} đ`;
        result.ridersEnabled = false;
        result.ridersReason = `Cần STBH ≥ ${MAIN_PRODUCT_MIN_STBH.toLocaleString('vi-VN')} đ (hiện tại: ${stbh.toLocaleString('vi-VN')} đ)`;
    } else if (stbh >= MAIN_PRODUCT_MIN_STBH && stbh < PUL_MIN_STBH_OR) {
        if (premium > 0 && premium < PUL_MIN_PREMIUM_OR) {
            result.premiumValid = false;
            result.premiumReason = `Phí tối thiểu: ${PUL_MIN_PREMIUM_OR.toLocaleString('vi-VN')} đ`;
            result.ridersEnabled = false;
            result.ridersReason = `Cần phí chính ≥ ${PUL_MIN_PREMIUM_OR.toLocaleString('vi-VN')} đ (STBH < ${PUL_MIN_STBH_OR.toLocaleString('vi-VN')} đ)`;
        }
    } else if (stbh >= PUL_MIN_STBH_OR) {
        if (premium > 0 && premium < MAIN_PRODUCT_MIN_PREMIUM) {
            result.premiumValid = false;
            result.premiumReason = `Phí tối thiểu: ${MAIN_PRODUCT_MIN_PREMIUM.toLocaleString('vi-VN')} đ`;
            result.ridersEnabled = false;
            result.ridersReason = `Cần phí chính ≥ ${MAIN_PRODUCT_MIN_PREMIUM.toLocaleString('vi-VN')} đ`;
        }
    }
    return result;
}
// ===================================================================================
// ===== MODULE: UI (Rendering, DOM manipulation, Event Listeners)
// ===================================================================================

function renderUI() {
    // Enforce Trọn Tâm An: remove & hide supplementary-insured section
    try {
      const mainProductKey = document.getElementById('main-product')?.value || appState.mainProduct.key || '';
      const isTTA = (mainProductKey === 'TRON_TAM_AN');
      const cont = document.getElementById('supplementary-insured-container');
      const btn  = document.getElementById('add-supp-insured-btn');
      if (isTTA) {
        if (cont) cont.innerHTML = '';
        if (Array.isArray(appState.supplementaryPersons)) appState.supplementaryPersons = [];
        if (cont) cont.classList.add('hidden');
        if (btn)  btn.classList.add('hidden');
      } else {
        if (cont) cont.classList.remove('hidden');
        if (btn)  btn.classList.remove('hidden');
      }
    } catch (e) {}

    clearAllErrors();
    const allPersons = [appState.mainPerson, ...appState.supplementaryPersons].filter(p => p);

    allPersons.forEach(p => {
        if (p.container) {
            p.container.querySelector('.age-span').textContent = p.age;
            p.container.querySelector('.risk-group-span').textContent = p.riskGroup > 0 ? p.riskGroup : '...';
        }
    });

    renderMainProductSection(appState.mainPerson, appState.mainProduct.key);
    
    // Calculate validity ONCE and use it to control all dependent UI parts
    const isMainProductValid = runAllValidations(appState);

    allPersons.forEach(p => {
        const suppContainer = p.isMain
            ? document.querySelector('#main-supp-container .supplementary-products-container')
            : p.container.querySelector('.supplementary-products-container');
        if (suppContainer) {
            renderSupplementaryProductsForPerson(p, appState.mainProduct.key, appState.fees.baseMain, suppContainer, isMainProductValid);
        }
    });
    
    // NEW: Disable related sections if main product is invalid
    updateSupplementaryAddButtonState(isMainProductValid);
    const mdp3Section = document.getElementById('mdp3-section');
    if (mdp3Section) {
        const isDisabled = !isMainProductValid || (document.getElementById('main-product')?.value === 'TRON_TAM_AN');
        mdp3Section.classList.toggle('opacity-50', isDisabled);
        mdp3Section.classList.toggle('pointer-events-none', isDisabled);
    }

    const fees = appState.fees;
    const summaryTotalEl = document.getElementById('summary-total');
    const mainFeeEl = document.getElementById('main-insured-main-fee');
    const extraFeeEl = document.getElementById('main-insured-extra-fee');
    const suppFeeEl = document.getElementById('summary-supp-fee');

    if (!isMainProductValid) {
        // Still show main product fees for user feedback
        if (mainFeeEl)  mainFeeEl.textContent  = formatDisplayCurrency(fees.baseMain);
        if (extraFeeEl) extraFeeEl.textContent = formatDisplayCurrency(fees.extra);
        // Reset totals and supplementary fees as they are not applicable yet
        if (summaryTotalEl) summaryTotalEl.textContent = "0";
        if (suppFeeEl)      suppFeeEl.textContent      = "0";
        
        updateMainProductFeeDisplay(fees.baseMain, fees.extra);
        updatePaymentFrequencyOptions(fees.baseMain);
        updateSummaryUI(fees, false); // Pass invalid state to summary
        if (window.renderSection6V2) window.renderSection6V2();
        return;
    }
    
    if (summaryTotalEl) summaryTotalEl.textContent = formatDisplayCurrency(fees.total);
    if (mainFeeEl) mainFeeEl.textContent = formatDisplayCurrency(fees.baseMain);
    if (extraFeeEl) extraFeeEl.textContent = formatDisplayCurrency(fees.extra);
    if (suppFeeEl) suppFeeEl.textContent = formatDisplayCurrency(fees.totalSupp);

    updateMainProductFeeDisplay(fees.baseMain, fees.extra);
    updatePaymentFrequencyOptions(fees.baseMain);
    updateSummaryUI(fees, true);
    if (window.renderSection6V2) window.renderSection6V2();
}

let lastRenderedProductKey = null;
let lastRenderedAge = null;
function renderMainProductSection(customer, mainProductKey) {
    const mainProductSelect = document.getElementById('main-product');

    document.querySelectorAll('#main-product option').forEach(option => {
        const productKey = option.value;
        if (!productKey) return;
        let isEligible = true;
        const { age, daysFromBirth, gender, riskGroup } = customer;
        if (CONFIG.PRODUCT_GROUPS.PUL_MUL.includes(productKey)) {
            isEligible = (daysFromBirth >= 30) && (age <= 70);
        } else if (productKey === 'TRON_TAM_AN') {
            const withinAge = (gender === 'Nam') ? (age >= 12 && age <= 60) : (age >= 28 && age <= 60);
            isEligible = withinAge && (riskGroup !== 4) && (riskGroup !== 0);
        } else if (productKey === 'AN_BINH_UU_VIET') {
            isEligible = (gender === 'Nam' ? age >= 12 : age >= 28) && (age <= 65);
        }
        option.disabled = !isEligible;
        option.classList.toggle('hidden', !isEligible);
    });
    
    if (mainProductSelect.options[mainProductSelect.selectedIndex]?.disabled) {
        mainProductSelect.value = "";
        mainProductKey = "";
    }
    
    if (lastRenderedProductKey === mainProductKey && lastRenderedAge === customer.age) return;
    lastRenderedProductKey = mainProductKey;
    lastRenderedAge = customer.age;

    const container = document.getElementById('main-product-options');
    let currentStbh = document.getElementById('main-stbh')?.value || '';
    let currentPremium = document.getElementById('main-premium-input')?.value || '';
    let currentPaymentTerm = document.getElementById('payment-term')?.value || '';
    let currentExtra = document.getElementById('extra-premium-input')?.value || '';
    
    container.innerHTML = '';
    if (!mainProductKey) return;
    
    let optionsHtml = '';
    if (mainProductKey === 'TRON_TAM_AN') {
      optionsHtml = `
        <div>
          <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
          <input type="text" id="main-stbh" class="form-input bg-gray-100" value="100.000.000" disabled>
        </div>
        <div>
          <p class="text-sm text-gray-600 mt-1">Thời hạn đóng phí: 10 năm (bằng thời hạn hợp đồng). Thời gian bảo vệ: 10 năm.</p>
        </div>`;
    } else if (mainProductKey === 'AN_BINH_UU_VIET') {
      optionsHtml = `
        <div>
          <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH) <span class="text-red-600">*</span></label>
          <input type="text" id="main-stbh" class="form-input" value="${currentStbh}" placeholder="VD: 1.000.000.000">
        </div>`;
      let termOptions = '';
      if (customer.age <= 55) termOptions += '<option value="15">15 năm</option>';
      if (customer.age <= 60) termOptions += '<option value="10">10 năm</option>';
      if (customer.age <= 65) termOptions += '<option value="5">5 năm</option>';
      if (!termOptions) termOptions = '<option value="" disabled>Không có kỳ hạn phù hợp</option>';
      optionsHtml += `
        <div>
          <label for="abuv-term" class="font-medium text-gray-700 block mb-1">Thời hạn đóng phí <span class="text-red-600">*</span></label>
          <select id="abuv-term" class="form-select"><option value="" selected>-- Chọn --</option>${termOptions}</select>
          <p class="text-sm text-gray-500 mt-1">Thời hạn đóng phí bằng thời hạn hợp đồng.</p>
        </div>`;
    } else if (CONFIG.PRODUCT_GROUPS.PUL_MUL.includes(mainProductKey)) {
      optionsHtml = `
        <div>
          <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH) <span class="text-red-600">*</span></label>
          <input type="text" id="main-stbh" class="form-input" value="${currentStbh}" placeholder="VD: 1.000.000.000">
        </div>`;
      if (CONFIG.PRODUCT_GROUPS.MUL.includes(mainProductKey)) {
        optionsHtml += `
          <div>
            <label for="main-premium-input" class="font-medium text-gray-700 block mb-1">Phí sản phẩm chính</label>
            <input type="text" id="main-premium-input" class="form-input" value="${currentPremium}" placeholder="Nhập phí">
            <div id="mul-fee-range" class="text-sm text-gray-500 mt-1"></div>
          </div>`;
      }
      optionsHtml += `
        <div>
          <label for="payment-term" class="font-medium text-gray-700 block mb-1">Thời gian đóng phí (năm) <span class="text-red-600">*</span></label>
          <input type="number" id="payment-term" class="form-input" value="${currentPaymentTerm}" placeholder="VD: 20" min="${mainProductKey === 'PUL_5NAM' ? 5 : mainProductKey === 'PUL_15NAM' ? 15 : 4}" max="${100 - customer.age - 1}">
          <div id="payment-term-hint" class="text-sm text-gray-500 mt-1"></div>
        </div>`;
      optionsHtml += `
        <div>
          <label for="extra-premium-input" class="font-medium text-gray-700 block mb-1">Phí đóng thêm</label>
          <input type="text" id="extra-premium-input" class="form-input" value="${currentExtra || ''}" placeholder="VD: 10.000.000">
          <div class="text-sm text-gray-500 mt-1">Tối đa ${CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính.</div>
        </div>`;
    }
    
    container.innerHTML = optionsHtml;
    
    if (CONFIG.PRODUCT_GROUPS.PUL_MUL.includes(mainProductKey)) {
      setPaymentTermHint(mainProductKey, customer.age);
    }
    attachTermListenersForTargetAge();
}

function renderSupplementaryProductsForPerson(customer, mainProductKey, mainPremium, container, isMainProductValid) {
    const { age, riskGroup, daysFromBirth } = customer;
    
    const isBaseProduct = CONFIG.PRODUCT_GROUPS.BASE_PRODUCTS.includes(mainProductKey);
    const isTTA = mainProductKey === 'TRON_TAM_AN';

    // UNIFIED LOGIC: Disable all supplementary products if the main product is invalid.
    const ridersDisabled = !isMainProductValid;
    const ridersReason = ridersDisabled ? 'Vui lòng hoàn tất thông tin sản phẩm chính.' : '';

    let anyUncheckedByRule = false;

    CONFIG.supplementaryProducts.forEach(prod => {
        const section = container.querySelector(`.${prod.id}-section`);
        if (!section) return;

        const isEligible = isBaseProduct
            && daysFromBirth >= 30
            && age >= 0 && age <= prod.maxEntryAge
            && (prod.id !== 'health_scl' || (riskGroup !== 4 && riskGroup !== 0))
            && (!isTTA || prod.id === 'health_scl');

        section.classList.toggle('hidden', !isEligible);

        const checkbox = section.querySelector(`.${prod.id}-checkbox`);
        if (!checkbox) return;

        if (!isEligible) {
            if (checkbox.checked) {
                checkbox.checked = false;
                anyUncheckedByRule = true;
            }
        }
        
        // Apply global disabling rule
        if (ridersDisabled) {
            if (checkbox.checked) {
                checkbox.checked = false;
                anyUncheckedByRule = true;
            }
            checkbox.disabled = true;
            section.classList.add('opacity-50');
            const msgEl = section.querySelector('.main-premium-threshold-msg');
            if (msgEl) {
                msgEl.textContent = ridersReason;
                msgEl.classList.remove('hidden');
            }
        } else {
            checkbox.disabled = !isEligible;
            section.classList.toggle('opacity-50', !isEligible);
            const msgEl = section.querySelector('.main-premium-threshold-msg');
            if (msgEl) {
                msgEl.textContent = '';
                msgEl.classList.add('hidden');
            }
        }

        const options = section.querySelector('.product-options');
        if (options) {
            options.classList.toggle('hidden', !checkbox.checked);
        }

        const fee = appState.fees.byPerson[customer.id]?.suppDetails?.[prod.id] || 0;
        const feeDisplay = section.querySelector('.fee-display');
        if (feeDisplay) {
            feeDisplay.textContent = fee > 0 ? `Phí: ${formatCurrency(fee)}` : '';
        }

        if (prod.id === 'health_scl' && section.querySelector('.health_scl-checkbox')?.checked) {
            const comps = getHealthSclFeeComponents(customer);
            const outpatientCb = section.querySelector('.health-scl-outpatient');
            const dentalCb = section.querySelector('.health-scl-dental');
            const outSpan = section.querySelector('.scl-outpatient-fee');
            const dentalSpan = section.querySelector('.scl-dental-fee');

            if (outSpan) {
                outSpan.textContent = (outpatientCb && outpatientCb.checked && comps.outpatient > 0)
                  ? `(+${formatCurrency(comps.outpatient)})`
                  : '';
            }
            if (dentalSpan) {
                dentalSpan.textContent = (dentalCb && dentalCb.checked && comps.dental > 0)
                  ? `(+${formatCurrency(comps.dental)})`
                  : '';
            }
        }
    });

    if (anyUncheckedByRule && typeof runWorkflowDebounced === 'function') {
        runWorkflowDebounced();
    }

    const sclSection = container.querySelector('.health_scl-section');
    if (sclSection && !sclSection.classList.contains('hidden')) {
        const programSelect = sclSection.querySelector('.health-scl-program');
        const checkbox = sclSection.querySelector('.health_scl-checkbox');
        if (checkbox && isTTA && !checkbox.checked && !ridersDisabled) {
            checkbox.checked = true;
            sclSection.querySelector('.product-options')?.classList.remove('hidden');
        }

        if (ridersDisabled) {
            return;
        } else if (isTTA) {
            Array.from(programSelect.options).forEach(opt => opt.disabled = false);
        } else {
            programSelect.querySelectorAll('option').forEach(opt => {
                if (opt.value === 'nang_cao') return;
                if (mainPremium >= 15000000) {
                    opt.disabled = false;
                } else if (mainPremium >= 10000000) {
                    opt.disabled = !['co_ban', 'nang_cao', 'toan_dien'].includes(opt.value);
                } else if (mainPremium >= 5000000) {
                    opt.disabled = !['co_ban', 'nang_cao'].includes(opt.value);
                } else {
                    opt.disabled = true;
                }
            });
            if (programSelect.options[programSelect.selectedIndex]?.disabled) {
                programSelect.value = '';
            }

            const stbhHintEl = sclSection.querySelector('.health-scl-stbh-hint');
            if (stbhHintEl && programSelect) {
                const setHint = () => {
                    const opt = programSelect.selectedOptions[0];
                    stbhHintEl.textContent = opt && opt.dataset.stbh
                        ? `STBH: ${formatCurrency(Number(opt.dataset.stbh))}`
                        : '';
                };
                setHint();
                if (!programSelect.dataset._bindStbh) {
                    programSelect.addEventListener('change', setHint);
                    programSelect.dataset._bindStbh = '1';
                }
            }
        }
    }
}

function updateSummaryUI(fees, isValid = true) {
  const f = fees || { baseMain:0, extra:0, totalSupp:0, total:0 };
  const fmt = (n)=> formatDisplayCurrency(Math.round((Number(n)||0)/1000)*1000);

  // If not valid, reset supplementary and total fees to 0 for display
  const displayTotal = isValid ? f.total : 0;
  const displayTotalSupp = isValid ? f.totalSupp : 0;

  // Main sections
  const totalEl = document.getElementById('summary-total');
  const mainEl  = document.getElementById('main-insured-main-fee');
  const extraEl = document.getElementById('main-insured-extra-fee');
  const suppEl  = document.getElementById('summary-supp-fee');
  if (totalEl) totalEl.textContent = fmt(displayTotal);
  if (mainEl)  mainEl.textContent  = fmt(f.baseMain);
  if (extraEl) extraEl.textContent = fmt(f.extra);
  if (suppEl)  suppEl.textContent  = fmt(displayTotalSupp);

  // Payment frequency
  const freqSel = document.getElementById('payment-frequency');
  const freqBox = document.getElementById('frequency-breakdown');
  const v = freqSel ? freqSel.value : 'year';
  const periods = v==='half' ? 2 : (v==='quarter' ? 4 : 1);
  const factor  = periods===2 ? 1.02 : (periods===4 ? 1.04 : 1);

  if (freqBox) freqBox.classList.toggle('hidden', periods===1);

  // Fees per period
  const perMain  = periods===1 ? 0 : roundDownTo1000((f.baseMain||0)/periods);
  const perExtra = periods===1 ? 0 : roundDownTo1000((f.extra||0)/periods);
  const perSupp  = periods===1 ? 0 : roundDownTo1000(((displayTotalSupp||0)*factor)/periods);

  const perTotal = periods===1 ? 0 : (perMain + perExtra + perSupp);
  const annualEquivalent = periods===1 ? displayTotal : (perTotal * periods);
  const annualOriginal   = displayTotal;
  const diff             = annualEquivalent - annualOriginal;

  const set = (id, val)=>{ const el=document.getElementById(id); if(el) el.textContent=fmt(val); };
  set('freq-main', perMain);
  set('freq-extra', perExtra);
  set('freq-supp-total', perSupp);
  set('freq-total-period', perTotal);
  set('freq-total-year', annualOriginal);
  set('freq-diff', diff);
  set('freq-total-year-equivalent', annualEquivalent);

  if (document.getElementById('freq-total-year-equivalent') && periods===1) {
      document.getElementById('freq-total-year-equivalent').textContent = '';
  }
}

function updateMainProductFeeDisplay(basePremium, extraPremium) {
    const el = document.getElementById('main-product-fee-display');
    if (!el) return;
    if (basePremium <= 0 && extraPremium <= 0) {
      el.textContent = '';
      return;
    }
    if (extraPremium > 0) {
      el.innerHTML = `Phí SP chính: ${formatCurrency(basePremium)} | Phí đóng thêm: ${formatCurrency(extraPremium)} | Tổng: ${formatCurrency(basePremium + extraPremium)}`;
    } else {
      el.textContent = `Phí SP chính: ${formatCurrency(basePremium)}`;
    }
}

function updatePaymentFrequencyOptions(baseMainAnnual) {
    const sel = document.getElementById('payment-frequency');
    if (!sel) return;
    const optHalf = sel.querySelector('option[value="half"]');
    const optQuarter = sel.querySelector('option[value="quarter"]');
    
    const allowHalf = baseMainAnnual >= CONFIG.PAYMENT_FREQUENCY_THRESHOLDS.half;
    const allowQuarter = baseMainAnnual >= CONFIG.PAYMENT_FREQUENCY_THRESHOLDS.quarter;

    if (optHalf) {
      optHalf.disabled = !allowHalf;
      optHalf.classList.toggle('hidden', !allowHalf);
    }
    if (optQuarter) {
      optQuarter.disabled = !allowQuarter;
      optQuarter.classList.toggle('hidden', !allowQuarter);
    }
  
    if (sel.value === 'quarter' && !allowQuarter) {
      sel.value = allowHalf ? 'half' : 'year';
    } else if (sel.value === 'half' && !allowHalf) {
      sel.value = 'year';
    }
}


// ===================================================================================
// ===== MODULE: VALIDATION
// ===================================================================================
function runAllValidations(state) {
    let isValid = true;
    if (!validateMainPersonInputs(state.mainPerson)) isValid = false;
    if (!validateMainProductInputs(state.mainPerson, state.mainProduct, state.fees.baseMain)) isValid = false;
    if (!validateExtraPremium(state.fees.baseMain, state.mainProduct.extraPremium)) isValid = false;
    if (!validateTargetAge(state.mainPerson, state.mainProduct)) isValid = false;
    
    const allPersons = [state.mainPerson, ...state.supplementaryPersons].filter(p=>p);
    let totalHospitalSupportStbh = 0;
    
    allPersons.forEach(p => {
        if (!p.isMain) {
            // Validate supplementary person inputs but DO NOT change isValid.
            // These are warnings for the user to fix, not hard stops for calculation.
            validateSupplementaryPersonInputs(p);
        }
        for (const prodId in p.supplements) {
            validateSupplementaryProduct(p, prodId, state.fees.baseMain, totalHospitalSupportStbh);
            if (prodId === 'hospital_support') {
                totalHospitalSupportStbh += p.supplements[prodId].stbh;
            }
        }
    });

    return isValid;
}

function validateMainPersonInputs(person) {
    const container = person.container;
    if (!container) return true;
    let ok = true;
    const nameInput = container.querySelector('.name-input');
    const dobInput = container.querySelector('.dob-input');
    const occupationInput = container.querySelector('.occupation-input');
    if (nameInput && !(nameInput.value || '').trim()) {
        setFieldError(nameInput, 'Vui lòng nhập họ và tên'); ok = false;
    } else { clearFieldError(nameInput); }
    if (!validateDobField(dobInput)) ok = false;
    const group = parseInt(occupationInput?.dataset.group, 10);
    if (occupationInput && (!group || group < 1 || group > 4)) {
        setFieldError(occupationInput, 'Chọn nghề nghiệp từ danh sách'); ok = false;
    } else { clearFieldError(occupationInput); }

    return ok;
}

function validateSupplementaryPersonInputs(person) {
    const container = person.container;
    if (!container) return;

    const nameInput = container.querySelector('.name-input');
    if (nameInput && !(nameInput.value || '').trim()) {
        setFieldError(nameInput, 'Vui lòng nhập họ và tên');
    } else {
        clearFieldError(nameInput);
    }

    validateDobField(container.querySelector('.dob-input'));

    const occupationInput = container.querySelector('.occupation-input');
    const group = parseInt(occupationInput?.dataset.group, 10);
    if (occupationInput && (!group || group < 1 || group > 4)) {
        setFieldError(occupationInput, 'Chọn nghề nghiệp từ danh sách');
    } else {
        clearFieldError(occupationInput);
    }
}

function validateMainProductInputs(customer, productInfo, basePremium) {
    let ok = true;
    const { key: mainProduct, stbh, premium, paymentTerm, abuvTerm } = productInfo;
    const stbhEl = document.getElementById('main-stbh');
    const termEl = document.getElementById('payment-term');
    const abuvTermEl = document.getElementById('abuv-term');

    if (CONFIG.PRODUCT_GROUPS.PUL.includes(mainProduct)) {
        const pulState = getPulEligibilityState(stbh, basePremium);
        const feeInputForPul = stbhEl;
        if (!pulState.stbhValid) {
            setFieldError(stbhEl, pulState.stbhReason);
            ok = false;
        } else { clearFieldError(stbhEl); }
        if (!pulState.premiumValid) {
            setFieldError(feeInputForPul, pulState.premiumReason);
            ok = false;
        } else if (pulState.stbhValid) {
            clearFieldError(feeInputForPul);
        }
    } else if (mainProduct && mainProduct !== 'TRON_TAM_AN') {
        if (stbh > 0 && stbh < CONFIG.MAIN_PRODUCT_MIN_STBH) {
            setFieldError(stbhEl, `STBH tối thiểu ${formatCurrency(CONFIG.MAIN_PRODUCT_MIN_STBH,'')}`);
            ok = false;
        } else {
            clearFieldError(stbhEl);
        }
    }
    
    if (
        mainProduct &&
        !['TRON_TAM_AN'].includes(mainProduct) &&
        !CONFIG.PRODUCT_GROUPS.PUL.includes(mainProduct) &&
        !CONFIG.PRODUCT_GROUPS.MUL.includes(mainProduct) &&
        basePremium > 0 &&
        basePremium < CONFIG.MAIN_PRODUCT_MIN_PREMIUM
    ) {
        const feeInput = document.getElementById('main-premium-input') || stbhEl;
        setFieldError(feeInput, `Phí chính tối thiểu ${formatCurrency(CONFIG.MAIN_PRODUCT_MIN_PREMIUM,'')}`);
        ok = false;
    }
    
    const age = customer?.age || 0;
    const bounds = getPaymentTermBounds(age);
    let minTerm = 4;
    if (mainProduct === 'PUL_5NAM') minTerm = 5;
    if (mainProduct === 'PUL_15NAM') minTerm = 15;
    if (mainProduct === 'AN_BINH_UU_VIET') {
        const allowed = [];
        if (age <= 65) allowed.push(5);
        if (age <= 60) allowed.push(10);
        if (age <= 55) allowed.push(15);
        const v = parseInt(abuvTermEl?.value || "0", 10);
        if (!allowed.includes(v)) {
            setFieldError(abuvTermEl, 'Chọn 5 / 10 / 15 năm phù hợp với độ tuổi');
            ok = false;
        } else { clearFieldError(abuvTermEl); }
    } else if (CONFIG.PRODUCT_GROUPS.PUL_MUL.includes(mainProduct)) {
        const v = parseInt(termEl?.value || "0", 10);
        const maxTerm = bounds.max;
        if (!(v >= minTerm && v <= maxTerm)) {
            setFieldError(termEl, `Nhập từ ${minTerm} đến ${maxTerm} năm`);
            ok = false;
        } else { clearFieldError(termEl); }
    }

    if (CONFIG.PRODUCT_GROUPS.MUL.includes(mainProduct)) {
        const feeInput = document.getElementById('main-premium-input');
        let mulError = false;

        if (premium > 0 && premium < CONFIG.MAIN_PRODUCT_MIN_PREMIUM) {
            setFieldError(feeInput, `Phí tối thiểu ${formatCurrency(CONFIG.MAIN_PRODUCT_MIN_PREMIUM, '')}`);
            ok = false;
            mulError = true;
        }

        const factorRow = product_data.mul_factors.find(f => customer.age >= f.ageMin && customer.age <= f.ageMax);
        const rangeEl = document.getElementById('mul-fee-range');
        if (factorRow && stbh > 0) {
            const minFee = stbh / factorRow.maxFactor;
            const maxFee = stbh / factorRow.minFactor;
            if(rangeEl) rangeEl.textContent = `Phí hợp lệ từ ${formatCurrency(minFee, '')} đến ${formatCurrency(maxFee, '')}.`;
            if (premium > 0 && (premium < minFee || premium > maxFee)) {
                if (!mulError) {
                    setFieldError(feeInput, 'Phí không hợp lệ so với STBH');
                }
                ok = false;
                mulError = true;
            }
        } else if (rangeEl) {
            rangeEl.textContent = '';
        }

        if (!mulError) {
            clearFieldError(feeInput);
        }
    }
    return ok;
}

function validateExtraPremium(basePremium, extraPremium) {
    const el = document.getElementById('extra-premium-input');
    if (!el) return true;
    if (extraPremium > 0 && basePremium > 0 && extraPremium > CONFIG.EXTRA_PREMIUM_MAX_FACTOR * basePremium) {
        setFieldError(el, `Tối đa ${CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính`);
        return false;
    }
    clearFieldError(el);
    return true;
}

function validateSupplementaryProduct(person, prodId, mainPremium, totalHospitalSupportStbh) {
    const config = CONFIG.supplementaryProducts.find(p => p.id === prodId);
    if (!config) return true;
    const supplementData = person.supplements[prodId];
    if (!supplementData) return true;
    const stbh = supplementData.stbh;
    const suppContainer = person.isMain ? document.getElementById('main-supp-container') : person.container;
    const section = suppContainer.querySelector(`.${prodId}-section`);
    const input = section.querySelector(`.${prodId}-stbh`);
    if (!input) return true;

    let ok = true;

    if (prodId === 'hospital_support' && stbh > 0) {
        const validationEl = section.querySelector('.hospital-support-validation');
        const maxSupportTotal = Math.floor(mainPremium / 4000000) * 100000;
        const maxByAge = person.age >= 18 ? config.maxStbhByAge.from18 : config.maxStbhByAge.under18;
        const remaining = maxSupportTotal - totalHospitalSupportStbh;
        if (validationEl) {
            validationEl.textContent = `Tối đa: ${formatCurrency(Math.min(maxByAge, remaining), 'đ/ngày')}. Phải là bội số của 100.000.`;
        }

        if (stbh % CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE !== 0) {
            setFieldError(input, `Là bội số của ${formatCurrency(CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE, '')}`);
            ok = false;
        } else if (stbh > maxByAge || stbh > remaining) {
            setFieldError(input, 'Vượt quá giới hạn cho phép');
            ok = false;
        } else {
            clearFieldError(input);
        }
    } else if (stbh > 0) {
        const violateMin = config.minStbh && stbh < config.minStbh;
        const violateMax = config.maxStbh && stbh > config.maxStbh;
        if (violateMin || violateMax) {
            let msg;
            if (config.minStbh && config.maxStbh) {
                msg = `Tối thiểu ${formatCurrency(config.minStbh, '')}, tối đa ${formatCurrency(config.maxStbh, '')}`;
            } else if (config.minStbh) {
                msg = `Tối thiểu ${formatCurrency(config.minStbh, '')}`;
            } else {
                msg = `Tối đa ${formatCurrency(config.maxStbh, '')}`;
            }
            setFieldError(input, msg);
            ok = false;
        } else {
            clearFieldError(input);
        }
    } else {
        clearFieldError(input);
    }

    return ok;
}
function validateTargetAge(mainPerson, mainProductInfo) {
  const input = document.getElementById('target-age-input');
  if (!input) return true;

  if (input.disabled) {
    clearFieldError(input);
    return true;
  }

  const val = parseInt((input.value || '').trim(), 10);
  const age = mainPerson?.age || 0;

  let term = mainProductInfo?.paymentTerm || 0;
  const key = mainProductInfo?.key || '';

  if (key === 'TRON_TAM_AN') {
    term = 10;
  } else if (key === 'AN_BINH_UU_VIET') {
    term = parseInt(document.getElementById('abuv-term')?.value || '0', 10) || 0;
  }

  if (!age || !term) {
    clearFieldError(input);
    return true;
  }

  const minAllowed = age + term - 1;
  const maxAllowed = 100;

  let ok = true;
  if (!val || val < minAllowed || val > maxAllowed) {
    setFieldError(input, `Tuổi minh họa phải từ ${minAllowed} đến ${maxAllowed}`);
    ok = false;
  } else {
    clearFieldError(input);
  }
  return ok;
}

function validateDobField(input) {
    if (!input) return false;
    const v = (input.value || '').trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
        setFieldError(input, 'Nhập DD/MM/YYYY'); return false;
    }
    const [dd, mm, yyyy] = v.split('/').map(n => parseInt(n, 10));
    const d = new Date(yyyy, mm - 1, dd);
    const valid = d.getFullYear() === yyyy && d.getMonth() === (mm - 1) && d.getDate() === dd && d <= CONFIG.REFERENCE_DATE;
    if (!valid) {
        setFieldError(input, 'Ngày sinh không hợp lệ'); return false;
    }
    clearFieldError(input);
    return true;
}

function setFieldError(input, message) { 
    if (!input) return;
    let err = input.parentElement.querySelector('.field-error');
    if (!err) {
      err = document.createElement('p');
      err.className = 'field-error text-sm text-red-600 mt-1';
      input.parentElement.appendChild(err);
    }
    err.textContent = message || '';
    input.classList.toggle('border-red-500', !!message);
}

function clearFieldError(input) { setFieldError(input, ''); }

function clearAllErrors() { 
    document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
    document.querySelectorAll('.border-red-500').forEach(el => el.classList.remove('border-red-500'));
    const errorMsgEl = document.getElementById('error-message');
    if(errorMsgEl) errorMsgEl.textContent = '';
}
// ===================================================================================
// ===== MODULE: INITIALIZATION & EVENT BINDING
// ===================================================================================

document.addEventListener('DOMContentLoaded', () => {
    initState();
    initPerson(appState.mainPerson.container, true);
    initSupplementaryButton();
    initSummaryModal();
    attachGlobalListeners();
    updateSupplementaryAddButtonState(false); // Initial state is invalid
    runWorkflow();
    if (window.MDP3) MDP3.init();
    if (window.renderSection6V2) window.renderSection6V2();

    const diffEl = document.getElementById('freq-diff');
    if (diffEl) {
        diffEl.classList.add('text-red-600', 'font-bold');
    }
    const container = document.getElementById('results-container');
    if (container) {
        container.querySelectorAll('h2, .text-2xl, .text-lg, .text-sm, span, li').forEach(el => {
            if (getComputedStyle(el).fontSize && parseFloat(getComputedStyle(el).fontSize) < 12) {
                el.style.fontSize = '12px';
            }
        });
    }
});
function runWorkflow() {
  updateStateFromUI();
  const calculatedFees = performCalculations(appState);
  appState.fees = calculatedFees;
  renderUI();
  try { renderSuppList(); } catch(e) {}
}

const runWorkflowDebounced = debounce(runWorkflow, 40);


function attachGlobalListeners() {
    document.body.addEventListener('change', (e) => {
        hideGlobalErrors();
        if (e.target.id === 'main-product') {
            lastRenderedProductKey = null;
            if (window.MDP3) MDP3.reset();
        }
        runWorkflow();
        if (window.MDP3 && !e.target.closest('#mdp3-section')) {
            const resetSelectors = ['.dob-input', '.health-scl-checkbox', '.bhn-checkbox'];
            if (resetSelectors.some(sel => e.target.matches(sel))) { MDP3.resetIfEnabled(); }
        }
    });

    document.body.addEventListener('input', (e) => {
        hideGlobalErrors();
        if (e.target.matches('input[type="text"]') && !e.target.classList.contains('dob-input') && !e.target.classList.contains('name-input') && !e.target.classList.contains('occupation-input')) {
            formatNumberInput(e.target);
        }
        runWorkflowDebounced();
    });

    document.body.addEventListener('focusout', (e) => {
        hideGlobalErrors();
        if (e.target.matches('input[type="text"]')) {
            roundInputToThousand(e.target);
            if (e.target.classList.contains('dob-input')) validateDobField(e.target);
            runWorkflow();
        }
    }, true);
}

function initPerson(container, isMain = false) {
    if (!container) return;
    initDateFormatter(container.querySelector('.dob-input'));
    initOccupationAutocomplete(container.querySelector('.occupation-input'), container);
    
    const suppProductsContainer = isMain 
        ? document.querySelector('#main-supp-container .supplementary-products-container') 
        : container.querySelector('.supplementary-products-container');
    
    if (suppProductsContainer) {
        suppProductsContainer.innerHTML = generateSupplementaryProductsHtml();
    }
}

function initSupplementaryButton() {
    document.getElementById('add-supp-insured-btn').addEventListener('click', () => {
        if (appState.supplementaryPersons.length >= CONFIG.MAX_SUPPLEMENTARY_INSURED) return;
        
        const count = document.querySelectorAll('#supplementary-insured-container .person-container').length + 1;
        const personId = `supp${Date.now()}`;
        
        const newPersonDiv = document.createElement('div');
        newPersonDiv.id = `person-container-${personId}`;
        newPersonDiv.className = 'person-container space-y-6 bg-gray-100 p-4 rounded-lg mt-4';
        newPersonDiv.innerHTML = generateSupplementaryPersonHtml(personId, count);

        document.getElementById('supplementary-insured-container').appendChild(newPersonDiv);

        newPersonDiv.querySelector('.remove-supp-btn').addEventListener('click', () => {
            newPersonDiv.remove();
            if (window.MDP3) MDP3.reset();
            runWorkflow();
        });
        
        initPerson(newPersonDiv, false);
        if (window.MDP3) MDP3.reset();
        runWorkflow();
    });
}

function generateSupplementaryPersonHtml(personId, count) {
  return `
    <button class="w-full text-right text-sm text-red-600 font-semibold remove-supp-btn">Xóa NĐBH này</button>
    <h3 class="text-lg font-bold text-gray-700 mb-2 border-t pt-4">NĐBH Bổ Sung ${count}</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label for="name-${personId}" class="font-medium text-gray-700 block mb-1">Họ và Tên</label>
        <input type="text" id="name-${personId}" class="form-input name-input" placeholder="Trần Thị B">
      </div>
      <div>
        <label for="dob-${personId}" class="font-medium text-gray-700 block mb-1">Ngày sinh</label>
        <input type="text" id="dob-${personId}" class="form-input dob-input" placeholder="DD/MM/YYYY">
      </div>
      <div>
        <label for="gender-${personId}" class="font-medium text-gray-700 block mb-1">Giới tính</label>
        <select id="gender-${personId}" class="form-select gender-select">
          <option value="Nam">Nam</option>
          <option value="Nữ">Nữ</option>
        </select>
      </div>
      <div class="flex items-end space-x-4">
        <p class="text-lg">Tuổi: <span id="age-${personId}" class="font-bold text-aia-red age-span">0</span></p>
      </div>
      <div class="relative">
        <label for="occupation-input-${personId}" class="font-medium text-gray-700 block mb-1">Nghề nghiệp</label>
        <input type="text" id="occupation-input-${personId}" class="form-input occupation-input" placeholder="Gõ để tìm nghề nghiệp...">
        <div class="occupation-autocomplete absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 hidden max-h-60 overflow-y-auto"></div>
      </div>
      <div class="flex items-end space-x-4">
        <p class="text-lg">Nhóm nghề: <span id="risk-group-${personId}" class="font-bold text-aia-red risk-group-span">...</span></p>
      </div>
    </div>
    <div class="mt-4">
      <h4 class="text-md font-semibold text-gray-800 mb-2">Sản phẩm bổ sung cho người này</h4>
      <div class="supplementary-products-container space-y-6"></div>
    </div>
  `;
}

function updateSupplementaryAddButtonState(isMainProductValid) {
    const btn = document.getElementById('add-supp-insured-btn');
    if (!btn) return;
    const mainProductKey = document.getElementById('main-product')?.value || '';
    const count = document.querySelectorAll('#supplementary-insured-container .person-container').length;
    const isTTA = (mainProductKey === 'TRON_TAM_AN');
    const disabled = isTTA || (count >= CONFIG.MAX_SUPPLEMENTARY_INSURED) || !isMainProductValid;
    btn.disabled = disabled;
    btn.classList.toggle('opacity-50', disabled);
    btn.classList.toggle('cursor-not-allowed', disabled);
    btn.classList.toggle('hidden', isTTA);
}

function generateSupplementaryProductsHtml() {
    return CONFIG.supplementaryProducts.map(prod => {
        let optionsHtml = '';
        if (prod.id === 'health_scl') {
            optionsHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div>
                <label class="font-medium text-gray-700 block mb-1">Quyền lợi chính</label>
                <select class="form-select health-scl-program">
                  <option value="co_ban"    data-stbh="100000000">Cơ bản</option>
                  <option value="nang_cao"  data-stbh="250000000" selected>Nâng cao</option>
                  <option value="toan_dien" data-stbh="500000000">Toàn diện</option>
                  <option value="hoan_hao"  data-stbh="1000000000">Hoàn hảo</option>
                </select>
                <p class="text-sm text-gray-500 mt-1 health-scl-stbh-hint"></p>
              </div>    
              <div>
                <label class="font-medium text-gray-700 block mb-1">Phạm vi địa lý</label>
                <select class="form-select health-scl-scope">
                  <option value="main_vn">Việt Nam</option>
                  <option value="main_global">Nước ngoài</option>
                </select>
              </div>
            </div>
            <div>
              <span class="font-medium text-gray-700 block mb-2">Quyền lợi tùy chọn:</span>
              <div class="space-y-2">
                <label class="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" class="form-checkbox health-scl-outpatient">
                  <span>Điều trị ngoại trú</span>
                  <span class="scl-outpatient-fee ml-2 text-xs text-gray-600"></span>
                </label>
                <label class="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" class="form-checkbox health-scl-dental">
                  <span>Chăm sóc nha khoa</span>
                  <span class="scl-dental-fee ml-2 text-xs text-gray-600"></span>
                </label>
              </div>
            </div>`;
        } else {
            optionsHtml = `<div>
              <label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
              <input type="text" class="form-input ${prod.id}-stbh" placeholder="${
                prod.id==='bhn' ? 'VD: 200.000.000' :
                (prod.id==='accident' ? 'VD: 500.000.000' :
                  (prod.id==='hospital_support' ? 'Bội số 100.000 (đ/ngày)' : 'Nhập STBH')
                )
              }">
            </div>
            <p class="hospital-support-validation text-sm text-gray-500 mt-1"></p>`;
        }
        return `
        <div class="product-section ${prod.id}-section hidden">
          <label class="flex items-center space-x-3 cursor-pointer">
            <input type="checkbox" class="form-checkbox ${prod.id}-checkbox">
            <span class="text-lg font-medium text-gray-800">${prod.name}</span>
          </label>
          <div class="product-options hidden mt-3 pl-8 space-y-3 border-l-2 border-gray-200">
            ${optionsHtml}
            <p class="text-xs text-red-600 main-premium-threshold-msg hidden"></p>
            <div class="text-right font-semibold text-aia-red fee-display min-h-[1.5rem]"></div>
          </div>
        </div>`;
    }).join('');
}


function initOccupationAutocomplete(input, container) {
  if (!input) return;
  const autocompleteContainer = container.querySelector('.occupation-autocomplete');
  const riskGroupSpan = container.querySelector('.risk-group-span');

  const applyOccupation = (occ) => {
    input.value = occ.name;
    input.dataset.group = occ.group;
    if (riskGroupSpan) riskGroupSpan.textContent = occ.group;
    clearFieldError(input);
    autocompleteContainer.classList.add('hidden');
    runWorkflow();
  };

  const renderList = (filtered) => {
    autocompleteContainer.innerHTML = '';
    if (filtered.length === 0) {
      autocompleteContainer.classList.add('hidden');
      return;
    }
    filtered.forEach(occ => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.textContent = occ.name;
      item.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        applyOccupation(occ);
      });
      autocompleteContainer.appendChild(item);
    });
    autocompleteContainer.classList.remove('hidden');
  };

  input.addEventListener('input', () => {
    const value = input.value.trim().toLowerCase();
    if (value.length < 2) {
      autocompleteContainer.classList.add('hidden');
      return;
    }
    const filtered = product_data.occupations
      .filter(o => o.group > 0 && o.name.toLowerCase().includes(value));
    renderList(filtered);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      autocompleteContainer.classList.add('hidden');
      const typed = (input.value || '').trim().toLowerCase();
      const match = product_data.occupations.find(o => o.group > 0 && o.name.toLowerCase() === typed);
      if (!match) {
        input.dataset.group = '';
        if(riskGroupSpan) riskGroupSpan.textContent = '...';
      }
      runWorkflow();
    }, 200);
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      autocompleteContainer.classList.add('hidden');
    }
  });
}

function initDateFormatter(input) {
  if (!input) return;
  input.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 2) value = value.slice(0, 2) + '/' + value.slice(2);
    if (value.length > 5) value = value.slice(0, 5) + '/' + value.slice(5, 9);
    e.target.value = value.slice(0, 10);
  });
}

function roundInputToThousand(input) {
  if (!input || input.classList.contains('dob-input') || input.classList.contains('occupation-input') || input.classList.contains('name-input')) return;
  const raw = parseFormattedNumber(input.value || '');
  if (!raw) { input.value = ''; return; }

  const isHospitalDaily = input.classList.contains('hospital-support-stbh') || input.classList.contains('hospital_support-stbh');
  if (isHospitalDaily) {
      const rounded = Math.round(raw / CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE) * CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE;
      input.value = rounded.toLocaleString('vi-VN');
  } else {
      const rounded = roundDownTo1000(raw);
      input.value = formatCurrency(rounded);
  }
}

function formatNumberInput(input) {
  if (!input || !input.value) return;
  let value = input.value.replace(/[.,]/g, '');
  if (!isNaN(value) && value.length > 0) {
    input.value = parseInt(value, 10).toLocaleString('vi-VN');
  } else if (input.value !== '') {
    input.value = '';
  }
}

function initSummaryModal() {
  const modal = document.getElementById('summary-modal');
  document.getElementById('close-summary-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  updateTargetAge();

  document.getElementById('main-product').addEventListener('change', updateTargetAge);
  const mainDobInput = document.querySelector('#main-person-container .dob-input');
  if (mainDobInput) {
    mainDobInput.addEventListener('input', updateTargetAge);
  }
}
function updateTargetAge() {
    const mainPersonInfo = collectPersonData(document.getElementById('main-person-container'), true);
    const mainProduct = document.getElementById('main-product')?.value;
    const targetAgeInput = document.getElementById('target-age-input');

    if (!targetAgeInput || !mainPersonInfo || typeof mainPersonInfo.age !== 'number' || mainPersonInfo.age <= 0) return;

    const labelEl = document.querySelector('label[for="target-age-input"]');
    const hintEl  = document.getElementById('target-age-hint'); // giả sử có, nếu không có cũng không sao
    const isPulMul = CONFIG.PRODUCT_GROUPS.PUL_MUL.includes(mainProduct);

    if (hintEl) hintEl.textContent = '';
    if (labelEl && !isPulMul) {
        labelEl.textContent = 'Minh họa phí đến năm (tuổi NĐBH chính)';
    }

    if (mainProduct === 'TRON_TAM_AN') {
        targetAgeInput.disabled = true;
        targetAgeInput.value = mainPersonInfo.age + 10 - 1;
        if (hintEl) hintEl.textContent = '';
        return;
    }

    if (mainProduct === 'AN_BINH_UU_VIET') {
        const term = parseInt(document.getElementById('abuv-term')?.value || '15', 10);
        targetAgeInput.disabled = true;
        targetAgeInput.value = mainPersonInfo.age + term - 1;
        if (hintEl) hintEl.textContent = '';
        return;
    }

    targetAgeInput.disabled = false;

    const paymentTerm = parseInt(document.getElementById('payment-term')?.value, 10) || 0;

    if (!paymentTerm || paymentTerm <= 0) {
        targetAgeInput.removeAttribute('min');
        targetAgeInput.removeAttribute('max');
        if (isPulMul && hintEl) {
            hintEl.textContent = 'Nhập thời gian đóng phí để xác định tuổi minh họa.';
        }
        return;
    }

    const minAge = mainPersonInfo.age + paymentTerm - 1;
    const maxAge = 100; 

    targetAgeInput.min = String(minAge);
    targetAgeInput.max = String(maxAge);

    const curVal = parseInt(targetAgeInput.value || '0', 10);
    if (!curVal || curVal < minAge) {
        targetAgeInput.value = minAge;
    } else if (curVal > maxAge) {
        targetAgeInput.value = maxAge;
    }

    if (isPulMul) {
        if (labelEl) labelEl.textContent = 'Minh họa phí đến năm (tuổi NĐBH chính)';
        if (hintEl) {
            hintEl.innerHTML = `Khoảng hợp lệ: <strong>${minAge}</strong> – <strong>${maxAge}</strong>.`;
        }
    } else {
        if (hintEl) hintEl.textContent = '';
    }
}

function attachTermListenersForTargetAge() {
  const abuvTermSelect = document.getElementById('abuv-term');
  if (abuvTermSelect && !abuvTermSelect._boundTargetAge) {
    abuvTermSelect.addEventListener('change', updateTargetAge);
    abuvTermSelect._boundTargetAge = true;
  }
  const paymentTermInput = document.getElementById('payment-term');
  if (paymentTermInput && !paymentTermInput._boundTargetAge) {
    paymentTermInput.addEventListener('change', updateTargetAge);
    paymentTermInput._boundTargetAge = true;
  }
}

function setPaymentTermHint(mainProduct, age) {
  const hintEl = document.getElementById('payment-term-hint');
  if (!hintEl) return;
  const { max } = getPaymentTermBounds(age);
  let min = 4;
  if (mainProduct === 'PUL_5NAM') min = 5;
  if (mainProduct === 'PUL_15NAM') min = 15;
  hintEl.textContent = `Nhập từ ${min} đến ${max} năm`;
}

function getProductLabel(key) {
  return CONFIG.MAIN_PRODUCTS[key]?.name || key || '';
}

function getHealthSclStbhByProgram(program) {
    return CONFIG.supplementaryProducts.find(p=>p.id==='health_scl').stbhByProgram[program] || 0;
}

// ===================================================================================
// ===== ORIGINAL COMPLEX FUNCTIONS & EXTERNAL MODULES (FULLY INTEGRATED)
// ===================================================================================
// NOTE: These functions are preserved from your original file to ensure functionality.



// This is the full, original generateSummaryTable function from your file
// replaced generateSummaryTable


function buildSupplementSummaryRows(personInfo, container, targetAge) {
  if (!container) return '';
  try {
    const person = collectPersonData(container, false) || {};
    const name = sanitizeHtml(person.name || personInfo?.name || '—');
    const baseMain = (typeof appState !== 'undefined' && appState?.fees?.baseMain) ? appState.fees.baseMain : 0;
    const tgtAge = Number.isFinite(targetAge) ? targetAge : ((Number.isFinite(person.age) ? person.age : 0) + 20);
    const rows = [];

    // Sức khoẻ Bùng Gia Lực
    const sclSec = container.querySelector('.health-scl-section');
    if (sclSec && sclSec.querySelector('.health-scl-checkbox')?.checked) {
      const program = sclSec.querySelector('.health-scl-program')?.value || '';
      const programLabel = ({co_ban:'Cơ bản', nang_cao:'Nâng cao', toan_dien:'Toàn diện', hoan_hao:'Hoàn hảo'})[program] || '';
      const stbhScl = getHealthSclStbhByProgram(program);
      const feeScl = calculateHealthSclPremium(person, baseMain, 0);
      const yearsScl = Math.max(0, Math.min(tgtAge, 75) - (Number.isFinite(person.age) ? person.age : 0));
      if (feeScl > 0) {
        rows.push(`<tr><td class="p-2 border">${name}</td><td class="p-2 border">Sức khoẻ Bùng Gia Lực${programLabel ? ' - ' + programLabel : ''}</td><td class="p-2 border text-right">${formatCurrency(stbhScl)}</td><td class="p-2 border text-center">${yearsScl}</td><td class="p-2 border text-right">${formatCurrency(feeScl)}</td></tr>`);
      }
    }

    // Bệnh hiểm nghèo 2.0
    const bhnSec = container.querySelector('.bhn-section');
    if (bhnSec && bhnSec.querySelector('.bhn-checkbox')?.checked) {
      const stbhBhn = parseFormattedNumber(bhnSec.querySelector('.bhn-stbh')?.value || '0');
      const feeBhn = calculateBhnPremium(person, baseMain, 0);
      const yearsBhn = Math.max(0, Math.min(tgtAge, 85) - (Number.isFinite(person.age) ? person.age : 0));
      if (feeBhn > 0) {
        rows.push(`<tr><td class="p-2 border">${name}</td><td class="p-2 border">Bệnh hiểm nghèo 2.0</td><td class="p-2 border text-right">${formatCurrency(stbhBhn)}</td><td class="p-2 border text-center">${yearsBhn}</td><td class="p-2 border text-right">${formatCurrency(feeBhn)}</td></tr>`);
      }
    }

    // Tai nạn
    const accSec = container.querySelector('.accident-section');
    if (accSec && accSec.querySelector('.accident-checkbox')?.checked) {
      const stbhAcc = parseFormattedNumber(accSec.querySelector('.accident-stbh')?.value || '0');
      const feeAcc = calculateAccidentPremium(person, baseMain, 0);
      const yearsAcc = Math.max(0, Math.min(tgtAge, 65) - (Number.isFinite(person.age) ? person.age : 0));
      if (feeAcc > 0) {
        rows.push(`<tr><td class="p-2 border">${name}</td><td class="p-2 border">Bảo hiểm Tai nạn</td><td class="p-2 border text-right">${formatCurrency(stbhAcc)}</td><td class="p-2 border text-center">${yearsAcc}</td><td class="p-2 border text-right">${formatCurrency(feeAcc)}</td></tr>`);
      }
    }

    // Hỗ trợ chi phí nằm viện (đ/ngày)
    const hsSec = container.querySelector('.hospital-support-section');
    if (hsSec && hsSec.querySelector('.hospital-support-checkbox')?.checked) {
      const input = hsSec.querySelector('.hospital-support-stbh, .hospital_support-stbh');
      const stbhHs = parseFormattedNumber(input?.value || '0');
      const feeHs = calculateHospitalSupportPremium(person, baseMain, 0);
      const yearsHs = Math.max(0, Math.min(tgtAge, 65) - (Number.isFinite(person.age) ? person.age : 0));
      if (feeHs > 0) {
        rows.push(`<tr><td class="p-2 border">${name}</td><td class="p-2 border">Hỗ trợ chi phí nằm viện (đ/ngày)</td><td class="p-2 border text-right">${formatCurrency(stbhHs)}</td><td class="p-2 border text-center">${yearsHs}</td><td class="p-2 border text-right">${formatCurrency(feeHs)}</td></tr>`);
      }
    }

    return rows.join('');
  } catch (e) {
    console.error('[refactored] buildSupplementSummaryRows error:', e);
    return '';
  }
}
window.MDP3 = (function () {
    let selectedId = null;
    let lastSelectedId = null;

    function init() {
        renderSection();
        attachListeners();
    }

    function reset() {
        selectedId = null;
        const enableCb = document.getElementById('mdp3-enable');
        if (enableCb) enableCb.checked = false;
        const selContainer = document.getElementById('mdp3-select-container');
        if (selContainer) selContainer.innerHTML = '';
        const feeEl = document.getElementById('mdp3-fee-display');
        if (feeEl) feeEl.textContent = '';
    }
    
    function isEnabled() {
        const cb = document.getElementById('mdp3-enable');
        return !!(cb && cb.checked);
    }

    function resetIfEnabled() {
        if (isEnabled()) reset();
    }
    
    function renderSection() {
        const sec = document.getElementById('mdp3-section');
        if (!sec) return;
        const mainProduct = document.getElementById('main-product').value;

        if (mainProduct === 'TRON_TAM_AN') {
            reset();
            sec.classList.add('hidden');
            return;
        }
        sec.classList.remove('hidden');

        const container = document.getElementById('mdp3-radio-list');
        if (container && !document.getElementById('mdp3-enable')) {
            container.innerHTML = `
                <div class="flex items-center space-x-2 mb-3">
                    <input type="checkbox" id="mdp3-enable" class="form-checkbox">
                    <label for="mdp3-enable" class="text-gray-700 font-medium">Bật Miễn đóng phí 3.0</label>
                </div>
                <div id="mdp3-select-container"></div>
                <div id="mdp3-fee-display" class="text-right font-semibold text-aia-red min-h-[1.5rem] mt-2"></div>
            `;
        }
    }

    function renderSelect() {
        const selectContainer = document.getElementById('mdp3-select-container');
        if (!selectContainer) return;
        let html = `<select id="mdp3-person-select" class="form-select w-full mb-3"><option value="">-- Chọn người --</option>`;
        document.querySelectorAll('#supplementary-insured-container .person-container').forEach(cont => {
            const info = collectPersonData(cont, false);
            let label = info.name || 'NĐBH bổ sung';
            label += ` (tuổi ${info.age || "?"})`;
            let disabled = '';
            if (!info.age || info.age <= 0) {
                label += ' - Chưa đủ thông tin';
                disabled = 'disabled';
            } else if (info.age < 18 || info.age > 60) {
                label += ' - Không đủ điều kiện';
                disabled = 'disabled';
            }
            html += `<option value="${cont.id}" ${disabled}>${label}</option>`;
        });
        html += `<option value="other">Người khác</option></select><div id="mdp3-other-form" class="hidden mt-4 p-3 border rounded bg-gray-50"></div>`;
        selectContainer.innerHTML = html;
    }

    function attachListeners() {
        document.getElementById('main-product').addEventListener('change', () => {
            renderSection();
            reset();
        });
        document.body.addEventListener('change', function (e) {
            if (e.target.id === 'mdp3-enable') {
                if (e.target.checked) {
                    renderSelect();
                    if (lastSelectedId) {
                        const selEl = document.getElementById('mdp3-person-select');
                        if (selEl) {
                            const opt = selEl.querySelector(`option[value="${lastSelectedId}"]`);
                            if (opt && !opt.disabled) {
                                selEl.value = lastSelectedId;
                                selectedId = lastSelectedId;
                            }
                        }
                        if (lastSelectedId === 'other') {
                            const otherForm = document.getElementById('mdp3-other-form');
                            if(otherForm) {
                                otherForm.classList.remove('hidden');
                                if (!otherForm.innerHTML.trim()) {
                                    otherForm.innerHTML = `<div id="person-container-mdp3-other" class="person-container">${generateSupplementaryPersonHtmlForMdp3('mdp3-other', '—')}</div>`;
                                    initPerson(document.getElementById('person-container-mdp3-other'), false);
                                    const suppBlock = otherForm.querySelector('.supplementary-products-container')?.parentElement;
                                    if (suppBlock) suppBlock.style.display = 'none';
                                }
                            }
                        }
                    }
                    runWorkflow();
                } else {
                    const sel = document.getElementById('mdp3-select-container');
                    if (sel) sel.innerHTML = '';
                    selectedId = null;
                    runWorkflow();
                }
            }
            if (e.target.id === 'mdp3-person-select') {
                selectedId = e.target.value;
                lastSelectedId = selectedId || null;
                const otherForm = document.getElementById('mdp3-other-form');
                if (selectedId === 'other') {
                    otherForm.classList.remove('hidden');
                    if(!otherForm.innerHTML.trim()) {
                         otherForm.innerHTML = `<div id="person-container-mdp3-other" class="person-container">${generateSupplementaryPersonHtmlForMdp3('mdp3-other', '—')}</div>`;
                         initPerson(document.getElementById('person-container-mdp3-other'), false);
                         const suppBlock = otherForm.querySelector('.supplementary-products-container')?.parentElement;
                         if (suppBlock) suppBlock.style.display = 'none';
                    }
                } else {
                    otherForm.classList.add('hidden');
                }
                runWorkflow();
            }
        });
    }

    function getPremium() {
        const feeEl = document.getElementById('mdp3-fee-display');
        const enableCb = document.getElementById('mdp3-enable');
        if (!enableCb || !enableCb.checked || !selectedId || !window.personFees) {
            if(feeEl) feeEl.textContent = '';
            return 0;
        }
        // === PATCH MDP3: loại phí mdp3 ra khỏi base & bỏ node 'mdp3_other' ===
        let stbhBase = 0;
        const feesModel = (typeof appState !== 'undefined') ? appState.fees : null;
        
        for (let pid in window.personFees) {
          if (!Object.prototype.hasOwnProperty.call(window.personFees, pid)) continue;
        
          // Bỏ hẳn node tạo riêng cho "người khác"
          if (pid === 'mdp3_other') continue;
        
          const pf = window.personFees[pid];
          const suppDetails = feesModel?.byPerson?.[pid]?.suppDetails || {};
          const mdp3Part = suppDetails.mdp3 || 0;          // phần phí mdp3 của người này (nếu có)
          const suppNet = (pf.supp || 0) - mdp3Part;       // phần bổ sung thực (loại mdp3)
        
          stbhBase += (pf.mainBase || 0) + Math.max(0, suppNet);
        }
        
        // Nếu chọn miễn cho 1 người cụ thể (không phải "other") thì trừ riders của người đó (đÃ loại mdp3)
        if (selectedId && selectedId !== 'other' && window.personFees[selectedId]) {
          const suppDetails = feesModel?.byPerson?.[selectedId]?.suppDetails || {};
          const mdp3Part = suppDetails.mdp3 || 0;
          const suppNet = (window.personFees[selectedId].supp || 0) - mdp3Part;
          stbhBase -= Math.max(0, suppNet);
        }
        
        if (stbhBase < 0) stbhBase = 0;

        let age, gender;
         if (selectedId === 'other') {
          const form = document.getElementById('person-container-mdp3-other');
          if (!form) return 0;
        
          const dobInput = form.querySelector('.dob-input');
          const info = collectPersonData(form, false); // hàm này bạn đang có
          const ageSpan = form.querySelector('.age-span');
          if (ageSpan) ageSpan.textContent = info.age || 0;
        
          // Tạo / lấy box lỗi
          let errBox = form.querySelector('.mdp3-other-error');
          if (!errBox) {
            errBox = document.createElement('p');
            errBox.className = 'mdp3-other-error text-sm text-red-600 mt-1';
            if (dobInput && dobInput.parentElement) {
              dobInput.parentElement.appendChild(errBox);
            } else {
              form.appendChild(errBox);
            }
          }
        
          function setError(msg) {
            errBox.textContent = msg;
            if (dobInput) dobInput.classList.add('border-red-500');
            if (feeEl) feeEl.textContent = 'STBH: — | Phí: —';
          }
          function clearError() {
            errBox.textContent = '';
            if (dobInput) dobInput.classList.remove('border-red-500');
          }
        
          // Validate chuỗi DOB
          const rawDob = dobInput ? dobInput.value.trim() : '';
          if (!rawDob) {
            setError('Vui lòng nhập ngày sinh (DD/MM/YYYY).');
            return 0;
          }
          if (!/^\d{2}\/\d{2}\/\d{4}$/.test(rawDob)) {
            setError('Định dạng ngày sinh không hợp lệ.');
            return 0;
          }
        
          // Nếu bạn đã có validateDobField thì dùng, không thì parse nhanh:
          let dobValid = true;
          if (typeof validateDobField === 'function') {
            dobValid = !!validateDobField(dobInput);
          } else {
            const [d,m,y] = rawDob.split('/').map(Number);
            const dt = new Date(y, m-1, d);
            if (!(dt && dt.getFullYear() === y && dt.getMonth() === m-1 && dt.getDate() === d)) {
              dobValid = false;
            }
          }
          if (!dobValid) {
            setError('Ngày sinh không hợp lệ.');
            return 0;
          }
        
          // Kiểm tra tuổi
          const ageOk = info.age && info.age >= 18 && info.age <= 60;
          if (!ageOk) {
            setError('Tuổi phải từ 18 đến 60 để tham gia MDP3.');
            return 0;
          }
        
          // OK → clear error và dùng info.age / info.gender
          clearError();
          age = info.age;
          gender = info.gender;
        
        } else {
          // (GIỮ NGUYÊN NHÁNH CŨ – đừng xoá)
          const container = document.getElementById(selectedId);
          if (!container) { reset(); return 0; }
          const info = collectPersonData(container, false);
          age = info.age;
          gender = info.gender;
          if (!age || age < 18 || age > 60) {
            if (feeEl) feeEl.textContent = 'STBH: — | Phí: —';
            return 0;
          }
        }
           
        if(!age || age <= 0) {
            if (feeEl) feeEl.textContent = `STBH: ${formatCurrency(stbhBase)} | Phí: —`;
            return 0;
        }
        const rate = product_data.mdp3_rates.find(r => age >= r.ageMin && age <= r.ageMax)?.[gender === 'Nữ' ? 'nu' : 'nam'] || 0;
        const premium = roundDownTo1000((stbhBase / 1000) * rate);
        if (feeEl) {
            feeEl.textContent = premium > 0
                ? `STBH: ${formatCurrency(stbhBase)} | Phí: ${formatCurrency(premium)}`
                : `STBH: ${formatCurrency(stbhBase)} | Phí: —`;
        }
        return premium;
    }
    
    function generateSupplementaryPersonHtmlForMdp3() {
      return `
        <h3 class="text-lg font-bold text-gray-700 mb-2 border-t pt-4">Người được miễn đóng phí</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label class="font-medium text-gray-700 block mb-1">Họ và Tên</label><input type="text" class="form-input name-input"></div>
          <div><label class="font-medium text-gray-700 block mb-1">Ngày sinh</label><input type="text" class="form-input dob-input" placeholder="DD/MM/YYYY"></div>
          <div><label class="font-medium text-gray-700 block mb-1">Giới tính</label><select class="form-select gender-select"><option value="Nam">Nam</option><option value="Nữ">Nữ</option></select></div>
          <div class="flex items-end space-x-4"><p class="text-lg">Tuổi: <span class="font-bold text-aia-red age-span">0</span></p></div>
        </div>`;
    }

    return { init, isEnabled, resetIfEnabled, getSelectedId: () => selectedId, getPremium, reset };
})();


// === LITE MIN: Gom lỗi chỉ bổ sung những nhóm CHƯA có inline ===
function collectSimpleErrors() {
  const rawErrors = [];

  // 1. Gom toàn bộ inline hiện có
  document.querySelectorAll('.field-error').forEach(el => {
    const t = (el.textContent || '').trim();
    if (t) rawErrors.push(t);
  });

  // Helper: kiểm tra đã có lỗi chứa 1 trong các từ khóa
  const hasError = (...keys) => rawErrors.some(e => {
    const low = e.toLowerCase();
    return keys.some(k => low.includes(k.toLowerCase()));
  });

  const mainProduct = document.getElementById('main-product')?.value || '';

  // 2. Chưa chọn sản phẩm chính
  if (!mainProduct && !hasError('sản phẩm chính')) {
    rawErrors.push('Chưa chọn sản phẩm chính.');
  }

  // 3. STBH sản phẩm chính (chỉ check thiếu & dưới min cơ bản)
  if (mainProduct && mainProduct !== 'TRON_TAM_AN' && !hasError('stbh sản phẩm chính')) {
    const stbhVal = parseFormattedNumber(document.getElementById('main-stbh')?.value);
    if (!stbhVal) {
      rawErrors.push('Chưa nhập STBH sản phẩm chính.');
    } else if (stbhVal < CONFIG.MAIN_PRODUCT_MIN_STBH) {
      rawErrors.push(`STBH sản phẩm chính tối thiểu ${CONFIG.MAIN_PRODUCT_MIN_STBH.toLocaleString('vi-VN')} đ.`);
    }
  }

  // 4. DOB tối giản (chỉ check trống) nếu chưa có inline về ngày sinh
  const dobInput = document.querySelector('#main-person-container .dob-input');
  if (dobInput && !hasError('ngày sinh')) {
    if (!(dobInput.value || '').trim()) {
      rawErrors.push('Chưa nhập ngày sinh NĐBH chính.');
    }
  }

  // 5. Nghề nghiệp (chỉ check chưa chọn) nếu chưa có inline
  const occInput = document.querySelector('#main-person-container .occupation-input');
  if (occInput && !hasError('nghề')) {
    if (!occInput.dataset.group) {
      rawErrors.push('Chưa chọn nghề nghiệp.');
    }
  }

  // 6. Phí sản phẩm chính
  // (Giữ cách lấy cũ để tối thiểu chỉnh sửa)
  const baseMainRaw = (typeof appState !== 'undefined' && appState?.fees?.baseMain) ? appState.fees.baseMain : '';
  const baseMainNum = Number(String(baseMainRaw).replace(/[\s,._]/g, '')) || 0; // đơn giản: strip vài ký tự thường gặp
  const minPremium = CONFIG.MAIN_PRODUCT_MIN_PREMIUM;

  if (!hasError('phí sản phẩm chính')) {
    if (mainProduct === 'MUL') {
      if (!baseMainNum) {
        rawErrors.push('Chưa nhập phí sản phẩm chính (MUL).');
      } else if (baseMainNum < minPremium) {
        rawErrors.push(`Phí sản phẩm chính (MUL) tối thiểu ${minPremium.toLocaleString('vi-VN')} đ.`);
      }
    } else if (mainProduct && mainProduct !== 'TRON_TAM_AN') {
      // Sản phẩm khác: chỉ check nếu đã nhập (>0) nhưng < min
      if (baseMainNum > 0 && baseMainNum < minPremium) {
        rawErrors.push(`Phí sản phẩm chính tối thiểu ${minPremium.toLocaleString('vi-VN')} đ.`);
      }
    }
    // TRON_TAM_AN: bỏ qua
  }

  // 7. Extra premium > factor nếu chưa có inline tương tự
  const extraPremium = parseFormattedNumber(document.getElementById('extra-premium-input')?.value);
  if (extraPremium > 0 && baseMainNum > 0 &&
      extraPremium > CONFIG.EXTRA_PREMIUM_MAX_FACTOR * baseMainNum &&
      !hasError('lần phí chính', 'phí đóng thêm')) {
    rawErrors.push(`Phí đóng thêm tối đa ${CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính.`);
  }

  // 8. Rider STBH parse = 0 (nhập ký tự), chỉ nếu chưa có lỗi rider tương tự
  if (!hasError('sản phẩm bổ sung', 'rider')) {
    let needAddRiderInvalid = false;
    document.querySelectorAll('.product-section:not(.hidden) input[type="text"]').forEach(inp => {
      if (/\bstbh\b/.test(inp.className)) {
        const raw = (inp.value || '').trim();
        if (raw !== '') {
          const val = parseFormattedNumber(raw);
          if (val === 0) needAddRiderInvalid = true;
        }
      }
    });
    if (needAddRiderInvalid) rawErrors.push('STBH sản phẩm bổ sung không hợp lệ.');
  }

  // 9. Khử trùng lặp nhanh
  return [...new Set(rawErrors)];
}
function showGlobalErrors(errors) {
  const box = document.getElementById('global-error-box');
  if (!box) return;
  if (!errors.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="border border-red-300 bg-red-50 text-red-700 rounded p-3 text-sm">
      <div class="font-medium mb-1">Vui lòng sửa trước khi tạo bảng minh họa:</div>
      ${errors.map(e => `<div class="flex gap-1"><span>•</span><span>${e}</span></div>`).join('')}
    </div>
  `;
}
function hideGlobalErrors() {
  const box = document.getElementById('global-error-box');
  if (!box) return;
  if (!box.classList.contains('hidden')) {
    box.classList.add('hidden');
    box.innerHTML = '';
  }
}
/********************************************************************
 * REFACTORED generateSummaryTable (A-plus)
 * Bạn chỉ cần dán thay thế hàm cũ.
 * Muốn thêm nội dung đầu bảng => sửa buildIntroSection.
 * Muốn thêm ghi chú cuối => sửa buildFooterSection.
 ********************************************************************/
// === PATCH v3: generateSummaryTable tích hợp Benefit Matrix ===
function generateSummaryTable() {
  try {
    if (typeof runWorkflow === 'function') runWorkflow();
  } catch(e) {}

  // 1. Validate nhanh
  const simpleErrors = (typeof collectSimpleErrors === 'function')
    ? collectSimpleErrors()
    : [];
  if (simpleErrors.length) {
    if (typeof showGlobalErrors === 'function') showGlobalErrors(simpleErrors);
    const box = document.getElementById('global-error-box');
    if (box) {
      const y = box.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y < 0 ? 0 : y, behavior: 'smooth' });
    }
    return false;
  } else if (typeof showGlobalErrors === 'function') {
    showGlobalErrors([]);
  }

  // 2. Build data
  const data = buildSummaryData();

  // 3. Build từng phần
  const introHtml   = buildIntroSection(data);
  const part1Html   = buildPart1Section(data);
  const part2Html   = (typeof buildPart2BenefitsSection === 'function')
    ? buildPart2BenefitsSection(data)
    : '<!-- buildPart2BenefitsSection missing -->';

  // Lịch phí: dùng buildPart3ScheduleSection nếu đã “rename” thành công, fallback sang buildPart2Section
  let scheduleHtml = '';
  if (typeof buildPart3ScheduleSection === 'function') {
    scheduleHtml = buildPart3ScheduleSection(data);
  } else if (typeof buildPart2Section === 'function') {
    // Trường hợp chưa rename được, vẫn hiển thị nhưng còn tên “Phần 2 · Bảng phí”
    scheduleHtml = buildPart2Section(data).replace(/Phần\s*2\s*·\s*Bảng phí/i,'Phần 3 · Bảng phí');
  } else {
    scheduleHtml = '<div class="text-sm text-red-600">Không tìm thấy hàm render lịch phí.</div>';
  }

  const footerHtml  = buildFooterSection(data);
  const exportBtns  = buildExportButtonsSection();

  const finalHtml = introHtml + part1Html + part2Html + scheduleHtml + footerHtml + exportBtns;

  // 4. Gắn vào modal
  const modal = document.getElementById('summary-modal');
  const container = document.getElementById('summary-content-container');
  if (container) container.innerHTML = finalHtml;
  if (modal) modal.classList.remove('hidden');

  // 5. Gắn export
  if (typeof attachExportHandlers === 'function') {
    attachExportHandlers(container);
  } else if (typeof attachSimpleExportHandlers === 'function') {
    attachSimpleExportHandlers(container);
  }
  try {
  if (window.__rebuildGallery) {
    console.log('[Gallery DEBUG] Gọi rebuild ngay sau generateSummaryTable');
    setTimeout(()=> window.__rebuildGallery(), 20);
  } else {
    console.warn('[Gallery DEBUG] Chưa có __rebuildGallery');
  }
} catch(e){
  console.error('[Gallery DEBUG] lỗi gọi rebuild:', e);
}
  return true;
}

/********************************************************************
 * DỮ LIỆU TÓM TẮT
 ********************************************************************/
function buildSummaryData() {
  const fmtNum = (n)=> (Number(n||0)).toLocaleString('vi-VN');
  const num = (s)=> parseInt(String(s||'').replace(/[.,]/g,''),10)||0;

  // Kỳ đóng
  const freq = document.getElementById('payment-frequency')?.value || 'year';
  const periods = freq === 'half' ? 2 : (freq === 'quarter' ? 4 : 1);
  const isAnnual = periods === 1;
  const riderFactor = periods === 2 ? 1.02 : (periods === 4 ? 1.04 : 1);

  // Người chính
  const mainCont = document.getElementById('main-person-container');
  const mainInfo = collectPersonData(mainCont, true);

  // Tuổi minh họa
  let targetAge = parseInt(document.getElementById('target-age-input')?.value || '0', 10) || 0;

  // Sản phẩm chính & thời hạn
  const productKey = document.getElementById('main-product')?.value || '';
  let paymentTerm = appState?.mainProduct?.paymentTerm || 0;
  if (productKey === 'TRON_TAM_AN') paymentTerm = 10;
  if (productKey === 'AN_BINH_UU_VIET') {
    paymentTerm = parseInt(document.getElementById('abuv-term')?.value || '0',10) || paymentTerm;
  }

  // Chuẩn hoá paymentTerm tối thiểu
  const minTermMap = (k)=>{
    if (k === 'TRON_TAM_AN') return 10;
    if (k === 'AN_BINH_UU_VIET') return 5;
    if (k === 'PUL_5NAM') return 5;
    if (k === 'PUL_15NAM') return 15;
    return 4;
  };
  const minTerm = minTermMap(productKey);
  if (!paymentTerm || paymentTerm < minTerm) paymentTerm = minTerm;

  // Kiểm tra min targetAge
  const minTargetAge = mainInfo.age + paymentTerm - 1;
  if (!targetAge || targetAge < minTargetAge) targetAge = minTargetAge;

  // Người bổ sung
  const others = Array.from(document.querySelectorAll('#supplementary-insured-container .person-container'))
    .map(c=>collectPersonData(c,false));
  const persons = [mainInfo, ...others];

  // MDP3
  const mdpEnabled = window.MDP3 && MDP3.isEnabled && MDP3.isEnabled();
  const mdpTargetId = mdpEnabled ? (MDP3.getSelectedId && MDP3.getSelectedId()) : null;
  const mdpFeeYear = mdpEnabled ? (MDP3.getPremium && MDP3.getPremium()) : 0;
  if (mdpEnabled && mdpTargetId === 'other') {
    const form = document.getElementById('person-container-mdp3-other');
    let ageOther = mainInfo.age;
    let nameOther = 'Người khác (Miễn đóng phí 3.0)';
    let genderOther = 'Nam';  
    if (form) {
      const info = collectPersonData(form, false);
      if (info.age) ageOther = info.age;
      if (info.name) nameOther = info.name;
      if (info.gender) genderOther = info.gender;
    }
    persons.push({
      id:'mdp3_other',
      isMain:false,
      name: nameOther,
      gender:genderOther,
      age: ageOther,
      supplements:{}
    });
  }
// PATCH #9 (optional): lọc MDP3 other invalid
if (mdpEnabled && mdpTargetId === 'other') {
  const form = document.getElementById('person-container-mdp3-other');
  if (form) {
    const info = collectPersonData(form, false);
    if (!(info.age >= 18 && info.age <= 60)) {
      // Loại bỏ node mdp3_other nếu tuổi không hợp lệ
      const idx = persons.findIndex(p=>p.id==='mdp3_other');
      if (idx >= 0) persons.splice(idx,1);
    }
  }
}

  // Tính Part 1
  const part1 = buildPart1RowsData({
    persons,
    productKey,
    paymentTerm,
    targetAge,
    riderFactor,
    periods,
    isAnnual,
    mdpEnabled,
    mdpTargetId,
    mdpFeeYear
  });

  // Tính Schedule (Phần 2)
  const schedule = buildPart2ScheduleRows({
    persons,
    mainInfo,
    paymentTerm,
    targetAge,
    periods,
    isAnnual,
    riderFactor,
    productKey,
    mdpEnabled,
    mdpTargetId,
    mdpFeeYear
  });

  return {
    freq,
    periods,
    isAnnual,
    riderFactor,
    productKey,
    paymentTerm,
    targetAge,
    mainInfo,
    persons,
    mdpEnabled,
    mdpTargetId,
    mdpFeeYear,
    part1,
    schedule
  };
}

/********************************************************************
 * PART 1 DATA BUILDER
 ********************************************************************/
function buildPart1RowsData(ctx) {
  const {
    persons, productKey, paymentTerm, targetAge,
    riderFactor, periods, isAnnual,
    mdpEnabled, mdpTargetId, mdpFeeYear
  } = ctx;
  const mainAge = persons.find(pp => pp.isMain)?.age || appState.mainPerson.age || 0;
  const riderMaxAge = (key)=>({ health_scl:74, bhn:85, accident:64, hospital_support:64, mdp3:64 }[key] ?? 64);

  let rows = [];
  let perPersonTotals = []; // tổng theo từng người (để hiển thị trước các dòng chi tiết)
  let grand = { per:0, eq:0, base:0, diff:0 };
    const pushRow = (acc, personName, prodName, stbhDisplay, years, baseAnnual, isRider) => {
      const baseRounded = baseAnnual;
    
      let perPeriod = 0, annualEq = 0, diff = 0;
      if (!isAnnual) {
        if (isRider) {
          const annualEqRider = riderAnnualEquivalent(baseRounded, periods, riderFactor);
          annualEq = annualEqRider;
          perPeriod = riderPerPeriod(baseRounded, periods, riderFactor);
          diff = annualEqRider - baseRounded;
        } else {
          // Sản phẩm chính / phí đóng thêm: không nhân factor
          perPeriod = roundDownTo1000(baseRounded / periods);
          annualEq = perPeriod * periods;
          diff = annualEq - baseRounded;
        }
      }
    
      acc.per += perPeriod;
      acc.eq += annualEq;
      acc.base += baseRounded;
      acc.diff += diff;
    
      rows.push({
        personName,
        prodName,
        stbhDisplay,
        years,
        perPeriod,
        annualEq,
        diff,
        annualBase: baseRounded,
        factorRider: !!isRider
      });
    };

  
  persons.forEach(p => {
    const acc = { per:0, eq:0, base:0, diff:0 };
    // SP chính
    if (p.isMain && appState.mainProduct.key){
      const baseAnnual = calculateMainPremium(p, appState.mainProduct);
      const stbhVal = (appState.mainProduct.key === 'TRON_TAM_AN') ? 100000000 : (appState.mainProduct.stbh || 0);
      const mainLabel = appState.mainProduct.key === 'TRON_TAM_AN'? 'An Bình Ưu Việt': getProductLabel(appState.mainProduct.key);
      pushRow(acc, p.name, mainLabel, formatDisplayCurrency(stbhVal), paymentTerm || '—', baseAnnual, false);

    }
    // Đóng thêm
    if (p.isMain && (appState.mainProduct.extraPremium||0) > 0){
      pushRow(acc, p.name, 'Phí đóng thêm', '—', paymentTerm || '—', appState.mainProduct.extraPremium||0, false);
    }
    // Riders
    if (p.supplements?.health_scl){
      const scl = p.supplements.health_scl;
      const programMap = {co_ban:'Cơ bản', nang_cao:'Nâng cao', toan_dien:'Toàn diện', hoan_hao:'Hoàn hảo'};
      const programName = programMap[scl.program] || '';
      const scopeStr = (scl.scope==='main_global'?'Nước ngoài':'Việt Nam')
        + (scl.outpatient?', Ngoại trú':'')
        + (scl.dental?', Nha khoa':'');
      const baseAnnual = calculateHealthSclPremium(p, appState.fees.baseMain, 0);
      const stbh = getHealthSclStbhByProgram(scl.program);
      const maxA = riderMaxAge('health_scl'); // đã có hàm riderMaxAge(...)
      const years = Math.max(0, Math.min(maxA - p.age, targetAge - mainAge) + 1);
      pushRow(acc, p.name, `Sức khoẻ Bùng Gia Lực – ${programName} (${scopeStr})`, formatDisplayCurrency(stbh), years, baseAnnual, true);
    }
    if (p.supplements?.bhn){
      const stbh = p.supplements.bhn.stbh;
      const baseAnnual = calculateBhnPremium(p, appState.fees.baseMain, 0);
      const maxA = riderMaxAge('bhn'); // đã có hàm riderMaxAge(...)
      const years = Math.max(0, Math.min(maxA - p.age, targetAge - mainAge) + 1);
      pushRow(acc, p.name, 'Bệnh Hiểm Nghèo 2.0', formatDisplayCurrency(stbh), years, baseAnnual, true);
    }
    if (p.supplements?.accident){
      const stbh = p.supplements.accident.stbh;
      const baseAnnual = calculateAccidentPremium(p, appState.fees.baseMain, 0);
      const maxA = riderMaxAge('accident'); // đã có hàm riderMaxAge(...)
      const years = Math.max(0, Math.min(maxA - p.age, targetAge - mainAge) + 1);  
      pushRow(acc, p.name, 'Bảo hiểm Tai nạn', formatDisplayCurrency(stbh), years, baseAnnual, true);
    }
    if (p.supplements?.hospital_support){
      const stbh = p.supplements.hospital_support.stbh;
      const baseAnnual = calculateHospitalSupportPremium(p, appState.fees.baseMain, 0);
      const maxA = riderMaxAge('hospital_support'); // đã có hàm riderMaxAge(...)
      const years = Math.max(0, Math.min(maxA - p.age, targetAge - mainAge) + 1);
      pushRow(acc, p.name, 'Hỗ trợ chi phí nằm viện', formatDisplayCurrency(stbh), years, baseAnnual, true);
    }
    // MDP3
    if (mdpEnabled && mdpFeeYear>0 && (mdpTargetId === p.id || (mdpTargetId==='other' && p.id==='mdp3_other'))) {
      const maxA = riderMaxAge('mdp3');
      const years = Math.max(0, Math.min(maxA - p.age, targetAge - mainAge) + 1);
      pushRow(acc, p.name, 'Miễn đóng phí 3.0', '—', years, mdpFeeYear, true);
    }

    // Tổng theo người
    perPersonTotals.push({
      personName: p.name,
      per: acc.per,
      eq: acc.eq,
      base: acc.base,
      diff: acc.diff
    });

    grand.per += acc.per;
    grand.eq += acc.eq;
    grand.base += acc.base;
    grand.diff += acc.diff;
  });

  return {
    rows, perPersonTotals, grand,
    isAnnual,
    periods,
    riderFactor
  };
}

/********************************************************************
 * PART 2 (SCHEDULE) DATA BUILDER
 ********************************************************************/
// PATCH #5: Part 2 schedule đồng nhất rider factoring
function buildPart2ScheduleRows(ctx){
  const {
    persons, mainInfo, paymentTerm, targetAge,
    periods, isAnnual, riderFactor,
    mdpEnabled, mdpTargetId, mdpFeeYear
  } = ctx;

  const riderMaxAge = (key)=>({ health_scl:74, bhn:85, accident:64, hospital_support:64, mdp3:64 }[key] ?? 64);
  const rows = [];

  const baseMainAnnual = appState?.fees?.baseMain || 0;
  const extraAnnual = appState?.mainProduct?.extraPremium || 0;

  for (let year=1; mainInfo.age + year -1 <= targetAge; year++) {
    const currentAge = mainInfo.age + year -1;
    const inTerm = year <= paymentTerm;

    const mainYearBase = inTerm ? baseMainAnnual : 0;
    const extraYearBase = inTerm ? extraAnnual : 0;

    const perPersonSuppBase = [];
    const perPersonSuppPerPeriod = [];
    const perPersonSuppAnnualEq = [];

    persons.forEach(p => {
      let sumBase = 0;
      let sumPer = 0;

      const attained = p.age + year - 1;

      const addRider = (key, baseFee) => {
        if (!baseFee) return;
        if (attained > riderMaxAge(key)) return;
        sumBase += baseFee;
        if (!isAnnual) {
          sumPer += riderPerPeriod(baseFee, periods, riderFactor);
        }
      };

      if (p.supplements?.health_scl) addRider('health_scl', calculateHealthSclPremium(p, baseMainAnnual, 0, attained));
      if (p.supplements?.bhn)        addRider('bhn',        calculateBhnPremium(p, baseMainAnnual, 0, attained));
      if (p.supplements?.accident)   addRider('accident',   calculateAccidentPremium(p, baseMainAnnual, 0, attained));
      if (p.supplements?.hospital_support) addRider('hospital_support', calculateHospitalSupportPremium(p, baseMainAnnual, 0, attained));

      if (mdpEnabled && mdpFeeYear>0 && (mdpTargetId === p.id || (mdpTargetId==='other' && p.id==='mdp3_other'))) {
        if (attained <= riderMaxAge('mdp3')) addRider('mdp3', mdpFeeYear);
      }

      perPersonSuppBase.push(sumBase);
      perPersonSuppPerPeriod.push(sumPer);
      perPersonSuppAnnualEq.push(isAnnual ? sumBase : sumPer * periods);
    });

    const suppBaseTotal = perPersonSuppBase.reduce((a,b)=>a+b,0);
    const suppAnnualEqTotal = perPersonSuppAnnualEq.reduce((a,b)=>a+b,0);

    const totalYearBase = mainYearBase + extraYearBase + suppBaseTotal;
    const totalAnnualEq = isAnnual ? totalYearBase : (mainYearBase + extraYearBase + suppAnnualEqTotal);
    const diff = totalAnnualEq - totalYearBase;

    rows.push({
      year,
      age: currentAge,
      mainYearBase,
      extraYearBase,
      perPersonSuppBase,
      perPersonSuppPerPeriod,
      perPersonSuppAnnualEq,
      totalYearBase,
      totalAnnualEq,
      diff
    });
  }

  const extraAllZero = rows.every(r => r.extraYearBase === 0);

  return { rows, extraAllZero };
}

/********************************************************************
 * RENDER: INTRO
 ********************************************************************/
function buildIntroSection(data) {
  // Lấy luôn label đang hiển thị trong select kỳ đóng
  const sel = document.getElementById('payment-frequency');
  let freqLabel = data.freq; // fallback
  if (sel && sel.selectedIndex >= 0) {
    const txt = sel.options[sel.selectedIndex].text.trim();
    if (txt) freqLabel = txt;
  } else {
    // Fallback map khi option text vẫn là mã tiếng Anh
    switch((freqLabel || '').toLowerCase()){
      case 'year':
      case 'annual':
        freqLabel = 'Năm'; break;
      case 'half':
      case 'semi':
      case 'semiannual':
        freqLabel = 'Nửa năm'; break;
      case 'quarter':
      case 'quarterly':
        freqLabel = 'Quý'; break;
      case 'month':
      case 'monthly':
        freqLabel = 'Tháng'; break;
    }
  }

  return `
    <div class="mb-4" style="font-size: 14px;">
      <h2 class="text-xl font-bold">BẢNG MINH HỌA PHÍ & QUYỀN LỢI</h2>
      <div class="text-sm text-gray-700 style="font-size: 14px;"">
        Sản phẩm chính: <strong>${sanitizeHtml(getProductLabel(data.productKey) || data.productKey || '—')}</strong>
        &nbsp;|&nbsp; Kỳ đóng: <strong>${sanitizeHtml(freqLabel)}</strong>
        &nbsp;|&nbsp; Minh họa đến tuổi: <strong>${sanitizeHtml(data.targetAge)}</strong>
      </div>
    </div>
  `;
}
/******************** HELPER: TÍNH LIFETIME CHO PHẦN 1 ********************/
// PATCH #3: Lifetime riders per-year factoring + MDP3 STBH + average
function computePart1LifetimeData(summaryData) {
  const {
    persons, paymentTerm, targetAge,
    periods, isAnnual, riderFactor,
    mdpEnabled, mdpTargetId
  } = summaryData;

  const mainPerson = summaryData.mainInfo;
  const mainAge = mainPerson.age;
  const globalTimelineYears = targetAge - mainPerson.age + 1;
  const r1000 = (n) => Math.round((n||0)/1000)*1000;

  const baseMainAnnualFirst = calculateMainPremium(mainPerson, appState.mainProduct);
  const extraAnnualFirst = appState.mainProduct.extraPremium || 0;
  const stbhMain = (appState.mainProduct.key === 'TRON_TAM_AN') ? 100000000 : (appState.mainProduct.stbh || 0);
  const payYearsMain = Math.max(0, Math.min(paymentTerm, globalTimelineYears));

  // Chuẩn bị STBH base cho MDP3
    // === PATCH MDP3 lifetime base ===
    let mdp3StbhBase = 0;
    if (mdpEnabled) {
      try {
        const feesModel = (typeof appState !== 'undefined') ? appState.fees : null;
        for (let pid in window.personFees) {
          if (!Object.prototype.hasOwnProperty.call(window.personFees, pid)) continue;
          if (pid === 'mdp3_other') continue; // bỏ node chỉ chứa phí mdp3
          const pf = window.personFees[pid];
          const suppDetails = feesModel?.byPerson?.[pid]?.suppDetails || {};
          const mdp3Part = suppDetails.mdp3 || 0;
          const suppNet = (pf.supp || 0) - mdp3Part;
          mdp3StbhBase += (pf.mainBase || 0) + Math.max(0, suppNet);
        }
        if (mdpTargetId && mdpTargetId !== 'other' && window.personFees[mdpTargetId]) {
          const suppDetails = feesModel?.byPerson?.[mdpTargetId]?.suppDetails || {};
          const mdp3Part = suppDetails.mdp3 || 0;
          const suppNet = (window.personFees[mdpTargetId].supp || 0) - mdp3Part;
          mdp3StbhBase -= Math.max(0, suppNet);
        }
        if (mdp3StbhBase < 0) mdp3StbhBase = 0;
      } catch(e){}
    }

  function calcMdp3PremiumIssue(age, gender) { // chỉ dùng tuổi phát hành
    if (!mdpEnabled || !mdp3StbhBase) return 0;
    const row = product_data.mdp3_rates.find(r => age >= r.ageMin && age <= r.ageMax);
    if (!row) return 0;
    const rate = row[gender === 'Nữ' ? 'nu' : 'nam'] || 0;
    return roundDownTo1000((mdp3StbhBase/1000)*rate);
  }

  const riderCfgMap = {
    health_scl: { maxRenewalAge: 74, label: (person) => {
      const s = person.supplements.health_scl;
      const programMap = {co_ban:'Cơ bản', nang_cao:'Nâng cao', toan_dien:'Toàn diện', hoan_hao:'Hoàn hảo'};
      const programName = programMap[s.program] || '';
      const scopeStr = (s.scope==='main_global'?'Nước ngoài':'Việt Nam')
        + (s.outpatient?', Ngoại trú':'')
        + (s.dental?', Nha khoa':'');
      return `Sức khoẻ Bùng Gia Lực – ${programName} (${scopeStr})`;
    }, stbh: (p) => formatDisplayCurrency(getHealthSclStbhByProgram(p.supplements.health_scl.program)) },
    bhn: { maxRenewalAge: 85, label: ()=> 'Bệnh Hiểm Nghèo 2.0', stbh: (p)=> formatDisplayCurrency(p.supplements.bhn.stbh || 0) },
    accident: { maxRenewalAge: 64, label: ()=> 'Bảo hiểm Tai nạn', stbh: (p)=> formatDisplayCurrency(p.supplements.accident.stbh || 0) },
    hospital_support: { maxRenewalAge: 64, label: ()=> 'Hỗ trợ chi phí nằm viện', stbh: (p)=> formatDisplayCurrency(p.supplements.hospital_support.stbh || 0) },
    mdp3: { maxRenewalAge: 64, label: ()=> 'Miễn đóng phí 3.0', stbh: ()=> formatDisplayCurrency(mdp3StbhBase) }
  };

  const rows = [];
  const perPersonAgg = {};
  function ensureAgg(person) {
    if (!perPersonAgg[person.id]) {
      perPersonAgg[person.id] = {
        id: person.id,
        name: person.name,
        perPeriodSum: 0,
        annualEqSum: 0,
        diffSum: 0,
        firstYearAnnualSum: 0,
        annualBaseSum: 0,
        lifetimeSum: 0,
        maxYears: 0
      };
    }
    return perPersonAgg[person.id];
  }

  function pushRow(person, productLabel, stbhDisplay, payYears, firstAnnualBase, isRider, lifetimeSum) {
    if (payYears <= 0 || firstAnnualBase <= 0 || lifetimeSum <= 0) return;

    // perPeriod / annualEq / diff chỉ cho năm đầu
    let perPeriod = 0, annualEq = 0, diff = 0;
    const annualBase = firstAnnualBase;
    let firstYearEquivalent = firstAnnualBase;

    if (!isAnnual) {
      if (isRider) {
        // năm đầu rider
        perPeriod = riderPerPeriod(firstAnnualBase, periods, riderFactor);
        annualEq = perPeriod * periods;
        diff = annualEq - annualBase;
        firstYearEquivalent = annualEq;
      } else {
        perPeriod = roundDownTo1000(firstAnnualBase / periods);
        annualEq = perPeriod * periods;
        diff = annualEq - annualBase;
        firstYearEquivalent = annualEq;
      }
    }

    const avg = payYears > 0 ? r1000(lifetimeSum / payYears) : 0;

    rows.push({
      personId: person.id,
      personName: person.name,
      productLabel,
      stbhDisplay,
      payYears,
      perPeriod,
      firstYearAnnual: (isAnnual ? firstAnnualBase : firstYearEquivalent),
      annualBase,
      annualEq,
      diff,
      lifetimeSum,
      average: avg,
      isRider
    });

    const agg = ensureAgg(person);
    agg.perPeriodSum += perPeriod;
    agg.annualEqSum += annualEq;
    agg.diffSum += diff;
    agg.firstYearAnnualSum += (isAnnual ? firstAnnualBase : firstYearEquivalent);
    agg.annualBaseSum += annualBase;
    agg.lifetimeSum += lifetimeSum;
    agg.maxYears = Math.max(agg.maxYears, payYears);
  }

  persons.forEach(person => {

    // Sản phẩm chính
    if (person.isMain && appState.mainProduct.key && payYearsMain > 0 && baseMainAnnualFirst > 0) {
      const lifetimeMain = baseMainAnnualFirst * payYearsMain;
      const mainLabel = appState.mainProduct.key === 'TRON_TAM_AN'? 'An Bình Ưu Việt': getProductLabel(appState.mainProduct.key);
      pushRow(person, mainLabel, formatDisplayCurrency(stbhMain),
        payYearsMain, baseMainAnnualFirst, false, lifetimeMain);
    }

    // Đóng thêm
    if (person.isMain && extraAnnualFirst > 0 && payYearsMain > 0) {
      const lifetimeExtra = extraAnnualFirst * payYearsMain;
      pushRow(person, 'Phí đóng thêm', '—', payYearsMain, extraAnnualFirst, false, lifetimeExtra);
    }

    // Riders biến phí theo tuổi
    if (person.supplements) {
      Object.keys(person.supplements).forEach(rid => {
        const cfg = riderCfgMap[rid];
        if (!cfg) return;
        const issueAge = person.age;
        const maxAge = cfg.maxRenewalAge;
        const payYears = Math.max(0, Math.min(cfg.maxRenewalAge - issueAge, targetAge - mainAge) + 1);
        if (payYears <= 0) return;

        let firstAnnualBase = 0;
        let lifetimeAnnualEq = 0; // tổng annualEquivalent (factored) nếu có kỳ đóng
        let lifetimeBase = 0;     // tổng base (tham khảo)

        for (let y=1; y<=payYears; y++) {
          const attainedAge = issueAge + y - 1;
            let baseYear = 0;
            if (rid === 'health_scl') baseYear = calculateHealthSclPremium(person, appState.fees.baseMain, 0, attainedAge);
            else if (rid === 'bhn') baseYear = calculateBhnPremium(person, appState.fees.baseMain, 0, attainedAge);
            else if (rid === 'accident') baseYear = calculateAccidentPremium(person, appState.fees.baseMain, 0, attainedAge);
            else if (rid === 'hospital_support') baseYear = calculateHospitalSupportPremium(person, appState.fees.baseMain, 0, attainedAge);

          if (y === 1) firstAnnualBase = baseYear;
          lifetimeBase += baseYear;
          if (isAnnual) {
            lifetimeAnnualEq += baseYear;
          } else {
            const per = riderPerPeriod(baseYear, periods, riderFactor);
            lifetimeAnnualEq += per * periods;
          }
        }

        if (firstAnnualBase > 0 && lifetimeAnnualEq > 0) {
          pushRow(person, cfg.label(person), cfg.stbh(person), payYears, firstAnnualBase, true,
            isAnnual ? lifetimeBase : lifetimeAnnualEq);
        }
      });
    }

    // MDP3 (phí level theo tuổi phát hành)
    if (mdpEnabled && (mdpTargetId === person.id || (mdpTargetId === 'other' && person.id === 'mdp3_other'))) {
      const cfg = riderCfgMap.mdp3;
      const issueAge = person.age;
      if (issueAge < 18 || issueAge > 60) {
        // tuổi không hợp lệ -> bỏ
      } else {
        const payYears = Math.max(0, Math.min(riderCfgMap.mdp3.maxRenewalAge - issueAge, targetAge - mainAge) + 1);
        const firstAnnualBase = calcMdp3PremiumIssue(issueAge, person.gender); // level
        if (payYears > 0 && firstAnnualBase > 0) {
          let lifetimeSum = 0;
          if (isAnnual) {
            lifetimeSum = firstAnnualBase * payYears;
          } else {
            // mỗi năm annualEq = riderAnnualEquivalent(firstAnnualBase)
            const annualEqYear = riderAnnualEquivalent(firstAnnualBase, periods, riderFactor);
            lifetimeSum = annualEqYear * payYears;
          }
          pushRow(person, cfg.label(), cfg.stbh(), payYears, firstAnnualBase, true, lifetimeSum);
        }
      }
    }
  });

  // Tính tổng
  const orderedPersonIds = persons.map(p=>p.id);
  let grand = { per:0, eq:0, diff:0, firstYearAnnual:0, annualBase:0, lifetime:0, maxYears:0 };

  orderedPersonIds.forEach(pid => {
    const a = perPersonAgg[pid];
    if (!a) return;
    grand.per += a.perPeriodSum;
    grand.eq += a.annualEqSum;
    grand.diff += a.diffSum;
    grand.firstYearAnnual += a.firstYearAnnualSum;
    grand.annualBase += a.annualBaseSum;
    grand.lifetime += a.lifetimeSum;
    grand.maxYears = Math.max(grand.maxYears, a.maxYears);
  });

  // Tính average cho mỗi người & grand
  Object.values(perPersonAgg).forEach(a => {
    a.avg = (a.maxYears > 0) ? r1000(a.lifetimeSum / a.maxYears) : 0;
  });
  grand.avg = (grand.maxYears > 0) ? r1000(grand.lifetime / grand.maxYears) : 0;

  return {
    rows,
    perPersonAgg,
    orderedPersonIds,
    grand,
    isAnnual,
    periods
  };
}

/******************** RENDER PHẦN 1 (MỚI) ********************/
// PATCH #4: Ẩn tên chi tiết, thêm average
function buildPart1Section(summaryData) {
  const lifetimeData = computePart1LifetimeData(summaryData);
  const {
    rows,
    perPersonAgg,
    orderedPersonIds,
    grand,
    isAnnual,
    periods
  } = lifetimeData;

  const r1000 = n => Math.round((n||0)/1000)*1000;
  const formatDiffCell = n => !n ? '0' : `<span class="text-red-600 font-bold">${formatDisplayCurrency(r1000(n))}</span>`;

  const headerHtml = isAnnual
    ? `<tr>
         <th class="p-2 border">Tên NĐBH</th>
         <th class="p-2 border">Sản phẩm</th>
         <th class="p-2 border">STBH</th>
         <th class="p-2 border">Số năm đóng phí</th>
         <th class="p-2 border">Phí theo năm</th>
         <th class="p-2 border">Tổng cộng phải đóng</th>
         <th class="p-2 border">Trung bình/năm</th>
       </tr>`
    : `<tr>
         <th class="p-2 border">Tên NĐBH</th>
         <th class="p-2 border">Sản phẩm</th>
         <th class="p-2 border">STBH</th>
         <th class="p-2 border">Số năm đóng phí</th>
         <th class="p-2 border">Phí (${periods===2?'nửa năm':'theo quý'})</th>
         <th class="p-2 border">Phí năm đầu</th>
         <th class="p-2 border">Phí theo năm</th>
         <th class="p-2 border">Chênh lệch</th>
         <th class="p-2 border">Tổng cộng phải đóng</th>
         <th class="p-2 border">Trung bình/năm</th>
       </tr>`;

  const body = [];

  orderedPersonIds.forEach(pid => {
    const agg = perPersonAgg[pid];
    if (!agg) return;
    // Tổng theo người
    body.push(isAnnual ? `
      <tr class="bg-gray-50 font-bold">
        <td class="p-2 border">${sanitizeHtml(agg.name)}</td>
        <td class="p-2 border">Tổng theo người</td>
        <td class="p-2 border text-right">—</td>
        <td class="p-2 border text-center">—</td>
        <td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.annualBaseSum))}</td>
        <td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.lifetimeSum))}</td>
        <td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.avg||0))}</td>
      </tr>
    ` : `
      <tr class="bg-gray-50 font-bold">
        <td class="p-2 border">${sanitizeHtml(agg.name)}</td>
        <td class="p-2 border">Tổng theo người</td>
        <td class="p-2 border text-right">—</td>
        <td class="p-2 border text-center">—</td>
        <td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.perPeriodSum))}</td>
        <td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.firstYearAnnualSum))}</td>
        <td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.annualBaseSum))}</td>
        <td class="p-2 border text-right">${formatDiffCell(agg.diffSum)}</td>
        <td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.lifetimeSum))}</td>
        <td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.avg||0))}</td>
      </tr>
    `);

    // Chi tiết
    rows.filter(r => r.personId === pid).forEach(r => {
      body.push(isAnnual ? `
        <tr>
          <td class="p-2 border"></td>
          <td class="p-2 border">${sanitizeHtml(r.productLabel)}</td>
          <td class="p-2 border text-right">${r.stbhDisplay}</td>
          <td class="p-2 border text-center">${r.payYears}</td>
          <td class="p-2 border text-right">${formatDisplayCurrency(r.annualBase)}</td>
          <td class="p-2 border text-right">${formatDisplayCurrency(r.lifetimeSum)}</td>
          <td class="p-2 border text-right">${formatDisplayCurrency(r.average||0)}</td>
        </tr>
      ` : `
        <tr>
          <td class="p-2 border"></td>
          <td class="p-2 border">${sanitizeHtml(r.productLabel)}</td>
          <td class="p-2 border text-right">${r.stbhDisplay}</td>
          <td class="p-2 border text-center">${r.payYears}</td>
          <td class="p-2 border text-right">${formatDisplayCurrency(r.perPeriod)}</td>
            <td class="p-2 border text-right">${formatDisplayCurrency(r.firstYearAnnual)}</td>
          <td class="p-2 border text-right">${formatDisplayCurrency(r.annualBase)}</td>
          <td class="p-2 border text-right">${r.diff ? formatDiffCell(r.diff) : '0'}</td>
          <td class="p-2 border text-right">${formatDisplayCurrency(r.lifetimeSum)}</td>
          <td class="p-2 border text-right">${formatDisplayCurrency(r.average||0)}</td>
        </tr>
      `);
    });
  });

  // Tổng tất cả
  body.push(isAnnual ? `
    <tr class="bg-gray-100 font-bold">
      <td class="p-2 border" colspan="4">Tổng tất cả</td>
      <td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.annualBase))}</td>
      <td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.lifetime))}</td>
      <td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.avg||0))}</td>
    </tr>
  ` : `
    <tr class="bg-gray-100 font-bold">
      <td class="p-2 border" colspan="4">Tổng tất cả</td>
      <td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.per))}</td>
      <td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.firstYearAnnual))}</td>
      <td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.annualBase))}</td>
      <td class="p-2 border text-right">${formatDiffCell(grand.diff)}</td>
      <td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.lifetime))}</td>
      <td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.avg||0))}</td>
    </tr>
  `);

  return `
    <h3 class="text-lg font-bold mb-2">Phần 1 · Tóm tắt sản phẩm</h3>
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-sm">
        <thead>${headerHtml}</thead>
        <tbody>${body.join('')}</tbody>
      </table>
    </div>
  `;
}

/********************************************************************
 * RENDER: PART 2 (Bảng phí từng năm)
 ********************************************************************/
// PATCH #6: Render Part 2 mới (Tổng quy năm / Tổng năm gốc / ẩn cột rider trống)
// Thay thế TOÀN BỘ hàm buildPart2Section hiện có bằng hàm này
function buildPart2Section(data) {
    // --- BẮT ĐẦU PHẦN LOGIC MỚI ---
    const isKhoeTronVen = CONFIG.PRODUCT_GROUPS.PUL.includes(data.productKey);

    // Nếu không phải Khoẻ Trọn Vẹn, dùng logic render cũ
    if (!isKhoeTronVen) {
        // Đây là logic render bảng phí gốc cho các sản phẩm khác
        const { schedule, isAnnual, periods, persons } = data;
        const rows = schedule.rows;
        if (!rows.length) {
            return `<h3 class="text-lg font-bold mt-6 mb-2">Phần 3 · Bảng phí</h3><div class="p-3 border border-dashed rounded text-gray-500 text-sm">Không có dữ liệu.</div>`;
        }
        const activePersonIdx = persons.map((p, i) => rows.some(r => (r.perPersonSuppAnnualEq[i] || 0) > 0) ? i : -1).filter(i => i !== -1);
        const header = ['<th class="p-2 border">Năm HĐ</th>', '<th class="p-2 border">Tuổi NĐBH chính</th>', '<th class="p-2 border">Phí chính</th>'];
        if (rows.some(r => r.extraYearBase > 0)) { header.push('<th class="p-2 border">Phí đóng thêm</th>'); }
        activePersonIdx.forEach(i => { header.push(`<th class="p-2 border">Phí bổ sung (${sanitizeHtml(persons[i].name)})</th>`); });
        if (!isAnnual) header.push('<th class="p-2 border">Tổng quy năm</th>');
        header.push('<th class="p-2 border">Tổng đóng theo năm </th>');
        if (!isAnnual) header.push('<th class="p-2 border">Chênh lệch</th>');
        
        let sumMainBase=0, sumExtraBase=0, sumSuppAnnualEq=[], sumSuppBase=[], sumAnnualEq=0, sumBase=0, sumDiff=0;
        activePersonIdx.forEach(()=> { sumSuppAnnualEq.push(0); sumSuppBase.push(0); });
        
        const body = rows.map(r => {
            sumMainBase += r.mainYearBase; sumExtraBase += r.extraYearBase; sumAnnualEq += r.totalAnnualEq; sumBase += r.totalYearBase; sumDiff += r.diff;
            activePersonIdx.forEach((idx,pos) => { sumSuppAnnualEq[pos] += r.perPersonSuppAnnualEq[idx]; sumSuppBase[pos] += r.perPersonSuppBase[idx]; });
            return `<tr><td class="p-2 border text-center">${r.year}</td><td class="p-2 border text-center">${r.age}</td><td class="p-2 border text-right">${formatDisplayCurrency(r.mainYearBase)}</td>${rows.some(x=>x.extraYearBase>0) ? `<td class="p-2 border text-right">${formatDisplayCurrency(r.extraYearBase)}</td>` : ''}${activePersonIdx.map(i => `<td class="p-2 border text-right">${r.perPersonSuppAnnualEq[i]?formatDisplayCurrency(r.perPersonSuppAnnualEq[i]):'0'}</td>`).join('')}${!isAnnual ? `<td class="p-2 border text-right">${formatDisplayCurrency(r.totalAnnualEq)}</td>` : ''}<td class="p-2 border text-right">${formatDisplayCurrency(r.totalYearBase)}</td>${!isAnnual ? `<td class="p-2 border text-right">${r.diff ? `<span class="text-red-600 font-bold">${formatDisplayCurrency(r.diff)}</span>` : '0'}</td>` : ''}</tr>`;
        });

        const totalCells = [];
        totalCells.push(`<td class="p-2 border font-semibold">Tổng</td>`, `<td class="p-2 border"></td>`, `<td class="p-2 border text-right font-semibold">${formatDisplayCurrency(sumMainBase)}</td>`);
        if (rows.some(r=>r.extraYearBase>0)) { totalCells.push(`<td class="p-2 border text-right font-semibold">${formatDisplayCurrency(sumExtraBase)}</td>`); }
        totalCells.push(...activePersonIdx.map((_,pos)=>{ return `<td class="p-2 border text-right font-semibold">${formatDisplayCurrency(sumSuppAnnualEq[pos])}</td>`; }));
        if (!isAnnual) { totalCells.push(`<td class="p-2 border text-right font-semibold">${formatDisplayCurrency(sumAnnualEq)}</td>`); }
        totalCells.push(`<td class="p-2 border text-right font-semibold">${formatDisplayCurrency(sumBase)}</td>`);
        if (!isAnnual) { totalCells.push(`<td class="p-2 border text-right font-semibold">${sumDiff?`<span class="text-red-600 font-bold">${formatDisplayCurrency(sumDiff)}</span>`:'0'}</td>`); }

        return `<h3 class="text-lg font-bold mt-6 mb-2">Phần 3 · Bảng phí</h3><div class="overflow-x-auto"><table class="w-full border-collapse text-sm"><thead><tr>${header.join('')}</tr></thead><tbody>${body.join('')}<tr class="bg-gray-50">${totalCells.join('')}</tr></tbody></table></div>`;
    }

    // Nếu là Khoẻ Trọn Vẹn, chạy logic mới để thêm các cột GTTK
    const customRateInput = document.getElementById('custom-interest-rate-input')?.value;
    const projection = calculateAccountValueProjection(
        appState.mainPerson,
        appState.mainProduct,
        appState.fees.baseMain,
        appState.mainProduct.extraPremium,
        data.targetAge,
        customRateInput
    );
    
    const { schedule, isAnnual, persons } = data;
    const rows = schedule.rows;
    if (!rows.length) {
        return `<h3 class="text-lg font-bold mt-6 mb-2">Phần 3 · Bảng phí & Minh họa tài khoản</h3><div class="p-3 border border-dashed rounded text-gray-500 text-sm">Không có dữ liệu.</div>`;
    }

    const activePersonIdx = persons.map((p, i) => rows.some(r => (r.perPersonSuppAnnualEq[i] || 0) > 0) ? i : -1).filter(i => i !== -1);
    
    const header = [
        '<th class="p-2 border">Năm HĐ</th>', '<th class="p-2 border">Tuổi</th>', '<th class="p-2 border">Phí chính</th>',
        (rows.some(r => r.extraYearBase > 0) ? '<th class="p-2 border">Phí đóng thêm</th>' : ''),
        ...activePersonIdx.map(i => `<th class="p-2 border">Phí BS (${sanitizeHtml(persons[i].name)})</th>`),
        (!isAnnual ? '<th class="p-2 border">Tổng quy năm</th>' : ''),
        '<th class="p-2 border">Tổng đóng/năm</th>',
        '<th class="p-2 border">GTTK (LS cam kết)</th>',
        `<th class="p-2 border">GTTK (LS ${customRateInput || "minh họa"}% tới năm 20)</th>`,
        `<th class="p-2 border">GTTK (LS ${customRateInput || "minh họa"}%)</th>`,
    ].filter(Boolean);

    let sumMainBase = 0, sumExtraBase = 0, sumSuppAnnualEq = [], sumAnnualEq = 0, sumBase = 0;
    activePersonIdx.forEach(() => sumSuppAnnualEq.push(0));

    const body = rows.map((r, index) => {
        sumMainBase += r.mainYearBase; sumExtraBase += r.extraYearBase; sumAnnualEq += r.totalAnnualEq; sumBase += r.totalYearBase;
        activePersonIdx.forEach((idx, pos) => { sumSuppAnnualEq[pos] += r.perPersonSuppAnnualEq[idx]; });
        
        const gttk_guaranteed = Math.round((projection.guaranteed[index] || 0) / 1000) * 1000;
        const gttk_capped = Math.round((projection.customCapped[index] || 0) / 1000) * 1000;
        const gttk_full = Math.round((projection.customFull[index] || 0) / 1000) * 1000;
        
        return `<tr>
            <td class="p-2 border text-center">${r.year}</td><td class="p-2 border text-center">${r.age}</td>
            <td class="p-2 border text-right">${formatDisplayCurrency(r.mainYearBase)}</td>
            ${rows.some(x => x.extraYearBase > 0) ? `<td class="p-2 border text-right">${formatDisplayCurrency(r.extraYearBase)}</td>` : ''}
            ${activePersonIdx.map(i => `<td class="p-2 border text-right">${formatDisplayCurrency(r.perPersonSuppAnnualEq[i] || 0)}</td>`).join('')}
            ${!isAnnual ? `<td class="p-2 border text-right">${formatDisplayCurrency(r.totalAnnualEq)}</td>` : ''}
            <td class="p-2 border text-right font-semibold">${formatDisplayCurrency(r.totalYearBase)}</td>
            <td class="p-2 border text-right">${formatDisplayCurrency(gttk_guaranteed)}</td>
            <td class="p-2 border text-right">${formatDisplayCurrency(gttk_capped)}</td>
            <td class="p-2 border text-right">${formatDisplayCurrency(gttk_full)}</td>
        </tr>`;
    }).join('');

    const totalCells = [
        `<td class="p-2 border font-semibold" colspan="2">Tổng</td>`,
        `<td class="p-2 border text-right font-semibold">${formatDisplayCurrency(sumMainBase)}</td>`,
        (rows.some(r => r.extraYearBase > 0) ? `<td class="p-2 border text-right font-semibold">${formatDisplayCurrency(sumExtraBase)}</td>` : ''),
        ...activePersonIdx.map((_, pos) => `<td class="p-2 border text-right font-semibold">${formatDisplayCurrency(sumSuppAnnualEq[pos])}</td>`),
        (!isAnnual ? `<td class="p-2 border text-right font-semibold">${formatDisplayCurrency(sumAnnualEq)}</td>` : ''),
        `<td class="p-2 border text-right font-semibold">${formatDisplayCurrency(sumBase)}</td>`,
        `<td class="p-2 border"></td><td class="p-2 border"></td><td class="p-2 border"></td>`,
    ].filter(Boolean);

    return `
    <h3 class="text-lg font-bold mt-6 mb-2">Phần 3 · Bảng phí & Minh họa giá trị tài khoản</h3>
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-sm">
        <thead><tr>${header.join('')}</tr></thead>
        <tbody>${body}<tr class="bg-gray-50">${totalCells.join('')}</tr></tbody>
      </table>
    </div>`;
}
/********************************************************************
 * RENDER: FOOTER + EXPORT
 ********************************************************************/
function buildFooterSection() {
  return `
    <div class="mt-6 text-xs text-gray-600 italic" style="font-size: 14px;">
      (*) Công cụ này chỉ mang tính chất tham khảo cá nhân, không phải là bảng minh họa chính thức của AIA. Quyền lợi và mức phí cụ thể sẽ được xác nhận trong hợp đồng do AIA phát hành. 
          Vui lòng liên hệ tư vấn viên AIA để được tư vấn chi tiết và nhận bảng minh họa chính thức <!-- Bạn có thể viết lại nội dung này -->
    </div>
  `;
}
function buildExportButtonsSection() {
  return `
    <div class="mt-4 text-center">
      <button id="export-html-btn" class="bg-blue-600 text-white px-4 py-2 rounded mr-2">Xuất HTML</button>
      <button id="export-pdf-btn" class="bg-gray-700 text-white px-4 py-2 rounded">Xuất PDF</button>
    </div>
  `;
}

/********************************************************************
 * TIỆN ÍCH PHỤ
 ********************************************************************/
function roundTo1000(n){ return Math.round((n||0)/1000)*1000; }
function formatDiffCell(n){
  if (!n) return '0';
  return `<span class="text-red-600 font-bold">${formatDisplayCurrency(n)}</span>`;
}

// Fallback export nếu file của bạn chưa có attachExportHandlers (trường hợp hiếm)
function attachSimpleExportHandlers(container) {
  if (!container) return;
  const buildDoc = () => {
    const clone = container.cloneNode(true);
    clone.querySelectorAll('#export-html-btn,#export-pdf-btn').forEach(el=>el.remove());
    const styles = `
      body { font-family: system-ui,-apple-system,sans-serif; color:#111; margin:24px;}
      table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px}
      th,td{border:1px solid #ddd;padding:8px;text-align:right}
      th{text-align:left;background:#f3f4f6}
      td:first-child,th:first-child{text-align:left}
      .text-red-600{color:#d00;font-weight:700}
      @page { size:A4; margin:12mm; }
      @media print { thead{display:table-header-group} tr,td,th{page-break-inside:avoid} }
    `;
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bảng minh họa ${ymd}</title><style>${styles}</style></head><body>${clone.innerHTML}</body></html>`;
    return { html, ymd };
  };
  const btnHtml = container.querySelector('#export-html-btn');
  const btnPdf = container.querySelector('#export-pdf-btn');

  if (btnHtml) {
    btnHtml.addEventListener('click', ()=>{
      const {html, ymd} = buildDoc();
      const blob = new Blob([html], {type:'text/html;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `bang-tom-tat_${ymd}.html`;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
    });
  }
  if (btnPdf) {
    btnPdf.addEventListener('click', ()=>{
      const {html} = buildDoc();
      const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1200');
      if (!w) return;
      w.document.open(); w.document.write(html); w.document.close(); w.focus();
      setTimeout(()=>{ try { w.print(); } catch(_e){} }, 300);
    });
  }
}
function renderSuppList(){
  const box = document.getElementById('supp-insured-summaries');
  if (!box) return;

  // Thu thập lại người
  const persons = [];
  const main = collectPersonData(document.getElementById('main-person-container'), true);
  if (main) persons.push(main);
  document.querySelectorAll('#supplementary-insured-container .person-container').forEach(c=>{
    const p = collectPersonData(c,false); 
    if (p) persons.push(p);
  });

  const feesMap   = (window.personFees)||{};
  const mdpEnabled = window.MDP3 && MDP3.isEnabled && MDP3.isEnabled();
  const mdpTargetId = mdpEnabled ? (MDP3.getSelectedId && MDP3.getSelectedId()) : null;
  const mdpFee = (mdpEnabled && window.MDP3 && MDP3.getPremium) ? MDP3.getPremium() : 0;

  const rows = persons.map(p=>{
    const f = feesMap[p.id] || { main:0, supp:0 };
    const suppOnly = f.supp || 0;
    return `<div class="flex justify-between">
              <span>${sanitizeHtml(p.name || (p.isMain ? 'NĐBH chính':'Người'))}</span>
              <span>${formatDisplayCurrency(suppOnly)}</span>
            </div>`;
  });

  // Nếu MDP3 chọn "other" => thêm mục riêng
  if (mdpEnabled && mdpTargetId === 'other' && mdpFee > 0) {
    const form = document.getElementById('person-container-mdp3-other');
    let nameOther = 'Người được miễn đóng phí';
    if (form) {
      const info = collectPersonData(form, false);
      if (info && info.name) nameOther = info.name;
    }
    rows.push(`<div class="flex justify-between">
        <span>${sanitizeHtml(nameOther)}</span>
        <span>${formatDisplayCurrency(mdpFee)}</span>
      </div>`);
  }

  box.innerHTML = rows.join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('toggle-supp-list-btn');
  if (btn && !btn._bound) {
    btn.addEventListener('click', ()=>{
      const list = document.getElementById('supp-insured-summaries');
      if (!list) return;
      list.classList.toggle('hidden');
      if (!list.classList.contains('hidden')) renderSuppList();
    });
    btn._bound = true;
  }
});

function attachExportHandlers(container) {
  const buildDoc = () => {
    const clone = container.cloneNode(true);
    clone.querySelectorAll('#export-html-btn,#export-pdf-btn').forEach(el => el.remove());
    const styles = `
      body { font-family: system-ui, -apple-system, sans-serif; color:#111; margin:24px; }
      table { border-collapse: collapse; width: 100%; margin:12px 0; font-size:14px; }
      th, td { border:1px solid #ddd; padding:8px; text-align:right; }
      th { text-align:left; background:#f3f4f6; }
      td:first-child, th:first-child { text-align:left; }
      .text-red-600 { color:#d00; font-weight:700; }
      @page { size:A4; margin:12mm; }
      @media print { thead{display:table-header-group;} tfoot{display:table-footer-group;} tr,td,th{ page-break-inside:avoid; } }
    `;
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bảng tóm tắt quyền lợi & phí - ${dateStr}</title><style>${styles}</style></head><body>${clone.innerHTML}</body></html>`;
    return { html, dateStr };
  };
  document.getElementById('export-html-btn')?.addEventListener('click', () => {
    const { html, dateStr } = buildDoc();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bang-tom-tat_${dateStr}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=> URL.revokeObjectURL(url), 0);
  });
  document.getElementById('export-pdf-btn')?.addEventListener('click', () => {
    const { html } = buildDoc();
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1200');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch(_e){} }, 200);
  });
}
/******************************************************************
 * PATCH Benefit Matrix v3.2 (gpt-5)
 * Sửa theo phản hồi mới:
 * 1) Bỏ sống khoẻ An Bình Ưu Việt
 * 2) Header cột = Tên người[, người2] - [Chương trình nếu SCL] - STBH ...
 * 3) Khôi phục format label "Tên quyền lợi - công thức" (trừ phần lặp SCL)
 * 4) Vitality (main products) là số & vào tổng; ẩn <18
 * 5) Vitality/Sống khoẻ của SCL & BHN 2.0 dạng text, không vào tổng
 * 6) Dòng tổng = "Tổng quyền lợi"
 * 7) Sửa "BHNg" => "BHN"
 ******************************************************************/

/* =================== Helpers =================== */
function bm_fmt(n){
  if (n==null || n==='') return '';
  const x=Number(n);
  if(!isFinite(x)) return '';
  return x.toLocaleString('vi-VN');
}
function bm_escape(s){
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function bm_anyAge(persons, minAge){
  return persons.some(p => (p.age||0) >= minAge);
}
function bm_isFemale(p){ return (p.gender||'').toLowerCase().startsWith('nữ'); }
function bm_roundToThousand(x){
  if(!isFinite(x)) return 0;
  return Math.round(x/1000)*1000;
}

/* =================== Program Maps (SCL) =================== */
const BM_SCL_PROGRAMS = {
  co_ban: {
    label:'Cơ bản',
    core:100000000,
    double:100000000,
    room:750000,
    commonDisease:5000000,
    dialysis:5000000,
    maternity:false,
    maternitySum:null,
    maternityCheck:null,
    maternityRoom:null,
    // NEW:
    outLimit:5000000,          // Hạn mức ngoại trú / năm
    outVisit:500000,           // Mỗi lần khám
    outMental:null,            // Không áp dụng
    dentalLimit:1000000        // Hạn mức nha khoa / năm
  },
  nang_cao: {
    label:'Nâng cao',
    core:250000000,
    double:250000000,
    room:1500000,
    commonDisease:7000000,
    dialysis:7000000,
    maternity:false,
    maternitySum:null,
    maternityCheck:null,
    maternityRoom:null,
    outLimit:10000000,
    outVisit:1000000,
    outMental:null,
    dentalLimit:2000000
  },
  toan_dien: {
    label:'Toàn diện',
    core:500000000,
    double:500000000,
    room:2500000,
    commonDisease:10000000,
    dialysis:10000000,
    maternity:true,
    maternitySum:25000000,
    maternityCheck:1000000,
    maternityRoom:2500000,
    outLimit:20000000,
    outVisit:2000000,
    outMental:2000000,
    dentalLimit:5000000
  },
  hoan_hao: {
    label:'Hoàn hảo',
    core:1000000000,
    double:1000000000,
    room:5000000,
    commonDisease:null,
    dialysis:50000000,
    maternity:true,
    maternitySum:25000000,
    maternityCheck:1500000,
    maternityRoom:5000000,
    outLimit:40000000,
    outVisit:4000000,
    outMental:4000000,
    dentalLimit:10000000
  }
};

/* =================== Schemas =================== */
// Mỗi benefit:
//  - labelBase: phần trước công thức
//  - formulaLabel: phần sau dấu " - ..." (phục hồi format)
//  - valueType: number | text
//  - compute(): trả số (number) => format
//  - cap: trần (optional)
//  - minAge: ẩn nếu tất cả người < minAge
//  - text: cho valueType=text
//  - maternityOnly / childOnly / elderOnly...
//  - includeInTotal: override (mặc định number => true, text => false)
const BM_SCHEMAS = [
  /* ---------- An Bình Ưu Việt (KHÔNG có sống khoẻ) ---------- */
  {
    key:'AN_BINH_UU_VIET',
    type:'main',
    hasTotal:false,
    benefits:[
      { id:'abuv_death',
        labelBase:'Quyền lợi bảo hiểm tử vong',
        formulaLabel:'125% STBH',
        valueType:'number',
        compute:(sa)=>sa*1.25
      },
      { id:'abuv_tpd',
        labelBase:'Quyền lợi bảo hiểm tàn tật toàn bộ và vĩnh viễn',
        formulaLabel:'100% STBH',
        valueType:'number',
        compute:(sa)=>sa
      }
    ]
  },
  /* ---------- Khoẻ Bình An ---------- */
  {
    key:'KHOE_BINH_AN',
    type:'main',
    hasTotal:true,
    benefits:[
      { id:'kba_life', labelBase:'Quyền lợi sinh mệnh', formulaLabel:'100% STBH', valueType:'number', compute:(sa)=>sa },
      { id:'kba_thyroid', labelBase:'TTTBVV do ung thư tuyến giáp - giai đoạn sớm (Tối đa 200 triệu)', formulaLabel:'10% STBH', valueType:'number', compute:(sa)=>sa*0.10, cap:200000000 },
      { id:'kba_tangcuong', labelBase:'Gia tăng bảo vệ mỗi năm 5% từ năm thứ 2 đến năm thứ 11', formulaLabel:'tối đa 50% STBH', valueType:'number', compute:(sa)=>sa*0.50},      
      { id:'kba_vitality', labelBase:'Thưởng gia tăng bảo vệ AIA Vitality', formulaLabel:'tối đa 30% STBH', valueType:'number', minAge:18, compute:(sa)=>sa*0.30 },
      { id:'kba_no_underw', labelBase:'Tăng số tiền bảo hiểm không cần thẩm định (Tối đa 500 triệu)', formulaLabel:'tối đa 50% STBH', valueType:'number', compute:(sa)=>sa*0.50, cap:500000000 }
    ]
  },
  /* ---------- Vững Tương Lai ---------- */
  {
    key:'VUNG_TUONG_LAI',
    type:'main',
    hasTotal:true,
    benefits:[
      { id:'vtl_life', labelBase:'Quyền lợi sinh mệnh', formulaLabel:'100% STBH', valueType:'number', compute:(sa)=>sa },
      { id:'vtl_thyroid', labelBase:'TTTBVV do ung thư tuyến giáp - giai đoạn sớm (Tối đa 200 triệu)', formulaLabel:'10% STBH', valueType:'number', compute:(sa)=>sa*0.10, cap:200000000 },
      { id:'vtl_vitality', labelBase:'Thưởng gia tăng bảo vệ AIA Vitality', formulaLabel:'tối đa 30% STBH', valueType:'number', minAge:18, compute:(sa)=>sa*0.30 },
      { id:'vtl_no_underw', labelBase:'Tăng số tiền bảo hiểm không cần thẩm định (Tối đa 500 triệu)', formulaLabel:'tối đa 50% STBH', valueType:'number', compute:(sa)=>sa*0.50, cap:500000000 }
    ]
  },
  /* ---------- Khoẻ Trọn Vẹn (PUL family) ---------- */
  {
    key:'PUL_FAMILY',
    type:'main',
    hasTotal:true,
    productKeys:['PUL_TRON_DOI','PUL_5NAM','PUL_15NAM'],
    benefits:[
      { id:'pul_life', labelBase:'Quyền lợi sinh mệnh', formulaLabel:'100% STBH', valueType:'number', compute:(sa)=>sa },
      { id:'pul_thyroid', labelBase:'TTTBVV do ung thư tuyến giáp - giai đoạn sớm (Tối đa 200 triệu)', formulaLabel:'10% STBH', valueType:'number', compute:(sa)=>sa*0.10, cap:200000000 },
      { id:'pul_vitality', labelBase:'Thưởng gia tăng bảo vệ AIA Vitality', formulaLabel:'tối đa 20% STBH', valueType:'number', minAge:18, compute:(sa)=>sa*0.20 },
      { id:'pul_no_underw', labelBase:'Tăng số tiền bảo hiểm không cần thẩm định (Tối đa 500 triệu)', formulaLabel:'tối đa 50% STBH', valueType:'number', compute:(sa)=>sa*0.50, cap:500000000 },
      // Cam kết bảo vệ (text, không vào tổng)
      { id:'pul_commit_5', labelBase:'Cam kết bảo vệ', formulaLabel:'', valueType:'text', productCond:'PUL_5NAM', text:'Đóng đủ phí tối thiểu 5 năm - Cam kết bảo vệ tối thiểu 30 năm' },
      { id:'pul_commit_15', labelBase:'Cam kết bảo vệ', formulaLabel:'', valueType:'text', productCond:'PUL_15NAM', text:'Đóng đủ phí tối thiểu 15 năm - Cam kết bảo vệ tối thiểu 30 năm' }
    ]
  },
  /* ---------- Sức khỏe Bùng Gia Lực (SCL) ---------- */
  {
    key:'HEALTH_SCL',
    type:'rider',
    hasTotal:false,
    benefits:[
      { id:'scl_core', labelBase:'Quyền lợi chính - STBH năm', formulaLabel:'Theo chương trình', valueType:'number', computeProg:(m)=>m.core },
      { id:'scl_double', labelBase:'Nhân đôi bảo vệ khi điều trị tại Cơ sở y tế công lập', formulaLabel:'= STBH chương trình', valueType:'number', computeProg:(m)=>m.double },
      { id:'scl_wellness', labelBase:'Quyền lợi sống khoẻ', formulaLabel:'', valueType:'text', minAge:18, text:'Tối đa 60% trung bình phí 3 năm' },
      { id:'scl_room', labelBase:'Phòng & Giường bệnh (tối đa 100 ngày/năm; mỗi ngày)', formulaLabel:'Mức/ngày', valueType:'text', computeProg:(m)=> bm_fmt(m.room)+'/ngày' },
      { id:'scl_icu', labelBase:'Phòng Chăm sóc đặc biệt (tối đa 30 ngày/năm)', formulaLabel:'Theo Chi phí y tế', valueType:'text', text:'Theo Chi phí y tế' },
      { id:'scl_surgery', labelBase:'Phẫu thuật', formulaLabel:'Theo Chi phí y tế', valueType:'text', text:'Theo Chi phí y tế' },
      { id:'scl_pre', labelBase:'Điều trị trước nhập viện (tối đa 30 ngày trước khi nhập viện; mỗi đợt)', formulaLabel:'Theo Chi phí y tế', valueType:'text', text:'Theo Chi phí y tế' },
      { id:'scl_post', labelBase:'Điều trị sau xuất viện (tối đa 60 ngày sau xuất viện; mỗi đợt)', formulaLabel:'Theo Chi phí y tế', valueType:'text', text:'Theo Chi phí y tế' },
      { id:'scl_other', labelBase:'Chi phí y tế nội trú khác', formulaLabel:'Theo Chi phí y tế', valueType:'text', text:'Theo Chi phí y tế' },
      { id:'scl_transplant_pt', labelBase:'Ghép tạng (tim, phổi, gan, tuỵ, thận, tuỷ xương) - NĐBH', formulaLabel:'', valueType:'text', text:'Theo Chi phí y tế (mỗi lần)' },
      { id:'scl_transplant_donor', labelBase:'Ghép tạng (người hiến tạng)', formulaLabel:'', valueType:'text', text:'50% chi phí phẫu thuật' },
      { id:'scl_cancer', labelBase:'Điều trị ung thư: gồm điều trị nội trú, ngoại trú và trong ngày', formulaLabel:'Theo Chi phí y tế', valueType:'text', text:'Theo Chi phí y tế' },
      { id:'scl_day_surgery', labelBase:'Phẫu thuật/Thủ thuật trong ngày (mỗi Năm hợp đồng)', formulaLabel:'Theo Chi phí y tế', valueType:'text', text:'Theo Chi phí y tế' },
      { id:'scl_common', labelBase:'Điều trị trong ngày cho các bệnh: Viêm phế quản; Viêm phổi; Sốt xuất huyết; Cúm (mỗi bệnh/mỗi Năm hợp đồng)', formulaLabel:'Theo chương trình', valueType:'text', computeProg:(m)=> m.commonDisease? bm_fmt(m.commonDisease):'Theo Chi phí y tế' },
      { id:'scl_dialysis', labelBase:'Lọc máu (mỗi Năm hợp đồng)', formulaLabel:'Theo chương trình', valueType:'text', computeProg:(m)=> m.dialysis? bm_fmt(m.dialysis):'Theo Chi phí y tế' },
      // Thai sản gộp
      { id:'scl_maternity_header', labelBase:'Quyền lợi Thai sản', headerCategory:'maternity' },
      { id:'scl_maternity_ratio', labelBase:'Tỷ lệ chi trả thai sản', formulaLabel:'', valueType:'text', maternityOnly:true, text:'Năm 1: 50% | Năm 2: 80% | Từ năm 3: 100%' },
      { id:'scl_mat_sum', labelBase:'Hạn mức', formulaLabel:'Theo chương trình', valueType:'text', maternityOnly:true, computeProg:(m)=> m.maternitySum? bm_fmt(m.maternitySum):'' },
      { id:'scl_mat_check', labelBase:'Khám thai (tối đa 8 lần/năm; mỗi lần)', formulaLabel:'Theo chương trình', valueType:'text', maternityOnly:true, computeProg:(m)=> m.maternityCheck? bm_fmt(m.maternityCheck)+'/lần':'' },
      { id:'scl_mat_room', labelBase:'Phòng & Giường (tối đa 100 ngày/năm; mỗi ngày)', formulaLabel:'Theo chương trình', valueType:'text', maternityOnly:true, computeProg:(m)=> m.maternityRoom? bm_fmt(m.maternityRoom)+'/ngày':'' },
      { id:'scl_mat_icu', labelBase:'Phòng chăm sóc đặc biệt (tối đa 30 ngày/năm)', formulaLabel:'Theo Chi phí y tế', valueType:'text', maternityOnly:true, text:'Theo Chi phí y tế' },
      { id:'scl_mat_birth_norm', labelBase:'Sinh thường', formulaLabel:'Theo Chi phí y tế', valueType:'text', maternityOnly:true, text:'Theo Chi phí y tế' },
      { id:'scl_mat_birth_cs', labelBase:'Sinh mổ theo chỉ định', formulaLabel:'Theo Chi phí y tế', valueType:'text', maternityOnly:true, text:'Theo Chi phí y tế' },
      { id:'scl_mat_complication', labelBase:'Biến chứng thai sản', formulaLabel:'Theo Chi phí y tế', valueType:'text', maternityOnly:true, text:'Theo Chi phí y tế' },
      { id:'scl_mat_newborn', labelBase:'Chăm sóc trẻ sơ sinh (tối đa 7 ngày sau sinh)', formulaLabel:'Theo Chi phí y tế', valueType:'text', maternityOnly:true, text:'Theo Chi phí y tế' },
          // --- Ngoại trú (chỉ hiển thị nếu chọn outpatient) ---
      { id:'scl_out_header', labelBase:'Quyền lợi Ngoại trú', headerCategory:'outpatient' },
      { id:'scl_out_title', labelBase:'Tỷ lệ chi trả', formulaLabel:'', valueType:'text', outpatientOnly:true, text:'80%' },
      { id:'scl_out_limit', labelBase:'Hạn mức ', formulaLabel:'Theo chương trình', valueType:'text', outpatientOnly:true,
        computeProg:(m)=> m.outLimit ? bm_fmt(m.outLimit) : '' },
      { id:'scl_out_visit', labelBase:'Mỗi lần khám', formulaLabel:'Theo chương trình', valueType:'text', outpatientOnly:true,
        computeProg:(m)=> m.outVisit ? bm_fmt(m.outVisit) : '' },
      { id:'scl_out_mental', labelBase:'Tư vấn / Điều trị sức khoẻ tâm thần', formulaLabel:'Theo chương trình', valueType:'text', outpatientOnly:true,
        computeProg:(m)=> m.outMental ? bm_fmt(m.outMental) : 'Không áp dụng' },

      // --- Nha khoa (chỉ hiển thị nếu chọn dental) ---
      { id:'scl_dental_header', labelBase:'Quyền lợi Nha khoa', headerCategory:'dental' },
      { id:'scl_dental_title', labelBase:'Tỷ lệ chi trả', formulaLabel:'', valueType:'text', dentalOnly:true, text:'80%' },
      { id:'scl_dental_limit', labelBase:'Hạn mức năm', formulaLabel:'Theo chương trình', valueType:'text', dentalOnly:true,
        computeProg:(m)=> m.dentalLimit ? bm_fmt(m.dentalLimit) : '' }

    ]
  },
  /* ---------- Bệnh hiểm nghèo 2.0 ---------- */
  {
    key:'BHN_2_0',
    type:'rider',
    hasTotal:true,
    benefits:[
      { id:'bhn_early', labelBase:'BHN giai đoạn sớm (4 lần, tối đa 500tr/lần)', formulaLabel:'30% STBH', valueType:'number', compute:(sa)=>sa*0.30, cap:500000000 },
      { id:'bhn_mid', labelBase:'BHN giai đoạn giữa (2 lần, tối đa 1 tỷ/lần)', formulaLabel:'60% STBH', valueType:'number', compute:(sa)=>sa*0.60, cap:1000000000 },
      { id:'bhn_late', labelBase:'BHN giai đoạn cuối (1 lần)', formulaLabel:'100% STBH', valueType:'number', compute:(sa)=>sa },
      { id:'bhn_child', labelBase:'BHN ở trẻ em (1 lần, tối đa 500 tr, ≤20 tuổi)', formulaLabel:'60% STBH', valueType:'number', compute:(sa)=>sa*0.60, cap:500000000, childOnly:true },
      { id:'bhn_elder', labelBase:'BHN người lớn tuổi (1 lần, tối đa 500 tr, từ 55 tuổi)', formulaLabel:'20% STBH', valueType:'number', compute:(sa)=>sa*0.20, cap:500000000},
      { id:'bhn_special', labelBase:'Quyền lợi đặc biệt (1 lần, tối đa 500tr)', formulaLabel:'30% STBH', valueType:'number', compute:(sa)=>sa*0.30, cap:500000000 },
      // Wellness text
      { id:'bhn_wellness', labelBase:'Quyền lợi sống khoẻ', formulaLabel:'', valueType:'text', minAge:18, text:'Tối đa 30% trung bình phí 5 năm' }
    ]
  },
  /* ---------- Hospital Support ---------- */
  {
    key:'HOSPITAL_SUPPORT',
    type:'rider',
    hasTotal:false,
    benefits:[
      { id:'hs_daily', labelBase:'Trợ cấp nằm viện (tối đa 365 ngày/ đợt nằm viện)', formulaLabel:'', valueType:'number', computeDaily:(d)=>d },
      { id:'hs_icu', labelBase:'Trợ cấp ICU (tối đa 25 ngày/ đợt nằm viện)', formulaLabel:'', valueType:'number', computeDaily:(d)=>d*2 }
    ]
  },
  /* ---------- Accident ---------- */
  {
    key:'ACCIDENT',
    type:'rider',
    hasTotal:false,
    benefits:[
      { id:'acc_injury', labelBase:'Tổn thương do tai nạn', formulaLabel:'', valueType:'text',
        computeRange:(sa)=>{
          if(!sa) return '';
          const min = bm_roundToThousand(sa*0.01);
          const max = bm_roundToThousand(sa*2.00);
          return `Từ ${bm_fmt(min)} đến ${bm_fmt(max)}`;
        }
      }
    ]
  }
];

function bm_findSchema(productKey){
  if (productKey==='AN_BINH_UU_VIET') return BM_SCHEMAS.find(s=>s.key==='AN_BINH_UU_VIET');
  if (['KHOE_BINH_AN'].includes(productKey)) return BM_SCHEMAS.find(s=>s.key==='KHOE_BINH_AN');
  if (['VUNG_TUONG_LAI'].includes(productKey)) return BM_SCHEMAS.find(s=>s.key==='VUNG_TUONG_LAI');
  if (CONFIG.PRODUCT_GROUPS.PUL.includes(productKey)) return BM_SCHEMAS.find(s=>s.key==='PUL_FAMILY');
  if (productKey==='health_scl') return BM_SCHEMAS.find(s=>s.key==='HEALTH_SCL');
  if (productKey==='bhn') return BM_SCHEMAS.find(s=>s.key==='BHN_2_0');
  if (productKey==='hospital_support') return BM_SCHEMAS.find(s=>s.key==='HOSPITAL_SUPPORT');
  if (productKey==='accident') return BM_SCHEMAS.find(s=>s.key==='ACCIDENT');
  return null;
}

/* =================== Collect Columns =================== */
function bm_collectColumns(summaryData){
  const colsBySchema = {};
  const persons = summaryData.persons||[];
  const mainKey = summaryData.productKey;
  const mainSa = appState?.mainProduct?.stbh || 0;

  // Main product column
  if (mainKey){
    const schema = bm_findSchema(mainKey);
    if (schema){
      colsBySchema[schema.key] = colsBySchema[schema.key]||[];
      colsBySchema[schema.key].push({
        productKey: mainKey,
        sumAssured: mainSa,
        persons:[ summaryData.mainInfo ],
        label: (summaryData.mainInfo?.name || 'NĐBH') + (mainSa? ' - STBH: '+bm_fmt(mainSa):'')
      });
    }
  }

  // Trọn tâm an => thêm An Bình Ưu Việt 100tr
  if (mainKey === 'TRON_TAM_AN'){
    const schemaAB = bm_findSchema('AN_BINH_UU_VIET');
    if (schemaAB){
      colsBySchema[schemaAB.key] = colsBySchema[schemaAB.key]||[];
      colsBySchema[schemaAB.key].push({
        productKey:'AN_BINH_UU_VIET',
          sumAssured:100000000,
        persons:[ summaryData.mainInfo ],
        label:(summaryData.mainInfo?.name || 'NĐBH')+' - STBH: 100.000.000'
      });
    }
  }

  persons.forEach(p=>{
    const supp = p.supplements||{};
    // SCL
    if (supp.health_scl && supp.health_scl.program){
      const schema = bm_findSchema('health_scl');
      if (schema){
        const prog = supp.health_scl.program;
        const progMap = BM_SCL_PROGRAMS[prog];
        const childCopay = p.age<5?1:0;
        const maternity = (bm_isFemale(p) && p.age>=18 && p.age<=46 && progMap && progMap.maternity)?1:0;
        const outpatient = !!(p.supplements.health_scl.outpatient);
        const dental = !!(p.supplements.health_scl.dental);
        const sig = `scl|${prog}|c${childCopay}|m${maternity}|o${outpatient?1:0}|d${dental?1:0}`;
        colsBySchema[schema.key]=colsBySchema[schema.key]||[];
        let col = colsBySchema[schema.key].find(c=>c.sig===sig);
        if(!col){
          col = {
            sig,
            productKey:'health_scl',
            program:prog,
            flags:{childCopay,maternity, outpatient, dental},
            persons:[],
            label:'', // sẽ build sau
          };
          colsBySchema[schema.key].push(col);
        }
        col.persons.push(p);
      }
    }
    // BHN
    if (supp.bhn && supp.bhn.stbh){
      const schema = bm_findSchema('bhn');
      if (schema){
        const sa = supp.bhn.stbh;
        const child = p.age<21?1:0;
        const elder = p.age>=55?1:0;
        const sig = `bhn|${sa}|c${child}|e${elder}`;
        colsBySchema[schema.key]=colsBySchema[schema.key]||[];
        let col = colsBySchema[schema.key].find(c=>c.sig===sig);
        if(!col){
          col={
            sig,
            productKey:'bhn',
            sumAssured:sa,
            flags:{child,elder},
            persons:[],
            label:''
          };
          colsBySchema[schema.key].push(col);
        }
        col.persons.push(p);
      }
    }
    // Hospital support
    if (supp.hospital_support && supp.hospital_support.stbh){
      const schema = bm_findSchema('hospital_support');
      if (schema){
        const daily = supp.hospital_support.stbh;
        const sig = `hs|${daily}`;
        colsBySchema[schema.key]=colsBySchema[schema.key]||[];
        let col = colsBySchema[schema.key].find(c=>c.sig===sig);
        if(!col){
          col={
            sig,
            productKey:'hospital_support',
            daily,
            persons:[],
            label:''
          };
          colsBySchema[schema.key].push(col);
        }
        col.persons.push(p);
      }
    }
    // Accident
    if (supp.accident && supp.accident.stbh){
      const schema = bm_findSchema('accident');
      if (schema){
        const sa = supp.accident.stbh;
        const sig = `acc|${sa}`;
        colsBySchema[schema.key]=colsBySchema[schema.key]||[];
        let col = colsBySchema[schema.key].find(c=>c.sig===sig);
        if(!col){
          col={
            sig,
            productKey:'accident',
            sumAssured:sa,
            persons:[],
            label:''
          };
          colsBySchema[schema.key].push(col);
        }
        col.persons.push(p);
      }
    }
  });

  // Build labels (names list)
  Object.values(colsBySchema).forEach(arr=>{
    arr.forEach(col=>{
      const names = (col.persons||[]).map(pp=>pp.name||pp.id).join(', ');
      if (col.productKey==='health_scl'){
        const progMap = col.program ? BM_SCL_PROGRAMS[col.program]:null;
        const core = progMap? progMap.core: null;
        col.label = names + (progMap? ' - '+progMap.label:'') + (core? ' - STBH: '+bm_fmt(core):'');
      } else if (col.productKey==='bhn'){
        col.label = names + (col.sumAssured? ' - STBH: '+bm_fmt(col.sumAssured):'');
      } else if (col.productKey==='hospital_support'){
        col.label = names + (col.daily? ' - STBH: '+bm_fmt(col.daily)+'/ngày':'');
      } else if (col.productKey==='accident'){
        col.label = names + (col.sumAssured? ' - STBH: '+bm_fmt(col.sumAssured):'');
      } else {
        // main product & ABƯV
        col.label = names + (col.sumAssured? ' - STBH: '+bm_fmt(col.sumAssured):'');
      }
    });
  });

  return colsBySchema;
}

/* =================== Render Schema =================== */
function bm_renderSchemaTables(schemaKey, columns, summaryData){
  const schema = BM_SCHEMAS.find(s=>s.key===schemaKey);
  if(!schema || !columns.length) return '';

  const rows = [];

  schema.benefits.forEach(benef=>{
    // 1. Header nhóm
    if (benef.headerCategory){
      let need = false;
      if (benef.headerCategory === 'maternity') need = columns.some(c => c.flags && c.flags.maternity);
      else if (benef.headerCategory === 'outpatient') need = columns.some(c => c.flags && c.flags.outpatient);
      else if (benef.headerCategory === 'dental') need = columns.some(c => c.flags && c.flags.dental);
      if (!need) return;
      rows.push({ isHeader:true, benef, colspan: 1 + columns.length });
      return;
    }

    // 2. Dòng quyền lợi thường
    const cells = [];
    let anyVisible = false;

    columns.forEach(col=>{
      const persons = col.persons || [];

      // Điều kiện loại trừ
      if (benef.productCond && benef.productCond !== col.productKey){ cells.push(''); return; }
      if (benef.minAge && !bm_anyAge(persons, benef.minAge)){ cells.push(''); return; }
      if (benef.childOnly && !persons.some(p=>p.age<21)){ cells.push(''); return; }
      if (benef.elderOnly && !persons.some(p=>p.age>=55)){ cells.push(''); return; }
      if (benef.maternityOnly && !(col.flags && col.flags.maternity)){ cells.push(''); return; }
      if (benef.outpatientOnly && !(col.flags && col.flags.outpatient)){ cells.push(''); return; }
      if (benef.dentalOnly && !(col.flags && col.flags.dental)){ cells.push(''); return; }

      // Tính giá trị
      let value = '';
      const sa = col.sumAssured || (col.productKey===summaryData.productKey ? (appState.mainProduct.stbh||0) : 0);
      const progMap = col.program ? BM_SCL_PROGRAMS[col.program] : null;
      const daily = col.daily;

      if (benef.valueType === 'number'){
        let raw = 0;
        if (benef.computeProg && progMap) raw = benef.computeProg(progMap) || 0;
        else if (benef.computeDaily && daily != null) raw = benef.computeDaily(daily) || 0;
        else if (benef.compute) raw = sa ? benef.compute(sa) : 0;
        if (benef.cap && raw > benef.cap) raw = benef.cap;
        raw = bm_roundToThousand(raw);
        value = raw ? bm_fmt(raw) : '';
      } else { // text
        if (benef.computeProg && progMap) value = benef.computeProg(progMap) || '';
        else if (benef.computeRange && sa) value = benef.computeRange(sa) || '';
        else value = benef.text || '';
      }

      if (value) anyVisible = true;
      cells.push(value);
    });

    if (!anyVisible) return;
    rows.push({ benef, cells });
  });

  // 3. Total (nếu cần)
  if (schema.hasTotal){
    const totalCells = [];
    columns.forEach((_, idx)=>{
      let sum = 0;
      rows.forEach(r=>{
        if (r.isHeader) return;
        if (r.benef.valueType === 'number'){
          const v = r.cells[idx];
          if (v){
            const parsed = parseInt(String(v).replace(/[^\d]/g,''),10);
            if (!isNaN(parsed)) sum += parsed;
          }
        }
      });
      totalCells.push(sum ? bm_fmt(sum) : '');
    });
    rows.push({
      benef:{ id:'_total', labelBase:'Tổng quyền lợi', formulaLabel:'', isTotal:true, valueType:'number' },
      cells: totalCells
    });
  }

  if (!rows.length) return '';

  const titleMap = {
    'AN_BINH_UU_VIET':'An Bình Ưu Việt',
    'KHOE_BINH_AN':'Khoẻ Bình An',
    'VUNG_TUONG_LAI':'Vững Tương Lai',
    'PUL_FAMILY':'Khoẻ Trọn Vẹn',
    'HEALTH_SCL':'Sức khỏe Bùng Gia Lực',
    'BHN_2_0':'Bệnh hiểm nghèo 2.0',
    'HOSPITAL_SUPPORT':'Hỗ trợ Chi phí Nằm viện',
    'ACCIDENT':'Tai nạn'
  };
  const title = titleMap[schema.key] || schema.key;

  const headCols = columns
    .map(c=>`<th class="border px-2 py-2 text-left align-top">${bm_escape(c.label)}</th>`)
    .join('');

  function buildLabel(benef){
    const base = benef.labelBase || '';
    const form = benef.formulaLabel || '';
    if (!form) return bm_escape(base);
    if (schema.key === 'HEALTH_SCL'){
      const removable = ['Theo Chi phí y tế','Mức/ngày','Theo chương trình','= STBH chương trình'];
      if (removable.includes(form.trim())) return bm_escape(base);
    }
    return bm_escape(base + ' - ' + form);
  }

  const bodyHtml = rows.map(r=>{
    if (r.isHeader){
      return `<tr class="benefit-subgroup-header">
        <td colspan="${r.colspan}" class="border px-2 py-2 font-semibold">${bm_escape(r.benef.labelBase)}</td>
      </tr>`;
    }
    const isTotal = !!r.benef.isTotal;
    const labelHtml = buildLabel(r.benef);
    return `<tr>
      <td class="border px-2 py-1 ${isTotal?'font-semibold':''}">${labelHtml}</td>
      ${r.cells.map(c=>`<td class="border px-2 py-1 text-right ${isTotal?'font-semibold':''}">${c||''}</td>`).join('')}
    </tr>`;
  }).join('');

  return `
    <div class="mb-6">
      <h4 class="font-semibold mb-1">${bm_escape(title)}</h4>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th class="border px-2 py-2 text-left" style="width:42%">Tên quyền lợi</th>
              ${headCols}
            </tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* =================== Build Part 2 Section =================== */
function buildPart2BenefitsSection(summaryData){
  summaryData.mainProductSumAssured = appState.mainProduct.stbh || 0;
  const colsBySchema = bm_collectColumns(summaryData);
  const order = [
    'AN_BINH_UU_VIET','KHOE_BINH_AN','VUNG_TUONG_LAI','PUL_FAMILY',
    'HEALTH_SCL','BHN_2_0','HOSPITAL_SUPPORT','ACCIDENT'
  ];
  const blocks = order.map(sk => colsBySchema[sk]? bm_renderSchemaTables(sk, colsBySchema[sk], summaryData):'').filter(Boolean);
  if(!blocks.length){
    return `
      <h3 class="text-lg font-bold mt-6 mb-3">Phần 2 · Tóm tắt quyền lợi sản phẩm</h3>
      <div class="text-sm text-gray-500 italic mb-4">Không có quyền lợi nào để hiển thị.</div>
    `;
  }
  return `
    <h3 class="text-lg font-bold mt-6 mb-3">Phần 2 · Tóm tắt quyền lợi sản phẩm</h3>
    ${blocks.join('')}
  `;
}

/* =================== Part 3 schedule alias =================== */
if (typeof buildPart2Section === 'function'){
  window.buildPart3ScheduleSection = function(summaryData){
    return buildPart2Section(summaryData).replace(/Phần\s*2\s*·\s*Bảng phí/i,'Phần 3 · Bảng phí');
  };
} else if (typeof buildPart3ScheduleSection !== 'function'){
  window.buildPart3ScheduleSection = function(){ return ''; };
}

console.info('[BenefitMatrixPatch] v3.2 applied.');
/* ====== SHARE VIEWER PAYLOAD (Phương án C2) ====== */
const PRODUCT_SLUG_MAP = {
  PUL_TRON_DOI: 'khoe-tron-ven',
  PUL_15NAM: 'khoe-tron-ven',
  PUL_5NAM: 'khoe-tron-ven',
  KHOE_BINH_AN: 'khoe-binh-an',
  VUNG_TUONG_LAI: 'vung-tuong-lai',
  TRON_TAM_AN: 'tron-tam-an',
  AN_BINH_UU_VIET: 'an-binh-uu-viet'
};
// Mapping rider -> slug thư mục ảnh
const RIDER_SLUG_MAP = {
  health_scl: 'bung-gia-luc',
  bhn: 'benh-hiem-ngheo-20',
  accident: 'tai-nan',
  hospital_support: 'ho-tro-vien-phi'
};

function __exportExactSummaryHtml() {
  try {
    if (typeof runWorkflow === 'function') runWorkflow();
    if (typeof buildSummaryData !== 'function') return '';
    const data = buildSummaryData();
    const introHtml = (typeof buildIntroSection === 'function') ? buildIntroSection(data) : '';
    const part1Html = (typeof buildPart1Section === 'function') ? buildPart1Section(data) : '';
    const part2Html = (typeof buildPart2BenefitsSection === 'function') ? buildPart2BenefitsSection(data) : '';
    // Phần 3 có thể là buildPart3ScheduleSection hoặc buildPart2Section tuỳ patch
    let part3Html = '';
    if (typeof buildPart3ScheduleSection === 'function') {
      part3Html = buildPart3ScheduleSection(data);
    } else if (typeof buildPart2Section === 'function') {
      part3Html = buildPart2Section(data).replace(/Phần\s*2\s*·\s*Bảng phí/i, 'Phần 3 · Bảng phí');
    }
    const footerHtml = (typeof buildFooterSection === 'function') ? buildFooterSection(data) : '';
    return introHtml + part1Html + part2Html + part3Html + footerHtml;
  } catch (e) {
    console.error('[__exportExactSummaryHtml] lỗi:', e);
    return '<div style="color:red">Lỗi dựng summaryHtml</div>';
  }
}

function buildViewerPayload() {
  if (typeof updateStateFromUI === 'function') updateStateFromUI();
  if (typeof performCalculations === 'function') {
    appState.fees = performCalculations(appState);
  }

  const mainKey = appState.mainProduct.key;
  const mainPerson = appState.mainPerson || {};

  // Xác định paymentTerm sau cùng
  let paymentTermFinal = appState.mainProduct.paymentTerm || 0;
  if (mainKey === 'TRON_TAM_AN') paymentTermFinal = 10;
  if (mainKey === 'AN_BINH_UU_VIET') {
    paymentTermFinal = parseInt(document.getElementById('abuv-term')?.value || '0', 10) || paymentTermFinal;
  }

  // Thu thập riders từ tất cả mọi người
  const riderList = [];
  const allPersons = [appState.mainPerson, ...appState.supplementaryPersons].filter(p => p);
  allPersons.forEach(person => {
    const suppObj = person.supplements || {};
    Object.keys(suppObj).forEach(rid => {
      // Chỉ thêm rider nếu nó chưa có trong danh sách
      if (!riderList.some(r => r.slug === rid)) {
        const data = suppObj[rid];
        const premiumDetail = (appState.fees.byPerson?.[person.id]?.suppDetails?.[rid]) || 0;
        riderList.push({
          slug: rid,
          selected: true,
          stbh: data.stbh || (rid === 'health_scl' ? getHealthSclStbhByProgram(data.program) : 0),
          program: data.program,
          scope: data.scope,
          outpatient: !!data.outpatient,
          dental: !!data.dental,
          premium: premiumDetail
        });
      }
    });
  });

  // MDP3
  let mdp3Obj = null;
  if (window.MDP3 && MDP3.isEnabled && MDP3.isEnabled()) {
    const premium = MDP3.getPremium ? MDP3.getPremium() : 0;
    const selId = MDP3.getSelectedId ? MDP3.getSelectedId() : null;
    if (premium > 0 && selId) {
      let selectedName = '',
        selectedAge = '';
      if (selId === 'other') {
        const form = document.getElementById('person-container-mdp3-other');
        if (form) {
          const info = collectPersonData(form, false);
          selectedName = info?.name || 'Người khác';
          selectedAge = info?.age || '';
        }
      } else {
        const cont = document.getElementById(selId);
        if (cont) {
          const info = collectPersonData(cont, false);
          selectedName = info?.name || 'NĐBH bổ sung';
          selectedAge = info?.age || '';
        }
      }
      mdp3Obj = { selectedId: selId, premium, selectedName, selectedAge };
      if (!riderList.some(r => r.slug === 'mdp3')) {
        riderList.push({ slug: 'mdp3', selected: true, stbh: 0, premium });
      }
    }
  }

  // Phí
  const baseMain = appState.fees.baseMain || 0;
  const extra = appState.fees.extra || 0;
  const totalSupp = appState.fees.totalSupp || 0;
  const targetAgeInputVal = parseInt(document.getElementById('target-age-input')?.value || '0', 10);
  const targetAge = targetAgeInputVal || ((mainPerson.age || 0) + paymentTermFinal - 1);

  // Tạo summaryHtml nguyên văn
  const summaryHtml = __exportExactSummaryHtml();

  return {
    v: 3,
    productKey: mainKey,
    productSlug: PRODUCT_SLUG_MAP[mainKey] || (mainKey || '').toLowerCase(),
    mainPersonName: mainPerson.name || '',
    mainPersonDob: mainPerson.dob || '',
    mainPersonAge: mainPerson.age || 0,
    mainPersonGender: mainPerson.gender === 'Nữ' ? 'F' : 'M',
    mainPersonRiskGroup: mainPerson.riskGroup,
    sumAssured: (mainKey === 'TRON_TAM_AN') ? 100000000 : (appState.mainProduct.stbh || 0),
    paymentFrequency: appState.paymentFrequency,
    paymentTerm: appState.mainProduct.paymentTerm,
    paymentTermFinal,
    targetAge,
    premiums: {
      baseMain,
      extra,
      totalSupp,
      riders: riderList
    },
    mdp3: mdp3Obj,
    summaryHtml
  };
}

function openFullViewer() {
  try {
    const payload = buildViewerPayload();
    if (!payload.productKey) {
      alert('Chưa chọn sản phẩm chính.');
      return;
    }
    const json = JSON.stringify(payload);
    const b64 = btoa(unescape(encodeURIComponent(json)));

    const viewerUrl = new URL('viewer.html', location.href);
    viewerUrl.hash = `#v=${b64}`;

    const modal = document.getElementById('viewer-modal');
    const iframe = document.getElementById('viewer-iframe');
    const closeBtn = document.getElementById('close-viewer-modal-btn');

    if (!modal || !iframe || !closeBtn) {
      console.error('Không tìm thấy các thành phần của modal viewer.');
      // Fallback to new tab if modal components are missing
      window.open(viewerUrl.toString(), '_blank', 'noopener');
      return;
    }

    iframe.src = 'about:blank'; // Clear previous content
    setTimeout(() => {
      iframe.src = viewerUrl.toString();
    }, 10); // Small delay to ensure clearing happens first

    modal.classList.add('visible');

    // Function to close the modal
    const closeModal = () => {
      modal.classList.remove('visible');
      iframe.src = 'about:blank'; // Clear src to stop video/audio etc.
      document.removeEventListener('keydown', handleKeydown); // Clean up listener
    };

    // Close button event
    closeBtn.onclick = closeModal;

    // Escape key event
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    document.addEventListener('keydown', handleKeydown);

    // Optional: close on backdrop click
    modal.onclick = (e) => {
      if (e.target === modal) {
        closeModal();
      }
    };

  } catch (e) {
    console.error('[FullViewer] Lỗi tạo payload:', e);
    alert('Không tạo được dữ liệu để mở bảng minh họa.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnFullViewer');
  if (btn && !btn.dataset._bindFullViewer) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();

      const errors = (typeof collectSimpleErrors === 'function') ? collectSimpleErrors() : [];
      if (errors.length) {
        if (typeof showGlobalErrors === 'function') {
          showGlobalErrors(errors);
        }
        const box = document.getElementById('global-error-box');
        if (box) {
          const y = box.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top: y < 0 ? 0 : y, behavior: 'smooth' });
        }
        return;
      } else if (typeof showGlobalErrors === 'function') {
        showGlobalErrors([]);
      }

      openFullViewer();
    });
    btn.dataset._bindFullViewer = '1';
  }
});
