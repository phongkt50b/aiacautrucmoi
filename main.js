import * as ui from './ui_manager.js';
import * as calculator from './calculator.js';
import { PRODUCT_RULES } from './data.js';

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    const form = document.getElementById('insurance-form');
    if (!form) return;

    const elements = ui.getFormElements();

    function updateAll() {
        const inputs = ui.readFormInputs();
        if (!inputs.dob) {
            ui.updateAgeDisplay(null);
            return;
        }

        const age = calculator.calculateAge(inputs.dob);
        ui.updateAgeDisplay(age);

        if (age === null) return;
        
        ui.updateProductVisibility(age, inputs.gender);
        
        const selectedProduct = elements.mainProduct.value;
        if (selectedProduct) {
            handleProductChange();
        }
    }
    
    function handleProductChange() {
        const inputs = ui.readFormInputs();
        const age = calculator.calculateAge(inputs.dob);
        const mainPremium = calculator.calculateMainPremium(inputs);
       
        ui.updateProductDetailsVisibility(inputs.product);
        ui.updateRidersVisibility(inputs.product, age, inputs.gender);

        if (inputs.product === 'ABUV') {
            ui.updateAbuvTermOptions(age);
        } else if (PRODUCT_RULES[inputs.product]?.type === 'PUL_MUL') {
            const range = calculator.getMulPremiumRange(inputs.sumAssuredPul, age);
            ui.updateMulPremiumRange(range);
            if (PRODUCT_RULES[inputs.product]?.subType === 'PUL') {
                ui.updatePulPremiumDisplay(mainPremium);
            }
        }
        
        ui.updateHealthProgramOptions(inputs.product, mainPremium);
    }
    
    function validateAndGenerate(event) {
        event.preventDefault();
        const inputs = ui.readFormInputs();

        const mainPremium = calculator.calculateMainPremium(inputs);
        
        if (PRODUCT_RULES[inputs.product]?.type === 'PUL_MUL' && mainPremium < 5000000) {
            ui.setMainPremiumError('Phí sản phẩm chính phải từ 5,000,000 VNĐ trở lên.');
            elements.resultsContainer.classList.add('hidden');
            return;
        }
        ui.setMainPremiumError('');

        try {
            const illustrationData = calculator.generateIllustration(inputs);
            ui.renderIllustration(inputs, illustrationData);
            elements.resultsContainer.classList.remove('hidden');
            elements.resultsContainer.scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            console.error("Error generating illustration:", error);
            alert(`Đã xảy ra lỗi khi tạo bảng minh họa: ${error.message}`);
        }
    }
    

    [elements.dob, elements.gender].forEach(el => el.addEventListener('change', updateAll));
    elements.mainProduct.addEventListener('change', handleProductChange);

    [elements.sumAssuredPul, elements.sumAssuredAbuv, elements.premiumTermPul, elements.premiumTermAbuv, elements.mainPremiumMul].forEach(el => {
        el.addEventListener('input', () => {
             const inputs = ui.readFormInputs();
             const mainPremium = calculator.calculateMainPremium(inputs);
             ui.updateHealthProgramOptions(inputs.product, mainPremium);
             
             if (PRODUCT_RULES[inputs.product]?.subType === 'PUL') {
                ui.updatePulPremiumDisplay(mainPremium);
            }
        });
    });

    ['sum-assured-pul', 'sum-assured-abuv', 'main-premium-mul', 'topup-premium', 'ci-sum-assured'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('input', (e) => ui.formatNumberInput(e.target));
            el.addEventListener('blur', (e) => ui.formatNumberInput(e.target, true));
        }
    });

    elements.dob.addEventListener('input', ui.formatDateInput);
    elements.healthRiderCheck.addEventListener('change', ui.toggleHealthRiderOptions);
    elements.ciRiderCheck.addEventListener('change', ui.toggleCiRiderOptions);

    elements.topupPremium.addEventListener('input', () => {
        const inputs = ui.readFormInputs();
        const mainPremium = calculator.calculateMainPremium(inputs);
        const topup = inputs.topupPremium;
        if (mainPremium && topup > mainPremium * 5) {
             ui.setTopupError('Phí đóng thêm không quá 5 lần phí chính.');
        } else {
             ui.setTopupError('');
        }
    });

    form.addEventListener('submit', validateAndGenerate);


    updateAll();
});
