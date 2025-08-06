import * as DATA from './data.js';

export function calculateAge(dobString) {
    if (!dobString || !new RegExp('^\\d{2}/\\d{2}/\\d{4}$').test(dobString)) {
        return null;
    }
    const [day, month, year] = dobString.split('/').map(Number);
    const dob = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age < 0 ? 0 : age;
}

function findRate(table, age, gender) {
    const record = table.find(r => age >= r.age_min && age <= r.age_max);
    return record ? record[gender.toLowerCase()] : null;
}

function findRateByAge(table, age) {
    const record = table.find(r => r.age === age);
    return record || null;
}

export function getMulPremiumRange(sumAssured, age) {
    if (!sumAssured || age === null) return null;
    const record = DATA.MUL_COEFFICIENTS.find(r => age >= r.age_min && age <= r.age_max);
    if (!record) return null;
    
    return {
        min: Math.round(sumAssured / record.max_coeff),
        max: Math.round(sumAssured / record.min_coeff),
    };
}

export function calculateMainPremium(inputs) {
    if (!inputs.product) return 0;
    const age = calculateAge(inputs.dob);
    if (age === null) return 0;

    const rules = DATA.PRODUCT_RULES[inputs.product];
    if (!rules) return 0;

    switch (rules.type) {
        case 'PUL_MUL':
            if (rules.subType === 'PUL') {
                if (!inputs.sumAssuredPul) return 0;
                const table = DATA.PUL_RATES;
                const record = findRateByAge(table, age);
                const rateKey = `${inputs.product.toLowerCase()}_${inputs.gender.toLowerCase()}`;
                const rate = record ? record[rateKey] : 0;
                return rate ? Math.round((inputs.sumAssuredPul / 1000) * rate) : 0;
            } else { // MUL
                return inputs.mainPremiumMul;
            }

        case 'ABUV': {
            if (!inputs.sumAssuredAbuv || !inputs.premiumTermAbuv) return 0;
            const table = DATA.AN_BINH_UU_VIET_RATES[inputs.premiumTermAbuv];
            if (!table) return 0;
            const record = findRateByAge(table, age);
            const rate = record ? record[inputs.gender.toLowerCase()] : 0;
            return rate ? Math.round((inputs.sumAssuredAbuv / 1000) * rate) : 0;
        }
        
        case 'TTA': {

            const table = DATA.AN_BINH_UU_VIET_RATES[10];
            const record = findRateByAge(table, age);
            const rate = record ? record[inputs.gender.toLowerCase()] : 0;
            return rate ? Math.round((100000000 / 1000) * rate) : 0;
        }

        default:
            return 0;
    }
}

function calculateHealthRiderPremium(age, gender, inputs) {
    if (!inputs.participate || !inputs.program || !inputs.scope) return 0;
    
    let totalFee = 0;
    const scopeKey = inputs.scope === 'VN' ? 'vietnam' : 'global';


    const mainTable = DATA.HEALTH_RIDER_RATES.main[scopeKey];
    const mainRecord = mainTable.find(r => age >= r.age_min && age <= r.age_max);
    if (mainRecord) {
        totalFee += mainRecord[inputs.program] || 0;
    } else {
        return 0; // Not eligible for this age
    }


    if (inputs.outpatient) {
        const outpatientTable = DATA.HEALTH_RIDER_RATES.outpatient;
        const outpatientRecord = outpatientTable.find(r => age >= r.age_min && age <= r.age_max);
        if (outpatientRecord) {
            totalFee += outpatientRecord[inputs.program] || 0;
        }
    }
    

    if (inputs.dental) {
        const dentalTable = DATA.HEALTH_RIDER_RATES.dental;
        const dentalRecord = dentalTable.find(r => age >= r.age_min && age <= r.age_max);
        if (dentalRecord) {
            totalFee += dentalRecord[inputs.program] || 0;
        }
    }
    
    return totalFee;
}

function calculateCiRiderPremium(age, gender, inputs) {
    if (!inputs.participate || !inputs.sumAssured) return 0;
    
    const rate = findRate(DATA.CRITICAL_ILLNESS_RATES, age, gender);
    return rate ? Math.round((inputs.sumAssured / 1000) * rate) : 0;
}


export function generateIllustration(inputs) {
    const startAge = calculateAge(inputs.dob);
    if (startAge === null) throw new Error("Ngày sinh không hợp lệ.");

    const mainPremium = calculateMainPremium(inputs);
    const productRules = DATA.PRODUCT_RULES[inputs.product];
    if (!productRules) throw new Error("Sản phẩm không hợp lệ.");
    
    let endAge;
    let premiumTerm;
    
    if (productRules.type === 'PUL_MUL') {
        endAge = inputs.endAge;
        premiumTerm = inputs.premiumTermPul;
    } else if (productRules.type === 'ABUV') {
        premiumTerm = inputs.premiumTermAbuv;
        endAge = startAge + premiumTerm;
    } else if (productRules.type === 'TTA') {
        premiumTerm = 10;
        endAge = startAge + 10;
    }

    if (!endAge || endAge <= startAge) {
         throw new Error("Năm kết thúc minh họa không hợp lệ.");
    }

    const rows = [];
    const totals = { mainPremium: 0, healthPremium: 0, ciPremium: 0, total: 0 };
    
    for (let i = 0; i < (endAge - startAge); i++) {
        const currentAge = startAge + i;
        const year = i + 1;
        
        const row = {
            year: year,
            age: currentAge,
            mainPremium: 0,
            healthPremium: 0,
            ciPremium: 0,
            total: 0
        };

        if (year <= premiumTerm) {
            row.mainPremium = mainPremium;
        }

        if (inputs.healthRider.participate) {
            row.healthPremium = calculateHealthRiderPremium(currentAge, inputs.gender, inputs.healthRider);
        }
        
        if (inputs.ciRider.participate) {
            row.ciPremium = calculateCiRiderPremium(currentAge, inputs.gender, inputs.ciRider);
        }

        row.total = row.mainPremium + row.healthPremium + row.ciPremium;
        rows.push(row);
        
        totals.mainPremium += row.mainPremium;
        totals.healthPremium += row.healthPremium;
        totals.ciPremium += row.ciPremium;
        totals.total += row.total;
    }
    
    return { rows, totals };
}
