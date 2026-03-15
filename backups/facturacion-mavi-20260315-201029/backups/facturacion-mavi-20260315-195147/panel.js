const service = window.MaviDataService;
service.init();

let state = service.loadLocalState();
let activePeriod = state.activePeriod || service.PERIODS[0].id;

const periodTabsEl = document.getElementById("periodTabs");
const invoiceBodyEl = document.getElementById("invoiceBody");
const settlementBodyEl = document.getElementById("settlementBody");

init();

async function init() {
  const session = await service.getSession();
  if (!session?.user) {
    window.location.href = "index.html";
    return;
  }

  state = await service.loadState({ preferCloud: true });
  activePeriod = state.activePeriod || service.PERIODS[0].id;

  await service.seedCloudIfEmpty(state);
  render();

  service.subscribeToChanges(async () => {
    state = await service.loadState({ preferCloud: true });
    activePeriod = state.activePeriod || service.PERIODS[0].id;
    render();
  });

  bindEvents();
}

function bindEvents() {
  document.getElementById("backBtn").addEventListener("click", () => {
    window.location.href = "index.html";
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await service.signOut();
    window.location.href = "index.html";
  });

  document.getElementById("addInvoiceBtn").addEventListener("click", async () => {
    const row = newInvoice(activePeriod);
    state.invoices.push(row);
    persistLocal();
    render();
    await service.upsertInvoice(row);
  });

  document.getElementById("addSettlementBtn").addEventListener("click", async () => {
    const row = newSettlement(activePeriod);
    state.settlements.push(row);
    persistLocal();
    render();
    await service.upsertSettlement(row);
  });

  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("importInput").addEventListener("change", importData);

  periodTabsEl.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-period]");
    if (!btn) return;
    activePeriod = btn.dataset.period;
    state.activePeriod = activePeriod;
    persistLocal();
    render();
  });

  invoiceBodyEl.addEventListener("change", async (event) => {
    const target = event.target;
    const rowEl = target.closest("tr[data-id]");
    if (!rowEl) return;
    const row = state.invoices.find((item) => item.id === rowEl.dataset.id);
    if (!row) return;

    const field = target.dataset.field;
    if (["baseAmount", "totalAmount", "paidAmount"].includes(field)) {
      row[field] = service.parseNumber(target.value);
    } else {
      row[field] = target.value;
    }

    if (field === "paidAmount" && row.paidAmount >= row.totalAmount && row.totalAmount > 0) {
      row.status = "Pagada";
    }

    persistLocal();
    render();
    await service.upsertInvoice(row);
  });

  invoiceBodyEl.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-delete-invoice]");
    if (!btn) return;
    const id = btn.dataset.deleteInvoice;
    state.invoices = state.invoices.filter((item) => item.id !== id);
    persistLocal();
    render();
    await service.deleteInvoice(id);
  });

  settlementBodyEl.addEventListener("change", async (event) => {
    const target = event.target;
    const rowEl = target.closest("tr[data-id]");
    if (!rowEl) return;
    const row = state.settlements.find((item) => item.id === rowEl.dataset.id);
    if (!row) return;

    const field = target.dataset.field;
    if (["amount", "oweAmaia", "oweOihane"].includes(field)) {
      row[field] = service.parseNumber(target.value);
    } else {
      row[field] = target.value;
    }

    persistLocal();
    render();
    await service.upsertSettlement(row);
  });

  settlementBodyEl.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-delete-settlement]");
    if (!btn) return;
    const id = btn.dataset.deleteSettlement;
    state.settlements = state.settlements.filter((item) => item.id !== id);
    persistLocal();
    render();
    await service.deleteSettlement(id);
  });
}

function render() {
  renderTabs();
  renderInvoices();
  renderSettlements();
}

function renderTabs() {
  periodTabsEl.innerHTML = service.PERIODS
    .map((period) => {
      const active = period.id === activePeriod ? "active" : "";
      return `<button class="tab-btn ${active}" data-period="${period.id}">${period.label}</button>`;
    })
    .join("");
}

function renderInvoices() {
  const rows = state.invoices.filter((item) => item.period === activePeriod);

  invoiceBodyEl.innerHTML = rows
    .map((row) => {
      const balance = round2((row.totalAmount || 0) - (row.paidAmount || 0));
      return `
        <tr data-id="${row.id}">
          <td><input data-field="title" value="${escapeHtml(row.title)}" /></td>
          <td><input data-field="client" value="${escapeHtml(row.client)}" /></td>
          <td><input data-field="invoiceNo" value="${escapeHtml(row.invoiceNo)}" /></td>
          <td><input data-field="baseAmount" type="number" step="0.01" value="${row.baseAmount || 0}" /></td>
          <td><input data-field="totalAmount" type="number" step="0.01" value="${row.totalAmount || 0}" /></td>
          <td>
            <select data-field="issuedBy">
              ${option(row.issuedBy, "")}
              ${option(row.issuedBy, "Amaia")}
              ${option(row.issuedBy, "Oihane")}
            </select>
          </td>
          <td><input data-field="issueDate" type="date" value="${row.issueDate || ""}" /></td>
          <td><input data-field="dueDate" type="date" value="${row.dueDate || ""}" /></td>
          <td>
            <select data-field="status">
              ${option(row.status, "Mandar Factura")}
              ${option(row.status, "Pendiente")}
              ${option(row.status, "Pagada")}
              ${option(row.status, "Vencida")}
            </select>
          </td>
          <td><input data-field="paidAmount" type="number" step="0.01" value="${row.paidAmount || 0}" /></td>
          <td>${money(balance)}</td>
          <td><input data-field="notes" value="${escapeHtml(row.notes)}" /></td>
          <td><button class="icon-btn" data-delete-invoice="${row.id}">x</button></td>
        </tr>
      `;
    })
    .join("");

  const totals = rows.reduce(
    (acc, row) => {
      acc.base += Number(row.baseAmount) || 0;
      acc.total += Number(row.totalAmount) || 0;
      acc.paid += Number(row.paidAmount) || 0;
      return acc;
    },
    { base: 0, total: 0, paid: 0 }
  );

  document.getElementById("totalBase").textContent = money(totals.base);
  document.getElementById("totalWithVat").textContent = money(totals.total);
  document.getElementById("totalPaid").textContent = money(totals.paid);
  document.getElementById("totalBalance").textContent = money(totals.total - totals.paid);
}

function renderSettlements() {
  const rows = state.settlements.filter((item) => item.period === activePeriod);

  settlementBodyEl.innerHTML = rows
    .map((row) => {
      return `
        <tr data-id="${row.id}">
          <td><input data-field="client" value="${escapeHtml(row.client)}" /></td>
          <td><input data-field="invoiceNo" value="${escapeHtml(row.invoiceNo)}" /></td>
          <td><input data-field="amount" type="number" step="0.01" value="${row.amount || 0}" /></td>
          <td>
            <select data-field="status">
              ${option(row.status, "Mandar Factura")}
              ${option(row.status, "Pendiente")}
              ${option(row.status, "Pagada")}
            </select>
          </td>
          <td>
            <select data-field="liquidation">
              ${option(row.liquidation, "Pendiente")}
              ${option(row.liquidation, "Ajustado")}
            </select>
          </td>
          <td><input data-field="oweAmaia" type="number" step="0.01" value="${row.oweAmaia || 0}" /></td>
          <td><input data-field="oweOihane" type="number" step="0.01" value="${row.oweOihane || 0}" /></td>
          <td><input data-field="note" value="${escapeHtml(row.note)}" /></td>
          <td><button class="icon-btn" data-delete-settlement="${row.id}">x</button></td>
        </tr>
      `;
    })
    .join("");

  const totals = rows.reduce(
    (acc, row) => {
      acc.amaia += Number(row.oweAmaia) || 0;
      acc.oihane += Number(row.oweOihane) || 0;
      return acc;
    },
    { amaia: 0, oihane: 0 }
  );

  document.getElementById("totalAmaia").textContent = money(totals.amaia);
  document.getElementById("totalOihane").textContent = money(totals.oihane);

  const diff = totals.amaia - totals.oihane;
  const label = document.getElementById("differenceLabel");
  if (diff > 0) label.textContent = `Oihane debe a Amaia ${money(diff)}`;
  else if (diff < 0) label.textContent = `Amaia debe a Oihane ${money(Math.abs(diff))}`;
  else label.textContent = "Sin diferencia";
}

function newInvoice(period) {
  return {
    id: uid(),
    period,
    title: "",
    client: "",
    invoiceNo: "",
    baseAmount: 0,
    totalAmount: 0,
    issuedBy: "",
    issueDate: "",
    dueDate: "",
    status: "Mandar Factura",
    paidAmount: 0,
    notes: "",
  };
}

function newSettlement(period) {
  return {
    id: uid(),
    period,
    client: "",
    invoiceNo: "",
    amount: 0,
    status: "Pendiente",
    liquidation: "Pendiente",
    oweAmaia: 0,
    oweOihane: 0,
    note: "",
  };
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mavi-facturacion-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed.invoices) || !Array.isArray(parsed.settlements)) {
        throw new Error("Invalid");
      }
      state = {
        activePeriod: parsed.activePeriod || service.PERIODS[0].id,
        invoices: parsed.invoices,
        settlements: parsed.settlements,
      };
      activePeriod = state.activePeriod;
      persistLocal();
      render();
      await service.replaceCloudState(state);
    } catch (_error) {
      alert("JSON gecersiz");
    }
  };

  reader.readAsText(file);
  event.target.value = "";
}

function persistLocal() {
  state.activePeriod = activePeriod;
  service.saveLocalState(state);
}

function option(current, value) {
  const selected = current === value ? "selected" : "";
  return `<option value="${value}" ${selected}>${value || "-"}</option>`;
}

function uid() {
  return (crypto?.randomUUID?.() || String(Date.now() + Math.random())).replaceAll("-", "");
}

function money(value) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function round2(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
