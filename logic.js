import { GLOBAL_CONFIG, PRODUCT_CATALOG } from './structure.js';
import { product_data, investment_data, BENEFIT_MATRIX_SCHEMAS } from './data.js';
import { debounce, parseFormattedNumber, formatCurrency, sanitizeHtml, roundDownTo1000, roundTo1000, roundUpTo1000, clearFieldError } from './utils.js';

// Import Engines
import { calculateAll } from './engines/calculationEngine.js';
import { runAllValidations } from './engines/validationEngine.js';
import { 
    renderMainProductSection, 
    renderSupplementaryProductsForPerson, 
    renderWaiverSection, 
    generateSupplementaryProductsHtml,
    renderSummary,
    renderFrequencyBreakdown,
    updateSupplementaryAddButtonState,
    updateTargetAge,
    updatePaymentFrequencyOptions,
    showGlobalErrors,
    hideGlobalErrors,
    renderSuppListSummary 
} from './engines/uiRenderEngine.js';
import { generateViewerPayload } from './engines/viewerEngine.js';

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
    renderSummary(appState, isMainProductSectionValid);
    updateSupplementaryAddButtonState(appState, isMainProductSectionValid);
    updatePaymentFrequencyOptions(appState, appState.fees.baseMain);
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
  updateTargetAge(appState, productJustChanged);
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
    
    initViewerModal();
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
        <!-- Container này sẽ là nơi chứa form NĐBH được tạo động -->
        <div id="waiver-dynamic-person-container" class="mt-4"></div>
        <div id="waiver-products-list" class="hidden mt-4 space-y-4"></div>
        <div id="waiver-fee-display" class="text-right font-semibold text-aia-red min-h-[1.5rem] mt-2"></div>
    `;

    // Gắn sự kiện lắng nghe
    document.body.addEventListener('change', (e) => {
        const target = e.target;
        if (target.id === `waiver-person-select`) {
            handleWaiverPersonChange(target.value);
        }
    });
}

// DÁN HÀM MỚI NÀY VÀO FILE logic.js
function handleWaiverPersonChange(selectedValue) {
    // Tìm và xóa người được thêm tự động trước đó (nếu có)
    const existingDynamicWaiverPerson = appState.persons.find(p => p.isWaiverHolderOnly);
    if (existingDynamicWaiverPerson) {
        appState.persons = appState.persons.filter(p => !p.isWaiverHolderOnly);
        const oldContainer = document.getElementById(existingDynamicWaiverPerson.id);
        if (oldContainer) oldContainer.remove();
    }

    // Nếu người dùng chọn "+ Thêm người khác"
    if (selectedValue === GLOBAL_CONFIG.WAIVER_OTHER_PERSON_SELECT_VALUE) {
        const personId = `waiver-person-${Date.now()}`;
        const template = document.getElementById('supplementary-person-template');
        const clone = template.content.cloneNode(true);
        const newContainer = clone.querySelector('.person-container');
        
        newContainer.id = personId; // Đặt ID duy nhất
        
        // Tùy chỉnh template cho phù hợp
        newContainer.querySelector('[data-template-id="title"]').textContent = 'Thông tin Bên mua bảo hiểm';
        newContainer.querySelector('.remove-supp-btn')?.remove(); // Xóa nút xóa
        newContainer.querySelector('.supplementary-products-container')?.parentElement.remove(); // Xóa phần sản phẩm bổ sung

        // Thêm form vào đúng vị trí trong mục Miễn đóng phí
        document.getElementById('waiver-dynamic-person-container').appendChild(clone);

        // Tạo một "người" mới trong state
        const newPersonState = { 
            id: newContainer.id, 
            container: newContainer, 
            isMain: false, 
            isWaiverHolderOnly: true, // Đánh dấu đây là người đặc biệt
            supplements: {} 
        };
        appState.persons.push(newPersonState);

        // Cập nhật lại state và chạy lại toàn bộ workflow
        appState.waiver.selectedPersonId = newPersonState.id;
        initPerson(newPersonState); // Khởi tạo các sự kiện cho form mới

    } else {
         appState.waiver.selectedPersonId = selectedValue;
    }

    appState.waiver.enabledProducts = {}; // Reset lựa chọn sản phẩm miễn đóng phí
    runWorkflow(); // Chạy lại để cập nhật toàn bộ giao diện và tính toán
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
        const payload = generateViewerPayload(appState);
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
