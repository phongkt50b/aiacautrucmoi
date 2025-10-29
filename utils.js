
/**
 * @file utils.js
 * @description
 * This file contains shared utility functions used across the application to avoid circular dependencies.
 */

export function debounce(fn, wait = 40) {
    let t = null;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

export function parseFormattedNumber(formattedString) {
    if (formattedString == null) return 0;
    let v = String(formattedString).replace(/[\s.,]/g, '');
    const m = v.match(/-?\d+/);
    return m ? parseInt(m[0], 10) : 0;
}

export function formatCurrency(value, suffix = '') {
    const num = Number(value) || 0;
    return num.toLocaleString('vi-VN') + (suffix || '');
}

export function sanitizeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#39;');
}

export function roundDownTo1000(n) {
    return Math.floor(Number(n || 0) / 1000) * 1000;
}
