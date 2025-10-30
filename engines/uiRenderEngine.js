

import { PRODUCT_CATALOG, GLOBAL_CONFIG } from '../structure.js';
import { RULE_ENGINE } from '../registries/ruleEngine.js';

let lastRenderedProductKey = null;

export function renderMainProductSection(state) {
    const mainProductKey = state.mainProduct.key;
    const mainPerson = state.persons.find(p => p.isMain);
    
    document.querySelectorAll('#main-product option').forEach(option => {
        const productKey = option.value;
        const productConfig = PRODUCT_CATALOG[productKey];
        if (!productConfig) return;
        option.disabled = !RULE_ENGINE.evaluateAnd(productConfig.rules.eligibility, { customer: mainPerson });
    });
    
    if (lastRenderedProductKey !== mainProductKey) {
        lastRenderedProductKey = mainProductKey;

        const container = document.getElementById('main-product-options');
        container.innerHTML = '';
        const productConfig = PRODUCT_CATALOG[mainProductKey];
        if (productConfig?.ui?.controls) {
            const controlsHtml = productConfig.ui.controls.map(cfg => {
                let value = state.mainProduct.values[cfg.id] ?? cfg.defaultValue ?? '';
                if (productConfig.group === 'PACKAGE' && cfg.disabled) {
                    value = cfg.defaultValue;
                }
                return renderControl(cfg, value, mainPerson, state);
            }).join('');
            container.innerHTML = controlsHtml;
        }
    }
    
    // Always run onRender to update dynamic hints
    const productConfig = PRODUCT_CATALOG[mainProductKey];
    if (productConfig?.ui?.controls) {
        productConfig.ui.controls.forEach(controlConfig => {
            const onRenderKey = controlConfig.onRender;
            const onRenderFunc = onRenderKey && state.context.registries.UI_FUNCTIONS.onRender[onRenderKey];
            if (onRenderFunc) {
                const el = document.getElementById(controlConfig.id);
                if (el) {
                    onRenderFunc({
                        el,
                        allValues: state.mainProduct.values,
                        customer: mainPerson,
                        basePremium: state.fees.baseMain,
                        params: controlConfig.onRenderParams || {},
                        state
                    });
                }
            }
        });
    }
}

export function renderSupplementaryProductsForPerson(customer, state, isMainProductSectionValid) {
    const container = customer.isMain
        ? document.querySelector('#main-supp-container .supplementary-products-container')
        : customer.container.querySelector('.supplementary-products-container');
    if (!container) return;

    Object.entries(PRODUCT_CATALOG).forEach(([prodId, prodConfig]) => {
        if (prodConfig.type !== 'rider' || prodConfig.category === 'waiver') return;

        const section = container.querySelector(`[data-product-key="${prodId}"]`);
        if (!section) return;

        const context = { customer, state, productKey: prodId, PRODUCT_CATALOG };
        const isEligible = RULE_ENGINE.evaluateAnd(prodConfig.rules.eligibility, context);
        const isVisible = RULE_ENGINE.evaluateAnd(prodConfig.rules.visibility, context);
        const isDisabled = RULE_ENGINE.evaluateOr(prodConfig.rules.disabled, context);
        const isMandatory = RULE_ENGINE.evaluateOr(prodConfig.rules.mandatory, context);
        
        section.classList.toggle('hidden', !isEligible || !isVisible);

        const checkbox = section.querySelector(`.${prodId}-checkbox`);
        if (!checkbox) return;
        
        checkbox.disabled = isDisabled || !isMainProductSectionValid || isMandatory;
        if(isMandatory) {
            checkbox.checked = true;
        }

        section.classList.toggle('opacity-50', checkbox.disabled && !isMandatory);
        section.querySelector('.product-options')?.classList.toggle('hidden', !checkbox.checked);
        
        const fee = state.fees.byPerson[customer.id]?.suppDetails?.[prodId] || 0;
        const feeDisplay = section.querySelector('.fee-display');
        if (feeDisplay) {
            feeDisplay.textContent = fee > 0 ? `Phí: ${state.context.helpers.formatCurrency(fee)}` : '';
        }

        const onRenderKey = prodConfig.ui.onRender;
        const onRenderFunc = onRenderKey && state.context.registries.UI_FUNCTIONS.onRender[onRenderKey];
        if (onRenderFunc) {
            onRenderFunc({
                section,
                el: section,
                customer,
                mainPremium: state.fees.baseMain,
                allValues: state.mainProduct.values,
                allPersons: state.persons,
                config: prodConfig,
                mainProductConfig: PRODUCT_CATALOG[state.mainProduct.key],
                params: prodConfig.ui.onRenderParams || {},
                state
            });
        }
    });
}

export function generateSupplementaryProductsHtml(state) {
    return Object.entries(PRODUCT_CATALOG)
        .filter(([, config]) => config.type === 'rider' && config.category !== 'waiver')
        .map(([prodId, prodConfig]) => {
            const controlsHtml = (prodConfig.ui.controls || []).map(cfg => renderControl(cfg, cfg.defaultValue || '', null, state)).join('');
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


function renderControl(config, value, customer, state) {
    const required = config.required ? '<span class="text-red-600">*</span>' : '';
    const disabled = config.disabled ? 'disabled' : '';
    const bg = config.disabled ? 'bg-gray-100' : '';
    let html = '';

    switch(config.type) {
        case 'currencyInput':
            const displayValue = value > 0 ? state.context.helpers.formatCurrency(value) : (value || '');
            html = `<div>
                <label for="${config.id}" class="font-medium text-gray-700 block mb-1">${config.label} ${required}</label>
                <input type="text" id="${config.id}" class="form-input ${config.customClass || ''} ${bg}" 
                       value="${displayValue}" placeholder="${config.placeholder || ''}" ${disabled}>
                <div id="${config.hintId || config.id + '-hint'}" class="text-sm text-gray-500 mt-1">${config.hintText || ''}</div>
                <div class="field-error"></div>
            </div>`;
            break;
        case 'numberInput':
            html = `<div>
                <label for="${config.id}" class="font-medium text-gray-700 block mb-1">${config.label} ${required}</label>
                <input type="number" id="${config.id}" class="form-input" value="${value || config.defaultValue || ''}" 
                       placeholder="${config.placeholder || ''}">
                <div id="${config.id}-hint" class="text-sm text-gray-500 mt-1"></div>
                <div class="field-error"></div>
            </div>`;
            break;
        case 'select':
            let optionsHtml = (config.options || [])
                .filter(opt => !opt.condition || opt.condition(customer))
                .map(opt => `<option value="${opt.value}" ${opt.value == value ? 'selected' : ''}>${opt.label}</option>`)
                .join('');
            if (!optionsHtml) optionsHtml = '<option value="" disabled selected>Không có kỳ hạn phù hợp</option>';
            else optionsHtml = '<option value="">-- Chọn --</option>' + optionsHtml;
            html = `<div>
                <label for="${config.id}" class="font-medium text-gray-700 block mb-1">${config.label} ${required}</label>
                <select id="${config.id}" class="form-select">${optionsHtml}</select>
                <div class="field-error"></div>
            </div>`;
            break;
        case 'checkboxGroup':
             const itemsHtml = config.items.map(item => `
                <label class="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" id="${item.id}" class="form-checkbox ${item.customClass || ''}" data-product-key="${item.id.split('-')[0]}">
                    <span>${item.label}</span>
                    <span id="${item.hintId}" class="ml-2 text-xs text-gray-600"></span>
                </label>`).join('');
            html = `<div>
                <span class="font-medium text-gray-700 block mb-2">${config.label}</span>
                <div class="space-y-2">${itemsHtml}</div>
            </div>`;
            break;
        case 'staticText':
             html = `<div class="${config.customClass || ''}">${config.text}</div>`;
             break;
    }
    return html;
}

export function renderWaiverSection(state, isMainProductValid) {
    const selEl = document.getElementById(`waiver-person-select`);
    const productListContainer = document.getElementById('waiver-products-list');
    const otherForm = document.getElementById('waiver-other-form');
    const feeEl = document.getElementById(`waiver-fee-display`);

    if (!selEl || !productListContainer || !otherForm || !feeEl) return;

    // 1. Update dropdown options and disabled state
    const mainProductConfig = PRODUCT_CATALOG[state.mainProduct.key];
    const noWaiverAllowed = RULE_ENGINE.evaluateOr(mainProductConfig?.rules.noSupplementaryInsured, { state, PRODUCT_CATALOG });
    selEl.disabled = !isMainProductValid || noWaiverAllowed;
    
    if (noWaiverAllowed) {
        selEl.innerHTML = `<option value="">-- Không áp dụng cho sản phẩm này --</option>`;
    } else {
        const currentSelectedValue = state.waiver.selectedPersonId;
        let optionsHtml = `<option value="">-- Chọn người --</option>`;
        state.persons.forEach(p => {
            optionsHtml += `<option value="${p.id}">${p.name} (tuổi ${p.age || "?"})</option>`;
        });
        optionsHtml += `<option value="${GLOBAL_CONFIG.WAIVER_OTHER_PERSON_SELECT_VALUE}">+ Thêm người khác (Bên mua bảo hiểm)</option>`;
        selEl.innerHTML = optionsHtml;
        selEl.value = currentSelectedValue;
    }

    // 2. Show/hide other person form
    otherForm.classList.toggle('hidden', state.waiver.selectedPersonId !== GLOBAL_CONFIG.WAIVER_OTHER_PERSON_SELECT_VALUE);

    // 3. Render product list
    if (!state.waiver.selectedPersonId) {
        productListContainer.classList.add('hidden');
        feeEl.textContent = '';
        return;
    }
    productListContainer.classList.remove('hidden');

    const personInfo = state.context.registries.CALC_REGISTRY._getWaiverTargetPersonInfo(state);
    if (!personInfo) {
        productListContainer.innerHTML = '';
        return;
    }

    if(personInfo.id === GLOBAL_CONFIG.WAIVER_OTHER_PERSON_ID) {
        const otherFormEl = document.getElementById(`person-container-waiver-other-form`);
        const ageSpan = otherFormEl?.querySelector('.age-span');
        if(ageSpan) ageSpan.textContent = personInfo.age;
    }
    
    const waiverProducts = Object.values(PRODUCT_CATALOG).filter(p => p.category === 'waiver');
    productListContainer.innerHTML = waiverProducts.map(prodConfig => {
        const isEligible = RULE_ENGINE.evaluateAnd(prodConfig.rules.eligibility, { customer: personInfo });
        const isChecked = state.waiver.enabledProducts[prodConfig.slug] || false;
        return `
            <div class="waiver-product-item ${!isEligible ? 'opacity-50' : ''}">
                <label class="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" id="waiver-cb-${prodConfig.slug}" class="form-checkbox waiver-prod-checkbox" data-prod-id="${prodConfig.slug}" 
                           ${isChecked ? 'checked' : ''} ${!isEligible ? 'disabled' : ''}>
                    <span class="font-medium text-gray-800">${prodConfig.name}</span>
                </label>
                ${!isEligible ? `<div class="text-xs text-red-600 pl-8">Không đủ điều kiện (tuổi, giới tính, hoặc vai trò không phù hợp)</div>` : ''}
            </div>
        `;
    }).join('');

    // 4. Render fee display
    const feeText = Object.entries(state.fees.waiverDetails).map(([, data]) => {
        return `STBH Cơ sở: ${state.context.helpers.formatCurrency(data.stbhBase)} | Phí: ${state.context.helpers.formatCurrency(data.premium)}`;
    }).join(' | ');
    feeEl.textContent = feeText;
}
