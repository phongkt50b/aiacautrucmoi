import { PRODUCT_CATALOG, VIEWER_CONFIG, GLOBAL_CONFIG } from '../structure.js';
import { BENEFIT_MATRIX_SCHEMAS, investment_data } from '../data.js';
import { formatCurrency, sanitizeHtml, roundDownTo1000, roundTo1000, roundUpTo1000 } from '../utils.js';
import { RULE_ENGINE } from '../registries/ruleEngine.js';

// ===================================================================================
// ===== LOGIC TẠO BẢNG MINH HỌA (PORTED FROM V1)
// ==================================================================================
export function generateViewerPayload(appState) {
  const mainPerson = appState.persons.find(p => p.isMain);
  const mainProductConfig = PRODUCT_CATALOG[appState.mainProduct.key];

  const riderList = [];
  appState.persons.forEach(person => {
    Object.keys(person.supplements).forEach(rid => {
      const premiumDetail = appState.fees.byPerson[person.id]?.suppDetails?.[rid] || 0;
      if (premiumDetail > 0 && !riderList.some(r => r.slug === rid)) { // FIX: Prevent duplicate images
        const data = person.supplements[rid];
        riderList.push({
          slug: rid, 
          selected: true,
          stbh: appState.context.registries.CALC_REGISTRY.resolveRiderStbh({ rid, person, appState }),
          program: data.program, scope: data.scope, outpatient: !!data.outpatient, dental: !!data.dental,
          premium: premiumDetail
        });
      }
    });
  });

  // Handle WOP products for the payload
  Object.entries(appState.fees.waiverDetails || {}).forEach(([waiverProductId, waiverData]) => {
      const { premium } = waiverData;
      if (premium > 0) {
          riderList.push({ 
              slug: waiverProductId, 
              selected: true, 
              stbh: 0, 
              premium: premium 
          });
      }
  });
  
  const summaryHtml = __exportExactSummaryHtml(appState);
  
  let paymentTerm = 0;
  if (mainProductConfig?.paymentTermKey) {
      paymentTerm = RULE_ENGINE.resolveFieldByKey(mainProductConfig.paymentTermKey, { values: appState.mainProduct.values }) || 0;
  }

  return {
    v: 3, // Version
    productKey: appState.mainProduct.key,
    productSlug: mainProductConfig?.slug,
    mainPersonName: mainPerson.name,
    mainPersonAge: mainPerson.age,
    mainPersonGender: mainPerson.gender,
    sumAssured: appState.mainProduct.values['main-stbh'],
    paymentFrequency: appState.paymentFrequency,
    paymentTerm,
    targetAge: parseInt(document.getElementById('target-age-input')?.value, 10),
    customInterestRate: document.getElementById('custom-interest-rate-input')?.value,
    premiums: { 
        baseMain: appState.fees.baseMain,
        extra: appState.fees.extra,
        totalSupp: appState.fees.totalSupp,
        riders: riderList
    },
    summaryHtml: summaryHtml
  };
}


function __exportExactSummaryHtml(appState) {
    try {
        const data = buildSummaryData(appState);
        
        // ⭐ Validation
        if (!data || !data.mainPerson) {
            throw new Error('Invalid summary data: missing mainPerson');
        }
        
        const introHtml = buildIntroSection(data, appState);
        const part1Html = buildPart1Section(data);
        const part2Html = buildPart2BenefitsSection(data, appState);
        const part3Html = buildPart3ScheduleSection(data);
        
        return introHtml + part1Html + part2Html + part3Html;
    } catch (e) {
        console.error('[__exportExactSummaryHtml] error:', e);
        console.error('Stack:', e.stack);
        return `<div style="color:red; padding: 20px;">
            <h3>❌ Lỗi tạo summaryHtml</h3>
            <p><strong>Lỗi:</strong> ${e.message}</p>
            <pre style="background: #f5f5f5; padding: 10px; overflow: auto; font-size: 11px;">${e.stack}</pre>
        </div>`;
    }
}


function buildSummaryData(appState) {
    const mainPerson = appState.persons.find(p => p.isMain);
    const productKey = appState.mainProduct.key;
    const productConfig = PRODUCT_CATALOG[productKey];

    const freq = appState.paymentFrequency;
    const periods = freq === 'half' ? 2 : (freq === 'quarter' ? 4 : 1);
    const isAnnual = periods === 1;
    const riderFactor = periods === 2 ? 1.02 : (periods === 4 ? 1.04 : 1);
    
    let paymentTerm = 0;
    if (productConfig?.paymentTermKey) {
        paymentTerm = parseInt(RULE_ENGINE.resolveFieldByKey(productConfig.paymentTermKey, { values: appState.mainProduct.values }) || '0', 10);
    }
    
    let targetAge = parseInt(document.getElementById('target-age-input')?.value, 10) || 0;
    if (!targetAge && mainPerson && paymentTerm > 0) {
      targetAge = mainPerson.age + paymentTerm -1;
    }

    const allPersonsForSummary = JSON.parse(JSON.stringify(appState.persons));
    const waiverPremiums = appState.fees.waiverDetails || {};

    // Augment person data with selected waivers for unified processing
    const waiverOtherPersons = [];
    Object.entries(waiverPremiums).forEach(([waiverId, waiverData]) => {
        const { premium, targetPerson } = waiverData;
        if (premium > 0 && targetPerson) {
            let personForWaiver = allPersonsForSummary.find(p => p.id === targetPerson.id);
            if (!personForWaiver && targetPerson.id === GLOBAL_CONFIG.WAIVER_OTHER_PERSON_ID) {
                personForWaiver = {
                    ...targetPerson,
                    isMain: false,
                    supplements: {}
                };
                waiverOtherPersons.push(personForWaiver);
            }
            if(personForWaiver) {
               personForWaiver.supplements[waiverId] = {}; // Add placeholder for iteration
            }
        }
    });

    allPersonsForSummary.push(...waiverOtherPersons);

    const part1 = appState.context.registries.CALC_REGISTRY.buildPart1RowsData({ persons: allPersonsForSummary, productKey, paymentTerm, targetAge, riderFactor, periods, isAnnual, waiverPremiums, freq, appState });
    const schedule = appState.context.registries.CALC_REGISTRY.buildPart2ScheduleRows({ persons: allPersonsForSummary, mainPerson, paymentTerm, targetAge, periods, isAnnual, riderFactor, productKey, waiverPremiums, appState });    
    const summary = { freq, periods, isAnnual, riderFactor, productKey, paymentTerm, targetAge, mainPerson, persons: allPersonsForSummary, waiverPremiums, part1, schedule, projection: null, sums: {} };
    
    if (productConfig?.accountValue?.enabled) { // Chúng ta chỉ cần kiểm tra xem tính năng này có được bật không
    const customRateInput = document.getElementById('custom-interest-rate-input')?.value || '4.7';
    summary.customRate = customRateInput;

    // Lấy hàm tính toán từ "xưởng" calcRegistry
    const projectionFunc = appState.context.registries.CALC_REGISTRY.calculateGenericAccountValueProjection;
    
        if (projectionFunc) {
            summary.projection = projectionFunc(
                productConfig,
                {
                    mainPerson: appState.persons.find(p => p.isMain),
                    mainProduct: appState.mainProduct,
                    basePremium: appState.fees.baseMain,
                    extraPremium: appState.mainProduct.values['extra-premium'],
                    targetAge: summary.targetAge,
                    customInterestRate: customRateInput,
                    paymentFrequency: summary.freq,
                },
                { investment_data, roundDownTo1000, roundTo1000, roundUpTo1000, GLOBAL_CONFIG }
            );
        }
    }    
    
    // Pre-calculate sums for footer
    const activePersonIdx = summary.persons.map((p, i) => summary.schedule.rows.some(r => (r.perPersonSuppAnnualEq[i] || 0) > 0) ? i : -1).filter(i => i !== -1);
    summary.schedule.activePersonIdx = activePersonIdx;

    const sums = { main: 0, extra: 0, supp: activePersonIdx.map(() => 0), totalBase: 0, totalEq: 0, diff: 0 };
    summary.schedule.rows.forEach(r => {
        sums.main += r.mainYearBase;
        sums.extra += r.extraYearBase;
        sums.totalBase += r.totalYearBase;
        sums.totalEq += r.totalAnnualEq;
        sums.diff += r.diff;
        activePersonIdx.forEach((pIdx, idx) => sums.supp[idx] += r.perPersonSuppAnnualEq[pIdx]);
    });
    summary.sums = sums;

    return summary;
}

function buildIntroSection(data, appState) {
    const sel = document.getElementById('payment-frequency');
    let freqLabel = sel ? sel.options[sel.selectedIndex].text : data.freq;
    return `<div class="mb-4"><h3>BẢNG MINH HỌA PHÍ & QUYỀN LỢI</h3><div>Sản phẩm chính: <strong>${sanitizeHtml(appState.context.registries.CALC_REGISTRY.getProductLabel(data.productKey) || '—')}</strong>&nbsp;|&nbsp; Kỳ đóng: <strong>${sanitizeHtml(freqLabel)}</strong>&nbsp;|&nbsp; Minh họa đến tuổi: <strong>${sanitizeHtml(data.targetAge)}</strong></div></div>`;
    }

function buildPart1Section(summaryData) {
    const config = VIEWER_CONFIG.part1_summary;
    const data = summaryData.part1;
    const { rows, perPersonTotals, grand } = data;
    
    const columns = config.columns.filter(c => !c.condition || c.condition(data));
    const getHeader = (col) => typeof col.header === 'function' ? col.header(data) : col.header;
    const getAlignment = (col) => col.align ? `text-align: ${col.align};` : '';

    const headerHtml = `<tr>${columns.map(c => `<th>${sanitizeHtml(getHeader(c))}</th>`).join('')}</tr>`;
    
    let bodyHtml = '';
    perPersonTotals.forEach(personTotal => {
        // Render summary row for the person
        bodyHtml += `<tr style="font-weight: bold;">`;
        columns.forEach((col, i) => {
            let content = '';
            if (i === 0) content = sanitizeHtml(personTotal.personName);
            else if (i === 1) content = 'Tổng theo người';
            else if (col.id === 'periodicFee') content = formatCurrency(personTotal.per);
            else if (col.id === 'annualEquivalent') content = formatCurrency(personTotal.eq);
            else if (col.id === 'annualFee') content = formatCurrency(personTotal.base);
            else if (col.id === 'diff') content = personTotal.diff === 0 ? '0' : `<span class="text-red-600 font-bold">${formatCurrency(personTotal.diff)}</span>`;
            else content = '—';
            bodyHtml += `<td style="${getAlignment(col)}">${content}</td>`;
        });
        bodyHtml += `</tr>`;
        
        // Render individual product rows for the person
        rows.filter(r => r.personName === personTotal.personName).forEach(row => {
            bodyHtml += `<tr>`;
            columns.forEach(col => {
                const value = col.id === 'personName' ? '' : (col.getValue(row, data) || '');
                bodyHtml += `<td style="${getAlignment(col)}">${value}</td>`;
            });
            bodyHtml += `</tr>`;
        });
    });
    
    // Render grand total row
    bodyHtml += `<tr style="font-weight: bold;">`;
    columns.forEach((col, i) => {
        let content = '';
        if (i === 0) content = 'Tổng tất cả';
        else if (col.id === 'periodicFee') content = formatCurrency(grand.per);
        else if (col.id === 'annualEquivalent') content = formatCurrency(grand.eq);
        else if (col.id === 'annualFee') content = formatCurrency(grand.base);
        else if (col.id === 'diff') content = grand.diff === 0 ? '0' : `<span class="text-red-600 font-bold">${formatCurrency(grand.diff)}</span>`;
        else if (i < 4) content = ''; // colspan would be better, but this works
        bodyHtml += `<td style="${getAlignment(col)}">${content}</td>`;
    });
    bodyHtml += `</tr>`;

    const titleHtml = `<h3>${sanitizeHtml(config.title)}</h3>`;
    return `${titleHtml}<table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
}

function buildFooterSection() {
    return `<div style="font-size: 10px; font-style: italic; color: #555; margin-top: 1rem;">(*) Công cụ này chỉ mang tính tham khảo cá nhân, không phải là bảng minh họa chính thức của AIA...</div>`;
}

function buildPart3ScheduleSection(summaryData) {
    const config = VIEWER_CONFIG.part3_schedule;
    if (!config || !summaryData.schedule.rows.length) return '';

    const { persons } = summaryData;
    const { rows, activePersonIdx } = summaryData.schedule;
    
    // Filter columns based on condition
    const columns = config.columns.filter(c => !c.condition || c.condition(summaryData));
    const getAlignment = (col) => col.align ? `text-align: ${col.align};` : '';
    const getStyle = (col) => `${getAlignment(col)}${col.isBold ? 'font-weight:bold;' : ''}`;

    // Build Header
    let headerHtml = '<tr>';
    columns.forEach(col => {
        if (col.type === 'dynamic') {
            activePersonIdx.forEach(pIdx => {
                headerHtml += `<th>${sanitizeHtml(col.headerTemplate(persons[pIdx]))}</th>`;
            });
        } else {
            const headerText = typeof col.header === 'function' ? col.header(summaryData) : col.header;
            headerHtml += `<th>${sanitizeHtml(headerText)}</th>`;
        }
    });
    headerHtml += '</tr>';

    // Build Body
    let bodyHtml = rows.map(row => {
        let rowHtml = '<tr>';
        columns.forEach(col => {
            if (col.type === 'dynamic') {
                activePersonIdx.forEach(pIdx => {
                    rowHtml += `<td style="${getStyle(col)}">${col.getValue(row, pIdx, summaryData)}</td>`;
                });
            } else {
                rowHtml += `<td style="${getStyle(col)}">${col.getValue(row, summaryData)}</td>`;
            }
        });
        rowHtml += '</tr>';
        return rowHtml;
    }).join('');

    // Build Footer
    let footerHtml = '<tr style="font-weight: bold;">';
    columns.forEach(col => {
        if (col.type === 'dynamic') {
            activePersonIdx.forEach((pIdx, idx) => {
                footerHtml += `<td style="${getStyle(col)}">${col.getFooter(summaryData, idx)}</td>`;
            });
        } else {
            footerHtml += `<td style="${getStyle(col)}">${col.getFooter(summaryData)}</td>`;
        }
    });
    footerHtml += '</tr>';
    
    const titleHtml = `<h3>${sanitizeHtml(config.titleTemplate(summaryData))}</h3>`;
    const tableHtml = `<table><thead>${headerHtml}</thead><tbody>${bodyHtml}${footerHtml}</tbody></table>`;
    return `${titleHtml}${tableHtml}${buildFooterSection()}`;
}

function buildPart2BenefitsSection(summaryData, appState) {
    const colsBySchema = bm_collectColumns(summaryData, appState);
    
    const sortedSchemaKeys = Object.keys(colsBySchema).sort((keyA, keyB) => {
        const schemaA = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === keyA);
        const schemaB = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === keyB);
        return (schemaA?.displayOrder || 999) - (schemaB?.displayOrder || 999);
    });

    const blocks = sortedSchemaKeys
        .map(sk => bm_renderSchemaTables(sk, colsBySchema[sk], summaryData, appState))
        .filter(Boolean);

    if (!blocks.length) return `<h3>Phần 2 · Tóm tắt quyền lợi sản phẩm</h3><div>Không có quyền lợi nào để hiển thị.</div>`;
    return `<h3>Phần 2 · Tóm tắt quyền lợi sản phẩm</h3>${blocks.join('')}`;
}

function bm_findSchema(productKey) {
    const productConfig = PRODUCT_CATALOG[productKey];
    if (!productConfig) return null;

    const matrixKey = productConfig.benefitMatrixKey;
    if (matrixKey) {
        return BENEFIT_MATRIX_SCHEMAS.find(s => s.key === matrixKey);
    }
    
    // Fallback for products without a direct mapping, e.g., using productKeys array
    return BENEFIT_MATRIX_SCHEMAS.find(s => 
        s.key.toLowerCase() === productKey.toLowerCase() || 
        s.productKeys?.includes(productKey)
    );
}

function bm_collectColumns(summaryData, appState) {
    const colsBySchema = {};
    const persons = summaryData.persons || [];
    const mainKey = summaryData.productKey;
    const { UI_FUNCTIONS } = appState.context.registries;
    
    const mainConfig = PRODUCT_CATALOG[mainKey];
    if (mainConfig?.packageConfig?.addBenefitMatrixFrom) {
        mainConfig.packageConfig.addBenefitMatrixFrom.forEach(item => {
            const schema = bm_findSchema(item.productKey);
            if (schema && schema.getGroupingSignature) {
                const colDataBase = { productKey: item.productKey, sumAssured: item.sumAssured, persons: [summaryData.mainPerson] };
                const sig = schema.getGroupingSignature(colDataBase);
                colsBySchema[schema.key] = colsBySchema[schema.key] || [];
                colsBySchema[schema.key].push({ ...colDataBase, sig });
            }
        });
    } else if (mainKey) {
        const schema = bm_findSchema(mainKey);
        if (schema && schema.getGroupingSignature) {
            const mainSa = appState.mainProduct.values['main-stbh'] || 0;
            const colDataBase = { productKey: mainKey, sumAssured: mainSa, persons: [summaryData.mainPerson] };
            const sig = schema.getGroupingSignature(colDataBase);
            colsBySchema[schema.key] = colsBySchema[schema.key] || [];
            colsBySchema[schema.key].push({ ...colDataBase, sig });
        }
    }
    
    persons.forEach(p => {
        const supp = p.supplements || {};
        for (const rid in supp) {
            if(PRODUCT_CATALOG[rid]?.category === 'waiver') continue;

            const schema = bm_findSchema(rid);
            if (!schema || !schema.getGroupingSignature) continue;

            const fee = appState.fees.byPerson[p.id]?.suppDetails?.[rid] || 0;
            if (fee <= 0) continue;

            colsBySchema[schema.key] = colsBySchema[schema.key] || [];
            
            const prodConfig = PRODUCT_CATALOG[rid];
            const dataForKey = supp[rid];

            const colDataBase = prodConfig.columnDataKey
                ? UI_FUNCTIONS.bmColumnData[prodConfig.columnDataKey]({ productKey: rid, person: p, data: dataForKey, state: appState })
                : { productKey: rid, sumAssured: (dataForKey?.stbh || 0), persons: [p] };

            const sig = schema.getGroupingSignature(colDataBase);
            let existingCol = colsBySchema[schema.key].find(c => c.sig === sig);
            if (existingCol) {
                existingCol.persons.push(p);
            } else {
                colDataBase.sig = sig;
                colsBySchema[schema.key].push(colDataBase);
            }
        }
    });
    
    return colsBySchema;
}

function bm_renderSchemaTables(schemaKey, columns, appState) {
    const schema = BENEFIT_MATRIX_SCHEMAS.find(s => s.key === schemaKey);
    if (!schema || !columns.length) return '';

    const title = schema.displayName || schema.key;
    const headCols = columns.map(c => `<th>${sanitizeHtml(schema.getColumnLabel(c))}</th>`).join('');
    
    let rows = [];
    schema.benefits.forEach(benef => {
        if (benef.headerCategory) {
            let needed = columns.some(c => c.flags?.[benef.headerCategory]);
            if (needed) rows.push({ isHeader: true, benef, colspan: 1 + columns.length });
            return;
        }

        let cellsData = [];
        let anyVisible = false;
        columns.forEach(col => {
            if ((benef.productCond && benef.productCond !== col.productKey) || (benef.minAge && !col.persons.some(p => p.age >= benef.minAge)) || (benef.maternityOnly && !col.flags?.maternity) || (benef.outpatientOnly && !col.flags?.outpatient) || (benef.dentalOnly && !col.flags?.dental) || (benef.childOnly && !col.flags?.child) || (benef.elderOnly && !col.flags?.elder)) {
                cellsData.push({ displayValue: '', singleValue: 0 }); return;
            }
            
            let displayValue = '', singleValue = 0;
            const formulaKey = benef.formulaKey;
            const formulaFunc = formulaKey && appState.context.registries.UI_FUNCTIONS.bmFormulas[formulaKey];
            
            if (formulaFunc) {
                const raw = formulaFunc(col, benef.params || {});
                if (benef.valueType === 'number') {
                    singleValue = roundTo1000(raw);
                    displayValue = singleValue ? formatCurrency(singleValue * (benef.multiClaim || 1)) : '';
                } else {
                    displayValue = raw;
                }
            } else if (benef.valueType === 'text') {
                displayValue = benef.text || '';
            }

            if (displayValue) anyVisible = true;
            cellsData.push({ displayValue, singleValue });
        });
        if (anyVisible) rows.push({ benef, cellsData });
    });

    const bodyHtml = rows.map(r => {
        if (r.isHeader) return `<tr><td colspan="${r.colspan}" style="font-weight: bold;">${sanitizeHtml(r.benef.labelBase)}</td></tr>`;
        
        let labelHtml = `${sanitizeHtml(r.benef.labelBase)}${r.benef.formulaLabel ? ` - ${sanitizeHtml(r.benef.formulaLabel)}` : ''}`;
        if (r.benef.multiClaim) {
            const firstCell = r.cellsData.find(c => c.singleValue > 0);
            if (firstCell) labelHtml += ` - ${formatCurrency(firstCell.singleValue)} x ${r.benef.multiClaim}`;
        }

        const cellsHtml = r.cellsData.map(c => `<td style="text-align: right">${c.displayValue}</td>`).join('');
        return `<tr><td>${labelHtml}</td>${cellsHtml}</tr>`;
    }).join('');

    let totalRowHtml = '';
    if (schema.hasTotal) {
        let totalCellsSum = columns.map((_, i) => rows.reduce((sum, r) => sum + ((r.benef.valueType === 'number' && r.cellsData[i].singleValue) ? (r.cellsData[i].singleValue * (r.benef.multiClaim || 1)) : 0), 0));
        totalRowHtml = `<tr><td style="font-weight: bold;">Tổng quyền lợi</td>${totalCellsSum.map(s => `<td style="text-align: right; font-weight: bold;">${s ? formatCurrency(s) : ''}</td>`).join('')}</tr>`;
    }

    return `<div><h3>${sanitizeHtml(title)}</h3><table><thead><tr><th>Tên quyền lợi</th>${headCols}</tr></thead><tbody>${bodyHtml}${totalRowHtml}</tbody></table></div>`;
}
