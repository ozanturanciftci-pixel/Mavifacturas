(function () {
  const STORAGE_KEY = "mavi-facturacion-v3";
  const APP_CONFIG = window.APP_CONFIG || {};
  const HAS_SUPABASE_CONFIG = Boolean(APP_CONFIG.SUPABASE_URL && APP_CONFIG.SUPABASE_ANON_KEY);
  const PERIODS = [
    { id: "2025", label: "2025 MAVI" },
    { id: "2026-q1", label: "2026 Enero-Marzo" },
    { id: "2026-q2", label: "2026 Abril-Junio" },
  ];

  const DEFAULT_STATE = {
    activePeriod: "2026-q1",
    invoices: [
      {
        id: uid(),
        period: "2026-q1",
        title: "1",
        client: "TOPA",
        invoiceNo: "Private Tour + Bilbao",
        baseAmount: 1150,
        totalAmount: 1391.5,
        issuedBy: "Amaia",
        issueDate: "2026-03-10",
        dueDate: "2026-06-10",
        status: "Mandar Factura",
        paidAmount: 0,
        notes: "",
      },
      {
        id: uid(),
        period: "2026-q1",
        title: "2",
        client: "YAIZA",
        invoiceNo: "Rebranding + Web",
        baseAmount: 1650,
        totalAmount: 1996.5,
        issuedBy: "Oihane",
        issueDate: "2026-02-11",
        dueDate: "2026-02-17",
        status: "Pagada",
        paidAmount: 1996.5,
        notes: "",
      },
      {
        id: uid(),
        period: "2025",
        title: "1",
        client: "TOPA",
        invoiceNo: "Rebranding + Web",
        baseAmount: 4440,
        totalAmount: 5372,
        issuedBy: "Oihane",
        issueDate: "2025-10-06",
        dueDate: "2026-03-03",
        status: "Pendiente",
        paidAmount: 2400,
        notes: "No han pagado Enero ni Febrero",
      },
    ],
    settlements: [
      {
        id: uid(),
        period: "2026-q1",
        client: "YAIZA",
        invoiceNo: "Rebranding + Web",
        amount: 1996.5,
        status: "Pagada",
        liquidation: "Pendiente",
        oweAmaia: 825,
        oweOihane: 0,
        note: "",
      },
    ],
  };

  let supabaseClient = null;

  function init() {
    if (!HAS_SUPABASE_CONFIG || !window.supabase?.createClient) {
      return { cloudEnabled: false };
    }
    supabaseClient = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
    return { cloudEnabled: true };
  }

  async function getSession() {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) return null;
    return data.session || null;
  }

  function onAuthChange(cb) {
    if (!supabaseClient) return () => {};
    const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => cb(session || null));
    return () => data.subscription?.unsubscribe();
  }

  async function signInOrSignUp(email, password) {
    if (!supabaseClient) return { error: new Error("Supabase kapali") };

    const signIn = await supabaseClient.auth.signInWithPassword({ email, password });
    if (!signIn.error) return { error: null, needsEmailConfirmation: false };

    const signUp = await supabaseClient.auth.signUp({ email, password });
    return {
      error: signUp.error || null,
      needsEmailConfirmation: !signUp.error,
    };
  }

  async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  }

  async function loadState({ preferCloud = true } = {}) {
    const local = loadLocalState();
    if (!preferCloud || !supabaseClient) return local;

    try {
      const [invoiceRes, settlementRes] = await Promise.all([
        supabaseClient.from("invoices").select("*").order("created_at", { ascending: true }),
        supabaseClient.from("settlements").select("*").order("created_at", { ascending: true }),
      ]);

      if (invoiceRes.error || settlementRes.error) return local;

      const invoices = (invoiceRes.data || []).map(dbInvoiceToUi);
      const settlements = (settlementRes.data || []).map(dbSettlementToUi);

      if (invoices.length === 0 && settlements.length === 0) {
        return local;
      }

      const next = {
        activePeriod: local.activePeriod || PERIODS[0].id,
        invoices,
        settlements,
      };
      saveLocalState(next);
      return next;
    } catch (_error) {
      return local;
    }
  }

  async function seedCloudIfEmpty(state) {
    if (!supabaseClient) return;
    const [invoiceRes, settlementRes] = await Promise.all([
      supabaseClient.from("invoices").select("id").limit(1),
      supabaseClient.from("settlements").select("id").limit(1),
    ]);

    if (invoiceRes.error || settlementRes.error) return;

    const hasRows = (invoiceRes.data || []).length > 0 || (settlementRes.data || []).length > 0;
    if (hasRows) return;

    await replaceCloudState(state);
  }

  async function replaceCloudState(state) {
    if (!supabaseClient) return;

    await supabaseClient.from("invoices").delete().gte("created_at", "1900-01-01");
    await supabaseClient.from("settlements").delete().gte("created_at", "1900-01-01");

    if (state.invoices.length) {
      await supabaseClient.from("invoices").upsert(state.invoices.map(uiInvoiceToDb), { onConflict: "id" });
    }
    if (state.settlements.length) {
      await supabaseClient
        .from("settlements")
        .upsert(state.settlements.map(uiSettlementToDb), { onConflict: "id" });
    }
  }

  async function upsertInvoice(invoice) {
    if (!supabaseClient) return;
    await supabaseClient.from("invoices").upsert([uiInvoiceToDb(invoice)], { onConflict: "id" });
  }

  async function deleteInvoice(id) {
    if (!supabaseClient) return;
    await supabaseClient.from("invoices").delete().eq("id", id);
  }

  async function upsertSettlement(item) {
    if (!supabaseClient) return;
    await supabaseClient.from("settlements").upsert([uiSettlementToDb(item)], { onConflict: "id" });
  }

  async function deleteSettlement(id) {
    if (!supabaseClient) return;
    await supabaseClient.from("settlements").delete().eq("id", id);
  }

  function subscribeToChanges(onChange) {
    if (!supabaseClient) return () => {};

    const channel = supabaseClient
      .channel("mavi-public-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements" }, onChange)
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.invoices) || !Array.isArray(parsed.settlements)) {
        return structuredClone(DEFAULT_STATE);
      }
      return {
        activePeriod: parsed.activePeriod || PERIODS[0].id,
        invoices: parsed.invoices.map(normalizeInvoice),
        settlements: parsed.settlements.map(normalizeSettlement),
      };
    } catch (_error) {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function saveLocalState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function normalizeInvoice(item) {
    return {
      id: item.id || uid(),
      period: item.period || PERIODS[0].id,
      title: item.title || "",
      client: item.client || "",
      invoiceNo: item.invoiceNo || "",
      baseAmount: parseNumber(item.baseAmount),
      totalAmount: parseNumber(item.totalAmount),
      issuedBy: item.issuedBy || "",
      issueDate: item.issueDate || "",
      dueDate: item.dueDate || "",
      status: item.status || "Pendiente",
      paidAmount: parseNumber(item.paidAmount),
      notes: item.notes || "",
    };
  }

  function normalizeSettlement(item) {
    return {
      id: item.id || uid(),
      period: item.period || PERIODS[0].id,
      client: item.client || "",
      invoiceNo: item.invoiceNo || "",
      amount: parseNumber(item.amount),
      status: item.status || "Pendiente",
      liquidation: item.liquidation || "Pendiente",
      oweAmaia: parseNumber(item.oweAmaia),
      oweOihane: parseNumber(item.oweOihane),
      note: item.note || "",
    };
  }

  function uiInvoiceToDb(invoice) {
    return {
      id: invoice.id,
      period: invoice.period,
      title: invoice.title || "",
      client: invoice.client || "",
      invoice_no: invoice.invoiceNo || "",
      base_amount: parseNumber(invoice.baseAmount),
      total_amount: parseNumber(invoice.totalAmount),
      issued_by: invoice.issuedBy || "",
      issue_date: invoice.issueDate || null,
      due_date: invoice.dueDate || null,
      status: invoice.status || "Pendiente",
      paid_amount: parseNumber(invoice.paidAmount),
      notes: invoice.notes || "",
    };
  }

  function dbInvoiceToUi(row) {
    return {
      id: row.id,
      period: row.period || "",
      title: row.title || "",
      client: row.client || "",
      invoiceNo: row.invoice_no || "",
      baseAmount: parseNumber(row.base_amount),
      totalAmount: parseNumber(row.total_amount),
      issuedBy: row.issued_by || "",
      issueDate: row.issue_date || "",
      dueDate: row.due_date || "",
      status: row.status || "Pendiente",
      paidAmount: parseNumber(row.paid_amount),
      notes: row.notes || "",
    };
  }

  function uiSettlementToDb(item) {
    return {
      id: item.id,
      period: item.period,
      client: item.client || "",
      invoice_no: item.invoiceNo || "",
      amount: parseNumber(item.amount),
      status: item.status || "Pendiente",
      liquidation: item.liquidation || "Pendiente",
      owe_amaia: parseNumber(item.oweAmaia),
      owe_oihane: parseNumber(item.oweOihane),
      note: item.note || "",
    };
  }

  function dbSettlementToUi(row) {
    return {
      id: row.id,
      period: row.period || "",
      client: row.client || "",
      invoiceNo: row.invoice_no || "",
      amount: parseNumber(row.amount),
      status: row.status || "Pendiente",
      liquidation: row.liquidation || "Pendiente",
      oweAmaia: parseNumber(row.owe_amaia),
      oweOihane: parseNumber(row.owe_oihane),
      note: row.note || "",
    };
  }

  function parseNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function uid() {
    return (crypto?.randomUUID?.() || String(Date.now() + Math.random())).replaceAll("-", "");
  }

  window.MaviDataService = {
    PERIODS,
    init,
    getSession,
    onAuthChange,
    signInOrSignUp,
    signOut,
    loadState,
    seedCloudIfEmpty,
    replaceCloudState,
    upsertInvoice,
    deleteInvoice,
    upsertSettlement,
    deleteSettlement,
    subscribeToChanges,
    loadLocalState,
    saveLocalState,
    parseNumber,
  };
})();
