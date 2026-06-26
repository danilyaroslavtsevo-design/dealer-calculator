const STORAGE_KEY = "dealer_calculator_tax_settings";
const DEFAULT_TAX_RATE = "20";
const DELETE_MODE = {
  ONE_TIME: "oneTime",
  CONTINUOUS: "continuous",
};

const state = {
  rows: [{ id: 0, purchasePriceText: "", salePriceText: "", quantityText: "1" }],
  nextRowId: 1,
  taxSettings: loadTaxSettings(),
  result: null,
  errorText: null,
  isResultCollapsed: true,
  deleteMode: null,
  ignoreNextDeleteClick: false,
  holdTimer: null,
  holdAnimationFrame: null,
  holdStartTime: 0,
};

const els = {
  rowsContainer: document.getElementById("rowsContainer"),
  addRowButton: document.getElementById("addRowButton"),
  deleteRowButton: document.getElementById("deleteRowButton"),
  deleteHoldFill: document.getElementById("deleteHoldFill"),
  calculateButton: document.getElementById("calculateButton"),
  clearButton: document.getElementById("clearButton"),
  errorText: document.getElementById("errorText"),
  resultCard: document.getElementById("resultCard"),
  detailsButton: document.getElementById("detailsButton"),
  resultDetails: document.getElementById("resultDetails"),
  mainResult: document.getElementById("mainResult"),
  settingsButton: document.getElementById("settingsButton"),
  settingsDialog: document.getElementById("settingsDialog"),
  settingsForm: document.getElementById("settingsForm"),
  purchaseVatRateInput: document.getElementById("purchaseVatRateInput"),
  saleVatRateInput: document.getElementById("saleVatRateInput"),
  profitTaxRateInput: document.getElementById("profitTaxRateInput"),
  settingsErrorText: document.getElementById("settingsErrorText"),
  cancelSettingsButton: document.getElementById("cancelSettingsButton"),
  saveSettingsButton: document.getElementById("saveSettingsButton"),
  toast: document.getElementById("toast"),
};

function loadTaxSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      purchaseVatRateText: saved.purchaseVatRateText || DEFAULT_TAX_RATE,
      saleVatRateText: saved.saleVatRateText || DEFAULT_TAX_RATE,
      profitTaxRateText: saved.profitTaxRateText || DEFAULT_TAX_RATE,
    };
  } catch {
    return {
      purchaseVatRateText: DEFAULT_TAX_RATE,
      saleVatRateText: DEFAULT_TAX_RATE,
      profitTaxRateText: DEFAULT_TAX_RATE,
    };
  }
}

function saveTaxSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.taxSettings));
}

function parseNumber(text) {
  const normalized = String(text)
    .trim()
    .replace(/\s/g, "")
    .replace(/\u00a0/g, "")
    .replace(",", ".");

  if (!normalized) return null;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function extractVat(priceWithVat, vatRate) {
  if (vatRate === 0) return 0;
  return (priceWithVat * vatRate) / (100 + vatRate);
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + " ₽";
}

function setError(text) {
  state.errorText = text;
  state.result = null;
  renderResult();
  renderError();
}

function clearError() {
  state.errorText = null;
  renderError();
}

function calculate() {
  const purchaseVatRate = parseNumber(state.taxSettings.purchaseVatRateText);
  const saleVatRate = parseNumber(state.taxSettings.saleVatRateText);
  const profitTaxRate = parseNumber(state.taxSettings.profitTaxRateText);

  if (purchaseVatRate === null || saleVatRate === null || profitTaxRate === null) {
    setError("Проверьте настройки налогов");
    return;
  }

  if (purchaseVatRate < 0 || saleVatRate < 0 || profitTaxRate < 0) {
    setError("Значения не могут быть отрицательными");
    return;
  }

  const parsedRows = state.rows.map((row) => ({
    purchasePrice: parseNumber(row.purchasePriceText),
    salePrice: parseNumber(row.salePriceText),
    quantity: parseNumber(row.quantityText),
  }));

  if (parsedRows.some((row) => row.purchasePrice === null || row.salePrice === null || row.quantity === null)) {
    setError("Заполните все строки корректными числами");
    return;
  }

  if (parsedRows.some((row) => row.purchasePrice < 0 || row.salePrice < 0)) {
    setError("Цены не могут быть отрицательными");
    return;
  }

  if (parsedRows.some((row) => row.quantity <= 0)) {
    setError("Количество должно быть больше нуля");
    return;
  }

  const totalPurchasePrice = parsedRows.reduce((sum, row) => sum + row.purchasePrice * row.quantity, 0);
  const totalSalePrice = parsedRows.reduce((sum, row) => sum + row.salePrice * row.quantity, 0);

  const purchaseVat = extractVat(totalPurchasePrice, purchaseVatRate);
  const saleVat = extractVat(totalSalePrice, saleVatRate);
  const purchaseWithoutVat = totalPurchasePrice - purchaseVat;
  const saleWithoutVat = totalSalePrice - saleVat;
  const vatToPay = saleVat - purchaseVat;
  const profitBeforeTax = saleWithoutVat - purchaseWithoutVat;
  const profitTax = profitBeforeTax > 0 ? (profitBeforeTax * profitTaxRate) / 100 : 0;
  const totalTaxes = vatToPay + profitTax;
  const dealerRemainder = totalSalePrice - totalPurchasePrice - totalTaxes;

  state.result = {
    totalPurchasePrice,
    totalSalePrice,
    purchaseVat,
    saleVat,
    vatToPay,
    purchaseWithoutVat,
    saleWithoutVat,
    profitBeforeTax,
    profitTax,
    totalTaxes,
    dealerRemainder,
  };
  state.isResultCollapsed = true;
  clearError();
  renderResult();
}

function renderRows() {
  els.rowsContainer.replaceChildren();

  state.rows.forEach((row, index) => {
    const rowEl = document.createElement("div");
    rowEl.className = "table-grid";

    rowEl.appendChild(createRowInput(row.purchasePriceText, (value) => {
      state.rows[index].purchasePriceText = value;
      invalidateResult();
    }));

    rowEl.appendChild(createRowInput(row.salePriceText, (value) => {
      state.rows[index].salePriceText = value;
      invalidateResult();
    }));

    if (state.deleteMode) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-cell";
      deleteButton.type = "button";
      deleteButton.textContent = "×";
      deleteButton.setAttribute("aria-label", `Удалить строку ${index + 1}`);
      deleteButton.addEventListener("click", () => deleteRow(index));
      rowEl.appendChild(deleteButton);
    } else {
      rowEl.appendChild(createRowInput(row.quantityText, (value) => {
        state.rows[index].quantityText = value;
        invalidateResult();
      }));
    }

    els.rowsContainer.appendChild(rowEl);
  });
}

function createRowInput(value, onValueChange) {
  const input = document.createElement("input");
  input.className = "table-input";
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.value = value;
  input.addEventListener("input", () => onValueChange(input.value));
  return input;
}

function addRow() {
  state.rows.push({
    id: state.nextRowId,
    purchasePriceText: "",
    salePriceText: "",
    quantityText: "1",
  });
  state.nextRowId += 1;
  invalidateResult();
  renderRows();
  renderDeleteButton();
}

function deleteRow(index) {
  if (state.rows.length <= 1 || index < 0 || index >= state.rows.length) return;

  state.rows.splice(index, 1);
  invalidateResult();

  if (state.rows.length <= 1 || state.deleteMode === DELETE_MODE.ONE_TIME) {
    state.deleteMode = null;
  }

  renderRows();
  renderDeleteButton();
}

function clearRows() {
  state.rows = [{ id: 0, purchasePriceText: "", salePriceText: "", quantityText: "1" }];
  state.nextRowId = 1;
  state.deleteMode = null;
  invalidateResult();
  renderRows();
  renderDeleteButton();
}

function invalidateResult() {
  state.result = null;
  clearError();
  renderResult();
}

function renderDeleteButton() {
  const canDeleteRow = state.rows.length > 1;
  els.deleteRowButton.disabled = !canDeleteRow;
  els.deleteRowButton.classList.toggle("is-continuous", state.deleteMode === DELETE_MODE.CONTINUOUS);

  if (!canDeleteRow) {
    state.deleteMode = null;
    resetHoldProgress();
  }

  if (state.deleteMode === DELETE_MODE.CONTINUOUS) {
    setHoldProgress(1);
  } else if (!state.holdTimer) {
    resetHoldProgress();
  }
}

function startDeleteHold(event) {
  if (event.button !== undefined && event.button !== 0) return;
  if (els.deleteRowButton.disabled) return;
  if (state.deleteMode === DELETE_MODE.CONTINUOUS) return;

  clearHoldState();
  state.holdStartTime = performance.now();

  const animate = (time) => {
    const progress = Math.min((time - state.holdStartTime) / 2000, 1);
    setHoldProgress(progress);

    if (progress < 1 && state.holdTimer) {
      state.holdAnimationFrame = requestAnimationFrame(animate);
    }
  };

  state.holdAnimationFrame = requestAnimationFrame(animate);
  state.holdTimer = window.setTimeout(() => {
    state.deleteMode = DELETE_MODE.CONTINUOUS;
    state.ignoreNextDeleteClick = true;
    clearHoldState(false);
    setHoldProgress(1);
    renderRows();
    renderDeleteButton();
  }, 2000);
}

function stopDeleteHold() {
  if (state.deleteMode === DELETE_MODE.CONTINUOUS) return;
  clearHoldState();
  resetHoldProgress();
}

function clearHoldState(cancelAnimation = true) {
  if (state.holdTimer) {
    clearTimeout(state.holdTimer);
    state.holdTimer = null;
  }

  if (cancelAnimation && state.holdAnimationFrame) {
    cancelAnimationFrame(state.holdAnimationFrame);
    state.holdAnimationFrame = null;
  }
}

function setHoldProgress(progress) {
  els.deleteRowButton.style.setProperty("--hold-progress", `${Math.max(0, Math.min(progress, 1)) * 100}%`);
}

function resetHoldProgress() {
  setHoldProgress(0);
}

function handleDeleteButtonClick() {
  if (state.ignoreNextDeleteClick) {
    state.ignoreNextDeleteClick = false;
    return;
  }

  if (state.deleteMode === null) {
    state.deleteMode = DELETE_MODE.ONE_TIME;
  } else {
    state.deleteMode = null;
  }

  renderRows();
  renderDeleteButton();
}

function renderError() {
  if (state.errorText) {
    els.errorText.textContent = state.errorText;
    els.errorText.hidden = false;
  } else {
    els.errorText.hidden = true;
    els.errorText.textContent = "";
  }
}

function renderResult() {
  if (!state.result) {
    els.resultCard.hidden = true;
    els.resultDetails.replaceChildren();
    els.mainResult.replaceChildren();
    return;
  }

  els.resultCard.hidden = false;
  els.detailsButton.textContent = state.isResultCollapsed ? "Подробнее" : "Свернуть";
  els.resultDetails.hidden = state.isResultCollapsed;
  els.resultDetails.replaceChildren();
  els.mainResult.replaceChildren();

  if (!state.isResultCollapsed) {
    [
      ["Сумма закупочных цен", state.result.totalPurchasePrice],
      ["Сумма цен продажи", state.result.totalSalePrice],
      ["Входящий НДС", state.result.purchaseVat],
      ["Исходящий НДС", state.result.saleVat],
      ["НДС к уплате / зачёту", state.result.vatToPay],
      ["Закупка без НДС", state.result.purchaseWithoutVat],
      ["Продажа без НДС", state.result.saleWithoutVat],
      ["Прибыль до налога", state.result.profitBeforeTax],
      ["Налог на прибыль", state.result.profitTax],
      ["Общая сумма налогов", state.result.totalTaxes],
    ].forEach(([label, value]) => {
      els.resultDetails.appendChild(createResultRow(label, formatMoney(value)));
    });
  }

  els.mainResult.appendChild(createResultRow("Ваш остаток", formatMoney(state.result.dealerRemainder), true));
}

function createResultRow(label, value, isMain = false) {
  const row = document.createElement("div");
  row.className = `result-row${isMain ? " is-main" : ""}`;

  const labelEl = document.createElement("span");
  labelEl.textContent = label;

  const valueButton = document.createElement("button");
  valueButton.className = "result-value";
  valueButton.type = "button";
  valueButton.textContent = value;
  valueButton.addEventListener("click", () => copyValue(label, value));

  row.append(labelEl, valueButton);
  return row;
}

async function copyValue(label, value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("aria-label", label);
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  showToast();
}

let toastTimer = null;

function showToast() {
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 1100);
}

function openSettings() {
  els.purchaseVatRateInput.value = state.taxSettings.purchaseVatRateText;
  els.saleVatRateInput.value = state.taxSettings.saleVatRateText;
  els.profitTaxRateInput.value = state.taxSettings.profitTaxRateText;
  els.settingsErrorText.hidden = true;
  els.settingsErrorText.textContent = "";
  els.settingsDialog.showModal();
}

function saveSettingsFromDialog() {
  const purchaseVatRateText = els.purchaseVatRateInput.value.trim();
  const saleVatRateText = els.saleVatRateInput.value.trim();
  const profitTaxRateText = els.profitTaxRateInput.value.trim();

  const purchaseVatRate = parseNumber(purchaseVatRateText);
  const saleVatRate = parseNumber(saleVatRateText);
  const profitTaxRate = parseNumber(profitTaxRateText);

  if (purchaseVatRate === null || saleVatRate === null || profitTaxRate === null) {
    showSettingsError("Заполните все ставки корректными числами");
    return;
  }

  if (purchaseVatRate < 0 || saleVatRate < 0 || profitTaxRate < 0) {
    showSettingsError("Ставки не могут быть отрицательными");
    return;
  }

  state.taxSettings = {
    purchaseVatRateText,
    saleVatRateText,
    profitTaxRateText,
  };
  saveTaxSettings();
  state.result = null;
  clearError();
  renderResult();
  els.settingsDialog.close();
}

function showSettingsError(text) {
  els.settingsErrorText.textContent = text;
  els.settingsErrorText.hidden = false;
}

function bindEvents() {
  els.addRowButton.addEventListener("click", addRow);
  els.deleteRowButton.addEventListener("click", handleDeleteButtonClick);
  els.deleteRowButton.addEventListener("pointerdown", startDeleteHold);
  els.deleteRowButton.addEventListener("pointerup", stopDeleteHold);
  els.deleteRowButton.addEventListener("pointercancel", stopDeleteHold);
  els.deleteRowButton.addEventListener("pointerleave", stopDeleteHold);
  els.calculateButton.addEventListener("click", calculate);
  els.clearButton.addEventListener("click", clearRows);
  els.detailsButton.addEventListener("click", () => {
    state.isResultCollapsed = !state.isResultCollapsed;
    renderResult();
  });
  els.settingsButton.addEventListener("click", openSettings);
  els.cancelSettingsButton.addEventListener("click", () => els.settingsDialog.close());
  els.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSettingsFromDialog();
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

bindEvents();
renderRows();
renderDeleteButton();
renderError();
renderResult();
registerServiceWorker();
