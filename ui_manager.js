import { PRODUCT_RULES, HEALTH_BENEFITS } from './data.js';
import { calculateAge, calculateMainPremium } from './calculator.js';

export function getFormElements() {
    return {
        name: document.getElementById('name'),
        dob: document.getElementById('dob'),
        gender: document.getElementById('gender'),
        ageDisplay: document.getElementById('age-display'),
        mainProduct: document.getElementById('main-product'),
        productDetailsContainer: document.getElementById('product-details-container'),
        sumAssuredPul: document.getElementById('sum-assured-pul'),
        premiumTermPul: document.getElementById('premium-term-pul'),
        mainPremiumPul: document.getElementById('main-premium-pul'),
        mainPremiumMul: document.getElementById('main-premium-mul'),
        mulPremiumRange: document.getElementById('mul-premium-range'),
        topupPremium: document.getElementById('topup-premium'),
        topupPremiumError: document.getElementById('topup-premium-error'),
        endAge: document.getElementById('end-age'),
        sumAssuredAbuv: document.getElementById('sum-assured-abuv'),
        premiumTermAbuv: document.getElementById('premium-term-abuv'),
        ridersSection: document.getElementById('riders-section'),
        healthRiderContainer: document.getElementById('health-rider-container'),
        healthRiderCheck: document.getElementById('health-rider-check'),
        healthRiderOptions: document.getElementById('health-rider-options'),
        healthProgram: document.getElementById('health-program'),
        healthScope: document.getElementById('health-scope'),
        healthOutpatient: document.getElementById('health-outpatient'),
        healthDental: document.getElementById('health-dental'),
        ciRiderContainer: document.getElementById('ci-rider-container'),
        ciRiderCheck: document.getElementById('ci-rider-check'),
        ciRiderOptions: document.getElementById('ci-rider-options'),
        ciSumAssured: document.getElementById('ci-sum-assured'),
        generateBtn: document.getElementById('generate-btn'),
        resultsContainer: document.getElementById('results-container'),
        summaryInfo: document.getElementById('summary-info'),
        summaryBenefitsContainer: document.getElementById('summary-benefits-container'),
        summaryBenefits: document.getElementById('summary-benefits'),
        illustrationTable: document.getElementById('illustration-table'),
        mainPremiumError: document.getElementById('main-premium-error'),
    };
}

function parseFormattedNumber(value) {
    return value ? parseInt(value.replace(/\./g, ''), 10) || 0 : 0;
}

export function readFormInputs() {
    const elements = getFormElements();
    return {
        name: elements.name.value,
        dob: elements.dob.value,
        gender: elements.gender.value,
        product: elements.mainProduct.value,
        sumAssuredPul: parseFormattedNumber(elements.sumAssuredPul.value),
        premiumTermPul: parseInt(elements.premiumTermPul.value) || 0,
        mainPremiumMul: parseFormattedNumber(elements.mainPremiumMul.value),
        topupPremium: parseFormattedNumber(elements.topupPremium.value),
        endAge: parseInt(elements.endAge.value) || 0,
        sumAssuredAbuv: parseFormattedNumber(elements.sumAssuredAbuv.value),
        premiumTermAbuv: parseInt(elements.premiumTermAbuv.value) || 0,
        healthRider: {
            participate: elements.healthRiderCheck.checked,
            program: elements.healthProgram.value,
            scope: elements.healthScope.value,
            outpatient: elements.healthOutpatient.checked,
            dental: elements.healthDental.checked,
        },
        ciRider: {
            participate: elements.ciRiderCheck.checked,
            sumAssured: parseFormattedNumber(elements.ciSumAssured.value),
        }
    };
}

export function updateAgeDisplay(age) {
    const ageDisplay = getFormElements().ageDisplay;
    if (age !== null && age >= 0) {
        ageDisplay.textContent = `Tuổi hiện tại: ${age}`;
    } else {
        ageDisplay.textContent = '';
    }
}

export function formatDateInput(e) {
    let input = e.target.value.replace(/\D/g, '');
    if (input.length > 8) {
        input = input.substring(0, 8);
    }
    let formatted = '';
    if (input.length > 4) {
        formatted = `${input.substring(0, 2)}/${input.substring(2, 4)}/${input.substring(4)}`;
    } else if (input.length > 2) {
        formatted = `${input.substring(0, 2)}/${input.substring(2)}`;
    } else {
        formatted = input;
    }
    e.target.value = formatted;
}

export function formatNumberInput(inputElement, onBlur = false) {
    let value = inputElement.value.replace(/\./g, '');
    if (new RegExp('^\\d*$').test(value)) {
        if (value) {
            inputElement.value = parseInt(value, 10).toLocaleString('vi-VN');
        } else if (onBlur) {
            inputElement.value = '';
        }
    } else {
        inputElement.value = value.replace(/\D/g, '').toLocaleString('vi-VN');
    }
}


export function updateProductVisibility(age, gender) {
    const mainProductSelect = getFormElements().mainProduct;
    const currentProduct = mainProductSelect.value;
    let isCurrentProductVisible = true;

    Array.from(mainProductSelect.options).forEach(option => {
        if (!option.value) return;

        const rules = PRODUCT_RULES[option.value];
        if (!rules) return;
        
        const { minAge, maxAge, gender: genderRule } = rules.eligibility;
        const isEligible = age >= minAge && age <= maxAge && (!genderRule || genderRule === gender);
        
        option.classList.toggle('hidden', !isEligible);

        if (option.value === currentProduct && !isEligible) {
            isCurrentProductVisible = false;
        }
    });

    if (!isCurrentProductVisible) {
        mainProductSelect.value = "";
        updateProductDetailsVisibility("");
        updateRidersVisibility("", age, gender);
    }
}

export function updateProductDetailsVisibility(productKey) {
    const container = getFormElements().productDetailsContainer;
    container.querySelectorAll('.product-details-group').forEach(group => group.classList.add('hidden'));

    if (!productKey) return;
    
    const rules = PRODUCT_RULES[productKey];
    if (!rules) return;

    if (rules.type === 'PUL_MUL') {
        document.getElementById('PUL_MUL_details').classList.remove('hidden');
        const isPul = rules.subType === 'PUL';
        document.getElementById('main-premium-pul-container').classList.toggle('hidden', !isPul);
        document.getElementById('main-premium-mul-container').classList.toggle('hidden', isPul);
    } else if (rules.type === 'ABUV') {
        document.getElementById('ABUV_details').classList.remove('hidden');
    } else if (rules.type === 'TTA') {
        document.getElementById('TTA_details').classList.remove('hidden');
    }
}

export function updateRidersVisibility(productKey, age, gender) {
    const { healthRiderContainer, ciRiderContainer } = getFormElements();
    
    if (!productKey) {
        healthRiderContainer.classList.add('hidden');
        ciRiderContainer.classList.add('hidden');
        return;
    }

    const productRules = PRODUCT_RULES[productKey];
    if (!productRules) return;


    const healthRules = productRules.riders.health;
    if (healthRules.allowed && age >= healthRules.minAge && age <= healthRules.maxAge) {
        healthRiderContainer.classList.remove('hidden');
        getFormElements().healthRiderCheck.disabled = healthRules.mandatory;
        getFormElements().healthRiderCheck.checked = healthRules.mandatory;
        toggleHealthRiderOptions();
    } else {
        healthRiderContainer.classList.add('hidden');
        getFormElements().healthRiderCheck.checked = false;
        toggleHealthRiderOptions();
    }


    const ciRules = productRules.riders.ci;
    if (ciRules.allowed && age >= ciRules.minAge && age <= ciRules.maxAge) {
        ciRiderContainer.classList.remove('hidden');
    } else {
        ciRiderContainer.classList.add('hidden');
        getFormElements().ciRiderCheck.checked = false;
        toggleCiRiderOptions();
    }
}

export function toggleHealthRiderOptions() {
    const { healthRiderCheck, healthRiderOptions } = getFormElements();
    healthRiderOptions.classList.toggle('hidden', !healthRiderCheck.checked);
}

export function toggleCiRiderOptions() {
    const { ciRiderCheck, ciRiderOptions } = getFormElements();
    ciRiderOptions.classList.toggle('hidden', !ciRiderCheck.checked);
}

export function updateAbuvTermOptions(age) {
    const select = getFormElements().premiumTermAbuv;
    select.innerHTML = '';
    const options = [
        { value: 5, text: '5 năm', maxAge: 65 },
        { value: 10, text: '10 năm', maxAge: 60 },
        { value: 15, text: '15 năm', maxAge: 55 },
    ];
    options.forEach(opt => {
        if (age <= opt.maxAge) {
            const optionEl = document.createElement('option');
            optionEl.value = opt.value;
            optionEl.textContent = opt.text;
            select.appendChild(optionEl);
        }
    });
}

export function updateMulPremiumRange(range) {
    const rangeDisplay = getFormElements().mulPremiumRange;
    if (range) {
        rangeDisplay.textContent = `Phí hợp lệ: ${range.min.toLocaleString('vi-VN')} - ${range.max.toLocaleString('vi-VN')} VNĐ`;
    } else {
        rangeDisplay.textContent = 'Vui lòng nhập Số tiền bảo hiểm.';
    }
}

export function updatePulPremiumDisplay(premium) {
     const premiumDisplay = getFormElements().mainPremiumPul;
     if (premium) {
        premiumDisplay.value = premium.toLocaleString('vi-VN');
     } else {
        premiumDisplay.value = '';
     }
}

export function updateHealthProgramOptions(productKey, mainPremium) {
    const select = getFormElements().healthProgram;
    select.innerHTML = '';
    
    if (!productKey) return;
    const productRules = PRODUCT_RULES[productKey];
    if (!productRules || !productRules.riders.health.allowed) return;

    const programs = [
        { value: 'basic', text: 'Cơ bản' },
        { value: 'advanced', text: 'Nâng cao' },
        { value: 'comprehensive', text: 'Toàn diện' },
        { value: 'perfect', text: 'Hoàn hảo' },
    ];
    
    let allowedPrograms = [];
    if (productKey === 'TTA') {
        allowedPrograms = programs.map(p => p.value);
    } else if (mainPremium) {
         if (mainPremium >= 15000000) allowedPrograms = ['basic', 'advanced', 'comprehensive', 'perfect'];
         else if (mainPremium >= 10000000) allowedPrograms = ['basic', 'advanced', 'comprehensive'];
         else if (mainPremium >= 5000000) allowedPrograms = ['basic', 'advanced'];
    }

    programs.forEach(p => {
        if (allowedPrograms.includes(p.value)) {
            const optionEl = document.createElement('option');
            optionEl.value = p.value;
            optionEl.textContent = p.text;
            select.appendChild(optionEl);
        }
    });
}

export function setMainPremiumError(message) {
    getFormElements().mainPremiumError.textContent = message;
}

export function setTopupError(message) {
    getFormElements().topupPremiumError.textContent = message;
}

function renderSummaryInfo(inputs) {
    const { summaryInfo } = getFormElements();
    summaryInfo.innerHTML = '';
    const age = calculateAge(inputs.dob);
    const mainPremium = calculateMainPremium(inputs);
    
    const info = {
        "Bên mua bảo hiểm": inputs.name,
        "Tuổi": `${age} (${inputs.gender})`,
        "Sản phẩm chính": PRODUCT_RULES[inputs.product].name,
        "Số tiền bảo hiểm": (inputs.sumAssuredPul || inputs.sumAssuredAbuv || (inputs.product === 'TTA' ? 100000000 : 0)).toLocaleString('vi-VN') + " VNĐ",
        "Phí chính năm đầu": mainPremium.toLocaleString('vi-VN') + " VNĐ",
        "Thời hạn đóng phí": (inputs.premiumTermPul || inputs.premiumTermAbuv || (inputs.product === 'TTA' ? 10 : 'N/A')) + " năm",
    };

    if (inputs.healthRider.participate) {
        info["SP Bổ trợ Sức khỏe"] = "Có";
    }
    if (inputs.ciRider.participate) {
        info["SP Bổ trợ Bệnh hiểm nghèo"] = "Có";
        info["STBH Bệnh hiểm nghèo"] = inputs.ciRider.sumAssured.toLocaleString('vi-VN') + " VNĐ";
    }

    for (const [key, value] of Object.entries(info)) {
        summaryInfo.innerHTML += `
            <div class="border-t border-gray-200 pt-2">
                <dt class="font-medium text-gray-900">${key}</dt>
                <dd class="mt-1 text-gray-700">${value}</dd>
            </div>
        `;
    }
}

function renderSummaryBenefits(inputs) {
    const { summaryBenefits, summaryBenefitsContainer } = getFormElements();
    summaryBenefits.innerHTML = '';

    if (!inputs.healthRider.participate) {
        summaryBenefitsContainer.classList.add('hidden');
        return;
    }
    summaryBenefitsContainer.classList.remove('hidden');

    const program = inputs.healthRider.program;
    const programText = getFormElements().healthProgram.options[getFormElements().healthProgram.selectedIndex]?.text || '';
    
    let benefitsHtml = `
        <div class="p-4 bg-gray-50 rounded-lg border">
            <h4 class="font-semibold text-gray-800">Quyền lợi sản phẩm "Sức khoẻ bùng gia lực" - Chương trình: ${programText}</h4>
            <div class="overflow-x-auto mt-2">
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-200">
                        <tr>
                            <th class="text-left p-2 font-semibold">Quyền lợi</th>
                            <th class="text-right p-2 font-semibold">Giới hạn</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    HEALTH_BENEFITS.forEach(benefit => {
        const value = benefit[program] ? (typeof benefit[program] === 'number' ? benefit[program].toLocaleString('vi-VN') + ' VNĐ' : benefit[program]) : '-';
        benefitsHtml += `
            <tr class="border-b">
                <td class="p-2">${benefit.name} ${benefit.sub ? `<span class="text-xs text-gray-500 block">${benefit.sub}</span>` : ''}</td>
                <td class="p-2 text-right font-medium">${value}</td>
            </tr>
        `;
    });

    benefitsHtml += `</tbody></table></div></div>`;
    summaryBenefits.innerHTML = benefitsHtml;
}


function renderIllustrationTable(inputs, illustrationData) {
    const { illustrationTable } = getFormElements();
    
    const hasHealthRider = inputs.healthRider.participate;
    const hasCiRider = inputs.ciRider.participate;

    let theadHtml = '<tr><th class="text-left">Năm HĐ</th><th class="text-left">Tuổi</th><th>Phí SP Chính</th>';
    if(hasHealthRider) theadHtml += '<th>Phí SKBL</th>';
    if(hasCiRider) theadHtml += '<th>Phí BHN</th>';
    theadHtml += '<th>Tổng Phí</th></tr>';

    let tbodyHtml = '';
    illustrationData.rows.forEach(row => {
        tbodyHtml += `
            <tr>
                <td class="text-left">${row.year}</td>
                <td class="text-left">${row.age}</td>
                <td>${row.mainPremium.toLocaleString('vi-VN')}</td>
                ${hasHealthRider ? `<td>${row.healthPremium > 0 ? row.healthPremium.toLocaleString('vi-VN') : 'N/A'}</td>` : ''}
                ${hasCiRider ? `<td>${row.ciPremium > 0 ? row.ciPremium.toLocaleString('vi-VN') : 'N/A'}</td>` : ''}
                <td class="font-semibold">${row.total.toLocaleString('vi-VN')}</td>
            </tr>
        `;
    });
    
    let tfootHtml = '<tr><td colspan="2" class="text-left">Tổng cộng</td>';
    tfootHtml += `<td>${illustrationData.totals.mainPremium.toLocaleString('vi-VN')}</td>`;
    if (hasHealthRider) tfootHtml += `<td>${illustrationData.totals.healthPremium.toLocaleString('vi-VN')}</td>`;
    if (hasCiRider) tfootHtml += `<td>${illustrationData.totals.ciPremium.toLocaleString('vi-VN')}</td>`;
    tfootHtml += `<td>${illustrationData.totals.total.toLocaleString('vi-VN')}</td></tr>`;
    
    illustrationTable.querySelector('thead').innerHTML = theadHtml;
    illustrationTable.querySelector('tbody').innerHTML = tbodyHtml;
    illustrationTable.querySelector('tfoot').innerHTML = tfootHtml;
}

export function renderIllustration(inputs, illustrationData) {
    renderSummaryInfo(inputs);
    renderSummaryBenefits(inputs);
    renderIllustrationTable(inputs, illustrationData);
}
