
import { GLOBAL_CONFIG, PRODUCT_CATALOG, product_data, investment_data, BENEFIT_MATRIX_SCHEMAS, BM_SCL_PROGRAMS } from './data.js';

// ===================================================================================
// ===== UTILITY FUNCTIONS
// ===================================================================================

function debounce(fn, wait = 40) {
    let t = null;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

function roundDownTo1000(n) {
    return Math.floor(Number(n || 0) / 1000) * 1000;
}

function parseFormattedNumber(formattedString) {
    if (formattedString == null || formattedString === '') return 0;
    let v = String(formattedString);
    v = v.replace(/[.,\s]/g, '');
    const m = v.match(/-?\d+/);
    return m ? parseInt(m[0], 10) : 0;
}

function formatCurrency(value, suffix = '') {
    const num = Number(value) || 0;
    return num.toLocaleString('vi-VN') + (suffix ? ` ${suffix}`: '');
}

function formatDisplayCurrency(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0';
}

function sanitizeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Safely creates and executes a function from a string.
 * This is used for `hintFunction` and `maxFunction` from data.js.
 * @param {string} code - The function body as a string.
 * @param {Array<string>} argNames - The names of the arguments for the function.
 * @returns {Function} A function that can be called with the specified arguments.
 */
function createFunction(code, ...argNames) {
    try {
        return new Function(...argNames, `return ${code}`);
    } catch (e) {
        console.error("Error creating function:", e, "Code:", code);
        return () => ''; // Return a safe fallback function
    }
}


// ===================================================================================
// ===== STATE MANAGEMENT
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
            program: '', // Key for the selected program
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
        mdpPerson: { // Store MDP target person separately
            id: null, // can be personId or 'other'
            info: null // if 'other', this holds {age, gender}
        },
        fees: {
            baseMain: 0,
            extra: 0,
            totalMain: 0,
            totalSupp: 0,
            total: 0,
            byPerson: {},
        }
    };
}


// ===================================================================================
// ===== DATA COLLECTION (Reading from DOM into State)
// ===================================================================================

function updateStateFromUI() {
    const mainProductKey = document.getElementById('main-product')?.value || '';
    appState.mainProduct.key = mainProductKey;
    appState.mainProduct.stbh = parseFormattedNumber(document.getElementById('main-stbh')?.value);
    appState.mainProduct.premium = parseFormattedNumber(document.getElementById('main-premium')?.value);
    appState.mainProduct.paymentTerm = parseInt(document.getElementById('payment-term')?.value, 10) || 0;
    appState.mainProduct.extraPremium = parseFormattedNumber(document.getElementById('extra-premium')?.value);
    appState.mainProduct.program = document.getElementById('main-program')?.value || '';

    appState.paymentFrequency = document.getElementById('payment-frequency')?.value || 'year';
    appState.mainPerson = collectPersonData(document.getElementById('main-person-container'), true);
    appState.supplementaryPersons = Array.from(
        document.querySelectorAll('#supplementary-insured-container .person-container')
    ).map(container => collectPersonData(container, false));
    
    // Collect MDP data
    const mdpRadio = document.querySelector('input[name="mdp3-person"]:checked');
    if (mdpRadio) {
        appState.mdpPerson.id = mdpRadio.value;
        if (mdpRadio.value === 'other') {
            const container = document.getElementById('mdp3-other-form');
            appState.mdpPerson.info = container ? collectPersonData(container, false, true) : null;
        } else {
            appState.mdpPerson.info = null;
        }
    } else {
        appState.mdpPerson.id = null;
        appState.mdpPerson.info = null;
    }
}

function collectPersonData(container, isMain, isMdpOther = false) {
    if (!container) return null;
    const dobInput = container.querySelector('.dob-input');
    const dobStr = dobInput ? dobInput.value : '';
    let age = 0;
    let daysFromBirth = 0;

    if (dobStr && /^\d{2}\/\d{2}\/\d{4}$/.test(dobStr)) {
        const [dd, mm, yyyy] = dobStr.split('/').map(n => parseInt(n, 10));
        const birthDate = new Date(yyyy, mm - 1, dd);
        if (!isNaN(birthDate.getTime()) && birthDate.getFullYear() === yyyy && birthDate.getMonth() === mm - 1 && birthDate.getDate() === dd && birthDate <= GLOBAL_CONFIG.REFERENCE_DATE) {
            daysFromBirth = Math.floor((GLOBAL_CONFIG.REFERENCE_DATE - birthDate) / (1000 * 60 * 60 * 24));
            age = GLOBAL_CONFIG.REFERENCE_DATE.getFullYear() - birthDate.getFullYear();
            const m = GLOBAL_CONFIG.REFERENCE_DATE.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && GLOBAL_CONFIG.REFERENCE_DATE.getDate() < birthDate.getDate())) {
                age--;
            }
        }
    }

    const supplements = {};
    const supplementsContainer = container.querySelector('.supplementary-products-container');
    if (supplementsContainer) {
        supplementsContainer.querySelectorAll('.product-section').forEach(section => {
            const checkbox = section.querySelector('input[type="checkbox"]');
            if (!checkbox || !checkbox.checked) return;
            const prodId = checkbox.dataset.productId;
            if (!prodId) return;

            supplements[prodId] = {
                stbh: parseFormattedNumber(section.querySelector(`.${prodId}-stbh`)?.value),
                program: section.querySelector(`.${prodId}-program`)?.value,
                // Add any other specific fields here if needed in the future
            };
        });
    }

    return {
        id: container.id,
        container: container,
        isMain: isMain,
        isMdpOther,
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
// ===== CORE LOGIC & CALCULATIONS
// ===================================================================================

function performCalculations(state) {
    const fees = { baseMain: 0, extra: 0, totalSupp: 0, byPerson: {} };

    fees.baseMain = calculateMainPremium(state.mainPerson, state.mainProduct);
    fees.extra = state.mainProduct.extraPremium;
    
    const mainProductConfig = PRODUCT_CATALOG[state.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;
    
    const suppPersons = noSuppInsured ? [] : state.supplementaryPersons;
    let allPersons = [state.mainPerson, ...suppPersons].filter(p => p);

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
            // Pre-calculate total hospital support STBH from other people
            const currentTotalHospitalStbh = allPersons.reduce((total, p) => {
                return total + (p.id !== person.id ? (p.supplements.HOSPITAL_SUPPORT?.stbh || 0) : 0);
            }, 0);

            const fee = calculateRiderPremium(prodId, person, fees.baseMain, currentTotalHospitalStbh);
            personSuppFee += fee;
            fees.byPerson[person.id].suppDetails[prodId] = fee;
            if (prodId === 'HOSPITAL_SUPPORT') {
                totalHospitalSupportStbh += person.supplements[prodId].stbh;
            }
        });
        fees.byPerson[person.id].supp = personSuppFee;
        fees.totalSupp += personSuppFee;
    });

    // --- MDP 3.0 Calculation ---
    // This must be done last as it depends on all other premiums.
    const mdpTargetId = state.mdpPerson.id;
    if (mdpTargetId) {
        const mdpFee = calculateRiderPremium('MDP_3_0', state.mdpPerson, fees.baseMain, totalHospitalSupportStbh, allPersons);
        if (mdpFee > 0) {
            fees.totalSupp += mdpFee;
            const targetPersonId = mdpTargetId === 'other' ? state.mdpPerson.info?.id : mdpTargetId;
            if (targetPersonId) {
                if (!fees.byPerson[targetPersonId]) {
                    fees.byPerson[targetPersonId] = { main: 0, supp: 0, total: 0, suppDetails: {} };
                }
                fees.byPerson[targetPersonId].supp += mdpFee;
                fees.byPerson[targetPersonId].suppDetails.MDP_3_0 = mdpFee;
            }
        }
    }

    // --- Final Totals ---
    fees.totalMain = fees.baseMain + fees.extra;
    fees.total = fees.totalMain + fees.totalSupp;

    return fees;
}

function calculateMainPremium(customer, productInfo) {
    const { key: productKey, stbh, premium: enteredPremium, program: programKey } = productInfo;
    const productConfig = PRODUCT_CATALOG[productKey];
    if (!productConfig) return 0;
    
    const calcConfig = productConfig.calculation;
    let premium = 0;

    switch (calcConfig.method) {
        case 'fromInput':
            premium = enteredPremium;
            break;

        case 'ratePer1000StbhByProgram':
            if (stbh === 0 || !programKey) return 0;
            const programConfig = productConfig.programs.options.find(p => p.key === programKey);
            if (!programConfig || !programConfig.rateTableRef) return 0;

            const rateTableRefParts = programConfig.rateTableRef.split('.');
            let rateTable = product_data;
            for (const part of rateTableRefParts) {
                rateTable = rateTable ? rateTable[part] : undefined;
            }
            if (!rateTable) return 0;

            const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
            const rate = rateTable.find(r => r.age === customer.age)?.[genderKey] || 0;
            premium = (stbh / 1000) * rate;
            break;

        case 'package':
            const underlyingKey = productConfig.packageConfig.underlyingMainProduct;
            const fixedValues = productConfig.packageConfig.fixedValues;
            const underlyingConfig = PRODUCT_CATALOG[underlyingKey];
            if (!underlyingConfig) return 0;

            // Get payment term for the underlying product from its program options
            const program = underlyingConfig.programs.options.find(p => p.key == fixedValues.paymentTerm);

            const packageProductInfo = {
                key: underlyingKey,
                stbh: fixedValues.stbh,
                premium: 0,
                program: program?.key || ''
            };
            return calculateMainPremium(customer, packageProductInfo);
    }
    return roundDownTo1000(premium);
}

function calculateRiderPremium(prodId, customer, mainPremium, totalHospitalSupportStbh, allPersonsForMdp = []) {
    const prodConfig = PRODUCT_CATALOG[prodId];
    const customerData = (prodId === 'MDP_3_0' && customer.id === 'other') ? customer.info : customer;
    if (!prodConfig || !customerData) return 0;

    const { eligibility, validationRules } = prodConfig.rules;
    if (!checkEligibility(customerData, eligibility)) return 0;

    const { calculation } = prodConfig;
    const { stbh } = customerData.supplements[prodId] || {};
    const genderKey = customerData.gender === 'Nữ' ? 'nu' : 'nam';
    let premium = 0;

    switch (calculation.method) {
        case 'healthSclLookup': {
            const renewalMax = eligibility.find(r => r.renewalMax)?.renewalMax || 99;
            if (customerData.age > renewalMax) return 0;
            const { program } = customerData.supplements.HEALTH_SCL || {};
            if (!program) return 0;
            
            const ageBandIndex = product_data.health_scl_rates.age_bands.findIndex(b => customerData.age >= b.min && customerData.age <= b.max);
            if (ageBandIndex === -1) return 0;

            let totalPremium = 0;
            // The method is now dynamic, so we check which components are selected.
            // Main component (HEALTH_SCL)
            if (prodId === 'HEALTH_SCL') {
                totalPremium += product_data.health_scl_rates.main_vn?.[ageBandIndex]?.[program] || 0;
            }
            // Outpatient (OUTPATIENT_SCL)
            if (prodId === 'OUTPATIENT_SCL') {
                totalPremium += product_data.health_scl_rates.outpatient?.[ageBandIndex]?.[program] || 0;
            }
            // Dental (DENTAL_SCL)
            if (prodId === 'DENTAL_SCL') {
                 totalPremium += product_data.health_scl_rates.dental?.[ageBandIndex]?.[program] || 0;
            }
            premium = totalPremium;
            break;
        }
        case 'ratePer1000Stbh': {
            const renewalMax = eligibility.find(r => r.renewalMax)?.renewalMax || 99;
            if (customerData.age > renewalMax || !stbh) return 0;
            const rateTable = product_data[calculation.rateTableRef] || [];
            const rate = rateTable.find(r => customerData.age >= r.ageMin && customerData.age <= r.ageMax)?.[genderKey] || 0;
            premium = (stbh / 1000) * rate;
            break;
        }
        case 'ratePer1000StbhByRiskGroup': {
            const renewalMax = eligibility.find(r => r.renewalMax)?.renewalMax || 99;
            if (customerData.age > renewalMax || !stbh || !customerData.riskGroup) return 0;
            const rateTable = product_data[calculation.rateTableRef] || {};
            const rate = rateTable[customerData.riskGroup] || 0;
            premium = (stbh / 1000) * rate;
            break;
        }
        case 'ratePer100Stbh': {
            const renewalMax = eligibility.find(r => r.renewalMax)?.renewalMax || 99;
            if (customerData.age > renewalMax || !stbh) return 0;
            const rateTable = product_data[calculation.rateTableRef] || [];
            const rate = rateTable.find(r => customerData.age >= r.ageMin && customerData.age <= r.ageMax)?.rate || 0;
            premium = (stbh / 100) * rate;
            break;
        }
        // Special case for MDP
        case 'ratePer1000Stbh':
            if (calculation.stbhCalculation?.method === 'sumPremiumsOfPolicy') {
                let stbhForMdp = 0;
                const config = calculation.stbhCalculation.config;

                allPersonsForMdp.forEach(p => {
                    if (p.isMain) {
                        stbhForMdp += appState.fees.baseMain; // Always include main base premium
                    }
                    if (p.id !== customerData.id || config.includePolicyOwnerRiders) {
                        for (const riderId in p.supplements) {
                            if (riderId !== 'MDP_3_0') { // Exclude MDP itself
                                stbhForMdp += appState.fees.byPerson[p.id]?.suppDetails[riderId] || 0;
                            }
                        }
                    }
                });

                if (stbhForMdp <= 0) return 0;
                const rateTable = product_data[calculation.rateTableRef] || [];
                const rate = rateTable.find(r => customerData.age >= r.ageMin && customerData.age <= r.ageMax)?.[genderKey] || 0;
                premium = (stbhForMdp / 1000) * rate;
            }
            break;
    }

    return roundDownTo1000(premium);
}

// NOTE: This function is complex. It's adapted to use the new data structure but the core logic remains.
function calculateAccountValueProjection(mainPerson, mainProduct, basePremium, extraPremium, targetAge, customInterestRate, paymentFrequency) {
    const { gender, age: initialAge } = mainPerson;
    const { key: productKey, stbh: stbhInitial = 0, paymentTerm } = mainProduct;
    const productConfig = PRODUCT_CATALOG[productKey];
    if (!productConfig || !productConfig.cashValueConfig.enabled) return null;
    
    const { initial_fees, guaranteed_interest_rates, admin_fees, persistency_bonus } = investment_data;
    const costOfInsuranceRates = productConfig.cashValueConfig.sarIncludesExtraPremium ? investment_data.pul_cost_of_insurance_rates : investment_data.mul_cost_of_insurance_rates;

    const totalYears = targetAge - initialAge + 1;
    const totalMonths = totalYears * 12;
    const parsedCustom = parseFloat(customInterestRate) || 0;
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

    const startDate = GLOBAL_CONFIG.REFERENCE_DATE || new Date();
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;

    const getCalendarYearFromStart = (month) => {
        return startYear + Math.floor((startMonth - 2 + month) / 12);
    };

    const getStbhForPolicyYear = (policyYear) => {
        // This logic is specific to Khoe Binh An / Vung Tuong Lai for now
        if (['KHOE_BINH_AN', 'VUNG_TUONG_LAI'].includes(productKey)) {
            const initial = Number(stbhInitial) || 0;
            if (policyYear === 1) return initial;
            if (policyYear >= 2 && policyYear <= 11) {
                return initial + Math.round(initial * 0.05 * (policyYear - 1));
            }
            return initial + Math.round(initial * 0.5);
        }
        return Number(stbhInitial) || 0;
    };
    const getAdminFeeForYear = (calendarYear) => admin_fees[calendarYear] ?? admin_fees.default ?? 0;

    for (let month = 1; month <= totalMonths; month++) {
        const policyYear = Math.floor((month - 1) / 12) + 1;
        const attainedAge = initialAge + policyYear - 1;
        const genderKey = gender === 'Nữ' ? 'nu' : 'nam';
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
                premiumIn = basePremiumPerPeriod + extraPremiumPerPeriod;
                const initialFeeRateBase = (initial_fees[productKey] || {})[policyYear] ?? 0;
                const extraInitRate = initial_fees.EXTRA ?? 0;
                initialFee = roundVND((basePremiumPerPeriod * initialFeeRateBase) + (extraPremiumPerPeriod * extraInitRate));
            }

            const investmentAmount = currentAccountValue + premiumIn - initialFee;
            const adminFee = getAdminFeeForYear(calendarYear);
            const stbhCurrent = getStbhForPolicyYear(policyYear);
            
            const riskRateRecord = costOfInsuranceRates.find(r => r.age === attainedAge);
            const riskRate = riskRateRecord?.[genderKey] ?? 0;
            
            const sarBase = productConfig.cashValueConfig.sarIncludesExtraPremium ? investmentAmount : (investmentAmount - (isPaymentMonth ? extraPremiumPerPeriod : 0));
            const sumAtRisk = Math.max(0, stbhCurrent - sarBase);

            let costOfInsurance = roundVND((sumAtRisk * riskRate) / 1000 / 12);
            const netInvestmentAmount = investmentAmount - adminFee - costOfInsurance;

            let interestRateYearly = 0;
            const guaranteedRate = guaranteed_interest_rates[policyYear] ?? guaranteed_interest_rates.default ?? 0;

            if (key === 'guaranteed') {
                interestRateYearly = guaranteedRate;
            } else if (key === 'customCapped') {
                interestRateYearly = (policyYear <= 20) ? Math.max(customRate, guaranteedRate) : guaranteedRate;
            } else {
                interestRateYearly = Math.max(customRate, guaranteedRate);
            }

            const monthlyInterestRate = Math.pow(1 + interestRateYearly, 1 / 12) - 1;
            let interest = roundVND(netInvestmentAmount * monthlyInterestRate);

            let bonus = 0;
            const isLastMonthOfPolicyYear = (month % 12 === 0);
            if (isLastMonthOfPolicyYear) {
                const bonusInfo = persistency_bonus.find(b => b.year === policyYear);
                if (bonusInfo && paymentTerm >= bonusInfo.year) {
                    bonus = annualBasePremium * bonusInfo.rate;
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


// ===================================================================================
// ===== UI RENDERING
// ===================================================================================

function renderUI(isMainProductValid) {
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;
    document.getElementById('supplementary-insured-section').classList.toggle('hidden', noSuppInsured);
    
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
    
    renderMdpSection(isMainProductValid, noSuppInsured);
    updateSupplementaryAddButtonState(isMainProductValid);
    updateSummaryUI(appState.fees, isMainProductValid);
}

let lastRenderedMainProduct = { key: null, age: null };
function renderMainProductSection(customer, mainProductKey) {
    // Update eligibility of options in dropdown
    document.querySelectorAll('#main-product option').forEach(option => {
        const productConfig = PRODUCT_CATALOG[option.value];
        if (productConfig) {
            option.disabled = !checkEligibility(customer, productConfig.rules.eligibility);
        }
    });
    
    if (lastRenderedMainProduct.key === mainProductKey && lastRenderedMainProduct.age === customer.age) return;
    lastRenderedMainProduct = { key: mainProductKey, age: customer.age };

    const container = document.getElementById('main-product-options');
    container.innerHTML = '';
    const productConfig = PRODUCT_CATALOG[mainProductKey];
    if (!productConfig) {
        document.getElementById('main-product-fee-display').textContent = '';
        return;
    }

    // Handle Packages
    if (productConfig.packageConfig) {
        const fixedStbh = productConfig.packageConfig.fixedValues.stbh;
        container.innerHTML = `
            <div>
              <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
              <input type="text" id="main-stbh" class="form-input bg-gray-100" value="${formatCurrency(fixedStbh)}" disabled>
            </div>`;
        return;
    }

    let optionsHtml = '';
    // Generate program selector if needed
    if (productConfig.programs?.enabled) {
        const programOptions = productConfig.programs.options
            .filter(opt => !opt.eligibility || checkEligibility(customer, opt.eligibility))
            .map(opt => `<option value="${opt.key}">${opt.label}</option>`).join('');
        optionsHtml += `<div>
            <label for="main-program" class="font-medium text-gray-700 block mb-1">${productConfig.programs.label} <span class="text-red-600">*</span></label>
            <select id="main-program" class="form-select">${programOptions}</select>
        </div>`;
    }

    // Generate inputs from `validationRules`
    const rules = productConfig.rules.validationRules || {};
    const stbhRule = rules.stbh || (rules.anyOf ? rules.anyOf.find(r => r.stbh)?.stbh : null);
    if (stbhRule) {
        optionsHtml += `<div>
            <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH) <span class="text-red-600">*</span></label>
            <input type="text" id="main-stbh" class="form-input" placeholder="VD: 1.000.000.000">
            <div id="stbh-hint" class="text-sm text-gray-500 mt-1">${stbhRule.hint || ''}</div>
        </div>`;
    }
    
    if (rules.premium) {
         optionsHtml += `<div>
            <label for="main-premium" class="font-medium text-gray-700 block mb-1">Phí sản phẩm chính <span class="text-red-600">*</span></label>
            <input type="text" id="main-premium" class="form-input" placeholder="Nhập phí">
            <div id="premium-hint" class="text-sm text-gray-500 mt-1">${rules.premium.hint || ''}</div>
        </div>`;
    }

    if (rules.paymentTerm) {
        const min = rules.paymentTerm.min || 4;
        const maxFunc = rules.paymentTerm.maxFunction ? createFunction(rules.paymentTerm.maxFunction, 'age') : (age) => 100 - age;
        const max = maxFunc(customer.age);
        optionsHtml += `<div>
            <label for="payment-term" class="font-medium text-gray-700 block mb-1">Thời gian đóng phí (năm) <span class="text-red-600">*</span></label>
            <input type="number" id="payment-term" class="form-input" placeholder="VD: 20" min="${min}" max="${max}">
            <div id="payment-term-hint" class="text-sm text-gray-500 mt-1">Nhập từ ${min} đến ${max} năm</div>
        </div>`;
    }

    if (rules.extraPremium) {
        optionsHtml += `<div>
            <label for="extra-premium" class="font-medium text-gray-700 block mb-1">Phí đóng thêm</label>
            <input type="text" id="extra-premium" class="form-input" placeholder="VD: 10.000.000">
            <div id="extra-premium-hint" class="text-sm text-gray-500 mt-1">${rules.extraPremium.hint || ''}</div>
        </div>`;
    }
    
    container.innerHTML = optionsHtml;

    // Set default values after rendering
    if (productConfig.programs?.enabled) {
        const programKey = appState.mainProduct.program || productConfig.programs.options[0]?.key;
        const selectedProgram = productConfig.programs.options.find(p => p.key === programKey);
        document.getElementById('main-program').value = programKey;
        if (selectedProgram?.defaultPaymentTerm && !document.getElementById('payment-term').value) {
            document.getElementById('payment-term').value = selectedProgram.defaultPaymentTerm;
        }
    }
}

function renderSupplementaryProductsForPerson(customer, mainProductKey, mainPremium, container, isMainProductValid) {
    const mainProductConfig = PRODUCT_CATALOG[mainProductKey];
    if (!mainProductConfig) return;

    const allowedRiders = mainProductConfig.rules.riderLimits.enabled ? mainProductConfig.rules.riderLimits.allowed : Object.keys(PRODUCT_CATALOG).filter(k => PRODUCT_CATALOG[k].type === 'rider');
    let anyStateChanged = false;

    Object.values(PRODUCT_CATALOG).filter(p => p.type === 'rider' && p.id !== 'MDP_3_0').forEach(prodConfig => {
        const prodId = prodConfig.id;
        const section = container.querySelector(`.${prodId}-section`);
        if (!section) return;

        let isVisible = allowedRiders.includes(prodId);
        
        // Handle dependencies
        if (prodConfig.dependencies?.parentRiderRequired) {
            const parentId = prodConfig.dependencies.parentRiderRequired;
            const parentChecked = container.querySelector(`.${parentId}-checkbox`)?.checked;
            isVisible = isVisible && parentChecked;
        }

        section.classList.toggle('hidden', !isVisible);
        if (!isVisible) return;
        
        const isEligible = checkEligibility(customer, prodConfig.rules.eligibility);
        const checkbox = section.querySelector(`.${prodId}-checkbox`);
        const options = section.querySelector('.product-options');

        checkbox.disabled = !isEligible || !isMainProductValid;
        section.classList.toggle('opacity-50', checkbox.disabled);
        
        if (!isEligible && checkbox.checked) {
            checkbox.checked = false;
            anyStateChanged = true;
        }
        
        options.classList.toggle('hidden', !checkbox.checked);
        
        const fee = appState.fees.byPerson[customer.id]?.suppDetails?.[prodId] || 0;
        section.querySelector('.fee-display').textContent = fee > 0 ? `Phí: ${formatCurrency(fee)}` : '';

        // Specific logic for HEALTH_SCL programs
        if (prodId === 'HEALTH_SCL' && checkbox.checked) {
            const programSelect = section.querySelector(`.${prodId}-program`);
            const thresholds = prodConfig.dependencies.mainPremiumThresholds.thresholds;
            const applicableTier = thresholds.find(t => mainPremium >= t.minPremium && (!t.maxPremium || mainPremium <= t.maxPremium));
            const allowedPrograms = applicableTier ? applicableTier.allowed : [];

            programSelect.querySelectorAll('option').forEach(opt => {
                opt.disabled = !allowedPrograms.includes(opt.value);
            });

            if (programSelect.options[programSelect.selectedIndex]?.disabled) {
                programSelect.value = allowedPrograms[0] || '';
                anyStateChanged = true;
            }
        }
    });

    if (anyStateChanged) runWorkflowDebounced();
}

function updateSummaryUI(fees, isValid = true) {
    const f = fees || {};
    const fmt = (n) => formatDisplayCurrency(roundDownTo1000(n));
    const totalDisplay = isValid ? (f.total || 0) : 0;

    document.getElementById('summary-total').textContent = fmt(totalDisplay);
    document.getElementById('main-insured-main-fee').textContent = fmt(f.baseMain);
    document.getElementById('main-insured-extra-fee').textContent = fmt(f.extra);
    document.getElementById('summary-supp-fee').textContent = fmt(f.totalSupp);
    
    // Update frequency breakdown
    const freqBox = document.getElementById('frequency-breakdown');
    const freqSelValue = document.getElementById('payment-frequency').value;
    const periods = freqSelValue === 'half' ? 2 : (freqSelValue === 'quarter' ? 4 : 1);
    freqBox.classList.toggle('hidden', periods === 1);

    if (periods > 1) {
        const factor = periods === 2 ? GLOBAL_CONFIG.paymentFrequencyFactors.half : GLOBAL_CONFIG.paymentFrequencyFactors.quarter;
        const mainPerPeriod = roundDownTo1000(f.baseMain / periods);
        const extraPerPeriod = roundDownTo1000(f.extra / periods);
        const suppPerPeriod = roundDownTo1000(f.totalSupp * factor / periods);
        const totalPerPeriod = mainPerPeriod + extraPerPeriod + suppPerPeriod;
        const totalAnnualEq = totalPerPeriod * periods;
        const diff = totalAnnualEq - f.total;
        
        document.getElementById('freq-main').textContent = fmt(mainPerPeriod);
        document.getElementById('freq-extra').textContent = fmt(extraPerPeriod);
        document.getElementById('freq-supp-total').textContent = fmt(suppPerPeriod);
        document.getElementById('freq-total-period').textContent = fmt(totalPerPeriod);
        document.getElementById('freq-total-year-equivalent').textContent = fmt(totalAnnualEq);
        document.getElementById('freq-total-year').textContent = fmt(f.total);
        document.getElementById('freq-diff').textContent = fmt(diff);
    }

    // Update supplementary list
    const suppListContainer = document.getElementById('supp-insured-summaries');
    let suppListHtml = '';
    const allPersonsAndMdp = [...appState.supplementaryPersons];
    if (appState.mdpPerson.id === 'other' && appState.mdpPerson.info) {
        allPersonsAndMdp.push(appState.mdpPerson.info);
    }

    [appState.mainPerson, ...allPersonsAndMdp].forEach(p => {
        const personFee = fees.byPerson[p.id];
        if (personFee?.supp > 0) {
            suppListHtml += `<div class="flex justify-between">
                <span>${sanitizeHtml(p.name)}</span>
                <span>${fmt(personFee.supp)}</span>
            </div>`;
        }
    });
    suppListContainer.innerHTML = suppListHtml;
}

function updateMainProductFeeDisplay(basePremium) {
    const el = document.getElementById('main-product-fee-display');
    if (el) {
        el.textContent = basePremium > 0 ? `Phí SP chính: ${formatCurrency(basePremium)}` : '';
    }
}


// ===================================================================================
// ===== VALIDATION
// ===================================================================================

function runAllValidations(state) {
    clearAllErrors();
    let isValid = true;
    if (!validateMainPersonInputs(state.mainPerson)) isValid = false;
    
    const mainProductConfig = PRODUCT_CATALOG[state.mainProduct.key];
    if (!mainProductConfig) {
        setFieldError(document.getElementById('main-product'), 'Vui lòng chọn sản phẩm chính');
        return false;
    }
    
    if (!validateProductInputs(state.mainPerson, state.mainProduct, mainProductConfig, state.fees.baseMain)) isValid = false;

    const allPersons = [state.mainPerson, ...state.supplementaryPersons].filter(p => p);
    let totalHospitalSupportStbh = 0;
    
    allPersons.forEach(p => {
        if (!p.isMain && !validateSupplementaryPersonInputs(p)) isValid = false;
        
        for (const prodId in p.supplements) {
            const riderConfig = PRODUCT_CATALOG[prodId];
            const riderValues = p.supplements[prodId];
            if (!validateProductInputs(p, riderValues, riderConfig, state.fees.baseMain, totalHospitalSupportStbh)) isValid = false;
            if (prodId === 'HOSPITAL_SUPPORT') {
                totalHospitalSupportStbh += riderValues.stbh;
            }
        }
    });

    if (!validateTargetAge(state.mainPerson, state.mainProduct)) isValid = false;

    return isValid;
}

function validateProductInputs(person, values, config, baseMainPremium, totalHospitalSupportStbh = 0) {
    let ok = true;
    const rules = config.rules.validationRules || {};
    const container = config.type === 'main' ? document.getElementById('main-product-options') : person.container;
    if (!container) return true;

    // Handle anyOf rule (special case for PUL)
    if (rules.anyOf) {
        const isMet = rules.anyOf.some(rule => {
            const key = Object.keys(rule)[0]; // 'stbh' or 'premium'
            const condition = rule[key];
            const value = key === 'stbh' ? values.stbh : baseMainPremium;
            return value >= condition.min;
        });
        if (!isMet) {
            const stbhEl = container.querySelector('#main-stbh');
            setFieldError(stbhEl, rules.anyOf[1].premium.message); // Show combined message
            ok = false;
        }
    }

    // Handle individual field rules
    for (const key in rules) {
        if (key === 'anyOf') continue;
        
        const rule = rules[key];
        const value = values[key];
        const el = container.querySelector(`#${key}, .${config.id}-${key}`);
        if (!el) continue;

        let error = '';
        if (rule.min && value < rule.min) error = rule.message || `Tối thiểu ${formatCurrency(rule.min)}`;
        else if (rule.max && value > rule.max) error = rule.message || `Tối đa ${formatCurrency(rule.max)}`;
        else if (rule.multipleOf && value % rule.multipleOf !== 0) error = rule.hint || `Phải là bội số của ${formatCurrency(rule.multipleOf)}`;
        else if (rule.maxFunction) {
            const maxFunc = createFunction(rule.maxFunction, 'age');
            const maxVal = maxFunc(person.age);
            if (value > maxVal) error = `Tối đa ${maxVal}`;
        }
        else if (rule.stbhFactorRef) { // Special case for MUL premium
            const factorRow = product_data[rule.stbhFactorRef]?.find(f => person.age >= f.ageMin && person.age <= f.ageMax);
            if (factorRow && values.stbh > 0) {
                const minFee = roundDownTo1000(values.stbh / factorRow.maxFactor);
                const maxFee = roundDownTo1000(values.stbh / factorRow.minFactor);
                if (value < minFee || value > maxFee) error = rule.stbhFactorMessage || 'Phí không hợp lệ';
            }
        } else if (config.id === 'HOSPITAL_SUPPORT' && key === 'stbh') {
            const maxFormula = createFunction(config.calculation.stbhCalculation.config.maxFormula, 'mainPremium');
            const maxSupportTotal = maxFormula(baseMainPremium);
            const maxByAge = person.age >= 18 ? rule.maxByAge.from18 : rule.maxByAge.under18;
            const remaining = maxSupportTotal - totalHospitalSupportStbh;
            if (value > maxByAge || value > remaining) error = 'Vượt quá giới hạn cho phép';
        }

        if (error) {
            setFieldError(el, error);
            ok = false;
        }
    }
    return ok;
}

function updateAllHints(state) {
    const allPersons = [state.mainPerson, ...state.supplementaryPersons].filter(p => p);
    let totalHospitalSupportStbh = 0;

    // Main product hints
    const mainConfig = PRODUCT_CATALOG[state.mainProduct.key];
    if (mainConfig?.rules.validationRules) {
        updateHintsForProduct(state.mainPerson, state.mainProduct, mainConfig, state.fees.baseMain, totalHospitalSupportStbh);
    }
    
    // Rider hints
    allPersons.forEach(p => {
        for (const prodId in p.supplements) {
            const riderConfig = PRODUCT_CATALOG[prodId];
            const riderValues = p.supplements[prodId];
            if (riderConfig?.rules.validationRules) {
                updateHintsForProduct(p, riderValues, riderConfig, state.fees.baseMain, totalHospitalSupportStbh);
            }
            if (prodId === 'HOSPITAL_SUPPORT') {
                totalHospitalSupportStbh += riderValues.stbh || 0;
            }
        }
    });
}

function updateHintsForProduct(person, values, config, baseMainPremium, totalHospitalSupportStbh) {
    const rules = config.rules.validationRules || {};
    const container = config.type === 'main' ? document.getElementById('main-product-options') : person.container;
    if (!container) return;

    for (const key in rules) {
        const rule = rules[key];
        const hintEl = container.querySelector(`#${key}-hint, .${config.id}-${key}-hint`);
        if (!hintEl) continue;

        if (rule.hintFunction) {
            const hintFunc = createFunction(rule.hintFunction, 'stbh', 'customer', 'basePremium', 'totalHospitalSupportStbh');
            const hintText = hintFunc(values.stbh, person, baseMainPremium, totalHospitalSupportStbh);
            hintEl.innerHTML = hintText;
        } else if (rule.hint) {
            hintEl.innerHTML = rule.hint;
        }
    }
}


// Other validation functions (mostly unchanged)
function validateMainPersonInputs(person) {
    if (!person || !person.container) return true;
    let ok = true;
    const { container } = person;
    if (!person.name) { setFieldError(container.querySelector('.name-input'), 'Vui lòng nhập họ tên'); ok = false; }
    if (!validateDobField(container.querySelector('.dob-input'))) ok = false;
    if (!person.riskGroup) { setFieldError(container.querySelector('.occupation-input'), 'Vui lòng chọn nghề nghiệp'); ok = false; }
    return ok;
}
function validateSupplementaryPersonInputs(person) {
    if (!person || !person.container) return true;
    let ok = true;
    const { container } = person;
    if (!person.name) { setFieldError(container.querySelector('.name-input'), 'Vui lòng nhập họ tên'); ok = false; }
    if (!validateDobField(container.querySelector('.dob-input'))) ok = false;
    if (!person.riskGroup) { setFieldError(container.querySelector('.occupation-input'), 'Vui lòng chọn nghề nghiệp'); ok = false; }
    return ok;
}
function validateTargetAge(mainPerson, mainProductInfo) {
  const input = document.getElementById('target-age-input');
  const productConfig = PRODUCT_CATALOG[mainProductInfo.key];
  if (!input || !productConfig || !productConfig.cashValueConfig.enabled) { if(input) clearFieldError(input); return true; }
  
  const val = parseInt((input.value || '').trim(), 10);
  const age = mainPerson?.age || 0;
  const paymentTerm = mainProductInfo.paymentTerm || 0;
  if (!age || !paymentTerm) { clearFieldError(input); return true; }

  const minAllowed = age + paymentTerm - 1;
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
    if (!v) { setFieldError(input, 'Vui lòng nhập ngày sinh'); return false; }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(v)) { setFieldError(input, 'Nhập DD/MM/YYYY'); return false; }
    const [dd, mm, yyyy] = v.split('/').map(n => parseInt(n, 10));
    const d = new Date(yyyy, mm - 1, dd);
    if (isNaN(d.getTime()) || d.getFullYear() !== yyyy || d.getMonth() !== (mm - 1) || d.getDate() !== dd || d > GLOBAL_CONFIG.REFERENCE_DATE) {
        setFieldError(input, 'Ngày sinh không hợp lệ'); return false;
    }
    clearFieldError(input);
    return true;
}

function setFieldError(input, message) { 
    if (!input) return;
    let container = input.closest('div');
    if (!container) container = input.parentElement;
    let err = container.querySelector('.field-error');
    if (!err) {
      err = document.createElement('p');
      err.className = 'field-error text-sm text-red-600 mt-1';
      container.appendChild(err);
    }
    err.textContent = message || '';
    input.classList.toggle('border-red-500', !!message);
    err.classList.toggle('hidden', !message);
}

function clearFieldError(input) { setFieldError(input, ''); }

function clearAllErrors() { 
    document.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; el.classList.add('hidden'); });
    document.querySelectorAll('.border-red-500').forEach(el => el.classList.remove('border-red-500'));
}

function checkEligibility(person, eligibilityRules) {
    if (!eligibilityRules || !person) return true;
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
// ===== INITIALIZATION & EVENT BINDING
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
    initViewerModal();
});

function runWorkflow() {
    updateStateFromUI();
    // First, calculate fees based on current state (might have invalid inputs)
    appState.fees = performCalculations(appState);
    // Then, run validation. This might show errors but the calculated fees are needed for hints.
    const isMainProductValid = runAllValidations(appState);
    // Update hints which may depend on calculated fees
    updateAllHints(appState);
    // Finally, render the UI with the final state and validation status.
    renderUI(isMainProductValid);
}

const runWorkflowDebounced = debounce(runWorkflow, 50);

function initMainProductSelect() {
    const select = document.getElementById('main-product');
    Object.values(PRODUCT_CATALOG)
        .filter(p => p.type === 'main')
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .forEach(config => {
            const option = document.createElement('option');
            option.value = config.id;
            option.textContent = config.displayName;
            select.appendChild(option);
        });
}

function attachGlobalListeners() {
    document.body.addEventListener('change', (e) => {
        if (e.target.id === 'main-product') {
            lastRenderedMainProduct.key = null; // Force re-render of main product section
        }
        runWorkflow();
    });

    document.body.addEventListener('input', (e) => {
        if (e.target.matches('input[type="text"]:not(.dob-input):not(.name-input):not(.occupation-input)')) {
            formatNumberInput(e.target);
        }
        runWorkflowDebounced();
    });

    document.body.addEventListener('focusout', (e) => {
        if (e.target.matches('input[type="text"]')) {
            roundInputToThousand(e.target);
            if (e.target.classList.contains('dob-input')) {
                // DOB change has a big impact, run full workflow immediately
                runWorkflow();
            }
        }
    }, true);
}

function initPerson(container, isMain = false) {
    if (!container) return;
    initDateFormatter(container.querySelector('.dob-input'));
    initOccupationAutocomplete(container.querySelector('.occupation-input'), container);
    
    const suppProductsContainer = container.querySelector('.supplementary-products-container');
    if (suppProductsContainer) {
        suppProductsContainer.innerHTML = generateSupplementaryProductsHtml();
    }
}

function initSupplementaryButton() {
    document.getElementById('add-supp-insured-btn').addEventListener('click', () => {
        if (appState.supplementaryPersons.length >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) return;
        const newPersonDiv = document.createElement('div');
        newPersonDiv.id = `person-container-supp${Date.now()}`;
        newPersonDiv.innerHTML = document.getElementById('supplementary-person-template').innerHTML;
        const count = appState.supplementaryPersons.length + 1;
        newPersonDiv.querySelector('[data-template-id="title"]').textContent = `NĐBH Bổ Sung ${count}`;
        document.getElementById('supplementary-insured-container').appendChild(newPersonDiv);
        initPerson(newPersonDiv, false);
        newPersonDiv.querySelector('.remove-supp-btn').addEventListener('click', () => {
            newPersonDiv.remove();
            runWorkflow();
        });
        runWorkflow();
    });
}

function updateSupplementaryAddButtonState(isMainProductValid) {
    const btn = document.getElementById('add-supp-insured-btn');
    if (!btn) return;
    const count = appState.supplementaryPersons.length;
    const disabled = count >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED || !isMainProductValid;
    btn.disabled = disabled;
    btn.classList.toggle('opacity-50', disabled);
    btn.classList.toggle('cursor-not-allowed', disabled);
}

function generateSupplementaryProductsHtml() {
    return Object.values(PRODUCT_CATALOG)
        .filter(p => p.type === 'rider' && p.id !== 'MDP_3_0')
        .sort((a,b) => a.displayOrder - b.displayOrder)
        .map(prodConfig => {
            const prodId = prodConfig.id;
            let optionsHtml = '';
            
            if (prodConfig.programs?.enabled) {
                const programOptions = prodConfig.programs.options.map(opt => `<option value="${opt.key}">${opt.label}</option>`).join('');
                optionsHtml += `<div>
                    <label class="font-medium text-gray-700 block mb-1">${prodConfig.programs.label}</label>
                    <select class="form-select ${prodId}-program">${programOptions}</select>
                </div>`;
            }

            if (prodConfig.rules.validationRules?.stbh) {
                const rule = prodConfig.rules.validationRules.stbh;
                optionsHtml += `<div>
                  <label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
                  <input type="text" class="form-input ${prodId}-stbh" placeholder="Nhập STBH">
                  <div class="${prodId}-stbh-hint text-sm text-gray-500 mt-1">${rule.hint || ''}</div>
                </div>`;
            }
            
            // Special case for HEALTH_SCL sub-options
            if (prodConfig.dependencies?.subRiders) {
                 optionsHtml += `<div><span class="font-medium text-gray-700 block mb-2">Quyền lợi tùy chọn:</span><div class="space-y-2">` + 
                    prodConfig.dependencies.subRiders.map(subRiderId => {
                        const subRiderConfig = PRODUCT_CATALOG[subRiderId];
                        return `<label class="flex items-center space-x-3 cursor-pointer">
                            <input type="checkbox" data-product-id="${subRiderId}" class="form-checkbox ${subRiderId}-checkbox">
                            <span>${subRiderConfig.displayName}</span>
                            <span class="${subRiderId}-fee ml-2 text-xs text-gray-600"></span>
                        </label>`;
                    }).join('') + `</div></div>`;
            }

            return `
            <div class="product-section ${prodId}-section">
              <label class="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" data-product-id="${prodId}" class="form-checkbox ${prodId}-checkbox">
                <span class="text-lg font-medium text-gray-800">${prodConfig.displayName}</span>
              </label>
              <div class="product-options hidden mt-3 pl-8 space-y-3">
                ${optionsHtml}
                <div class="text-right font-semibold text-aia-red fee-display min-h-[1.5rem]"></div>
              </div>
            </div>`;
    }).join('');
}


// Occupation, Date, Number formatters (mostly unchanged)
function initOccupationAutocomplete(input, container) {
  if (!input) return;
  const autocompleteContainer = container.querySelector('.occupation-autocomplete');
  const riskGroupSpan = container.querySelector('.risk-group-span');
  const applyOccupation = (occ) => {
    input.value = occ.name; input.dataset.group = occ.group;
    if (riskGroupSpan) riskGroupSpan.textContent = occ.group;
    clearFieldError(input); autocompleteContainer.classList.add('hidden');
    runWorkflow();
  };
  const renderList = (filtered) => {
    autocompleteContainer.innerHTML = '';
    if (!filtered.length) { autocompleteContainer.classList.add('hidden'); return; }
    filtered.forEach(occ => {
      const item = document.createElement('div');
      item.className = 'p-2 hover:bg-gray-100 cursor-pointer'; item.textContent = occ.name;
      item.addEventListener('mousedown', (ev) => { ev.preventDefault(); applyOccupation(occ); });
      autocompleteContainer.appendChild(item);
    });
    autocompleteContainer.classList.remove('hidden');
  };
  input.addEventListener('input', () => {
    const value = input.value.trim().toLowerCase();
    if (value.length < 2) { autocompleteContainer.classList.add('hidden'); return; }
    const filtered = product_data.occupations.filter(o => o.group > 0 && o.name.toLowerCase().includes(value));
    renderList(filtered);
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      autocompleteContainer.classList.add('hidden');
      const match = product_data.occupations.find(o => o.group > 0 && o.name.toLowerCase() === (input.value || '').trim().toLowerCase());
      if (!match) { input.dataset.group = ''; if(riskGroupSpan) riskGroupSpan.textContent = '...'; }
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
  if (!input || !input.classList.contains('form-input') || input.classList.contains('dob-input') || input.id === 'target-age-input' || input.id === 'custom-interest-rate-input') return;
  const raw = parseFormattedNumber(input.value || '');
  if (!raw) { input.value = ''; return; }
  const isHospitalDaily = input.classList.contains('HOSPITAL_SUPPORT-stbh');
  const rounded = isHospitalDaily ? Math.round(raw / 100000) * 100000 : roundDownTo1000(raw);
  input.value = formatCurrency(rounded);
}
function formatNumberInput(input) {
  if (!input || !input.value) return;
  const cursorPos = input.selectionStart;
  const originalLength = input.value.length;
  let value = input.value.replace(/[.,]/g, '');
  if (!isNaN(value) && value.length > 0) {
    const formatted = parseInt(value, 10).toLocaleString('vi-VN');
    input.value = formatted;
    const newLength = formatted.length;
    const newCursorPos = cursorPos + (newLength - originalLength);
    if(input.selectionStart) input.setSelectionRange(newCursorPos, newCursorPos);
  } else if (input.value !== '') {
    input.value = '';
  }
}

// ===================================================================================
// ===== MDP 3.0 UI MODULE
// ===================================================================================
function renderMdpSection(isMainProductValid, noSuppInsured) {
    const section = document.getElementById('mdp3-section');
    section.classList.toggle('hidden', noSuppInsured);
    section.classList.toggle('opacity-50', !isMainProductValid);
    section.classList.toggle('pointer-events-none', !isMainProductValid);
    if (noSuppInsured) return;

    const container = document.getElementById('mdp3-radio-list');
    const hasBeenInitialized = container.querySelector('input[name="mdp3-person"]');

    let optionsHtml = '';
    const persons = [appState.mainPerson, ...appState.supplementaryPersons].filter(p => p && !p.isMain); // MDP cannot be on main insured
    persons.forEach(p => {
        const isEligible = checkEligibility(p, PRODUCT_CATALOG.MDP_3_0.rules.eligibility);
        optionsHtml += `<label class="flex items-center space-x-2 ${!isEligible ? 'opacity-50' : ''}">
            <input type="radio" name="mdp3-person" value="${p.id}" ${!isEligible ? 'disabled' : ''}>
            <span>${sanitizeHtml(p.name)} ${!isEligible ? `(Tuổi ${p.age} - K.hợp lệ)`: ''}</span>
        </label>`;
    });
    optionsHtml += `<label class="flex items-center space-x-2">
        <input type="radio" name="mdp3-person" value="other">
        <span>Người khác (Bên mua bảo hiểm)</span>
    </label>`;

    const fee = appState.fees.byPerson[appState.mdpPerson.info?.id || appState.mdpPerson.id]?.suppDetails.MDP_3_0 || 0;
    container.innerHTML = `<p class="font-medium text-gray-700 mb-2">Bên Mua Bảo Hiểm là:</p><div class="space-y-2">${optionsHtml}</div>
    <div id="mdp3-other-form" class="hidden mt-4 p-3 border rounded bg-gray-50"></div>
    <div class="text-right font-semibold text-aia-red min-h-[1.5rem] mt-2">${fee > 0 ? `Phí: ${formatCurrency(fee)}` : ''}</div>`;

    // Restore state
    if (appState.mdpPerson.id) {
        const radio = container.querySelector(`input[value="${appState.mdpPerson.id}"]`);
        if (radio) radio.checked = true;
    }
    
    // Show "other" form if needed
    if (appState.mdpPerson.id === 'other') {
        const otherForm = document.getElementById('mdp3-other-form');
        otherForm.classList.remove('hidden');
        if (!otherForm.innerHTML.trim()) {
            otherForm.innerHTML = document.getElementById('supplementary-person-template').innerHTML;
            otherForm.querySelector('.person-container').id = 'mdp-other-person-container';
            otherForm.querySelector('[data-template-id="title"]').textContent = 'Thông tin Bên mua bảo hiểm';
            otherForm.querySelector('.remove-supp-btn').remove();
            otherForm.querySelector('.supplementary-products-container').parentElement.remove();
            initPerson(otherForm, false);
        }
    }
}


// ===================================================================================
// ===== SUMMARY MODAL & VIEWER
// ===================================================================================
// NOTE: These functions are largely ported from the previous version and adapted to the new state structure.

function initSummaryModal() {
    const modal = document.getElementById('summary-modal');
    document.getElementById('close-summary-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    updateTargetAgeDisplay();
    document.getElementById('main-product').addEventListener('change', updateTargetAgeDisplay);
    document.querySelector('#main-person-container .dob-input')?.addEventListener('input', debounce(updateTargetAgeDisplay, 200));
    document.body.addEventListener('change', (e) => {
        if (e.target.id === 'payment-term' || e.target.id === 'main-program') {
            updateTargetAgeDisplay();
        }
    });
}

function updateTargetAgeDisplay() {
    const mainPerson = appState.mainPerson;
    const mainProductInfo = appState.mainProduct;
    const input = document.getElementById('target-age-input');
    const productConfig = PRODUCT_CATALOG[mainProductInfo.key];

    if (!input || !mainPerson || typeof mainPerson.age !== 'number' || !productConfig || !productConfig.cashValueConfig.enabled) {
        document.getElementById('target-age-block').classList.add('hidden');
        return;
    }
    document.getElementById('target-age-block').classList.remove('hidden');

    const paymentTerm = mainProductInfo.paymentTerm;
    const minAge = mainPerson.age + paymentTerm - 1;
    const maxAge = 99;
    
    if (!paymentTerm || paymentTerm <= 0) {
        input.value = '';
    } else {
        const curVal = parseInt(input.value, 10) || 0;
        if (!curVal || curVal < minAge || curVal > maxAge) {
            input.value = maxAge;
        }
    }
}

function initViewerModal() {
    document.getElementById('btnFullViewer').addEventListener('click', (e) => {
        e.preventDefault();
        runWorkflow(); // Ensure state is up to date
        setTimeout(() => { // Allow UI to update after workflow
            if (runAllValidations(appState)) {
                openFullViewer();
            }
        }, 50);
    });

    const modal = document.getElementById('viewer-modal');
    const iframe = document.getElementById('viewer-iframe');
    const closeBtn = document.getElementById('close-viewer-modal-btn');
    const closeModal = () => {
        modal.classList.remove('visible');
        iframe.src = 'about:blank';
    };
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

function openFullViewer() {
    try {
        const summaryHtml = generateBenefitMatrixHtml();
        const payload = { ...appState, summaryHtml }; // Pass the whole state + generated HTML
        const json = JSON.stringify(payload);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        const viewerUrl = new URL('viewer.html', location.href);
        viewerUrl.hash = `#v=${b64}`;

        const modal = document.getElementById('viewer-modal');
        const iframe = document.getElementById('viewer-iframe');
        iframe.src = viewerUrl.toString();
        modal.classList.add('visible');
    } catch (e) {
        console.error('Lỗi mở Bảng minh họa:', e);
        alert('Không thể tạo Bảng minh họa chi tiết.');
    }
}

// ===================================================================================
// ===== BENEFIT MATRIX GENERATION
// ===================================================================================
function generateBenefitMatrixHtml() {
    // This is a simplified version for demonstration. The `viewer.html` will contain the full logic.
    // Here we just ensure the data is collected correctly.
    // The real complex HTML generation is now in `viewer.js` to keep this file cleaner.
    // We pass the raw data, and the viewer formats it.
    return `<h2>Bảng tóm tắt sẽ được hiển thị trong Viewer...</h2>`;
}
