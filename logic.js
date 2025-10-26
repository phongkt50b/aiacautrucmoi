

import { GLOBAL_CONFIG, PRODUCT_CATALOG, product_data, investment_data, BENEFIT_MATRIX_SCHEMAS, BM_SCL_PROGRAMS, setDataHelpers } from './data.js';

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

// Inject helper functions into data.js module to be used by hintFunctions, etc.
// This is called once at initialization time.
setDataHelpers({
    product_data,
    formatCurrency,
    roundDownTo1000,
});


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
        supplementsContainer.querySelectorAll('.product-section input[type="checkbox"]').forEach(checkbox => {
            if (!checkbox.checked) return;

            const prodId = checkbox.dataset.productId;
            if (!prodId) return;
            const section = checkbox.closest('.product-section');

            supplements[prodId] = {
                id: prodId,
                stbh: parseFormattedNumber(section.querySelector(`.${prodId}-stbh`)?.value),
                program: section.querySelector(`.${prodId}-program`)?.value,
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
    
    // Calculate rider premiums for all persons
    allPersons.forEach(person => {
        let personSuppFee = 0;
        Object.values(person.supplements).forEach(riderInfo => {
            const currentTotalHospitalStbh = allPersons.reduce((total, p) => {
                 return total + (p.supplements.HOSPITAL_SUPPORT?.stbh || 0);
            }, 0) - (person.supplements.HOSPITAL_SUPPORT?.stbh || 0);

            const fee = calculateRiderPremium(riderInfo.id, person, fees.baseMain, currentTotalHospitalStbh);
            personSuppFee += fee;
            fees.byPerson[person.id].suppDetails[riderInfo.id] = fee;
        });
        fees.byPerson[person.id].supp = personSuppFee;
        fees.totalSupp += personSuppFee;
    });

    // --- MDP 3.0 Calculation ---
    const mdpRiderInfo = state.mainPerson.supplements.MDP_3_0;
    if (mdpRiderInfo) {
        const mdpTarget = mdpRiderInfo.insuredPerson === 'main' ? state.mainPerson : state.supplementaryPersons.find(p => p.id === mdpRiderInfo.insuredPerson);
        if (mdpTarget) {
            const mdpStbh = calculateMdpStbh(state, fees);
            const mdpFee = calculateRiderPremium('MDP_3_0', mdpTarget, mdpStbh);
            fees.totalSupp += mdpFee;
            fees.byPerson[state.mainPerson.id].supp += mdpFee;
            fees.byPerson[state.mainPerson.id].suppDetails.MDP_3_0 = mdpFee;
        }
    }
    
    // --- Final Totals ---
    fees.totalMain = fees.baseMain + fees.extra;
    fees.total = fees.totalMain + fees.totalSupp;

    Object.keys(fees.byPerson).forEach(personId => {
        const p = fees.byPerson[personId];
        p.total = p.main + p.supp;
    });

    return fees;
}


function calculateMainPremium(customer, productInfo) {
    const { key: productKey, stbh, premium: enteredPremium, program: programKey } = productInfo;
    const productConfig = PRODUCT_CATALOG[productKey];
    if (!productConfig || !customer) return 0;
    
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
            const { underlyingMainProduct, fixedValues, mandatoryRiders } = productConfig.packageConfig;
            
            // Calculate main product part of package
            const underlyingMainConfig = PRODUCT_CATALOG[underlyingMainProduct];
            const underlyingProgram = underlyingMainConfig.programs.options.find(p => p.key === fixedValues.program);
            const mainPackageInfo = {
                key: underlyingMainProduct,
                stbh: fixedValues.stbh,
                program: underlyingProgram.key,
            };
            let totalPackagePremium = calculateMainPremium(customer, mainPackageInfo);

            // Add mandatory riders
            mandatoryRiders.forEach(rider => {
                const riderCustomer = { ...customer, supplements: { [rider.id]: { stbh: rider.stbh } } };
                totalPackagePremium += calculateRiderPremium(rider.id, riderCustomer, 0, 0);
            });
            return roundDownTo1000(totalPackagePremium);
    }
    return roundDownTo1000(premium);
}


function calculateRiderPremium(prodId, customer, mainPremium, totalHospitalSupportStbh) {
    const prodConfig = PRODUCT_CATALOG[prodId];
    if (!prodConfig || !customer) return 0;

    if (!checkEligibility(customer, prodConfig.rules?.eligibility)) return 0;

    const { calculation } = prodConfig;
    const riderInfo = customer.supplements[prodId] || {};
    const { stbh = 0 } = riderInfo;
    const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
    let premium = 0;

    switch (calculation.method) {
        case 'healthSclLookup': {
            const renewalMax = prodConfig.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
            if (customer.age > renewalMax) return 0;
            
            // For SCL sub-riders, the program is inherited from the parent
            const sclProgram = customer.supplements.HEALTH_SCL?.program;
            if (!sclProgram) return 0;
            
            const ageBandIndex = product_data.health_scl_rates.age_bands.findIndex(b => customer.age >= b.min && customer.age <= b.max);
            if (ageBandIndex === -1) return 0;
            
            let rateData;
            if (prodId === 'HEALTH_SCL') rateData = product_data.health_scl_rates.main_vn;
            if (prodId === 'OUTPATIENT_SCL') rateData = product_data.health_scl_rates.outpatient;
            if (prodId === 'DENTAL_SCL') rateData = product_data.health_scl_rates.dental;
            
            premium = rateData?.[ageBandIndex]?.[sclProgram] || 0;
            break;
        }
        case 'ratePer1000Stbh': {
            const renewalMax = prodConfig.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
            if (customer.age > renewalMax || !stbh) return 0;
            const rateTable = product_data[calculation.rateTableRef] || [];
            const rate = rateTable.find(r => customer.age >= r.ageMin && customer.age <= r.ageMax)?.[genderKey] || 0;
            premium = (stbh / 1000) * rate;
            break;
        }
        case 'ratePer1000StbhByRiskGroup': {
            const renewalMax = prodConfig.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
            if (customer.age > renewalMax || !stbh || !customer.riskGroup) return 0;
            const rateTable = product_data[calculation.rateTableRef] || {};
            const rate = rateTable[customer.riskGroup] || 0;
            premium = (stbh / 1000) * rate;
            break;
        }
        case 'ratePer100Stbh': {
            const renewalMax = prodConfig.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
            if (customer.age > renewalMax || !stbh) return 0;
            const rateTable = product_data[calculation.rateTableRef] || [];
            const rate = rateTable.find(r => customer.age >= r.ageMin && customer.age <= r.ageMax)?.rate || 0;
            premium = (stbh / 100) * rate;
            break;
        }
        case 'ratePer1000StbhForMdp': {
            const stbhForMdp = calculateMdpStbh(appState);
            if (stbhForMdp <= 0) return 0;
            const rateTable = product_data[calculation.rateTableRef] || [];
            const rate = rateTable.find(r => customer.age >= r.ageMin && customer.age <= r.ageMax)?.[genderKey] || 0;
            premium = (stbhForMdp / 1000) * rate;
            break;
        }
    }

    return roundDownTo1000(premium);
}

function calculateMdpStbh(state) {
    let stbhForMdp = state.fees.baseMain; // Start with main product premium
    const allPersons = [state.mainPerson, ...state.supplementaryPersons].filter(p => p);
    
    allPersons.forEach(p => {
        Object.keys(p.supplements).forEach(riderId => {
            if (riderId !== 'MDP_3_0') {
                 stbhForMdp += state.fees.byPerson[p.id]?.suppDetails[riderId] || 0;
            }
        });
    });
    return stbhForMdp;
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

    if (productConfig.packageConfig) {
        const { fixedValues } = productConfig.packageConfig;
        container.innerHTML = `
            <div>
              <label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
              <input type="text" id="main-stbh" class="form-input bg-gray-100" value="${formatCurrency(fixedValues.stbh)}" disabled>
            </div>`;
        return;
    }

    let optionsHtml = '';
    if (productConfig.programs?.enabled) {
        const programOptions = productConfig.programs.options
            .filter(opt => !opt.eligibility || checkEligibility(customer, opt.eligibility))
            .map(opt => `<option value="${opt.key}">${opt.label}</option>`).join('');
        optionsHtml += `<div>
            <label for="main-program" class="font-medium text-gray-700 block mb-1">${productConfig.programs.label} <span class="text-red-600">*</span></label>
            <select id="main-program" class="form-select">${programOptions}</select>
        </div>`;
    }

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
            <div id="premium-hint" class="text-sm text-gray-500 mt-1"></div>
        </div>`;
    }

    if (rules.paymentTerm) {
        const min = rules.paymentTerm.min || 4;
        const max = rules.paymentTerm.maxFunction ? rules.paymentTerm.maxFunction(customer.age) : (100 - customer.age);
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
            <div id="extra-premium-hint" class="text-sm text-gray-500 mt-1"></div>
        </div>`;
    }
    
    container.innerHTML = optionsHtml;

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

    const riderLimits = mainProductConfig.rules.riderLimits;
    const allowedRidersFromMain = riderLimits.enabled ? riderLimits.allowed : Object.keys(PRODUCT_CATALOG).filter(k => PRODUCT_CATALOG[k].type === 'rider' && k !== 'MDP_3_0');

    let anyStateChanged = false;

    Object.values(PRODUCT_CATALOG).filter(p => p.type === 'rider' && p.id !== 'MDP_3_0').forEach(prodConfig => {
        const prodId = prodConfig.id;
        const section = container.querySelector(`.${prodId}-section`);
        if (!section) return;

        let isVisible = allowedRidersFromMain.includes(prodId) || (prodConfig.dependencies?.parentRiderRequired && allowedRidersFromMain.includes(prodConfig.dependencies.parentRiderRequired));
        
        if (prodConfig.dependencies?.parentRiderRequired) {
            const parentId = prodConfig.dependencies.parentRiderRequired;
            const parentChecked = customer.supplements[parentId];
            isVisible = isVisible && parentChecked;
        }

        section.classList.toggle('hidden', !isVisible);
        if (!isVisible) return;
        
        const isEligible = checkEligibility(customer, prodConfig.rules.eligibility);
        const checkbox = section.querySelector(`.${prodId}-checkbox`);
        const options = section.querySelector('.product-options');

        checkbox.disabled = !isEligible || !isMainProductValid;
        section.classList.toggle('opacity-50', checkbox.disabled);
        
        if ((checkbox.disabled && checkbox.checked)) {
            checkbox.checked = false;
            anyStateChanged = true;
        }
        
        options.classList.toggle('hidden', !checkbox.checked);
        
        const fee = appState.fees.byPerson[customer.id]?.suppDetails?.[prodId] || 0;
        section.querySelector('.fee-display').textContent = fee > 0 ? `Phí: ${formatCurrency(fee)}` : '';

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

    const suppListContainer = document.getElementById('supp-insured-summaries');
    let suppListHtml = '';
    const allPersons = [appState.mainPerson, ...appState.supplementaryPersons];

    allPersons.forEach(p => {
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

    if (rules.anyOf) {
        const isMet = rules.anyOf.some(rule => {
            const key = Object.keys(rule)[0];
            const condition = rule[key];
            const value = key === 'stbh' ? values.stbh : baseMainPremium;
            return value >= condition.min;
        });
        if (!isMet) {
            const stbhEl = container.querySelector('#main-stbh');
            setFieldError(stbhEl, rules.anyOf[1].premium.message);
            ok = false;
        }
    }

    for (const key in rules) {
        if (key === 'anyOf') continue;
        
        const rule = rules[key];
        const value = values[key];
        const el = container.querySelector(`#${key}, .${config.id}-${key}, [data-product-id="${config.id}"]`);
        if (!el) continue;

        let error = '';
        if (rule.min != null && value < rule.min) error = rule.message || `Tối thiểu ${formatCurrency(rule.min)}`;
        else if (rule.max != null && value > rule.max) error = rule.message || `Tối đa ${formatCurrency(rule.max)}`;
        else if (rule.multipleOf && value % rule.multipleOf !== 0) error = rule.hint || `Phải là bội số của ${formatCurrency(rule.multipleOf)}`;
        else if (rule.maxFunction) {
            const maxVal = rule.maxFunction(person.age);
            if (value > maxVal) error = rule.message(rule.min, maxVal) || `Tối đa ${maxVal}`;
        }
        else if (rule.stbhFactorRef) {
            const factorRow = product_data[rule.stbhFactorRef]?.find(f => person.age >= f.ageMin && person.age <= f.ageMax);
            if (factorRow && values.stbh > 0) {
                const minFee = roundDownTo1000(values.stbh / factorRow.maxFactor);
                const maxFee = roundDownTo1000(values.stbh / factorRow.minFactor);
                if (value < minFee || value > maxFee) error = rule.stbhFactorMessage || 'Phí không hợp lệ';
            }
        } else if (config.id === 'HOSPITAL_SUPPORT' && key === 'stbh') {
            const maxFormula = config.calculation.stbhCalculation.config.maxFormula;
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

    const mainConfig = PRODUCT_CATALOG[state.mainProduct.key];
    if (mainConfig?.rules.validationRules) {
        updateHintsForProduct(state.mainPerson, state.mainProduct, mainConfig, state.fees.baseMain, 0);
    }
    
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
            const hintText = rule.hintFunction(values.stbh, person, baseMainPremium, totalHospitalSupportStbh);
            hintEl.innerHTML = hintText;
        } else if (rule.hint) {
            hintEl.innerHTML = rule.hint;
        }
    }
}


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
  if (!input || !productConfig || !productConfig.cashValueConfig?.enabled) { if(input) clearFieldError(input); return true; }
  
  const val = parseInt((input.value || '').trim(), 10);
  const age = mainPerson?.age || 0;
  const paymentTerm = mainProductInfo.paymentTerm || 0;
  if (!age || !paymentTerm) { clearFieldError(input); return true; }

  const minAllowed = age + paymentTerm;
  const maxAllowed = 99;
  if (isNaN(val) || val < minAllowed || val > maxAllowed) {
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
    initSummaryControls();
    attachGlobalListeners();
    updateSupplementaryAddButtonState(false);
    runWorkflow();
    initViewerModal();
});

function runWorkflow() {
    updateStateFromUI();
    appState.fees = performCalculations(appState);
    const isMainProductValid = runAllValidations(appState);
    updateAllHints(appState);
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

            if (prodConfig.rules?.validationRules?.stbh) {
                const rule = prodConfig.rules.validationRules.stbh;
                optionsHtml += `<div>
                  <label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
                  <input type="text" class="form-input ${prodId}-stbh" placeholder="Nhập STBH">
                  <div class="${prodId}-stbh-hint text-sm text-gray-500 mt-1"></div>
                </div>`;
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
      const match = product_data.occupations.find(o => o.group > 0 && o.name.trim().toLowerCase() === (input.value || '').trim().toLowerCase());
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
    const mdpConfig = PRODUCT_CATALOG.MDP_3_0;
    const mainPersonCanHaveMdp = checkEligibility(appState.mainPerson, mdpConfig.rules.eligibility);

    const isMdpPossible = mainPersonCanHaveMdp || appState.supplementaryPersons.some(p => checkEligibility(p, mdpConfig.rules.eligibility));
    const shouldShowSection = isMdpPossible && !noSuppInsured;

    section.classList.toggle('hidden', !shouldShowSection);
    section.classList.toggle('opacity-50', !isMainProductValid);
    section.classList.toggle('pointer-events-none', !isMainProductValid);
    if (!shouldShowSection) return;

    const container = document.getElementById('mdp3-radio-list');
    let optionsHtml = '';
    const persons = [appState.mainPerson, ...appState.supplementaryPersons].filter(p => checkEligibility(p, mdpConfig.rules.eligibility));

    persons.forEach(p => {
        optionsHtml += `<label class="flex items-center space-x-2">
            <input type="radio" name="mdp3-person" value="${p.id}">
            <span>${sanitizeHtml(p.name)}</span>
        </label>`;
    });

    const fee = appState.fees.byPerson[appState.mainPerson.id]?.suppDetails.MDP_3_0 || 0;
    container.innerHTML = `<p class="font-medium text-gray-700 mb-2">Chọn Người được bảo hiểm cho Miễn Đóng Phí:</p><div class="space-y-2">${optionsHtml}</div>
    <div class="text-right font-semibold text-aia-red min-h-[1.5rem] mt-2">${fee > 0 ? `Phí: ${formatCurrency(fee)}` : ''}</div>`;
    
    if (appState.mainPerson.supplements.MDP_3_0?.insuredPerson) {
        const radio = container.querySelector(`input[value="${appState.mainPerson.supplements.MDP_3_0.insuredPerson}"]`);
        if (radio) radio.checked = true;
    }
}


// ===================================================================================
// ===== SUMMARY & VIEWER
// ===================================================================================
function initSummaryControls() {
    document.getElementById('toggle-supp-list-btn').addEventListener('click', () => {
        document.getElementById('supp-insured-summaries').classList.toggle('hidden');
    });

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

    if (!input || !mainPerson || typeof mainPerson.age !== 'number' || !productConfig || !productConfig.cashValueConfig?.enabled) {
        document.getElementById('target-age-block').classList.add('hidden');
        return;
    }
    document.getElementById('target-age-block').classList.remove('hidden');

    const paymentTerm = mainProductInfo.paymentTerm;
    const minAge = mainPerson.age + paymentTerm;
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
        runWorkflow(); 
        setTimeout(() => { 
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
        const payload = {
            ...appState,
            productCatalog: PRODUCT_CATALOG, // Pass catalog and data for viewer-side calculations
            product_data: product_data,
            investment_data: investment_data,
            benefitMatrixSchemas: BENEFIT_MATRIX_SCHEMAS,
            bmSclPrograms: BM_SCL_PROGRAMS,
        };
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
