const STORAGE_KEY = "mavi-facturacion-v5";
const VAT_RATE = 1.21;

const DEFAULT_STATE = {
  activeTab: "resumen",
  activeMonth: "2026-03",
  editInvoices: false,
  editSettlements: false,
  installmentOpen: {},
  months: ["2025-10", "2026-02", "2026-03", "2026-04"],
  invoices: [
    { id: uid(), month: "2026-03", title: "1", client: "TOPA", invoiceNo: "Private Tour + Bilbao", baseAmount: 1150, totalAmount: 1391.5, issuedBy: "Amaia", issueDate: "2026-03-10", dueDate: "2026-06-10", status: "Pendiente", paymentMode: "Peşin", paidAmount: 0, installments: [], notes: "" },
    { id: uid(), month: "2026-02", title: "2", client: "YAIZA", invoiceNo: "Rebranding + Web", baseAmount: 1650, totalAmount: 1996.5, issuedBy: "Oihane", issueDate: "2026-02-11", dueDate: "2026-02-17", status: "Pagada", paymentMode: "Peşin", paidAmount: 1996.5, installments: [], notes: "" },
    { id: uid(), month: "2025-10", title: "1", client: "TOPA", invoiceNo: "Rebranding + Web", baseAmount: 4440, totalAmount: 5372, issuedBy: "Oihane", issueDate: "2025-10-06", dueDate: "2026-03-03", status: "Pendiente", paymentMode: "Taksitli", paidAmount: 2400, installments: [{ id: uid(), amount: 1200, status: "Pagada", note: "Enero" }, { id: uid(), amount: 1200, status: "Pagada", note: "Febrero" }], notes: "No han pagado Enero ni Febrero" },
  ],
  settlements: [
    { id: uid(), month: "2026-03", client: "YAIZA", invoiceNo: "Rebranding + Web", amount: 1996.5, status: "Pagada", liquidation: "Pendiente", oweAmaia: 825, oweOihane: 0, note: "" },
  ],
};

const APP_CONFIG = window.APP_CONFIG || {};
const cloudEnabled = Boolean(APP_CONFIG.SUPABASE_URL && APP_CONFIG.SUPABASE_ANON_KEY && window.supabase?.createClient);
const supabaseClient = cloudEnabled ? window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY) : null;

let state = loadLocalState();

const mainTabsEl = document.getElementById("mainTabs");
const monthTabsFactEl = document.getElementById("monthTabsFact");
const monthTabsEntreEl = document.getElementById("monthTabsEntre");

const summaryStatsEl = document.getElementById("summaryStats");
const yearlyChartEl = document.getElementById("yearlyChart");
const funBalanceEl = document.getElementById("funBalance");
const invoiceBodyEl = document.getElementById("invoiceBody");
const settlementBodyEl = document.getElementById("settlementBody");

init();

async function init() {
  if (cloudEnabled) {
    state = await loadCloudOrLocal();
    subscribeCloud(async () => {
      state = await loadCloudOrLocal();
      render();
    });
    await seedCloudIfEmpty();
  }

  // Always start on the summary tab when the page is opened.
  state.activeTab = "resumen";
  bindEvents();
  initTablePanning();
  render();
}

function bindEvents() {
  mainTabsEl.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-tab]");
    if (!btn) return;
    state.activeTab = btn.dataset.tab;
    persist();
    renderTabsOnly();
  });

  [monthTabsFactEl, monthTabsEntreEl].forEach((el) => {
    el.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-month]");
      if (!btn) return;
      state.activeMonth = btn.dataset.month;
      persist();
      render();
    });
  });

  document.getElementById("toggleInvoiceEditBtn").addEventListener("click", () => {
    state.editInvoices = !state.editInvoices;
    persist();
    renderInvoices();
    document.getElementById("toggleInvoiceEditBtn").textContent = state.editInvoices ? "Bloquear" : "Editar";
  });

  document.getElementById("toggleSettlementEditBtn").addEventListener("click", () => {
    state.editSettlements = !state.editSettlements;
    persist();
    renderSettlements();
    document.getElementById("toggleSettlementEditBtn").textContent = state.editSettlements ? "Bloquear" : "Editar";
  });

  document.getElementById("addInvoiceBtn").addEventListener("click", async () => {
    state.editInvoices = true;
    document.getElementById("toggleInvoiceEditBtn").textContent = "Bloquear";
    const newMonth = state.activeMonth === "all" ? formatMonth(new Date()) : state.activeMonth;
    ensureMonthExists(newMonth);
    state.activeMonth = newMonth;
    const item = { id: uid(), month: newMonth, title: String(getInvoicesByMonth().length + 1), client: "", invoiceNo: "", baseAmount: 0, totalAmount: 0, issuedBy: "", issueDate: `${newMonth}-01`, dueDate: "", status: "Pendiente", paymentMode: "Peşin", paidAmount: 0, installments: [], notes: "" };
    state.invoices.push(item);
    persist();
    render();
    await upsertInvoice(item);
  });

  document.getElementById("addSettlementBtn").addEventListener("click", async () => {
    state.editSettlements = true;
    document.getElementById("toggleSettlementEditBtn").textContent = "Bloquear";
    const newMonth = state.activeMonth === "all" ? formatMonth(new Date()) : state.activeMonth;
    ensureMonthExists(newMonth);
    state.activeMonth = newMonth;
    const item = { id: uid(), month: newMonth, client: "", invoiceNo: "", amount: 0, status: "Pendiente", liquidation: "Pendiente", oweAmaia: 0, oweOihane: 0, note: "" };
    state.settlements.push(item);
    persist();
    render();
    await upsertSettlement(item);
  });

  invoiceBodyEl.addEventListener("change", async (event) => {
    if (!state.editInvoices) return;
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    const item = state.invoices.find((x) => x.id === row.dataset.id);
    if (!item) return;

    const installmentField = event.target.dataset.installmentField;
    const installmentId = event.target.dataset.installmentId;
    if (installmentField && installmentId) {
      const ins = (item.installments || []).find((x) => x.id === installmentId);
      if (!ins) return;
      if (installmentField === "amount") ins.amount = num(event.target.value);
      else ins[installmentField] = event.target.value;
      persist();
      renderInvoices();
      await upsertInvoice(item);
      return;
    }

    const { field, value } = { field: event.target.dataset.field, value: event.target.value };
    if (["baseAmount", "totalAmount", "paidAmount"].includes(field)) item[field] = num(value);
    else item[field] = value;
    if (field === "paymentMode" && item.paymentMode === "Peşin") item.installments = [];
    if (field === "paymentMode" && item.paymentMode === "Taksitli" && !(item.installments || []).length) {
      item.installments = [{ id: uid(), amount: 0, status: "Pendiente", note: "" }];
      state.installmentOpen[item.id] = true;
    }
    if (field === "baseAmount" && !item.totalAmount) item.totalAmount = round2(item.baseAmount * VAT_RATE);
    if (field === "paidAmount" && item.paidAmount >= item.totalAmount && item.totalAmount > 0) item.status = "Pagada";
    if (field === "issueDate" && /^\d{4}-\d{2}-\d{2}$/.test(item.issueDate || "")) {
      item.month = item.issueDate.slice(0, 7);
      ensureMonthExists(item.month);
      state.activeMonth = item.month;
    }

    persist();
    render();
    await upsertInvoice(item);
  });

  settlementBodyEl.addEventListener("change", async (event) => {
    if (!state.editSettlements) return;
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    const item = state.settlements.find((x) => x.id === row.dataset.id);
    if (!item) return;

    const { field, value } = { field: event.target.dataset.field, value: event.target.value };
    if (["amount", "oweAmaia", "oweOihane"].includes(field)) item[field] = num(value);
    else item[field] = value;

    persist();
    render();
    await upsertSettlement(item);
  });

  invoiceBodyEl.addEventListener("click", async (event) => {
    const toggleBtn = event.target.closest("button[data-toggle-installments]");
    if (toggleBtn) {
      const id = toggleBtn.dataset.toggleInstallments;
      state.installmentOpen[id] = !state.installmentOpen[id];
      persist();
      renderInvoices();
      return;
    }

    const addBtn = event.target.closest("button[data-add-installment]");
    if (addBtn && state.editInvoices) {
      const item = state.invoices.find((x) => x.id === addBtn.dataset.addInstallment);
      if (!item) return;
      item.installments = item.installments || [];
      item.installments.push({ id: uid(), amount: 0, status: "Pendiente", note: "" });
      state.installmentOpen[item.id] = true;
      persist();
      renderInvoices();
      await upsertInvoice(item);
      return;
    }

    const delInstallmentBtn = event.target.closest("button[data-del-installment]");
    if (delInstallmentBtn && state.editInvoices) {
      const rowId = delInstallmentBtn.dataset.invoiceId;
      const insId = delInstallmentBtn.dataset.delInstallment;
      const item = state.invoices.find((x) => x.id === rowId);
      if (!item) return;
      item.installments = (item.installments || []).filter((x) => x.id !== insId);
      if (!(item.installments || []).length) state.installmentOpen[item.id] = false;
      persist();
      renderInvoices();
      await upsertInvoice(item);
      return;
    }

    const btn = event.target.closest("button[data-del-invoice]");
    if (!btn || !state.editInvoices) return;
    state.invoices = state.invoices.filter((x) => x.id !== btn.dataset.delInvoice);
    persist();
    render();
    await deleteInvoice(btn.dataset.delInvoice);
  });

  settlementBodyEl.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-del-settlement]");
    if (!btn || !state.editSettlements) return;
    state.settlements = state.settlements.filter((x) => x.id !== btn.dataset.delSettlement);
    persist();
    render();
    await deleteSettlement(btn.dataset.delSettlement);
  });
}

function render() {
  renderTabsOnly();
  renderMonthTabs();
  renderSummary();
  renderInvoices();
  renderSettlements();
  document.getElementById("toggleInvoiceEditBtn").textContent = state.editInvoices ? "Bloquear" : "Editar";
  document.getElementById("toggleSettlementEditBtn").textContent = state.editSettlements ? "Bloquear" : "Editar";
}

function renderTabsOnly() {
  mainTabsEl.querySelectorAll(".main-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === state.activeTab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`tab-${state.activeTab}`).classList.add("active");
}

function renderMonthTabs() {
  const months = [...new Set(state.months)].sort();
  state.months = months;
  if (state.activeMonth !== "all" && !months.includes(state.activeMonth)) {
    state.activeMonth = months[months.length - 1] || formatMonth(new Date());
  }

  const allBtn = `<button class="month-tab all-tab ${state.activeMonth === "all" ? "active" : ""}" data-month="all">Todos</button>`;
  const html = allBtn + months.map((m) => `<button class="month-tab ${m === state.activeMonth ? "active" : ""}" data-month="${m}">${monthLabel(m)}</button>`).join("");
  monthTabsFactEl.innerHTML = html;
  monthTabsEntreEl.innerHTML = html;
}

function renderSummary() {
  const months = recentMonthsData(8);
  const total = months.reduce((a, y) => a + y.total, 0);
  const paid = months.reduce((a, y) => a + y.paid, 0);
  const count = months.reduce((a, y) => a + y.count, 0);

  summaryStatsEl.innerHTML = `
    <article class="stat-card stat-fact"><small>Facturación total</small><strong>${money(total)}</strong></article>
    <article class="stat-card stat-cobrado"><small>Cobrado total</small><strong>${money(paid)}</strong></article>
    <article class="stat-card stat-saldo"><small>Saldo pendiente</small><strong>${money(total - paid)}</strong></article>
    <article class="stat-card stat-count"><small>Facturas recientes</small><strong>${count}</strong></article>
  `;

  const rawMax = Math.max(1, ...months.flatMap((y) => [y.total, y.paid]));
  const scaleMax = Math.max(1000, Math.ceil(rawMax / 1000) * 1000);
  const ticks = [];
  for (let v = scaleMax; v >= 0; v -= 1000) ticks.push(v);

  const bars = months
    .map((m) => {
      const th = Math.max(2, (m.total / scaleMax) * 160);
      const ph = Math.max(2, (m.paid / scaleMax) * 160);
      return `<article class="bar-col" title="${monthLabel(m.month)}">
        <div class="bars">
          <span class="bar total" style="height:${th}px"></span>
          <span class="bar paid" style="height:${ph}px"></span>
        </div>
        <small>${monthShortOnly(m.month)}</small>
        <div class="bar-tooltip">Facturación: ${money(m.total)}<br/>Cobrado: ${money(m.paid)}</div>
      </article>`;
    })
    .join("");

  yearlyChartEl.innerHTML = `
    <div class="chart-legend">
      <span><i class="dot dot-f"></i>Facturación</span>
      <span><i class="dot dot-c"></i>Cobrado</span>
    </div>
    <div class="chart-body">
      <div class="chart-scale">
        ${ticks.map((t) => `<span>${formatThousands(t)} €</span>`).join("")}
      </div>
      <div class="chart-bars">
        ${bars}
      </div>
    </div>
  `;

  renderFunBalance();
}

function renderFunBalance() {
  const totalAmaia = sum(state.settlements, "oweAmaia");
  const totalOihane = sum(state.settlements, "oweOihane");
  const diff = round2(totalAmaia - totalOihane);

  let amaiaClass = "";
  let oihaneClass = "";
  let amaiaStatus = "Todo equilibrado";
  let oihaneStatus = "Todo equilibrado";
  let amaiaAmountLabel = "Total";
  let oihaneAmountLabel = "Total";
  let amaiaAmountValue = money(totalAmaia);
  let oihaneAmountValue = money(totalOihane);
  let summary = "No hay deuda interna pendiente.";

  if (diff > 0) {
    // Oihane owes Amaia -> user preference: Amaia sad, Oihane money-eyes
    amaiaClass = "sad";
    oihaneClass = "rich";
    amaiaStatus = "Esperando pago";
    oihaneStatus = "Debe pagar";
    amaiaAmountLabel = "A cobrar";
    oihaneAmountLabel = "A pagar";
    amaiaAmountValue = money(diff);
    oihaneAmountValue = money(diff);
    summary = `Oihane debe a Amaia ${money(diff)}.`;
  } else if (diff < 0) {
    // Amaia owes Oihane -> user preference mirrored
    amaiaClass = "rich";
    oihaneClass = "sad";
    amaiaStatus = "Debe pagar";
    oihaneStatus = "Esperando pago";
    amaiaAmountLabel = "A pagar";
    oihaneAmountLabel = "A cobrar";
    amaiaAmountValue = money(Math.abs(diff));
    oihaneAmountValue = money(Math.abs(diff));
    summary = `Amaia debe a Oihane ${money(Math.abs(diff))}.`;
  }

  funBalanceEl.innerHTML = `
    <article class="person-card ${amaiaClass}">
      <div class="avatar">
        <img class="avatar-photo" src="amaia-avatar.svg" alt="Amaia" />
        <span class="overlay overlay-sad"></span>
        <span class="overlay overlay-rich"></span>
      </div>
      <div class="person-name">Amaia</div>
      <div class="person-status">${amaiaStatus}</div>
      <div class="person-amount">${amaiaAmountLabel}: ${amaiaAmountValue}</div>
    </article>
    <article class="person-card ${oihaneClass}">
      <div class="avatar">
        <img class="avatar-photo" src="oihane-avatar.svg" alt="Oihane" />
        <span class="overlay overlay-sad"></span>
        <span class="overlay overlay-rich"></span>
      </div>
      <div class="person-name">Oihane</div>
      <div class="person-status">${oihaneStatus}</div>
      <div class="person-amount">${oihaneAmountLabel}: ${oihaneAmountValue}</div>
    </article>
    <div class="fun-summary">${summary}</div>
  `;
}

function renderInvoices() {
  const rows = getInvoicesByMonth();
  const disabled = !state.editInvoices ? "disabled" : "";

  invoiceBodyEl.innerHTML = rows.map((item, idx) => {
    const mode = item.paymentMode || "Peşin";
    const installments = item.installments || [];
    const isInstallment = mode === "Taksitli";
    const hasInstallments = installments.length > 0;
    const isOpen = Boolean(state.installmentOpen[item.id]);
    const saldo = round2(num(item.totalAmount) - num(item.paidAmount));
    const mainRow = `<tr data-id="${item.id}">
      <td>${idx + 1}</td>
      <td><input ${disabled} data-field="client" value="${esc(item.client)}"></td>
      <td><input ${disabled} data-field="invoiceNo" value="${esc(item.invoiceNo)}"></td>
      <td>${state.editInvoices ? `<input data-field="baseAmount" type="number" step="0.01" value="${num(item.baseAmount)}">` : `<div class="money-preview">${money(item.baseAmount)}</div>`}</td>
      <td>${state.editInvoices ? `<input data-field="totalAmount" type="number" step="0.01" value="${num(item.totalAmount)}">` : `<div class="money-preview">${money(item.totalAmount)}</div>`}</td>
      <td><select ${disabled} data-field="issuedBy">${opt(item.issuedBy, "")}${opt(item.issuedBy, "Amaia")}${opt(item.issuedBy, "Oihane")}</select></td>
      <td class="col-date"><input ${disabled} data-field="issueDate" type="date" value="${item.issueDate || ""}"></td>
      <td class="col-date"><input ${disabled} data-field="dueDate" type="date" value="${item.dueDate || ""}"></td>
      <td><select ${disabled} data-field="status">${opt(item.status, "Pendiente")}${opt(item.status, "Pagada")}${opt(item.status, "Vencida")}</select><span class="pill ${saldo <= 0 ? "done" : "open"}">${saldo <= 0 ? "Completada" : "Abierta"}</span></td>
      <td class="payment-cell">${
        state.editInvoices
          ? `<select data-field="paymentMode">${opt(mode, "Peşin")}${opt(mode, "Taksitli")}</select>`
          : `<span class="pay-badge ${isInstallment ? "installment" : "cash"}">${mode}</span>`
      } ${isInstallment && hasInstallments ? `<button type="button" class="mini-toggle" data-toggle-installments="${item.id}">${isOpen ? "Ocultar" : "Cuotas"}</button>` : ""} ${isInstallment && !hasInstallments && state.editInvoices ? `<button type="button" class="mini-toggle" data-add-installment="${item.id}">+ Cuota</button>` : ""}</td>
      <td>${state.editInvoices ? `<input data-field="paidAmount" type="number" step="0.01" value="${num(item.paidAmount)}">` : `<div class="money-preview">${money(item.paidAmount)}</div>`}</td>
      <td>${money(saldo)}</td>
      <td class="col-notas">${
        state.editInvoices
          ? `<textarea data-field="notes" rows="2">${esc(item.notes)}</textarea>`
          : `<div class="note-preview" title="${esc(item.notes || "")}">${esc(item.notes || "-")}</div>`
      }</td>
      <td><button class="icon-btn ${state.editInvoices ? "" : "hidden"}" data-del-invoice="${item.id}" type="button" title="Eliminar fila">×</button></td>
    </tr>`;
    const installmentRows = isInstallment && isOpen && hasInstallments
      ? `<tr class="installment-row" data-id="${item.id}">
          <td colspan="14">
            <div class="installment-wrap">
              <div class="installment-head">
                <strong>Cuotas del proyecto</strong>
                ${state.editInvoices ? `<button type="button" class="btn alt" data-add-installment="${item.id}">+ Añadir cuota</button>` : ""}
              </div>
              <div class="installment-grid">
                ${installments.map((ins, i) => `<div class="installment-item">
                  <div class="installment-idx">${i + 1}</div>
                  <input ${disabled} data-installment-id="${ins.id}" data-installment-field="amount" type="number" step="0.01" value="${num(ins.amount)}">
                  <select ${disabled} data-installment-id="${ins.id}" data-installment-field="status">${opt(ins.status || "Pendiente", "Pendiente")}${opt(ins.status || "Pendiente", "Pagada")}</select>
                  <input ${disabled} data-installment-id="${ins.id}" data-installment-field="note" value="${esc(ins.note || "")}" placeholder="Nota">
                  <button type="button" class="icon-btn ${state.editInvoices ? "" : "hidden"}" data-invoice-id="${item.id}" data-del-installment="${ins.id}">×</button>
                </div>`).join("")}
              </div>
            </div>
          </td>
        </tr>`
      : "";
    return mainRow + installmentRows;
  }).join("");

  const base = sum(rows, "baseAmount");
  const total = sum(rows, "totalAmount");
  const paid = sum(rows, "paidAmount");
  document.getElementById("totalBase").textContent = money(base);
  document.getElementById("totalAmount").textContent = money(total);
  document.getElementById("totalPaid").textContent = money(paid);
  document.getElementById("totalBalance").textContent = money(total - paid);
}

function renderSettlements() {
  const rows = getSettlementsByMonth();
  const disabled = !state.editSettlements ? "disabled" : "";

  settlementBodyEl.innerHTML = rows.map((item, index) => `<tr data-id="${item.id}">
    <td>${index + 1}</td>
    <td><input ${disabled} data-field="client" value="${esc(item.client)}"></td>
    <td><input ${disabled} data-field="invoiceNo" value="${esc(item.invoiceNo)}"></td>
    <td>${state.editSettlements ? `<input data-field="amount" type="number" step="0.01" value="${num(item.amount)}">` : `<div class="money-preview">${money(item.amount)}</div>`}</td>
    <td><select ${disabled} data-field="status">${opt(item.status, "Pendiente")}${opt(item.status, "Pagada")}</select></td>
    <td>${state.editSettlements ? `<input data-field="oweAmaia" type="number" step="0.01" value="${num(item.oweAmaia)}">` : `<div class="money-preview">${money(item.oweAmaia)}</div>`}</td>
    <td>${state.editSettlements ? `<input data-field="oweOihane" type="number" step="0.01" value="${num(item.oweOihane)}">` : `<div class="money-preview">${money(item.oweOihane)}</div>`}</td>
    <td><input ${disabled} data-field="note" value="${esc(item.note)}"></td>
    <td><button class="icon-btn ${state.editSettlements ? "" : "hidden"}" data-del-settlement="${item.id}" type="button">x</button></td>
  </tr>`).join("");

  const a = sum(rows, "oweAmaia");
  const o = sum(rows, "oweOihane");
  document.getElementById("totalAmaia").textContent = money(a);
  document.getElementById("totalOihane").textContent = money(o);
  const d = round2(a - o);
  document.getElementById("differenceLabel").textContent = d > 0 ? `Oihane debe a Amaia ${money(d)}` : d < 0 ? `Amaia debe a Oihane ${money(Math.abs(d))}` : "Sin diferencia";
}

function recentMonthsData(limit = 6) {
  const monthsInData = [...new Set(state.invoices.map((i) => i.month).filter(Boolean))].sort();
  const selected = monthsInData.slice(-limit);
  if (!selected.length) selected.push(formatMonth(new Date()));

  return selected.map((month) => {
    const items = state.invoices.filter((i) => i.month === month);
    return {
      month,
      total: sum(items, "totalAmount"),
      paid: sum(items, "paidAmount"),
      count: items.length,
    };
  });
}

function getInvoicesByMonth() {
  if (state.activeMonth === "all") {
    return [...state.invoices].sort((a, b) => {
      const byMonth = (a.month || "").localeCompare(b.month || "");
      if (byMonth !== 0) return byMonth;
      const byDate = (a.issueDate || "").localeCompare(b.issueDate || "");
      if (byDate !== 0) return byDate;
      return (a.client || "").localeCompare(b.client || "");
    });
  }
  return state.invoices.filter((x) => x.month === state.activeMonth);
}
function getSettlementsByMonth() {
  if (state.activeMonth === "all") return [...state.settlements].sort((a, b) => (a.month || "").localeCompare(b.month || ""));
  return state.settlements.filter((x) => x.month === state.activeMonth);
}
function ensureMonthExists(month) {
  if (!month) return;
  if (!state.months.includes(month)) {
    state.months.push(month);
    state.months.sort();
  }
}

function persist() { saveLocalState(state); }

async function loadCloudOrLocal() {
  const local = loadLocalState();
  try {
    const [meta, inv, set] = await Promise.all([
      supabaseClient.from("app_meta").select("months,active_month").eq("id", "main").maybeSingle(),
      supabaseClient.from("invoices").select("*").order("created_at", { ascending: true }),
      supabaseClient.from("settlements").select("*").order("created_at", { ascending: true }),
    ]);
    if (inv.error || set.error) return local;
    const localById = new Map((local.invoices || []).map((x) => [x.id, x]));
    const invoices = (inv.data || []).map((r) => normalizeInvoice({
      id: r.id,
      month: r.month || "",
      title: r.title || "",
      client: r.client || "",
      invoiceNo: r.invoice_no || "",
      baseAmount: num(r.base_amount),
      totalAmount: num(r.total_amount),
      issuedBy: r.issued_by || "",
      issueDate: r.issue_date || "",
      dueDate: r.due_date || "",
      status: r.status || "Pendiente",
      paidAmount: num(r.paid_amount),
      notes: r.notes || "",
      paymentMode: localById.get(r.id)?.paymentMode || "Peşin",
      installments: localById.get(r.id)?.installments || [],
    }));
    const settlements = (set.data || []).map((r) => ({ id: r.id, month: r.month || "", client: r.client || "", invoiceNo: r.invoice_no || "", amount: num(r.amount), status: r.status || "Pendiente", liquidation: r.liquidation || "Pendiente", oweAmaia: num(r.owe_amaia), oweOihane: num(r.owe_oihane), note: r.note || "" }));
    const months = [...new Set([...(Array.isArray(meta.data?.months) ? meta.data.months : []), ...invoices.map((x) => x.month), ...settlements.map((x) => x.month)].filter(Boolean))].sort();
    if (!invoices.length && !settlements.length && !months.length) return local;
    const next = { ...local, months: months.length ? months : local.months, activeMonth: meta.data?.active_month || local.activeMonth, invoices, settlements };
    saveLocalState(next);
    return next;
  } catch (_e) { return local; }
}

async function seedCloudIfEmpty() {
  const [inv, set] = await Promise.all([supabaseClient.from("invoices").select("id").limit(1), supabaseClient.from("settlements").select("id").limit(1)]);
  if ((inv.data || []).length || (set.data || []).length) return;
  await replaceCloudState(state);
}

async function replaceCloudState(next) {
  await supabaseClient.from("invoices").delete().gte("created_at", "1900-01-01");
  await supabaseClient.from("settlements").delete().gte("created_at", "1900-01-01");
  if (next.invoices.length) await supabaseClient.from("invoices").upsert(next.invoices.map((i) => ({ id: i.id, month: i.month, title: i.title || "", client: i.client || "", invoice_no: i.invoiceNo || "", base_amount: num(i.baseAmount), total_amount: num(i.totalAmount), issued_by: i.issuedBy || "", issue_date: i.issueDate || null, due_date: i.dueDate || null, status: i.status || "Pendiente", paid_amount: num(i.paidAmount), notes: i.notes || "" })), { onConflict: "id" });
  if (next.settlements.length) await supabaseClient.from("settlements").upsert(next.settlements.map((i) => ({ id: i.id, month: i.month, client: i.client || "", invoice_no: i.invoiceNo || "", amount: num(i.amount), status: i.status || "Pendiente", liquidation: i.liquidation || "Pendiente", owe_amaia: num(i.oweAmaia), owe_oihane: num(i.oweOihane), note: i.note || "" })), { onConflict: "id" });
  await syncMeta();
}

async function syncMeta() {
  if (!cloudEnabled) return;
  await supabaseClient.from("app_meta").upsert([{ id: "main", months: state.months, active_month: state.activeMonth }], { onConflict: "id" });
}

async function upsertInvoice(i) {
  if (!cloudEnabled) return;
  await supabaseClient.from("invoices").upsert([{ id: i.id, month: i.month, title: i.title || "", client: i.client || "", invoice_no: i.invoiceNo || "", base_amount: num(i.baseAmount), total_amount: num(i.totalAmount), issued_by: i.issuedBy || "", issue_date: i.issueDate || null, due_date: i.dueDate || null, status: i.status || "Pendiente", paid_amount: num(i.paidAmount), notes: i.notes || "" }], { onConflict: "id" });
  await syncMeta();
}
async function deleteInvoice(id) { if (cloudEnabled) await supabaseClient.from("invoices").delete().eq("id", id); }
async function upsertSettlement(i) {
  if (!cloudEnabled) return;
  await supabaseClient.from("settlements").upsert([{ id: i.id, month: i.month, client: i.client || "", invoice_no: i.invoiceNo || "", amount: num(i.amount), status: i.status || "Pendiente", liquidation: i.liquidation || "Pendiente", owe_amaia: num(i.oweAmaia), owe_oihane: num(i.oweOihane), note: i.note || "" }], { onConflict: "id" });
  await syncMeta();
}
async function deleteSettlement(id) { if (cloudEnabled) await supabaseClient.from("settlements").delete().eq("id", id); }

function initTablePanning() {
  const wraps = document.querySelectorAll(".table-wrap");
  wraps.forEach((wrap) => {
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    wrap.addEventListener("mousedown", (event) => {
      if (event.target.closest("input, select, textarea, button, option")) return;
      isDown = true;
      wrap.classList.add("dragging");
      startX = event.pageX - wrap.offsetLeft;
      startY = event.pageY - wrap.offsetTop;
      scrollLeft = wrap.scrollLeft;
      scrollTop = wrap.scrollTop;
    });

    wrap.addEventListener("mouseleave", () => {
      isDown = false;
      wrap.classList.remove("dragging");
    });

    wrap.addEventListener("mouseup", () => {
      isDown = false;
      wrap.classList.remove("dragging");
    });

    wrap.addEventListener("mousemove", (event) => {
      if (!isDown) return;
      event.preventDefault();
      const x = event.pageX - wrap.offsetLeft;
      const y = event.pageY - wrap.offsetTop;
      wrap.scrollLeft = scrollLeft - (x - startX);
      wrap.scrollTop = scrollTop - (y - startY);
    });

    wrap.addEventListener(
      "wheel",
      (event) => {
        if (!event.shiftKey) return;
        event.preventDefault();
        wrap.scrollLeft += event.deltaY;
      },
      { passive: false }
    );
  });
}

function subscribeCloud(onChange) {
  if (!cloudEnabled) return;
  supabaseClient
    .channel("mavi-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "settlements" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "app_meta" }, onChange)
    .subscribe();
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const p = JSON.parse(raw);
    const next = { ...structuredClone(DEFAULT_STATE), ...p };
    next.invoices = (next.invoices || []).map(normalizeInvoice);
    next.installmentOpen = next.installmentOpen || {};
    return next;
  } catch (_e) { return structuredClone(DEFAULT_STATE); }
}
function saveLocalState(v) { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); }

function monthLabel(v) {
  const [y, m] = v.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, 1);
  const month = dt.toLocaleDateString("es-ES", { month: "long" });
  return `${month.charAt(0).toUpperCase() + month.slice(1)} - ${y}`;
}
function monthShortOnly(v) {
  const [y, m] = v.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  const mm = d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
  return `${mm} ${y}`;
}
function formatMonth(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function sum(rows, key) { return round2(rows.reduce((a, r) => a + num(r[key]), 0)); }
function formatNumberEs(value, decimals = 0) {
  const n = num(value);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decimals === 0) return `${sign}${grouped}`;
  return `${sign}${grouped},${decPart}`;
}
function money(v) { return `${formatNumberEs(v, 2)} €`; }
function formatThousands(v) { return formatNumberEs(v, 0); }
function round2(n) { return Math.round((num(n) + Number.EPSILON) * 100) / 100; }
function uid() { return (crypto?.randomUUID?.() || String(Date.now() + Math.random())).replaceAll("-", ""); }
function opt(cur, v) { return `<option value="${v}" ${cur === v ? "selected" : ""}>${v || "-"}</option>`; }
function esc(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function normalizeInvoice(i) {
  return {
    ...i,
    paymentMode: i.paymentMode || "Peşin",
    installments: Array.isArray(i.installments)
      ? i.installments.map((x) => ({ id: x.id || uid(), amount: num(x.amount), status: x.status || "Pendiente", note: x.note || "" }))
      : [],
  };
}
