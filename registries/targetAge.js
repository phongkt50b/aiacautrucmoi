
import { PRODUCT_CATALOG } from "../structure.js";

const VALUE_RESOLVERS = {
    fixed_99: () => 99,
    agePlusTermMinus1: ({ mainPerson, values }) => {
        const productConfig = PRODUCT_CATALOG[values.key];
        if (!productConfig || !productConfig.getPaymentTerm) return mainPerson.age;
        const term = parseInt(productConfig.getPaymentTerm(values) || '0', 10);
        return term ? mainPerson.age + term - 1 : mainPerson.age;
    }
};

const HINT_RESOLVERS = {
    default_hint: ({ mainPerson, values }) => {
        const productConfig = PRODUCT_CATALOG[values.key];
        if (!productConfig || !productConfig.getPaymentTerm) return 'Nhập thời gian đóng phí để xác định tuổi minh họa.';
        const term = parseInt(productConfig.getPaymentTerm(values) || '0', 10);
        if (!term) return 'Nhập thời gian đóng phí để xác định tuổi minh họa.';
        const minAge = mainPerson.age + term - 1;
        const maxAge = 99;
        return `Khoảng hợp lệ: <strong>${minAge}</strong> – <strong>${maxAge}</strong>.`;
    },
    auto_by_term: () => 'Tuổi kết thúc được tính tự động theo Thời hạn đóng phí.'
};

const CONSTRAINT_RESOLVERS = {
    agePlusTermMinus1: ({ mainPerson, values, state }) => {
        const productConfig = PRODUCT_CATALOG[state.mainProduct.key];
        if (!productConfig || !productConfig.getPaymentTerm) return mainPerson.age;
        const term = parseInt(productConfig.getPaymentTerm(values) || '0', 10);
        return mainPerson.age + term - 1;
    }
};


export const TARGET_AGE_REGISTRY = {
    resolveValue(key, context) {
        const resolver = VALUE_RESOLVERS[key];
        return resolver ? resolver(context) : (context.mainPerson?.age || 0);
    },
    resolveHint(key, context) {
        const resolver = HINT_RESOLVERS[key];
        return resolver ? resolver(context) : '';
    },
    resolveConstraint(key, context) {
        const resolver = CONSTRAINT_RESOLVERS[key];
        return resolver ? resolver(context) : 0;
    }
};
