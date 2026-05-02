import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const STRIPE_LINK     = "https://buy.stripe.com/test_dRm8wRb6e4Hu4Rm3ib2VG00";
const TRIAL_DAYS      = 14;
const SOFT_LOCK_DAYS  = 5;  // soft lock for 5 days after trial ends, then hard lock
const ADMIN_PASSWORD  = "listobid2026";

// ─── INDUSTRY TEMPLATES ───────────────────────────────────────────────────────
const INDUSTRY_TEMPLATES = {
  landscaping: {
    en: { name: "Landscaping", icon: "🌵" },
    es: { name: "Jardinería",  icon: "🌵" },
    jobs: [
      { id: 1, name: "Weekly Maintenance", hours: 1.5, materials: 0 },
      { id: 2, name: "Full Cleanup",        hours: 3,   materials: 20 },
      { id: 3, name: "Desert Install",      hours: 6,   materials: 150 },
      { id: 4, name: "Irrigation Check",    hours: 1,   materials: 10 },
      { id: 5, name: "Tree Trimming",       hours: 2.5, materials: 0 },
    ],
  },
  pool: {
    en: { name: "Pool Service", icon: "🏊" },
    es: { name: "Servicio de Piscina", icon: "🏊" },
    jobs: [
      { id: 1, name: "Weekly Chemical Service", hours: 1,   materials: 25 },
      { id: 2, name: "Filter Clean",             hours: 1.5, materials: 15 },
      { id: 3, name: "Equipment Check",          hours: 1,   materials: 0 },
      { id: 4, name: "Green Pool Recovery",      hours: 3,   materials: 60 },
      { id: 5, name: "Acid Wash",                hours: 4,   materials: 80 },
    ],
  },
  handyman: {
    en: { name: "Handyman", icon: "🔨" },
    es: { name: "Mantenimiento", icon: "🔨" },
    jobs: [
      { id: 1, name: "General Labor",    hours: 2, materials: 0 },
      { id: 2, name: "Repair Work",      hours: 3, materials: 30 },
      { id: 3, name: "Installation",     hours: 4, materials: 50 },
      { id: 4, name: "Painting",         hours: 5, materials: 40 },
      { id: 5, name: "Assembly / Setup", hours: 2, materials: 20 },
    ],
  },
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TIER_ONE_WAY = { short: 5, medium: 18, long: 35 };
const TRUCK_MPG    = 10;

// ─── EIA GAS PRICE API ────────────────────────────────────────────────────────
// Maps zip code prefixes to EIA regional series IDs
// EIA API v2 — free, no key required for regional averages
const ZIP_TO_REGION = {
  "85": "PET.EMM_EPM0_PTE_SAC_DPG.W", // Southwest — AZ, NM, NV
  "86": "PET.EMM_EPM0_PTE_SAC_DPG.W",
  "89": "PET.EMM_EPM0_PTE_SAC_DPG.W",
  "90": "PET.EMM_EPM0_PTE_PAC_DPG.W", // West Coast
  "91": "PET.EMM_EPM0_PTE_PAC_DPG.W",
  "75": "PET.EMM_EPM0_PTE_SCE_DPG.W", // South Central
  "77": "PET.EMM_EPM0_PTE_SCE_DPG.W",
  "30": "PET.EMM_EPM0_PTE_SAD_DPG.W", // Southeast
  "33": "PET.EMM_EPM0_PTE_SAD_DPG.W",
  "10": "PET.EMM_EPM0_PTE_NAE_DPG.W", // Northeast
  "11": "PET.EMM_EPM0_PTE_NAE_DPG.W",
  "60": "PET.EMM_EPM0_PTE_CMW_DPG.W", // Midwest
  "55": "PET.EMM_EPM0_PTE_CMW_DPG.W",
};
const DEFAULT_REGION = "PET.EMM_EPM0_PTE_NUS_DPG.W"; // US average fallback

async function fetchGasPrice(zip, fuelType) {
  try {
    const prefix = zip.substring(0, 2);
    const seriesId = ZIP_TO_REGION[prefix] || DEFAULT_REGION;
    // Use diesel series if needed
    const dieselId = seriesId.replace("EPM0", "EPD2D");
    const id = fuelType === "diesel" ? dieselId : seriesId;
    const url = `https://api.eia.gov/v2/seriesid/${id}?api_key=DEMO_KEY&data[0]=value&sort[0][column]=period&sort[0][direction]=desc&length=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("EIA fetch failed");
    const data = await res.json();
    const val = data?.response?.data?.[0]?.value;
    if (val && !isNaN(val)) return parseFloat(val).toFixed(3);
    throw new Error("No value");
  } catch {
    // Fallback to realistic Phoenix area averages
    return fuelType === "diesel" ? "3.890" : "3.420";
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const pf = (v, fb = 0) => { const n = parseFloat(v); return isNaN(n) ? fb : n; };
const pi = (v, fb = 1) => { const n = parseInt(v);   return (isNaN(n) || n < 1) ? fb : n; };
const $v = (v) => `$${v.toFixed(2)}`;
const roundUp5  = (v) => Math.ceil(v / 5) * 5;
const roundPct  = (v) => Math.round(v);

function calcQuote({ laborRate, crewSize, hours, materials, exactMiles, tier, vehicles, gasPrice, margin }) {
  const rate   = pf(laborRate, 0);
  const crew   = pi(crewSize,  1);
  const hrs    = pf(hours,     0);
  const labor  = rate * crew * hrs;
  const oneway = (exactMiles && pf(exactMiles) > 0) ? pf(exactMiles) : (TIER_ONE_WAY[tier] ?? 5);
  const rt     = oneway * 2;
  const fuel   = (rt / TRUCK_MPG) * pf(gasPrice, 0) * pi(vehicles, 1);
  const mats   = pf(materials, 0);
  const cost   = labor + fuel + mats;
  const raw    = cost / (1 - pf(margin, 40) / 100);
  const price  = roundUp5(raw);
  const profit = price - cost;
  const pct    = price > 0 ? (profit / price) * 100 : 0;
  return { labor, fuel, mats, cost, price, profit, margin: pct, rtMiles: rt };
}

function marginMeta(m) {
  if (m < 20) return { bg: "#FEE2E2", fg: "#DC2626", en: "Low Margin",  es: "Margen Bajo" };
  if (m < 40) return { bg: "#FEF9C3", fg: "#CA8A04", en: "OK Margin",   es: "Margen Regular" };
  return       { bg: "#DCFCE7", fg: "#16A34A", en: "Good Margin", es: "Margen Bueno" };
}

// ─── LOCAL STORAGE HELPERS ────────────────────────────────────────────────────
const LS = {
  get: (k, fallback = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k)    => { try { localStorage.removeItem(k); } catch {} },
};

// ─── TRANSLATIONS ─────────────────────────────────────────────────────────────
const TX = {
  en: {
    appName: "ListoBid", tagline: "Ready to Bid.",
    // Auth
    welcome: "Welcome to ListoBid", welcomeSub: "Know your price. Know your profit.",
    register: "Create Account", login: "Sign In", logout: "Sign Out",
    firstName: "First Name", email: "Email Address", password: "Password",
    confirmPass: "Confirm Password", forgotPass: "Forgot password?",
    resetPass: "Reset Password", resetSent: "Check your email for a reset link.",
    noAccount: "Don't have an account?", hasAccount: "Already have an account?",
    signUp: "Sign Up Free", signIn: "Sign In",
    passMin: "Password must be at least 8 characters",
    passMismatch: "Passwords do not match",
    emailInvalid: "Please enter a valid email address",
    emailTaken: "An account with this email already exists",
    invalidCreds: "Incorrect email or password",
    // Data warning
    dataWarning: "Important: Your Data",
    dataWarningBody: "ListoBid saves your job library and quote history on this device. For the best experience, always use the same browser on this phone. Avoid clearing your browser data — doing so will reset the app.",
    understood: "Got it",
    // Trial
    trialBanner: "Your free trial ends in",
    trialDaysLeft: "days",
    trialExpiredTitle: "Your free trial has ended",
    trialExpiredBody: "Subscribe to keep pricing jobs and tracking your profit.",
    subscribeNow: "Subscribe Now — $19.99/mo",
    softLockTitle: "Trial Ended",
    softLockBody: "You can view your saved quotes but cannot create new ones. Subscribe to unlock full access.",
    softLockDays: "days until full lock",
    viewLog: "View My Quotes",
    // Trial reminders
    reminderDay10Title: "4 days left in your trial",
    reminderDay10Body: "Your free trial ends in 4 days. Subscribe now to keep full access.",
    reminderDay13Title: "Trial ending tomorrow",
    reminderDay13Body: "Your free trial ends tomorrow. Subscribe to avoid losing access.",
    subscribeBtn: "Subscribe — $19.99/mo",
    remindLater: "Remind Me Later",
    // Setup
    chooseLanguage: "Choose your language",
    chooseIndustry: "What industry are you in?",
    industrySubtitle: "This sets up your job types",
    setup: "Profile Setup", step: "Step", of: "of",
    laborRate: "Hourly Labor Rate (per person)", laborHint: "Per crew member, per hour",
    crewSize: "Default Crew Size",
    targetMargin: "Target Profit Margin", marginHint: "We recommend 40% to start",
    zipCode: "Your Zip Code", zipHint: "Used to pull live gas prices",
    vehicles: "Number of Vehicles",
    fuelType: "Fuel Type", gas: "Gasoline", diesel: "Diesel",
    saveProfile: "Save & Continue", back: "Back", continue: "Continue",
    jobLibrary: "Job Library", addJob: "+ Add Job Type",
    jobName2: "Job Type Name", defHours: "Default Hours", defMats: "Default Materials ($)",
    saveJob: "Save", editJob: "Edit", deleteJob: "Delete",
    preloaded: "Preloaded defaults — edit or add your own",
    // Quote
    priceJob: "Price a Job", fillDetails: "Fill in details — get your price.",
    jobType: "Job Type", selectJob: "Select a job type...",
    crewWage: "Crew & Wage", perPerson: "per person / hr",
    jobDetails: "Job Details", hoursOnSite: "Hours on Site", materialsCost: "Materials Cost",
    driveDistance: "Drive Distance",
    short: "0–10 mi", medium: "11–25 mi", long: "25+ mi",
    exactMiles: "Exact one-way miles (optional)", exactHint: "Overrides the distance tier",
    vehiclesOnJob: "Vehicles on This Job",
    gasPriceLabel: "Fuel Price (per gallon)",
    live: "Live", override: "Override", manual: "Manual",
    fetching: "Fetching...", enterManual: "Enter manually",
    calculate: "Calculate Price",
    yourPrice: "Recommended Price", yourCost: "Your Cost", yourProfit: "Your Profit",
    marginLabel: "Margin", breakdown: "Cost Breakdown",
    laborCost: "Labor", fuelCost: "Fuel", matsLabel: "Materials",
    totalCost: "Total Cost", rtMiles: "round trip",
    adjustMargin: "Adjust Margin", slideHint: "Drag to update price instantly",
    donePrompt: "Done with this quote?", whatsNext: "What's next?",
    saveToLog: "💾 Save to Log", keepEditing: "✏️ Keep Editing", newQuote: "🔄 New Quote",
    saveQuote: "Save Quote", jobLabel: "Job Name / Customer",
    jobPlaceholder: "e.g. Smith Residence — Weekly",
    notes: "Notes", notesOpt: "(optional)", notesPlaceholder: "e.g. Call before arrival.",
    cancel: "Cancel", save: "Save",
    // Log
    quoteLog: "Quote History", noQuotes: "No saved quotes yet.",
    // Settings
    settings: "Settings", version: "ListoBid LLC · v1.0",
    trialLabel: "Free Trial", trialDaysRemaining: "days remaining",
    language: "Language", editProfile: "Edit Profile", manageJobs: "Job Library",
    support: "Support", supportEmail: "support@listobid.com",
    accountSection: "Account", dataSection: "Your Data",
    dataWarningShort: "Data saved on this device only",
    // Nav
    nav_quote: "Quote", nav_log: "Log", nav_settings: "Settings",
    // Admin
    adminTitle: "Admin", adminLogin: "Admin Access",
    adminPass: "Admin Password", adminSignIn: "Sign In",
    adminWrongPass: "Incorrect password",
    users: "Users", payments: "Payments", overview: "Overview",
    markFree: "Mark Free", markPaid: "Mark Paid", revokeAccess: "Revoke",
    trialStatus: "Trial Status", joinDate: "Joined", lastActive: "Last Active",
    quotesGenerated: "Quotes", accountType: "Type",
    free: "FREE", paid: "PAID", trial: "TRIAL", expired: "EXPIRED", locked: "LOCKED",
  },
  es: {
    appName: "ListoBid", tagline: "Listo para Ofertar.",
    welcome: "Bienvenido a ListoBid", welcomeSub: "Conoce tu precio. Conoce tu ganancia.",
    register: "Crear Cuenta", login: "Iniciar Sesión", logout: "Cerrar Sesión",
    firstName: "Nombre", email: "Correo Electrónico", password: "Contraseña",
    confirmPass: "Confirmar Contraseña", forgotPass: "¿Olvidaste tu contraseña?",
    resetPass: "Restablecer Contraseña", resetSent: "Revisa tu correo para el enlace.",
    noAccount: "¿No tienes cuenta?", hasAccount: "¿Ya tienes cuenta?",
    signUp: "Registrarse Gratis", signIn: "Iniciar Sesión",
    passMin: "La contraseña debe tener al menos 8 caracteres",
    passMismatch: "Las contraseñas no coinciden",
    emailInvalid: "Ingresa un correo electrónico válido",
    emailTaken: "Ya existe una cuenta con este correo",
    invalidCreds: "Correo o contraseña incorrectos",
    dataWarning: "Importante: Tus Datos",
    dataWarningBody: "ListoBid guarda tu biblioteca de trabajos e historial en este dispositivo. Para mejor experiencia, usa siempre el mismo navegador en este teléfono. Evita borrar los datos del navegador.",
    understood: "Entendido",
    trialBanner: "Tu prueba gratis termina en",
    trialDaysLeft: "días",
    trialExpiredTitle: "Tu prueba gratuita ha terminado",
    trialExpiredBody: "Suscríbete para seguir cotizando trabajos.",
    subscribeNow: "Suscribirse — $19.99/mes",
    softLockTitle: "Prueba Terminada",
    softLockBody: "Puedes ver tus cotizaciones guardadas pero no crear nuevas. Suscríbete para acceso completo.",
    softLockDays: "días hasta bloqueo total",
    viewLog: "Ver Mis Cotizaciones",
    reminderDay10Title: "4 días en tu prueba",
    reminderDay10Body: "Tu prueba gratuita termina en 4 días. Suscríbete ahora.",
    reminderDay13Title: "La prueba termina mañana",
    reminderDay13Body: "Tu prueba gratuita termina mañana. Suscríbete para no perder acceso.",
    subscribeBtn: "Suscribirse — $19.99/mes",
    remindLater: "Recordarme Después",
    chooseLanguage: "Elige tu idioma",
    chooseIndustry: "¿En qué industria trabajas?",
    industrySubtitle: "Esto configura tus tipos de trabajo",
    setup: "Configuración", step: "Paso", of: "de",
    laborRate: "Tarifa por Hora (por persona)", laborHint: "Por trabajador, por hora",
    crewSize: "Tamaño del Equipo",
    targetMargin: "Margen de Ganancia", marginHint: "Recomendamos 40% para empezar",
    zipCode: "Código Postal", zipHint: "Para obtener precio de gasolina",
    vehicles: "Número de Vehículos",
    fuelType: "Combustible", gas: "Gasolina", diesel: "Diésel",
    saveProfile: "Guardar y Continuar", back: "Atrás", continue: "Continuar",
    jobLibrary: "Tipos de Trabajo", addJob: "+ Agregar Tipo",
    jobName2: "Nombre del Tipo", defHours: "Horas por Defecto", defMats: "Materiales ($)",
    saveJob: "Guardar", editJob: "Editar", deleteJob: "Eliminar",
    preloaded: "Tipos precargados — edita o agrega los tuyos",
    priceJob: "Cotizar Trabajo", fillDetails: "Llena los datos — obtén tu precio.",
    jobType: "Tipo de Trabajo", selectJob: "Selecciona un tipo...",
    crewWage: "Equipo y Salario", perPerson: "por persona / hr",
    jobDetails: "Detalles del Trabajo", hoursOnSite: "Horas en Sitio", materialsCost: "Materiales",
    driveDistance: "Distancia",
    short: "0–10 mi", medium: "11–25 mi", long: "25+ mi",
    exactMiles: "Millas exactas (opcional)", exactHint: "Reemplaza el rango seleccionado",
    vehiclesOnJob: "Vehículos en Este Trabajo",
    gasPriceLabel: "Precio de Combustible (por galón)",
    live: "En vivo", override: "Manual", manual: "Manual",
    fetching: "Buscando...", enterManual: "Ingresar manualmente",
    calculate: "Calcular Precio",
    yourPrice: "Precio Recomendado", yourCost: "Tu Costo", yourProfit: "Tu Ganancia",
    marginLabel: "Margen", breakdown: "Desglose de Costos",
    laborCost: "Mano de Obra", fuelCost: "Combustible", matsLabel: "Materiales",
    totalCost: "Costo Total", rtMiles: "ida y vuelta",
    adjustMargin: "Ajustar Margen", slideHint: "Desliza para actualizar el precio",
    donePrompt: "¿Listo con esta cotización?", whatsNext: "¿Qué sigue?",
    saveToLog: "💾 Guardar", keepEditing: "✏️ Seguir Editando", newQuote: "🔄 Nueva Cotización",
    saveQuote: "Guardar Cotización", jobLabel: "Trabajo / Cliente",
    jobPlaceholder: "ej. Casa García — Mantenimiento",
    notes: "Notas", notesOpt: "(opcional)", notesPlaceholder: "ej. Llamar antes de llegar.",
    cancel: "Cancelar", save: "Guardar",
    quoteLog: "Historial", noQuotes: "No hay cotizaciones guardadas.",
    settings: "Ajustes", version: "ListoBid LLC · v1.0",
    trialLabel: "Prueba Gratis", trialDaysRemaining: "días restantes",
    language: "Idioma", editProfile: "Editar Perfil", manageJobs: "Tipos de Trabajo",
    support: "Soporte", supportEmail: "support@listobid.com",
    accountSection: "Cuenta", dataSection: "Tus Datos",
    dataWarningShort: "Datos guardados solo en este dispositivo",
    nav_quote: "Cotizar", nav_log: "Historial", nav_settings: "Ajustes",
    adminTitle: "Admin", adminLogin: "Acceso Admin",
    adminPass: "Contraseña Admin", adminSignIn: "Entrar",
    adminWrongPass: "Contraseña incorrecta",
    users: "Usuarios", payments: "Pagos", overview: "Resumen",
    markFree: "Gratis", markPaid: "Pagado", revokeAccess: "Revocar",
    trialStatus: "Estado", joinDate: "Registro", lastActive: "Último acceso",
    quotesGenerated: "Cotizaciones", accountType: "Tipo",
    free: "GRATIS", paid: "PAGADO", trial: "PRUEBA", expired: "VENCIDO", locked: "BLOQUEADO",
  }
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#1C2B3A;--green:#3DC43C;--gdk:#2aa62a;--glt:#f0fdf0;
  --w:#fff;--g50:#f8fafc;--g100:#f1f5f9;--g200:#e2e8f0;--g400:#94a3b8;--g600:#475569;--g800:#1e293b;
  --red:#DC2626;--red-lt:#FEE2E2;--yellow:#CA8A04;--yellow-lt:#FEF9C3;
  --rad:14px;--radsm:8px;--sh:0 2px 10px rgba(0,0,0,.07);
}
body{font-family:'Barlow',sans-serif;background:var(--g100);color:var(--g800);-webkit-font-smoothing:antialiased}
.app{max-width:430px;margin:0 auto;min-height:100dvh;background:var(--w);display:flex;flex-direction:column}

/* Header */
.hdr{background:var(--navy);padding:13px 17px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
.hdr-logo{display:flex;align-items:center;gap:9px}
.lm{width:33px;height:33px;background:linear-gradient(135deg,var(--green),var(--gdk));border-radius:9px;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:15px;color:#fff}
.lt{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:20px;color:#fff;letter-spacing:.4px}
.lt span{color:var(--green)}
.hdr-r{font-size:12px;color:var(--g400)}
.hdr-user{font-size:12px;color:rgba(255,255,255,.6);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Nav */
.nav{display:flex;background:var(--w);border-top:1px solid var(--g200);position:sticky;bottom:0;z-index:50}
.nb{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 0 11px;background:none;border:none;cursor:pointer;color:var(--g400);font-family:'Barlow',sans-serif;font-size:11px;font-weight:600;letter-spacing:.3px;transition:color .15s}
.nb.on{color:var(--green)}
.nb svg{width:20px;height:20px}
.nb.disabled{opacity:.35;cursor:default}

/* Content */
.ct{flex:1;overflow-y:auto;padding:18px 18px 28px;-webkit-overflow-scrolling:touch}

/* Section */
.st{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:23px;color:var(--navy);margin-bottom:3px}
.ss{font-size:13px;color:var(--g400);margin-bottom:17px}

/* Card */
.card{background:var(--w);border:1px solid var(--g200);border-radius:var(--rad);padding:15px;margin-bottom:11px;box-shadow:var(--sh)}
.ct2{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--g400);margin-bottom:12px}

/* Field */
.fi{margin-bottom:13px}.fi:last-child{margin-bottom:0}
.lb{display:block;font-size:13px;font-weight:600;color:var(--g600);margin-bottom:5px}
.ht{font-size:11px;color:var(--g400);margin-top:3px}
input[type=number],input[type=text],input[type=email],input[type=password],select,textarea{width:100%;padding:10px 12px;border:1.5px solid var(--g200);border-radius:var(--radsm);font-family:'Barlow',sans-serif;font-size:15px;color:var(--g800);background:var(--g50);outline:none;transition:border-color .15s;-webkit-appearance:none}
input:focus,select:focus,textarea:focus{border-color:var(--green);background:#fff}
textarea{resize:vertical;line-height:1.5}
select{cursor:pointer}
.err{font-size:12px;color:var(--red);margin-top:4px}

/* Prefix/Suffix */
.px{display:flex;align-items:center;border:1.5px solid var(--g200);border-radius:var(--radsm);background:var(--g50);overflow:hidden;transition:border-color .15s}
.px:focus-within{border-color:var(--green);background:#fff}
.pxs{padding:10px 7px 10px 12px;color:var(--g400);font-size:15px;font-weight:600}
.px input{border:none;background:transparent;padding:10px 12px 10px 3px;flex:1}
.px input:focus{background:transparent}
.sx{display:flex;align-items:center;border:1.5px solid var(--g200);border-radius:var(--radsm);background:var(--g50);overflow:hidden;transition:border-color .15s}
.sx:focus-within{border-color:var(--green);background:#fff}
.sxs{padding:10px 12px 10px 7px;color:var(--g400);font-size:15px;font-weight:600}
.sx input{border:none;background:transparent;padding:10px 3px 10px 12px;flex:1}
.sx input:focus{background:transparent}

/* Buttons */
.btn{width:100%;padding:13px;border-radius:var(--rad);font-family:'Barlow',sans-serif;font-size:15px;font-weight:700;border:none;cursor:pointer;transition:transform .1s;letter-spacing:.2px}
.btn:active{transform:scale(.98)}
.bp{background:linear-gradient(135deg,var(--green),var(--gdk));color:#fff;box-shadow:0 4px 14px rgba(61,196,60,.3)}
.bn{background:var(--navy);color:#fff}
.bg{background:none;border:1.5px solid var(--g200);color:var(--g600)}
.bd{background:var(--red-lt);color:var(--red);border:1.5px solid #FECACA}
.bsm{padding:7px 11px;font-size:12px;width:auto;border-radius:var(--radsm)}
.mt8{margin-top:8px}.mt12{margin-top:12px}
.r2{display:flex;gap:10px}.r2 .fi{flex:1}

/* Toggle group */
.tg{display:flex;gap:6px;flex-wrap:wrap}
.tb{flex:1;padding:9px 5px;border-radius:var(--radsm);border:1.5px solid var(--g200);background:var(--g50);font-family:'Barlow',sans-serif;font-size:13px;font-weight:600;color:var(--g600);cursor:pointer;transition:all .15s;text-align:center;white-space:nowrap}
.tb.on{border-color:var(--green);background:var(--glt);color:var(--gdk)}

/* Steps */
.steps{display:flex;gap:5px;margin-bottom:20px}
.sd{flex:1;height:4px;border-radius:2px;background:var(--g200);transition:background .2s}
.sd.done{background:var(--green)}.sd.active{background:var(--green);opacity:.5}

/* Result card */
.rc{background:var(--navy);border-radius:var(--rad);padding:20px 17px 17px;margin-bottom:11px;position:relative;overflow:hidden}
.rc::after{content:'';position:absolute;top:-20px;right:-20px;width:90px;height:90px;background:rgba(61,196,60,.1);border-radius:50%}
.rl{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.42);margin-bottom:5px}
.rp{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:52px;color:#fff;line-height:1;letter-spacing:-1px}

.rrow{display:flex;gap:14px;margin-top:13px}
.ri{flex:1}
.ri-l{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.38);margin-bottom:2px}
.ri-v{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:19px;color:#fff}
.mpill{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-top:11px}
.mdot{width:7px;height:7px;border-radius:50%}

/* Breakdown */
.bk{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--g100);font-size:14px}
.bk:last-child{border-bottom:none}
.bk-l{color:var(--g600);font-weight:500}
.bk-v{font-weight:700;color:var(--g800)}
.bk-tot{border-top:2px solid var(--g200)!important;margin-top:3px;padding-top:11px!important}
.bk-tot .bk-l{font-weight:700;color:var(--g800)}

/* Slider */
.sl-pct{text-align:center;font-family:'Barlow Condensed',sans-serif;font-size:30px;font-weight:800;color:var(--navy);margin-bottom:2px}
input[type=range]{-webkit-appearance:none;width:100%;height:6px;border-radius:3px;background:var(--g200);outline:none;margin:10px 0}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--green);cursor:pointer;box-shadow:0 2px 8px rgba(61,196,60,.4);border:3px solid #fff}
.sl-ends{display:flex;justify-content:space-between;font-size:11px;color:var(--g400);font-weight:600}
.sl-hint{text-align:center;font-size:12px;color:var(--g400);margin-top:3px}

/* Gas row */
.gr{display:flex;align-items:center;gap:7px}
.gpill{font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px;background:var(--glt);color:var(--gdk)}
.gpill.man{background:var(--yellow-lt);color:var(--yellow)}

/* Action card */
.ac{background:var(--g50);border:1px solid var(--g200);border-radius:var(--rad);padding:15px;margin-bottom:11px}
.ac-t{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--g400);margin-bottom:11px}
.ac-s{display:flex;flex-direction:column;gap:8px}

/* Log */
.li{background:var(--g50);border:1px solid var(--g200);border-radius:var(--radsm);padding:12px 14px;margin-bottom:8px}
.li-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px}
.li-name{font-size:15px;font-weight:700;color:var(--navy)}
.li-price{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:var(--gdk)}
.li-meta{font-size:12px;color:var(--g400);margin-bottom:6px}
.li-pills{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.pill{font-size:12px;padding:3px 8px;border-radius:4px;font-weight:700}
.li-notes{margin-top:8px;font-size:12px;color:var(--g600);background:var(--g100);border-radius:6px;padding:7px 10px;line-height:1.5;border-left:3px solid var(--green)}

/* Settings */
.sr{display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-bottom:1px solid var(--g100)}
.sr:last-child{border-bottom:none}
.sr-l{font-size:15px;font-weight:600;color:var(--g800)}
.sr-v{font-size:13px;color:var(--g400)}
.trial-bar{background:linear-gradient(135deg,var(--navy),#243a52);border-radius:var(--rad);padding:15px 17px;margin-bottom:11px;color:#fff}
.trial-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}
.trial-l{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.42)}
.trial-d{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800}
.trial-track{height:5px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden}
.trial-fill{height:100%;border-radius:3px;transition:width .5s}

/* Job item */
.ji{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;background:var(--g50);border:1px solid var(--g200);border-radius:var(--radsm);margin-bottom:7px}
.ji-info{flex:1}
.ji-name{font-size:14px;font-weight:700;color:var(--g800);margin-bottom:2px}
.ji-meta{font-size:12px;color:var(--g400)}
.ji-act{display:flex;gap:5px}

/* Modal / Overlay */
.ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.mo{background:#fff;border-radius:20px 20px 0 0;padding:24px 20px 40px;width:100%;max-width:430px;box-shadow:0 -8px 40px rgba(0,0,0,.15)}
.mo-t{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:21px;color:var(--navy);margin-bottom:17px}
.mo-b{display:flex;gap:9px;margin-top:17px}

/* Auth screens */
.auth{min-height:100dvh;background:var(--navy);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px}
.auth-box{background:#fff;border-radius:20px;padding:28px 24px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.auth-logo{display:flex;align-items:center;justify-content:center;margin-bottom:24px}
.auth-title{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:26px;color:var(--navy);margin-bottom:4px;text-align:center}
.auth-sub{font-size:13px;color:var(--g400);margin-bottom:20px;text-align:center}
.auth-link{font-size:13px;color:var(--gdk);font-weight:600;cursor:pointer;text-align:center;margin-top:14px}
.auth-err{font-size:13px;color:var(--red);text-align:center;margin-top:8px;padding:8px;background:var(--red-lt);border-radius:6px}

/* Welcome / Paywall screens */
.wlc{min-height:100dvh;background:var(--navy);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 28px;text-align:center}
.wm{width:76px;height:76px;background:linear-gradient(135deg,var(--green),var(--gdk));border-radius:20px;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:33px;color:#fff;margin-bottom:20px;box-shadow:0 12px 40px rgba(61,196,60,.4)}
.wt{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:38px;color:#fff;margin-bottom:6px}
.wt span{color:var(--green)}
.wsub{font-size:15px;color:rgba(255,255,255,.45);margin-bottom:42px}
.ls{display:flex;flex-direction:column;gap:10px;width:100%;max-width:260px}
.lbtn{padding:15px;border-radius:var(--rad);font-family:'Barlow',sans-serif;font-size:16px;font-weight:700;cursor:pointer;border:none;transition:transform .1s}
.lbtn:active{transform:scale(.97)}
.len{background:var(--green);color:#fff}
.les{background:rgba(255,255,255,.08);color:#fff;border:1.5px solid rgba(255,255,255,.15)}

/* Trial reminder popup */
.reminder-ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;display:flex;align-items:center;justify-content:center;padding:24px}
.reminder-box{background:#fff;border-radius:18px;padding:28px 24px;width:100%;max-width:360px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.reminder-icon{font-size:36px;margin-bottom:12px}
.reminder-title{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:22px;color:var(--navy);margin-bottom:8px}
.reminder-body{font-size:14px;color:var(--g600);margin-bottom:20px;line-height:1.5}
.reminder-btns{display:flex;flex-direction:column;gap:8px}

/* Soft lock banner */
.soft-banner{background:linear-gradient(135deg,#B45309,#92400E);padding:12px 17px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.soft-banner-text{font-size:12px;color:#FEF3C7;font-weight:600;flex:1;line-height:1.4}
.soft-banner-btn{background:#FEF3C7;color:#92400E;border:none;border-radius:6px;padding:6px 10px;font-family:'Barlow',sans-serif;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}

/* Data warning banner */
.data-warn{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:var(--radsm);padding:12px 14px;margin-bottom:12px;font-size:12px;color:#1D4ED8;line-height:1.5}

/* Admin */
.admin{min-height:100vh;background:var(--g100);font-family:'Barlow',sans-serif}
.admin-hdr{background:var(--navy);padding:14px 20px;display:flex;align-items:center;justify-content:space-between}
.admin-tabs{background:#fff;border-bottom:1px solid var(--g200);padding:0 20px;display:flex}
.admin-tab{padding:12px 16px;font-size:14px;font-weight:600;color:var(--g400);cursor:pointer;border:none;background:none;font-family:'Barlow',sans-serif;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s}
.admin-tab.on{color:var(--navy);border-bottom-color:var(--green)}
.admin-ct{padding:20px;max-width:1000px;margin:0 auto}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.stat-card{background:#fff;border:1px solid var(--g200);border-radius:var(--rad);padding:16px;box-shadow:var(--sh)}
.stat-lbl{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--g400);margin-bottom:6px}
.stat-val{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:32px;color:var(--navy);line-height:1}
.stat-sub{font-size:12px;color:var(--g400);margin-top:3px}
.tbl-wrap{background:#fff;border:1px solid var(--g200);border-radius:var(--rad);overflow:hidden;box-shadow:var(--sh)}
.tbl-hdr{padding:14px 18px;border-bottom:1px solid var(--g200);display:flex;justify-content:space-between;align-items:center}
.tbl-title{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:17px;color:var(--navy)}
table{width:100%;border-collapse:collapse}
th{padding:9px 14px;font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--g400);text-align:left;background:var(--g50);border-bottom:1px solid var(--g200)}
td{padding:11px 14px;font-size:13px;color:var(--g800);border-bottom:1px solid var(--g100)}
tr:last-child td{border-bottom:none}
.spill{display:inline-flex;align-items:center;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700}
.s-trial{background:#EFF6FF;color:#2563EB}
.s-free{background:var(--glt);color:var(--gdk)}
.s-paid{background:var(--glt);color:var(--gdk)}
.s-expired{background:var(--yellow-lt);color:var(--yellow)}
.s-locked{background:var(--red-lt);color:var(--red)}

/* Empty */
.empty{text-align:center;padding:48px 20px;color:var(--g400)}
.ei{font-size:38px;margin-bottom:10px}
`;

// ─── ICONS ────────────────────────────────────────────────────────────────────
const IcoCalc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/></svg>;
const IcoList = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
const IcoGear = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;

// ─── JOB MODAL ────────────────────────────────────────────────────────────────
function JobModal({ job, onSave, onClose, t }) {
  const [form, setForm] = useState(job ? { name: job.name, hours: String(job.hours), materials: String(job.materials) } : { name: "", hours: "", materials: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const ok = form.name.trim().length > 0;
  return (
    <div className="ov" onClick={onClose}>
      <div className="mo" onClick={e => e.stopPropagation()}>
        <div className="mo-t">{job ? t.editJob : t.addJob}</div>
        <div className="fi"><label className="lb">{t.jobName2}</label><input type="text" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Weekly Maintenance" autoFocus /></div>
        <div className="r2">
          <div className="fi"><label className="lb">{t.defHours}</label><input type="number" step="0.5" min="0" value={form.hours} onChange={e => set("hours", e.target.value)} placeholder="2" /></div>
          <div className="fi"><label className="lb">{t.defMats}</label><div className="px"><span className="pxs">$</span><input type="number" min="0" value={form.materials} onChange={e => set("materials", e.target.value)} placeholder="0" /></div></div>
        </div>
        <div className="mo-b">
          <button className="btn bg" onClick={onClose}>{t.cancel}</button>
          <button className="btn bp" style={{ opacity: ok ? 1 : .45 }} onClick={() => ok && onSave({ name: form.name.trim(), hours: pf(form.hours, 1), materials: pf(form.materials, 0) })}>{t.saveJob}</button>
        </div>
      </div>
    </div>
  );
}

// ─── JOB LIBRARY ─────────────────────────────────────────────────────────────
function JobLibrary({ jobs, setJobs, t, onBack, backLabel, showHeading = true }) {
  const [modal, setModal] = useState(null);
  const save = ({ name, hours, materials }) => {
    if (modal === "add") setJobs(p => [...p, { id: Date.now(), name, hours, materials }]);
    else setJobs(p => p.map(j => j.id === modal.id ? { ...j, name, hours, materials } : j));
    setModal(null);
  };
  return (
    <>
      {showHeading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 17 }}>
          {onBack && <button className="btn bsm bg" onClick={onBack}>← {backLabel}</button>}
          <div className="st" style={{ margin: 0 }}>{t.jobLibrary}</div>
        </div>
      )}
      <button className="btn bp" style={{ marginBottom: 13 }} onClick={() => setModal("add")}>{t.addJob}</button>
      {jobs.map(j => (
        <div className="ji" key={j.id}>
          <div className="ji-info"><div className="ji-name">{j.name}</div><div className="ji-meta">{j.hours}h · ${j.materials} materials</div></div>
          <div className="ji-act">
            <button className="btn bsm bg" onClick={() => setModal(j)}>{t.editJob}</button>
            <button className="btn bsm bd" onClick={() => setJobs(p => p.filter(x => x.id !== j.id))}>{t.deleteJob}</button>
          </div>
        </div>
      ))}
      {modal && <JobModal job={modal === "add" ? null : modal} onSave={save} onClose={() => setModal(null)} t={t} />}
    </>
  );
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
function AdminDashboard({ onClose }) {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass]     = useState("");
  const [err, setErr]       = useState(false);
  const [tab, setTab]       = useState("overview");
  const [users, setUsers]   = useState(() => LS.get("lb_all_users", []));

  const login = () => {
    if (pass === ADMIN_PASSWORD) { setAuthed(true); setErr(false); }
    else setErr(true);
  };

  const totalMRR   = users.filter(u => u.accountType === "paid").length * 19.99;
  const trialUsers = users.filter(u => u.accountType === "trial");
  const paidUsers  = users.filter(u => u.accountType === "paid");
  const freeUsers  = users.filter(u => u.accountType === "free");
  const totalQ     = users.reduce((s, u) => s + (u.quotesGenerated || 0), 0);

  const updateUser = (email, updates) => {
    const updated = users.map(u => u.email === email ? { ...u, ...updates } : u);
    setUsers(updated);
    LS.set("lb_all_users", updated);
    // Also update individual user record
    const userKey = `lb_user_${email.replace(/[^a-z0-9]/gi, "_")}`;
    const existing = LS.get(userKey, {});
    LS.set(userKey, { ...existing, ...updates });
  };

  const getTrialStatus = (u) => {
    if (u.accountType === "free") return "free";
    if (u.accountType === "paid") return "paid";
    const days = Math.floor((Date.now() - new Date(u.signupDate)) / (1000 * 60 * 60 * 24));
    if (days <= TRIAL_DAYS) return "trial";
    if (days <= TRIAL_DAYS + SOFT_LOCK_DAYS) return "expired";
    return "locked";
  };

  if (!authed) return (
    <div className="auth">
      <div className="auth-box">
        <div className="auth-logo"><div className="lm">LB</div><span className="lt">Listo<span>Bid</span></span></div>
        <div className="auth-title">Admin Portal</div>
        <div className="auth-sub">Restricted access</div>
        <div className="fi"><label className="lb">Password</label>
          <input type="password" value={pass} onChange={e => { setPass(e.target.value); setErr(false); }} onKeyDown={e => e.key === "Enter" && login()} placeholder="Enter admin password" autoFocus />
        </div>
        {err && <div className="auth-err">Incorrect password</div>}
        <button className="btn bp mt8" onClick={login}>Sign In</button>
        <button className="btn bg mt8" onClick={onClose}>← Back to App</button>
      </div>
    </div>
  );

  return (
    <div className="admin">
      <div className="admin-hdr">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="lm">LB</div>
          <span className="lt" style={{ color: "#fff" }}>Listo<span>Bid</span></span>
          <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(61,196,60,.2)", color: "var(--green)", padding: "3px 10px", borderRadius: 20 }}>ADMIN</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn bsm bg" style={{ color: "rgba(255,255,255,.6)", borderColor: "rgba(255,255,255,.2)" }} onClick={onClose}>← App</button>
          <button className="btn bsm bg" style={{ color: "rgba(255,255,255,.6)", borderColor: "rgba(255,255,255,.2)" }} onClick={() => setAuthed(false)}>Sign Out</button>
        </div>
      </div>
      <div className="admin-tabs">
        {["overview", "users"].map(tb => (
          <button key={tb} className={`admin-tab ${tab === tb ? "on" : ""}`} onClick={() => setTab(tb)}>
            {tb.charAt(0).toUpperCase() + tb.slice(1)}
          </button>
        ))}
      </div>
      <div className="admin-ct">
        {tab === "overview" && (
          <>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-lbl">Monthly Revenue</div><div className="stat-val" style={{ color: "var(--gdk)" }}>${totalMRR.toFixed(2)}</div><div className="stat-sub">{paidUsers.length} paid users</div></div>
              <div className="stat-card"><div className="stat-lbl">Active Trials</div><div className="stat-val">{trialUsers.length}</div><div className="stat-sub">Converting soon</div></div>
              <div className="stat-card"><div className="stat-lbl">Free Accounts</div><div className="stat-val">{freeUsers.length}</div><div className="stat-sub">Beta / Legacy</div></div>
              <div className="stat-card"><div className="stat-lbl">Total Users</div><div className="stat-val">{users.length}</div><div className="stat-sub">All time</div></div>
              <div className="stat-card"><div className="stat-lbl">Quotes Generated</div><div className="stat-val">{totalQ}</div><div className="stat-sub">Across all users</div></div>
            </div>
            {users.length === 0 && <div className="empty"><div className="ei">👥</div><div>No registered users yet</div></div>}
          </>
        )}
        {tab === "users" && (
          <div className="tbl-wrap">
            <div className="tbl-hdr"><span className="tbl-title">All Users</span><span style={{ fontSize: 13, color: "var(--g400)" }}>{users.length} total</span></div>
            {users.length === 0
              ? <div className="empty"><div className="ei">👥</div><div>No registered users yet</div></div>
              : <table>
                  <thead><tr><th>Name / Email</th><th>Industry</th><th>Joined</th><th>Quotes</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {users.map(u => {
                      const status = getTrialStatus(u);
                      const sc = { trial: "s-trial", free: "s-free", paid: "s-paid", expired: "s-expired", locked: "s-locked" }[status] || "s-trial";
                      return (
                        <tr key={u.email}>
                          <td><div style={{ fontWeight: 700 }}>{u.firstName}</div><div style={{ fontSize: 11, color: "var(--g400)" }}>{u.email}</div></td>
                          <td style={{ textTransform: "capitalize" }}>{u.industry || "—"}</td>
                          <td style={{ color: "var(--g600)", fontSize: 12 }}>{new Date(u.signupDate).toLocaleDateString()}</td>
                          <td style={{ fontWeight: 700 }}>{u.quotesGenerated || 0}</td>
                          <td><span className={`spill ${sc}`}>{status.toUpperCase()}</span></td>
                          <td>
                            <div style={{ display: "flex", gap: 5 }}>
                              {u.accountType !== "free"  && <button className="btn bsm" style={{ background: "var(--glt)", color: "var(--gdk)", border: "none" }} onClick={() => updateUser(u.email, { accountType: "free" })}>Free</button>}
                              {u.accountType !== "paid"  && <button className="btn bsm bp" onClick={() => updateUser(u.email, { accountType: "paid" })}>Paid</button>}
                              {u.accountType !== "trial" && <button className="btn bsm bg" onClick={() => updateUser(u.email, { accountType: "trial" })}>Trial</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function ListoBid() {

  // ── Route ──
  const [route, setRoute] = useState("welcome"); // welcome | register | login | resetPass | setup | app | admin

  // ── Auth ──
  const [currentUser, setCurrentUser] = useState(() => LS.get("lb_current_user", null));
  const [regForm,  setRegForm]  = useState({ firstName: "", email: "", password: "", confirm: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent]   = useState(false);
  const [authErr, setAuthErr] = useState("");

  // ── Lang / Industry / Setup ──
  const [lang,     setLang]     = useState(() => LS.get("lb_lang", null));
  const [industry, setIndustry] = useState(() => LS.get("lb_industry", null));
  const [step,     setStep]     = useState(0);
  const [profile,  setProfile]  = useState(() => LS.get("lb_profile", { laborRate: "", crewSize: "2", targetMargin: "40", zipCode: "", vehicles: "1", fuelType: "gas" }));
  const ps = (k, v) => { const p = { ...profile, [k]: v }; setProfile(p); LS.set("lb_profile", p); };

  // ── Job libraries ──
  const [allJobs, setAllJobsState] = useState(() => LS.get("lb_all_jobs", {
    landscaping: INDUSTRY_TEMPLATES.landscaping.jobs.map(j => ({ ...j })),
    pool:        INDUSTRY_TEMPLATES.pool.jobs.map(j => ({ ...j })),
    handyman:    INDUSTRY_TEMPLATES.handyman.jobs.map(j => ({ ...j })),
  }));
  const setAllJobs = (updater) => {
    const next = typeof updater === "function" ? updater(allJobs) : updater;
    setAllJobsState(next); LS.set("lb_all_jobs", next);
  };
  const jobs    = allJobs[industry] || [];
  const setJobs = (updater) => setAllJobs(prev => ({ ...prev, [industry]: typeof updater === "function" ? updater(prev[industry] || []) : updater }));

  // ── Gas price ──
  const [gasPrice, setGasPrice]   = useState("");
  const [gasStatus, setGasStatus] = useState("idle");
  const [gasOver,   setGasOver]   = useState("");
  const [useOver,   setUseOver]   = useState(false);

  // ── Quote form ──
  const [selJob,   setSelJob]   = useState("");
  const [hours,    setHours]    = useState("");
  const [mats,     setMats]     = useState("");
  const [tier,     setTier]     = useState("short");
  const [exactMi,  setExactMi]  = useState("");
  const [vehs,     setVehs]     = useState(() => LS.get("lb_profile", { vehicles: "1" }).vehicles || "1");
  const [margin,   setMargin]   = useState(() => pf(LS.get("lb_profile", { targetMargin: "40" }).targetMargin, 40));
  const [result,   setResult]   = useState(null);
  const [showAct,  setShowAct]  = useState(false);

  // ── Save modal ──
  const [showSave,   setShowSave]   = useState(false);
  const [saveName,   setSaveName]   = useState("");
  const [saveNotes,  setSaveNotes]  = useState("");
  const [log,        setLog]        = useState(() => LS.get("lb_quote_log", []));

  // ── Settings sub-view ──
  const [settView, setSettView] = useState("main");

  // ── Modals ──
  const [showDataWarn, setShowDataWarn] = useState(false);

  // ── Trial ──
  const [showReminder, setShowReminder] = useState(false);
  const [reminderShown, setReminderShown] = useState(() => LS.get("lb_reminder_shown", { d10: false, d13: false }));

  // ── Tab ──
  const [tab, setTab] = useState("quote");

  const t = TX[lang] || TX.en;

  // ── Trial calculation ──
  const trialInfo = useCallback(() => {
    if (!currentUser) return { daysLeft: TRIAL_DAYS, expired: false, softLock: false, hardLock: false, pct: 100, daysAfter: 0 };
    if (currentUser.accountType === "free" || currentUser.accountType === "paid") {
      return { daysLeft: TRIAL_DAYS, expired: false, softLock: false, hardLock: false, pct: 100, daysAfter: 0 };
    }
    const msPerDay  = 1000 * 60 * 60 * 24;
    const daysUsed  = Math.floor((Date.now() - new Date(currentUser.signupDate)) / msPerDay);
    const daysLeft  = Math.max(0, TRIAL_DAYS - daysUsed);
    const daysAfter = Math.max(0, daysUsed - TRIAL_DAYS);
    const expired   = daysLeft === 0;
    const softLock  = expired && daysAfter <= SOFT_LOCK_DAYS;
    const hardLock  = expired && daysAfter > SOFT_LOCK_DAYS;
    const pct       = Math.round((daysLeft / TRIAL_DAYS) * 100);
    return { daysLeft, expired, softLock, hardLock, pct, daysAfter };
  }, [currentUser]);

  const trial = trialInfo();

  // ── Check trial reminders ──
  useEffect(() => {
    if (!currentUser || currentUser.accountType !== "trial") return;
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysUsed = Math.floor((Date.now() - new Date(currentUser.signupDate)) / msPerDay);
    const day10 = daysUsed >= 10 && daysUsed < 11 && !reminderShown.d10;
    const day13 = daysUsed >= 13 && daysUsed < 14 && !reminderShown.d13;
    if (day10 || day13) setShowReminder(day13 ? "d13" : "d10");
  }, [currentUser, reminderShown]);

  // ── Gas fetch ──
  useEffect(() => {
    if (!profile.zipCode || profile.zipCode.length < 5) return;
    setGasStatus("loading");
    fetchGasPrice(profile.zipCode, profile.fuelType).then(price => {
      setGasPrice(price);
      setGasStatus("live");
      setUseOver(false);
    });
  }, [profile.zipCode, profile.fuelType]);

  // ── Sync margin and vehicles from profile ──
  useEffect(() => { setMargin(pf(profile.targetMargin, 40)); }, [profile.targetMargin]);
  useEffect(() => { setVehs(profile.vehicles); }, [profile.vehicles]);

  // ── Persist log ──
  useEffect(() => { LS.set("lb_quote_log", log); }, [log]);

  // ── Auth helpers ──
  const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleRegister = () => {
    setAuthErr("");
    if (!regForm.firstName.trim()) return setAuthErr("Please enter your first name");
    if (!validateEmail(regForm.email)) return setAuthErr(t.emailInvalid);
    if (regForm.password.length < 8)  return setAuthErr(t.passMin);
    if (regForm.password !== regForm.confirm) return setAuthErr(t.passMismatch);
    // Check if email taken
    const existing = LS.get(`lb_user_${regForm.email.replace(/[^a-z0-9]/gi, "_")}`, null);
    if (existing) return setAuthErr(t.emailTaken);
    // Create user
    const user = {
      firstName:       regForm.firstName.trim(),
      email:           regForm.email.toLowerCase().trim(),
      password:        regForm.password, // in production: hash this
      signupDate:      new Date().toISOString(),
      accountType:     "trial",
      industry:        null,
      quotesGenerated: 0,
      lastActive:      new Date().toISOString(),
    };
    const userKey = `lb_user_${user.email.replace(/[^a-z0-9]/gi, "_")}`;
    LS.set(userKey, user);
    LS.set("lb_current_user", user);
    // Add to all_users list for admin
    const allUsers = LS.get("lb_all_users", []);
    allUsers.push(user);
    LS.set("lb_all_users", allUsers);
    setCurrentUser(user);
    setShowDataWarn(true);
    if (!lang) setRoute("welcome");
    else setRoute("industry");
  };

  const handleLogin = () => {
    setAuthErr("");
    if (!validateEmail(loginForm.email)) return setAuthErr(t.emailInvalid);
    const userKey = `lb_user_${loginForm.email.toLowerCase().replace(/[^a-z0-9]/gi, "_")}`;
    const user = LS.get(userKey, null);
    if (!user || user.password !== loginForm.password) return setAuthErr(t.invalidCreds);
    user.lastActive = new Date().toISOString();
    LS.set(userKey, user);
    LS.set("lb_current_user", user);
    const savedIndustry = LS.get("lb_industry", null);
    setIndustry(savedIndustry);
    setCurrentUser(user);
    if (!lang) setRoute("welcome");
    else if (!savedIndustry) setRoute("industry");
    else setRoute("app");
  };

  const handleLogout = () => {
    LS.del("lb_current_user");
    setCurrentUser(null);
    setRoute("login");
  };

  const handleResetPass = () => {
    if (!validateEmail(resetEmail)) return setAuthErr(t.emailInvalid);
    // In production: send real reset email via backend
    setResetSent(true);
    setAuthErr("");
  };

  // ── Update user quote count ──
  const incrementQuotes = useCallback(() => {
    if (!currentUser) return;
    const userKey = `lb_user_${currentUser.email.replace(/[^a-z0-9]/gi, "_")}`;
    const updated = { ...currentUser, quotesGenerated: (currentUser.quotesGenerated || 0) + 1, lastActive: new Date().toISOString() };
    LS.set(userKey, updated);
    LS.set("lb_current_user", updated);
    setCurrentUser(updated);
    // Update in all_users
    const allUsers = LS.get("lb_all_users", []);
    LS.set("lb_all_users", allUsers.map(u => u.email === currentUser.email ? updated : u));
  }, [currentUser]);

  // ── Quote logic ──
  const effGas  = useOver ? gasOver : gasPrice;
  const canCalc = !!hours && pf(hours) > 0 && !!effGas && pf(effGas) > 0;

  const buildParams = (mg = margin) => ({
    laborRate: profile.laborRate, crewSize: profile.crewSize,
    hours, materials: mats, exactMiles: exactMi, tier,
    vehicles: vehs, gasPrice: effGas, margin: mg,
  });

  const doCalc = (mg = margin) => {
    if (!canCalc) return;
    const r = calcQuote(buildParams(mg));
    setMargin(Math.round(r.margin));
    setResult(r); setShowAct(false);
    incrementQuotes();
  };

  const onSlider = (val) => {
    setMargin(val);
    if (!canCalc) return;
    const r = calcQuote(buildParams(val));
    setResult(r);
  };

  const selectJob = (id) => {
    setSelJob(id); setResult(null); setShowAct(false);
    const j = jobs.find(j => String(j.id) === String(id));
    if (j) { setHours(String(j.hours)); setMats(String(j.materials)); }
  };

  const reset = () => {
    setSelJob(""); setHours(""); setMats(""); setTier("short");
    setExactMi(""); setVehs(profile.vehicles);
    setMargin(pf(profile.targetMargin, 40));
    setResult(null); setShowAct(false);
    setUseOver(false); setGasOver("");
  };

  const saveQuote = () => {
    if (!saveName.trim() || !result) return;
    const entry = {
      id: Date.now(), name: saveName.trim(), notes: saveNotes.trim(),
      price: result.price, margin: result.margin, profit: result.profit,
      date: new Date().toLocaleDateString(),
      jobType: jobs.find(j => String(j.id) === String(selJob))?.name || "—",
      industry: industry || "landscaping",
    };
    const newLog = [entry, ...log];
    setLog(newLog); LS.set("lb_quote_log", newLog);
    setShowSave(false); setSaveName(""); setSaveNotes("");
    setShowAct(false); reset();
  };

  const dismissReminder = () => {
    const updated = { ...reminderShown, [showReminder]: true };
    setReminderShown(updated); LS.set("lb_reminder_shown", updated);
    setShowReminder(false);
  };

  // ─── ADMIN ────────────────────────────────────────────────────────────────
  if (route === "admin") return (
    <>
      <style>{CSS}</style>
      <AdminDashboard onClose={() => setRoute("app")} />
    </>
  );

  // ─── WELCOME — Language ───────────────────────────────────────────────────
  if (!lang || route === "welcome") return (
    <>
      <style>{CSS}</style>
      <div className="wlc">
        <div className="wm">LB</div>
        <h1 className="wt">Listo<span>Bid</span></h1>
        <p className="wsub">Ready to Bid.</p>
        <div className="ls">
          <button className="lbtn len" onClick={() => { setLang("en"); LS.set("lb_lang", "en"); setRoute("register"); }}>🇺🇸 &nbsp;English</button>
          <button className="lbtn les" onClick={() => { setLang("es"); LS.set("lb_lang", "es"); setRoute("register"); }}>🇲🇽 &nbsp;Español</button>
        </div>
      </div>
    </>
  );

  // ─── REGISTER ────────────────────────────────────────────────────────────
  if (route === "register") return (
    <>
      <style>{CSS}</style>
      <div className="auth">
        <div className="auth-box">
          <div className="auth-logo"><div className="lm" style={{width:64,height:64,fontSize:26,borderRadius:16}}>LB</div></div>
          <div className="auth-title">{t.register}</div>
          <div className="auth-sub">{t.welcomeSub}</div>
          <div className="fi"><label className="lb">{t.firstName}</label><input type="text" value={regForm.firstName} onChange={e => setRegForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Carlos" autoFocus /></div>
          <div className="fi"><label className="lb">{t.email}</label><input type="email" value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} placeholder="you@email.com" /></div>
          <div className="fi"><label className="lb">{t.password}</label><input type="password" value={regForm.password} onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" /></div>
          <div className="fi"><label className="lb">{t.confirmPass}</label><input type="password" value={regForm.confirm} onChange={e => setRegForm(f => ({ ...f, confirm: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleRegister()} placeholder="Repeat password" /></div>
          {authErr && <div className="auth-err">{authErr}</div>}
          <button className="btn bp mt8" onClick={handleRegister}>{t.signUp}</button>
          <div className="auth-link" onClick={() => { setAuthErr(""); setRoute("login"); }}>{t.hasAccount} {t.signIn}</div>
        </div>
      </div>
    </>
  );

  // ─── LOGIN ────────────────────────────────────────────────────────────────
  if (route === "login") return (
    <>
      <style>{CSS}</style>
      <div className="auth">
        <div className="auth-box">
          <div className="auth-logo"><div className="lm" style={{width:64,height:64,fontSize:26,borderRadius:16}}>LB</div></div>
          <div className="auth-title">{t.login}</div>
          <div className="auth-sub">{t.welcomeSub}</div>
          <div className="fi"><label className="lb">{t.email}</label><input type="email" value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))} placeholder="you@email.com" autoFocus /></div>
          <div className="fi"><label className="lb">{t.password}</label><input type="password" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Your password" /></div>
          {authErr && <div className="auth-err">{authErr}</div>}
          <button className="btn bp mt8" onClick={handleLogin}>{t.signIn}</button>
          <div className="auth-link" onClick={() => { setAuthErr(""); setRoute("resetPass"); }}>{t.forgotPass}</div>
          <div className="auth-link" onClick={() => { setAuthErr(""); setRoute("register"); }}>{t.noAccount} {t.signUp}</div>
        </div>
      </div>
    </>
  );

  // ─── RESET PASSWORD ───────────────────────────────────────────────────────
  if (route === "resetPass") return (
    <>
      <style>{CSS}</style>
      <div className="auth">
        <div className="auth-box">
          <div className="auth-logo"><div className="lm" style={{width:64,height:64,fontSize:26,borderRadius:16}}>LB</div></div>
          <div className="auth-title">{t.resetPass}</div>
          {resetSent
            ? <>
                <div style={{ fontSize: 14, color: "var(--gdk)", textAlign: "center", padding: "16px 0", lineHeight: 1.6 }}>✅ {t.resetSent}</div>
                <button className="btn bp" onClick={() => { setResetSent(false); setRoute("login"); }}>{t.signIn}</button>
              </>
            : <>
                <div className="fi"><label className="lb">{t.email}</label><input type="email" value={resetEmail} onChange={e => { setResetEmail(e.target.value); setAuthErr(""); }} placeholder="you@email.com" autoFocus /></div>
                {authErr && <div className="auth-err">{authErr}</div>}
                <button className="btn bp mt8" onClick={handleResetPass}>{t.resetPass}</button>
                <div className="auth-link" onClick={() => { setAuthErr(""); setRoute("login"); }}>← {t.signIn}</div>
              </>
          }
        </div>
      </div>
    </>
  );

  // ─── REDIRECT if not logged in ────────────────────────────────────────────
  if (!currentUser) return null;

  // ─── HARD LOCK ────────────────────────────────────────────────────────────
  if (trial.hardLock) return (
    <>
      <style>{CSS}</style>
      <div className="wlc">
        <div className="wm">LB</div>
        <h1 className="wt">Listo<span>Bid</span></h1>
        <p style={{ fontSize: 22, color: "rgba(255,255,255,.9)", fontWeight: 700, marginBottom: 10 }}>
          {t.trialExpiredTitle}
        </p>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,.5)", marginBottom: 32, maxWidth: 280, lineHeight: 1.6 }}>
          {t.trialExpiredBody}
        </p>
        <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: "18px 22px", marginBottom: 24, width: "100%", maxWidth: 300 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 40, color: "var(--green)", lineHeight: 1 }}>$19.99<span style={{ fontSize: 18, color: "rgba(255,255,255,.4)" }}>/mo</span></div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 5 }}>Cancel anytime · Autopay</div>
        </div>
        <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer"
          style={{ width: "100%", maxWidth: 300, display: "block", padding: 14, background: "linear-gradient(135deg,var(--green),var(--gdk))", color: "#fff", borderRadius: 12, fontFamily: "'Barlow',sans-serif", fontSize: 15, fontWeight: 700, textDecoration: "none", textAlign: "center", boxShadow: "0 4px 20px rgba(61,196,60,.4)", marginBottom: 12 }}>
          {t.subscribeNow}
        </a>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", marginTop: 8 }}>support@listobid.com</div>
        <button style={{ marginTop: 16, background: "none", border: "none", color: "rgba(255,255,255,.3)", fontSize: 12, cursor: "pointer", fontFamily: "'Barlow',sans-serif" }} onClick={handleLogout}>{t.logout}</button>
      </div>
    </>
  );

  // ─── INDUSTRY SELECTOR ────────────────────────────────────────────────────
  if (!industry || route === "industry") return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="hdr"><div className="hdr-logo"><div className="lm">LB</div><span className="lt">Listo<span>Bid</span></span></div></div>
        <div className="ct" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>👋</div>
          <div className="st" style={{ marginBottom: 4 }}>{lang === "es" ? `Hola, ${currentUser.firstName}!` : `Hi, ${currentUser.firstName}!`}</div>
          <div className="st" style={{ marginBottom: 6 }}>{t.chooseIndustry}</div>
          <p style={{ fontSize: 13, color: "var(--g400)", marginBottom: 28 }}>{t.industrySubtitle}</p>
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            {Object.entries(INDUSTRY_TEMPLATES).map(([key, tmpl]) => (
              <button key={key}
                style={{ flex: 1, padding: "18px 6px", background: industry === key ? "var(--glt)" : "var(--w)", border: `2px solid ${industry === key ? "var(--green)" : "var(--g200)"}`, borderRadius: "var(--rad)", cursor: "pointer", fontFamily: "'Barlow',sans-serif", transition: "all .15s", boxShadow: "var(--sh)" }}
                onClick={() => {
                  const userKey = `lb_user_${currentUser.email.replace(/[^a-z0-9]/gi, "_")}`;
                  const updated = { ...currentUser, industry: key };
                  LS.set("lb_industry", key);
                  LS.set(userKey, updated);
                  LS.set("lb_current_user", updated);
                  setCurrentUser(updated);
                  setIndustry(key);
                  setStep(1);
                  setRoute("setup");
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--green)"; e.currentTarget.style.background = "var(--glt)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--g200)"; e.currentTarget.style.background = "var(--w)"; }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{tmpl[lang]?.icon || tmpl.en.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{tmpl[lang]?.name || tmpl.en.name}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  // ─── SETUP ────────────────────────────────────────────────────────────────
  if ((step >= 1 && step <= 5) || route === "setup") {
    const TOTAL = 5;
    const content = [
      // Step 1: Labor & Margin
      <div key="s1">
        <div className="st">{t.setup}</div><div className="ss">{t.step} 1 {t.of} {TOTAL} — Labor & Margin</div>
        <div className="fi"><label className="lb">{t.laborRate}</label><div className="px"><span className="pxs">$</span><input type="number" min="0" value={profile.laborRate} onChange={e => ps("laborRate", e.target.value)} placeholder="18.00" /></div><div className="ht">{t.laborHint}</div></div>
        <div className="fi"><label className="lb">{t.crewSize}</label><div className="tg">{[1,2,3,4,5,6,7,8,9,10].map(x => <button key={x} className={`tb ${profile.crewSize===String(x)?"on":""}`} style={{flex:"0 0 calc(20% - 6px)",minWidth:36}} onClick={()=>ps("crewSize",String(x))}>{x}</button>)}</div></div>
        <div className="fi"><label className="lb">{t.targetMargin}</label><div className="sx"><input type="number" min="1" max="99" value={profile.targetMargin} onChange={e=>ps("targetMargin",e.target.value)} placeholder="40"/><span className="sxs">%</span></div><div className="ht">{t.marginHint}</div></div>
      </div>,
      // Step 2: Location & Fuel
      <div key="s2">
        <div className="st">{t.setup}</div><div className="ss">{t.step} 2 {t.of} {TOTAL} — Location & Fuel</div>
        <div className="fi"><label className="lb">{t.zipCode}</label><input type="text" value={profile.zipCode} onChange={e=>ps("zipCode",e.target.value)} placeholder="85001" maxLength={5}/><div className="ht">{t.zipHint}</div></div>
        <div className="fi"><label className="lb">{t.fuelType}</label><div className="tg"><button className={`tb ${profile.fuelType==="gas"?"on":""}`} onClick={()=>ps("fuelType","gas")}>⛽ {t.gas}</button><button className={`tb ${profile.fuelType==="diesel"?"on":""}`} onClick={()=>ps("fuelType","diesel")}>🛢 {t.diesel}</button></div></div>
      </div>,
      // Step 3: Vehicles
      <div key="s3">
        <div className="st">{t.setup}</div><div className="ss">{t.step} 3 {t.of} {TOTAL} — Vehicles</div>
        <div className="fi"><label className="lb">{t.vehicles}</label><div className="tg">{[1,2,3,4,5].map(x=><button key={x} className={`tb ${profile.vehicles===String(x)?"on":""}`} onClick={()=>ps("vehicles",String(x))}>{x}</button>)}</div></div>
      </div>,
      // Step 4: Job Library
      <div key="s4">
        <div className="st">{t.setup}</div><div className="ss">{t.step} 4 {t.of} {TOTAL} — {t.jobLibrary}</div>
        <p style={{fontSize:13,color:"var(--g400)",marginBottom:14}}>{t.preloaded}</p>
        <JobLibrary jobs={jobs} setJobs={setJobs} t={t} showHeading={false}/>
      </div>,
      // Step 5: Language confirm
      <div key="s5">
        <div className="st">{t.setup}</div><div className="ss">{t.step} 5 {t.of} {TOTAL} — Language</div>
        <div className="fi"><label className="lb">{t.language}</label><div className="tg"><button className={`tb ${lang==="en"?"on":""}`} onClick={()=>{setLang("en");LS.set("lb_lang","en");}}>🇺🇸 English</button><button className={`tb ${lang==="es"?"on":""}`} onClick={()=>{setLang("es");LS.set("lb_lang","es");}}>🇲🇽 Español</button></div></div>
        <p style={{fontSize:13,color:"var(--g400)",marginTop:8}}>You can change this anytime in Settings.</p>
      </div>,
    ];
    return (
      <>
        <style>{CSS}</style>
        <div className="app">
          <div className="hdr"><div className="hdr-logo"><div className="lm">LB</div><span className="lt">Listo<span>Bid</span></span></div></div>
          <div className="ct">
            <div className="steps">{Array.from({length:TOTAL},(_,i)=>i+1).map(i=><div key={i} className={`sd ${i<step?"done":i===step?"active":""}`}/>)}</div>
            {content[step-1]}
            <div style={{height:20}}/>
            <button className="btn bp" onClick={()=>{ if(step<TOTAL){ setStep(s=>s+1); } else { setStep(0); setRoute("app"); } }}>
              {step===TOTAL?t.saveProfile:t.continue}
            </button>
            {step>1&&<button className="btn bg mt8" onClick={()=>setStep(s=>s-1)}>{t.back}</button>}
          </div>
        </div>
        {/* Data warning on first launch */}
        {showDataWarn && (
          <div className="ov" onClick={()=>setShowDataWarn(false)}>
            <div className="mo" onClick={e=>e.stopPropagation()}>
              <div className="mo-t">⚠️ {t.dataWarning}</div>
              <p style={{fontSize:14,color:"var(--g600)",lineHeight:1.6,marginBottom:20}}>{t.dataWarningBody}</p>
              <button className="btn bp" onClick={()=>setShowDataWarn(false)}>{t.understood}</button>
            </div>
          </div>
        )}
      </>
    );
  }

  // ─── MAIN APP ─────────────────────────────────────────────────────────────
  const mc = result ? marginMeta(result.margin) : null;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">

        {/* Header */}
        <div className="hdr">
          <div className="hdr-logo"><div className="lm">LB</div><span className="lt">Listo<span>Bid</span></span></div>
          <div className="hdr-user">👤 {currentUser?.firstName}</div>
        </div>

        {/* Soft lock banner */}
        {trial.softLock && (
          <div className="soft-banner">
            <div className="soft-banner-text">
              {t.softLockTitle} — {SOFT_LOCK_DAYS - trial.daysAfter} {t.softLockDays}. {t.softLockBody}
            </div>
            <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer" className="soft-banner-btn">{t.subscribeNow}</a>
          </div>
        )}

        {/* Trial reminder popup */}
        {showReminder && (
          <div className="reminder-ov">
            <div className="reminder-box">
              <div className="reminder-icon">⏰</div>
              <div className="reminder-title">{showReminder === "d13" ? t.reminderDay13Title : t.reminderDay10Title}</div>
              <div className="reminder-body">{showReminder === "d13" ? t.reminderDay13Body : t.reminderDay10Body}</div>
              <div className="reminder-btns">
                <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer"
                  style={{display:"block",padding:13,background:"linear-gradient(135deg,var(--green),var(--gdk))",color:"#fff",borderRadius:12,fontFamily:"'Barlow',sans-serif",fontSize:15,fontWeight:700,textDecoration:"none",textAlign:"center"}}
                  onClick={dismissReminder}>{t.subscribeBtn}</a>
                <button className="btn bg" onClick={dismissReminder}>{t.remindLater}</button>
              </div>
            </div>
          </div>
        )}

        <div className="ct">

          {/* ══ QUOTE TAB ══ */}
          {tab === "quote" && <>
            <div className="st">{t.priceJob}</div>
            <div className="ss">{t.fillDetails}</div>

            {/* Soft lock — view only */}
            {trial.softLock && (
              <div style={{background:"var(--yellow-lt)",border:"1px solid #FCD34D",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:13,color:"var(--yellow)",lineHeight:1.5}}>
                ⚠️ {t.softLockBody}
              </div>
            )}

            {!trial.softLock && <>
              {/* 1 — Job Type */}
              <div className="card">
                <div className="ct2">{t.jobType}</div>
                <div className="fi" style={{marginBottom:0}}><select value={selJob} onChange={e=>selectJob(e.target.value)}><option value="">{t.selectJob}</option>{jobs.map(j=><option key={j.id} value={String(j.id)}>{j.name}</option>)}</select></div>
              </div>

              {/* 2 — Crew & Wage */}
              <div className="card">
                <div className="ct2">{t.crewWage}</div>
                <div className="fi">
                  <label className="lb">{t.crewSize}</label>
                  <div className="tg">{[1,2,3,4,5,6,7,8,9,10].map(x=><button key={x} className={`tb ${profile.crewSize===String(x)?"on":""}`} style={{flex:"0 0 calc(20% - 6px)",minWidth:36}} onClick={()=>{ps("crewSize",String(x));setResult(null);}}>{x}</button>)}</div>
                </div>
                <div className="fi" style={{marginBottom:0}}>
                  <label className="lb">{t.laborRate}</label>
                  <div className="px"><span className="pxs">$</span><input type="number" min="0" value={profile.laborRate} onChange={e=>{ps("laborRate",e.target.value);setResult(null);}} placeholder="18.00"/></div>
                  <div className="ht">{t.perPerson}</div>
                </div>
              </div>

              {/* 3 — Job Details */}
              <div className="card">
                <div className="ct2">{t.jobDetails}</div>
                <div className="r2">
                  <div className="fi" style={{marginBottom:0}}><label className="lb">{t.hoursOnSite}</label><input type="number" min="0" step="0.5" value={hours} onChange={e=>{setHours(e.target.value);setResult(null);}} placeholder="2"/></div>
                  <div className="fi" style={{marginBottom:0}}><label className="lb">{t.materialsCost}</label><div className="px"><span className="pxs">$</span><input type="number" min="0" value={mats} onChange={e=>{setMats(e.target.value);setResult(null);}} placeholder="0"/></div></div>
                </div>
              </div>

              {/* 4 — Drive Distance */}
              <div className="card">
                <div className="ct2">{t.driveDistance}</div>
                <div className="tg" style={{marginBottom:11}}>
                  {[{k:"short",l:t.short},{k:"medium",l:t.medium},{k:"long",l:t.long}].map(d=>(
                    <button key={d.k} className={`tb ${tier===d.k?"on":""}`} onClick={()=>{setTier(d.k);setExactMi("");setResult(null);}}>{d.l}</button>
                  ))}
                </div>
                <div className="fi" style={{marginBottom:0}}>
                  <label className="lb" style={{fontSize:12}}>{t.exactMiles}</label>
                  <input type="number" min="0" value={exactMi} onChange={e=>{setExactMi(e.target.value);setResult(null);}} placeholder={`Default: ${TIER_ONE_WAY[tier]} mi one-way`}/>
                  <div className="ht">{t.exactHint}</div>
                </div>
              </div>

              {/* 5 — Vehicles */}
              <div className="card">
                <div className="ct2">{t.vehiclesOnJob}</div>
                <div className="tg">
                  {[1,2,3,4,5].map(x=><button key={x} className={`tb ${vehs===String(x)?"on":""}`} onClick={()=>{setVehs(String(x));setResult(null);}}>{x}</button>)}
                </div>
              </div>

              {/* 6 — Gas Price */}
              <div className="card">
                <div className="ct2">{t.gasPriceLabel}</div>
                <div className="gr">
                  <div className="px" style={{flex:1}}>
                    <span className="pxs">$</span>
                    <input type="number" step="0.01" min="0" value={useOver?gasOver:gasPrice} readOnly={!useOver} onChange={e=>setGasOver(e.target.value)} placeholder={gasStatus==="loading"?t.fetching:t.enterManual}/>
                  </div>
                  <span className={`gpill ${useOver?"man":""}`}>{useOver?t.manual:gasStatus==="loading"?"…":gasStatus==="live"?t.live:"—"}</span>
                  <button className="btn bsm bg" onClick={()=>{if(useOver){setUseOver(false);setGasOver("");}else{setUseOver(true);setGasOver(gasPrice);}}}>
                    {useOver?t.live:t.override}
                  </button>
                </div>
              </div>

              {/* Calculate */}
              <button className="btn bp" style={{opacity:canCalc?1:.45}} onClick={()=>doCalc()}>{t.calculate}</button>

              {/* Result */}
              {result && <>
                <div style={{height:16}}/>
                <div className="rc">
                  <div className="rl">{t.yourPrice}</div>
                  <div className="rp"><span style={{fontSize:28,verticalAlign:"top",marginTop:10,display:"inline-block",marginRight:2}}>$</span>{result.price}</div>
                  <div className="rrow">
                    <div className="ri"><div className="ri-l">{t.yourCost}</div><div className="ri-v">${Math.round(result.cost)}</div></div>
                    <div className="ri"><div className="ri-l">{t.yourProfit}</div><div className="ri-v">${Math.round(result.profit)}</div></div>
                  </div>
                  <div className="mpill" style={{background:mc.bg}}>
                    <div className="mdot" style={{background:mc.fg}}/>
                    <span style={{color:mc.fg}}>{roundPct(result.margin)}% {t.marginLabel} — {lang==="es"?mc.es:mc.en}</span>
                  </div>
                </div>

                <div className="card">
                  <div className="ct2">{t.adjustMargin}</div>
                  <div className="sl-pct">{roundPct(margin)}%</div>
                  <input type="range" min="1" max="99" step="0.5" value={margin} onChange={e=>onSlider(parseFloat(e.target.value))}/>
                  <div className="sl-ends"><span>1%</span><span>99%</span></div>
                  <div className="sl-hint">{t.slideHint}</div>
                </div>

                <div className="card">
                  <div className="ct2">{t.breakdown}</div>
                  <div className="bk"><span className="bk-l">⚒ {t.laborCost}</span><span className="bk-v">{$v(result.labor)}</span></div>
                  <div className="bk">
                    <span className="bk-l">⛽ {t.fuelCost} <span style={{fontSize:11,color:"var(--g400)",fontWeight:400,marginLeft:4}}>({result.rtMiles} mi RT ÷ 10 MPG)</span></span>
                    <span className="bk-v">{$v(result.fuel)}</span>
                  </div>
                  <div className="bk"><span className="bk-l">🪴 {t.matsLabel}</span><span className="bk-v">{$v(result.mats)}</span></div>
                  <div className="bk bk-tot"><span className="bk-l">{t.totalCost}</span><span className="bk-v">{$v(result.cost)}</span></div>
                </div>

                {!showAct
                  ? <button className="btn bg" onClick={()=>setShowAct(true)}>{t.donePrompt}</button>
                  : <div className="ac"><div className="ac-t">{t.whatsNext}</div>
                      <div className="ac-s">
                        <button className="btn bp" onClick={()=>setShowSave(true)}>{t.saveToLog}</button>
                        <button className="btn bg" onClick={()=>setShowAct(false)}>{t.keepEditing}</button>
                        <button className="btn bg" onClick={reset}>{t.newQuote}</button>
                      </div>
                    </div>
                }
              </>}
            </>}

            {/* Soft lock — show log link */}
            {trial.softLock && (
              <button className="btn bn mt8" onClick={()=>setTab("log")}>{t.viewLog}</button>
            )}
          </>}

          {/* ══ LOG TAB ══ */}
          {tab === "log" && <>
            <div className="st">{t.quoteLog}</div>
            <div className="ss">{log.length} saved</div>
            {log.length === 0
              ? <div className="empty"><div className="ei">📋</div><div>{t.noQuotes}</div></div>
              : log.map(q => {
                  const qm = marginMeta(q.margin);
                  return (
                    <div className="li" key={q.id}>
                      <div className="li-hdr">
                        <div><div className="li-name">{q.name}</div><div className="li-meta">{q.jobType} · {q.date}</div>
                          {q.industry && q.industry !== "landscaping" && <div style={{fontSize:11,color:"var(--g400)",marginTop:2}}>{INDUSTRY_TEMPLATES[q.industry]?.en.icon} {INDUSTRY_TEMPLATES[q.industry]?.en.name}</div>}
                        </div>
                        <div className="li-price">${q.price}</div>
                      </div>
                      <div className="li-pills">
                        <span className="pill" style={{background:qm.bg,color:qm.fg}}>{roundPct(q.margin)}% margin</span>
                        <span style={{fontSize:12,color:"var(--g400)"}}>${Math.round(q.profit)} profit</span>
                      </div>
                      {q.notes && <div className="li-notes">📝 {q.notes}</div>}
                    </div>
                  );
                })
            }
          </>}

          {/* ══ SETTINGS TAB ══ */}
          {tab === "settings" && <>
            {settView === "main" && <>
              <div className="st">{t.settings}</div>
              <div className="ss">{t.version}</div>

              {/* Trial bar */}
              {currentUser.accountType === "trial" && (
                <div className="trial-bar">
                  <div className="trial-top">
                    <span className="trial-l">{t.trialLabel}</span>
                    <span className="trial-d" style={{color: trial.daysLeft <= 3 ? "#FCA5A5" : "var(--green)"}}>{trial.daysLeft} {t.trialDaysRemaining}</span>
                  </div>
                  <div className="trial-track"><div className="trial-fill" style={{width:`${trial.pct}%`,background: trial.daysLeft <= 3 ? "#FCA5A5" : "var(--green)"}}/></div>
                  {trial.daysLeft <= 5 && (
                    <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer"
                      style={{display:"block",marginTop:12,padding:10,background:"var(--green)",color:"#fff",borderRadius:8,textAlign:"center",fontWeight:700,fontSize:14,textDecoration:"none"}}>
                      {t.subscribeBtn}
                    </a>
                  )}
                </div>
              )}

              {currentUser.accountType === "paid" && (
                <div style={{background:"var(--glt)",border:"1px solid #A7F3D0",borderRadius:10,padding:"12px 16px",marginBottom:12,fontSize:13,color:"var(--gdk)",fontWeight:600}}>
                  ✅ Active Subscriber
                </div>
              )}
              {currentUser.accountType === "free" && (
                <div style={{background:"var(--glt)",border:"1px solid #A7F3D0",borderRadius:10,padding:"12px 16px",marginBottom:12,fontSize:13,color:"var(--gdk)",fontWeight:600}}>
                  🎁 Free Access — Beta Member
                </div>
              )}

              <div className="card">
                <div className="sr" style={{cursor:"pointer"}} onClick={()=>setSettView("profile")}>
                  <span className="sr-l">{t.editProfile}</span><span className="sr-v">›</span>
                </div>
                <div className="sr" style={{cursor:"pointer"}} onClick={()=>setSettView("jobs")}>
                  <span className="sr-l">{t.manageJobs}</span><span className="sr-v">{jobs.length} types ›</span>
                </div>
                <div className="sr" style={{cursor:"pointer"}} onClick={()=>setSettView("industry")}>
                  <span className="sr-l">{lang==="es"?"Industria":"Industry"}</span>
                  <span className="sr-v">{INDUSTRY_TEMPLATES[industry]?.en.icon} {INDUSTRY_TEMPLATES[industry]?.[lang]?.name || INDUSTRY_TEMPLATES[industry]?.en.name} ›</span>
                </div>
                <div className="sr" style={{cursor:"default"}}>
                  <span className="sr-l">{t.language}</span>
                  <div className="tg" style={{width:"auto",gap:5}}>
                    <button className={`tb ${lang==="en"?"on":""}`} style={{padding:"5px 10px",flex:"none"}} onClick={()=>{setLang("en");LS.set("lb_lang","en");}}>EN</button>
                    <button className={`tb ${lang==="es"?"on":""}`} style={{padding:"5px 10px",flex:"none"}} onClick={()=>{setLang("es");LS.set("lb_lang","es");}}>ES</button>
                  </div>
                </div>
                <div className="sr" style={{cursor:"default"}}>
                  <span className="sr-l">{t.support}</span><span className="sr-v" style={{fontSize:12}}>{t.supportEmail}</span>
                </div>
                <div className="sr" style={{cursor:"default"}}>
                  <span className="sr-l" style={{color:"var(--g400)",fontSize:13}}>⚠️ {t.dataWarningShort}</span>
                  <span style={{fontSize:12,color:"var(--green)",cursor:"pointer",fontWeight:600}} onClick={()=>setShowDataWarn(true)}>Info</span>
                </div>
              </div>

              <button className="btn bg mt8" onClick={()=>setRoute("admin")} style={{fontSize:12,color:"var(--g400)"}}>Admin Portal</button>
              <button className="btn bg mt8" onClick={handleLogout} style={{color:"var(--red)",borderColor:"#FECACA"}}>{t.logout}</button>
            </>}

            {settView === "profile" && <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:17}}>
                <button className="btn bsm bg" onClick={()=>setSettView("main")}>← {t.back}</button>
                <div className="st" style={{margin:0}}>{t.editProfile}</div>
              </div>
              <div className="card">
                <div className="fi"><label className="lb">{t.laborRate}</label><div className="px"><span className="pxs">$</span><input type="number" min="0" value={profile.laborRate} onChange={e=>ps("laborRate",e.target.value)}/></div></div>
                <div className="fi"><label className="lb">{t.crewSize}</label><div className="tg">{[1,2,3,4,5,6,7,8,9,10].map(x=><button key={x} className={`tb ${profile.crewSize===String(x)?"on":""}`} style={{flex:"0 0 calc(20% - 6px)",minWidth:36}} onClick={()=>ps("crewSize",String(x))}>{x}</button>)}</div></div>
                <div className="fi"><label className="lb">{t.targetMargin}</label><div className="sx"><input type="number" min="1" max="99" value={profile.targetMargin} onChange={e=>ps("targetMargin",e.target.value)}/><span className="sxs">%</span></div></div>
                <div className="fi"><label className="lb">{t.zipCode}</label><input type="text" value={profile.zipCode} onChange={e=>ps("zipCode",e.target.value)} maxLength={5}/></div>
                <div className="fi"><label className="lb">{t.fuelType}</label><div className="tg"><button className={`tb ${profile.fuelType==="gas"?"on":""}`} onClick={()=>ps("fuelType","gas")}>⛽ {t.gas}</button><button className={`tb ${profile.fuelType==="diesel"?"on":""}`} onClick={()=>ps("fuelType","diesel")}>🛢 {t.diesel}</button></div></div>
                <div className="fi" style={{marginBottom:0}}><label className="lb">{t.vehicles}</label><div className="tg">{[1,2,3,4,5].map(x=><button key={x} className={`tb ${profile.vehicles===String(x)?"on":""}`} onClick={()=>ps("vehicles",String(x))}>{x}</button>)}</div></div>
              </div>
              <button className="btn bp" onClick={()=>setSettView("main")}>{t.saveProfile}</button>
            </>}

            {settView === "jobs" && <JobLibrary jobs={jobs} setJobs={setJobs} t={t} onBack={()=>setSettView("main")} backLabel={t.back}/>}

            {settView === "industry" && <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:17}}>
                <button className="btn bsm bg" onClick={()=>setSettView("main")}>← {t.back}</button>
                <div className="st" style={{margin:0}}>{lang==="es"?"Industria":"Industry"}</div>
              </div>
              <p style={{fontSize:13,color:"var(--g400)",marginBottom:20}}>{lang==="es"?"Cambia tu industria. Tu biblioteca de trabajos de cada industria se guarda por separado.":"Switch your industry. Each industry's job library is saved separately."}</p>
              <div style={{display:"flex",gap:10}}>
                {Object.entries(INDUSTRY_TEMPLATES).map(([key,tmpl])=>(
                  <button key={key}
                    style={{flex:1,padding:"18px 6px",background:industry===key?"var(--glt)":"var(--w)",border:`2px solid ${industry===key?"var(--green)":"var(--g200)"}`,borderRadius:"var(--rad)",cursor:"pointer",fontFamily:"'Barlow',sans-serif",transition:"all .15s",boxShadow:"var(--sh)"}}
                    onClick={()=>{setIndustry(key);LS.set("lb_industry",key);setSelJob("");setResult(null);setSettView("main");}}>
                    <div style={{fontSize:26,marginBottom:6}}>{tmpl.en.icon}</div>
                    <div style={{fontSize:12,fontWeight:700,color:"var(--navy)"}}>{tmpl[lang]?.name||tmpl.en.name}</div>
                  </button>
                ))}
              </div>
            </>}
          </>}
        </div>

        {/* Nav */}
        <div className="nav">
          <button className={`nb ${tab==="quote"?"on":""} ${trial.hardLock?"disabled":""}`} onClick={()=>!trial.hardLock&&setTab("quote")}><IcoCalc/>{t.nav_quote}</button>
          <button className={`nb ${tab==="log"?"on":""}`} onClick={()=>setTab("log")}><IcoList/>{t.nav_log}</button>
          <button className={`nb ${tab==="settings"?"on":""}`} onClick={()=>{setTab("settings");setSettView("main");}}><IcoGear/>{t.nav_settings}</button>
        </div>
      </div>

      {/* Save Modal */}
      {showSave && (
        <div className="ov" onClick={()=>setShowSave(false)}>
          <div className="mo" onClick={e=>e.stopPropagation()}>
            <div className="mo-t">💾 {t.saveQuote}</div>
            <div className="fi"><label className="lb">{t.jobLabel}</label><input type="text" value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder={t.jobPlaceholder} autoFocus/></div>
            <div className="fi" style={{marginBottom:0}}><label className="lb">{t.notes} <span style={{color:"var(--g400)",fontWeight:400}}>{t.notesOpt}</span></label><textarea rows={3} value={saveNotes} onChange={e=>setSaveNotes(e.target.value)} placeholder={t.notesPlaceholder}/></div>
            <div className="mo-b">
              <button className="btn bg" onClick={()=>{setShowSave(false);setSaveNotes("");}}>Cancel</button>
              <button className="btn bp" style={{opacity:saveName.trim()?1:.45}} onClick={saveQuote}>{t.save}</button>
            </div>
          </div>
        </div>
      )}

      {/* Data warning modal */}
      {showDataWarn && (
        <div className="ov" onClick={()=>setShowDataWarn(false)}>
          <div className="mo" onClick={e=>e.stopPropagation()}>
            <div className="mo-t">⚠️ {t.dataWarning}</div>
            <p style={{fontSize:14,color:"var(--g600)",lineHeight:1.6,marginBottom:20}}>{t.dataWarningBody}</p>
            <button className="btn bp" onClick={()=>setShowDataWarn(false)}>{t.understood}</button>
          </div>
        </div>
      )}
    </>
  );
}
