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

document.addEventListener('DOMContentLoaded', () => {
    initPerson(document.getElementById('main-person-container'), 'main');
    initMainProductLogic();
    initSupplementaryButton();
    initSummaryModal();
    attachGlobalListeners();
    updateSupplementaryAddButtonState();
    observeSupplementaryContainer(); // Bật bản vá: theo dõi thêm/xóa người
    calculateAll();

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
        }

        const totalPremium = mainPremiumDisplay + totalSupplementaryPremium;
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

function updateSummaryUI(premiums) {
    document.getElementById('main-premium-result').textContent = formatCurrency(premiums.mainPremium);

    const suppContainer = document.getElementById('supplementary-premiums-results');
    suppContainer.innerHTML = '';
    if (premiums.totalSupplementaryPremium > 0) {
        suppContainer.innerHTML = `<div class="flex justify-between items-center py-2 border-b"><span class="text-gray-600">Tổng phí SP bổ sung:</span><span class="font-bold text-gray-900">${formatCurrency(premiums.totalSupplementaryPremium)}</span></div>`;
    }

    document.getElementById('total-premium-result').textContent = formatCurrency(premiums.totalPremium);
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
            <div class="flex items-end space-x-4">
                <p class="text-lg">Tuổi: <span id="age-${personId}" class="font-bold text-aia-red age-span">0</span></p>
            </div>
            <div class="relative">
                <label for="occupation-input-${personId}" class="font-medium text-gray-700 block mb-1">Nghề nghiệp</label>
                <input type="text" id="occupation-input-${personId}" class="form-input occupation-input" placeholder="Gõ để tìm nghề nghiệp...">
                <div class="occupation-autocomplete absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 hidden max-h-60 overflow-y-auto"></div>
            </div>
            <div class="flex items-end space-x-4">
                <p class="text-lg">Nhóm nghề: <span id="risk-group-${personId}" class="font-bold text-aia-red risk-group-span">...</span></p>
            </div>
        </div>
        <div class="mt-4">
            <h4 class="text-md font-semibold text-gray-800 mb-2">Sản phẩm bổ sung cho người này</h4>
            <div class="supplementary-products-container space-y-6"></div>
        </div>
    `;
}

function generateSupplementaryProductsHtml(personId) {
    return `
        <div class="product-section health-scl-section hidden">
            <label class="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" class="form-checkbox health-scl-checkbox">
                <span class="text-lg font-medium text-gray-800">Sức khỏe Bùng Gia Lực</span>
            </label>
            <div class="product-options hidden mt-3 pl-8 space-y-4 border-l-2 border-gray-200">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="font-medium text-gray-700 block mb-1">Quyền lợi chính (Bắt buộc)</label>
                        <select class="form-select health-scl-program" disabled>
                            <option value="">-- Chọn chương trình --</option>
                            <option value="co_ban">Cơ bản</option>
                            <option value="nang_cao">Nâng cao</option>
                            <option value="toan_dien">Toàn diện</option>
                            <option value="hoan_hao">Hoàn hảo</option>
                        </select>
                        <div class="text-sm text-gray-600 mt-1 health-scl-stbh-info"></div>
                    </div>
                    <div>
                        <label class="font-medium text-gray-700 block mb-1">Phạm vi địa lý</label>
                        <select class="form-select health-scl-scope" disabled>
                            <option value="main_vn">Việt Nam</option>
                            <option value="main_global">Nước ngoài</option>
                        </select>
                    </div>
                </div>
                <div>
                    <span class="font-medium text-gray-700 block mb-2">Quyền lợi tùy chọn:</span>
                    <div class="space-y-2">
                        <label class="flex items-center space-x-3 cursor-pointer"><input type="checkbox" class="form-checkbox health-scl-outpatient" disabled> <span>Điều trị ngoại trú</span></label>
                        <label class="flex items-center space-x-3 cursor-pointer"><input type="checkbox" class="form-checkbox health-scl-dental" disabled> <span>Chăm sóc nha khoa</span></label>
                    </div>
                </div>
                <div class="text-right font-semibold text-aia-red fee-display min-h-[1.5rem]"></div>
            </div>
        </div>
        <div class="product-section bhn-section hidden">
            <label class="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" class="form-checkbox bhn-checkbox"> <span class="text-lg font-medium text-gray-800">Bệnh Hiểm Nghèo 2.0</span>
            </label>
            <div class="product-options hidden mt-3 pl-8 space-y-3 border-l-2 border-gray-200">
                <div><label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label><input type="text" class="form-input bhn-stbh" placeholder="VD: 500.000.000"></div>
                <div class="text-right font-semibold text-aia-red fee-display min-h-[1.5rem]"></div>
            </div>
        </div>
        <div class="product-section accident-section hidden">
            <label class="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" class="form-checkbox accident-checkbox"> <span class="text-lg font-medium text-gray-800">Bảo hiểm Tai nạn</span>
            </label>
            <div class="product-options hidden mt-3 pl-8 space-y-3 border-l-2 border-gray-200">
                <div><label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label><input type="text" class="form-input accident-stbh" placeholder="VD: 200.000.000"></div>
                <div class="text-right font-semibold text-aia-red fee-display min-h-[1.5rem]"></div>
            </div>
        </div>
        <div class="product-section hospital-support-section hidden">
            <label class="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" class="form-checkbox hospital-support-checkbox"> <span class="text-lg font-medium text-gray-800">Hỗ trợ chi phí nằm viện</span>
            </label>
            <div class="product-options hidden mt-3 pl-8 space-y-3 border-l-2 border-gray-200">
                <div>
                    <label class="font-medium text-gray-700 block mb-1">Số tiền hỗ trợ/ngày</label><input type="text" class="form-input hospital-support-stbh" placeholder="VD: 300.000">
                    <p class="hospital-support-validation text-sm text-gray-500 mt-1"></p>
                </div>
                <div class="text-right font-semibold text-aia-red fee-display min-h-[1.5rem]"></div>
            </div>
        </div>
    `;
}
// === Các hàm gốc khác giữ nguyên ===

// ===== MODULE MDP3 =====
window.MDP3 = (function () {
    let selectedId = null;

    function init() {
        renderSection();
        attachListeners();
    }

    // ===== MDP3 BỔ SUNG ===== tiện ích reset
    function reset() {
        selectedId = null;
        const enableCb = document.getElementById('mdp3-enable');
        if (enableCb) enableCb.checked = false;

        const selContainer = document.getElementById('mdp3-select-container');
        if (selContainer) selContainer.innerHTML = '';

        const feeEl = document.getElementById('mdp3-fee-display');
        if (feeEl) feeEl.textContent = '';
    }
    function isEnabled() {
        const cb = document.getElementById('mdp3-enable');
        return !!(cb && cb.checked);
    }
    function resetIfEnabled() {
        if (isEnabled()) reset();
    }

    // Hiện/ẩn Section 5 tùy sản phẩm chính
    function renderSection() {
        const sec = document.getElementById('mdp3-section');
        if (!sec) return;
        const mainProduct = document.getElementById('main-product').value;

        if (mainProduct === 'TRON_TAM_AN') {
            reset();
            sec.classList.add('hidden');
            return;
        }
        sec.classList.remove('hidden');

        // Thêm checkbox bật/tắt nếu chưa có
        const container = document.getElementById('mdp3-radio-list');
        if (container && !document.getElementById('mdp3-enable')) {
            container.innerHTML = `
                <div class="flex items-center space-x-2 mb-3">
                    <input type="checkbox" id="mdp3-enable" class="form-checkbox">
                    <label for="mdp3-enable" class="text-gray-700 font-medium">
                        Bật Miễn đóng phí 3.0
                    </label>
                </div>
                <div id="mdp3-select-container"></div>
            `;
        }
    }

    // Render dropdown danh sách người được bảo hiểm bổ sung hoặc "Người khác"
    function renderSelect() {
        const selectContainer = document.getElementById('mdp3-select-container');
        if (!selectContainer) return;

        let html = `<select id="mdp3-person-select" class="form-select w-full mb-3">
                        <option value="">-- Chọn người --</option>`;

        document.querySelectorAll('.person-container').forEach(cont => {
            if (cont.id !== 'main-person-container' && !cont.id.includes('mdp3-other')) {
                const info = getCustomerInfo(cont, false);
                let label = info.name || 'NĐBH bổ sung';
                label += ` (tuổi ${info.age || "?"})`;

                let disabled = '';
                if (!info.age || info.age <= 0) {
                    label += ' - Chưa đủ thông tin';
                    disabled = 'disabled';
                } else if (info.age < 18 || info.age > 60) {
                    label += ' - Không đủ điều kiện';
                    disabled = 'disabled';
                }

                html += `<option value="${cont.id}" ${disabled}>${label}</option>`;
            }
        });

        html += `<option value="other">Người khác</option></select>
                 <div id="mdp3-other-form" class="hidden mt-4 p-3 border rounded bg-gray-50"></div>`;

        selectContainer.innerHTML = html;
    }

    // Gắn sự kiện cho checkbox và dropdown
    function attachListeners() {
        // Render lại Section khi đổi sản phẩm chính
        document.getElementById('main-product').addEventListener('change', () => {
            renderSection();
            reset(); // đổi SP chính -> luôn reset
        });

        document.body.addEventListener('change', function (e) {
            if (e.target.id === 'mdp3-enable') {
                if (e.target.checked) {
                    renderSelect();
                } else {
                    const sel = document.getElementById('mdp3-select-container');
                    if (sel) sel.innerHTML = '';
                    const fee = document.getElementById('mdp3-fee-display');
                    if (fee) fee.textContent = '';
                }
            }

            if (e.target.id === 'mdp3-person-select') {
                selectedId = e.target.value;
                const otherForm = document.getElementById('mdp3-other-form');

                if (selectedId === 'other') {
                    // Render form người khác
                    otherForm.classList.remove('hidden');
                    otherForm.innerHTML = `
                        <div id="person-container-mdp3-other" class="person-container">
                            ${generateSupplementaryPersonHtml('mdp3-other', '—')}
                        </div>
                    `;
                    initPerson(document.getElementById('person-container-mdp3-other'), 'mdp3-other', true);

                    // Ẩn phần sản phẩm bổ sung của "Người khác"
                    const suppBlock = otherForm.querySelector('.mt-4');
                    if (suppBlock) suppBlock.style.display = 'none';

                    // Nghe DOB để validate + tính realtime
                    const dobInput = otherForm.querySelector('.dob-input');
                    dobInput?.addEventListener('input', () => {
                        validateDobField(dobInput);
                        calculateAll();
                    });
                    dobInput?.addEventListener('blur', () => validateDobField(dobInput));
                } else {
                    otherForm.classList.add('hidden');
                    otherForm.innerHTML = '';
                }
                calculateAll();
            }
        });
    }

    // Tính phí MDP3
    function getPremium() {
        const enableCb = document.getElementById('mdp3-enable');
        const feeEl = document.getElementById('mdp3-fee-display');
        if (!enableCb || !enableCb.checked) {
            if (feeEl) feeEl.textContent = '';
            return 0;
        }
        if (!selectedId || !window.personFees) {
            if (feeEl) feeEl.textContent = '';
            return 0;
        }
        if (selectedId !== 'other' && !document.getElementById(selectedId)) {
            reset();
            return 0;
        }

        // Tính STBH: phí chính thuần + phí bổ sung (không cộng extra premium)
        let stbhBase = 0;
        for (let pid in window.personFees) {
            stbhBase += (window.personFees[pid].mainBase || 0) + (window.personFees[pid].supp || 0);
        }

        // Nếu là người bổ sung trong danh sách, trừ phí bổ sung của họ
        if (selectedId !== 'other' && window.personFees[selectedId]) {
            stbhBase -= window.personFees[selectedId].supp || 0;
        }

        let age, gender;
        if (selectedId === 'other') {
            const form = document.getElementById('person-container-mdp3-other');
            const info = getCustomerInfo(form, false);
            age = info.age;
            gender = info.gender;

            // Nếu chưa có DOB hợp lệ → chỉ hiển thị STBH
            if (!age || age <= 0) {
                if (feeEl) feeEl.textContent = `STBH: ${formatCurrency(stbhBase)} | Phí: —`;
                return 0;
            }
        } else {
            const info = getCustomerInfo(document.getElementById(selectedId), false);
            age = info.age;
            gender = info.gender;
        }

        // Tính phí nếu đủ tuổi
        const rate = findMdp3Rate(age, gender);
        const premiumRaw = (stbhBase / 1000) * rate;
        const premium = roundDownTo1000(premiumRaw);

        if (feeEl) {
            feeEl.textContent = premium > 0
                ? `STBH: ${formatCurrency(stbhBase)} | Phí: ${formatCurrency(premium)}`
                : `STBH: ${formatCurrency(stbhBase)} | Phí: —`;
        }

        return premium;
    }

    function findMdp3Rate(age, gender) {
        const genderKey = gender === 'Nữ' ? 'nu' : 'nam';
        const row = product_data.mdp3_rates.find(r => age >= r.ageMin && age <= r.ageMax);
        return row ? (row[genderKey] || 0) : 0;
    }

    return { init, renderSection, renderSelect, getPremium, reset, resetIfEnabled };
})();



// [PATCH] Section 6 renderer & payment frequency handling (minimal invasive additions)
// - Adds a renderSection6() which reads values produced by existing calculation logic (window.personFees and lastSummaryPrem)
// - Adds a wrapper around calculateAll to ensure renderSection6 is called after every full recalculation
// - Creates a payment frequency selector at runtime if not present, and shows per-period breakdown
(function(){
  // helper: floor to thousand
  function floorToThousand(v){ return Math.floor(v/1000)*1000; }

  function ensurePaymentFrequencyElement(){
    let sel = document.getElementById('payment-frequency');
    if(sel) return sel;
    const results = document.getElementById('results-container');
    if(!results) return null;
    // insert at top of results-container
    const wrapper = document.createElement('div');
    wrapper.className = 'mb-4';
    wrapper.innerHTML = `
      <label for="payment-frequency" class="font-medium text-gray-700 block mb-1">Kỳ đóng phí</label>
      <select id="payment-frequency" class="form-select w-full">
        <option value="year">Năm (mặc định)</option>
        <option value="half">Nửa năm</option>
        <option value="quarter">Quý</option>
      </select>
    `;
    results.insertBefore(wrapper, results.firstChild);
    sel = wrapper.querySelector('#payment-frequency');
    sel.addEventListener('change', ()=>{
      renderSection6();
    });
    return sel;
  }

  function computeFrequencyBreakdown(baseMain, extra, suppTotal, freq){
    const totalAnnual = (baseMain||0) + (extra||0) + (suppTotal||0);
    if(freq==='year' || !freq){
      return { periods:1, perPeriod: floorToThousand(baseMain+extra+suppTotal), totalYearFromPeriod: totalAnnual, diff:0, breakdown: { perMain: floorToThousand(baseMain), perExtra: floorToThousand(extra), perSupp: floorToThousand(suppTotal) } };
    }
    const periods = freq==='half'?2:4;
    const perMain = floorToThousand(baseMain/periods);
    const perExtra = floorToThousand(extra/periods);
    const factor = freq==='half'?1.02:1.04;
    // perSupp: Math.floor((annualSupp/1000 * factor / periods)) * 1000
    const perSupp = Math.floor((suppTotal/1000 * factor / periods)) * 1000;
    const perPeriod = perMain + perExtra + perSupp;
    const totalYearFromPeriod = perPeriod * periods;
    const diff = totalYearFromPeriod - totalAnnual;
    return { periods, perPeriod, totalYearFromPeriod, diff, breakdown: { perMain, perExtra, perSupp } };
  }

  // render summary section (Section 6) inside results-container using existing window.personFees and DOM fields
  window.renderSection6 = function renderSection6(){
    try{
      const results = document.getElementById('results-container');
      if(!results) return;
      // ensure payment frequency select exists (but don't duplicate if HTML already had it)
      ensurePaymentFrequencyElement();

      // gather base main and extra from DOM if possible
      const baseMain = parseFormattedNumber(document.getElementById('main-premium-result')?.dataset?.base || '') || 0;
      // fallback: try to read lastSummaryPrem stored by calculateAll
      const last = window.lastSummaryPrem || {};
      const baseMainGuess = last.baseMainPremium || 0;
      const extraGuess = last.extraPremium || 0;
      const mainTotalGuess = last.mainPremium || (baseMainGuess + extraGuess);
      const suppTotalGuess = last.totalSupplementaryPremium || 0;
      const totalGuess = last.totalPremium || (mainTotalGuess + suppTotalGuess);

      // Prefer using window.lastSummaryPrem if available
      const base = baseMainGuess;
      const extra = extraGuess;
      const mainTotal = mainTotalGuess;
      const suppTotal = suppTotalGuess;
      const total = totalGuess;

      // Build HTML for details. Keep minimal changes to DOM structure.
      let html = '';

      // Main insured breakdown
      html += `<div class="py-2 border-b">
        <div class="flex justify-between items-center"><span class="text-gray-600">Người được bảo hiểm chính - Tổng phí:</span><span class="font-bold text-gray-900">${formatCurrency(mainTotal)}</span></div>
        <div class="mt-2 text-sm text-gray-700 pl-2">
          <div class="flex justify-between"><span>Phí sản phẩm chính:</span><span>${formatCurrency(base)}</span></div>
          <div class="flex justify-between"><span>Phí đóng thêm:</span><span>${formatCurrency(extra)}</span></div>
          <div class="flex justify-between"><span>Phí sản phẩm bổ sung (NĐBH chính):</span><span>${formatCurrency(window.personFees?.['main-person-container'] ? window.personFees['main-person-container'].supp : 0)}</span></div>
        </div>
      </div>`;

      // Supplementary persons
      const suppPersons = Array.from(document.querySelectorAll('#supplementary-insured-container .person-container'));
      if(suppPersons.length>0){
        html += `<div class="py-2 border-b"><div class="text-gray-600 mb-2">Người được bảo hiểm bổ sung</div>`;
        suppPersons.forEach((p, idx)=>{
          const id = p.id;
          const nameEl = p.querySelector('.name-input');
          const name = nameEl ? (nameEl.value||`NĐBH bổ sung ${idx+1}`) : `NĐBH bổ sung ${idx+1}`;
          const fee = window.personFees && window.personFees[id] ? window.personFees[id].supp : 0;
          html += `<div class="flex justify-between items-center py-1"><span class="text-sm">${sanitizeHtml(name)}</span><span class="font-semibold">${formatCurrency(fee)}</span></div>`;
        });
        html += `</div>`;
      }

      // Totals and breakdown
      html += `<div class="py-2 border-b mt-2">
        <div class="flex justify-between items-center"><span class="text-gray-800 font-semibold">Tổng phí (năm):</span><span class="font-bold text-aia-red">${formatCurrency(total)}</span></div>
        <div class="text-sm text-gray-600 mt-2">
          <div>+ Phí chính: ${formatCurrency(base)}</div>
          <div>+ Phí đóng thêm: ${formatCurrency(extra)}</div>
          <div>+ Phí sản phẩm bổ sung: ${formatCurrency(suppTotal)}</div>
        </div>
      </div>`;

      // Frequency breakdown area (either existing element or create)
      let freqEl = document.getElementById('frequency-breakdown');
      if(!freqEl){
        freqEl = document.createElement('div');
        freqEl.id = 'frequency-breakdown';
        freqEl.className = 'mt-3 text-sm text-gray-700';
        // append near totals
        results.appendChild(freqEl);
      }

      // Compute frequency breakdown using the function
      const sel = document.getElementById('payment-frequency');
      const freq = sel ? sel.value : 'year';
      const freqInfo = computeFrequencyBreakdown(base, extra, suppTotal, freq);

      // render freq breakdown
      let freqHtml = '';
      if(freqInfo.periods === 1){
        freqHtml = `<div>Không hiển thị thêm (Kỳ = Năm). Tổng năm: <strong>${formatCurrency(total)}</strong></div>`;
      } else {
        freqHtml = `<div class="mb-2">Kỳ: ${freq==='half'?'Nửa năm':'Quý'}</div>`;
        freqHtml += `<div class="grid grid-cols-2 gap-2">
          <div>Phí chính (kỳ):</div><div class="text-right">${formatCurrency(freqInfo.breakdown.perMain)}</div>
          <div>Phí đóng thêm (kỳ):</div><div class="text-right">${formatCurrency(freqInfo.breakdown.perExtra)}</div>
          <div>Phí bổ sung (kỳ):</div><div class="text-right">${formatCurrency(freqInfo.breakdown.perSupp)}</div>
          <div class="font-semibold">Tổng theo kỳ:</div><div class="font-semibold text-right">${formatCurrency(freqInfo.perPeriod)}</div>
          <div>Tổng năm (từ kỳ):</div><div class="text-right">${formatCurrency(freqInfo.totalYearFromPeriod)}</div>
          <div>Chênh lệch (tổng năm theo kỳ - tổng năm đóng năm):</div><div class="text-right ${freqInfo.diff>0?'text-red-600':''}">${formatCurrency(freqInfo.diff)}</div>
        </div>`;
      }

      // find where to place frequency html: if a dedicated container exists, use it
      const freqContainer = document.getElementById('frequency-breakdown');
      if(freqContainer){
        freqContainer.innerHTML = freqHtml;
      }

      // finally inject main html details into a subcontainer (we try to keep structure consistent)
      // look for an inner container we can update: supplementary-premiums-results exists; we will set its innerHTML to blank and append our details above the totals area.
      const suppResults = document.getElementById('supplementary-premiums-results');
      if(suppResults){
        // put the detailed html before suppResults's parent block, but to keep minimal changes we set suppResults.innerHTML to list of supplementary items (already done above) and append totals after
        // We'll create a temporary container for the main breakdown and insert it right above suppResults
        let detailWrap = document.getElementById('_section6_detailwrap');
        if(!detailWrap){
          detailWrap = document.createElement('div');
          detailWrap.id = '_section6_detailwrap';
          suppResults.parentElement.insertBefore(detailWrap, suppResults);
        }
        detailWrap.innerHTML = html;
      }

    }catch(err){
      console.error('renderSection6 error', err);
    }
  };

  // [PATCH] wrap calculateAll to auto-render Section6 after compute.
  if(typeof calculateAll === 'function'){
    const __orig_calc = calculateAll;
    calculateAll = function(){
      const res = __orig_calc.apply(this, arguments);
      try{ window.renderSection6(); }catch(e){ console.error(e); }
      return res;
    };
  }

  // initial run if page already loaded
  if(document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(()=>{ try{ ensurePaymentFrequencyElement(); renderSection6(); }catch(e){}} , 50);
  }else{
    document.addEventListener('DOMContentLoaded', ()=>{ try{ ensurePaymentFrequencyElement(); renderSection6(); }catch(e){} });
  }

})(); // end patch IIFE


/* USER_PATCH_START
============================================================
Patch for requests (1)→(6) without touching Sections 1–5 logic.
- Adds per-person (including MAIN) lines under "Xem từng người"
- Requires STBH/payment-term/abuv-term where applicable
- Removes "VNĐ" globally from formatCurrency output
- Payment frequency availability: half ≥7,000,000; quarter ≥8,000,000 (base main, annual)
- Target-age input auto-updates for ABƯV & others on product/term changes
- Modal: prepend "Phần 1 - Tóm tắt sản phẩm" before existing fee table
============================================================ */
(function(){
  const $ = (q,root=document)=>root.querySelector(q);
  const $$ = (q,root=document)=>Array.from(root.querySelectorAll(q));
  const toInt = (s)=>{const t=(s||'').toString().replace(/[^\d]/g,''); return t?parseInt(t,10):0;}
  const fmt = (n)=> (Number(n)||0).toLocaleString('vi-VN');
  const round1000 = (n)=> Math.round((Number(n)||0)/1000)*1000;
  const floor1000 = (n)=> Math.floor((Number(n)||0)/1000)*1000;

  /* (3) Remove 'VNĐ' everywhere by overriding formatCurrency */
  if (typeof window.formatCurrency === 'function') {
    const _fmt = window.formatCurrency;
    window.formatCurrency = function(value, suffixIgnored){
      return fmt(floor1000(value));
    };
  }

  /* Helpers */
  function getMainBaseAnnual(){
    // base main (year) is stored in window.personFees['main-person-container'].mainBase
    const pf = (window.personFees||{})['main-person-container'];
    if (pf && typeof pf.mainBase === 'number') return pf.mainBase||0;
    // Fallback: parse from DOM (main-insured-main-fee is total main? acceptable for gating)
    return toInt($('#main-insured-main-fee')?.textContent);
  }
  function updateFrequencyOptions(){
    const sel = $('#payment-frequency'); if(!sel) return;
    const base = getMainBaseAnnual();
    const allowHalf = base >= 7000000;
    const allowQuarter = base >= 8000000;
    const optHalf = sel.querySelector('option[value="half"]');
    const optQuarter = sel.querySelector('option[value="quarter"]');
    if (optHalf){ optHalf.hidden = !allowHalf; optHalf.disabled = !allowHalf; }
    if (optQuarter){ optQuarter.hidden = !allowQuarter; optQuarter.disabled = !allowQuarter; }
    if (sel.value==='quarter' && !allowQuarter) sel.value = allowHalf ? 'half' : 'year';
    if (sel.value==='half' && !allowHalf) sel.value = 'year';
  }

  /* (1) Per-person "Xem từng người": include MAIN first, show names only */
  function renderPerPersonSupplementList(){
    const wrap = $('#supp-insured-summaries'); if(!wrap) return;
    const pfAll = window.personFees || {};
    // MAIN
    const mainName = ($('#main-person-container .name-input')?.value || 'NĐBH chính').trim();
    const mainSupp = Number((pfAll['main-person-container']?.supp)||0);
    // Build HTML
    const rows = [];
    rows.push(`<div class="flex justify-between items-center py-1 text-sm"><span>${mainName}</span><span class="font-semibold">${fmt(mainSupp)}</span></div>`);
    // SUPPLEMENTARY persons
    $$('#supplementary-insured-container .person-container').forEach(cont=>{
      const id = cont.id;
      const name = (cont.querySelector('.name-input')?.value || 'NĐBH bổ sung').trim();
      const val = Number((pfAll[id]?.supp)||0);
      rows.push(`<div class="flex justify-between items-center py-1 text-sm"><span>${name}</span><span class="font-semibold">${fmt(val)}</span></div>`);
    });
    wrap.innerHTML = rows.join('');
  }

  /* (2) Required field validations */
  function setFieldError(el, msg){
    if(!el) return;
    let hint = el.parentElement?.querySelector('.field-error-hint');
    if(!hint){
      hint = document.createElement('div');
      hint.className = 'field-error-hint text-red-600 text-sm mt-1';
      el.parentElement?.appendChild(hint);
    }
    hint.textContent = msg||'';
    el.classList.add('ring-1','ring-red-500');
  }
  function clearFieldError(el){
    if(!el) return;
    el.classList.remove('ring-1','ring-red-500');
    const hint = el.parentElement?.querySelector('.field-error-hint');
    if(hint) hint.textContent = '';
  }
  function validateMainProductRequired(customerInfo){
    let valid = true;
    const product = customerInfo?.mainProduct || $('#main-product')?.value || '';
    const isTTA = product === 'TRON_TAM_AN';
    const stbhEl = $('#main-stbh');
    const ptEl = $('#payment-term');
    const abuvEl = $('#abuv-term');

    // STBH required for all except TTA
    if (!isTTA && stbhEl){
      const v = toInt(stbhEl.value);
      if (v<=0){ setFieldError(stbhEl, 'Vui lòng nhập STBH (bắt buộc)'); valid=false; } else { clearFieldError(stbhEl); }
    }
    // Payment term required for PUL/MUL (not TTA/ABUV)
    if (!isTTA && !['AN_BINH_UU_VIET'].includes(product) && ptEl){
      const v = parseInt(ptEl.value||'0',10)||0;
      if (v<=0){ setFieldError(ptEl, 'Vui lòng nhập thời hạn đóng phí (bắt buộc)'); valid=false; } else { clearFieldError(ptEl); }
    }
    // ABUV term required
    if (product==='AN_BINH_UU_VIET' && abuvEl){
      const v = parseInt(abuvEl.value||'0',10)||0;
      if (v<=0){ setFieldError(abuvEl, 'Vui lòng chọn thời hạn đóng phí (bắt buộc)'); valid=false; } else { clearFieldError(abuvEl); }
    }
    return valid;
  }

  // Hook into existing validator if present
  if (typeof window.validateSection2FieldsPreCalc === 'function'){
    const _val = window.validateSection2FieldsPreCalc;
    window.validateSection2FieldsPreCalc = function(ci){
      let ok = _val.apply(this, arguments);
      try { ok = validateMainProductRequired(ci) && ok; } catch(e){}
      return ok;
    };
  }

  /* (5) Target-age auto updates */
  function getMainAge(){
    const t = $('#main-person-container .age-span')?.textContent || '0';
    return parseInt(t,10)||0;
  }
  function updateTargetAgeMin(){
    const input = $('#target-age-input'); if(!input) return;
    const product = $('#main-product')?.value || '';
    const mainAge = getMainAge();
    let term = 0;
    if (product === 'TRON_TAM_AN'){
      term = 10;
    } else if (product === 'AN_BINH_UU_VIET'){
      term = parseInt($('#abuv-term')?.value||'0',10)||0;
    } else {
      term = parseInt($('#payment-term')?.value||'0',10)||0;
    }
    if (term>0){
      const minAge = Math.min(100, Math.max(0, mainAge + term - 1));
      input.min = String(minAge);
      if (!input.value || parseInt(input.value,10) < minAge) input.value = String(minAge);
    }
  }
  document.addEventListener('change', (e)=>{
    const id = e.target?.id || '';
    if (id==='abuv-term' || id==='payment-term' || id==='main-product'){
      updateTargetAgeMin();
    }
    if (id==='payment-frequency'){
      updateFrequencyOptions();
      renderPerPersonSupplementList();
    }
  });

  /* (6) Modal: prepend product summary (Phần 1) */
  if (typeof window.generateSummaryTable === 'function'){
    const _gen = window.generateSummaryTable;
    window.generateSummaryTable = function(){
      const r = _gen.apply(this, arguments);
      try {
        const cont = $('#summary-content-container'); if(!cont) return r;
        if (cont.querySelector('table[data-part="product-summary"]')) return r;

        const mainName = ($('#main-person-container .name-input')?.value || 'NĐBH chính').trim();
        const productVal = $('#main-product')?.value || '';
        const productMap = {
          PUL_TRON_DOI: 'PUL Trọn đời',
          PUL_15_NAM: 'PUL 15 năm',
          PUL_5_NAM: 'PUL 5 năm',
          KHOE_BINH_AN: 'MUL - Khoẻ Bình An',
          VUNG_TUONG_LAI: 'MUL - Vững Tương Lai',
          TRON_TAM_AN: 'Trọn Tâm An',
          AN_BINH_UU_VIET: 'An Bình Ưu Việt'
        };
        const productLabel = productMap[productVal] || '';
        const stbh = (productVal==='TRON_TAM_AN') ? '' : ($('#main-stbh')?.value || '');
        const years = (productVal==='AN_BINH_UU_VIET')
            ? ($('#abuv-term')?.value || '')
            : (productVal==='TRON_TAM_AN' ? '10' : ($('#payment-term')?.value || ''));
        const mainFee = toInt($('#main-insured-main-fee')?.textContent);
        const extraFee = toInt($('#main-insured-extra-fee')?.textContent);

        const table = document.createElement('table');
        table.className = 'w-full text-sm border mb-4';
        table.dataset.part = 'product-summary';
        table.innerHTML = `<thead><tr class="bg-gray-100">
            <th class="p-2 text-left">Tên NĐBH</th>
            <th class="p-2 text-left">Sản phẩm</th>
            <th class="p-2 text-right">STBH</th>
            <th class="p-2 text-right">Năm đóng phí</th>
            <th class="p-2 text-right">Phí đóng</th>
          </tr></thead><tbody></tbody>`;
        const tbody = table.querySelector('tbody');
        function addRow(a,b,c,d,e){
          const tr = document.createElement('tr');
          tr.innerHTML = `<td class="p-2">${a||''}</td><td class="p-2">${b||''}</td><td class="p-2 text-right">${c||''}</td><td class="p-2 text-right">${d||''}</td><td class="p-2 text-right">${e||''}</td>`;
          tbody.appendChild(tr);
        }
        if (productLabel) addRow(mainName, productLabel, stbh, years, fmt(mainFee));
        if (extraFee>0) addRow(mainName, 'Phí đóng thêm', '', years, fmt(extraFee));

        // Bổ sung (TỔNG) theo từng người – hiển thị tên & tổng phí bổ sung; năm sẽ phụ thuộc min(targetAge,maxAge)-tuổi+1
        const targetAge = parseInt($('#target-age-input')?.value||'0',10)||0;
        const maxAgeByType = { hospital:65, accident:65, bhn:85, 'health-scl':75 };
        // Không thể tách từng rider an toàn ở đây => hiển thị tổng; phần bảng phí chi tiết (Phần 2) vẫn tách theo code gốc.
        // Main
        const pf = window.personFees||{};
        const mainAge = getMainAge();
        const mainSupp = Number((pf['main-person-container']?.supp)||0);
        if (mainSupp>0){
          const yearsMain = targetAge>0 ? Math.max(0, targetAge - mainAge + 1) : '';
          addRow(mainName, 'Bổ sung (tổng)', '', yearsMain, fmt(mainSupp));
        }
        // Each supp
        $$('#supplementary-insured-container .person-container').forEach(cont=>{
          const name = (cont.querySelector('.name-input')?.value || 'NĐBH bổ sung').trim();
          const ageText = cont.querySelector('.age-span')?.textContent || '0';
          const age = parseInt(ageText,10)||0;
          const val = Number((pf[cont.id]?.supp)||0);
          if (val>0){
            const yearsP = targetAge>0 ? Math.max(0, targetAge - age + 1) : '';
            addRow(name, 'Bổ sung (tổng)', '', yearsP, fmt(val));
          }
        });

        const title = document.createElement('h3');
        title.textContent = 'Tóm tắt sản phẩm';
        title.className = 'text-lg font-bold text-gray-800 mt-2';
        cont.prepend(table);
        cont.prepend(title);
      } catch(e){ console.error(e); }
      return r;
    };
  }

  /* Recompute Section 6 extras after each full calc */
  if (typeof window.calculateAll === 'function'){
    const _calc = window.calculateAll;
    window.calculateAll = function(){
      const r = _calc.apply(this, arguments);
      try{ renderPerPersonSupplementList(); }catch(e){}
      try{ updateFrequencyOptions(); }catch(e){}
      try{ updateTargetAgeMin(); }catch(e){}
      return r;
    };
  }

  // Initial kicks
  document.addEventListener('DOMContentLoaded', ()=>{
    try{ renderPerPersonSupplementList(); }catch(e){}
    try{ updateFrequencyOptions(); }catch(e){}
    try{ updateTargetAgeMin(); }catch(e){}
  });
})();
/* USER_PATCH_END */

