
import { PRODUCT_CATALOG, GLOBAL_CONFIG } from '../structure.js';
import { CALC_REGISTRY } from '../registries/calcRegistry.js';
import { product_data } from '../data.js';

/**
 * The main calculation engine for the application.
 * Orchestrates a multi-pass calculation process based on product metadata.
 */
export function calculateAll(state) {
    const fees = {
        baseMain: 0,
        extra: 0,
        totalMain: 0,
        totalSupp: 0,
        total: 0,
        byPerson: {},
        waiverDetails: {}
    };

    const mainPerson = state.persons.find(p => p.isMain);
    const mainProductConfig = PRODUCT_CATALOG[state.mainProduct.key];

    // Initialize byPerson structure
    state.persons.forEach(p => {
        fees.byPerson[p.id] = { main: 0, supp: 0, total: 0, suppDetails: {} };
    });

    // --- BASE MAIN PREMIUM ---
    if (mainPerson && mainProductConfig) {
        const calcKey = mainProductConfig.calculation.calculateKey;
        const calcFunc = CALC_REGISTRY[calcKey];
        if (calcFunc) {
            fees.baseMain = calcFunc({
                productInfo: state.mainProduct,
                customer: mainPerson,
                productConfig: mainProductConfig,
                helpers: state.context.helpers,
                params: mainProductConfig.calculation.params || {}
            });
        }
        fees.extra = state.mainProduct.values['extra-premium'] || 0;
        fees.byPerson[mainPerson.id].main = fees.baseMain + fees.extra;
    }

    const allInsuredPersons = state.persons.filter(p => p); // All persons including main
    const context = { state, fees, product_data, helpers: state.context.helpers };

    // --- PHASE A: PRE-AGGREGATIONS ---
    const accumulators = preAggregationPhase(allInsuredPersons, context);

    // --- PHASE B: PASS 1 (Main Riders) ---
    pass1Phase(allInsuredPersons, fees, accumulators, context);

    // --- CREATE SNAPSHOT for waivers ---
    const feeSnapshot = createFeeSnapshot(allInsuredPersons, fees);
    
    // --- PHASE C: PASS 2 (Waivers) ---
    pass2Phase(fees, feeSnapshot, context);
    
    // --- FINAL SUMMATION ---
    fees.totalMain = fees.baseMain + fees.extra;
    fees.total = fees.totalMain + fees.totalSupp;

    return fees;
}

function preAggregationPhase(allInsuredPersons, context) {
    const accumulators = {};
    allInsuredPersons.forEach(person => {
        Object.keys(person.supplements).forEach(prodId => {
            const prodConfig = PRODUCT_CATALOG[prodId];
            if (!prodConfig || !prodConfig.calculation?.accumulatorKeys) return;
            
            prodConfig.calculation.accumulatorKeys.forEach(key => {
                if (key === 'totalHospitalSupportStbh') {
                    accumulators[key] = (accumulators[key] || 0) + (person.supplements[prodId]?.stbh || 0);
                }
            });
        });
    });
    return accumulators;
}

function pass1Phase(allInsuredPersons, fees, accumulators, context) {
    allInsuredPersons.forEach(person => {
        let personSuppFee = 0;
        Object.keys(person.supplements).forEach(prodId => {
            const prodConfig = PRODUCT_CATALOG[prodId];
            if (prodConfig?.calculation?.pass !== 1) return;
            
            const calcKey = prodConfig.calculation.calculateKey;
            const calcFunc = CALC_REGISTRY[calcKey];
            if (!calcFunc) return;
            
            const fee = calcFunc({
                customer: person,
                mainPremium: fees.baseMain,
                allPersons: context.state.persons,
                accumulators,
                helpers: context.helpers,
                params: prodConfig.calculation.params || {}
            });
            
            personSuppFee += fee;
            fees.byPerson[person.id].suppDetails[prodId] = fee;
        });
        fees.byPerson[person.id].supp = personSuppFee;
        fees.totalSupp += personSuppFee;
    });
}

function createFeeSnapshot(allInsuredPersons, fees) {
    const snapshot = {};
    allInsuredPersons.forEach(p => {
        const totalMainForPerson = p.isMain ? (fees.baseMain + fees.extra) : 0;
        snapshot[p.id] = {
            main: totalMainForPerson,
            mainBase: p.isMain ? fees.baseMain : 0,
            supp: fees.byPerson[p.id]?.supp || 0,
            total: totalMainForPerson + (fees.byPerson[p.id]?.supp || 0)
        };
    });
    return snapshot;
}

function pass2Phase(fees, feeSnapshot, context) {
    const { state } = context;
    const waiverTargetPerson = getWaiverTargetPersonInfo(state);
    if (!waiverTargetPerson) return;
    
    Object.keys(state.waiver.enabledProducts).forEach(waiverId => {
        const waiverConfig = PRODUCT_CATALOG[waiverId];
        if (!waiverConfig || waiverConfig.calculation?.pass !== 2) return;
        
        const stbhBase = calculateWaiverStbhBase(waiverConfig, feeSnapshot, waiverTargetPerson);
        const calcKey = waiverConfig.calculation.calculateKey;
        const calcFunc = CALC_REGISTRY[calcKey];

        if (stbhBase > 0 && calcFunc) {
            const premium = calcFunc({
                personInfo: waiverTargetPerson,
                stbhBase,
                helpers: context.helpers,
                params: waiverConfig.calculation.params || {}
            });
            
            if (premium > 0) {
                fees.waiverDetails[waiverId] = { premium, targetPerson: waiverTargetPerson, stbhBase };
                fees.totalSupp += premium;
                const personIdForFee = waiverTargetPerson.id;
                
                if (!fees.byPerson[personIdForFee]) {
                    fees.byPerson[personIdForFee] = { main: 0, supp: 0, total: 0, suppDetails: {} };
                }
                
                fees.byPerson[personIdForFee].supp += premium;
                fees.byPerson[personIdForFee].suppDetails[waiverId] = premium;
            }
        }
    });
}


function calculateWaiverStbhBase(waiverConfig, feeSnapshot, waiverTargetPerson) {
    const terms = waiverConfig.calculation.stbhTerms || [];
    let stbhBase = 0;
    
    terms.forEach(term => {
        switch(term.include) {
            case 'mainBase':
                stbhBase += feeSnapshot[Object.keys(feeSnapshot).find(id => feeSnapshot[id].mainBase > 0)]?.mainBase || 0;
                break;
            case 'riders:ALL':
                Object.values(feeSnapshot).forEach(personFees => {
                    stbhBase += personFees.supp;
                });
                break;
            case 'riders:EXCEPT_TARGET':
                if (waiverTargetPerson && feeSnapshot[waiverTargetPerson.id]) {
                    stbhBase -= feeSnapshot[waiverTargetPerson.id].supp;
                }
                break;
        }
    });

    return Math.max(0, stbhBase);
}

function getWaiverTargetPersonInfo(state) {
    const selectedId = state.waiver.selectedPersonId;
    if (!selectedId) return null;

    if (selectedId === GLOBAL_CONFIG.WAIVER_OTHER_PERSON_SELECT_VALUE) {
        const otherForm = document.getElementById(`person-container-waiver-other-form`);
        if (!otherForm) return null;
        
        // Temporarily collect data for this person
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
            age,
            gender: otherForm.querySelector('.gender-select')?.value || 'Nam',
            riskGroup: parseInt(otherForm.querySelector('.occupation-input')?.dataset.group, 10) || 0,
        };
    }
    return state.persons.find(p => p.id === selectedId) || null;
}
