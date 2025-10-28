

import { GLOBAL_CONFIG, PRODUCT_CATALOG } from './structure.js';
import { product_data, investment_data, BENEFIT_MATRIX_SCHEMAS, BM_SCL_PROGRAMS } from './data.js';

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
                        } else if (control.type === 'checkboxGroup') { // Handle checkbox groups
                           control.items.forEach(item => {
                               const cb = section.querySelector(`#${item.id}`);
                               if(cb) {
                                   supplements[prodKey][item.id.replace(`${prodKey}-`, '')] = cb.checked;
                               }
                           });
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

    // Calculate Waiver of Premium fees via its dedicated module
    if (window.MDP3) {
        const mdpFee = MDP3.getPremium();
        if (mdpFee > 0) {
            fees.totalSupp += mdpFee;
            const mdpTargetId = MDP3.getSelectedId();

            const personIdForFee = mdpTargetId === 'other' ? 'wop_other' : mdpTargetId;
            if (personIdForFee) {
                if (!fees.byPerson[personIdForFee]) {
                    fees.byPerson[personIdForFee] = { main: 0, supp: 0, total: 0, suppDetails: {} };
                }
                fees.byPerson[personIdForFee].supp += mdpFee;
                fees.byPerson[personIdForFee].suppDetails['mdp3'] = mdpFee;
            }
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
            values: { 
                ...productConfig.packageConfig.fixedValues,
                'main-stbh': productConfig.packageConfig.fixedValues.stbh,
                'abuv-term': productConfig.packageConfig.fixedValues.paymentTerm
            }
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

function renderUI(validationResult) {
    const { isMainProductSectionValid } = validationResult;
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
    appState.persons.forEach(p => renderSupplementaryProductsForPerson(p, isMainProductSectionValid));
    renderSummary(isMainProductSectionValid);
    updateSupplementaryAddButtonState(isMainProductSectionValid);
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
    
    if (lastRenderedProductKey !== mainProductKey || lastRenderedAge !== mainPerson.age) {
        lastRenderedProductKey = mainProductKey;
        lastRenderedAge = mainPerson.age;

        const container = document.getElementById('main-product-options');
        container.innerHTML = '';
        const productConfig = PRODUCT_CATALOG[mainProductKey];
        if (productConfig?.ui?.controls) {
            const controlsHtml = productConfig.ui.controls.map(cfg => {
                const value = appState.mainProduct.values[cfg.id] ?? cfg.defaultValue ?? '';
                return renderControl(cfg, value, mainPerson);
            }).join('');
            container.innerHTML = controlsHtml;
        }
    }
    
    // Always run onRender to update dynamic hints
    const productConfig = PRODUCT_CATALOG[mainProductKey];
    if (productConfig?.ui?.controls) {
        productConfig.ui.controls.forEach(controlConfig => {
            if (controlConfig.onRender) {
                const el = document.getElementById(controlConfig.id);
                if (el) {
                    controlConfig.onRender({
                        el,
                        allValues: appState.mainProduct.values,
                        customer: mainPerson,
                        basePremium: appState.fees.baseMain
                    });
                }
            }
        });
    }
}

function renderSupplementaryProductsForPerson(customer, isMainProductSectionValid) {
    const container = customer.isMain
        ? document.querySelector('#main-supp-container .supplementary-products-container')
        : customer.container.querySelector('.supplementary-products-container');
    if (!container) return;

    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];

    Object.entries(PRODUCT_CATALOG).forEach(([prodId, prodConfig]) => {
        if (prodConfig.type !== 'rider' || prodConfig.category === 'waiver_of_premium') return;

        const section = container.querySelector(`[data-product-key="${prodId}"]`);
        if (!section) return;

        const isEligible = checkEligibility(customer, prodConfig.rules.eligibility);
        const isMandatory = mainProductConfig?.group === 'PACKAGE' && mainProductConfig.packageConfig.mandatoryRiders.includes(prodId);
        const isDisabledByPackage = mainProductConfig?.group === 'PACKAGE' && !isMandatory;
        
        section.classList.toggle('hidden', !isEligible || isDisabledByPackage);

        const checkbox = section.querySelector(`.${prodId}-checkbox`);
        if (!checkbox) return;
        
        const finalDisabled = !isEligible || !isMainProductSectionValid || isDisabledByPackage;
        checkbox.disabled = isMandatory ? true : finalDisabled;
        if(isMandatory) checkbox.checked = true;

        section.classList.toggle('opacity-50', checkbox.disabled && !isMandatory);
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
            allPersons: appState.persons,
            config: prodConfig,
            mainProductConfig
        });
    });
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
                <div id="${config.hintId || config.id + '-hint'}" class="text-sm text-gray-500 mt-1">${config.hintText || ''}</div>
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
    let result = {
        isValid: true,
        isMainProductSectionValid: true,
        errors: []
    };
    
    const mainPerson = appState.persons.find(p => p.isMain);

    if (!validatePersonInputs(mainPerson)) result.isValid = false;
    if (!validateMainProduct()) {
        result.isValid = false;
        result.isMainProductSectionValid = false;
    }
    
    let totalHospitalSupportStbh = 0;
    appState.persons.forEach(p => {
        if (!p.isMain && !validatePersonInputs(p)) result.isValid = false;
        
        for (const prodId in p.supplements) {
            if (!validateSupplementaryProduct(p, prodId, totalHospitalSupportStbh)) result.isValid = false;
            if (PRODUCT_CATALOG[prodId]?.category === 'hospital_support') {
                totalHospitalSupportStbh += p.supplements[prodId].stbh || 0;
            }
        }
    });
    
    if (window.MDP3 && !MDP3.validate()) result.isValid = false;
    if (!validateTargetAge()) result.isValid = false;

    result.errors = collectSimpleErrors();
    if(result.errors.length > 0) result.isValid = false;
    
    return result;
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

    const premiumRules = productConfig.rules.premium;
    if (premiumRules?.min && appState.fees.baseMain > 0 && appState.fees.baseMain < premiumRules.min) {
        const anyInput = document.getElementById('main-stbh') || document.getElementById('abuv-term');
        if (anyInput) {
            const msg = productConfig.ui.validationMessages?.minPremium || `Phí chính tối thiểu ${formatCurrency(premiumRules.min)}`;
            setFieldError(anyInput, msg);
        }
        ok = false;
    }

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
            allPersons: appState.persons,
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
    window.MDP3.init();
    runWorkflow();
});

function runWorkflow() {
  updateStateFromUI();
  const validationResult = runAllValidations();
  appState.fees = performCalculations(appState);
  renderUI(validationResult);
  window.MDP3.render(validationResult.isMainProductSectionValid);
  updateTargetAge();
}

const runWorkflowDebounced = debounce(runWorkflow, 60);

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
        if (e.target.id === 'main-product') {
            lastRenderedProductKey = null;
            appState.mainProduct.values = {};
            
            const newProductConfig = PRODUCT_CATALOG[e.target.value];
            if (newProductConfig?.rules?.noSupplementaryInsured) {
                // Immediately clear UI to prevent stale data reading
                document.getElementById('supplementary-insured-container').innerHTML = '';
                window.MDP3.reset();

                const mainPerson = appState.persons.find(p => p.isMain);
                if (mainPerson) mainPerson.supplements = {};
            }
        }
        if (e.target.matches('input[type="checkbox"]') && e.target.id !== 'mdp3-enable') {
            runWorkflowDebounced();
        } else {
            runWorkflow();
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
            window.MDP3.updateOptions();
            runWorkflow();
        });
        
        initPerson(newPersonState);
        window.MDP3.updateOptions();
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
    autocompleteContainer.innerHTML = '';
    runWorkflow();
  };
  
  autocompleteContainer.addEventListener('mousedown', (e) => {
      if (e.target && e.target.matches('.autocomplete-item')) {
          e.preventDefault(); 
          const occName = e.target.textContent;
          const selectedOcc = product_data.occupations.find(o => o.name === occName);
          if (selectedOcc) {
              applyOccupation(selectedOcc);
          }
      }
  });

  input.addEventListener('input', () => {
    const value = input.value.trim().toLowerCase();
    if (value.length < 2) {
      autocompleteContainer.classList.add('hidden');
      autocompleteContainer.innerHTML = '';
      return;
    }
    const filtered = product_data.occupations.filter(o => o.group > 0 && o.name.toLowerCase().includes(value));
    
    autocompleteContainer.innerHTML = filtered.map(occ => 
      `<div class="p-2 hover:bg-gray-100 cursor-pointer autocomplete-item">${occ.name}</div>`
    ).join('');

    autocompleteContainer.classList.remove('hidden');
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      autocompleteContainer.classList.add('hidden');
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
      const form = document.getElementById('person-container-wop-other');
      return (form ? collectPersonData(form, false, true)?.name : 'Người khác') || 'Người khác';
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
        runWorkflow(); 
        setTimeout(() => {
            const validationResult = runAllValidations();
            if (!validationResult.isValid) {
                showGlobalErrors(validationResult.errors);
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
          slug: rid, 
          selected: true,
          stbh: data.stbh || (rid === 'health_scl' ? getHealthSclStbhByProgram(data.program) : 0),
          program: data.program, scope: data.scope, outpatient: !!data.outpatient, dental: !!data.dental,
          premium: premiumDetail
        });
      }
    });
  });

  let mdp3Obj = null;
  if(window.MDP3 && MDP3.isEnabled()){
      const premium = MDP3.getPremium();
      if(premium > 0){
        const targetPerson = MDP3.getTargetPersonInfo();
        mdp3Obj = { premium, selectedName: targetPerson.name, selectedAge: targetPerson.age };
        riderList.push({ slug: 'mdp3', selected: true, stbh: 0, premium: premium });
      }
  }
  
  const summaryHtml = __exportExactSummaryHtml();

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
    mdp3: mdp3Obj, 
    summaryHtml: summaryHtml
  };
}


// ===================================================================================
// ===== LOGIC TẠO BẢNG MINH HỌA (PORTED & ADAPTED FROM V1)
// ===================================================================================

function __exportExactSummaryHtml() {
    try {
        const data = buildSummaryData();
        const introHtml = buildIntroSection(data);
        const part1Html = buildPart1Section(data);
        const part2Html = buildPart2BenefitsSection(data);
        let part3Html = buildPart3ScheduleSection(data);
        const footerHtml = buildFooterSection();
        return introHtml + part1Html + part2Html + part3Html + footerHtml;
    } catch (e) {
        console.error('[__exportExactSummaryHtml] error:', e);
        return '<div style="color:red">Lỗi tạo summaryHtml</div>';
    }
}

function buildSummaryData() {
    const mainPerson = appState.persons.find(p => p.isMain);
    const productKey = appState.mainProduct.key;
    const productConfig = PRODUCT_CATALOG[productKey];

    const freq = appState.paymentFrequency;
    const periods = freq === 'half' ? 2 : (freq === 'quarter' ? 4 : 1);
    const isAnnual = periods === 1;
    const riderFactor = periods === 2 ? 1.02 : (periods === 4 ? 1.04 : 1);
    
    let paymentTerm = 0;
    if (productConfig) {
        if (productConfig.group === 'PACKAGE') {
            paymentTerm = productConfig.packageConfig.fixedValues.paymentTerm;
        } else {
            paymentTerm = parseInt(appState.mainProduct.values['payment-term'] || appState.mainProduct.values['abuv-term'] || '0', 10);
        }
    }
    
    let targetAge = parseInt(document.getElementById('target-age-input')?.value, 10) || 0;
    if (!targetAge) {
      targetAge = mainPerson.age + (paymentTerm || 0) -1;
    }

    const allPersons = [...appState.persons];
    const mdpEnabled = window.MDP3 && MDP3.isEnabled();
    let mdpTarget = null;
    if (mdpEnabled) {
      mdpTarget = MDP3.getTargetPersonInfo();
      if(mdpTarget && mdpTarget.id === 'wop_other') {
          allPersons.push(mdpTarget);
      }
    }
    
    const part1 = buildPart1RowsData({ persons: allPersons, productKey, paymentTerm, targetAge, riderFactor, periods, isAnnual, mdpEnabled, mdpTarget });
    const schedule = buildPart2ScheduleRows({ persons: allPersons, mainPerson, paymentTerm, targetAge, periods, isAnnual, riderFactor, productKey, mdpEnabled, mdpTarget });

    return { freq, periods, isAnnual, riderFactor, productKey, paymentTerm, targetAge, mainPerson, persons: allPersons, mdpEnabled, mdpTarget, part1, schedule };
}

function buildPart1RowsData(ctx) {
    const { persons, productKey, paymentTerm, targetAge, riderFactor, periods, isAnnual, mdpEnabled, mdpTarget } = ctx;
    const mainAge = persons.find(p => p.isMain)?.age || 0;
    const riderMaxAge = (key) => (PRODUCT_CATALOG[key]?.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 64);

    let mdpStbhBase = 0;
    if (mdpEnabled && window.MDP3) {
      mdpStbhBase = MDP3.getStbhBase();
    }

    let rows = [], perPersonTotals = [], grand = { per: 0, eq: 0, base: 0, diff: 0 };
    
    const pushRow = (acc, personName, prodName, stbhDisplay, years, baseAnnual, isRider) => {
        if (baseAnnual <= 0) return;
        let perPeriod = 0, annualEq = 0, diff = 0;
        if (!isAnnual) {
            if (isRider) {
                perPeriod = Math.round((baseAnnual * riderFactor) / periods / 1000) * 1000;
                annualEq = perPeriod * periods;
                diff = annualEq - baseAnnual;
            } else {
                perPeriod = Math.round(baseAnnual / periods / 1000) * 1000;
                annualEq = perPeriod * periods;
                diff = annualEq - baseAnnual;
            }
        }
        acc.per += perPeriod; acc.eq += annualEq; acc.base += baseAnnual; acc.diff += diff;
        rows.push({ personName, prodName, stbhDisplay, years, perPeriod, annualEq, diff, annualBase: baseAnnual });
    };

    persons.forEach(p => {
        const acc = { per: 0, eq: 0, base: 0, diff: 0 };
        if (p.isMain && productKey) {
            const baseAnnual = appState.fees.baseMain;
            const stbhVal = appState.mainProduct.values['main-stbh'];
            if (baseAnnual > 0) {
                pushRow(acc, p.name, getProductLabel(productKey), formatCurrency(stbhVal), paymentTerm || '—', baseAnnual, false);
            }
        }
        if (p.isMain && (appState.mainProduct.values['extra-premium'] || 0) > 0) {
            pushRow(acc, p.name, 'Phí đóng thêm', '—', paymentTerm || '—', appState.mainProduct.values['extra-premium'] || 0, false);
        }
        for (const rid in p.supplements) {
            const baseAnnual = appState.fees.byPerson[p.id]?.suppDetails?.[rid] || 0;
            if (baseAnnual <= 0) continue;

            const maxA = riderMaxAge(rid);
            const years = Math.max(0, Math.min(maxA - p.age, targetAge - mainAge) + 1);
            let stbh = p.supplements[rid].stbh;
            let prodName = getProductLabel(rid);

            if (rid === 'health_scl') {
                const scl = p.supplements.health_scl;
                const programMap = { co_ban: 'Cơ bản', nang_cao: 'Nâng cao', toan_dien: 'Toàn diện', hoan_hao: 'Hoàn hảo' };
                const programName = programMap[scl.program] || '';
                const scopeStr = (scl.scope === 'main_global' ? 'Nước ngoài' : 'Việt Nam') + (scl.outpatient ? ', Ngoại trú' : '') + (scl.dental ? ', Nha khoa' : '');
                prodName = `Sức khoẻ Bùng Gia Lực – ${programName} (${scopeStr})`;
                stbh = getHealthSclStbhByProgram(scl.program);
            }
            
            pushRow(acc, p.name, prodName, formatCurrency(stbh), years, baseAnnual, true);
        }
        
        if (mdpEnabled && mdpTarget && p.id === mdpTarget.id) {
            const mdpFeeYear = appState.fees.byPerson[p.id]?.suppDetails?.['mdp3'] || 0;
            if (mdpFeeYear > 0) {
                const years = Math.max(0, Math.min(60 - p.age, targetAge - mainAge) + 1);
                pushRow(acc, p.name, 'Miễn đóng phí 3.0', formatCurrency(mdpStbhBase), years, mdpFeeYear, true);
            }
        }
        perPersonTotals.push({ personName: p.name, ...acc });
        grand.per += acc.per; grand.eq += acc.eq; grand.base += acc.base; grand.diff += acc.diff;
    });

    return { rows, perPersonTotals, grand, isAnnual, periods, riderFactor };
}


function buildPart2ScheduleRows(ctx) {
    const { persons, mainPerson, paymentTerm, targetAge, periods, isAnnual, riderFactor, productKey, mdpEnabled, mdpTarget } = ctx;
    const riderMaxAge = (key) => (PRODUCT_CATALOG[key]?.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 64);
    const rows = [];
    const baseMainAnnual = appState?.fees?.baseMain || 0;
    const extraAnnual = appState.mainProduct.values['extra-premium'] || 0;
    
    for (let year = 1; mainPerson.age + year - 1 <= targetAge; year++) {
        const currentAge = mainPerson.age + year - 1;
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
                if (!isAnnual) sumPer += Math.round((baseFee * riderFactor) / periods / 1000) * 1000;
            };

            for(const rid in p.supplements) {
                 const prodConfig = PRODUCT_CATALOG[rid];
                 if (!prodConfig || !prodConfig.calculation.calculate) continue;
                 const premiumForYear = prodConfig.calculation.calculate({ config: prodConfig, customer: p, ageOverride: attained, mainPremium: baseMainAnnual, totalHospitalSupportStbh: 0 });
                 addRider(rid, premiumForYear);
            }

            if (mdpEnabled && mdpTarget && p.id === mdpTarget.id) {
                const mdpStbhBase = window.MDP3.getStbhBase();
                const mdpConfig = PRODUCT_CATALOG['mdp3'];
                const mdpFeeForYear = mdpConfig.calculation.calculate({ customer: p, stbhBase });
                 addRider('mdp3', mdpFeeForYear);
            }
            perPersonSuppBase.push(sumBase);
            perPersonSuppPerPeriod.push(sumPer);
            perPersonSuppAnnualEq.push(isAnnual ? sumBase : sumPer * periods);
        });

        const suppBaseTotal = perPersonSuppBase.reduce((a, b) => a + b, 0);
        const suppAnnualEqTotal = perPersonSuppAnnualEq.reduce((a, b) => a + b, 0);
        const totalYearBase = mainYearBase + extraYearBase + suppBaseTotal;
        const totalAnnualEq = isAnnual ? totalYearBase : (Math.round((mainYearBase + extraYearBase)/periods / 1000) * 1000)*periods + suppAnnualEqTotal;
        const diff = totalAnnualEq - totalYearBase;
        rows.push({ year, age: currentAge, mainYearBase, extraYearBase, perPersonSuppBase, perPersonSuppAnnualEq, totalYearBase, totalAnnualEq, diff });
    }
    return { rows, extraAllZero: rows.every(r => r.extraYearBase === 0) };
}

function buildIntroSection(data) {
    const sel = document.getElementById('payment-frequency');
    let freqLabel = sel ? sel.options[sel.selectedIndex].text : data.freq;
    return `<div class="mb-4"><h3>BẢNG MINH HỌA PHÍ & QUYỀN LỢI</h3><div>Sản phẩm chính: <strong>${sanitizeHtml(getProductLabel(data.productKey) || '—')}</strong>&nbsp;|&nbsp; Kỳ đóng: <strong>${sanitizeHtml(freqLabel)}</strong>&nbsp;|&nbsp; Minh họa đến tuổi: <strong>${sanitizeHtml(data.targetAge)}</strong></div></div>`;
}

function buildPart1Section(data) {
    const { part1, isAnnual, periods } = data;
    const { rows, perPersonTotals, grand } = part1;
    const r1000 = n => Math.round((n || 0) / 1000) * 1000;
    const formatDiffCell = n => !n ? '0' : `<span class="text-red-600 font-bold">${formatCurrency(r1000(n))}</span>`;
    
    const headerHtml = isAnnual ? `<tr><th>Tên NĐBH</th><th>Sản phẩm</th><th>STBH</th><th>Số năm đóng phí</th><th>Phí theo năm</th></tr>`
        : `<tr><th>Tên NĐBH</th><th>Sản phẩm</th><th>STBH</th><th>Số năm đóng phí</th><th>Phí (${periods === 2 ? 'nửa năm' : 'theo quý'})</th><th>Phí năm đầu</th><th>Phí theo năm</th><th>Chênh lệch</th></tr>`;
    
    let body = [];
    perPersonTotals.forEach(agg => {
        if (agg.base <= 0) return;
        body.push(isAnnual ? `<tr style="font-weight: bold;"><td >${sanitizeHtml(agg.personName)}</td><td>Tổng theo người</td><td style="text-align: right">—</td><td style="text-align: center">—</td><td style="text-align: right">${formatCurrency(r1000(agg.base))}</td></tr>`
            : `<tr style="font-weight: bold;"><td>${sanitizeHtml(agg.personName)}</td><td>Tổng theo người</td><td style="text-align: right">—</td><td style="text-align: center">—</td><td style="text-align: right">${formatCurrency(r1000(agg.per))}</td><td style="text-align: right">${formatCurrency(r1000(agg.eq))}</td><td style="text-align: right">${formatCurrency(r1000(agg.base))}</td><td style="text-align: right">${formatDiffCell(agg.diff)}</td></tr>`);
        
        rows.filter(r => r.personName === agg.personName).forEach(r => {
            body.push(isAnnual ? `<tr><td></td><td>${sanitizeHtml(r.prodName)}</td><td style="text-align: right">${r.stbhDisplay}</td><td style="text-align: center">${r.years}</td><td style="text-align: right">${formatCurrency(r.annualBase)}</td></tr>`
                : `<tr><td></td><td>${sanitizeHtml(r.prodName)}</td><td style="text-align: right">${r.stbhDisplay}</td><td style="text-align: center">${r.years}</td><td style="text-align: right">${formatCurrency(r.perPeriod)}</td><td style="text-align: right">${formatCurrency(r.annualEq)}</td><td style="text-align: right">${formatCurrency(r.annualBase)}</td><td style="text-align: right">${formatDiffCell(r.diff)}</td></tr>`);
        });
    });
    
    body.push(isAnnual ? `<tr style="font-weight: bold;"><td colspan="4">Tổng tất cả</td><td style="text-align: right">${formatCurrency(r1000(grand.base))}</td></tr>`
        : `<tr style="font-weight: bold;"><td colspan="4">Tổng tất cả</td><td style="text-align: right">${formatCurrency(r1000(grand.per))}</td><td style="text-align: right">${formatCurrency(r1000(grand.eq))}</td><td style="text-align: right">${formatCurrency(r1000(grand.base))}</td><td style="text-align: right">${formatDiffCell(grand.diff)}</td></tr>`);
    
    return `<h3>Phần 1 · Tóm tắt sản phẩm</h3><table><thead>${headerHtml}</thead><tbody>${body.join('')}</tbody></table>`;
}

function buildPart3ScheduleSection(summaryData) {
    const productConfig = PRODUCT_CATALOG[summaryData.productKey];
    const isPulMul = ['PUL', 'MUL'].includes(productConfig?.group);
    const { schedule, isAnnual, persons } = summaryData;
    const rows = schedule.rows;
    if (!rows.length) return '';

    const activePersonIdx = persons.map((p, i) => rows.some(r => (r.perPersonSuppAnnualEq[i] || 0) > 0) ? i : -1).filter(i => i !== -1);
    let title = 'Phần 3 · Bảng phí';

    if (isPulMul && productConfig.accountValue?.calculateProjection) {
        title += ' & Minh họa giá trị tài khoản';
        const customRateInput = document.getElementById('custom-interest-rate-input')?.value || '4.7';
        
        const projection = productConfig.accountValue.calculateProjection(
            productConfig,
            {
                mainPerson: appState.persons.find(p => p.isMain),
                mainProduct: appState.mainProduct,
                basePremium: appState.fees.baseMain,
                extraPremium: appState.mainProduct.values['extra-premium'],
                targetAge: summaryData.targetAge,
                customInterestRate: customRateInput,
                paymentFrequency: summaryData.freq,
            },
            { investment_data, roundDownTo1000, GLOBAL_CONFIG }
        );

        let header = ['<th>Năm HĐ</th>', '<th>Tuổi</th>', '<th>Phí chính</th>'];
        if (!schedule.extraAllZero) header.push('<th>Phí đóng thêm</th>');
        header.push(...activePersonIdx.map(i => `<th>Phí BS (${sanitizeHtml(persons[i].name)})</th>`));
        header.push('<th>Tổng đóng/năm</th>');
        header.push('<th>Giá trị TK (Lãi suất cam kết)</th>');
        header.push(`<th>Giá trị TK (Lãi suất ${customRateInput}% trong 20 năm đầu, từ năm 21 là lãi suất cam kết)</th>`);
        header.push(`<th>Giá trị TK (Lãi suất ${customRateInput}% xuyên suốt hợp đồng)</th>`);

        let sums = { main: 0, extra: 0, supp: activePersonIdx.map(() => 0), totalBase: 0 };
        const body = rows.map((r, i) => {
            sums.main += r.mainYearBase;
            sums.extra += r.extraYearBase;
            sums.totalBase += r.totalYearBase;
            activePersonIdx.forEach((pIdx, idx) => sums.supp[idx] += r.perPersonSuppAnnualEq[pIdx]);
            
            const gttk_guaranteed = roundDownTo1000(projection.guaranteed[i]);
            const gttk_capped = roundDownTo1000(projection.customCapped[i]);
            const gttk_full = roundDownTo1000(projection.customFull[i]);

            return `<tr><td style="text-align: center">${r.year}</td><td style="text-align: center">${r.age}</td>
                        <td style="text-align: right">${formatCurrency(r.mainYearBase)}</td>
                        ${schedule.extraAllZero ? '' : `<td style="text-align: right">${formatCurrency(r.extraYearBase)}</td>`}
                        ${activePersonIdx.map(pIdx => `<td style="text-align: right">${formatCurrency(r.perPersonSuppAnnualEq[pIdx])}</td>`).join('')}
                        <td style="text-align: right; font-weight:bold;">${formatCurrency(r.totalYearBase)}</td>
                        <td style="text-align: right">${formatCurrency(gttk_guaranteed)}</td>
                        <td style="text-align: right">${formatCurrency(gttk_capped)}</td>
                        <td style="text-align: right">${formatCurrency(gttk_full)}</td>
                    </tr>`;
        }).join('');
        
        const footerCols = [
            '<td colspan="2">Tổng</td>',
            `<td style="text-align: right">${formatCurrency(sums.main)}</td>`,
            (schedule.extraAllZero ? '' : `<td style="text-align: right">${formatCurrency(sums.extra)}</td>`),
            ...sums.supp.map(s => `<td style="text-align: right">${formatCurrency(s)}</td>`),
            `<td style="text-align: right">${formatCurrency(sums.totalBase)}</td>`,
            '<td colspan="3"></td>'
        ];
        const footer = `<tr style="font-weight: bold;">${footerCols.join('')}</tr>`;

        return `<h3>${title}</h3><table><thead><tr>${header.join('')}</tr></thead><tbody>${body}${footer}</tbody></table>`;
    }

    // Fallback for non-PUL/MUL
    let header = ['<th>Năm HĐ</th>', '<th>Tuổi</th>', '<th>Phí chính</th>'];
    if(!schedule.extraAllZero) header.push('<th>Phí đóng thêm</th>');
    header.push(...activePersonIdx.map(i => `<th>Phí BS (${sanitizeHtml(persons[i].name)})</th>`));
    if(!isAnnual) header.push('<th>Tổng quy năm</th>');
    header.push('<th>Tổng đóng/năm</th>');
    if(!isAnnual) header.push('<th>Chênh lệch</th>');
    
    let sums = { main: 0, extra: 0, supp: activePersonIdx.map(() => 0), totalEq: 0, totalBase: 0, diff: 0 };
    const body = rows.map(r => {
        sums.main += r.mainYearBase; sums.extra += r.extraYearBase; sums.totalEq += r.totalAnnualEq; sums.totalBase += r.totalYearBase; sums.diff += r.diff;
        activePersonIdx.forEach((pIdx, i) => sums.supp[i] += r.perPersonSuppAnnualEq[pIdx]);
        return `<tr><td style="text-align: center">${r.year}</td><td style="text-align: center">${r.age}</td><td style="text-align: right">${formatCurrency(r.mainYearBase)}</td>${schedule.extraAllZero ? '' : `<td style="text-align: right">${formatCurrency(r.extraYearBase)}</td>`}${activePersonIdx.map(i => `<td style="text-align: right">${formatCurrency(r.perPersonSuppAnnualEq[i])}</td>`).join('')}${!isAnnual ? `<td style="text-align: right">${formatCurrency(r.totalAnnualEq)}</td>` : ''}<td style="text-align: right">${formatCurrency(r.totalYearBase)}</td>${!isAnnual ? `<td style="text-align: right">${r.diff ? `<span class="text-red-600 font-bold">${formatCurrency(r.diff)}</span>` : '0'}</td>` : ''}</tr>`;
    }).join('');
    const footer = `<tr style="font-weight: bold;"><td colspan="2">Tổng</td><td style="text-align: right">${formatCurrency(sums.main)}</td>${schedule.extraAllZero ? '' : `<td style="text-align: right">${formatCurrency(sums.extra)}</td>`}${sums.supp.map(s => `<td style="text-align: right">${formatCurrency(s)}</td>`).join('')}${!isAnnual ? `<td style="text-align: right">${formatCurrency(sums.totalEq)}</td>` : ''}<td style="text-align: right">${formatCurrency(sums.totalBase)}</td>${!isAnnual ? `<td style="text-align: right">${sums.diff?`<span class="text-red-600 font-bold">${formatCurrency(sums.diff)}</span>`:'0'}</td>` : ''}</tr>`;
    
    return `<h3>${title}</h3><table><thead><tr>${header.join('')}</tr></thead><tbody>${body}${footer}</tbody></table>`;
}

function buildFooterSection() {
    return `<div style="font-size: 10px; font-style: italic; color: #555; margin-top: 1rem;">(*) Công cụ này chỉ mang tính chất tham khảo cá nhân, không phải là bảng minh họa chính thức của AIA...</div>`;
}

function buildPart2BenefitsSection(summaryData) {
    const colsBySchema = bm_collectColumns(summaryData);
    const order = ['AN_BINH_UU_VIET', 'KHOE_BINH_AN', 'VUNG_TUONG_LAI', 'PUL_FAMILY', 'HEALTH_SCL', 'BHN_2_0', 'HOSPITAL_SUPPORT', 'ACCIDENT'];
    const blocks = order.map(sk => colsBySchema[sk] ? bm_renderSchemaTables(sk, colsBySchema[sk], summaryData) : '').filter(Boolean);
    if (!blocks.length) return `<h3>Phần 2 · Tóm tắt quyền lợi sản phẩm</h3><div>Không có quyền lợi nào để hiển thị.</div>`;
    return `<h3>Phần 2 · Tóm tắt quyền lợi sản phẩm</h3>${blocks.join('')}`;
}

function bm_findSchema(productKey) {
    if (productKey === 'bhn') return BENEFIT_MATRIX_SCHEMAS.find(s => s.key === 'BHN_2_0');
    const prodGroup = PRODUCT_CATALOG[productKey]?.group;
    if (prodGroup === 'TRADITIONAL' && productKey === 'AN_BINH_UU_VIET') return BENEFIT_MATRIX_SCHEMAS.find(s => s.key === 'AN_BINH_UU_VIET');
    if (prodGroup === 'MUL') return BENEFIT_MATRIX_SCHEMAS.find(s => s.key === productKey);
    if (prodGroup === 'PUL') return BENEFIT_MATRIX_SCHEMAS.find(s => s.key === 'PUL_FAMILY');
    return BENEFIT_MATRIX_SCHEMAS.find(s => s.key.toLowerCase() === productKey.toLowerCase() || s.productKeys?.includes(productKey));
}

function bm_collectColumns(summaryData) {
    const colsBySchema = {};
    const persons = summaryData.persons || [];
    const mainKey = summaryData.productKey;
    const mainSa = appState.mainProduct.values['main-stbh'] || 0;
    const isFemale = (p) => (p.gender || '').toLowerCase() === 'nữ';

    if (mainKey) {
        const schema = bm_findSchema(mainKey);
        if (schema) {
            colsBySchema[schema.key] = colsBySchema[schema.key] || [];
            colsBySchema[schema.key].push({ productKey: mainKey, sumAssured: mainSa, persons: [summaryData.mainPerson] });
        }
    }
    if (mainKey === 'TRON_TAM_AN') {
        const schemaABUV = bm_findSchema('AN_BINH_UU_VIET');
        if (schemaABUV) {
            colsBySchema[schemaABUV.key] = colsBySchema[schemaABUV.key] || [];
            colsBySchema[schemaABUV.key].push({ productKey: 'AN_BINH_UU_VIET', sumAssured: 100000000, persons: [summaryData.mainPerson] });
        }
    }

    persons.forEach(p => {
        const supp = p.supplements || {};
        for (const rid in supp) {
            const schema = bm_findSchema(rid);
            if (!schema) continue;

            const fee = appState.fees.byPerson[p.id]?.suppDetails?.[rid] || 0;
            if (fee <= 0) continue;

            colsBySchema[schema.key] = colsBySchema[schema.key] || [];
            let sig = rid, sa = supp[rid].stbh;
            let colData;
            
            if (rid === 'health_scl') {
                const { program, outpatient, dental } = supp.health_scl;
                const maternity = BM_SCL_PROGRAMS[program]?.maternity && isFemale(p);
                sig += `|${program}|${outpatient ? 1:0}|${dental ? 1:0}|${maternity ? 1:0}`;
                colData = { productKey: rid, program, flags: { outpatient, dental, maternity }, persons: [p] };
            } else if (rid === 'bhn') {
                const child = p.age < 21;
                const elder = p.age >= 55;
                sig += `|${sa}|${child ? 1:0}|${elder ? 1:0}`;
                colData = { productKey: rid, sumAssured: sa, flags: { child, elder }, persons: [p] };
            } else if (rid === 'hospital_support') {
                 sig += `|${sa}`;
                 colData = { productKey: rid, sumAssured: sa, daily: sa, persons: [p] };
            } else {
                 sig += `|${sa}`;
                 colData = { productKey: rid, sumAssured: sa, persons: [p] };
            }

            let existingCol = colsBySchema[schema.key].find(c => c.sig === sig);
            if (existingCol) {
                existingCol.persons.push(p);
            } else {
                colData.sig = sig;
                colsBySchema[schema.key].push(colData);
            }
        }
    });

    Object.values(colsBySchema).forEach(arr => arr.forEach(col => {
        const names = (col.persons || []).map(p => p.name || p.id).join(', ');
        let label = names;
        if (col.productKey === 'health_scl') {
            label += ` - ${BM_SCL_PROGRAMS[col.program]?.label || ''}`;
        }
        if (col.sumAssured) {
            label += ` - STBH: ${formatCurrency(col.sumAssured)}`;
        }
        col.label = label;
    }));
    
    return colsBySchema;
}

function bm_renderSchemaTables(schemaKey, columns) {
    const schema = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === schemaKey);
    if (!schema || !columns.length) return '';

    const titleMap = { 'AN_BINH_UU_VIET': 'An Bình Ưu Việt', 'KHOE_BINH_AN': 'Khoẻ Bình An', 'VUNG_TUONG_LAI': 'Vững Tương Lai', 'PUL_FAMILY': 'Khoẻ Trọn Vẹn', 'HEALTH_SCL': 'Sức khỏe Bùng Gia Lực', 'BHN_2_0': 'Bệnh hiểm nghèo 2.0', 'HOSPITAL_SUPPORT': 'Hỗ trợ Chi phí Nằm viện', 'ACCIDENT': 'Tai nạn' };
    const title = titleMap[schema.key] || schema.key;
    const headCols = columns.map(c => `<th>${sanitizeHtml(c.label)}</th>`).join('');
    
    let rows = [];
    schema.benefits.forEach(benef => {
        if (benef.headerCategory) {
            let needed = false;
            if (benef.headerCategory === 'maternity') needed = columns.some(c => c.flags?.maternity);
            else if (benef.headerCategory === 'outpatient') needed = columns.some(c => c.flags?.outpatient);
            else if (benef.headerCategory === 'dental') needed = columns.some(c => c.flags?.dental);
            if (needed) rows.push({ isHeader: true, benef, colspan: 1 + columns.length });
            return;
        }

        let cellsData = [];
        let anyVisible = false;
        columns.forEach(col => {
            if ((benef.productCond && benef.productCond !== col.productKey) || (benef.minAge && !col.persons.some(p => p.age >= benef.minAge)) || (benef.maternityOnly && !col.flags?.maternity) || (benef.outpatientOnly && !col.flags?.outpatient) || (benef.dentalOnly && !col.flags?.dental) || (benef.childOnly && !col.flags?.child) || (benef.elderOnly && !col.flags?.elder)) {
                cellsData.push({ displayValue: '', singleValue: 0 }); return;
            }
            
            let displayValue = '', singleValue = 0;
            if (benef.valueType === 'number') {
                let raw = 0;
                if(benef.compute) raw = benef.compute(col.sumAssured);
                else if(benef.computeDaily) raw = benef.computeDaily(col.daily);
                else if(benef.computeProg) raw = benef.computeProg(BM_SCL_PROGRAMS[col.program]);
                if (benef.cap && raw > benef.cap) raw = benef.cap;
                singleValue = roundDownTo1000(raw);
                displayValue = singleValue ? formatCurrency(singleValue * (benef.multiClaim || 1)) : '';
            } else {
                if (benef.computeRange) displayValue = benef.computeRange(col.sumAssured);
                else if (benef.computeProg) displayValue = benef.computeProg(BM_SCL_PROGRAMS[col.program]);
                else displayValue = benef.text || '';
            }

            if (displayValue) anyVisible = true;
            cellsData.push({ displayValue, singleValue });
        });
        if (anyVisible) rows.push({ benef, cellsData });
    });

    const bodyHtml = rows.map(r => {
        if (r.isHeader) return `<tr><td colspan="${r.colspan}" style="font-weight: bold;">${sanitizeHtml(r.benef.labelBase)}</td></tr>`;
        
        let labelHtml = `${sanitizeHtml(r.benef.labelBase)}${r.benef.formulaLabel ? ` - ${sanitizeHtml(r.benef.formulaLabel)}` : ''}`;
        if (r.benef.multiClaim) {
            const firstCell = r.cellsData.find(c => c.singleValue > 0);
            if (firstCell) labelHtml += ` - ${formatCurrency(firstCell.singleValue)} x ${r.benef.multiClaim}`;
        }

        const cellsHtml = r.cellsData.map(c => `<td style="text-align: right">${c.displayValue}</td>`).join('');
        return `<tr><td>${labelHtml}</td>${cellsHtml}</tr>`;
    }).join('');

    let totalRowHtml = '';
    if (schema.hasTotal) {
        let totalCellsSum = columns.map((_, i) => rows.reduce((sum, r) => sum + ((r.benef.valueType === 'number' && r.cellsData[i].singleValue) ? (r.cellsData[i].singleValue * (r.benef.multiClaim || 1)) : 0), 0));
        totalRowHtml = `<tr><td style="font-weight: bold;">Tổng quyền lợi</td>${totalCellsSum.map(s => `<td style="text-align: right; font-weight: bold;">${s ? formatCurrency(s) : ''}</td>`).join('')}</tr>`;
    }

    return `<div><h4>${sanitizeHtml(title)}</h4><table><thead><tr><th>Tên quyền lợi</th>${headCols}</tr></thead><tbody>${bodyHtml}${totalRowHtml}</tbody></table></div>`;
}
function getProductLabel(key) {
  return PRODUCT_CATALOG[key]?.name || key || '';
}

// ===================================================================================
// ===== MODULE: MIỄN ĐÓNG PHÍ 3.0 (REFACTORED)
// ===================================================================================
window.MDP3 = (function () {
    let selectedId = null;
    let lastSelectedId = null;

    function init() {
        const container = document.getElementById('waiver-of-premium-container');
        if (!container) return;
        
        container.innerHTML = `
            <label class="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" id="mdp3-enable" class="form-checkbox">
                <span class="font-medium text-gray-800">Bật Miễn đóng phí 3.0</span>
            </label>
            <div id="mdp3-options-container" class="hidden mt-4 space-y-4"></div>
        `;
        attachListeners();
    }
    
    function attachListeners(){
         document.body.addEventListener('change', function (e) {
            if (e.target.id === 'mdp3-enable') {
                const optionsContainer = document.getElementById('mdp3-options-container');
                if (e.target.checked) {
                    optionsContainer.classList.remove('hidden');
                    renderOptions();
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
                } else {
                    optionsContainer.classList.add('hidden');
                    optionsContainer.innerHTML = '';
                    selectedId = null;
                }
                runWorkflow();
            }
            if (e.target.id === 'mdp3-person-select') {
                selectedId = e.target.value;
                lastSelectedId = selectedId || null;
                const otherForm = document.getElementById('mdp3-other-form');
                if (selectedId === 'other') showOtherForm();
                else if(otherForm) otherForm.classList.add('hidden');
                runWorkflow();
            }
        });

        // Listen for changes in supplementary person info
        document.getElementById('supplementary-insured-container').addEventListener('input', debounce(updateOptions, 300));
    }

    function render(isMainProductValid) {
        const waiverSection = document.getElementById('waiver-of-premium-section');
        const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
        const isDisabled = !isMainProductValid || mainProductConfig?.rules?.noSupplementaryInsured;

        waiverSection.classList.toggle('opacity-50', isDisabled);
        waiverSection.classList.toggle('pointer-events-none', isDisabled);

        if (isDisabled) reset();
    }
    
    function renderOptions(){
        const optionsContainer = document.getElementById('mdp3-options-container');
        if (!optionsContainer) return;
        
        optionsContainer.innerHTML = `
            <div>
                <label for="mdp3-person-select" class="font-medium text-gray-700 block mb-1">Áp dụng cho</label>
                <select id="mdp3-person-select" class="form-select w-full"></select>
            </div>
            <div id="mdp3-other-form" class="hidden mt-4 p-3 border rounded bg-gray-50"></div>
            <div id="mdp3-fee-display" class="text-right font-semibold text-aia-red min-h-[1.5rem] mt-2"></div>
        `;
        updateOptions();
    }

    function reset() {
        selectedId = null;
        lastSelectedId = null;
        const enableCb = document.getElementById('mdp3-enable');
        if (enableCb) enableCb.checked = false;
        const optionsContainer = document.getElementById('mdp3-options-container');
        if (optionsContainer) {
            optionsContainer.classList.add('hidden');
            optionsContainer.innerHTML = '';
        }
    }
    
    function updateOptions() {
        if (!isEnabled()) return;
        const selEl = document.getElementById('mdp3-person-select');
        if (!selEl) return;
    
        const currentSelectedValue = selEl.value;
    
        let optionsHtml = `<option value="">-- Chọn người --</option>`;
        appState.persons.forEach(p => {
            if (p.isMain) return; // Exclude main person
            let label = p.name || 'NĐBH bổ sung';
            label += ` (tuổi ${p.age || "?"})`;
            const isEligible = p.age >= 18 && p.age <= 60;
            optionsHtml += `<option value="${p.id}" ${isEligible ? '' : 'disabled'}>${label}${!isEligible ? ' - Không đủ ĐK' : ''}</option>`;
        });
        optionsHtml += `<option value="other">Người khác</option>`;
        selEl.innerHTML = optionsHtml;
    
        // Restore selection if possible
        const opt = selEl.querySelector(`option[value="${currentSelectedValue}"]`);
        if (opt && !opt.disabled) {
            selEl.value = currentSelectedValue;
        } else {
            selectedId = null;
            if (currentSelectedValue !== 'other') {
                const otherForm = document.getElementById('mdp3-other-form');
                if (otherForm) otherForm.classList.add('hidden');
            }
        }
    }

    function showOtherForm() {
        const otherForm = document.getElementById('mdp3-other-form');
        otherForm.classList.remove('hidden');
        if(!otherForm.querySelector('.person-container')) {
             otherForm.innerHTML = `<div id="person-container-wop-other" class="person-container">${generateOtherPersonHtml()}</div>`;
             initDateFormatter(otherForm.querySelector('.dob-input'));
        }
    }

    function getStbhBase() {
        let stbhBase = 0;
        stbhBase += (appState.fees.baseMain || 0) + (appState.fees.extra || 0);
        
        appState.persons.forEach(p => {
             stbhBase += appState.fees.byPerson[p.id]?.supp || 0;
        });
        
        const mdpTarget = getTargetPersonInfo();
        if (mdpTarget && mdpTarget.id !== 'wop_other') {
             stbhBase -= appState.fees.byPerson[mdpTarget.id]?.supp || 0;
        }
        return Math.max(0, stbhBase);
    }
    
    function getPremium() {
        const feeEl = document.getElementById('mdp3-fee-display');
        if (!isEnabled() || !selectedId) {
            if (feeEl) feeEl.textContent = '';
            return 0;
        }
        const stbhBase = getStbhBase();
        const personInfo = getTargetPersonInfo();

        if (!personInfo || !personInfo.age || personInfo.age < 18 || personInfo.age > 60) {
            if(feeEl) feeEl.textContent = `STBH: ${formatCurrency(stbhBase)} | Phí: — (Người không hợp lệ)`;
            return 0;
        }
        
        const mdpConfig = PRODUCT_CATALOG['mdp3'];
        const premium = mdpConfig.calculation.calculate({ customer: personInfo, stbhBase });
        
        if (feeEl) {
            feeEl.textContent = premium > 0
                ? `STBH: ${formatCurrency(stbhBase)} | Phí: ${formatCurrency(premium)}`
                : `STBH: ${formatCurrency(stbhBase)} | Phí: —`;
        }
        return premium;
    }

    function validate() {
        if (!isEnabled() || !selectedId) return true;
        
        const personInfo = getTargetPersonInfo();
        if (selectedId === 'other') {
            const dobInput = document.querySelector('#person-container-wop-other .dob-input');
            if (!validateDobField(dobInput)) return false;
            if (personInfo.age < 18 || personInfo.age > 60) {
                 setFieldError(dobInput, 'Tuổi phải từ 18-60');
                 return false;
            }
            clearFieldError(dobInput);
        }
        return true;
    }

    function getTargetPersonInfo() {
        if (!selectedId) return null;
        if (selectedId === 'other') {
            const otherForm = document.getElementById('person-container-wop-other');
            return otherForm ? { ...collectPersonData(otherForm, false, true), id: 'wop_other' } : null;
        }
        return appState.persons.find(p => p.id === selectedId) || null;
    }
    
    function generateOtherPersonHtml() {
        return `<h3 class="text-lg font-bold text-gray-700 mb-2 border-t pt-4">Người được miễn đóng phí</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="font-medium text-gray-700 block mb-1">Họ và Tên</label><input type="text" class="form-input name-input"></div>
            <div><label class="font-medium text-gray-700 block mb-1">Ngày sinh</label><input type="text" class="form-input dob-input" placeholder="DD/MM/YYYY"></div>
            <div><label class="font-medium text-gray-700 block mb-1">Giới tính</label><select class="form-select gender-select"><option value="Nam">Nam</option><option value="Nữ">Nữ</option></select></div>
            <div class="flex items-end space-x-4"><p class="text-lg">Tuổi: <span class="font-bold text-aia-red age-span">0</span></p></div>
          </div>`;
    }

    return { init, isEnabled, getSelectedId: () => selectedId, getPremium, getStbhBase, reset, updateOptions, render, validate, getTargetPersonInfo };
})();
