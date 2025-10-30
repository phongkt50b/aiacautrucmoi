import { product_data } from '../data.js';
import { GLOBAL_CONFIG, PRODUCT_CATALOG } from '../structure.js';

const HELPERS_INTERNAL = {
    findRate: (tablePath, age, genderKey, ageField = 'age') => {
        let table = tablePath.split('.').reduce((obj, key) => obj?.[key], product_data);
        return table?.find(r => r[ageField] === age)?.[genderKey] || 0;
    },
    findRateByRange: (table, age, genderKey) => {
        return table?.find(r => age >= r.ageMin && age <= r.ageMax)?.[genderKey] || 0;
    },
    findRateByTerm: (tablePath, term, age, genderKey) => {
        let table = tablePath.split('.').reduce((obj, key) => obj?.[key], product_data);
        return table?.[term]?.find(r => r.age === age)?.[genderKey] || 0;
    }
};

export const CALC_REGISTRY = {
    // ================== Main Products ==================
    pul_main_by_rate_table: ({ productInfo, customer, helpers, params }) => {
        if (!productInfo.values['main-stbh']) return 0;
        const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
        const rate = HELPERS_INTERNAL.findRate(params.rateTableKey, customer.age, genderKey);
        const premium = Math.round((productInfo.values['main-stbh'] / 1000) * rate);
        return helpers.roundDownTo1000(premium);
    },
    mul_main_direct_input: ({ productInfo, helpers }) => {
        return helpers.roundDownTo1000(productInfo.values['main-premium']);
    },
    abuv_main_by_term_rate: ({ productInfo, customer, helpers }) => {
        const stbh = productInfo.values['main-stbh'];
        const term = productInfo.values['abuv-term'];
        if (!stbh || !term) return 0;
        const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
        const rate = HELPERS_INTERNAL.findRateByTerm('an_binh_uu_viet_rates', term, customer.age, genderKey);
        const premium = Math.round((stbh / 1000) * rate);
        return helpers.roundDownTo1000(premium);
    },
    package_main_proxy: ({ customer, params, helpers, state }) => {
        const underlyingConfig = PRODUCT_CATALOG[params.underlyingKey];
        if (!underlyingConfig) return 0;
    
        const calcFunc = CALC_REGISTRY[underlyingConfig.calculation.calculateKey];
        if (!calcFunc) return 0;
    
        // Construct a temporary productInfo object for the underlying product
        const packageInfo = {
            key: params.underlyingKey,
            values: {
                'main-stbh': params.fixedValues.stbh,
                // Explicitly map keys needed by the underlying calculation function
                'abuv-term': params.fixedValues.paymentTerm
            }
        };
    
        return calcFunc({
            productInfo: packageInfo,
            customer,
            helpers,
            params: underlyingConfig.calculation.params || {}
        });
    },

    // ================== Riders ==================
    scl_calc: ({ customer, helpers }) => {
        const ageToUse = customer.age;
        const renewalMax = 65 + 9; // Placeholder, better to read from config
        if (ageToUse > renewalMax) return { base: 0, outpatient: 0, dental: 0, total: 0 };
        
        const suppData = customer.supplements?.health_scl || {};
        const { program, scope, outpatient, dental } = suppData;
        if (!program || !scope) return { base: 0, outpatient: 0, dental: 0, total: 0 };

        const ageBandIndex = product_data.health_scl_rates.age_bands.findIndex(b => ageToUse >= b.min && ageToUse <= b.max);
        if (ageBandIndex === -1) return { base: 0, outpatient: 0, dental: 0, total: 0 };
        
        const rates = product_data.health_scl_rates;
        const base = rates[scope]?.[ageBandIndex]?.[program] || 0;
        const outpatientFee = outpatient ? (rates.outpatient?.[ageBandIndex]?.[program] || 0) : 0;
        const dentalFee = (outpatient && dental) ? (rates.dental?.[ageBandIndex]?.[program] || 0) : 0;
        
        return helpers.roundDownTo1000(base + outpatientFee + dentalFee);
    },
    bhn_calc: ({ customer, helpers }) => {
        const { stbh } = customer.supplements.bhn || {};
        if (!stbh) return 0;
        const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
        const rate = HELPERS_INTERNAL.findRateByRange(product_data.bhn_rates, customer.age, genderKey);
        return helpers.roundDownTo1000((stbh / 1000) * rate);
    },
    accident_calc: ({ customer, helpers }) => {
        const { stbh } = customer.supplements.accident || {};
        if (!stbh || !customer.riskGroup || customer.riskGroup > 4) return 0;
        const rate = product_data.accident_rates[customer.riskGroup] || 0;
        return helpers.roundDownTo1000((stbh / 1000) * rate);
    },
    hospital_support_calc: ({ customer, helpers }) => {
        const { stbh } = customer.supplements.hospital_support || {};
        if (!stbh) return 0;
        const rate = HELPERS_INTERNAL.findRateByRange(product_data.hospital_fee_support_rates, customer.age, 'rate');
        return helpers.roundDownTo1000((stbh / 100) * rate);
    },
    wop_mdp3: ({ personInfo, stbhBase, helpers }) => {
        if(!personInfo || !stbhBase || personInfo.age < 18 || personInfo.age > 60 || !personInfo.riskGroup) return 0;
        
        const riskGroup = personInfo.riskGroup;
        let riskFactor = 1.0;
        if (riskGroup === 2 || riskGroup === 3) riskFactor = 1.5;
        else if (riskGroup === 4) riskFactor = 2.0;
        
        const genderKey = personInfo.gender === 'Nữ' ? 'nu' : 'nam';
        const rate = HELPERS_INTERNAL.findRateByRange(product_data.mdp3_rates, personInfo.age, genderKey);
        
        const premium = (stbhBase / 1000) * rate * riskFactor;
        return helpers.roundDownTo1000(premium);
    },

    // ================== Waiver Logic Registry ==================
    waiverResolvers: {
        getTerm_mdp3: ({ waiverHolder, mainInsured, targetAge, productConfig }) => {
            const eligibilityRule = productConfig.rules.eligibility.find(r => r.type === 'age');
            if (!eligibilityRule) return 0;
            const yearsLeftForWaiverHolder = eligibilityRule.max - waiverHolder.age + 1;
            const yearsLeftForIllustration = targetAge - mainInsured.age + 1;
            return Math.max(0, Math.min(yearsLeftForWaiverHolder, yearsLeftForIllustration));
        },
        isEligible_mdp3: ({ attainedAge, productConfig }) => {
            const eligibilityRule = productConfig.rules.eligibility.find(r => r.type === 'age');
            return eligibilityRule && attainedAge <= eligibilityRule.max;
        }
    },
    
    // Internal helper, not a product calculation
    _getWaiverTargetPersonInfo: (state) => {
        const selectedId = state.waiver.selectedPersonId;
        if (!selectedId) return null;
        if (selectedId === GLOBAL_CONFIG.WAIVER_OTHER_PERSON_SELECT_VALUE) {
            const otherForm = document.getElementById('person-container-waiver-other-form');
            if (!otherForm) return null;
            
            const dobStr = otherForm.querySelector('.dob-input')?.value || '';
            let age = 0;
            if (dobStr && /^\d{2}\/\d{2}\/\d{4}$/.test(dobStr)) {
                const [dd, mm, yyyy] = dobStr.split('/').map(n => parseInt(n, 10));
                const birthDate = new Date(yyyy, mm - 1, dd);
                if (!isNaN(birthDate)) {
                    age = GLOBAL_CONFIG.REFERENCE_DATE.getFullYear() - birthDate.getFullYear();
                    const m = GLOBAL_CONFIG.REFERENCE_DATE.getMonth() - birthDate.getMonth();
                    if (m < 0 || (m === 0 && GLOBAL_CONFIG.REFERENCE_DATE.getDate() < birthDate.getDate())) age--;
                }
            }
            return {
                id: GLOBAL_CONFIG.WAIVER_OTHER_PERSON_ID,
                name: otherForm.querySelector('.name-input')?.value || 'Người khác',
                dob: dobStr,
                age: age,
                gender: otherForm.querySelector('.gender-select')?.value || 'Nam',
                riskGroup: parseInt(otherForm.querySelector('.occupation-input')?.dataset.group, 10) || 0,
            };
        }
        return state.persons.find(p => p.id === selectedId) || null;
    }
};
