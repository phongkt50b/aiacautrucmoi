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
  document.getElementById('main-product')?.addEventListener('change', updateTargetAge);
  document.querySelector('.dob-input')?.addEventListener('input', updateTargetAge);
  document.getElementById('payment-term-input')?.addEventListener('input', updateTargetAge);
}

// ===== Tính tuổi =====
function calculateAge(dobString) {
  if (!dobString) return 0;
  const [dd, mm, yyyy] = dobString.split('/').map(Number);
  const dob = new Date(yyyy, mm - 1, dd);
  let age = REFERENCE_DATE.getFullYear() - dob.getFullYear();
  const m = REFERENCE_DATE.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && REFERENCE_DATE.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}

// ===== Lấy thông tin khách hàng =====
function getCustomerInfo(container, isMain = false) {
  const name = container.querySelector('.name-input')?.value?.trim() || (isMain ? 'NĐBH Chính' : 'NĐBH Bổ Sung');
  const dob = container.querySelector('.dob-input')?.value?.trim() || '';
  const gender = container.querySelector('input[name="gender"]:checked')?.value || 'nam';
  const occupation = container.querySelector('.occupation-input')?.value?.trim() || '';
  const age = calculateAge(dob);
  const group = getOccupationGroup(occupation);
  return { name, dob, gender, age, occupation, group, container };
}

function getMainCustomerInfo() {
  return getCustomerInfo(document.getElementById('main-person-container'), true);
}

// ===== Nhóm nghề nghiệp =====
function getOccupationGroup(occupationName) {
  const occ = product_data.occupations.find(o => o.name === occupationName);
  return occ ? occ.group : 0;
}

// ===== Cập nhật nhóm nghề =====
function updateOccupationGroupDisplay(container) {
  const input = container.querySelector('.occupation-input');
  const display = container.querySelector('.occupation-group-display');
  if (!input || !display) return;
  const group = getOccupationGroup(input.value.trim());
  display.textContent = group > 0 ? group : '...';
}

// ===== Autocomplete nghề nghiệp =====
function initOccupationAutocomplete(input, container) {
  if (!input) return;
  const autocompleteContainer = document.createElement('div');
  autocompleteContainer.className = 'occupation-autocomplete absolute z-10 w-full mt-1 hidden';
  input.parentNode.appendChild(autocompleteContainer);

  input.addEventListener('input', () => {
    const query = input.value.toLowerCase().trim();
    if (!query) {
      autocompleteContainer.classList.add('hidden');
      updateOccupationGroupDisplay(container);
      return;
    }
    const matches = product_data.occupations.filter(o => o.name.toLowerCase().includes(query) && o.name !== '-- Chọn nghề nghiệp --');
    if (matches.length === 0) {
      autocompleteContainer.classList.add('hidden');
      return;
    }
    autocompleteContainer.innerHTML = matches.map(o => `<div class="autocomplete-item">${o.name}</div>`).join('');
    autocompleteContainer.classList.remove('hidden');
  });

  autocompleteContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('autocomplete-item')) {
      input.value = e.target.textContent;
      autocompleteContainer.classList.add('hidden');
      updateOccupationGroupDisplay(container);
      calculateAll();
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !autocompleteContainer.contains(e.target)) {
      autocompleteContainer.classList.add('hidden');
    }
  });
}

// ===== Format ngày sinh =====
function initDateFormatter(input) {
  if (!input) return;
  let lastValue = '';
  input.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2);
    if (v.length >= 5) v = v.slice(0, 5) + '/' + v.slice(5);
    if (v !== lastValue) {
      e.target.value = v;
      lastValue = v;
    }
  });
}

// ===== Format số =====
function formatNumberInput(input) {
  const cursorPosition = input.selectionStart;
  const raw = parseFormattedNumber(input.value);
  const formatted = raw.toLocaleString('vi-VN');
  input.value = formatted;
  const newPosition = cursorPosition + (formatted.length - input.value.length);
  input.setSelectionRange(newPosition, newPosition);
}

function parseFormattedNumber(str) {
  return Number(str.replace(/\./g, '')) || 0;
}

// ===== Lỗi trường =====
function setFieldError(input, message) {
  let error = input.nextElementSibling;
  if (!error || !error.classList.contains('field-error')) {
    error = document.createElement('div');
    error.className = 'field-error';
    input.parentNode.appendChild(error);
  }
  error.textContent = message;
  input.classList.add('border-red-500');
}

function clearFieldError(input) {
  const error = input.nextElementSibling;
  if (error && error.classList.contains('field-error')) {
    error.remove();
  }
  input.classList.remove('border-red-500');
}

// ===== Validate NĐBH chính =====
function validateMainPersonInputs() {
  const container = document.getElementById('main-person-container');
  const nameInput = container.querySelector('.name-input');
  const dobInput = container.querySelector('.dob-input');
  const occInput = container.querySelector('.occupation-input');

  let valid = true;

  if (nameInput.value.trim() === '') {
    setFieldError(nameInput, 'Vui lòng nhập họ và tên');
    valid = false;
  } else {
    clearFieldError(nameInput);
  }

  if (!validateDobField(dobInput)) valid = false;

  if (occInput.value.trim() === '' || getOccupationGroup(occInput.value.trim()) === 0) {
    setFieldError(occInput, 'Vui lòng chọn nghề nghiệp hợp lệ');
    valid = false;
  } else {
    clearFieldError(occInput);
  }

  return valid;
}

// ===== Cập nhật target age =====
function updateTargetAge() {
  const mainProduct = document.getElementById('main-product')?.value || '';
  const paymentTermInput = document.getElementById('payment-term-input');
  const targetAgeInput = document.getElementById('target-age-input');
  if (!targetAgeInput) return;

  const mainInfo = getMainCustomerInfo();
  const paymentTerm = parseInt(paymentTermInput?.value || '0', 10) || 0;

  let minAge = mainInfo.age + Math.max(paymentTerm - 1, 0);
  let maxAge = 100;
  let defaultTarget = Math.min(mainInfo.age + 20, maxAge);

  if (mainProduct === 'PUL_TRON_DOI') {
    minAge = mainInfo.age;
  } else if (['PUL_15_NAM', 'PUL_5_NAM'].includes(mainProduct)) {
    minAge = mainInfo.age + (mainProduct === 'PUL_15_NAM' ? 14 : 4);
  }

  targetAgeInput.min = minAge;
  targetAgeInput.max = maxAge;
  targetAgeInput.value = Math.max(minAge, Math.min(parseInt(targetAgeInput.value || '0', 10), maxAge)) || defaultTarget;
}

// ===== Tính phí sản phẩm chính =====
function calculateMainPremium(info) {
  const product = document.getElementById('main-product')?.value || '';
  if (!product || info.age > MAX_ENTRY_AGE[product]) return 0;

  const rates = product_data.pul_rates[product];
  if (!rates) return 0;

  const rateObj = rates.find(r => r.age === info.age);
  if (!rateObj) return 0;

  const rate = info.gender === 'nam' ? rateObj.nam : rateObj.nu;
  const stbh = parseFormattedNumber(document.getElementById('main-stbh')?.value || '0');

  return Math.round((stbh / 1000000) * rate * 1000);
}

// ===== Tính phí sức khỏe SCL =====
function calculateHealthSclPremium(info, container, currentAge = null) {
  const checkbox = container.querySelector('.health-scl-checkbox');
  if (!checkbox?.checked || info.age > MAX_ENTRY_AGE.health_scl) return 0;

  const program = container.querySelector('.health-scl-program')?.value || '';
  const scope = container.querySelector('.health-scl-scope')?.value || '';
  const outpatient = container.querySelector('.health-scl-outpatient')?.checked || false;
  const dental = container.querySelector('.health-scl-dental')?.checked || false;

  if (!program || !scope) return 0;

  if (currentAge !== null && currentAge > MAX_RENEWAL_AGE.health_scl) return 0;

  const ageIndex = Math.min(Math.max(currentAge || info.age, 0), 70);
  let premium = product_data.health_scl_base[ageIndex][program][scope] || 0;

  if (outpatient) premium += product_data.outpatient[ageIndex][program] || 0;
  if (dental) premium += product_data.dental[ageIndex][program] || 0;

  return roundDownTo1000(premium);
}

// ===== Cập nhật STBH SCL =====
function updateHealthSclStbhInfo(section) {
  const program = section.querySelector('.health-scl-program')?.value || '';
  const scope = section.querySelector('.health-scl-scope')?.value || '';
  const outpatient = section.querySelector('.health-scl-outpatient')?.checked;
  const dental = section.querySelector('.health-scl-dental')?.checked;

  const stbhDisplay = section.querySelector('.health-scl-stbh-display');
  if (!stbhDisplay) return;

  let stbhText = '';
  if (program && scope) {
    stbhText = `STBH: ${formatCurrency(product_data.health_scl_stbh[program][scope], ' VNĐ')}`;
    if (outpatient) stbhText += ` | Ngoại trú: ${formatCurrency(product_data.outpatient_stbh[program], ' VNĐ')}`;
    if (dental) stbhText += ` | Nha khoa: ${formatCurrency(product_data.dental_stbh[program], ' VNĐ')}`;
  }

  stbhDisplay.textContent = stbhText;
}

// ===== Tính phí BHN =====
function calculateBhnPremium(info, container, currentAge = null) {
  const checkbox = container.querySelector('.bhn-checkbox');
  if (!checkbox?.checked || info.age > MAX_ENTRY_AGE.bhn) return 0;

  if (currentAge !== null && currentAge > MAX_RENEWAL_AGE.bhn) return 0;

  const stbh = parseFormattedNumber(container.querySelector('.bhn-stbh')?.value || '0');
  if (stbh > MAX_STBH.bhn) return 0;

  const rateIndex = Math.min(Math.max(currentAge || info.age, 0), 85);
  const rate = product_data.bhn_rates[rateIndex][info.gender];
  return roundDownTo1000((stbh / 1000) * rate);
}

// ===== Tính phí tai nạn =====
function calculateAccidentPremium(info, container, currentAge = null) {
  const checkbox = container.querySelector('.accident-checkbox');
  if (!checkbox?.checked || info.age > MAX_ENTRY_AGE.accident) return 0;

  if (currentAge !== null && currentAge > MAX_RENEWAL_AGE.accident) return 0;

  const stbh = parseFormattedNumber(container.querySelector('.accident-stbh')?.value || '0');
  if (stbh > MAX_STBH.accident || info.group === 0) return 0;

  const rate = product_data.accident_rates[info.group];
  return roundDownTo1000((stbh / 1000) * rate);
}

// ===== Tính phí hỗ trợ viện phí =====
function calculateHospitalSupportPremium(info, mainBaseAnnual, container, totalHsStbh, currentAge = null) {
  const checkbox = container.querySelector('.hospital-support-checkbox');
  if (!checkbox?.checked || info.age > MAX_ENTRY_AGE.hospital_support) return 0;

  if (currentAge !== null && currentAge > MAX_RENEWAL_AGE.hospital_support) return 0;

  let stbh = parseFormattedNumber(container.querySelector('.hospital-support-stbh')?.value || '0');
  stbh = Math.round(stbh / 100000) * 100000; // Làm tròn 100k

  const maxSupport = product_data.hospital_fee_support_rates.find(r => info.age >= r.ageMin && info.age <= r.ageMax)?.rate || 0;
  const maxTotalStbh = Math.min(mainBaseAnnual / 4000000 * 100000, maxSupport * 1000000);

  if (stbh + totalHsStbh > maxTotalStbh) {
    // Cập nhật validation message
    const validation = container.querySelector('.hospital-support-validation');
    if (validation) {
      validation.textContent = `Tối đa ${formatCurrency(maxTotalStbh - totalHsStbh, ' VNĐ')}`;
    }
    return 0;
  }

  const rate = product_data.hospital_fee_support_rates.find(r => (currentAge || info.age) >= r.ageMin && (currentAge || info.age) <= r.ageMax)?.rate || 0;
  return roundDownTo1000(stbh * rate / 1000);
}

// ===== Tính tổng phí =====
function calculateAll() {
  const mainInfo = getMainCustomerInfo();
  const mainProduct = document.getElementById('main-product')?.value || '';
  const mainStbh = parseFormattedNumber(document.getElementById('main-stbh')?.value || '0');
  const extraPremium = parseFormattedNumber(document.getElementById('extra-premium')?.value || '0');

  // Cập nhật tuổi
  document.querySelector('.age-display').textContent = mainInfo.age;

  // Tính phí chính
  const mainPremium = calculateMainPremium(mainInfo);
  document.getElementById('main-product-fee-display').textContent = formatCurrency(mainPremium, ' VNĐ');

  // Tính phí bổ sung cho main
  let mainSuppPremium = 0;
  const mainSuppContainer = document.querySelector('#main-supp-container .supplementary-products-container');
  mainSuppPremium += calculateHealthSclPremium(mainInfo, mainSuppContainer);
  mainSuppPremium += calculateBhnPremium(mainInfo, mainSuppContainer);
  mainSuppPremium += calculateAccidentPremium(mainInfo, mainSuppContainer);
  mainSuppPremium += calculateHospitalSupportPremium(mainInfo, mainPremium, mainSuppContainer, 0);

  // Tính phí bổ sung cho supp persons
  let suppPersonsPremium = 0;
  let totalHsStbh = 0;
  const suppSummaries = [];
  document.querySelectorAll('#supplementary-insured-container .person-container').forEach(p => {
    const personInfo = getCustomerInfo(p);
    const suppCont = p.querySelector('.supplementary-products-container');
    let personSupp = calculateHealthSclPremium(personInfo, suppCont);
    personSupp += calculateBhnPremium(personInfo, suppCont);
    personSupp += calculateAccidentPremium(personInfo, suppCont);
    const hsPremium = calculateHospitalSupportPremium(personInfo, mainPremium, suppCont, totalHsStbh);
    personSupp += hsPremium;
    // Cộng MDP3 nếu assign cho person này
    if (window.MDP3 && MDP3.getSelectedId() === p.id) {
      personSupp += Number(MDP3.getPremium() || 0);
    }
    suppPersonsPremium += personSupp;

    // Thu thập cho summary
    suppSummaries.push({
      name: personInfo.name,
      premium: personSupp
    });

    totalHsStbh += parseFormattedNumber(suppCont.querySelector('.hospital-support-stbh')?.value || '0');
  });

  // MDP3 nếu assign cho main hoặc other
  let mdp3Premium = 0;
  if (window.MDP3) {
    mdp3Premium = Number(MDP3.getPremium() || 0);
    const selId = MDP3.getSelectedId();
    if (selId === 'main-person-container') {
      mainSuppPremium += mdp3Premium;
    } else if (selId !== 'other' && !selId.startsWith('person-container-supp')) {
      // Nếu không assign assign, cộng vào main hoặc tổng
    }
  }

  const totalPremium = mainPremium + extraPremium + mainSuppPremium + suppPersonsPremium + (MDP3.getSelectedId() === 'other' ? mdp3Premium : 0);

  // Hiển thị
  document.getElementById('summary-total').textContent = formatCurrency(totalPremium, ' VNĐ');
  document.getElementById('main-insured-main-fee').textContent = formatCurrency(mainPremium, ' VNĐ');
  document.getElementById('main-insured-extra-fee').textContent = formatCurrency(extraPremium, ' VNĐ');
  document.getElementById('main-insured-supp-fee').textContent = formatCurrency(mainSuppPremium, ' VNĐ');
  document.getElementById('summary-supp-fee').textContent = formatCurrency(mainSuppPremium + suppPersonsPremium, ' VNĐ');

  // Hiển thị supp summaries
  const suppList = document.getElementById('supp-insured-summaries');
  if (suppList) {
    suppList.innerHTML = suppSummaries.map(s => `<li class="flex justify-between"><span>${s.name}</span><span>${formatCurrency(s.premium, ' VNĐ')}</span></li>`).join('');
  }
}

// ===== Sanitize HTML =====
function sanitizeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== Tạo bảng tóm tắt =====
function generateSummaryTable() {
  const modal = document.getElementById('summary-modal');
  const container = document.getElementById('summary-content');
  if (!modal || !container) return;

  try {
    const mainInfo = getMainCustomerInfo();
    const mainProduct = document.getElementById('main-product')?.value || '';
    const paymentTermInput = document.getElementById('payment-term-input');
    const paymentTerm = parseInt(paymentTermInput?.value || '0', 10) || 0;
    const extraPremiumValue = () => parseFormattedNumber(document.getElementById('extra-premium')?.value || '0');

    // Target age validation
    const targetAgeInput = document.getElementById('target-age-input');
    const targetAge = parseInt(targetAgeInput?.value || '0', 10);
    if (isNaN(targetAge) || targetAge < (mainInfo.age + Math.max(paymentTerm - 1, 0)) || targetAge > 100) {
      throw new Error(`Tuổi mục tiêu không hợp lệ, từ ${mainInfo.age + Math.max(paymentTerm - 1, 0)} đến 100`);
    }

    const baseAnnual = calculateMainPremium(mainInfo);
    const extraAnnual = extraPremiumValue ? Number(extraPremiumValue() || 0) : 0;
    const totalMaxSupport = Math.floor(baseAnnual / 4000000) * 100000;

    // Collect supplementary persons
    const suppPersons = [];
    document.querySelectorAll('#supplementary-insured-container .person-container').forEach(p => {
      suppPersons.push(getCustomerInfo(p, false));
    });

    // Get frequency
    const freq = getFreq();
    const freqLabel = { year: 'năm', half: 'nửa năm', quarter: 'quý' }[freq] || 'năm';
    const periods = (freq === 'half') ? 2 : (freq === 'quarter' ? 4 : 1);
    const factor = (freq === 'half') ? 1.02 : (freq === 'quarter' ? 1.04 : 1.0);

    // Phần 1: Tóm tắt sản phẩm
    let html = `<div class="mb-4">
      <div class="text-lg font-semibold mb-2">Tóm tắt sản phẩm (phí theo kỳ đóng phí: ${freqLabel})</div>
    </div>`;

    // Function to get products for a person
    const getPersonProducts = (personInfo, container, isMain = false) => {
      const products = [];
      const suppCont = container.querySelector('.supplementary-products-container');

      // Main product if main person
      if (isMain) {
        products.push({
          name: mainProduct,
          stbh: parseFormattedNumber(document.getElementById('main-stbh')?.value || '0'),
          years: paymentTerm,
          premium: baseAnnual
        });

        // Extra premium
        const extra = extraAnnual;
        if (extra > 0) {
          products.push({
            name: 'Phí đóng thêm',
            stbh: null,
            years: paymentTerm,
            premium: extra
          });
        }
      }

      // Health SCL
      if (suppCont.querySelector('.health-scl-checkbox')?.checked) {
        const program = suppCont.querySelector('.health-scl-program')?.value || '';
        const scope = suppCont.querySelector('.health-scl-scope')?.value || '';
        const outpatient = suppCont.querySelector('.health-scl-outpatient')?.checked;
        const dental = suppCont.querySelector('.health-scl-dental')?.checked;
        const premium = calculateHealthSclPremium(personInfo, suppCont);
        products.push({
          name: 'Sức khỏe SCL',
          stbh: product_data.health_scl_stbh[program][scope],
          years: null, // Renew yearly
          premium
        });
        if (outpatient) products.push({ name: 'Ngoại trú SCL', stbh: product_data.outpatient_stbh[program], years: null, premium: 0 }); // Premium included in main
        if (dental) products.push({ name: 'Nha khoa SCL', stbh: product_data.dental_stbh[program], years: null, premium: 0 });
      }

      // BHN
      if (suppCont.querySelector('.bhn-checkbox')?.checked) {
        const stbh = parseFormattedNumber(suppCont.querySelector('.bhn-stbh')?.value || '0');
        const premium = calculateBhnPremium(personInfo, suppCont);
        products.push({
          name: 'BHN',
          stbh,
          years: null,
          premium
        });
      }

      // Accident
      if (suppCont.querySelector('.accident-checkbox')?.checked) {
        const stbh = parseFormattedNumber(suppCont.querySelector('.accident-stbh')?.value || '0');
        const premium = calculateAccidentPremium(personInfo, suppCont);
        products.push({
          name: 'Tai nạn',
          stbh,
          years: null,
          premium
        });
      }

      // Hospital support
      if (suppCont.querySelector('.hospital-support-checkbox')?.checked) {
        const stbh = parseFormattedNumber(suppCont.querySelector('.hospital-support-stbh')?.value || '0');
        const premium = calculateHospitalSupportPremium(personInfo, baseAnnual, suppCont, 0);
        products.push({
          name: 'Hỗ trợ viện phí',
          stbh,
          years: null,
          premium
        });
      }

      // MDP3 if assigned
      let mdp3Stbh = 0;
      if (window.MDP3 && MDP3.getSelectedId() === container.id) {
        const premium = Number(MDP3.getPremium() || 0);
        mdp3Stbh = MDP3.getStbh ? MDP3.getStbh() : 0; // Assume getStbh method
        products.push({
          name: 'Miễn đóng phí 3.0',
          stbh: mdp3Stbh,
          years: null,
          premium
        });
      }

      return products;
    };

    // Build summary table for each person
    const buildSummaryTable = (personInfo, products, isMain = false) => {
      if (products.length === 0) return '';

      const totalPremium = products.reduce((sum, p) => sum + p.premium, 0);
      let tableHtml = `<table class="w-full text-left border-collapse mb-4">
        <thead class="bg-gray-100">
          <tr>
            <th class="p-2 border">Sản phẩm</th>
            <th class="p-2 border">STBH</th>
            <th class="p-2 border">Số năm đóng phí</th>
            <th class="p-2 border">Phí đóng</th>
          </tr>
        </thead>
        <tbody>
          <tr class="font-bold">
            <td class="p-2 border" colspan="3">${sanitizeHtml(personInfo.name)}</td>
            <td class="p-2 border text-right">${formatCurrency(totalPremium)}</td>
          </tr>`;

      products.forEach(p => {
        if (p.premium > 0 || p.name !== 'Phí đóng thêm') { // Always show if premium >0, skip extra if 0
          tableHtml += `<tr>
            <td class="p-2 border">${p.name}</td>
            <td class="p-2 border text-right">${p.stbh ? formatCurrency(p.stbh) : ''}</td>
            <td class="p-2 border text-center">${p.years || ''}</td>
            <td class="p-2 border text-right">${formatCurrency(p.premium)}</td>
          </tr>`;
        }
      });

      tableHtml += `</tbody></table>`;
      return tableHtml;
    };

    // Main person summary
    const mainProducts = getPersonProducts(mainInfo, document.getElementById('main-person-container'), true);
    html += buildSummaryTable(mainInfo, mainProducts, true);

    // Supp persons summary
    suppPersons.forEach(person => {
      const products = getPersonProducts(person, person.container);
      html += buildSummaryTable(person, products);
    });

    // Phần 2: Bảng phí
    html += `<div class="mb-4">
      <div class="text-lg font-semibold mb-2">Bảng phí</div>
    </div>`;

    html += `<table class="w-full text-left border-collapse"><thead class="bg-gray-100"><tr>`;
    html += `<th class="p-2 border">Năm HĐ</th>`;
    html += `<th class="p-2 border">Tuổi NĐBH chính<br>(${sanitizeHtml(mainInfo.name)})</th>`;
    if (baseAnnual > 0) html += `<th class="p-2 border">Phí chính</th>`;
    if (extraAnnual > 0) html += `<th class="p-2 border">Phí đóng thêm</th>`;
    html += `<th class="p-2 border">Phí bổ sung<br>(${sanitizeHtml(mainInfo.name)})</th>`;
    suppPersons.forEach(person => {
      html += `<th class="p-2 border">Phí bổ sung<br>(${sanitizeHtml(person.name)})</th>`;
    });
    html += `<th class="p-2 border">Tổng cộng</th>`;
    if (freq !== 'year') html += `<th class="p-2 border">Chênh lệch so với năm</th>`;
    html += `</tr></thead><tbody>`;

    for (let i = 0; (mainInfo.age + i) <= targetAge; i++) {
      const yr = i + 1;
      const ageThisYear = mainInfo.age + i;

      // Main + extra for this year (annual)
      const mainThisYear = (yr <= paymentTerm) ? baseAnnual : 0;
      const extraThisYear = (yr <= paymentTerm) ? extraAnnual : 0;

      // Supplementaries for main person this year
      let suppMain = 0;
      const mainSuppCont = document.querySelector('#main-supp-container .supplementary-products-container');
      if (mainSuppCont) {
        suppMain += calculateHealthSclPremium({ ...mainInfo, age: ageThisYear }, mainSuppCont, ageThisYear);
        suppMain += calculateBhnPremium({ ...mainInfo, age: ageThisYear }, mainSuppCont, ageThisYear);
        suppMain += calculateAccidentPremium({ ...mainInfo, age: ageThisYear }, mainSuppCont, ageThisYear);
        suppMain += calculateHospitalSupportPremium({ ...mainInfo, age: ageThisYear }, baseAnnual, mainSuppCont, 0, ageThisYear);
      }

      // Supplementaries for each supp person this year
      let suppEachArr = [];
      suppPersons.forEach(person => {
        const cont = person.container?.querySelector('.supplementary-products-container');
        let s = 0;
        if (cont) {
          s += calculateHealthSclPremium({ ...person, age: person.age + i }, cont, person.age + i);
          s += calculateBhnPremium({ ...person, age: person.age + i }, cont, person.age + i);
          s += calculateAccidentPremium({ ...person, age: person.age + i }, cont, person.age + i);
          s += calculateHospitalSupportPremium({ ...person, age: person.age + i }, baseAnnual, cont, 0, person.age + i);
        }
        suppEachArr.push(s);
      });

      // MDP3
      if (window.MDP3) {
        const selId = MDP3.getSelectedId ? MDP3.getSelectedId() : (document.getElementById('mdp3-person-select')?.value || null);
        const fee = Number(MDP3.getPremium ? (MDP3.getPremium() || 0) : 0);
        if (fee > 0) {
          if (selId === 'main-person-container') suppMain += fee;
          else {
            const idx = suppPersons.findIndex(p => p.container?.id === selId);
            if (idx >= 0) suppEachArr[idx] += fee;
          }
        }
      }

      const annualSupp = suppMain + suppEachArr.reduce((a, b) => a + b, 0);
      const annualYearlyTotal = mainThisYear + extraThisYear + annualSupp;

      // Apply frequency
      const perMain = (periods === 1) ? mainThisYear : roundDownTo1000(mainThisYear / periods);
      const perExtra = (periods === 1) ? extraThisYear : roundDownTo1000(extraThisYear / periods);
      const perSupp = (periods === 1) ? annualSupp : roundDownTo1000(annualSupp * factor / periods);
      const perPeriod = perMain + perExtra + perSupp;
      const totalFromPeriod = perPeriod * periods;
      const diff = totalFromPeriod - annualYearlyTotal;

      // Skip row if total =0
      if (perPeriod === 0) continue;

      // Row
      html += `<tr>`;
      html += `<td class="p-2 border text-center">${yr}</td>`;
      html += `<td class="p-2 border text-center">${ageThisYear}</td>`;
      if (baseAnnual > 0) html += `<td class="p-2 border text-right">${formatCurrency(perMain)}</td>`;
      if (extraAnnual > 0) html += `<td class="p-2 border text-right">${formatCurrency(perExtra)}</td>`;
      html += `<td class="p-2 border text-right">${formatCurrency(suppMain * factor / periods)}</td>`; // Supp adjusted
      suppEachArr.forEach(s => {
        html += `<td class="p-2 border text-right">${formatCurrency(s * factor / periods)}</td>`;
      });
      html += `<td class="p-2 border text-right">${formatCurrency(perPeriod)}</td>`;
      if (freq !== 'year') html += `<td class="p-2 border text-right">${formatCurrency(diff)}</td>`;
      html += `</tr>`;
    }

    html += `</tbody></table>`;

    container.innerHTML = html;
    modal.classList.remove('hidden');
  } catch (err) {
    container.innerHTML = `<div class="text-red-600">${sanitizeHtml(err.message || String(err))}</div>`;
    modal.classList.remove('hidden');
  }
}

// ===== Get frequency =====
function getFreq() {
  const sel = document.getElementById('payment-frequency');
  return sel ? sel.value : 'year';
}

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
    try { return n.toLocaleString("vi-VN") + " VNĐ"; }
    catch(e){ return (n+"").replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " VNĐ"; }
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

    // Hide rows if 0
    const mainExtraRow = $$("#freq-main-plus-extra")?.closest("div");
    if (mainExtraRow) mainExtraRow.classList.toggle("hidden", mainExtraPeriod === 0);

    const suppRow = $$("#freq-supp-total")?.closest("div");
    if (suppRow) suppRow.classList.toggle("hidden", suppPeriod === 0);

    const diffRow = $$("#freq-diff")?.closest("div");
    if (diffRow) diffRow.classList.toggle("hidden", diff === 0);

    setText("#freq-main-plus-extra", mainExtraPeriod);
    setText("#freq-supp-total", suppPeriod);
    setText("#freq-total-period", totalPeriod);
    setText("#freq-total-year", toYear);
    setText("#freq-diff", diff);
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
      list.classList.toggle("hidden");
      btn.textContent = list.classList.contains("hidden") ? "Xem từng người" : "Ẩn danh sách";
    });
  }

  function refreshUI() {
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

// ===== HTML generation functions (assumed based on index.html structure; adjust if needed) =====
function generateSupplementaryProductsHtml(personId) {
  return `
    <div class="product-section health-scl-section">
      <label class="flex items-center">
        <input type="checkbox" class="form-checkbox health-scl-checkbox" data-person="${personId}">
        <span class="ml-2">Sức khỏe SCL</span>
      </label>
      <div class="product-options hidden ml-6 mt-2 space-y-2">
        <select class="form-select health-scl-program">
          <option value="">Chọn chương trình</option>
          <option value="co_ban">Cơ bản</option>
          <option value="nang_cao">Nâng cao</option>
          <option value="toan_dien">Toàn diện</option>
          <option value="hoan_hao">Hoàn hảo</option>
        </select>
        <select class="form-select health-scl-scope">
          <option value="">Chọn phạm vi</option>
          <option value="main_vn">Việt Nam</option>
          <option value="main_asia">Châu Á</option>
          <option value="main_world">Toàn cầu</option>
        </select>
        <label class="flex items-center">
          <input type="checkbox" class="form-checkbox health-scl-outpatient" disabled>
          <span class="ml-2">Ngoại trú</span>
        </label>
        <label class="flex items-center">
          <input type="checkbox" class="form-checkbox health-scl-dental" disabled>
          <span class="ml-2">Nha khoa</span>
        </label>
        <div class="health-scl-stbh-display text-sm text-gray-600"></div>
      </div>
    </div>
    <div class="product-section bhn-section">
      <label class="flex items-center">
        <input type="checkbox" class="form-checkbox bhn-checkbox" data-person="${personId}">
        <span class="ml-2">BHN</span>
      </label>
      <div class="product-options hidden ml-6 mt-2">
        <input type="text" class="form-input bhn-stbh" placeholder="STBH">
      </div>
    </div>
    <div class="product-section accident-section">
      <label class="flex items-center">
        <input type="checkbox" class="form-checkbox accident-checkbox" data-person="${personId}">
        <span class="ml-2">Tai nạn</span>
      </label>
      <div class="product-options hidden ml-6 mt-2">
        <input type="text" class="form-input accident-stbh" placeholder="STBH">
      </div>
    </div>
    <div class="product-section hospital-support-section">
      <label class="flex items-center">
        <input type="checkbox" class="form-checkbox hospital-support-checkbox" data-person="${personId}">
        <span class="ml-2">Hỗ trợ viện phí</span>
      </label>
      <div class="product-options hidden ml-6 mt-2">
        <input type="text" class="form-input hospital-support-stbh" placeholder="STBH (làm tròn 100k)">
        <div class="hospital-support-validation text-sm text-gray-600"></div>
      </div>
    </div>
  `;
}

function generateSupplementaryPersonHtml(personId, count) {
  return `
    <div class="flex justify-between items-center">
      <h3 class="text-lg font-semibold">NĐBH Bổ Sung ${count}</h3>
      <button class="text-red-500 hover:text-red-700" onclick="this.closest('.person-container').remove(); calculateAll();">Xóa</button>
    </div>
    <div class="space-y-2">
      <label>Họ và tên</label>
      <input type="text" class="form-input name-input">
    </div>
    <div class="space-y-2">
      <label>Ngày sinh</label>
      <input type="text" class="form-input dob-input" placeholder="DD/MM/YYYY">
    </div>
    <div class="space-y-2">
      <label>Giới tính</label>
      <div class="flex space-x-4">
        <label><input type="radio" name="gender_${personId}" value="nam" checked> Nam</label>
        <label><input type="radio" name="gender_${personId}" value="nu"> Nữ</label>
      </div>
    </div>
    <div class="space-y-2">
      <label>Nghề nghiệp</label>
      <input type="text" class="form-input occupation-input" placeholder="Tìm kiếm nghề nghiệp">
      <div>Nhóm nghề: <span class="occupation-group-display">...</span></div>
    </div>
    <div class="supplementary-products-container space-y-4"></div>
  `;
}
