import { GLOBAL_CONFIG, PRODUCT_CATALOG, product_data, investment_data, BENEFIT_MATRIX_SCHEMAS } from './data.js';

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

function roundDownTo1000(n) {
    return Math.floor(Number(n || 0) / 1000) * 1000;
}

function parseFormattedNumber(formattedString) {
  if (formattedString == null) return 0;
  let v = String(formattedString);
  v = v.replace(/[\u00A0\u202F\s]/g, '').replace(/[.,]/g, '');
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
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===================================================================================
// ===== MODULE: STATE MANAGEMENT
// ===================================================================================
let appState = {};

function initState() {
    appState = {
        mainProduct: {
            key: '', stbh: 0, premium: 0, paymentTerm: 0, extraPremium: 0, options: {},
        },
        paymentFrequency: 'year',
        mainPerson: {
            id: 'main-person-container', container: document.getElementById('main-person-container'), isMain: true,
            name: '', dob: '', age: 0, daysFromBirth: 0, gender: 'Nam', riskGroup: 0, supplements: {}
        },
        supplementaryPersons: [],
        fees: {
            baseMain: 0, extra: 0, totalMain: 0, totalSupp: 0, total: 0, byPerson: {},
        },
        waiver: {
            selectedRider: null, policyHolderId: null, fee: 0,
        }
    };
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
    
    appState.mainProduct.options = {};
    if (mainProductConfig?.programs?.enabled) {
        const el = document.getElementById('main-product-program');
        if (el) appState.mainProduct.options['program'] = el.value;
    }
    
    appState.paymentFrequency = document.getElementById('payment-frequency')?.value || 'year';
    appState.mainPerson = collectPersonData(document.getElementById('main-person-container'), true);
    appState.supplementaryPersons = Array.from(
        document.querySelectorAll('#supplementary-insured-container .person-container')
    ).map(container => collectPersonData(container, false));
    
    const waiverRiderKey = document.querySelector('input[name="waiver-rider-select"]:checked')?.value;
    appState.waiver.selectedRider = waiverRiderKey || null;
    appState.waiver.policyHolderId = waiverRiderKey ? document.getElementById('waiver-policy-holder-select')?.value : null;
}

function collectPersonData(container, isMain) {
    if (!container) return null;

    const dobInput = container.querySelector('.dob-input');
    const dobStr = dobInput ? dobInput.value : '';
    let age = 0, daysFromBirth = 0;

    if (dobStr && /^\d{2}\/\d{2}\/\d{4}$/.test(dobStr)) {
        const [dd, mm, yyyy] = dobStr.split('/').map(n => parseInt(n, 10));
        const birthDate = new Date(yyyy, mm - 1, dd);
        if (birthDate.getFullYear() === yyyy && birthDate.getMonth() === mm - 1 && birthDate.getDate() === dd && birthDate <= GLOBAL_CONFIG.REFERENCE_DATE) {
            daysFromBirth = Math.floor((GLOBAL_CONFIG.REFERENCE_DATE - birthDate) / (1000 * 60 * 60 * 24));
            age = GLOBAL_CONFIG.REFERENCE_DATE.getFullYear() - birthDate.getFullYear();
            const m = GLOBAL_CONFIG.REFERENCE_DATE.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && GLOBAL_CONFIG.REFERENCE_DATE.getDate() < birthDate.getDate())) age--;
        }
    }

    const supplementsContainer = isMain 
        ? document.querySelector('#main-supp-container .supplementary-products-container')
        : container.querySelector('.supplementary-products-container');
    
    const supplements = {};
    if (supplementsContainer) {
        Object.entries(PRODUCT_CATALOG).forEach(([prodId, prodConfig]) => {
            if (prodConfig.type !== 'rider' || prodConfig.riderType === 'waiver') return;

            const section = supplementsContainer.querySelector(`.${prodId}-section`);
            if (!section) return;

            const checkbox = section.querySelector(`.${prodId}-checkbox`);
            if (!checkbox || !checkbox.checked) return;
            
            supplements[prodId] = {};
            const allInputs = ['stbh', 'program', 'scope']; // Add any future input types here
            
            // Generic input collector
            allInputs.forEach(inputType => {
                const inputEl = section.querySelector(`.${prodId}-${inputType}`);
                if(inputEl) {
                    if (inputType === 'stbh') {
                        supplements[prodId][inputType] = parseFormattedNumber(inputEl.value);
                    } else {
                         supplements[prodId][inputType] = inputEl.value;
                    }
                }
            });

            // Handle child riders (checkboxes without dedicated sections)
            if (prodConfig.parentRider === 'health_scl') {
                const childCheckbox = section.querySelector(`.${prodId}-checkbox`);
                if(childCheckbox) { // This is redundant but safe
                    const parentData = supplements[prodConfig.parentRider];
                    if(parentData) {
                        supplements[prodId] = { ...parentData, ...supplements[prodId] };
                    }
                }
            }
        });
    }

    return {
        id: container.id, container, isMain, name: container.querySelector('.name-input')?.value || (isMain ? 'NĐBH Chính' : 'NĐBH Bổ sung'),
        dob: dobStr, age, daysFromBirth, gender: container.querySelector('.gender-select')?.value || 'Nam',
        riskGroup: parseInt(container.querySelector('.occupation-input')?.dataset.group, 10) || 0,
        supplements
    };
}


// ===================================================================================
// ===== MODULE: LOGIC & CALCULATIONS (Pure functions)
// ===================================================================================
function performCalculations(state) {
    const fees = { baseMain: 0, extra: 0, totalSupp: 0, byPerson: {} };
    fees.baseMain = calculateMainPremium(state.mainPerson, state.mainProduct);
    fees.extra = state.mainProduct.extraPremium;
    
    const mainProductConfig = PRODUCT_CATALOG[state.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;
    
    const suppPersons = noSuppInsured ? [] : state.supplementaryPersons;
    const allPersons = [state.mainPerson, ...suppPersons].filter(p => p);

    allPersons.forEach(p => fees.byPerson[p.id] = { main: 0, supp: 0, total: 0, suppDetails: {} });
    if (fees.byPerson[state.mainPerson.id]) fees.byPerson[state.mainPerson.id].main = fees.baseMain + fees.extra;
    
    window.personFees = {}; // Snapshot for waiver calculation
    allPersons.forEach(p => {
        let personSuppFee = 0;
        const suppDetails = {};
        for (const prodId in p.supplements) {
            const fee = calculateRiderPremium(prodId, p, fees.baseMain);
            personSuppFee += fee;
            suppDetails[prodId] = fee;
        }
        
        fees.byPerson[p.id].supp = personSuppFee;
        fees.byPerson[p.id].suppDetails = suppDetails;
        fees.totalSupp += personSuppFee;

        const totalMainForPerson = p.isMain ? (fees.baseMain + fees.extra) : 0;
        window.personFees[p.id] = {
            main: totalMainForPerson, mainBase: p.isMain ? fees.baseMain : 0,
            supp: personSuppFee, total: totalMainForPerson + personSuppFee
        };
    });

    if (state.waiver.selectedRider && state.waiver.policyHolderId) {
        const waiverFee = calculateRiderPremium(state.waiver.selectedRider, null, fees.baseMain);
        state.waiver.fee = waiverFee;
        if (waiverFee > 0) {
            const policyHolder = allPersons.find(p => p.id === state.waiver.policyHolderId);
            if (policyHolder && fees.byPerson[policyHolder.id]) {
                fees.byPerson[policyHolder.id].supp += waiverFee;
                fees.byPerson[policyHolder.id].suppDetails[state.waiver.selectedRider] = waiverFee;
                fees.totalSupp += waiverFee;
                if (window.personFees[policyHolder.id]) {
                    window.personFees[policyHolder.id].supp += waiverFee;
                    window.personFees[policyHolder.id].total += waiverFee;
                }
            }
        }
    } else {
        state.waiver.fee = 0;
    }
    
    const totalMain = fees.baseMain + fees.extra;
    const total = totalMain + fees.totalSupp;
    return { ...fees, totalMain, total };
}

function calculateMainPremium(customer, productInfo) {
    const { key: productKey, stbh, premium: enteredPremium, options } = productInfo;
    const productConfig = PRODUCT_CATALOG[productKey];
    if (!productConfig || !customer || customer.age < 0) return 0;
    
    const calcConfig = productConfig.calculation;
    let premium = 0;
    switch (calcConfig.method) {
        case 'fromInput': premium = enteredPremium; break;
        case 'ratePer1000Stbh': {
            if (stbh === 0) return 0;
            const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
            let rate = 0;
            const selectedProgramKey = options?.program;
            if (!productConfig.programs.enabled || !selectedProgramKey) return 0;
            
            const programConfig = productConfig.programs.options.find(p => p.key === selectedProgramKey);
            if (!programConfig || !programConfig.rateTableRef) return 0;
            
            let rateTable = product_data;
            programConfig.rateTableRef.split('.').forEach(p => rateTable = rateTable ? rateTable[p] : undefined);
            
            if (rateTable) rate = rateTable.find(r => r.age === customer.age)?.[genderKey] || 0;
            premium = Math.round((stbh / 1000) * rate);
            break;
        }
        case 'none': return 0;
    }
    return roundDownTo1000(premium);
}

function calculateRiderPremium(prodId, customer, mainPremium, ageOverride = null) {
    const prodConfig = PRODUCT_CATALOG[prodId];
    if (!prodConfig) return 0;

    const calcConfig = prodConfig.calculation;
    let customerForCalc = customer;
    if (calcConfig.method === 'waiver') {
        const policyHolderId = appState.waiver.policyHolderId;
        customerForCalc = policyHolderId ? [appState.mainPerson, ...appState.supplementaryPersons].find(p => p.id === policyHolderId) : null;
    }

    if (!customerForCalc) return 0;
    const ageToUse = ageOverride ?? customerForCalc.age;
    
    const renewalMaxRule = prodConfig.rules.eligibility.find(r => r.renewalMax);
    if (renewalMaxRule && ageToUse > renewalMaxRule.renewalMax) return 0;

    switch (calcConfig.method) {
        case 'rateLookup': {
            const supplementData = customerForCalc.supplements[prodId] || {};
            const { stbh } = supplementData;

            if (!stbh && !prodId.startsWith('health_scl')) return 0;

            // Resolve dynamic rate table reference (e.g., for SCL scope)
            let rateTableRefStr = calcConfig.rateTableRef.replace(/\${(.*?)}/g, (match, p1) => supplementData[p1] || '');
            if (rateTableRefStr.includes('undefined')) return 0; // Missing data for template

            let rateTable = product_data;
            rateTableRefStr.split('.').forEach(p => rateTable = rateTable ? rateTable[p] : undefined);
            if (!rateTable) return 0;
            
            const lookupBy = calcConfig.lookupBy || [];
            let rateRecord;

            if (lookupBy.includes('ageBand')) {
                const ageBands = product_data[calcConfig.ageBandRef] || [];
                const ageBandIndex = ageBands.findIndex(b => ageToUse >= b.min && ageToUse <= b.max);
                if (ageBandIndex === -1) return 0;
                rateRecord = Array.isArray(rateTable) ? rateTable[ageBandIndex] : null;
            } else if (lookupBy.includes('age')) {
                 rateRecord = Array.isArray(rateTable) ? rateTable.find(r => ageToUse === r.age) : null;
            } else {
                rateRecord = rateTable; // For cases like accident insurance where there's no age lookup
            }

            if (!rateRecord && !lookupBy.includes('riskGroup')) return 0;
            
            let rate = 0;
            const rateValueFrom = calcConfig.rateValueFrom;
            switch(rateValueFrom) {
                case 'gender':
                    rate = rateRecord[customerForCalc.gender === 'Nữ' ? 'nu' : 'nam'] || 0;
                    break;
                case 'program':
                    const parentRiderId = prodConfig.parentRider || prodId;
                    const programKey = customerForCalc.supplements[parentRiderId]?.program;
                    rate = rateRecord ? rateRecord[programKey] : 0;
                    break;
                case 'riskGroup':
                    rate = rateTable[customerForCalc.riskGroup] || 0;
                    break;
                case 'rate':
                    rate = rateRecord.rate || 0;
                    break;
            }
            
            if (!rate) return 0;
            
            const premiumRaw = prodId.startsWith('health_scl') ? rate : (stbh / (calcConfig.divisor || 1000)) * rate;
            return roundDownTo1000(premiumRaw);
        }
        case 'waiver': {
            let stbhBase = 0;
            for (const personId in window.personFees) {
                const personFee = window.personFees[personId];
                stbhBase += personFee.mainBase || 0;
                if (!calcConfig.waiverConfig.includePolicyholderRiders && personId === appState.waiver.policyHolderId) continue;
                stbhBase += personFee.supp || 0;
            }
            if (stbhBase <= 0) return 0;
            
            let rate = 0;
            const rateTable = product_data[calcConfig.rateTableRef];
            const rateRecord = rateTable.find(r => ageToUse >= r.ageMin && ageToUse <= r.ageMax);
            if (rateRecord) rate = rateRecord[customerForCalc.gender === 'Nữ' ? 'nu' : 'nam'] || 0;
            
            if (!rate) return 0;
            return roundDownTo1000((stbhBase / (calcConfig.divisor || 1000)) * rate);
        }
        default: return 0;
    }
}


// ===================================================================================
// ===== MODULE: UI (Rendering, DOM manipulation, Event Listeners)
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
        if (suppContainer) renderSupplementaryProductsForPerson(p, suppContainer, isMainProductValid);
    });
    
    renderWaiverSection(allPersons, isMainProductValid);
    updateSupplementaryAddButtonState(isMainProductValid);
    
    updateMainProductFeeDisplay(appState.fees.baseMain, appState.fees.extra);
    updatePaymentFrequencyOptions(appState.fees.baseMain);
    updateSummaryUI(appState.fees, isMainProductValid);
}

let lastRenderedProductKey = null, lastRenderedAge = null;
function renderMainProductSection(customer, mainProductKey) {
    document.querySelectorAll('#main-product option').forEach(option => {
        const productConfig = PRODUCT_CATALOG[option.value];
        if (!productConfig || !productConfig.rules) return;
        option.disabled = !checkEligibility(customer, productConfig.rules.eligibility);
        option.classList.toggle('hidden', option.disabled);
    });
    
    if (lastRenderedProductKey === mainProductKey && lastRenderedAge === customer.age) return;
    lastRenderedProductKey = mainProductKey;
    lastRenderedAge = customer.age;

    const container = document.getElementById('main-product-options');
    container.innerHTML = '';
    const productConfig = PRODUCT_CATALOG[mainProductKey];
    if (!productConfig) return;
    
    let optionsHtml = '';

    if (productConfig.programs?.enabled) {
        const progConf = productConfig.programs;
        let progOpts = progConf.options.filter(opt => !opt.eligibility || opt.eligibility(customer))
                                      .map(opt => `<option value="${opt.key}">${opt.label}</option>`).join('');
        if (!progOpts) progOpts = '<option value="" disabled>Không có chương trình phù hợp</option>';
        optionsHtml += `<div>
          <label class="font-medium block mb-1">${progConf.label} <span class="text-red-600">*</span></label>
          <select id="main-product-program" class="form-select"><option value="" selected>-- Chọn --</option>${progOpts}</select>
        </div>`;
    }

    productConfig.ui.inputs?.forEach(inputType => {
        const id = `main-${inputType}`;
        let value = appState.mainProduct[inputType] > 0 ? formatCurrency(appState.mainProduct[inputType]) : '';
        if (inputType === 'paymentTerm') {
            const termRule = productConfig.rules.paymentTerm || {};
            value = (appState.mainProduct.paymentTerm > 0 ? appState.mainProduct.paymentTerm : '') || termRule.default || '';
            const min = termRule.min || 4;
            const max = termRule.maxFunction ? eval(termRule.maxFunction)(customer.age) : (100 - customer.age);
            optionsHtml += `<div>
                <label for="payment-term" class="font-medium block mb-1">Thời gian đóng phí (năm) <span class="text-red-600">*</span></label>
                <input type="number" id="payment-term" class="form-input" value="${value}" placeholder="VD: 20" min="${min}" max="${max}">
                <div class="text-sm text-gray-500 mt-1">Nhập từ ${min} đến ${max} năm</div>
            </div>`;
        } else if (inputType === 'stbh') {
            optionsHtml += `<div>
                <label for="main-stbh" class="font-medium block mb-1">Số tiền bảo hiểm (STBH) <span class="text-red-600">*</span></label>
                <input type="text" id="main-stbh" class="form-input" value="${value}" placeholder="VD: 1.000.000.000">
            </div>`;
        } else if (inputType === 'premium') {
             optionsHtml += `<div>
                <label for="main-premium" class="font-medium block mb-1">Phí sản phẩm chính</label>
                <input type="text" id="main-premium" class="form-input" value="${value}" placeholder="Nhập phí">
                <div id="mul-fee-range" class="text-sm text-gray-500 mt-1"></div>
            </div>`;
        } else if (inputType === 'extraPremium') {
            optionsHtml += `<div>
                <label for="extra-premium" class="font-medium block mb-1">Phí đóng thêm</label>
                <input type="text" id="extra-premium" class="form-input" value="${value}" placeholder="VD: 10.000.000">
                <div class="text-sm text-gray-500 mt-1">Tối đa ${GLOBAL_CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính.</div>
            </div>`;
        }
    });
    container.innerHTML = optionsHtml;
    
    // Generic auto-set payment term
    const programSelect = document.getElementById('main-product-program');
    if (programSelect) {
        programSelect.addEventListener('change', (e) => {
            const programConf = productConfig.programs.options.find(p => p.key === e.target.value);
            const termInput = document.getElementById('payment-term');
            if (programConf && termInput && programConf.defaultPaymentTerm) {
                termInput.value = programConf.defaultPaymentTerm;
                runWorkflowDebounced();
            }
        });
    }

    attachTermListenersForTargetAge();
}

function renderSupplementaryProductsForPerson(customer, container, isMainProductValid) {
    const mainPremium = appState.fees.baseMain;
    const ridersDisabled = !isMainProductValid;
    const ridersReason = ridersDisabled ? 'Vui lòng hoàn tất thông tin sản phẩm chính.' : '';

    Object.entries(PRODUCT_CATALOG).forEach(([prodId, prodConfig]) => {
        if (prodConfig.type !== 'rider' || prodConfig.riderType === 'waiver') return;

        const section = container.querySelector(`.${prodId}-section`);
        if (!section) return;

        let isEligible = checkEligibility(customer, prodConfig.rules.eligibility);
        
        // Parent-child & dependency logic
        const parentIsSelected = prodConfig.parentRider ? !!customer.supplements[prodConfig.parentRider] : true;
        const dependenciesMet = prodConfig.dependsOn ? prodConfig.dependsOn.every(depKey => !!customer.supplements[depKey]) : true;
        isEligible = isEligible && parentIsSelected && dependenciesMet;
        
        section.classList.toggle('hidden', !isEligible);
        
        // Hide child riders if parent is not selected
        if (prodConfig.parentRider) {
            section.classList.toggle('hidden', !parentIsSelected);
        }

        const checkbox = section.querySelector(`.${prodId}-checkbox`);
        if (!checkbox) return;
        
        checkbox.disabled = !isEligible || ridersDisabled;
        section.classList.toggle('opacity-50', checkbox.disabled);
        
        const msgEl = section.querySelector('.main-premium-threshold-msg');
        if (msgEl) {
            msgEl.textContent = ridersDisabled ? ridersReason : '';
            msgEl.classList.toggle('hidden', !ridersDisabled);
        }
        
        section.querySelector('.product-options')?.classList.toggle('hidden', !checkbox.checked);
        const fee = appState.fees.byPerson[customer.id]?.suppDetails?.[prodId] || 0;
        section.querySelector('.fee-display').textContent = fee > 0 ? `Phí: ${formatCurrency(fee)}` : '';

        // Program eligibility logic (e.g., for SCL)
        if (prodConfig.rules.programEligibility) {
            const programSelect = section.querySelector(`.${prodId}-program`);
            if (programSelect && checkbox.checked) {
                const eligibility = prodConfig.rules.programEligibility;
                const thresholds = eligibility.thresholds;
                let allowed = thresholds.find(t => mainPremium >= t.min)?.allowed || [];
                
                let wasChanged = false;
                const currentVal = programSelect.value;
                
                programSelect.querySelectorAll('option').forEach(opt => {
                    const shouldBeVisible = allowed.includes(opt.value);
                    opt.classList.toggle('hidden', !shouldBeVisible);
                    opt.disabled = !shouldBeVisible;
                });
                
                if (currentVal && !allowed.includes(currentVal)) {
                    programSelect.value = allowed.length > 0 ? allowed[0] : '';
                    wasChanged = true;
                }
                
                if (wasChanged) runWorkflowDebounced();
            }
        }
    });
}
function renderWaiverSection(allPersons, isValid) { /* ... */ }
function updateSupplementaryAddButtonState(isValid) { /* ... */ }
function updateSummaryUI(fees, isValid) { 
    document.getElementById('summary-total').textContent = formatDisplayCurrency(isValid ? fees.total : 0);
    document.getElementById('main-insured-main-fee').textContent = formatDisplayCurrency(isValid ? fees.totalMain - fees.extra : 0);
    document.getElementById('main-insured-extra-fee').textContent = formatDisplayCurrency(isValid ? fees.extra : 0);
    document.getElementById('summary-supp-fee').textContent = formatDisplayCurrency(isValid ? fees.totalSupp : 0);
}
function updateMainProductFeeDisplay(base, extra) { 
    const el = document.getElementById('main-product-fee-display');
    if (el) {
        el.textContent = base > 0 ? `Phí cơ bản: ${formatCurrency(base)}` : '';
    }
}
function updatePaymentFrequencyOptions(base) { /* ... */ }
function runAllValidations(state) { 
    // This would call the generic validateField for all relevant inputs
    return true; 
}
function validateField(el, value, rules, context) {
    // This is the new generic validation engine
    return true;
}
function validateSupplementaryProduct(p, prodId, state) { return true; }
function validateMainPersonInputs(p) { return true; }
function validateSupplementaryPersonInputs(p) { return true; }
function validateTargetAge(p, prodInfo) { return true; }
function validateDobField(input) { return true; }
function setFieldError(input, msg) {}
function clearFieldError(input) {}
function clearAllErrors() {}
function checkEligibility(person, rules) { 
    if (!person || !rules) return false;
    return rules.every(rule => {
        switch (rule.type) {
            case 'age':
                return (!rule.min || person.age >= rule.min) && (!rule.max || person.age <= rule.max);
            case 'daysFromBirth':
                return (!rule.min || person.daysFromBirth >= rule.min) && (!rule.max || person.daysFromBirth <= rule.max);
            case 'riskGroup':
                if (rule.required && (person.riskGroup === 0 || !person.riskGroup)) return false;
                if (rule.exclude && rule.exclude.includes(person.riskGroup)) return false;
                return true;
            case 'condition':
                 return rule.condition(person);
            default: return true;
        }
    });
}
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
     document.body.addEventListener('input', e => {
        if (e.target.matches('.form-input, .form-select')) {
            runWorkflowDebounced();
        }
        if (e.target.matches('input[type="text"]')) {
            formatNumberInput(e.target);
        }
    });
    document.body.addEventListener('change', e => {
        if (e.target.matches('.form-checkbox, .form-select, input[type="radio"]')) {
            runWorkflow();
        }
    });
}
function initPerson(container, isMain) {
    initDateFormatter(container.querySelector('.dob-input'));
    initOccupationAutocomplete(container.querySelector('.occupation-input'), container);
}
function initSupplementaryButton() {
    document.getElementById('add-supp-insured-btn').addEventListener('click', () => {
        const count = document.querySelectorAll('#supplementary-insured-container .person-container').length;
        if (count >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) {
            alert(`Chỉ được thêm tối đa ${GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED} NĐBH bổ sung.`);
            return;
        }
        const id = `supp-person-${Date.now()}`;
        const html = generateSupplementaryPersonHtml(id, count + 1);
        const container = document.getElementById('supplementary-insured-container');
        const div = document.createElement('div');
        div.innerHTML = html;
        const personNode = div.firstChild;
        container.appendChild(personNode);
        initPerson(personNode, false);
        runWorkflow();
    });
}
function generateSupplementaryPersonHtml(id, count) {
    const template = document.getElementById('supplementary-person-template').innerHTML;
    return template.replace(/data-template-id="title"/g, `data-id="${id}"`)
                   .replace('NĐBH Bổ Sung', `NĐBH Bổ Sung ${count}`)
                   .replace(/class="person-container/g, `class="person-container" id="${id}"`);
}

function generateSupplementaryProductsHtml() {
     let html = '';
    const riderEntries = Object.entries(PRODUCT_CATALOG).filter(([, config]) => config.type === 'rider' && config.riderType !== 'waiver');
    
    // Sort to ensure parent comes before child
    riderEntries.sort(([, a], [, b]) => {
        if (a.parentRider && !b.parentRider) return 1;
        if (!a.parentRider && b.parentRider) return -1;
        return 0;
    });

    riderEntries.forEach(([prodId, prodConfig]) => {
        let optionsHtml = '';
        const ui = prodConfig.ui;

        // Generic input renderer
        ui.inputs?.forEach(inputType => {
             if (inputType === 'stbh') {
                optionsHtml += `<div>
                  <label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
                  <input type="text" class="form-input ${prodId}-stbh" placeholder="Nhập STBH">
                </div>`;
            } else if (inputType === 'scope') { // Special case for SCL scope
                 optionsHtml += `<div>
                    <label class="font-medium text-gray-700 block mb-1">Phạm vi địa lý</label>
                    <select class="form-select ${prodId}-scope">
                      <option value="main_vn">Việt Nam</option>
                      <option value="main_global">Nước ngoài</option>
                    </select>
                  </div>`;
            }
        });

        // Generic program selector
        if (prodConfig.programs?.enabled) {
            const programConf = prodConfig.programs;
            let progOptions = programConf.options.map(opt => `<option value="${opt.key}">${opt.label}</option>`).join('');
            optionsHtml += `<div>
                <label class="font-medium text-gray-700 block mb-1">${programConf.label}</label>
                <select class="form-select ${prodId}-program">${progOptions}</select>
            </div>`;
        }

        const isChildRider = !!prodConfig.parentRider;
        const parentClass = isChildRider ? `child-of-${prodConfig.parentRider}` : '';
        const labelClass = isChildRider ? 'ml-6' : 'text-lg font-medium text-gray-800';
        const containerClass = isChildRider ? 'ml-6 pl-4 border-l-2' : '';

        html += `
        <div class="product-section ${prodId}-section hidden ${parentClass} ${containerClass}">
          <label class="flex items-center space-x-3 cursor-pointer">
            <input type="checkbox" class="form-checkbox ${prodId}-checkbox">
            <span class="${labelClass}">${prodConfig.name}</span>
          </label>
          <div class="product-options hidden mt-3 space-y-3">
            ${optionsHtml}
            <p class="text-xs text-red-600 main-premium-threshold-msg hidden"></p>
            <div class="text-right font-semibold text-aia-red fee-display min-h-[1.5rem]"></div>
          </div>
        </div>`;
    });
    return html;
}
function initOccupationAutocomplete(input, container) {
    if (!input) return;
    const autocompleteContainer = container.querySelector('.occupation-autocomplete');
    if (!autocompleteContainer) return;

    const renderResults = (searchTerm) => {
        autocompleteContainer.innerHTML = '';
        autocompleteContainer.classList.remove('hidden');

        const filtered = product_data.occupations
            .filter(occ => occ.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .slice(0, 50); // Limit results to avoid performance issues

        if (filtered.length === 0) {
            autocompleteContainer.innerHTML = '<div class="autocomplete-item p-3 text-gray-500">Không tìm thấy kết quả.</div>';
            return;
        }

        filtered.forEach(occ => {
            if (occ.group === 0) return; // Do not show the placeholder option
            const item = document.createElement('div');
            item.className = 'autocomplete-item p-3 cursor-pointer hover:bg-gray-100';
            item.textContent = occ.name;
            item.addEventListener('click', () => {
                input.value = occ.name;
                input.dataset.group = occ.group;
                const riskGroupSpan = container.querySelector('.risk-group-span');
                if (riskGroupSpan) {
                    riskGroupSpan.textContent = occ.group;
                }
                autocompleteContainer.classList.add('hidden');
                runWorkflow(); // A new risk group can affect eligibility and premiums
            });
            autocompleteContainer.appendChild(item);
        });
    };

    input.addEventListener('input', () => {
        renderResults(input.value);
    });

    input.addEventListener('focus', () => {
        if (input.value) {
            renderResults(input.value);
        }
    });

    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            autocompleteContainer.classList.add('hidden');
        }
    });
}
function initDateFormatter(input) {
    if (!input) return;
    input.addEventListener('input', (e) => {
        let value = input.value.replace(/\D/g, '');
        if (value.length > 2) {
            value = value.substring(0, 2) + '/' + value.substring(2);
        }
        if (value.length > 5) {
            value = value.substring(0, 5) + '/' + value.substring(5, 9);
        }
        input.value = value;
    });
}
function formatNumberInput(input) {}
function initSummaryModal() {}
function updateTargetAge() {}
function attachTermListenersForTargetAge() {}
function showGlobalErrors(errors) {}
function hideGlobalErrors() {}
function renderSuppList() {}

// ===================================================================================
// ===== MODULE: VIEWER PAYLOAD & INTEGRATION
// ===================================================================================
function bm_buildHtml(state) {
    let html = `<h3>Phần 1: Tóm tắt sản phẩm tham gia</h3>`;
    let totalAnnualFee = state.fees.totalMain + state.fees.totalSupp;

    html += `
        <table>
            <thead>
                <tr>
                    <th>Sản phẩm</th><th>Người được bảo hiểm</th><th>Số tiền bảo hiểm</th><th>Phí bảo hiểm năm</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Main Product
    const mainProductConfig = PRODUCT_CATALOG[state.mainProduct.key];
    html += `
        <tr>
            <td><strong>${mainProductConfig?.name || 'Sản phẩm chính'}</strong></td>
            <td>${sanitizeHtml(state.mainPerson.name)}</td>
            <td>${formatCurrency(state.mainProduct.stbh)}</td>
            <td>${formatCurrency(state.fees.totalMain)}</td>
        </tr>
    `;

    // Supplementary Products
    const allPersons = [state.mainPerson, ...state.supplementaryPersons];
    allPersons.forEach(person => {
        Object.entries(person.supplements).forEach(([prodId, suppData]) => {
            const suppConfig = PRODUCT_CATALOG[prodId];
            if (!suppConfig) return;
            const fee = state.fees.byPerson[person.id]?.suppDetails?.[prodId] || 0;
            if (fee <= 0) return;

            let stbhText = '-';
            if (suppConfig.ui.inputs?.includes('stbh')) {
                stbhText = formatCurrency(suppData.stbh);
            } else if (prodId.startsWith('health_scl')) {
                const programMap = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === 'HEALTH_SCL')?.programMap;
                stbhText = formatCurrency(programMap?.[suppData.program]?.core || 0);
            }

            html += `
                <tr>
                    <td>${suppConfig.name}</td>
                    <td>${sanitizeHtml(person.name)}</td>
                    <td>${stbhText}</td>
                    <td>${formatCurrency(fee)}</td>
                </tr>
            `;
        });
    });
     // Waiver (MDP3)
    if (state.waiver.selectedRider && state.waiver.fee > 0) {
        const waiverConfig = PRODUCT_CATALOG[state.waiver.selectedRider];
        const policyHolder = allPersons.find(p => p.id === state.waiver.policyHolderId);
        html += `
            <tr>
                <td>${waiverConfig.name}</td>
                <td>${policyHolder ? `BMBH: ${sanitizeHtml(policyHolder.name)}` : 'Bên mua bảo hiểm'}</td>
                <td>-</td>
                <td>${formatCurrency(state.waiver.fee)}</td>
            </tr>
        `;
    }

    html += `
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="3"><strong>Tổng phí bảo hiểm năm</strong></td>
                    <td><strong>${formatCurrency(totalAnnualFee)}</strong></td>
                </tr>
            </tfoot>
        </table>
    `;
    return html;
}


function buildViewerPayload() {
    const payload = { ...appState }; // Deep clone might be better if state is more complex
    payload.summaryHtml = bm_buildHtml(appState);
    
    // Clean up non-serializable data
    delete payload.mainPerson.container;
    payload.supplementaryPersons.forEach(p => delete p.container);
    
    return payload;
}

function openFullViewer() {
  try {
    const payload = buildViewerPayload();
    if (!payload.mainProduct.key) {
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
    iframe.onload = () => modal.classList.remove('loading');
    iframe.src = viewerUrl.toString();
  } catch (e) {
    console.error('Lỗi tạo payload:', e);
    alert('Không tạo được dữ liệu để mở bảng minh họa.');
  }
}

function initViewerModal() {
     const viewerBtn = document.getElementById('btnFullViewer');
     const modal = document.getElementById('viewer-modal');
     const closeBtn = document.getElementById('close-viewer-modal-btn');
     
     viewerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!appState.mainProduct.key) {
            showGlobalErrors(['Vui lòng chọn sản phẩm chính và điền đủ thông tin.']);
            return;
        }
        showGlobalErrors([]);
        openFullViewer();
     });
     
     closeBtn.addEventListener('click', () => {
         modal.classList.remove('visible');
         const iframe = document.getElementById('viewer-iframe');
         iframe.src = 'about:blank'; // Clear content to stop any processing
     });
}

document.addEventListener('DOMContentLoaded', () => {
    initState();
    initMainProductSelect();
    
    const mainSuppContainer = document.querySelector('#main-supp-container .supplementary-products-container');
    if(mainSuppContainer) mainSuppContainer.innerHTML = generateSupplementaryProductsHtml();

    initPerson(appState.mainPerson.container, true);
    initSupplementaryButton();
    initViewerModal();
    attachGlobalListeners();
    runWorkflow();
});

const runWorkflowDebounced = debounce(runWorkflow, 50);

function runWorkflow() {
  updateStateFromUI();
  appState.fees = performCalculations(appState);
  const isMainProductValid = runAllValidations(appState); // Assume this runs generic validation
  renderUI(isMainProductValid);
}
