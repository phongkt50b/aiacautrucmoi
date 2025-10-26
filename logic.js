import { GLOBAL_CONFIG, PRODUCT_CATALOG, product_data, investment_data, BENEFIT_MATRIX_SCHEMAS, BM_SCL_PROGRAMS, setDataHelpers } from './data.js';

// ===================================================================================
// ===== SMALL UTILS & HELPERS (SHARED)
// ===================================================================================
function debounce(fn, wait = 40) {
    let t = null;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

function roundDownTo1000(n) {
    return Math.floor(Number(n || 0) / 1000) * 1000;
}

function parseFormattedNumber(formattedString) {
    if (formattedString == null) return 0;
    let v = String(formattedString);
    // Chuẩn hóa dấu phân cách nhóm (bao gồm cả non-breaking space)
    v = v.replace(/[\u00A0\u202F\s]/g, ''); // Xóa khoảng trắng các loại
    v = v.replace(/\.(?=\d{3}(?:$|\D))/g, ''); // Xóa dấu chấm nếu theo sau là 3 chữ số (nghìn)
    v = v.replace(/,(?=\d{3}(?:$|\D))/g, ''); // Xóa dấu phẩy nếu theo sau là 3 chữ số (nghìn)
    // Chuẩn hóa dấu thập phân (nếu có, không nên có trong tiền tệ VNĐ)
    v = v.replace(',', '.'); // Đổi dấu phẩy thập phân thành chấm

    const num = parseFloat(v);
    return Number.isNaN(num) ? 0 : num;
}


function formatCurrency(value, suffix = '') {
    const num = Number(value) || 0;
    // Làm tròn đến hàng đơn vị trước khi định dạng
    const roundedNum = Math.round(num);
    return roundedNum.toLocaleString('vi-VN') + (suffix || '');
}

function formatDisplayCurrency(value) {
    const n = Number(value);
    const roundedNum = Math.round(n || 0);
    return Number.isFinite(roundedNum) ? roundedNum.toLocaleString('vi-VN') : '0';
}

function sanitizeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Inject helpers into data.js for validation hints/messages
setDataHelpers({
    formatCurrency,
    parseFormattedNumber,
    roundDownTo1000,
    product_data // Make raw data accessible for complex hint functions if needed
});

// ===================================================================================
// ===== MODULE: STATE MANAGEMENT
// ===================================================================================
let appState = {};

function initState() {
    appState = {
        mainProduct: {
            key: '',          // ID sản phẩm chính
            program: '',      // Key chương trình (nếu có, vd: 'TRON_DOI', '15', '10')
            stbh: 0,
            premium: 0,       // Chỉ dùng khi calculation.method = 'fromInput'
            paymentTerm: 0,
            extraPremium: 0,
            // options: {}, // Không cần options riêng nữa, program đã đủ
        },
        paymentFrequency: 'year', // 'year', 'half', 'quarter'
        mainPerson: {
            id: 'main-person-container',
            container: document.getElementById('main-person-container'),
            isMain: true,
            name: '',
            dob: '',
            age: 0,
            daysFromBirth: 0,
            gender: 'Nam', // 'Nam' or 'Nữ'
            riskGroup: 0,  // 1-4
            supplements: {} // Key: riderId, Value: { stbh: number, program: string, scope: string, ... }
        },
        policyOwner: { // Thông tin người mua BH (cho MDP)
            id: 'policy-owner-container', // ID cố định cho người mua BH
            container: document.getElementById('policy-owner-container'),
            name: '',
            dob: '',
            age: 0,
            daysFromBirth: 0,
            gender: 'Nam',
            // MDP products selected for this owner, Key: mdpProductId, Value: true/false
            selectedWaivers: {}
        },
        supplementaryPersons: [], // Array of person objects like mainPerson (but isMain: false)
        fees: { // Calculated fees (annual equivalent)
            baseMain: 0,
            extra: 0,
            totalMain: 0,
            totalSupp: 0,
            total: 0,
            byPerson: {}, // Key: personId, Value: { main: number, supp: number, total: number, suppDetails: { riderId: fee } }
            // Additional fee details needed for calculations
            aggregateStbhs: {}, // Key: riderId, Value: total STBH across all insureds (e.g., for HOSPITAL_SUPPORT)
            mdpStbhBase: 0, // Tổng phí làm cơ sở tính STBH cho MDP
        },
        uiState: { // Lưu trạng thái UI động
            availableSclPrograms: [], // Các chương trình SCL được phép dựa trên phí chính
        }
    };
     // Initialize policy owner UI element reference
     const poContainer = document.getElementById('policy-owner-container');
     if (poContainer) {
         appState.policyOwner.container = poContainer;
     } else {
         console.warn("Policy owner container not found during init.");
     }
}

// ===================================================================================
// ===== MODULE: DATA COLLECTION (Reading from DOM into State)
// ===================================================================================

function updateStateFromUI() {
    const mainProductKey = document.getElementById('main-product')?.value || '';
    const mainProductConfig = PRODUCT_CATALOG[mainProductKey];

    appState.mainProduct.key = mainProductKey;
    appState.mainProduct.program = document.getElementById('main-product-program')?.value || '';
    appState.mainProduct.stbh = parseFormattedNumber(document.getElementById('main-stbh')?.value);
    appState.mainProduct.premium = parseFormattedNumber(document.getElementById('main-premium')?.value); // For MUL
    appState.mainProduct.paymentTerm = parseInt(document.getElementById('payment-term')?.value, 10) || 0;
    appState.mainProduct.extraPremium = parseFormattedNumber(document.getElementById('extra-premium')?.value);

    appState.paymentFrequency = document.getElementById('payment-frequency')?.value || 'year';

    // Collect Main Person Data
    appState.mainPerson = collectPersonData(document.getElementById('main-person-container'), true);

    // Collect Supplementary Persons Data
    appState.supplementaryPersons = Array.from(
        document.querySelectorAll('#supplementary-insured-container .person-container')
    ).map(container => collectPersonData(container, false));

    // Collect Policy Owner Data & Selected Waivers
    appState.policyOwner = collectPolicyOwnerData(document.getElementById('policy-owner-container'));

}

function collectPersonData(container, isMain) {
    if (!container) return null;

    const dobInput = container.querySelector('.dob-input');
    const dobStr = dobInput ? dobInput.value : '';
    let age = 0;
    let daysFromBirth = 0;

    // Calculate Age and Days From Birth
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
            age = Math.max(0, age); // Ensure age is not negative
        }
    }

    // Collect Supplements for this person
    const supplementsContainer = isMain
        ? document.querySelector('#main-supp-container .supplementary-products-container')
        : container.querySelector('.supplementary-products-container');

    const supplements = {};
    if (supplementsContainer) {
        Object.keys(PRODUCT_CATALOG).forEach(prodId => {
            const prodConfig = PRODUCT_CATALOG[prodId];
            if (prodConfig.type !== 'rider') return; // Only collect riders

            const section = supplementsContainer.querySelector(`.product-section-${prodId}`);
            if (!section) return; // Section might be hidden due to eligibility

            const mainCheckbox = section.querySelector(`.${prodId}-checkbox`);
            if (mainCheckbox && mainCheckbox.checked) {
                const suppData = { selected: true }; // Mark as selected

                // Get STBH if applicable
                const stbhInput = section.querySelector(`.${prodId}-stbh`);
                if (stbhInput) {
                    suppData.stbh = parseFormattedNumber(stbhInput.value);
                }

                // Get Program if applicable
                const programSelect = section.querySelector(`.${prodId}-program`);
                if (programSelect) {
                    suppData.program = programSelect.value;
                }

                 // Get Scope for SCL
                 if (prodId === 'HEALTH_SCL') {
                     const scopeSelect = section.querySelector(`.${prodId}-scope`);
                     if (scopeSelect) {
                         suppData.scope = scopeSelect.value;
                     }
                 }

                // Add more specific inputs if needed (like scope for SCL) based on prodConfig.uiInputs


                supplements[prodId] = suppData;
            }
        });
    }

    return {
        id: container.id,
        container: container,
        isMain: isMain,
        name: container.querySelector('.name-input')?.value || (isMain ? 'NĐBH Chính' : 'NĐBH Bổ sung'),
        dob: dobStr,
        age,
        daysFromBirth,
        gender: container.querySelector('.gender-select')?.value || 'Nam',
        riskGroup: parseInt(container.querySelector('.occupation-input')?.dataset.group, 10) || 0,
        supplements
    };
}
function collectPolicyOwnerData(container) {
    const ownerData = { // Default structure
        id: 'policy-owner-container',
        container: container,
        name: '',
        dob: '',
        age: 0,
        daysFromBirth: 0,
        gender: 'Nam',
        selectedWaivers: {}
    };
    if (!container) return ownerData;

     // Collect basic info similar to collectPersonData
    const dobInput = container.querySelector('.dob-input');
    const dobStr = dobInput ? dobInput.value : '';
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
            age = Math.max(0, age);
        }
    }

    ownerData.name = container.querySelector('.name-input')?.value || 'Bên Mua Bảo Hiểm';
    ownerData.dob = dobStr;
    ownerData.age = age;
    ownerData.daysFromBirth = daysFromBirth;
    ownerData.gender = container.querySelector('.gender-select')?.value || 'Nam';


    // Collect selected waiver products
    const waiverContainer = document.getElementById('waiver-products-container');
    if (waiverContainer) {
        waiverContainer.querySelectorAll('.waiver-product-checkbox').forEach(checkbox => {
            const productId = checkbox.dataset.productId;
            if (productId) {
                ownerData.selectedWaivers[productId] = checkbox.checked;
            }
        });
    }

    return ownerData;
}


// ===================================================================================
// ===== MODULE: LOGIC & CALCULATIONS
// ===================================================================================

function performCalculations(state) {
    const fees = {
        baseMain: 0,
        extra: 0,
        totalMain: 0,
        totalSupp: 0,
        total: 0,
        byPerson: {}, // { personId: { main: 0, supp: 0, total: 0, suppDetails: { riderId: fee } } }
        aggregateStbhs: {}, // For HOSPITAL_SUPPORT
        mdpStbhBase: 0, // Base for MDP calculation
    };

    // --- Step 1: Calculate Base Main Premium ---
    fees.baseMain = calculateMainPremium(state.mainPerson, state.mainProduct);
    fees.extra = state.mainProduct.extraPremium;
    fees.totalMain = fees.baseMain + fees.extra;

     // Initialize fee structure for each person
     const allInsuredPersons = [state.mainPerson, ...state.supplementaryPersons].filter(p => p);
     allInsuredPersons.forEach(p => {
         fees.byPerson[p.id] = { main: 0, supp: 0, total: 0, suppDetails: {} };
     });
     if (fees.byPerson[state.mainPerson.id]) {
         fees.byPerson[state.mainPerson.id].main = fees.totalMain;
         fees.byPerson[state.mainPerson.id].total = fees.totalMain;
     }


    // --- Step 2: Pre-calculate Aggregated Values Needed by Riders ---
    fees.aggregateStbhs = calculateAggregateStbhs(allInsuredPersons);

    // --- Step 3: Calculate Base for MDP (Waiver of Premium) ---
    // MDP STBH = Sum of (Base Main Premium + Non-Waiver Rider Premiums for everyone EXCEPT the policy owner)
    // We calculate annual rider fees first, then sum them up.
    let tempMdpStbhBase = fees.baseMain; // Start with main product base fee
    const tempRiderFeesAnnual = {}; // Store annual rider fees { personId: { riderId: fee } }

    allInsuredPersons.forEach(person => {
        tempRiderFeesAnnual[person.id] = {};
        for (const riderId in person.supplements) {
            const riderConfig = PRODUCT_CATALOG[riderId];
            if (riderConfig && riderConfig.type !== 'waiver_of_premium' && person.supplements[riderId]?.selected) {
                 const annualFee = calculateRiderPremium(
                    riderId,
                    person, // Customer data
                    state.mainPerson, // Main insured data (needed for dependencies)
                    state.mainProduct, // Main product data (needed for dependencies)
                    fees, // Current fees state (for aggregate values like HOSPITAL_SUPPORT)
                    state.policyOwner, // Policy owner data (relevant for MDP exclusion)
                    null // ageOverride = null for annual calculation
                 );
                 tempRiderFeesAnnual[person.id][riderId] = annualFee;
                 // Add to MDP base if this person is NOT the policy owner (for MDP 3.0 logic)
                  if (riderConfig.calculation?.stbhCalculation?.method === 'sumPremiumsOfPolicy' &&
                      riderConfig.calculation.stbhCalculation.config?.includePolicyOwnerRiders === false) {
                       // MDP 3.0: Add rider fee only if it's NOT for the policy owner
                       // We'll subtract the owner's riders later if they are selected for MDP
                  } else {
                       // Default: Add all non-waiver rider fees
                        tempMdpStbhBase += annualFee;
                  }
            }
        }
    });
     // Store the calculated base for MDP
     fees.mdpStbhBase = tempMdpStbhBase;

    // --- Step 4: Calculate Individual Rider Premiums (including Waivers) ---
    let totalSuppFee = 0;
    const policyOwnerPerson = state.policyOwner; // Policy owner is treated separately for waivers

     // Calculate for Insured Persons (Main + Supplementary)
    allInsuredPersons.forEach(person => {
        let personSuppFee = 0;
        for (const riderId in person.supplements) {
            const riderConfig = PRODUCT_CATALOG[riderId];
            // Use pre-calculated annual fee if available, otherwise calculate (should always be available from Step 3)
            const fee = tempRiderFeesAnnual[person.id]?.[riderId] ?? calculateRiderPremium(
                 riderId, person, state.mainPerson, state.mainProduct, fees, policyOwnerPerson, null
             );

             if (fee > 0) {
                 personSuppFee += fee;
                 fees.byPerson[person.id].suppDetails[riderId] = fee;
             }
        }
        fees.byPerson[person.id].supp = personSuppFee;
        fees.byPerson[person.id].total += personSuppFee;
        totalSuppFee += personSuppFee;
    });

    // Calculate Waiver Premiums for the Policy Owner
     let ownerWaiverFee = 0;
     fees.byPerson[policyOwnerPerson.id] = { main: 0, supp: 0, total: 0, suppDetails: {} }; // Initialize owner structure

     // Adjust MDP Base if owner is selected for MDP 3.0 style waiver
     Object.keys(policyOwnerPerson.selectedWaivers || {}).forEach(waiverId => {
         if (policyOwnerPerson.selectedWaivers[waiverId]) {
             const waiverConfig = PRODUCT_CATALOG[waiverId];
             if (waiverConfig?.calculation?.stbhCalculation?.method === 'sumPremiumsOfPolicy' &&
                 waiverConfig.calculation.stbhCalculation.config?.includePolicyOwnerRiders === false) {
                     // Subtract owner's non-waiver rider fees from the base calculated earlier
                     Object.values(tempRiderFeesAnnual[policyOwnerPerson.id] || {}).forEach(ownerRiderFee => {
                         fees.mdpStbhBase -= ownerRiderFee;
                     });
                     fees.mdpStbhBase = Math.max(0, fees.mdpStbhBase); // Ensure non-negative
             }
         }
     });

     // Now calculate the actual waiver fee based on the (potentially adjusted) base
     Object.keys(policyOwnerPerson.selectedWaivers || {}).forEach(waiverId => {
         if (policyOwnerPerson.selectedWaivers[waiverId]) {
             const waiverConfig = PRODUCT_CATALOG[waiverId];
             if (waiverConfig) {
                 const fee = calculateRiderPremium(
                     waiverId,
                     policyOwnerPerson, // The person whose risk determines the fee (the owner)
                     state.mainPerson, state.mainProduct, fees, policyOwnerPerson, null
                 );
                 if (fee > 0) {
                     ownerWaiverFee += fee;
                     fees.byPerson[policyOwnerPerson.id].suppDetails[waiverId] = fee;
                 }
             }
         }
     });
     fees.byPerson[policyOwnerPerson.id].supp = ownerWaiverFee;
     fees.byPerson[policyOwnerPerson.id].total = ownerWaiverFee;
     totalSuppFee += ownerWaiverFee;


    // --- Step 5: Final Totals ---
    fees.totalSupp = totalSuppFee;
    fees.total = fees.totalMain + fees.totalSupp;

     // Store detailed fees per person globally for MDP and summary calculation
     window.personFees = {};
     allInsuredPersons.forEach(p => {
         window.personFees[p.id] = {
             main: p.isMain ? fees.totalMain : 0,
             mainBase: p.isMain ? fees.baseMain : 0,
             supp: fees.byPerson[p.id]?.supp || 0,
             total: (p.isMain ? fees.totalMain : 0) + (fees.byPerson[p.id]?.supp || 0)
         };
     });
     // Add policy owner fees
     window.personFees[policyOwnerPerson.id] = {
         main: 0,
         mainBase: 0,
         supp: fees.byPerson[policyOwnerPerson.id]?.supp || 0,
         total: fees.byPerson[policyOwnerPerson.id]?.supp || 0
     };


    return fees;
}

function calculateAggregateStbhs(allInsuredPersons) {
    const aggregateStbhs = {};
    // Currently only needed for HOSPITAL_SUPPORT
    let totalHospitalSupport = 0;
    allInsuredPersons.forEach(person => {
        const hsStbh = person.supplements?.HOSPITAL_SUPPORT?.stbh || 0;
        if (hsStbh > 0) {
            totalHospitalSupport += hsStbh;
        }
    });
    aggregateStbhs['HOSPITAL_SUPPORT'] = totalHospitalSupport;
    return aggregateStbhs;
}


function calculateMainPremium(customer, productInfo) {
    const { key: productKey, program: programKey, stbh, premium: enteredPremium } = productInfo;
    const productConfig = PRODUCT_CATALOG[productKey];

    if (!productConfig) return 0;

     // Handle Packages first
     if (productConfig.calculation.method === 'package') {
        const underlyingKey = productConfig.packageConfig.underlyingMainProduct;
        const underlyingConfig = PRODUCT_CATALOG[underlyingKey];
        if (!underlyingConfig) return 0;

        const fixedProgram = productConfig.packageConfig.fixedValues.program;
        const fixedStbh = productConfig.packageConfig.fixedValues.stbh;

        // Create temporary productInfo for the underlying product
        const underlyingProductInfo = {
            key: underlyingKey,
            program: fixedProgram,
            stbh: fixedStbh,
            premium: 0, // Not from input for package base
            paymentTerm: 0, // Not relevant for base premium calc of underlying
            extraPremium: 0
        };
        // Recursively call calculateMainPremium for the underlying product
        return calculateMainPremium(customer, underlyingProductInfo);
    }


    const calcConfig = productConfig.calculation;
    let premium = 0;

    switch (calcConfig.method) {
        case 'fromInput':
            premium = enteredPremium;
            break;

        case 'ratePer1000Stbh':
        case 'ratePer1000StbhByProgram': {
            if (!stbh || stbh <= 0) return 0;
            const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
            let rate = 0;
            let rateTableSource = product_data; // Start from root
            let rateTableRefPath = '';

            if (calcConfig.method === 'ratePer1000Stbh') {
                 // Direct reference from product config (old PUL style, might deprecate)
                 rateTableRefPath = productConfig.rateTableRef || calcConfig.rateTableRef; // Allow backward compat
            } else { // ratePer1000StbhByProgram
                if (!programKey) return 0; // Program required but not selected
                const programOption = productConfig.programs?.options?.find(p => p.key === programKey);
                if (!programOption || !programOption.rateTableRef) return 0; // Config error
                rateTableRefPath = programOption.rateTableRef;
            }

            if (!rateTableRefPath) return 0;

            const pathParts = rateTableRefPath.split('.');
            let rateTable = rateTableSource;
            pathParts.forEach(part => {
                rateTable = rateTable ? rateTable[part] : undefined;
            });

            if (Array.isArray(rateTable)) {
                const rateEntry = rateTable.find(r => r.age === customer.age);
                rate = rateEntry ? (rateEntry[genderKey] || 0) : 0;
            }

            premium = (stbh / 1000) * rate;
            break;
        }

        case 'none': // For pure package wrappers
             return 0;

        default:
            console.warn(`Unknown main product calculation method: ${calcConfig.method} for ${productKey}`);
            return 0;
    }

    return roundDownTo1000(premium);
}

function calculateRiderPremium(
        riderId,
        customerForCalc, // The person this rider is for (can be insured or policy owner)
        mainInsured,     // Always the main insured person
        mainProductInfo, // Main product config and selections
        currentFees,     // Includes aggregate values and mdpStbhBase
        policyOwner,     // Policy owner info
        ageOverride = null // For projections
    ) {
    const riderConfig = PRODUCT_CATALOG[riderId];
    if (!riderConfig) return 0;

    const ageToUse = ageOverride ?? customerForCalc.age;
    const renewalMaxRule = riderConfig.rules?.eligibility?.find(r => r.renewalMax != null);
    const renewalMax = renewalMaxRule?.renewalMax ?? 99; // Default high if not specified
    if (ageToUse > renewalMax) return 0; // Exceeded max renewal age


    const calcConfig = riderConfig.calculation;
    const supplementData = customerForCalc.supplements?.[riderId] ?? policyOwner.selectedWaivers?.[riderId]; // Data specific to this rider selection
    const riderProgramKey = supplementData?.program;
    const riderStbh = supplementData?.stbh || 0;
    let premium = 0;

    switch (calcConfig.method) {
        case 'ratePer1000Stbh': {
            if (!riderStbh || riderStbh <= 0) return 0;
            const genderKey = customerForCalc.gender === 'Nữ' ? 'nu' : 'nam';
            let rateTable = product_data;
            calcConfig.rateTableRef.split('.').forEach(p => rateTable = rateTable ? rateTable[p] : undefined);

            if (Array.isArray(rateTable)) {
                // Find rate based on age bands or direct age match
                 const rateEntry = rateTable.find(r => (r.ageMin != null && r.ageMax != null)
                                                      ? (ageToUse >= r.ageMin && ageToUse <= r.ageMax) // Age band
                                                      : (r.age === ageToUse)); // Direct age match
                const rate = rateEntry ? (rateEntry[genderKey] || 0) : 0;
                premium = (riderStbh / 1000) * rate;
            }
            break;
        }
        case 'ratePer100StbhByRiskGroup': {
            if (!riderStbh || riderStbh <= 0) return 0;
            const riskGroup = customerForCalc.riskGroup;
            if (riskGroup < 1 || riskGroup > 4) return 0; // Invalid risk group

            let rateMap = product_data;
            calcConfig.rateTableRef.split('.').forEach(p => rateMap = rateMap ? rateMap[p] : undefined);

            const rate = rateMap ? (rateMap[riskGroup] || 0) : 0;
            premium = (riderStbh / 1000) * rate;
            break;
        }
        case 'ratePer100Stbh': {
             if (!riderStbh || riderStbh <= 0) return 0;
             let rateTable = product_data;
             calcConfig.rateTableRef.split('.').forEach(p => rateTable = rateTable ? rateTable[p] : undefined);

              if (Array.isArray(rateTable)) {
                  const rateEntry = rateTable.find(r => ageToUse >= r.ageMin && ageToUse <= r.ageMax);
                  const rate = rateEntry ? (rateEntry.rate || 0) : 0;
                  premium = (riderStbh / 100) * rate; // Per 100 STBH
              }
              break;
        }
        case 'healthSclLookup': {
            // This method calculates the fee for one component (main, outpatient, or dental)
            const { program, scope } = customerForCalc.supplements[riderConfig.dependencies?.parentRiderRequired || riderId]; // Get program/scope from parent or self
            if (!program || !scope) return 0;

            let rateType = '';
            if (riderId === 'HEALTH_SCL') rateType = scope; // 'main_vn' or 'main_global'
            else if (riderId === 'OUTPATIENT_SCL') rateType = 'outpatient';
            else if (riderId === 'DENTAL_SCL') rateType = 'dental';
            else return 0; // Should not happen

             let rateTable = product_data;
             calcConfig.rateTableRef.split('.').forEach(p => rateTable = rateTable ? rateTable[p] : undefined);
             if (!rateTable || !rateTable.age_bands) return 0;


            const ageBandIndex = rateTable.age_bands.findIndex(b => ageToUse >= b.min && ageToUse <= b.max);
            if (ageBandIndex === -1) return 0;

            premium = rateTable[rateType]?.[ageBandIndex]?.[program] || 0;
            break;
        }
        case 'ratePer1000StbhForMdp': {
            const mdpStbhBase = currentFees.mdpStbhBase || 0; // Use pre-calculated base
            if (mdpStbhBase <= 0) return 0;

            const genderKey = customerForCalc.gender === 'Nữ' ? 'nu' : 'nam';
            let rateTable = product_data;
            calcConfig.rateTableRef.split('.').forEach(p => rateTable = rateTable ? rateTable[p] : undefined);

            if (Array.isArray(rateTable)) {
                 const rateEntry = rateTable.find(r => ageToUse >= r.ageMin && ageToUse <= r.ageMax);
                 const rate = rateEntry ? (rateEntry[genderKey] || 0) : 0;
                 premium = (mdpStbhBase / 1000) * rate;
            }
            break;
        }

        default:
            console.warn(`Unknown rider calculation method: ${calcConfig.method} for ${riderId}`);
            return 0;
    }

    return roundDownTo1000(premium);
}

// Function to adjust annual fees for payment frequency
function getFeePerPeriod(annualFee, frequency, isRider = false) {
    if (frequency === 'year') return annualFee;

    const periods = frequency === 'half' ? 2 : 4;
    let factor = 1;
    if (isRider) {
        factor = (frequency === 'half' ? GLOBAL_CONFIG.paymentFrequencyFactors.half : GLOBAL_CONFIG.paymentFrequencyFactors.quarter);
    }

    if (annualFee <= 0) return 0;

    // Riders are adjusted first, then rounded. Non-riders are divided then rounded.
    if (isRider) {
        return roundDownTo1000((annualFee * factor) / periods);
    } else {
        return roundDownTo1000(annualFee / periods);
    }
}

// ===================================================================================
// ===== MODULE: UI RENDERING
// ===================================================================================
function renderUI(isValid) {
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;

    // --- Show/Hide Supplementary Section ---
    const suppSection = document.getElementById('supplementary-insured-section');
    if (suppSection) {
        suppSection.classList.toggle('hidden', noSuppInsured);
    }
    // Remove supplementary persons if main product doesn't allow them
    if (noSuppInsured && appState.supplementaryPersons.length > 0) {
        document.getElementById('supplementary-insured-container').innerHTML = '';
        appState.supplementaryPersons = []; // Clear from state too
    }

     // --- Update Basic Person Info (Age, Risk Group) ---
     const allPersons = [appState.mainPerson, ...appState.supplementaryPersons].filter(p => p);
     allPersons.forEach(p => {
         if (p.container) {
             p.container.querySelector('.age-span').textContent = p.age;
             p.container.querySelector('.risk-group-span').textContent = p.riskGroup > 0 ? p.riskGroup : '...';
         }
     });
     // Update Policy Owner Age
     if (appState.policyOwner.container) {
          appState.policyOwner.container.querySelector('.age-span').textContent = appState.policyOwner.age;
     }

    // --- Render Main Product Section (Programs, Inputs) ---
    renderMainProductSection(appState.mainPerson, appState.mainProduct.key);

    // --- Render Supplementary Products for Each Person ---
    allPersons.forEach(p => {
        const suppContainer = p.isMain
            ? document.querySelector('#main-supp-container .supplementary-products-container')
            : p.container?.querySelector('.supplementary-products-container');
        if (suppContainer) {
            renderSupplementaryProductsForPerson(p, suppContainer, isValid);
        }
    });

     // --- Render Waiver Products Section (MDP) ---
     renderWaiverProductsSection(appState.policyOwner, isValid);


    // --- Update Buttons and Global Sections ---
    updateSupplementaryAddButtonState(isValid);

    // --- Update Fee Summary ---
    const fees = appState.fees;
    updateSummaryUI(fees, isValid);
    updateMainProductFeeDisplay(fees.baseMain, fees.extra);
    updatePaymentFrequencyOptions(fees.baseMain); // Based on *annual* base main fee

    // Update Section 6 (Benefit Matrix and Schedule)
    if (window.renderSection6V2) window.renderSection6V2(appState, isValid); // Pass state and validity
}


let lastRenderedMainProductKey = null;
let lastRenderedMainPersonAge = null;
function renderMainProductSection(customer, mainProductKey) {
    const mainProductSelect = document.getElementById('main-product');
    const container = document.getElementById('main-product-options');
    const feeDisplay = document.getElementById('main-product-fee-display');
    const productConfig = PRODUCT_CATALOG[mainProductKey];

    // --- Update Eligibility of Main Product Options ---
    document.querySelectorAll('#main-product option').forEach(option => {
        const productKey = option.value;
        const config = PRODUCT_CATALOG[productKey];
        if (!config) return;
        const isEligible = checkEligibility(customer, config.rules.eligibility);
        option.disabled = !isEligible;
        option.classList.toggle('hidden', !isEligible);
         // If current selection becomes ineligible, reset (optional, but good UX)
         if (mainProductSelect.value === productKey && !isEligible) {
            mainProductSelect.value = '';
            container.innerHTML = '';
            if (feeDisplay) feeDisplay.textContent = '';
            // Maybe trigger workflow immediately? Or let user re-select.
            // runWorkflowDebounced();
         }
    });

    // --- Render Dynamic Options only if product/age changed or container is empty ---
    if (!productConfig || (lastRenderedMainProductKey === mainProductKey && lastRenderedMainPersonAge === customer.age && container.innerHTML !== '')) {
         // Update fee display even if options don't re-render
         if (feeDisplay) {
            const base = appState.fees.baseMain;
            const extra = appState.fees.extra;
             if (base <= 0 && extra <= 0) { feeDisplay.textContent = ''; }
             else if (extra > 0) { feeDisplay.innerHTML = `Phí SP chính: ${formatCurrency(base)} | Phí đóng thêm: ${formatCurrency(extra)} | Tổng: ${formatCurrency(base + extra)}`; }
             else { feeDisplay.textContent = `Phí SP chính: ${formatCurrency(base)}`; }
         }
        return; // No need to re-render options
    }
    lastRenderedMainProductKey = mainProductKey;
    lastRenderedMainPersonAge = customer.age;
    container.innerHTML = ''; // Clear previous options

    // --- Handle Packages (No user inputs) ---
     if (productConfig.calculation.method === 'package') {
        const fixedStbh = productConfig.packageConfig.fixedValues.stbh;
        const underlyingConfig = PRODUCT_CATALOG[productConfig.packageConfig.underlyingMainProduct];
        const fixedProgramKey = productConfig.packageConfig.fixedValues.program;
        const fixedProgram = underlyingConfig?.programs?.options.find(p => p.key === fixedProgramKey);
        const fixedTerm = fixedProgram?.defaultPaymentTerm || 'N/A'; // Get term from underlying program

        container.innerHTML = `
            <div>
              <label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
              <input type="text" class="form-input bg-gray-100" value="${formatCurrency(fixedStbh)}" disabled>
            </div>
             ${fixedProgram ? `<div><p class="text-sm text-gray-600 mt-1">Chương trình: ${sanitizeHtml(fixedProgram.label)} (${fixedTerm} năm)</p></div>` : '' }
             <div><p class="text-sm text-gray-600 mt-1">Sản phẩm bổ sung bắt buộc: ${productConfig.packageConfig.mandatoryRiders.map(r => PRODUCT_CATALOG[r.id]?.displayName || r.id).join(', ')}</p></div>
             `;
         // Update fee display for package
         if (feeDisplay) {
            const base = appState.fees.baseMain; // Fee comes from underlying calculation
            feeDisplay.textContent = base > 0 ? `Phí SP chính (gói): ${formatCurrency(base)}` : '';
         }
        attachInputFormatters(container); // Attach formatters even for disabled inputs if needed
        return; // Stop here for packages
    }


    // --- Render Programs Select (if applicable) ---
    if (productConfig.programs?.enabled) {
        const programOptions = productConfig.programs.options
            .filter(opt => checkEligibility(customer, opt.eligibility)) // Filter based on eligibility
            .map(opt => `<option value="${opt.key}" ${appState.mainProduct.program === opt.key ? 'selected' : ''}>${sanitizeHtml(opt.label)}</option>`)
            .join('');

        const programSelectHTML = programOptions ?
            `<select id="main-product-program" class="form-select">
                <option value="">-- Chọn ${sanitizeHtml(productConfig.programs.label.toLowerCase())} --</option>
                ${programOptions}
             </select>` :
            `<p class="text-sm text-red-600">Không có ${sanitizeHtml(productConfig.programs.label.toLowerCase())} phù hợp với tuổi/giới tính.</p>`;

        container.innerHTML += `<div>
            <label for="main-product-program" class="font-medium text-gray-700 block mb-1">${sanitizeHtml(productConfig.programs.label)} <span class="text-red-600">*</span></label>
            ${programSelectHTML}
            <div class="field-error text-sm text-red-600 mt-1" data-for="main-product-program"></div>
        </div>`;

         // Auto-set default payment term based on program selection (PUL)
         const programSelect = container.querySelector('#main-product-program');
         if (programSelect && productConfig.id === 'KHOE_TRON_VEN') { // Specific logic for PUL default term
            programSelect.addEventListener('change', (e) => {
                const selectedProgramKey = e.target.value;
                const programConf = productConfig.programs.options.find(p => p.key === selectedProgramKey);
                const termInput = document.getElementById('payment-term'); // Get input potentially added later
                if (programConf && termInput && programConf.defaultPaymentTerm) {
                    termInput.value = programConf.defaultPaymentTerm;
                    // Need to update state and re-run workflow because term change affects calculations/validations
                     appState.mainProduct.paymentTerm = programConf.defaultPaymentTerm;
                     updateTargetAge(); // Update target age hint/value
                    runWorkflowDebounced();
                }
            });
         }
    }

    // --- Render Standard Inputs (STBH, Premium, Payment Term, Extra Premium) ---
    const rules = productConfig.rules.validationRules || {};
    let optionsHtml = '';

    // STBH Input
    if (rules.stbh || rules.anyOf?.some(r => r.stbh)) {
        const stbhRule = rules.stbh || {};
        optionsHtml += `<div>
            <label for="main-stbh" class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH) <span class="text-red-600">*</span></label>
            <input type="text" id="main-stbh" class="form-input"
                   value="${appState.mainProduct.stbh > 0 ? formatCurrency(appState.mainProduct.stbh) : ''}"
                   placeholder="${sanitizeHtml(stbhRule.placeholder || 'Nhập STBH')}">
            ${stbhRule.hint ? `<div class="text-sm text-gray-500 mt-1">${sanitizeHtml(stbhRule.hint)}</div>` : ''}
             <div class="field-error text-sm text-red-600 mt-1" data-for="main-stbh"></div>
        </div>`;
    }

    // Premium Input (Only for method 'fromInput', e.g., MUL)
    if (productConfig.calculation.method === 'fromInput') {
        const premiumRule = rules.premium || {};
        const hintText = typeof premiumRule.hintFunction === 'function'
            ? premiumRule.hintFunction(appState.mainProduct.stbh, customer)
            : (premiumRule.hint || '');
        optionsHtml += `<div>
            <label for="main-premium" class="font-medium text-gray-700 block mb-1">Phí sản phẩm chính</label>
            <input type="text" id="main-premium" class="form-input"
                   value="${appState.mainProduct.premium > 0 ? formatCurrency(appState.mainProduct.premium) : ''}"
                   placeholder="${sanitizeHtml(premiumRule.placeholder || 'Nhập phí')}">
            <div id="mul-fee-range" class="text-sm text-gray-500 mt-1">${sanitizeHtml(hintText)}</div>
            <div class="field-error text-sm text-red-600 mt-1" data-for="main-premium"></div>
        </div>`;
    }

    // Payment Term Input (If not determined by program like ABUV)
    if (rules.paymentTerm && !productConfig.programs?.enabled) { // ABUV term is handled via program
        const termRule = rules.paymentTerm;
        const min = termRule.min || 4;
        const max = typeof termRule.maxFunction === 'function' ? termRule.maxFunction(customer.age) : (100 - customer.age);
         // Get default term: from rule itself, or from selected program if available (for PUL)
         let defaultTerm = termRule.default;
         if (productConfig.programs?.enabled && appState.mainProduct.program) {
             const selectedProg = productConfig.programs.options.find(p => p.key === appState.mainProduct.program);
             defaultTerm = selectedProg?.defaultPaymentTerm || defaultTerm;
         }
         const currentValue = appState.mainProduct.paymentTerm;
         // Use default only if current value is invalid or zero, or if it doesn't match the new default
         const finalValue = (currentValue >= min && currentValue <= max && currentValue !== 0) ? currentValue : (defaultTerm || '');

        optionsHtml += `<div>
            <label for="payment-term" class="font-medium text-gray-700 block mb-1">Thời gian đóng phí (năm) <span class="text-red-600">*</span></label>
            <input type="number" id="payment-term" class="form-input"
                   value="${finalValue}"
                   placeholder="${sanitizeHtml(termRule.placeholder || 'VD: 20')}" min="${min}" max="${max}">
            <div id="payment-term-hint" class="text-sm text-gray-500 mt-1">${typeof termRule.hint === 'function' ? termRule.hint(min, max) : `Nhập từ ${min} đến ${max} năm`}</div>
            <div class="field-error text-sm text-red-600 mt-1" data-for="payment-term"></div>
        </div>`;

         // If the value was reset to default, update state immediately
         if (finalValue !== currentValue) {
            appState.mainProduct.paymentTerm = parseInt(finalValue, 10) || 0;
            // Update target age hint/value
            updateTargetAge();
         }
    }

    // Extra Premium Input
    if (rules.extraPremium) {
        const extraRule = rules.extraPremium;
        const hintText = typeof extraRule.hintFunction === 'function'
            ? extraRule.hintFunction(appState.mainProduct.stbh, customer, appState.fees.baseMain)
            : `Tối đa ${extraRule.maxFactorOfBase} lần phí chính.`;
         optionsHtml += `<div>
            <label for="extra-premium" class="font-medium text-gray-700 block mb-1">Phí đóng thêm</label>
            <input type="text" id="extra-premium" class="form-input"
                   value="${appState.mainProduct.extraPremium > 0 ? formatCurrency(appState.mainProduct.extraPremium) : ''}"
                   placeholder="${sanitizeHtml(extraRule.placeholder || 'VD: 10.000.000')}">
             <div class="text-sm text-gray-500 mt-1">${sanitizeHtml(hintText)}</div>
             <div class="field-error text-sm text-red-600 mt-1" data-for="extra-premium"></div>
        </div>`;
    }

    container.innerHTML += optionsHtml;

     // Update Fee Display after rendering inputs
     if (feeDisplay) {
        const base = appState.fees.baseMain;
        const extra = appState.fees.extra;
         if (base <= 0 && extra <= 0) { feeDisplay.textContent = ''; }
         else if (extra > 0) { feeDisplay.innerHTML = `Phí SP chính: ${formatCurrency(base)} | Phí đóng thêm: ${formatCurrency(extra)} | Tổng: ${formatCurrency(base + extra)}`; }
         else { feeDisplay.textContent = `Phí SP chính: ${formatCurrency(base)}`; }
     }

    // Attach listeners for formatting and validation hints/updates
    attachInputFormatters(container);
    attachTermListenersForTargetAge(); // Attach listener for payment term changes
}

function renderSupplementaryProductsForPerson(customer, container, isMainProductValid) {
    const mainProductKey = appState.mainProduct.key;
    const mainProductConfig = PRODUCT_CATALOG[mainProductKey];
    const mainPremiumAnnual = appState.fees.baseMain; // Use annual base premium for thresholds

     // Determine overall rider eligibility based on main product rules
     let ridersGloballyDisabled = !isMainProductValid;
     let ridersDisabledReason = '';
     if (!isMainProductValid) {
         ridersDisabledReason = 'Vui lòng hoàn tất thông tin sản phẩm chính hợp lệ.';
     } else if (mainProductConfig && mainProductConfig.id === 'KHOE_TRON_VEN') { // Specific PUL check
         const { stbh, premium } = appState.mainProduct;
         const rules = mainProductConfig.rules.validationRules || {};
         const stbhOk = stbh >= (rules.anyOf?.[0]?.stbh?.min || 1000000000);
         const premiumOk = mainPremiumAnnual >= (rules.anyOf?.[1]?.premium?.min || 20000000);
          if (!(stbhOk || premiumOk)) {
              ridersGloballyDisabled = true;
              ridersDisabledReason = rules.anyOfMessage || "Cần STBH >= 1 tỷ hoặc Phí >= 20 triệu để thêm SPBT.";
          }
     } else if (mainPremiumAnnual < 5000000 && mainPremiumAnnual > 0) { // General minimum premium check
         // ridersGloballyDisabled = true; // Decide if you want to disable ALL riders if main premium is too low
         // ridersDisabledReason = `Phí SP chính tối thiểu ${formatCurrency(5000000)} để thêm SPBT.`;
     }


    let requiresReRun = false; // Flag if UI interaction forces a state change

    // Sort riders by displayOrder
    const riderEntries = Object.entries(PRODUCT_CATALOG)
        .filter(([, config]) => config.type === 'rider' && config.displayOrder) // Only riders with displayOrder
        .sort(([, a], [, b]) => (a.displayOrder || 99) - (b.displayOrder || 99));


     // Clear container before rendering
     container.innerHTML = '';
     const fragment = document.createDocumentFragment();


    riderEntries.forEach(([riderId, riderConfig]) => {
         // --- Basic Eligibility Check ---
         let isEligible = checkEligibility(customer, riderConfig.rules.eligibility);
         let eligibilityFailReason = isEligible ? '' : `Không đủ điều kiện về tuổi/giới tính/nhóm nghề.`;

         // --- Package Mandatory/Allowed Check ---
         let isMandatory = false;
         if (mainProductConfig?.calculation.method === 'package') {
             const mandatoryInfo = mainProductConfig.packageConfig.mandatoryRiders?.find(r => r.id === riderId);
             if (mandatoryInfo) {
                 isEligible = true; // Mandatory riders bypass other checks (usually)
                 isMandatory = true;
                 eligibilityFailReason = '';
                 // Pre-fill STBH/program if defined in packageConfig
                 customer.supplements[riderId] = { ...(customer.supplements[riderId] || {}), ...mandatoryInfo, selected: true };
             } else {
                 // Check if rider is allowed at all with this package
                 const allowedRiders = mainProductConfig.rules.riderLimits?.allowed;
                 if (mainProductConfig.rules.riderLimits?.enabled && !allowedRiders?.includes(riderId)) {
                     isEligible = false;
                     eligibilityFailReason = 'Không được phép tham gia cùng gói sản phẩm này.';
                 }
             }
         } else if (mainProductConfig?.rules.riderLimits?.enabled && !mainProductConfig.rules.riderLimits.allowed?.includes(riderId)) {
             // Check general rider limits for non-package products
             isEligible = false;
             eligibilityFailReason = 'Không được phép tham gia cùng sản phẩm chính này.';
         }

          // --- Dependency Check (Parent Rider) ---
          let parentRiderRequired = riderConfig.dependencies?.parentRiderRequired;
          let parentSelected = true; // Assume true if no parent required
          if (parentRiderRequired) {
              parentSelected = customer.supplements[parentRiderRequired]?.selected || false;
              if (!parentSelected) {
                  isEligible = false; // Cannot select child if parent not selected
                  eligibilityFailReason = riderConfig.dependencies.parentRiderRequiredMessage || `Phải chọn ${PRODUCT_CATALOG[parentRiderRequired]?.displayName || 'sản phẩm'} trước.`;
              }
          }

         // --- Create Section Element ---
         const section = document.createElement('div');
         section.className = `product-section product-section-${riderId} space-y-3`; // Use space-y for consistent spacing
         section.classList.toggle('hidden', !isEligible && !isMandatory); // Hide if ineligible unless mandatory


          // --- Checkbox and Label ---
          const isSelected = customer.supplements[riderId]?.selected || false;
          const checkboxId = `${customer.id}-${riderId}-checkbox`;
          const labelFlex = document.createElement('label');
          labelFlex.className = 'flex items-center space-x-3 cursor-pointer';
          labelFlex.setAttribute('for', checkboxId);

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = checkboxId;
          checkbox.className = `form-checkbox ${riderId}-checkbox`;
          checkbox.checked = isSelected;
          checkbox.disabled = ridersGloballyDisabled || !isEligible || isMandatory || !parentSelected;
          checkbox.dataset.riderId = riderId; // Store riderId for event handling

          const labelSpan = document.createElement('span');
          labelSpan.className = 'text-lg font-medium text-gray-800';
          labelSpan.textContent = riderConfig.displayName;

          labelFlex.appendChild(checkbox);
          labelFlex.appendChild(labelSpan);
          section.appendChild(labelFlex);

           // --- Options Container (conditionally rendered) ---
           const optionsContainer = document.createElement('div');
           optionsContainer.className = 'product-options pl-8 space-y-3 border-l-2 border-gray-200'; // Added space-y
           optionsContainer.classList.toggle('hidden', !isSelected); // Hide if not selected


            // --- Eligibility/Disabled Reason Message ---
            const messageEl = document.createElement('p');
            messageEl.className = 'text-xs text-red-600 rider-message hidden'; // For various messages
            optionsContainer.appendChild(messageEl); // Add early to ensure it's always there

            if (ridersGloballyDisabled) {
                messageEl.textContent = ridersDisabledReason;
                messageEl.classList.remove('hidden');
                section.classList.add('opacity-50', 'pointer-events-none'); // Disable visually
            } else if (!isEligible && !isMandatory) {
                // messageEl.textContent = eligibilityFailReason; // Don't show eligibility reason if section is hidden? Or show it?
                // messageEl.classList.remove('hidden');
                section.classList.add('opacity-50'); // Keep visible but faded if parent not selected
            } else if (!parentSelected) {
                 messageEl.textContent = eligibilityFailReason;
                 messageEl.classList.remove('hidden');
                 section.classList.add('opacity-50');
            }


             // --- Render Rider-Specific Inputs (STBH, Program, Scope, etc.) ---
             let programOptionsHTML = ''; // To store program options if needed multiple times

            // Render Program Select (if applicable)
             if (riderConfig.programs?.enabled) {
                 let availablePrograms = riderConfig.programs.options;

                 // Filter by Main Premium Threshold (e.g., SCL)
                 if (riderConfig.dependencies?.mainPremiumThresholds && !isMandatory) { // Don't filter for mandatory riders in packages
                     const thresholds = riderConfig.dependencies.mainPremiumThresholds.thresholds;
                      let allowedKeys = null;
                      // Find the highest threshold the main premium meets
                      for (const threshold of thresholds) { // Assumes sorted high to low
                          if (mainPremiumAnnual >= threshold.minPremium) {
                              allowedKeys = threshold.allowed;
                              break;
                          }
                      }
                      if (allowedKeys) {
                          availablePrograms = availablePrograms.filter(opt => allowedKeys.includes(opt.key));
                      } else {
                          availablePrograms = []; // No programs allowed
                      }
                      // Store available programs for validation/rendering logic later
                      if (riderId === 'HEALTH_SCL') {
                           appState.uiState.availableSclPrograms = availablePrograms.map(p => p.key);
                      }
                 }

                 // Generate <option> elements
                 programOptionsHTML = availablePrograms
                     .map(opt => `<option value="${opt.key}" ${customer.supplements[riderId]?.program === opt.key ? 'selected' : ''}>${sanitizeHtml(opt.label)}</option>`)
                     .join('');

                 const programSelectHTML = programOptionsHTML ?
                     `<select class="form-select ${riderId}-program" data-rider-id="${riderId}" ${checkbox.disabled ? 'disabled' : ''}>
                         <option value="">-- Chọn ${sanitizeHtml(riderConfig.programs.label.toLowerCase())} --</option>
                         ${programOptionsHTML}
                      </select>` :
                     `<p class="text-sm text-red-600">Phí SP chính không đủ điều kiện cho chương trình nào.</p>`;

                 optionsContainer.innerHTML += `<div>
                     <label class="font-medium text-gray-700 block mb-1">${sanitizeHtml(riderConfig.programs.label)}</label>
                     ${programSelectHTML}
                     <div class="field-error text-sm text-red-600 mt-1" data-for="${riderId}-program"></div>
                 </div>`;

                 // Check if current selection is still valid
                 const currentProgram = customer.supplements[riderId]?.program;
                 if (currentProgram && !availablePrograms.some(p => p.key === currentProgram)) {
                      // Program no longer valid, reset it
                      if (customer.supplements[riderId]) {
                         customer.supplements[riderId].program = '';
                      }
                      requiresReRun = true; // Need to re-calculate fee
                      // Add message indicating reset
                      messageEl.textContent = `Chương trình ${currentProgram} không còn phù hợp do thay đổi phí chính, vui lòng chọn lại.`;
                      messageEl.classList.remove('hidden');
                 }
             }

            // Render STBH Input (if applicable)
            const stbhRule = riderConfig.rules?.validationRules?.stbh;
            if (stbhRule) {
                const hintText = typeof stbhRule.hintFunction === 'function'
                    ? stbhRule.hintFunction(customer.supplements[riderId]?.stbh, customer, mainPremiumAnnual, appState.fees.aggregateStbhs[riderId])
                    : (stbhRule.hint || '');
                const isDisabled = checkbox.disabled || isMandatory; // Disable STBH input if mandatory

                optionsContainer.innerHTML += `<div>
                    <label class="font-medium text-gray-700 block mb-1">Số tiền bảo hiểm (STBH)</label>
                    <input type="text" class="form-input ${riderId}-stbh" data-rider-id="${riderId}"
                           value="${(customer.supplements[riderId]?.stbh || 0) > 0 ? formatCurrency(customer.supplements[riderId]?.stbh) : ''}"
                           placeholder="${sanitizeHtml(stbhRule.placeholder || 'Nhập STBH')}" ${isDisabled ? 'disabled' : ''}>
                    <div class="text-sm text-gray-500 mt-1 rider-hint">${sanitizeHtml(hintText)}</div>
                    <div class="field-error text-sm text-red-600 mt-1" data-for="${riderId}-stbh"></div>
                </div>`;
            }

             // Render Other UI Inputs (e.g., Scope for SCL)
             if (riderConfig.uiInputs) {
                 for (const inputKey in riderConfig.uiInputs) {
                     const inputConfig = riderConfig.uiInputs[inputKey];
                     const currentValue = customer.supplements[riderId]?.[inputKey];
                     let inputHtml = '';
                     if (inputConfig.type === 'select') {
                          const optionsHtml = inputConfig.options
                             .map(opt => `<option value="${opt.value}" ${currentValue === opt.value ? 'selected' : ''}>${sanitizeHtml(opt.label)}</option>`)
                             .join('');
                          inputHtml = `<select class="form-select ${riderId}-${inputKey}" data-rider-id="${riderId}" data-input-key="${inputKey}" ${checkbox.disabled ? 'disabled' : ''}>${optionsHtml}</select>`;
                     }
                     // Add other input types (text, number, checkbox) if needed later

                     if (inputHtml) {
                          optionsContainer.innerHTML += `<div>
                             <label class="font-medium text-gray-700 block mb-1">${sanitizeHtml(inputConfig.label)}</label>
                             ${inputHtml}
                             <div class="field-error text-sm text-red-600 mt-1" data-for="${riderId}-${inputKey}"></div>
                         </div>`;
                     }
                 }
             }


            // --- Fee Display ---
            const fee = appState.fees.byPerson[customer.id]?.suppDetails?.[riderId] || 0;
            const feeDisplay = document.createElement('div');
            feeDisplay.className = 'text-right font-semibold text-aia-red fee-display min-h-[1.5rem]';
            feeDisplay.textContent = fee > 0 ? `Phí: ${formatCurrency(fee)}` : '';
            optionsContainer.appendChild(feeDisplay);

            // Append options container to section
            section.appendChild(optionsContainer);


             // Attach listeners specific to this rider's inputs
            attachInputFormatters(optionsContainer); // Format STBH input
            optionsContainer.querySelectorAll('select, input[type="text"]').forEach(input => {
                input.addEventListener('change', runWorkflowDebounced);
                input.addEventListener('input', (e) => { // Handle text input formatting on the fly
                     if (e.target.matches('input[type="text"]') && e.target.classList.contains(`${riderId}-stbh`)) {
                        formatNumberInput(e.target);
                     }
                     runWorkflowDebounced(); // Trigger calculation on input for immediate feedback
                 });
                  input.addEventListener('focusout', (e) => { // Round on blur
                     if (e.target.matches('input[type="text"]') && e.target.classList.contains(`${riderId}-stbh`)) {
                        roundInputToThousand(e.target, riderConfig.rules.validationRules.stbh?.multipleOf);
                        runWorkflow(); // Run immediately on blur after rounding
                     }
                  });
            });

            // Attach listener for the main checkbox
            checkbox.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                optionsContainer.classList.toggle('hidden', !isChecked);

                // If unchecked, potentially uncheck children and reset parent state
                 if (!isChecked) {
                     handleRiderUncheck(customer, riderId);
                 }

                 // Update state immediately
                 if (!customer.supplements[riderId]) customer.supplements[riderId] = {};
                 customer.supplements[riderId].selected = isChecked;


                runWorkflow(); // Re-run immediately on checkbox change
            });


        fragment.appendChild(section); // Add the completed section to the fragment
    });

    container.appendChild(fragment); // Append all sections at once

    // If any program was reset due to eligibility change, re-run workflow
    if (requiresReRun) {
        runWorkflowDebounced();
    }
}

// Helper to recursively handle unchecking parent/child riders
function handleRiderUncheck(customer, uncheckedRiderId) {
    // Uncheck the rider itself in state (ensure data is clean)
    if (customer.supplements[uncheckedRiderId]) {
        customer.supplements[uncheckedRiderId].selected = false;
        // Optional: clear other fields like stbh, program?
        // customer.supplements[uncheckedRiderId].stbh = 0;
        // customer.supplements[uncheckedRiderId].program = '';
    }

    // Find and uncheck any direct children of this rider
    Object.entries(PRODUCT_CATALOG).forEach(([childId, childConfig]) => {
        if (childConfig.type === 'rider' && childConfig.dependencies?.parentRiderRequired === uncheckedRiderId) {
            const childCheckbox = customer.container?.querySelector(`.${childId}-checkbox`);
            if (childCheckbox && childCheckbox.checked) {
                 childCheckbox.checked = false;
                 // Manually trigger change event for the child checkbox to hide its options
                 childCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                 handleRiderUncheck(customer, childId); // Recursively uncheck grandchildren
            } else if (customer.supplements[childId]?.selected) {
                 // If checkbox not found but state says selected, update state
                 customer.supplements[childId].selected = false;
            }
        }
    });
}
function renderWaiverProductsSection(policyOwner, isMainProductValid) {
    const section = document.getElementById('waiver-products-section'); // Assuming a dedicated section exists
    const container = document.getElementById('waiver-products-container');
    const ownerInfoContainer = document.getElementById('policy-owner-info'); // Container for owner details
    if (!section || !container || !ownerInfoContainer) {
        console.warn("Waiver product section or containers not found.");
        return;
    }

     // Filter for available waiver products
     const waiverProducts = Object.entries(PRODUCT_CATALOG)
         .filter(([, config]) => config.type === 'waiver_of_premium')
         .sort(([, a], [, b]) => (a.displayOrder || 99) - (b.displayOrder || 99));

     if (waiverProducts.length === 0) {
         section.classList.add('hidden'); // Hide section if no waiver products configured
         return;
     }
     section.classList.remove('hidden');

     // Enable/disable based on main product validity and owner age eligibility
     let sectionDisabled = !isMainProductValid;
     let sectionDisabledReason = !isMainProductValid ? 'Hoàn tất SP chính để chọn Miễn đóng phí.' : '';

     // Check if owner meets age eligibility for *any* waiver product
     const ownerEligibleForAnyWaiver = waiverProducts.some(([,config]) => checkEligibility(policyOwner, config.rules.eligibility));
     if (isMainProductValid && !ownerEligibleForAnyWaiver && policyOwner.age > 0) { // Only disable if age is known and ineligible
         sectionDisabled = true;
         sectionDisabledReason = `Tuổi Bên mua BH (${policyOwner.age}) không đủ điều kiện tham gia Miễn đóng phí.`;
     } else if (isMainProductValid && policyOwner.age === 0 && policyOwner.dob) { // DOB entered but invalid?
         sectionDisabled = true;
          sectionDisabledReason = `Vui lòng nhập ngày sinh hợp lệ cho Bên mua BH.`;
     }


     ownerInfoContainer.classList.toggle('opacity-50', sectionDisabled);
     ownerInfoContainer.classList.toggle('pointer-events-none', sectionDisabled);
     container.classList.toggle('opacity-50', sectionDisabled);

     // --- Render Waiver Product Checkboxes ---
     container.innerHTML = ''; // Clear previous
     const fragment = document.createDocumentFragment();

     waiverProducts.forEach(([productId, config]) => {
         const isEligible = checkEligibility(policyOwner, config.rules.eligibility);
         const isSelected = policyOwner.selectedWaivers?.[productId] || false;
         const checkboxId = `waiver-${productId}-checkbox`;

         const div = document.createElement('div');
         div.className = 'waiver-product-item flex items-center space-x-3';

         const checkbox = document.createElement('input');
         checkbox.type = 'checkbox';
         checkbox.id = checkboxId;
         checkbox.className = 'form-checkbox waiver-product-checkbox';
         checkbox.checked = isSelected;
         checkbox.disabled = sectionDisabled || !isEligible;
         checkbox.dataset.productId = productId;

         const label = document.createElement('label');
         label.setAttribute('for', checkboxId);
         label.className = 'text-lg font-medium text-gray-800 cursor-pointer';
         label.textContent = config.displayName;
         if (!isEligible && !sectionDisabled && policyOwner.age > 0) {
             label.textContent += ` (Không đủ ĐK tuổi)`;
             label.classList.add('text-gray-500');
         }

         const feeDisplay = document.createElement('div');
         feeDisplay.className = 'text-right font-semibold text-aia-red fee-display min-h-[1.5rem] flex-grow'; // Use flex-grow
          const fee = appState.fees.byPerson[policyOwner.id]?.suppDetails?.[productId] || 0;
          feeDisplay.textContent = (isSelected && fee > 0) ? `Phí: ${formatCurrency(fee)}` : '';


         div.appendChild(checkbox);
         div.appendChild(label);
         div.appendChild(feeDisplay); // Add fee display to the right
         fragment.appendChild(div);

         checkbox.addEventListener('change', (e) => {
             // Update state directly
             if (!policyOwner.selectedWaivers) policyOwner.selectedWaivers = {};
             policyOwner.selectedWaivers[productId] = e.target.checked;
             runWorkflow(); // Rerun calculations
         });
     });

     container.appendChild(fragment);

     // Display overall disable reason if applicable
      const globalMsgEl = document.getElementById('waiver-global-message'); // Assume an element exists for this
      if (globalMsgEl) {
         globalMsgEl.textContent = sectionDisabledReason;
         globalMsgEl.classList.toggle('hidden', !sectionDisabledReason);
      }
}


function updateSummaryUI(fees, isValid = true) {
    const f = fees || { baseMain: 0, extra: 0, totalSupp: 0, total: 0, byPerson: {} };
    const fmt = formatDisplayCurrency; // Use the rounding formatter

    // Determine total based on validity
    const displayTotalAnnual = isValid ? f.total : f.baseMain + f.extra;
    const displayTotalSuppAnnual = isValid ? f.totalSupp : 0;

    // Update annual totals
    document.getElementById('summary-total').textContent = fmt(displayTotalAnnual);
    document.getElementById('main-insured-main-fee').textContent = fmt(f.baseMain);
    document.getElementById('main-insured-extra-fee').textContent = fmt(f.extra);
    document.getElementById('summary-supp-fee').textContent = fmt(displayTotalSuppAnnual);


    // --- Frequency Breakdown ---
    const freqSel = document.getElementById('payment-frequency');
    const freqBox = document.getElementById('frequency-breakdown');
    const freq = freqSel ? freqSel.value : 'year';
    const periods = freq === 'half' ? 2 : (freq === 'quarter' ? 4 : 1);

    if (freqBox) freqBox.classList.toggle('hidden', periods === 1);
    if (periods === 1) {
         // Clear period values if annual
         const idsToClear = ['freq-main', 'freq-extra', 'freq-supp-total', 'freq-total-period', 'freq-total-year-equivalent', 'freq-diff'];
         idsToClear.forEach(id => { const el=document.getElementById(id); if(el) el.textContent='—'; });
         document.getElementById('freq-total-year').textContent = fmt(displayTotalAnnual); // Show annual total here
        return; // Stop if annual
    }

     // Calculate per-period fees using the helper function
     const perMain = getFeePerPeriod(f.baseMain, freq, false);
     const perExtra = getFeePerPeriod(f.extra, freq, false);

     // Calculate total supplementary fee per period
     let perSuppTotal = 0;
     const allPersonsAndOwner = [...Object.keys(f.byPerson)]; // Get all IDs including owner
     allPersonsAndOwner.forEach(personId => {
         const personDetails = f.byPerson[personId]?.suppDetails || {};
         for (const riderId in personDetails) {
              const annualRiderFee = personDetails[riderId];
              const riderConfig = PRODUCT_CATALOG[riderId];
              // MDP fee might need special handling if its base changes with frequency? Assume not for now.
              perSuppTotal += getFeePerPeriod(annualRiderFee, freq, true); // Use isRider = true
         }
     });


    const perTotal = perMain + perExtra + perSuppTotal;
    const annualEquivalent = perTotal * periods;
    const annualOriginal = displayTotalAnnual; // Use the valid annual total
    const diff = annualEquivalent - annualOriginal;

    // Update DOM elements for breakdown
    const set = (id, val)=>{ const el=document.getElementById(id); if(el) el.textContent=fmt(val); };
    set('freq-main', perMain);
    set('freq-extra', perExtra);
    set('freq-supp-total', perSuppTotal);
    set('freq-total-period', perTotal);
    set('freq-total-year', annualOriginal); // Show original annual total
    set('freq-diff', diff);
    set('freq-total-year-equivalent', annualEquivalent); // Show calculated annual equivalent
}


function updateMainProductFeeDisplay(basePremium, extraPremium) {
    const el = document.getElementById('main-product-fee-display');
    if (!el) return;
    if (basePremium <= 0 && extraPremium <= 0) {
        el.textContent = '';
        return;
    }
    const baseFormatted = formatCurrency(basePremium);
    const extraFormatted = formatCurrency(extraPremium);
    const totalFormatted = formatCurrency(basePremium + extraPremium);

    if (extraPremium > 0) {
        el.innerHTML = `Phí SP chính: ${baseFormatted} | Phí đóng thêm: ${extraFormatted} | Tổng: ${totalFormatted}`;
    } else {
        el.textContent = `Phí SP chính: ${baseFormatted}`;
    }
}

function updatePaymentFrequencyOptions(baseMainAnnual) {
    const sel = document.getElementById('payment-frequency');
    if (!sel) return;
    const optHalf = sel.querySelector('option[value="half"]');
    const optQuarter = sel.querySelector('option[value="quarter"]');

    const allowHalf = baseMainAnnual >= GLOBAL_CONFIG.paymentFrequencyThresholds.half;
    const allowQuarter = baseMainAnnual >= GLOBAL_CONFIG.paymentFrequencyThresholds.quarter;

    if (optHalf) {
        optHalf.disabled = !allowHalf;
        optHalf.classList.toggle('hidden', !allowHalf);
        optHalf.textContent = `Nửa năm (Phí >= ${formatCurrency(GLOBAL_CONFIG.paymentFrequencyThresholds.half)})`;
    }
    if (optQuarter) {
        optQuarter.disabled = !allowQuarter;
        optQuarter.classList.toggle('hidden', !allowQuarter);
         optQuarter.textContent = `Quý (Phí >= ${formatCurrency(GLOBAL_CONFIG.paymentFrequencyThresholds.quarter)})`;
    }

    // Reset selection if it becomes invalid
    if (sel.value === 'quarter' && !allowQuarter) {
        sel.value = allowHalf ? 'half' : 'year';
        runWorkflowDebounced(); // Rerun to update summary
    } else if (sel.value === 'half' && !allowHalf) {
        sel.value = 'year';
         runWorkflowDebounced(); // Rerun to update summary
    }
}


// ===================================================================================
// ===== MODULE: VALIDATION
// ===================================================================================
function runAllValidations(state) {
    clearAllErrors();
    let isOverallValid = true;
    const validationMessages = []; // Collect all error messages

    // --- Validate Main Person ---
    if (!validatePersonInputs(state.mainPerson, true, validationMessages)) isOverallValid = false;

    // --- Validate Main Product ---
    if (!validateMainProductInputs(state.mainPerson, state.mainProduct, state.fees.baseMain, validationMessages)) isOverallValid = false;
    if (!validateExtraPremium(state.fees.baseMain, state.mainProduct.extraPremium, validationMessages)) isOverallValid = false;

    // --- Validate Supplementary Persons ---
    const allInsuredPersons = [state.mainPerson, ...state.supplementaryPersons].filter(p => p);
    state.supplementaryPersons.forEach(p => {
        if (!validatePersonInputs(p, false, validationMessages)) isOverallValid = false;
    });

     // --- Validate Policy Owner ---
     if (!validatePolicyOwnerInputs(state.policyOwner, validationMessages)) isOverallValid = false;


    // --- Validate Riders for All Insured Persons ---
    // Pre-calculate aggregate values needed for validation (like Hospital Support total)
     const aggregateStbhsForValidation = calculateAggregateStbhs(allInsuredPersons);

    allInsuredPersons.forEach(person => {
        let currentTotalHospitalSupport = 0; // Track for this person's validation context

        // Iterate through riders *in a defined order* if dependencies matter for validation (e.g., Hospital Support)
        const riderIds = Object.keys(person.supplements || {}).sort((a, b) => {
            // Define sorting if needed, e.g., process HOSPITAL_SUPPORT first?
            return (PRODUCT_CATALOG[a]?.displayOrder || 99) - (PRODUCT_CATALOG[b]?.displayOrder || 99);
        });

        for (const riderId of riderIds) {
             if (person.supplements[riderId]?.selected) {
                const isValidRider = validateSupplementaryProduct(
                    person,
                    riderId,
                    state.fees.baseMain, // Main annual premium
                    aggregateStbhsForValidation, // Pass pre-calculated totals
                    currentTotalHospitalSupport, // Pass current running total for context
                    validationMessages
                );
                if (!isValidRider) isOverallValid = false;

                 // Update running total for aggregate checks *within* this person's validation loop if necessary
                 // This specific logic might be complex depending on exact rules.
                 // For Hospital Support, using the pre-calculated aggregate total is usually sufficient.
                 // if (riderId === 'HOSPITAL_SUPPORT') {
                 //     currentTotalHospitalSupport += person.supplements[riderId].stbh || 0;
                 // }
             }
        }
    });

     // --- Validate Waiver Products for Policy Owner ---
     if (!validateWaiverProducts(state.policyOwner, state.fees.mdpStbhBase, validationMessages)) isOverallValid = false;


    // --- Validate Target Age ---
    if (!validateTargetAge(state.mainPerson, state.mainProduct, validationMessages)) isOverallValid = false;


    // Display collected errors globally
    showGlobalErrors(validationMessages);

    return isOverallValid;
}


function validatePersonInputs(person, isMain, messages) {
    const container = person.container;
    if (!container) return true; // Cannot validate if container doesn't exist

    let ok = true;
    const nameInput = container.querySelector('.name-input');
    const dobInput = container.querySelector('.dob-input');
    const occupationInput = container.querySelector('.occupation-input');
    const role = isMain ? 'NĐBH Chính' : (person.id === 'policy-owner-container' ? 'Bên mua BH' : 'NĐBH Bổ sung');

    // Name
    if (nameInput && !(nameInput.value || '').trim()) {
        setFieldError(nameInput, `Vui lòng nhập họ tên ${role}`); messages.push(`Chưa nhập họ tên ${role}`); ok = false;
    } else { clearFieldError(nameInput); }

    // DOB
    if (!validateDobField(dobInput, role, messages)) ok = false;

    // Occupation (Only for Insured Persons, not Policy Owner unless required by a specific waiver rule later)
     if (!isMain && person.id !== 'policy-owner-container') {
         const group = parseInt(occupationInput?.dataset.group, 10) || 0;
         // Check if *any* selected rider requires risk group
         const requiresRiskGroup = Object.keys(person.supplements || {}).some(riderId => {
             const riderConfig = PRODUCT_CATALOG[riderId];
             return person.supplements[riderId]?.selected && riderConfig?.rules?.eligibility?.some(rule => rule.type === 'riskGroup' && rule.required);
         });

          if (occupationInput && requiresRiskGroup && (group < 1 || group > 4)) {
             setFieldError(occupationInput, `Chọn nghề nghiệp ${role} từ danh sách`); messages.push(`Chưa chọn nghề nghiệp hợp lệ cho ${role} (${person.name})`); ok = false;
         } else { clearFieldError(occupationInput); }
     } else {
         // Clear error for main person or policy owner if occupation not strictly needed
         clearFieldError(occupationInput);
     }


    return ok;
}
function validatePolicyOwnerInputs(policyOwner, messages) {
    const container = policyOwner.container;
    if (!container) return true; // Cannot validate if container doesn't exist

    let ok = true;
    const nameInput = container.querySelector('.name-input');
    const dobInput = container.querySelector('.dob-input');
    const role = 'Bên mua BH';

    // Name
    if (nameInput && !(nameInput.value || '').trim()) {
        setFieldError(nameInput, `Vui lòng nhập họ tên ${role}`); messages.push(`Chưa nhập họ tên ${role}`); ok = false;
    } else { clearFieldError(nameInput); }

    // DOB - Crucial for Waiver Eligibility Check
     if (!validateDobField(dobInput, role, messages)) {
          ok = false;
     } else {
         // Additional check: If any waiver is selected, ensure owner age is valid *for that waiver*
         let waiverSelected = false;
         let ownerEligibleForSelectedWaiver = true;
         for (const waiverId in policyOwner.selectedWaivers || {}) {
             if (policyOwner.selectedWaivers[waiverId]) {
                  waiverSelected = true;
                 const waiverConfig = PRODUCT_CATALOG[waiverId];
                 if (!checkEligibility(policyOwner, waiverConfig?.rules?.eligibility)) {
                     ownerEligibleForSelectedWaiver = false;
                     const ageRule = waiverConfig?.rules?.eligibility?.find(r => r.type === 'age');
                     const errMsg = ageRule?.message || `Tuổi ${role} (${policyOwner.age}) không đủ điều kiện tham gia ${waiverConfig?.displayName || 'Miễn đóng phí'}.`;
                     setFieldError(dobInput, errMsg);
                     messages.push(errMsg);
                     ok = false;
                     break; // Stop checking other waivers if one fails
                 }
             }
         }
         if (waiverSelected && ownerEligibleForSelectedWaiver) {
             clearFieldError(dobInput); // Clear age error if eligible for selected waiver
         } else if (!waiverSelected) {
              clearFieldError(dobInput); // Clear age error if no waiver is selected
         }
     }


    return ok;
}


function validateMainProductInputs(customer, productInfo, basePremium, messages) {
    const mainProductSelect = document.getElementById('main-product');
    const productKey = productInfo.key;

    // --- Basic Product Selection ---
    if (!productKey) {
        setFieldError(mainProductSelect, 'Vui lòng chọn sản phẩm chính'); messages.push("Chưa chọn sản phẩm chính.");
        return false;
    }
    const productConfig = PRODUCT_CATALOG[productKey];
    if (!productConfig || mainProductSelect.options[mainProductSelect.selectedIndex]?.disabled) {
        setFieldError(mainProductSelect, 'Sản phẩm không hợp lệ với tuổi/giới tính hiện tại.'); messages.push("Sản phẩm chính đã chọn không hợp lệ (có thể do đổi ngày sinh).");
        return false;
    }
    clearFieldError(mainProductSelect);

    let ok = true;
    const rules = productConfig.rules.validationRules || {};
    const { stbh, premium: enteredPremium, paymentTerm, program: programKey } = productInfo;

    // --- Program Selection (if applicable) ---
    if (productConfig.programs?.enabled) {
        const programEl = document.getElementById('main-product-program');
        if (!programKey) {
            setFieldError(programEl, rules.program?.message || 'Vui lòng chọn.'); messages.push(`Chưa chọn ${productConfig.programs.label} cho SP chính.`); ok = false;
        } else {
            // Check program eligibility again in case age changed
            const selectedProgramConfig = productConfig.programs.options.find(p => p.key === programKey);
            if (!checkEligibility(customer, selectedProgramConfig?.eligibility)) {
                setFieldError(programEl, `Lựa chọn không còn phù hợp với tuổi/giới tính.`); messages.push(`${productConfig.programs.label} đã chọn không còn phù hợp.`); ok = false;
            } else {
                 clearFieldError(programEl);
            }
        }
    }

    // --- STBH & Premium Validation ---
    const stbhEl = document.getElementById('main-stbh');
    const premiumEl = document.getElementById('main-premium'); // Only exists for 'fromInput' method

    // Handle PUL 'anyOf' logic
    if (rules.anyOf) {
        const stbhCondition = rules.anyOf.find(r => r.stbh)?.stbh;
        const premiumCondition = rules.anyOf.find(r => r.premium)?.premium;
        const stbhOk = stbhCondition ? stbh >= stbhCondition.min : true;
        // Use calculated basePremium for validation here, not enteredPremium
        const premiumOk = premiumCondition ? basePremium >= premiumCondition.min : true;

        if (!(stbhOk || premiumOk)) {
            const msg = rules.anyOfMessage || `Không đạt điều kiện STBH (${formatCurrency(stbhCondition?.min)}) hoặc Phí (${formatCurrency(premiumCondition?.min)}).`;
            setFieldError(stbhEl, msg); // Attach error to STBH field primarily
            messages.push(`SP Chính: ${msg}`);
            ok = false;
        } else {
            // Clear only the 'anyOf' error, specific min errors might still apply below
            clearFieldError(stbhEl, msg => msg === (rules.anyOfMessage || `Không đạt điều kiện STBH (${formatCurrency(stbhCondition?.min)}) hoặc Phí (${formatCurrency(premiumCondition?.min)}).`));
        }
    }

    // General STBH Min Validation
    if (rules.stbh?.min && stbh < rules.stbh.min) {
        const msg = rules.stbh.message || `STBH tối thiểu ${formatCurrency(rules.stbh.min)}`;
        setFieldError(stbhEl, msg); messages.push(`SP Chính: ${msg}`); ok = false;
    } else if (stbhEl && !rules.anyOf) { // Clear if no 'anyOf' and passes min check
         clearFieldError(stbhEl);
    } else if (stbhEl && rules.anyOf && stbh >= (rules.stbh?.min || 0)) {
         // If anyOf exists, only clear the specific min error if it passes
         clearFieldError(stbhEl, msg => msg === (rules.stbh?.message || `STBH tối thiểu ${formatCurrency(rules.stbh?.min)}`));
    }


    // Premium Validation (for calculated premiums OR entered premiums)
    const premiumToCheck = (productConfig.calculation.method === 'fromInput') ? enteredPremium : basePremium;
    const premiumFieldForError = premiumEl || stbhEl; // Attach error to premium input if exists, else STBH

    // General Premium Min Validation
    if (rules.premium?.min && premiumToCheck > 0 && premiumToCheck < rules.premium.min) {
        const msg = rules.premium.message || `Phí tối thiểu ${formatCurrency(rules.premium.min)}`;
         setFieldError(premiumFieldForError, msg); messages.push(`SP Chính: ${msg}`); ok = false;
    } else if (premiumFieldForError && !(rules.premium?.stbhFactorRef && premiumToCheck > 0)) { // Clear if not MUL or passes min
         clearFieldError(premiumFieldForError, msg => msg === (rules.premium?.message || `Phí tối thiểu ${formatCurrency(rules.premium?.min)}`));
    }

    // MUL Factor Validation (only for 'fromInput' method)
    if (productConfig.calculation.method === 'fromInput' && rules.premium?.stbhFactorRef) {
        const factorTable = product_data[rules.premium.stbhFactorRef];
        const factorRow = factorTable?.find(f => customer.age >= f.ageMin && customer.age <= f.ageMax);
        const rangeEl = document.getElementById('mul-fee-range'); // Hint element

        if (factorRow && stbh > 0) {
            const minFee = roundDownTo1000(stbh / factorRow.maxFactor);
            const maxFee = roundDownTo1000(stbh / factorRow.minFactor);
            // Update hint regardless of validation
            if (rangeEl) {
                const hintFn = rules.premium.hintFunction;
                 rangeEl.textContent = typeof hintFn === 'function' ? hintFn(stbh, customer) : `Phí gợi ý: ${formatCurrency(minFee)} - ${formatCurrency(maxFee)}.`;
            }
             // Validate entered premium against calculated range
             if (premiumToCheck <= 0) {
                  setFieldError(premiumEl, 'Vui lòng nhập phí sản phẩm chính.'); messages.push("Chưa nhập phí SP chính."); ok = false;
             } else if (premiumToCheck < minFee || premiumToCheck > maxFee) {
                const msg = rules.premium.stbhFactorMessage || 'Phí không hợp lệ so với STBH.';
                setFieldError(premiumEl, msg); messages.push(`SP Chính: ${msg}`); ok = false;
            } else if (premiumEl) {
                 clearFieldError(premiumEl, msg => msg === (rules.premium?.stbhFactorMessage || 'Phí không hợp lệ so với STBH.') || msg === 'Vui lòng nhập phí sản phẩm chính.');
            }
        } else if (stbh <= 0 && premiumToCheck <= 0 && premiumEl) {
             setFieldError(premiumEl, 'Vui lòng nhập phí sản phẩm chính.'); messages.push("Chưa nhập phí SP chính."); ok = false;
             if(rangeEl) rangeEl.textContent = rules.premium?.hint || ''; // Reset hint
        }
         else if (premiumEl) { // Clear factor error if STBH is 0 or factorRow not found
            clearFieldError(premiumEl, msg => msg === (rules.premium?.stbhFactorMessage || 'Phí không hợp lệ so với STBH.') || msg === 'Vui lòng nhập phí sản phẩm chính.');
            if(rangeEl) rangeEl.textContent = rules.premium?.hint || ''; // Reset hint
        }
    }


    // --- Payment Term Validation ---
    const termEl = document.getElementById('payment-term');
    // Only validate if payment term input exists (not for ABUV where it's a program select)
    if (termEl && rules.paymentTerm) {
        const v = parseInt(termEl.value || "0", 10);
        const termRule = rules.paymentTerm;
        const min = termRule.min || 4;
        const max = typeof termRule.maxFunction === 'function' ? termRule.maxFunction(customer.age) : (100 - customer.age);
        if (!v || v <= 0) {
            setFieldError(termEl, 'Vui lòng nhập thời gian đóng phí'); messages.push("Chưa nhập thời gian đóng phí SP chính."); ok = false;
        } else if (!(v >= min && v <= max)) {
            const msg = typeof termRule.message === 'function' ? termRule.message(min, max) : `Nhập từ ${min} đến ${max} năm`;
            setFieldError(termEl, msg); messages.push(`SP Chính: ${msg}`); ok = false;
        } else { clearFieldError(termEl); }
    }

    return ok;
}


function validateExtraPremium(basePremium, extraPremium, messages) {
    const el = document.getElementById('extra-premium');
    if (!el) return true; // No input to validate

    const productKey = appState.mainProduct.key;
    const productConfig = PRODUCT_CATALOG[productKey];
    const rules = productConfig?.rules?.validationRules?.extraPremium;

    if (!rules || extraPremium <= 0) { // No rules or no extra premium entered
        clearFieldError(el);
        return true;
    }

    const maxFactor = rules.maxFactorOfBase || 5;
    const maxAllowed = basePremium * maxFactor;

    if (basePremium > 0 && extraPremium > maxAllowed) {
        const msg = typeof rules.message === 'function' ? rules.message(maxAllowed) : `Tối đa ${maxFactor} lần phí chính (${formatCurrency(maxAllowed)})`;
        setFieldError(el, msg); messages.push(`Phí đóng thêm: ${msg}`);
        return false;
    }

    clearFieldError(el);
    return true;
}

function validateSupplementaryProduct(
    person,
    riderId,
    mainPremiumAnnual,
    aggregateStbhs, // Pre-calculated totals { RIDER_ID: totalValue }
    currentPersonAggregate, // Running total for this person (if needed)
    messages
) {
    const riderConfig = PRODUCT_CATALOG[riderId];
    if (!riderConfig) return true;

    const supplementData = person.supplements[riderId];
    if (!supplementData || !supplementData.selected) return true; // Not selected, no validation needed

    const container = person.isMain ? document.getElementById('main-supp-container') : person.container;
    const section = container?.querySelector(`.product-section-${riderId}`);
    if (!section) return true; // Section not rendered

    let ok = true;
    const rules = riderConfig.rules.validationRules || {};

    // --- Validate Program Selection (if applicable) ---
    if (riderConfig.programs?.enabled) {
        const programEl = section.querySelector(`.${riderId}-program`);
        const selectedProgram = supplementData.program;
        if (!selectedProgram) {
            setFieldError(programEl, rules.program?.message || 'Vui lòng chọn.'); messages.push(`${riderConfig.displayName} (${person.name}): Chưa chọn chương trình.`); ok = false;
        } else {
             // Check against available programs based on main premium (relevant for SCL)
             if (riderId === 'HEALTH_SCL' && !appState.uiState.availableSclPrograms.includes(selectedProgram)) {
                  setFieldError(programEl, `Chương trình không hợp lệ với phí SP chính hiện tại.`); messages.push(`${riderConfig.displayName} (${person.name}): Chương trình không hợp lệ.`); ok = false;
             } else {
                clearFieldError(programEl);
             }
        }
    }
     // --- Validate Scope Selection (if applicable, e.g., SCL) ---
      if (riderConfig.uiInputs?.scope) {
         const scopeEl = section.querySelector(`.${riderId}-scope`);
         if (!supplementData.scope) {
             setFieldError(scopeEl, rules.scope?.message || 'Vui lòng chọn.'); messages.push(`${riderConfig.displayName} (${person.name}): Chưa chọn ${riderConfig.uiInputs.scope.label}.`); ok = false;
         } else {
             clearFieldError(scopeEl);
         }
      }


    // --- Validate STBH ---
    const stbhRule = rules.stbh;
    const stbhEl = section.querySelector(`.${riderId}-stbh`);
    if (stbhRule && stbhEl) {
        const stbh = supplementData.stbh || 0;

        if (stbh <= 0) { // Require STBH if the input exists
             setFieldError(stbhEl, 'Vui lòng nhập STBH.'); messages.push(`${riderConfig.displayName} (${person.name}): Chưa nhập STBH.`); ok = false;
        } else {
            let errorFound = false;
             // Check MultipleOf
            if (stbhRule.multipleOf && stbh % stbhRule.multipleOf !== 0) {
                const msg = stbhRule.messageMultipleOf || `Phải là bội số của ${formatCurrency(stbhRule.multipleOf)}`;
                setFieldError(stbhEl, msg); messages.push(`${riderConfig.displayName} (${person.name}): ${msg}`); ok = false; errorFound = true;
            }
            // Check Min/Max
            if (stbhRule.min && stbh < stbhRule.min) {
                const msg = stbhRule.message || `Tối thiểu ${formatCurrency(stbhRule.min)}`;
                setFieldError(stbhEl, msg); messages.push(`${riderConfig.displayName} (${person.name}): ${msg}`); ok = false; errorFound = true;
            }
             if (stbhRule.max && stbh > stbhRule.max) {
                 const msg = stbhRule.message || `Tối đa ${formatCurrency(stbhRule.max)}`;
                 setFieldError(stbhEl, msg); messages.push(`${riderConfig.displayName} (${person.name}): ${msg}`); ok = false; errorFound = true;
            }

            // Check Max by Age (e.g., Hospital Support)
             if (stbhRule.maxByAge) {
                 const maxForAge = person.age < 18 ? stbhRule.maxByAge.under18 : stbhRule.maxByAge.from18;
                 if (stbh > maxForAge) {
                      const msg = `Vượt quá giới hạn ${formatCurrency(maxForAge)} cho độ tuổi ${person.age}.`;
                      setFieldError(stbhEl, msg); messages.push(`${riderConfig.displayName} (${person.name}): ${msg}`); ok = false; errorFound = true;
                 }
             }

            // Check Max based on Aggregate (e.g., Hospital Support)
             const stbhCalcConfig = riderConfig.calculation?.stbhCalculation;
             if (stbhCalcConfig?.method === 'aggregateAcrossAllInsureds' && stbhCalcConfig.config?.maxFormula) {
                 const maxTotal = stbhCalcConfig.config.maxFormula(mainPremiumAnnual); // Tổng tối đa cho phép
                 const totalSoFar = aggregateStbhs[riderId] || 0; // Tổng STBH của rider này từ *tất cả* mọi người
                 const remainingAllowedForAll = Math.max(0, maxTotal - (totalSoFar - stbh)); // Giới hạn còn lại cho *tất cả*, trừ STBH của người này ra

                 // We also need the individual max based on age
                 const maxByAge = stbhRule.maxByAge ? (person.age < 18 ? stbhRule.maxByAge.under18 : stbhRule.maxByAge.from18) : Infinity;

                 const finalMaxForThisPerson = Math.min(maxByAge, remainingAllowedForAll);


                  if (stbh > finalMaxForThisPerson) {
                     // Determine the most specific reason for the limit
                     let reason = "";
                      if (stbh > maxByAge && stbh > remainingAllowedForAll) {
                           reason = `vượt quá giới hạn ${formatCurrency(maxByAge)} cho độ tuổi ${person.age} và giới hạn còn lại ${formatCurrency(remainingAllowedForAll)} theo phí SP chính.`;
                      } else if (stbh > maxByAge) {
                          reason = `vượt quá giới hạn ${formatCurrency(maxByAge)} cho độ tuổi ${person.age}.`;
                      } else { // stbh > remainingAllowedForAll
                          reason = `vượt quá giới hạn còn lại ${formatCurrency(remainingAllowedForAll)} theo phí SP chính (Tổng tối đa: ${formatCurrency(maxTotal)}).`;
                      }
                      const msg = `STBH ${reason}`;
                      setFieldError(stbhEl, msg); messages.push(`${riderConfig.displayName} (${person.name}): ${msg}`); ok = false; errorFound = true;
                  }
             }

            // Clear error if none found specifically for STBH
            if (!errorFound) {
                 clearFieldError(stbhEl);
            }
        }
    } else if (stbhEl) {
        // Clear error if STBH input exists but no rule applies or STBH is 0/empty
        clearFieldError(stbhEl);
    }

    return ok;
}

function validateWaiverProducts(policyOwner, mdpStbhBase, messages) {
     let ok = true;
     const container = document.getElementById('waiver-products-container');
     if (!container) return true;

     for (const waiverId in policyOwner.selectedWaivers || {}) {
         const isSelected = policyOwner.selectedWaivers[waiverId];
         const checkbox = container.querySelector(`[data-product-id="${waiverId}"]`);
         const config = PRODUCT_CATALOG[waiverId];

         if (isSelected) {
             // Re-check eligibility (in case DOB changed after selection)
             if (!checkEligibility(policyOwner, config?.rules?.eligibility)) {
                  const errMsg = `Tuổi Bên mua BH (${policyOwner.age}) không đủ điều kiện tham gia ${config?.displayName || waiverId}.`;
                  // Find associated fee display or label to attach error? For now, add to global.
                  messages.push(errMsg);
                 ok = false;
                 // Optionally disable the checkbox visually
                 if(checkbox) checkbox.disabled = true; // Should already be handled by renderWaiverProductsSection
             }

             // Check if MDP Base STBH is positive (meaning there are premiums to waive)
             if (mdpStbhBase <= 0 && config?.calculation?.stbhCalculation?.method === 'sumPremiumsOfPolicy') {
                  messages.push(`${config?.displayName}: Không có phí bảo hiểm đủ điều kiện để miễn đóng.`);
                 // Consider if this is an error (ok=false) or just a warning? Usually just means fee is 0.
                 // ok = false;
                 // Visually indicate fee is 0? (Handled by renderWaiverProductsSection fee display)
             }
         }
     }
     return ok;
}


function validateTargetAge(mainPerson, mainProductInfo, messages) {
    const input = document.getElementById('target-age-input');
    if (!input) return true;

    const productKey = mainProductInfo.key;
    const productConfig = PRODUCT_CATALOG[productKey];

    // Disable and clear error if product doesn't support cash value or is traditional/package
     if (!productConfig || !productConfig.cashValueConfig?.enabled) {
         input.disabled = true;
         input.value = ''; // Clear value
         clearFieldError(input);
         // Clear related hint
         const hintEl = document.getElementById('target-age-hint');
         if(hintEl) hintEl.textContent = 'Sản phẩm này không có minh họa giá trị tài khoản.';
         return true;
     }

     input.disabled = false; // Enable if cash value exists


    const valStr = (input.value || '').trim();
    if (!valStr) {
         setFieldError(input, 'Vui lòng nhập tuổi minh họa.'); messages.push("Chưa nhập tuổi minh họa GT tài khoản.");
         return false;
    }

    const val = parseInt(valStr, 10);
    const age = mainPerson?.age || 0;
    const term = mainProductInfo.paymentTerm || 0; // Use paymentTerm from state

    if (!age || age <= 0 || !term || term <= 0) {
        clearFieldError(input); // Cannot validate without age or term
        return true; // Don't block if age/term not yet valid
    }

    const minAllowed = age + term - 1;
    const maxAllowed = 99; // Or read from config if variable

    if (isNaN(val) || val < minAllowed || val > maxAllowed) {
        const msg = `Tuổi minh họa phải từ ${minAllowed} đến ${maxAllowed}`;
        setFieldError(input, msg); messages.push(msg);
        return false;
    }

    clearFieldError(input);
    return true;
}


function validateDobField(input, role, messages) {
    if (!input) return false;
    const v = (input.value || '').trim();
    if (!v) {
         setFieldError(input, `Vui lòng nhập ngày sinh ${role}`); messages.push(`Chưa nhập ngày sinh ${role}`); return false;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
        setFieldError(input, 'Nhập định dạng DD/MM/YYYY'); messages.push(`Ngày sinh ${role} sai định dạng.`); return false;
    }
    const [dd, mm, yyyy] = v.split('/').map(n => parseInt(n, 10));
    const d = new Date(yyyy, mm - 1, dd);
    const today = GLOBAL_CONFIG.REFERENCE_DATE; // Use reference date

    if (isNaN(d.getTime()) || d.getFullYear() !== yyyy || d.getMonth() !== (mm - 1) || d.getDate() !== dd) {
         setFieldError(input, 'Ngày không hợp lệ (tháng/ngày sai)'); messages.push(`Ngày sinh ${role} không hợp lệ.`); return false;
    }
    if (d > today) {
         setFieldError(input, 'Ngày sinh không được ở tương lai'); messages.push(`Ngày sinh ${role} không hợp lệ.`); return false;
    }
    // Optional: Add a minimum age check if necessary (e.g., must be born after 1900)
    if (yyyy < 1900) {
         setFieldError(input, 'Năm sinh không hợp lệ'); messages.push(`Ngày sinh ${role} không hợp lệ.`); return false;
    }


    clearFieldError(input);
    return true;
}

function setFieldError(input, message) {
    if (!input) return;
    // Find the dedicated error element using data-for attribute
    const errorElementId = input.id;
    let err = input.parentElement.querySelector(`.field-error[data-for="${errorElementId}"]`);
     // Fallback to finding any .field-error sibling if specific one not found
     if (!err) {
         err = input.parentElement.querySelector('.field-error');
     }
     // Create if still not found
    if (!err) {
        err = document.createElement('div'); // Use div for better block layout
        err.className = 'field-error text-sm text-red-600 mt-1';
         err.dataset.for = errorElementId; // Associate with input
         // Insert after the input or its hint
         const hint = input.parentElement.querySelector('.text-sm.text-gray-500');
        input.parentElement.insertBefore(err, (hint || input).nextSibling);
    }
    err.textContent = message || '';
    err.classList.toggle('hidden', !message); // Hide if no message
    input.classList.toggle('border-red-500', !!message);
}

// Overload clearFieldError to accept an optional check function
function clearFieldError(input, conditionFn = null) {
    if (!input) return;
    const errorElementId = input.id;
    let err = input.parentElement.querySelector(`.field-error[data-for="${errorElementId}"]`);
     if (!err) {
         err = input.parentElement.querySelector('.field-error');
     }

     if (err) {
         const currentMessage = err.textContent || '';
         // Clear only if condition matches or no condition provided
         if (currentMessage && (!conditionFn || conditionFn(currentMessage))) {
             err.textContent = '';
             err.classList.add('hidden'); // Hide element
             // Remove red border only if this was the *only* error message for the field
             // This part is tricky if multiple errors could apply. A simpler approach:
             input.classList.remove('border-red-500');
             // A more robust approach would count active errors for the input.
         }
     } else {
         // Ensure border is clear if no error element exists
         input.classList.remove('border-red-500');
     }
}


function clearAllErrors() {
    document.querySelectorAll('.field-error').forEach(el => {
        el.textContent = '';
        el.classList.add('hidden'); // Hide all error messages
    });
    document.querySelectorAll('.border-red-500').forEach(el => el.classList.remove('border-red-500'));
    hideGlobalErrors(); // Hide the global error box
}

function checkEligibility(person, eligibilityRules) {
    if (!eligibilityRules || eligibilityRules.length === 0) return true; // No rules means eligible
    if (!person) return false; // Cannot check eligibility without person data

    for (const rule of eligibilityRules) {
        // Skip conditional rules if condition not met
        if (rule.condition && typeof rule.condition === 'function' && !rule.condition(person)) {
             continue;
        }

        switch (rule.type) {
            case 'daysFromBirth':
                if (person.daysFromBirth < rule.min) return false;
                break;
            case 'age':
                if ((rule.min != null && person.age < rule.min) || (rule.max != null && person.age > rule.max)) return false;
                break;
            case 'riskGroup':
                const group = person.riskGroup || 0;
                if (rule.exclude && group > 0 && rule.exclude.includes(group)) return false;
                if (rule.required && group === 0) return false; // Requires a valid group (1-4)
                break;
            // Add other rule types if needed (e.g., gender)
            case 'gender':
                 if (rule.allowed && !rule.allowed.includes(person.gender)) return false;
                 break;
        }
    }
    return true; // Passed all applicable rules
}

// ===================================================================================
// ===== MODULE: INITIALIZATION & EVENT BINDING
// ===================================================================================

document.addEventListener('DOMContentLoaded', () => {
    initState();
    initMainProductSelect();
    initPersonUI(appState.mainPerson.container, true); // Init UI for main person
    initPersonUI(appState.policyOwner.container, false, true); // Init UI for policy owner
    initSupplementaryButton();
    // initSummaryModal(); // Assuming this is for the old modal, might remove or adapt
    attachGlobalListeners();
    updateSupplementaryAddButtonState(false); // Initial state
    runWorkflow(); // Initial calculation and render
    initViewerModal(); // Initialize the detailed viewer modal
});

function runWorkflow() {
    updateStateFromUI();
    // Perform calculations FIRST to get basePremium needed for some validations
    appState.fees = performCalculations(appState);
    // THEN run validations using the calculated fees
    const isValid = runAllValidations(appState);
    // FINALLY render the UI with validation status and calculated fees
    renderUI(isValid);
    // Update supplementary list in summary box
    try { renderSuppList(); } catch(e) { console.warn("Failed to render supp list", e);}
}

const runWorkflowDebounced = debounce(runWorkflow, 60); // Slightly longer debounce

function initMainProductSelect() {
    const select = document.getElementById('main-product');
    // Sort products by displayOrder, then alphabetically
    const sortedProducts = Object.entries(PRODUCT_CATALOG)
        .filter(([, config]) => config.type === 'main')
        .sort(([, a], [, b]) => {
            const orderA = a.displayOrder || 99;
            const orderB = b.displayOrder || 99;
            if (orderA !== orderB) return orderA - orderB;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

    sortedProducts.forEach(([key, config]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = config.displayName; // Use displayName
        select.appendChild(option);
    });
}

function attachGlobalListeners() {
    document.body.addEventListener('change', (e) => {
        const target = e.target;
        // Optimization: Debounce only for inputs that trigger recalculations frequently
        const needsDebounce = target.matches('input[type="text"], input[type="number"], select:not(#main-product)');

        // Handle specific immediate actions
        if (target.id === 'main-product') {
            lastRenderedMainProductKey = null; // Force re-render of options
            // Reset program/term/etc. when main product changes
            appState.mainProduct.program = '';
            appState.mainProduct.paymentTerm = 0; // Reset term input if it exists
             appState.mainProduct.stbh = 0; // Optional: Reset STBH?
             appState.mainProduct.premium = 0; // Optional: Reset Premium?
             appState.mainProduct.extraPremium = 0; // Optional: Reset Extra?

             // Clear dependent states if main product changes significantly
              const productConfig = PRODUCT_CATALOG[target.value];
              if (productConfig?.rules?.noSupplementaryInsured) {
                  // Clear supplementary persons and their supplements
                  appState.supplementaryPersons = [];
                  document.getElementById('supplementary-insured-container').innerHTML = '';
                  // Also clear supplements for the main person
                  if (appState.mainPerson) appState.mainPerson.supplements = {};
                  const mainSuppContainer = document.querySelector('#main-supp-container .supplementary-products-container');
                  if (mainSuppContainer) mainSuppContainer.innerHTML = ''; // Clear rendered riders
                   // Reset MDP/Waiver selections
                   if (appState.policyOwner) appState.policyOwner.selectedWaivers = {};
                   const waiverContainer = document.getElementById('waiver-products-container');
                   if (waiverContainer) waiverContainer.innerHTML = ''; // Clear rendered waivers
              }
             runWorkflow(); // Run immediately for main product change
        } else if (target.id === 'main-product-program') {
             runWorkflow(); // Run immediately for program change
        } else if (target.id === 'payment-frequency') {
             runWorkflow(); // Update summary immediately on frequency change
        }
         else if (target.matches('.rider-checkbox, .waiver-product-checkbox')) {
              runWorkflow(); // Run immediately when adding/removing riders/waivers
         }
        else if (needsDebounce) {
            runWorkflowDebounced();
        } else {
             // For other changes that might not require immediate full recalc?
             // runWorkflowDebounced(); // Or run immediately if unsure
        }

         // Update target age input state/value after any change that might affect it
         updateTargetAge();
    });

    document.body.addEventListener('input', (e) => {
        const target = e.target;
        if (target.matches('input[type="text"]') && !target.classList.contains('dob-input') && !target.classList.contains('name-input') && !target.classList.contains('occupation-input')) {
            formatNumberInput(target); // Format number inputs as typing
             runWorkflowDebounced(); // Trigger recalculation while typing numbers
        } else if (target.matches('input[type="number"]')) {
             runWorkflowDebounced(); // Trigger recalculation while typing numbers
        }
    });

    document.body.addEventListener('focusout', (e) => {
        const target = e.target;
        if (target.matches('input[type="text"]')) {
             // Find associated rider config if it's a rider STBH input
             const riderId = target.dataset.riderId;
             const riderConfig = riderId ? PRODUCT_CATALOG[riderId] : null;
             const multipleOf = riderConfig?.rules?.validationRules?.stbh?.multipleOf;

            roundInputToThousand(target, multipleOf); // Round number inputs on blur
            if (target.classList.contains('dob-input')) {
                 validateDobField(target, target.closest('.person-container')?.id.includes('policy-owner') ? 'Bên mua BH' : 'NĐBH', []); // Validate DOB on blur, don't collect message here
            }
            runWorkflow(); // Run full workflow immediately after rounding/validation check
        } else if (target.matches('input[type="number"]')) {
             // Validate number ranges (like payment term) on blur? runWorkflow handles validation.
             runWorkflow();
        }
    }, true); // Use capture phase to ensure it runs before potential blur events triggering runWorkflowDebounced
}

function initPersonUI(container, isMain = false, isPolicyOwner = false) {
    if (!container) return;
    initDateFormatter(container.querySelector('.dob-input'));
    // Only init occupation for non-policy owners
    if (!isPolicyOwner) {
         initOccupationAutocomplete(container.querySelector('.occupation-input'), container);
    }
}


function initSupplementaryButton() {
    document.getElementById('add-supp-insured-btn').addEventListener('click', () => {
        if (appState.supplementaryPersons.length >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) return;

        const count = appState.supplementaryPersons.length + 1;
        const personId = `supp-${Date.now()}`; // Unique ID

        const newPersonDiv = document.createElement('div');
        newPersonDiv.id = personId; // Use unique ID for the container
        newPersonDiv.className = 'person-container space-y-6 bg-gray-100 p-4 rounded-lg mt-4';
        newPersonDiv.innerHTML = generateSupplementaryPersonHtml(personId, count);

        document.getElementById('supplementary-insured-container').appendChild(newPersonDiv);

        // Add remove listener
        newPersonDiv.querySelector('.remove-supp-btn').addEventListener('click', () => {
            newPersonDiv.remove();
            // Remove from state
            appState.supplementaryPersons = appState.supplementaryPersons.filter(p => p.id !== personId);
            runWorkflow(); // Rerun calculations and validations
        });

        // Initialize UI elements (date formatter, occupation)
        initPersonUI(newPersonDiv, false);

         // Add to state (initially empty supplements)
         const newPersonState = {
             id: personId,
             container: newPersonDiv,
             isMain: false,
             name: '', dob: '', age: 0, daysFromBirth: 0, gender: 'Nam', riskGroup: 0, supplements: {}
         };
         appState.supplementaryPersons.push(newPersonState);


        runWorkflow(); // Rerun calculations and validations
    });
}
function generateSupplementaryPersonHtml(personId, count) {
    // Generate unique IDs for inputs using personId
    return `
      <button type="button" class="w-full text-right text-sm text-red-600 font-semibold remove-supp-btn">Xóa NĐBH này</button>
      <h3 class="text-lg font-bold text-gray-700 mb-2 border-t pt-4">NĐBH Bổ Sung ${count}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label for="name-${personId}" class="font-medium text-gray-700 block mb-1">Họ và Tên</label>
          <input type="text" id="name-${personId}" class="form-input name-input" placeholder="Trần Thị B">
          <div class="field-error text-sm text-red-600 mt-1" data-for="name-${personId}"></div>
        </div>
        <div>
          <label for="dob-${personId}" class="font-medium text-gray-700 block mb-1">Ngày sinh</label>
          <input type="text" id="dob-${personId}" class="form-input dob-input" placeholder="DD/MM/YYYY">
           <div class="field-error text-sm text-red-600 mt-1" data-for="dob-${personId}"></div>
        </div>
        <div>
          <label for="gender-${personId}" class="font-medium text-gray-700 block mb-1">Giới tính</label>
          <select id="gender-${personId}" class="form-select gender-select">
            <option value="Nam">Nam</option>
            <option value="Nữ">Nữ</option>
          </select>
        </div>
        <div class="flex items-end space-x-4">
          <p class="text-lg">Tuổi: <span class="font-bold text-aia-red age-span">0</span></p>
        </div>
        <div class="relative">
          <label for="occupation-${personId}" class="font-medium text-gray-700 block mb-1">Nghề nghiệp</label>
          <input type="text" id="occupation-${personId}" class="form-input occupation-input" placeholder="Gõ để tìm nghề nghiệp...">
          <div class="occupation-autocomplete absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 hidden max-h-60 overflow-y-auto"></div>
           <div class="field-error text-sm text-red-600 mt-1" data-for="occupation-${personId}"></div>
        </div>
        <div class="flex items-end space-x-4">
          <p class="text-lg">Nhóm nghề: <span class="font-bold text-aia-red risk-group-span">...</span></p>
        </div>
      </div>
      <div class="mt-4">
        <h4 class="text-md font-semibold text-gray-800 mb-2">Sản phẩm bổ sung cho người này</h4>
        <div class="supplementary-products-container space-y-6">
             <p class="text-sm text-gray-500 italic">Chọn và cấu hình sản phẩm chính hợp lệ để hiển thị SP bổ sung.</p>
        </div>
      </div>
    `;
}


function updateSupplementaryAddButtonState(isMainProductValid) {
    const btn = document.getElementById('add-supp-insured-btn');
    if (!btn) return;
    const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];
    const noSuppInsured = mainProductConfig?.rules?.noSupplementaryInsured || false;
    const count = appState.supplementaryPersons.length; // Count from state

    const disabled = noSuppInsured || (count >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) || !isMainProductValid;
    btn.disabled = disabled;
    btn.classList.toggle('opacity-50', disabled);
    btn.classList.toggle('cursor-not-allowed', disabled);

     // Update button text based on reason
     if (noSuppInsured) {
        btn.querySelector('span').textContent = 'Sản phẩm chính này không cho phép NĐBH bổ sung';
     } else if (count >= GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED) {
         btn.querySelector('span').textContent = `Đã đạt tối đa ${GLOBAL_CONFIG.MAX_SUPPLEMENTARY_INSURED} NĐBH bổ sung`;
     } else if (!isMainProductValid) {
         btn.querySelector('span').textContent = 'Hoàn tất SP chính để thêm NĐBH bổ sung';
     } else {
         btn.querySelector('span').textContent = '+ Thêm Người Được Bảo Hiểm Bổ Sung';
     }
}

// NOTE: generateSupplementaryProductsHtml is now handled within renderSupplementaryProductsForPerson


function initOccupationAutocomplete(input, container) {
    if (!input || !container) return;
    const autocompleteContainer = container.querySelector('.occupation-autocomplete');
    const riskGroupSpan = container.querySelector('.risk-group-span');
    const personId = container.id; // Get person's unique ID

    if (!autocompleteContainer || !riskGroupSpan) return;


    const applyOccupation = (occ) => {
        input.value = occ.name;
        input.dataset.group = occ.group; // Store group in dataset
        riskGroupSpan.textContent = occ.group;
        clearFieldError(input);
        autocompleteContainer.classList.add('hidden');

        // Update state directly for this person
         const personState = appState.supplementaryPersons.find(p => p.id === personId) || (personId === appState.mainPerson.id ? appState.mainPerson : null);
         if (personState) {
            personState.riskGroup = occ.group;
         }

        runWorkflow(); // Rerun validation/calculation
    };

    const renderList = (filtered) => {
        autocompleteContainer.innerHTML = '';
        if (filtered.length === 0) {
            autocompleteContainer.innerHTML = '<div class="p-2 text-gray-500">Không tìm thấy nghề nghiệp.</div>';
            autocompleteContainer.classList.remove('hidden');
            return;
        }
        filtered.slice(0, 50).forEach(occ => { // Limit results for performance
            const item = document.createElement('div');
            item.className = 'p-2 hover:bg-gray-100 cursor-pointer text-sm';
            item.textContent = `${occ.name} (Nhóm ${occ.group})`;
            item.addEventListener('mousedown', (ev) => { // Use mousedown to capture before blur
                ev.preventDefault();
                applyOccupation(occ);
            });
            autocompleteContainer.appendChild(item);
        });
        autocompleteContainer.classList.remove('hidden');
    };

    input.addEventListener('input', debounce(() => { // Debounce input handler
        const value = input.value.trim().toLowerCase();
         // Clear group immediately if input changes
         input.dataset.group = '';
         riskGroupSpan.textContent = '...';
        if (value.length < 2) {
            autocompleteContainer.classList.add('hidden');
            return;
        }
        const filtered = product_data.occupations
            .filter(o => o.group > 0 && o.name.toLowerCase().includes(value));
        renderList(filtered);
    }, 200)); // Debounce time

    input.addEventListener('blur', () => {
        // Use setTimeout to allow click on autocomplete item to register
        setTimeout(() => {
            autocompleteContainer.classList.add('hidden');
             // Check if the current value exactly matches an occupation
             const typed = (input.value || '').trim().toLowerCase();
             const match = product_data.occupations.find(o => o.group > 0 && o.name.toLowerCase() === typed);
             const personState = appState.supplementaryPersons.find(p => p.id === personId) || (personId === appState.mainPerson.id ? appState.mainPerson : null);

             if (!match) {
                 input.dataset.group = ''; // Clear group if no exact match
                 riskGroupSpan.textContent = '...';
                 if (personState) personState.riskGroup = 0;
                  // If occupation is required (check if any selected rider needs it) and no match, show error
                  const requiresRiskGroup = personState && Object.keys(personState.supplements || {}).some(riderId => {
                     const riderConfig = PRODUCT_CATALOG[riderId];
                     return personState.supplements[riderId]?.selected && riderConfig?.rules?.eligibility?.some(rule => rule.type === 'riskGroup' && rule.required);
                 });
                  if (requiresRiskGroup && typed.length > 0) {
                     setFieldError(input, 'Chọn nghề nghiệp từ danh sách gợi ý.');
                  } else {
                     clearFieldError(input);
                  }

             } else {
                 // Already matched and applied via mousedown, or ensure state is correct
                 if (personState && personState.riskGroup !== match.group) {
                     personState.riskGroup = match.group;
                 }
                  clearFieldError(input); // Clear error if matched
             }

             // Rerun workflow to apply validation based on potentially cleared risk group
             runWorkflow();
        }, 150); // Delay slightly less than input debounce
    });

     input.addEventListener('focus', () => {
         // Optionally show suggestions again on focus if input has value
         const value = input.value.trim().toLowerCase();
         if (value.length >= 2) {
             const filtered = product_data.occupations
                 .filter(o => o.group > 0 && o.name.toLowerCase().includes(value));
             renderList(filtered);
         }
     });

    // Hide autocomplete if clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            autocompleteContainer.classList.add('hidden');
        }
    });
}

function initDateFormatter(input) {
    if (!input) return;
    input.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
        let formattedValue = '';
        if (value.length > 0) {
            formattedValue += value.substring(0, 2);
        }
        if (value.length > 2) {
            formattedValue += '/' + value.substring(2, 4);
        }
        if (value.length > 4) {
            formattedValue += '/' + value.substring(4, 8);
        }
        e.target.value = formattedValue;
    });
     // Add placeholder specifically for date format
     input.placeholder = 'DD/MM/YYYY';
}


function roundInputToThousand(input, multipleOf = 1000) {
    if (!input || input.classList.contains('dob-input') || input.classList.contains('occupation-input') || input.classList.contains('name-input')) return;

    const rawValue = parseFormattedNumber(input.value || ''); // Use the improved parser
    if (!rawValue || rawValue === 0) {
        input.value = ''; // Clear if zero or invalid
        return;
    }

    // Use the specified multiple, default to 1000
    const effectiveMultiple = multipleOf || 1000;
    let roundedValue;

    if (effectiveMultiple === 1000) {
         roundedValue = roundDownTo1000(rawValue); // Use roundDown specifically for 1000 multiple
    } else {
        roundedValue = Math.round(rawValue / effectiveMultiple) * effectiveMultiple; // Round to nearest multiple otherwise
    }


    input.value = formatCurrency(roundedValue); // Format the rounded value back
}

function formatNumberInput(input) {
    if (!input || !input.value) return;
    const selectionStart = input.selectionStart;
    const selectionEnd = input.selectionEnd;
    const originalLength = input.value.length;

    let value = input.value.replace(/\D/g, ''); // Remove non-digits
    if (value.length === 0) {
        input.value = '';
        return;
    }

    // Avoid formatting if it's just '0'
    if (value === '0') {
         input.value = '0';
         input.setSelectionRange(1, 1);
         return;
    }

    // Remove leading zeros
    value = value.replace(/^0+/, '');
     if (value.length === 0) {
        input.value = '';
        return;
    }


    const numberValue = parseInt(value, 10);
    if (!isNaN(numberValue)) {
        const formattedValue = numberValue.toLocaleString('vi-VN');
        input.value = formattedValue;

        // Adjust cursor position
        const newLength = formattedValue.length;
        const lengthDiff = newLength - originalLength;
        const newCursorPos = (selectionStart || 0) + lengthDiff;
        // Ensure cursor doesn't go beyond new length or become negative
        const finalCursorPos = Math.max(0, Math.min(newLength, newCursorPos));
        // Use try-catch for browsers that might not support setSelectionRange on number inputs being formatted
         try {
              input.setSelectionRange(finalCursorPos, finalCursorPos);
         } catch(e) {
             // Ignore error, cursor position might be slightly off
         }
    } else {
        // Should not happen if non-digits are removed, but as a fallback:
        // input.value = ''; // Or keep original invalid input?
    }
}


function updateTargetAge() {
    const mainPersonInfo = appState.mainPerson; // Get from state
    const mainProductKey = appState.mainProduct.key;
    const productConfig = PRODUCT_CATALOG[mainProductKey];
    const targetAgeInput = document.getElementById('target-age-input');
    const targetAgeBlock = document.getElementById('target-age-block'); // The whole section
    const hintEl = document.getElementById('target-age-hint');


     if (!targetAgeBlock) return; // Exit if the whole block isn't there

     // Hide block if no main product or product doesn't have cash value
     if (!productConfig || !productConfig.cashValueConfig?.enabled) {
         targetAgeBlock.classList.add('hidden');
          if (targetAgeInput) targetAgeInput.disabled = true;
         return;
     }
     targetAgeBlock.classList.remove('hidden'); // Show block

     if (!targetAgeInput || !mainPersonInfo || !mainPersonInfo.age || mainPersonInfo.age <= 0) {
         if (targetAgeInput) targetAgeInput.disabled = true;
         if (hintEl) hintEl.textContent = 'Nhập ngày sinh NĐBH chính hợp lệ.';
         return;
     };

    targetAgeInput.disabled = false;
    const paymentTerm = appState.mainProduct.paymentTerm; // Get term from state

    if (!paymentTerm || paymentTerm <= 0) {
        targetAgeInput.disabled = true; // Disable if term is missing
        if (hintEl) hintEl.textContent = 'Nhập thời gian đóng phí SP chính hợp lệ.';
        return;
    }

    // Calculate valid range
    const minAge = mainPersonInfo.age + paymentTerm - 1;
    const maxAge = 99; // Or from config if needed
    targetAgeInput.min = String(minAge);
    targetAgeInput.max = String(maxAge);

    // Set default value (99) or keep current if valid
    const curValStr = targetAgeInput.value || '';
    const curVal = parseInt(curValStr, 10);
     if (isNaN(curVal) || curVal < minAge || curVal > maxAge) {
         targetAgeInput.value = maxAge; // Default to max allowed age
     }
     // If current value is exactly 0 or empty string, set default
     else if (!curValStr) {
          targetAgeInput.value = maxAge;
     }

    // Update hint
    if (hintEl) {
        hintEl.innerHTML = `Minh họa giá trị tài khoản. Khoảng hợp lệ: <strong>${minAge}</strong> – <strong>${maxAge}</strong>.`;
    }
     // Clear any previous validation errors for target age if it's now valid/disabled
     clearFieldError(targetAgeInput);
}

function attachTermListenersForTargetAge() {
    // Only payment-term input affects target age now
    const paymentTermInput = document.getElementById('payment-term');
    if (paymentTermInput && !paymentTermInput._boundTargetAge) {
        // Use 'input' for faster updates while typing, 'change' as fallback
        paymentTermInput.addEventListener('input', updateTargetAge);
        paymentTermInput.addEventListener('change', updateTargetAge);
        paymentTermInput._boundTargetAge = true;
    }
}
// Attach formatters to dynamically added inputs
function attachInputFormatters(container) {
    if (!container) return;
    container.querySelectorAll('input[type="text"]').forEach(input => {
        // Avoid re-attaching listeners if already done
        if (input._formatterAttached) return;

         if (!input.classList.contains('dob-input') && !input.classList.contains('name-input') && !input.classList.contains('occupation-input')) {
            // Number formatting for STBH, Premium, Extra Premium
            input.addEventListener('input', (e) => formatNumberInput(e.target));
             input.addEventListener('focusout', (e) => {
                 const riderId = e.target.dataset.riderId;
                 const riderConfig = riderId ? PRODUCT_CATALOG[riderId] : null;
                 const multipleOf = riderConfig?.rules?.validationRules?.stbh?.multipleOf;
                 roundInputToThousand(e.target, multipleOf);
             });
             input._formatterAttached = true;
         } else if (input.classList.contains('dob-input')) {
              initDateFormatter(input); // Ensure date format is applied
              input._formatterAttached = true;
         }
    });
}


// Global Error Display
function showGlobalErrors(errors) {
    const box = document.getElementById('global-error-box');
    if (!box) return;
    // Deduplicate errors
    const uniqueErrors = [...new Set(errors)];
    if (uniqueErrors.length === 0) {
        hideGlobalErrors();
        return;
    }
    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="border border-red-300 bg-red-50 text-red-700 rounded p-3 text-sm">
        <div class="font-medium mb-1">Vui lòng sửa các lỗi sau:</div>
        <ul class="list-disc list-inside space-y-1">
          ${uniqueErrors.map(e => `<li>${sanitizeHtml(e)}</li>`).join('')}
        </ul>
      </div>
    `;
    // Optionally scroll to errors
    // box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function hideGlobalErrors() {
    const box = document.getElementById('global-error-box');
    if (box) {
        box.classList.add('hidden');
        box.innerHTML = '';
    }
}

// Update Supplementary List in Summary Box
function renderSuppList() {
    const box = document.getElementById('supp-insured-summaries');
    if (!box) return;

    const feesMap = window.personFees || {}; // Use the globally stored detailed fees
    let rowsHtml = '';

    // Get all persons including owner, sort by main, then supplementary, then owner
     const personOrder = [
         appState.mainPerson?.id,
         ...appState.supplementaryPersons.map(p => p.id),
         appState.policyOwner?.id
     ].filter(id => id && feesMap[id]); // Only include persons with fee data


    personOrder.forEach(personId => {
        const feeInfo = feesMap[personId];
        if (!feeInfo || (feeInfo.supp <= 0 && feeInfo.main <= 0)) return; // Skip if no fee

        const personState = personId === appState.mainPerson?.id ? appState.mainPerson :
                           (personId === appState.policyOwner?.id ? appState.policyOwner :
                           appState.supplementaryPersons.find(p => p.id === personId));

        const name = personState?.name || (personId === 'policy-owner-container' ? 'Bên mua BH' : `Người ${personId}`);
         const totalFee = feeInfo.total || 0;
         const suppFee = feeInfo.supp || 0;
         const mainFee = feeInfo.main || 0;

         // Display total fee for the person, maybe break down main vs supp if needed
         if (totalFee > 0) {
             let feeBreakdown = '';
             if (mainFee > 0 && suppFee > 0) {
                 feeBreakdown = ` (Chính: ${formatDisplayCurrency(mainFee)}, BS: ${formatDisplayCurrency(suppFee)})`;
             } else if (mainFee > 0) {
                 feeBreakdown = ` (Phí chính)`;
             } else if (suppFee > 0) {
                  // Check if it's only waiver fee for the owner
                  if (personId === appState.policyOwner?.id && Object.keys(personState?.selectedWaivers || {}).length > 0) {
                      feeBreakdown = ` (Miễn đóng phí)`;
                  } else {
                       feeBreakdown = ` (Phí BS)`;
                  }
             }

             rowsHtml += `<div class="flex justify-between text-sm py-1 border-b border-gray-100 last:border-b-0">
                          <span class="truncate pr-2">${sanitizeHtml(name)}</span>
                          <span class="font-medium whitespace-nowrap">${formatDisplayCurrency(totalFee)}${feeBreakdown}</span>
                        </div>`;
         }
    });


    box.innerHTML = rowsHtml || '<p class="text-sm text-gray-500 italic">Chưa có phí sản phẩm bổ sung.</p>';
}

// Toggle Supplementary List Visibility
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('toggle-supp-list-btn');
    if (btn && !btn._bound) {
        btn.addEventListener('click', () => {
            const list = document.getElementById('supp-insured-summaries');
            if (!list) return;
            const isHidden = list.classList.toggle('hidden');
            btn.textContent = isHidden ? 'Xem chi tiết phí từng người' : 'Ẩn chi tiết phí';
            if (!isHidden) renderSuppList(); // Render only when showing
        });
        btn._bound = true;
    }
     // Initialize the list as hidden
     const initialList = document.getElementById('supp-insured-summaries');
     if(initialList) initialList.classList.add('hidden');
     if(btn) btn.textContent = 'Xem chi tiết phí từng người';
});


// ===================================================================================
// ===== MODULE: VIEWER PAYLOAD & MODAL (ADAPTED FROM V1/REFACTORED)
// ===================================================================================

function buildViewerPayload() {
    // --- Basic Info ---
    const mainKey = appState.mainProduct.key;
    const mainConfig = PRODUCT_CATALOG[mainKey];
    const mainPerson = appState.mainPerson || {};
    const policyOwner = appState.policyOwner || {};

    // --- Determine Final Payment Term ---
    let paymentTermFinal = 0;
    if (mainConfig?.calculation.method === 'package') {
        const underlyingConfig = PRODUCT_CATALOG[mainConfig.packageConfig.underlyingMainProduct];
        const fixedProgramKey = mainConfig.packageConfig.fixedValues.program;
        const fixedProgram = underlyingConfig?.programs?.options.find(p => p.key === fixedProgramKey);
        paymentTermFinal = fixedProgram?.defaultPaymentTerm || 0;
    } else if (mainConfig?.programs?.enabled) {
         const selectedProgramKey = appState.mainProduct.program;
         const selectedProgram = mainConfig.programs.options.find(p => p.key === selectedProgramKey);
          // Term for ABUV is the program key itself (as number)
          if (mainKey === 'AN_BINH_UU_VIET') {
             paymentTermFinal = parseInt(selectedProgramKey, 10) || 0;
          } else {
             // For PUL, term is entered separately but might have a default from program
             paymentTermFinal = appState.mainProduct.paymentTerm || selectedProgram?.defaultPaymentTerm || 0;
          }
    } else {
        paymentTermFinal = appState.mainProduct.paymentTerm || 0;
    }


    // --- Collect Rider List ---
    const riderList = [];
    const allInsured = [appState.mainPerson, ...appState.supplementaryPersons].filter(p => p);

    allInsured.forEach(person => {
        Object.keys(person.supplements || {}).forEach(riderId => {
             const suppData = person.supplements[riderId];
             const riderConfig = PRODUCT_CATALOG[riderId];
             const premiumDetail = appState.fees.byPerson[person.id]?.suppDetails?.[riderId] || 0;

             if (suppData?.selected && premiumDetail > 0 && riderConfig?.type === 'rider') { // Only include selected, paid riders (not waivers here)
                // Check if this specific rider instance (considering program/stbh/person) is already added
                const existingEntry = riderList.find(r =>
                     r.id === riderId &&
                     r.program === suppData.program && // Group by program if applicable
                     r.stbh === suppData.stbh &&       // Group by STBH if applicable
                     r.scope === suppData.scope       // Group by scope if applicable (SCL)
                     // Add other differentiating factors if needed
                 );

                 if (existingEntry) {
                     existingEntry.persons.push(person.name || `NĐBH ${person.id}`);
                     existingEntry.totalPremium += premiumDetail;
                 } else {
                     let stbhForDisplay = suppData.stbh || 0;
                     if (riderId === 'HEALTH_SCL' || riderId === 'OUTPATIENT_SCL' || riderId === 'DENTAL_SCL') {
                         const programInfo = riderConfig.programs?.options.find(p => p.key === suppData.program);
                          // STBH for SCL comes from program config, not direct input
                          stbhForDisplay = programInfo?.stbh || BM_SCL_PROGRAMS[suppData.program]?.core || 0;
                     }

                     riderList.push({
                         id: riderId,
                         slug: riderConfig?.viewerSlug,
                         displayName: riderConfig?.displayName || riderId,
                         selected: true,
                         stbh: stbhForDisplay, // STBH relevant for this configuration
                         program: suppData.program,
                         scope: suppData.scope, // Include scope if present
                         // Add flags for SCL sub-riders if needed by viewer
                         isOutpatient: riderId === 'OUTPATIENT_SCL',
                         isDental: riderId === 'DENTAL_SCL',
                         totalPremium: premiumDetail, // Sum premium for this config across people
                         persons: [person.name || `NĐBH ${person.id}`] // List of people with this config
                     });
                 }
            }
        });
    });

    // --- Collect Waiver Info ---
    let waiverInfo = null;
    Object.keys(policyOwner.selectedWaivers || {}).forEach(waiverId => {
         if (policyOwner.selectedWaivers[waiverId]) {
             const waiverConfig = PRODUCT_CATALOG[waiverId];
             const premium = appState.fees.byPerson[policyOwner.id]?.suppDetails?.[waiverId] || 0;
             if (premium > 0 && waiverConfig) {
                  waiverInfo = {
                     id: waiverId,
                     slug: waiverConfig.viewerSlug,
                     displayName: waiverConfig.displayName,
                     selected: true,
                     stbh: appState.fees.mdpStbhBase, // The calculated STBH base
                     premium: premium,
                     policyOwnerName: policyOwner.name,
                     policyOwnerAge: policyOwner.age
                 };
                 // Optionally add to riderList as well if viewer expects it there
                 riderList.push({
                     ...waiverInfo,
                     persons: [policyOwner.name || 'Bên mua BH'] // Represent the owner
                 });
             }
         }
    });


    // --- Fees ---
    const baseMain = appState.fees.baseMain || 0;
    const extra = appState.fees.extra || 0;
    const totalSupp = appState.fees.totalSupp || 0; // Includes waiver fees

    // --- Target Age ---
    const targetAgeInputVal = parseInt(document.getElementById('target-age-input')?.value || '0', 10);
     let targetAge = 0;
     if (mainConfig?.cashValueConfig?.enabled && targetAgeInputVal > 0) {
         targetAge = targetAgeInputVal;
     } else if (mainPerson.age > 0 && paymentTermFinal > 0) {
          // Default target age even if no cash value shown (for benefit duration)
          targetAge = mainPerson.age + paymentTermFinal - 1;
     } else {
         targetAge = mainPerson.age; // Fallback
     }
     targetAge = Math.min(99, Math.max(mainPerson.age, targetAge)); // Ensure within bounds


    // --- Generate Summary HTML ---
     // Ensure calculations are up-to-date before generating HTML
     const currentFees = appState.fees; // Use the latest calculated fees
     const summaryHtml = __exportExactSummaryHtml({ ...appState, fees: currentFees }); // Pass full context

    return {
        v: 4, // Version marker for payload structure
        productKey: mainKey,
        productSlug: mainConfig?.viewerSlug,
        productDisplayName: mainConfig?.displayName,
        programKey: appState.mainProduct.program, // Include selected program
        mainPerson: {
             name: mainPerson.name || '',
             dob: mainPerson.dob || '',
             age: mainPerson.age || 0,
             gender: mainPerson.gender === 'Nữ' ? 'F' : 'M',
             riskGroup: mainPerson.riskGroup,
        },
        policyOwner: { // Include basic owner info
             name: policyOwner.name || '',
             dob: policyOwner.dob || '',
             age: policyOwner.age || 0,
             gender: policyOwner.gender === 'Nữ' ? 'F' : 'M',
        },
        supplementaryPersons: appState.supplementaryPersons.map(p => ({
            name: p.name || '', dob: p.dob || '', age: p.age || 0, gender: p.gender === 'Nữ' ? 'F' : 'M', riskGroup: p.riskGroup
        })),
        sumAssured: mainConfig?.calculation.method === 'package' ? mainConfig.packageConfig.fixedValues.stbh : (appState.mainProduct.stbh || 0),
        paymentFrequency: appState.paymentFrequency,
        paymentTermInput: appState.mainProduct.paymentTerm, // The value entered/defaulted
        paymentTermFinal: paymentTermFinal, // The actual term used for benefit duration/calculation
        targetAge: targetAge,
        premiums: {
            baseMain,
            extra,
            totalSupp, // Includes waiver fee
            riders: riderList // Detailed rider info including waivers
        },
        waiver: waiverInfo, // Specific waiver info (can be null)
        summaryHtml: summaryHtml // The generated HTML string
    };
}


function openFullViewer() {
    try {
        // Ensure state is absolutely current before building payload
        runWorkflow(); // Run synchronously

        // Now build payload with the fresh state
        const payload = buildViewerPayload();

        // Basic check before proceeding
        if (!payload.productKey) {
            showGlobalErrors(['Vui lòng chọn sản phẩm chính.']);
            return;
        }
         // Check if overall validation passed (using the result from the synchronous runWorkflow)
         if (!runAllValidations(appState)) { // Rerun validation, which also calls showGlobalErrors
            const box = document.getElementById('global-error-box');
            if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
             return; // Stop if validation fails
         }


        // Proceed if valid
        hideGlobalErrors(); // Clear any previous global errors
        const json = JSON.stringify(payload);
        const b64 = btoa(unescape(encodeURIComponent(json)));

        const viewerUrl = new URL('viewer.html', location.href);
        viewerUrl.hash = `#v=${b64}`;

        const modal = document.getElementById('viewer-modal');
        const iframe = document.getElementById('viewer-iframe');

        iframe.src = 'about:blank'; // Clear previous content
        modal.classList.add('loading', 'visible');

        iframe.onload = () => {
            modal.classList.remove('loading');
        };

        iframe.src = viewerUrl.toString();

    } catch (e) {
        console.error('[FullViewer] Error creating payload or opening viewer:', e);
        showGlobalErrors([`Lỗi tạo bảng minh họa: ${e.message}`]);
    }
}


function initViewerModal() {
    const viewerBtn = document.getElementById('btnFullViewer');
    const modal = document.getElementById('viewer-modal');
    const iframe = document.getElementById('viewer-iframe');
    const closeBtn = document.getElementById('close-viewer-modal-btn');

    if (!viewerBtn || !modal || !iframe || !closeBtn) {
        console.error('Viewer modal elements not found.');
        return;
    }

    viewerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openFullViewer(); // Directly call the refactored function
    });

    const closeModal = () => {
        modal.classList.remove('visible', 'loading');
        iframe.src = 'about:blank'; // Clear iframe content on close
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { // Close on backdrop click
        if (e.target === modal) {
            closeModal();
        }
    });

    // Close on Escape key
    const handleKeydown = (e) => {
        if (e.key === 'Escape' && modal.classList.contains('visible')) {
            closeModal();
        }
    };
    document.addEventListener('keydown', handleKeydown);

     // Ensure modal is hidden initially
     modal.classList.remove('visible', 'loading');
}


// ===================================================================================
// ===== LOGIC TẠO BẢNG MINH HỌA HTML (ADAPTED)
// ===================================================================================

// Wrapper function to pass necessary context
function __exportExactSummaryHtml(context = appState) {
    try {
        // Build the data structure needed specifically for the HTML summary tables
        const summaryData = buildSummaryDataForHtml(context);
        if (!summaryData) return '<div style="color:red">Lỗi: Không thể tạo dữ liệu tóm tắt.</div>';

        const introHtml = buildIntroSectionHtml(summaryData);
        const part1Html = buildPart1SectionHtml(summaryData);
        const part2Html = buildPart2BenefitsSectionHtml(summaryData); // Benefit Matrix
        const part3Html = buildPart3ScheduleSectionHtml(summaryData); // Fee & Cash Value Schedule
        const footerHtml = buildFooterSectionHtml(summaryData);

        return introHtml + part1Html + part2Html + part3Html + footerHtml;
    } catch (e) {
        console.error('[__exportExactSummaryHtml] error:', e);
        return `<div style="color:red">Lỗi tạo summaryHtml: ${e.message}</div>`;
    }
}

// Build the specific data structure needed for HTML generation from appState
function buildSummaryDataForHtml(currentState) {
     if (!currentState || !currentState.mainProduct || !currentState.mainPerson) return null;

    const { mainProduct, mainPerson, supplementaryPersons, policyOwner, paymentFrequency, fees } = currentState;
    const productKey = mainProduct.key;
    const productConfig = PRODUCT_CATALOG[productKey];
     if (!productConfig) return null;

    const freq = paymentFrequency;
    const periods = freq === 'half' ? 2 : (freq === 'quarter' ? 4 : 1);
    const isAnnual = periods === 1;
    // Get rider factor based on frequency
     let riderFactor = 1;
     if (freq === 'half') riderFactor = GLOBAL_CONFIG.paymentFrequencyFactors.half;
     else if (freq === 'quarter') riderFactor = GLOBAL_CONFIG.paymentFrequencyFactors.quarter;


    // Determine Final Payment Term (same logic as buildViewerPayload)
     let paymentTermFinal = 0;
     // ... (copy logic from buildViewerPayload to calculate paymentTermFinal) ...
     if (productConfig?.calculation.method === 'package') {
        const underlyingConfig = PRODUCT_CATALOG[productConfig.packageConfig.underlyingMainProduct];
        const fixedProgramKey = productConfig.packageConfig.fixedValues.program;
        const fixedProgram = underlyingConfig?.programs?.options.find(p => p.key === fixedProgramKey);
        paymentTermFinal = fixedProgram?.defaultPaymentTerm || 0;
    } else if (productConfig?.programs?.enabled) {
         const selectedProgramKey = mainProduct.program;
         const selectedProgram = productConfig.programs.options.find(p => p.key === selectedProgramKey);
          if (productKey === 'AN_BINH_UU_VIET') {
             paymentTermFinal = parseInt(selectedProgramKey, 10) || 0;
          } else {
             paymentTermFinal = mainProduct.paymentTerm || selectedProgram?.defaultPaymentTerm || 0;
          }
    } else {
        paymentTermFinal = mainProduct.paymentTerm || 0;
    }


    // Determine Target Age (same logic as buildViewerPayload)
     const targetAgeInputVal = parseInt(document.getElementById('target-age-input')?.value || '0', 10);
     let targetAge = 0;
     // ... (copy logic from buildViewerPayload to calculate targetAge) ...
      if (productConfig?.cashValueConfig?.enabled && targetAgeInputVal > 0) {
         targetAge = targetAgeInputVal;
     } else if (mainPerson.age > 0 && paymentTermFinal > 0) {
          targetAge = mainPerson.age + paymentTermFinal - 1;
     } else {
         targetAge = mainPerson.age;
     }
     targetAge = Math.min(99, Math.max(mainPerson.age, targetAge));

    // Consolidate persons list including policy owner if they have selected waivers
     const personsForHtml = [mainPerson, ...supplementaryPersons];
     const ownerHasWaivers = Object.values(policyOwner.selectedWaivers || {}).some(selected => selected);
     if (ownerHasWaivers && fees.byPerson[policyOwner.id]?.supp > 0) {
        // Add owner as a "person" for fee display purposes if they have waiver fees
         personsForHtml.push({
             ...policyOwner,
             isMain: false, // Treat like supplementary for display logic
             supplements: {} // Owner doesn't have regular supplements, only waivers handled separately
         });
     }


    // --- Build Data for Part 1 (Fee Summary Table) ---
    const part1Data = buildPart1HtmlData({
        persons: personsForHtml, // Use the consolidated list
        mainProduct,
        fees, // Pass the full calculated fees object
        paymentTerm: paymentTermFinal, // Use final term
        targetAge,
        periods,
        isAnnual,
        riderFactor,
         policyOwner // Pass owner info separately if needed for specific logic (like MDP STBH display)
    });

    // --- Build Data for Part 3 (Schedule Table) ---
    const scheduleData = buildPart3HtmlScheduleData({
         persons: personsForHtml,
         mainPerson, // Need original main person for age progression
         policyOwner, // Need owner details if waivers are involved
         mainProduct,
         paymentTerm: paymentTermFinal,
         targetAge,
         fees, // Pass full fees
         periods,
         isAnnual,
         riderFactor,
         productConfig // Pass config for cash value check
    });

    return {
         // Pass through necessary context
         productKey,
         productDisplayName: productConfig.displayName,
         programLabel: productConfig.programs?.enabled ? productConfig.programs.options.find(p=>p.key === mainProduct.program)?.label : null,
         paymentFrequencyLabel: freq === 'year' ? 'Năm' : (freq === 'half' ? 'Nửa năm' : 'Quý'),
         targetAge,
         mainPerson,
         persons: personsForHtml, // Consolidated list for benefit matrix
         policyOwner, // Original owner object
         // Pass calculated data
         part1: part1Data,
         schedule: scheduleData,
         // Pass raw data needed by benefit matrix
         fees, // Pass fees for benefit matrix context
         supplementsState: { // Simplified supplements state for benefit matrix
             main: mainPerson.supplements,
             supp: supplementaryPersons.reduce((acc, p) => { acc[p.id] = p.supplements; return acc; }, {}),
             owner: policyOwner.selectedWaivers // Pass selected waivers
         }
    };
}


function buildPart1HtmlData(ctx) {
    const { persons, mainProduct, fees, paymentTerm, targetAge, periods, isAnnual, riderFactor, policyOwner } = ctx;
    const mainConfig = PRODUCT_CATALOG[mainProduct.key];

    const rows = [];
    const perPersonTotals = {}; // { personId: { per: 0, eq: 0, base: 0, diff: 0 } }
    const grand = { per: 0, eq: 0, base: 0, diff: 0 };

     // Helper to add a row and update totals
     const addRow = (personId, personName, prodName, stbhDisplay, years, baseAnnual, isRider) => {
         if (baseAnnual <= 0) return;

         let perPeriod = 0, annualEq = 0, diff = 0;
         if (!isAnnual) {
             perPeriod = getFeePerPeriod(baseAnnual, periods === 2 ? 'half' : 'quarter', isRider);
             annualEq = perPeriod * periods;
             diff = annualEq - baseAnnual;
         } else {
              perPeriod = baseAnnual; // For annual, perPeriod is same as baseAnnual
              annualEq = baseAnnual;
              diff = 0;
         }

          // Initialize totals for person if not exist
         if (!perPersonTotals[personId]) {
             perPersonTotals[personId] = { personName: personName, per: 0, eq: 0, base: 0, diff: 0 };
         }

          // Update totals
         perPersonTotals[personId].per += perPeriod;
         perPersonTotals[personId].eq += annualEq;
         perPersonTotals[personId].base += baseAnnual;
         perPersonTotals[personId].diff += diff;
         grand.per += perPeriod;
         grand.eq += annualEq;
         grand.base += baseAnnual;
         grand.diff += diff;

          rows.push({ personId, personName, prodName, stbhDisplay, years, perPeriod, annualEq, diff, annualBase: baseAnnual });
     };

     // --- Add Main Product Rows ---
     const mainPerson = persons.find(p => p.isMain);
     if (mainPerson) {
         if (fees.baseMain > 0) {
             const stbhVal = mainConfig?.calculation.method === 'package' ? mainConfig.packageConfig.fixedValues.stbh : mainProduct.stbh;
              let prodName = mainConfig.displayName;
              if (mainConfig.programs?.enabled && mainProduct.program) {
                 const progLabel = mainConfig.programs.options.find(p=>p.key === mainProduct.program)?.label;
                 if(progLabel) prodName += ` - ${progLabel}`;
              }
             addRow(mainPerson.id, mainPerson.name, prodName, formatDisplayCurrency(stbhVal), paymentTerm || '—', fees.baseMain, false);
         }
         if (fees.extra > 0) {
             addRow(mainPerson.id, mainPerson.name, 'Phí đóng thêm', '—', paymentTerm || '—', fees.extra, false);
         }
     }

     // --- Add Rider Rows ---
     persons.forEach(p => {
         const personFeeDetails = fees.byPerson[p.id]?.suppDetails || {};
         // Sort rider details by displayOrder for consistent table output
         const sortedRiderIds = Object.keys(personFeeDetails)
             .sort((a, b) => (PRODUCT_CATALOG[a]?.displayOrder || 99) - (PRODUCT_CATALOG[b]?.displayOrder || 99));

         sortedRiderIds.forEach(riderId => {
             const baseAnnual = personFeeDetails[riderId];
             if (baseAnnual <= 0) return;

             const riderConfig = PRODUCT_CATALOG[riderId];
             if (!riderConfig) return; // Should not happen

             // Determine years based on renewalMax
             const renewalMaxRule = riderConfig.rules?.eligibility?.find(r => r.renewalMax != null);
             const renewalMax = renewalMaxRule?.renewalMax ?? 99;
             const mainAgeAtStart = mainPerson?.age || 0; // Use main person's age for duration calculation relative to policy start
             const personAgeAtStart = p.age || 0;
             // Years = min(renewal_age - current_age, target_age - main_start_age) + 1
             const years = Math.max(0, Math.min(renewalMax - personAgeAtStart, targetAge - mainAgeAtStart)) + 1;


             let stbhDisplay = '—';
             let prodName = riderConfig.displayName;

              // Handle STBH display and name variations
             if (riderConfig.calculation?.stbhCalculation?.method === 'sumPremiumsOfPolicy') { // MDP
                 stbhDisplay = formatDisplayCurrency(fees.mdpStbhBase || 0);
             } else if (p.supplements && p.supplements[riderId]?.stbh) {
                  stbhDisplay = formatDisplayCurrency(p.supplements[riderId].stbh);
             } else if (riderConfig.programs?.enabled && p.supplements?.[riderId]?.program) { // SCL style STBH from program
                 const riderProgramKey = p.supplements[riderId].program;
                 const progOption = riderConfig.programs.options.find(opt => opt.key === riderProgramKey);
                 if (progOption) {
                      prodName += ` - ${progOption.label}`; // Append program label
                      if (progOption.stbh) { // If STBH is defined in program option
                          stbhDisplay = formatDisplayCurrency(progOption.stbh);
                      } else { // Fallback to BM_SCL_PROGRAMS (should deprecate this?)
                           stbhDisplay = formatDisplayCurrency(BM_SCL_PROGRAMS[riderProgramKey]?.core || 0);
                      }
                 }
                 // Append Scope for SCL
                  if (riderId === 'HEALTH_SCL' && p.supplements[riderId]?.scope) {
                      const scopeLabel = riderConfig.uiInputs?.scope?.options.find(o => o.value === p.supplements[riderId].scope)?.label;
                      if(scopeLabel) prodName += ` (${scopeLabel})`;
                  }
             }

             addRow(p.id, p.name, prodName, stbhDisplay, years, baseAnnual, true); // isRider = true
         });
     });

    // Convert perPersonTotals object to array, preserving original person order if possible
     const orderedPersonTotals = persons
         .map(p => perPersonTotals[p.id])
         .filter(total => total && total.base > 0); // Filter out persons with no fees


    return { rows, perPersonTotals: orderedPersonTotals, grand, isAnnual, periods };
}

function buildPart3HtmlScheduleData(ctx) {
     const { persons, mainPerson, policyOwner, mainProduct, paymentTerm, targetAge, fees, periods, isAnnual, riderFactor, productConfig } = ctx;

     const rows = [];
     const hasCashValue = productConfig?.cashValueConfig?.enabled;
     let projection = null;
     if (hasCashValue) {
          const customRateInput = document.getElementById('custom-interest-rate-input')?.value;
          projection = calculateAccountValueProjection(
              mainPerson,
              mainProduct,
              fees.baseMain, // Annual base main
              fees.extra, // Annual extra
              targetAge,
              customRateInput,
              isAnnual ? 'year' : (periods === 2 ? 'half' : 'quarter') // Pass frequency string
          );
     }


     const initialMainAge = mainPerson.age;
     const maxYear = targetAge - initialMainAge + 1;

     // Pre-calculate annual fees for efficiency
     const annualFees = {
          mainBase: fees.baseMain,
          mainExtra: fees.extra,
          riders: {} // { personId: { riderId: annualFee } }
     };
     persons.forEach(p => {
         annualFees.riders[p.id] = { ...fees.byPerson[p.id]?.suppDetails }; // Copy rider details
     });


     for (let year = 1; year <= maxYear; year++) {
         const currentMainAge = initialMainAge + year - 1;
         const inPaymentTerm = year <= paymentTerm;

         const mainYearBase = inPaymentTerm ? annualFees.mainBase : 0;
         const extraYearBase = inPaymentTerm ? annualFees.mainExtra : 0;

         const perPersonSuppAnnualEq = []; // Array matching 'persons' order
         let totalSuppAnnualEq = 0;

         persons.forEach((p, index) => {
             let personSuppEq = 0;
             const attainedAge = p.age + year - 1; // Calculate attained age for this person

             for (const riderId in annualFees.riders[p.id] || {}) {
                 const annualFee = annualFees.riders[p.id][riderId];
                 const riderConfig = PRODUCT_CATALOG[riderId];
                 if (!riderConfig) continue;

                 // Check renewal age for this rider at attained age
                 const renewalMaxRule = riderConfig.rules?.eligibility?.find(r => r.renewalMax != null);
                 const renewalMax = renewalMaxRule?.renewalMax ?? 99;

                 if (annualFee > 0 && attainedAge <= renewalMax) {
                      if (isAnnual) {
                          personSuppEq += annualFee;
                      } else {
                          // Calculate per-period fee and multiply back
                          const feePerPeriod = getFeePerPeriod(annualFee, periods === 2 ? 'half' : 'quarter', true);
                          personSuppEq += feePerPeriod * periods;
                      }
                 }
             }
             perPersonSuppAnnualEq[index] = personSuppEq;
             totalSuppAnnualEq += personSuppEq;
         });

          let totalAnnualEq = 0;
          let totalYearBase = mainYearBase + extraYearBase; // Base total without riders first
          persons.forEach(p => { totalYearBase += (fees.byPerson[p.id]?.supp || 0); }); // Add annual rider fees

          if (isAnnual) {
              totalAnnualEq = totalYearBase;
          } else {
               const mainPerPeriod = getFeePerPeriod(mainYearBase, periods === 2 ? 'half' : 'quarter', false);
               const extraPerPeriod = getFeePerPeriod(extraYearBase, periods === 2 ? 'half' : 'quarter', false);
               // totalSuppAnnualEq is already calculated based on per-period logic
               totalAnnualEq = (mainPerPeriod + extraPerPeriod) * periods + totalSuppAnnualEq;
          }

         const diff = totalAnnualEq - totalYearBase;

         // Get cash values for the end of this policy year (index year-1)
         const gttk_guaranteed = projection?.guaranteed?.[year - 1] || 0;
         const gttk_capped = projection?.customCapped?.[year - 1] || 0;
         const gttk_full = projection?.customFull?.[year - 1] || 0;

         rows.push({
             year,
             age: currentMainAge,
             mainYearBase,
             extraYearBase,
             perPersonSuppAnnualEq, // Array of supplementary totals per person
             totalYearBase, // Original sum of annual fees
             totalAnnualEq, // Sum of fees adjusted for frequency (equivalent annual)
             diff,
             gttk_guaranteed,
             gttk_capped,
             gttk_full
         });
     }

     const extraAllZero = rows.every(r => r.extraYearBase === 0);

     return { rows, extraAllZero, hasCashValue };
}


// --- HTML Building Functions (Minimal Changes Needed) ---

function buildIntroSectionHtml(summaryData) {
    let title = `BẢNG MINH HỌA PHÍ & QUYỀN LỢI`;
    let subtitle = `Sản phẩm chính: <strong>${sanitizeHtml(summaryData.productDisplayName || '—')}</strong>`;
     if (summaryData.programLabel) {
         subtitle += ` - ${sanitizeHtml(summaryData.programLabel)}`;
     }
    subtitle += `&nbsp;|&nbsp; Kỳ đóng: <strong>${sanitizeHtml(summaryData.paymentFrequencyLabel)}</strong>&nbsp;|&nbsp; Minh họa đến tuổi: <strong>${sanitizeHtml(summaryData.targetAge)}</strong>`;
    return `<div class="mb-4"><h2 class="text-xl font-bold">${title}</h2><div class="text-sm text-gray-700">${subtitle}</div></div>`;
}

function buildPart1SectionHtml(summaryData) {
    const { part1 } = summaryData;
    if (!part1) return '';
    const { rows, perPersonTotals, grand, isAnnual, periods } = part1;
    const fmt = formatDisplayCurrency; // Use rounding formatter
     const r1000 = n => Math.round((n || 0)); // No need to round again, just ensure number
    const formatDiffCell = n => {
         const roundedDiff = r1000(n);
         return roundedDiff === 0 ? '0' : `<span class="text-red-600 font-bold">${fmt(roundedDiff)}</span>`;
     };


    const headerHtml = isAnnual ? `<tr><th class="p-2 border">Tên NĐBH</th><th class="p-2 border">Sản phẩm</th><th class="p-2 border">STBH</th><th class="p-2 border">Số năm đóng phí</th><th class="p-2 border">Phí theo năm</th></tr>`
        : `<tr><th class="p-2 border">Tên NĐBH</th><th class="p-2 border">Sản phẩm</th><th class="p-2 border">STBH</th><th class="p-2 border">Số năm đóng phí</th><th class="p-2 border">Phí (${periods === 2 ? 'nửa năm' : 'theo quý'})</th><th class="p-2 border">Phí quy năm</th><th class="p-2 border">Phí chuẩn năm</th><th class="p-2 border">Chênh lệch</th></tr>`;

    let body = [];
    perPersonTotals.forEach(agg => {
        if (!agg || agg.base <= 0) return;
        body.push(isAnnual ? `<tr class="bg-gray-50 font-bold"><td class="p-2 border">${sanitizeHtml(agg.personName)}</td><td class="p-2 border">Tổng theo người</td><td class="p-2 border text-right">—</td><td class="p-2 border text-center">—</td><td class="p-2 border text-right">${fmt(r1000(agg.base))}</td></tr>`
            : `<tr class="bg-gray-50 font-bold"><td class="p-2 border">${sanitizeHtml(agg.personName)}</td><td class="p-2 border">Tổng theo người</td><td class="p-2 border text-right">—</td><td class="p-2 border text-center">—</td><td class="p-2 border text-right">${fmt(r1000(agg.per))}</td><td class="p-2 border text-right">${fmt(r1000(agg.eq))}</td><td class="p-2 border text-right">${fmt(r1000(agg.base))}</td><td class="p-2 border text-right">${formatDiffCell(agg.diff)}</td></tr>`);

        rows.filter(r => r.personId === agg.personId).forEach(r => { // Filter by personId
            body.push(isAnnual ? `<tr><td class="p-2 border"></td><td class="p-2 border">${sanitizeHtml(r.prodName)}</td><td class="p-2 border text-right">${r.stbhDisplay}</td><td class="p-2 border text-center">${r.years}</td><td class="p-2 border text-right">${fmt(r.annualBase)}</td></tr>`
                : `<tr><td class="p-2 border"></td><td class="p-2 border">${sanitizeHtml(r.prodName)}</td><td class="p-2 border text-right">${r.stbhDisplay}</td><td class="p-2 border text-center">${r.years}</td><td class="p-2 border text-right">${fmt(r.perPeriod)}</td><td class="p-2 border text-right">${fmt(r.annualEq)}</td><td class="p-2 border text-right">${fmt(r.annualBase)}</td><td class="p-2 border text-right">${formatDiffCell(r.diff)}</td></tr>`);
        });
    });

    // Grand Total Row
     body.push(isAnnual ? `<tr class="bg-gray-100 font-bold"><td class="p-2 border" colspan="4">Tổng cộng</td><td class="p-2 border text-right">${fmt(r1000(grand.base))}</td></tr>`
         : `<tr class="bg-gray-100 font-bold"><td class="p-2 border" colspan="4">Tổng cộng</td><td class="p-2 border text-right">${fmt(r1000(grand.per))}</td><td class="p-2 border text-right">${fmt(r1000(grand.eq))}</td><td class="p-2 border text-right">${fmt(r1000(grand.base))}</td><td class="p-2 border text-right">${formatDiffCell(grand.diff)}</td></tr>`);


    return `<h3 class="text-lg font-bold mb-2">Phần 1 · Tóm tắt sản phẩm và phí bảo hiểm</h3><div class="overflow-x-auto"><table class="w-full border-collapse text-sm"><thead>${headerHtml}</thead><tbody>${body.join('')}</tbody></table></div>`;
}
function buildPart2BenefitsSectionHtml(summaryData) {
    // This function now uses the refactored bm_collectColumns and bm_renderSchemaTables
    // which read benefitSchemaKey, displayName, displayOrder from PRODUCT_CATALOG.
     const colsBySchema = bm_collectColumns(summaryData); // Pass the full summaryData context

     // Sort schema keys based on the displayOrder of the *first* product using that schema
     const schemaOrder = Object.keys(colsBySchema).sort((keyA, keyB) => {
          const firstProductA = PRODUCT_CATALOG[colsBySchema[keyA][0].productKey];
          const firstProductB = PRODUCT_CATALOG[colsBySchema[keyB][0].productKey];
          const orderA = firstProductA?.displayOrder || 99;
          const orderB = firstProductB?.displayOrder || 99;
          if (orderA !== orderB) return orderA - orderB;
          return (firstProductA?.displayName || keyA).localeCompare(firstProductB?.displayName || keyB);
      });


    const blocks = schemaOrder
          .map(sk => colsBySchema[sk] ? bm_renderSchemaTables(sk, colsBySchema[sk], summaryData) : '')
          .filter(Boolean);

    if (!blocks.length) return `<h3 class="text-lg font-bold mt-6 mb-3">Phần 2 · Tóm tắt quyền lợi sản phẩm</h3><div class="text-sm text-gray-500 italic mb-4">Chưa chọn sản phẩm nào để hiển thị quyền lợi.</div>`;
    return `<h3 class="text-lg font-bold mt-6 mb-3">Phần 2 · Tóm tắt quyền lợi sản phẩm</h3>${blocks.join('')}`;
}

function buildPart3ScheduleSectionHtml(summaryData) {
    const { schedule, isAnnual, persons } = summaryData; // persons includes owner if needed
    const { rows, extraAllZero, hasCashValue } = schedule;
    const fmt = formatDisplayCurrency;

    if (!rows.length) return '';

    // Filter active persons (those who have non-zero rider fees in at least one year)
    const activePersonIndices = persons
        .map((p, i) => rows.some(r => (r.perPersonSuppAnnualEq[i] || 0) > 0) ? i : -1)
        .filter(index => index !== -1);


    // --- Build Header ---
    const headerCells = [
        '<th class="p-2 border">Năm HĐ</th>',
        '<th
