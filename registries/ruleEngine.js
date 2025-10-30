export const RULE_ENGINE = {
    /**
     * Evaluates a set of rules with AND logic. All rules must pass.
     * Returns true for an empty/undefined rule set.
     */
    evaluateAnd(rules, context) {
        if (!rules) return true;
        if (typeof rules === 'boolean') return rules;
        const ruleSet = Array.isArray(rules) ? rules : [rules];
        return ruleSet.every(rule => this.evaluateSingle(rule, context));
    },

    /**
     * Evaluates a set of rules with OR logic. Any rule passing is a success.
     * Returns false for an empty/undefined rule set.
     */
    evaluateOr(rules, context) {
        if (!rules) return false;
        if (typeof rules === 'boolean') return rules;
        const ruleSet = Array.isArray(rules) ? rules : [rules];
        return ruleSet.some(rule => this.evaluateSingle(rule, context));
    },

    /**
     * Evaluates a single rule object.
     */
    evaluateSingle(rule, context) {
        if (!rule) return true;
        
        const { customer, state, productKey, PRODUCT_CATALOG } = context;
        if (!state) return true; 

        switch (rule.type) {
            case 'daysFromBirth':
                return customer && customer.daysFromBirth >= rule.min;
            case 'age':
                return customer && (rule.min == null || customer.age >= rule.min) && (rule.max == null || customer.age <= rule.max);
            case 'riskGroup':
                if (!customer) return true;
                if (rule.exclude && customer.riskGroup > 0 && rule.exclude.includes(customer.riskGroup)) return false;
                if (rule.required && customer.riskGroup === 0) return false;
                return true;
            case 'isNotMain':
                return customer && !customer.isMain;
            case 'isMain':
                return customer && customer.isMain;
            case 'gender':
                return customer && customer.gender === rule.value;
            case 'mainProductGroup':
                const mainProdConfig = PRODUCT_CATALOG[state.mainProduct.key];
                return mainProdConfig && mainProdConfig.group === rule.value;
            case 'mandatoryInPackage':
                const mainConfig = PRODUCT_CATALOG[state.mainProduct.key];
                return mainConfig?.group === 'PACKAGE' && mainConfig.packageConfig.mandatoryRiders.includes(productKey);
            case 'disabledByPackage':
                const mainCfg = PRODUCT_CATALOG[state.mainProduct.key];
                return mainCfg?.group === 'PACKAGE' && !mainCfg.packageConfig.mandatoryRiders.includes(productKey);
            default:
                return true; 
        }
    },
    
    /**
     * Resolves a value based on a key string (e.g., 'resolver:param').
     * @param {string} key The key to resolve.
     * @param {object} context The context object containing necessary data (e.g., values).
     * @returns The resolved value.
     */
    resolveFieldByKey(key, context) {
        if (!key) return null;
        const [resolver, param] = key.split(':');
        
        if (resolver === 'from_control') {
            return context.values?.[param] || 0;
        }

        if (resolver === 'fixed_value') {
            return param;
        }
        
        return 0; // default
    }
};
