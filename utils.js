/**
 * @file utils.js
 * @description
 * This file contains shared utility functions used across different modules
 * to avoid circular dependencies and promote code reuse.
 */

/**
 * Formats a number into a Vietnamese currency string (e.g., 1000000 -> "1.000.000").
 * @param {number|string} value The number to format.
 * @returns {string} The formatted currency string.
 */
export function formatCurrency(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('vi-VN');
}

/**
 * Rounds a number down to the nearest thousand.
 * @param {number|string} n The number to round.
 * @returns {number} The rounded number.
 */
export function roundDownTo1000(n) {
    return Math.floor(Number(n || 0) / 1000) * 1000;
}

/**
 * Parses a formatted currency string (e.g., "1.000.000") back into a number.
 * @param {string} str The formatted string.
 * @returns {number} The parsed number.
 */
export function parseFormattedNumber(str) {
    if (!str) return 0;
    return Number(String(str).replace(/[.,]/g, ''));
}

/**
 * Creates a debounced function that delays invoking `func` until after `delay` milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * @param {Function} func The function to debounce.
 * @param {number} delay The number of milliseconds to delay.
 * @returns {Function} The new debounced function.
 */
export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

/**
 * Sanitizes a string to prevent XSS by converting it to text content.
 * @param {string} str The string to sanitize.
 * @returns {string} The sanitized HTML string.
 */
export function sanitizeHtml(str) {
    if (typeof document === 'undefined') {
        // Basic fallback for non-browser environments if needed
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}
