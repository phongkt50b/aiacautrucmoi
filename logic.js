

import { PRODUCT_CATALOG, product_data, investment_data } from './data.js';

// ===================================================================================
// ===== MODULE: CONFIG & BUSINESS RULES (Refactored)
// ===================================================================================
const CONFIG = {
    REFERENCE_DATE: new Date(),
    MAX_SUPPLEMENTARY_INSURED: 10,
    PAYMENT_FREQUENCY_THRESHOLDS: {
        half: 7000000,
        quarter: 8000000,
    },
    // Các hằng số nghiệp vụ chung khác có thể được thêm vào đây
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

function getValueFromPath(obj, path) {
    if (!path || !obj) return undefined;
    return path.split('.').reduce((acc, part) => {
        if (acc === undefined || acc === null) return undefined;
        const match = part.match(/(\w+)\[['"]?(.+?)['"]?\]/);
        if (match) {
            const key = match[1];
            const index = match[2];
            return acc[key] ? acc[key][index] : undefined;
        }
        return acc[part];
    }, obj);
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
            abuvTerm: '', // Vẫn giữ lại cho trường hợp đặc biệt
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
function parseFormattedNumber(formattedString) {
  if (formattedString == null) return 0;
  let v = String(formattedString);
  v = v.replace(/[\u00A0\u202F\s.,]/g, '');
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

// ===================================================================================
// ===== MODULE: DATA COLLECTION (Reading from DOM into State)
// ===================================================================================

function updateStateFromUI() {
    const mainProductKey = document.getElementById('main-product')?.value || '';
    appState.mainProduct.key = mainProductKey;
    
    // Đọc các giá trị từ các input có thể tồn tại
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
        Object.keys(PRODUCT_CATALOG).forEach(prodKey => {
            const prod = PRODUCT_CATALOG[prodKey];
            if (prod.type !== 'rider') return;

            const section = supplementsContainer.querySelector(`.${prodKey}-section`);
            if (section && section.querySelector(`.${prodKey}-checkbox`)?.checked) {
                supplements[prodKey] = {
                    stbh: parseFormattedNumber(section.querySelector(`.${prodKey}-stbh`)?.value),
                    // Dành riêng cho SCL
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
// ===== MODULE: LOGIC & CALCULATIONS (Refactored)
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
    
    const mainProductConfig = PRODUCT_CATALOG[state.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;

    const suppPersons = noSuppInsured ? [] : state.supplementaryPersons;
    const allPersons = [state.mainPerson, ...suppPersons].filter(p => p);

    allPersons.forEach(p => {
        fees.byPerson[p.id] = { main: 0, supp: 0, total: 0, suppDetails: {} };
    });

    if (fees.byPerson[state.mainPerson.id]) {
        fees.byPerson[state.mainPerson.id].main = fees.baseMain + fees.extra;
    }
    
    let totalHospitalSupportStbh = 0;
    allPersons.forEach(person => {
        let personSuppFee = 0;
        Object.keys(person.supplements).forEach(prodKey => {
            const prodConfig = PRODUCT_CATALOG[prodKey];
            if (prodConfig && prodConfig.type === 'rider') {
                const fee = calculateRiderPremium(prodKey, person, fees.baseMain, totalHospitalSupportStbh);
                personSuppFee += fee;
                fees.byPerson[person.id].suppDetails[prodKey] = fee;
                if (prodKey === 'hospital_support') {
                    totalHospitalSupportStbh += person.supplements[prodKey].stbh;
                }
            }
        });
        fees.byPerson[person.id].supp = personSuppFee;
        fees.totalSupp += personSuppFee;
    });

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

    try {
        if (window.MDP3 && MDP3.isEnabled()) {
            const mdp3Fee = MDP3.getPremium() || 0;
            if (mdp3Fee > 0) {
                const mdpTargetId = MDP3.getSelectedId();
                fees.totalSupp += mdp3Fee;
                if (mdpTargetId && mdpTargetId !== 'other' && fees.byPerson[mdpTargetId]) {
                    fees.byPerson[mdpTargetId].supp += mdp3Fee;
                    fees.byPerson[mdpTargetId].suppDetails.mdp3 = mdp3Fee;
                    if (window.personFees[mdpTargetId]) {
                        window.personFees[mdpTargetId].supp += mdp3Fee;
                        window.personFees[mdpTargetId].total += mdp3Fee;
                    }
                } else if (mdpTargetId === 'other') {
                     if (!fees.byPerson['mdp3_other']) {
                        fees.byPerson['mdp3_other'] = { main: 0, supp: 0, total: 0, suppDetails: {} };
                    }
                    fees.byPerson['mdp3_other'].supp += mdp3Fee;
                    fees.byPerson['mdp3_other'].suppDetails.mdp3 = mdp3Fee;

                    window.personFees['mdp3_other'] = {
                        main: 0, mainBase: 0,
                        supp: fees.byPerson['mdp3_other'].supp,
                        total: fees.byPerson['mdp3_other'].supp
                    };
                }
            }
        }
    } catch (e) { console.warn('[MDP3] tính phí lỗi:', e); }

    const totalMain = fees.baseMain + fees.extra;
    const total = totalMain + fees.totalSupp;

    return { ...fees, totalMain, total };
}

function calculateMainPremium(customer, productInfo, ageOverride = null) {
    const ageToUse = ageOverride ?? customer.age;
    const { gender } = customer;
    const { key: productKey, stbh, premium: enteredPremium, abuvTerm } = productInfo;
    
    if (!productKey) return 0;
    const productConfig = PRODUCT_CATALOG[productKey];
    if (!productConfig) return 0;

    let premium = 0;
    const calc = productConfig.calculation;

    switch (calc.method) {
        case 'ratePer1000Stbh':
        case 'ratePer1000StbhWithTerm': {
            const effectiveStbh = productConfig.rules.stbh?.fixed || stbh;
            if (effectiveStbh === 0) return 0;

            let rateTable;
            if (calc.method === 'ratePer1000StbhWithTerm') {
                const term = abuvTerm || productConfig.rules.paymentTerm?.fixed;
                if (!term) return 0;
                rateTable = getValueFromPath(product_data, `${calc.rateTableRef}['${term}']`);
            } else {
                 rateTable = getValueFromPath(product_data, calc.rateTableRef);
            }
            
            if (!rateTable) return 0;
            
            const genderKey = gender === 'Nữ' ? 'nu' : 'nam';
            const rate = rateTable.find(r => r.age === ageToUse)?.[genderKey] || 0;
            premium = Math.round((effectiveStbh / 1000) * rate);
            break;
        }
        case 'fromInput':
            premium = enteredPremium;
            break;
    }

    return roundDownTo1000(premium);
}

function calculateRiderPremium(riderKey, customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const riderConfig = PRODUCT_CATALOG[riderKey];
    if (!riderConfig || riderConfig.type !== 'rider') return 0;

    const calcMethod = riderConfig.calculation?.method;
    if (calcMethod === 'custom' && riderConfig.calculation.functionName) {
        const func = window[riderConfig.calculation.functionName]; // Access function from global scope
        if (typeof func === 'function') {
            return func(customer, mainPremium, totalHospitalSupportStbh, ageOverride);
        }
    }
    return 0; // Default if no calculation method found
}

// Giữ lại các hàm tính phí rider tùy chỉnh, nhưng thêm chúng vào window scope để có thể gọi động
window.calculateHealthSclPremium = function(customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const ageToUse = ageOverride ?? customer.age;
    const config = PRODUCT_CATALOG['health_scl'];
    if (ageToUse > config.rules.eligibility.find(r => r.renewalMax)?.renewalMax) return 0;

    const { program, scope, outpatient, dental } = customer.supplements?.health_scl || {};
    if (!program || !scope) return 0;

    const ageBandIndex = product_data.health_scl_rates.age_bands.findIndex(b => ageToUse >= b.min && ageToUse <= b.max);
    if (ageBandIndex === -1) return 0;

    let totalPremium = product_data.health_scl_rates[scope]?.[ageBandIndex]?.[program] || 0;
    if (outpatient) totalPremium += product_data.health_scl_rates.outpatient?.[ageBandIndex]?.[program] || 0;
    if (dental) totalPremium += product_data.health_scl_rates.dental?.[ageBandIndex]?.[program] || 0;

    return roundDownTo1000(totalPremium);
}

window.calculateBhnPremium = function(customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const config = PRODUCT_CATALOG['bhn'];
    const rateFinder = (cust, age) => product_data.bhn_rates
        .find(r => age >= r.ageMin && age <= r.ageMax)?.[cust.gender === 'Nữ' ? 'nu' : 'nam'] || 0;
    return calculateSimpleRiderPremium(customer, 'bhn', config, rateFinder, 1000, ageOverride);
}

window.calculateAccidentPremium = function(customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const config = PRODUCT_CATALOG['accident'];
    const rateFinder = (cust) => {
        if (cust.riskGroup === 0 || cust.riskGroup > 4) return 0;
        return product_data.accident_rates[cust.riskGroup] || 0;
    };
    return calculateSimpleRiderPremium(customer, 'accident', config, rateFinder, 1000, ageOverride);
}

window.calculateHospitalSupportPremium = function(customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const config = PRODUCT_CATALOG['hospital_support'];
    const rateFinder = (cust, age) => product_data.hospital_fee_support_rates
        .find(r => age >= r.ageMin && age <= r.ageMax)?.rate || 0;
    return calculateSimpleRiderPremium(customer, 'hospital_support', config, rateFinder, 100, ageOverride);
}

function calculateSimpleRiderPremium(customer, prodId, config, rateFinder, divisor, ageOverride = null) {
    const ageToUse = ageOverride ?? customer.age;
    if (ageToUse > config.rules.eligibility.find(r => r.renewalMax)?.renewalMax) return 0;

    const { stbh } = customer.supplements[prodId] || {};
    if (!stbh) return 0;

    const rate = rateFinder(customer, ageToUse);
    if (!rate) return 0;

    const premiumRaw = (stbh / divisor) * rate;
    return roundDownTo1000(premiumRaw);
}
// ===================================================================================
// ===== CÁC HÀM PHỨC TẠP KHÁC (GIỮ NGUYÊN HOẶC CHỈNH SỬA TỐI THIỂU)
// ===================================================================================

function getHealthSclFeeComponents(customer, ageOverride = null) {
  try {
    if (!customer?.supplements?.health_scl) return { base:0, outpatient:0, dental:0, total:0 };
    const ageToUse = ageOverride ?? customer.age;
    const { program, scope, outpatient, dental } = customer.supplements.health_scl;
    if (!program || !scope) return { base:0, outpatient:0, dental:0, total:0 };

    const ageBandIndex = product_data.health_scl_rates.age_bands.findIndex(b => ageToUse >= b.min && ageToUse <= b.max);
    if (ageBandIndex === -1) return { base:0, outpatient:0, dental:0, total:0 };

    const base = product_data.health_scl_rates[scope]?.[ageBandIndex]?.[program] || 0;
    const outpatientFee = outpatient ? (product_data.health_scl_rates.outpatient?.[ageBandIndex]?.[program] || 0) : 0;
    const dentalFee = dental ? (product_data.health_scl_rates.dental?.[ageBandIndex]?.[program] || 0) : 0;
    const total = base + outpatientFee + dentalFee;
    return {
      base: roundDownTo1000(base),
      outpatient: roundDownTo1000(outpatientFee),
      dental: roundDownTo1000(dentalFee),
      total: roundDownTo1000(total)
    };
  } catch(e){ return { base:0, outpatient:0, dental:0, total:0 }; }
}
function calculateAccountValueProjection(mainPerson, mainProduct, basePremium, extraPremium, targetAge, customInterestRate, paymentFrequency) {
    const { gender, age: initialAge } = mainPerson;
    const { key: productKey, stbh: stbhInitial = 0, paymentTerm } = mainProduct;
    const productConfig = PRODUCT_CATALOG[productKey];
    if (!productConfig || !productConfig.investment) return null;

    const { pul_cost_of_insurance_rates, mul_cost_of_insurance_rates, initial_fees, guaranteed_interest_rates, admin_fees, persistency_bonus } = investment_data;
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
    const basePremiumPerPeriod = periods > 1 ? roundVND(annualBasePremium / periods) : annualBasePremium;
    const extraPremiumPerPeriod = periods > 1 ? roundVND(annualExtraPremium / periods) : annualExtraPremium;

    const startDate = CONFIG.REFERENCE_DATE;
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
            if (policyYear >= 2 && policyYear <= 11) return initial + Math.round(initial * 0.05 * (policyYear - 1));
            return initial + Math.round(initial * 0.05 * 10);
        }
        return Number(stbhInitial) || 0;
    };

    const getAdminFeeForYear = (calendarYear) => (Number(admin_fees[calendarYear]) || Number(admin_fees.default) || 0);
    
    const isMulProduct = productConfig.group === 'MUL';

    for (let month = 1; month <= totalMonths; month++) {
        const policyYear = Math.floor((month - 1) / 12) + 1;
        const attainedAge = initialAge + policyYear - 1;
        const genderKey = gender === 'Nữ' ? 'nu' : 'nam';
        const calendarYear = getCalendarYearFromStart(month);
        
        let isPaymentMonth = false;
        const monthInYear = ((month - 1) % 12) + 1;
        if (periods === 1 && monthInYear === 1) isPaymentMonth = true;
        if (periods === 2 && (monthInYear === 1 || monthInYear === 7)) isPaymentMonth = true;
        if (periods === 4 && [1, 4, 7, 10].includes(monthInYear)) isPaymentMonth = true;

        for (const key in scenarios) {
            let currentAccountValue = scenarios[key].accountValue || 0;
            let premiumIn = 0, initialFee = 0;
            
            if (isPaymentMonth && policyYear <= paymentTerm) {
                if (isMulProduct) {
                    premiumIn = basePremiumPerPeriod;
                    const initialFeeRateBase = (initial_fees[productKey] || {})[policyYear] || 0;
                    initialFee = roundVND(premiumIn * Number(initialFeeRateBase));
                } else {
                    premiumIn = basePremiumPerPeriod + extraPremiumPerPeriod;
                    const initialFeeRateBase = (initial_fees[productKey] || {})[policyYear] || 0;
                    const extraInitRate = initial_fees.EXTRA || 0;
                    initialFee = roundVND((basePremiumPerPeriod * Number(initialFeeRateBase)) + (extraPremiumPerPeriod * Number(extraInitRate)));
                }
            }

            const investmentAmount = currentAccountValue + premiumIn - initialFee;
            const adminFee = getAdminFeeForYear(calendarYear);
            const stbhCurrent = getStbhForPolicyYear(policyYear);
            const riskRates = isMulProduct ? mul_cost_of_insurance_rates : pul_cost_of_insurance_rates;
            const riskRateRecord = riskRates.find(r => Number(r.age) === Number(attainedAge));
            const riskRate = riskRateRecord?.[genderKey] || 0;
            const sumAtRisk = Math.max(0, stbhCurrent - investmentAmount);
            let costOfInsurance = roundVND((sumAtRisk * riskRate) / 1000 / 12);
            const netInvestmentAmount = investmentAmount - adminFee - costOfInsurance;
            let guaranteedRateRaw = guaranteed_interest_rates[policyYear] ?? guaranteed_interest_rates.default ?? 0;
            let guaranteedRate = Number(guaranteedRateRaw) || 0;
            guaranteedRate = (guaranteedRate > 1) ? (guaranteedRate / 100) : guaranteedRate;

            let interestRateYearly = 0;
            if (key === 'guaranteed') interestRateYearly = guaranteedRate;
            else if (key === 'customCapped') interestRateYearly = (policyYear <= 20) ? Math.max(customRate, guaranteedRate) : guaranteedRate;
            else interestRateYearly = Math.max(customRate, guaranteedRate);

            const monthlyInterestRate = Math.pow(1 + interestRateYearly, 1 / 12) - 1;
            let interest = roundVND(netInvestmentAmount * monthlyInterestRate);

            let bonus = 0;
            const isLastMonthOfPolicyYear = (month % 12 === 0);
            if (isLastMonthOfPolicyYear) {
                if (isMulProduct) {
                    if (policyYear >= 5 && policyYear <= paymentTerm) bonus = annualBasePremium * 0.03;
                } else {
                    const bonusInfo = persistency_bonus.find(b => b.year === policyYear && paymentTerm >= b.year);
                    if (bonusInfo) bonus = annualBasePremium * bonusInfo.rate;
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

function getPulEligibilityState(stbh, premium) {
    const PUL_MIN_PREMIUM_OR = 20000000;
    const PUL_MIN_STBH_OR = 1000000000;
    const MAIN_PRODUCT_MIN_STBH = 100000000;
    const MAIN_PRODUCT_MIN_PREMIUM = 5000000;

    const result = {
        stbhValid: true, premiumValid: true,
        stbhReason: '', premiumReason: '',
        ridersEnabled: true, ridersReason: ''
    };
    if (stbh > 0 && stbh < MAIN_PRODUCT_MIN_STBH) {
        result.stbhValid = false;
        result.stbhReason = `Phí tối thiểu: ${formatCurrency(PUL_MIN_PREMIUM_OR)} hoặc STBH từ ${formatCurrency(PUL_MIN_STBH_OR)} trở lên`;
        result.ridersEnabled = false;
        result.ridersReason = `Cần STBH ≥ ${formatCurrency(MAIN_PRODUCT_MIN_STBH)} (hiện tại: ${formatCurrency(stbh)})`;
    } else if (stbh >= MAIN_PRODUCT_MIN_STBH && stbh < PUL_MIN_STBH_OR) {
        if (premium > 0 && premium < PUL_MIN_PREMIUM_OR) {
            result.premiumValid = false;
            result.premiumReason = `Phí tối thiểu: ${formatCurrency(PUL_MIN_PREMIUM_OR)} hoặc STBH từ ${formatCurrency(PUL_MIN_STBH_OR)} trở lên`;
            result.ridersEnabled = false;
            result.ridersReason = `Cần phí chính ≥ ${formatCurrency(PUL_MIN_PREMIUM_OR)} (STBH < ${formatCurrency(PUL_MIN_STBH_OR)})`;
        }
    } else if (stbh >= PUL_MIN_STBH_OR) {
        if (premium > 0 && premium < MAIN_PRODUCT_MIN_PREMIUM) {
            result.premiumValid = false;
            result.premiumReason = `Phí tối thiểu: ${formatCurrency(PUL_MIN_PREMIUM_OR)} hoặc STBH từ ${formatCurrency(PUL_MIN_STBH_OR)} trở lên`;
            result.ridersEnabled = false;
            result.ridersReason = `Cần phí chính ≥ ${formatCurrency(MAIN_PRODUCT_MIN_PREMIUM)}`;
        }
    }
    return result;
}
// ===================================================================================
// ===== MODULE: UI (Rendering, DOM manipulation, Event Listeners) - Refactored
// ===================================================================================

function renderUI(isMainProductValid) {
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;
    
    document.getElementById('supplementary-insured-container').classList.toggle('hidden', noSuppInsured);
    document.getElementById('add-supp-insured-btn').classList.toggle('hidden', noSuppInsured);

    const allPersons = [appState.mainPerson, ...appState.supplementaryPersons].filter(p => p);

    allPersons.forEach(p => {
        if (p.container) {
            p.container.querySelector('.age-span').textContent = p.age;
            p.container.querySelector('.risk-group-span').textContent = p.riskGroup > 0 ? p.riskGroup : '...';
        }
    });

    renderMainProductSection(appState.mainPerson, appState.mainProduct.key);
    
    allPersons.forEach(p => {
        const suppContainer = p.isMain
            ? document.querySelector('#main-supp-container .supplementary-products-container')
            : p.container.querySelector('.supplementary-products-container');
        if (suppContainer) {
            renderSupplementaryProductsForPerson(p, appState.mainProduct.key, appState.fees.baseMain, suppContainer, isMainProductValid);
        }
    });
    
    updateSupplementaryAddButtonState(isMainProductValid);
    const mdp3Section = document.getElementById('mdp3-section');
    if (mdp3Section) {
        const isDisabled = !isMainProductValid || noSuppInsured;
        mdp3Section.classList.toggle('opacity-50', isDisabled);
        mdp3Section.classList.toggle('pointer-events-none', isDisabled);
    }

    const fees = appState.fees;
    if (!isMainProductValid) {
        document.getElementById('summary-total').textContent = "0";
        document.getElementById('main-insured-main-fee').textContent = formatDisplayCurrency(fees.baseMain);
        document.getElementById('main-insured-extra-fee').textContent = formatDisplayCurrency(fees.extra);
        document.getElementById('summary-supp-fee').textContent = "0";
        updateMainProductFeeDisplay(fees.baseMain, fees.extra);
        updatePaymentFrequencyOptions(fees.baseMain);
        updateSummaryUI(fees, false);
        if (window.renderSection6V2) window.renderSection6V2();
        return;
    }
    
    document.getElementById('summary-total').textContent = formatDisplayCurrency(fees.total);
    document.getElementById('main-insured-main-fee').textContent = formatDisplayCurrency(fees.baseMain);
    document.getElementById('main-insured-extra-fee').textContent = formatDisplayCurrency(fees.extra);
    document.getElementById('summary-supp-fee').textContent = formatDisplayCurrency(fees.totalSupp);

    updateMainProductFeeDisplay(fees.baseMain, fees.extra);
    updatePaymentFrequencyOptions(fees.baseMain);
    updateSummaryUI(fees, true);
    if (window.renderSection6V2) window.renderSection6V2();
}

let lastRenderedProductKey = null;
let lastRenderedAge = null;
function renderMainProductSection(customer, mainProductKey) {
    const mainProductSelect = document.getElementById('main-product');

    // Update eligibility of options
    mainProductSelect.querySelectorAll('option').forEach(option => {
        const key = option.value;
        if (!key) return;
        const prodConfig = PRODUCT_CATALOG[key];
        const isEligible = prodConfig ? checkEligibility(customer, prodConfig.rules.eligibility) : false;
        option.disabled = !isEligible;
        option.classList.toggle('hidden', !isEligible);
    });
    
    // Auto-switch if current selection becomes invalid
    if (mainProductSelect.options[mainProductSelect.selectedIndex]?.disabled) {
        mainProductSelect.value = "";
        mainProductKey = "";
    }
    
    if (lastRenderedProductKey === mainProductKey && lastRenderedAge === customer.age) return;
    lastRenderedProductKey = mainProductKey;
    lastRenderedAge = customer.age;

    const container = document.getElementById('main-product-options');
    let currentValues = {
        stbh: document.getElementById('main-stbh')?.value || '',
        premium: document.getElementById('main-premium-input')?.value || '',
        paymentTerm: document.getElementById('payment-term')?.value || '',
        extraPremium: document.getElementById('extra-premium-input')?.value || '',
        abuvTerm: document.getElementById('abuv-term')?.value || ''
    };
    
    container.innerHTML = '';
    if (!mainProductKey) return;
    const productConfig = PRODUCT_CATALOG[mainProductKey];
    if (!productConfig) return;

    let optionsHtml = '';
    const uiConfig = productConfig.ui;

    (uiConfig.inputs || []).forEach(inputKey => {
        switch (inputKey) {
            case 'stbh':
                optionsHtml += `<div><label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH) <span class="text-red-600">*</span></label><input type="text" id="main-stbh" class="form-input" value="${currentValues.stbh}" placeholder="VD: 1.000.000.000"></div>`;
                break;
            case 'stbh_fixed':
                 optionsHtml += `<div><label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label><input type="text" id="main-stbh" class="form-input bg-gray-100" value="${formatCurrency(productConfig.rules.stbh.fixed)}" disabled></div>`;
                 break;
            case 'premium':
                optionsHtml += `<div><label for="main-premium-input" class="font-medium text-gray-700 block mb-1">Phí sản phẩm chính</label><input type="text" id="main-premium-input" class="form-input" value="${currentValues.premium}" placeholder="Nhập phí"><div id="mul-fee-range" class="text-sm text-gray-500 mt-1"></div></div>`;
                break;
            case 'paymentTerm':
                const termRule = productConfig.rules.paymentTerm;
                const min = termRule.fixed || termRule.min;
                const max = termRule.fixed || (termRule.maxFn ? termRule.maxFn(customer.age) : 100);
                const val = currentValues.paymentTerm || termRule.default || '';
                optionsHtml += `<div><label for="payment-term" class="font-medium text-gray-700 block mb-1">Thời gian đóng phí (năm) <span class="text-red-600">*</span></label><input type="number" id="payment-term" class="form-input" value="${val}" placeholder="VD: 20" min="${min}" max="${max}" ${termRule.fixed ? 'disabled' : ''}><div id="payment-term-hint" class="text-sm text-gray-500 mt-1"></div></div>`;
                break;
            case 'extraPremium':
                const extraRule = productConfig.rules.extraPremium;
                optionsHtml += `<div><label for="extra-premium-input" class="font-medium text-gray-700 block mb-1">Phí đóng thêm</label><input type="text" id="extra-premium-input" class="form-input" value="${currentValues.extraPremium || ''}" placeholder="VD: 10.000.000"><div class="text-sm text-gray-500 mt-1">Tối đa ${extraRule.maxFactorOfBase} lần phí chính.</div></div>`;
                break;
        }
    });

    if (uiConfig.options) {
        Object.keys(uiConfig.options).forEach(optKey => {
            const optConfig = uiConfig.options[optKey];
            let termOptions = '';
            optConfig.values.forEach(val => {
                if (!val.condition || val.condition(customer)) {
                    const isSelected = (val.value === currentValues.abuvTerm) ? 'selected' : '';
                    termOptions += `<option value="${val.value}" ${isSelected}>${val.label}</option>`;
                }
            });
            if (!termOptions) termOptions = '<option value="" disabled>Không có kỳ hạn phù hợp</option>';
            optionsHtml += `<div><label for="${optConfig.id}" class="font-medium text-gray-700 block mb-1">${optConfig.label} <span class="text-red-600">*</span></label><select id="${optConfig.id}" class="form-select"><option value="">-- Chọn --</option>${termOptions}</select><p class="text-sm text-gray-500 mt-1">Thời hạn đóng phí bằng thời hạn hợp đồng.</p></div>`;
        });
    }
    
    if (productConfig.rules.paymentTerm?.fixed === 10) {
        optionsHtml += `<div><p class="text-sm text-gray-600 mt-1">Thời hạn đóng phí: 10 năm (bằng thời hạn hợp đồng). Thời gian bảo vệ: 10 năm.</p></div>`;
    }

    container.innerHTML = optionsHtml;

    const paymentTermInput = document.getElementById('payment-term');
    if (paymentTermInput && !paymentTermInput.disabled) {
        const defaultTerm = productConfig.rules.paymentTerm?.default;
        if (defaultTerm && !paymentTermInput.value) { // Only set if empty
            paymentTermInput.value = defaultTerm;
            updateTargetAge();
            runWorkflowDebounced();
        }
    }
    
    setPaymentTermHint(mainProductKey, customer.age);
    attachTermListenersForTargetAge();
}
function renderSupplementaryProductsForPerson(customer, mainProductKey, mainPremium, container, isMainProductValid) {
    const mainProductConfig = PRODUCT_CATALOG[mainProductKey];
    let anyUncheckedByRule = false;
    
    Object.entries(PRODUCT_CATALOG).forEach(([prodKey, prod]) => {
        if (prod.type !== 'rider') return;

        const section = container.querySelector(`.${prodKey}-section`);
        if (!section) return;

        const isEligibleForCustomer = checkEligibility(customer, prod.rules.eligibility);
        const isAllowedOnMain = mainProductKey ? !prod.rules.allowedOnMain?.exclude.includes(mainProductKey) : false;
        
        const isEligible = isEligibleForCustomer && isAllowedOnMain;

        section.classList.toggle('hidden', !isEligible);
        const checkbox = section.querySelector(`.${prodKey}-checkbox`);
        if (!checkbox) return;
        
        let isDisabled = !isEligible || !isMainProductValid;
        let disableReason = '';

        if (!isMainProductValid) {
            disableReason = 'Vui lòng hoàn tất thông tin sản phẩm chính.';
        } else if (!isEligible) {
            disableReason = 'Không đủ điều kiện tham gia.';
        }
        
        checkbox.disabled = isDisabled;
        section.classList.toggle('opacity-50', isDisabled);
        const msgEl = section.querySelector('.main-premium-threshold-msg');
        if (msgEl) {
            msgEl.textContent = disableReason;
            msgEl.classList.toggle('hidden', !disableReason);
        }

        const options = section.querySelector('.product-options');
        if (options) options.classList.toggle('hidden', !checkbox.checked);

        const fee = appState.fees.byPerson[customer.id]?.suppDetails?.[prodKey] || 0;
        const feeDisplay = section.querySelector('.fee-display');
        if (feeDisplay) feeDisplay.textContent = fee > 0 ? `Phí: ${formatCurrency(fee)}` : '';

        // Logic đặc biệt cho SCL
        if (prodKey === 'health_scl' && checkbox.checked && !isDisabled) {
            const sclConfig = PRODUCT_CATALOG['health_scl'];
            const comps = getHealthSclFeeComponents(customer);
            const outpatientCb = section.querySelector('.health-scl-outpatient');
            const dentalCb = section.querySelector('.health-scl-dental');
            const outSpan = section.querySelector('.scl-outpatient-fee');
            const dentalSpan = section.querySelector('.scl-dental-fee');

            if (sclConfig.rules.dependencies.dentalRequiresOutpatient) {
                const isOutpatientChecked = outpatientCb.checked;
                dentalCb.disabled = !isOutpatientChecked;
                if (!isOutpatientChecked && dentalCb.checked) {
                    dentalCb.checked = false;
                    anyUncheckedByRule = true;
                }
            }
            if (outSpan) outSpan.textContent = (outpatientCb.checked && comps.outpatient > 0) ? `(+${formatCurrency(comps.outpatient)})` : '';
            if (dentalSpan) dentalSpan.textContent = (dentalCb.checked && comps.dental > 0) ? `(+${formatCurrency(comps.dental)})` : '';
        
            const programSelect = section.querySelector('.health-scl-program');
            if (mainProductKey === 'TRON_TAM_AN') {
                programSelect.querySelectorAll('option').forEach(opt => opt.disabled = false);
            } else if (sclConfig.rules.dependencies.premiumThresholdForProgram) {
                let availablePrograms = ['nang_cao'];
                if (mainPremium >= 15000000) availablePrograms.push('co_ban', 'toan_dien', 'hoan_hao');
                else if (mainPremium >= 10000000) availablePrograms.push('co_ban', 'toan_dien');
                else if (mainPremium >= 5000000) availablePrograms.push('co_ban');

                programSelect.querySelectorAll('option').forEach(opt => {
                    opt.disabled = !availablePrograms.includes(opt.value);
                });

                if (programSelect.options[programSelect.selectedIndex]?.disabled) {
                    const oldProgramText = programSelect.options[programSelect.selectedIndex].text;
                    if (msgEl) {
                        msgEl.textContent = `Phí chính không đủ điều kiện cho chương trình ${oldProgramText}, vui lòng chọn lại.`;
                        msgEl.classList.remove('hidden');
                    }
                    programSelect.value = 'nang_cao';
                } else {
                     if(!disableReason && msgEl) msgEl.classList.add('hidden');
                }
            }
        }
    });

    if (anyUncheckedByRule && typeof runWorkflowDebounced === 'function') {
        runWorkflowDebounced();
    }
}
function updateSummaryUI(fees, isValid = true) {
  const f = fees || { baseMain:0, extra:0, totalSupp:0, total:0 };
  const fmt = (n)=> formatDisplayCurrency(Math.round((Number(n)||0)/1000)*1000);

  const displayTotal = isValid ? f.total : f.baseMain + f.extra;
  const displayTotalSupp = isValid ? f.totalSupp : 0;

  document.getElementById('summary-total').textContent = fmt(displayTotal);
  document.getElementById('main-insured-main-fee').textContent  = fmt(f.baseMain);
  document.getElementById('main-insured-extra-fee').textContent = fmt(f.extra);
  document.getElementById('summary-supp-fee').textContent  = fmt(displayTotalSupp);

  const freqSel = document.getElementById('payment-frequency');
  const freqBox = document.getElementById('frequency-breakdown');
  const v = freqSel ? freqSel.value : 'year';
  const periods = v==='half' ? 2 : (v==='quarter' ? 4 : 1);
  const factor  = periods===2 ? 1.02 : (periods===4 ? 1.04 : 1);

  if (freqBox) freqBox.classList.toggle('hidden', periods===1);

  const perMain  = periods===1 ? 0 : roundDownTo1000((f.baseMain||0)/periods);
  const perExtra = periods===1 ? 0 : roundDownTo1000((f.extra||0)/periods);
  const perSupp  = periods===1 ? 0 : roundDownTo1000(((displayTotalSupp||0)*factor)/periods);

  const perTotal = perMain + perExtra + perSupp;
  const annualEquivalent = perTotal * periods;
  const diff = annualEquivalent - (f.baseMain + f.extra + displayTotalSupp);

  const set = (id, val)=>{ const el=document.getElementById(id); if(el) el.textContent=fmt(val); };
  set('freq-main', perMain);
  set('freq-extra', perExtra);
  set('freq-supp-total', perSupp);
  set('freq-total-period', perTotal);
  set('freq-total-year', f.baseMain + f.extra + displayTotalSupp);
  set('freq-diff', diff);
  set('freq-total-year-equivalent', periods > 1 ? annualEquivalent : '');
}

function updateMainProductFeeDisplay(basePremium, extraPremium) {
    const el = document.getElementById('main-product-fee-display');
    if (!el) return;
    if (basePremium <= 0 && extraPremium <= 0) {
      el.textContent = ''; return;
    }
    el.innerHTML = extraPremium > 0
        ? `Phí SP chính: ${formatCurrency(basePremium)} | Phí đóng thêm: ${formatCurrency(extraPremium)} | Tổng: ${formatCurrency(basePremium + extraPremium)}`
        : `Phí SP chính: ${formatCurrency(basePremium)}`;
}

function updatePaymentFrequencyOptions(baseMainAnnual) {
    const sel = document.getElementById('payment-frequency');
    if (!sel) return;
    const { half, quarter } = CONFIG.PAYMENT_FREQUENCY_THRESHOLDS;
    const allowHalf = baseMainAnnual >= half;
    const allowQuarter = baseMainAnnual >= quarter;
    sel.querySelector('option[value="half"]').disabled = !allowHalf;
    sel.querySelector('option[value="quarter"]').disabled = !allowQuarter;
    if ((sel.value === 'quarter' && !allowQuarter) || (sel.value === 'half' && !allowHalf)) {
      sel.value = 'year';
    }
}


// ===================================================================================
// ===== MODULE: VALIDATION - Refactored
// ===================================================================================
function runAllValidations(state) {
    clearAllErrors();
    let isValid = true;
    if (!validateMainPersonInputs(state.mainPerson)) isValid = false;
    if (!validateMainProductInputs(state)) isValid = false;

    const allPersons = [state.mainPerson, ...state.supplementaryPersons].filter(p => p);
    let totalHospitalSupportStbh = 0;
    allPersons.forEach(p => {
        if (!p.isMain) validateSupplementaryPersonInputs(p);
        for (const prodKey in p.supplements) {
            validateSupplementaryProduct(p, prodKey, state.fees.baseMain, totalHospitalSupportStbh);
            if (prodKey === 'hospital_support') {
                totalHospitalSupportStbh += p.supplements[prodKey].stbh;
            }
        }
    });
    
    return isValid;
}

function validateMainPersonInputs(person) {
    const container = person.container;
    if (!container) return true;
    let ok = true;
    if (!container.querySelector('.name-input')?.value.trim()) { setFieldError(container.querySelector('.name-input'), 'Vui lòng nhập họ và tên'); ok = false; }
    if (!validateDobField(container.querySelector('.dob-input'))) ok = false;
    const group = parseInt(container.querySelector('.occupation-input')?.dataset.group, 10);
    if (!group || group < 1 || group > 4) { setFieldError(container.querySelector('.occupation-input'), 'Chọn nghề nghiệp từ danh sách'); ok = false; }
    return ok;
}

function validateSupplementaryPersonInputs(person) {
    const container = person.container;
    if (!container) return;
    if (!container.querySelector('.name-input')?.value.trim()) setFieldError(container.querySelector('.name-input'), 'Vui lòng nhập họ và tên');
    validateDobField(container.querySelector('.dob-input'));
    const group = parseInt(container.querySelector('.occupation-input')?.dataset.group, 10);
    if (!group || group < 1 || group > 4) setFieldError(container.querySelector('.occupation-input'), 'Chọn nghề nghiệp từ danh sách');
}

function validateMainProductInputs(state) {
    const { mainPerson: customer, mainProduct: productInfo, fees } = state;
    const mainProductSelect = document.getElementById('main-product');
    const productKey = productInfo.key;

    if (!productKey || mainProductSelect.options[mainProductSelect.selectedIndex]?.disabled) {
        setFieldError(mainProductSelect, productKey ? 'Sản phẩm không hợp lệ với tuổi/giới tính' : 'Vui lòng chọn sản phẩm chính');
        return false;
    }
    
    const productConfig = PRODUCT_CATALOG[productKey];
    if (!productConfig) return false;

    let ok = true;
    const rules = productConfig.rules;
    
    // Check STBH, Premium, PaymentTerm
    ['stbh', 'premium', 'paymentTerm'].forEach(ruleKey => {
        const rule = rules[ruleKey];
        if (!rule) return;
        
        let value, element;
        if (ruleKey === 'stbh') { value = productInfo.stbh; element = document.getElementById('main-stbh'); }
        if (ruleKey === 'premium') { value = productInfo.premium; element = document.getElementById('main-premium-input'); }
        if (ruleKey === 'paymentTerm') { value = productInfo.paymentTerm; element = document.getElementById('payment-term'); }
        
        if (rule.special) {
            if (rule.special === 'PUL_ELIGIBILITY') {
                const pulState = getPulEligibilityState(productInfo.stbh, fees.baseMain);
                if (!pulState.stbhValid) { setFieldError(document.getElementById('main-stbh'), pulState.stbhReason); ok = false; }
                if (!pulState.premiumValid) { setFieldError(document.getElementById('main-stbh'), pulState.premiumReason); ok = false; }
            }
            if (rule.special === 'MUL_FACTOR_CHECK' && productInfo.stbh > 0) {
                const factorRow = product_data.mul_factors.find(f => customer.age >= f.ageMin && customer.age <= f.ageMax);
                if (factorRow) {
                    const minFee = roundDownTo1000(productInfo.stbh / factorRow.maxFactor);
                    const maxFee = roundDownTo1000(productInfo.stbh / factorRow.minFactor);
                    document.getElementById('mul-fee-range').textContent = `Phí hợp lệ từ ${formatCurrency(minFee)} đến ${formatCurrency(maxFee)}.`;
                    if (value > 0 && (value < minFee || value > maxFee)) {
                        setFieldError(element, 'Phí không hợp lệ so với STBH');
                        ok = false;
                    }
                }
            }
        }
        if (rule.min && value < rule.min) { setFieldError(element, `Tối thiểu ${formatCurrency(rule.min)}`); ok = false; }
        if (rule.maxFn && value > rule.maxFn(customer.age)) { setFieldError(element, `Tối đa ${rule.maxFn(customer.age)}`); ok = false; }
    });

    // Check Extra Premium
    if (rules.extraPremium && productInfo.extraPremium > 0 && fees.baseMain > 0) {
        if (productInfo.extraPremium > rules.extraPremium.maxFactorOfBase * fees.baseMain) {
            setFieldError(document.getElementById('extra-premium-input'), `Tối đa ${rules.extraPremium.maxFactorOfBase} lần phí chính`);
            ok = false;
        }
    }
    
    // Check ABUV Term
    if (productKey === 'AN_BINH_UU_VIET') {
        const abuvTermEl = document.getElementById('abuv-term');
        if (!abuvTermEl.value) { setFieldError(abuvTermEl, 'Vui lòng chọn'); ok = false; }
    }

    validateTargetAge(customer, productInfo); // Keep this validation

    return ok;
}

function validateSupplementaryProduct(person, prodId, mainPremium, totalHospitalSupportStbh) {
    const config = PRODUCT_CATALOG[prodId];
    if (!config) return true;
    const supplementData = person.supplements[prodId];
    if (!supplementData) return true;
    const stbh = supplementData.stbh;
    const suppContainer = person.isMain ? document.getElementById('main-supp-container') : person.container;
    const section = suppContainer.querySelector(`.${prodId}-section`);
    const input = section.querySelector(`.${prodId}-stbh`);
    if (!input) return true;

    const rule = config.rules.stbh;
    if (!rule) return true;
    
    let ok = true;
    if (stbh > 0) {
        if (rule.min && stbh < rule.min) { setFieldError(input, `Tối thiểu ${formatCurrency(rule.min)}`); ok = false; }
        if (rule.max && stbh > rule.max) { setFieldError(input, `Tối đa ${formatCurrency(rule.max)}`); ok = false; }
    }

    if (rule.special === 'HOSPITAL_SUPPORT_MAX_BY_MAIN_PREMIUM') {
        const validationEl = section.querySelector('.hospital-support-validation');
        const maxSupportTotal = Math.floor(mainPremium / 4000000) * 100000;
        const maxByAge = person.age >= 18 ? rule.maxByAge.from18 : rule.maxByAge.under18;
        const remaining = maxSupportTotal - totalHospitalSupportStbh;
        if (validationEl) validationEl.textContent = `Tối đa: ${formatCurrency(Math.min(maxByAge, remaining), 'đ/ngày')}. Bội số của ${formatCurrency(rule.multipleOf)}.`;

        if (stbh % rule.multipleOf !== 0) { setFieldError(input, `Là bội số của ${formatCurrency(rule.multipleOf)}`); ok = false; } 
        else if (stbh > maxByAge || stbh > remaining) { setFieldError(input, 'Vượt quá giới hạn cho phép'); ok = false; }
    }
    
    return ok;
}
function validateTargetAge(mainPerson, mainProductInfo) {
    const input = document.getElementById('target-age-input');
    if (!input) return true;
    
    const productConfig = PRODUCT_CATALOG[mainProductInfo.key];
    if (!productConfig || !productConfig.investment) {
        if (!document.getElementById('target-age-block').classList.contains('hidden')) {
            document.getElementById('target-age-block').classList.add('hidden');
        }
        return true;
    }
    document.getElementById('target-age-block').classList.remove('hidden');

    if (input.disabled) { clearFieldError(input); return true; }
    const val = parseInt((input.value || '').trim(), 10);
    const age = mainPerson?.age || 0;
    
    let term = 0;
    if (productConfig.rules.paymentTerm?.fixed) {
        term = productConfig.rules.paymentTerm.fixed;
    } else if (mainProductInfo.key === 'AN_BINH_UU_VIET') {
        term = parseInt(document.getElementById('abuv-term')?.value, 10) || 0;
    } else {
        term = mainProductInfo.paymentTerm;
    }

    if (!age || !term) { clearFieldError(input); return true; }
    const minAllowed = age + term - 1;
    const maxAllowed = 99;
    if (!val || val < minAllowed || val > maxAllowed) { setFieldError(input, `Tuổi minh họa phải từ ${minAllowed} đến ${maxAllowed}`); return false; }
    
    return true;
}

function validateDobField(input) {
    if (!input) return false;
    const v = (input.value || '').trim();
    if (!v) {
        setFieldError(input, 'Vui lòng nhập ngày sinh'); return false;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(v)) { setFieldError(input, 'Nhập DD/MM/YYYY'); return false; }
    const [dd, mm, yyyy] = v.split('/').map(n => parseInt(n, 10));
    const d = new Date(yyyy, mm - 1, dd);
    if (!(d.getFullYear() === yyyy && d.getMonth() === (mm - 1) && d.getDate() === dd && d <= CONFIG.REFERENCE_DATE)) {
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
    if (!message) err.remove();
}

function clearFieldError(input) { setFieldError(input, ''); }

function clearAllErrors() { 
    document.querySelectorAll('.field-error').forEach(el => el.remove());
    document.querySelectorAll('.border-red-500').forEach(el => el.classList.remove('border-red-500'));
    document.getElementById('error-message').textContent = '';
}
function checkEligibility(customer, eligibilityRules) {
    if (!eligibilityRules || eligibilityRules.length === 0) return true;
    return eligibilityRules.every(rule => {
        if (rule.condition && !rule.condition(customer)) return true; // Rule doesn't apply
        switch (rule.type) {
            case 'age':
                return (!rule.min || customer.age >= rule.min) && (!rule.max || customer.age <= rule.max);
            case 'daysFromBirth':
                return (!rule.min || customer.daysFromBirth >= rule.min) && (!rule.max || customer.daysFromBirth <= rule.max);
            case 'riskGroup':
                if (rule.required && (customer.riskGroup === 0 || !customer.riskGroup)) return false;
                return !rule.exclude?.includes(customer.riskGroup);
            default:
                return true;
        }
    });
}
// ===================================================================================
// ===== MODULE: INITIALIZATION & EVENT BINDING - Refactored
// ===================================================================================

document.addEventListener('DOMContentLoaded', () => {
    populateMainProductSelect();
    initState();
    initPerson(appState.mainPerson.container, true);
    initSupplementaryButton();
    initSummaryModal();
    attachGlobalListeners();
    updateSupplementaryAddButtonState(false);
    runWorkflow();
    if (window.MDP3) MDP3.init();
    if (window.renderSection6V2) window.renderSection6V2();
});

function populateMainProductSelect() {
    const select = document.getElementById('main-product');
    if (!select) return;
    Object.entries(PRODUCT_CATALOG).forEach(([key, product]) => {
        if (product.type === 'main') {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = product.name;
            select.appendChild(option);
        }
    });
}

function runWorkflow() {
  updateStateFromUI();
  const isMainProductValid = runAllValidations(appState);
  const calculatedFees = performCalculations(appState);
  appState.fees = calculatedFees;
  renderUI(isMainProductValid);
  try { renderSuppList(); } catch(e) {}
}

const runWorkflowDebounced = debounce(runWorkflow, 40);

function attachGlobalListeners() {
    document.body.addEventListener('change', (e) => {
        hideGlobalErrors();
        if (e.target.id === 'main-product') {
            lastRenderedProductKey = null;
            const productConfig = PRODUCT_CATALOG[e.target.value];
            if (productConfig?.rules?.noSupplementaryInsured) {
                appState.supplementaryPersons = [];
                document.getElementById('supplementary-insured-container').innerHTML = '';
                if (appState.mainPerson) appState.mainPerson.supplements = {};
                document.querySelector('#main-supp-container .supplementary-products-container')
                    .querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                if (window.MDP3) MDP3.reset();
            }
        }
        runWorkflow();
    });

    document.body.addEventListener('input', (e) => {
        hideGlobalErrors();
        const target = e.target;
        if (target.matches('input[type="text"]') && !['dob-input', 'name-input', 'occupation-input'].some(cls => target.classList.contains(cls))) {
            formatNumberInput(target);
        }
        runWorkflowDebounced();
    });

    document.body.addEventListener('focusout', (e) => {
        hideGlobalErrors();
        const target = e.target;
        if (target.matches('input[type="text"]')) {
            roundInputToThousand(target);
            if (target.classList.contains('dob-input')) {
                runWorkflow(); // Run full workflow after DOB validation
            }
        }
    }, true);
}

function initPerson(container, isMain = false) {
    if (!container) return;

    initDateFormatter(container.querySelector('.dob-input'));
    initOccupationAutocomplete(container.querySelector('.occupation-input'), container);

    if (!isMain && window.MDP3?.updateOptions) {
        const debouncedUpdate = debounce(window.MDP3.updateOptions, 300);
        container.querySelector('.name-input')?.addEventListener('input', debouncedUpdate);
        container.querySelector('.dob-input')?.addEventListener('focusout', debouncedUpdate);
    }
    
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
            if (window.MDP3) MDP3.updateOptions();
            runWorkflow();
        });
        
        initPerson(newPersonDiv, false);
        if (window.MDP3) MDP3.updateOptions();
        runWorkflow();
    });
}

function generateSupplementaryPersonHtml(personId, count) {
  return `
    <button class="w-full text-right text-sm text-red-600 font-semibold remove-supp-btn">Xóa NĐBH này</button>
    <h3 class="text-lg font-bold text-gray-700 mb-2 border-t pt-4">NĐBH Bổ Sung ${count}</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div><label for="name-${personId}" class="font-medium text-gray-700 block mb-1">Họ và Tên</label><input type="text" id="name-${personId}" class="form-input name-input" placeholder="Trần Thị B"></div>
      <div><label for="dob-${personId}" class="font-medium text-gray-700 block mb-1">Ngày sinh</label><input type="text" id="dob-${personId}" class="form-input dob-input" placeholder="DD/MM/YYYY"></div>
      <div><label for="gender-${personId}" class="font-medium text-gray-700 block mb-1">Giới tính</label><select id="gender-${personId}" class="form-select gender-select"><option value="Nam">Nam</option><option value="Nữ">Nữ</option></select></div>
      <div class="flex items-end"><p class="text-lg">Tuổi: <span class="font-bold text-aia-red age-span">0</span></p></div>
      <div class="relative"><label for="occupation-input-${personId}" class="font-medium text-gray-700 block mb-1">Nghề nghiệp</label><input type="text" id="occupation-input-${personId}" class="form-input occupation-input" placeholder="Gõ để tìm nghề nghiệp..."><div class="occupation-autocomplete absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 hidden max-h-60 overflow-y-auto"></div></div>
      <div class="flex items-end"><p class="text-lg">Nhóm nghề: <span class="font-bold text-aia-red risk-group-span">...</span></p></div>
    </div>
    <div class="mt-4"><h4 class="text-md font-semibold text-gray-800 mb-2">Sản phẩm bổ sung cho người này</h4><div class="supplementary-products-container space-y-6"></div></div>`;
}

function updateSupplementaryAddButtonState(isMainProductValid) {
    const btn = document.getElementById('add-supp-insured-btn');
    if (!btn) return;
    const mainProductKey = document.getElementById('main-product')?.value || '';
    const mainProductConfig = PRODUCT_CATALOG[mainProductKey];
    const count = document.querySelectorAll('#supplementary-insured-container .person-container').length;
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;
    const disabled = noSuppInsured || (count >= CONFIG.MAX_SUPPLEMENTARY_INSURED) || !isMainProductValid;
    btn.disabled = disabled;
    btn.classList.toggle('opacity-50', disabled);
    btn.classList.toggle('cursor-not-allowed', disabled);
    btn.classList.toggle('hidden', noSuppInsured);
}

function generateSupplementaryProductsHtml() {
    return Object.entries(PRODUCT_CATALOG).map(([prodKey, prod]) => {
        if (prod.type !== 'rider') return '';

        let optionsHtml = '';
        if (prodKey === 'health_scl') {
            optionsHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div><label class="font-medium text-gray-700 block mb-1">Quyền lợi chính</label><select class="form-select health-scl-program"><option value="co_ban">Cơ bản</option><option value="nang_cao" selected>Nâng cao</option><option value="toan_dien">Toàn diện</option><option value="hoan_hao">Hoàn hảo</option></select></div>    
              <div><label class="font-medium text-gray-700 block mb-1">Phạm vi địa lý</label><select class="form-select health-scl-scope"><option value="main_vn">Việt Nam</option><option value="main_global">Nước ngoài</option></select></div>
            </div>
            <div><span class="font-medium text-gray-700 block mb-2">Quyền lợi tùy chọn:</span><div class="space-y-2">
                <label class="flex items-center space-x-3 cursor-pointer"><input type="checkbox" class="form-checkbox health-scl-outpatient"><span>Điều trị ngoại trú</span><span class="scl-outpatient-fee ml-2 text-xs text-gray-600"></span></label>
                <label class="flex items-center space-x-3 cursor-pointer"><input type="checkbox" class="form-checkbox health-scl-dental"><span>Chăm sóc nha khoa</span><span class="scl-dental-fee ml-2 text-xs text-gray-600"></span></label>
            </div></div>`;
        } else {
            optionsHtml = `<div><label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label><input type="text" class="form-input ${prodKey}-stbh" placeholder="Nhập STBH"></div><p class="hospital-support-validation text-sm text-gray-500 mt-1"></p>`;
        }
        return `<div class="product-section ${prodKey}-section hidden"><label class="flex items-center space-x-3 cursor-pointer"><input type="checkbox" class="form-checkbox ${prodKey}-checkbox"><span class="text-lg font-medium text-gray-800">${prod.name}</span></label><div class="product-options hidden mt-3 pl-8 space-y-3 border-l-2 border-gray-200">${optionsHtml}<p class="text-xs text-red-600 main-premium-threshold-msg hidden"></p><div class="text-right font-semibold text-aia-red fee-display min-h-[1.5rem]"></div></div></div>`;
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
    autocompleteContainer.classList.add('hidden');
    runWorkflow();
  };

  const renderList = (filtered) => {
    autocompleteContainer.innerHTML = '';
    if (filtered.length === 0) { autocompleteContainer.classList.add('hidden'); return; }
    filtered.forEach(occ => {
      const item = document.createElement('div');
      item.className = 'p-2 cursor-pointer hover:bg-gray-100';
      item.textContent = occ.name;
      item.addEventListener('mousedown', (ev) => { ev.preventDefault(); applyOccupation(occ); });
      autocompleteContainer.appendChild(item);
    });
    autocompleteContainer.classList.remove('hidden');
  };

  input.addEventListener('input', () => {
    const value = input.value.trim().toLowerCase();
    input.dataset.group = '';
    if(riskGroupSpan) riskGroupSpan.textContent = '...';
    if (value.length < 2) { autocompleteContainer.classList.add('hidden'); return; }
    const filtered = product_data.occupations.filter(o => o.group > 0 && o.name.toLowerCase().includes(value));
    renderList(filtered);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      autocompleteContainer.classList.add('hidden');
      if (!product_data.occupations.some(o => o.name.toLowerCase() === input.value.trim().toLowerCase())) {
        input.dataset.group = '';
        if(riskGroupSpan) riskGroupSpan.textContent = '...';
      }
      runWorkflow();
    }, 200);
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
  if (!input || ['dob-input', 'occupation-input', 'name-input', 'payment-term'].some(cls => input.classList.contains(cls) || input.id === cls)) return;
  const raw = parseFormattedNumber(input.value || '');
  if (!raw) { input.value = ''; return; }
  const isHospitalDaily = input.classList.contains('hospital_support-stbh');
  if (isHospitalDaily) {
      input.value = formatCurrency(Math.round(raw / 100000) * 100000);
  } else {
      input.value = formatCurrency(roundDownTo1000(raw));
  }
}

function formatNumberInput(input) {
  if (!input || !input.value) return;
  const cursorPosition = input.selectionStart;
  const originalLength = input.value.length;
  let value = input.value.replace(/[.,\s]/g, '');
  
  if (!/^\d+$/.test(value)) {
    value = value.replace(/\D/g, '');
  }
  
  if (value) {
    const num = parseInt(value, 10);
    input.value = num.toLocaleString('vi-VN');
    const newLength = input.value.length;
    const newCursorPosition = cursorPosition + (newLength - originalLength);
    input.setSelectionRange(newCursorPosition, newCursorPosition);
  } else {
    input.value = '';
  }
}

function initSummaryModal() {
  const modal = document.getElementById('summary-modal');
  document.getElementById('close-summary-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  updateTargetAge();
  document.getElementById('main-product').addEventListener('change', updateTargetAge);
  document.querySelector('#main-person-container .dob-input')?.addEventListener('input', updateTargetAge);
}
function updateTargetAge() {
    const mainPersonInfo = collectPersonData(document.getElementById('main-person-container'), true);
    const mainProductKey = document.getElementById('main-product')?.value;
    const productConfig = PRODUCT_CATALOG[mainProductKey];
    const targetAgeInput = document.getElementById('target-age-input');
    const targetAgeBlock = document.getElementById('target-age-block');
    
    if (!productConfig || !productConfig.investment) {
        targetAgeBlock.classList.add('hidden');
        return;
    }
    targetAgeBlock.classList.remove('hidden');

    if (!targetAgeInput || !mainPersonInfo || typeof mainPersonInfo.age !== 'number' || mainPersonInfo.age < 0) return;

    const labelEl = document.querySelector('label[for="target-age-input"]');
    const hintEl  = document.getElementById('target-age-hint');

    let term = 0;
    if (productConfig.rules.paymentTerm?.fixed) term = productConfig.rules.paymentTerm.fixed;
    else if (mainProductKey === 'AN_BINH_UU_VIET') term = parseInt(document.getElementById('abuv-term')?.value, 10) || 0;
    else term = parseInt(document.getElementById('payment-term')?.value, 10) || 0;

    if (term > 0) {
        const minAge = mainPersonInfo.age + term - 1;
        const maxAge = 99; 
        targetAgeInput.min = String(minAge);
        targetAgeInput.max = String(maxAge);
        if (hintEl) hintEl.innerHTML = `Khoảng hợp lệ: <strong>${minAge}</strong> – <strong>${maxAge}</strong>.`;
        
        const curVal = parseInt(targetAgeInput.value || '0', 10);
        if (!curVal || curVal < minAge || curVal > maxAge) {
            targetAgeInput.value = maxAge;
        }
    } else {
         if (hintEl) hintEl.textContent = 'Nhập thời gian đóng phí để xác định tuổi minh họa.';
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

function setPaymentTermHint(mainProductKey, age) {
  const hintEl = document.getElementById('payment-term-hint');
  const productConfig = PRODUCT_CATALOG[mainProductKey];
  if (!hintEl || !productConfig || !productConfig.rules.paymentTerm) return;
  const rule = productConfig.rules.paymentTerm;
  if (rule.fixed) {
      hintEl.textContent = `Thời gian đóng phí cố định ${rule.fixed} năm.`;
      return;
  }
  const min = rule.min;
  const max = rule.maxFn ? rule.maxFn(age) : 100;
  hintEl.textContent = `Nhập từ ${min} đến ${max} năm`;
}

function hideGlobalErrors() {
    const box = document.getElementById('global-error-box');
    if (box) box.classList.add('hidden');
}

// Giữ lại các module phức tạp như MDP3 và các hàm helper gốc không thay đổi
// ... (Dán lại toàn bộ module MDP3 và các hàm helper gốc ở đây)
window.MDP3 = (function () {
    let selectedId = null;
    let lastSelectedId = null;

    function init() {
        renderSection();
        attachListeners();
    }

    function reset() {
        selectedId = null;
        lastSelectedId = null;
        const enableCb = document.getElementById('mdp3-enable');
        if (enableCb) enableCb.checked = false;
        const selContainer = document.getElementById('mdp3-select-container');
        if (selContainer) selContainer.innerHTML = '';
        const feeEl = document.getElementById('mdp3-fee-display');
        if (feeEl) feeEl.textContent = '';
    }

    function updateOptions() {
        if (!isEnabled()) return;
    
        const selEl = document.getElementById('mdp3-person-select');
        if (!selEl) return;
    
        const currentSelectedId = selectedId;
    
        let optionsHtml = `<option value="">-- Chọn người --</option>`;
        document.querySelectorAll('#supplementary-insured-container .person-container').forEach(cont => {
            const info = collectPersonData(cont, false);
            let label = info.name || 'NĐBH bổ sung';
            label += ` (tuổi ${info.age || "?"})`;
            let disabled = '';
            if (!info.age || info.age < 18 || info.age > 60) {
                label += !info.age ? ' - Chưa đủ thông tin' : ' - Không đủ điều kiện';
                disabled = 'disabled';
            }
            optionsHtml += `<option value="${cont.id}" ${disabled}>${label}</option>`;
        });
        optionsHtml += `<option value="other">Người khác</option>`;
        
        selEl.innerHTML = optionsHtml;
    
        const opt = selEl.querySelector(`option[value="${currentSelectedId}"]`);
        if (opt && !opt.disabled) {
            selEl.value = currentSelectedId;
        } else {
            selEl.value = "";
            selectedId = null;
            if (currentSelectedId !== 'other') {
               document.getElementById('mdp3-other-form')?.classList.add('hidden');
            }
        }
    }
    
    function isEnabled() {
        return document.getElementById('mdp3-enable')?.checked || false;
    }
    
    function renderSection() {
        const sec = document.getElementById('mdp3-section');
        if (!sec) return;
        const mainProductConfig = PRODUCT_CATALOG[document.getElementById('main-product').value];
        const isHidden = mainProductConfig?.rules.noSupplementaryInsured;
        sec.classList.toggle('hidden', !!isHidden);
        if (isHidden) reset();
    }

    function renderSelect() {
        const selectContainer = document.getElementById('mdp3-select-container');
        if (!selectContainer) return;
        let html = `<select id="mdp3-person-select" class="form-select w-full mb-3"><option value="">-- Chọn người --</option>`;
        // ... (phần tạo options giống hệt updateOptions)
        html += `</select><div id="mdp3-other-form" class="hidden mt-4 p-3 border rounded bg-gray-50"></div>`;
        selectContainer.innerHTML = html;
        updateOptions(); // Gọi update để điền options
    }

    function attachListeners() {
        document.getElementById('main-product').addEventListener('change', renderSection);
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
                                    otherForm.querySelector('.supplementary-products-container')?.parentElement.remove();
                                }
                            }
                        }
                    }
                } else {
                    document.getElementById('mdp3-select-container').innerHTML = '';
                    selectedId = null;
                }
                 runWorkflow();
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
                         otherForm.querySelector('.supplementary-products-container')?.parentElement.remove();
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
        if (!isEnabled() || !selectedId || !window.personFees) {
            if(feeEl) feeEl.textContent = '';
            return 0;
        }
        let stbhBase = 0;
        const feesModel = appState.fees;
        
        for (let pid in window.personFees) {
            if (pid === 'mdp3_other') continue;
            const pf = window.personFees[pid];
            const mdp3Part = feesModel?.byPerson?.[pid]?.suppDetails?.mdp3 || 0;
            const suppNet = (pf.supp || 0) - mdp3Part;
            stbhBase += (pf.mainBase || 0) + Math.max(0, suppNet);
        }
        
        if (selectedId && selectedId !== 'other' && window.personFees[selectedId]) {
            const mdp3Part = feesModel?.byPerson?.[selectedId]?.suppDetails?.mdp3 || 0;
            const suppNet = (window.personFees[selectedId].supp || 0) - mdp3Part;
            stbhBase -= Math.max(0, suppNet);
        }
        
        stbhBase = Math.max(0, stbhBase);

        let age, gender;
        if (selectedId === 'other') {
            const form = document.getElementById('person-container-mdp3-other');
            if (!form) return 0;
            const info = collectPersonData(form, false);
            form.querySelector('.age-span').textContent = info.age || 0;
            if (!info.age || info.age < 18 || info.age > 60) {
                 if (feeEl) feeEl.textContent = 'STBH: — | Phí: —';
                 return 0;
            }
            age = info.age;
            gender = info.gender;
        } else {
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
        if (feeEl) feeEl.textContent = premium > 0 ? `STBH: ${formatCurrency(stbhBase)} | Phí: ${formatCurrency(premium)}` : `STBH: ${formatCurrency(stbhBase)} | Phí: —`;
        return premium;
    }
    
    function generateSupplementaryPersonHtmlForMdp3() {
      return `
        <h3 class="text-lg font-bold text-gray-700 mb-2 border-t pt-4">Người được miễn đóng phí</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label class="font-medium text-gray-700 block mb-1">Họ và Tên</label><input type="text" class="form-input name-input"></div>
          <div><label class="font-medium text-gray-700 block mb-1">Ngày sinh</label><input type="text" class="form-input dob-input" placeholder="DD/MM/YYYY"></div>
          <div><label class="font-medium text-gray-700 block mb-1">Giới tính</label><select class="form-select gender-select"><option value="Nam">Nam</option><option value="Nữ">Nữ</option></select></div>
          <div class="flex items-end"><p class="text-lg">Tuổi: <span class="font-bold text-aia-red age-span">0</span></p></div>
        </div>`;
    }

    return { init, isEnabled, getSelectedId: () => selectedId, getPremium, reset, updateOptions };
})();

function getProductLabel(key) {
  return PRODUCT_CATALOG[key]?.name || key || '';
}

function getHealthSclStbhByProgram(program) {
    const map = { co_ban: 100000000, nang_cao: 250000000, toan_dien: 500000000, hoan_hao: 1000000000 };
    return map[program] || 0;
}
