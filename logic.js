
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
let productJustChanged = false; // Flag to handle product switching UI race condition

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

    if (productJustChanged) {
        // When product has just changed, we do NOT read from the (old) DOM.
        // The render function will use the new product's defaults.
    } else if (mainProductConfig?.ui?.controls) {
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
                let value = appState.mainProduct.values[cfg.id] ?? cfg.defaultValue ?? '';
                // For packages, ensure disabled fields show fixed values
                if (productConfig.group === 'PACKAGE' && cfg.disabled) {
                    value = cfg.defaultValue;
                }
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

        if (prodConfig.ui.onRender) {
             prodConfig.ui.onRender({
                section,
                el: section,
                customer,
                mainPremium: appState.fees.baseMain,
                allValues: appState.mainProduct.values,
                allPersons: appState.persons,
                config: prodConfig,
                mainProductConfig
            });
        }
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
        const el = section.querySelector(`#${controlConfig.id}`); // FIX: Query within section
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
  // FIX: Read term directly from DOM for accuracy, like logic-1.js
  if (productConfig.group === 'PACKAGE') {
      term = parseInt(productConfig.packageConfig.fixedValues.paymentTerm, 10);
  } else if (document.getElementById('abuv-term')) {
      term = parseInt(document.getElementById('abuv-term').value || '0', 10);
  } else {
      term = parseInt(document.getElementById('payment-term')?.value || '0', 10);
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
  window.MDP3.render(validationResult); // Pass full result object
  updateTargetAge();
  productJustChanged = false; // Reset flag after workflow is complete
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
            productJustChanged = true; // SET FLAG
            lastRenderedProductKey = null;
            appState.mainProduct.values = {};
            
            const newProductConfig = PRODUCT_CATALOG[e.target.value];
            if (newProductConfig?.rules?.noSupplementaryInsured) {
                // Immediately clear UI to prevent stale data reading
                document.getElementById('supplementary-insured-container').innerHTML = '';
                document.querySelectorAll('#main-supp-container .supplementary-products-container input[type=checkbox]').forEach(cb => cb.checked = false);
                if(window.MDP3) window.MDP3.reset();

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

    let term = 0;
    // FIX: Read term directly from DOM to avoid stale state issues and ensure numeric type.
    if (productConfig.group === 'TRADITIONAL' || productConfig.group === 'PACKAGE') {
        term = (productConfig.group === 'PACKAGE')
            ? parseInt(productConfig.packageConfig.fixedValues.paymentTerm, 10)
            : parseInt(document.getElementById('abuv-term')?.value || '0', 10);
        targetAgeInput.disabled = true;
        targetAgeInput.value = term ? (mainPerson.age + term - 1) : mainPerson.age;
        return;
    }
    
    term = parseInt(document.getElementById('payment-term')?.value, 10) || 0;

    targetAgeInput.disabled = false;
    const paymentTerm = term;
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
      if (premiumDetail > 0 && !riderList.some(r => r.slug === rid)) { // FIX: Prevent duplicate images
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
        if (targetPerson) { // FIX: Prevent error if targetPerson is null
            mdp3Obj = { premium, selectedName: targetPerson.name, selectedAge: targetPerson.age };
            riderList.push({ slug: 'mdp3', selected: true, stbh: 0, premium: premium });
        }
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
        // Footer is now generated inside part3Html
        return introHtml + part1Html + part2Html + part3Html;
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
            paymentTerm = parseInt(productConfig.packageConfig.fixedValues.paymentTerm, 10);
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

        const personFeeData = appState.fees.byPerson[p.id];
        if (personFeeData?.suppDetails) {
            Object.keys(p.supplements).forEach(rid => {
                const supp = p.supplements[rid];
                const baseAnnual = personFeeData.suppDetails[rid] || 0;
                if(baseAnnual <= 0) return;

                const prodCfg = PRODUCT_CATALOG[rid];
                let stbhDisplay = '—';
                if(rid === 'health_scl') stbhDisplay = BM_SCL_PROGRAMS[supp.program]?.label || '—';
                else if (supp.stbh) stbhDisplay = formatCurrency(supp.stbh);

                const term = Math.min(paymentTerm, riderMaxAge(rid) - p.age + 1);
                pushRow(acc, p.name, prodCfg.name, stbhDisplay, term, baseAnnual, true);
            });
        }
        
        if(mdpEnabled && mdpTarget && mdpTarget.id === p.id){
            const mdpFee = window.MDP3.getPremium();
            if(mdpFee > 0){
                const term = Math.min(paymentTerm, 60 - mdpTarget.age + 1);
                pushRow(acc, mdpTarget.name, PRODUCT_CATALOG.mdp3.name, formatCurrency(mdpStbhBase), term, mdpFee, true);
            }
        }

        perPersonTotals.push({ person: p, totals: acc });
        grand.per += acc.per; grand.eq += acc.eq; grand.base += acc.base; grand.diff += acc.diff;
    });

    return { rows, perPersonTotals, grand };
}

function buildPart2ScheduleRows(ctx) {
    const { persons, mainPerson, paymentTerm, targetAge, periods, isAnnual, riderFactor, productKey, mdpEnabled, mdpTarget } = ctx;
    const productConfig = PRODUCT_CATALOG[productKey];

    let rows = [];
    const mainAge = mainPerson.age;
    const customInterestRate = parseFloat(document.getElementById('custom-interest-rate-input')?.value) / 100;

    let accountValueProjection = null;
    if (productConfig.accountValue?.enabled) {
        accountValueProjection = productConfig.accountValue.calculateProjection(productConfig, {
            mainPerson: mainPerson,
            mainProduct: appState.mainProduct,
            basePremium: appState.fees.baseMain,
            extraPremium: appState.fees.extra,
            targetAge, customInterestRate, paymentFrequency: appState.paymentFrequency
        }, { investment_data, roundDownTo1000, GLOBAL_CONFIG });
    }

    for (let i = 0; i <= targetAge - mainAge; i++) {
        const year = i + 1;
        const currentAge = mainAge + i;

        let totalAnnualFee = 0;
        let mainAnnualFee = 0;
        let suppAnnualFee = 0;

        if (year <= paymentTerm) {
            mainAnnualFee = appState.fees.baseMain + appState.fees.extra;
        }

        persons.forEach(p => {
            Object.keys(p.supplements).forEach(rid => {
                const riderCfg = PRODUCT_CATALOG[rid];
                const renewalMax = riderCfg.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 99;
                if (p.age + i <= renewalMax) {
                    const riderFee = riderCfg.calculation.calculate({ 
                        customer: p, ageOverride: p.age + i,
                        mainPremium: appState.fees.baseMain, totalHospitalSupportStbh:0
                    });
                    suppAnnualFee += riderFee;
                }
            });
        });

        if (mdpEnabled && mdpTarget) {
            const mdpRenewMax = 60;
            if (mdpTarget.age + i <= mdpRenewMax) {
                const mdpFee = MDP3.getPremium(mdpTarget.age + i);
                suppAnnualFee += mdpFee;
            }
        }
        
        totalAnnualFee = mainAnnualFee + suppAnnualFee;

        rows.push({
            year: year,
            age: currentAge,
            annualFee: totalAnnualFee,
            guaranteedVal: accountValueProjection ? accountValueProjection.guaranteed[i] : 0,
            customValCapped: accountValueProjection ? accountValueProjection.customCapped[i] : 0,
            customValFull: accountValueProjection ? accountValueProjection.customFull[i] : 0,
        });
    }

    return rows;
}


function buildIntroSection(data) {
    const { mainPerson, persons, productKey } = data;
    const pConfig = PRODUCT_CATALOG[productKey];
    const suppPersons = persons.filter(p => !p.isMain && p.id !== 'wop_other');

    let html = `<h3>Phần 1: Thông tin chung</h3>
    <table style="width:100%">
        <tr><td style="width:25%"><strong>Sản phẩm chính</strong></td><td>${pConfig.name}</td></tr>
        <tr><td><strong>Bên mua bảo hiểm</strong></td><td></td></tr>
        <tr><td><strong>Người được bảo hiểm chính</strong></td><td>${sanitizeHtml(mainPerson.name)} - ${mainPerson.age} tuổi</td></tr>`;
    
    if (suppPersons.length > 0) {
        html += `<tr><td><strong>NĐBH bổ sung</strong></td><td>`;
        html += suppPersons.map(p => `${sanitizeHtml(p.name)} - ${p.age} tuổi`).join('<br>');
        html += `</td></tr>`;
    }
    
    html += `</table>`;
    return html;
}

function buildPart1Section(data) {
    const { isAnnual, part1, freq } = data;
    const fmt = formatCurrency;
    
    let html = `<h3>Phần 2: Tóm tắt sản phẩm và chi phí</h3>
    <table>
        <thead>
            <tr>
                <th>Người được bảo hiểm</th>
                <th>Tên sản phẩm</th>
                <th>Số tiền bảo hiểm/ Quyền lợi</th>
                <th>Thời hạn đóng phí (năm)</th>
                ${!isAnnual ? `<th>Phí theo kỳ (${freq})</th><th>Phí quy năm</th><th>Chênh lệch</th>` : ''}
                <th>Phí năm</th>
            </tr>
        </thead>
        <tbody>`;
    
    part1.rows.forEach(r => {
        html += `<tr>
            <td>${sanitizeHtml(r.personName)}</td>
            <td>${sanitizeHtml(r.prodName)}</td>
            <td style="text-align:right">${sanitizeHtml(r.stbhDisplay)}</td>
            <td style="text-align:center">${r.years}</td>
            ${!isAnnual ? `<td style="text-align:right">${fmt(r.perPeriod)}</td><td style="text-align:right">${fmt(r.annualEq)}</td><td style="text-align:right">${fmt(r.diff)}</td>` : ''}
            <td style="text-align:right">${fmt(r.annualBase)}</td>
        </tr>`;
    });

    html += `<tr>
        <td colspan="3" style="text-align:right; font-weight:bold;">TỔNG CỘNG</td>
        <td></td>
        ${!isAnnual ? `<td style="text-align:right;font-weight:bold;">${fmt(part1.grand.per)}</td><td style="text-align:right;font-weight:bold;">${fmt(part1.grand.eq)}</td><td style="text-align:right;font-weight:bold;">${fmt(part1.grand.diff)}</td>` : ''}
        <td style="text-align:right;font-weight:bold;">${fmt(part1.grand.base)}</td>
    </tr></tbody></table>`;

    return html;
}

function buildPart2BenefitsSection(data) {
    const { persons, productKey } = data;
    const mainPerson = persons.find(p => p.isMain);
    const pConfig = PRODUCT_CATALOG[productKey];

    let html = `<h3>Phần 3: Tóm tắt quyền lợi bảo hiểm</h3>`;

    const buildTable = (title, schemaKey, person, productOverrideKey) => {
        const schema = BENEFIT_MATRIX_SCHEMAS.find(s => 
            (s.productKeys && s.productKeys.includes(productOverrideKey || schemaKey)) || s.key === schemaKey
        );
        if (!schema) return '';

        let tableHtml = `<h4>${title}</h4><table><thead><tr><th>Quyền lợi</th><th>Mô tả</th><th style="width:20%">Số tiền</th></tr></thead><tbody>`;
        let total = 0;

        schema.benefits.forEach(b => {
            if(b.minAge && person.age < b.minAge) return;
            if(b.productCond && b.productCond !== productKey) return;

            let value = '—';
            let computedValue = 0;
            const sa = productKey === 'TRON_TAM_AN' 
                ? 100000000 
                : (appState.mainProduct.values['main-stbh'] || 0);

            if (b.valueType === 'number') {
                computedValue = b.compute(sa);
                if (b.cap) computedValue = Math.min(computedValue, b.cap);
                value = formatCurrency(computedValue);
            } else if (b.valueType === 'text') {
                value = b.text;
            }

            tableHtml += `<tr><td>${b.labelBase}</td><td>${b.formulaLabel}</td><td style="text-align:right">${value}</td></tr>`;
            if (schema.hasTotal) {
                total += computedValue * (b.multiClaim || 1);
            }
        });

        if (schema.hasTotal) {
            tableHtml += `<tr><td colspan="2" style="text-align:right;font-weight:bold;">TỔNG QUYỀN LỢI TỐI ĐA</td><td style="text-align:right;font-weight:bold;">${formatCurrency(total)}</td></tr>`;
        }
        tableHtml += '</tbody></table>';
        return tableHtml;
    };
    
    html += buildTable(`A. Sản phẩm chính: ${pConfig.name}`, pConfig.group === 'PUL' ? 'PUL_FAMILY' : productKey, mainPerson, productKey);
    
    persons.forEach(p => {
        const supps = p.supplements || {};
        Object.keys(supps).forEach(rid => {
            const riderConfig = PRODUCT_CATALOG[rid];
            const title = `B. Sản phẩm bổ sung: ${riderConfig.name} (${p.name})`;
            
            if(rid === 'bhn') {
                html += buildTable(title, 'BHN_2_0', p);
            } else if (rid === 'health_scl') {
                const program = supps.health_scl.program;
                const progData = BM_SCL_PROGRAMS[program];
                if (!progData) return;
                
                const schema = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === 'HEALTH_SCL');
                let tableHtml = `<h4>${title} - Chương trình ${progData.label}</h4><table><thead><tr><th>Quyền lợi</th><th>Mô tả</th><th style="width:20%">Số tiền/ Tỷ lệ</th></tr></thead><tbody>`;
                
                schema.benefits.forEach(b => {
                     if((b.maternityOnly && !progData.maternity) ||
                        (b.outpatientOnly && !supps.health_scl.outpatient) ||
                        (b.dentalOnly && !supps.health_scl.dental)) return;
                     if(b.headerCategory && ((b.headerCategory==='maternity' && !progData.maternity) || (b.headerCategory==='outpatient' && !supps.health_scl.outpatient) || (b.headerCategory==='dental' && !supps.health_scl.dental))) return;

                    let value = '—';
                    if (b.computeProg) value = b.computeProg(progData);
                    else if(b.text) value = b.text;
                    
                    if(b.headerCategory) {
                        tableHtml += `<tr><td colspan="3" style="background:#eee;font-weight:bold;">${b.labelBase}</td></tr>`;
                    } else {
                        tableHtml += `<tr><td>${b.labelBase}</td><td>${b.formulaLabel}</td><td style="text-align:right">${value}</td></tr>`;
                    }
                });
                
                tableHtml += '</tbody></table>';
                html += tableHtml;

            } else if (rid === 'hospital_support') {
                 const schema = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === 'HOSPITAL_SUPPORT');
                 let tableHtml = `<h4>${title}</h4><table><thead><tr><th>Quyền lợi</th><th style="width:20%">Số tiền/ngày</th></tr></thead><tbody>`;
                 const dailyBenefit = supps.hospital_support.stbh || 0;
                 schema.benefits.forEach(b => {
                     const value = b.computeDaily(dailyBenefit);
                     tableHtml += `<tr><td>${b.labelBase}</td><td style="text-align:right">${formatCurrency(value)}</td></tr>`;
                 });
                 tableHtml += '</tbody></table>';
                 html += tableHtml;
            } else if (rid === 'accident') {
                 const schema = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === 'ACCIDENT');
                 let tableHtml = `<h4>${title}</h4><table><thead><tr><th>Quyền lợi</th><th style="width:20%">Số tiền</th></tr></thead><tbody>`;
                 const stbh = supps.accident.stbh || 0;
                 schema.benefits.forEach(b => {
                     const value = b.computeRange(stbh);
                     tableHtml += `<tr><td>${b.labelBase}</td><td style="text-align:right">${value}</td></tr>`;
                 });
                 tableHtml += '</tbody></table>';
                 html += tableHtml;
            }
        });
    });
    return html;
}

function buildPart3ScheduleSection(data) {
    const { schedule, productKey, targetAge } = data;
    const pConfig = PRODUCT_CATALOG[productKey];
    const hasAccountValue = pConfig.accountValue?.enabled;
    const fmt = formatCurrency;
    const customRateDisplay = (parseFloat(document.getElementById('custom-interest-rate-input')?.value) || 0) + '%';
    
    let html = `<h3>Phần 4: Minh họa Phí & Giá trị tài khoản (đến năm ${targetAge} tuổi)</h3>`;
    html += `<table>
        <thead>
            <tr>
                <th rowspan="2">Năm HĐ</th>
                <th rowspan="2">Tuổi</th>
                <th rowspan="2">Tổng phí năm</th>
                ${hasAccountValue ? `<th colspan="3">Giá trị tài khoản cuối năm</th>` : ''}
            </tr>
            ${hasAccountValue ? `<tr><th>Lãi suất cam kết</th><th>Lãi suất ${customRateDisplay} (20 năm đầu)</th><th>Lãi suất ${customRateDisplay}</th></tr>` : ''}
        </thead>
        <tbody>`;
    
    schedule.forEach(r => {
        html += `<tr>
            <td style="text-align:center">${r.year}</td>
            <td style="text-align:center">${r.age}</td>
            <td style="text-align:right">${r.annualFee > 0 ? fmt(r.annualFee) : '—'}</td>
            ${hasAccountValue ? `<td style="text-align:right">${fmt(r.guaranteedVal)}</td><td style="text-align:right">${fmt(r.customValCapped)}</td><td style="text-align:right">${fmt(r.customValFull)}</td>` : ''}
        </tr>`;
    });
    
    html += `</tbody></table>`;
    
    // FIX: Add footer here to ensure it's always at the end
    const footerHtml = `
      <div style="font-size: 11px !important; color: #555; margin-top: 14px; padding-top: 10px; border-top: 1px solid #ddd;">
        <p style="margin: 2px 0;"><strong>Lưu ý:</strong></p>
        <ul style="margin: 0; padding-left: 18px;">
          <li>Bảng minh họa này không phải là hợp đồng bảo hiểm và chỉ có giá trị tham khảo.</li>
          <li>Các quyền lợi và điều khoản chi tiết sẽ được quy định trong Hợp đồng bảo hiểm chính thức do AIA Việt Nam phát hành.</li>
          <li>Giá trị tài khoản minh họa với lãi suất không cam kết không được đảm bảo và có thể thay đổi tùy thuộc vào kết quả đầu tư thực tế của Quỹ liên kết chung.</li>
        </ul>
      </div>`;
    html += footerHtml;
    
    return html;
}

function getProductLabel(key){
    return PRODUCT_CATALOG[key]?.name || key;
}

// ===================================================================================
// ===== WAIVER OF PREMIUM (MDP3) MODULE
// ===================================================================================
(function(window) {
    const MDP3 = {
        state: {
            selectedId: null, // can be main person ID, supp person ID, or 'other'
            isEnabled: false,
            otherPersonData: null,
            premium: 0,
            stbhBase: 0,
        },
        init: function() {
            this.buildHtml();
            this.attachListeners();
        },
        buildHtml: function() {
            const container = document.getElementById('waiver-of-premium-container');
            container.innerHTML = `
                <div class="space-y-4" id="mdp3-control-area">
                    <div>
                        <label for="mdp3-target" class="font-medium text-gray-700 block mb-1">Áp dụng cho</label>
                        <select id="mdp3-target" class="form-select"></select>
                    </div>
                    <div id="person-container-wop-other" class="hidden"></div>
                    <div>
                        <label class="flex items-center space-x-3 cursor-pointer">
                           <input type="checkbox" id="mdp3-enable" class="form-checkbox">
                           <span class="font-medium">Bật Miễn đóng phí 3.0</span>
                        </label>
                        <div id="mdp3-fee-display" class="text-right font-semibold text-aia-red min-h-[1.5rem]"></div>
                    </div>
                </div>
            `;
        },
        attachListeners: function() {
            document.getElementById('mdp3-target').addEventListener('change', () => {
                this.state.selectedId = document.getElementById('mdp3-target').value;
                document.getElementById('person-container-wop-other').classList.toggle('hidden', this.state.selectedId !== 'other');
                this.reset();
                runWorkflow();
            });
            document.getElementById('mdp3-enable').addEventListener('change', (e) => {
                this.state.isEnabled = e.target.checked;
                runWorkflow();
            });
        },
        updateOptions: function() {
            const select = document.getElementById('mdp3-target');
            const currentVal = select.value;
            select.innerHTML = '';
            
            appState.persons.forEach(p => {
                select.add(new Option(p.name, p.id));
            });
            select.add(new Option('Người khác', 'other'));
            
            if ([...select.options].some(o => o.value === currentVal)) {
                select.value = currentVal;
            } else {
                select.value = appState.persons[0].id;
                this.state.selectedId = select.value;
                document.getElementById('person-container-wop-other').classList.add('hidden');
            }
        },
        render: function(validationResult) {
            const { isValid, isMainProductSectionValid } = validationResult;
            const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
            const container = document.getElementById('mdp3-control-area');
            const checkbox = document.getElementById('mdp3-enable');

            const isDisabledByProduct = mainProductConfig?.rules?.noSupplementaryInsured;
            container.classList.toggle('opacity-50', isDisabledByProduct);
            container.querySelectorAll('select, input').forEach(el => el.disabled = isDisabledByProduct);

            if (!isDisabledByProduct) {
                checkbox.disabled = !isMainProductSectionValid;
            }
            
            const feeDisplay = document.getElementById('mdp3-fee-display');
            this.calculate();
            feeDisplay.textContent = this.state.premium > 0 ? `Phí: ${formatCurrency(this.state.premium)}` : '';
        },
        reset: function() {
            this.state.isEnabled = false;
            document.getElementById('mdp3-enable').checked = false;
        },
        calculate: function() {
            if (!this.state.isEnabled) {
                this.state.premium = 0;
                return;
            }
            const targetPerson = this.getTargetPersonInfo();
            if(!targetPerson || !checkEligibility(targetPerson, PRODUCT_CATALOG.mdp3.rules.eligibility)) {
                this.state.premium = 0;
                return;
            }
            
            const mainPremium = appState.fees.baseMain;
            const extraPremium = appState.fees.extra;
            let totalSuppAnualFee = 0;
            appState.persons.forEach(p => totalSuppAnualFee += (appState.fees.byPerson[p.id]?.supp || 0));
            this.state.stbhBase = mainPremium + extraPremium + totalSuppAnualFee;

            this.state.premium = PRODUCT_CATALOG.mdp3.calculation.calculate({
                customer: targetPerson,
                stbhBase: this.state.stbhBase
            });
        },
        getPremium: function(ageOverride = null) {
            if (!this.state.isEnabled) return 0;
            if (ageOverride) {
                 const targetPerson = this.getTargetPersonInfo();
                 const tempPerson = {...targetPerson, age: ageOverride };
                 return PRODUCT_CATALOG.mdp3.calculation.calculate({
                    customer: tempPerson,
                    stbhBase: this.state.stbhBase
                });
            }
            return this.state.premium;
        },
        getStbhBase: function() { return this.state.stbhBase; },
        isEnabled: function() { return this.state.isEnabled && this.state.premium > 0; },
        getSelectedId: function() { return this.state.selectedId; },
        getTargetPersonInfo: function() {
            const selectedId = document.getElementById('mdp3-target').value;
            if (selectedId === 'other') {
                 let otherContainer = document.getElementById('person-container-wop-other');
                 if(!otherContainer.innerHTML) {
                     const template = document.getElementById('supplementary-person-template').content.cloneNode(true);
                     otherContainer.appendChild(template);
                     otherContainer.querySelector('h3').textContent = 'Thông tin người được miễn đóng phí';
                     otherContainer.querySelector('.remove-supp-btn').remove();
                     otherContainer.querySelector('.supplementary-products-container').remove();
                     otherContainer.querySelector('h4').remove();
                     initDateFormatter(otherContainer.querySelector('.dob-input'));
                     initOccupationAutocomplete(otherContainer.querySelector('.occupation-input'), otherContainer);
                 }
                 this.state.otherPersonData = collectPersonData(otherContainer, false, true);
                 return this.state.otherPersonData;
            }
            return appState.persons.find(p => p.id === selectedId);
        },
        validate: function() {
            if (!this.state.isEnabled) return true;
            const targetPerson = this.getTargetPersonInfo();
            let ok = true;
            
            if (!targetPerson) return false;

            if (this.state.selectedId === 'other') {
                if (!validatePersonInputs(targetPerson)) ok = false;
            }
            
            if (!checkEligibility(targetPerson, PRODUCT_CATALOG.mdp3.rules.eligibility)) {
                setFieldError(document.getElementById('mdp3-target'), `Tuổi hợp lệ từ ${PRODUCT_CATALOG.mdp3.rules.eligibility[0].min} đến ${PRODUCT_CATALOG.mdp3.rules.eligibility[0].max}`);
                ok = false;
            } else {
                clearFieldError(document.getElementById('mdp3-target'));
            }
            return ok;
        }
    };
    window.MDP3 = MDP3;
})(window);
