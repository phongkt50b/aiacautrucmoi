
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
            const allInputs = ['stbh', 'program', 'scope'];
            
            allInputs.forEach(inputType => {
                const inputEl = section.querySelector(`.${prodId}-${inputType}`);
                if(inputEl) {
                    supplements[prodId][inputType] = (inputType === 'stbh') ? parseFormattedNumber(inputEl.value) : inputEl.value;
                }
            });
            
            // Handle child riders that inherit properties
            const parentRiderKey = prodConfig.parentRider;
            if (parentRiderKey && supplements[parentRiderKey]) {
                supplements[prodId] = { ...supplements[parentRiderKey], ...supplements[prodId] };
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
            let rateTableRefStr = '';
            
            if (productConfig.programs?.enabled) {
                const selectedProgramKey = options?.program;
                if (!selectedProgramKey) return 0;
                const programConfig = productConfig.programs.options.find(p => p.key === selectedProgramKey);
                if (!programConfig || !programConfig.rateTableRef) return 0;
                rateTableRefStr = programConfig.rateTableRef;
            } else {
                return 0; // Should not happen for this method type
            }

            let rateTable = product_data;
            rateTableRefStr.split('.').forEach(p => rateTable = rateTable ? rateTable[p] : undefined);
            
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
    
    const eligibilityRules = prodConfig.rules.eligibility || [];
    const renewalMaxRule = eligibilityRules.find(r => r.renewalMax);
    if (renewalMaxRule && ageToUse > renewalMaxRule.renewalMax) return 0;

    switch (calcConfig.method) {
        case 'rateLookup': {
            const supplementData = customerForCalc.supplements[prodId] || {};
            const { stbh } = supplementData;

            if (!stbh && !prodId.startsWith('health_scl')) return 0;

            let rateTableRefStr = calcConfig.rateTableRef.replace(/\${(.*?)}/g, (match, p1) => supplementData[p1] || '');
            if (rateTableRefStr.includes('undefined')) return 0;

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
                rateRecord = rateTable;
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
            const genderKey = customerForCalc.gender === 'Nữ' ? 'nu' : 'nam';
            if (calcConfig.lookupBy.includes('ageBand')) {
                 const rateRecord = rateTable.find(r => ageToUse >= r.ageMin && ageToUse <= r.ageMax);
                 if (rateRecord) rate = rateRecord[genderKey] || 0;
            }
            
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
    let anyUncheckedByRule = false;

    Object.entries(PRODUCT_CATALOG).forEach(([prodId, prodConfig]) => {
        if (prodConfig.type !== 'rider' || prodConfig.riderType === 'waiver') return;

        const section = container.querySelector(`.${prodId}-section`);
        if (!section) return;

        let isEligible = checkEligibility(customer, prodConfig.rules.eligibility);
        
        const parentIsSelected = prodConfig.parentRider ? !!customer.supplements[prodConfig.parentRider] : true;
        const dependenciesMet = prodConfig.dependsOn ? prodConfig.dependsOn.every(depKey => !!customer.supplements[depKey]) : true;
        isEligible = isEligible && parentIsSelected && dependenciesMet;
        
        section.classList.toggle('hidden', !isEligible);
        
        if (prodConfig.parentRider) section.classList.toggle('hidden', !parentIsSelected);
        
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
        
        // Handle dental dependency on outpatient for SCL
        if (prodId === 'health_scl_dental' && checkbox.checked) {
            if(!dependenciesMet) {
                checkbox.checked = false;
                anyUncheckedByRule = true;
            }
        }

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
                    programSelect.value = 'nang_cao'; // Default back to 'nang_cao'
                    wasChanged = true;
                }
                
                if (wasChanged) runWorkflowDebounced();
            }
        }
    });

    if (anyUncheckedByRule) runWorkflowDebounced();
}

function renderWaiverSection(allPersons, isValid) {
    const section = document.getElementById('mdp3-section');
    if (!section) return;

    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;
    section.classList.toggle('hidden', noSuppInsured);

    if (noSuppInsured) return;

    const container = document.getElementById('mdp3-radio-list');
    container.innerHTML = '';
    
    let optionsHtml = '';
    const waiverRiders = Object.entries(PRODUCT_CATALOG).filter(([,p]) => p.riderType === 'waiver');
    
    waiverRiders.forEach(([prodId, prodConfig]) => {
        const checked = appState.waiver.selectedRider === prodId ? 'checked' : '';
        optionsHtml += `
            <label class="flex items-center space-x-2">
                <input type="radio" name="waiver-rider-select" value="${prodId}" class="form-checkbox" ${checked}>
                <span>${prodConfig.name}</span>
            </label>
        `;
    });

    if (optionsHtml) {
        optionsHtml += `<div id="waiver-options-container" class="mt-2 pl-6 ${!appState.waiver.selectedRider ? 'hidden' : ''}">`;

        let personOptions = '';
        allPersons.forEach(p => {
            const waiverConfig = PRODUCT_CATALOG[appState.waiver.selectedRider];
            const isEligible = waiverConfig ? checkEligibility(p, waiverConfig.rules.eligibility) : false;
            if (isEligible) {
                const selected = appState.waiver.policyHolderId === p.id ? 'selected' : '';
                personOptions += `<option value="${p.id}" ${selected}>${sanitizeHtml(p.name)} (tuổi ${p.age})</option>`;
            }
        });

        optionsHtml += `
            <label class="font-medium block mb-1">Người được bảo hiểm cho quyền lợi này:</label>
            <select id="waiver-policy-holder-select" class="form-select">
                <option value="">-- Chọn --</option>
                ${personOptions}
            </select>
        `;
        optionsHtml += '</div>';

        const waiverFee = appState.waiver.fee;
        if (waiverFee > 0) {
             optionsHtml += `<div class="text-right font-semibold text-aia-red min-h-[1.5rem] mt-2">Phí: ${formatCurrency(waiverFee)}</div>`;
        }
    }

    container.innerHTML = optionsHtml;
    section.classList.toggle('opacity-50', !isValid);
    section.querySelectorAll('input, select').forEach(el => el.disabled = !isValid);
}

function updateSupplementaryAddButtonState(isValid) { 
    const btn = document.getElementById('add-supp-insured-btn');
    if (!btn) return;
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;
    const count = appState.supplementaryPersons.length;
    
    const disabled = noSuppInsured || (count >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) || !isValid;
    btn.disabled = disabled;
    btn.classList.toggle('opacity-50', disabled);
}

function updateSummaryUI(fees, isValid) { 
    const f = fees || { baseMain: 0, extra: 0, totalSupp: 0, total: 0 };
    const fmt = (n) => formatDisplayCurrency(Math.round((Number(n) || 0) / 1000) * 1000);

    const displayTotal = isValid ? f.total : 0;
    const displayTotalSupp = isValid ? f.totalSupp : 0;

    document.getElementById('summary-total').textContent = fmt(displayTotal);
    document.getElementById('main-insured-main-fee').textContent  = fmt(f.baseMain);
    document.getElementById('main-insured-extra-fee').textContent = fmt(f.extra);
    document.getElementById('summary-supp-fee').textContent  = fmt(displayTotalSupp);

    const freqSel = document.getElementById('payment-frequency');
    const freqBox = document.getElementById('frequency-breakdown');
    const v = freqSel ? freqSel.value : 'year';
    const periods = v === 'half' ? 2 : (v === 'quarter' ? 4 : 1);
    
    if (freqBox) freqBox.classList.toggle('hidden', periods === 1);
    if(periods === 1) return;

    const factor = GLOBAL_CONFIG.PAYMENT_FREQUENCY_FACTORS[v] || 1;
    const perMain = roundDownTo1000(f.baseMain / periods);
    const perExtra = roundDownTo1000(f.extra / periods);
    const perSupp = roundDownTo1000((displayTotalSupp * factor) / periods);
    const perTotal = perMain + perExtra + perSupp;
    const annualEquivalent = perTotal * periods;
    const annualOriginal = f.baseMain + f.extra + displayTotalSupp;
    const diff = annualEquivalent - annualOriginal;

    const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = fmt(val); };
    set('freq-main', perMain);
    set('freq-extra', perExtra);
    set('freq-supp-total', perSupp);
    set('freq-total-period', perTotal);
    set('freq-total-year', annualOriginal);
    set('freq-diff', diff);
    set('freq-total-year-equivalent', annualEquivalent);
    renderSuppList();
}

function updateMainProductFeeDisplay(base, extra) { 
    const el = document.getElementById('main-product-fee-display');
    if (el) {
        el.textContent = base > 0 ? `Phí cơ bản: ${formatCurrency(base)}` : '';
    }
}

function updatePaymentFrequencyOptions(base) {
    const sel = document.getElementById('payment-frequency');
    if (!sel) return;
    const optHalf = sel.querySelector('option[value="half"]');
    const optQuarter = sel.querySelector('option[value="quarter"]');
    
    const allowHalf = base >= GLOBAL_CONFIG.PAYMENT_FREQUENCY_THRESHOLDS.half;
    const allowQuarter = base >= GLOBAL_CONFIG.PAYMENT_FREQUENCY_THRESHOLDS.quarter;

    if (optHalf) { optHalf.disabled = !allowHalf; optHalf.classList.toggle('hidden', !allowHalf); }
    if (optQuarter) { optQuarter.disabled = !allowQuarter; optQuarter.classList.toggle('hidden', !allowQuarter); }
  
    if ((sel.value === 'quarter' && !allowQuarter) || (sel.value === 'half' && !allowHalf)) {
      sel.value = 'year';
    }
}

// ===================================================================================
// ===== MODULE: VALIDATION ENGINE
// ===================================================================================

function runAllValidations(state) {
    clearAllErrors();
    let errors = [];
    const addError = msg => { if(msg && !errors.includes(msg)) errors.push(msg); };

    // Validate main person
    if (!validateDobField(state.mainPerson.container.querySelector('.dob-input'))) addError('Ngày sinh NĐBH chính không hợp lệ.');
    if (!state.mainPerson.name) addError('Vui lòng nhập tên NĐBH chính.');
    if (!state.mainPerson.riskGroup) addError('Vui lòng chọn nghề nghiệp NĐBH chính.');

    // Validate main product
    const mainProductKey = state.mainProduct.key;
    const mainProductConfig = PRODUCT_CATALOG[mainProductKey];
    const mainProductSelect = document.getElementById('main-product');

    if (!mainProductKey || !mainProductConfig) {
        addError('Vui lòng chọn sản phẩm chính.');
    } else {
        const mainProductRules = mainProductConfig.rules.validationRules;
        if(mainProductRules) {
            const context = { person: state.mainPerson, product: state.mainProduct, fees: state.fees };
            const [isValid, msg] = validateField(state.mainProduct, mainProductRules, context, mainProductSelect);
            if (!isValid) addError(msg);
        }
        
        const termInput = document.getElementById('payment-term');
        if(termInput) {
            const termRule = mainProductConfig.rules.paymentTerm || {};
            const min = termRule.min || 4;
            const max = termRule.maxFunction ? eval(termRule.maxFunction)(state.mainPerson.age) : (100 - state.mainPerson.age);
            if (!state.mainProduct.paymentTerm || state.mainProduct.paymentTerm < min || state.mainProduct.paymentTerm > max) {
                 addError(`Thời gian đóng phí SP chính phải từ ${min} đến ${max} năm.`);
            }
        }
    }
    
    // Validate extra premium
    if (state.mainProduct.extraPremium > 0 && state.fees.baseMain > 0 && state.mainProduct.extraPremium > GLOBAL_CONFIG.EXTRA_PREMIUM_MAX_FACTOR * state.fees.baseMain) {
        addError(`Phí đóng thêm tối đa ${GLOBAL_CONFIG.EXTRA_PREMIUM_MAX_FACTOR} lần phí chính.`);
    }

    // Validate supplementary persons and products
    let totalHospitalSupportStbh = 0;
    const allPersons = [state.mainPerson, ...state.supplementaryPersons];
    allPersons.forEach(p => {
        if (!p.isMain) {
            if (!validateDobField(p.container.querySelector('.dob-input'))) addError(`Ngày sinh của ${p.name || 'NĐBH bổ sung'} không hợp lệ.`);
            if (!p.riskGroup) addError(`Vui lòng chọn nghề nghiệp cho ${p.name || 'NĐBH bổ sung'}.`);
        }
        for (const prodId in p.supplements) {
            const prodConfig = PRODUCT_CATALOG[prodId];
            if (!prodConfig || !prodConfig.rules.validationRules) continue;
            
            const context = { person: p, product: p.supplements[prodId], fees: state.fees, policy: { totalHospitalSupportStbh }};
            const suppSection = (p.isMain ? state.mainPerson.container : p.container).querySelector(`.${prodId}-section`);
            const inputEl = suppSection?.querySelector(`.${prodId}-stbh`);
            
            const [isValid, msg] = validateField(p.supplements[prodId], prodConfig.rules.validationRules, context, inputEl);
            if (!isValid) addError(`${prodConfig.name} (${p.name}): ${msg}`);

            if (prodId === 'hospital_support') {
                totalHospitalSupportStbh += p.supplements[prodId].stbh;
            }
        }
    });

    if (errors.length > 0) {
        showGlobalErrors(errors);
        return false;
    }
    return true;
}

function validateField(data, rules, context, elementToAttachError) {
    for (const ruleType in rules) {
        const ruleValue = rules[ruleType];
        switch (ruleType) {
            case 'anyOf': {
                const results = ruleValue.map(r => validateField(data, r, context));
                if (results.every(([isValid]) => !isValid)) {
                    return [false, `Phải thỏa mãn 1 trong các điều kiện: STBH >= ${formatCurrency(ruleValue[0].stbh.min)} hoặc Phí >= ${formatCurrency(ruleValue[1].premium.min)}`];
                }
                break;
            }
            case 'stbh':
            case 'premium': {
                const value = data[ruleType];
                if(ruleValue.min && value < ruleValue.min) return [false, `${ruleType === 'stbh' ? 'STBH' : 'Phí'} tối thiểu ${formatCurrency(ruleValue.min)}`];
                if(ruleValue.max && value > ruleValue.max) return [false, `${ruleType === 'stbh' ? 'STBH' : 'Phí'} tối đa ${formatCurrency(ruleValue.max)}`];
                
                if(ruleValue.stbhFactorRef) {
                    const factorTable = product_data[ruleValue.stbhFactorRef] || [];
                    const factorRow = factorTable.find(f => context.person.age >= f.ageMin && context.person.age <= f.ageMax);
                    if(factorRow && data.stbh > 0) {
                        const minFee = roundDownTo1000(data.stbh / factorRow.maxFactor);
                        const maxFee = roundDownTo1000(data.stbh / factorRow.minFactor);
                        if(value < minFee || value > maxFee) return [false, `Phí không hợp lệ. Với STBH này, phí phải từ ${formatCurrency(minFee)} đến ${formatCurrency(maxFee)}`];
                        
                        const rangeEl = document.getElementById('mul-fee-range');
                        if (rangeEl) rangeEl.textContent = `Phí hợp lệ từ ${formatCurrency(minFee)} đến ${formatCurrency(maxFee)}.`;
                    }
                }
                if(ruleValue.multipleOf && value % ruleValue.multipleOf !== 0) return [false, `Phải là bội số của ${formatCurrency(ruleValue.multipleOf)}`];

                if(ruleValue.maxConditions) {
                     const limits = ruleValue.maxConditions.map(cond => {
                        if (cond.scope === 'policy') {
                            const sourceValue = context.fees.baseMain;
                            return eval(cond.value.formula.replace('source', sourceValue));
                        }
                        if (cond.scope === 'person') {
                             const sourceValue = context.person.age;
                             const matchingCase = cond.value.cases.find(c => eval(c.condition.replace('source', sourceValue)));
                             return matchingCase ? matchingCase.result : Infinity;
                        }
                        return Infinity;
                    });
                    const finalLimit = Math.min(...limits);
                    const remainingForPolicy = (ruleValue.maxConditions.some(c=>c.scope==='policy')) 
                        ? (finalLimit - context.policy.totalHospitalSupportStbh)
                        : Infinity;

                    const trueMax = Math.min(finalLimit, remainingForPolicy);
                    
                    const validationEl = elementToAttachError?.parentElement.querySelector('.hospital-support-validation');
                    if (validationEl) validationEl.textContent = `Tối đa: ${formatCurrency(trueMax, 'đ/ngày')}.`;

                    if (value > trueMax) return [false, 'Vượt quá giới hạn cho phép'];
                }

                break;
            }
        }
    }
    return [true, ''];
}

function validateDobField(input) {
    if (!input) return false;
    clearFieldError(input);
    const v = (input.value || '').trim();
    if (!v) { setFieldError(input, 'Vui lòng nhập ngày sinh'); return false; }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
        setFieldError(input, 'Nhập DD/MM/YYYY'); return false;
    }
    const [dd, mm, yyyy] = v.split('/').map(n => parseInt(n, 10));
    const d = new Date(yyyy, mm - 1, dd);
    const valid = d.getFullYear() === yyyy && d.getMonth() === (mm - 1) && d.getDate() === dd && d <= GLOBAL_CONFIG.REFERENCE_DATE;
    if (!valid) { setFieldError(input, 'Ngày sinh không hợp lệ'); return false; }
    return true;
}

function setFieldError(input, msg) {
    if (!input) return;
    input.classList.toggle('border-red-500', !!msg);
    let errEl = input.parentElement.querySelector('.field-error');
    if(!errEl) {
        errEl = document.createElement('div');
        errEl.className = 'field-error text-xs text-red-600 mt-1';
        input.parentElement.appendChild(errEl);
    }
    errEl.textContent = msg;
}
function clearFieldError(input) { setFieldError(input, ''); }
function clearAllErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.remove());
    document.querySelectorAll('.border-red-500').forEach(el => el.classList.remove('border-red-500'));
    hideGlobalErrors();
}
function showGlobalErrors(errors) {
    const box = document.getElementById('global-error-box');
    if (!box || !errors || errors.length === 0) return;
    box.innerHTML = `<div class="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md space-y-1">
        <p class="font-bold">Vui lòng kiểm tra lại thông tin:</p>
        <ul class="list-disc pl-5">${errors.map(e => `<li>${sanitizeHtml(e)}</li>`).join('')}</ul>
    </div>`;
    box.classList.remove('hidden');
}
function hideGlobalErrors() {
    const box = document.getElementById('global-error-box');
    if(box) box.classList.add('hidden');
}

function checkEligibility(person, rules) { 
    if (!person || !rules) return false;
    return rules.every(rule => {
        // Handle conditional rules (e.g., different age limits for Nam/Nữ)
        if (rule.condition && !rule.condition(person)) return true;

        switch (rule.type) {
            case 'age':
                return (!rule.min || person.age >= rule.min) && (!rule.max || person.age <= rule.max);
            case 'daysFromBirth':
                return (!rule.min || person.daysFromBirth >= rule.min) && (!rule.max || person.daysFromBirth <= rule.max);
            case 'riskGroup':
                if (rule.required && (person.riskGroup === 0 || !person.riskGroup)) return false;
                if (rule.exclude && rule.exclude.includes(person.riskGroup)) return false;
                return true;
            default: return true;
        }
    });
}
// ===================================================================================
// ===== MODULE: INITIALIZATION & EVENT BINDING
// ===================================================================================
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
        if (e.target.matches('input[type="text"]') && !e.target.classList.contains('dob-input') && !e.target.classList.contains('name-input') && !e.target.classList.contains('occupation-input')) {
            formatNumberInput(e.target);
        }
    });
    document.body.addEventListener('change', e => {
        if (e.target.matches('.form-checkbox, .form-select, input[type="radio"]')) {
            runWorkflow();
        }
    });
    document.body.addEventListener('click', e => {
        if (e.target.matches('.remove-supp-btn')) {
            e.target.closest('.person-container').remove();
            runWorkflow();
        }
    });
}
function initPerson(container, isMain) {
    initDateFormatter(container.querySelector('.dob-input'));
    initOccupationAutocomplete(container.querySelector('.occupation-input'), container);
    
    const suppProductsContainer = isMain 
        ? document.querySelector('#main-supp-container .supplementary-products-container') 
        : container.querySelector('.supplementary-products-container');
    if (suppProductsContainer) suppProductsContainer.innerHTML = generateSupplementaryProductsHtml();
}
function initSupplementaryButton() {
    document.getElementById('add-supp-insured-btn').addEventListener('click', () => {
        const count = document.querySelectorAll('#supplementary-insured-container .person-container').length;
        if (count >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) {
            alert(`Chỉ được thêm tối đa ${GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED} NĐBH bổ sung.`);
            return;
        }
        const id = `supp-person-${Date.now()}`;
        const template = document.getElementById('supplementary-person-template').innerHTML;
        const html = template.replace(/data-template-id="title"/g, `data-id="${id}"`)
                   .replace('NĐBH Bổ Sung', `NĐBH Bổ Sung ${count + 1}`)
                   .replace(/class="person-container/g, `class="person-container" id="${id}"`);

        const container = document.getElementById('supplementary-insured-container');
        const div = document.createElement('div');
        div.innerHTML = html;
        const personNode = div.firstChild;
        container.appendChild(personNode);
        initPerson(personNode, false);
        runWorkflow();
    });
}

function generateSupplementaryProductsHtml() {
     let html = '';
    const riderEntries = Object.entries(PRODUCT_CATALOG).filter(([, config]) => config.type === 'rider' && config.riderType !== 'waiver');
    
    riderEntries.sort(([, a], [, b]) => {
        if (a.parentRider && !b.parentRider) return 1;
        if (!a.parentRider && b.parentRider) return -1;
        if (a.dependsOn && !b.dependsOn) return 1;
        if (!a.dependsOn && b.dependsOn) return -1;
        return 0;
    });

    riderEntries.forEach(([prodId, prodConfig]) => {
        let optionsHtml = '';
        const ui = prodConfig.ui;

        ui.inputs?.forEach(inputType => {
             if (inputType === 'stbh') {
                optionsHtml += `<div>
                  <label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
                  <input type="text" class="form-input ${prodId}-stbh" placeholder="Nhập STBH">
                   <p class="hospital-support-validation text-sm text-gray-500 mt-1"></p>
                </div>`;
            } else if (inputType === 'scope') {
                 optionsHtml += `<div>
                    <label class="font-medium text-gray-700 block mb-1">Phạm vi địa lý</label>
                    <select class="form-select ${prodId}-scope">
                      <option value="main_vn">Việt Nam</option>
                      <option value="main_global">Nước ngoài</option>
                    </select>
                  </div>`;
            }
        });

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
            .slice(0, 50);

        if (filtered.length === 0) {
            autocompleteContainer.innerHTML = '<div class="autocomplete-item p-3 text-gray-500">Không tìm thấy kết quả.</div>';
            return;
        }

        filtered.forEach(occ => {
            if (occ.group === 0) return;
            const item = document.createElement('div');
            item.className = 'autocomplete-item p-3 cursor-pointer hover:bg-gray-100';
            item.textContent = occ.name;
            item.addEventListener('click', () => {
                input.value = occ.name;
                input.dataset.group = occ.group;
                clearFieldError(input);
                autocompleteContainer.classList.add('hidden');
                runWorkflow();
            });
            autocompleteContainer.appendChild(item);
        });
    };

    input.addEventListener('input', () => { renderResults(input.value); });
    input.addEventListener('focus', () => { if (input.value) renderResults(input.value); });
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) autocompleteContainer.classList.add('hidden');
    });
}
function initDateFormatter(input) {
    if (!input) return;
    input.addEventListener('input', (e) => {
        let value = input.value.replace(/\D/g, '');
        if (value.length > 2) value = value.substring(0, 2) + '/' + value.substring(2);
        if (value.length > 5) value = value.substring(0, 5) + '/' + value.substring(5, 9);
        input.value = value;
    });
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

function updateTargetAge() {
    const targetAgeInput = document.getElementById('target-age-input');
    if(!targetAgeInput) return;
    const isUL = ['PUL', 'MUL'].includes(PRODUCT_CATALOG[appState.mainProduct.key]?.group);
    targetAgeInput.parentElement.classList.toggle('hidden', !isUL);

    if(!isUL) return;

    const term = appState.mainProduct.paymentTerm || 0;
    const age = appState.mainPerson.age || 0;
    const hintEl = document.getElementById('target-age-hint');
    if (!term || term <= 0 || !age) {
        if (hintEl) hintEl.textContent = 'Nhập tuổi NĐBH và thời gian đóng phí.';
        return;
    }

    const minAge = age + term - 1;
    const maxAge = 99;
    targetAgeInput.min = String(minAge);
    targetAgeInput.max = String(maxAge);

    const curVal = parseInt(targetAgeInput.value || '0', 10);
    if (!curVal || curVal < minAge) targetAgeInput.value = 99;
    else if (curVal > maxAge) targetAgeInput.value = maxAge;

    if (hintEl) hintEl.innerHTML = `Khoảng hợp lệ: <strong>${minAge}</strong> – <strong>${maxAge}</strong>.`;
}

function attachTermListenersForTargetAge() {
    const paymentTermInput = document.getElementById('payment-term');
    if (paymentTermInput) paymentTermInput.addEventListener('change', updateTargetAge);
}

function renderSuppList() {
    const box = document.getElementById('supp-insured-summaries');
    const btn = document.getElementById('toggle-supp-list-btn');
    if (!box || !btn) return;

    const persons = [appState.mainPerson, ...appState.supplementaryPersons].filter(p => p);
    const feesMap = window.personFees || {};
    let totalSuppFee = 0;

    const rows = persons.map(p => {
        const fee = feesMap[p.id]?.supp || 0;
        totalSuppFee += fee;
        if (fee <= 0) return '';
        return `<div class="flex justify-between text-sm">
                  <span>${sanitizeHtml(p.name)}</span>
                  <span>${formatDisplayCurrency(fee)}</span>
                </div>`;
    }).filter(Boolean);

    if (rows.length > 0) {
        box.innerHTML = rows.join('');
        btn.parentElement.classList.remove('hidden');
    } else {
        box.innerHTML = '';
        btn.parentElement.classList.add('hidden');
        box.classList.add('hidden');
    }
}
// ===================================================================================
// ===== MODULE: VIEWER PAYLOAD & INTEGRATION (PORTED FROM LOGIC-1.JS)
// ===================================================================================
function buildViewerPayload() {
    const payload = __buildSummaryDataForViewer();
    payload.summaryHtml = __exportExactSummaryHtml();
    
    // Clean up non-serializable data from the state snapshot
    if (payload.appStateSnapshot) {
        delete payload.appStateSnapshot.mainPerson.container;
        payload.appStateSnapshot.supplementaryPersons.forEach(p => delete p.container);
    }
    
    return payload;
}

function __buildSummaryDataForViewer() {
    const mainKey = appState.mainProduct.key;
    const mainPerson = appState.mainPerson || {};
    const productConfig = PRODUCT_CATALOG[mainKey];
    let paymentTermFinal = appState.mainProduct.paymentTerm || 0;
    if (productConfig?.programs?.enabled) {
        const progKey = appState.mainProduct.options.program;
        const progConf = productConfig.programs.options.find(p=>p.key===progKey);
        if (progConf?.defaultPaymentTerm) paymentTermFinal = progConf.defaultPaymentTerm;
    }

    const allPersons = [appState.mainPerson, ...appState.supplementaryPersons].filter(p => p);
    const riderList = [];
    allPersons.forEach(person => {
        Object.entries(person.supplements).forEach(([rid, data]) => {
            const premiumDetail = appState.fees.byPerson?.[person.id]?.suppDetails?.[rid] || 0;
            if (premiumDetail > 0) riderList.push({ key: rid, personId: person.id, ...data });
        });
    });

    const targetAgeInputVal = parseInt(document.getElementById('target-age-input')?.value || '0', 10);
    const targetAge = targetAgeInputVal || ((mainPerson.age || 0) + paymentTermFinal - 1);

    return {
        productKey: mainKey,
        mainPerson: { name: mainPerson.name, dob: mainPerson.dob, age: mainPerson.age, gender: mainPerson.gender, riskGroup: mainPerson.riskGroup },
        allPersons: allPersons.map(p => ({id: p.id, name: p.name, age: p.age, gender: p.gender})),
        productInfo: { stbh: appState.mainProduct.stbh, paymentTerm: paymentTermFinal, extraPremium: appState.mainProduct.extraPremium, options: appState.mainProduct.options },
        fees: appState.fees,
        riders: riderList,
        waiver: appState.waiver,
        targetAge: targetAge,
        paymentFrequency: appState.paymentFrequency,
        customInterestRate: document.getElementById('custom-interest-rate-input')?.value || '4.7',
        appStateSnapshot: JSON.parse(JSON.stringify(appState)) // For debugging or reprocessing
    };
}
function __exportExactSummaryHtml() { return "Bảng minh họa chi tiết đang được xây dựng."; }

function openFullViewer() {
  try {
    if (!runAllValidations(appState)) {
        console.warn("Validation failed. Viewer not opened.");
        const box = document.getElementById('global-error-box');
        if(box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
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
     
     viewerBtn.addEventListener('click', (e) => { e.preventDefault(); openFullViewer(); });
     closeBtn.addEventListener('click', () => {
         modal.classList.remove('visible');
         document.getElementById('viewer-iframe').src = 'about:blank';
     });
}

// ===================================================================================
// ===== WORKFLOW & MAIN
// ===================================================================================
document.addEventListener('DOMContentLoaded', () => {
    initState();
    initMainProductSelect();
    initPerson(appState.mainPerson.container, true);
    initSupplementaryButton();
    initViewerModal();
    attachGlobalListeners();
    const btn = document.getElementById('toggle-supp-list-btn');
    if (btn) btn.addEventListener('click', () => document.getElementById('supp-insured-summaries').classList.toggle('hidden'));
    runWorkflow();
});

const runWorkflowDebounced = debounce(runWorkflow, 50);

function runWorkflow() {
  updateStateFromUI();
  appState.fees = performCalculations(appState);
  const isMainProductValid = runAllValidations(appState);
  renderUI(isMainProductValid);
  updateTargetAge();
}

// ===================================================================================
// ===== VIEWER HTML GENERATION LOGIC (PORTED & ADAPTED FROM LOGIC-1.JS)
// ===================================================================================
// This function will overwrite the placeholder `__exportExactSummaryHtml`
function bm_buildHtml(payload) {
    const { productKey, mainPerson, productInfo, fees, riders, waiver, targetAge, paymentFrequency, customInterestRate, allPersons } = payload;
    
    const freqMap = { year: 'Năm', half: 'Nửa năm', quarter: 'Quý'};
    let html = `<div class="mb-4">
        <h2 class="text-xl font-bold">BẢNG MINH HỌA PHÍ & QUYỀN LỢI</h2>
        <div class="text-sm text-gray-700">
            Sản phẩm chính: <strong>${sanitizeHtml(PRODUCT_CATALOG[productKey]?.name || '—')}</strong>&nbsp;|&nbsp;
            Kỳ đóng: <strong>${sanitizeHtml(freqMap[paymentFrequency] || paymentFrequency)}</strong>&nbsp;|&nbsp;
            Minh họa đến tuổi: <strong>${targetAge}</strong>
        </div>
    </div>`;

    // PART 1: SUMMARY TABLE
    html += bm_buildPart1_SummaryTable(payload);

    // PART 2: BENEFITS TABLE
    html += bm_buildPart2_Benefits(payload);
    
    // PART 3: SCHEDULE TABLE
    html += bm_buildPart3_Schedule(payload);

    html += `<div class="mt-6 text-xs text-gray-600 italic">(*) Công cụ này chỉ mang tính chất tham khảo. Quyền lợi và mức phí cụ thể sẽ được xác nhận trong hợp đồng do AIA phát hành.</div>`;
    return html;
}
__exportExactSummaryHtml = () => bm_buildHtml(__buildSummaryDataForViewer()); // Connect the real function

function bm_buildPart1_SummaryTable(payload) {
    const { fees, paymentFrequency, allPersons, riders, waiver } = payload;
    const totalAnnualFee = fees.baseMain + fees.extra + fees.totalSupp;

    let rows = `
        <tr>
            <td><strong>${sanitizeHtml(PRODUCT_CATALOG[payload.productKey]?.name)}</strong></td>
            <td>${sanitizeHtml(payload.mainPerson.name)}</td>
            <td>${formatCurrency(payload.productInfo.stbh)}</td>
            <td>${formatCurrency(fees.totalMain)}</td>
        </tr>
    `;

    allPersons.forEach(person => {
        riders.filter(r => r.personId === person.id).forEach(rider => {
            const riderConfig = PRODUCT_CATALOG[rider.key];
            if (!riderConfig) return;
            const fee = fees.byPerson[person.id]?.suppDetails[rider.key] || 0;
            if (fee <= 0) return;
            
            let stbhText = '-';
            if(riderConfig.ui.inputs?.includes('stbh')) {
                stbhText = formatCurrency(rider.stbh);
            } else if (rider.key.startsWith('health_scl')) {
                const schema = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === 'HEALTH_SCL');
                const stbh = schema?.programMap?.[rider.program]?.core || 0;
                stbhText = formatCurrency(stbh);
            }

             rows += `<tr>
                <td>${sanitizeHtml(riderConfig.name)}</td>
                <td>${sanitizeHtml(person.name)}</td>
                <td>${stbhText}</td>
                <td>${formatCurrency(fee)}</td>
            </tr>`;
        });
    });

    if (waiver.selectedRider && waiver.fee > 0) {
        const waiverConfig = PRODUCT_CATALOG[waiver.selectedRider];
        const policyHolder = allPersons.find(p => p.id === waiver.policyHolderId);
        rows += `<tr>
            <td>${sanitizeHtml(waiverConfig.name)}</td>
            <td>${policyHolder ? `BMBH: ${sanitizeHtml(policyHolder.name)}` : 'Bên mua bảo hiểm'}</td>
            <td>-</td>
            <td>${formatCurrency(waiver.fee)}</td>
        </tr>`;
    }

    return `<h3 class="text-lg font-bold mb-2">Phần 1 · Tóm tắt sản phẩm</h3>
    <div class="overflow-x-auto"><table class="w-full border-collapse text-sm">
        <thead><tr><th>Sản phẩm</th><th>Người được bảo hiểm</th><th>Số tiền bảo hiểm</th><th>Phí bảo hiểm năm</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3"><strong>Tổng phí bảo hiểm năm</strong></td><td><strong>${formatCurrency(totalAnnualFee)}</strong></td></tr></tfoot>
    </table></div>`;
}

function bm_buildPart2_Benefits(payload) {
    // This is a simplified version for now. A full implementation would be more complex.
    return `<h3 class="text-lg font-bold mt-6 mb-3">Phần 2 · Tóm tắt quyền lợi sản phẩm</h3>
            <div class="text-sm text-gray-500 italic mb-4">Phần tóm tắt quyền lợi chi tiết đang được xây dựng.</div>`;
}

function bm_buildPart3_Schedule(payload) {
    const { productKey, mainPerson, productInfo, fees, riders, targetAge, customInterestRate, paymentFrequency } = payload;
    const productConfig = PRODUCT_CATALOG[productKey];
    const isUL = productConfig?.investmentConfig?.enabled;
    if (!isUL) return '<h3 class="text-lg font-bold mt-6 mb-2">Phần 3 · Lịch trình phí</h3><div class="text-sm text-gray-500 italic mb-4">Bảng lịch trình phí cho sản phẩm truyền thống đang được xây dựng.</div>';

    const projection = calculateAccountValueProjection(mainPerson, productInfo, fees.baseMain, productInfo.extraPremium, targetAge, customInterestRate, paymentFrequency);
    
    let header = '<tr><th>Năm HĐ</th><th>Tuổi</th><th>Phí đóng</th><th>Giá trị TK (Lãi suất cam kết)</th><th>Giá trị TK (Lãi suất minh họa)</th></tr>';
    let body = '';
    const totalYears = targetAge - mainPerson.age + 1;
    let totalPremiumPaid = 0;

    for (let i = 0; i < totalYears; i++) {
        const year = i + 1;
        const age = mainPerson.age + i;
        const premiumThisYear = (year <= productInfo.paymentTerm) ? (fees.baseMain + productInfo.extraPremium) : 0;
        totalPremiumPaid += premiumThisYear;
        body += `<tr>
            <td>${year}</td>
            <td>${age}</td>
            <td>${formatCurrency(premiumThisYear)}</td>
            <td>${formatCurrency(projection.guaranteed[i] || 0)}</td>
            <td>${formatCurrency(projection.customCapped[i] || 0)}</td>
        </tr>`;
    }
    const footer = `<tr><td colspan="2"><strong>Tổng</strong></td><td><strong>${formatCurrency(totalPremiumPaid)}</strong></td><td></td><td></td></tr>`;
    
    return `<h3 class="text-lg font-bold mt-6 mb-2">Phần 3 · Bảng phí & Minh họa giá trị tài khoản</h3>
        <div class="overflow-x-auto"><table class="w-full border-collapse text-sm text-center">
            <thead>${header}</thead><tbody>${body}</tbody><tfoot>${footer}</tfoot>
        </table></div>`;
}

// Dummy function for now, will be implemented with full logic
function calculateAccountValueProjection(mainPerson, mainProduct, basePremium, extraPremium, targetAge, customInterestRate, paymentFrequency) {
    const years = targetAge - mainPerson.age + 1;
    // This is a placeholder. A real implementation would be very complex.
    const mockProjection = (rate) => {
        let av = 0;
        const results = [];
        for(let i=1; i<= years; i++) {
            const premium = (i <= mainProduct.paymentTerm) ? (basePremium + extraPremium) : 0;
            av = (av + premium) * (1 + rate);
            results.push(Math.round(av));
        }
        return results;
    }
    return {
        guaranteed: mockProjection(0.02),
        customCapped: mockProjection(parseFloat(customInterestRate)/100 || 0.047)
    }
}
