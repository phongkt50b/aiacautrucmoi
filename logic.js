
import { GLOBAL_CONFIG, PRODUCT_CATALOG } from './structure.js';
import { product_data } from './data.js';

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
// ===== UTILS
// ===================================================================================
let productJustChanged = false; 

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
                roundDownTo1000,
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
    const noSuppInsured = RULE_ENGINE.evaluate(mainProductConfig?.rules.noSupplementaryInsured, { state: appState });

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
            
            const newProductKey = e.target.value;
            const newProductConfig = PRODUCT_CATALOG[newProductKey];

            const hasFixedStbh = newProductConfig?.group === 'PACKAGE' && newProductConfig.packageConfig?.fixedValues?.stbh;
            const hasStbhInput = newProductConfig?.ui?.controls.some(c => c.id === 'main-stbh' && c.type === 'currencyInput' && !c.disabled);

            if (!hasFixedStbh && hasStbhInput && oldStbh > 0) {
                appState.mainProduct.values['main-stbh'] = oldStbh;
            }
            
            if (RULE_ENGINE.evaluate(newProductConfig?.rules.noSupplementaryInsured, { state: appState })) {
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
    
    const disabled = RULE_ENGINE.evaluate(mainProductConfig?.rules.noSupplementaryInsured, { state: appState }) || 
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
    const calculatedValue = TARGET_AGE_REGISTRY.resolveValue(config.valueKey, ctx);
    if (!config.isEditable) {
        targetAgeInput.value = calculatedValue;
    } else {
        const currentValue = parseInt(targetAgeInput.value, 10);
        if (isNaN(currentValue) || currentValue <= 0) {
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

function renderSuppListSummary() {
  const box = document.getElementById('supp-insured-summaries');
  if (!box) return;

  const getPersonName = (id) => {
    if (id === GLOBAL_CONFIG.WAIVER_OTHER_PERSON_ID) {
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
        const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
        const productKey = appState.mainProduct.key;
        if (!productKey) return;
        
        const payload = {
            v: 3, 
            productKey,
            productSlug: mainProductConfig?.slug,
            mainPersonName: appState.persons.find(p => p.isMain)?.name,
            mainPersonAge: appState.persons.find(p => p.isMain)?.age,
            mainPersonGender: appState.persons.find(p => p.isMain)?.gender,
            sumAssured: appState.mainProduct.values['main-stbh'],
            paymentFrequency: appState.paymentFrequency,
            paymentTerm: mainProductConfig.getPaymentTerm ? mainProductConfig.getPaymentTerm(appState.mainProduct.values) : 0,
            targetAge: parseInt(document.getElementById('target-age-input')?.value, 10),
            customInterestRate: document.getElementById('custom-interest-rate-input')?.value,
            premiums: { 
                baseMain: appState.fees.baseMain,
                extra: appState.fees.extra,
                totalSupp: appState.fees.totalSupp,
            },
            fullState: appState 
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
