

import { PRODUCT_CATALOG, GLOBAL_CONFIG } from '../structure.js';

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
        const calcFunc = calcKey && state.context.registries.CALC_REGISTRY[calcKey];

        if (calcFunc) {
            fees.baseMain = calcFunc({
                productInfo: state.mainProduct,
                customer: mainPerson,
                productConfig: mainProductConfig,
                helpers: state.context.helpers,
                params: mainProductConfig.calculation.params || {},
                state: state
            });
        }
        fees.extra = state.mainProduct.values['extra-premium'] || 0;
        fees.byPerson[mainPerson.id].main = fees.baseMain + fees.extra;
    }

    const allInsuredPersons = state.persons.filter(p => p); // All persons including main
    const context = { state, fees, helpers: state.context.helpers };

    // --- PHASE A: PRE-AGGREGATIONS ---
    const accumulators = preAggregationPhase(allInsuredPersons);

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

function preAggregationPhase(allInsuredPersons) {
    const accumulators = {
        totalHospitalSupportStbh: 0
    };
    allInsuredPersons.forEach(person => {
        Object.keys(person.supplements).forEach(prodId => {
            const prodConfig = PRODUCT_CATALOG[prodId];
            if (!prodConfig || !prodConfig.calculation?.accumulatorKeys) return;
            
            prodConfig.calculation.accumulatorKeys.forEach(key => {
                if (key === 'totalHospitalSupportStbh') {
                    accumulators[key] += (person.supplements[prodId]?.stbh || 0);
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
            if (prodConfig?.calculation?.pass === 2) return; 

            const calcKey = prodConfig?.calculation?.calculateKey;
            const calcFunc = calcKey && context.state.context.registries.CALC_REGISTRY[calcKey];
            if (!calcFunc) return;
            
            const fee = calcFunc({
                customer: person,
                mainPremium: fees.baseMain,
                allPersons: context.state.persons,
                accumulators,
                helpers: context.helpers,
                params: prodConfig.calculation.params || {},
                state: context.state
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
    const waiverTargetPerson = state.context.registries.CALC_REGISTRY._getWaiverTargetPersonInfo(state);
    if (!waiverTargetPerson) return;
    
    Object.keys(state.waiver.enabledProducts).forEach(waiverSlug => {
        if (!state.waiver.enabledProducts[waiverSlug]) return;

        const waiverProdKey = Object.keys(PRODUCT_CATALOG).find(key => PRODUCT_CATALOG[key].slug === waiverSlug);
        const waiverConfig = PRODUCT_CATALOG[waiverProdKey];
        if (!waiverConfig) return;
        
        const stbhBase = calculateWaiverStbhBase(waiverConfig, feeSnapshot, waiverTargetPerson);
        const calcKey = waiverConfig.calculation.calculateKey;
        const calcFunc = calcKey && state.context.registries.CALC_REGISTRY[calcKey];

        if (stbhBase > 0 && calcFunc) {
            const premium = calcFunc({
                personInfo: waiverTargetPerson,
                stbhBase,
                helpers: context.helpers,
            });
            
            if (premium > 0) {
                fees.waiverDetails[waiverProdKey] = { premium, targetPerson: waiverTargetPerson, stbhBase };
                fees.totalSupp += premium;
                const personIdForFee = waiverTargetPerson.id;
                
                if (!fees.byPerson[personIdForFee]) {
                    fees.byPerson[personIdForFee] = { main: 0, supp: 0, total: 0, suppDetails: {} };
                }
                
                fees.byPerson[personIdForFee].supp += premium;
                fees.byPerson[personIdForFee].suppDetails[waiverProdKey] = premium;
            }
        }
    });
}


function calculateWaiverStbhBase(waiverConfig, feeSnapshot, waiverTargetPerson) {
    const calcConfig = waiverConfig.stbhCalculation || {};
    let stbhBase = 0;

    const mainPersonId = Object.keys(feeSnapshot).find(id => feeSnapshot[id].mainBase > 0);
    
    if (calcConfig.includeMainBasePremium && mainPersonId) {
        stbhBase += feeSnapshot[mainPersonId].mainBase;
    }

    if (calcConfig.includeAllRiders) {
        Object.entries(feeSnapshot).forEach(([personId, personFees]) => {
            let ridersToExclude = calcConfig.excludeRidersOfWaivedPerson && personId === waiverTargetPerson.id;
            if (!ridersToExclude) {
                stbhBase += personFees.supp;
            }
        });
    }

    return Math.max(0, stbhBase);
}
