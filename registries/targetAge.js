export const TARGET_AGE_REGISTRY = {
    _values: {
        fixed_99: () => 99,
        agePlusTerm: ({ mainPerson, values }) => {
            const term = parseInt(values['abuv-term'] || values['payment-term'] || '0', 10);
            return term ? (mainPerson.age || 0) + term - 1 : (mainPerson.age || 0);
        },
        agePlusFixedTerm: ({ mainPerson, params }) => {
            const term = parseInt(params.term || '0', 10);
            return (mainPerson.age || 0) + term - 1;
        }
    },
    _hints: {
        pul_mul: ({ mainPerson, values }) => {
            const term = parseInt(values['payment-term'] || '0', 10);
            if (!term) return 'Nhập thời gian đóng phí để xác định tuổi minh họa.';
            const minAge = (mainPerson.age || 0) + term;
            const maxAge = 99;
            return `Khoảng hợp lệ: <strong>${minAge}</strong> – <strong>${maxAge}</strong>.`;
        },
        abuv: () => 'Tuổi kết thúc được tính tự động theo Thời hạn đóng phí.',
        tta: () => 'Sản phẩm có thời hạn hợp đồng cố định.'
    },
    _constraints: {
        min_agePlusTerm: ({ mainPerson, values }) => {
            const term = parseInt(values['payment-term'] || '0', 10);
            return (mainPerson.age || 0) + term;
        },
        max_fixed_99: () => 99,
    },

    resolveValue(key, context) {
        if (this._values[key]) return this._values[key](context);
        return 0;
    },
    resolveHint(key, context) {
        if (this._hints[key]) return this._hints[key](context);
        return '';
    },
    resolveConstraint(key, context) {
        if (!key) return null;
        if (this._constraints[key]) return this._constraints[key](context);
        return 0;
    }
};
