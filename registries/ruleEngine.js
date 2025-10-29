
export const RULE_ENGINE = {
    /**
     * Evaluates a set of rules against a given context.
     * @param {Array|Object} rules - A single rule object or an array of rule objects.
     * @param {Object} context - The context object, typically { customer, mainProduct, state }.
     * @returns {boolean} - True if all rules pass, false otherwise.
     */
    evaluate(rules, context) {
        if (!rules) return true; // No rules means it's valid/visible/enabled.
        if (!Array.isArray(rules)) rules = [rules];

        for (const rule of rules) {
            if (!this.evaluateSingle(rule, context)) {
                return false; // First rule failure causes early exit.
            }
        }
        return true;
    },

    /**
     * Evaluates a single rule object.
     * @param {Object} rule - The rule object to evaluate.
     * @param {Object} context - The context.
     * @returns {boolean} - The result of the rule evaluation.
     */
    evaluateSingle(rule, context) {
        if (!rule) return true;
        
        const { customer, state } = context;
        if (!customer) return true; // Cannot evaluate without a customer context.

        switch (rule.type) {
            case 'daysFromBirth':
                return customer.daysFromBirth >= rule.min;
            case 'age':
                return (rule.min == null || customer.age >= rule.min) &&
                       (rule.max == null || customer.age <= rule.max);
            case 'riskGroup':
                if (rule.exclude && customer.riskGroup > 0 && rule.exclude.includes(customer.riskGroup)) return false;
                if (rule.required && customer.riskGroup === 0) return false;
                return true;
            case 'isNotMain':
                return !customer.isMain;
            case 'isMain':
                return customer.isMain;
            case 'gender':
                return customer.gender === rule.value;
            case 'mainProductGroup':
                return state.mainProduct.key && state.mainProduct.key.startsWith(rule.value);
            case 'mandatoryInPackage':
                const mainConfig = state.PRODUCT_CATALOG[state.mainProduct.key];
                return mainConfig?.group === 'PACKAGE' && mainConfig.packageConfig.mandatoryRiders.includes(rule.productKey);
            case 'disabledByPackage':
                const mainCfg = state.PRODUCT_CATALOG[state.mainProduct.key];
                return mainCfg?.group === 'PACKAGE' && !mainCfg.packageConfig.mandatoryRiders.includes(rule.productKey);
            default:
                return true; 
        }
    }
};
