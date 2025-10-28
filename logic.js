
import { GLOBAL_CONFIG, PRODUCT_CATALOG } from './structure.js';
import { product_data } from './data.js';

// ===================================================================================
// ===== UTILS
// ===================================================================================
function debounce(fn, wait = 40) {
  let t = null;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
function parseFormattedNumber(formattedString) {
  if (formattedString == null) return 0;
  let v = String(formattedString).replace(/[\s.,]/g, '');
  const m = v.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : 0;
}
function formatCurrency(value, suffix = '') {
    const num = Number(value) || 0;
    return num.toLocaleString('vi-VN') + (suffix || '');
}
function sanitizeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#39;');
}
function roundDownTo1000(n) {
    return Math.floor(Number(n || 0) / 1000) * 1000;
}

// ===================================================================================
// ===== STATE MANAGEMENT
// ===================================================================================
let appState = {};

function initState() {
    appState = {
        mainProduct: {
            key: '',
            values: {} // e.g., { stbh: 1000, premium: 500, 'payment-term': 20 }
        },
        paymentFrequency: 'year',
        persons: [],
        waiverOfPremium: {
            selectedPersonId: null,
            otherPersonInfo: null, // Stores info if "other" is selected
            products: {} // e.g., { mdp3: { enabled: true, fee: 123 } }
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
    // Add main person
    const mainPersonContainer = document.getElementById('main-person-container');
    appState.persons.push({
        id: mainPersonContainer.id,
        container: mainPersonContainer,
        isMain: true,
        name: '', dob: '', age: 0, daysFromBirth: 0, gender: 'Nam', riskGroup: 0,
        supplements: {}
    });
}

// ===================================================================================
// ===== DATA COLLECTION (Reading from DOM into State)
// ===================================================================================

function updateStateFromUI() {
    appState.mainProduct.key = document.getElementById('main-product')?.value || '';
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];

    if (mainProductConfig?.ui?.controls) {
        appState.mainProduct.values = {};
        mainProductConfig.ui.controls.forEach(control => {
            const el = document.getElementById(control.id);
            if (!el) return;
            const value = control.type === 'currencyInput' ? parseFormattedNumber(el.value) : el.value;
            appState.mainProduct.values[control.id] = value;
        });
    }

    appState.paymentFrequency = document.getElementById('payment-frequency')?.value || 'year';
    
    appState.persons.forEach(person => {
        Object.assign(person, collectPersonData(person.container, person.isMain));
    });
    
    const waiverContainer = document.getElementById('waiver-of-premium-container');
    if (waiverContainer) {
        const selectedPersonId = waiverContainer.querySelector('.wop-person-select')?.value || null;
        appState.waiverOfPremium.selectedPersonId = selectedPersonId;

        if (selectedPersonId === 'other') {
            const otherForm = document.getElementById('wop-other-person-form');
            appState.waiverOfPremium.otherPersonInfo = otherForm ? collectPersonData(otherForm, false, true) : null;
        } else {
            appState.waiverOfPremium.otherPersonInfo = null;
        }

        appState.waiverOfPremium.products = {};
        waiverContainer.querySelectorAll('.wop-product-checkbox').forEach(cb => {
            const prodKey = cb.dataset.productKey;
            appState.waiverOfPremium.products[prodKey] = { enabled: cb.checked };
        });
    }
}

function collectPersonData(container, isMain, isWopOther = false) {
    if (!container) return null;

    const dobStr = container.querySelector('.dob-input')?.value || '';
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

    const supplements = {};
    if (!isWopOther) {
        const supplementsContainer = isMain 
            ? document.querySelector('#main-supp-container .supplementary-products-container')
            : container.querySelector('.supplementary-products-container');
        
        if (supplementsContainer) {
            supplementsContainer.querySelectorAll('.product-section').forEach(section => {
                const prodKey = section.dataset.productKey;
                if (section.querySelector(`.${prodKey}-checkbox`)?.checked) {
                    supplements[prodKey] = {};
                    PRODUCT_CATALOG[prodKey]?.ui.controls.forEach(control => {
                        const el = section.querySelector(`#${control.id}`);
                        if (el) {
                            const value = control.type === 'currencyInput' ? parseFormattedNumber(el.value) : (el.type === 'checkbox' ? el.checked : el.value);
                            supplements[prodKey][control.id.replace(`${prodKey}-`, '')] = value;
                        }
                    });
                }
            });
        }
    }

    return {
        id: container.id,
        container: container,
        isMain: isMain,
        name: container.querySelector('.name-input')?.value || (isMain ? 'NĐBH Chính' : (isWopOther ? 'Người khác' : 'NĐBH Bổ sung')),
        dob: dobStr,
        age, daysFromBirth,
        gender: container.querySelector('.gender-select')?.value || 'Nam',
        riskGroup: isWopOther ? 0 : (parseInt(container.querySelector('.occupation-input')?.dataset.group, 10) || 0),
        supplements
    };
}


// ===================================================================================
// ===== CALCULATIONS ENGINE
// ===================================================================================
function performCalculations(state) {
    const fees = { baseMain: 0, extra: 0, totalSupp: 0, byPerson: {} };
    const mainPerson = state.persons.find(p => p.isMain);
    const mainProductConfig = PRODUCT_CATALOG[state.mainProduct.key];

    if (mainPerson && mainProductConfig) {
        fees.baseMain = calculateMainPremium(mainPerson, state.mainProduct);
        fees.extra = state.mainProduct.values['extra-premium'] || 0;
    }
    
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;
    const suppPersons = noSuppInsured ? [] : state.persons.filter(p => !p.isMain);
    const allInsuredPersons = [mainPerson, ...suppPersons].filter(p => p);

    allInsuredPersons.forEach(p => {
        fees.byPerson[p.id] = { main: 0, supp: 0, total: 0, suppDetails: {} };
    });

    if (mainPerson && fees.byPerson[mainPerson.id]) {
        fees.byPerson[mainPerson.id].main = fees.baseMain + fees.extra;
    }
    
    let totalHospitalSupportStbh = 0;
    allInsuredPersons.forEach(person => {
        let personSuppFee = 0;
        Object.keys(person.supplements).forEach(prodId => {
            const prodConfig = PRODUCT_CATALOG[prodId];
            if (!prodConfig?.calculation?.calculate) return;
            
            const ageOverride = null; // Can be used for projections
            const fee = prodConfig.calculation.calculate({
                config: prodConfig,
                customer: person,
                ageOverride,
                mainPremium: fees.baseMain,
                totalHospitalSupportStbh,
            });
            personSuppFee += fee;
            fees.byPerson[person.id].suppDetails[prodId] = fee;
            
            if (prodConfig.category === 'hospital_support') {
                totalHospitalSupportStbh += person.supplements[prodId]?.stbh || 0;
            }
        });
        fees.byPerson[person.id].supp = personSuppFee;
        fees.totalSupp += personSuppFee;
    });

    // Calculate Waiver of Premium fees
    const wopState = state.waiverOfPremium;
    if (wopState.selectedPersonId) {
        let stbhBase = (fees.baseMain + fees.extra) + fees.totalSupp;
        
        if (wopState.selectedPersonId !== 'other') {
            const waivedPersonFees = fees.byPerson[wopState.selectedPersonId]?.supp || 0;
            stbhBase -= waivedPersonFees;
        }

        let wopTargetPerson = wopState.selectedPersonId === 'other'
            ? wopState.otherPersonInfo
            : state.persons.find(p => p.id === wopState.selectedPersonId);
        
        if (wopTargetPerson) {
            Object.keys(wopState.products).forEach(prodId => {
                if (wopState.products[prodId].enabled) {
                    const prodConfig = PRODUCT_CATALOG[prodId];
                    if (!prodConfig?.calculation?.calculate) return;
                    
                    const fee = prodConfig.calculation.calculate({ customer: wopTargetPerson, stbhBase });
                    
                    wopState.products[prodId].fee = fee;
                    wopState.products[prodId].stbhBase = stbhBase;
                    fees.totalSupp += fee;

                    const personIdForFee = wopState.selectedPersonId === 'other' ? 'wop_other' : wopState.selectedPersonId;
                    if (!fees.byPerson[personIdForFee]) {
                        fees.byPerson[personIdForFee] = { main: 0, supp: 0, total: 0, suppDetails: {} };
                    }
                    fees.byPerson[personIdForFee].supp += fee;
                    fees.byPerson[personIdForFee].suppDetails[prodId] = fee;
                }
            });
        }
    }

    const totalMain = fees.baseMain + fees.extra;
    const total = totalMain + fees.totalSupp;
    return { ...fees, totalMain, total };
}

function calculateMainPremium(customer, productInfo) {
    const productConfig = PRODUCT_CATALOG[productInfo.key];
    if (!productConfig) return 0;
    
    if (productConfig.group === 'PACKAGE') {
        const underlyingKey = productConfig.packageConfig.underlyingMainProduct;
        const underlyingConfig = PRODUCT_CATALOG[underlyingKey];
        if (!underlyingConfig) return 0;
        
        const packageInfo = {
            key: underlyingKey,
            values: { ...productConfig.packageConfig.fixedValues }
        };
        return calculateMainPremium(customer, packageInfo);
    }
    
    if (productConfig.calculation && typeof productConfig.calculation.calculate === 'function') {
        return productConfig.calculation.calculate({ config: productConfig, customer, productInfo });
    }
    return 0;
}


// ===================================================================================
// ===== UI RENDER ENGINE
// ===================================================================================

function renderUI(isMainProductValid) {
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;

    document.getElementById('supplementary-insured-section').classList.toggle('hidden', noSuppInsured);
    if (noSuppInsured) {
        document.getElementById('supplementary-insured-container').innerHTML = '';
        appState.persons = appState.persons.filter(p => p.isMain);
    }
    
    appState.persons.forEach(p => {
        p.container.querySelector('.age-span').textContent = p.age;
        if(p.container.querySelector('.risk-group-span')) {
            p.container.querySelector('.risk-group-span').textContent = p.riskGroup > 0 ? p.riskGroup : '...';
        }
    });
    
    renderMainProductSection();
    appState.persons.forEach(p => renderSupplementaryProductsForPerson(p, isMainProductValid));
    renderWaiverOfPremiumSection(isMainProductValid);
    renderSummary(isMainProductValid);
    updateSupplementaryAddButtonState(isMainProductValid);
    updatePaymentFrequencyOptions(appState.fees.baseMain);
}

let lastRenderedProductKey = null;
let lastRenderedAge = null;
function renderMainProductSection() {
    const mainProductKey = appState.mainProduct.key;
    const mainPerson = appState.persons.find(p => p.isMain);
    
    document.querySelectorAll('#main-product option').forEach(option => {
        const productKey = option.value;
        const productConfig = PRODUCT_CATALOG[productKey];
        if (!productConfig) return;
        option.disabled = !checkEligibility(mainPerson, productConfig.rules.eligibility);
    });
    
    if (lastRenderedProductKey === mainProductKey && lastRenderedAge === mainPerson.age) return;
    lastRenderedProductKey = mainProductKey;
    lastRenderedAge = mainPerson.age;

    const container = document.getElementById('main-product-options');
    container.innerHTML = '';
    const productConfig = PRODUCT_CATALOG[mainProductKey];
    if (!productConfig?.ui?.controls) return;
    
    const controlsHtml = productConfig.ui.controls.map(cfg => {
        const value = appState.mainProduct.values[cfg.id] ?? cfg.defaultValue ?? '';
        return renderControl(cfg, value, mainPerson);
    }).join('');

    container.innerHTML = controlsHtml;
    
    const paymentTermInput = document.getElementById('payment-term');
    if (paymentTermInput && !paymentTermInput.value) {
        const defaultTerm = productConfig.ui.controls.find(c => c.id === 'payment-term')?.defaultValue || '';
        if(defaultTerm) paymentTermInput.value = defaultTerm;
    }
}

function renderSupplementaryProductsForPerson(customer, isMainProductValid) {
    const container = customer.isMain
        ? document.querySelector('#main-supp-container .supplementary-products-container')
        : customer.container.querySelector('.supplementary-products-container');
    if (!container) return;

    Object.entries(PRODUCT_CATALOG).forEach(([prodId, prodConfig]) => {
        if (prodConfig.type !== 'rider' || prodConfig.category === 'waiver_of_premium') return;

        const section = container.querySelector(`[data-product-key="${prodId}"]`);
        if (!section) return;

        const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
        const isEligible = checkEligibility(customer, prodConfig.rules.eligibility);
        const isDisabledByPackage = mainProductConfig?.group === 'PACKAGE' && !mainProductConfig.packageConfig.mandatoryRiders.includes(prodId);
        
        section.classList.toggle('hidden', !isEligible || isDisabledByPackage);

        const checkbox = section.querySelector(`.${prodId}-checkbox`);
        if (!checkbox) return;
        
        const finalDisabled = !isEligible || !isMainProductValid || isDisabledByPackage;
        checkbox.disabled = finalDisabled;

        if (mainProductConfig?.group === 'PACKAGE' && mainProductConfig.packageConfig.mandatoryRiders.includes(prodId)) {
            checkbox.checked = true;
            checkbox.disabled = true;
        }

        section.classList.toggle('opacity-50', checkbox.disabled);
        section.querySelector('.product-options')?.classList.toggle('hidden', !checkbox.checked);
        
        const fee = appState.fees.byPerson[customer.id]?.suppDetails?.[prodId] || 0;
        const feeDisplay = section.querySelector('.fee-display');
        if (feeDisplay) {
            feeDisplay.textContent = fee > 0 ? `Phí: ${formatCurrency(fee)}` : '';
        }

        prodConfig.ui.onRender?.({
            section,
            el: section,
            customer,
            mainPremium: appState.fees.baseMain,
            allValues: appState.mainProduct.values,
            config: prodConfig,
            mainProductConfig
        });
    });
}

function renderWaiverOfPremiumSection(isMainProductValid) {
    const container = document.getElementById('waiver-of-premium-container');
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const isDisabled = !isMainProductValid || mainProductConfig?.rules?.noSupplementaryInsured;
    container.parentElement.classList.toggle('opacity-50', isDisabled);
    container.parentElement.classList.toggle('pointer-events-none', isDisabled);

    let html = `<div><label for="wop-person-select" class="font-medium text-gray-700 block mb-1">Áp dụng cho</label>
                <select id="wop-person-select" class="form-select wop-person-select">${getWopPersonOptions()}</select></div>`;
    
    Object.entries(PRODUCT_CATALOG).forEach(([prodKey, config]) => {
        if (config.category === 'waiver_of_premium') {
            const isChecked = appState.waiverOfPremium.products[prodKey]?.enabled;
            const feeData = appState.waiverOfPremium.products[prodKey] || {};
            
            html += `<div class="wop-product-block mt-4" data-product-key="${prodKey}">
                <label class="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" class="form-checkbox wop-product-checkbox" data-product-key="${prodKey}" ${isChecked ? 'checked' : ''}>
                    <span class="font-medium text-gray-800">${config.name}</span>
                </label>
                <div class="text-right font-semibold text-aia-red min-h-[1.5rem] mt-1 wop-fee-display">
                    ${feeData.fee > 0 ? `STBH: ${formatCurrency(feeData.stbhBase)} | Phí: ${formatCurrency(feeData.fee)}` : ''}
                </div>
            </div>`;
        }
    });

    html += `<div id="wop-other-person-form" class="${appState.waiverOfPremium.selectedPersonId === 'other' ? '' : 'hidden'} mt-4 p-3 border rounded bg-gray-50"></div>`;
    container.innerHTML = html;
    
    if (appState.waiverOfPremium.selectedPersonId === 'other') {
        renderWopOtherPersonForm();
    }
}

function renderWopOtherPersonForm() {
    const otherFormContainer = document.getElementById('wop-other-person-form');
    if (!otherFormContainer || otherFormContainer.querySelector('.person-container')) return;
    otherFormContainer.innerHTML = `<div id="person-container-wop-other" class="person-container">${generateWopOtherPersonHtml()}</div>`;
    const container = document.getElementById('person-container-wop-other');
    initDateFormatter(container.querySelector('.dob-input'));
}

function renderSummary(isValid) {
    const f = appState.fees;
    const fmt = (n) => formatCurrency(Math.round(Number(n) || 0));
    
    const displayTotal = isValid ? f.total : f.baseMain + f.extra;
    const displayTotalSupp = isValid ? f.totalSupp : 0;

    document.getElementById('summary-total').textContent = fmt(displayTotal);
    document.getElementById('main-insured-main-fee').textContent = fmt(f.baseMain);
    document.getElementById('main-insured-extra-fee').textContent = fmt(f.extra);
    document.getElementById('summary-supp-fee').textContent = fmt(displayTotalSupp);
    
    document.getElementById('main-product-fee-display').innerHTML = f.extra > 0
        ? `Phí SP chính: ${fmt(f.baseMain)} | Phí đóng thêm: ${fmt(f.extra)} | Tổng: ${fmt(f.baseMain + f.extra)}`
        : (f.baseMain > 0 ? `Phí SP chính: ${fmt(f.baseMain)}` : '');

    renderFrequencyBreakdown(displayTotal, f.baseMain, f.extra, displayTotalSupp);
    renderSuppListSummary();
}

function renderFrequencyBreakdown(annualOriginal, baseMain, extra, totalSupp) {
    const v = document.getElementById('payment-frequency').value;
    const breakdownBox = document.getElementById('frequency-breakdown');
    
    const periods = v === 'half' ? 2 : (v === 'quarter' ? 4 : 1);
    const factor = periods === 2 ? 1.02 : (periods === 4 ? 1.04 : 1);
    
    breakdownBox.classList.toggle('hidden', periods === 1);
    if(periods === 1) return;

    const perMain = roundDownTo1000(baseMain / periods);
    const perExtra = roundDownTo1000(extra / periods);
    const perSupp = roundDownTo1000((totalSupp * factor) / periods);
    const perTotal = perMain + perExtra + perSupp;
    const annualEquivalent = perTotal * periods;
    const diff = annualEquivalent - annualOriginal;

    const set = (id, val) => { document.getElementById(id).textContent = formatCurrency(val); };
    set('freq-main', perMain);
    set('freq-extra', perExtra);
    set('freq-supp-total', perSupp);
    set('freq-total-period', perTotal);
    set('freq-total-year', annualOriginal);
    set('freq-diff', diff);
    set('freq-total-year-equivalent', annualEquivalent);
}

function renderControl(config, value, customer) {
    const required = config.required ? '<span class="text-red-600">*</span>' : '';
    const disabled = config.disabled ? 'disabled' : '';
    const bg = config.disabled ? 'bg-gray-100' : '';
    const displayValue = value > 0 ? formatCurrency(value) : (value || '');

    switch (config.type) {
        case 'currencyInput':
            return `<div>
                <label for="${config.id}" class="font-medium text-gray-700 block mb-1">${config.label} ${required}</label>
                <input type="text" id="${config.id}" class="form-input ${config.customClass || ''} ${bg}" 
                       value="${displayValue}" placeholder="${config.placeholder || ''}" ${disabled}>
                <div id="${config.hintId || ''}" class="text-sm text-gray-500 mt-1">${config.hintText || ''}</div>
            </div>`;
        case 'numberInput':
            const { min, max } = config.getMinMax?.(customer.age) || {};
            const hintText = config.hintTextFn?.(min, max) || config.hintText || '';
            return `<div>
                <label for="${config.id}" class="font-medium text-gray-700 block mb-1">${config.label} ${required}</label>
                <input type="number" id="${config.id}" class="form-input" value="${value || config.defaultValue || ''}" 
                       placeholder="${config.placeholder || ''}" min="${min || ''}" max="${max || ''}">
                ${hintText ? `<div class="text-sm text-gray-500 mt-1">${hintText}</div>` : ''}
            </div>`;
        case 'select':
            let options = (config.options || [])
                .filter(opt => !opt.condition || opt.condition(customer))
                .map(opt => `<option value="${opt.value}" ${opt.value == value ? 'selected' : ''}>${opt.label}</option>`)
                .join('');
            if (!options) options = '<option value="" disabled selected>Không có kỳ hạn phù hợp</option>';
            else options = '<option value="">-- Chọn --</option>' + options;
            return `<div>
                <label for="${config.id}" class="font-medium text-gray-700 block mb-1">${config.label} ${required}</label>
                <select id="${config.id}" class="form-select">${options}</select>
            </div>`;
        case 'checkboxGroup':
            const items = config.items.map(item => `
                <label class="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" id="${item.id}" class="form-checkbox ${item.customClass || ''}" ${value[item.id.replace(`${config.id.replace(/-/g, '_')}_`, '')] ? 'checked' : ''} data-product-key="${item.id.split('-')[0]}">
                    <span>${item.label}</span>
                    <span id="${item.hintId}" class="ml-2 text-xs text-gray-600"></span>
                </label>`).join('');
            return `<div>
                <span class="font-medium text-gray-700 block mb-2">${config.label}</span>
                <div class="space-y-2">${items}</div>
            </div>`;
        case 'staticText':
             return `<div class="${config.customClass || ''}">${config.text}</div>`;
        default: return '';
    }
}

// ===================================================================================
// ===== VALIDATION ENGINE
// ===================================================================================

function runAllValidations() {
    clearAllErrors();
    let isValid = true;
    const mainPerson = appState.persons.find(p => p.isMain);

    if (!validatePersonInputs(mainPerson)) isValid = false;
    if (!validateMainProduct()) isValid = false;
    
    let totalHospitalSupportStbh = 0;
    appState.persons.forEach(p => {
        if (!p.isMain && !validatePersonInputs(p)) isValid = false;
        
        for (const prodId in p.supplements) {
            if (!validateSupplementaryProduct(p, prodId, totalHospitalSupportStbh)) isValid = false;
            if (PRODUCT_CATALOG[prodId]?.category === 'hospital_support') {
                totalHospitalSupportStbh += p.supplements[prodId].stbh || 0;
            }
        }
    });
    
    if (!validateWaiverOfPremium()) isValid = false;
    if (!validateTargetAge()) isValid = false;
    return isValid;
}

function validatePersonInputs(person) {
    let ok = true;
    const { container } = person;
    if (!container) return true;
    
    const isWopOther = container.id.includes('wop-other');
    
    const fields = [
        { selector: '.name-input', message: 'Vui lòng nhập họ và tên', test: (el) => el.value.trim() },
        { selector: '.dob-input', message: 'Ngày sinh không hợp lệ', test: validateDobField },
    ];
    if (!isWopOther) {
        fields.push({ selector: '.occupation-input', message: 'Chọn nghề nghiệp từ danh sách', test: (el) => (parseInt(el.dataset.group, 10) || 0) > 0 });
    }

    fields.forEach(({ selector, message, test }) => {
        const input = container.querySelector(selector);
        if (input && !test(input)) {
            setFieldError(input, message);
            ok = false;
        } else if (input) {
            clearFieldError(input);
        }
    });
    return ok;
}

function validateMainProduct() {
    const { key, values } = appState.mainProduct;
    const mainPerson = appState.persons.find(p => p.isMain);
    const mainProductSelect = document.getElementById('main-product');
    const productConfig = PRODUCT_CATALOG[key];

    if (!key || mainProductSelect.options[mainProductSelect.selectedIndex]?.disabled) {
        setFieldError(mainProductSelect, 'Vui lòng chọn sản phẩm chính hợp lệ.');
        return false;
    }
    clearFieldError(mainProductSelect);

    if (!productConfig) return false;

    let ok = true;
    productConfig.ui.controls.forEach(controlConfig => {
        const el = document.getElementById(controlConfig.id);
        if (!el || !controlConfig.validate) return;
        
        const errorMessage = controlConfig.validate({
            value: values[controlConfig.id],
            allValues: values,
            customer: mainPerson,
            basePremium: appState.fees.baseMain,
            config: controlConfig
        });

        if (errorMessage) {
            setFieldError(el, errorMessage);
            ok = false;
        } else {
            clearFieldError(el);
        }
    });
    return ok;
}

function validateSupplementaryProduct(person, prodId, totalHospitalSupportStbh) {
    const prodConfig = PRODUCT_CATALOG[prodId];
    if (!prodConfig) return true;

    const suppContainer = person.isMain ? document.getElementById('main-supp-container') : person.container;
    const section = suppContainer.querySelector(`[data-product-key="${prodId}"]`);
    if (!section) return true;

    let ok = true;
    prodConfig.ui.controls.forEach(controlConfig => {
        const el = document.getElementById(controlConfig.id);
        if (!el || !controlConfig.validate) return;
        
        const errorMessage = controlConfig.validate({
            value: person.supplements[prodId]?.[controlConfig.id.replace(`${prodId}-`, '')],
            customer: person,
            mainPremium: appState.fees.baseMain,
            totalHospitalSupportStbh,
            config: controlConfig
        });
        
        if (errorMessage) {
            setFieldError(el, errorMessage);
            ok = false;
        } else {
            clearFieldError(el);
        }
    });
    return ok;
}

function validateWaiverOfPremium() {
    const { selectedPersonId, otherPersonInfo } = appState.waiverOfPremium;
    if (!selectedPersonId) return true;

    if (selectedPersonId === 'other') {
        const otherForm = document.getElementById('wop-other-person-form');
        const dobInput = otherForm?.querySelector('.dob-input');
        if (!validateDobField(dobInput)) return false;
        if (otherPersonInfo.age < 18 || otherPersonInfo.age > 60) {
            setFieldError(dobInput, 'Tuổi phải từ 18-60');
            return false;
        }
        clearFieldError(dobInput);
    }
    return true;
}


function validateTargetAge() {
  const input = document.getElementById('target-age-input');
  if (!input || input.disabled) return true;
  
  const val = parseInt((input.value || '').trim(), 10);
  const mainPerson = appState.persons.find(p => p.isMain);
  const productConfig = PRODUCT_CATALOG[appState.mainProduct.key];
  if (!productConfig) return true;

  let term = 0;
  if (productConfig.group === 'PACKAGE') {
      term = productConfig.packageConfig.fixedValues.paymentTerm;
  } else if (appState.mainProduct.values['abuv-term']) {
      term = parseInt(appState.mainProduct.values['abuv-term'] || '0', 10);
  } else {
      term = parseInt(appState.mainProduct.values['payment-term'] || '0', 10);
  }

  if (!mainPerson?.age || !term) return true;

  const minAllowed = mainPerson.age + term - 1;
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
    let parent = input.closest('div');
    let err = parent?.querySelector('.field-error');
    if (!err && parent) {
      err = document.createElement('p');
      err.className = 'field-error text-sm text-red-600 mt-1';
      parent.appendChild(err);
    }
    if (err) err.textContent = message || '';
    input.classList.toggle('border-red-500', !!message);
}

function clearFieldError(input) { setFieldError(input, ''); }

function clearAllErrors() { 
    document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
    document.querySelectorAll('.border-red-500').forEach(el => el.classList.remove('border-red-500'));
    hideGlobalErrors();
}

function checkEligibility(person, eligibilityRules = []) {
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
    initPerson(appState.persons.find(p => p.isMain));
    initSupplementaryButton();
    initSummaryAndViewer();
    attachGlobalListeners();
    runWorkflow();
});

function runWorkflow() {
  updateStateFromUI();
  const isMainProductValid = runAllValidations();
  appState.fees = performCalculations(appState);
  renderUI(isMainProductValid);
}

const runWorkflowDebounced = debounce(runWorkflow, 40);

function initMainProductSelect() {
    const select = document.getElementById('main-product');
    Object.entries(PRODUCT_CATALOG).forEach(([key, config]) => {
        if (config.type === 'main') {
            select.add(new Option(config.name, key));
        }
    });
}

function attachGlobalListeners() {
    document.body.addEventListener('change', (e) => {
        hideGlobalErrors();
        if (e.target.id === 'main-product') lastRenderedProductKey = null;
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
        if (e.target.matches('input[type="text"]:not(.dob-input, .name-input, .occupation-input)')) {
            roundInputToThousand(e.target);
        }
        runWorkflow();
    }, true);
}

function initPerson(person) {
    if (!person?.container) return;
    initDateFormatter(person.container.querySelector('.dob-input'));
    initOccupationAutocomplete(person.container.querySelector('.occupation-input'), person.container);
    
    const suppProductsContainer = person.isMain 
        ? document.querySelector('#main-supp-container .supplementary-products-container') 
        : person.container.querySelector('.supplementary-products-container');
    
    if (suppProductsContainer) {
        suppProductsContainer.innerHTML = generateSupplementaryProductsHtml();
    }
}

function initSupplementaryButton() {
    document.getElementById('add-supp-insured-btn').addEventListener('click', () => {
        if (appState.persons.length -1 >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) return;
        
        const count = appState.persons.filter(p => !p.isMain).length + 1;
        const personId = `supp-${Date.now()}`;
        
        const template = document.getElementById('supplementary-person-template');
        const clone = template.content.cloneNode(true);
        const newContainer = clone.querySelector('.person-container');
        newContainer.id = `person-container-${personId}`;
        
        newContainer.querySelector('[data-template-id="title"]').textContent = `NĐBH Bổ Sung ${count}`;
        document.getElementById('supplementary-insured-container').appendChild(clone);

        const newPersonState = { id: newContainer.id, container: newContainer, isMain: false, supplements: {} };
        appState.persons.push(newPersonState);
        
        newContainer.querySelector('.remove-supp-btn').addEventListener('click', () => {
            appState.persons = appState.persons.filter(p => p.id !== newPersonState.id);
            newContainer.remove();
            runWorkflow();
        });
        
        initPerson(newPersonState);
        runWorkflow();
    });
}

function updateSupplementaryAddButtonState(isMainProductValid) {
    const btn = document.getElementById('add-supp-insured-btn');
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const count = appState.persons.filter(p => !p.isMain).length;
    
    const disabled = mainProductConfig?.rules?.noSupplementaryInsured || 
                     (count >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) || 
                     !isMainProductValid;
                     
    btn.disabled = disabled;
    btn.classList.toggle('opacity-50', disabled);
    btn.classList.toggle('cursor-not-allowed', disabled);
}

function generateSupplementaryProductsHtml() {
    return Object.entries(PRODUCT_CATALOG)
        .filter(([, config]) => config.type === 'rider' && config.category !== 'waiver_of_premium')
        .map(([prodId, prodConfig]) => {
            const controlsHtml = (prodConfig.ui.controls || []).map(cfg => renderControl(cfg, cfg.defaultValue || '', null)).join('');
            return `
            <div class="product-section" data-product-key="${prodId}">
              <label class="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" class="form-checkbox ${prodId}-checkbox" data-product-key="${prodId}">
                <span class="text-lg font-medium text-gray-800">${prodConfig.name}</span>
              </label>
              <div class="product-options hidden mt-3 pl-8 space-y-3 border-l-2 border-gray-200">
                ${controlsHtml}
                <div class="text-xs text-red-600 dynamic-validation-msg hidden"></div>
                <div class="text-right font-semibold text-aia-red fee-display min-h-[1.5rem]"></div>
              </div>
            </div>`;
    }).join('');
}

function getWopPersonOptions() {
    let optionsHtml = `<option value="">-- Chọn người --</option>`;
    const selected = appState.waiverOfPremium.selectedPersonId;
    appState.persons.forEach(p => {
        const isEligible = p.age >= 18 && p.age <= 60;
        let label = `${p.name || (p.isMain ? 'NĐBH chính' : 'NĐBH bổ sung')} (tuổi ${p.age || "?"})`;
        if (!isEligible) label += ' - Không đủ điều kiện';
        optionsHtml += `<option value="${p.id}" ${isEligible ? '' : 'disabled'} ${selected === p.id ? 'selected' : ''}>${label}</option>`;
    });
    optionsHtml += `<option value="other" ${selected === 'other' ? 'selected' : ''}>Người khác</option>`;
    return optionsHtml;
}

function generateWopOtherPersonHtml() {
    const info = appState.waiverOfPremium.otherPersonInfo || {};
    return `<h3 class="text-lg font-bold text-gray-700 mb-2 border-t pt-4">Người được miễn đóng phí</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label class="font-medium text-gray-700 block mb-1">Họ và Tên</label><input type="text" class="form-input name-input" value="${sanitizeHtml(info.name || '')}"></div>
        <div><label class="font-medium text-gray-700 block mb-1">Ngày sinh</label><input type="text" class="form-input dob-input" placeholder="DD/MM/YYYY" value="${sanitizeHtml(info.dob || '')}"></div>
        <div><label class="font-medium text-gray-700 block mb-1">Giới tính</label><select class="form-select gender-select"><option value="Nam" ${info.gender==='Nam'?'selected':''}>Nam</option><option value="Nữ" ${info.gender==='Nữ'?'selected':''}>Nữ</option></select></div>
        <div class="flex items-end space-x-4"><p class="text-lg">Tuổi: <span class="font-bold text-aia-red age-span">${info.age || 0}</span></p></div>
      </div>`;
}

// ===================================================================================
// ===== HELPERS & MISC UI
// ===================================================================================
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

  input.addEventListener('input', () => {
    const value = input.value.trim().toLowerCase();
    if (value.length < 2) { autocompleteContainer.classList.add('hidden'); return; }
    const filtered = product_data.occupations.filter(o => o.group > 0 && o.name.toLowerCase().includes(value));
    autocompleteContainer.innerHTML = filtered.map(occ => {
        const item = document.createElement('div');
        item.className = 'p-2 hover:bg-gray-100 cursor-pointer';
        item.textContent = occ.name;
        item.addEventListener('mousedown', (ev) => { ev.preventDefault(); applyOccupation(occ); });
        return item.outerHTML;
    }).join('');
    autocompleteContainer.classList.remove('hidden');
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { autocompleteContainer.classList.add('hidden'); }, 200);
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
    if (!input) return;
    const raw = parseFormattedNumber(input.value || '');
    if (!raw) { input.value = ''; return; }
    
    if (input.id.includes('hospital_support')) {
        const rounded = Math.round(raw / GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE) * GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE;
        input.value = formatCurrency(rounded);
    } else {
        input.value = formatCurrency(roundDownTo1000(raw));
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

function initSummaryAndViewer() {
    document.getElementById('toggle-supp-list-btn').addEventListener('click', () => {
        document.getElementById('supp-insured-summaries').classList.toggle('hidden');
    });
    document.getElementById('main-product').addEventListener('change', updateTargetAge);
    document.querySelector('#main-person-container .dob-input')?.addEventListener('input', updateTargetAge);
    document.body.addEventListener('change', (e) => {
        if (e.target.matches('#payment-term, #abuv-term')) updateTargetAge();
    });
    updateTargetAge();
    initViewerModal();
}

function updateTargetAge() {
    const mainPerson = appState.persons.find(p => p.isMain);
    const productConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const targetAgeInput = document.getElementById('target-age-input');

    if (!targetAgeInput || !mainPerson || !productConfig) {
        if(targetAgeInput) targetAgeInput.disabled = true;
        return;
    };

    if (productConfig.group === 'TRADITIONAL' || productConfig.group === 'PACKAGE') {
        let term = (productConfig.group === 'PACKAGE')
            ? productConfig.packageConfig.fixedValues.paymentTerm
            : parseInt(appState.mainProduct.values['abuv-term'] || '0', 10);
        targetAgeInput.disabled = true;
        targetAgeInput.value = term ? mainPerson.age + term - 1 : mainPerson.age;
        return;
    }

    targetAgeInput.disabled = false;
    const paymentTerm = parseInt(appState.mainProduct.values['payment-term'], 10) || 0;
    const hintEl = document.getElementById('target-age-hint');

    if (!paymentTerm || paymentTerm <= 0) {
        if (hintEl) hintEl.textContent = 'Nhập thời gian đóng phí để xác định tuổi minh họa.';
        return;
    }

    const minAge = mainPerson.age + paymentTerm - 1;
    const maxAge = 99; 
    targetAgeInput.min = String(minAge);
    targetAgeInput.max = String(maxAge);

    if (hintEl) hintEl.innerHTML = `Khoảng hợp lệ: <strong>${minAge}</strong> – <strong>${maxAge}</strong>.`;
    
    const curVal = parseInt(targetAgeInput.value || '0', 10);
    if (!curVal || curVal < minAge) targetAgeInput.value = 99;
}

function updatePaymentFrequencyOptions(baseMainAnnual) {
    const sel = document.getElementById('payment-frequency');
    if (!sel) return;
    const optHalf = sel.querySelector('option[value="half"]');
    const optQuarter = sel.querySelector('option[value="quarter"]');
    
    const allowHalf = baseMainAnnual >= GLOBAL_CONFIG.PAYMENT_FREQUENCY_THRESHOLDS.half;
    const allowQuarter = baseMainAnnual >= GLOBAL_CONFIG.PAYMENT_FREQUENCY_THRESHOLDS.quarter;

    if (optHalf) optHalf.disabled = !allowHalf;
    if (optQuarter) optQuarter.disabled = !allowQuarter;
  
    if (sel.value === 'quarter' && !allowQuarter) {
      sel.value = allowHalf ? 'half' : 'year';
    } else if (sel.value === 'half' && !allowHalf) {
      sel.value = 'year';
    }
}

function showGlobalErrors(errors) {
  const box = document.getElementById('global-error-box');
  if (!box) return;
  if (!errors.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = `<div class="border border-red-300 bg-red-50 text-red-700 rounded p-3 text-sm">
      <div class="font-medium mb-1">Vui lòng sửa các lỗi sau:</div>
      ${errors.map(e => `<div class="flex gap-1"><span>•</span><span>${sanitizeHtml(e)}</span></div>`).join('')}
    </div>`;
}
function hideGlobalErrors() {
  const box = document.getElementById('global-error-box');
  if (box) box.classList.add('hidden');
}
function collectSimpleErrors() {
  return [...new Set(Array.from(document.querySelectorAll('.field-error')).map(el => el.textContent.trim()).filter(Boolean))];
}

function renderSuppListSummary() {
  const box = document.getElementById('supp-insured-summaries');
  if (!box) return;

  const getPersonName = (id) => {
    if (id === 'wop_other') {
      return appState.waiverOfPremium.otherPersonInfo?.name || 'Người khác (Miễn phí)';
    }
    return appState.persons.find(p => p.id === id)?.name || 'Người không xác định';
  };

  const rows = Object.entries(appState.fees.byPerson)
    .filter(([, feeData]) => feeData.supp > 0)
    .map(([personId, feeData]) => `<div class="flex justify-between">
              <span>${sanitizeHtml(getPersonName(personId))}</span>
              <span>${formatCurrency(feeData.supp)}</span>
            </div>`).join('');
  box.innerHTML = rows;
}

// ===================================================================================
// ===== VIEWER LOGIC
// ===================================================================================

function initViewerModal() {
    const viewerBtn = document.getElementById('btnFullViewer');
    const modal = document.getElementById('viewer-modal');
    const iframe = document.getElementById('viewer-iframe');
    const closeBtn = document.getElementById('close-viewer-modal-btn');

    viewerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        runWorkflow(); // Final validation run
        setTimeout(() => {
            const errors = collectSimpleErrors();
            if (errors.length) {
                showGlobalErrors(errors);
                document.getElementById('global-error-box').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            openFullViewer();
        }, 50);
    });

    const closeModal = () => {
        modal.classList.remove('visible');
        iframe.src = 'about:blank';
    };
    closeBtn.addEventListener('click', closeModal);
}

function openFullViewer() {
    try {
        const payload = buildViewerPayload();
        if (!payload.productKey) return;
        
        const json = JSON.stringify(payload);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        const viewerUrl = new URL('viewer.html', location.href);
        viewerUrl.hash = `#v=${b64}`;

        const modal = document.getElementById('viewer-modal');
        const iframe = document.getElementById('viewer-iframe');
        iframe.src = viewerUrl.toString();
        modal.classList.add('visible');

    } catch (e) {
        console.error('[FullViewer] Error creating payload:', e);
        alert('Không tạo được dữ liệu để mở bảng minh họa.');
    }
}
function getHealthSclStbhByProgram(program) {
    return PRODUCT_CATALOG.health_scl.rules.stbhByProgram[program] || 0;
}

function buildViewerPayload() {
  const mainPerson = appState.persons.find(p => p.isMain);
  const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];

  const riderList = [];
  appState.persons.forEach(person => {
    Object.keys(person.supplements).forEach(rid => {
      const riderConfig = PRODUCT_CATALOG[rid];
      const premiumDetail = appState.fees.byPerson[person.id]?.suppDetails?.[rid] || 0;
      if (premiumDetail > 0) {
        const data = person.supplements[rid];
        riderList.push({
          slug: rid, // Use key as slug for simplicity in viewer
          selected: true,
          stbh: data.stbh || (rid === 'health_scl' ? getHealthSclStbhByProgram(data.program) : 0),
          program: data.program, scope: data.scope, outpatient: !!data.outpatient, dental: !!data.dental,
          premium: premiumDetail
        });
      }
    });
  });

  let mdp3Obj = null;
  const wopState = appState.waiverOfPremium;
  if(wopState.selectedPersonId) {
      Object.entries(wopState.products).forEach(([prodId, data]) => {
          if(data.enabled && data.fee > 0) {
            let targetPerson = wopState.selectedPersonId === 'other'
                ? wopState.otherPersonInfo
                : appState.persons.find(p => p.id === wopState.selectedPersonId);

            mdp3Obj = { premium: data.fee, selectedName: targetPerson.name, selectedAge: targetPerson.age };
            riderList.push({ slug: prodId, selected: true, stbh: 0, premium: data.fee });
          }
      });
  }

  return {
    v: 3, // Version
    productKey: appState.mainProduct.key,
    productSlug: mainProductConfig?.slug,
    mainPersonName: mainPerson.name,
    mainPersonAge: mainPerson.age,
    mainPersonGender: mainPerson.gender,
    sumAssured: appState.mainProduct.values['main-stbh'],
    paymentFrequency: appState.paymentFrequency,
    paymentTerm: appState.mainProduct.values['payment-term'] || appState.mainProduct.values['abuv-term'],
    targetAge: parseInt(document.getElementById('target-age-input')?.value, 10),
    customInterestRate: document.getElementById('custom-interest-rate-input')?.value,
    premiums: { 
        baseMain: appState.fees.baseMain,
        extra: appState.fees.extra,
        totalSupp: appState.fees.totalSupp,
        riders: riderList
    },
    mdp3: mdp3Obj, // The new generic object for waiver products
  };
}
