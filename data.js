


export const PRODUCT_RULES = {
    PUL_td: {
        name: 'PUL trọn đời',
        type: 'PUL_MUL',
        subType: 'PUL',
        eligibility: { minAge: 0, maxAge: 70 },
        riders: {
            health: { allowed: true, mandatory: false, minAge: 0, maxAge: 65 },
            ci: { allowed: true, mandatory: false, minAge: 0, maxAge: 70 },
        }
    },
    PUL_15: {
        name: 'PUL 15 năm',
        type: 'PUL_MUL',
        subType: 'PUL',
        eligibility: { minAge: 0, maxAge: 70 },
        riders: {
            health: { allowed: true, mandatory: false, minAge: 0, maxAge: 65 },
            ci: { allowed: true, mandatory: false, minAge: 0, maxAge: 70 },
        }
    },
    PUL_5: {
        name: 'PUL 5 năm',
        type: 'PUL_MUL',
        subType: 'PUL',
        eligibility: { minAge: 0, maxAge: 70 },
        riders: {
            health: { allowed: true, mandatory: false, minAge: 0, maxAge: 65 },
            ci: { allowed: true, mandatory: false, minAge: 0, maxAge: 70 },
        }
    },
    MUL_KBA: {
        name: 'MUL - Khoẻ Bình An',
        type: 'PUL_MUL',
        subType: 'MUL',
        eligibility: { minAge: 0, maxAge: 70 },
        riders: {
            health: { allowed: true, mandatory: false, minAge: 0, maxAge: 65 },
            ci: { allowed: true, mandatory: false, minAge: 0, maxAge: 70 },
        }
    },
    MUL_VTL: {
        name: 'MUL - Vững Tương Lai',
        type: 'PUL_MUL',
        subType: 'MUL',
        eligibility: { minAge: 0, maxAge: 70 },
        riders: {
            health: { allowed: true, mandatory: false, minAge: 0, maxAge: 65 },
            ci: { allowed: true, mandatory: false, minAge: 0, maxAge: 70 },
        }
    },
    TTA: {
        name: 'Trọn tâm an',
        type: 'TTA',
        eligibility: { minAge: 12, maxAge: 100, gender: 'Nam' }, // Note: separate logic for female needed or combine. Assuming single rule for now. And 28 for Nữ
        riders: {
            health: { allowed: true, mandatory: true, minAge: 0, maxAge: 65 },
            ci: { allowed: false },
        }
    },
    ABUV: {
        name: 'An Bình Ưu Việt',
        type: 'ABUV',
        eligibility: { minAge: 12, maxAge: 100, gender: 'Nam' }, // Note: And 28 for Nữ
        riders: {
            health: { allowed: true, mandatory: false, minAge: 0, maxAge: 65 },
            ci: { allowed: true, mandatory: false, minAge: 0, maxAge: 70 },
        }
    }
};


export const PUL_RATES = [
    { age: 0, pul_td_nam: 6.1, pul_td_nu: 5.7, pul_15_nam: 6.1, pul_15_nu: 5.7, pul_5_nam: 7.8, pul_5_nu: 6.0 },
    { age: 1, pul_td_nam: 6.1, pul_td_nu: 5.7, pul_15_nam: 6.1, pul_15_nu: 5.7, pul_5_nam: 7.8, pul_5_nu: 6.0 },
    { age: 2, pul_td_nam: 6.1, pul_td_nu: 5.7, pul_15_nam: 6.1, pul_15_nu: 5.7, pul_5_nam: 7.8, pul_5_nu: 6.0 },
    { age: 3, pul_td_nam: 6.1, pul_td_nu: 5.7, pul_15_nam: 6.1, pul_15_nu: 5.7, pul_5_nam: 7.8, pul_5_nu: 6.0 },
    { age: 4, pul_td_nam: 6.1, pul_td_nu: 5.7, pul_15_nam: 6.1, pul_15_nu: 5.7, pul_5_nam: 7.8, pul_5_nu: 6.0 },
    { age: 5, pul_td_nam: 6.1, pul_td_nu: 5.7, pul_15_nam: 6.1, pul_15_nu: 5.7, pul_5_nam: 7.9, pul_5_nu: 6.2 },
    { age: 6, pul_td_nam: 6.1, pul_td_nu: 5.7, pul_15_nam: 6.1, pul_15_nu: 5.7, pul_5_nam: 8.1, pul_5_nu: 6.3 },
    { age: 7, pul_td_nam: 6.1, pul_td_nu: 5.8, pul_15_nam: 6.1, pul_15_nu: 5.8, pul_5_nam: 8.1, pul_5_nu: 6.3 },
    { age: 8, pul_td_nam: 6.2, pul_td_nu: 5.8, pul_15_nam: 6.2, pul_15_nu: 5.8, pul_5_nam: 8.5, pul_5_nu: 6.4 },
    { age: 9, pul_td_nam: 6.2, pul_td_nu: 5.8, pul_15_nam: 6.2, pul_15_nu: 5.8, pul_5_nam: 8.8, pul_5_nu: 6.8 },
    { age: 10, pul_td_nam: 6.3, pul_td_nu: 5.9, pul_15_nam: 6.3, pul_15_nu: 5.9, pul_5_nam: 9.1, pul_5_nu: 7.0 },
    { age: 11, pul_td_nam: 6.3, pul_td_nu: 5.9, pul_15_nam: 6.3, pul_15_nu: 5.9, pul_5_nam: 9.4, pul_5_nu: 7.3 },
    { age: 12, pul_td_nam: 6.3, pul_td_nu: 6.0, pul_15_nam: 6.3, pul_15_nu: 6.0, pul_5_nam: 9.8, pul_5_nu: 7.5 },
    { age: 13, pul_td_nam: 6.4, pul_td_nu: 6.0, pul_15_nam: 6.4, pul_15_nu: 6.0, pul_5_nam: 9.8, pul_5_nu: 7.8 },
    { age: 14, pul_td_nam: 6.4, pul_td_nu: 6.0, pul_15_nam: 6.4, pul_15_nu: 6.0, pul_5_nam: 10.3, pul_5_nu: 8.1 },
    { age: 15, pul_td_nam: 6.5, pul_td_nu: 6.1, pul_15_nam: 6.5, pul_15_nu: 6.1, pul_5_nam: 10.7, pul_5_nu: 8.3 },
    { age: 16, pul_td_nam: 6.5, pul_td_nu: 6.1, pul_15_nam: 6.5, pul_15_nu: 6.1, pul_5_nam: 11.4, pul_5_nu: 8.8 },
    { age: 17, pul_td_nam: 6.5, pul_td_nu: 6.1, pul_15_nam: 6.5, pul_15_nu: 6.1, pul_5_nam: 11.5, pul_5_nu: 9.2 },
    { age: 18, pul_td_nam: 6.6, pul_td_nu: 6.2, pul_15_nam: 6.6, pul_15_nu: 6.2, pul_5_nam: 12.3, pul_5_nu: 9.6 },
    { age: 19, pul_td_nam: 6.6, pul_td_nu: 6.2, pul_15_nam: 6.6, pul_15_nu: 6.2, pul_5_nam: 12.5, pul_5_nu: 9.8 },
    { age: 20, pul_td_nam: 6.7, pul_td_nu: 6.3, pul_15_nam: 6.7, pul_15_nu: 6.3, pul_5_nam: 13.0, pul_5_nu: 10.5 },
    { age: 21, pul_td_nam: 6.8, pul_td_nu: 6.3, pul_15_nam: 6.8, pul_15_nu: 6.3, pul_5_nam: 13.6, pul_5_nu: 11.0 },
    { age: 22, pul_td_nam: 6.8, pul_td_nu: 6.4, pul_15_nam: 6.8, pul_15_nu: 6.4, pul_5_nam: 14.5, pul_5_nu: 11.6 },
    { age: 23, pul_td_nam: 6.9, pul_td_nu: 6.5, pul_15_nam: 6.9, pul_15_nu: 6.5, pul_5_nam: 15.3, pul_5_nu: 12.2 },
    { age: 24, pul_td_nam: 7.0, pul_td_nu: 6.6, pul_15_nam: 7.0, pul_15_nu: 6.6, pul_5_nam: 16.2, pul_5_nu: 12.8 },
    { age: 25, pul_td_nam: 7.1, pul_td_nu: 6.7, pul_15_nam: 7.1, pul_15_nu: 6.7, pul_5_nam: 17.1, pul_5_nu: 13.5 },
    { age: 26, pul_td_nam: 7.2, pul_td_nu: 6.8, pul_15_nam: 7.2, pul_15_nu: 6.8, pul_5_nam: 18.0, pul_5_nu: 14.3 },
    { age: 27, pul_td_nam: 7.4, pul_td_nu: 6.9, pul_15_nam: 7.4, pul_15_nu: 6.9, pul_5_nam: 19.1, pul_5_nu: 14.9 },
    { age: 28, pul_td_nam: 7.5, pul_td_nu: 7.1, pul_15_nam: 7.5, pul_15_nu: 7.1, pul_5_nam: 20.6, pul_5_nu: 15.9 },
    { age: 29, pul_td_nam: 7.6, pul_td_nu: 7.2, pul_15_nam: 7.6, pul_15_nu: 7.2, pul_5_nam: 21.8, pul_5_nu: 16.9 },
    { age: 30, pul_td_nam: 7.7, pul_td_nu: 7.4, pul_15_nam: 7.7, pul_15_nu: 7.4, pul_5_nam: 23.6, pul_5_nu: 17.6 },
    { age: 31, pul_td_nam: 7.9, pul_td_nu: 7.6, pul_15_nam: 8.2, pul_15_nu: 7.6, pul_5_nam: 25.3, pul_5_nu: 18.3 },
    { age: 32, pul_td_nam: 8.1, pul_td_nu: 7.8, pul_15_nam: 9.0, pul_15_nu: 7.8, pul_5_nam: 27.0, pul_5_nu: 19.4 },
    { age: 33, pul_td_nam: 8.3, pul_td_nu: 7.9, pul_15_nam: 9.9, pul_15_nu: 7.9, pul_5_nam: 28.9, pul_5_nu: 20.6 },
    { age: 34, pul_td_nam: 8.5, pul_td_nu: 8.1, pul_15_nam: 10.5, pul_15_nu: 8.1, pul_5_nam: 31.7, pul_5_nu: 22.1 },
    { age: 35, pul_td_nam: 8.7, pul_td_nu: 8.3, pul_15_nam: 11.1, pul_15_nu: 8.3, pul_5_nam: 34.0, pul_5_nu: 23.4 },
    { age: 36, pul_td_nam: 9.1, pul_td_nu: 8.7, pul_15_nam: 11.8, pul_15_nu: 8.7, pul_5_nam: 36.6, pul_5_nu: 25.2 },
    { age: 37, pul_td_nam: 9.5, pul_td_nu: 9.1, pul_15_nam: 12.5, pul_15_nu: 9.1, pul_5_nam: 39.2, pul_5_nu: 26.7 },
    { age: 38, pul_td_nam: 10.0, pul_td_nu: 9.5, pul_15_nam: 13.5, pul_15_nu: 9.5, pul_5_nam: 42.3, pul_5_nu: 28.5 },
    { age: 39, pul_td_nam: 10.5, pul_td_nu: 10.0, pul_15_nam: 14.6, pul_15_nu: 10.1, pul_5_nam: 45.3, pul_5_nu: 30.5 },
    { age: 40, pul_td_nam: 11.1, pul_td_nu: 10.5, pul_15_nam: 15.7, pul_15_nu: 10.8, pul_5_nam: 49.4, pul_5_nu: 33.3 },
    { age: 41, pul_td_nam: 11.5, pul_td_nu: 10.9, pul_15_nam: 16.9, pul_15_nu: 11.5, pul_5_nam: 52.6, pul_5_nu: 34.9 },
    { age: 42, pul_td_nam: 11.9, pul_td_nu: 11.2, pul_15_nam: 18.2, pul_15_nu: 12.2, pul_5_nam: 56.1, pul_5_nu: 37.8 },
    { age: 43, pul_td_nam: 12.3, pul_td_nu: 11.6, pul_15_nam: 19.6, pul_15_nu: 13.1, pul_5_nam: 62.1, pul_5_nu: 40.9 },
    { age: 44, pul_td_nam: 12.8, pul_td_nu: 12.0, pul_15_nam: 21.3, pul_15_nu: 14.4, pul_5_nam: 66.2, pul_5_nu: 43.1 },
    { age: 45, pul_td_nam: 13.3, pul_td_nu: 12.5, pul_15_nam: 23.0, pul_15_nu: 15.5, pul_5_nam: 71.4, pul_5_nu: 47.3 },
    { age: 46, pul_td_nam: 14.3, pul_td_nu: 13.3, pul_15_nam: 24.6, pul_15_nu: 16.8, pul_5_nam: 77.2, pul_5_nu: 50.8 },
    { age: 47, pul_td_nam: 15.4, pul_td_nu: 14.3, pul_15_nam: 26.7, pul_15_nu: 17.4, pul_5_nam: 80.5, pul_5_nu: 54.5 },
    { age: 48, pul_td_nam: 16.7, pul_td_nu: 15.4, pul_15_nam: 29.4, pul_15_nu: 19.6, pul_5_nam: 88.5, pul_5_nu: 58.6 },
    { age: 49, pul_td_nam: 18.2, pul_td_nu: 16.7, pul_15_nam: 31.1, pul_15_nu: 21.6, pul_5_nam: 93.8, pul_5_nu: 63.5 },
    { age: 50, pul_td_nam: 20.0, pul_td_nu: 18.2, pul_15_nam: 32.6, pul_15_nu: 23.1, pul_5_nam: 100.6, pul_5_nu: 68.7 },
    { age: 51, pul_td_nam: 21.3, pul_td_nu: 19.2, pul_15_nam: 36.2, pul_15_nu: 25.3, pul_5_nam: 106.7, pul_5_nu: 73.4 },
    { age: 52, pul_td_nam: 22.7, pul_td_nu: 20.4, pul_15_nam: 36.2, pul_15_nu: 27.2, pul_5_nam: 112.7, pul_5_nu: 77.9 },
    { age: 53, pul_td_nam: 24.4, pul_td_nu: 21.7, pul_15_nam: 40.1, pul_15_nu: 29.4, pul_5_nam: 119.6, pul_5_nu: 87.0 },
    { age: 54, pul_td_nam: 26.3, pul_td_nu: 23.3, pul_15_nam: 42.5, pul_15_nu: 31.3, pul_5_nam: 126.2, pul_5_nu: 91.0 },
    { age: 55, pul_td_nam: 28.6, pul_td_nu: 25.0, pul_15_nam: 45.3, pul_15_nu: 33.3, pul_5_nam: 132.4, pul_5_nu: 99.3 },
    { age: 56, pul_td_nam: 30.3, pul_td_nu: 26.3, pul_15_nam: 49.4, pul_15_nu: 35.4, pul_5_nam: 138.3, pul_5_nu: 105.0 },
    { age: 57, pul_td_nam: 32.3, pul_td_nu: 27.8, pul_15_nam: 51.2, pul_15_nu: 38.5, pul_5_nam: 144.5, pul_5_nu: 113.1 },
    { age: 58, pul_td_nam: 34.5, pul_td_nu: 29.4, pul_15_nam: 53.2, pul_15_nu: 41.7, pul_5_nam: 152.7, pul_5_nu: 118.9 },
    { age: 59, pul_td_nam: 37.0, pul_td_nu: 31.3, pul_15_nam: 57.2, pul_15_nu: 45.0, pul_5_nam: 157.5, pul_5_nu: 131.0 },
    { age: 60, pul_td_nam: 40.0, pul_td_nu: 33.3, pul_15_nam: 58.8, pul_15_nu: 45.9, pul_5_nam: 164.1, pul_5_nu: 134.6 },
    { age: 61, pul_td_nam: 41.7, pul_td_nu: 34.5, pul_15_nam: 62.5, pul_15_nu: 47.1, pul_5_nam: 169.6, pul_5_nu: 141.3 },
    { age: 62, pul_td_nam: 43.5, pul_td_nu: 35.7, pul_15_nam: 66.0, pul_15_nu: 52.1, pul_5_nam: 176.4, pul_5_nu: 152.2 },
    { age: 63, pul_td_nam: 45.5, pul_td_nu: 37.0, pul_15_nam: 68.0, pul_15_nu: 56.0, pul_5_nam: 183.1, pul_5_nu: 160.1 },
    { age: 64, pul_td_nam: 47.6, pul_td_nu: 38.5, pul_15_nam: 71.0, pul_15_nu: 58.5, pul_5_nam: 187.4, pul_5_nu: 165.7 },
    { age: 65, pul_td_nam: 55.6, pul_td_nu: 43.5, pul_15_nam: 74.0, pul_15_nu: 62.5, pul_5_nam: 192.3, pul_5_nu: 171.8 },
    { age: 66, pul_td_nam: 62.5, pul_td_nu: 47.6, pul_15_nam: 76.7, pul_15_nu: 65.4, pul_5_nam: 196.2, pul_5_nu: 178.9 },
    { age: 67, pul_td_nam: 71.4, pul_td_nu: 52.6, pul_15_nam: 80.2, pul_15_nu: 68.7, pul_5_nam: 202.4, pul_5_nu: 186.7 },
    { age: 68, pul_td_nam: 83.3, pul_td_nu: 58.8, pul_15_nam: 83.1, pul_15_nu: 71.2, pul_5_nam: 205.7, pul_5_nu: 190.9 },
    { age: 69, pul_td_nam: 100.0, pul_td_nu: 66.7, pul_15_nam: 111.1, pul_15_nu: 83.3, pul_5_nam: 222.3, pul_5_nu: 196.7 },
    { age: 70, pul_td_nam: 100.0, pul_td_nu: 66.7, pul_15_nam: 125.0, pul_15_nu: 100.0, pul_5_nam: 250.0, pul_5_nu: 250.0 }
];

export const MUL_COEFFICIENTS = [
    { age_min: 0, age_max: 9, min_coeff: 55, max_coeff: 150 },
    { age_min: 10, age_max: 16, min_coeff: 45, max_coeff: 150 },
    { age_min: 17, age_max: 19, min_coeff: 40, max_coeff: 150 },
    { age_min: 20, age_max: 29, min_coeff: 35, max_coeff: 140 },
    { age_min: 30, age_max: 34, min_coeff: 25, max_coeff: 120 },
    { age_min: 35, age_max: 39, min_coeff: 20, max_coeff: 100 },
    { age_min: 40, age_max: 44, min_coeff: 20, max_coeff: 70 },
    { age_min: 45, age_max: 49, min_coeff: 20, max_coeff: 50 },
    { age_min: 50, age_max: 54, min_coeff: 15, max_coeff: 40 },
    { age_min: 55, age_max: 59, min_coeff: 8, max_coeff: 20 },
    { age_min: 60, age_max: 70, min_coeff: 5, max_coeff: 10 }
];

export const AN_BINH_UU_VIET_RATES = {
    5: [
        { age: 12, nam: 4.20 }, { age: 13, nam: 4.19 }, { age: 14, nam: 4.17 }, { age: 15, nam: 4.16 },
        { age: 16, nam: 4.16 }, { age: 17, nam: 4.17 }, { age: 18, nam: 4.17 }, { age: 19, nam: 4.17 },
        { age: 20, nam: 4.22 }, { age: 21, nam: 4.26 }, { age: 22, nam: 4.28 }, { age: 23, nam: 4.29 },
        { age: 24, nam: 4.31 }, { age: 25, nam: 4.33 }, { age: 26, nam: 4.34 }, { age: 27, nam: 4.36 },
        { age: 28, nam: 4.39, nu: 3.71 }, { age: 29, nam: 4.44, nu: 3.73 }, { age: 30, nam: 4.52, nu: 3.75 },
        { age: 31, nam: 4.62, nu: 3.78 }, { age: 32, nam: 4.77, nu: 3.84 }, { age: 33, nam: 4.96, nu: 3.93 },
        { age: 34, nam: 5.16, nu: 4.05 }, { age: 35, nam: 5.37, nu: 4.20 }, { age: 36, nam: 5.55, nu: 4.37 },
        { age: 37, nam: 5.79, nu: 4.55 }, { age: 38, nam: 6.02, nu: 4.70 }, { age: 39, nam: 6.27, nu: 4.88 },
        { age: 40, nam: 6.54, nu: 5.08 }, { age: 41, nam: 6.85, nu: 5.30 }, { age: 42, nam: 7.18, nu: 5.52 },
        { age: 43, nam: 7.54, nu: 5.76 }, { age: 44, nam: 7.93, nu: 6.03 }, { age: 45, nam: 8.36, nu: 6.31 },
        { age: 46, nam: 8.81, nu: 6.62 }, { age: 47, nam: 9.31, nu: 6.94 }, { age: 48, nam: 9.88, nu: 7.30 },
        { age: 49, nam: 10.49, nu: 7.69 }, { age: 50, nam: 11.32, nu: 8.23 }, { age: 51, nam: 12.21, nu: 8.82 },
        { age: 52, nam: 13.24, nu: 9.48 }, { age: 53, nam: 14.41, nu: 10.22 }, { age: 54, nam: 15.77, nu: 11.15 },
        { age: 55, nam: 17.43, nu: 12.33 }, { age: 56, nam: 18.82, nu: 13.19 }, { age: 57, nam: 20.41, nu: 14.15 },
        { age: 58, nam: 22.29, nu: 15.32 }, { age: 59, nam: 24.15, nu: 16.49 }, { age: 60, nam: 26.19, nu: 17.83 },
        { age: 61, nam: 28.51, nu: 19.36 }, { age: 62, nam: 31.13, nu: 21.05 }, { age: 63, nam: 34.09, nu: 22.97 },
        { age: 64, nam: 37.02, nu: 24.87 }, { age: 65, nam: 40.21, nu: 27.03 },
    ],
    10: [
        { age: 12, nam: 3.55 }, { age: 13, nam: 3.66 }, { age: 14, nam: 3.77 }, { age: 15, nam: 3.87 },
        { age: 16, nam: 3.96 }, { age: 17, nam: 4.06 }, { age: 18, nam: 4.20 }, { age: 19, nam: 4.22 },
        { age: 20, nam: 4.28 }, { age: 21, nam: 4.32 }, { age: 22, nam: 4.35 }, { age: 23, nam: 4.35 },
        { age: 24, nam: 4.36 }, { age: 25, nam: 4.38 }, { age: 26, nam: 4.40 }, { age: 27, nam: 4.42 },
        { age: 28, nam: 4.44, nu: 3.75 }, { age: 29, nam: 4.50, nu: 3.77 }, { age: 30, nam: 4.57, nu: 3.79 },
        { age: 31, nam: 4.68, nu: 3.83 }, { age: 32, nam: 4.83, nu: 3.89 }, { age: 33, nam: 5.01, nu: 3.97 },
        { age: 34, nam: 5.21, nu: 4.09 }, { age: 35, nam: 5.42, nu: 4.24 }, { age: 36, nam: 5.64, nu: 4.40 },
        { age: 37, nam: 5.90, nu: 4.57 }, { age: 38, nam: 6.18, nu: 4.76 }, { age: 39, nam: 6.48, nu: 4.97 },
        { age: 40, nam: 6.81, nu: 5.21 }, { age: 41, nam: 7.19, nu: 5.47 }, { age: 42, nam: 7.62, nu: 5.74 },
        { age: 43, nam: 8.07, nu: 6.04 }, { age: 44, nam: 8.57, nu: 6.36 }, { age: 45, nam: 9.12, nu: 6.71 },
        { age: 46, nam: 9.75, nu: 7.12 }, { age: 47, nam: 10.46, nu: 7.57 }, { age: 48, nam: 11.24, nu: 8.04 },
        { age: 49, nam: 12.11, nu: 8.58 }, { age: 50, nam: 13.07, nu: 9.17 }, { age: 51, nam: 14.14, nu: 9.91 },
        { age: 52, nam: 15.35, nu: 10.65 }, { age: 53, nam: 16.71, nu: 11.46 }, { age: 54, nam: 18.25, nu: 12.45 },
        { age: 55, nam: 20.04, nu: 13.68 }, { age: 56, nam: 21.76, nu: 14.75 }, { age: 57, nam: 23.69, nu: 15.95 },
        { age: 58, nam: 25.89, nu: 17.33 }, { age: 59, nam: 28.11, nu: 18.74 }, { age: 60, nam: 30.52, nu: 20.29 },
    ],
    15: [
        { age: 12, nam: 3.64 }, { age: 13, nam: 3.73 }, { age: 14, nam: 3.83 }, { age: 15, nam: 3.92 },
        { age: 16, nam: 4.00 }, { age: 17, nam: 4.09 }, { age: 18, nam: 4.21 }, { age: 19, nam: 4.23 },
        { age: 20, nam: 4.29 }, { age: 21, nam: 4.34 }, { age: 22, nam: 4.38 }, { age: 23, nam: 4.40 },
        { age: 24, nam: 4.44 }, { age: 25, nam: 4.47 }, { age: 26, nam: 4.51 }, { age: 27, nam: 4.56 },
        { age: 28, nam: 4.61, nu: 3.84 }, { age: 29, nam: 4.70, nu: 3.88 }, { age: 30, nam: 4.81, nu: 3.93 },
        { age: 31, nam: 4.95, nu: 4.00 }, { age: 32, nam: 5.14, nu: 4.09 }, { age: 33, nam: 5.37, nu: 4.21 },
        { age: 34, nam: 5.61, nu: 4.37 }, { age: 35, nam: 5.88, nu: 4.55 }, { age: 36, nam: 6.17, nu: 4.75 },
        { age: 37, nam: 6.63, nu: 4.97 }, { age: 38, nam: 7.01, nu: 5.22 }, { age: 39, nam: 7.43, nu: 5.49 },
        { age: 40, nam: 7.78, nu: 5.82 }, { age: 41, nam: 8.29, nu: 6.16 }, { age: 42, nam: 8.86, nu: 6.52 },
        { age: 43, nam: 9.49, nu: 6.90 }, { age: 44, nam: 10.17, nu: 7.32 }, { age: 45, nam: 10.91, nu: 7.77 },
        { age: 46, nam: 11.73, nu: 8.25 }, { age: 47, nam: 12.64, nu: 8.78 }, { age: 48, nam: 13.64, nu: 9.37 },
        { age: 49, nam: 14.74, nu: 10.04 }, { age: 50, nam: 15.94, nu: 10.75 }, { age: 51, nam: 17.30, nu: 11.58 },
        { age: 52, nam: 18.81, nu: 12.51 }, { age: 53, nam: 20.49, nu: 13.54 }, { age: 54, nam: 22.35, nu: 14.70 },
        { age: 55, nam: 24.45, nu: 16.07 },
    ]
};

export const HEALTH_RIDER_RATES = {
    main: {
        vietnam: [
            { age_min: 0, age_max: 4, basic: 3829000, advanced: 7669000, comprehensive: 13909000, perfect: 20149000 },
            { age_min: 5, age_max: 9, basic: 1459000, advanced: 2929000, comprehensive: 5449000, perfect: 7859000 },
            { age_min: 10, age_max: 14, basic: 769000, advanced: 1489000, comprehensive: 2719000, perfect: 4019000 },
            { age_min: 15, age_max: 19, basic: 1079000, advanced: 2159000, comprehensive: 3939000, perfect: 5719000 },
            { age_min: 20, age_max: 24, basic: 1239000, advanced: 2579000, comprehensive: 4719000, perfect: 6779000 },
            { age_min: 25, age_max: 29, basic: 1579000, advanced: 3069000, comprehensive: 5649000, perfect: 8229000 },
            { age_min: 30, age_max: 34, basic: 1939000, advanced: 3359000, comprehensive: 6149000, perfect: 9039000 },
            { age_min: 35, age_max: 39, basic: 2139000, advanced: 3839000, comprehensive: 7019000, perfect: 10099000 },
            { age_min: 40, age_max: 44, basic: 2359000, advanced: 4229000, comprehensive: 7789000, perfect: 11349000 },
            { age_min: 45, age_max: 49, basic: 2909000, advanced: 5089000, comprehensive: 9329000, perfect: 13559000 },
            { age_min: 50, age_max: 54, basic: 3279000, advanced: 6039000, comprehensive: 11009000, perfect: 16069000 },
            { age_min: 55, age_max: 59, basic: 3479000, advanced: 6799000, comprehensive: 12459000, perfect: 18029000 },
            { age_min: 60, age_max: 64, basic: 3939000, advanced: 7809000, comprehensive: 14159000, perfect: 20579000 },
            { age_min: 65, age_max: 65, basic: 4269000, advanced: 8339000, comprehensive: 15209000, perfect: 22079000 },
            { age_min: 66, age_max: 69, basic: 4269000, advanced: 8339000, comprehensive: 15209000, perfect: 22079000 },
            { age_min: 70, age_max: 74, basic: 4679000, advanced: 9209000, comprehensive: 16759000, perfect: 24309000 },
        ],
        global: [
            { age_min: 0, age_max: 4, basic: 5149000, advanced: 10309000, comprehensive: 18709000, perfect: 27229000 },
            { age_min: 5, age_max: 9, basic: 1969000, advanced: 3939000, comprehensive: 7269000, perfect: 10489000 },
            { age_min: 10, age_max: 14, basic: 1029000, advanced: 2009000, comprehensive: 3699000, perfect: 5449000 },
            { age_min: 15, age_max: 19, basic: 1469000, advanced: 2929000, comprehensive: 5329000, perfect: 7739000 },
            { age_min: 20, age_max: 24, basic: 1689000, advanced: 3469000, comprehensive: 6339000, perfect: 9099000 },
            { age_min: 25, age_max: 29, basic: 2069000, advanced: 4159000, comprehensive: 7629000, perfect: 11059000 },
            { age_min: 30, age_max: 34, basic: 2299000, advanced: 4509000, comprehensive: 8269000, perfect: 12209000 },
            { age_min: 35, age_max: 39, basic: 2589000, advanced: 5189000, comprehensive: 9429000, perfect: 13659000 },
            { age_min: 40, age_max: 44, basic: 2879000, advanced: 5669000, comprehensive: 10479000, perfect: 15299000 },
            { age_min: 45, age_max: 49, basic: 3449000, advanced: 6829000, comprehensive: 12599000, perfect: 18279000 },
            { age_min: 50, age_max: 54, basic: 4159000, advanced: 8129000, comprehensive: 14879000, perfect: 21729000 },
            { age_min: 55, age_max: 59, basic: 4709000, advanced: 9199000, comprehensive: 16789000, perfect: 24299000 },
            { age_min: 60, age_max: 64, basic: 5329000, advanced: 10519000, comprehensive: 19109000, perfect: 27779000 },
            { age_min: 65, age_max: 65, basic: 5759000, advanced: 11269000, comprehensive: 20519000, perfect: 29799000 },
            { age_min: 66, age_max: 69, basic: 5759000, advanced: 11269000, comprehensive: 20519000, perfect: 29799000 },
            { age_min: 70, age_max: 74, basic: 6219000, advanced: 12289000, comprehensive: 22379000, perfect: 32419000 },
        ]
    },
    outpatient: [
        { age_min: 0, age_max: 4, basic: 1889000, advanced: 3559000, comprehensive: 7649000, perfect: 11349000 },
        { age_min: 5, age_max: 9, basic: 979000, advanced: 1849000, comprehensive: 3989000, perfect: 5919000 },
        { age_min: 10, age_max: 14, basic: 869000, advanced: 1629000, comprehensive: 3519000, perfect: 5219000 },
        { age_min: 15, age_max: 19, basic: 889000, advanced: 1689000, comprehensive: 3629000, perfect: 5389000 },
        { age_min: 20, age_max: 24, basic: 799000, advanced: 1529000, comprehensive: 3279000, perfect: 4869000 },
        { age_min: 25, age_max: 29, basic: 859000, advanced: 1619000, comprehensive: 3489000, perfect: 5179000 },
        { age_min: 30, age_max: 34, basic: 939000, advanced: 1779000, comprehensive: 3819000, perfect: 5669000 },
        { age_min: 35, age_max: 39, basic: 1009000, advanced: 1909000, comprehensive: 4119000, perfect: 6109000 },
        { age_min: 40, age_max: 44, basic: 1029000, advanced: 1939000, comprehensive: 4189000, perfect: 6209000 },
        { age_min: 45, age_max: 49, basic: 1089000, advanced: 2049000, comprehensive: 4419000, perfect: 6559000 },
        { age_min: 50, age_max: 54, basic: 1089000, advanced: 2059000, comprehensive: 4449000, perfect: 6589000 },
        { age_min: 55, age_max: 59, basic: 1109000, advanced: 2089000, comprehensive: 4509000, perfect: 6699000 },
        { age_min: 60, age_max: 64, basic: 1119000, advanced: 2099000, comprehensive: 4529000, perfect: 6729000 },
        { age_min: 65, age_max: 65, basic: 1119000, advanced: 2109000, comprehensive: 4549000, perfect: 6769000 },
        { age_min: 66, age_max: 69, basic: 1119000, advanced: 2109000, comprehensive: 4549000, perfect: 6769000 },
        { age_min: 70, age_max: 74, basic: 1409000, advanced: 2659000, comprehensive: 5719000, perfect: 8479000 },
    ],
    dental: [
        { age_min: 0, age_max: 4, basic: 509000, advanced: 939000, comprehensive: 2189000, perfect: 4009000 },
        { age_min: 5, age_max: 9, basic: 869000, advanced: 1619000, comprehensive: 3749000, perfect: 6869000 },
        { age_min: 10, age_max: 14, basic: 779000, advanced: 1449000, comprehensive: 3359000, perfect: 6149000 },
        { age_min: 15, age_max: 19, basic: 709000, advanced: 1329000, comprehensive: 3079000, perfect: 5649000 },
        { age_min: 20, age_max: 24, basic: 579000, advanced: 1089000, comprehensive: 2539000, perfect: 4639000 },
        { age_min: 25, age_max: 29, basic: 579000, advanced: 1079000, comprehensive: 2519000, perfect: 4599000 },
        { age_min: 30, age_max: 34, basic: 599000, advanced: 1129000, comprehensive: 2629000, perfect: 4819000 },
        { age_min: 35, age_max: 39, basic: 629000, advanced: 1189000, comprehensive: 2749000, perfect: 5039000 },
        { age_min: 40, age_max: 44, basic: 719000, advanced: 1349000, comprehensive: 3129000, perfect: 5729000 },
        { age_min: 45, age_max: 49, basic: 759000, advanced: 1429000, comprehensive: 3309000, perfect: 6069000 },
        { age_min: 50, age_max: 54, basic: 739000, advanced: 1389000, comprehensive: 3209000, perfect: 5889000 },
        { age_min: 55, age_max: 59, basic: 729000, advanced: 1379000, comprehensive: 3179000, perfect: 5839000 },
        { age_min: 60, age_max: 74, basic: 729000, advanced: 1379000, comprehensive: 3179000, perfect: 5839000 },
    ]
};

export const CRITICAL_ILLNESS_RATES = [
    { age_min: 0, age_max: 4, nam: 1.98, nu: 1.47 }, { age_min: 5, age_max: 9, nam: 1.49, nu: 1.16 },
    { age_min: 10, age_max: 14, nam: 1.64, nu: 1.24 }, { age_min: 15, age_max: 17, nam: 1.35, nu: 1.08 },
    { age_min: 18, age_max: 19, nam: 1.38, nu: 1.10 }, { age_min: 20, age_max: 21, nam: 1.60, nu: 1.32 },
    { age_min: 22, age_max: 24, nam: 1.11, nu: 1.04 }, { age_min: 25, age_max: 29, nam: 1.34, nu: 1.45 },
    { age_min: 30, age_max: 34, nam: 2.02, nu: 2.22 }, { age_min: 35, age_max: 39, nam: 3.34, nu: 3.76 },
    { age_min: 40, age_max: 44, nam: 5.37, nu: 5.75 }, { age_min: 45, age_max: 49, nam: 8.67, nu: 8.86 },
    { age_min: 50, age_max: 54, nam: 12.41, nu: 11.88 }, { age_min: 55, age_max: 59, nam: 19.22, nu: 18.26 },
    { age_min: 60, age_max: 64, nam: 28.31, nu: 26.42 }, { age_min: 65, age_max: 69, nam: 35.51, nu: 31.31 },
    { age_min: 70, age_max: 70, nam: 47.55, nu: 43.06 }, { age_min: 71, age_max: 74, nam: 46.43, nu: 42.70 },
    { age_min: 75, age_max: 79, nam: 74.05, nu: 65.40 }, { age_min: 80, age_max: 84, nam: 108.52, nu: 93.54 },
    { age_min: 85, age_max: 85, nam: 126.75, nu: 109.46 }
];

export const HEALTH_BENEFITS = [
    { name: 'Phòng và Giường bệnh', sub: 'tối đa 100 ngày/năm', basic: 750000, advanced: 1500000, comprehensive: 2500000, perfect: 5000000 },
    { name: 'Phòng Chăm sóc đặc biệt', sub: 'tối đa 30 ngày/năm', basic: 'Theo chi phí y tế', advanced: 'Theo chi phí y tế', comprehensive: 'Theo chi phí y tế', perfect: 'Theo chi phí y tế' },
    { name: 'Giường dành cho người thân', sub: 'tối đa 30 ngày/năm', basic: 150000, advanced: 250000, comprehensive: 500000, perfect: 1000000 },
    { name: 'Phẫu thuật', sub: ' ', basic: 'Theo chi phí y tế', advanced: 'Theo chi phí y tế', comprehensive: 'Theo chi phí y tế', perfect: 'Theo chi phí y tế' },
    { name: 'Điều trị trước nhập viện', sub: 'tối đa 30 ngày', basic: 'Theo chi phí y tế', advanced: 'Theo chi phí y tế', comprehensive: 'Theo chi phí y tế', perfect: 'Theo chi phí y tế' },
    { name: 'Điều trị sau xuất viện', sub: 'tối đa 60 ngày', basic: 'Theo chi phí y tế', advanced: 'Theo chi phí y tế', comprehensive: 'Theo chi phí y tế', perfect: 'Theo chi phí y tế' },
    { name: 'Chi phí y tế nội trú khác', sub: ' ', basic: 'Theo chi phí y tế', advanced: 'Theo chi phí y tế', comprehensive: 'Theo chi phí y tế', perfect: 'Theo chi phí y tế' },
    { name: 'Chăm sóc y tế tại nhà', sub: 'tối đa 2 đợt/năm', basic: 1500000, advanced: 2500000, comprehensive: 5000000, perfect: 10000000 },
    { name: 'Ghép tạng', sub: 'tim, phổi, gan, tuỵ, thận, tuỷ xương', basic: 'Theo chi phí y tế', advanced: 'Theo chi phí y tế', comprehensive: 'Theo chi phí y tế', perfect: 'Theo chi phí y tế' },
    { name: 'Điều trị ung thư', sub: ' ', basic: 'Theo chi phí y tế', advanced: 'Theo chi phí y tế', comprehensive: 'Theo chi phí y tế', perfect: 'Theo chi phí y tế' },
    { name: 'Phẫu thuật, thủ thuật trong ngày', sub: ' ', basic: 'Theo chi phí y tế', advanced: 'Theo chi phí y tế', comprehensive: 'Theo chi phí y tế', perfect: 'Theo chi phí y tế' }
];
