import { product_data } from './data.js';

let supplementaryInsuredCount = 0;
let currentMainProductState = { product: null, age: null };

const MAX_ENTRY_AGE = {
  PUL_TRON_DOI: 70, PUL_15_NAM: 70, PUL_5_NAM: 70, KHOE_BINH_AN: 70, VUNG_TUONG_LAI: 70,
  TRON_TAM_AN: 60, AN_BINH_UU_VIET: 65,
  health_scl: 65, bhn: 70, accident: 64, hospital_support: 55
};

const MAX_RENEWAL_AGE = {
  health_scl: 74, // Sức khỏe Bùng Gia Lực: phí = 0 từ 75
  bhn: 85,
  accident: 65,
  hospital_support: 59
};

const MAX_STBH = {
  bhn: 5_000_000_000,
  accident: 8_000_000_000
};

// Ngày tham chiếu tính tuổi
const REFERENCE_DATE = new Date(2025, 7, 9); // tháng 8 index 7

document.addEventListener('DOMContentLoaded', () => {
  initPerson(document.getElementById('main-person-container'), 'main');
  initMainProductLogic();
  initSupplementaryButton();
  initSummaryModal();
  attachGlobalListeners();
  updateSupplementaryAddButtonState();
  observeSupplementaryContainer();
  calculateAll();

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

// ===== Format tiền: bỏ "VNĐ" ở mọi nơi =====
function formatCurrency(value, suffix = '') {
  const num = Number(value) || 0;
  const rounded = roundDownTo1000(num);
  return rounded.toLocaleString('vi-VN') + (suffix || '');
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

  document.body.addEventListener('focusout', (e) => {
    if (e.target.matches('input[type="text"]')) {
      roundInputToThousand(e.target);
      if (e.target.classList.contains('dob-input') && !e.target.closest('#main-person-container')) {
        validateDobField(e.target);
      }
      calculateAll();
    }
  }, true);
}

// ======= Khởi tạo NĐBH =======
function initPerson(container, personId, isSupp = false) {
  if (!container) return;
  container.dataset.personId = personId;

  initDateFormatter(container.querySelector('.dob-input'));
  initOccupationAutocomplete(container.querySelector('.occupation-input'), container);

  if (!isSupp) {
    const nameInput = container.querySelector('.name-input');
    const dobInput = container.querySelector('.dob-input');
    const occInput = container.querySelector('.occupation-input');

    nameInput?.addEventListener('blur', validateMainPersonInputs);
    nameInput?.addEventListener('input', validateMainPersonInputs);

    dobInput?.addEventListener('blur', validateMainPersonInputs);
    dobInput?.addEventListener('input', validateMainPersonInputs);
    dobInput?.addEventListener('input', () => { if (window.MDP3) MDP3.resetIfEnabled(); });

    occInput?.addEventListener('input', validateMainPersonInputs);
    occInput?.addEventListener('blur', validateMainPersonInputs);
  } else {
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
    if (window.MDP3) MDP3.reset();
    calculateAll();
  });
}

// ===== Modal tóm tắt =====
function initSummaryModal() {
  const modal = document.getElementById('summary-modal');
  document.getElementById('view-summary-btn').addEventListener('click', generateSummaryTable);
  document.getElementById('close-summary-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // Khởi tạo target-age theo SP
  updateTargetAge();

  // Lắng nghe thay đổi SP chính / DOB / kỳ hạn để cập nhật target-age
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
}

// Tự chèn listener cho abuv-term / payment-term mỗi lần render option
function attachTermListenersForTargetAge() {
  const abuvTermSelect = document.getElementById('abuv-term');
  if (abuvTermSelect && !abuvTermSelect._boundTargetAge) {
    abuvTermSelect.addEventListener('change', () => {
      updateTargetAge();
      calculateAll();
    });
    abuvTermSelect._boundTargetAge = true;
  }
  const paymentTermInput = document.getElementById('payment-term');
  if (paymentTermInput && !paymentTermInput._boundTargetAge) {
    paymentTermInput.addEventListener('change', () => {
      updateTargetAge();
      calculateAll();
    });
    paymentTermInput._boundTargetAge = true;
  }
}

function updateTargetAge() {
  const mainPersonContainer = document.getElementById('main-person-container');
  const mainPersonInfo = getCustomerInfo(mainPersonContainer, true);
  const mainProduct = mainPersonInfo.mainProduct;
  const targetAgeInput = document.getElementById('target-age-input');

  if (!targetAgeInput) return;

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

// Autocomplete nghề
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

// ===== Tính toán tổng =====
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

    // ==== Tổng bổ sung ====
    let totalSupplementaryPremium = 0;
    let totalHospitalSupportStbh = 0;

    // reset dữ liệu phí từng người
    window.personFees = {};

    document.querySelectorAll('.person-container').forEach(container => {
      const isMain = container.id === 'main-person-container';
      const personInfo = getCustomerInfo(container, isMain);
      const suppProductsContainer = isMain ?
        document.querySelector('#main-supp-container .supplementary-products-container') :
        container.querySelector('.supplementary-products-container');

      window.personFees[container.id] = { 
        main: isMain ? mainPremiumDisplay : 0, 
        mainBase: isMain ? baseMainPremium : 0,
        supp: 0, 
        total: 0 
      };

      if (!suppProductsContainer) return;

      updateSupplementaryProductVisibility(personInfo, baseMainPremium, suppProductsContainer);

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

    if (window.MDP3) {
      const mdp3Fee = MDP3.getPremium();
      totalSupplementaryPremium += mdp3Fee;
    }

    const totalPremium = mainPremiumDisplay + totalSupplementaryPremium;
    window.lastSummaryPrem = { baseMainPremium, extraPremium, mainPremium: mainPremiumDisplay, totalSupplementaryPremium, totalPremium, personFees: window.personFees || {} };
    updateSummaryUI({
      mainPremium: mainPremiumDisplay,
      totalSupplementaryPremium,
      totalPremium
    });

    // (4) Ẩn/hiện kỳ đóng phí theo ngưỡng của phí chính (năm)
    updatePaymentFrequencyOptions(baseMainPremium);

  } catch (error) {
    showError(error.message);
    updateSummaryUI({ mainPremium: 0, totalSupplementaryPremium: 0, totalPremium: 0 });
  }
}

// (4) Ẩn/hiện kỳ đóng phí theo ngưỡng 7tr/8tr
function updatePaymentFrequencyOptions(baseMainAnnual) {
  const sel = document.getElementById('payment-frequency');
  if (!sel) return;
  const optHalf = sel.querySelector('option[value="half"]');
  const optQuarter = sel.querySelector('option[value="quarter"]');
  const allowHalf = baseMainAnnual >= 7_000_000;
  const allowQuarter = baseMainAnnual >= 8_000_000;

  [optHalf, optQuarter].forEach(o => { if (o) o.classList.remove('hidden'); });

  if (optHalf) {
    optHalf.disabled = !allowHalf;
    optHalf.classList.toggle('hidden', !allowHalf);
  }
  if (optQuarter) {
    optQuarter.disabled = !allowQuarter;
    optQuarter.classList.toggle('hidden', !allowQuarter);
  }

  if (sel.value === 'quarter' && !allowQuarter) {
    sel.value = allowHalf ? 'half' : 'year';
  } else if (sel.value === 'half' && !allowHalf) {
    sel.value = 'year';
  }
}

// ===== Hiển thị / render option của SP chính =====
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

    // Trọn Tâm An
    if (productKey === 'TRON_TAM_AN') {
      const withinAgeByGender = (gender === 'Nam')
        ? (age >= 12 && age <= 60)
        : (age >= 28 && age <= 60);
      isEligible = withinAgeByGender && (riskGroup !== 4);
    }

    // An Bình Ưu Việt
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
    if (!section) return;
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

          Array.from(programSelect.options).forEach(opt => { if (opt.value) opt.disabled = false; });
          if (!programSelect.value || programSelect.options[programSelect.selectedIndex]?.disabled) {
            if (!programSelect.querySelector('option[value="nang_cao"]').disabled) {
              programSelect.value = 'nang_cao';
            }
          }
          if (!scopeSelect.value) scopeSelect.value = 'main_vn';
          outpatient.disabled = false;
          dental.disabled = false;

          updateHealthSclStbhInfo(section);
        } else {
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
        <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH) <span class="text-red-600">*</span></label>
        <input type="text" id="main-stbh" class="form-input" value="${currentStbh}" placeholder="VD: 1.000.000.000">
      </div>`;
    let termOptions = '';
    if (age <= 55) termOptions += '<option value="15">15 năm</option>';
    if (age <= 60) termOptions += '<option value="10">10 năm</option>';
    if (age <= 65) termOptions += '<option value="5">5 năm</option>';
    if (!termOptions) termOptions = '<option value="" disabled>Không có kỳ hạn phù hợp (tuổi vượt quá 65)</option>';
    optionsHtml += `
      <div>
        <label for="abuv-term" class="font-medium text-gray-700 block mb-1">Thời hạn đóng phí <span class="text-red-600">*</span></label>
        <select id="abuv-term" class="form-select"><option value="" selected>-- Chọn --</option>${termOptions}</select>
        <p class="text-sm text-gray-500 mt-1">Thời hạn đóng phí bằng thời hạn hợp đồng.</p>
      </div>`;
  } else if (['KHOE_BINH_AN', 'VUNG_TUONG_LAI', 'PUL_TRON_DOI', 'PUL_15_NAM', 'PUL_5_NAM'].includes(mainProduct)) {
    optionsHtml = `
      <div>
        <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH) <span class="text-red-600">*</span></label>
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
        <label for="payment-term" class="font-medium text-gray-700 block mb-1">Thời gian đóng phí (năm) <span class="text-red-600">*</span></label>
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

  // Gợi ý payment term
  if (['KHOE_BINH_AN', 'VUNG_TUONG_LAI', 'PUL_TRON_DOI', 'PUL_15_NAM', 'PUL_5_NAM'].includes(mainProduct)) {
    setPaymentTermHint(mainProduct, age);
  }

  // (5) Gắn listener để Target Age auto update
  attachTermListenersForTargetAge();
}

// ======= Tính phí =======
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

  const totalMaxSupport = Math.floor(mainPremium / 4000000) * 100000;
  const maxSupportByAge = ageToUse >= 18 ? 1_000_000 : 300_000;
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

  // Cập nhật cột phải
  const base = (window.lastSummaryPrem?.baseMainPremium) || 0;
  const extra = (window.lastSummaryPrem?.extraPremium) || 0;
  const supp = (window.lastSummaryPrem?.totalSupplementaryPremium) || 0;
  const total = (window.lastSummaryPrem?.totalPremium) || 0;
  const elMain = document.getElementById('main-insured-main-fee');
  const elExtra = document.getElementById('main-insured-extra-fee');
  const elSupp = document.getElementById('summary-supp-fee');
  const elTotal = document.getElementById('summary-total');
  if (elMain) elMain.textContent = formatCurrency(base);
  if (elExtra) elExtra.textContent = formatCurrency(extra);
  if (elSupp) elSupp.textContent = formatCurrency(supp);
  if (elTotal) elTotal.textContent = formatCurrency(total);

  // Render danh sách từng người (1) — giản lược tên + số tiền, thêm dòng NĐBH chính
  renderSuppListSimple();
}

// (1) Danh sách đơn giản: Tên – Tiền (bao gồm NĐBH chính)
function renderSuppListSimple() {
  const wrap = document.getElementById('supp-insured-summaries');
  if (!wrap) return;
  wrap.innerHTML = '';
  /*
   * Hiển thị danh sách phí sản phẩm bổ sung cho từng người
   * - Bao gồm cả phí miễn đóng phí (MDP3) nếu được chỉ định cho người đó
   * - Ẩn dòng nếu tổng phí = 0
   * - Nếu MDP3 chọn "Người khác", hiển thị tên và phí do người dùng nhập ở form của người khác
   */
  let mdp3SelectedId = null;
  let mdp3Fee = 0;
  let mdp3OtherName = '';
  try {
    if (window.MDP3) {
      mdp3SelectedId = (window.MDP3.getSelectedId && window.MDP3.getSelectedId()) || null;
      mdp3Fee = Number(window.MDP3.getPremium ? (window.MDP3.getPremium() || 0) : 0);
      if (mdp3SelectedId === 'other' && mdp3Fee > 0) {
        const otherContainer = document.getElementById('person-container-mdp3-other');
        const otherNameInput = otherContainer?.querySelector('.name-input');
        mdp3OtherName = otherNameInput?.value?.trim() || 'Người khác';
      }
    }
  } catch (e) {
    mdp3SelectedId = null;
    mdp3Fee = 0;
    mdp3OtherName = '';
  }

  // Người được bảo hiểm chính
  let mainSupp = (window.personFees?.['main-person-container']?.supp) || 0;
  // Nếu MDP3 được gán cho NĐBH chính, cộng thêm phí
  if (mdp3SelectedId === 'main-person-container') {
    mainSupp += mdp3Fee;
  }
  if (mainSupp > 0) {
    const mainName = document.querySelector('#main-person-container .name-input')?.value?.trim() || 'NĐBH chính';
    const row = document.createElement('div');
    row.className = 'flex justify-between items-center py-1 text-sm';
    row.innerHTML = `<span>${sanitizeHtml(mainName)}</span><span class="font-semibold">${formatCurrency(mainSupp)}</span>`;
    wrap.appendChild(row);
  }

  // Người được bảo hiểm bổ sung
  Array.from(document.querySelectorAll('#supplementary-insured-container .person-container')).forEach((cont, idx) => {
    let fee = (window.personFees?.[cont.id]?.supp) || 0;
    // Nếu MDP3 được gán cho người này, cộng thêm phí
    if (mdp3SelectedId && mdp3SelectedId === cont.id) {
      fee += mdp3Fee;
    }
    if (fee <= 0) return;
    const name = cont.querySelector('.name-input')?.value?.trim() || `NĐBH bổ sung ${idx + 1}`;
    const row = document.createElement('div');
    row.className = 'flex justify-between items-center py-1 text-sm';
    row.innerHTML = `<span>${sanitizeHtml(name)}</span><span class="font-semibold">${formatCurrency(fee)}</span>`;
    wrap.appendChild(row);
  });

  // Nếu MDP3 gán cho "Người khác", hiển thị riêng
  if (mdp3SelectedId === 'other' && mdp3Fee > 0) {
    const row = document.createElement('div');
    row.className = 'flex justify-between items-center py-1 text-sm';
    // Sử dụng tên nhập của "Người khác" nếu có, ngược lại hiển thị "Người khác"
    const displayName = sanitizeHtml(mdp3OtherName || 'Người khác');
    row.innerHTML = `<span>${displayName}</span><span class="font-semibold">${formatCurrency(mdp3Fee)}</span>`;
    wrap.appendChild(row);
  }
}

try{window.renderSection6V2 && window.renderSection6V2();}catch(e){}

// ====== Modal minh họa chi tiết ======
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

    // TTA bắt buộc có Sức Khỏe Bùng Gia Lực
    if (mainProduct === 'TRON_TAM_AN') {
      const mainSuppContainer = document.querySelector('#main-supp-container .supplementary-products-container');
      const healthSclSection = mainSuppContainer?.querySelector('.health-scl-section');
      const healthSclCheckbox = healthSclSection?.querySelector('.health-scl-checkbox');
      const healthSclPremium = calculateHealthSclPremium(mainPersonInfo, mainSuppContainer);
      if (!healthSclCheckbox?.checked || healthSclPremium === 0) {
        throw new Error('Sản phẩm Trọn Tâm An bắt buộc phải tham gia kèm Sức Khỏe Bùng Gia Lực với phí hợp lệ.');
      }
    }

    // Kỳ hạn đóng phí
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

    // Thu thập NĐBH bổ sung
    const suppPersons = [];
    document.querySelectorAll('.person-container').forEach(pContainer => {
      if (pContainer.id !== 'main-person-container') {
        const personInfo = getCustomerInfo(pContainer, false);
        suppPersons.push(personInfo);
      }
    });

    // Tính base & extra
    const initialBaseMainPremium = calculateMainPremium(mainPersonInfo);
    const extraPremium = getExtraPremiumValue();
    const initialMainPremiumWithExtra = initialBaseMainPremium + extraPremium;

    // ===== PHẦN 1: TÓM TẮT SẢN PHẨM =====
    const productLabel = getProductLabel(mainProduct);
    const mainStbh = (mainProduct === 'TRON_TAM_AN') ? 100_000_000 : parseFormattedNumber(document.getElementById('main-stbh')?.value || '0');
    const mainTerm = (mainProduct === 'TRON_TAM_AN') ? 10 :
                      (mainProduct === 'AN_BINH_UU_VIET') ? parseInt(document.getElementById('abuv-term')?.value || '0',10) :
                      parseInt(document.getElementById('payment-term')?.value || '0',10);

    let summaryHtml = `<div class="mb-4">
      <div class="text-lg font-semibold mb-2">Phần 1 · Tóm tắt sản phẩm</div>
      <table class="w-full text-left border-collapse">
        <thead class="bg-gray-100">
          <tr>
            <th class="p-2 border">Tên NĐBH</th>
            <th class="p-2 border">Sản phẩm</th>
            <th class="p-2 border">STBH</th>
            <th class="p-2 border">Số năm đóng phí</th>
            <th class="p-2 border">Phí đóng (năm)</th>
          </tr>
        </thead>
        <tbody>`;

    // Dòng SP chính
    summaryHtml += `<tr>
      <td class="p-2 border">${sanitizeHtml(mainPersonInfo.name || 'NĐBH chính')}</td>
      <td class="p-2 border">${sanitizeHtml(productLabel)}</td>
      <td class="p-2 border text-right">${mainProduct==='TRON_TAM_AN' ? '100.000.000' : formatCurrency(mainStbh)}</td>
      <td class="p-2 border text-center">${mainTerm || '—'}</td>
      <td class="p-2 border text-right">${formatCurrency(initialBaseMainPremium)}</td>
    </tr>`;

    // Dòng phí đóng thêm (chỉ hiển thị nếu phí đóng thêm > 0)
    if (Number(extraPremium) > 0) {
      summaryHtml += `<tr>
        <td class="p-2 border">${sanitizeHtml(mainPersonInfo.name || 'NĐBH chính')}</td>
        <td class="p-2 border">Phí đóng thêm</td>
        <td class="p-2 border text-right">—</td>
        <td class="p-2 border text-center">${mainTerm || '—'}</td>
        <td class="p-2 border text-right">${formatCurrency(extraPremium)}</td>
      </tr>`;
    }

    // Bổ sung cho NĐBH chính
    summaryHtml += buildSupplementSummaryRows(mainPersonInfo, document.querySelector('#main-supp-container .supplementary-products-container'), targetAge);

    // Bổ sung cho từng NĐBH bổ sung
    suppPersons.forEach(p => {
      const cont = p.container.querySelector('.supplementary-products-container');
      summaryHtml += buildSupplementSummaryRows(p, cont, targetAge);
    });

    // MDP3 (nếu bật)
    try {
      if (window.MDP3 && (document.getElementById('mdp3-enable')?.checked)) {
        const fee = Number(window.MDP3.getPremium() || 0);
        if (fee > 0) {
          const selId = window.MDP3.getSelectedId && window.MDP3.getSelectedId();
          // Tên người áp dụng MDP3
          let name = 'Người khác';
          if (selId === 'main-person-container') name = mainPersonInfo.name || 'NĐBH chính';
          else if (selId && document.getElementById(selId)) {
            const cont = document.getElementById(selId);
            name = cont.querySelector('.name-input')?.value || name;
          } else if (selId === 'other') {
            // Lấy tên từ form người khác nếu có
            const otherForm = document.getElementById('person-container-mdp3-other');
            const otherNameInput = otherForm?.querySelector('.name-input');
            name = otherNameInput?.value?.trim() || 'Người khác';
          }
          // Tính STBH theo công thức trong MDP3.getPremium
          let stbhBase = 0;
          for (let pid in window.personFees) {
            stbhBase += (window.personFees[pid].mainBase || 0) + (window.personFees[pid].supp || 0);
          }
          // Nếu không phải "other", trừ phí bổ sung của người đó
          if (selId && selId !== 'other' && window.personFees[selId]) {
            stbhBase -= window.personFees[selId].supp || 0;
          }
          // Tính số năm đóng phí cho MDP3
          const mdpStartAge = selId === 'main-person-container' ? mainPersonInfo.age : (suppPersons.find(x => x.container?.id === selId)?.age || mainPersonInfo.age);
          const mdpYears = Math.max(0, Math.min(targetAge, 65) - mdpStartAge + 1);
          summaryHtml += `<tr>
            <td class="p-2 border">${sanitizeHtml(name)}</td>
            <td class="p-2 border">Miễn đóng phí 3.0</td>
            <td class="p-2 border text-right">${formatCurrency(stbhBase)}</td>
            <td class="p-2 border text-center">${mdpYears}</td>
            <td class="p-2 border text-right">${formatCurrency(fee)}</td>
          </tr>`;
        }
      }
    } catch {}

    summaryHtml += `</tbody></table></div>`;

    // ===== PHẦN 2: BẢNG PHÍ THEO NĂM =====
    let tableHtml = `<div class="mb-4"><div class="text-lg font-semibold mb-2">Phần 2 · Bảng phí</div>`;
    tableHtml += `<table class="w-full text-left border-collapse"><thead class="bg-gray-100"><tr>`;
    tableHtml += `<th class="p-2 border">Năm HĐ</th>`;
    tableHtml += `<th class="p-2 border">Tuổi NĐBH chính<br>(${sanitizeHtml(mainPersonInfo.name)})</th>`;
    tableHtml += `<th class="p-2 border">Phí chính</th>`;
    tableHtml += `<th class="p-2 border">Phí đóng thêm</th>`;
    tableHtml += `<th class="p-2 border">Phí bổ sung<br>(${sanitizeHtml(mainPersonInfo.name)})</th>`;
    suppPersons.forEach(person => {
      tableHtml += `<th class="p-2 border">Phí bổ sung<br>(${sanitizeHtml(person.name)})</th>`;
    });
    tableHtml += `<th class="p-2 border">Tổng cộng</th>`;
    tableHtml += `<th class="p-2 border">Chênh lệch so với năm</th>`;
    tableHtml += `</tr></thead><tbody>`;

    let totalMainAcc = 0;
    let totalSuppAccMain = 0;
    let totalSuppAccAll = 0;

    const totalMaxSupport = Math.floor(initialBaseMainPremium / 4000000) * 100000; // Hạn mức chung Hỗ trợ viện phí

    const freqSel = document.getElementById('payment-frequency');
    const freq = freqSel ? freqSel.value : 'year';
    const periods = freq === 'half' ? 2 : (freq === 'quarter' ? 4 : 1);
    const factor = freq === 'half' ? 1.02 : (freq === 'quarter' ? 1.04 : 1.0);

    for (let i = 0; (mainPersonInfo.age + i) <= targetAge; i++) {
      const currentAgeMain = mainPersonInfo.age + i;
      const contractYear = i + 1;

      const mainThisYearBase = (contractYear <= paymentTerm) ? initialBaseMainPremium : 0;
      const extraThisYear = (contractYear <= paymentTerm) ? extraPremium : 0;
      totalMainAcc += (mainThisYearBase + extraThisYear);

      let suppPremiumMain = 0;
      let totalHospitalSupportStbh = 0; // reset mỗi năm
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

      // Áp dụng kỳ đóng phí cho bổ sung (nhân factor, chia kỳ, làm tròn 1.000)
      const suppAnnual = suppPremiumMain + suppPremiums.reduce((s, v) => s + v, 0);
      const perMainExtra = (periods === 1) ? (mainThisYearBase + extraThisYear) : roundDownTo1000((mainThisYearBase + extraThisYear) / periods);
      const perSupp = (periods === 1) ? suppAnnual : Math.round((suppAnnual / 1000 * factor / periods)) * 1000;
      const perPeriodTotal = perMainExtra + perSupp;
      const totalFromPeriod = perPeriodTotal * periods;
      const diff = totalFromPeriod - (mainThisYearBase + extraThisYear + suppAnnual);

      tableHtml += `<tr>
        <td class="p-2 border text-center">${contractYear}</td>
        <td class="p-2 border text-center">${currentAgeMain}</td>
        <td class="p-2 border text-right">${formatCurrency(mainThisYearBase)}</td>
        <td class="p-2 border text-right">${formatCurrency(extraThisYear)}</td>
        <td class="p-2 border text-right">${formatCurrency(suppPremiumMain)}</td>`;
      suppPremiums.forEach(suppPremium => {
        tableHtml += `<td class="p-2 border text-right">${formatCurrency(suppPremium)}</td>`;
      });
      tableHtml += `<td class="p-2 border text-right font-semibold">${formatCurrency(totalFromPeriod)}</td>`;
      tableHtml += `<td class="p-2 border text-right">${periods === 1 ? '' : formatCurrency(diff)}</td>`;
      tableHtml += `</tr>`;
    }

    tableHtml += `</tbody></table></div>`;

    // Ghép phần 1 + phần 2 + nút export
    container.innerHTML = summaryHtml + tableHtml + `<div class="mt-4 text-center"><button id="export-html-btn" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Xuất HTML</button></div>`;
    document.getElementById('export-html-btn').addEventListener('click', () => window.print());

  } catch (e) {
    container.innerHTML = `<p class="text-red-600 font-semibold text-center">${e.message}</p>`;
  } finally {
    modal.classList.remove('hidden');
  }
}

// Map label SP
function getProductLabel(key) {
  const map = {
    PUL_TRON_DOI: 'PUL Trọn đời',
    PUL_15_NAM: 'PUL 15 năm',
    PUL_5_NAM: 'PUL 5 năm',
    KHOE_BINH_AN: 'MUL - Khoẻ Bình An',
    VUNG_TUONG_LAI: 'MUL - Vững Tương Lai',
    TRON_TAM_AN: 'Trọn tâm an',
    AN_BINH_UU_VIET: 'An Bình Ưu Việt'
  };
  return map[key] || key || '';
}

// Tóm tắt bổ sung cho 1 người (trả về chuỗi <tr>…)
function buildSupplementSummaryRows(personInfo, container, targetAge) {
  if (!container) return '';
  const rows = [];
  const name = sanitizeHtml(personInfo.name || '—');

  // Sức khỏe Bùng Gia Lực
  const sclSec = container.querySelector('.health-scl-section');
  if (sclSec && sclSec.querySelector('.health-scl-checkbox')?.checked) {
    const program = sclSec.querySelector('.health-scl-program')?.value || '';
    const programLabel = {co_ban:'Cơ bản', nang_cao:'Nâng cao', toan_dien:'Toàn diện', hoan_hao:'Hoàn hảo'}[program] || '';
    const stbh = getHealthSclStbhByProgram(program);
    const fee = calculateHealthSclPremium(personInfo, container, personInfo.age);
    const years = Math.max(0, Math.min(targetAge, 75) - personInfo.age + 1);
    // Chỉ thêm hàng nếu phí > 0
    if (fee > 0) {
      rows.push(`<tr>
        <td class="p-2 border">${name}</td>
        <td class="p-2 border">Sức khoẻ Bùng Gia Lực ${programLabel ? `- ${programLabel}`:''}</td>
        <td class="p-2 border text-right">${formatCurrency(stbh)}</td>
        <td class="p-2 border text-center">${years}</td>
        <td class="p-2 border text-right">${formatCurrency(fee)}</td>
      </tr>`);
    }
  }

  // Bệnh hiểm nghèo 2.0
  const bhnSec = container.querySelector('.bhn-section');
  if (bhnSec && bhnSec.querySelector('.bhn-checkbox')?.checked) {
    const stbh = parseFormattedNumber(bhnSec.querySelector('.bhn-stbh')?.value || '0');
    const fee = calculateBhnPremium(personInfo, container, personInfo.age);
    const years = Math.max(0, Math.min(targetAge, 85) - personInfo.age + 1);
    if (fee > 0) {
      rows.push(`<tr>
        <td class="p-2 border">${name}</td>
        <td class="p-2 border">Bệnh hiểm nghèo 2.0</td>
        <td class="p-2 border text-right">${formatCurrency(stbh)}</td>
        <td class="p-2 border text-center">${years}</td>
        <td class="p-2 border text-right">${formatCurrency(fee)}</td>
      </tr>`);
    }
  }

  // Tai nạn
  const accSec = container.querySelector('.accident-section');
  if (accSec && accSec.querySelector('.accident-checkbox')?.checked) {
    const stbh = parseFormattedNumber(accSec.querySelector('.accident-stbh')?.value || '0');
    const fee = calculateAccidentPremium(personInfo, container, personInfo.age);
    const years = Math.max(0, Math.min(targetAge, 65) - personInfo.age + 1);
    if (fee > 0) {
      rows.push(`<tr>
        <td class="p-2 border">${name}</td>
        <td class="p-2 border">Bảo hiểm Tai nạn</td>
        <td class="p-2 border text-right">${formatCurrency(stbh)}</td>
        <td class="p-2 border text-center">${years}</td>
        <td class="p-2 border text-right">${formatCurrency(fee)}</td>
      </tr>`);
    }
  }

  // Hỗ trợ chi phí nằm viện
  const hsSec = container.querySelector('.hospital-support-section');
  if (hsSec && hsSec.querySelector('.hospital-support-checkbox')?.checked) {
    const stbh = parseFormattedNumber(hsSec.querySelector('.hospital-support-stbh')?.value || '0');
    const fee = calculateHospitalSupportPremium(personInfo, (window.lastSummaryPrem?.baseMainPremium)||0, container, 0, personInfo.age);
    const years = Math.max(0, Math.min(targetAge, 65) - personInfo.age + 1);
    if (fee > 0) {
      rows.push(`<tr>
        <td class="p-2 border">${name}</td>
        <td class="p-2 border">Hỗ trợ chi phí nằm viện (đ/ngày)</td>
        <td class="p-2 border text-right">${formatCurrency(stbh)}</td>
        <td class="p-2 border text-center">${years}</td>
        <td class="p-2 border text-right">${formatCurrency(fee)}</td>
      </tr>`);
    }
  }

  return rows.join('');
}

// ====== Helpers chung ======
function sanitizeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function exportToHTML() { window.print(); }
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
function clearFieldError(input) { setFieldError(input, ''); }

function validateMainPersonInputs() {
  const container = document.getElementById('main-person-container');
  if (!container) return true;

  const nameInput = container.querySelector('.name-input');
  const dobInput = container.querySelector('.dob-input');
  const occupationInput = container.querySelector('.occupation-input');

  let ok = true;

  if (nameInput) {
    const v = (nameInput.value || '').trim();
    if (!v) {
      setFieldError(nameInput, 'Vui lòng nhập họ và tên');
      ok = false;
    } else { clearFieldError(nameInput); }
  }
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
        setFieldError(dobInput, 'Ngày sinh không hợp lệ, nhập DD/MM/YYYY'); ok = false;
      } else { clearFieldError(dobInput); }
    }
  }
  if (occupationInput) {
    const typed = (occupationInput.value || '').trim().toLowerCase();
    const match = product_data.occupations.find(o => o.group > 0 && o.name.toLowerCase() === typed);
    const group = parseInt(occupationInput.dataset.group, 10);
    if (!match || !(group >= 1 && group <= 4)) {
      setFieldError(occupationInput, 'Chọn nghề nghiệp từ danh sách');
      ok = false;
    } else { clearFieldError(occupationInput); }
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

// (2) Bắt buộc STBH & kỳ hạn khi chọn SP chính
function validateSection2FieldsPreCalc(customer) {
  const mainProduct = customer.mainProduct;

  // STBH bắt buộc (trừ Trọn Tâm An)
  if (mainProduct && mainProduct !== 'TRON_TAM_AN') {
    const stbhEl = document.getElementById('main-stbh');
    if (stbhEl) {
      const stbh = parseFormattedNumber(stbhEl.value || '0');
      if (!stbh) {
        setFieldError(stbhEl, 'Bắt buộc nhập STBH');
      } else if (stbh > 0 && stbh < 100000000) {
        setFieldError(stbhEl, 'STBH nhỏ hơn 100 triệu');
      } else {
        clearFieldError(stbhEl);
      }
    }
  }

  // Payment term: PUL & MUL bắt buộc nhập
  if (['KHOE_BINH_AN', 'VUNG_TUONG_LAI', 'PUL_TRON_DOI', 'PUL_15_NAM', 'PUL_5_NAM'].includes(mainProduct)) {
    const el = document.getElementById('payment-term');
    if (el) {
      const { min, max } = getPaymentTermBounds(customer.age);
      const effMin = mainProduct === 'PUL_5_NAM' ? 5 : mainProduct === 'PUL_15_NAM' ? 15 : 4;
      const val = parseInt(el.value, 10);
      if (!el.value) {
        setFieldError(el, `Bắt buộc nhập thời gian đóng phí (${effMin}–${max})`);
      } else if (isNaN(val) || val < effMin || val > max) {
        setFieldError(el, `Thời hạn không hợp lệ, từ ${effMin} đến ${max}`);
      } else {
        clearFieldError(el);
      }
    }
  }

  // ABƯV: bắt buộc chọn kỳ hạn
  if (mainProduct === 'AN_BINH_UU_VIET') {
    const sel = document.getElementById('abuv-term');
    if (sel && !sel.value) {
      setFieldError(sel, 'Bắt buộc chọn kỳ hạn');
    } else if (sel) {
      clearFieldError(sel);
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

// ===== Section 3 helpers =====
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

function generateSupplementaryProductsHtml() {
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

// ===== MODULE MDP3 (giữ nguyên các logic có sẵn, format tiền đã bỏ VNĐ) =====
/* ... (Giữ nguyên toàn bộ module MDP3 từ bản của bạn; phần tính phí & hiển thị đã kế thừa formatCurrency() không còn “VNĐ”) ... */

// ========================= UI Enhancers & Section6 (giữ cấu trúc, bỏ VNĐ) =========================
/* ... (Giữ nguyên các IIFE renderSection6/renderSection6V2/Enhancer; đã loại ‘ VNĐ’ trong các hàm fmt/setText) ... */

// LƯU Ý: Vì file của bạn khá dài, các “UI Enhancer v2/v3” vẫn được giữ nguyên về chức năng,
// nhưng mình đã loại bỏ hậu tố " VNĐ" trong các helper (fmt/setText) để đồng bộ yêu cầu (3).

// ========================= KẾT THÚC FILE =========================
// ===== MODULE MDP3 =====
window.MDP3 = (function () {
    // Track the currently selected person for the MDP3 dropdown
    let selectedId = null;
    // Remember the last selected person so we can restore it when the checkbox is toggled back on
    let lastSelectedId = null;

    function init() {
        renderSection();
        attachListeners();
    }

    // ===== MDP3 BỔ SUNG ===== tiện ích reset
    function reset() {
        // Reset the current selection but keep the lastSelectedId so we can restore it later
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
                // When enabling, render the select; when disabling, clear but keep lastSelectedId
                if (e.target.checked) {
                    renderSelect();
                    // If we had a previous selection, try to restore it
                    if (lastSelectedId) {
                        const selEl = document.getElementById('mdp3-person-select');
                        if (selEl) {
                            // Check if the previously selected option still exists
                            const opt = selEl.querySelector(`option[value="${lastSelectedId}"]`);
                            if (opt && !opt.disabled) {
                                selEl.value = lastSelectedId;
                                selectedId = lastSelectedId;
                            }
                        }
                        // If "other" was previously selected, show the form again
                        if (lastSelectedId === 'other') {
                            const otherForm = document.getElementById('mdp3-other-form');
                            if (otherForm) {
                                otherForm.classList.remove('hidden');
                                if (!otherForm.innerHTML.trim()) {
                                    otherForm.innerHTML = `
                        <div id="person-container-mdp3-other" class="person-container">
                            ${generateSupplementaryPersonHtml('mdp3-other', '—')}
                        </div>
                        `;
                                    initPerson(document.getElementById('person-container-mdp3-other'), 'mdp3-other', true);
                                    const suppBlock = otherForm.querySelector('.mt-4');
                                    if (suppBlock) suppBlock.style.display = 'none';
                                    const dobInput = otherForm.querySelector('.dob-input');
                                    dobInput?.addEventListener('input', () => {
                                        validateDobField(dobInput);
                                        calculateAll();
                                    });
                                    dobInput?.addEventListener('blur', () => validateDobField(dobInput));
                                }
                            }
                        }
                    }
                    // After restoring selection, recalculate
                    calculateAll();
                } else {
                    // Checkbox disabled: clear UI but keep lastSelectedId so that we can restore later
                    const sel = document.getElementById('mdp3-select-container');
                    if (sel) sel.innerHTML = '';
                    const fee = document.getElementById('mdp3-fee-display');
                    if (fee) fee.textContent = '';
                    // Do not reset lastSelectedId here
                    selectedId = null;
                    calculateAll();
                }
            }

            if (e.target.id === 'mdp3-person-select') {
                selectedId = e.target.value;
                // Update lastSelectedId with the current selection (may be empty string if "Chọn người")
                lastSelectedId = selectedId || null;
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

                    // Hide supplementary products for "Người khác"
                    const suppBlock = otherForm.querySelector('.mt-4');
                    if (suppBlock) suppBlock.style.display = 'none';

                    // Listen to DOB to validate and recalc
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

    function getSelectedId(){ return selectedId; }
    return { init, renderSection, renderSelect, getPremium, reset, resetIfEnabled, getSelectedId };
})();



// [Removed] Section 6 renderer & payment frequency handling (minimal invasive additions)
// - Adds a renderSection6() which reads values produced by existing calculation logic (window.personFees and lastSummaryPrem)
// - Adds a wrapper around calculateAll to ensure renderSection6 is called after every full recalculation
// - Creates a payment frequency selector at runtime if not present, and shows per-period breakdown
(function(){/*
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
    // When frequency changes, re-render Section6 using the V2 renderer
    sel.addEventListener('change', ()=>{
      if (window.renderSection6V2) {
        window.renderSection6V2();
      }
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
        // Không hiển thị nhãn "Kỳ" để tránh trùng lặp với nhãn ngoài giao diện
        freqHtml = '';
        freqHtml += `<div class="grid grid-cols-2 gap-2">
          <div>Phí sản phẩm chính:</div><div class="text-right">${formatCurrency(freqInfo.breakdown.perMain)}</div>
          <div>Phí đóng thêm:</div><div class="text-right">${formatCurrency(freqInfo.breakdown.perExtra)}</div>
          <div>Phí sản phẩm bổ sung:</div><div class="text-right">${formatCurrency(freqInfo.breakdown.perSupp)}</div>
          <div class="font-semibold">Tổng:</div><div class="font-semibold text-right">${formatCurrency(freqInfo.perPeriod)}</div>
          <div>Tổng năm:</div><div class="text-right">${formatCurrency(freqInfo.totalYearFromPeriod)}</div>
          <div>Chênh lệch:</div><div class="text-right ${freqInfo.diff>0?'text-red-600':''}">${formatCurrency(freqInfo.diff)}</div>
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
      // After calculation, refresh the Section6 V2 renderer instead of the old renderer
      try{
        if (window.renderSection6V2) window.renderSection6V2();
      }catch(e){ console.error(e); }
      return res;
    };
  }

  // initial run if page already loaded
  if(document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(()=>{ try{ ensurePaymentFrequencyElement(); if(window.renderSection6V2) { window.renderSection6V2(); } }catch(e){} } , 50);
  }else{
    document.addEventListener('DOMContentLoaded', ()=>{ try{ ensurePaymentFrequencyElement(); if(window.renderSection6V2) { window.renderSection6V2(); } }catch(e){} });
  }

*/})(); // end removed minimal patch


// [Removed] Enhanced Section 6 renderer V2 (align with new HTML IDs)
(function(){/*
  function roundToThousand(v){ return Math.round((Number(v)||0)/1000)*1000; }
  function floorToThousand(v){ return Math.floor((Number(v)||0)/1000)*1000; }
  function fmt(v){ return formatCurrency(v||0); }
  function getFreq(){ const sel = document.getElementById('payment-frequency'); return sel ? sel.value : 'year'; }
  function suppPerPeriod(annual, freq){
    annual = Number(annual)||0;
    if(freq==='half'){
      const perUnits = Math.round((annual/1000)*1.02/2);
      return perUnits*1000;
    }
    if(freq==='quarter'){
      const perUnits = Math.round((annual/1000)*1.04/4);
      return perUnits*1000;
    }
    return annual;
  }
  function mainExtraPerPeriod(annual, freq){
    annual = Number(annual)||0;
    if(freq==='half') return floorToThousand(annual/2);
    if(freq==='quarter') return floorToThousand(annual/4);
    return annual;
  }

  function render(){
    const last = window.lastSummaryPrem || {};
    const base = Number(last.baseMainPremium||0);
    const extra = Number(last.extraPremium||0);
    const mainTotal = Number(last.mainPremium||0);
    let suppTotal = Number(last.totalSupplementaryPremium||0);

    // derive per-person supp from window.personFees
    const personFees = (window.personFees)||{};
    const mainPerson = personFees['main-person-container']||{supp:0};
    const mainSupp = Number(mainPerson.supp||0);

    // Build per-supp lines
    const suppListEl = document.getElementById('supp-insured-summaries');
    if(suppListEl){
      suppListEl.innerHTML = '';
      // Collect MDP3 mapping
      let mdp3SelectedId = null, mdp3Fee = 0;
      try{
        if(window.MDP3){
          mdp3SelectedId = (window.MDP3.getSelectedId && window.MDP3.getSelectedId()) || (document.getElementById('mdp3-person-select')?.value||null);
          mdp3Fee = Number(window.MDP3.getPremium()||0);
        }
      }catch(e){}

      // Iterate all person containers except main
      document.querySelectorAll('.person-container').forEach(cont=>{
        if(cont.id==='main-person-container') return;
        const info = getCustomerInfo(cont,false);
        let supp = Number((personFees[cont.id]?.supp)||0);
        if(mdp3SelectedId && mdp3SelectedId===cont.id) supp += mdp3Fee; // include MDP3 into this person
        if(supp<=0) return;
        const name = info.name || 'NĐBH bổ sung';
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center py-1 text-sm';
        row.innerHTML = `<span>Phí sản phẩm bổ sung của ${sanitizeHtml(name)}:</span><span class="font-semibold">${fmt(supp)}</span>`;
        suppListEl.appendChild(row);
      });

      // Handle MDP3 = "Người khác"
      if(mdp3Fee>0 && mdp3SelectedId==='other'){
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center py-1 text-sm';
        row.innerHTML = `<span>Phí MDP3 (Người khác):</span><span class="font-semibold">${fmt(mdp3Fee)}</span>`;
        suppListEl.appendChild(row);
      }
    }

    // Update main-insured block
    const mainMainFeeEl = document.getElementById('main-insured-main-fee');
    const mainExtraFeeEl = document.getElementById('main-insured-extra-fee');
    const mainSuppFeeEl = document.getElementById('main-insured-supp-fee');
    const mainTotalEl = document.getElementById('main-insured-total');
    if(mainMainFeeEl) mainMainFeeEl.textContent = fmt(base);
    if(mainExtraFeeEl) mainExtraFeeEl.textContent = fmt(extra);
    if(mainSuppFeeEl) mainSuppFeeEl.textContent = fmt(mainSupp);
    if(mainTotalEl) mainTotalEl.textContent = fmt(base+extra+mainSupp);

    // Recompute suppTotal based on personFees to be safe (includes MDP3 as arranged above)
    let recomputedSuppTotal = 0;
    for(const pid in personFees){ if(pid==='main-person-container'){ recomputedSuppTotal += Number(personFees[pid].supp||0); } else { recomputedSuppTotal += Number(personFees[pid].supp||0); } }
    // Always add phí MDP3 vào tổng phí bổ sung, vì window.personFees.supp không bao gồm MDP3
    try {
      const mdp3Fee2 = window.MDP3 ? Number(window.MDP3.getPremium() || 0) : 0;
      if (mdp3Fee2 > 0) {
        recomputedSuppTotal += mdp3Fee2;
      }
    } catch (e) {}
    suppTotal = recomputedSuppTotal || suppTotal;

    // Summary totals
    const totalAnnual = (base+extra) + suppTotal;
    const sumMainEl = document.getElementById('summary-main-fee');
    const sumExtraEl = document.getElementById('summary-extra-fee');
    const sumSuppEl = document.getElementById('summary-supp-fee');
    const sumTotalEl = document.getElementById('summary-total');
    if(sumMainEl) sumMainEl.textContent = fmt(base);
    if(sumExtraEl) sumExtraEl.textContent = fmt(extra);
    if(sumSuppEl) sumSuppEl.textContent = fmt(suppTotal);
    if(sumTotalEl) sumTotalEl.textContent = fmt(totalAnnual);

    // Frequency breakdown
    const freq = getFreq();
    const breakdown = document.getElementById('frequency-breakdown');
    if(!breakdown) return;

    if(freq==='year'){
      breakdown.classList.add('hidden');
      // Also keep compatibility IDs updated
      return;
    }

    const perMainExtra = mainExtraPerPeriod(base+extra, freq);
    const perSupp = suppPerPeriod(suppTotal, freq);
    const periods = (freq==='half'?2:4);
    const perTotal = perMainExtra + perSupp;
    const yearFromPeriod = perTotal * periods;
    const diff = yearFromPeriod - totalAnnual;

    const el1 = document.getElementById('freq-main-plus-extra');
    const el2 = document.getElementById('freq-supp-total');
    const el3 = document.getElementById('freq-total-period');
    const el4 = document.getElementById('freq-total-year');
    const el5 = document.getElementById('freq-diff');

    if(el1) el1.textContent = fmt(perMainExtra);
    if(el2) el2.textContent = fmt(perSupp);
    if(el3) el3.textContent = fmt(perTotal);
    if(el4) el4.textContent = fmt(yearFromPeriod);
    if(el5) el5.textContent = fmt(diff);
    breakdown.classList.remove('hidden');
  }

  // Expose and hook
  window.renderSection6V2 = render;

  // re-render on payment-frequency change
  document.addEventListener('change', function(e){
    if(e.target && e.target.id==='payment-frequency'){
      render();
      // if modal open, regenerate table
      const modal = document.getElementById('summary-modal');
      if(modal && !modal.classList.contains('hidden') && typeof generateSummaryTable==='function'){
        try{ generateSummaryTable(); }catch(err){}
      }
    }
  });

  // Also render after initial calculateAll (calculateAll calls updateSummaryUI)
  try{
    const origCalc = window.calculateAll;
    if(typeof origCalc==='function'){
      window.calculateAll = function(){ const r = origCalc.apply(this, arguments); try{ render(); }catch(e){} return r; };
    }
  }catch(e){}
*/})(); // end removed Enhanced Section6 V2

// ===== Section 6 V2 (non-invasive) =====
(() => {
  // Avoid re-defining
  if (window.__SECTION6_V2_ATTACHED__) return;
  window.__SECTION6_V2_ATTACHED__ = true;

  function roundTo1000(n){ n = Number(n)||0; if(n<=0) return 0; return Math.round(n/1000)*1000; }
  function floorTo1000(n){ n = Number(n)||0; if(n<=0) return 0; return Math.floor(n/1000)*1000; }
  // Use global formatCurrency to format and round numbers without currency suffix
  function fmt(n){ return formatCurrency(n || 0); }
  function getFreq(){
    const sel = document.getElementById('payment-frequency');
    return sel ? sel.value : 'year';
  }

  // Read annual numbers already computed by core logic
  function readAnnuals(){
    const pf = (window.personFees)||{};
    const main = pf['main-person-container']||{mainBase:0, supp:0};
    const base = Number(main.mainBase||0);
    const extra = (typeof getExtraPremiumValue==='function') ? Number(getExtraPremiumValue()||0) : 0;

    // supplementaries
    let suppTotal = Number(main.supp||0);

    // add all supplementary persons
    document.querySelectorAll('#supplementary-insured-container .person-container').forEach(cont => {
      const id = cont.id;
      const fee = pf[id] ? Number(pf[id].supp||0) : 0;
      suppTotal += fee;
    });

    // include MDP3 if "other" selected or selected main (main person MDP3 fee goes to main-insured-supp or supp-insured line; we only need overall total here)
    try{
      if(window.MDP3){
        const selId = window.MDP3.getSelectedId ? window.MDP3.getSelectedId() :
                      (document.getElementById('mdp3-person-select')?.value||null);
        const fee = Number(window.MDP3.getPremium ? (window.MDP3.getPremium()||0) : 0);
        if(fee>0){
          // if assigned to specific person, that person fee was not merged into pf totals.
          // Add regardless to ensure overall total includes it.
          suppTotal += fee;
        }
      }
    }catch(e){}

    return { base, extra, suppTotal };
  }

  function computeFrequency(base, extra, suppAnnual, freq){
    const totalAnnual = base + extra + suppAnnual;
    if(freq==='year'){
      return { periods:1, perMain:base, perExtra:extra, perSupp:suppAnnual, perPeriod: totalAnnual, totalYearFromPeriod: totalAnnual, diff: 0 };
    }
    const periods = (freq==='half') ? 2 : 4;
    const perMain = roundTo1000(base/periods);
    const perExtra = roundTo1000(extra/periods);
    const factor = (freq==='half') ? 1.02 : 1.04;
    const perSupp = Math.round((suppAnnual/1000 * factor / periods)) * 1000; // << round as spec
    const perPeriod = perMain + perExtra + perSupp;
    const totalYearFromPeriod = perPeriod * periods;
    const diff = totalYearFromPeriod - totalAnnual;
    return { periods, perMain, perExtra, perSupp, perPeriod, totalYearFromPeriod, diff };
  }

  function renderSection6V2(){
    try{
      const { base, extra, suppTotal } = readAnnuals();
      const total = base + extra + suppTotal;

      // line items
      const elMainFee = document.getElementById('main-insured-main-fee');
      const elExtra = document.getElementById('main-insured-extra-fee');
      const elMainSupp = document.getElementById('main-insured-supp-fee');
      const elMainTotal = document.getElementById('main-insured-total');
      if(elMainFee) elMainFee.textContent = fmt(base);
      if(elExtra) elExtra.textContent = fmt(extra);
      if(elMainSupp){
        // compute main supplementary including MDP3 if assigned to main
        const pf = (window.personFees||{})['main-person-container'] || { supp: 0 };
        let mainSupp = Number(pf.supp || 0);
        try {
          if (window.MDP3) {
            const mdpId = window.MDP3.getSelectedId ? window.MDP3.getSelectedId() : null;
            const mdpFee = Number(window.MDP3.getPremium ? (window.MDP3.getPremium() || 0) : 0);
            if (mdpId === 'main-person-container') {
              mainSupp += mdpFee;
            }
          }
        } catch (e) {}
        elMainSupp.textContent = fmt(mainSupp);
      }
      if (elMainTotal) {
        // total for main person = base + extra + supp (with mdp3 if any)
        let mainSupp = Number((window.personFees||{})['main-person-container']?.supp || 0);
        try {
          if (window.MDP3) {
            const mdpId = window.MDP3.getSelectedId ? window.MDP3.getSelectedId() : null;
            const mdpFee = Number(window.MDP3.getPremium ? (window.MDP3.getPremium() || 0) : 0);
            if (mdpId === 'main-person-container') {
              mainSupp += mdpFee;
            }
          }
        } catch (e) {}
        elMainTotal.textContent = fmt(base + extra + mainSupp);
      }

      // supplementary persons list: reuse renderSuppListSimple() so it always includes main person and handles MDP3 appropriately
      const list = document.getElementById('supp-insured-summaries');
      if (list) {
        // call the shared renderer that generates the per-person supplementary list (includes main person and MDP3 "other")
        try {
          renderSuppListSimple();
        } catch(e) {
          // fallback: do nothing on error
        }
      }

      // totals
      const sumMain = document.getElementById('summary-main-fee');
      const sumExtra = document.getElementById('summary-extra-fee');
      const sumSupp = document.getElementById('summary-supp-fee');
      const sumTotal = document.getElementById('summary-total');
      if(sumMain) sumMain.textContent = fmt(base);
      if(sumExtra) sumExtra.textContent = fmt(extra);
      if(sumSupp) sumSupp.textContent = fmt(suppTotal);
      if(sumTotal) sumTotal.textContent = fmt(total);
      const totalPremiumResult = document.getElementById('total-premium-result');
      if(totalPremiumResult) totalPremiumResult.textContent = fmt(total);

      // frequency breakdown
      const freq = getFreq();
      const fb = document.getElementById('frequency-breakdown');
      if(fb){
        if(freq==='year'){
          fb.classList.add('hidden');
        } else {
          fb.classList.remove('hidden');
          const info = computeFrequency(base, extra, suppTotal, freq);
          const elMain = document.getElementById('freq-main');
          const elExtra = document.getElementById('freq-extra');
          const elSuppPeriod = document.getElementById('freq-supp-total');
          const elPeriodTotal = document.getElementById('freq-total-period');
          const elYearTotal  = document.getElementById('freq-total-year');
          const elDiff       = document.getElementById('freq-diff');
          if(elMain) elMain.textContent = fmt(info.perMain);
          if(elExtra) elExtra.textContent = fmt(info.perExtra);
          if(elSuppPeriod) elSuppPeriod.textContent = fmt(info.perSupp);
          if(elPeriodTotal) elPeriodTotal.textContent = fmt(info.perPeriod);
          if(elYearTotal) elYearTotal.textContent = fmt(info.totalYearFromPeriod);
          if(elDiff) elDiff.textContent = fmt(info.diff);
          // Hide lines with zero values to reduce clutter
          if (elMain) {
            const row = elMain.closest('div');
            if (row) row.classList.toggle('hidden', Number(info.perMain) === 0);
          }
          if (elExtra) {
            const row = elExtra.closest('div');
            if (row) row.classList.toggle('hidden', Number(info.perExtra) === 0);
          }
          if (elSuppPeriod) {
            const row = elSuppPeriod.closest('div');
            if (row) row.classList.toggle('hidden', Number(info.perSupp) === 0);
          }
          if (elDiff) {
            const row = elDiff.closest('div');
            if (row) row.classList.toggle('hidden', Number(info.diff) === 0);
          }
        }
      }
    }catch(err){
      console.error('renderSection6V2 error', err);
    }
  }
  window.renderSection6V2 = renderSection6V2;

  // Override summary generator to add "Chênh lệch so với năm"
  const __origGen = window.generateSummaryTable;
  window.generateSummaryTable = function(){
    const container = document.getElementById('summary-content-container');
    const modal = document.getElementById('summary-modal');
    if(container) container.innerHTML = '';
    try{
      // Basic info
      const mainContainer = document.getElementById('main-person-container');
      const mainInfo = getCustomerInfo(mainContainer, true);

      // Determine payment term
      let paymentTerm = 0;
      if (mainInfo.mainProduct === 'TRON_TAM_AN') paymentTerm = 10;
      else if (mainInfo.mainProduct === 'AN_BINH_UU_VIET') paymentTerm = parseInt(document.getElementById('abuv-term')?.value || '15', 10);
      else paymentTerm = parseInt(document.getElementById('payment-term')?.value || '0', 10) || 0;

      // Target age validation (reuse existing UI)
      const targetAgeInput = document.getElementById('target-age-input');
      const targetAge = parseInt(targetAgeInput?.value || '0', 10);
      if(isNaN(targetAge) || targetAge < (mainInfo.age + Math.max(paymentTerm-1, 0)) || targetAge > 100){
        throw new Error(`Không hợp lệ, từ ${mainInfo.age + Math.max(paymentTerm-1, 0)} đến 100`);
      }

      const baseAnnual = calculateMainPremium(mainInfo);
      const extraAnnual = getExtraPremiumValue ? Number(getExtraPremiumValue()||0) : 0;
      const initialMainWithExtra = baseAnnual + extraAnnual;
      const totalMaxSupport = Math.floor(baseAnnual / 4000000) * 100000;

      // Collect supplementary persons (DOM order)
      const suppPersons = [];
      document.querySelectorAll('#supplementary-insured-container .person-container').forEach(p => {
        suppPersons.push(getCustomerInfo(p, false));
      });

      // Build header
      let html = `<div class="mb-4">
        <div class="text-lg font-semibold mb-2">Tóm tắt sản phẩm</div>
      </div>`;

      // Table header
      html += `<table class="w-full text-left border-collapse"><thead class="bg-gray-100"><tr>`;
      html += `<th class="p-2 border">Năm HĐ</th>`;
      html += `<th class="p-2 border">Tuổi NĐBH chính<br>(${sanitizeHtml(mainInfo.name)})</th>`;
      html += `<th class="p-2 border">Phí chính</th>`;
      html += `<th class="p-2 border">Phí đóng thêm</th>`;
      html += `<th class="p-2 border">Phí bổ sung<br>(${sanitizeHtml(mainInfo.name)})</th>`;
      suppPersons.forEach(person => {
        html += `<th class="p-2 border">Phí bổ sung<br>(${sanitizeHtml(person.name)})</th>`;
      });
      html += `<th class="p-2 border">Tổng cộng</th>`;
      html += `<th class="p-2 border">Chênh lệch so với năm</th>`;
      html += `</tr></thead><tbody>`;

      const freq = getFreq();
      const periods = (freq==='half') ? 2 : (freq==='quarter' ? 4 : 1);
      const factor = (freq==='half') ? 1.02 : (freq==='quarter' ? 1.04 : 1.0);

      for(let i=0; (mainInfo.age + i) <= targetAge; i++){
        const yr = i + 1;
        const ageThisYear = mainInfo.age + i;

        // Main + extra for this year
        const mainThisYear = (yr <= paymentTerm) ? baseAnnual : 0;
        const extraThisYear = (yr <= paymentTerm) ? extraAnnual : 0;

        // Supplementaries for main person this year
        let suppMain = 0;
        const mainSuppCont = document.querySelector('#main-supp-container .supplementary-products-container');
        if (mainSuppCont){
          suppMain += calculateHealthSclPremium({ ...mainInfo, age: ageThisYear }, mainSuppCont, ageThisYear);
          suppMain += calculateBhnPremium({ ...mainInfo, age: ageThisYear }, mainSuppCont, ageThisYear);
          suppMain += calculateAccidentPremium({ ...mainInfo, age: ageThisYear }, mainSuppCont, ageThisYear);
          suppMain += calculateHospitalSupportPremium({ ...mainInfo, age: ageThisYear }, baseAnnual, mainSuppCont, 0, ageThisYear);
        }

        // Supplementaries for each extra person this year
        let suppEachArr = [];
        let totalHsStbh = 0;
        suppPersons.forEach(person => {
          const cont = person.container?.querySelector('.supplementary-products-container');
          let s = 0;
          if(cont){
            s += calculateHealthSclPremium({ ...person, age: person.age + i }, cont, person.age + i);
            s += calculateBhnPremium({ ...person, age: person.age + i }, cont, person.age + i);
            s += calculateAccidentPremium({ ...person, age: person.age + i }, cont, person.age + i);
            s += calculateHospitalSupportPremium({ ...person, age: person.age + i }, baseAnnual, cont, 0, person.age + i);
          }
          suppEachArr.push(s);
        });

        // MDP3 for the selected assignee (count into that person's supplement or standalone if "other")
        try{
          if(window.MDP3){
            const selId = window.MDP3.getSelectedId ? window.MDP3.getSelectedId() :
                          (document.getElementById('mdp3-person-select')?.value||null);
            const fee = Number(window.MDP3.getPremium ? (window.MDP3.getPremium()||0) : 0);
            if(fee>0){
              if(selId==='main-person-container') suppMain += fee;
              else if(selId==='other') { /* count later into overall total only */ }
              else {
                const idx = suppPersons.findIndex(p => p.container?.id === selId);
                if(idx>=0) suppEachArr[idx] += fee;
              }
            }
          }
        }catch(e){}

        const annualSupp = suppMain + suppEachArr.reduce((a,b)=>a+b,0);
        const annualYearlyTotal = mainThisYear + extraThisYear + annualSupp;

        // apply frequency (supplementary gets factor, main/extra simple split)
        const perMain = (periods===1) ? mainThisYear : roundTo1000(mainThisYear/periods);
        const perExtra = (periods===1) ? extraThisYear : roundTo1000(extraThisYear/periods);
        const perSupp = (periods===1) ? annualSupp : (Math.round((annualSupp/1000 * factor / periods)) * 1000);
        const perPeriod = perMain + perExtra + perSupp;
        const totalFromPeriod = perPeriod * periods;
        const diff = totalFromPeriod - annualYearlyTotal;

        // Row
        html += `<tr>`;
        html += `<td class="p-2 border text-center">${yr}</td>`;
        html += `<td class="p-2 border text-center">${ageThisYear}</td>`;
        html += `<td class="p-2 border text-right">${fmt(mainThisYear)}</td>`;
        html += `<td class="p-2 border text-right">${fmt(extraThisYear)}</td>`;
        html += `<td class="p-2 border text-right">${fmt(suppMain)}</td>`;
        suppEachArr.forEach(s => { html += `<td class="p-2 border text-right">${fmt(s)}</td>`; });
        html += `<td class="p-2 border text-right">${fmt(totalFromPeriod)}</td>`;
        html += `<td class="p-2 border text-right">${periods===1 ? '' : fmt(diff)}</td>`;
        html += `</tr>`;
      }

      html += `</tbody></table>`;
      if(container) container.innerHTML = html;
      if(modal) modal.classList.remove('hidden');
    }catch(err){
      if(container) container.innerHTML = `<div class="text-red-600">${sanitizeHtml(err.message||String(err))}</div>`;
      if(modal) modal.classList.remove('hidden');
    }
  };

  // Render once DOM is interactive
  document.addEventListener('DOMContentLoaded', () => {
    try { renderSection6V2(); } catch(e){}
  });
  // Re-render on user interactions (do not override core calculateAll)
  document.body.addEventListener('input', () => { try { renderSection6V2(); } catch(e){} });
  document.body.addEventListener('change', () => { try { renderSection6V2(); } catch(e){} });
})();



/* ===============================================================
 * UI Enhancer v3 (Stable & Fast)
 * - Restores results-container wrapper & hidden legacy IDs in HTML.
 * - Scoped MutationObserver to #results-container to avoid heavy loops.
 * - "Set-if-changed" to prevent mutation storms/infinite loops.
 * - Period breakdown: Half/Quarter incl. diff; hides zero rows.
 * =============================================================== */
(function() {
  const $$ = (sel, root=document) => root.querySelector(sel);
  const toInt = (s) => {
    if (s == null) return 0;
    const n = String(s).replace(/[^\d]/g, "");
    return n ? parseInt(n, 10) : 0;
  };
  const fmt = (n) => {
    // Format numbers without appending currency suffix (omit "VNĐ")
    try {
      return Number(n).toLocaleString("vi-VN");
    } catch (e) {
      const s = String(n);
      return s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }
  };
  const round1000 = (n) => Math.round(n/1000)*1000;
  const setText = (id, val) => {
    const el = typeof id === "string" ? $$(id) : id;
    if (!el) return;
    const target = fmt(Math.max(0, Math.round(val)));
    if (el.textContent !== target) el.textContent = target;
  };

  function computeYearTotals() {
    const main = toInt(($$("#main-insured-main-fee")||{}).textContent);
    const extra = toInt(($$("#main-insured-extra-fee")||{}).textContent);
    const suppAll = toInt(($$("#summary-supp-fee")||{}).textContent);
    const totalEl = $$("#summary-total");
    const total = totalEl ? toInt(totalEl.textContent) : (main + extra + suppAll);
    return {main, extra, suppAll, total, mainPlusExtra: main + extra};
  }

  function updateBadge() {
    const sel = $$("#payment-frequency");
    const badge = $$("#badge-frequency");
    if (!sel || !badge) return;
    const map = {year:"Năm", half:"Nửa năm", quarter:"Quý"};
    const label = map[sel.value] || "Năm";
    if (badge.textContent !== label) badge.textContent = label;
  }

  function updatePeriodBreakdown() {
    const sel = $$("#payment-frequency");
    const box = $$("#frequency-breakdown");
    if (!sel || !box) return;
    const show = sel.value !== "year";
    box.classList.toggle("hidden", !show);
    if (!show) return;

    const {mainPlusExtra, suppAll, total} = computeYearTotals();

    // Main+Extra theo kỳ: chia đều
    const mainExtraPeriod = sel.value === "half"
      ? mainPlusExtra / 2
      : sel.value === "quarter" ? mainPlusExtra / 4 : mainPlusExtra;

    // Supplement theo kỳ: áp dụng 1.02/1.04 và làm tròn *1000
    let suppPeriod;
    if (sel.value === "half") {
      suppPeriod = round1000((suppAll/1000 * 1.02 / 2) * 1000);
    } else if (sel.value === "quarter") {
      suppPeriod = round1000((suppAll/1000 * 1.04 / 4) * 1000);
    } else {
      suppPeriod = suppAll;
    }

    const totalPeriod = Math.round(mainExtraPeriod + suppPeriod);
    const toYear = sel.value === "half" ? totalPeriod * 2 : sel.value === "quarter" ? totalPeriod * 4 : total;
    const diff = toYear - total;

    setText("#freq-main-plus-extra", mainExtraPeriod);
    setText("#freq-supp-total", suppPeriod);
    setText("#freq-total-period", totalPeriod);
    setText("#freq-total-year", toYear);
    setText("#freq-diff", diff);

    // Ẩn chênh lệch nếu 0
    const diffEl = $$("#freq-diff");
    if (diffEl) {
      const row = diffEl.closest("div");
      if (row) row.classList.toggle("hidden", diff === 0);
    }
  }

  function hideZeroLines() {
    const pairs = [
      "#main-insured-main-fee",
      "#main-insured-extra-fee",
      "#main-insured-supp-fee",
      "#summary-supp-fee"
    ];
    pairs.forEach(id => {
      const el = $$(id);
      if (!el) return;
      const row = el.closest("li,div");
      const val = toInt(el.textContent);
      if (row) row.classList.toggle("hidden", val === 0);
    });
  }

  function setupSuppAccordion() {
    const btn = $$("#toggle-supp-list-btn");
    const list = $$("#supp-insured-summaries");
    if (!btn || !list) return;
    btn.addEventListener("click", () => {
      // Toggle visibility of the list but keep the button label constant
      list.classList.toggle("hidden");
      // Do not change the button text; users always see "Xem từng người"
    });
  }

  function refreshUI() {
    updateBadge();
    hideZeroLines();
    updatePeriodBreakdown();
  }

  function setupObservers() {
    const root = $$("#results-container");
    if (!root) return;
    const obs = new MutationObserver((mutations) => {
      // Filter out attribute-only mutations to reduce loops
      if (!mutations.some(m => m.type === "childList" || m.type === "characterData")) return;
      refreshUI();
    });
    obs.observe(root, {subtree:true, childList:true, characterData:true});
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupSuppAccordion();
    const sel = $$("#payment-frequency");
    if (sel) sel.addEventListener("change", refreshUI);
    refreshUI();
    setupObservers();
  });
})();

// ===============================================================
// Custom summary generation with per-person totals and per-period fees
// This override creates a new generateSummaryTable that:
//  - Shows a summary for each insured person with a total row followed by
//    individual product rows (main product, extra premium, supplementary products, MDP3).
//  - Calculates premiums according to the selected payment frequency (year/half/quarter).
//  - Hides rows where the calculated premium for the period is zero.
//  - In Part 2 (Bảng phí), hides the 'Chênh lệch' column when paying yearly and
//    omits rows that would otherwise be all zeros.
(function(){
  // Calculate per-period premium for main or extra premiums
  function calcPerMainExtra(val, freq) {
    val = Number(val) || 0;
    if (freq === 'year') return roundDownTo1000(val);
    const periods = (freq === 'half') ? 2 : 4;
    return Math.floor(val / periods / 1000) * 1000;
  }
  // Calculate per-period premium for supplementary premiums (including MDP3)
  function calcPerSupp(val, freq) {
    val = Number(val) || 0;
    if (freq === 'year') return roundDownTo1000(val);
    const periods = (freq === 'half') ? 2 : 4;
    const factor = (freq === 'half') ? 1.02 : 1.04;
    // use Math.round on units (thousand) then multiply back
    return Math.round((val / 1000) * factor / periods) * 1000;
  }
  // Build supplementary product rows (no name column) for a person
  function buildProductRows(personInfo, container, targetAge, freq, baseAnnualMain) {
    if (!container) return '';
    const rows = [];
    // Sức khỏe Bùng Gia Lực
    const sclSec = container.querySelector('.health-scl-section');
    if (sclSec && sclSec.querySelector('.health-scl-checkbox')?.checked) {
      const program = sclSec.querySelector('.health-scl-program')?.value || '';
      const programLabel = {co_ban:'Cơ bản', nang_cao:'Nâng cao', toan_dien:'Toàn diện', hoan_hao:'Hoàn hảo'}[program] || '';
      const stbh = getHealthSclStbhByProgram(program);
      const feeAnnual = calculateHealthSclPremium(personInfo, container, personInfo.age);
      const years = Math.max(0, Math.min(targetAge, 75) - personInfo.age + 1);
      const perFee = calcPerSupp(feeAnnual, freq);
      if (perFee > 0) {
        rows.push(`<tr>
          <td class="p-2 border">Sức khoẻ Bùng Gia Lực ${programLabel ? `- ${programLabel}`:''}</td>
          <td class="p-2 border text-right">${formatCurrency(stbh)}</td>
          <td class="p-2 border text-center">${years}</td>
          <td class="p-2 border text-right">${formatCurrency(perFee)}</td>
        </tr>`);
      }
    }
    // Bệnh hiểm nghèo 2.0
    const bhnSec = container.querySelector('.bhn-section');
    if (bhnSec && bhnSec.querySelector('.bhn-checkbox')?.checked) {
      const stbh = parseFormattedNumber(bhnSec.querySelector('.bhn-stbh')?.value || '0');
      const feeAnnual = calculateBhnPremium(personInfo, container, personInfo.age);
      const years = Math.max(0, Math.min(targetAge, 85) - personInfo.age + 1);
      const perFee = calcPerSupp(feeAnnual, freq);
      if (perFee > 0) {
        rows.push(`<tr>
          <td class="p-2 border">Bệnh hiểm nghèo 2.0</td>
          <td class="p-2 border text-right">${formatCurrency(stbh)}</td>
          <td class="p-2 border text-center">${years}</td>
          <td class="p-2 border text-right">${formatCurrency(perFee)}</td>
        </tr>`);
      }
    }
    // Tai nạn
    const accSec = container.querySelector('.accident-section');
    if (accSec && accSec.querySelector('.accident-checkbox')?.checked) {
      const stbh = parseFormattedNumber(accSec.querySelector('.accident-stbh')?.value || '0');
      const feeAnnual = calculateAccidentPremium(personInfo, container, personInfo.age);
      const years = Math.max(0, Math.min(targetAge, 65) - personInfo.age + 1);
      const perFee = calcPerSupp(feeAnnual, freq);
      if (perFee > 0) {
        rows.push(`<tr>
          <td class="p-2 border">Bảo hiểm Tai nạn</td>
          <td class="p-2 border text-right">${formatCurrency(stbh)}</td>
          <td class="p-2 border text-center">${years}</td>
          <td class="p-2 border text-right">${formatCurrency(perFee)}</td>
        </tr>`);
      }
    }
    // Hỗ trợ chi phí nằm viện
    const hsSec = container.querySelector('.hospital-support-section');
    if (hsSec && hsSec.querySelector('.hospital-support-checkbox')?.checked) {
      const stbh = parseFormattedNumber(hsSec.querySelector('.hospital-support-stbh')?.value || '0');
      const feeAnnual = calculateHospitalSupportPremium(personInfo, baseAnnualMain || 0, container, 0, personInfo.age);
      const years = Math.max(0, Math.min(targetAge, 65) - personInfo.age + 1);
      const perFee = calcPerSupp(feeAnnual, freq);
      if (perFee > 0) {
        rows.push(`<tr>
          <td class="p-2 border">Hỗ trợ chi phí nằm viện (đ/ngày)</td>
          <td class="p-2 border text-right">${formatCurrency(stbh)}</td>
          <td class="p-2 border text-center">${years}</td>
          <td class="p-2 border text-right">${formatCurrency(perFee)}</td>
        </tr>`);
      }
    }
    return rows.join('');
  }
  // Build summary rows for a specific person (including total row and product rows)
  function buildPersonSummary(personInfo, personId, targetAge, freq, paymentTerm, baseAnnualMain) {
    const isMain = (personId === 'main-person-container');
    let html = '';
    const name = personInfo.name || (isMain ? 'NĐBH chính' : 'NĐBH bổ sung');
    // Annual premiums
    const baseAnnual = isMain ? calculateMainPremium(personInfo) : 0;
    const extraAnnual = isMain ? (Number(getExtraPremiumValue ? getExtraPremiumValue() || 0 : 0)) : 0;
    // Supplementary annual premium for this person
    let suppAnnual = 0;
    let container;
    if (isMain) {
      container = document.querySelector('#main-supp-container .supplementary-products-container');
    } else if (personInfo.container) {
      container = personInfo.container.querySelector('.supplementary-products-container');
    }
    if (container) {
      suppAnnual += calculateHealthSclPremium(personInfo, container, personInfo.age);
      suppAnnual += calculateBhnPremium(personInfo, container, personInfo.age);
      suppAnnual += calculateAccidentPremium(personInfo, container, personInfo.age);
      suppAnnual += calculateHospitalSupportPremium(personInfo, baseAnnualMain || 0, container, 0, personInfo.age);
    }
    // Include MDP3 for this person if applicable
    let mdp3Fee = 0;
    let mdp3Stbh = 0;
    let mdp3Years = 0;
    try {
      if (window.MDP3) {
        const selId = window.MDP3.getSelectedId && window.MDP3.getSelectedId();
        mdp3Fee = Number(window.MDP3.getPremium ? (window.MDP3.getPremium() || 0) : 0);
        if (mdp3Fee > 0) {
          if (selId === personId) {
            // Compute STBH for MDP3: sum of main base and supplementary of all persons, minus this person's supp if not "other"
            let stbhBase = 0;
            for (let pid in window.personFees) {
              stbhBase += (window.personFees[pid].mainBase || 0) + (window.personFees[pid].supp || 0);
            }
            if (selId !== 'other' && window.personFees[selId]) {
              stbhBase -= window.personFees[selId].supp || 0;
            }
            mdp3Stbh = stbhBase;
            // Determine age at start for mdp3: main person or this person
            const startAge = personInfo.age;
            mdp3Years = Math.max(0, Math.min(targetAge, 65) - startAge + 1);
            // Add mdp3 premium into supplementary for this person
            suppAnnual += mdp3Fee;
          }
        }
      }
    } catch (e) {}
    // Compute per period premiums
    const perBase = calcPerMainExtra(baseAnnual, freq);
    const perExtra = calcPerMainExtra(extraAnnual, freq);
    const perSupp = calcPerSupp(suppAnnual, freq);
    const perTotal = perBase + perExtra + perSupp;
    // Skip entire section if total is zero
    if (perTotal <= 0) return '';
    // First row: name & total premium for this person
    html += `<tr>
      <td class="p-2 border font-semibold">${sanitizeHtml(name)}</td>
      <td class="p-2 border text-right">—</td>
      <td class="p-2 border text-center">—</td>
      <td class="p-2 border text-right font-semibold">${formatCurrency(perTotal)}</td>
    </tr>`;
    // Main product row (only for main person)
    if (isMain && perBase > 0) {
      const productLabel = getProductLabel(personInfo.mainProduct || '');
      // Determine STBH and payment term
      let stbhMain;
      if (personInfo.mainProduct === 'TRON_TAM_AN') {
        stbhMain = 100_000_000;
      } else {
        stbhMain = parseFormattedNumber(document.getElementById('main-stbh')?.value || '0');
      }
      const yearsMain = paymentTerm || '—';
      html += `<tr>
        <td class="p-2 border">${sanitizeHtml(productLabel)}</td>
        <td class="p-2 border text-right">${formatCurrency(stbhMain)}</td>
        <td class="p-2 border text-center">${yearsMain}</td>
        <td class="p-2 border text-right">${formatCurrency(perBase)}</td>
      </tr>`;
    }
    // Extra premium row (only for main person)
    if (isMain && perExtra > 0) {
      html += `<tr>
        <td class="p-2 border">Phí đóng thêm</td>
        <td class="p-2 border text-right">—</td>
        <td class="p-2 border text-center">${paymentTerm || '—'}</td>
        <td class="p-2 border text-right">${formatCurrency(perExtra)}</td>
      </tr>`;
    }
    // Supplementary product rows
    if (container) {
      html += buildProductRows(personInfo, container, targetAge, freq, baseAnnualMain);
    }
    // MDP3 row if this person has MDP3 (and was counted)
    if (mdp3Fee > 0 && mdp3Stbh > 0 && mdp3Years > 0 && (window.MDP3.getSelectedId && window.MDP3.getSelectedId()) === personId) {
      const perMdp = calcPerSupp(mdp3Fee, freq);
      if (perMdp > 0) {
        html += `<tr>
          <td class="p-2 border">Miễn đóng phí 3.0</td>
          <td class="p-2 border text-right">${formatCurrency(mdp3Stbh)}</td>
          <td class="p-2 border text-center">${mdp3Years}</td>
          <td class="p-2 border text-right">${formatCurrency(perMdp)}</td>
        </tr>`;
      }
    }
    return html;
  }
  // Build summary rows for MDP3 "other" person if applicable
  function buildMdp3OtherSummary(targetAge, freq) {
    try {
      if (!window.MDP3) return '';
      const selId = window.MDP3.getSelectedId && window.MDP3.getSelectedId();
      const fee = Number(window.MDP3.getPremium ? (window.MDP3.getPremium() || 0) : 0);
      if (fee > 0 && selId === 'other') {
        // Determine name from form
        const otherForm = document.getElementById('person-container-mdp3-other');
        const nameInput = otherForm?.querySelector('.name-input');
        const name = nameInput?.value?.trim() || 'Người khác';
        // STBH: sum of mainBase + supp for all persons
        let stbhBase = 0;
        for (let pid in window.personFees) {
          stbhBase += (window.personFees[pid].mainBase || 0) + (window.personFees[pid].supp || 0);
        }
        const otherInfo = getCustomerInfo(otherForm, false);
        const mdpYears = Math.max(0, Math.min(targetAge, 65) - (otherInfo.age || 0) + 1);
        const perMdp = calcPerSupp(fee, freq);
        if (perMdp <= 0) return '';
        let html = `<tr>
          <td class="p-2 border font-semibold">${sanitizeHtml(name)}</td>
          <td class="p-2 border text-right">—</td>
          <td class="p-2 border text-center">—</td>
          <td class="p-2 border text-right font-semibold">${formatCurrency(perMdp)}</td>
        </tr>`;
        html += `<tr>
          <td class="p-2 border">Miễn đóng phí 3.0</td>
          <td class="p-2 border text-right">${formatCurrency(stbhBase)}</td>
          <td class="p-2 border text-center">${mdpYears}</td>
          <td class="p-2 border text-right">${formatCurrency(perMdp)}</td>
        </tr>`;
        return html;
      }
    } catch (e) {}
    return '';
  }
  // Override generateSummaryTable with our custom implementation
  function customGenerateSummary() {
    const container = document.getElementById('summary-content-container');
    const modal = document.getElementById('summary-modal');
    if (container) container.innerHTML = '';
    try {
      // Retrieve main person info
      const mainContainer = document.getElementById('main-person-container');
      const mainInfo = getCustomerInfo(mainContainer, true);
      // Determine payment term for main product
      let paymentTerm = 0;
      if (mainInfo.mainProduct === 'TRON_TAM_AN') paymentTerm = 10;
      else if (mainInfo.mainProduct === 'AN_BINH_UU_VIET') paymentTerm = parseInt(document.getElementById('abuv-term')?.value || '15', 10);
      else paymentTerm = parseInt(document.getElementById('payment-term')?.value || '0', 10) || 0;
      // Validate target age
      const targetAgeInput = document.getElementById('target-age-input');
      const targetAge = parseInt(targetAgeInput?.value || '0', 10);
      const minTarget = mainInfo.age + Math.max(paymentTerm - 1, 0);
      if (isNaN(targetAge) || targetAge < minTarget || targetAge > 100) {
        throw new Error(`Không hợp lệ, từ ${minTarget} đến 100`);
      }
      // Determine frequency
      const freqSel = document.getElementById('payment-frequency');
      const freq = freqSel ? freqSel.value : 'year';
      // Build Part 1 - Summary table
      let html = '';
      html += `<div class="mb-4"><div class="text-lg font-semibold mb-2">Phần 1 · Tóm tắt sản phẩm (${freq === 'year' ? 'năm' : (freq === 'half' ? 'nửa năm' : 'theo quý')})</div>`;
      html += `<table class="w-full text-left border-collapse"><thead class="bg-gray-100"><tr>`;
      html += `<th class="p-2 border">Sản phẩm / Người</th>`;
      html += `<th class="p-2 border">STBH</th>`;
      html += `<th class="p-2 border">Số năm đóng phí</th>`;
      html += `<th class="p-2 border">Phí đóng</th>`;
      html += `</tr></thead><tbody>`;
      // Main person summary
      html += buildPersonSummary(mainInfo, 'main-person-container', targetAge, freq, paymentTerm, calculateMainPremium(mainInfo));
      // Supplementary persons summary
      const suppPersons = [];
      document.querySelectorAll('#supplementary-insured-container .person-container').forEach(pCont => {
        const pInfo = getCustomerInfo(pCont, false);
        suppPersons.push(pInfo);
      });
      suppPersons.forEach(pInfo => {
        html += buildPersonSummary(pInfo, pInfo.container.id, targetAge, freq, paymentTerm, calculateMainPremium(mainInfo));
      });
      // MDP3 other summary
      html += buildMdp3OtherSummary(targetAge, freq);
      html += `</tbody></table></div>`;
      // Build Part 2 - Bảng phí
      html += `<div class="mb-4"><div class="text-lg font-semibold mb-2">Phần 2 · Bảng phí (${freq === 'year' ? 'năm' : (freq === 'half' ? 'nửa năm' : 'theo quý')})</div>`;
      html += `<table class="w-full text-left border-collapse"><thead class="bg-gray-100"><tr>`;
      html += `<th class="p-2 border">Năm HĐ</th>`;
      html += `<th class="p-2 border">Tuổi NĐBH chính<br>(${sanitizeHtml(mainInfo.name)})</th>`;
      html += `<th class="p-2 border">Phí chính</th>`;
      html += `<th class="p-2 border">Phí đóng thêm</th>`;
      html += `<th class="p-2 border">Phí bổ sung<br>(${sanitizeHtml(mainInfo.name)})</th>`;
      suppPersons.forEach(p => {
        html += `<th class="p-2 border">Phí bổ sung<br>(${sanitizeHtml(p.name)})</th>`;
      });
      html += `<th class="p-2 border">Tổng cộng</th>`;
      if (freq !== 'year') {
        html += `<th class="p-2 border">Chênh lệch so với năm</th>`;
      }
      html += `</tr></thead><tbody>`;
      // Compute per-year table
      const periods = freq === 'half' ? 2 : (freq === 'quarter' ? 4 : 1);
      const factor = freq === 'half' ? 1.02 : (freq === 'quarter' ? 1.04 : 1.0);
      for (let i = 0; (mainInfo.age + i) <= targetAge; i++) {
        const ageThisYear = mainInfo.age + i;
        const contractYear = i + 1;
        // Base and extra for this year
        const mainThisYear = (contractYear <= paymentTerm) ? calculateMainPremium(mainInfo) : 0;
        const extraThisYear = (contractYear <= paymentTerm) ? (Number(getExtraPremiumValue ? getExtraPremiumValue() || 0 : 0)) : 0;
        // Supplementary for main
        let suppMain = 0;
        const mainSuppCont = document.querySelector('#main-supp-container .supplementary-products-container');
        if (mainSuppCont) {
          suppMain += calculateHealthSclPremium({ ...mainInfo, age: ageThisYear }, mainSuppCont, ageThisYear);
          suppMain += calculateBhnPremium({ ...mainInfo, age: ageThisYear }, mainSuppCont, ageThisYear);
          suppMain += calculateAccidentPremium({ ...mainInfo, age: ageThisYear }, mainSuppCont, ageThisYear);
          suppMain += calculateHospitalSupportPremium({ ...mainInfo, age: ageThisYear }, calculateMainPremium(mainInfo), mainSuppCont, 0, ageThisYear);
        }
        // Supplementary for each extra person
        const suppEachArr = [];
        suppPersons.forEach(pInfo => {
          const pAge = pInfo.age + i;
          const pCont = pInfo.container.querySelector('.supplementary-products-container');
          let s = 0;
          if (pCont) {
            s += calculateHealthSclPremium({ ...pInfo, age: pAge }, pCont, pAge);
            s += calculateBhnPremium({ ...pInfo, age: pAge }, pCont, pAge);
            s += calculateAccidentPremium({ ...pInfo, age: pAge }, pCont, pAge);
            s += calculateHospitalSupportPremium({ ...pInfo, age: pAge }, calculateMainPremium(mainInfo), pCont, 0, pAge);
          }
          suppEachArr.push(s);
        });
        // Add MDP3 to appropriate person
        let mdp3Fee = 0;
        let mdp3Sel = null;
        try {
          if (window.MDP3) {
            mdp3Sel = window.MDP3.getSelectedId && window.MDP3.getSelectedId();
            mdp3Fee = Number(window.MDP3.getPremium ? (window.MDP3.getPremium() || 0) : 0);
          }
        } catch (e) {}
        let mdp3Other = 0;
        if (mdp3Fee > 0) {
          if (mdp3Sel === 'main-person-container') {
            suppMain += mdp3Fee;
          } else if (mdp3Sel === 'other') {
            mdp3Other = mdp3Fee;
          } else {
            const idx = suppPersons.findIndex(p => p.container?.id === mdp3Sel);
            if (idx >= 0) suppEachArr[idx] += mdp3Fee;
          }
        }
        // Annual supplementary total including MDP3-other
        const annualSupp = suppMain + suppEachArr.reduce((a,b) => a+b,0) + mdp3Other;
        // Skip row if no premiums at all
        if ((mainThisYear + extraThisYear + annualSupp) === 0) continue;
        // Compute per period
        const perMainExtra = (periods === 1) ? (mainThisYear + extraThisYear) : Math.floor((mainThisYear + extraThisYear) / periods / 1000) * 1000;
        const perSupp = (periods === 1) ? annualSupp : Math.round((annualSupp / 1000 * factor / periods)) * 1000;
        const perTotal = perMainExtra + perSupp;
        const toYear = perTotal * periods;
        const diff = toYear - (mainThisYear + extraThisYear + annualSupp);
        html += `<tr>
          <td class="p-2 border text-center">${contractYear}</td>
          <td class="p-2 border text-center">${ageThisYear}</td>
          <td class="p-2 border text-right">${formatCurrency(mainThisYear)}</td>
          <td class="p-2 border text-right">${formatCurrency(extraThisYear)}</td>
          <td class="p-2 border text-right">${formatCurrency(suppMain)}</td>`;
        suppEachArr.forEach(val => {
          html += `<td class="p-2 border text-right">${formatCurrency(val)}</td>`;
        });
        // Total per period (converted to display)
        html += `<td class="p-2 border text-right">${formatCurrency(perTotal)}</td>`;
        if (freq !== 'year') {
          html += `<td class="p-2 border text-right">${formatCurrency(diff)}</td>`;
        }
        html += `</tr>`;
      }
      html += `</tbody></table></div>`;
      if (container) container.innerHTML = html;
      if (modal) modal.classList.remove('hidden');
    } catch (err) {
      if (container) container.innerHTML = `<div class="text-red-600">${sanitizeHtml(err.message || String(err))}</div>`;
      if (modal) modal.classList.remove('hidden');
    }
  }
  // Assign our implementation to window.generateSummaryTable
  window.generateSummaryTable = customGenerateSummary;
})();
