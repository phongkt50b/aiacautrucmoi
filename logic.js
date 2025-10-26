

import { GLOBAL_CONFIG, PRODUCT_CATALOG, product_data, investment_data, BENEFIT_MATRIX_SCHEMAS, BM_SCL_PROGRAMS } from './data.js';

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
            options: {}, // Store values from dynamic selects like abuv-term
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

// ===================================================================================
// ===== MODULE: DATA COLLECTION (Reading from DOM into State)
// ===================================================================================

function updateStateFromUI() {
    const mainProductKey = document.getElementById('main-product')?.value || '';
    const mainProductConfig = PRODUCT_CATALOG[mainProductKey];

    appState.mainProduct.key = mainProductKey;
    appState.mainProduct.stbh = parseFormattedNumber(document.getElementById('main-stbh')?.value);
    appState.mainProduct.premium = parseFormattedNumber(document.getElementById('main-premium')?.value);
    appState.mainProduct.paymentTerm = parseInt(document.getElementById('payment-term')?.value, 10) || 0;
    appState.mainProduct.extraPremium = parseFormattedNumber(document.getElementById('extra-premium')?.value);
    
    // Collect dynamic options
    appState.mainProduct.options = {};
    if (mainProductConfig?.ui?.options) {
        for (const optionKey in mainProductConfig.ui.options) {
            const optionConfig = mainProductConfig.ui.options[optionKey];
            const el = document.getElementById(optionConfig.id);
            if (el) {
                appState.mainProduct.options[optionKey] = el.value;
            }
        }
    }
    
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
        if (birthDate.getFullYear() === yyyy && birthDate.getMonth() === mm - 1 && birthDate.getDate() === dd && birthDate <= GLOBAL_CONFIG.REFERENCE_DATE) {
            daysFromBirth = Math.floor((GLOBAL_CONFIG.REFERENCE_DATE - birthDate) / (1000 * 60 * 60 * 24));
            age = GLOBAL_CONFIG.REFERENCE_DATE.getFullYear() - birthDate.getFullYear();
            const m = GLOBAL_CONFIG.REFERENCE_DATE.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && GLOBAL_CONFIG.REFERENCE_DATE.getDate() < birthDate.getDate())) {
                age--;
            }
        }
    }

    const supplementsContainer = isMain 
        ? document.querySelector('#main-supp-container .supplementary-products-container')
        : container.querySelector('.supplementary-products-container');
    
    const supplements = {};
    if (supplementsContainer) {
        Object.keys(PRODUCT_CATALOG).forEach(prodId => {
            if (PRODUCT_CATALOG[prodId].type !== 'rider') return;
            const section = supplementsContainer.querySelector(`.${prodId}-section`);
            if (section && section.querySelector(`.${prodId}-checkbox`)?.checked) {
                supplements[prodId] = {
                    stbh: parseFormattedNumber(section.querySelector(`.${prodId}-stbh`)?.value),
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
        Object.keys(person.supplements).forEach(prodId => {
            const prodConfig = PRODUCT_CATALOG[prodId];
            if (!prodConfig) return;

            const fee = calculateRiderPremium(prodId, person, fees.baseMain, totalHospitalSupportStbh);
            personSuppFee += fee;
            fees.byPerson[person.id].suppDetails[prodId] = fee;
            if (prodId === 'hospital_support') {
                totalHospitalSupportStbh += person.supplements[prodId].stbh;
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
        const mdpEnabled = !!(window.MDP3 && MDP3.isEnabled && MDP3.isEnabled());
        const mdpTargetId = mdpEnabled ? (MDP3.getSelectedId && MDP3.getSelectedId()) : null;
        const mdp3Fee = (mdpEnabled && window.MDP3 && MDP3.getPremium) ? MDP3.getPremium() : 0;

        if (mdpEnabled && mdp3Fee > 0) {
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

function calculateMainPremium(customer, productInfo) {
    const { key: productKey, stbh, premium: enteredPremium, options } = productInfo;
    const productConfig = PRODUCT_CATALOG[productKey];

    if (!productConfig) return 0;
    
    // Handle Packages
    if (productConfig.group === 'PACKAGE') {
        const underlyingKey = productConfig.packageConfig.underlyingMainProduct;
        const underlyingConfig = PRODUCT_CATALOG[underlyingKey];
        if (!underlyingConfig) return 0;
        
        const packageInfo = {
            key: underlyingKey,
            stbh: productConfig.packageConfig.fixedValues.stbh,
            premium: 0, // Not from input
            options: { ...options, paymentTerm: productConfig.packageConfig.fixedValues.paymentTerm }
        };
        return calculateMainPremium(customer, packageInfo);
    }

    const calcConfig = productConfig.calculation;
    let premium = 0;

    switch (calcConfig.method) {
        case 'fromInput':
            premium = enteredPremium;
            break;

        case 'ratePer1000Stbh':
        case 'ratePer1000StbhWithTerm':
            if (stbh === 0) return 0;
            const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
            let rate = 0;
            let rateTable = product_data;
            const path = calcConfig.rateTableRef.split('.');
            path.forEach(p => rateTable = rateTable ? rateTable[p] : undefined);
            
            if (calcConfig.method === 'ratePer1000StbhWithTerm') {
                const termValue = options.paymentTerm;
                if (!termValue) return 0;
                rateTable = rateTable ? rateTable[termValue] : undefined;
            }

            if (rateTable) {
                rate = rateTable.find(r => r.age === customer.age)?.[genderKey] || 0;
            }
            premium = Math.round((stbh / 1000) * rate);
            break;

        case 'none':
            return 0;
    }

    return roundDownTo1000(premium);
}

function calculateRiderPremium(prodId, customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const prodConfig = PRODUCT_CATALOG[prodId];
    if (!prodConfig) return 0;

    if (prodConfig.calculation.method === 'custom') {
        const func = window[prodConfig.calculation.functionName];
        if (typeof func === 'function') {
            return func(prodConfig, customer, mainPremium, totalHospitalSupportStbh, ageOverride);
        }
    }
    return 0;
}

function calculateHealthSclPremium(prodConfig, customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const ageToUse = ageOverride ?? customer.age;
    const renewalMax = prodConfig.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
    if (ageToUse > renewalMax) return 0;

    const { program, scope, outpatient, dental } = customer?.supplements?.health_scl || {};
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
  } catch(e){
    return { base:0, outpatient:0, dental:0, total:0 };
  }
}

function calculateSimpleRiderPremium(prodConfig, customer, rateFinder, divisor, ageOverride = null) {
    const ageToUse = ageOverride ?? customer.age;
    const renewalMax = prodConfig.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
    if (ageToUse > renewalMax) return 0;

    const { stbh } = customer.supplements[prodConfig.id] || {};
    if (!stbh) return 0;

    const rate = rateFinder(customer, ageToUse);
    if (!rate) return 0;

    const premiumRaw = (stbh / divisor) * rate;
    return roundDownTo1000(premiumRaw);
}

function calculateBhnPremium(prodConfig, customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const rateFinder = (cust, age) => product_data.bhn_rates
        .find(r => age >= r.ageMin && age <= r.ageMax)?.[cust.gender === 'Nữ' ? 'nu' : 'nam'] || 0;
    return calculateSimpleRiderPremium(prodConfig, customer, rateFinder, 1000, ageOverride);
}

function calculateAccidentPremium(prodConfig, customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const rateFinder = (cust) => {
        if (cust.riskGroup === 0 || cust.riskGroup > 4) return 0;
        return product_data.accident_rates[cust.riskGroup] || 0;
    };
    return calculateSimpleRiderPremium(prodConfig, customer, rateFinder, 1000, ageOverride);
}

function calculateHospitalSupportPremium(prodConfig, customer, mainPremium, totalHospitalSupportStbh, ageOverride = null) {
    const rateFinder = (cust, age) => product_data.hospital_fee_support_rates
        .find(r => age >= r.ageMin && age <= r.ageMax)?.rate || 0;
    return calculateSimpleRiderPremium(prodConfig, customer, rateFinder, 100, ageOverride);
}
// Dán hàm mới này vào logic.js
function calculateAccountValueProjection(mainPerson, mainProduct, basePremium, extraPremium, targetAge, customInterestRate, paymentFrequency) {
    const { gender, age: initialAge } = mainPerson;
    const { key: productKey, stbh: stbhInitial = 0, paymentTerm } = mainProduct;
    
    const { 
        pul_cost_of_insurance_rates, 
        mul_cost_of_insurance_rates, 
        initial_fees, 
        guaranteed_interest_rates, 
        admin_fees, 
        persistency_bonus 
    } = investment_data;

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
    
    // --- BẮT ĐẦU PHẦN SỬA ---

    // 1. Xác định số kỳ đóng phí trong một năm
    let periods = 1;
    if (paymentFrequency === 'half') periods = 2;
    if (paymentFrequency === 'quarter') periods = 4;

    // 2. Tính toán phí cho mỗi kỳ (dựa trên phí năm)
    const annualBasePremium = Number(basePremium || 0);
    const annualExtraPremium = Number(extraPremium || 0);
    const basePremiumPerPeriod = periods > 1 ? roundDownTo1000(annualBasePremium / periods) : annualBasePremium;
    const extraPremiumPerPeriod = periods > 1 ? roundDownTo1000(annualExtraPremium / periods) : annualExtraPremium;

    // --- KẾT THÚC PHẦN SỬA ---

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

    const productConfig = PRODUCT_CATALOG[productKey];
    const isMulProduct = productConfig?.group === 'MUL';

    for (let month = 1; month <= totalMonths; month++) {
        const policyYear = Math.floor((month - 1) / 12) + 1;
        const attainedAge = initialAge + policyYear - 1;
        const genderKey = (gender === 'Nữ' || gender === 'Nu' || gender === 'nu') ? 'nu' : 'nam';
        const calendarYear = getCalendarYearFromStart(month);
        
        // --- BẮT ĐẦU PHẦN SỬA ---

        // 3. Kiểm tra xem tháng hiện tại có phải là tháng đóng phí không
        let isPaymentMonth = false;
        const monthInYear = ((month - 1) % 12) + 1; // Lấy tháng trong năm (từ 1 đến 12)

        if (periods === 1 && monthInYear === 1) isPaymentMonth = true;
        if (periods === 2 && (monthInYear === 1 || monthInYear === 7)) isPaymentMonth = true;
        if (periods === 4 && (monthInYear === 1 || monthInYear === 4 || monthInYear === 7 || monthInYear === 10)) isPaymentMonth = true;

        // --- KẾT THÚC PHẦN SỬA ---

        for (const key in scenarios) {
            let currentAccountValue = scenarios[key].accountValue || 0;
            let premiumIn = 0;
            let initialFee = 0;
            
            // --- BẮT ĐẦU PHẦN SỬA ---

            // 4. Áp dụng phí và khấu trừ nếu đúng tháng đóng phí
            if (isPaymentMonth && policyYear <= paymentTerm) {
                if (isMulProduct) {
                    premiumIn = basePremiumPerPeriod;
                    const initialFeeRateBase = ((initial_fees && initial_fees[productKey]) || {})[policyYear] || 0;
                    // Áp dụng tỷ lệ phí ban đầu cho phí của kỳ này
                    initialFee = roundVND(premiumIn * Number(initialFeeRateBase || 0));
                } else {
                    premiumIn = basePremiumPerPeriod + extraPremiumPerPeriod;
                    const initialFeeRateBase = ((initial_fees && initial_fees[productKey]) || {})[policyYear] || 0;
                    const extraInitRate = (initial_fees && initial_fees.EXTRA) ? initial_fees.EXTRA : 0;
                    initialFee = roundVND((basePremiumPerPeriod * Number(initialFeeRateBase || 0)) +
                                          (extraPremiumPerPeriod * Number(extraInitRate || 0)));
                }
            }

            // --- KẾT THÚC PHẦN SỬA ---

            const investmentAmount = currentAccountValue + premiumIn - initialFee;
            const adminFee = getAdminFeeForYear(calendarYear);
            const stbhCurrent = getStbhForPolicyYear(policyYear);
            const riskRates = isMulProduct ? (mul_cost_of_insurance_rates || []) : (pul_cost_of_insurance_rates || []);
            const riskRateRecord = riskRates.find(r => Number(r.age) === Number(attainedAge));
            const riskRate = riskRateRecord ? (riskRateRecord[genderKey] || 0) : 0;
            const sumAtRisk = Math.max(0, stbhCurrent - investmentAmount);

            let costOfInsurance = (sumAtRisk * riskRate) / 1000 / 12;
            costOfInsurance = roundVND(costOfInsurance);

            const netInvestmentAmount = investmentAmount - adminFee - costOfInsurance;

            let guaranteedRateRaw = (guaranteed_interest_rates && (guaranteed_interest_rates[policyYear] !== undefined))
                ? guaranteed_interest_rates[policyYear]
                : (guaranteed_interest_rates && guaranteed_interest_rates.default ? guaranteed_interest_rates.default : 0);
            let guaranteedRate = Number(guaranteedRateRaw) || 0;
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
            const bonusInfo = (persistency_bonus || []).find(b => b.year === policyYear);
            
            // Logic thưởng duy trì vẫn dựa trên tháng cuối cùng của năm hợp đồng (tháng 12, 24, 36...)
            const isLastMonthOfPolicyYear = (month % 12 === 0);

            if (isMulProduct) {
                if (policyYear >= 5 && policyYear <= paymentTerm && isLastMonthOfPolicyYear) {
                    bonus = annualBasePremium * 0.03; // Thưởng dựa trên phí năm
                }
            } else {
                if (bonusInfo && isLastMonthOfPolicyYear) {
                    const bonusYear = bonusInfo.year;
                    if ( (bonusYear === 10 && paymentTerm >= 10) ||
                         (bonusYear === 20 && paymentTerm >= 20) ||
                         (bonusYear === 30 && paymentTerm >= 30) ) {
                        bonus = annualBasePremium * bonusInfo.rate; // Thưởng dựa trên phí năm
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
/**
 * Checks eligibility for PUL products based on STBH and premium.
 * @param {number} stbh - The sum assured for the main product.
 * @param {number} premium - The calculated base premium for the main product.
 * @returns {object} An object with validation status and reasons.
 */
function getPulEligibilityState(stbh, premium) {
    const { MAIN_PRODUCT_MIN_STBH, PUL_MIN_STBH_OR, PUL_MIN_PREMIUM_OR, MAIN_PRODUCT_MIN_PREMIUM } = GLOBAL_CONFIG;

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
        result.stbhReason = `Phí tối thiểu: ${PUL_MIN_PREMIUM_OR.toLocaleString('vi-VN')} hoặc STBH từ ${PUL_MIN_STBH_OR.toLocaleString('vi-VN')} trở lên `;
        result.ridersEnabled = false;
        result.ridersReason = `Cần STBH ≥ ${MAIN_PRODUCT_MIN_STBH.toLocaleString('vi-VN')} đ (hiện tại: ${stbh.toLocaleString('vi-VN')} đ)`;
    } else if (stbh >= MAIN_PRODUCT_MIN_STBH && stbh < PUL_MIN_STBH_OR) {
        if (premium > 0 && premium < PUL_MIN_PREMIUM_OR) {
            result.premiumValid = false;
            result.premiumReason = `Phí tối thiểu: ${PUL_MIN_PREMIUM_OR.toLocaleString('vi-VN')} hoặc STBH từ ${PUL_MIN_STBH_OR.toLocaleString('vi-VN')} trở lên `;
            result.ridersEnabled = false;
            result.ridersReason = `Cần phí chính ≥ ${PUL_MIN_PREMIUM_OR.toLocaleString('vi-VN')} đ (STBH < ${PUL_MIN_STBH_OR.toLocaleString('vi-VN')} đ)`;
        }
    } else if (stbh >= PUL_MIN_STBH_OR) {
        if (premium > 0 && premium < MAIN_PRODUCT_MIN_PREMIUM) {
            result.premiumValid = false;
            result.premiumReason = `Phí tối thiểu: ${PUL_MIN_PREMIUM_OR.toLocaleString('vi-VN')} hoặc STBH từ ${PUL_MIN_STBH_OR.toLocaleString('vi-VN')} trở lên `;
            result.ridersEnabled = false;
            result.ridersReason = `Cần phí chính ≥ ${MAIN_PRODUCT_MIN_PREMIUM.toLocaleString('vi-VN')} đ`;
        }
    }
    return result;
}
// ===================================================================================
// ===== MODULE: UI (Rendering, DOM manipulation, Event Listeners)
// ===================================================================================

function renderUI(isMainProductValid) {
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;

    const suppSection = document.getElementById('supplementary-insured-section');
    if (suppSection) {
        suppSection.classList.toggle('hidden', noSuppInsured);
    }
    
    if (noSuppInsured) {
        document.getElementById('supplementary-insured-container').innerHTML = '';
        appState.supplementaryPersons = [];
    }

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
    const summaryTotalEl = document.getElementById('summary-total');
    const mainFeeEl = document.getElementById('main-insured-main-fee');
    const extraFeeEl = document.getElementById('main-insured-extra-fee');
    const suppFeeEl = document.getElementById('summary-supp-fee');

    if (!isMainProductValid) {
        if (mainFeeEl)  mainFeeEl.textContent  = formatDisplayCurrency(fees.baseMain);
        if (extraFeeEl) extraFeeEl.textContent = formatDisplayCurrency(fees.extra);
        if (summaryTotalEl) summaryTotalEl.textContent = "0";
        if (suppFeeEl)      suppFeeEl.textContent      = "0";
        
        updateMainProductFeeDisplay(fees.baseMain, fees.extra);
        updatePaymentFrequencyOptions(fees.baseMain);
        updateSummaryUI(fees, false);
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

    // Update eligibility of options in dropdown
    document.querySelectorAll('#main-product option').forEach(option => {
        const productKey = option.value;
        const productConfig = PRODUCT_CATALOG[productKey];
        if (!productConfig) return;
        const isEligible = checkEligibility(customer, productConfig.rules.eligibility);
        option.disabled = !isEligible;
        option.classList.toggle('hidden', !isEligible);
    });
    
    if (lastRenderedProductKey === mainProductKey && lastRenderedAge === customer.age) return;
    lastRenderedProductKey = mainProductKey;
    lastRenderedAge = customer.age;

    const container = document.getElementById('main-product-options');
    container.innerHTML = '';
    const productConfig = PRODUCT_CATALOG[mainProductKey];
    if (!productConfig) return;

    // Handle Packages
    if (productConfig.group === 'PACKAGE') {
        const fixedStbh = productConfig.packageConfig.fixedValues.stbh;
        const fixedTerm = productConfig.packageConfig.fixedValues.paymentTerm;
        container.innerHTML = `
            <div>
              <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
              <input type="text" id="main-stbh" class="form-input bg-gray-100" value="${formatCurrency(fixedStbh)}" disabled>
            </div>
            <div>
              <p class="text-sm text-gray-600 mt-1">Thời hạn đóng phí: ${fixedTerm} năm (bằng thời hạn hợp đồng). Thời gian bảo vệ: ${fixedTerm} năm.</p>
            </div>`;
        return;
    }
    
    let optionsHtml = '';
    // Generate inputs from `ui.inputs`
    if (productConfig.ui.inputs) {
        productConfig.ui.inputs.forEach(inputType => {
            switch (inputType) {
                case 'stbh':
                    optionsHtml += `<div>
                        <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH) <span class="text-red-600">*</span></label>
                        <input type="text" id="main-stbh" class="form-input" value="${formatCurrency(appState.mainProduct.stbh)}" placeholder="VD: 1.000.000.000">
                    </div>`;
                    break;
                case 'premium':
                    optionsHtml += `<div>
                        <label for="main-premium" class="font-medium text-gray-700 block mb-1">Phí sản phẩm chính</label>
                        <input type="text" id="main-premium" class="form-input" value="${formatCurrency(appState.mainProduct.premium)}" placeholder="Nhập phí">
                        <div id="mul-fee-range" class="text-sm text-gray-500 mt-1"></div>
                    </div>`;
                    break;
                case 'paymentTerm':
                    const termRule = productConfig.rules.paymentTerm || {};
                    const min = termRule.min || 4;
                    const max = termRule.maxFn ? termRule.maxFn(customer.age) : (100 - customer.age);
                    const defaultTerm = termRule.default || '';
                    optionsHtml += `<div>
                        <label for="payment-term" class="font-medium text-gray-700 block mb-1">Thời gian đóng phí (năm) <span class="text-red-600">*</span></label>
                        <input type="number" id="payment-term" class="form-input" value="${appState.mainProduct.paymentTerm || defaultTerm}" placeholder="VD: 20" min="${min}" max="${max}">
                        <div id="payment-term-hint" class="text-sm text-gray-500 mt-1">Nhập từ ${min} đến ${max} năm</div>
                    </div>`;
                    break;
                case 'extraPremium':
                     optionsHtml += `<div>
                        <label for="extra-premium" class="font-medium text-gray-700 block mb-1">Phí đóng thêm</label>
                        <input type="text" id="extra-premium" class="form-input" value="${formatCurrency(appState.mainProduct.extraPremium)}" placeholder="VD: 10.000.000">
                        <div class="text-sm text-gray-500 mt-1">Tối đa ${GLOBAL_CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính.</div>
                    </div>`;
                    break;
            }
        });
    }

    // Generate options from `ui.options`
    if (productConfig.ui.options) {
        for (const optionKey in productConfig.ui.options) {
            const optionConfig = productConfig.ui.options[optionKey];
            let termOptions = '';
            optionConfig.values.forEach(opt => {
                if (opt.condition(customer)) {
                    termOptions += `<option value="${opt.value}">${opt.label}</option>`;
                }
            });
            if (!termOptions) termOptions = '<option value="" disabled>Không có kỳ hạn phù hợp</option>';

            optionsHtml += `<div>
              <label for="${optionConfig.id}" class="font-medium text-gray-700 block mb-1">${optionConfig.label} <span class="text-red-600">*</span></label>
              <select id="${optionConfig.id}" class="form-select"><option value="" selected>-- Chọn --</option>${termOptions}</select>
              <p class="text-sm text-gray-500 mt-1">Thời hạn đóng phí bằng thời hạn hợp đồng.</p>
            </div>`;
        }
    }
    
    container.innerHTML = optionsHtml;
    
    // Auto-fill default payment term
    const paymentTermInput = document.getElementById('payment-term');
    if (paymentTermInput && productConfig.rules.paymentTerm?.default) {
        if (!paymentTermInput.value) {
            paymentTermInput.value = productConfig.rules.paymentTerm.default;
        }
    }

    attachTermListenersForTargetAge();
}
function renderSupplementaryProductsForPerson(customer, mainProductKey, mainPremium, container, isMainProductValid) {
    const mainProductConfig = PRODUCT_CATALOG[mainProductKey];

    const ridersDisabled = !isMainProductValid;
    const ridersReason = ridersDisabled ? 'Vui lòng hoàn tất thông tin sản phẩm chính.' : '';

    let anyUncheckedByRule = false;

    Object.entries(PRODUCT_CATALOG).forEach(([prodId, prodConfig]) => {
        if (prodConfig.type !== 'rider') return;

        const section = container.querySelector(`.${prodId}-section`);
        if (!section) return;

        let isEligible = checkEligibility(customer, prodConfig.rules.eligibility);
        if (mainProductConfig?.group === 'PACKAGE' && !mainProductConfig.packageConfig.mandatoryRiders.includes(prodId)) {
            isEligible = false; // Disable non-mandatory riders for packages
        }
        
        section.classList.toggle('hidden', !isEligible);

        const checkbox = section.querySelector(`.${prodId}-checkbox`);
        if (!checkbox) return;
        
        if (ridersDisabled) {
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
        
        // Handle mandatory riders for packages
        if (mainProductConfig?.group === 'PACKAGE' && mainProductConfig.packageConfig.mandatoryRiders.includes(prodId)) {
            checkbox.checked = true;
            checkbox.disabled = true;
        }

        const options = section.querySelector('.product-options');
        if (options) {
            options.classList.toggle('hidden', !checkbox.checked);
        }

        const fee = appState.fees.byPerson[customer.id]?.suppDetails?.[prodId] || 0;
        const feeDisplay = section.querySelector('.fee-display');
        if (feeDisplay) {
            feeDisplay.textContent = fee > 0 ? `Phí: ${formatCurrency(fee)}` : '';
        }

        if (prodId === 'health_scl' && checkbox.checked) {
            const comps = getHealthSclFeeComponents(customer);
            const outpatientCb = section.querySelector('.health-scl-outpatient');
            const dentalCb = section.querySelector('.health-scl-dental');
            
            if (outpatientCb && dentalCb) {
                const isOutpatientChecked = outpatientCb.checked;
                dentalCb.disabled = !isOutpatientChecked;
                if (!isOutpatientChecked && dentalCb.checked) {
                    dentalCb.checked = false;
                    anyUncheckedByRule = true;
                }
            }
            
            const outSpan = section.querySelector('.scl-outpatient-fee');
            const dentalSpan = section.querySelector('.scl-dental-fee');
            if (outSpan) outSpan.textContent = (outpatientCb?.checked && comps.outpatient > 0) ? `(+${formatCurrency(comps.outpatient)})` : '';
            if (dentalSpan) dentalSpan.textContent = (dentalCb?.checked && comps.dental > 0) ? `(+${formatCurrency(comps.dental)})` : '';
            
            // Handle program eligibility based on main premium
            const programSelect = section.querySelector('.health-scl-program');
            if (programSelect) {
                if (mainProductConfig?.group === 'PACKAGE') {
                     programSelect.querySelectorAll('option').forEach(opt => opt.disabled = false);
                } else {
                     programSelect.querySelectorAll('option').forEach(opt => {
                         if (opt.value === 'nang_cao') {
                            opt.disabled = false; return;
                        };
                        if (mainPremium >= 15000000) opt.disabled = false;
                        else if (mainPremium >= 10000000) opt.disabled = !['co_ban', 'toan_dien'].includes(opt.value);
                        else if (mainPremium >= 5000000) opt.disabled = !['co_ban'].includes(opt.value);
                        else opt.disabled = opt.value !== 'nang_cao';
                    });
                }
                
                const msgEl = section.querySelector('.main-premium-threshold-msg');
                if (programSelect.options[programSelect.selectedIndex]?.disabled) {
                    const oldProgramText = programSelect.options[programSelect.selectedIndex].text;
                    if (msgEl) {
                        msgEl.textContent = `Phí chính không đủ điều kiện cho chương trình ${oldProgramText}, vui lòng chọn lại.`;
                        msgEl.classList.remove('hidden');
                    }
                    programSelect.value = 'nang_cao';
                } else {
                   if(msgEl) msgEl.classList.add('hidden');
                }
            }
        }
    });

    if (anyUncheckedByRule) runWorkflowDebounced();
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
    
    const allowHalf = baseMainAnnual >= GLOBAL_CONFIG.PAYMENT_FREQUENCY_THRESHOLDS.half;
    const allowQuarter = baseMainAnnual >= GLOBAL_CONFIG.PAYMENT_FREQUENCY_THRESHOLDS.quarter;

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
    clearAllErrors();
    let isValid = true;
    if (!validateMainPersonInputs(state.mainPerson)) isValid = false;
    if (!validateMainProductInputs(state.mainPerson, state.mainProduct, state.fees.baseMain)) isValid = false;
    if (!validateExtraPremium(state.fees.baseMain, state.mainProduct.extraPremium)) isValid = false;
    if (!validateTargetAge(state.mainPerson, state.mainProduct)) isValid = false;
    
    const allPersons = [state.mainPerson, ...state.supplementaryPersons].filter(p=>p);
    let totalHospitalSupportStbh = 0;
    
    allPersons.forEach(p => {
        if (!p.isMain) {
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
    const group = parseInt(occupationInput?.dataset.group, 10) || 0;
    if (occupationInput && (!group || group < 1 || group > 4)) {
        setFieldError(occupationInput, 'Chọn nghề nghiệp từ danh sách'); ok = false;
    } else { clearFieldError(occupationInput); }

    return ok;
}

function validateSupplementaryPersonInputs(person) {
    const container = person.container;
    if (!container) return;
    const nameInput = container.querySelector('.name-input');
    if (nameInput && !(nameInput.value || '').trim()) setFieldError(nameInput, 'Vui lòng nhập họ và tên');
    else clearFieldError(nameInput);
    validateDobField(container.querySelector('.dob-input'));
    const occupationInput = container.querySelector('.occupation-input');
    const group = parseInt(occupationInput?.dataset.group, 10);
    if (occupationInput && (!group || group < 1 || group > 4)) setFieldError(occupationInput, 'Chọn nghề nghiệp từ danh sách');
    else clearFieldError(occupationInput);
}

function validateMainProductInputs(customer, productInfo, basePremium) {
    const mainProductSelect = document.getElementById('main-product');
    if (!productInfo.key) {
        setFieldError(mainProductSelect, 'Vui lòng chọn sản phẩm chính');
        return false;
    }
    const productConfig = PRODUCT_CATALOG[productInfo.key];
    if (!productConfig || mainProductSelect.options[mainProductSelect.selectedIndex]?.disabled) {
        setFieldError(mainProductSelect, 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.');
        return false;
    }
    clearFieldError(mainProductSelect);
    
    let ok = true;
    const { stbh, premium, paymentTerm, options } = productInfo;
    const rules = productConfig.rules;

    // STBH Validation
    const stbhEl = document.getElementById('main-stbh');
    if (stbhEl) {
        if (rules.stbh?.min && stbh < rules.stbh.min) {
            setFieldError(stbhEl, `STBH tối thiểu ${formatCurrency(rules.stbh.min)}`); ok = false;
        } else if (rules.stbh?.special === 'PUL_ELIGIBILITY') {
            const pulState = getPulEligibilityState(stbh, basePremium);
            if (!pulState.stbhValid) { setFieldError(stbhEl, pulState.stbhReason); ok = false; }
            else if (!pulState.premiumValid) { setFieldError(stbhEl, pulState.premiumReason); ok = false; }
            else clearFieldError(stbhEl);
        } else {
            clearFieldError(stbhEl);
        }
    }
    
    // Premium validation
    const premiumEl = document.getElementById('main-premium');
    if (premiumEl) {
         if (rules.premium?.min && premium > 0 && premium < rules.premium.min) {
            setFieldError(premiumEl, `Phí tối thiểu ${formatCurrency(rules.premium.min)}`); ok = false;
        } else if (rules.premium?.special === 'MUL_FACTOR_CHECK') {
            const factorRow = product_data.mul_factors.find(f => customer.age >= f.ageMin && customer.age <= f.ageMax);
            const rangeEl = document.getElementById('mul-fee-range');
            if (factorRow && stbh > 0) {
                const minFee = roundDownTo1000(stbh / factorRow.maxFactor);
                const maxFee = roundDownTo1000(stbh / factorRow.minFactor);
                if(rangeEl) rangeEl.textContent = `Phí hợp lệ từ ${formatCurrency(minFee)} đến ${formatCurrency(maxFee)}.`;
                if (premium > 0 && (premium < minFee || premium > maxFee)) {
                    setFieldError(premiumEl, 'Phí không hợp lệ so với STBH'); ok = false;
                } else { clearFieldError(premiumEl); }
            } else if(rangeEl) {
                rangeEl.textContent = '';
            }
        } else {
            clearFieldError(premiumEl);
        }
    }

    // Payment Term validation
    const termEl = document.getElementById('payment-term');
    if (termEl && rules.paymentTerm) {
        const v = parseInt(termEl.value || "0", 10);
        const min = rules.paymentTerm.min || 4;
        const max = rules.paymentTerm.maxFn ? rules.paymentTerm.maxFn(customer.age) : (100 - customer.age);
        if (!v) { setFieldError(termEl, 'Vui lòng nhập thời gian đóng phí'); ok = false; }
        else if (!(v >= min && v <= max)) { setFieldError(termEl, `Nhập từ ${min} đến ${max} năm`); ok = false; }
        else { clearFieldError(termEl); }
    }

    // Dynamic Options validation (e.g., ABUV term)
    if (productConfig.ui.options) {
        for (const key in productConfig.ui.options) {
            const optionConfig = productConfig.ui.options[key];
            const el = document.getElementById(optionConfig.id);
            if (el && !options[key]) {
                setFieldError(el, 'Vui lòng chọn'); ok = false;
            } else if (el) {
                clearFieldError(el);
            }
        }
    }
    
    return ok;
}

function validateExtraPremium(basePremium, extraPremium) {
    const el = document.getElementById('extra-premium');
    if (!el) return true;
    if (extraPremium > 0 && basePremium > 0 && extraPremium > GLOBAL_CONFIG.EXTRA_PREMIUM_MAX_FACTOR * basePremium) {
        setFieldError(el, `Tối đa ${GLOBAL_CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính`);
        return false;
    }
    clearFieldError(el);
    return true;
}

function validateSupplementaryProduct(person, prodId, mainPremium, totalHospitalSupportStbh) {
    const prodConfig = PRODUCT_CATALOG[prodId];
    if (!prodConfig) return true;

    const supplementData = person.supplements[prodId];
    if (!supplementData) return true;

    const suppContainer = person.isMain ? document.getElementById('main-supp-container') : person.container;
    const section = suppContainer.querySelector(`.${prodId}-section`);
    const input = section.querySelector(`.${prodId}-stbh`);
    if (!input) return true;

    const stbh = supplementData.stbh;
    const rules = prodConfig.rules;
    let ok = true;

    if (rules.stbh?.special === 'HOSPITAL_SUPPORT_MAX_BY_MAIN_PREMIUM') {
        const validationEl = section.querySelector('.hospital-support-validation');
        const maxSupportTotal = Math.floor(mainPremium / 4000000) * 100000;
        const maxByAge = person.age >= 18 ? rules.stbh.maxByAge.from18 : rules.stbh.maxByAge.under18;
        const remaining = maxSupportTotal - totalHospitalSupportStbh;
        if (validationEl) {
            validationEl.textContent = `Tối đa: ${formatCurrency(Math.min(maxByAge, remaining), 'đ/ngày')}. Phải là bội số của 100.000.`;
        }
        if (stbh % rules.stbh.multipleOf !== 0) { setFieldError(input, `Là bội số của ${formatCurrency(rules.stbh.multipleOf)}`); ok = false; }
        else if (stbh > maxByAge || stbh > remaining) { setFieldError(input, 'Vượt quá giới hạn cho phép'); ok = false; }
        else { clearFieldError(input); }
    } else if (stbh > 0) {
        if (rules.stbh?.min && stbh < rules.stbh.min) { setFieldError(input, `Tối thiểu ${formatCurrency(rules.stbh.min)}`); ok = false; }
        else if (rules.stbh?.max && stbh > rules.stbh.max) { setFieldError(input, `Tối đa ${formatCurrency(rules.stbh.max)}`); ok = false; }
        else { clearFieldError(input); }
    } else {
        clearFieldError(input);
    }
    return ok;
}
function validateTargetAge(mainPerson, mainProductInfo) {
  const input = document.getElementById('target-age-input');
  if (!input) return true;
  if (input.disabled) { clearFieldError(input); return true; }

  const val = parseInt((input.value || '').trim(), 10);
  const age = mainPerson?.age || 0;
  const productConfig = PRODUCT_CATALOG[mainProductInfo.key];
  if (!productConfig) { clearFieldError(input); return true; }

  let term = 0;
  if (productConfig.group === 'PACKAGE') {
      term = productConfig.packageConfig.fixedValues.paymentTerm;
  } else if (productConfig.ui.options?.paymentTerm) {
      term = parseInt(mainProductInfo.options.paymentTerm || '0', 10);
  } else {
      term = mainProductInfo.paymentTerm || 0;
  }

  if (!age || !term) { clearFieldError(input); return true; }

  const minAllowed = age + term - 1;
  const maxAllowed = 99;

  if (!val || val < minAllowed || val > maxAllowed) {
    setFieldError(input, `Tuổi minh họa phải từ ${minAllowed} đến ${maxAllowed}`);
    return false;
  }
  clearFieldError(input);
  return true;
}

function validateDobField(input) {
    if (!input) return false;
    const v = (input.value || '').trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
        setFieldError(input, 'Nhập DD/MM/YYYY'); return false;
    }
    const [dd, mm, yyyy] = v.split('/').map(n => parseInt(n, 10));
    const d = new Date(yyyy, mm - 1, dd);
    const valid = d.getFullYear() === yyyy && d.getMonth() === (mm - 1) && d.getDate() === dd && d <= GLOBAL_CONFIG.REFERENCE_DATE;
    if (!valid) { setFieldError(input, 'Ngày sinh không hợp lệ'); return false; }
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
    const errorMsgEl = document.getElementById('global-error-box');
    if(errorMsgEl) errorMsgEl.textContent = '';
}

function checkEligibility(person, eligibilityRules) {
    if (!eligibilityRules) return true;
    for (const rule of eligibilityRules) {
        if (rule.condition && !rule.condition(person)) continue;

        switch (rule.type) {
            case 'daysFromBirth': if (person.daysFromBirth < rule.min) return false; break;
            case 'age':
                if ((rule.min != null && person.age < rule.min) || (rule.max != null && person.age > rule.max)) return false;
                break;
            case 'riskGroup':
                if (rule.exclude && person.riskGroup > 0 && rule.exclude.includes(person.riskGroup)) return false;
                if (rule.required && person.riskGroup === 0) return false;
                break;
        }
    }
    return true;
}
// ===================================================================================
// ===== MODULE: INITIALIZATION & EVENT BINDING
// ===================================================================================

document.addEventListener('DOMContentLoaded', () => {
    initState();
    initMainProductSelect();
    initPerson(appState.mainPerson.container, true);
    initSupplementaryButton();
    initSummaryModal();
    attachGlobalListeners();
    updateSupplementaryAddButtonState(false);
    runWorkflow();
    if (window.MDP3) MDP3.init();
    if (window.renderSection6V2) window.renderSection6V2();
    initViewerModal();
});
function runWorkflow() {
  updateStateFromUI();
  const isMainProductValid = runAllValidations(appState);
  appState.fees = performCalculations(appState);
  renderUI(isMainProductValid);
  try { renderSuppList(); } catch(e) {}
}

const runWorkflowDebounced = debounce(runWorkflow, 40);

function initMainProductSelect() {
    const select = document.getElementById('main-product');
    Object.entries(PRODUCT_CATALOG).forEach(([key, config]) => {
        if (config.type === 'main') {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = config.name;
            select.appendChild(option);
        }
    });
}

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
                const mainSuppContainer = document.querySelector('#main-supp-container .supplementary-products-container');
                if (mainSuppContainer) {
                    mainSuppContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                }
                if (window.MDP3) MDP3.reset();
            }
        }
        runWorkflow();
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
        if (appState.supplementaryPersons.length >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) return;
        
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
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;
    const count = document.querySelectorAll('#supplementary-insured-container .person-container').length;
    
    const disabled = noSuppInsured || (count >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) || !isMainProductValid;
    btn.disabled = disabled;
    btn.classList.toggle('opacity-50', disabled);
    btn.classList.toggle('cursor-not-allowed', disabled);
}

function generateSupplementaryProductsHtml() {
    return Object.entries(PRODUCT_CATALOG)
        .filter(([, config]) => config.type === 'rider')
        .map(([prodId, prodConfig]) => {
            let optionsHtml = '';
            const ui = prodConfig.ui;

            if (ui.options?.includes('program')) {
                 optionsHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label class="font-medium text-gray-700 block mb-1">Quyền lợi chính</label>
                        <select class="form-select health-scl-program">
                          <option value="co_ban">Cơ bản</option>
                          <option value="nang_cao" selected>Nâng cao</option>
                          <option value="toan_dien">Toàn diện</option>
                          <option value="hoan_hao">Hoàn hảo</option>
                        </select>
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
            } else if (ui.inputs?.includes('stbh')) {
                optionsHtml = `<div>
                  <label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
                  <input type="text" class="form-input ${prodId}-stbh" placeholder="${
                    prodId === 'bhn' ? 'VD: 200.000.000' :
                    prodId === 'accident' ? 'VD: 500.000.000' :
                    prodId === 'hospital_support' ? 'Bội số 100.000 (đ/ngày)' : 'Nhập STBH'
                  }">
                </div>
                <p class="hospital-support-validation text-sm text-gray-500 mt-1"></p>`;
            }

            return `
            <div class="product-section ${prodId}-section hidden">
              <label class="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" class="form-checkbox ${prodId}-checkbox">
                <span class="text-lg font-medium text-gray-800">${prodConfig.name}</span>
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
      item.className = 'p-2 hover:bg-gray-100 cursor-pointer';
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

  const isHospitalDaily = input.classList.contains('hospital-support-stbh');
  if (isHospitalDaily) {
      const rounded = Math.round(raw / GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE) * GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE;
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
  document.querySelector('#main-person-container .dob-input')?.addEventListener('input', updateTargetAge);
}
function updateTargetAge() {
    const mainPersonInfo = collectPersonData(document.getElementById('main-person-container'), true);
    const mainProductKey = document.getElementById('main-product')?.value;
    const productConfig = PRODUCT_CATALOG[mainProductKey];
    const targetAgeInput = document.getElementById('target-age-input');

    if (!targetAgeInput || !mainPersonInfo || typeof mainPersonInfo.age !== 'number' || !productConfig) {
        if(targetAgeInput) targetAgeInput.disabled = true;
        return;
    };

    if (productConfig.group === 'TRADITIONAL' || productConfig.group === 'PACKAGE') {
        let term = 0;
        if (productConfig.group === 'PACKAGE') {
            term = productConfig.packageConfig.fixedValues.paymentTerm;
        } else {
            const termValue = document.getElementById(productConfig.ui.options.paymentTerm.id)?.value;
            term = parseInt(termValue || '0', 10);
        }
        targetAgeInput.disabled = true;
        targetAgeInput.value = term ? mainPersonInfo.age + term - 1 : mainPersonInfo.age;
        return;
    }

    targetAgeInput.disabled = false;
    const paymentTerm = parseInt(document.getElementById('payment-term')?.value, 10) || 0;
    const hintEl  = document.getElementById('target-age-hint');

    if (!paymentTerm || paymentTerm <= 0) {
        if (hintEl) hintEl.textContent = 'Nhập thời gian đóng phí để xác định tuổi minh họa.';
        return;
    }

    const minAge = mainPersonInfo.age + paymentTerm - 1;
    const maxAge = 99; 
    targetAgeInput.min = String(minAge);
    targetAgeInput.max = String(maxAge);

    const curVal = parseInt(targetAgeInput.value || '0', 10);
    if (!curVal || curVal < minAge) targetAgeInput.value = 99;
    else if (curVal > maxAge) targetAgeInput.value = maxAge;

    if (hintEl) {
        hintEl.innerHTML = `Khoảng hợp lệ: <strong>${minAge}</strong> – <strong>${maxAge}</strong>.`;
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

// Global scope for custom calculation functions
window.calculateHealthSclPremium = calculateHealthSclPremium;
window.calculateBhnPremium = calculateBhnPremium;
window.calculateAccidentPremium = calculateAccidentPremium;
window.calculateHospitalSupportPremium = calculateHospitalSupportPremium;
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
            const isEligible = info.age >= 18 && info.age <= 60;
            let disabled = isEligible ? '' : 'disabled';
            if (!isEligible) label += ' - Không đủ điều kiện';
            
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
               const otherForm = document.getElementById('mdp3-other-form');
               if (otherForm) otherForm.classList.add('hidden');
            }
        }
    }
    
    function isEnabled() {
        const cb = document.getElementById('mdp3-enable');
        return !!(cb && cb.checked);
    }
    
    function renderSection() {
        const sec = document.getElementById('mdp3-section');
        if (!sec) return;
        const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];

        if (mainProductConfig?.rules?.noSupplementaryInsured) {
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
        let html = `<select id="mdp3-person-select" class="form-select w-full mb-3"><option value="">-- Chọn người --</option></select>
                    <div id="mdp3-other-form" class="hidden mt-4 p-3 border rounded bg-gray-50"></div>`;
        selectContainer.innerHTML = html;
        updateOptions(); // Populate options immediately
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
                                if(lastSelectedId === 'other') showOtherForm();
                            }
                        }
                    }
                    runWorkflow();
                } else {
                    document.getElementById('mdp3-select-container').innerHTML = '';
                    selectedId = null;
                    runWorkflow();
                }
            }
            if (e.target.id === 'mdp3-person-select') {
                selectedId = e.target.value;
                lastSelectedId = selectedId || null;
                const otherForm = document.getElementById('mdp3-other-form');
                if (selectedId === 'other') showOtherForm();
                else otherForm.classList.add('hidden');
                runWorkflow();
            }
        });
    }

    function showOtherForm() {
        const otherForm = document.getElementById('mdp3-other-form');
        otherForm.classList.remove('hidden');
        if(!otherForm.innerHTML.trim()) {
             otherForm.innerHTML = `<div id="person-container-mdp3-other" class="person-container">${generateSupplementaryPersonHtmlForMdp3()}</div>`;
             initPerson(document.getElementById('person-container-mdp3-other'), false);
             const suppBlock = otherForm.querySelector('.supplementary-products-container')?.parentElement;
             if (suppBlock) suppBlock.style.display = 'none';
        }
    }

    function getPremium() {
        const feeEl = document.getElementById('mdp3-fee-display');
        if (!isEnabled() || !selectedId || !window.personFees) {
            if(feeEl) feeEl.textContent = '';
            return 0;
        }
        
        let stbhBase = 0;
        const feesModel = appState.fees;
        
        for (const pid in window.personFees) {
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
        
        if (stbhBase < 0) stbhBase = 0;

        let age, gender;
        if (selectedId === 'other') {
            const otherForm = document.getElementById('person-container-mdp3-other');
            if (!otherForm) return 0;
            const info = collectPersonData(otherForm, false);
            const dobInput = otherForm.querySelector('.dob-input');

            if (!validateDobField(dobInput)) {
                 if (feeEl) feeEl.textContent = 'STBH: — | Phí: —';
                 return 0;
            }
            if (!info.age || info.age < 18 || info.age > 60) {
                setFieldError(dobInput, 'Tuổi phải từ 18-60');
                if (feeEl) feeEl.textContent = 'STBH: — | Phí: —';
                return 0;
            }
            clearFieldError(dobInput);
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

    return { init, isEnabled, getSelectedId: () => selectedId, getPremium, reset, updateOptions };
})();

function getProductLabel(key) {
  return PRODUCT_CATALOG[key]?.name || key || '';
}

function getHealthSclStbhByProgram(program) {
    return PRODUCT_CATALOG.health_scl.rules.stbhByProgram[program] || 0;
}
function collectSimpleErrors() {
  const rawErrors = [];
  document.querySelectorAll('.field-error').forEach(el => {
    const t = (el.textContent || '').trim();
    if (t) rawErrors.push(t);
  });
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
      <div class="font-medium mb-1">Vui lòng sửa các lỗi sau:</div>
      ${errors.map(e => `<div class="flex gap-1"><span>•</span><span>${e}</span></div>`).join('')}
    </div>
  `;
}
function hideGlobalErrors() {
  const box = document.getElementById('global-error-box');
  if (box && !box.classList.contains('hidden')) {
    box.classList.add('hidden');
    box.innerHTML = '';
  }
}

function renderSuppList(){
  const box = document.getElementById('supp-insured-summaries');
  if (!box) return;
  const persons = [appState.mainPerson, ...appState.supplementaryPersons].filter(p=>p);
  const feesMap = window.personFees || {};

  const rows = persons.map(p => {
    const fee = feesMap[p.id]?.supp || 0;
    if (fee <= 0) return '';
    return `<div class="flex justify-between">
              <span>${sanitizeHtml(p.name || (p.isMain ? 'NĐBH chính':'Người'))}</span>
              <span>${formatDisplayCurrency(fee)}</span>
            </div>`;
  }).filter(Boolean);

  if (appState.mdp3.enabled && appState.mdp3.fee > 0 && appState.mdp3.selectedId === 'other') {
    const form = document.getElementById('person-container-mdp3-other');
    let nameOther = 'Người được miễn đóng phí';
    if (form) {
      const info = collectPersonData(form, false);
      if (info && info.name) nameOther = info.name;
    }
    rows.push(`<div class="flex justify-between">
        <span>${sanitizeHtml(nameOther)}</span>
        <span>${formatDisplayCurrency(appState.mdp3.fee)}</span>
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


// ===================================================================================
// ===== MODULE: SUMMARY MODAL & VIEWER (RESTORED FROM V1)
// ===================================================================================

const PRODUCT_SLUG_MAP = {
  PUL_TRON_DOI: 'khoe-tron-ven',
  PUL_15NAM: 'khoe-tron-ven',
  PUL_5NAM: 'khoe-tron-ven',
  KHOE_BINH_AN: 'khoe-binh-an',
  VUNG_TUONG_LAI: 'vung-tuong-lai',
  TRON_TAM_AN: 'tron-tam-an',
  AN_BINH_UU_VIET: 'an-binh-uu-viet'
};
const RIDER_SLUG_MAP = {
  health_scl: 'bung-gia-luc',
  bhn: 'benh-hiem-ngheo-20',
  accident: 'tai-nan',
  hospital_support: 'ho-tro-vien-phi'
};

function buildViewerPayload() {
  const mainKey = appState.mainProduct.key;
  const mainPerson = appState.mainPerson || {};

  let paymentTermFinal = appState.mainProduct.paymentTerm || 0;
  const mainProductConfig = PRODUCT_CATALOG[mainKey];
  if (mainProductConfig) {
      if (mainProductConfig.group === 'PACKAGE') {
          paymentTermFinal = mainProductConfig.packageConfig.fixedValues.paymentTerm;
      } else if (mainProductConfig.ui.options?.paymentTerm) {
          paymentTermFinal = parseInt(appState.mainProduct.options.paymentTerm || '0', 10) || paymentTermFinal;
      }
  }

  const riderList = [];
  const allPersons = [appState.mainPerson, ...appState.supplementaryPersons].filter(p => p);
  allPersons.forEach(person => {
    const suppObj = person.supplements || {};
    Object.keys(suppObj).forEach(rid => {
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

  let mdp3Obj = null;
  if (window.MDP3?.isEnabled()) {
    const premium = MDP3.getPremium() || 0;
    const selId = MDP3.getSelectedId() || null;
    if (premium > 0 && selId) {
      let selectedName = '', selectedAge = '';
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

  const baseMain = appState.fees.baseMain || 0;
  const extra = appState.fees.extra || 0;
  const totalSupp = appState.fees.totalSupp || 0;
  const targetAgeInputVal = parseInt(document.getElementById('target-age-input')?.value || '0', 10);
  const targetAge = targetAgeInputVal || ((mainPerson.age || 0) + paymentTermFinal - 1);

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
    premiums: { baseMain, extra, totalSupp, riders: riderList },
    mdp3: mdp3Obj,
    summaryHtml: summaryHtml
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
    
    iframe.src = 'about:blank';
    modal.classList.add('loading', 'visible');

    iframe.onload = () => {
        modal.classList.remove('loading');
    };
    
    iframe.src = viewerUrl.toString();

  } catch (e) {
    console.error('[FullViewer] Lỗi tạo payload:', e);
    alert('Không tạo được dữ liệu để mở bảng minh họa.');
  }
}

function initViewerModal() {
    const viewerBtn = document.getElementById('btnFullViewer');
    const modal = document.getElementById('viewer-modal');
    const iframe = document.getElementById('viewer-iframe');
    const closeBtn = document.getElementById('close-viewer-modal-btn');

    if (!viewerBtn || !modal || !iframe || !closeBtn) {
        console.error('Không tìm thấy đủ các thành phần của viewer modal.');
        return;
    }

    viewerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        runWorkflow();
        setTimeout(() => {
            const errors = collectSimpleErrors();
            if (errors.length) {
                showGlobalErrors(errors);
                const box = document.getElementById('global-error-box');
                if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            showGlobalErrors([]);
            openFullViewer();
        }, 50);
    });

    const closeModal = () => {
        modal.classList.remove('visible', 'loading');
        iframe.src = 'about:blank';
        document.removeEventListener('keydown', handleKeydown);
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    const handleKeydown = (e) => {
        if (e.key === 'Escape' && modal.classList.contains('visible')) {
            closeModal();
        }
    };
    document.addEventListener('keydown', handleKeydown);
}


// ===================================================================================
// ===== LOGIC TẠO BẢNG MINH HỌA (PORTED FROM V1)
// ===================================================================================

// NOTE: All functions prefixed with bm_ (Benefit Matrix) are part of this ported logic.
// They are adapted to read from BENEFIT_MATRIX_SCHEMAS and PRODUCT_CATALOG.

function __exportExactSummaryHtml() {
    try {
        const data = buildSummaryData();
        const introHtml = buildIntroSection(data);
        const part1Html = buildPart1Section(data);
        const part2Html = buildPart2BenefitsSection(data);
        let part3Html = buildPart3ScheduleSection(data);
        const footerHtml = buildFooterSection(data);
        return introHtml + part1Html + part2Html + part3Html + footerHtml;
    } catch (e) {
        console.error('[__exportExactSummaryHtml] error:', e);
        return '<div style="color:red">Lỗi tạo summaryHtml</div>';
    }
}

function buildSummaryData() {
    const freq = appState.paymentFrequency;
    const periods = freq === 'half' ? 2 : (freq === 'quarter' ? 4 : 1);
    const isAnnual = periods === 1;
    const riderFactor = periods === 2 ? 1.02 : (periods === 4 ? 1.04 : 1);
    const mainInfo = appState.mainPerson;
    let targetAge = parseInt(document.getElementById('target-age-input')?.value || '0', 10) || 0;
    const productKey = appState.mainProduct.key;
    let paymentTerm = appState.mainProduct.paymentTerm || 0;

    const productConfig = PRODUCT_CATALOG[productKey];
    if (productConfig) {
        if (productConfig.group === 'PACKAGE') {
            paymentTerm = productConfig.packageConfig.fixedValues.paymentTerm;
        } else if (productConfig.ui.options?.paymentTerm) {
            paymentTerm = parseInt(appState.mainProduct.options.paymentTerm || '0', 10) || paymentTerm;
        }
    }
    
    const minTerm = productConfig?.rules?.paymentTerm?.min || 4;
    if (!paymentTerm || paymentTerm < minTerm) paymentTerm = minTerm;
    
    const minTargetAge = mainInfo.age + paymentTerm - 1;
    if (!targetAge || targetAge < minTargetAge) targetAge = minTargetAge;

    const persons = [mainInfo, ...appState.supplementaryPersons];
    const mdpEnabled = appState.mdp3.enabled;
    const mdpTargetId = appState.mdp3.selectedId;
    const mdpFeeYear = mdpEnabled ? (window.MDP3?.getPremium() || 0) : 0;
    
    if (mdpEnabled && mdpTargetId === 'other') {
        const form = document.getElementById('person-container-mdp3-other');
        const info = form ? collectPersonData(form, false) : {};
        if (info.age >= 18 && info.age <= 60) {
            persons.push({
                id: 'mdp3_other', isMain: false, name: info.name || 'Người khác (MDP3)',
                gender: info.gender, age: info.age, supplements: {}
            });
        }
    }

    const part1 = buildPart1RowsData({ persons, productKey, paymentTerm, targetAge, riderFactor, periods, isAnnual, mdpEnabled, mdpTargetId, mdpFeeYear });
    const schedule = buildPart2ScheduleRows({ persons, mainInfo, paymentTerm, targetAge, periods, isAnnual, riderFactor, productKey, mdpEnabled, mdpTargetId, mdpFeeYear });

    return { freq, periods, isAnnual, riderFactor, productKey, paymentTerm, targetAge, mainInfo, persons, mdpEnabled, mdpTargetId, mdpFeeYear, part1, schedule };
}

function buildPart1RowsData(ctx) {
    const { persons, productKey, paymentTerm, targetAge, riderFactor, periods, isAnnual, mdpEnabled, mdpTargetId, mdpFeeYear } = ctx;
    const mainAge = persons.find(p => p.isMain)?.age || 0;
    const riderMaxAge = (key) => (PRODUCT_CATALOG[key]?.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 64);

    let rows = [], perPersonTotals = [], grand = { per: 0, eq: 0, base: 0, diff: 0 };
    
    const pushRow = (acc, personName, prodName, stbhDisplay, years, baseAnnual, isRider) => {
        let perPeriod = 0, annualEq = 0, diff = 0;
        if (!isAnnual) {
            if (isRider) {
                perPeriod = riderPerPeriod(baseAnnual, periods, riderFactor);
                annualEq = perPeriod * periods;
                diff = annualEq - baseAnnual;
            } else {
                perPeriod = roundDownTo1000(baseAnnual / periods);
                annualEq = perPeriod * periods;
                diff = annualEq - baseAnnual;
            }
        }
        acc.per += perPeriod; acc.eq += annualEq; acc.base += baseAnnual; acc.diff += diff;
        rows.push({ personName, prodName, stbhDisplay, years, perPeriod, annualEq, diff, annualBase: baseAnnual, factorRider: !!isRider });
    };

    persons.forEach(p => {
        const acc = { per: 0, eq: 0, base: 0, diff: 0 };
        if (p.isMain && appState.mainProduct.key) {
            const baseAnnual = calculateMainPremium(p, appState.mainProduct);
            const stbhVal = appState.mainProduct.stbh;
            pushRow(acc, p.name, getProductLabel(appState.mainProduct.key), formatDisplayCurrency(stbhVal), paymentTerm || '—', baseAnnual, false);
        }
        if (p.isMain && (appState.mainProduct.extraPremium || 0) > 0) {
            pushRow(acc, p.name, 'Phí đóng thêm', '—', paymentTerm || '—', appState.mainProduct.extraPremium || 0, false);
        }
        for (const rid in p.supplements) {
            const baseAnnual = calculateRiderPremium(rid, p, appState.fees.baseMain, 0);
            const maxA = riderMaxAge(rid);
            const years = Math.max(0, Math.min(maxA - p.age, targetAge - mainAge) + 1);
            let stbh = p.supplements[rid].stbh;
            if (rid === 'health_scl') stbh = getHealthSclStbhByProgram(p.supplements[rid].program);
            pushRow(acc, p.name, getProductLabel(rid), formatDisplayCurrency(stbh), years, baseAnnual, true);
        }
        if (mdpEnabled && mdpFeeYear > 0 && (mdpTargetId === p.id || (mdpTargetId === 'other' && p.id === 'mdp3_other'))) {
            const years = Math.max(0, Math.min(64 - p.age, targetAge - mainAge) + 1);
            pushRow(acc, p.name, 'Miễn đóng phí 3.0', '—', years, mdpFeeYear, true);
        }
        perPersonTotals.push({ personName: p.name, ...acc });
        grand.per += acc.per; grand.eq += acc.eq; grand.base += acc.base; grand.diff += acc.diff;
    });

    return { rows, perPersonTotals, grand, isAnnual, periods, riderFactor };
}

function buildPart2ScheduleRows(ctx) {
    const { persons, mainInfo, paymentTerm, targetAge, periods, isAnnual, riderFactor, productKey, mdpEnabled, mdpTargetId, mdpFeeYear } = ctx;
    const riderMaxAge = (key) => (PRODUCT_CATALOG[key]?.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 64);
    const rows = [];
    const baseMainAnnual = appState?.fees?.baseMain || 0;
    const extraAnnual = appState?.mainProduct?.extraPremium || 0;

    for (let year = 1; mainInfo.age + year - 1 <= targetAge; year++) {
        const currentAge = mainInfo.age + year - 1;
        const inTerm = year <= paymentTerm;
        const mainYearBase = inTerm ? baseMainAnnual : 0;
        const extraYearBase = inTerm ? extraAnnual : 0;
        const perPersonSuppBase = [], perPersonSuppPerPeriod = [], perPersonSuppAnnualEq = [];

        persons.forEach(p => {
            let sumBase = 0, sumPer = 0;
            const attained = p.age + year - 1;
            const addRider = (key, baseFee) => {
                if (!baseFee || attained > riderMaxAge(key)) return;
                sumBase += baseFee;
                if (!isAnnual) sumPer += riderPerPeriod(baseFee, periods, riderFactor);
            };

            for(const rid in p.supplements) {
                addRider(rid, calculateRiderPremium(rid, p, baseMainAnnual, 0, attained));
            }

            if (mdpEnabled && mdpFeeYear > 0 && (mdpTargetId === p.id || (mdpTargetId === 'other' && p.id === 'mdp3_other'))) {
                addRider('mdp3', mdpFeeYear); // Assuming mdp3 is a rider key
            }
            perPersonSuppBase.push(sumBase);
            perPersonSuppPerPeriod.push(sumPer);
            perPersonSuppAnnualEq.push(isAnnual ? sumBase : sumPer * periods);
        });

        const suppBaseTotal = perPersonSuppBase.reduce((a, b) => a + b, 0);
        const suppAnnualEqTotal = perPersonSuppAnnualEq.reduce((a, b) => a + b, 0);
        const totalYearBase = mainYearBase + extraYearBase + suppBaseTotal;
        const totalAnnualEq = isAnnual ? totalYearBase : roundDownTo1000((mainYearBase + extraYearBase)/periods)*periods + suppAnnualEqTotal;
        const diff = totalAnnualEq - totalYearBase;
        rows.push({ year, age: currentAge, mainYearBase, extraYearBase, perPersonSuppBase, perPersonSuppPerPeriod, perPersonSuppAnnualEq, totalYearBase, totalAnnualEq, diff });
    }
    return { rows, extraAllZero: rows.every(r => r.extraYearBase === 0) };
}

function buildIntroSection(data) {
    const sel = document.getElementById('payment-frequency');
    let freqLabel = sel ? sel.options[sel.selectedIndex].text : data.freq;
    return `<div class="mb-4"><h2 class="text-xl font-bold">BẢNG MINH HỌA PHÍ & QUYỀN LỢI</h2><div class="text-sm text-gray-700">Sản phẩm chính: <strong>${sanitizeHtml(getProductLabel(data.productKey) || '—')}</strong>&nbsp;|&nbsp; Kỳ đóng: <strong>${sanitizeHtml(freqLabel)}</strong>&nbsp;|&nbsp; Minh họa đến tuổi: <strong>${sanitizeHtml(data.targetAge)}</strong></div></div>`;
}

function buildPart1Section(data) {
    const { part1, isAnnual, periods } = data;
    const { rows, perPersonTotals, grand } = part1;
    const r1000 = n => Math.round((n || 0) / 1000) * 1000;
    const formatDiffCell = n => !n ? '0' : `<span class="text-red-600 font-bold">${formatDisplayCurrency(r1000(n))}</span>`;
    
    const headerHtml = isAnnual ? `<tr><th class="p-2 border">Tên NĐBH</th><th class="p-2 border">Sản phẩm</th><th class="p-2 border">STBH</th><th class="p-2 border">Số năm đóng phí</th><th class="p-2 border">Phí theo năm</th></tr>`
        : `<tr><th class="p-2 border">Tên NĐBH</th><th class="p-2 border">Sản phẩm</th><th class="p-2 border">STBH</th><th class="p-2 border">Số năm đóng phí</th><th class="p-2 border">Phí (${periods === 2 ? 'nửa năm' : 'theo quý'})</th><th class="p-2 border">Phí năm đầu</th><th class="p-2 border">Phí theo năm</th><th class="p-2 border">Chênh lệch</th></tr>`;
    
    let body = [];
    perPersonTotals.forEach(agg => {
        body.push(isAnnual ? `<tr class="bg-gray-50 font-bold"><td class="p-2 border">${sanitizeHtml(agg.personName)}</td><td class="p-2 border">Tổng theo người</td><td class="p-2 border text-right">—</td><td class="p-2 border text-center">—</td><td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.base))}</td></tr>`
            : `<tr class="bg-gray-50 font-bold"><td class="p-2 border">${sanitizeHtml(agg.personName)}</td><td class="p-2 border">Tổng theo người</td><td class="p-2 border text-right">—</td><td class="p-2 border text-center">—</td><td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.per))}</td><td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.eq))}</td><td class="p-2 border text-right">${formatDisplayCurrency(r1000(agg.base))}</td><td class="p-2 border text-right">${formatDiffCell(agg.diff)}</td></tr>`);
        
        rows.filter(r => r.personName === agg.personName).forEach(r => {
            body.push(isAnnual ? `<tr><td class="p-2 border"></td><td class="p-2 border">${sanitizeHtml(r.prodName)}</td><td class="p-2 border text-right">${r.stbhDisplay}</td><td class="p-2 border text-center">${r.years}</td><td class="p-2 border text-right">${formatDisplayCurrency(r.annualBase)}</td></tr>`
                : `<tr><td class="p-2 border"></td><td class="p-2 border">${sanitizeHtml(r.prodName)}</td><td class="p-2 border text-right">${r.stbhDisplay}</td><td class="p-2 border text-center">${r.years}</td><td class="p-2 border text-right">${formatDisplayCurrency(r.perPeriod)}</td><td class="p-2 border text-right">${formatDisplayCurrency(r.annualEq)}</td><td class="p-2 border text-right">${formatDisplayCurrency(r.annualBase)}</td><td class="p-2 border text-right">${formatDiffCell(r.diff)}</td></tr>`);
        });
    });
    
    body.push(isAnnual ? `<tr class="bg-gray-100 font-bold"><td class="p-2 border" colspan="4">Tổng tất cả</td><td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.base))}</td></tr>`
        : `<tr class="bg-gray-100 font-bold"><td class="p-2 border" colspan="4">Tổng tất cả</td><td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.per))}</td><td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.eq))}</td><td class="p-2 border text-right">${formatDisplayCurrency(r1000(grand.base))}</td><td class="p-2 border text-right">${formatDiffCell(grand.diff)}</td></tr>`);
    
    return `<h3 class="text-lg font-bold mb-2">Phần 1 · Tóm tắt sản phẩm</h3><div class="overflow-x-auto"><table class="w-full border-collapse text-sm"><thead>${headerHtml}</thead><tbody>${body.join('')}</tbody></table></div>`;
}

function buildPart2BenefitsSection(summaryData) {
    const colsBySchema = bm_collectColumns(summaryData);
    const order = ['AN_BINH_UU_VIET', 'KHOE_BINH_AN', 'VUNG_TUONG_LAI', 'PUL_FAMILY', 'HEALTH_SCL', 'BHN_2_0', 'HOSPITAL_SUPPORT', 'ACCIDENT'];
    const blocks = order.map(sk => colsBySchema[sk] ? bm_renderSchemaTables(sk, colsBySchema[sk], summaryData) : '').filter(Boolean);
    if (!blocks.length) return `<h3 class="text-lg font-bold mt-6 mb-3">Phần 2 · Tóm tắt quyền lợi sản phẩm</h3><div class="text-sm text-gray-500 italic mb-4">Không có quyền lợi nào để hiển thị.</div>`;
    return `<h3 class="text-lg font-bold mt-6 mb-3">Phần 2 · Tóm tắt quyền lợi sản phẩm</h3>${blocks.join('')}`;
}

function buildPart3ScheduleSection(summaryData) {
    const isPulMul = ['PUL', 'MUL'].includes(PRODUCT_CATALOG[summaryData.productKey]?.group);
    if (!isPulMul) {
        // Render simple schedule
        const { schedule, isAnnual, persons } = summaryData;
        const rows = schedule.rows;
        if (!rows.length) return '';
        const activePersonIdx = persons.map((p, i) => rows.some(r => (r.perPersonSuppAnnualEq[i] || 0) > 0) ? i : -1).filter(i => i !== -1);
        const header = ['<th class="p-2 border">Năm HĐ</th>', '<th class="p-2 border">Tuổi</th>', '<th class="p-2 border">Phí chính</th>', (schedule.extraAllZero ? '' : '<th class="p-2 border">Phí đóng thêm</th>'), ...activePersonIdx.map(i => `<th class="p-2 border">Phí BS (${sanitizeHtml(persons[i].name)})</th>`), (!isAnnual ? '<th class="p-2 border">Tổng quy năm</th>' : ''), '<th class="p-2 border">Tổng đóng/năm</th>', (!isAnnual ? '<th class="p-2 border">Chênh lệch</th>' : '')].filter(Boolean);
        let sums = { main: 0, extra: 0, supp: activePersonIdx.map(() => 0), totalEq: 0, totalBase: 0, diff: 0 };
        const body = rows.map(r => {
            sums.main += r.mainYearBase; sums.extra += r.extraYearBase; sums.totalEq += r.totalAnnualEq; sums.totalBase += r.totalYearBase; sums.diff += r.diff;
            activePersonIdx.forEach((pIdx, i) => sums.supp[i] += r.perPersonSuppAnnualEq[pIdx]);
            return `<tr><td class="p-2 border text-center">${r.year}</td><td class="p-2 border text-center">${r.age}</td><td class="p-2 border text-right">${formatDisplayCurrency(r.mainYearBase)}</td>${schedule.extraAllZero ? '' : `<td class="p-2 border text-right">${formatDisplayCurrency(r.extraYearBase)}</td>`}${activePersonIdx.map(i => `<td class="p-2 border text-right">${formatDisplayCurrency(r.perPersonSuppAnnualEq[i])}</td>`).join('')}${!isAnnual ? `<td class="p-2 border text-right">${formatDisplayCurrency(r.totalAnnualEq)}</td>` : ''}<td class="p-2 border text-right">${formatDisplayCurrency(r.totalYearBase)}</td>${!isAnnual ? `<td class="p-2 border text-right">${formatDiffCell(r.diff)}</td>` : ''}</tr>`;
        }).join('');
        const footer = `<tr class="bg-gray-50 font-bold"><td class="p-2 border" colspan="2">Tổng</td><td class="p-2 border text-right">${formatDisplayCurrency(sums.main)}</td>${schedule.extraAllZero ? '' : `<td class="p-2 border text-right">${formatDisplayCurrency(sums.extra)}</td>`}${sums.supp.map(s => `<td class="p-2 border text-right">${formatDisplayCurrency(s)}</td>`).join('')}${!isAnnual ? `<td class="p-2 border text-right">${formatDisplayCurrency(sums.totalEq)}</td>` : ''}<td class="p-2 border text-right">${formatDisplayCurrency(sums.totalBase)}</td>${!isAnnual ? `<td class="p-2 border text-right">${formatDiffCell(sums.diff)}</td>` : ''}</tr>`;
        return `<h3 class="text-lg font-bold mt-6 mb-2">Phần 3 · Bảng phí</h3><div class="overflow-x-auto"><table class="w-full border-collapse text-sm"><thead><tr>${header.join('')}</tr></thead><tbody>${body}${footer}</tbody></table></div>`;
    }

    // Render schedule with account value projection
    const customRateInput = document.getElementById('custom-interest-rate-input')?.value;
    const projection = calculateAccountValueProjection(appState.mainPerson, appState.mainProduct, appState.fees.baseMain, appState.mainProduct.extraPremium, summaryData.targetAge, customRateInput, summaryData.freq);
    const { schedule, isAnnual, persons } = summaryData;
    const rows = schedule.rows;
    if (!rows.length) return '';
    const activePersonIdx = persons.map((p, i) => rows.some(r => (r.perPersonSuppAnnualEq[i] || 0) > 0) ? i : -1).filter(i => i !== -1);
    const header = ['<th class="p-2 border">Năm HĐ</th>', '<th class="p-2 border">Tuổi</th>', '<th class="p-2 border">Phí chính</th>', (schedule.extraAllZero ? '' : '<th class="p-2 border">Phí đóng thêm</th>'), ...activePersonIdx.map(i => `<th class="p-2 border">Phí BS (${sanitizeHtml(persons[i].name)})</th>`), '<th class="p-2 border">Tổng đóng/năm</th>', '<th class="p-2 border">GTTK (Lãi suất cam kết)</th>', `<th class="p-2 border">GTTK (LS ${customRateInput || "minh họa"}% 20 năm đầu)</th>`, `<th class="p-2 border">GTTK (LS ${customRateInput || "minh họa"}% xuyên suốt)</th>`].filter(Boolean);
    let sums = { main: 0, extra: 0, supp: activePersonIdx.map(() => 0), totalBase: 0 };
    const body = rows.map((r, i) => {
        sums.main += r.mainYearBase; sums.extra += r.extraYearBase; sums.totalBase += r.totalYearBase;
        activePersonIdx.forEach((pIdx, idx) => sums.supp[idx] += r.perPersonSuppAnnualEq[pIdx]);
        return `<tr><td class="p-2 border text-center">${r.year}</td><td class="p-2 border text-center">${r.age}</td><td class="p-2 border text-right">${formatDisplayCurrency(r.mainYearBase)}</td>${schedule.extraAllZero ? '' : `<td class="p-2 border text-right">${formatDisplayCurrency(r.extraYearBase)}</td>`}${activePersonIdx.map(pIdx => `<td class="p-2 border text-right">${formatDisplayCurrency(r.perPersonSuppAnnualEq[pIdx])}</td>`).join('')}<td class="p-2 border text-right font-semibold">${formatDisplayCurrency(r.totalYearBase)}</td><td class="p-2 border text-right">${formatDisplayCurrency(projection.guaranteed[i])}</td><td class="p-2 border text-right">${formatDisplayCurrency(projection.customCapped[i])}</td><td class="p-2 border text-right">${formatDisplayCurrency(projection.customFull[i])}</td></tr>`;
    }).join('');
    const footer = `<tr class="bg-gray-50 font-bold"><td class="p-2 border" colspan="2">Tổng</td><td class="p-2 border text-right">${formatDisplayCurrency(sums.main)}</td>${schedule.extraAllZero ? '' : `<td class="p-2 border text-right">${formatDisplayCurrency(sums.extra)}</td>`}${sums.supp.map(s => `<td class="p-2 border text-right">${formatDisplayCurrency(s)}</td>`).join('')}<td class="p-2 border text-right">${formatDisplayCurrency(sums.totalBase)}</td><td class="p-2 border"></td><td class="p-2 border"></td><td class="p-2 border"></td></tr>`;
    return `<h3 class="text-lg font-bold mt-6 mb-2">Phần 3 · Bảng phí & Minh họa giá trị tài khoản</h3><div class="overflow-x-auto"><table class="w-full border-collapse text-sm"><thead><tr>${header.join('')}</tr></thead><tbody>${body}${footer}</tbody></table></div>`;
}


function buildFooterSection(data) {
    return `<div class="mt-6 text-xs text-gray-600 italic">(*) Công cụ này chỉ mang tính chất tham khảo cá nhân, không phải là bảng minh họa chính thức của AIA. Quyền lợi và mức phí cụ thể sẽ được xác nhận trong hợp đồng do AIA phát hành. Vui lòng liên hệ tư vấn viên AIA để được tư vấn chi tiết và nhận bảng minh họa chính thức.</div>`;
}

function bm_collectColumns(summaryData) {
    const colsBySchema = {};
    const persons = summaryData.persons || [];
    const mainKey = summaryData.productKey;
    const mainSa = appState?.mainProduct?.stbh || 0;

    if (mainKey) {
        const schema = bm_findSchema(mainKey);
        if (schema) {
            colsBySchema[schema.key] = colsBySchema[schema.key] || [];
            colsBySchema[schema.key].push({ productKey: mainKey, sumAssured: mainSa, persons: [summaryData.mainInfo] });
        }
    }

    persons.forEach(p => {
        const supp = p.supplements || {};
        for(const rid in supp) {
            const schema = bm_findSchema(rid);
            if(schema) {
                let sig = rid, sa = supp[rid].stbh;
                let colData = { productKey: rid, sumAssured: sa, persons: [p] };
                if (rid === 'health_scl') {
                    sig += `|${supp.health_scl.program}|${supp.health_scl.outpatient ? 1:0}|${supp.health_scl.dental ? 1:0}`;
                    colData = { ...colData, program: supp.health_scl.program, flags: { outpatient: supp.health_scl.outpatient, dental: supp.health_scl.dental, maternity: BM_SCL_PROGRAMS[supp.health_scl.program]?.maternity && p.gender === 'Nữ' } };
                }
                colsBySchema[schema.key] = colsBySchema[schema.key] || [];
                // Grouping logic can be added here if needed
                colsBySchema[schema.key].push(colData);
            }
        }
    });

    Object.values(colsBySchema).forEach(arr => arr.forEach(col => {
        const names = (col.persons || []).map(p => p.name || p.id).join(', ');
        let label = names;
        if(col.productKey === 'health_scl') label += ` - ${BM_SCL_PROGRAMS[col.program]?.label || ''}`;
        if(col.sumAssured) label += ` - STBH: ${formatDisplayCurrency(col.sumAssured)}`;
        col.label = label;
    }));
    
    return colsBySchema;
}

function bm_renderSchemaTables(schemaKey, columns, summaryData) {
    const schema = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === schemaKey);
    if (!schema || !columns.length) return '';

    const titleMap = { 'AN_BINH_UU_VIET': 'An Bình Ưu Việt', 'KHOE_BINH_AN': 'Khoẻ Bình An', 'VUNG_TUONG_LAI': 'Vững Tương Lai', 'PUL_FAMILY': 'Khoẻ Trọn Vẹn', 'HEALTH_SCL': 'Sức khỏe Bùng Gia Lực', 'BHN_2_0': 'Bệnh hiểm nghèo 2.0', 'HOSPITAL_SUPPORT': 'Hỗ trợ Chi phí Nằm viện', 'ACCIDENT': 'Tai nạn' };
    const title = titleMap[schema.key] || schema.key;
    const headCols = columns.map(c => `<th class="border px-2 py-2 text-left align-top">${sanitizeHtml(c.label)}</th>`).join('');
    
    let rows = [];
    schema.benefits.forEach(benef => {
        let cellsData = [];
        let anyVisible = false;
        columns.forEach(col => {
            // Visibility checks
            if ((benef.productCond && benef.productCond !== col.productKey) || (benef.minAge && !col.persons.some(p => p.age >= benef.minAge)) || (benef.maternityOnly && !col.flags?.maternity)) {
                cellsData.push({ displayValue: '', singleValue: 0 }); return;
            }
            
            let displayValue = '', singleValue = 0;
            if (benef.valueType === 'number') {
                let raw = 0;
                if(benef.compute) raw = benef.compute(col.sumAssured);
                if(benef.computeDaily) raw = benef.computeDaily(col.daily);
                if(benef.computeProg) raw = benef.computeProg(BM_SCL_PROGRAMS[col.program]);
                if (benef.cap && raw > benef.cap) raw = benef.cap;
                singleValue = roundDownTo1000(raw);
                displayValue = singleValue ? formatDisplayCurrency(singleValue * (benef.multiClaim || 1)) : '';
            } else {
                displayValue = benef.text || '';
            }
            if (displayValue) anyVisible = true;
            cellsData.push({ displayValue, singleValue });
        });
        if (anyVisible) rows.push({ benef, cellsData });
    });

    const bodyHtml = rows.map(r => {
        const labelHtml = `${sanitizeHtml(r.benef.labelBase)}${r.benef.formulaLabel ? ` - ${sanitizeHtml(r.benef.formulaLabel)}` : ''}`;
        const cellsHtml = r.cellsData.map(c => `<td class="border px-2 py-1 text-right">${c.displayValue}</td>`).join('');
        return `<tr><td class="border px-2 py-1">${labelHtml}</td>${cellsHtml}</tr>`;
    }).join('');

    let totalRowHtml = '';
    if (schema.hasTotal) {
        let totalCellsSum = columns.map((_, i) => rows.reduce((sum, r) => sum + (r.benef.valueType === 'number' ? r.cellsData[i].singleValue * (r.benef.multiClaim || 1) : 0), 0));
        totalRowHtml = `<tr><td class="border px-2 py-1 font-semibold">Tổng quyền lợi</td>${totalCellsSum.map(s => `<td class="border px-2 py-1 text-right font-semibold">${s ? formatDisplayCurrency(s) : ''}</td>`).join('')}</tr>`;
    }

    return `<div class="mb-6"><h4 class="font-semibold mb-1">${sanitizeHtml(title)}</h4><div class="overflow-x-auto"><table class="w-full border-collapse text-sm"><thead><tr><th class="border px-2 py-2 text-left" style="width:42%">Tên quyền lợi</th>${headCols}</tr></thead><tbody>${bodyHtml}${totalRowHtml}</tbody></table></div></div>`;
}

function bm_findSchema(productKey) {
    if (PRODUCT_CATALOG[productKey]?.group === 'TRADITIONAL' && productKey === 'AN_BINH_UU_VIET') return BENEFIT_MATRIX_SCHEMAS.find(s => s.key === 'AN_BINH_UU_VIET');
    if (PRODUCT_CATALOG[productKey]?.group === 'MUL') return BENEFIT_MATRIX_SCHEMAS.find(s => s.key === productKey);
    if (PRODUCT_CATALOG[productKey]?.group === 'PUL') return BENEFIT_MATRIX_SCHEMAS.find(s => s.key === 'PUL_FAMILY');
    return BENEFIT_MATRIX_SCHEMAS.find(s => s.key.toLowerCase() === productKey.toLowerCase() || s.productKeys?.includes(productKey));
}