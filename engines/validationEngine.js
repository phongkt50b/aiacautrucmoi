

import { PRODUCT_CATALOG, GLOBAL_CONFIG } from '../structure.js';
import { TARGET_AGE_REGISTRY } from '../registries/targetAge.js';
import { clearAllErrors, setFieldError, clearFieldError, collectAllErrors } from '../utils.js';

export function runAllValidations(state) {
    clearAllErrors();
    let result = {
        isValid: true,
        isMainProductSectionValid: true,
        errors: []
    };
    
    const mainPerson = state.persons.find(p => p.isMain);

    if (!validatePersonInputs(mainPerson)) result.isValid = false;
    if (!validateMainProduct(state)) {
        result.isValid = false;
        result.isMainProductSectionValid = false;
    }
    
    state.persons.forEach(p => {
        if (!p.isMain && !validatePersonInputs(p)) result.isValid = false;
        
        for (const prodId in p.supplements) {
            if (!validateSupplementaryProduct(p, prodId, state)) result.isValid = false;
        }
    });
    
    if (!validateWaiverSection(state)) result.isValid = false;
    if (!validateTargetAge(state)) result.isValid = false;

    result.errors = collectAllErrors();
    if(result.errors.length > 0) result.isValid = false;
    
    return result;
}

function validatePersonInputs(person) {
    let ok = true;
    const { container } = person;
    if (!container) return true;
    
    const isWopOther = container.id.includes('waiver-other-form');
    
    const fields = [
        { selector: '.name-input', message: 'Vui lòng nhập họ và tên', test: (el) => el.value.trim() },
        { selector: '.dob-input', message: 'Ngày sinh không hợp lệ', test: validateDobField },
    ];

    // === ĐOẠN CODE MỚI ĐỂ THAY THẾ ===
    const occupationInput = container.querySelector('.occupation-input');
    const isChildOccupation = occupationInput?.dataset.isChild === 'true';
    
    // Logic mới: Nghề nghiệp là bắt buộc với tất cả mọi người, trừ khi họ là "Trẻ em".
    if (!isChildOccupation) {
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

function validateMainProduct(state) {
    const { key, values } = state.mainProduct;
    const mainPerson = state.persons.find(p => p.isMain);
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
        const validateKey = controlConfig.validateKey;
        const validateFunc = validateKey && state.context.registries.UI_FUNCTIONS.validate[validateKey];
        if (!el || !validateFunc) return;
        
        const errorMessage = validateFunc({
            value: values[controlConfig.id],
            allValues: values,
            customer: mainPerson,
            basePremium: state.fees.baseMain,
            params: controlConfig.validateParams || {},
            config: controlConfig,
            state
        });

        if (errorMessage) {
            setFieldError(el, errorMessage);
            ok = false;
        } else {
            clearFieldError(el);
        }
    });

    const premiumRules = productConfig.rules.premium;
    if (premiumRules?.min && state.fees.baseMain > 0 && state.fees.baseMain < premiumRules.min) {
        const anyInput = document.getElementById('main-stbh') || document.getElementById('abuv-term') || document.getElementById('main-premium');
        if (anyInput) {
            const msg = productConfig.ui.validationMessages?.minPremium || `Phí chính tối thiểu ${state.context.helpers.formatCurrency(premiumRules.min)}`;
            setFieldError(anyInput, msg);
        }
        ok = false;
    }

    return ok;
}

function validateSupplementaryProduct(person, prodId, state) {
    const prodConfig = PRODUCT_CATALOG[prodId];
    if (!prodConfig) return true;

    const suppContainer = person.isMain ? document.getElementById('main-supp-container') : person.container;
    const section = suppContainer.querySelector(`[data-product-key="${prodId}"]`);
    if (!section) return true;

    let ok = true;
    prodConfig.ui.controls.forEach(controlConfig => {
        const el = section.querySelector(`#${controlConfig.id}`);
        const validateKey = controlConfig.validateKey;
        const validateFunc = validateKey && state.context.registries.UI_FUNCTIONS.validate[validateKey];
        if (!el || !validateFunc) return;
        
        const errorMessage = validateFunc({
            value: person.supplements[prodId]?.[controlConfig.id.replace(`${prodId}-`, '')],
            customer: person,
            mainPremium: state.fees.baseMain,
            allPersons: state.persons,
            params: controlConfig.validateParams || {},
            config: controlConfig,
            state
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

function validateTargetAge(state) {
    const input = document.getElementById('target-age-input');
    if (!input || input.disabled) {
        if(input) clearFieldError(input);
        return true;
    }

    const val = parseInt((input.value || '').trim(), 10);
    const mainPerson = state.persons.find(p => p.isMain);
    const productConfig = PRODUCT_CATALOG[state.mainProduct.key];
    if (!productConfig || !productConfig.targetAgeConfig) return true;
    
    const { constraints } = productConfig.targetAgeConfig;
    if (!constraints) { // No constraints to validate against
        clearFieldError(input);
        return true;
    }

    const ctx = { mainPerson, values: state.mainProduct.values, state };
    const minAllowed = TARGET_AGE_REGISTRY.resolveConstraint(constraints.minKey, ctx);
    const maxAllowed = TARGET_AGE_REGISTRY.resolveConstraint(constraints.maxKey, ctx) || 99;

    if (constraints.minKey && (isNaN(val) || val < minAllowed)) {
        setFieldError(input, `Tuổi minh họa phải từ ${minAllowed} đến ${maxAllowed}`);
        return false;
    }
    if (constraints.maxKey && val > maxAllowed) {
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

// === HÀM MỚI ĐỂ THAY THẾ ===
function validateWaiverSection(state) {
    const selectedId = state.waiver.selectedPersonId;
    // Nếu không có ai được chọn hoặc không có sản phẩm miễn đóng phí nào được tích, thì không cần kiểm tra.
    if (!selectedId || Object.keys(state.waiver.enabledProducts).length === 0) {
        return true;
    }

    // Tìm đúng người trong state
    const waiverPerson = state.persons.find(p => p.id === selectedId);

    // Nếu đã chọn sản phẩm miễn đóng phí, người được chọn phải hợp lệ.
    if (waiverPerson) {
        // 1. Kiểm tra các ô nhập liệu (tên, ngày sinh, nghề nghiệp)
        if (!validatePersonInputs(waiverPerson)) {
            return false;
        }

        // 2. Kiểm tra xem người này có đủ điều kiện (tuổi, nhóm nghề) không
        let isEligible = true;
        const waiverProdKey = Object.keys(PRODUCT_CATALOG).find(k => PRODUCT_CATALOG[k].slug === 'mdp3'); // Lấy sản phẩm mdp3
        if (waiverProdKey) {
            const waiverConfig = PRODUCT_CATALOG[waiverProdKey];
            if (!RULE_ENGINE.evaluateAnd(waiverConfig.rules.eligibility, { customer: waiverPerson, state })) {
                isEligible = false;
            }
        }
        
        if (!isEligible) {
            const fieldToAttachError = waiverPerson.container.querySelector('.name-input');
            setFieldError(fieldToAttachError, "Người này không đủ điều kiện tham gia Miễn đóng phí (do tuổi hoặc nhóm nghề).");
            return false;
        }
    }
    
    return true; // Mọi thứ đều hợp lệ
}
