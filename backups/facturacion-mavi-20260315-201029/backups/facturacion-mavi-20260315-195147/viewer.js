const service = window.MaviDataService;
service.init();

let state = service.loadLocalState();
let activePeriod = state.activePeriod || service.PERIODS[0].id;

const periodTabsEl = document.getElementById("periodTabs");
const statsEl = document.getElementById("stats");
const invoiceListEl = document.getElementById("invoiceList");
const settlementListEl = document.getElementById("settlementList");
const differenceLabelEl = document.getElementById("differenceLabel");
const loginFormEl = document.getElementById("loginForm");
const emailInputEl = document.getElementById("emailInput");
const passwordInputEl = document.getElementById("passwordInput");
const goPanelBtnEl = document.getElementById("goPanelBtn");
const logoutBtnEl = document.getElementById("logoutBtn");
const loginHintEl = document.getElementById("loginHint");

init();

async function init() {
  await refreshData();
  render();

  const session = await service.getSession();
  updateAuthUI(session);

  service.onAuthChange((nextSession) => {
    updateAuthUI(nextSession);
    refreshData().then(render);
  });

  service.subscribeToChanges(async () => {
    await refreshData();
    render();
  });

  periodTabsEl.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-period]");
    if (!btn) return;
    activePeriod = btn.dataset.period;
    state.activePeriod = activePeriod;
    service.saveLocalState(state);
    render();
  });

  loginFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailInputEl.value.trim();
    const password = passwordInputEl.value;
    if (!email || !password) return;

    const result = await service.signInOrSignUp(email, password);
    if (result.error) {
      alert(`Giris hatasi: ${result.error.message}`);
      return;
    }

    if (result.needsEmailConfirmation) {
      alert("Hesap olusturuldu. Email onayi aciksa inbox'tan onaylayin.");
    }

    window.location.href = "panel.html";
  });

  goPanelBtnEl.addEventListener("click", () => {
    window.location.href = "panel.html";
  });

  logoutBtnEl.addEventListener("click", async () => {
    await service.signOut();
    await refreshData();
    render();
  });
}

async function refreshData() {
  state = await service.loadState({ preferCloud: true });
  activePeriod = state.activePeriod || service.PERIODS[0].id;
}

function render() {
  renderTabs();
  renderStats();
  renderInvoiceList();
  renderSettlementList();
}

function renderTabs() {
  periodTabsEl.innerHTML = service.PERIODS
    .map((period) => {
      const active = period.id === activePeriod ? "active" : "";
      return `<button class="tab-btn ${active}" data-period="${period.id}">${period.label}</button>`;
    })
    .join("");
}

function renderStats() {
  const invoices = state.invoices.filter((item) => item.period === activePeriod);
  const totals = invoices.reduce(
    (acc, item) => {
      acc.total += Number(item.totalAmount) || 0;
      acc.paid += Number(item.paidAmount) || 0;
      const balance = (Number(item.totalAmount) || 0) - (Number(item.paidAmount) || 0);
      if (balance <= 0) acc.done += 1;
      return acc;
    },
    { total: 0, paid: 0, done: 0 }
  );

  statsEl.innerHTML = `
    <article class="stat-card">
      <small>Total facturado</small>
      <strong>${money(totals.total)}</strong>
    </article>
    <article class="stat-card">
      <small>Total cobrado</small>
      <strong>${money(totals.paid)}</strong>
    </article>
    <article class="stat-card">
      <small>Saldo pendiente</small>
      <strong>${money(totals.total - totals.paid)}</strong>
    </article>
    <article class="stat-card">
      <small>Completadas</small>
      <strong>${totals.done}/${invoices.length || 0}</strong>
    </article>
  `;
}

function renderInvoiceList() {
  const invoices = state.invoices.filter((item) => item.period === activePeriod);
  if (!invoices.length) {
    invoiceListEl.innerHTML = `<p class="empty">Bu donemde henuz kayit yok.</p>`;
    return;
  }

  invoiceListEl.innerHTML = invoices
    .map((item) => {
      const total = Number(item.totalAmount) || 0;
      const paid = Number(item.paidAmount) || 0;
      const balance = total - paid;
      const completed = balance <= 0 || item.status === "Pagada";
      return `
        <article class="invoice-item ${completed ? "done" : "open"}">
          <div class="invoice-top">
            <h3>${escapeHtml(item.client || "Cliente")}</h3>
            <span class="badge ${completed ? "done" : "open"}">${completed ? "Tamamlandi" : "Devam"}</span>
          </div>
          <p class="invoice-title">${escapeHtml(item.invoiceNo || "-")}</p>
          <div class="invoice-grid">
            <span>Toplam: <strong>${money(total)}</strong></span>
            <span>Odenen: <strong>${money(paid)}</strong></span>
            <span>Saldo: <strong>${money(balance)}</strong></span>
            <span>Emitida: <strong>${escapeHtml(item.issuedBy || "-")}</strong></span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSettlementList() {
  const rows = state.settlements.filter((item) => item.period === activePeriod);
  if (!rows.length) {
    settlementListEl.innerHTML = `<p class="empty">Iceride hesaplasma kaydi yok.</p>`;
    differenceLabelEl.textContent = "";
    return;
  }

  let totalAmaia = 0;
  let totalOihane = 0;

  settlementListEl.innerHTML = rows
    .map((item) => {
      totalAmaia += Number(item.oweAmaia) || 0;
      totalOihane += Number(item.oweOihane) || 0;

      return `
        <article class="settlement-item">
          <div>
            <strong>${escapeHtml(item.client || "-")}</strong>
            <span>${escapeHtml(item.invoiceNo || "-")}</span>
          </div>
          <div>
            <small>Amaia</small>
            <strong>${money(item.oweAmaia || 0)}</strong>
          </div>
          <div>
            <small>Oihane</small>
            <strong>${money(item.oweOihane || 0)}</strong>
          </div>
        </article>
      `;
    })
    .join("");

  const diff = totalAmaia - totalOihane;
  if (diff > 0) {
    differenceLabelEl.textContent = `Oihane, Amaia'ya ${money(diff)} borclu.`;
  } else if (diff < 0) {
    differenceLabelEl.textContent = `Amaia, Oihane'ye ${money(Math.abs(diff))} borclu.`;
  } else {
    differenceLabelEl.textContent = "Iki taraf dengede.";
  }
}

function updateAuthUI(session) {
  if (session?.user) {
    loginHintEl.textContent = `Giris acik: ${session.user.email}`;
    goPanelBtnEl.classList.remove("hidden");
    logoutBtnEl.classList.remove("hidden");
    return;
  }

  loginHintEl.textContent = "Login olduktan sonra duzenleme paneli acilir.";
  goPanelBtnEl.classList.add("hidden");
  logoutBtnEl.classList.add("hidden");
}

function money(value) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
