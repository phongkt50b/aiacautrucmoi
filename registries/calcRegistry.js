import { product_data } from '../data.js';
import { GLOBAL_CONFIG, PRODUCT_CATALOG } from '../structure.js';
import { RULE_ENGINE } from './ruleEngine.js';
import { formatCurrency } from '../utils.js';

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
        return helpers.roundTo1000(premium);
    },
    mul_main_direct_input: ({ productInfo, helpers }) => {
        return helpers.roundTo1000(productInfo.values['main-premium']);
    },
    abuv_main_by_term_rate: ({ productInfo, customer, helpers }) => {
        const stbh = productInfo.values['main-stbh'];
        const term = productInfo.values['abuv-term'];
        if (!stbh || !term) return 0;
        const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
        const rate = HELPERS_INTERNAL.findRateByTerm('an_binh_uu_viet_rates', term, customer.age, genderKey);
        const premium = Math.round((stbh / 1000) * rate);
        return helpers.roundTo1000(premium);
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
        if (ageToUse > renewalMax) return 0;
        
        const suppData = customer.supplements?.health_scl || {};
        const { program, scope, outpatient, dental } = suppData;
        if (!program || !scope) return 0;

        const ageBandIndex = product_data.health_scl_rates.age_bands.findIndex(b => ageToUse >= b.min && ageToUse <= b.max);
        if (ageBandIndex === -1) return 0;
        
        const rates = product_data.health_scl_rates;
        const base = rates[scope]?.[ageBandIndex]?.[program] || 0;
        const outpatientFee = outpatient ? (rates.outpatient?.[ageBandIndex]?.[program] || 0) : 0;
        const dentalFee = (outpatient && dental) ? (rates.dental?.[ageBandIndex]?.[program] || 0) : 0;
        
        return helpers.roundTo1000(base + outpatientFee + dentalFee);
    },
    bhn_calc: ({ customer, helpers }) => {
        const { stbh } = customer.supplements.bhn || {};
        if (!stbh) return 0;
        const genderKey = customer.gender === 'Nữ' ? 'nu' : 'nam';
        const rate = HELPERS_INTERNAL.findRateByRange(product_data.bhn_rates, customer.age, genderKey);
        return helpers.roundTo1000((stbh / 1000) * rate);
    },
    accident_calc: ({ customer, helpers }) => {
        const { stbh } = customer.supplements.accident || {};
        if (!stbh || !customer.riskGroup || customer.riskGroup > 4) return 0;
        const rate = product_data.accident_rates[customer.riskGroup] || 0;
        return helpers.roundTo1000((stbh / 1000) * rate);
    },
    hospital_support_calc: ({ customer, helpers }) => {
        const { stbh } = customer.supplements.hospital_support || {};
        if (!stbh) return 0;
        const rate = HELPERS_INTERNAL.findRateByRange(product_data.hospital_fee_support_rates, customer.age, 'rate');
        return helpers.roundTo1000((stbh / 100) * rate);
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
        return helpers.roundTo1000(premium);
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
    },
    /**
     * Generic function to calculate account value projection.
     * It reads configuration from the product definition.
     */
    calculateGenericAccountValueProjection(productConfig, args, helpers) {
        const { mainPerson, mainProduct, basePremium, extraPremium, targetAge, customInterestRate, paymentFrequency } = args;
        const { investment_data, roundDownTo1000, GLOBAL_CONFIG } = helpers;
        const accountValueConfig = productConfig.accountValue.config;
    
        const { gender, age: initialAge } = mainPerson;
        const { key: productKey, values } = mainProduct;
        const stbhInitial = values['main-stbh'] || 0;
        const paymentTerm = RULE_ENGINE.resolveFieldByKey(productConfig.paymentTermKey, { values }) || 0;
        
        const { initial_fees, guaranteed_interest_rates, admin_fees } = investment_data;
    
        const costOfInsuranceRates = investment_data[accountValueConfig.costOfInsuranceRef] || [];
        const persistencyBonusRates = investment_data[accountValueConfig.persistencyBonusRef] || [];
    
        const totalYears = targetAge - initialAge + 1;
        const totalMonths = totalYears * 12;
    
        let parsedCustom = parseFloat(customInterestRate) || 0;
        const customRate = (parsedCustom > 1) ? (parsedCustom / 100) : parsedCustom;
    
        const roundVND = (v) => Math.round(v || 0);
    
        let scenarios = {
            guaranteed: { accountValue: 0, yearEndValues: [] },
            customCapped: { accountValue: 0, yearEndValues: [] },
            customFull: { accountValue: 0, yearEndValues: [] },
        };
        
        let periods = 1;
        if (paymentFrequency === 'half') periods = 2;
        if (paymentFrequency === 'quarter') periods = 4;
    
        const annualBasePremium = Number(basePremium || 0);
        const annualExtraPremium = Number(extraPremium || 0);
        const basePremiumPerPeriod = periods > 1 ? roundDownTo1000(annualBasePremium / periods) : annualBasePremium;
        const extraPremiumPerPeriod = periods > 1 ? roundDownTo1000(annualExtraPremium / periods) : annualExtraPremium;
    
        const startDate = (typeof GLOBAL_CONFIG !== 'undefined' && GLOBAL_CONFIG.REFERENCE_DATE) ? GLOBAL_CONFIG.REFERENCE_DATE : new Date();
        const startYear = startDate.getFullYear();
        const startMonth = startDate.getMonth() + 1;
    
        const getCalendarYearFromStart = (month) => {
            const startMonthZero = startMonth - 1;
            const monthIndexFromStart = startMonthZero + (month - 1);
            return startYear + Math.floor(monthIndexFromStart / 12);
        };
    
        const getStbhForPolicyYear = (policyYear) => {
            if (productKey === 'KHOE_BINH_AN') {
                const initial = Number(stbhInitial) || 0;
                if (policyYear === 1) return initial;
                if (policyYear >= 2 && policyYear <= 11) {
                    const extraYears = policyYear - 1;
                    return initial + Math.round(initial * 0.05 * extraYears);
                }
                return initial + Math.round(initial * 0.05 * 10);
            }
            return Number(stbhInitial) || 0;
        };
    
        const getAdminFeeForYear = (calendarYear) => {
            if (!admin_fees) return 0;
            if (admin_fees[calendarYear] !== undefined) return Number(admin_fees[calendarYear]) || 0;
            if (admin_fees[String(calendarYear)] !== undefined) return Number(admin_fees[String(calendarYear)]) || 0;
            return Number(admin_fees.default) || 0;
        };
    
        for (let month = 1; month <= totalMonths; month++) {
            const policyYear = Math.floor((month - 1) / 12) + 1;
            const attainedAge = initialAge + policyYear - 1;
            const genderKey = (gender === 'Nữ' || gender === 'Nu' || gender === 'nu') ? 'nu' : 'nam';
            const calendarYear = getCalendarYearFromStart(month);
            
            let isPaymentMonth = false;
            const monthInYear = ((month - 1) % 12) + 1;
    
            if (periods === 1 && monthInYear === 1) isPaymentMonth = true;
            if (periods === 2 && (monthInYear === 1 || monthInYear === 7)) isPaymentMonth = true;
            if (periods === 4 && (monthInYear === 1 || monthInYear === 4 || monthInYear === 7 || monthInYear === 10)) isPaymentMonth = true;
    
    
            for (const key in scenarios) {
                let currentAccountValue = scenarios[key].accountValue || 0;
                let premiumIn = 0;
                let initialFee = 0;
                
                if (isPaymentMonth && policyYear <= paymentTerm) {
                    let baseIn = basePremiumPerPeriod;
                    let extraIn = accountValueConfig.includeExtraPremium ? extraPremiumPerPeriod : 0;
                    premiumIn = baseIn + extraIn;
                    
                    const initialFeeRateBase = ((initial_fees && initial_fees[accountValueConfig.initialFeeRef]) || {})[policyYear] || 0;
                    const extraInitRate = (initial_fees && initial_fees.EXTRA) ? initial_fees.EXTRA : 0;
                    initialFee = roundVND((baseIn * Number(initialFeeRateBase || 0)) +
                                          (extraIn * Number(extraInitRate || 0)));
                }
    
                const investmentAmount = currentAccountValue + premiumIn - initialFee;
                const adminFee = getAdminFeeForYear(calendarYear) / 12;
                const stbhCurrent = getStbhForPolicyYear(policyYear);
                
                const riskRateRecord = costOfInsuranceRates.find(r => Number(r.age) === Number(attainedAge));
                const riskRate = riskRateRecord ? (riskRateRecord[genderKey] || 0) : 0;
                const sumAtRisk = Math.max(0, stbhCurrent - investmentAmount);
    
                let costOfInsurance = (sumAtRisk * riskRate) / 1000 / 12;
                costOfInsurance = roundVND(costOfInsurance);
    
                const netInvestmentAmount = investmentAmount - adminFee - costOfInsurance;
                
                let guaranteedRate = 0;
                const guaranteedRateRaw = (guaranteed_interest_rates && (guaranteed_interest_rates[policyYear] !== undefined))
                    ? guaranteed_interest_rates[policyYear]
                    : (guaranteed_interest_rates && guaranteed_interest_rates.default ? guaranteed_interest_rates.default : 0);
                guaranteedRate = Number(guaranteedRateRaw) || 0;
                guaranteedRate = (guaranteedRate > 1) ? (guaranteedRate / 100) : guaranteedRate;
    
                let interestRateYearly = 0;
                if (key === 'guaranteed') {
                    interestRateYearly = guaranteedRate;
                } else if (key === 'customCapped') {
                    interestRateYearly = (policyYear <= 20) ? Math.max(customRate, guaranteedRate) : guaranteedRate;
                } else {
                    interestRateYearly = Math.max(customRate, guaranteedRate);
                }
    
                const monthlyInterestRate = Math.pow(1 + interestRateYearly, 1 / 12) - 1;
                let interest = netInvestmentAmount * monthlyInterestRate;
                interest = roundVND(interest);
    
                let bonus = 0;
                const isLastMonthOfPolicyYear = (month % 12 === 0);
    
                if (accountValueConfig.bonusType === 'mul_periodic') {
                    if (policyYear >= 5 && policyYear <= paymentTerm && isLastMonthOfPolicyYear) {
                        bonus = annualBasePremium * 0.03;
                    }
                } else if (accountValueConfig.bonusType === 'standard_pul') {
                    const bonusInfo = (persistencyBonusRates || []).find(b => b.year === policyYear);
                    if (bonusInfo && isLastMonthOfPolicyYear) {
                        const bonusYear = bonusInfo.year;
                        if ( (bonusYear === 10 && paymentTerm >= 10) ||
                             (bonusYear === 20 && paymentTerm >= 20) ||
                             (bonusYear === 30 && paymentTerm >= 30) ) {
                            bonus = annualBasePremium * bonusInfo.rate;
                        }
                    }
                }
                bonus = roundVND(bonus);
    
                scenarios[key].accountValue = Math.max(0, roundVND(netInvestmentAmount + interest + bonus));
    
                if (month % 12 === 0) {
                    scenarios[key].yearEndValues.push(scenarios[key].accountValue);
                }
            }
        }
    
        return {
            guaranteed: scenarios.guaranteed.yearEndValues,
            customCapped: scenarios.customCapped.yearEndValues,
            customFull: scenarios.customFull.yearEndValues,
        };
    },
    
    // Lấy tên các sản phẩm 
    getProductLabel(key) {
      return PRODUCT_CATALOG[key]?.name || key || '';
    },
    
    // Xây dữ liệu trong bảng 1
    
    buildPart1RowsData(ctx) {
    const { persons, productKey, paymentTerm, targetAge, riderFactor, periods, isAnnual, waiverPremiums, freq, appState } = ctx;
    const mainPerson = persons.find(p => p.isMain);
    const mainAge = mainPerson?.age || 0;
    const riderMaxAge = (key) => (PRODUCT_CATALOG[key]?.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 64);

    let rows = [], perPersonTotals = [], grand = { per: 0, eq: 0, base: 0, diff: 0 };
    
    const pushRow = (acc, personName, prodName, stbhDisplay, years, baseAnnual, isRider) => {
        if (baseAnnual <= 0) return;
        let perPeriod = 0, annualEq = 0, diff = 0;
        if (!isAnnual) {
            if (isRider) {
                perPeriod = Math.round((baseAnnual * riderFactor) / periods / 1000) * 1000;
                annualEq = perPeriod * periods;
                diff = annualEq - baseAnnual;
            } else {
                perPeriod = Math.round(baseAnnual / periods / 1000) * 1000;
                annualEq = perPeriod * periods;
                diff = annualEq - baseAnnual;
            }
        }
        acc.per += perPeriod; acc.eq += annualEq; acc.base += baseAnnual; acc.diff += diff;
        rows.push({ personName, prodName, stbhDisplay, years, perPeriod, annualEq, diff, annualBase: baseAnnual });
    };

    persons.forEach(p => {
        const acc = { per: 0, eq: 0, base: 0, diff: 0 };
        
        if (p.isMain && productKey) {
            let productName = this.getProductLabel(productKey);
            const baseAnnual = appState.fees.baseMain;
            const mainProductConfig = PRODUCT_CATALOG[productKey];

            if (mainProductConfig.group === 'PACKAGE') {
                const underlyingConfig = PRODUCT_CATALOG[mainProductConfig.packageConfig.underlyingMainProduct];
                if(underlyingConfig) productName = underlyingConfig.name;
            }

            const stbhVal = appState.mainProduct.values['main-stbh'] || mainProductConfig.packageConfig?.fixedValues.stbh;
            if (baseAnnual > 0) {
                pushRow(acc, p.name, productName, formatCurrency(stbhVal), paymentTerm || '—', baseAnnual, false);
            }
        }
        if (p.isMain && (appState.mainProduct.values['extra-premium'] || 0) > 0) {
            pushRow(acc, p.name, GLOBAL_CONFIG.LABELS.EXTRA_PREMIUM, '—', paymentTerm || '—', appState.mainProduct.values['extra-premium'] || 0, false);
        }
        
        if (p.supplements) {
            for (const rid in p.supplements) {
                const prodConfig = PRODUCT_CATALOG[rid];
                if (!prodConfig) continue;

                const baseAnnual = appState.fees.byPerson[p.id]?.suppDetails?.[rid] || 0;
                if (baseAnnual <= 0) continue;
                
                let stbh = 0, prodName = '', years = 0, stbhDisplay = '—';
                const isWaiver = prodConfig.category === 'waiver';

                if (isWaiver) {
                    const waiverData = waiverPremiums[rid];
                    stbh = waiverData.stbhBase;
                    prodName = prodConfig.name;
                    const resolverKey = prodConfig.waiverTermKey;
                    const resolverFunc = resolverKey && appState.context.registries.CALC_REGISTRY.waiverResolvers[resolverKey];
                    if (resolverFunc) {
                        years = resolverFunc({ waiverHolder: p, mainInsured: mainPerson, targetAge, productConfig: prodConfig });
                    }
                } else {
                    const maxA = riderMaxAge(rid);
                    years = Math.max(0, Math.min(maxA - p.age, targetAge - mainAge) + 1);
                    stbh = this.resolveRiderStbh({ rid, person: p, appState });
                    prodName = this.resolveRiderDisplayName({ rid, person: p, appState });
                }
                
                stbhDisplay = stbh ? formatCurrency(stbh) : '—';
                pushRow(acc, p.name, prodName, stbhDisplay, years, baseAnnual, true);
            }
        }
        
        if (acc.base > 0) {
            perPersonTotals.push({ personName: p.name, ...acc });
            grand.per += acc.per; grand.eq += acc.eq; grand.base += acc.base; grand.diff += acc.diff;
        }
    });

    return { rows, perPersonTotals, grand, isAnnual, periods, riderFactor, freqLabel: GLOBAL_CONFIG.PAYMENT_FREQUENCY_LABELS[freq] || freq };
    },

    // Xây dữ liệu bảng 3
    
    buildPart2ScheduleRows(ctx) {
    const { persons, mainPerson, paymentTerm, targetAge, periods, isAnnual, riderFactor, waiverPremiums, appState } = ctx;
    const riderMaxAge = (key) => (PRODUCT_CATALOG[key]?.rules.eligibility.find(r => r.renewalMax)?.renewalMax || 64);
    const rows = [];
    const baseMainAnnual = appState?.fees?.baseMain || 0;
    const extraAnnual = appState.mainProduct.values['extra-premium'] || 0;
    
    const fixedWaiverPremiums = {};
    Object.entries(waiverPremiums).forEach(([waiverId, waiverData]) => {
        if (waiverData.premium > 0 && waiverData.targetPerson) {
            fixedWaiverPremiums[waiverData.targetPerson.id] = fixedWaiverPremiums[waiverData.targetPerson.id] || {};
            fixedWaiverPremiums[waiverData.targetPerson.id][waiverId] = waiverData.premium;
        }
    });

    for (let year = 1; mainPerson.age + year - 1 <= targetAge; year++) {
        const currentAge = mainPerson.age + year - 1;
        const inTerm = year <= paymentTerm;
        const mainYearBase = inTerm ? baseMainAnnual : 0;
        const extraYearBase = inTerm ? extraAnnual : 0;
        const perPersonSuppBase = [], perPersonSuppPerPeriod = [], perPersonSuppAnnualEq = [];

        persons.forEach(p => {
            let sumBase = 0, sumPer = 0;
            const attained = p.age + year - 1;
            
            const addRider = (baseFee) => {
                if (!baseFee) return;
                sumBase += baseFee;
                if (!isAnnual) sumPer += Math.round((baseFee * riderFactor) / periods / 1000) * 1000;
            };

            if (p.supplements) {
                for(const rid in p.supplements) {
                     const prodConfig = PRODUCT_CATALOG[rid];
                     const calcKey = prodConfig?.calculation?.calculateKey;
                     const calcFunc = calcKey && appState.context.registries.CALC_REGISTRY[calcKey];

                     if (!calcFunc || prodConfig.category === 'waiver') continue;
                     
                     if (attained > riderMaxAge(rid)) continue;

                     const tempCustomer = { ...p, age: attained };

                     const premiumForYear = calcFunc({ 
                         customer: tempCustomer,
                         mainPremium: baseMainAnnual, 
                         allPersons: appState.persons,
                         accumulators: { totalHospitalSupportStbh: 0 }, // Simplified for projection
                         helpers: appState.context.helpers,
                         params: prodConfig.calculation.params || {},
                         state: appState
                     });
                     addRider(premiumForYear);
                }
            }
            
            if (fixedWaiverPremiums[p.id]) {
                Object.entries(fixedWaiverPremiums[p.id]).forEach(([waiverId, premium]) => {
                    const wConfig = PRODUCT_CATALOG[waiverId];
                    const eligibilityKey = wConfig?.waiverEligibilityKey;
                    const resolverFunc = eligibilityKey && appState.context.registries.CALC_REGISTRY.waiverResolvers[eligibilityKey];
                    if (resolverFunc && resolverFunc({ attainedAge: attained, productConfig: wConfig })) {
                        addRider(premium);
                    }
                });
            }
            
            perPersonSuppBase.push(sumBase);
            perPersonSuppPerPeriod.push(sumPer);
            perPersonSuppAnnualEq.push(isAnnual ? sumBase : sumPer * periods);
        });

        const suppBaseTotal = perPersonSuppBase.reduce((a, b) => a + b, 0);
        const suppAnnualEqTotal = perPersonSuppAnnualEq.reduce((a, b) => a + b, 0);
        const totalYearBase = mainYearBase + extraYearBase + suppBaseTotal;
        const totalAnnualEq = isAnnual ? totalYearBase : (Math.round((mainYearBase + extraYearBase)/periods / 1000) * 1000)*periods + suppAnnualEqTotal;
        const diff = totalAnnualEq - totalYearBase;
        rows.push({ year, age: currentAge, mainYearBase, extraYearBase, perPersonSuppBase, perPersonSuppAnnualEq, totalYearBase, totalAnnualEq, diff });
    }
    return { rows, extraAllZero: rows.every(r => r.extraYearBase === 0) };
},

// Lấy số tiền rider    
resolveRiderStbh({ rid, person, appState }) {
    const prodConfig = PRODUCT_CATALOG[rid];
    const data = person.supplements[rid] || {};
    if (prodConfig?.stbhKey) {
        const [resolver, param] = prodConfig.stbhKey.split(':');
        const resolverFunc = appState.context.registries.UI_FUNCTIONS?.stbh?.[resolver];
        if (resolverFunc) {
            return resolverFunc({ person, data, productConfig: prodConfig, params: { ...prodConfig.stbhKeyParams, controlId: param }, state: appState }) || 0;
        }
    }
    return data.stbh || 0;
},

resolveRiderDisplayName({ rid, person, appState }) {
    const prodConfig = PRODUCT_CATALOG[rid];
    const data = person.supplements[rid] || {};
    if (prodConfig?.displayNameKey) {
        const resolverFunc = appState.context.registries.UI_FUNCTIONS.displayName[prodConfig.displayNameKey];
        if (resolverFunc) {
            return resolverFunc({ person, data, state: appState });
        }
    }
    return this.getProductLabel(rid);
}

};
