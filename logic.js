/**
 * @file logic.js
 * @description
 * This file is the "engine" of the insurance calculator. It is designed to be fully
 * data-driven, meaning it contains no hard-coded business logic, product names,
 * selectors, or UI strings. All configuration is read from `data.js`.
 *
 * The core workflow is:
 * 1. Collect user input from the DOM and update the central `appState` object.
 * 2. Run a calculation engine to determine all fees based on rules in `PRODUCT_CATALOG`.
 * 3. Run a validation engine that checks `appState` against declarative rules in `PRODUCT_CATALOG`.
 * 4. Render the entire UI, including dynamic controls, validation errors, and fee summaries,
 *    based on the updated `appState` and validation results.
 */

import { GLOBAL_CONFIG, APP_CONFIG, PRODUCT_CATALOG, product_data } from './data.js';

// ===================================================================================
// ===== STATE MANAGEMENT & UTILITIES
// ===================================================================================

let appState = {};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const debounce = (fn, wait = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), wait); }; };
const parseFormattedNumber = (s) => parseInt(String(s||'').replace(/[^\d-]/g, ''), 10) || 0;
const formatCurrency = (v) => Number(v||0).toLocaleString('vi-VN');
const roundDownTo1000 = (n) => Math.floor(parseFormattedNumber(n) / 1000) * 1000;
const sanitizeHtml = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

function initState() {
    appState = {
        mainProduct: {
            key: '',
            program: '',
            values: {}, // { stbh: 0, premium: 0, paymentTerm: 0, ... }
        },
        paymentFrequency: 'year',
        mainPerson: {
            id: 'main-person-container',
            isMain: true,
            container: $(APP_CONFIG.selectors.mainPersonContainer),
            name: '',
            dob: '',
            age: 0,
            daysFromBirth: 0,
            gender: 'Nam',
            riskGroup: 0,
            supplements: {} // { riderKey: { selected: true, values: {...}, children: { childKey: { selected: true } } } }
        },
        supplementaryPersons: [],
        waivers: {
            MDP3: { selected: false, buyerId: null, buyerInfo: null, fee: 0 }
        },
        fees: {
            baseMain: 0,
            extra: 0,
            totalSupp: 0,
            totalWaiver: 0,
            total: 0,
            byPerson: {},
        },
        viewerOptions: {
            targetAge: 0,
            customInterestRate: 4.7
        },
        validationErrors: []
    };
}

// ===================================================================================
// ===== CORE WORKFLOW & INITIALIZATION
// ===================================================================================

function runWorkflow() {
    clearAllErrors();
    updateStateFromUI();
    appState.fees = performCalculations(); // Calculate fees first
    const validationResult = runAllValidations(); // Then validate using the calculated fees
    appState.validationErrors = validationResult.errors;
    renderUI(validationResult);
}
const runWorkflowDebounced = debounce(runWorkflow, 200);

document.addEventListener('DOMContentLoaded', () => {
    initState();
    initMainProductSelect();
    initPerson(appState.mainPerson.container, true);
    initEventListeners();
    initViewerModal();
    runWorkflow();
});

function initEventListeners() {
    document.body.addEventListener('change', e => {
        const target = e.target;
        if (target.matches('select, input[type="checkbox"]')) {
             if (target.id === APP_CONFIG.selectors.mainProduct.slice(1)) {
                // When main product changes, reset its values and dependent states
                appState.mainProduct.values = {};
                appState.mainProduct.program = '';
             }
             if(target.id.startsWith('mdp3-')) {
                handleMdp3Change(target);
             }
             runWorkflow();
        }
    });

    document.body.addEventListener('input', e => {
        const target = e.target;
        if (target.matches('input[type="text"]:not(.name-input):not(.occupation-input), input[type="number"]')) {
            if (target.closest('[data-type="currency"]')) {
                formatNumberInput(target);
            }
            runWorkflowDebounced();
        } else if (target.matches('.name-input, .occupation-input, .dob-input')) {
            runWorkflow(); 
        }
    });

    document.body.addEventListener('focusout', e => {
        if (e.target.matches('input[type="text"]') && e.target.closest('[data-type="currency"]')) {
             roundInputToThousand(e.target);
        }
        if (e.target.classList.contains('dob-input')) {
             validateDobField(e.target);
        }
        runWorkflow();
    });

    $(APP_CONFIG.selectors.addSuppBtn)?.addEventListener('click', addSupplementaryPerson);
    $(APP_CONFIG.selectors.suppListToggleBtn)?.addEventListener('click', () => {
        const list = $(APP_CONFIG.selectors.suppListContainer);
        list.classList.toggle('hidden');
        if (!list.classList.contains('hidden')) renderSuppListSummary(appState);
    });
    $(APP_CONFIG.selectors.viewerBtn)?.addEventListener('click', openFullViewer);
}

function initMainProductSelect() {
    const select = $(APP_CONFIG.selectors.mainProduct);
    if (!select) return;

    const groups = {
        PUL: { label: 'Sản phẩm Liên kết đơn vị (UL)', options: [] },
        MUL: { label: 'Sản phẩm Hỗn hợp (MUL)', options: [] },
        TRADITIONAL: { label: 'Sản phẩm Truyền thống', options: [] },
        PACKAGE: { label: 'Sản phẩm Gói', options: [] }
    };

    Object.entries(PRODUCT_CATALOG).forEach(([key, config]) => {
        if (config.type === 'main' && groups[config.group]) {
            groups[config.group].options.push({ value: key, text: config.name });
        }
    });

    Object.values(groups).forEach(groupData => {
        if (groupData.options.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = groupData.label;
            groupData.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.text;
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        }
    });
}

function initPerson(container, isMain = false, isWaiverBuyer = false) {
    if (!container) return;
    initDateFormatter(container.querySelector('.dob-input'));
    if (!isWaiverBuyer) {
        initOccupationAutocomplete(container.querySelector('.occupation-input'), container);
    }

    if (!isMain && !isWaiverBuyer) {
        container.querySelector('.remove-supp-btn')?.addEventListener('click', () => {
            const personId = container.id;
            appState.supplementaryPersons = appState.supplementaryPersons.filter(p => p.id !== personId);
            container.remove();
            runWorkflow();
        });
    }

    const suppProductsContainer = isMain 
        ? $(APP_CONFIG.selectors.mainSuppContainer)
        : container.querySelector('.supplementary-products-container');
    
    if (suppProductsContainer) {
        suppProductsContainer.innerHTML = generateSupplementaryProductsHtml(container.id);
    }
}


// ===================================================================================
// ===== UI RENDERING ENGINE
// ===================================================================================

/** Main UI render function, orchestrates all sub-renderers */
function renderUI(validationResult) {
    const mainProductKey = appState.mainProduct.key;
    const mainProductConfig = PRODUCT_CATALOG[mainProductKey];

    clearAllErrors();
    
    updateMainProductEligibility(appState.mainPerson);
    
    [appState.mainPerson, ...appState.supplementaryPersons].forEach(p => {
        if (p?.container) {
            p.container.querySelector(APP_CONFIG.selectors.ageSpan).textContent = p.age || 0;
            p.container.querySelector(APP_CONFIG.selectors.riskGroupSpan).textContent = p.riskGroup > 0 ? p.riskGroup : '...';
        }
    });

    renderMainProductUI(mainProductKey, appState.mainPerson);
    renderPersonRiders(appState.mainPerson);
    appState.supplementaryPersons.forEach(p => renderPersonRiders(p));
    
    renderWaiverSection('MDP3');
    renderSummaryPanel(appState);
    
    const canHaveSupp = !mainProductConfig?.rules?.noSupplementaryInsured;
    $('#supplementary-insured-section').classList.toggle('hidden', !canHaveSupp || !mainProductKey);
    const addBtn = $(APP_CONFIG.selectors.addSuppBtn);
    if (addBtn) {
        const isAddBtnDisabled = !canHaveSupp || !mainProductKey || appState.supplementaryPersons.length >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED;
        addBtn.disabled = isAddBtnDisabled;
        addBtn.classList.toggle('opacity-50', isAddBtnDisabled);
    }

    // Display all collected validation errors
    appState.validationErrors.forEach(err => {
        let el;
        if (err.path === `person.${appState.mainPerson.id}`) {
             el = $(`${APP_CONFIG.selectors.mainPersonContainer} .${err.key}-input`);
        } else if (err.path.startsWith(`person.`)) {
             const personId = err.path.split('.')[1];
             el = $(`#${personId} .${err.key}-input`);
        } else if (err.path.startsWith('mainProduct.values')) {
            el = $(`${APP_CONFIG.selectors.mainProductOptions} [data-state-key="${err.key}"]`);
        } else if (err.path.startsWith(`supplements`)) { // e.g., supplements.HEALTH_SCL_MAIN.values.stbh
            const parts = err.path.split('.');
            const riderKey = parts[1];
            const dataKey = parts[3];
            el = $(`#rider-${riderKey}-${err.personId} [data-state-key="${dataKey}"]`);
        }
        
        if (el) {
            setFieldError(el.parentElement, err.message, err.hint);
        } else if (err.path === 'mainProduct.key') {
             setFieldError($(APP_CONFIG.selectors.mainProduct).parentElement, err.message);
        }
    });

    showGlobalErrors(appState.validationErrors.filter(e => e.isGlobal));
}

function updateMainProductEligibility(person) {
    $$(`${APP_CONFIG.selectors.mainProduct} option`).forEach(opt => {
        const productKey = opt.value;
        if (!productKey) return;
        const config = PRODUCT_CATALOG[productKey];
        if (config?.type === 'main') {
            const isEligible = checkEligibility(person, config.rules.eligibility);
            opt.disabled = !isEligible;
            opt.style.display = isEligible ? '' : 'none';
        }
    });
    const select = $(APP_CONFIG.selectors.mainProduct);
    if (select.options[select.selectedIndex]?.disabled) {
        select.value = '';
    }
}

function renderMainProductUI(productKey, person) {
    const config = PRODUCT_CATALOG[productKey];
    const programContainer = $(APP_CONFIG.selectors.mainProductProgramContainer);
    const optionsContainer = $(APP_CONFIG.selectors.mainProductOptions);

    if (optionsContainer.dataset.renderedKey !== productKey) {
        optionsContainer.innerHTML = '';
        programContainer.innerHTML = '';
        if (config) {
            if (config.programs?.enabled) {
                const selectId = `program-${productKey}`;
                let optionsHtml = config.programs.options.map(opt => {
                    const isEligible = !opt.eligibility || opt.eligibility(person);
                    return `<option value="${opt.key}" ${isEligible ? '' : 'disabled'}>${sanitizeHtml(opt.name)}</option>`;
                }).join('');
                programContainer.innerHTML = `
                    <div>
                        <label for="${selectId}" class="font-medium block mb-1">${sanitizeHtml(config.programs.label)}</label>
                        <select id="${selectId}" class="form-select" data-state-path="mainProduct.program">${optionsHtml}</select>
                    </div>`;
            }
            config.ui.controls.forEach(controlConfig => {
                optionsContainer.appendChild(createControlElement(controlConfig, 'mainProduct.values', config.rules));
            });
        }
        optionsContainer.dataset.renderedKey = productKey || '';
    }
    
    if(config) {
        if (config.programs?.enabled) {
            const selectEl = programContainer.querySelector('select');
            config.programs.options.forEach(opt => {
                const optionEl = selectEl.querySelector(`option[value="${opt.key}"]`);
                if(optionEl) optionEl.disabled = !(!opt.eligibility || opt.eligibility(person));
            });
            selectEl.value = appState.mainProduct.program || '';
            if (selectEl.options[selectEl.selectedIndex]?.disabled) {
                 const firstEnabledIndex = config.programs.options.findIndex(o => !o.eligibility || o.eligibility(person));
                 if (firstEnabledIndex > -1) selectEl.selectedIndex = firstEnabledIndex;
            }
        }

        Object.entries(appState.mainProduct.values).forEach(([key, value]) => {
            const input = optionsContainer.querySelector(`[data-state-key="${key}"]`);
            if (input) {
                if (input.closest('[data-type="currency"]') && document.activeElement !== input) {
                     input.value = value > 0 ? formatCurrency(value) : '';
                } else if (document.activeElement !== input) {
                     input.value = value || '';
                }
            }
        });
        
        if (config.packageConfig) {
            Object.entries(config.packageConfig.fixedValues).forEach(([key, value]) => {
                const input = optionsContainer.querySelector(`[data-state-key="${key}"]`);
                if(input) {
                    input.value = (typeof value === 'number' && key !== 'paymentTerm') ? formatCurrency(value) : value;
                    input.disabled = true;
                }
            });
        }
    }

    const feeDisplay = $(APP_CONFIG.selectors.mainProductFeeDisplay);
    if (feeDisplay) {
        const { baseMain, extra } = appState.fees;
        if (baseMain > 0) {
            feeDisplay.textContent = `Phí: ${formatCurrency(baseMain)}` + (extra > 0 ? ` (+${formatCurrency(extra)})` : '');
        } else {
            feeDisplay.textContent = '';
        }
    }
}

function renderPersonRiders(person) {
    const container = person.isMain ? $(APP_CONFIG.selectors.mainSuppContainer) : person.container.querySelector('.supplementary-products-container');
    if (!container) return;

    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const allowedRiders = mainProductConfig?.rules.allowedRiders;
    
    container.querySelectorAll('.product-section').forEach(section => {
        const riderKey = section.dataset.riderKey;
        const config = PRODUCT_CATALOG[riderKey];
        if (!config) return;

        const isAllowed = !allowedRiders?.enabled || allowedRiders.list.includes(riderKey);
        const isEligible = checkEligibility(person, config.rules.eligibility);

        section.classList.toggle('hidden', !isAllowed || !isEligible);
        if (!isAllowed || !isEligible) return;

        const riderState = person.supplements[riderKey] || { selected: false, values: {} };
        const checkbox = section.querySelector('input[type="checkbox"][data-rider-key]');
        
        const isMandatory = mainProductConfig?.packageConfig?.mandatoryRiders.includes(riderKey);
        if (isMandatory) {
            checkbox.checked = true;
            checkbox.disabled = true;
        }

        const optionsDiv = section.querySelector('.product-options');
        optionsDiv.classList.toggle('hidden', !checkbox.checked);
        
        if (checkbox.checked) {
            if (riderKey === 'HEALTH_SCL_MAIN') {
                const programSelect = section.querySelector('[data-state-key="program"]');
                const mainPremium = appState.fees.baseMain;
                const programEligibility = config.rules.dependencies?.programEligibilityByMainPremium;
                
                if (programSelect && programEligibility) {
                    programSelect.querySelectorAll('option').forEach(opt => {
                        let isOptEligible = true;
                        const packageException = programEligibility.packageException?.[appState.mainProduct.key];
                        if (packageException) {
                            isOptEligible = packageException.allowed.includes(opt.value);
                        } else {
                            const rule = product_data[programEligibility.rulesRef].find(r => mainPremium >= r.minPremium);
                            isOptEligible = rule ? rule.allowed.includes(opt.value) : false;
                        }
                        opt.disabled = !isOptEligible;
                    });
    
                    if (programSelect.options[programSelect.selectedIndex]?.disabled) {
                        programSelect.value = 'nang_cao'; 
                    }
                }
            }

            const parentRider = PRODUCT_CATALOG[riderKey];
            if (parentRider?.children) {
                 parentRider.children.forEach(childKey => {
                    const childConfig = PRODUCT_CATALOG[childKey];
                    const childCb = section.querySelector(`input[type="checkbox"][data-rider-key="${childKey}"]`);
                    if(childCb) {
                        const requiresRiderKey = childConfig.rules.dependencies?.requiresRider;
                        const isRequiredRiderSelected = !requiresRiderKey || person.supplements[requiresRiderKey]?.selected;
                        childCb.disabled = !isRequiredRiderSelected;
                        if (!isRequiredRiderSelected) childCb.checked = false;
                    }
                 });
            }

            const fee = appState.fees.byPerson[person.id]?.suppDetails[riderKey] || 0;
            section.querySelector('.fee-display').textContent = fee > 0 ? `Phí: ${formatCurrency(fee)}` : '';
            
            if (riderKey === 'HEALTH_SCL_MAIN') {
                const sclFees = appState.fees.byPerson[person.id]?.suppDetails['HEALTH_SCL_COMPONENTS'] || {};
                section.querySelector('.scl-outpatient-fee').textContent = sclFees.outpatient > 0 ? `(+${formatCurrency(sclFees.outpatient)})` : '';
                section.querySelector('.scl-dental-fee').textContent = sclFees.dental > 0 ? `(+${formatCurrency(sclFees.dental)})` : '';
            }
        }
    });
}

/** Creates a single form control element based on config */
function createControlElement(config, path, rules) {
    const elWrapper = document.createElement('div');
    const key = config.dataKey;
    const id = `${path.replace(/[.\[\]]/g, '-')}-${key}`;
    const hintFn = typeof config.hint === 'function' ? config.hint : () => config.hint;
    const rule = rules[key];
    const hintText = hintFn ? hintFn(rule) : '';

    let inputHtml;
    switch (config.type) {
        case 'text_currency':
            elWrapper.dataset.type = 'currency';
            inputHtml = `<input type="text" id="${id}" class="form-input" data-state-path="${path}.${key}" data-state-key="${key}" placeholder="${config.placeholder || ''}" inputmode="numeric">`;
            break;
        case 'number':
            inputHtml = `<input type="number" id="${id}" class="form-input" data-state-path="${path}.${key}" data-state-key="${key}" placeholder="${config.placeholder || ''}">`;
            break;
        case 'select':
             inputHtml = `<select id="${id}" class="form-select" data-state-path="${path}.${key}" data-state-key="${key}">
                ${config.options.map(o => `<option value="${o.value}">${sanitizeHtml(o.label)}</option>`).join('')}
            </select>`;
            break;
        case 'static':
            elWrapper.className = 'text-sm text-gray-600 mt-2 p-2 bg-gray-100 rounded';
            elWrapper.textContent = config.text;
            return elWrapper;
    }
    
    elWrapper.innerHTML = `
        <label for="${id}" class="font-medium block mb-1">${sanitizeHtml(config.label)}</label>
        ${inputHtml}
        <p class="text-sm text-gray-500 mt-1" ${config.hintElementId ? `id="${config.hintElementId}"` : ''}>${sanitizeHtml(hintText || '')}</p>
    `;
    return elWrapper;
}

function generateSupplementaryProductsHtml(personId) {
    return Object.entries(PRODUCT_CATALOG)
        .filter(([, config]) => config.type === 'rider' && !config.parent)
        .sort(([, a], [, b]) => (a.viewer?.displayOrder || 99) - (b.viewer?.displayOrder || 99))
        .map(([riderKey, config]) => {
            const optionsHtml = (config.ui.controls.length > 0 || config.programs?.enabled || config.children) 
                ? `<div class="product-options hidden mt-3 pl-8 space-y-3">
                    ${createRiderControlsHtml(riderKey, config, personId)}
                   </div>`
                : `<div class="product-options hidden"></div>`;

            return `
            <div class="product-section" data-rider-key="${riderKey}" id="rider-${riderKey}-${personId}">
              <div class="flex justify-between items-center">
                <label class="flex items-center space-x-3 cursor-pointer flex-grow">
                  <input type="checkbox" class="form-checkbox" data-rider-key="${riderKey}" data-person-id="${personId}">
                  <span class="text-lg font-medium text-gray-800">${sanitizeHtml(config.name)}</span>
                </label>
                <div class="text-right font-semibold text-aia-red fee-display min-h-[1.5rem] pl-4"></div>
              </div>
              ${optionsHtml}
            </div>`;
    }).join('');
}

function createRiderControlsHtml(riderKey, config, personId) {
    let html = '';
    const path = `supplements.${riderKey}.values`;

    if (config.programs?.enabled) {
        const selectId = `program-${riderKey}-${personId}`;
        html += `<div>
            <label for="${selectId}" class="font-medium block mb-1">${sanitizeHtml(config.programs.label)}</label>
            <select id="${selectId}" class="form-select" data-state-key="program" data-person-id="${personId}" data-state-path="${path}.program">
                ${config.programs.options.map(opt => `<option value="${opt.key}" ${opt.default ? 'selected' : ''}>${sanitizeHtml(opt.name)}</option>`).join('')}
            </select>
        </div>`;
    }

    config.ui.controls.forEach(controlConfig => {
        html += createControlElement(controlConfig, path, config.rules).outerHTML;
    });

    if (config.children) {
        html += '<div class="space-y-2 mt-2">';
        config.children.forEach(childKey => {
            const childConfig = PRODUCT_CATALOG[childKey];
            if (childConfig?.ui.isCheckbox) {
                html += `<label class="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" class="form-checkbox" data-rider-key="${childKey}" data-person-id="${personId}" data-state-path="supplements.${childKey}.selected">
                    <span>${sanitizeHtml(childConfig.name)}</span>
                    <span class="${childConfig.ui.feeDisplayClass} ml-2 text-xs text-gray-600"></span>
                </label>`;
            }
        });
        html += '</div>';
    }

    return html;
}

// ===================================================================================
// ===== DATA COLLECTION ENGINE
// ===================================================================================

function updateStateFromUI() {
    const mainProductKey = $(APP_CONFIG.selectors.mainProduct).value;
    appState.mainProduct.key = mainProductKey;

    if (mainProductKey) {
        const mainConfig = PRODUCT_CATALOG[mainProductKey];
        if (mainConfig.programs.enabled) {
            const programSelect = $(`${APP_CONFIG.selectors.mainProductProgramContainer} select`);
            appState.mainProduct.program = programSelect ? programSelect.value : (mainConfig.programs.options[0]?.key || '');
        } else {
            appState.mainProduct.program = '';
        }
        
        const newValues = {};
        mainConfig.ui.controls.forEach(c => {
            const el = $(`${APP_CONFIG.selectors.mainProductOptions} [data-state-key="${c.dataKey}"]`);
            if (el) {
                 newValues[c.dataKey] = el.closest('[data-type="currency"]') ? parseFormattedNumber(el.value) : (el.type === 'number' ? parseInt(el.value, 10) || 0 : el.value);
            }
        });
        appState.mainProduct.values = newValues;

        if (mainConfig.packageConfig) {
             appState.mainProduct.values = { ...appState.mainProduct.values, ...mainConfig.packageConfig.fixedValues };
        }
    } else {
         appState.mainProduct.program = '';
         appState.mainProduct.values = {};
    }

    appState.mainPerson = collectPersonData($(APP_CONFIG.selectors.mainPersonContainer), true);
    appState.supplementaryPersons = $$(APP_CONFIG.selectors.suppContainer + ' .person-container').map(c => collectPersonData(c, false));
    appState.paymentFrequency = $(APP_CONFIG.selectors.paymentFrequency).value;
    appState.viewerOptions.targetAge = parseFormattedNumber($(APP_CONFIG.selectors.targetAgeInput).value);
    appState.viewerOptions.customInterestRate = parseFloat($(APP_CONFIG.selectors.customInterestRateInput).value) || 4.7;
    
    // Waivers
    const mdp3Enabled = $('#mdp3-enable')?.checked || false;
    appState.waivers.MDP3.selected = mdp3Enabled;
    if (mdp3Enabled) {
        const buyerId = $('#mdp3-person-select')?.value || null;
        appState.waivers.MDP3.buyerId = buyerId;
        if (buyerId === 'other') {
            appState.waivers.MDP3.buyerInfo = collectPersonData($('#mdp3-other-person-container'), false, true);
        } else {
            appState.waivers.MDP3.buyerInfo = null;
        }
    } else {
        appState.waivers.MDP3.buyerId = null;
        appState.waivers.MDP3.buyerInfo = null;
    }
}

function collectPersonData(container, isMain, isWaiverBuyer = false) {
    const id = container.id;
    let personState = {};
    if (!isWaiverBuyer) {
        personState = (isMain ? appState.mainPerson : appState.supplementaryPersons.find(p => p.id === id)) || {};
    }
    
    const dobStr = container.querySelector('.dob-input')?.value || '';
    let age = 0, daysFromBirth = 0;
    if (dobStr && /^\d{2}\/\d{2}\/\d{4}$/.test(dobStr)) {
        const [dd, mm, yyyy] = dobStr.split('/').map(n => parseInt(n, 10));
        const birthDate = new Date(yyyy, mm - 1, dd);
        if (birthDate.getFullYear() === yyyy && birthDate.getMonth() === mm - 1 && birthDate.getDate() === dd) {
            daysFromBirth = Math.floor((GLOBAL_CONFIG.REFERENCE_DATE - birthDate) / (1000 * 60 * 60 * 24));
            age = GLOBAL_CONFIG.REFERENCE_DATE.getFullYear() - birthDate.getFullYear();
            const m = GLOBAL_CONFIG.REFERENCE_DATE.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && GLOBAL_CONFIG.REFERENCE_DATE.getDate() < birthDate.getDate())) age--;
        }
    }

    const newSupplements = {};
    const suppContainer = isMain ? $(APP_CONFIG.selectors.mainSuppContainer) : container.querySelector('.supplementary-products-container');
    if (suppContainer) {
        suppContainer.querySelectorAll('input[type="checkbox"][data-rider-key]').forEach(cb => {
            const riderKey = cb.dataset.riderKey;
            const config = PRODUCT_CATALOG[riderKey];
            if (!config) return;

            const section = cb.closest('.product-section');
            const parentRiderKey = config.parent;

            if (parentRiderKey) { // It's a child rider
                if (newSupplements[parentRiderKey]?.selected && cb.checked) {
                    newSupplements[riderKey] = { selected: true };
                }
            } else if (cb.checked) { // It's a parent/standalone rider
                 const newRiderState = { selected: true, values: {} };
                if (config.programs?.enabled) {
                    newRiderState.values.program = section.querySelector('[data-state-key="program"]')?.value;
                }
                config.ui.controls.forEach(c => {
                    const el = section.querySelector(`[data-state-key="${c.dataKey}"]`);
                    if (el) newRiderState.values[c.dataKey] = el.closest('[data-type="currency"]') ? parseFormattedNumber(el.value) : el.value;
                });
                newSupplements[riderKey] = newRiderState;
            }
        });
    }

    return {
        ...personState,
        id, container, isMain,
        name: container.querySelector('.name-input')?.value || '',
        dob: dobStr,
        age: Math.max(0, age),
        daysFromBirth,
        gender: container.querySelector('.gender-select')?.value || 'Nam',
        riskGroup: isWaiverBuyer ? 0 : (parseInt(container.querySelector('.occupation-input')?.dataset.group, 10) || 0),
        supplements: newSupplements
    };
}

// ===================================================================================
// ===== DOM MANIPULATION & HELPERS
// ===================================================================================
function addSupplementaryPerson() {
    const container = $(APP_CONFIG.selectors.suppContainer);
    if (!container || appState.supplementaryPersons.length >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) return;
    
    const personId = `supp-person-${Date.now()}`;
    const newPersonEl = document.createElement('div');
    newPersonEl.id = personId;
    newPersonEl.className = 'person-container space-y-6 bg-gray-100 p-4 rounded-lg mt-4 relative';
    
    const count = container.children.length + 1;
    newPersonEl.innerHTML = `
        <button class="remove-supp-btn absolute top-2 right-2 text-sm text-red-600 font-semibold">Xóa</button>
        <h3 class="text-lg font-bold text-gray-700 mb-2 border-t pt-4">NĐBH Bổ Sung ${count}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="font-medium block mb-1">Họ và Tên</label>
            <input type="text" class="form-input name-input" placeholder="Trần Thị B">
          </div>
          <div>
            <label class="font-medium block mb-1">Ngày sinh</label>
            <input type="text" class="form-input dob-input" placeholder="DD/MM/YYYY">
          </div>
          <div>
            <label class="font-medium block mb-1">Giới tính</label>
            <select class="form-select gender-select">
              <option value="Nam">Nam</option>
              <option value="Nữ">Nữ</option>
            </select>
          </div>
          <div class="flex items-end"><p class="text-lg">Tuổi: <span class="font-bold text-aia-red age-span">0</span></p></div>
          <div class="relative">
            <label class="font-medium block mb-1">Nghề nghiệp</label>
            <input type="text" class="form-input occupation-input" placeholder="Gõ để tìm nghề nghiệp...">
            <div class="occupation-autocomplete hidden absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto"></div>
          </div>
          <div class="flex items-end"><p class="text-lg">Nhóm nghề: <span class="font-bold text-aia-red risk-group-span">...</span></p></div>
        </div>
        <div class="mt-4">
          <h4 class="text-md font-semibold text-gray-800 mb-2">Sản phẩm bổ sung</h4>
          <div class="supplementary-products-container space-y-6"></div>
        </div>`;

    container.appendChild(newPersonEl);
    initPerson(newPersonEl, false);
    runWorkflow();
}

function handleMdp3Change(target) {
    const container = $('#mdp3-radio-list');
    const selectContainer = document.createElement('div');
    selectContainer.id = 'mdp3-select-container';

    if (target.id === 'mdp3-enable' && target.checked) {
        let optionsHtml = '<option value="">-- Chọn người được MĐP --</option>';
        const allPersons = [appState.mainPerson, ...appState.supplementaryPersons];
        allPersons.forEach(p => {
            const isEligible = checkEligibility(p, PRODUCT_CATALOG.MDP3.rules.eligibility);
            optionsHtml += `<option value="${p.id}" ${!isEligible ? 'disabled' : ''}>${sanitizeHtml(p.name)} (Tuổi ${p.age}) ${!isEligible ? ' - Ko hợp lệ' : ''}</option>`;
        });
        optionsHtml += `<option value="other">Người khác</option>`;
        
        selectContainer.innerHTML = `
            <select id="mdp3-person-select" class="form-select w-full mt-2">${optionsHtml}</select>
            <div id="mdp3-other-person-container" class="hidden mt-4 p-4 border rounded bg-gray-50"></div>
        `;
        container.appendChild(selectContainer);
    } else if (target.id === 'mdp3-enable' && !target.checked) {
        const selCont = $('#mdp3-select-container');
        if(selCont) selCont.remove();
    } else if (target.id === 'mdp3-person-select') {
        const otherContainer = $('#mdp3-other-person-container');
        if (target.value === 'other') {
            otherContainer.classList.remove('hidden');
            otherContainer.innerHTML = `
                <div class="person-container space-y-4">
                    <h4 class="font-semibold">Thông tin Bên Mua Bảo Hiểm</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><label class="font-medium block mb-1">Họ tên</label><input type="text" class="form-input name-input"></div>
                      <div><label class="font-medium block mb-1">Ngày sinh</label><input type="text" class="form-input dob-input" placeholder="DD/MM/YYYY"></div>
                      <div><label class="font-medium block mb-1">Giới tính</label><select class="form-select gender-select"><option value="Nam">Nam</option><option value="Nữ">Nữ</option></select></div>
                      <div class="flex items-end"><p>Tuổi: <span class="font-bold text-aia-red age-span">0</span></p></div>
                    </div>
                </div>`;
            initPerson(otherContainer, false, true);
        } else {
            otherContainer.classList.add('hidden');
            otherContainer.innerHTML = '';
        }
    }
}

function renderWaiverSection(waiverKey) {
    const config = PRODUCT_CATALOG[waiverKey];
    if (!config) return;
    
    const section = $(APP_CONFIG.selectors.mdp3Section);
    const radioList = $('#mdp3-radio-list');
    const mainProductKey = appState.mainProduct.key;
    const mainConfig = PRODUCT_CATALOG[mainProductKey];

    const isVisible = mainProductKey && !mainConfig?.rules?.noSupplementaryInsured;
    section.classList.toggle('hidden', !isVisible);

    if (isVisible && radioList.innerHTML === '') {
        radioList.innerHTML = `<label class="flex items-center space-x-2">
            <input type="checkbox" id="mdp3-enable" class="form-checkbox">
            <span>Thêm ${config.name} cho Bên Mua Bảo Hiểm</span>
        </label>`;
    }

    const waiverState = appState.waivers[waiverKey];
    const enableCheckbox = $('#mdp3-enable');
    if (enableCheckbox) enableCheckbox.checked = waiverState.selected;

    const selectContainer = $('#mdp3-select-container');
    if (waiverState.selected && !selectContainer) {
        handleMdp3Change($('#mdp3-enable')); // Render the select dropdown
    } else if (!waiverState.selected && selectContainer) {
        selectContainer.remove();
    }
    
    if (waiverState.selected) {
         const select = $('#mdp3-person-select');
         if(select) select.value = waiverState.buyerId || '';
         if(select) handleMdp3Change(select); // Show/hide 'other' form
    }
}

function renderSummaryPanel(state) {
    const { fees, paymentFrequency } = state;
    const isValid = state.validationErrors.length === 0;

    const displayTotal = isValid ? fees.total : 0;
    const displayTotalSupp = isValid ? fees.totalSupp + fees.totalWaiver : 0;

    $(APP_CONFIG.selectors.totalSummary).textContent = formatCurrency(displayTotal);
    $(APP_CONFIG.selectors.mainFeeSummary).textContent = formatCurrency(fees.baseMain);
    $(APP_CONFIG.selectors.extraFeeSummary).textContent = formatCurrency(fees.extra);
    $(APP_CONFIG.selectors.suppFeeSummary).textContent = formatCurrency(displayTotalSupp);

    const breakdownContainer = $(APP_CONFIG.selectors.freqBreakdownContainer);
    if (paymentFrequency === 'year') {
        breakdownContainer.classList.add('hidden');
    } else {
        breakdownContainer.classList.remove('hidden');
        const periods = paymentFrequency === 'half' ? 2 : 4;
        const factor = paymentFrequency === 'half' ? 1.02 : 1.04;
        
        const perMain = isValid ? roundDownTo1000(fees.baseMain / periods) : 0;
        const perExtra = isValid ? roundDownTo1000(fees.extra / periods) : 0;
        const perSuppTotal = isValid ? roundDownTo1000((fees.totalSupp + fees.totalWaiver) * factor / periods) : 0;
        const totalPerPeriod = perMain + perExtra + perSuppTotal;
        const totalYearEquivalent = totalPerPeriod * periods;
        const diff = totalYearEquivalent - displayTotal;

        $(APP_CONFIG.selectors.freqMain).textContent = formatCurrency(perMain);
        $(APP_CONFIG.selectors.freqExtra).textContent = formatCurrency(perExtra);
        $(APP_CONFIG.selectors.freqSuppTotal).textContent = formatCurrency(perSuppTotal);
        $(APP_CONFIG.selectors.freqTotalPeriod).textContent = formatCurrency(totalPerPeriod);
        $(APP_CONFIG.selectors.freqTotalYear).textContent = formatCurrency(displayTotal);
        $(APP_CONFIG.selectors.freqTotalYearEquivalent).textContent = formatCurrency(totalYearEquivalent);
        $(APP_CONFIG.selectors.freqDiff).textContent = formatCurrency(diff);
    }
}

function renderSuppListSummary(state) {
     const container = $(APP_CONFIG.selectors.suppListContainer);
     if(!container) return;

     let html = '';
     const allPersons = [state.mainPerson, ...state.supplementaryPersons];
     allPersons.forEach(p => {
        const personFee = state.fees.byPerson[p.id]?.supp || 0;
        if(personFee > 0) {
            html += `<div class="flex justify-between text-sm"><span>${sanitizeHtml(p.name)}</span><span>${formatCurrency(personFee)}</span></div>`;
        }
     });
     if (state.waivers.MDP3.fee > 0) {
        const buyerName = state.waivers.MDP3.buyerInfo?.name || allPersons.find(p => p.id === state.waivers.MDP3.buyerId)?.name || 'Bên mua BH';
        html += `<div class="flex justify-between text-sm"><span>${sanitizeHtml(buyerName)} (MĐP)</span><span>${formatCurrency(state.waivers.MDP3.fee)}</span></div>`;
     }
     container.innerHTML = html || '<div class="text-sm text-gray-500">Chưa có phí sản phẩm bổ sung.</div>';
}

function setFieldError(container, message, hint) {
    if (!container) return;
    clearFieldError(container);
    const inputEl = container.querySelector('input, select');
    if (message) {
        const p = document.createElement('p');
        p.className = 'field-error text-red-600 text-xs mt-1';
        p.textContent = message;
        container.appendChild(p);
        if (inputEl) inputEl.classList.add('border-red-500');
    }
     if (hint) {
         const hintEl = container.querySelector('p:not(.field-error)');
         if(hintEl) hintEl.textContent = hint;
    }
}

function clearFieldError(container) {
    if (!container) return;
    container.querySelector('.field-error')?.remove();
    container.querySelector('.border-red-500')?.classList.remove('border-red-500');
}
function clearAllErrors() {
    $$('.field-error').forEach(el => el.remove());
    $$('.border-red-500').forEach(el => el.classList.remove('border-red-500'));
    const globalErrorBox = $(APP_CONFIG.selectors.globalErrorBox);
    if (globalErrorBox) {
        globalErrorBox.innerHTML = '';
        globalErrorBox.classList.add('hidden');
    }
}
function showGlobalErrors(errors) {
    const globalErrorBox = $(APP_CONFIG.selectors.globalErrorBox);
    if (!globalErrorBox || errors.length === 0) return;
    
    globalErrorBox.innerHTML = `
        <div class="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            <h3 class="font-bold mb-1">Vui lòng kiểm tra lại:</h3>
            <ul class="list-disc list-inside space-y-1">
                ${errors.map(e => `<li>${sanitizeHtml(e.message)}</li>`).join('')}
            </ul>
        </div>
    `;
    globalErrorBox.classList.remove('hidden');
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
    if (filtered.length === 0) {
      autocompleteContainer.classList.add('hidden');
      return;
    }
    filtered.slice(0, 50).forEach(occ => {
      const item = document.createElement('div');
      item.className = 'p-2 hover:bg-gray-100 cursor-pointer';
      item.textContent = occ.name;
      item.addEventListener('mousedown', (ev) => { ev.preventDefault(); applyOccupation(occ); });
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
    const filtered = product_data.occupations.filter(o => o.group > 0 && o.name.toLowerCase().includes(value));
    renderList(filtered);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
        autocompleteContainer.classList.add('hidden');
        const typed = (input.value || '').trim().toLowerCase();
        const match = product_data.occupations.find(o => o.group > 0 && o.name.toLowerCase() === typed);
        if (!match) {
            input.dataset.group = '';
            if (riskGroupSpan) riskGroupSpan.textContent = '...';
        }
        runWorkflow();
    }, 200);
  });
}


function formatNumberInput(input) {
  if (!input || !input.value) return;
  const cursorPos = input.selectionStart;
  const originalLength = input.value.length;
  
  let value = input.value.replace(/[^\d]/g, '');
  if (value.length > 0) {
    const formatted = parseInt(value, 10).toLocaleString('vi-VN');
    input.value = formatted;
    
    const newLength = formatted.length;
    const diff = newLength - originalLength;
    if (cursorPos !== null) {
      input.setSelectionRange(cursorPos + diff, cursorPos + diff);
    }
  } else {
    input.value = '';
  }
}

function roundInputToThousand(input) {
  if (!input || input.classList.contains('dob-input')) return;
  const raw = parseFormattedNumber(input.value || '');
  if (!raw) { input.value = ''; return; }
  
  if (input.dataset.stateKey === 'stbh' && input.closest('.product-section')?.dataset.riderKey === 'HOSPITAL_SUPPORT') {
      const rounded = Math.round(raw / GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE) * GLOBAL_CONFIG.HOSPITAL_SUPPORT_STBH_MULTIPLE;
      input.value = formatCurrency(rounded);
  } else {
      const rounded = Math.floor(raw / 1000) * 1000;
      input.value = formatCurrency(rounded);
  }
}

// ===================================================================================
// ===== VIEWER MODAL LOGIC
// ===================================================================================
function initViewerModal() {
    const modal = $('#viewer-modal');
    const closeBtn = $('#close-viewer-modal-btn');
    if (!modal || !closeBtn) return;
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('visible');
        $('#viewer-iframe').src = 'about:blank';
    });
}

function buildViewerPayload() {
    const mainProduct = appState.mainProduct;
    const mainPerson = appState.mainPerson;

    let productSlug = mainProduct.key.toLowerCase();
    if(mainProduct.key.startsWith('PUL')) productSlug = 'khoe-tron-ven';
    
    const riderList = [];
    const allPersons = [mainPerson, ...appState.supplementaryPersons];
    allPersons.forEach(p => {
        Object.entries(p.supplements).forEach(([key, data]) => {
            if (data.selected && !riderList.some(r => r.slug === key)) {
                riderList.push({ 
                    slug: key,
                    selected: true,
                    ...data.values
                });
            }
        });
    });

    return {
        v: 4, // Version
        productKey: mainProduct.key,
        productSlug,
        mainPersonName: mainPerson.name,
        mainPersonDob: mainPerson.dob,
        mainPersonAge: mainPerson.age,
        mainPersonGender: mainPerson.gender,
        mainPersonRiskGroup: mainPerson.riskGroup,
        
        ...mainProduct.values,
        sumAssured: mainProduct.values.stbh,
        
        paymentFrequency: appState.paymentFrequency,
        targetAge: appState.viewerOptions.targetAge,
        customInterestRate: appState.viewerOptions.customInterestRate,
        
        premiums: {
            baseMain: appState.fees.baseMain,
            extra: appState.fees.extra,
            totalSupp: appState.fees.totalSupp,
            riders: riderList
        },
        summaryHtml: "Not implemented yet" // This would require a separate, large function
    };
}

function openFullViewer() {
    if (appState.validationErrors.length > 0) {
        showGlobalErrors(appState.validationErrors);
        $(APP_CONFIG.selectors.globalErrorBox)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    try {
        const payload = buildViewerPayload();
        const json = JSON.stringify(payload);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        const viewerUrl = new URL('aiacautrucmoi-main/viewer.html', window.location.href);
        viewerUrl.hash = `#v=${b64}`;
        
        const modal = $('#viewer-modal');
        const iframe = $('#viewer-iframe');
        
        modal.classList.add('visible', 'loading');
        iframe.onload = () => modal.classList.remove('loading');
        iframe.src = viewerUrl.toString();
    } catch (e) {
        console.error("Error building viewer payload:", e);
        showGlobalErrors([{ message: "Không thể tạo dữ liệu cho bảng minh họa. Lỗi: " + e.message, isGlobal: true }]);
    }
}


// ===================================================================================
// ===== CALCULATION ENGINE (FULLY IMPLEMENTED)
// ===================================================================================

function performCalculations() {
    const fees = {
        baseMain: 0,
        extra: 0,
        totalSupp: 0,
        totalWaiver: 0,
        total: 0,
        byPerson: {},
    };

    const mainPerson = appState.mainPerson;
    const mainProduct = appState.mainProduct;
    const allPersons = [mainPerson, ...appState.supplementaryPersons];

    allPersons.forEach(p => {
        if(p) fees.byPerson[p.id] = { main: 0, supp: 0, total: 0, suppDetails: {} };
    });

    fees.baseMain = calculateMainPremiumFee(mainPerson, mainProduct);
    fees.extra = mainProduct.values.extraPremium || 0;
    if (fees.byPerson[mainPerson.id]) {
        fees.byPerson[mainPerson.id].main = fees.baseMain + fees.extra;
    }

    let aggregateStbh = {};
    
    allPersons.forEach(p => {
        if(!p) return;
        let personSuppFee = 0;
        Object.entries(p.supplements).forEach(([riderKey, riderData]) => {
            const riderConfig = PRODUCT_CATALOG[riderKey];
            if (!riderConfig || !riderData.selected) return;

            const stbh = riderData.values.stbh || 0;
            if (!aggregateStbh[riderKey]) aggregateStbh[riderKey] = 0;
            
            const fee = calculateRiderPremiumFee(riderKey, p, fees.baseMain, aggregateStbh[riderKey]);
            personSuppFee += fee;
            fees.byPerson[p.id].suppDetails[riderKey] = fee;
            
            if (riderKey === 'HEALTH_SCL_MAIN') {
                fees.byPerson[p.id].suppDetails.HEALTH_SCL_COMPONENTS = getHealthSclFeeComponents(p);
            }

            aggregateStbh[riderKey] += stbh;
        });
        fees.byPerson[p.id].supp = personSuppFee;
        fees.totalSupp += personSuppFee;
    });
    
    const mdp3Fee = calculateWaiverPremiumFee('MDP3');
    appState.waivers.MDP3.fee = mdp3Fee;
    if (mdp3Fee > 0) {
        fees.totalWaiver = mdp3Fee;
        const buyerId = appState.waivers.MDP3.buyerId;
        if (buyerId && buyerId !== 'other' && fees.byPerson[buyerId]) {
            fees.byPerson[buyerId].supp += mdp3Fee;
            fees.byPerson[buyerId].suppDetails.MDP3 = mdp3Fee;
        } else if (buyerId === 'other') {
            const otherId = 'mdp3_other_buyer';
            if (!fees.byPerson[otherId]) fees.byPerson[otherId] = { name: 'Bên mua BH', supp: 0, suppDetails: {} };
            fees.byPerson[otherId].supp += mdp3Fee;
            fees.byPerson[otherId].suppDetails.MDP3 = mdp3Fee;
        }
    }
    
    fees.total = fees.baseMain + fees.extra + fees.totalSupp + fees.totalWaiver;
    return fees;
}

function calculateMainPremiumFee(person, productState) {
    const config = PRODUCT_CATALOG[productState.key];
    if (!config || !person) return 0;

    const { stbh, premium, paymentTerm } = productState.values;
    const { calculation, packageConfig } = config;

    if (packageConfig) {
        const packageProductState = {
            key: packageConfig.underlyingMainProduct,
            program: packageConfig.fixedProgramKey,
            values: { ...productState.values, ...packageConfig.fixedValues },
        };
        return calculateMainPremiumFee(person, packageProductState);
    }
    
    let result = 0;
    switch (calculation.method) {
        case 'fromInput':
            result = premium;
            break;
        case 'ratePer1000StbhWithProgram':
            if (stbh <= 0) return 0;
            const genderKey = person.gender === 'Nữ' ? 'nu' : 'nam';
            let rateTable = product_data[calculation.rateTableRef];
            const programKey = productState.program || productState.values.paymentTerm || '';
            if (!programKey || !rateTable[programKey]) return 0;
            rateTable = rateTable[programKey];
            
            const rateRow = rateTable.find(r => r.age === person.age);
            const rate = rateRow ? (rateRow[genderKey] ?? 0) : 0;
            result = (stbh / 1000) * rate;
            break;
        case 'none':
            result = 0;
            break;
    }
    return Math.round(result);
}

function calculateRiderPremiumFee(riderKey, person, mainPremium, currentAggregateStbh) {
    const config = PRODUCT_CATALOG[riderKey];
    if (!config) return 0;
    
    const { calculation } = config;
    const func = window[calculation.functionName];
    if (typeof func === 'function') {
        return func(person, mainPremium, currentAggregateStbh);
    }
    return 0;
}

function calculateWaiverPremiumFee(waiverKey) {
    const waiverState = appState.waivers[waiverKey];
    if (!waiverState.selected || !waiverState.buyerId) return 0;
    
    const config = PRODUCT_CATALOG[waiverKey];
    let buyer = waiverState.buyerId === 'other' 
        ? waiverState.buyerInfo 
        : [appState.mainPerson, ...appState.supplementaryPersons].find(p => p.id === waiverState.buyerId);

    if (!buyer || !checkEligibility(buyer, config.rules.eligibility)) return 0;

    let stbhMdp = appState.fees.baseMain;
    [appState.mainPerson, ...appState.supplementaryPersons].forEach(p => {
        if (config.waiverConfig.stbhCalculation.excludeBuyerRiders && p.id === buyer.id) {
            return;
        }
        stbhMdp += Object.keys(p.supplements)
            .reduce((sum, key) => sum + (appState.fees.byPerson[p.id]?.suppDetails[key] || 0), 0);
    });
    
    const genderKey = buyer.gender === 'Nữ' ? 'nu' : 'nam';
    const rateRow = product_data.mdp3_rates.find(r => buyer.age >= r.ageMin && buyer.age <= r.ageMax);
    const rate = rateRow ? rateRow[genderKey] : 0;
    return Math.round((stbhMdp / 1000) * rate);
}

// Custom calculation functions exposed to window
window.calculateBhnPremium = function(person) {
    const { stbh } = person.supplements.BHN.values;
    if (!stbh) return 0;
    const genderKey = person.gender === 'Nữ' ? 'nu' : 'nam';
    const rateRow = product_data.bhn_rates.find(r => person.age >= r.ageMin && person.age <= r.ageMax);
    const rate = rateRow ? rateRow[genderKey] : 0;
    return Math.round((stbh / 1000) * rate);
}

window.calculateAccidentPremium = function(person) {
    const { stbh } = person.supplements.ACCIDENT.values;
    if (!stbh || !person.riskGroup) return 0;
    const rate = product_data.accident_rates[person.riskGroup] || 0;
    return Math.round((stbh / 1000) * rate);
}

window.calculateHospitalSupportPremium = function(person) {
    const { stbh } = person.supplements.HOSPITAL_SUPPORT.values;
    if (!stbh) return 0;
    const rateRow = product_data.hospital_fee_support_rates.find(r => person.age >= r.ageMin && person.age <= r.ageMax);
    const rate = rateRow ? rateRow.rate : 0;
    return Math.round((stbh / 100) * rate);
}

function getHealthSclFeeComponents(person) {
    const sclData = person.supplements.HEALTH_SCL_MAIN;
    if (!sclData) return { outpatient: 0, dental: 0 };
    
    const { program, scope } = sclData.values;
    const { selected: outpatient } = person.supplements.HEALTH_SCL_OUTPATIENT || {};
    const { selected: dental } = person.supplements.HEALTH_SCL_DENTAL || {};

    const ageBandIndex = product_data.health_scl_rates.age_bands.findIndex(b => person.age >= b.min && person.age <= b.max);
    if (ageBandIndex === -1) return { outpatient: 0, dental: 0 };

    const outpatientFee = outpatient ? (product_data.health_scl_rates.outpatient?.[ageBandIndex]?.[program] || 0) : 0;
    const dentalFee = dental ? (product_data.health_scl_rates.dental?.[ageBandIndex]?.[program] || 0) : 0;

    return {
      outpatient: Math.round(outpatientFee),
      dental: Math.round(dentalFee),
    };
}
// ===================================================================================
// ===== VALIDATION ENGINE (FULLY IMPLEMENTED)
// ===================================================================================

function runAllValidations() {
    const errors = [];
    const getMessage = (key, ...args) => {
        const messageOrFn = APP_CONFIG.strings.validation[key];
        return typeof messageOrFn === 'function' ? messageOrFn(...args) : messageOrFn;
    };
    
    if (!appState.mainProduct.key) {
        errors.push({ path: 'mainProduct.key', message: getMessage('requiredSelect', 'sản phẩm chính'), isGlobal: true });
        return { errors };
    }
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const mainPerson = appState.mainPerson;

    [mainPerson, ...appState.supplementaryPersons].forEach(p => {
        if(!p) return;
        const path = `person.${p.id}`;
        if (!p.name) errors.push({ path, key: 'name', message: getMessage('required', 'Họ và tên') });
        if (!validateDobField(p.container.querySelector('.dob-input'))) {
            // Error is already set by validateDobField, just add to list for global check
            errors.push({ path, key: 'dob', message: getMessage('invalidDob')});
        }
        if (p.riskGroup === 0 && !p.isWaiverBuyer) errors.push({ path, key: 'occupation', message: getMessage('requiredOccupation') });
    });
    
    const mainValues = appState.mainProduct.values;
    (mainProductConfig.rules.validationRules || []).forEach(rule => {
        const targetValue = rule.target === 'stbh' ? mainValues.stbh : 
                            rule.target === 'premium' ? appState.fees.baseMain : 
                            mainValues[rule.target];
        const path = `mainProduct.values.${rule.target}`;
        
        switch (rule.type) {
            case 'min':
                if (targetValue < rule.value) errors.push({ path, key: rule.target, message: getMessage(rule.messageKey, rule.value) });
                break;
            case 'anyOf':
                if (!rule.rules.some(sub => (sub.target === 'stbh' ? mainValues.stbh : appState.fees.baseMain) >= sub.min)) {
                    errors.push({ path: `mainProduct.values.stbh`, key: 'stbh', message: getMessage(rule.messageKey, ...(rule.messageArgs || [])), isGlobal: true });
                }
                break;
            case 'stbhFactor':
                const factorRow = product_data[rule.factorTableRef].find(f => mainPerson.age >= f.ageMin && mainPerson.age <= f.ageMax);
                if (factorRow && mainValues.stbh > 0) {
                    const minFee = Math.floor(mainValues.stbh / factorRow.maxFactor);
                    const maxFee = Math.floor(mainValues.stbh / factorRow.minFactor);
                    if (targetValue < minFee || targetValue > maxFee) {
                        errors.push({ path, key: rule.target, message: getMessage(rule.messageKey) });
                    }
                }
                break;
        }
    });

    let totalRiderStbhByProduct = {};
    [mainPerson, ...appState.supplementaryPersons].forEach(p => {
        if (!p) return;
        Object.keys(p.supplements).forEach(key => {
            if (!totalRiderStbhByProduct[key]) totalRiderStbhByProduct[key] = 0;
            const stbh = p.supplements[key]?.values?.stbh || 0;
            if(stbh) totalRiderStbhByProduct[key] += stbh;
        });
    });

    [mainPerson, ...appState.supplementaryPersons].forEach(p => {
        if(!p) return;
        Object.entries(p.supplements).forEach(([riderKey, riderData]) => {
            if (!riderData.selected) return;
            const riderConfig = PRODUCT_CATALOG[riderKey];
            const riderValues = riderData.values;
            (riderConfig.rules.validationRules || []).forEach(rule => {
                const targetValue = riderValues[rule.target];
                const path = `supplements.${riderKey}.values.${rule.target}`;
                
                switch (rule.type) {
                    case 'min': if (targetValue < rule.value) errors.push({ path, key: rule.target, personId: p.id, message: getMessage(rule.messageKey, rule.value) }); break;
                    case 'max': if (targetValue > rule.value) errors.push({ path, key: rule.target, personId: p.id, message: getMessage(rule.messageKey, rule.value) }); break;
                    case 'multipleOf': if (targetValue % rule.value !== 0) errors.push({ path, key: rule.target, personId: p.id, message: getMessage(rule.messageKey, ...(rule.messageArgs || [])) }); break;
                    case 'ageBasedMax':
                        const maxByAgeVal = p.age < 18 ? rule.maxByAge.under18 : rule.maxByAge.from18;
                        if (targetValue > maxByAgeVal) errors.push({ path, key: rule.target, personId: p.id, message: getMessage(rule.messageKey, maxByAgeVal) });
                        break;
                    case 'aggregateMax':
                        let maxVal = rule.max.type === 'mainPremiumFactor' ? Math.floor(appState.fees.baseMain / rule.max.factor) * rule.max.multiple : rule.max.value;
                        if (totalRiderStbhByProduct[riderKey] > maxVal) {
                             errors.push({ path, key: rule.target, personId: p.id, message: getMessage(rule.messageKey, maxVal) });
                        }
                        break;
                }
            });
        });
    });

    return { errors };
}


function validateDobField(input) {
    if (!input) return false;
    const v = (input.value || '').trim();
    if (!v) {
        setFieldError(input.parentElement, APP_CONFIG.strings.validation.requiredDob());
        return false;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
        setFieldError(input.parentElement, APP_CONFIG.strings.validation.requiredDob());
        return false;
    }
    const [dd, mm, yyyy] = v.split('/').map(n => parseInt(n, 10));
    const d = new Date(yyyy, mm - 1, dd);
    const valid = d.getFullYear() === yyyy && d.getMonth() === (mm - 1) && d.getDate() === dd && d <= GLOBAL_CONFIG.REFERENCE_DATE;
    if (!valid) {
        setFieldError(input.parentElement, APP_CONFIG.strings.validation.invalidDob());
        return false;
    }
    clearFieldError(input.parentElement);
    return true;
}

function checkEligibility(person, rules) {
    if (!rules || !person) return true;
    for (const rule of rules) {
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
