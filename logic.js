import { GLOBAL_CONFIG, PRODUCT_CATALOG, VIEWER_CONFIG } from './structure.js';
import { product_data, investment_data, BENEFIT_MATRIX_SCHEMAS } from './data.js';
import { debounce, parseFormattedNumber, formatCurrency, sanitizeHtml, roundDownTo1000, roundTo1000, roundUpTo1000, clearFieldError } from './utils.js';

// Import Engines
import { calculateAll } from './engines/calculationEngine.js';
import { runAllValidations } from './engines/validationEngine.js';
import { renderMainProductSection, renderSupplementaryProductsForPerson, renderWaiverSection, generateSupplementaryProductsHtml } from './engines/uiRenderEngine.js';

// Import Registries
import { UI_FUNCTIONS } from './registries/uiFunctions.js';
import { TARGET_AGE_REGISTRY } from './registries/targetAge.js';
import { CALC_REGISTRY } from './registries/calcRegistry.js';
import { RULE_ENGINE } from './registries/ruleEngine.js';

// ===================================================================================
// ===== STATE MANAGEMENT & WORKFLOW
// ===================================================================================
let productJustChanged = false; 
let appState = {};

function initState() {
    appState = {
        mainProduct: {
            key: '',
            values: {} 
        },
        paymentFrequency: 'year',
        persons: [],
        waiver: {
            selectedPersonId: '',
            enabledProducts: {}
        },
        fees: {
            baseMain: 0,
            extra: 0,
            totalMain: 0,
            totalSupp: 0,
            total: 0,
            byPerson: {},
            waiverDetails: {}
        },
        // Central context for registries and engines
        context: {
            product_data,
            helpers: {
                roundDownTo1000, roundTo1000, roundUpTo1000,
                formatCurrency
            },
            registries: {
                CALC_REGISTRY,
                UI_FUNCTIONS,
                TARGET_AGE_REGISTRY,
                RULE_ENGINE
            }
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

    if (!productJustChanged && mainProductConfig?.ui?.controls) {
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

    // Update waiver state
    appState.waiver.selectedPersonId = document.getElementById('waiver-person-select')?.value || '';
    appState.waiver.enabledProducts = {};
    document.querySelectorAll('.waiver-prod-checkbox:checked').forEach(cb => {
        appState.waiver.enabledProducts[cb.dataset.prodId] = true;
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
                        } else if (control.type === 'checkboxGroup') {
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
        riskGroup: parseInt(container.querySelector('.occupation-input')?.dataset.group, 10) || 0,
        supplements
    };
}

// ===================================================================================
// ===== UI RENDER (Top-level orchestrator)
// ===================================================================================

function renderUI(validationResult) {
    const { isMainProductSectionValid } = validationResult;
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const noSuppInsured = RULE_ENGINE.evaluateOr(mainProductConfig?.rules.noSupplementaryInsured, { state: appState, PRODUCT_CATALOG });

    document.getElementById('supplementary-insured-section').classList.toggle('hidden', noSuppInsured);
    document.getElementById('waiver-of-premium-section').classList.toggle('hidden', noSuppInsured);

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
    
    renderMainProductSection(appState);
    appState.persons.forEach(p => renderSupplementaryProductsForPerson(p, appState, isMainProductSectionValid));
    renderWaiverSection(appState, isMainProductSectionValid);
    renderSummary(isMainProductSectionValid);
    updateSupplementaryAddButtonState(isMainProductSectionValid);
    updatePaymentFrequencyOptions(appState.fees.baseMain);
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

    const perMain = roundUpTo1000(baseMain / periods);
    const perExtra = roundUpTo1000(extra / periods);
    
    let perSupp = 0;
    let annualEquivalentTotal = (perMain + perExtra) * periods;
    
    Object.values(appState.fees.byPerson).forEach(personData => {
        Object.values(personData.suppDetails).forEach(annualFee => {
            const perPeriodFee = roundTo1000((annualFee * factor) / periods);
            perSupp += perPeriodFee;
            annualEquivalentTotal += perPeriodFee * periods;
        });
    });

    const perTotal = perMain + perExtra + perSupp;
    const diff = annualEquivalentTotal - annualOriginal;

    const set = (id, val) => { document.getElementById(id).textContent = formatCurrency(val); };
    set('freq-main', perMain);
    set('freq-extra', perExtra);
    set('freq-supp-total', perSupp);
    set('freq-total-period', perTotal);
    set('freq-total-year', annualOriginal);
    set('freq-diff', diff);
    set('freq-total-year-equivalent', annualEquivalentTotal);
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
    initWaiverSection();
    attachGlobalListeners();
    runWorkflow();
});

function runWorkflow() {
  updateStateFromUI();
  const validationResult = runAllValidations(appState);
  appState.fees = calculateAll(appState);
  renderUI(validationResult);
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
            const oldStbh = appState.mainProduct.values['main-stbh'] || 0;

            productJustChanged = true;
            appState.mainProduct.values = {};
            
            // Force reset target age input when product changes
            const targetAgeInput = document.getElementById('target-age-input');
            if (targetAgeInput) targetAgeInput.value = '';

            const newProductKey = e.target.value;
            const newProductConfig = PRODUCT_CATALOG[newProductKey];

            const hasFixedStbh = newProductConfig?.group === 'PACKAGE' && newProductConfig.packageConfig?.fixedValues?.stbh;
            const hasStbhInput = newProductConfig?.ui?.controls.some(c => c.id === 'main-stbh' && c.type === 'currencyInput' && !c.disabled);

            if (!hasFixedStbh && hasStbhInput && oldStbh > 0) {
                appState.mainProduct.values['main-stbh'] = oldStbh;
            }
            
            if (RULE_ENGINE.evaluateOr(newProductConfig?.rules.noSupplementaryInsured, { state: appState, PRODUCT_CATALOG })) {
                document.getElementById('supplementary-insured-container').innerHTML = '';
                document.querySelectorAll('#main-supp-container .supplementary-products-container input[type=checkbox]').forEach(cb => cb.checked = false);
                
                const mainPerson = appState.persons.find(p => p.isMain);
                if (mainPerson) mainPerson.supplements = {};
            }
            runWorkflow();
            productJustChanged = false;

        } else if (e.target.matches('input[type="checkbox"]') && !e.target.classList.contains('waiver-prod-checkbox')) {
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
        suppProductsContainer.innerHTML = generateSupplementaryProductsHtml(appState);
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
    
    const noSupps = RULE_ENGINE.evaluateOr(mainProductConfig?.rules.noSupplementaryInsured, { state: appState, PRODUCT_CATALOG });

    const disabled = noSupps || 
                     (count >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) || 
                     !isMainProductValid;
                     
    btn.disabled = disabled;
    btn.classList.toggle('opacity-50', disabled);
    btn.classList.toggle('cursor-not-allowed', disabled);
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
    input.dataset.isChild = !!occ.isChild; 
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
    
    if (!value) {
        input.dataset.group = '0';
        if (riskGroupSpan) riskGroupSpan.textContent = '...';
        // runWorkflow(); // This can be removed to avoid validation firing on every keystroke deletion
    }
    
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
    // If the input is cleared, reset the risk group
    if (!input.value.trim()) {
        input.dataset.group = '0';
        if (riskGroupSpan) riskGroupSpan.textContent = '...';
        runWorkflow(); // Trigger re-validation
    }
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
    if (!raw) {
        input.value = '';
        return;
    }

    const controlId = input.id;
    let prodKey = null;

    if (controlId.includes('-')) { // Rider product
        prodKey = Object.keys(PRODUCT_CATALOG).find(key => controlId.startsWith(key + '-'));
    } else { // Main product
        prodKey = appState.mainProduct.key;
    }

    let controlConfig = null;
    if (prodKey && PRODUCT_CATALOG[prodKey]) {
        controlConfig = PRODUCT_CATALOG[prodKey].ui?.controls.find(c => c.id === controlId);
    }

    const transformerKey = controlConfig?.valueTransformerKey || 'roundToThousand';
    const transformerFunc = UI_FUNCTIONS.valueTransformers[transformerKey];

    if (transformerFunc) {
        input.value = formatCurrency(transformerFunc(raw));
    } else {
        input.value = formatCurrency(roundDownTo1000(raw)); // Fallback
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
    const hintEl = document.getElementById('target-age-hint');
    if (!targetAgeInput || !mainPerson || !productConfig?.targetAgeConfig) {
        if (targetAgeInput) {
            targetAgeInput.disabled = true;
            targetAgeInput.value = '';
        }
        if (hintEl) hintEl.innerHTML = '';
        return;
    }

    const config = productConfig.targetAgeConfig;
    const ctx = { mainPerson, values: appState.mainProduct.values, state: appState };
    targetAgeInput.disabled = !config.isEditable;
    
    const calculatedValue = TARGET_AGE_REGISTRY.resolveValue(config.valueKey, { ...ctx, params: config.valueParams });

    if (!config.isEditable) {
        targetAgeInput.value = calculatedValue;
    } else {
        const currentValue = parseInt(targetAgeInput.value, 10);
        if (productJustChanged || isNaN(currentValue) || currentValue <= 0) {
           targetAgeInput.value = calculatedValue;
        }
    }
    if (hintEl) {
        hintEl.innerHTML = TARGET_AGE_REGISTRY.resolveHint(config.hintKey, ctx) || '';
    }
}

function updatePaymentFrequencyOptions(baseMainAnnual) {
    const sel = document.getElementById('payment-frequency');
    if (!sel) return;
    const optHalf = sel.querySelector('option[value="half"]');
    const optQuarter = sel.querySelector('option[value="quarter"]');
    
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const rules = mainProductConfig?.rules?.paymentFrequencyRules || GLOBAL_CONFIG.PAYMENT_FREQUENCY_THRESHOLDS;

    const allowHalf = baseMainAnnual >= rules.half;
    const allowQuarter = baseMainAnnual >= rules.quarter;

    if (optHalf) optHalf.style.display = allowHalf ? '' : 'none';
    if (optQuarter) optQuarter.style.display = allowQuarter ? '' : 'none';
  
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

function renderSuppListSummary() {
  const box = document.getElementById('supp-insured-summaries');
  if (!box) return;

  const getPersonName = (id) => {
    if (id === GLOBAL_CONFIG.WAIVER_OTHER_PERSON_ID) {
        const waiverOtherDetails = Object.values(appState.fees.waiverDetails).find(d => d.targetPerson.id === GLOBAL_CONFIG.WAIVER_OTHER_PERSON_ID);
        if (waiverOtherDetails) {
            const personData = waiverOtherDetails.targetPerson;
            return (personData.name && personData.name !== 'Người khác') ? personData.name : GLOBAL_CONFIG.LABELS.POLICY_OWNER;
        }
        return GLOBAL_CONFIG.LABELS.POLICY_OWNER;
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
    viewerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        runWorkflow(); 
        setTimeout(() => {
            const validationResult = runAllValidations(appState);
            if (!validationResult.isValid) {
                showGlobalErrors(validationResult.errors);
                document.getElementById('global-error-box').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            openFullViewer();
        }, 50);
    });
    
    document.getElementById('close-viewer-modal-btn').addEventListener('click', () => {
      const modal = document.getElementById('viewer-modal');
      const iframe = document.getElementById('viewer-iframe');
      modal.classList.remove('visible');
      iframe.src = 'about:blank';
    });
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
        alert('Không tạo được dữ liệu để mở bảng minh họa.\n\nLỗi: ' + e.message);
    }
}

// ===================================================================================
// ===== WAIVER LOGIC (now simpler, delegates to engines)
// ===================================================================================

function initWaiverSection() {
    const container = document.getElementById('waiver-of-premium-container');
    if (!container) return;
    
    container.innerHTML = `
        <div>
            <label for="waiver-person-select" class="font-medium text-gray-700 block mb-1">Áp dụng cho</label>
            <select id="waiver-person-select" class="form-select w-full"></select>
        </div>
        <div id="waiver-other-form" class="hidden mt-4 p-3 border rounded bg-gray-50"></div>
        <div id="waiver-products-list" class="hidden mt-4 space-y-4"></div>
        <div id="waiver-fee-display" class="text-right font-semibold text-aia-red min-h-[1.5rem] mt-2"></div>
    `;

    const otherFormWrapper = document.getElementById('waiver-other-form');
    const template = document.getElementById('supplementary-person-template');
    if (!otherFormWrapper || !template) return;
    
    const clone = template.content.cloneNode(true);
    clone.querySelector('.remove-supp-btn')?.remove();
    clone.querySelector('.supplementary-products-container')?.parentElement.remove();

    const newContainer = clone.querySelector('.person-container');
    newContainer.id = `person-container-waiver-other-form`;
    newContainer.classList.remove('bg-gray-100', 'p-4', 'mt-4');
    newContainer.querySelector('h3').textContent = 'Thông tin Bên mua bảo hiểm';
    otherFormWrapper.appendChild(clone);
    
    const newFormEl = document.getElementById(newContainer.id);
    if (newFormEl) {
        initDateFormatter(newFormEl.querySelector('.dob-input'));
        initOccupationAutocomplete(newFormEl.querySelector('.occupation-input'), newFormEl);
    }

    // Attach listeners
    document.body.addEventListener('change', (e) => {
        const target = e.target;
        if (target.id === `waiver-person-select`) {
            appState.waiver.enabledProducts = {}; // Reset product selection when person changes
            runWorkflow();
        }
    });
}

// ===================================================================================
// ===== LOGIC TẠO BẢNG MINH HỌA (PORTED FROM V1)
// ===================================================================================

function resolveRiderStbh(rid, person) {
    const prodConfig = PRODUCT_CATALOG[rid];
    const data = person.supplements[rid] || {};
    if (prodConfig?.stbhKey) {
        const [resolver, param] = prodConfig.stbhKey.split(':');
        const resolverFunc = appState.context.registries.UI_FUNCTIONS?.stbh?.[resolver];
        if (resolverFunc) {
            return resolverFunc({ person, data, productConfig: prodConfig, params: { ...prodConfig.stbhKeyParams, controlId: param }, state: appState }) || 0;
        }
    }
    return data.stbh || 0;
}

function resolveRiderDisplayName(rid, person) {
    const prodConfig = PRODUCT_CATALOG[rid];
    const data = person.supplements[rid] || {};
    if (prodConfig?.displayNameKey) {
        const resolverFunc = appState.context.registries.UI_FUNCTIONS.displayName[prodConfig.displayNameKey];
        if (resolverFunc) {
            return resolverFunc({ person, data, state: appState });
        }
    }
    return getProductLabel(rid);
}


function buildViewerPayload() {
  const mainPerson = appState.persons.find(p => p.isMain);
  const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];

  const riderList = [];
  appState.persons.forEach(person => {
    Object.keys(person.supplements).forEach(rid => {
      const premiumDetail = appState.fees.byPerson[person.id]?.suppDetails?.[rid] || 0;
      if (premiumDetail > 0 && !riderList.some(r => r.slug === rid)) { // FIX: Prevent duplicate images
        const data = person.supplements[rid];
        riderList.push({
          slug: rid, 
          selected: true,
          stbh: resolveRiderStbh(rid, person),
          program: data.program, scope: data.scope, outpatient: !!data.outpatient, dental: !!data.dental,
          premium: premiumDetail
        });
      }
    });
  });

  // Handle WOP products for the payload
  Object.entries(appState.fees.waiverDetails || {}).forEach(([waiverProductId, waiverData]) => {
      const { premium } = waiverData;
      if (premium > 0) {
          riderList.push({ 
              slug: waiverProductId, 
              selected: true, 
              stbh: 0, 
              premium: premium 
          });
      }
  });
  
  const summaryHtml = __exportExactSummaryHtml();
  
  let paymentTerm = 0;
  if (mainProductConfig?.paymentTermKey) {
      paymentTerm = RULE_ENGINE.resolveFieldByKey(mainProductConfig.paymentTermKey, { values: appState.mainProduct.values }) || 0;
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
    paymentTerm,
    targetAge: parseInt(document.getElementById('target-age-input')?.value, 10),
    customInterestRate: document.getElementById('custom-interest-rate-input')?.value,
    premiums: { 
        baseMain: appState.fees.baseMain,
        extra: appState.fees.extra,
        totalSupp: appState.fees.totalSupp,
        riders: riderList
    },
    summaryHtml: summaryHtml
  };
}


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
    if (productConfig?.paymentTermKey) {
        paymentTerm = parseInt(RULE_ENGINE.resolveFieldByKey(productConfig.paymentTermKey, { values: appState.mainProduct.values }) || '0', 10);
    }
    
    let targetAge = parseInt(document.getElementById('target-age-input')?.value, 10) || 0;
    if (!targetAge && mainPerson && paymentTerm > 0) {
      targetAge = mainPerson.age + paymentTerm -1;
    }

    const allPersonsForSummary = JSON.parse(JSON.stringify(appState.persons));
    const waiverPremiums = appState.fees.waiverDetails || {};

    // Augment person data with selected waivers for unified processing
    const waiverOtherPersons = [];
    Object.entries(waiverPremiums).forEach(([waiverId, waiverData]) => {
        const { premium, targetPerson } = waiverData;
        if (premium > 0 && targetPerson) {
            let personForWaiver = allPersonsForSummary.find(p => p.id === targetPerson.id);
            if (!personForWaiver && targetPerson.id === GLOBAL_CONFIG.WAIVER_OTHER_PERSON_ID) {
                personForWaiver = {
                    ...targetPerson,
                    isMain: false,
                    supplements: {}
                };
                waiverOtherPersons.push(personForWaiver);
            }
            if(personForWaiver) {
               personForWaiver.supplements[waiverId] = {}; // Add placeholder for iteration
            }
        }
    });

    allPersonsForSummary.push(...waiverOtherPersons);

    const part1 = buildPart1RowsData({ persons: allPersonsForSummary, productKey, paymentTerm, targetAge, riderFactor, periods, isAnnual, waiverPremiums, freq });
    const schedule = buildPart2ScheduleRows({ persons: allPersonsForSummary, mainPerson, paymentTerm, targetAge, periods, isAnnual, riderFactor, productKey, waiverPremiums, appState });
    
    const summary = { freq, periods, isAnnual, riderFactor, productKey, paymentTerm, targetAge, mainPerson, persons: allPersonsForSummary, waiverPremiums, part1, schedule, projection: null, sums: {} };
    
    if (productConfig?.accountValue?.calculateProjection) {
        const customRateInput = document.getElementById('custom-interest-rate-input')?.value || '4.7';
        summary.customRate = customRateInput;
        summary.projection = productConfig.accountValue.calculateProjection(
            productConfig,
            {
                mainPerson: appState.persons.find(p => p.isMain),
                mainProduct: appState.mainProduct,
                basePremium: appState.fees.baseMain,
                extraPremium: appState.mainProduct.values['extra-premium'],
                targetAge: summary.targetAge,
                customInterestRate: customRateInput,
                paymentFrequency: summary.freq,
            },
            { investment_data, roundTo1000, GLOBAL_CONFIG }
        );
    }
    
    // Pre-calculate sums for footer
    const activePersonIdx = summary.persons.map((p, i) => summary.schedule.rows.some(r => (r.perPersonSuppAnnualEq[i] || 0) > 0) ? i : -1).filter(i => i !== -1);
    summary.schedule.activePersonIdx = activePersonIdx;

    const sums = { main: 0, extra: 0, supp: activePersonIdx.map(() => 0), totalBase: 0, totalEq: 0, diff: 0 };
    summary.schedule.rows.forEach(r => {
        sums.main += r.mainYearBase;
        sums.extra += r.extraYearBase;
        sums.totalBase += r.totalYearBase;
        sums.totalEq += r.totalAnnualEq;
        sums.diff += r.diff;
        activePersonIdx.forEach((pIdx, idx) => sums.supp[idx] += r.perPersonSuppAnnualEq[pIdx]);
    });
    summary.sums = sums;

    return summary;
}

function buildPart1RowsData(ctx) {
    const { persons, productKey, paymentTerm, targetAge, riderFactor, periods, isAnnual, waiverPremiums, freq } = ctx;
    const mainPerson = persons.find(p => p.isMain);
    const mainAge = mainPerson?.age || 0;
    const riderMaxAge = (key) => (PRODUCT_CATALOG[key]?.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 64);

    let rows = [], perPersonTotals = [], grand = { per: 0, eq: 0, base: 0, diff: 0 };
    
    const pushRow = (acc, personName, prodName, stbhDisplay, years, baseAnnual, isRider) => {
        if (baseAnnual <= 0) return;
        let perPeriod = 0, annualEq = 0, diff = 0;
        if (!isAnnual) {
            if (isRider) {
                perPeriod = roundTo1000((baseAnnual * riderFactor) / periods);
                annualEq = perPeriod * periods;
                diff = annualEq - baseAnnual;
            } else {
                perPeriod = roundUpTo1000(baseAnnual / periods);
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
            let productName = getProductLabel(productKey);
            const baseAnnual = appState.fees.baseMain;
            const mainProductConfig = PRODUCT_CATALOG[productKey];

            if (mainProductConfig.group === 'PACKAGE') {
                const underlyingConfig = PRODUCT_CATALOG[mainProductConfig.packageConfig.underlyingMainProduct];
                if(underlyingConfig) productName = underlyingConfig.name;
            }

            const stbhVal = appState.mainProduct.values['main-stbh'] || mainProductConfig.packageConfig?.fixedValues.stbh;
            if (baseAnnual > 0) {
                pushRow(acc, p.name, productName, formatCurrency(stbhVal), paymentTerm || '—', baseAnnual, false);
            }
        }
        if (p.isMain && (appState.mainProduct.values['extra-premium'] || 0) > 0) {
            pushRow(acc, p.name, GLOBAL_CONFIG.LABELS.EXTRA_PREMIUM, '—', paymentTerm || '—', appState.mainProduct.values['extra-premium'] || 0, false);
        }
        
        if (p.supplements) {
            for (const rid in p.supplements) {
                const prodConfig = PRODUCT_CATALOG[rid];
                if (!prodConfig) continue;

                const baseAnnual = appState.fees.byPerson[p.id]?.suppDetails?.[rid] || 0;
                if (baseAnnual <= 0) continue;
                
                let stbh = 0, prodName = '', years = 0, stbhDisplay = '—';
                const isWaiver = prodConfig.category === 'waiver';

                if (isWaiver) {
                    const waiverData = waiverPremiums[rid];
                    stbh = waiverData.stbhBase;
                    prodName = prodConfig.name;
                    const resolverKey = prodConfig.waiverTermKey;
                    const resolverFunc = resolverKey && appState.context.registries.CALC_REGISTRY.waiverResolvers[resolverKey];
                    if (resolverFunc) {
                        years = resolverFunc({ waiverHolder: p, mainInsured: mainPerson, targetAge, productConfig: prodConfig });
                    }
                } else {
                    const maxA = riderMaxAge(rid);
                    years = Math.max(0, Math.min(maxA - p.age, targetAge - mainAge) + 1);
                    stbh = resolveRiderStbh(rid, p);
                    prodName = resolveRiderDisplayName(rid, p);
                }
                
                stbhDisplay = stbh ? formatCurrency(stbh) : '—';
                pushRow(acc, p.name, prodName, stbhDisplay, years, baseAnnual, true);
            }
        }
        
        if (acc.base > 0) {
            perPersonTotals.push({ personName: p.name, ...acc });
            grand.per += acc.per; grand.eq += acc.eq; grand.base += acc.base; grand.diff += acc.diff;
        }
    });

    return { rows, perPersonTotals, grand, isAnnual, periods, riderFactor, freqLabel: GLOBAL_CONFIG.PAYMENT_FREQUENCY_LABELS[freq] || freq };
}

function buildPart2ScheduleRows(ctx) {
    const { persons, mainPerson, paymentTerm, targetAge, periods, isAnnual, riderFactor, waiverPremiums, appState } = ctx;
    const riderMaxAge = (key) => (PRODUCT_CATALOG[key]?.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 64);
    const rows = [];
    const baseMainAnnual = appState?.fees?.baseMain || 0;
    const extraAnnual = appState.mainProduct.values['extra-premium'] || 0;
    
    const fixedWaiverPremiums = {};
    Object.entries(waiverPremiums).forEach(([waiverId, waiverData]) => {
        if (waiverData.premium > 0 && waiverData.targetPerson) {
            fixedWaiverPremiums[waiverData.targetPerson.id] = fixedWaiverPremiums[waiverData.targetPerson.id] || {};
            fixedWaiverPremiums[waiverData.targetPerson.id][waiverId] = waiverData.premium;
        }
    });

    for (let year = 1; mainPerson.age + year - 1 <= targetAge; year++) {
        const currentAge = mainPerson.age + year - 1;
        const inTerm = year <= paymentTerm;
        const mainYearBase = inTerm ? baseMainAnnual : 0;
        const extraYearBase = inTerm ? extraAnnual : 0;
        const perPersonSuppBase = [], perPersonSuppPerPeriod = [], perPersonSuppAnnualEq = [];

        persons.forEach(p => {
            let sumBase = 0, sumPer = 0;
            const attained = p.age + year - 1;
            
            const addRider = (baseFee) => {
                if (!baseFee) return;
                sumBase += baseFee;
                if (!isAnnual) sumPer += roundTo1000((baseFee * riderFactor) / periods);
            };

            if (p.supplements) {
                for(const rid in p.supplements) {
                     const prodConfig = PRODUCT_CATALOG[rid];
                     const calcKey = prodConfig?.calculation?.calculateKey;
                     const calcFunc = calcKey && appState.context.registries.CALC_REGISTRY[calcKey];

                     if (!calcFunc || prodConfig.category === 'waiver') continue;
                     
                     if (attained > riderMaxAge(rid)) continue;

                     const tempCustomer = { ...p, age: attained };

                     const premiumForYear = calcFunc({ 
                         customer: tempCustomer,
                         mainPremium: baseMainAnnual, 
                         allPersons: appState.persons,
                         accumulators: { totalHospitalSupportStbh: 0 }, // Simplified for projection
                         helpers: appState.context.helpers,
                         params: prodConfig.calculation.params || {},
                         state: appState
                     });
                     addRider(premiumForYear);
                }
            }
            
            if (fixedWaiverPremiums[p.id]) {
                Object.entries(fixedWaiverPremiums[p.id]).forEach(([waiverId, premium]) => {
                    const wConfig = PRODUCT_CATALOG[waiverId];
                    const eligibilityKey = wConfig?.waiverEligibilityKey;
                    const resolverFunc = eligibilityKey && appState.context.registries.CALC_REGISTRY.waiverResolvers[eligibilityKey];
                    if (resolverFunc && resolverFunc({ attainedAge: attained, productConfig: wConfig })) {
                        addRider(premium);
                    }
                });
            }
            
            perPersonSuppBase.push(sumBase);
            perPersonSuppPerPeriod.push(sumPer);
            perPersonSuppAnnualEq.push(isAnnual ? sumBase : sumPer * periods);
        });

        const suppBaseTotal = perPersonSuppBase.reduce((a, b) => a + b, 0);
        const suppAnnualEqTotal = perPersonSuppAnnualEq.reduce((a, b) => a + b, 0);
        const totalYearBase = mainYearBase + extraYearBase + suppBaseTotal;
        const totalAnnualEq = isAnnual ? totalYearBase : (roundUpTo1000((mainYearBase + extraYearBase) / periods)) * periods + suppAnnualEqTotal;
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

function buildPart1Section(summaryData) {
    const config = VIEWER_CONFIG.part1_summary;
    const data = summaryData.part1;
    const { rows, perPersonTotals, grand } = data;
    
    const columns = config.columns.filter(c => !c.condition || c.condition(data));
    const getHeader = (col) => typeof col.header === 'function' ? col.header(data) : col.header;
    const getAlignment = (col) => col.align ? `text-align: ${col.align};` : '';

    const headerHtml = `<tr>${columns.map(c => `<th>${sanitizeHtml(getHeader(c))}</th>`).join('')}</tr>`;
    
    let bodyHtml = '';
    perPersonTotals.forEach(personTotal => {
        // Render summary row for the person
        bodyHtml += `<tr style="font-weight: bold;">`;
        columns.forEach((col, i) => {
            let content = '';
            if (i === 0) content = sanitizeHtml(personTotal.personName);
            else if (i === 1) content = 'Tổng theo người';
            else if (col.id === 'periodicFee') content = formatCurrency(personTotal.per);
            else if (col.id === 'annualEquivalent') content = formatCurrency(personTotal.eq);
            else if (col.id === 'annualFee') content = formatCurrency(personTotal.base);
            else if (col.id === 'diff') content = personTotal.diff === 0 ? '0' : `<span class="text-red-600 font-bold">${formatCurrency(personTotal.diff)}</span>`;
            else content = '—';
            bodyHtml += `<td style="${getAlignment(col)}">${content}</td>`;
        });
        bodyHtml += `</tr>`;
        
        // Render individual product rows for the person
        rows.filter(r => r.personName === personTotal.personName).forEach(row => {
            bodyHtml += `<tr>`;
            columns.forEach(col => {
                const value = col.id === 'personName' ? '' : (col.getValue(row, data) || '');
                bodyHtml += `<td style="${getAlignment(col)}">${value}</td>`;
            });
            bodyHtml += `</tr>`;
        });
    });
    
    // Render grand total row
    bodyHtml += `<tr style="font-weight: bold;">`;
    columns.forEach((col, i) => {
        let content = '';
        if (i === 0) content = 'Tổng tất cả';
        else if (col.id === 'periodicFee') content = formatCurrency(grand.per);
        else if (col.id === 'annualEquivalent') content = formatCurrency(grand.eq);
        else if (col.id === 'annualFee') content = formatCurrency(grand.base);
        else if (col.id === 'diff') content = grand.diff === 0 ? '0' : `<span class="text-red-600 font-bold">${formatCurrency(grand.diff)}</span>`;
        else if (i < 4) content = ''; // colspan would be better, but this works
        bodyHtml += `<td style="${getAlignment(col)}">${content}</td>`;
    });
    bodyHtml += `</tr>`;

    const titleHtml = `<h3>${sanitizeHtml(config.title)}</h3>`;
    return `${titleHtml}<table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
}

function buildFooterSection() {
    return `<div style="font-size: 10px; font-style: italic; color: #555; margin-top: 1rem;">(*) Công cụ này chỉ mang tính tham khảo cá nhân, không phải là bảng minh họa chính thức của AIA...</div>`;
}

function buildPart3ScheduleSection(summaryData) {
    const config = VIEWER_CONFIG.part3_schedule;
    if (!config || !summaryData.schedule.rows.length) return '';

    const { persons } = summaryData;
    const { rows, activePersonIdx } = summaryData.schedule;
    
    // Filter columns based on condition
    const columns = config.columns.filter(c => !c.condition || c.condition(summaryData));
    const getAlignment = (col) => col.align ? `text-align: ${col.align};` : '';
    const getStyle = (col) => `${getAlignment(col)}${col.isBold ? 'font-weight:bold;' : ''}`;

    // Build Header
    let headerHtml = '<tr>';
    columns.forEach(col => {
        if (col.type === 'dynamic') {
            activePersonIdx.forEach(pIdx => {
                headerHtml += `<th>${sanitizeHtml(col.headerTemplate(persons[pIdx]))}</th>`;
            });
        } else {
            const headerText = typeof col.header === 'function' ? col.header(summaryData) : col.header;
            headerHtml += `<th>${sanitizeHtml(headerText)}</th>`;
        }
    });
    headerHtml += '</tr>';

    // Build Body
    let bodyHtml = rows.map(row => {
        let rowHtml = '<tr>';
        columns.forEach(col => {
            if (col.type === 'dynamic') {
                activePersonIdx.forEach(pIdx => {
                    rowHtml += `<td style="${getStyle(col)}">${col.getValue(row, pIdx, summaryData)}</td>`;
                });
            } else {
                rowHtml += `<td style="${getStyle(col)}">${col.getValue(row, summaryData)}</td>`;
            }
        });
        rowHtml += '</tr>';
        return rowHtml;
    }).join('');

    // Build Footer
    let footerHtml = '<tr style="font-weight: bold;">';
    columns.forEach(col => {
        if (col.type === 'dynamic') {
            activePersonIdx.forEach((pIdx, idx) => {
                footerHtml += `<td style="${getStyle(col)}">${col.getFooter(summaryData, idx)}</td>`;
            });
        } else {
            footerHtml += `<td style="${getStyle(col)}">${col.getFooter(summaryData)}</td>`;
        }
    });
    footerHtml += '</tr>';
    
    const titleHtml = `<h3>${sanitizeHtml(config.titleTemplate(summaryData))}</h3>`;
    const tableHtml = `<table><thead>${headerHtml}</thead><tbody>${bodyHtml}${footerHtml}</tbody></table>`;
    return `${titleHtml}${tableHtml}${buildFooterSection()}`;
}

function buildPart2BenefitsSection(summaryData) {
    const colsBySchema = bm_collectColumns(summaryData);
    
    const sortedSchemaKeys = Object.keys(colsBySchema).sort((keyA, keyB) => {
        const schemaA = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === keyA);
        const schemaB = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === keyB);
        return (schemaA?.displayOrder || 999) - (schemaB?.displayOrder || 999);
    });

    const blocks = sortedSchemaKeys
        .map(sk => bm_renderSchemaTables(sk, colsBySchema[sk], summaryData))
        .filter(Boolean);

    if (!blocks.length) return `<h3>Phần 2 · Tóm tắt quyền lợi sản phẩm</h3><div>Không có quyền lợi nào để hiển thị.</div>`;
    return `<h3>Phần 2 · Tóm tắt quyền lợi sản phẩm</h3>${blocks.join('')}`;
}

function bm_findSchema(productKey) {
    const productConfig = PRODUCT_CATALOG[productKey];
    if (!productConfig) return null;

    const matrixKey = productConfig.benefitMatrixKey;
    if (matrixKey) {
        return BENEFIT_MATRIX_SCHEMAS.find(s => s.key === matrixKey);
    }
    
    // Fallback for products without a direct mapping, e.g., using productKeys array
    return BENEFIT_MATRIX_SCHEMAS.find(s => 
        s.key.toLowerCase() === productKey.toLowerCase() || 
        s.productKeys?.includes(productKey)
    );
}

function bm_collectColumns(summaryData) {
    const colsBySchema = {};
    const persons = summaryData.persons || [];
    const mainKey = summaryData.productKey;
    const { UI_FUNCTIONS } = appState.context.registries;
    
    const mainConfig = PRODUCT_CATALOG[mainKey];
    if (mainConfig?.packageConfig?.addBenefitMatrixFrom) {
        mainConfig.packageConfig.addBenefitMatrixFrom.forEach(item => {
            const schema = bm_findSchema(item.productKey);
            if (schema && schema.getGroupingSignature) {
                const colDataBase = { productKey: item.productKey, sumAssured: item.sumAssured, persons: [summaryData.mainPerson] };
                const sig = schema.getGroupingSignature(colDataBase);
                colsBySchema[schema.key] = colsBySchema[schema.key] || [];
                colsBySchema[schema.key].push({ ...colDataBase, sig });
            }
        });
    } else if (mainKey) {
        const schema = bm_findSchema(mainKey);
        if (schema && schema.getGroupingSignature) {
            const mainSa = appState.mainProduct.values['main-stbh'] || 0;
            const colDataBase = { productKey: mainKey, sumAssured: mainSa, persons: [summaryData.mainPerson] };
            const sig = schema.getGroupingSignature(colDataBase);
            colsBySchema[schema.key] = colsBySchema[schema.key] || [];
            colsBySchema[schema.key].push({ ...colDataBase, sig });
        }
    }
    
    persons.forEach(p => {
        const supp = p.supplements || {};
        for (const rid in supp) {
            if(PRODUCT_CATALOG[rid]?.category === 'waiver') continue;

            const schema = bm_findSchema(rid);
            if (!schema || !schema.getGroupingSignature) continue;

            const fee = appState.fees.byPerson[p.id]?.suppDetails?.[rid] || 0;
            if (fee <= 0) continue;

            colsBySchema[schema.key] = colsBySchema[schema.key] || [];
            
            const prodConfig = PRODUCT_CATALOG[rid];
            const dataForKey = supp[rid];

            const colDataBase = prodConfig.columnDataKey
                ? UI_FUNCTIONS.bmColumnData[prodConfig.columnDataKey]({ productKey: rid, person: p, data: dataForKey, state: appState })
                : { productKey: rid, sumAssured: (dataForKey?.stbh || 0), persons: [p] };

            const sig = schema.getGroupingSignature(colDataBase);
            let existingCol = colsBySchema[schema.key].find(c => c.sig === sig);
            if (existingCol) {
                existingCol.persons.push(p);
            } else {
                colDataBase.sig = sig;
                colsBySchema[schema.key].push(colDataBase);
            }
        }
    });
    
    return colsBySchema;
}

function bm_renderSchemaTables(schemaKey, columns) {
    const schema = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === schemaKey);
    if (!schema || !columns.length) return '';

    const title = schema.displayName || schema.key;
    const headCols = columns.map(c => `<th>${sanitizeHtml(schema.getColumnLabel(c))}</th>`).join('');
    
    let rows = [];
    schema.benefits.forEach(benef => {
        if (benef.headerCategory) {
            let needed = columns.some(c => c.flags?.[benef.headerCategory]);
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
            const formulaKey = benef.formulaKey;
            const formulaFunc = formulaKey && appState.context.registries.UI_FUNCTIONS.bmFormulas[formulaKey];
            
            if (formulaFunc) {
                const raw = formulaFunc(col, benef.params || {});
                if (benef.valueType === 'number') {
                    singleValue = roundTo1000(raw);
                    displayValue = singleValue ? formatCurrency(singleValue * (benef.multiClaim || 1)) : '';
                } else {
                    displayValue = raw;
                }
            } else if (benef.valueType === 'text') {
                displayValue = benef.text || '';
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

    return `<div><h3>${sanitizeHtml(title)}</h3><table><thead><tr><th>Tên quyền lợi</th>${headCols}</tr></thead><tbody>${bodyHtml}${totalRowHtml}</tbody></table></div>`;
}
function getProductLabel(key) {
  return PRODUCT_CATALOG[key]?.name || key || '';
}
