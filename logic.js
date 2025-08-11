import { product_data } from './data.js';

let supplementaryInsuredCount = 0;
let currentMainProductState = { product: null, age: null };

const MAX_ENTRY_AGE = {
    PUL_TRON_DOI: 70, PUL_15_NAM: 70, PUL_5_NAM: 70, KHOE_BINH_AN: 70, VUNG_TUONG_LAI: 70,
    TRON_TAM_AN: 60, AN_BINH_UU_VIET: 65,
    health_scl: 65, bhn: 70, accident: 64, hospital_support: 55
};

const MAX_RENEWAL_AGE = {
    health_scl: 74, bhn: 85, accident: 65, hospital_support: 59
};

const MAX_STBH = {
    bhn: 5_000_000_000,
    accident: 8_000_000_000
};

// Ngày tham chiếu tính tuổi
const REFERENCE_DATE = new Date(2025, 7, 9); // tháng 8 là index 7

// --- ADDED: lưu summary gần nhất để dùng khi thay đổi 'kỳ đóng phí'
window.lastSummaryPrem = {
    baseMainPremium: 0,
    extraPremium: 0,
    mainPremium: 0,
    totalSupplementaryPremium: 0,
    totalPremium: 0
};

document.addEventListener('DOMContentLoaded', () => {
    initPerson(document.getElementById('main-person-container'), 'main');
    initMainProductLogic();
    initSupplementaryButton();
    initSummaryModal();
    attachGlobalListeners();
    updateSupplementaryAddButtonState();
    observeSupplementaryContainer(); // Bật bản vá: theo dõi thêm/xóa người
    calculateAll();

    // Ensure the payment frequency UI exists (Năm (default), Nửa năm, Quý)
    ensurePaymentFrequencyUI();

    // ===== MDP3 BỔ SUNG =====
    if (window.MDP3) MDP3.init();
});

// ===== Helpers làm tròn & validate DOB =====
function roundDownTo1000(n) {
    n = Number(n) || 0;
    if (n <= 0) return 0;
    return Math.floor(n / 1000) * 1000;
}

function roundInputToThousand(input) {
    if (!input) return;
    // Loại trừ các input không phải tiền và Hỗ trợ viện phí (bội số 100.000)
    if (
        input.classList.contains('dob-input') ||
        input.classList.contains('occupation-input') ||
        input.classList.contains('name-input') ||
        input.classList.contains('hospital-support-stbh')
    ) return;

    const raw = parseFormattedNumber(input.value || '');
    if (!raw) { input.value = ''; return; }
    const rounded = roundDownTo1000(raw);
    input.value = rounded.toLocaleString('vi-VN');
}

function validateDobField(input) {
    if (!input) return false;
    const v = (input.value || '').trim();
    const re = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!re.test(v)) {
        setFieldError(input, 'Ngày sinh không hợp lệ, nhập DD/MM/YYYY');
        return false;
    }
    const [dd, mm, yyyy] = v.split('/').map(n => parseInt(n, 10));
    const d = new Date(yyyy, mm - 1, dd);
    const valid = d.getFullYear() === yyyy && d.getMonth() === (mm - 1) && d.getDate() === dd && d <= REFERENCE_DATE;
    if (!valid) {
        setFieldError(input, 'Ngày sinh không hợp lệ, nhập DD/MM/YYYY');
        return false;
    }
    clearFieldError(input);
    return true;
}

// Cập nhật: tất cả hiển thị tiền sẽ làm tròn xuống 1.000 trước khi format
function formatCurrency(value, suffix = ' VNĐ') {
    const num = Number(value) || 0;
    const rounded = roundDownTo1000(num);
    return rounded.toLocaleString('vi-VN') + suffix;
}

function attachGlobalListeners() {
    const allInputs = 'input, select';
    document.body.addEventListener('change', (e) => {
        const checkboxSelectors = [
            '.health-scl-checkbox',
            '.bhn-checkbox',
            '.accident-checkbox',
            '.hospital-support-checkbox'
        ];
        if (checkboxSelectors.some(selector => e.target.matches(selector))) {
            const section = e.target.closest('.product-section');
            const options = section.querySelector('.product-options');
            if (e.target.checked && !e.target.disabled) {
                options.classList.remove('hidden');
            } else {
                options.classList.add('hidden');
            }
            calculateAll();
        } else if (e.target.matches(allInputs)) {
            calculateAll();
        }

        // ===== MDP3 BỔ SUNG ===== reset nếu thay đổi ngoài khu MDP3 và thuộc phạm vi cần reset
        if (window.MDP3 && !e.target.closest('#mdp3-section')) {
            const resetSelectors = [
                '.dob-input',
                '.health-scl-checkbox', '.health-scl-program', '.health-scl-scope', '.health-scl-outpatient', '.health-scl-dental',
                '.bhn-checkbox', '.bhn-stbh',
                '.accident-checkbox', '.accident-stbh',
                '.hospital-support-checkbox', '.hospital-support-stbh'
            ];
            if (resetSelectors.some(sel => e.target.matches(sel))) {
                MDP3.resetIfEnabled();
            }
        }
    });
    document.body.addEventListener('input', (e) => {
        if (e.target.matches('input[type="text"]') && !e.target.classList.contains('dob-input') &&
            !e.target.classList.contains('occupation-input') &&
            !e.target.classList.contains('name-input')) {
            formatNumberInput(e.target);
            calculateAll();
        } else if (e.target.matches('input[type="number"]')) {
            calculateAll();
        }

        // ===== MDP3 BỔ SUNG ===== reset khi gõ DOB/STBH SPBS (ngoài khu MDP3)
        if (window.MDP3 && !e.target.closest('#mdp3-section')) {
            const resetSelectors = [
                '.dob-input',
                '.bhn-stbh', '.accident-stbh', '.hospital-support-stbh'
            ];
            if (resetSelectors.some(sel => e.target.matches(sel))) {
                MDP3.resetIfEnabled();
            }
        }
    });

    // NEW: auto làm tròn 1.000 khi rời ô tiền + validate DOB cho NĐBH bổ sung/MDP3
    document.body.addEventListener('focusout', (e) => {
        if (e.target.matches('input[type="text"]')) {
            // Round 1.000 cho các input tiền tệ (trừ hospital-support-stbh)
            roundInputToThousand(e.target);

            // Validate DOB cho NĐBH bổ sung & "Người khác" (MDP3). NĐBH chính đã có validate riêng
            if (e.target.classList.contains('dob-input') && !e.target.closest('#main-person-container')) {
                validateDobField(e.target);
            }
            calculateAll();
        }
    }, true);
}

function initPerson(container, personId, isSupp = false) {
    if (!container) return;
    container.dataset.personId = personId;

    initDateFormatter(container.querySelector('.dob-input'));
    initOccupationAutocomplete(container.querySelector('.occupation-input'), container);

    // Nếu là NĐBH chính -> gắn validate khi blur/input
    if (!isSupp) {
        const nameInput = container.querySelector('.name-input');
        const dobInput = container.querySelector('.dob-input');
        const occInput = container.querySelector('.occupation-input');

        nameInput?.addEventListener('blur', validateMainPersonInputs);
        nameInput?.addEventListener('input', validateMainPersonInputs);

        dobInput?.addEventListener('blur', validateMainPersonInputs);
        dobInput?.addEventListener('input', validateMainPersonInputs);
        // ===== MDP3 BỔ SUNG ===== sửa DOB của NĐBH chính -> reset nếu đang bật
        dobInput?.addEventListener('input', () => { if (window.MDP3) MDP3.resetIfEnabled(); });

        occInput?.addEventListener('input', validateMainPersonInputs);
        occInput?.addEventListener('blur', validateMainPersonInputs);
    } else {
        // Validate DOB cho mọi NĐBH bổ sung
        const dobInput = container.querySelector('.dob-input');
        dobInput?.addEventListener('blur', () => validateDobField(dobInput));
        dobInput?.addEventListener('input', () => validateDobField(dobInput));
    }

    const suppProductsContainer = isSupp ? container.querySelector('.supplementary-products-container') : document.querySelector('#main-supp-container .supplementary-products-container');
    suppProductsContainer.innerHTML = generateSupplementaryProductsHtml(personId);

    const sclSection = suppProductsContainer.querySelector('.health-scl-section');
    if (sclSection) {
        const mainCheckbox = sclSection.querySelector('.health-scl-checkbox');
        const programSelect = sclSection.querySelector('.health-scl-program');
        const scopeSelect = sclSection.querySelector('.health-scl-scope');
        const outpatientCheckbox = sclSection.querySelector('.health-scl-outpatient');
        const dentalCheckbox = sclSection.querySelector('.health-scl-dental');

        const handleProgramChange = () => {
            const programChosen = programSelect.value !== '';
            outpatientCheckbox.disabled = !programChosen;
            dentalCheckbox.disabled = !programChosen;
            updateHealthSclStbhInfo(sclSection);
            if (!programChosen) {
                outpatientCheckbox.checked = false;
                dentalCheckbox.checked = false;
            }
            calculateAll();
        };

        const handleMainCheckboxChange = () => {
            const isChecked = mainCheckbox.checked && !mainCheckbox.disabled;
            const options = sclSection.querySelector('.product-options');
            options.classList.toggle('hidden', !isChecked);
            if (isChecked) {
                if (!programSelect.value) programSelect.value = 'nang_cao';
                if (!scopeSelect.value) scopeSelect.value = 'main_vn';
                updateHealthSclStbhInfo(sclSection);
            } else {
                programSelect.value = '';
                outpatientCheckbox.checked = false;
                dentalCheckbox.checked = false;
                updateHealthSclStbhInfo(sclSection);
            }
            handleProgramChange();
            calculateAll();
        };

        programSelect.addEventListener('change', handleProgramChange);
        mainCheckbox.addEventListener('change', handleMainCheckboxChange);
    }

    ['bhn', 'accident', 'hospital-support'].forEach(product => {
        const section = suppProductsContainer.querySelector(`.${product}-section`);
        if (section) {
            const checkbox = section.querySelector(`.${product}-checkbox`);
            const handleCheckboxChange = () => {
                const isChecked = checkbox.checked && !checkbox.disabled;
                const options = section.querySelector('.product-options');
                options.classList.toggle('hidden', !isChecked);
                calculateAll();
            };
            checkbox.addEventListener('change', handleCheckboxChange);
        }
    });

    // Làm tròn viện phí đến 100.000 khi rời input
    const hsInput = suppProductsContainer.querySelector('.hospital-support-section .hospital-support-stbh');
    if (hsInput) {
        hsInput.addEventListener('blur', () => {
            const raw = parseFormattedNumber(hsInput.value || '0');
            if (raw <= 0) return;
            const rounded = Math.round(raw / 100000) * 100000;
            if (rounded !== raw) {
                hsInput.value = rounded.toLocaleString('vi-VN');
            }
            calculateAll();
        });
    }
}

function initMainProductLogic() {
    document.getElementById('main-product').addEventListener('change', () => {
        updateSupplementaryAddButtonState();
        // ===== MDP3 BỔ SUNG ===== đổi SP chính -> reset MDP3
        if (window.MDP3) MDP3.reset();
        calculateAll();
    });
}

function getSupplementaryCount() {
    return document.querySelectorAll('#supplementary-insured-container .person-container').length;
}
function updateSupplementaryAddButtonState() {
    const btn = document.getElementById('add-supp-insured-btn');
    if (!btn) return;
    const mainProduct = document.getElementById('main-product')?.value || '';
    const count = getSupplementaryCount();
    const disabled = (mainProduct === 'TRON_TAM_AN') || (count >= 10);
    btn.disabled = disabled;
    btn.classList.toggle('opacity-50', disabled);
    btn.classList.toggle('cursor-not-allowed', disabled);
}
// Bản vá: theo dõi container để tự cập nhật nút Thêm
function observeSupplementaryContainer() {
    const cont = document.getElementById('supplementary-insured-container');
    if (!cont || cont._observerAttached) return;
    const observer = new MutationObserver(() => {
        updateSupplementaryAddButtonState();
    });
    observer.observe(cont, { childList: true });
    cont._observerAttached = true;
}

function initSupplementaryButton() {
    document.getElementById('add-supp-insured-btn').addEventListener('click', () => {
        if (getSupplementaryCount() >= 10) {
            updateSupplementaryAddButtonState();
            return;
        }
        supplementaryInsuredCount++;
        const personId = `supp${supplementaryInsuredCount}`;
        const container = document.getElementById('supplementary-insured-container');
        const newPersonDiv = document.createElement('div');
        newPersonDiv.className = 'person-container space-y-6 bg-gray-100 p-4 rounded-lg mt-4';
        newPersonDiv.id = `person-container-${personId}`;
        newPersonDiv.innerHTML = generateSupplementaryPersonHtml(personId, supplementaryInsuredCount);
        container.appendChild(newPersonDiv);
        initPerson(newPersonDiv, personId, true);
        updateSupplementaryAddButtonState();

        // ===== MDP3 BỔ SUNG ===== thêm người -> reset MDP3 trước khi tính
        if (window.MDP3) MDP3.reset();

        calculateAll();
    });
}
function initSummaryModal() {
    const modal = document.getElementById('summary-modal');
    document.getElementById('view-summary-btn').addEventListener('click', generateSummaryTable);
    document.getElementById('close-summary-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    // Xử lý input target-age-input
    const targetAgeInput = document.getElementById('target-age-input');
    const mainPersonContainer = document.getElementById('main-person-container');
    const mainPersonInfo = getCustomerInfo(mainPersonContainer, true);
    const mainProduct = mainPersonInfo.mainProduct;

    if (mainProduct === 'TRON_TAM_AN') {
        targetAgeInput.value = mainPersonInfo.age + 10 - 1;
        targetAgeInput.disabled = true;
    } else if (mainProduct === 'AN_BINH_UU_VIET') {
        const termSelect = document.getElementById('abuv-term');
        const term = parseInt(termSelect?.value || '15', 10);
        targetAgeInput.value = mainPersonInfo.age + term - 1;
        targetAgeInput.disabled = true;
    } else {
        const paymentTermInput = document.getElementById('payment-term');
        const paymentTerm = paymentTermInput ? parseInt(paymentTermInput.value, 10) || 0 : 0;
        targetAgeInput.disabled = false;
        targetAgeInput.min = mainPersonInfo.age + paymentTerm - 1;
        if (!targetAgeInput.value || parseInt(targetAgeInput.value, 10) < mainPersonInfo.age + paymentTerm - 1) {
            targetAgeInput.value = mainPersonInfo.age + paymentTerm - 1;
        }
    }

    const abuvTermSelect = document.getElementById('abuv-term');
    document.getElementById('main-product').addEventListener('change', () => {
        updateTargetAge();
        if (document.getElementById('summary-modal').classList.contains('hidden')) {
            calculateAll();
        } else {
            generateSummaryTable();
        }
    });

    const mainDobInput = document.querySelector('#main-person-container .dob-input');
    if (mainDobInput) {
        mainDobInput.addEventListener('input', () => {
            updateTargetAge();
            if (document.getElementById('summary-modal').classList.contains('hidden')) {
                calculateAll();
            } else {
                generateSummaryTable();
            }
        });
    }

    if (abuvTermSelect) {
        abuvTermSelect.addEventListener('change', () => {
            updateTargetAge();
            if (document.getElementById('summary-modal').classList.contains('hidden')) {
                calculateAll();
            } else {
                generateSummaryTable();
            }
        });
    }
    document.getElementById('payment-term')?.addEventListener('change', () => {
        updateTargetAge();
        if (document.getElementById('summary-modal').classList.contains('hidden')) {
            calculateAll();
        } else {
            generateSummaryTable();
        }
    });
}

function updateTargetAge() {
    const mainPersonContainer = document.getElementById('main-person-container');
    const mainPersonInfo = getCustomerInfo(mainPersonContainer, true);
    const mainProduct = mainPersonInfo.mainProduct;
    const targetAgeInput = document.getElementById('target-age-input');

    if (mainProduct === 'TRON_TAM_AN') {
        targetAgeInput.value = mainPersonInfo.age + 10 - 1;
        targetAgeInput.disabled = true;
    } else if (mainProduct === 'AN_BINH_UU_VIET') {
        const termSelect = document.getElementById('abuv-term');
        const term = termSelect ? parseInt(termSelect.value || '15', 10) : 15;
        targetAgeInput.value = mainPersonInfo.age + term - 1;
        targetAgeInput.disabled = true;
    } else {
        const paymentTermInput = document.getElementById('payment-term');
        const paymentTerm = paymentTermInput ? parseInt(paymentTermInput.value, 10) || 0 : 0;
        targetAgeInput.disabled = false;
        targetAgeInput.min = mainPersonInfo.age + paymentTerm - 1;
        if (!targetAgeInput.value || parseInt(targetAgeInput.value, 10) < mainPersonInfo.age + paymentTerm - 1) {
            targetAgeInput.value = mainPersonInfo.age + paymentTerm - 1;
        }
    }
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

// Autocomplete nghề: dùng mousedown để chọn trước blur
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
        calculateAll();
    };

    const renderList = (filtered) => {
        autocompleteContainer.innerHTML = '';
        if (filtered.length === 0) {
            autocompleteContainer.classList.add('hidden');
            return;
        }
        filtered.forEach(occ => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = occ.name;
            item.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                applyOccupation(occ);
            });
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
        const filtered = product_data.occupations
            .filter(o => o.group > 0 && o.name.toLowerCase().includes(value));
        renderList(filtered);
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            const typed = (input.value || '').trim().toLowerCase();
            const match = product_data.occupations.find(o => o.group > 0 && o.name.toLowerCase() === typed);
            if (typed && match) {
                applyOccupation(match);
            } else {
                input.dataset.group = '';
                if (riskGroupSpan) riskGroupSpan.textContent = '...';
                setFieldError(input, 'Chọn nghề nghiệp từ danh sách');
                autocompleteContainer.classList.add('hidden');
                calculateAll();
            }
        }, 0);
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            autocompleteContainer.classList.add('hidden');
        }
    });
}

function getCustomerInfo(container, isMain = false) {
    const dobInput = container.querySelector('.dob-input');
    const genderSelect = container.querySelector('.gender-select');
    const occupationInput = container.querySelector('.occupation-input');
    const ageSpan = container.querySelector('.age-span');
    const riskGroupSpan = container.querySelector('.risk-group-span');
    const nameInput = container.querySelector('.name-input');

    let age = 0;
    let daysFromBirth = 0;

    const dobStr = dobInput ? dobInput.value : '';
    if (dobStr && /^\d{2}\/\d{2}\/\d{4}$/.test(dobStr)) {
        const [dd, mm, yyyy] = dobStr.split('/').map(n => parseInt(n, 10));
        const birthDate = new Date(yyyy, mm - 1, dd);
        const isValidDate = birthDate.getFullYear() === yyyy && (birthDate.getMonth() === (mm - 1)) && birthDate.getDate() === dd;
        if (isValidDate && birthDate <= REFERENCE_DATE) {
            const diffMs = REFERENCE_DATE - birthDate;
            daysFromBirth = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            age = REFERENCE_DATE.getFullYear() - birthDate.getFullYear();
            const m = REFERENCE_DATE.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && REFERENCE_DATE.getDate() < birthDate.getDate())) {
                age--;
            }
        }
    }

    if (ageSpan) ageSpan.textContent = age;
    const riskGroup = occupationInput ? parseInt(occupationInput.dataset.group, 10) || 0 : 0;
    if (riskGroupSpan) riskGroupSpan.textContent = riskGroup > 0 ? riskGroup : '...';

    const info = {
        age,
        daysFromBirth,
        gender: genderSelect ? genderSelect.value : 'Nam',
        riskGroup,
        container,
        name: nameInput ? nameInput.value : 'NĐBH Chính'
    };

    if (isMain) {
        info.mainProduct = document.getElementById('main-product').value;
    }

    return info;
}
function calculateAll() {
    try {
        clearError();
        validateMainPersonInputs();

        const mainPersonContainer = document.getElementById('main-person-container');
        const mainPersonInfo = getCustomerInfo(mainPersonContainer, true);

        updateMainProductVisibility(mainPersonInfo);
        validateSection2FieldsPreCalc(mainPersonInfo);

        const baseMainPremium = calculateMainPremium(mainPersonInfo);
        validateExtraPremiumLimit(baseMainPremium);
        const extraPremium = getExtraPremiumValue();
        const mainPremiumDisplay = baseMainPremium + extraPremium;

        updateMainProductFeeDisplay(baseMainPremium, extraPremium);
        updateSupplementaryProductVisibility(
            mainPersonInfo,
            baseMainPremium,
            document.querySelector('#main-supp-container .supplementary-products-container')
        );

        let totalSupplementaryPremium = 0;
        let totalHospitalSupportStbh = 0;

        // ===== MDP3 BỔ SUNG ===== reset bảng phí từng người
        window.personFees = {};

        document.querySelectorAll('.person-container').forEach(container => {
            const isMain = container.id === 'main-person-container';
            const personInfo = getCustomerInfo(container, isMain);
            const suppProductsContainer = isMain ?
                document.querySelector('#main-supp-container .supplementary-products-container') :
                container.querySelector('.supplementary-products-container');

            // Khởi tạo dữ liệu phí của người này
            window.personFees[container.id] = { 
                    main: isMain ? mainPremiumDisplay : 0, 
                    mainBase: isMain ? baseMainPremium : 0, // phí chính thuần, KHÔNG gồm extra
                    supp: 0, 
                    total: 0 
                };

            if (!suppProductsContainer) return;

            updateSupplementaryProductVisibility(personInfo, baseMainPremium, suppProductsContainer);

            // Tính từng sản phẩm bổ sung và cộng vào dữ liệu người
            let fee = 0;
            fee = calculateHealthSclPremium(personInfo, suppProductsContainer);
            totalSupplementaryPremium += fee;
            window.personFees[container.id].supp += fee;

            fee = calculateBhnPremium(personInfo, suppProductsContainer);
            totalSupplementaryPremium += fee;
            window.personFees[container.id].supp += fee;

            fee = calculateAccidentPremium(personInfo, suppProductsContainer);
            totalSupplementaryPremium += fee;
            window.personFees[container.id].supp += fee;

            fee = calculateHospitalSupportPremium(
                personInfo, baseMainPremium, suppProductsContainer, totalHospitalSupportStbh
            );
            totalSupplementaryPremium += fee;
            window.personFees[container.id].supp += fee;

            // Tính tổng STBH hỗ trợ viện phí
            const hospitalSupportStbh =
                parseFormattedNumber(suppProductsContainer.querySelector('.hospital-support-stbh')?.value || '0');
            if (
                suppProductsContainer.querySelector('.hospital-support-checkbox')?.checked &&
                hospitalSupportStbh > 0
            ) {
                totalHospitalSupportStbh += hospitalSupportStbh;
            }

            window.personFees[container.id].total =
                window.personFees[container.id].main + window.personFees[container.id].supp;
        });

        // ===== MDP3 BỔ SUNG ===== cộng phí từ Module MDP3 nếu có
        if (window.MDP3) {
            const mdp3Fee = MDP3.getPremium();
            totalSupplementaryPremium += mdp3Fee;
            // nếu MDP3 ảnh hưởng đến personFees, module MDP3 nên cập nhật window.personFees tương ứng
        }

        const totalPremium = mainPremiumDisplay + totalSupplementaryPremium;

        // --- CHANGED: lưu lại summary để khi đổi Kỳ đóng phí chỉ cần re-render
        window.lastSummaryPrem = {
            baseMainPremium,
            extraPremium,
            mainPremium: mainPremiumDisplay,
            totalSupplementaryPremium,
            totalPremium
        };

        updateSummaryUI({
            mainPremium: mainPremiumDisplay,
            totalSupplementaryPremium,
            totalPremium
        });

    } catch (error) {
        showError(error.message);
        updateSummaryUI({ mainPremium: 0, totalSupplementaryPremium: 0, totalPremium: 0 });
    }
}
function updateMainProductVisibility(customer) {
    const { age, daysFromBirth, gender, riskGroup } = customer;
    const mainProductSelect = document.getElementById('main-product');

    document.querySelectorAll('#main-product option').forEach(option => {
        const productKey = option.value;
        if (!productKey) return;

        let isEligible = true;

        // PUL & MUL: 30 ngày tuổi đến 70 tuổi
        const PUL_MUL = ['PUL_TRON_DOI', 'PUL_15_NAM', 'PUL_5_NAM', 'KHOE_BINH_AN', 'VUNG_TUONG_LAI'];
        if (PUL_MUL.includes(productKey)) {
            isEligible = (daysFromBirth >= 30) && (age <= 70);
        }

        // Trọn Tâm An: Nam 12-60, Nữ 28-60; không bán cho nhóm nghề 4
        if (productKey === 'TRON_TAM_AN') {
            const withinAgeByGender = (gender === 'Nam')
                ? (age >= 12 && age <= 60)
                : (age >= 28 && age <= 60);
            isEligible = withinAgeByGender && (riskGroup !== 4);
        }

        // An Bình Ưu Việt: Nam >=12, Nữ >=28; tối đa 65
        if (productKey === 'AN_BINH_UU_VIET') {
            const minOk = (gender === 'Nam') ? age >= 12 : age >= 28;
            isEligible = minOk && (age <= 65);
        }

        option.disabled = !isEligible;
        option.classList.toggle('hidden', !isEligible);
    });

    if (mainProductSelect.options[mainProductSelect.selectedIndex]?.disabled) {
        mainProductSelect.value = "";
    }

    const newProduct = mainProductSelect.value;

    if (newProduct === 'TRON_TAM_AN') {
        document.getElementById('supplementary-insured-container').classList.add('hidden');
        document.getElementById('add-supp-insured-btn').classList.add('hidden');
        // Xóa tất cả NĐBH bổ sung
        supplementaryInsuredCount = 0;
        document.getElementById('supplementary-insured-container').innerHTML = '';
    } else {
        document.getElementById('supplementary-insured-container').classList.remove('hidden');
        document.getElementById('add-supp-insured-btn').classList.remove('hidden');
    }

    if (currentMainProductState.product !== newProduct || currentMainProductState.age !== age) {
        renderMainProductOptions(customer);
        currentMainProductState.product = newProduct;
        currentMainProductState.age = age;
    }
}

function updateSupplementaryProductVisibility(customer, mainPremium, container) {
    const { age, riskGroup, daysFromBirth } = customer;
    const mainProduct = document.getElementById('main-product').value;

    const showOrHide = (sectionId, productKey, condition) => {
        const section = container.querySelector(`.${sectionId}-section`);
        if (!section) {
            console.error(`Không tìm thấy section ${sectionId}`);
            return;
        }
        const checkbox = section.querySelector('input[type="checkbox"]');
        const options = section.querySelector('.product-options');
        const finalCondition = condition
            && daysFromBirth >= 30
            && age >= 0 && age <= MAX_ENTRY_AGE[productKey]
            && (sectionId !== 'health-scl' || riskGroup !== 4);

        if (finalCondition) {
            section.classList.remove('hidden');
            checkbox.disabled = false;
            options.classList.toggle('hidden', !checkbox.checked || checkbox.disabled);

            if (sectionId === 'health-scl') {
                const programSelect = section.querySelector('.health-scl-program');
                const scopeSelect = section.querySelector('.health-scl-scope');
                const outpatient = section.querySelector('.health-scl-outpatient');
                const dental = section.querySelector('.health-scl-dental');

                if (mainProduct === 'TRON_TAM_AN') {
                    checkbox.checked = true;
                    checkbox.disabled = true;
                    options.classList.remove('hidden');
                    programSelect.disabled = false;
                    scopeSelect.disabled = false;

                    // Cho tất cả chương trình; mặc định Nâng cao
                    Array.from(programSelect.options).forEach(opt => { if (opt.value) opt.disabled = false; });
                    if (!programSelect.value || programSelect.options[programSelect.selectedIndex]?.disabled) {
                        if (!programSelect.querySelector('option[value="nang_cao"]').disabled) {
                            programSelect.value = 'nang_cao';
                        }
                    }
                    if (!scopeSelect.value) scopeSelect.value = 'main_vn';
                    // Cho phép tick Ngoại trú/Nha khoa khi TTA
                    outpatient.disabled = false;
                    dental.disabled = false;

                    updateHealthSclStbhInfo(section);
                } else {
                    // Giới hạn theo phí chính
                    programSelect.disabled = false;
                    scopeSelect.disabled = false;
                    programSelect.querySelectorAll('option').forEach(opt => {
                        if (opt.value === '') return;
                        if (mainPremium >= 15000000) {
                            opt.disabled = false;
                        } else if (mainPremium >= 10000000) {
                            opt.disabled = !['co_ban', 'nang_cao', 'toan_dien'].includes(opt.value);
                        } else if (mainPremium >= 5000000) {
                            opt.disabled = !['co_ban', 'nang_cao'].includes(opt.value);
                        } else {
                            opt.disabled = true;
                        }
                    });
                    // Mặc định "Nâng cao" nếu hợp lệ, nếu không thì lấy option đầu tiên còn enabled
                    if (!programSelect.value || programSelect.options[programSelect.selectedIndex]?.disabled) {
                        const nangCao = programSelect.querySelector('option[value="nang_cao"]');
                        if (nangCao && !nangCao.disabled) {
                            programSelect.value = 'nang_cao';
                        } else {
                            const firstEnabled = Array.from(programSelect.options).find(opt => opt.value && !opt.disabled);
                            programSelect.value = firstEnabled ? firstEnabled.value : '';
                        }
                    }
                    if (!scopeSelect.value) scopeSelect.value = 'main_vn';
                    // Tùy chọn theo việc đã chọn chương trình
                    const hasProgram = programSelect.value !== '';
                    outpatient.disabled = !hasProgram;
                    dental.disabled = !hasProgram;

                    updateHealthSclStbhInfo(section);
                }
            }
        } else {
            section.classList.add('hidden');
            checkbox.checked = false;
            checkbox.disabled = true;
            options.classList.add('hidden');
        }
    };

    const baseCondition = ['PUL_TRON_DOI', 'PUL_15_NAM', 'PUL_5_NAM', 'KHOE_BINH_AN', 'VUNG_TUONG_LAI', 'AN_BINH_UU_VIET', 'TRON_TAM_AN'].includes(mainProduct);

    showOrHide('health-scl', 'health_scl', baseCondition);
    showOrHide('bhn', 'bhn', baseCondition);
    showOrHide('accident', 'accident', baseCondition);
    showOrHide('hospital-support', 'hospital_support', baseCondition);

    if (mainProduct === 'TRON_TAM_AN') {
        ['bhn', 'accident', 'hospital-support'].forEach(id => {
            const section = container.querySelector(`.${id}-section`);
            if (section) {
                section.classList.add('hidden');
                section.querySelector('input[type="checkbox"]').checked = false;
                section.querySelector('.product-options').classList.add('hidden');
            }
        });
    }
}

function renderMainProductOptions(customer) {
    const container = document.getElementById('main-product-options');
    const { mainProduct, age } = customer;

    let currentStbh = container.querySelector('#main-stbh')?.value || '';
    let currentPremium = container.querySelector('#main-premium-input')?.value || '';
    let currentPaymentTerm = container.querySelector('#payment-term')?.value || '';
    let currentExtra = container.querySelector('#extra-premium-input')?.value || '';

    container.innerHTML = '';
    if (!mainProduct) return;

    let optionsHtml = '';

    if (mainProduct === 'TRON_TAM_AN') {
        optionsHtml = `
            <div>
                <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
                <input type="text" id="main-stbh" class="form-input bg-gray-100" value="100.000.000" disabled>
            </div>
            <div>
                <p class="text-sm text-gray-600 mt-1">Thời hạn đóng phí: 10 năm (bằng thời hạn hợp đồng). Thời gian bảo vệ: 10 năm.</p>
            </div>`;
    } else if (mainProduct === 'AN_BINH_UU_VIET') {
        optionsHtml = `
            <div>
                <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
                <input type="text" id="main-stbh" class="form-input" value="${currentStbh}" placeholder="VD: 1.000.000.000">
            </div>`;
        let termOptions = '';
        if (age <= 55) termOptions += '<option value="15">15 năm</option>';
        if (age <= 60) termOptions += '<option value="10">10 năm</option>';
        if (age <= 65) termOptions += '<option value="5">5 năm</option>';
        if (!termOptions) termOptions = '<option value="" disabled>Không có kỳ hạn phù hợp (tuổi vượt quá 65)</option>';
        optionsHtml += `
            <div>
                <label for="abuv-term" class="font-medium text-gray-700 block mb-1">Thời hạn đóng phí</label>
                <select id="abuv-term" class="form-select">${termOptions}</select>
                <p class="text-sm text-gray-500 mt-1">Thời hạn đóng phí bằng thời hạn hợp đồng.</p>
            </div>`;
    } else if (['KHOE_BINH_AN', 'VUNG_TUONG_LAI', 'PUL_TRON_DOI', 'PUL_15_NAM', 'PUL_5_NAM'].includes(mainProduct)) {
        optionsHtml = `
            <div>
                <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
                <input type="text" id="main-stbh" class="form-input" value="${currentStbh}" placeholder="VD: 1.000.000.000">
            </div>`;
        if (['KHOE_BINH_AN', 'VUNG_TUONG_LAI'].includes(mainProduct)) {
            optionsHtml += `
                <div>
                    <label for="main-premium-input" class="font-medium text-gray-700 block mb-1">Phí sản phẩm chính</label>
                    <input type="text" id="main-premium-input" class="form-input" value="${currentPremium}" placeholder="Nhập phí">
                    <div id="mul-fee-range" class="text-sm text-gray-500 mt-1"></div>
                </div>`;
        }
        const { min, max } = getPaymentTermBounds(customer.age);
        optionsHtml += `
            <div>
                <label for="payment-term" class="font-medium text-gray-700 block mb-1">Thời gian đóng phí (năm)</label>
                <input type="number" id="payment-term" class="form-input" value="${currentPaymentTerm}" placeholder="VD: 20" min="${mainProduct === 'PUL_5_NAM' ? 5 : mainProduct === 'PUL_15_NAM' ? 15 : 4}" max="${100 - age - 1}">
                <div id="payment-term-hint" class="text-sm text-gray-500 mt-1"></div>
            </div>`;
        optionsHtml += `
            <div>
                <label for="extra-premium-input" class="font-medium text-gray-700 block mb-1">Phí đóng thêm</label>
                <input type="text" id="extra-premium-input" class="form-input" value="${currentExtra || ''}" placeholder="VD: 10.000.000">
                <div class="text-sm text-gray-500 mt-1">Tối đa 5 lần phí chính.</div>
            </div>`;
    }

    container.innerHTML = optionsHtml;

    // Cập nhật gợi ý payment term
    if (['KHOE_BINH_AN', 'VUNG_TUONG_LAI', 'PUL_TRON_DOI', 'PUL_15_NAM', 'PUL_5_NAM'].includes(mainProduct)) {
        setPaymentTermHint(mainProduct, age);
    }
}

// Hiển thị phí chính ngay cả khi chưa nhập payment-term (không chặn vì thiếu/nhỏ hơn tối thiểu)
function calculateMainPremium(customer, ageOverride = null) {
    const ageToUse = ageOverride ?? customer.age;
    const { gender, mainProduct } = customer;
    let premium = 0;

    if (mainProduct.startsWith('PUL') || mainProduct === 'AN_BINH_UU_VIET' || mainProduct === 'TRON_TAM_AN') {
        let stbh = 0;
        let rate = 0;
        const stbhEl = document.getElementById('main-stbh');
        if (stbhEl) stbh = parseFormattedNumber(stbhEl.value);

        if (mainProduct !== 'TRON_TAM_AN' && stbh === 0) {
            return 0;
        }

        const genderKey = gender === 'Nữ' ? 'nu' : 'nam';

        if (mainProduct.startsWith('PUL')) {
            // Không chặn tính phí nếu payment-term thiếu/nhỏ hơn tối thiểu; chỉ hiển thị lỗi field ở validateSection2FieldsPreCalc
            const pulRate = product_data.pul_rates[mainProduct]?.find(r => r.age === customer.age)?.[genderKey] || 0;
            if (pulRate === 0 && !ageOverride) return 0;
            rate = pulRate;

            premium = (stbh / 1000) * rate;

            if (!ageOverride) {
                if (stbh > 0 && stbh < 100000000) setFieldError(stbhEl, 'STBH nhỏ hơn 100 triệu'); else clearFieldError(stbhEl);
                if (premium > 0 && premium < 5000000) setFieldError(stbhEl, 'Phí chính nhỏ hơn 5 triệu');
            }
        } else if (mainProduct === 'AN_BINH_UU_VIET') {
            const term = document.getElementById('abuv-term')?.value;
            if (!term) return 0;
            const abuvRate = product_data.an_binh_uu_viet_rates[term]?.find(r => r.age === customer.age)?.[genderKey] || 0;
            if (abuvRate === 0 && !ageOverride) return 0;
            rate = abuvRate;
            premium = (stbh / 1000) * rate;

            const stbhEl2 = document.getElementById('main-stbh');
            if (!ageOverride) {
                if (stbh > 0 && stbh < 100000000) setFieldError(stbhEl2, 'STBH nhỏ hơn 100 triệu'); else clearFieldError(stbhEl2);
                if (premium > 0 && premium < 5000000) setFieldError(stbhEl2, 'Phí chính nhỏ hơn 5 triệu');
            }
        } else if (mainProduct === 'TRON_TAM_AN') {
            stbh = 100000000;
            const term = '10';
            const ttaRate = product_data.an_binh_uu_viet_rates[term]?.find(r => r.age === customer.age)?.[genderKey] || 0;
            if (ttaRate === 0 && !ageOverride) return 0;
            rate = ttaRate;
            premium = (stbh / 1000) * rate;
        }
    } else if (['KHOE_BINH_AN', 'VUNG_TUONG_LAI'].includes(mainProduct)) {
        const stbh = parseFormattedNumber(document.getElementById('main-stbh')?.value || '0');
        const factorRow = product_data.mul_factors.find(f => ageToUse >= f.ageMin && ageToUse <= f.ageMax);
        if (!factorRow) return 0;

        const minFee = stbh / factorRow.maxFactor;
        const maxFee = stbh / factorRow.minFactor;
        const rangeEl = document.getElementById('mul-fee-range');
        if (!ageOverride && rangeEl) {
            rangeEl.textContent = `Phí hợp lệ từ ${formatCurrency(minFee, '')} đến ${formatCurrency(maxFee, '')}.`;
        }

        const enteredPremium = parseFormattedNumber(document.getElementById('main-premium-input')?.value || '0');

        if (!ageOverride) {
            const feeInput = document.getElementById('main-premium-input');
            if (stbh > 0 && enteredPremium > 0) {
                const invalid = (enteredPremium < minFee || enteredPremium > maxFee || enteredPremium < 5000000);
                if (invalid) setFieldError(feeInput, 'Phí không hợp lệ');
                else clearFieldError(feeInput);
            } else {
                clearFieldError(feeInput);
            }
        }

        premium = enteredPremium;
    }

    // NEW: luôn trả về phí đã làm tròn 1.000
    return roundDownTo1000(premium);
}

function calculateHealthSclPremium(customer, container, ageOverride = null) {
    const section = container.querySelector('.health-scl-section');
    if (!section || !section.querySelector('.health-scl-checkbox')?.checked) {
        if (section && !ageOverride) section.querySelector('.fee-display').textContent = '';
        return 0;
    }
    const ageToUse = ageOverride ?? customer.age;
    if (ageToUse > MAX_RENEWAL_AGE.health_scl) return 0;

    const program = section.querySelector('.health-scl-program').value;
    const scope = section.querySelector('.health-scl-scope').value;
    const hasOutpatient = section.querySelector('.health-scl-outpatient').checked;
    const hasDental = section.querySelector('.health-scl-dental').checked;

    const ageBandIndex = product_data.health_scl_rates.age_bands.findIndex(b => ageToUse >= b.min && ageToUse <= b.max);
    if (ageBandIndex === -1) return 0;

    let totalPremium = 0;
    totalPremium += product_data.health_scl_rates[scope]?.[ageBandIndex]?.[program] || 0;
    if (hasOutpatient) totalPremium += product_data.health_scl_rates.outpatient?.[ageBandIndex]?.[program] || 0;
    if (hasDental) totalPremium += product_data.health_scl_rates.dental?.[ageBandIndex]?.[program] || 0;

    const rounded = roundDownTo1000(totalPremium);
    if (!ageOverride) section.querySelector('.fee-display').textContent = rounded > 0 ? `Phí: ${formatCurrency(rounded)}` : '';
    return rounded;
}

function calculateBhnPremium(customer, container, ageOverride = null) {
    const section = container.querySelector('.bhn-section');
    if (!section || !section.querySelector('.bhn-checkbox')?.checked) {
        if (section && !ageOverride) section.querySelector('.fee-display').textContent = '';
        return 0;
    }
    const ageToUse = ageOverride ?? customer.age;
    if (ageToUse > MAX_RENEWAL_AGE.bhn) return 0;

    const { gender } = customer;
    const stbhInput = section.querySelector('.bhn-stbh');
    const stbhRaw = parseFormattedNumber(stbhInput?.value || '0');
    const stbh = roundDownTo1000(stbhRaw);
    if (stbh === 0) {
        if (!ageOverride) section.querySelector('.fee-display').textContent = '';
        return 0;
    }

    // NEW: min 200 triệu
    if (stbh < 200_000_000 || stbh > MAX_STBH.bhn) {
        setFieldError(stbhInput, 'STBH không hợp lệ, từ 200 triệu đến 5 tỷ');
        throw new Error('STBH không hợp lệ, từ 200 triệu đến 5 tỷ');
    } else {
        clearFieldError(stbhInput);
    }

    const rate = product_data.bhn_rates.find(r => ageToUse >= r.ageMin && ageToUse <= r.ageMax)?.[gender === 'Nữ' ? 'nu' : 'nam'] || 0;
    const premiumRaw = (stbh / 1000) * rate;
    const premium = roundDownTo1000(premiumRaw);
    if (!ageOverride) section.querySelector('.fee-display').textContent = `Phí: ${formatCurrency(premium)}`;
    return premium;
}

function calculateAccidentPremium(customer, container, ageOverride = null) {
    const section = container.querySelector('.accident-section');
    if (!section || !section.querySelector('.accident-checkbox')?.checked) {
        if (section && !ageOverride) section.querySelector('.fee-display').textContent = '';
        return 0;
    }
    const ageToUse = ageOverride ?? customer.age;
    if (ageToUse > MAX_RENEWAL_AGE.accident) return 0;

    const { riskGroup } = customer;
    if (riskGroup === 0) return 0;
    const stbhInput = section.querySelector('.accident-stbh');
    const stbhRaw = parseFormattedNumber(stbhInput?.value || '0');
    const stbh = roundDownTo1000(stbhRaw);
    if (stbh === 0) {
        if (!ageOverride) section.querySelector('.fee-display').textContent = '';
        return 0;
    }

    // NEW: min 10 triệu
    if (stbh < 10_000_000 || stbh > MAX_STBH.accident) {
        setFieldError(stbhInput, 'STBH không hợp lệ, từ 10 triệu đến 8 tỷ');
        throw new Error('STBH không hợp lệ, từ 10 triệu đến 8 tỷ');
    } else {
        clearFieldError(stbhInput);
    }

    const rate = product_data.accident_rates[riskGroup] || 0;
    const premiumRaw = (stbh / 1000) * rate;
    const premium = roundDownTo1000(premiumRaw);
    if (!ageOverride) section.querySelector('.fee-display').textContent = `Phí: ${formatCurrency(premium)}`;
    return premium;
}

function calculateHospitalSupportPremium(customer, mainPremium, container, totalHospitalSupportStbh = 0, ageOverride = null) {
    const section = container.querySelector('.hospital-support-section');
    if (!section || !section.querySelector('.hospital-support-checkbox')?.checked) {
        if (section && !ageOverride) section.querySelector('.fee-display').textContent = '';
        return 0;
    }
    const ageToUse = ageOverride ?? customer.age;
    if (ageToUse > MAX_RENEWAL_AGE.hospital_support) return 0;

    // Hạn mức chung dựa trên phí sản phẩm chính
    const totalMaxSupport = Math.floor(mainPremium / 4000000) * 100000;
    // Hạn mức theo tuổi
    const maxSupportByAge = ageToUse >= 18 ? 1_000_000 : 300_000;
    // Hạn mức còn lại
    const remainingSupport = totalMaxSupport - totalHospitalSupportStbh;

    if (!ageOverride) {
        section.querySelector('.hospital-support-validation').textContent =
            `Tối đa: ${formatCurrency(Math.min(maxSupportByAge, remainingSupport), 'đ/ngày')}. Phải là bội số của 100.000.`;
    }

    const stbh = parseFormattedNumber(section.querySelector('.hospital-support-stbh')?.value || '0');
    if (stbh === 0) {
        if (!ageOverride) section.querySelector('.fee-display').textContent = '';
        clearFieldError(section.querySelector('.hospital-support-stbh'));
        return 0;
    }
    if (stbh % 100000 !== 0) {
        setFieldError(section.querySelector('.hospital-support-stbh'), 'STBH không hợp lệ, phải là bội số 100.000');
        throw new Error('STBH không hợp lệ, phải là bội số 100.000');
    }
    if (stbh > maxSupportByAge || stbh > remainingSupport) {
        setFieldError(section.querySelector('.hospital-support-stbh'), 'Vượt quá giới hạn cho phép');
        throw new Error('Vượt quá giới hạn cho phép');
    }
    clearFieldError(section.querySelector('.hospital-support-stbh'));

    const rate = product_data.hospital_fee_support_rates.find(r => ageToUse >= r.ageMin && ageToUse <= r.ageMax)?.rate || 0;
    const premiumRaw = (stbh / 100) * rate;
    const premium = roundDownTo1000(premiumRaw);
    if (!ageOverride) section.querySelector('.fee-display').textContent = `Phí: ${formatCurrency(premium)}`;
    return premium;
}

// --- CHANGED: updateSummaryUI hiển thị chi tiết theo yêu cầu, và hỗ trợ Kỳ đóng phí
function updateSummaryUI(premiums) {
    // Nếu gọi mà ko truyền data, dùng window.lastSummaryPrem
    const data = premiums || window.lastSummaryPrem || {
        baseMainPremium: 0, extraPremium: 0, mainPremium: 0, totalSupplementaryPremium: 0, totalPremium: 0
    };

    // đảm bảo window.lastSummaryPrem có các trường cần thiết
    window.lastSummaryPrem = {
        baseMainPremium: window.lastSummaryPrem.baseMainPremium ?? (data.baseMainPremium || 0),
        extraPremium: window.lastSummaryPrem.extraPremium ?? (data.extraPremium || 0),
        mainPremium: data.mainPremium ?? window.lastSummaryPrem.mainPremium ?? 0,
        totalSupplementaryPremium: data.totalSupplementaryPremium ?? window.lastSummaryPrem.totalSupplementaryPremium ?? 0,
        totalPremium: data.totalPremium ?? window.lastSummaryPrem.totalPremium ?? 0
    };

    const baseMain = window.lastSummaryPrem.baseMainPremium || 0;
    const extra = window.lastSummaryPrem.extraPremium || 0;
    const mainTotal = window.lastSummaryPrem.mainPremium || (baseMain + extra);
    const suppTotal = window.lastSummaryPrem.totalSupplementaryPremium || 0;
    const total = window.lastSummaryPrem.totalPremium || mainTotal + suppTotal;

    // Build UI
    const resultsContainer = document.getElementById('results-container');
    if (!resultsContainer) return;

    // Create detailed summary markup (minimal invasive change)
    let html = '';

    // Main insured summary
    html += `<div class="py-2 border-b">
        <div class="flex justify-between items-center"><span class="text-gray-600">Người được bảo hiểm chính - Tổng phí:</span><span class="font-bold text-gray-900">${formatCurrency(mainTotal)}</span></div>
        <div class="mt-2 text-sm text-gray-700 pl-2">
            <div class="flex justify-between"><span>Phí sản phẩm chính:</span><span>${formatCurrency(baseMain)}</span></div>
            <div class="flex justify-between"><span>Phí đóng thêm:</span><span>${formatCurrency(extra)}</span></div>
            <div class="flex justify-between"><span>Phí sản phẩm bổ sung (NĐBH chính):</span><span>${formatCurrency(window.personFees?.['main-person-container'] ? window.personFees['main-person-container'].supp : 0)}</span></div>
        </div>
    </div>`;

    // Supplementary insured breakdown (1..n)
    const suppPersons = Array.from(document.querySelectorAll('#supplementary-insured-container .person-container'));
    if (suppPersons.length > 0 || (window.personFees && Object.keys(window.personFees).some(k => k !== 'main-person-container'))) {
        html += `<div class="py-2 border-b"><div class="text-gray-600 mb-2">Người được bảo hiểm bổ sung</div>`;
        suppPersons.forEach((p, idx) => {
            const id = p.id;
            const nameEl = p.querySelector('.name-input');
            const name = nameEl ? (nameEl.value || `NĐBH bổ sung ${idx+1}`) : `NĐBH bổ sung ${idx+1}`;
            const suppFee = window.personFees && window.personFees[id] ? window.personFees[id].supp : 0;
            html += `<div class="flex justify-between items-center py-1"><span class="text-sm">${sanitizeHtml(name)}</span><span class="font-semibold">${formatCurrency(suppFee)}</span></div>`;
        });

        // If MDP3 exists and contributed, show under extra line (module should update window.personFees)
        html += `</div>`;
    }

    // Totals
    html += `<div class="py-2 border-b mt-2">
        <div class="flex justify-between items-center"><span class="text-gray-800 font-semibold">Tổng phí (năm):</span><span class="font-bold text-aia-red">${formatCurrency(total)}</span></div>
        <div class="text-sm text-gray-600 mt-2">
            <div>+ Phí chính: ${formatCurrency(baseMain)}</div>
            <div>+ Phí đóng thêm: ${formatCurrency(extra)}</div>
            <div>+ Phí sản phẩm bổ sung: ${formatCurrency(suppTotal)}</div>
        </div>
    </div>`;

    // --- ADDED: Payment frequency selector and breakdown
    html += `<div class="mt-4">
        <label class="font-medium text-gray-700 block mb-1">Kỳ đóng phí</label>
        <div id="payment-frequency-container"></div>
        <div id="frequency-breakdown" class="mt-3 text-sm text-gray-700"></div>
    </div>`;

    resultsContainer.innerHTML = html;

    // Ensure frequency UI exists (if not)
    ensurePaymentFrequencyUI();

    // Render frequency breakdown
    renderFrequencyBreakdown();
}

function ensurePaymentFrequencyUI() {
    const container = document.getElementById('payment-frequency-container');
    if (!container) {
        // try to find results container and append
        const resultsContainer = document.getElementById('results-container');
        if (!resultsContainer) return;
        const wrapper = document.createElement('div');
        wrapper.id = 'payment-frequency-container';
        resultsContainer.appendChild(wrapper);
    }
    const cont = document.getElementById('payment-frequency-container');
    if (cont && !cont._init) {
        cont.innerHTML = `
            <select id="payment-frequency" class="form-select">
                <option value="year">Năm (mặc định)</option>
                <option value="half">Nửa năm</option>
                <option value="quarter">Quý</option>
            </select>
        `;
        const sel = cont.querySelector('#payment-frequency');
        sel.addEventListener('change', () => {
            // chỉ cần re-render summary UI - số liệu dùng window.lastSummaryPrem và window.personFees
            renderFrequencyBreakdown();
        });
        cont._init = true;
    }
}

function renderFrequencyBreakdown() {
    const sel = document.getElementById('payment-frequency');
    const freq = sel ? sel.value : 'year';
    const infoEl = document.getElementById('frequency-breakdown');
    if (!infoEl) return;

    const s = window.lastSummaryPrem || { baseMainPremium:0, extraPremium:0, mainPremium:0, totalSupplementaryPremium:0, totalPremium:0 };
    const baseMain = Number(s.baseMainPremium || 0);
    const extra = Number(s.extraPremium || 0);
    const mainTotal = Number(s.mainPremium || baseMain + extra);
    const supp = Number(s.totalSupplementaryPremium || 0);
    const total = Number(s.totalPremium || mainTotal + supp);

    // Per spec formulas:
    // Chính/đóng thêm: Nửa = năm/2, Quý = năm/4. (use Math.floor then *1,000 floor rounding)
    // Bổ sung:
    //   Nửa = floor((năm/1000 * 1.02 / 2)) * 1000
    //   Quý  = floor((năm/1000 * 1.04 / 4)) * 1000

    const floorToThousand = (v) => Math.floor(v / 1000) * 1000;

    let out = '';
    if (freq === 'year') {
        out += `<div>Không hiển thị thêm (Kỳ = Năm). Tổng năm: <strong>${formatCurrency(total)}</strong></div>`;
    } else if (freq === 'half') {
        // main/extra half
        const main_half = floorToThousand(baseMain / 2);
        const extra_half = floorToThousand(extra / 2);
        // supplementary adjusted
        const supp_half = Math.floor(((supp / 1000) * 1.02 / 2)) * 1000;
        const perPeriod = main_half + extra_half + supp_half;
        const totalYearFromHalf = perPeriod * 2;
        const diff = totalYearFromHalf - total;
        out += `<div class="mb-2">Kỳ: Nửa năm</div>`;
        out += `<div class="grid grid-cols-2 gap-2">
            <div>Phí chính (nửa kỳ):</div><div class="text-right">${formatCurrency(main_half)}</div>
            <div>Phí đóng thêm (nửa kỳ):</div><div class="text-right">${formatCurrency(extra_half)}</div>
            <div>Phí bổ sung (nửa kỳ, đã áp 1.02):</div><div class="text-right">${formatCurrency(supp_half)}</div>
            <div class="font-semibold">Tổng theo kỳ (nửa):</div><div class="font-semibold text-right">${formatCurrency(perPeriod)}</div>
            <div>Tổng năm (từ kỳ):</div><div class="text-right">${formatCurrency(totalYearFromHalf)}</div>
            <div>Chênh lệch (tổng năm theo kỳ - tổng năm đóng năm):</div><div class="text-right ${diff>0?'text-red-600':''}">${formatCurrency(diff)}</div>
        </div>`;
    } else if (freq === 'quarter') {
        const main_q = floorToThousand(baseMain / 4);
        const extra_q = floorToThousand(extra / 4);
        const supp_q = Math.floor(((supp / 1000) * 1.04 / 4)) * 1000;
        const perPeriod = main_q + extra_q + supp_q;
        const totalYearFromQ = perPeriod * 4;
        const diff = totalYearFromQ - total;
        out += `<div class="mb-2">Kỳ: Quý</div>`;
        out += `<div class="grid grid-cols-2 gap-2">
            <div>Phí chính (quý):</div><div class="text-right">${formatCurrency(main_q)}</div>
            <div>Phí đóng thêm (quý):</div><div class="text-right">${formatCurrency(extra_q)}</div>
            <div>Phí bổ sung (quý, đã áp 1.04):</div><div class="text-right">${formatCurrency(supp_q)}</div>
            <div class="font-semibold">Tổng theo kỳ (quý):</div><div class="font-semibold text-right">${formatCurrency(perPeriod)}</div>
            <div>Tổng năm (từ kỳ):</div><div class="text-right">${formatCurrency(totalYearFromQ)}</div>
            <div>Chênh lệch (tổng năm theo kỳ - tổng năm đóng năm):</div><div class="text-right ${diff>0?'text-red-600':''}">${formatCurrency(diff)}</div>
        </div>`;
    }

    infoEl.innerHTML = out;
}

function generateSummaryTable() {
    const modal = document.getElementById('summary-modal');
    const container = document.getElementById('summary-content-container');
    container.innerHTML = '';

    try {
        const targetAgeInput = document.getElementById('target-age-input');
        const targetAge = parseInt(targetAgeInput.value, 10);
        const mainPersonContainer = document.getElementById('main-person-container');
        const mainPersonInfo = getCustomerInfo(mainPersonContainer, true);
        const mainProduct = mainPersonInfo.mainProduct;

        if (isNaN(targetAge) || targetAge <= mainPersonInfo.age) {
            throw new Error("Vui lòng nhập một độ tuổi mục tiêu hợp lệ, lớn hơn tuổi hiện tại của NĐBH chính.");
        }

        // Kiểm tra Sức Khỏe Bùng Gia Lực khi chọn Trọn Tâm An
        if (mainProduct === 'TRON_TAM_AN') {
            const mainSuppContainer = document.querySelector('#main-supp-container .supplementary-products-container');
            const healthSclSection = mainSuppContainer?.querySelector('.health-scl-section');
            const healthSclCheckbox = healthSclSection?.querySelector('.health-scl-checkbox');
            const healthSclPremium = calculateHealthSclPremium(mainPersonInfo, mainSuppContainer);
            if (!healthSclCheckbox?.checked || healthSclPremium === 0) {
                throw new Error('Sản phẩm Trọn Tâm An bắt buộc phải tham gia kèm Sức Khỏe Bùng Gia Lực với phí hợp lệ.');
            }
        }

        let paymentTerm = 999;
        const paymentTermInput = document.getElementById('payment-term');
        if (paymentTermInput) {
            paymentTerm = parseInt(paymentTermInput.value, 10) || 999;
        } else if (mainPersonInfo.mainProduct === 'AN_BINH_UU_VIET') {
            paymentTerm = parseInt(document.getElementById('abuv-term')?.value, 10);
        } else if (mainPersonInfo.mainProduct === 'TRON_TAM_AN') {
            paymentTerm = 10;
        }

        if (['PUL_TRON_DOI', 'PUL_5_NAM', 'PUL_15_NAM', 'KHOE_BINH_AN', 'VUNG_TUONG_LAI'].includes(mainPersonInfo.mainProduct) && targetAge < mainPersonInfo.age + paymentTerm - 1) {
            throw new Error(`Độ tuổi mục tiêu phải lớn hơn hoặc bằng ${mainPersonInfo.age + paymentTerm - 1} đối với ${mainPersonInfo.mainProduct}.`);
        }

        // Thu thập thông tin tất cả NĐBH bổ sung
        const suppPersons = [];
        document.querySelectorAll('.person-container').forEach(pContainer => {
            if (pContainer.id !== 'main-person-container') {
                const personInfo = getCustomerInfo(pContainer, false);
                suppPersons.push(personInfo);
            }
        });

        // Tạo tiêu đề bảng
        let tableHtml = `<table class="w-full text-left border-collapse"><thead class="bg-gray-100"><tr>`;
        tableHtml += `<th class="p-2 border">Năm HĐ</th>`;
        tableHtml += `<th class="p-2 border">Tuổi NĐBH Chính<br>(${sanitizeHtml(mainPersonInfo.name)})</th>`;
        tableHtml += `<th class="p-2 border">Phí SP Chính<br>(${sanitizeHtml(mainPersonInfo.name)})</th>`;
        tableHtml += `<th class="p-2 border">Phí SP Bổ Sung<br>(${sanitizeHtml(mainPersonInfo.name)})</th>`;
        suppPersons.forEach(person => {
            tableHtml += `<th class="p-2 border">Phí SP Bổ Sung<br>(${sanitizeHtml(person.name)})</th>`;
        });
        tableHtml += `<th class="p-2 border">Tổng Phí Năm</th>`;
        tableHtml += `</tr></thead><tbody>`;

        let totalMainAcc = 0;
        let totalSuppAccMain = 0;
        let totalSuppAccAll = 0;

        const initialBaseMainPremium = calculateMainPremium(mainPersonInfo);
        const extraPremium = getExtraPremiumValue();
        const initialMainPremiumWithExtra = initialBaseMainPremium + extraPremium;
        const totalMaxSupport = Math.floor(initialBaseMainPremium / 4000000) * 100000; // Hạn mức chung Hỗ trợ viện phí

        for (let i = 0; (mainPersonInfo.age + i) <= targetAge; i++) {
            const currentAgeMain = mainPersonInfo.age + i;
            const contractYear = i + 1;

            const mainPremiumForYear = (contractYear <= paymentTerm) ? initialMainPremiumWithExtra : 0;
            totalMainAcc += mainPremiumForYear;

            let suppPremiumMain = 0;
            let totalHospitalSupportStbh = 0; // Reset tổng STBH viện phí mỗi năm
            const mainSuppContainer = document.querySelector('#main-supp-container .supplementary-products-container');
            if (mainSuppContainer) {
                suppPremiumMain += calculateHealthSclPremium({ ...mainPersonInfo, age: currentAgeMain }, mainSuppContainer, currentAgeMain);
                suppPremiumMain += calculateBhnPremium({ ...mainPersonInfo, age: currentAgeMain }, mainSuppContainer, currentAgeMain);
                suppPremiumMain += calculateAccidentPremium({ ...mainPersonInfo, age: currentAgeMain }, mainSuppContainer, currentAgeMain);
                suppPremiumMain += calculateHospitalSupportPremium({ ...mainPersonInfo, age: currentAgeMain }, initialBaseMainPremium, mainSuppContainer, totalHospitalSupportStbh, currentAgeMain);
                const hospitalSupportStbh = parseFormattedNumber(mainSuppContainer.querySelector('.hospital-support-stbh')?.value || '0');
                if (mainSuppContainer.querySelector('.hospital-support-checkbox')?.checked && hospitalSupportStbh > 0) {
                    totalHospitalSupportStbh += hospitalSupportStbh;
                }
            }
            totalSuppAccMain += suppPremiumMain;

            const suppPremiums = suppPersons.map(person => {
                const currentPersonAge = person.age + i;
                const suppProductsContainer = person.container.querySelector('.supplementary-products-container');
                let suppPremium = 0;
                if (suppProductsContainer) {
                    suppPremium += calculateHealthSclPremium({ ...person, age: currentPersonAge }, suppProductsContainer, currentPersonAge);
                    suppPremium += calculateBhnPremium({ ...person, age: currentPersonAge }, suppProductsContainer, currentPersonAge);
                    suppPremium += calculateAccidentPremium({ ...person, age: currentPersonAge }, suppProductsContainer, currentPersonAge);
                    suppPremium += calculateHospitalSupportPremium({ ...person, age: currentPersonAge }, initialBaseMainPremium, suppProductsContainer, totalHospitalSupportStbh, currentPersonAge);
                    const hospitalSupportStbh = parseFormattedNumber(suppProductsContainer.querySelector('.hospital-support-stbh')?.value || '0');
                    if (suppProductsContainer.querySelector('.hospital-support-checkbox')?.checked && hospitalSupportStbh > 0) {
                        totalHospitalSupportStbh += hospitalSupportStbh;
                    }
                }
                totalSuppAccAll += suppPremium;
                return suppPremium;
            });

            if (totalHospitalSupportStbh > totalMaxSupport) {
                throw new Error(`Tổng số tiền Hỗ trợ viện phí vượt quá hạn mức chung: ${formatCurrency(totalMaxSupport, 'đ/ngày')}.`);
            }

            tableHtml += `<tr>
                <td class="p-2 border text-center">${contractYear}</td>
                <td class="p-2 border text-center">${currentAgeMain}</td>
                <td class="p-2 border text-right">${formatCurrency(mainPremiumForYear)}</td>
                <td class="p-2 border text-right">${formatCurrency(suppPremiumMain)}</td>`;
            suppPremiums.forEach(suppPremium => {
                tableHtml += `<td class="p-2 border text-right">${formatCurrency(suppPremium)}</td>`;
            });
            tableHtml += `<td class="p-2 border text-right font-semibold">${formatCurrency(mainPremiumForYear + suppPremiumMain + suppPremiums.reduce((sum, p) => sum + p, 0))}</td>`;
            tableHtml += `</tr>`;
        }

        tableHtml += `<tr class="bg-gray-200 font-bold"><td class="p-2 border" colspan="2">Tổng cộng</td>`;
        tableHtml += `<td class="p-2 border text-right">${formatCurrency(totalMainAcc)}</td>`;
        tableHtml += `<td class="p-2 border text-right">${formatCurrency(totalSuppAccMain)}</td>`;
        suppPersons.forEach(() => {
            tableHtml += `<td class="p-2 border text-right">—</td>`;
        });
        tableHtml += `<td class="p-2 border text-right">${formatCurrency(totalMainAcc + totalSuppAccMain + totalSuppAccAll)}</td>`;
        tableHtml += `</tr></tbody></table>`;
        tableHtml += `<div class="mt-4 text-center"><button id="export-html-btn" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Xuất HTML</button></div>`;
        container.innerHTML = tableHtml;

        // Gắn sự kiện cho nút xuất HTML
        document.getElementById('export-html-btn').addEventListener('click', () => exportToHTML(mainPersonInfo, suppPersons, targetAge, initialBaseMainPremium + extraPremium, paymentTerm));

    } catch (e) {
        container.innerHTML = `<p class="text-red-600 font-semibold text-center">${e.message}</p>`;
    } finally {
        modal.classList.remove('hidden');
    }
}

function sanitizeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function exportToHTML(mainPersonInfo, suppPersons, targetAge, initialMainPremiumWithExtra, paymentTerm) {
    // Bản gọn: dùng print để xuất PDF
    window.print();
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

function parseFormattedNumber(formattedString) {
    return parseInt(String(formattedString).replace(/[.,]/g, ''), 10) || 0;
}

function showError(message) {
    document.getElementById('error-message').textContent = message;
}

function clearError() {
    document.getElementById('error-message').textContent = '';
}

// Helpers: hiển thị lỗi trường cho Section 1
function setFieldError(input, message) {
    if (!input) return;
    let err = input.parentElement.querySelector('.field-error');
    if (!err) {
        err = document.createElement('p');
        err.className = 'field-error text-sm text-red-600 mt-1';
        input.parentElement.appendChild(err);
    }
    err.textContent = message || '';
    if (message) {
        input.classList.add('border-red-500');
    } else {
        input.classList.remove('border-red-500');
    }
}
function clearFieldError(input) {
    setFieldError(input, '');
}

function validateMainPersonInputs() {
    const container = document.getElementById('main-person-container');
    if (!container) return true;

    const nameInput = container.querySelector('.name-input');
    const dobInput = container.querySelector('.dob-input');
    const occupationInput = container.querySelector('.occupation-input');

    let ok = true;

    // Họ và tên: bắt buộc
    if (nameInput) {
        const v = (nameInput.value || '').trim();
        if (!v) {
            setFieldError(nameInput, 'Vui lòng nhập họ và tên');
            ok = false;
        } else {
            clearFieldError(nameInput);
        }
    }

    // Ngày sinh: định dạng DD/MM/YYYY, hợp lệ, không vượt quá REFERENCE_DATE
    if (dobInput) {
        const v = (dobInput.value || '').trim();
        const re = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!re.test(v)) {
            setFieldError(dobInput, 'Ngày sinh không hợp lệ, nhập DD/MM/YYYY');
            ok = false;
        } else {
            const [dd, mm, yyyy] = v.split('/').map(n => parseInt(n, 10));
            const d = new Date(yyyy, mm - 1, dd);
            const valid = d.getFullYear() === yyyy && d.getMonth() === (mm - 1) && d.getDate() === dd && d <= REFERENCE_DATE;
            if (!valid) {
                setFieldError(dobInput, 'Ngày sinh không hợp lệ, nhập DD/MM/YYYY');
                ok = false;
            } else {
                clearFieldError(dobInput);
            }
        }
    }

    // Nghề nghiệp: phải chọn từ danh sách (dataset.group 1-4)
    if (occupationInput) {
        const typed = (occupationInput.value || '').trim().toLowerCase();
        const match = product_data.occupations.find(o => o.group > 0 && o.name.toLowerCase() === typed);
        const group = parseInt(occupationInput.dataset.group, 10);
        if (!match || !(group >= 1 && group <= 4)) {
            setFieldError(occupationInput, 'Chọn nghề nghiệp từ danh sách');
            ok = false;
        } else {
            clearFieldError(occupationInput);
        }
    }

    return ok;
}

// ======= Section 2 helpers =======

function getPaymentTermBounds(age) {
    const min = 4;
    const max = Math.max(0, 100 - age - 1);
    return { min, max };
}

function setPaymentTermHint(mainProduct, age) {
    const hintEl = document.getElementById('payment-term-hint');
    if (!hintEl) return;
    const { min, max } = getPaymentTermBounds(age);
    let hint = `Nhập từ ${min} đến ${max} năm`;
    if (mainProduct === 'PUL_5_NAM') hint = `Nhập từ 5 đến ${max} năm`;
    if (mainProduct === 'PUL_15_NAM') hint = `Nhập từ 15 đến ${max} năm`;
    hintEl.textContent = hint;
}

function validateSection2FieldsPreCalc(customer) {
    const mainProduct = customer.mainProduct;

    // STBH: bắt buộc >= 100 triệu (áp dụng mọi SP trừ Trọn Tâm An)
    if (mainProduct && mainProduct !== 'TRON_TAM_AN') {
        const stbhEl = document.getElementById('main-stbh');
        if (stbhEl) {
            const stbh = parseFormattedNumber(stbhEl.value || '0');
            if (stbh > 0 && stbh < 100000000) {
                setFieldError(stbhEl, 'STBH nhỏ hơn 100 triệu');
            } else {
                clearFieldError(stbhEl);
            }
        }
    }

    // Payment term: chỉ cho PUL & MUL
    if (['KHOE_BINH_AN', 'VUNG_TUONG_LAI', 'PUL_TRON_DOI', 'PUL_15_NAM', 'PUL_5_NAM'].includes(mainProduct)) {
        const el = document.getElementById('payment-term');
        if (el) {
            const { min, max } = getPaymentTermBounds(customer.age);
            const val = parseInt(el.value, 10);
            if (el.value && (isNaN(val) || val < (mainProduct === 'PUL_5_NAM' ? 5 : mainProduct === 'PUL_15_NAM' ? 15 : 4) || val > max)) {
                const effMin = mainProduct === 'PUL_5_NAM' ? 5 : mainProduct === 'PUL_15_NAM' ? 15 : 4;
                setFieldError(el, `Thời hạn không hợp lệ, từ ${effMin} đến ${max}`);
            } else {
                clearFieldError(el);
            }
        }
    }

    // MUL: gợi ý min-max & validate phí
    if (['KHOE_BINH_AN', 'VUNG_TUONG_LAI'].includes(mainProduct)) {
        const stbh = parseFormattedNumber(document.getElementById('main-stbh')?.value || '0');
        const feeInput = document.getElementById('main-premium-input');
        const factorRow = product_data.mul_factors.find(f => customer.age >= f.ageMin && customer.age <= f.ageMax);
        if (factorRow && stbh > 0) {
            const minFee = stbh / factorRow.maxFactor;
            const maxFee = stbh / factorRow.minFactor;
            const rangeEl = document.getElementById('mul-fee-range');
            if (rangeEl) rangeEl.textContent = `Phí hợp lệ từ ${formatCurrency(minFee, '')} đến ${formatCurrency(maxFee, '')}.`;

            const entered = parseFormattedNumber(feeInput?.value || '0');
            if (entered > 0 && (entered < minFee || entered > maxFee || entered < 5000000)) {
                setFieldError(feeInput, 'Phí không hợp lệ');
            } else {
                clearFieldError(feeInput);
            }
        }
    }
}

function getExtraPremiumValue() {
    return parseFormattedNumber(document.getElementById('extra-premium-input')?.value || '0');
}

function validateExtraPremiumLimit(basePremium) {
    const el = document.getElementById('extra-premium-input');
    if (!el) return;
    const extra = getExtraPremiumValue();
    if (extra > 0 && basePremium > 0 && extra > 5 * basePremium) {
        setFieldError(el, 'Phí đóng thêm vượt quá 5 lần phí chính');
        throw new Error('Phí đóng thêm vượt quá 5 lần phí chính');
    } else {
        clearFieldError(el);
    }
}

function updateMainProductFeeDisplay(basePremium, extraPremium) {
    const el = document.getElementById('main-product-fee-display');
    if (!el) return;
    if (basePremium <= 0 && extraPremium <= 0) {
        el.textContent = '';
        return;
    }
    if (extraPremium > 0) {
        el.innerHTML = `Phí SP chính: ${formatCurrency(basePremium)} | Phí đóng thêm: ${formatCurrency(extraPremium)} | Tổng: ${formatCurrency(basePremium + extraPremium)}`;
    } else {
        el.textContent = `Phí SP chính: ${formatCurrency(basePremium)}`;
    }
}

// ===== Section 3 helpers (Sức khỏe - STBH UI) =====
function getHealthSclStbhByProgram(program) {
    switch (program) {
        case 'co_ban': return 100_000_000;
        case 'nang_cao': return 250_000_000;
        case 'toan_dien': return 500_000_000;
        case 'hoan_hao': return 1_000_000_000;
        default: return 0;
    }
}
function updateHealthSclStbhInfo(section) {
    const infoEl = section.querySelector('.health-scl-stbh-info');
    if (!infoEl) return;
    const program = section.querySelector('.health-scl-program')?.value || '';
    const stbh = getHealthSclStbhByProgram(program);
    infoEl.textContent = program ? `STBH: ${formatCurrency(stbh, '')}` : '';
}

function generateSupplementaryPersonHtml(personId, count) {
    return `
        <button class="w-full text-right text-sm text-red-600 font-semibold" onclick="this.closest('.person-container').remove(); if (window.MDP3) MDP3.reset(); updateSupplementaryAddButtonState(); calculateAll();">Xóa NĐBH này</button>
        <h3 class="text-lg font-bold text-gray-700 mb-2 border-t pt-4">NĐBH Bổ Sung ${count}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label for="name-${personId}" class="font-medium text-gray-700 block mb-1">Họ và Tên</label>
                <input type="text" id="name-${personId}" class="form-input name-input" placeholder="Trần Thị B">
            </div>
            <div>
                <label for="dob-${personId}" class="font-medium text-gray-700 block mb-1">Ngày sinh</label>
                <input type="text" id="dob-${personId}" class="form-input dob-input" placeholder="DD/MM/YYYY">
            </div>
            <div>
                <label for="gender-${personId}" class="font-medium text-gray-700 block mb-1">Giới tính</label>
                <select id="gender-${personId}" class="form-select gender-select">
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                </select>
            </div>
            <div>
                <label for="occupation-${personId}" class="font-medium text-gray-700 block mb-1">Nghề nghiệp</label>
                <input type="text" id="occupation-${personId}" class="form-input occupation-input" placeholder="Gõ để tìm nghề nghiệp...">
                <div class="occupation-autocomplete hidden absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto"></div>
                <p class="text-sm text-gray-500 mt-1">Nhóm nghề: <span class="risk-group-span">...</span></p>
            </div>
        </div>
        <div class="supplementary-products-container mt-4"></div>
    `;
}

// (phần còn lại của file giữ nguyên — chức năng khác không thay đổi)

