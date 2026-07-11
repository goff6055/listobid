import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const STRIPE_LINK        = "https://buy.stripe.com/5kQ3cx5GAdQp9VH0wFgw000";
const STRIPE_PORTAL_LINK = {STRIPE_PORTAL_LINK};
const TRIAL_DAYS       = 7;
const SOFT_LOCK_DAYS   = 5;
const ADMIN_PASSWORD   = "Ready2bid$";
const ADMIN_EMAIL      = "support@listobid.com";
const GOOGLE_API_KEY   = "AIzaSyBfC5MB_fkiL9c5XGORmZZDoPACfD9gzOk";
const SUPABASE_URL     = "https://ljtvktacmabgixjbsdii.supabase.co";
const SUPABASE_ANON    = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqdHZrdGFjbWFiZ2l4amJzZGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MDQwNDksImV4cCI6MjA5NDI4MDA0OX0.y7qIYZsAJGiPhIUGWvRj8_akHys71MPgScjpHZCEDvQ";

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── INDUSTRY TEMPLATES ───────────────────────────────────────────────────────
const INDUSTRY_TEMPLATES = {
  landscaping: {
    en: { name: "Landscaping", icon: "🌵" }, es: { name: "Jardinería", icon: "🌵" },
    jobs: {
      en: [
        { id: 1, name: "Weekly Maintenance", hours: 1.5, materials: 0 },
        { id: 2, name: "Full Cleanup",        hours: 3,   materials: 20 },
        { id: 4, name: "Irrigation Check",    hours: 1,   materials: 10 },
        { id: 5, name: "Tree Trimming",       hours: 2.5, materials: 0 },
      ],
      es: [
        { id: 1, name: "Mantenimiento Semanal", hours: 1.5, materials: 0 },
        { id: 2, name: "Limpieza Completa",      hours: 3,   materials: 20 },
        { id: 4, name: "Revisión de Irrigación", hours: 1,   materials: 10 },
        { id: 5, name: "Poda de Árboles",        hours: 2.5, materials: 0 },
      ],
    },
  },
  pool: {
    en: { name: "Pool Service", icon: "🏊" }, es: { name: "Servicio de Piscina", icon: "🏊" },
    jobs: {
      en: [
        { id: 1, name: "Weekly Chemical Service", hours: 1,   materials: 25 },
        { id: 2, name: "Filter Clean",             hours: 1.5, materials: 15 },
        { id: 3, name: "Equipment Check",          hours: 1,   materials: 0 },
        { id: 4, name: "Green Pool Recovery",      hours: 3,   materials: 60 },
        { id: 5, name: "Acid Wash",                hours: 4,   materials: 80 },
      ],
      es: [
        { id: 1, name: "Servicio Químico Semanal", hours: 1,   materials: 25 },
        { id: 2, name: "Limpieza de Filtro",        hours: 1.5, materials: 15 },
        { id: 3, name: "Revisión de Equipo",        hours: 1,   materials: 0 },
        { id: 4, name: "Recuperación de Piscina",   hours: 3,   materials: 60 },
        { id: 5, name: "Lavado con Ácido",          hours: 4,   materials: 80 },
      ],
    },
  },
  handyman: {
    en: { name: "Handyman", icon: "🔨" }, es: { name: "Mantenimiento", icon: "🔨" },
    jobs: {
      en: [
        { id: 1, name: "General Labor",    hours: 2, materials: 0 },
        { id: 2, name: "Repair Work",      hours: 3, materials: 30 },
        { id: 3, name: "Installation",     hours: 4, materials: 50 },
        { id: 4, name: "Painting",         hours: 5, materials: 40 },
        { id: 5, name: "Assembly / Setup", hours: 2, materials: 20 },
      ],
      es: [
        { id: 1, name: "Mano de Obra General", hours: 2, materials: 0 },
        { id: 2, name: "Trabajo de Reparación", hours: 3, materials: 30 },
        { id: 3, name: "Instalación",           hours: 4, materials: 50 },
        { id: 4, name: "Pintura",               hours: 5, materials: 40 },
        { id: 5, name: "Ensamblaje / Montaje",  hours: 2, materials: 20 },
      ],
    },
  },
};

// Helper to get jobs in correct language
const getJobs = (tmpl, lang) => (tmpl.jobs[lang] || tmpl.jobs.en).map(j => ({ ...j }));

const TIER_ONE_WAY = { short: 5, medium: 18, long: 35 };
const TRUCK_MPG    = 10;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const pf = (v, fb = 0) => { const n = parseFloat(v); return isNaN(n) ? fb : n; };
const pi = (v, fb = 1) => { const n = parseInt(v); return (isNaN(n) || n < 1) ? fb : n; };
const $v = (v) => `$${v.toFixed(2)}`;
const roundUp5 = (v) => Math.ceil(v / 5) * 5;
const roundPct = (v) => Math.round(v);

function calcQuote({ laborRate, crewSize, hours, materials, exactMiles, tier, vehicles, gasPrice, margin, marginMode, targetDollar, overheadMode, overheadPct, overheadFlat }) {
  // Note: fuel calc uses fixed 10 MPG for standard work truck
  const rate   = pf(laborRate, 0);
  const crew   = pi(crewSize, 1);
  const hrs    = pf(hours, 0);
  const labor  = rate * crew * hrs;
  const oneway = (exactMiles && pf(exactMiles) > 0) ? pf(exactMiles) : (TIER_ONE_WAY[tier] ?? 5);
  const rt     = oneway * 2;
  const fuel   = (rt / TRUCK_MPG) * pf(gasPrice, 0) * pi(vehicles, 1);
  const mats   = pf(materials, 0);
  const overhead = overheadMode === "pct" ? labor * (pf(overheadPct, 0) / 100)
                 : overheadMode === "flat" ? pf(overheadFlat, 0) : 0;
  const cost   = labor + fuel + mats + overhead;
  let price, profit, pct;
  if (marginMode === "dollar") {
    price  = roundUp5(cost + pf(targetDollar, 50));
    profit = price - cost;
    pct    = price > 0 ? (profit / price) * 100 : 0;
  } else {
    price  = roundUp5(cost / (1 - pf(margin, 40) / 100));
    profit = price - cost;
    pct    = price > 0 ? (profit / price) * 100 : 0;
  }
  return { labor, fuel, mats, overhead, cost, price, profit, margin: pct, rtMiles: rt };
}

function marginMeta(m) {
  if (m < 20) return { bg: "#FEE2E2", fg: "#DC2626", en: "Low Margin",  es: "Margen Bajo" };
  if (m < 40) return { bg: "#FEF9C3", fg: "#CA8A04", en: "OK Margin",   es: "Margen Regular" };
  return       { bg: "#DCFCE7", fg: "#16A34A", en: "Good Margin", es: "Margen Bueno" };
}

const LS = {
  get: (k, fb = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k)    => { try { localStorage.removeItem(k); } catch {} },
};

// ─── TRANSLATIONS ─────────────────────────────────────────────────────────────
const TX = {
  en: {
    tagline: "Ready to Bid.",
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
    dataWarning: "Important: Your Data",
    dataWarningBody: "ListoBid saves your data on this device. Use the same browser each time and avoid clearing Safari data to keep your quotes and settings.",
    understood: "I Agree",
    rememberMe: "Remember me on this device",
    privateWarn: "Tip: Use regular (non-private) browser to stay logged in.",
    trialBanner: "Free trial ends in", trialDaysLeft: "days",
    trialExpiredTitle: "Your free trial has ended",
    trialExpiredBody: "Subscribe to keep pricing jobs and tracking your profit.",
    subscribeNow: "Subscribe Now - $9.99/mo",
    softLockTitle: "Trial Ended",
    softLockBody: "You can view saved quotes but cannot create new ones.",
    softLockDays: "days until full lock",
    viewLog: "View My Quotes",
    reminderDay4Title: "3 days left in your trial",
    reminderDay4Body: "Your free trial ends in 3 days. Subscribe to keep full access.",
    reminderDay6Title: "Your trial ends tomorrow",
    reminderDay6Body: "Your free trial ends tomorrow. Subscribe to keep your quotes and pricing.",
    subscribeBtn: "Subscribe - $9.99/mo", remindLater: "Remind Me Later",
    chooseLanguage: "Choose your language",
    chooseIndustry: "What industry are you in?",
    industrySubtitle: "This sets up your job types",
    setup: "Profile Setup", step: "Step", of: "of",
    laborRate: "Hourly Labor Rate (per person)", laborHint: "Per crew member, per hour",
    crewSize: "Default Crew Size",
    targetMargin: "Target Profit Margin", marginHint: "We recommend 40% to start",
    marginMode: "Margin Mode", marginPct: "Percentage", marginDollar: "Dollar Amount",
    targetDollar: "Target Profit ($)",
    overheadLabel: "Overhead", overheadNone: "None", overheadPctLabel: "% of Labor", overheadFlatLabel: "Flat $",
    overheadHint: "Applied to labor cost only (industry standard)",
    zipCode: "Your Zip Code", zipHint: "Used for reference",
    vehicles: "Number of Vehicles",
    fuelType: "Fuel Type", gas: "Gasoline", diesel: "Diesel",
    saveProfile: "Save & Continue", back: "Back", continue: "Continue",
    jobLibrary: "Job Library", addJob: "+ Add Job Type",
    jobName2: "Job Type Name", defHours: "Default Hours", defMats: "Default Materials ($)",
    saveJob: "Save", editJob: "Edit", deleteJob: "Delete",
    preloaded: "Preloaded defaults - edit or add your own",
    priceJob: "Price Your Job",
    jobType: "Job Type", selectJob: "Select a job type...",
    crewWage: "Crew & Wage", perPerson: "per person / hr",
    jobDetails: "Job Details", hoursOnSite: "Hours on Site", materialsCost: "Materials Cost",
    driveDistance: "Drive Distance",
    short: "0–10 mi", medium: "11–25 mi", long: "25+ mi",
    exactMiles: "Exact one-way miles (optional)", exactHint: "Overrides the distance tier",
    vehiclesOnJob: "Vehicles on This Job",
    gasPriceLabel: "Fuel Price (per gallon)",
    enterManual: "e.g. 3.42",
    gasPump: "Price per gallon",
    calculate: "Calculate Price",
    yourPrice: "Recommended Price", yourCost: "Your Cost", yourProfit: "Your Profit",
    marginLabel: "Margin", breakdown: "Cost Breakdown",
    laborCost: "Labor", fuelCost: "Fuel", matsLabel: "Materials", overheadCost: "Overhead",
    totalCost: "Total Cost", rtMiles: "round trip",
    adjustMargin: "Adjust Margin", slideHint: "Drag to update price instantly",
    donePrompt: "Save or Continue", whatsNext: "What's next?",
    saveToLog: "Save to Log", keepEditing: "Keep Editing", newQuote: "New Quote",
    saveQuote: "Save Quote", jobLabel: "Job Name / Customer",
    jobPlaceholder: "e.g. Smith Residence - Weekly",
    addressLabel: "Address", addressOpt: "(optional)",
    notes: "Notes", notesOpt: "(optional)", notesPlaceholder: "e.g. Call before arrival.",
    cancel: "Cancel", save: "Save",
    quoteLog: "Quote History", noQuotes: "No saved quotes yet.",
    filterAll: "All", filterConverted: "Booked", filterPending: "Pending", filterDate: "By Date",
    markConverted: "Mark Booked", unmarkConverted: "Unmark Booked",
    editQuote: "Edit", deleteQuote: "Delete",
    settings: "Settings", version: "ListoBid",
    trialLabel: "Free Trial", trialDaysRemaining: "days remaining",
    language: "Language", editProfile: "Edit Default Inputs", manageJobs: "Job Library",
    industryLabel: "Industry",
    support: "Support", supportEmail: "support@listobid.com",
    legal: "Legal",
    legalTitle: "Legal Disclaimer",
    legalText: "ListoBid is a pricing estimation tool designed to help field service operators calculate job quotes. All prices, margins, and cost estimates generated by this app are for informational purposes only and do not constitute financial, legal, or professional advice. Actual job costs and profitability may vary based on factors outside this app's control, including but not limited to labor rates, material costs, fuel prices, local regulations, and market conditions. ListoBid makes no guarantees regarding the accuracy or completeness of any estimate generated. By using this app, you agree that ListoBid is not liable for any financial decisions made based on app-generated quotes. Users are solely responsible for their own pricing decisions and business outcomes.",

    nav_quote: "Quote", nav_log: "Log", nav_settings: "Settings",
  },
  es: {
    tagline: "Listo para Ofertar.",
    welcome: "Bienvenido a ListoBid", welcomeSub: "Conoce tu precio. Conoce tu ganancia.",
    register: "Crear Cuenta", login: "Iniciar Sesión", logout: "Cerrar Sesión",
    firstName: "Nombre", email: "Correo Electrónico", password: "Contraseña",
    confirmPass: "Confirmar Contraseña", forgotPass: "¿Olvidaste tu contraseña?",
    resetPass: "Restablecer Contraseña", resetSent: "Revisa tu correo para el enlace.",
    noAccount: "¿No tienes cuenta?", hasAccount: "¿Ya tienes cuenta?",
    signUp: "Registrarse Gratis", signIn: "Iniciar Sesión",
    passMin: "La contraseña debe tener al menos 8 caracteres",
    passMismatch: "Las contraseñas no coinciden",
    emailInvalid: "Ingresa un correo válido",
    emailTaken: "Ya existe una cuenta con este correo",
    invalidCreds: "Correo o contraseña incorrectos",
    dataWarning: "Importante: Tus Datos",
    dataWarningBody: "ListoBid guarda tus datos en este dispositivo. Usa siempre el mismo navegador y evita borrar los datos de Safari.",
    understood: "De Acuerdo",
    rememberMe: "Recordarme en este dispositivo",
    privateWarn: "Consejo: Usa el navegador normal (no privado) para mantener la sesión.",
    trialBanner: "Prueba gratis termina en", trialDaysLeft: "días",
    trialExpiredTitle: "Tu prueba gratuita ha terminado",
    trialExpiredBody: "Suscríbete para seguir cotizando trabajos.",
    subscribeNow: "Suscribirse - $9.99/mes",
    softLockTitle: "Prueba Terminada",
    softLockBody: "Puedes ver cotizaciones guardadas pero no crear nuevas.",
    softLockDays: "días hasta bloqueo total",
    viewLog: "Ver Mis Cotizaciones",
    reminderDay4Title: "3 días restantes en tu prueba",
    reminderDay4Body: "Tu prueba gratis termina en 3 días. Suscríbete para mantener acceso.",
    reminderDay6Title: "Tu prueba termina mañana",
    reminderDay6Body: "Tu prueba gratis termina mañana. Suscríbete para conservar tus cotizaciones.",
    subscribeBtn: "Suscribirse - $9.99/mes", remindLater: "Recordarme Después",
    chooseLanguage: "Elige tu idioma",
    chooseIndustry: "¿En qué industria trabajas?",
    industrySubtitle: "Esto configura tus tipos de trabajo",
    setup: "Configuración", step: "Paso", of: "de",
    laborRate: "Tarifa por Hora (por persona)", laborHint: "Por trabajador, por hora",
    crewSize: "Tamaño del Equipo",
    targetMargin: "Margen de Ganancia", marginHint: "Recomendamos 40% para empezar",
    marginMode: "Modo de Margen", marginPct: "Porcentaje", marginDollar: "Monto en Dólares",
    targetDollar: "Ganancia Deseada ($)",
    overheadLabel: "Gastos Generales", overheadNone: "Ninguno", overheadPctLabel: "% de Mano de Obra", overheadFlatLabel: "Fijo $",
    overheadHint: "Se aplica solo al costo de mano de obra",
    zipCode: "Código Postal", zipHint: "Para referencia",
    vehicles: "Número de Vehículos",
    fuelType: "Combustible", gas: "Gasolina", diesel: "Diésel",
    saveProfile: "Guardar y Continuar", back: "Atrás", continue: "Continuar",
    jobLibrary: "Tipos de Trabajo", addJob: "+ Agregar Tipo",
    jobName2: "Nombre del Tipo", defHours: "Horas por Defecto", defMats: "Materiales ($)",
    saveJob: "Guardar", editJob: "Editar", deleteJob: "Eliminar",
    preloaded: "Tipos precargados - edita o agrega los tuyos",
    priceJob: "Cotizar Tu Trabajo",
    jobType: "Tipo de Trabajo", selectJob: "Selecciona un tipo...",
    crewWage: "Equipo y Salario", perPerson: "por persona / hr",
    jobDetails: "Detalles del Trabajo", hoursOnSite: "Horas en Sitio", materialsCost: "Materiales",
    driveDistance: "Distancia",
    short: "0–10 mi", medium: "11–25 mi", long: "25+ mi",
    exactMiles: "Millas exactas (opcional)", exactHint: "Reemplaza el rango seleccionado",
    vehiclesOnJob: "Vehículos en Este Trabajo",
    gasPriceLabel: "Precio de Combustible (por galón)",
    enterManual: "ej. 3.42",
    gasPump: "Precio por galón",
    calculate: "Calcular Precio",
    yourPrice: "Precio Recomendado", yourCost: "Tu Costo", yourProfit: "Tu Ganancia",
    marginLabel: "Margen", breakdown: "Desglose de Costos",
    laborCost: "Mano de Obra", fuelCost: "Combustible", matsLabel: "Materiales", overheadCost: "Gastos Gen.",
    totalCost: "Costo Total", rtMiles: "ida y vuelta",
    adjustMargin: "Ajustar Margen", slideHint: "Desliza para actualizar el precio",
    donePrompt: "Guardar o Continuar", whatsNext: "¿Qué sigue?",
    saveToLog: "Guardar", keepEditing: "Seguir Editando", newQuote: "Nueva Cotización",
    saveQuote: "Guardar Cotización", jobLabel: "Trabajo / Cliente",
    jobPlaceholder: "ej. Casa García - Mantenimiento",
    addressLabel: "Dirección", addressOpt: "(opcional)",
    notes: "Notas", notesOpt: "(opcional)", notesPlaceholder: "ej. Llamar antes de llegar.",
    cancel: "Cancelar", save: "Guardar",
    quoteLog: "Historial", noQuotes: "No hay cotizaciones guardadas.",
    filterAll: "Todo", filterConverted: "Confirmado", filterPending: "Pendiente", filterDate: "Por Fecha",
    markConverted: "Confirmado", unmarkConverted: "Desmarcar Confirmado",
    editQuote: "Editar", deleteQuote: "Eliminar",
    settings: "Ajustes", version: "ListoBid",
    trialLabel: "Prueba Gratis", trialDaysRemaining: "días restantes",
    language: "Idioma", editProfile: "Editar Mis Datos", manageJobs: "Tipos de Trabajo",
    industryLabel: "Industria",
    support: "Soporte", supportEmail: "support@listobid.com",
    legal: "Legal",
    legalTitle: "Aviso Legal",
    legalText: "ListoBid es una herramienta de estimación de precios diseñada para ayudar a operadores de servicios a calcular cotizaciones de trabajos. Todos los precios, márgenes y estimaciones de costos generados por esta aplicación son únicamente para fines informativos y no constituyen asesoramiento financiero, legal o profesional. Los costos reales y la rentabilidad pueden variar según factores fuera del control de esta aplicación, incluyendo pero no limitado a tarifas laborales, costos de materiales, precios de combustible, regulaciones locales y condiciones del mercado. ListoBid no garantiza la exactitud o integridad de ninguna estimación generada. Al usar esta aplicación, usted acepta que ListoBid no es responsable de ninguna decisión financiera tomada con base en las cotizaciones generadas. Los usuarios son los únicos responsables de sus decisiones de precios y resultados comerciales.",

    nav_quote: "Cotizar", nav_log: "Historial", nav_settings: "Ajustes",
  }
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#1C2B3A;--green:#3DC43C;--gdk:#2aa62a;--glt:#f0fdf0;
  --w:#fff;--g50:#f8fafc;--g100:#f1f5f9;--g200:#e2e8f0;--g400:#94a3b8;--g600:#475569;--g800:#1e293b;
  --red:#DC2626;--rlt:#FEE2E2;--yellow:#CA8A04;--ylt:#FEF9C3;
  --rad:14px;--rsm:8px;--sh:0 2px 10px rgba(0,0,0,.07);
}
body{font-family:'Plus Jakarta Sans',sans-serif;background:var(--g100);color:var(--g800);-webkit-font-smoothing:antialiased}
.app{max-width:430px;margin:0 auto;min-height:100dvh;background:var(--w);display:flex;flex-direction:column}
.hdr{background:var(--navy);padding:13px 17px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
.hdr-logo{display:flex;align-items:center;gap:9px}
.lm{display:flex;align-items:center;flex-shrink:0}
.lm svg{height:28px;width:auto}
.lt{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:20px;color:#fff;letter-spacing:.4px}
.lt span{color:var(--green)}
.hdr-user{font-size:12px;color:rgba(255,255,255,.6);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav{display:flex;background:var(--w);border-top:1px solid var(--g200);position:sticky;bottom:0;z-index:50}
.nb{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 0 11px;background:none;border:none;cursor:pointer;color:var(--g400);font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;font-weight:600;transition:color .15s}
.nb.on{color:var(--green)}.nb svg{width:20px;height:20px}
.ct{flex:1;overflow-y:auto;padding:18px 18px 28px;-webkit-overflow-scrolling:touch}
.st{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:23px;color:var(--navy);margin-bottom:3px}
.ss{font-size:13px;color:var(--g400);margin-bottom:17px}
.card{background:var(--w);border:1px solid var(--g200);border-radius:var(--rad);padding:15px;margin-bottom:11px;box-shadow:var(--sh)}
.ct2{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:13px;letter-spacing:.2px;text-transform:none;color:#2A3F54;margin-bottom:12px}
.fi{margin-bottom:13px}.fi:last-child{margin-bottom:0}
.lb{display:block;font-size:13px;font-weight:600;color:var(--g600);margin-bottom:5px}
.ht{font-size:11px;color:var(--g400);margin-top:3px}
input[type=number],input[type=text],input[type=email],input[type=password],select,textarea{width:100%;padding:10px 12px;border:1.5px solid var(--g200);border-radius:var(--rsm);font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;color:var(--g800);background:var(--g50);outline:none;transition:border-color .15s;-webkit-appearance:none}
input:focus,select:focus,textarea:focus{border-color:var(--green);background:#fff}
textarea{resize:vertical;line-height:1.5}
select{cursor:pointer}
.px{display:flex;align-items:center;border:1.5px solid var(--g200);border-radius:var(--rsm);background:var(--g50);overflow:hidden;transition:border-color .15s}
.px:focus-within{border-color:var(--green);background:#fff}
.pxs{padding:10px 7px 10px 12px;color:var(--g400);font-size:15px;font-weight:600;flex-shrink:0}
.px input{border:none;background:transparent;padding:10px 12px 10px 3px;flex:1;min-width:0}
.px input:focus{background:transparent}
.sx{display:flex;align-items:center;border:1.5px solid var(--g200);border-radius:var(--rsm);background:var(--g50);overflow:hidden;transition:border-color .15s}
.sx:focus-within{border-color:var(--green);background:#fff}
.sxs{padding:10px 12px 10px 7px;color:var(--g400);font-size:15px;font-weight:600;flex-shrink:0}
.sx input{border:none;background:transparent;padding:10px 3px 10px 12px;flex:1;min-width:0}
.sx input:focus{background:transparent}
.btn{width:100%;padding:13px;border-radius:var(--rad);font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;font-weight:700;border:none;cursor:pointer;transition:transform .1s;letter-spacing:.2px}
.btn:active{transform:scale(.98)}
.bp{background:linear-gradient(135deg,var(--green),var(--gdk));color:#fff;box-shadow:0 4px 14px rgba(61,196,60,.3)}
.bn{background:var(--navy);color:#fff}
.bg{background:none;border:1.5px solid var(--g200);color:var(--g600)}
.bd{background:var(--rlt);color:var(--red);border:1.5px solid #FECACA}
.bsm{padding:7px 11px;font-size:12px;width:auto;border-radius:var(--rsm)}
.mt8{margin-top:8px}
.r2{display:flex;gap:10px}.r2 .fi{flex:1;min-width:0}
.tg{display:flex;gap:6px;flex-wrap:wrap}
.tb{flex:1;padding:9px 5px;border-radius:var(--rsm);border:1.5px solid var(--g200);background:var(--g50);font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:600;color:var(--g600);cursor:pointer;transition:all .15s;text-align:center;white-space:nowrap;min-width:0}
.tb.on{border-color:var(--green);background:var(--glt);color:var(--gdk)}
.steps{display:flex;gap:5px;margin-bottom:20px}
.sd{flex:1;height:4px;border-radius:2px;background:var(--g200);transition:background .2s}
.sd.done{background:var(--green)}.sd.active{background:var(--green);opacity:.5}
.rc{background:var(--navy);border-radius:var(--rad);padding:20px 17px 17px;margin-bottom:11px;position:relative;overflow:hidden}
.rc::after{content:'';position:absolute;top:-20px;right:-20px;width:90px;height:90px;background:rgba(61,196,60,.1);border-radius:50%}
.rl{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.42);margin-bottom:5px}
.rp{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:52px;color:#fff;line-height:1;letter-spacing:-1px;display:flex;align-items:flex-start;gap:3px}
.rp-dollar{font-size:26px;margin-top:6px;font-weight:800}
.rrow{display:flex;gap:14px;margin-top:13px}
.ri{flex:1}
.ri-l{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.38);margin-bottom:2px}
.ri-v{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:19px;color:#fff}
.mpill{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-top:11px}
.mdot{width:7px;height:7px;border-radius:50%}
.bk{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--g100);font-size:14px}
.bk:last-child{border-bottom:none}
.bk-l{color:var(--g600);font-weight:500;flex:1;min-width:0;margin-right:8px}
.bk-v{font-weight:700;color:var(--g800);flex-shrink:0}
.bk-tot{border-top:2px solid var(--g200)!important;margin-top:3px;padding-top:11px!important}
.bk-tot .bk-l{font-weight:700;color:var(--g800)}
.sl-pct{text-align:center;font-family:'Plus Jakarta Sans',sans-serif;font-size:30px;font-weight:800;color:var(--navy);margin-bottom:2px}
input[type=range]{-webkit-appearance:none;width:100%;height:6px;border-radius:3px;background:var(--g200);outline:none;margin:10px 0}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--green);cursor:pointer;box-shadow:0 2px 8px rgba(61,196,60,.4);border:3px solid #fff}
.sl-ends{display:flex;justify-content:space-between;font-size:11px;color:var(--g400);font-weight:600}
.sl-hint{text-align:center;font-size:12px;color:var(--g400);margin-top:3px}
.ac{background:var(--g50);border:1px solid var(--g200);border-radius:var(--rad);padding:15px;margin-bottom:11px}
.ac-t{font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--g400);margin-bottom:11px}
.ac-s{display:flex;flex-direction:column;gap:8px}
.li{border-radius:var(--rsm);padding:12px 14px;margin-bottom:8px}
.li-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px}
.li-name{font-size:15px;font-weight:700;color:var(--navy)}
.li-price{font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;color:var(--gdk);flex-shrink:0;margin-left:8px}
.li-meta{font-size:12px;color:var(--g400);margin-bottom:6px}
.li-pills{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.pill{font-size:12px;padding:3px 8px;border-radius:4px;font-weight:700}
.li-notes{margin-top:8px;font-size:12px;color:var(--g600);background:var(--g100);border-radius:6px;padding:7px 10px;line-height:1.5;border-left:3px solid var(--green)}
.sr{display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-bottom:1px solid var(--g100)}
.sr:last-child{border-bottom:none}
.sr-l{font-size:15px;font-weight:600;color:var(--g800)}
.sr-v{font-size:13px;color:var(--g400)}
.trial-bar{background:linear-gradient(135deg,var(--navy),#243a52);border-radius:var(--rad);padding:15px 17px;margin-bottom:11px;color:#fff}
.trial-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}
.trial-l{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.42)}
.trial-d{font-family:'Plus Jakarta Sans',sans-serif;font-size:28px;font-weight:800}
.trial-track{height:5px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden}
.trial-fill{height:100%;border-radius:3px}
.ji{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;background:var(--g50);border:1px solid var(--g200);border-radius:var(--rsm);margin-bottom:7px}
.ji-info{flex:1;min-width:0;margin-right:8px}
.ji-name{font-size:14px;font-weight:700;color:var(--g800);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ji-meta{font-size:12px;color:var(--g400)}
.ji-act{display:flex;gap:5px;flex-shrink:0}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.mo{background:#fff;border-radius:20px 20px 0 0;padding:24px 20px 40px;width:100%;max-width:430px;box-shadow:0 -8px 40px rgba(0,0,0,.15);max-height:90dvh;overflow-y:auto}
.mo-t{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:21px;color:var(--navy);margin-bottom:17px}
.mo-b{display:flex;gap:9px;margin-top:17px}
.auth{min-height:100dvh;background:var(--navy);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px}
.auth-box{background:#fff;border-radius:20px;padding:28px 24px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.25);max-height:90dvh;overflow-y:auto}
.auth-logo{display:flex;align-items:center;justify-content:center;margin-bottom:20px}
.auth-title{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:26px;color:var(--navy);margin-bottom:4px;text-align:center}
.auth-sub{font-size:13px;color:var(--g400);margin-bottom:20px;text-align:center}
.auth-link{font-size:13px;color:var(--gdk);font-weight:600;cursor:pointer;text-align:center;margin-top:12px}
.auth-err{font-size:13px;color:var(--red);text-align:center;margin-top:8px;padding:8px;background:var(--rlt);border-radius:6px}
.wlc{min-height:100dvh;background:var(--navy);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 28px;text-align:center}
.wm{display:flex;align-items:center;justify-content:center;margin-bottom:20px}
.wt{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:38px;color:#fff;margin-bottom:6px}
.wt span{color:var(--green)}
.wsub{font-size:15px;color:rgba(255,255,255,.45);margin-bottom:42px}
.ls{display:flex;flex-direction:column;gap:10px;width:100%;max-width:260px}
.lbtn{padding:15px;border-radius:var(--rad);font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:700;cursor:pointer;border:none;transition:transform .1s}
.lbtn:active{transform:scale(.97)}
.len{background:var(--green);color:#fff}
.les{background:rgba(255,255,255,.08);color:#fff;border:1.5px solid rgba(255,255,255,.15)}
.reminder-ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;display:flex;align-items:center;justify-content:center;padding:24px}
.reminder-box{background:#fff;border-radius:18px;padding:28px 24px;width:100%;max-width:360px;text-align:center}
.soft-banner{background:linear-gradient(135deg,#B45309,#92400E);padding:12px 17px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.soft-banner-text{font-size:12px;color:#FEF3C7;font-weight:600;flex:1;line-height:1.4}
.soft-banner-btn{background:#FEF3C7;color:#92400E;border:none;border-radius:6px;padding:6px 10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}
.empty{text-align:center;padding:48px 20px;color:var(--g400)}
.addr-wrap{position:relative}
.addr-suggestions{position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid var(--g200);border-radius:var(--rsm);box-shadow:0 4px 20px rgba(0,0,0,.12);z-index:999;max-height:180px;overflow-y:auto}
.addr-item{padding:10px 14px;font-size:13px;color:var(--g800);cursor:pointer;border-bottom:1px solid var(--g100)}
.addr-item:last-child{border-bottom:none}
.addr-item:hover{background:var(--g50)}
@keyframes countUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes tabFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes beamMove{0%{transform:translateX(-200%) rotate(25deg)}100%{transform:translateX(400%) rotate(25deg)}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(61,196,60,.35)}60%{box-shadow:0 0 0 10px rgba(61,196,60,0)}}
@keyframes shine{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes ripple{0%{transform:scale(0);opacity:.5}100%{transform:scale(4);opacity:0}}
.tab-fade{animation:tabFade .18s ease-out both}
.pulse-btn{animation:pulse 2s ease-in-out infinite}
.shiny-text{background:linear-gradient(90deg,rgba(255,255,255,.5) 0%,#fff 40%,rgba(61,196,60,1) 50%,#fff 60%,rgba(255,255,255,.5) 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shine 3s linear infinite}
`;

// ─── ICONS ────────────────────────────────────────────────────────────────────
// ListoBid logo SVG recreated from brand asset
// ─── COUNT UP HOOK ───────────────────────────────────────────────────────────
function useCountUp(target, duration=900, active=true) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active || !target) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(timer); }
      else setVal(Math.round(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, active]);
  return active ? val : target;
}

// ─── ANIMATED NUMBER ─────────────────────────────────────────────────────────
function AnimatedNumber({ value, duration=900 }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const target = Math.round(Number(value) || 0);
    const startVal = display;
    if (startVal === target) return;
    const startTime = performance.now();
    const tick = (now) => {
      const p = Math.min((now - startTime) / duration, 1);
      const ease = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;
      setDisplay(Math.round(startVal + (target - startVal) * ease));
      if (p < 1) { raf.current = requestAnimationFrame(tick); }
      else { setDisplay(target); }
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration]);
  return <>{(Math.round(Number(display) || 0)).toLocaleString()}</>;
}

// ─── FACEBOOK ICON ───────────────────────────────────────────────────────────
const IcoFacebook = ({ size = 20, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
);

// ─── INSTAGRAM ICON ──────────────────────────────────────────────────────────
const IcoInstagram = ({ size = 20, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
    <circle cx="12" cy="12" r="4"/>
    <circle cx="17.5" cy="6.5" r="1" fill={color} stroke="none"/>
  </svg>
);

// ─── LOGO COMPONENTS ─────────────────────────────────────────────────────────
// LogoImg: actual PNG - used on white backgrounds (auth screens)
const LogoImg = ({ width = 140 }) => (
  <img src="/logo.PNG" alt="ListoBid"
    style={{width, height:"auto", maxWidth:"100%", display:"block", objectFit:"contain"}} />
);

// LogoText: text wordmark - used on dark navy backgrounds (header, welcome)
const LogoText = ({ size = 22 }) => (
  <div style={{display:"flex",alignItems:"baseline",gap:0,lineHeight:1}}>
    <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:size,color:"#ffffff",letterSpacing:-0.3}}>Listo</span>
    <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:size,color:"#3DC43C",letterSpacing:-0.3}}>Bid</span>
  </div>
);

// Component aliases
const LogoMark     = () => <LogoText size={20}/>;
const LogoWordmark = ({ dark = false }) => dark ? <LogoImg width={160}/> : <LogoText size={22}/>;
const LogoCompact  = ({ size = 64 }) => <LogoImg width={size}/>;

// ─── ICONS ────────────────────────────────────────────────────────────────────
// ListoBid logo SVG recreated from brand asset
// Auth screens (white bg) - use actual PNG
const IcoCalc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/></svg>;
const IcoList = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
const IcoGear = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;

// ─── ADDRESS AUTOCOMPLETE ─────────────────────────────────────────────────────
function AddressInput({ value, onChange, placeholder = "123 Main St, Phoenix AZ" }) {
  const inputRef = useRef(null);
  const autoRef  = useRef(null);

  useEffect(() => {
    if (!inputRef.current) return;
    const loadScript = () => {
      if (window.google && window.google.maps && window.google.maps.places) {
        initAutocomplete();
        return;
      }
      if (document.getElementById("gmap-script")) return;
      const script = document.createElement("script");
      script.id = "gmap-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places`;
      script.async = true;
      script.onload = initAutocomplete;
      document.head.appendChild(script);
    };
    const initAutocomplete = () => {
      if (!window.google || !inputRef.current) return;
      autoRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "us" },
      });
      autoRef.current.addListener("place_changed", () => {
        const place = autoRef.current.getPlace();
        if (place && place.formatted_address) onChange(place.formatted_address);
      });
    };
    loadScript();
    return () => { if (autoRef.current) window.google?.maps?.event?.clearInstanceListeners(autoRef.current); };
  }, []);

  return (
    <div className="addr-wrap">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{width:"100%",padding:"10px 12px",border:"1.5px solid var(--g200)",borderRadius:"var(--rsm)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15,color:"var(--g800)",background:"var(--g50)",outline:"none"}}
        onFocus={e=>{e.target.style.borderColor="var(--green)";e.target.style.background="#fff";}}
        onBlur={e=>{e.target.style.borderColor="var(--g200)";e.target.style.background="var(--g50)";}}
      />
    </div>
  );
}

// ─── JOB MODAL ────────────────────────────────────────────────────────────────
function JobModal({ job, onSave, onClose, t }) {
  const [form, setForm] = useState(job ? { name: job.name, hours: String(job.hours), materials: String(job.materials) } : { name: "", hours: "", materials: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const ok = form.name.trim().length > 0;
  return (
    <div className="ov" onClick={onClose}>
      <div className="mo" onClick={e => e.stopPropagation()}>
        <div className="mo-t">{job ? t.editJob : t.addJob}</div>
        <div className="fi"><label className="lb">{t.jobName2}</label><input type="text" value={form.name} onChange={e => set("name", e.target.value)} autoFocus /></div>
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

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function AdminDashboard({ onClose }) {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass]     = useState("");
  const [err, setErr]       = useState(false);
  const [tab, setTab]       = useState("overview");
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Load all users from Supabase (using anon key - only works because we query profiles which has open select for now)
  // In production this would use a service role key via edge function
  useEffect(() => {
    if (!authed) return;
    setLoadingUsers(true);
    sb.from("profiles").select("*").order("signup_date", { ascending: false }).then(async ({ data }) => {
      if (data) {
        const { data: qData } = await sb.from("quotes").select("user_id");
        const countMap = {};
        (qData || []).forEach(q => { countMap[q.user_id] = (countMap[q.user_id] || 0) + 1; });
        setUsers(data.map(p => ({
          email: p.email,
          firstName: p.first_name,
          industry: p.industry,
          accountType: p.account_type,
          signupDate: p.signup_date,
          quotesGenerated: p.quotes_generated || 0,
          savedQuotes: countMap[p.id] || 0,
          id: p.id,
        })));
      }
      setLoadingUsers(false);
    });
  }, [authed]);

  const totalMRR = users.filter(u => u.accountType === "paid").length * 9.99;
  const totalQ   = users.reduce((s, u) => s + (u.quotesGenerated || 0), 0);

  const getStatus = (u) => {
    if (u.accountType === "paid")  return "paid";
    if (u.accountType === "trial") return "trial";
    return "free";
  };

  const updateUser = async (email, updates) => {
    const next = users.map(u => u.email === email ? { ...u, ...updates } : u);
    setUsers(next);
    const user = users.find(u => u.email === email);
    if (user?.id) {
      const dbUpdates = {};
      if (updates.accountType) dbUpdates.account_type = updates.accountType;
      await sb.from("profiles").update(dbUpdates).eq("id", user.id);
    }
  };

  const deleteUser = async (email) => {
    if (!window.confirm("Delete this user? Cannot be undone.")) return;
    const user = users.find(u => u.email === email);
    const next = users.filter(u => u.email !== email);
    setUsers(next);
    if (user?.id) {
      await sb.from("quotes").delete().eq("user_id", user.id);
      await sb.from("profiles").delete().eq("id", user.id);
    }
  };

  const statusStyle = { trial: { bg: "#EFF6FF", color: "#2563EB" }, free: { bg: "#DCFCE7", color: "#16A34A" }, paid: { bg: "#DCFCE7", color: "#16A34A" }, expired: { bg: "#FEF9C3", color: "#CA8A04" }, locked: { bg: "#FEE2E2", color: "#DC2626" } };

  if (!authed) return (
    <div className="auth">
      <div className="auth-box">
        <div className="auth-logo"><LogoImg width={160}/></div>
        <div className="auth-title">Admin Portal</div>
        <div className="auth-sub">Restricted access</div>
        <div className="fi"><label className="lb">Password</label><input type="password" value={pass} onChange={e => { setPass(e.target.value); setErr(false); }} onKeyDown={e => e.key === "Enter" && (pass === ADMIN_PASSWORD ? (setAuthed(true), setErr(false)) : setErr(true))} autoFocus /></div>
        {err && <div className="auth-err">Incorrect password</div>}
        <button className="btn bp mt8" onClick={() => pass === ADMIN_PASSWORD ? (setAuthed(true), setErr(false)) : setErr(true)}>Sign In</button>
        <button className="btn bg mt8" onClick={onClose}>← Back to App</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100dvh", background: "var(--g100)", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ background: "var(--navy)", padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogoWordmark/>
          <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(61,196,60,.2)", color: "var(--green)", padding: "3px 10px", borderRadius: 20 }}>ADMIN</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn bsm bg" style={{ color: "rgba(255,255,255,.6)", borderColor: "rgba(255,255,255,.2)" }} onClick={onClose}>← App</button>
          <button className="btn bsm bg" style={{ color: "rgba(255,255,255,.6)", borderColor: "rgba(255,255,255,.2)" }} onClick={() => setAuthed(false)}>Sign Out</button>
        </div>
      </div>
      <div style={{ background: "#fff", borderBottom: "1px solid var(--g200)", padding: "0 20px", display: "flex" }}>
        {["overview", "users"].map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600, color: tab === tb ? "var(--navy)" : "var(--g400)", background: "none", border: "none", borderBottom: `2px solid ${tab === tb ? "var(--green)" : "transparent"}`, marginBottom: -1, cursor: "pointer", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            {tb.charAt(0).toUpperCase() + tb.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
            {[
              { label: "Net Revenue / Mo", val: `$${Math.max(0, totalMRR * 0.971 - users.filter(u=>u.accountType==="paid").length * 0.30).toFixed(2)}`, sub: "after Stripe fees", green: true },
              { label: "Active Trials",   val: users.filter(u=>getStatus(u)==="trial").length, sub: "Converting soon" },
              { label: "Free Accounts",   val: users.filter(u=>u.accountType==="free").length, sub: "Beta / Legacy" },
              { label: "Total Users",     val: users.length, sub: "All time" },
              { label: "Quotes Generated", val: totalQ, sub: "Across all users" },
            ].map(s => (
              <div key={s.label} style={{ background: "#fff", border: "1px solid var(--g200)", borderRadius: 12, padding: "15px 16px", boxShadow: "var(--sh)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase", color: "var(--g400)", marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 30, color: s.green ? "var(--gdk)" : "var(--navy)", lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 12, color: "var(--g400)", marginTop: 3 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        )}
        {tab === "users" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: "var(--navy)" }}>All Users</span>
              <span style={{ fontSize: 13, color: "var(--g400)" }}>{users.length} total</span>
            </div>
            {loadingUsers
              ? <div className="empty">Loading users...</div>
              : users.length === 0
              ? <div className="empty">No registered users yet</div>
              : users.map(u => {
                  const s = getStatus(u);
                  const ss = statusStyle[s] || statusStyle.trial;
                  return (
                    <div key={u.email} style={{ background: "#fff", border: "1px solid var(--g200)", borderRadius: 10, padding: "14px 16px", marginBottom: 10, boxShadow: "var(--sh)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--navy)" }}>{u.firstName}</div>
                          <div style={{ fontSize: 12, color: "var(--g400)" }}>{u.email}</div>
                          <div style={{ fontSize: 12, color: "var(--g600)", marginTop: 2, textTransform: "capitalize" }}>{u.industry || "-"}</div>
                          <div style={{ fontSize: 12, color: "var(--g600)", marginTop: 1 }}>Calculated: {u.quotesGenerated || 0} &nbsp;·&nbsp; Saved: {u.savedQuotes || 0}</div>
                          <div style={{ fontSize: 11, color: "var(--g400)" }}>Joined {new Date(u.signupDate).toLocaleDateString()}</div>
                        </div>
                        <span style={{ background: ss.bg, color: ss.color, padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.toUpperCase()}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="btn bsm" style={{ background: u.accountType==="free"?"var(--g200)":"var(--glt)", color:"var(--gdk)", border:"1.5px solid var(--g200)", opacity: u.accountType==="free"?.5:1 }} onClick={() => updateUser(u.email, { accountType: "free" })}>Mark Free</button>
                        <button className="btn bsm bp" style={{ opacity: u.accountType==="paid"?.5:1 }} onClick={() => updateUser(u.email, { accountType: "paid" })}>Mark Paid</button>
                        <button className="btn bsm bd" onClick={() => deleteUser(u.email)}>Delete</button>
                      </div>
                    </div>
                  );
                })
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
  const [route, setRoute] = useState(() => {
    if (typeof window !== "undefined" && window.location.pathname === "/admin") return "admin";
    const u = LS.get("lb_current_user", null);
    const ind = LS.get("lb_industry", null);
    if (u && ind) return "app";
    if (u) return "industry";
    return "landing";
  });
  const [sbLoading, setSbLoading] = useState(false);

  // ── Auth ──
  const [currentUser, setCurrentUser] = useState(() => LS.get("lb_current_user", null));
  const [regForm, setRegForm]   = useState({ firstName: "", email: "", password: "", confirm: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [resetEmail,   setResetEmail]  = useState("");
  const [resetSent,    setResetSent]   = useState(false);
  const [newPass,      setNewPass]     = useState("");
  const [newPassConf,  setNewPassConf] = useState("");
  const [resetSuccess, setResetSuccess]= useState(false);
  const [authErr, setAuthErr] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  // ── Lang / Industry ──
  const [lang,     setLang]     = useState(() => LS.get("lb_lang", "en")); // Default English
  const [industry, setIndustry] = useState(() => LS.get("lb_industry", null));
  const [step,     setStep]     = useState(0);

  // ── Profile ──
  const defProfile = { businessName: "", laborRate: "", crewSize: "2", targetMargin: "40", targetDollar: "50", marginMode: "pct", zipCode: "", vehicles: "1", fuelType: "gas", overheadMode: "none", overheadPct: "15", overheadFlat: "10", includeOneTime: true };
  const [profile, setProfile] = useState(() => ({ ...defProfile, ...LS.get("lb_profile", {}) }));
  const ps = (k, v) => {
    const p = { ...profile, [k]: v }; setProfile(p); LS.set("lb_profile", p);
    // Sync to Supabase in background
    if (currentUser?.id) sb.from("profiles").update({ profile_data: p }).eq("id", currentUser.id).then(() => {});
  };

  // ── Job libraries ──
  const initLang = LS.get("lb_lang", "en") || "en";
  const [allJobs, setAllJobsRaw] = useState(() => LS.get("lb_all_jobs", {
    landscaping: getJobs(INDUSTRY_TEMPLATES.landscaping, initLang),
    pool:        getJobs(INDUSTRY_TEMPLATES.pool,        initLang),
    handyman:    getJobs(INDUSTRY_TEMPLATES.handyman,    initLang),
  }));
  const setAllJobs = (updater) => {
    const next = typeof updater === "function" ? updater(allJobs) : updater;
    setAllJobsRaw(next); LS.set("lb_all_jobs", next);
    // Sync to Supabase in background
    if (currentUser?.id) sb.from("profiles").update({ jobs_data: next }).eq("id", currentUser.id).then(() => {});
  };
  const jobs    = allJobs[industry] || [];
  const setJobs = (upd) => setAllJobs(prev => ({ ...prev, [industry]: typeof upd === "function" ? upd(prev[industry] || []) : upd }));

  // ── Quote form ──
  const [selJob,  setSelJob]  = useState("");
  const [cadence, setCadence] = useState("once"); // once | weekly | biweekly | monthly | custom
  const [customCadence, setCustomCadence] = useState(""); // e.g. "every 3 weeks"
  const [resultView, setResultView] = useState("single"); // single | recurring
  const [hours,   setHours]   = useState("");
  const [mats,       setMats]       = useState("");
  const [matsRaw,    setMatsRaw]    = useState("");
  const [markupPct,  setMarkupPct]  = useState("20");
  const [tier,    setTier]    = useState("short");
  const [exactMi, setExactMi] = useState("");
  const [vehs,    setVehs]    = useState(() => LS.get("lb_profile", { vehicles: "1" }).vehicles || "1");
  const [margin,  setMargin]  = useState(() => pf(LS.get("lb_profile", { targetMargin: "40" }).targetMargin, 40));
  const [gasPrice, setGasPrice] = useState(() => LS.get("lb_gas_price", "4.00"));
  const [qMarginMode, setQMarginMode] = useState(() => LS.get("lb_profile", { marginMode: "pct" }).marginMode || "pct");
  const [qTargetDollar, setQTargetDollar] = useState(() => LS.get("lb_profile", { targetDollar: "50" }).targetDollar || "50");
  const [qOverheadMode, setQOverheadMode] = useState(() => LS.get("lb_profile", { overheadMode: "none" }).overheadMode || "none");
  const [qOverheadPct,  setQOverheadPct]  = useState(() => LS.get("lb_profile", { overheadPct: "15" }).overheadPct || "15");
  const [qOverheadFlat, setQOverheadFlat] = useState(() => LS.get("lb_profile", { overheadFlat: "10" }).overheadFlat || "10");
  const [result,  setResult]  = useState(null);
  const [showAct,    setShowAct]    = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [defaultsBannerDismissed, setDefaultsBannerDismissed] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => LS.get("lb_welcome_seen", false));

  // ── Log ──
  const [log,          setLog]          = useState(() => LS.get("lb_quote_log", []));
  const [showSave,     setShowSave]     = useState(false);
  const [saveName,     setSaveName]     = useState("");
  const [saveSuccess,  setSaveSuccess]  = useState(null); // {price, profit, margin}
  const [saveNotes,    setSaveNotes]    = useState("");
  const [saveAddress,  setSaveAddress]  = useState("");
  const [logFilter,      setLogFilter]      = useState("all");
  const [historyJobType, setHistoryJobType] = useState(null);
  const [statPeriod,   setStatPeriod]   = useState("monthly");
  const [editingQuote,  setEditingQuote]  = useState(null);
  const [sharingQuote,  setSharingQuote]  = useState(null);

  // ── Settings ──
  const [settView, setSettView] = useState("main");
  const [showLegal, setShowLegal] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [reminderShown, setReminderShown] = useState(() => LS.get("lb_reminder_shown", { d4: false, d6: false }));

  // ── Tab ──
  const [tab, setTab] = useState("quote");

  const t = TX[lang] || TX.en;
  const TOTAL_STEPS = 4;

  // ── Persist gas price ──
  useEffect(() => { LS.set("lb_gas_price", gasPrice); }, [gasPrice]);

  // ── Sync quote fields from profile ──
  useEffect(() => { setMargin(pf(profile.targetMargin, 40)); }, [profile.targetMargin]);
  useEffect(() => { setVehs(profile.vehicles); }, [profile.vehicles]);
  useEffect(() => { setQMarginMode(profile.marginMode || "pct"); }, [profile.marginMode]);
  useEffect(() => { setQTargetDollar(profile.targetDollar || "50"); }, [profile.targetDollar]);
  useEffect(() => { setQOverheadMode(profile.overheadMode || "none"); }, [profile.overheadMode]);
  useEffect(() => { setQOverheadPct(profile.overheadPct || "15"); }, [profile.overheadPct]);
  useEffect(() => { setQOverheadFlat(profile.overheadFlat || "10"); }, [profile.overheadFlat]);

  // ── Persist log ──
  useEffect(() => { LS.set("lb_quote_log", log); }, [log]);

  // ── Detect password reset token in URL ──
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      setRoute("resetNewPass");
    }
  }, []);

  // ── Restore Supabase session on mount ──
  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      if (LS.get("lb_current_user", null)) return; // already loaded from cache
      setSbLoading(true);
      sb.from("profiles").select("*").eq("id", session.user.id).single().then(({ data: profile }) => {
        if (!profile) { setSbLoading(false); return; }
        const user = {
          id: session.user.id,
          firstName: profile.first_name || "User",
          email: session.user.email,
          signupDate: profile.signup_date || new Date().toISOString(),
          accountType: profile.account_type || "trial",
          industry: profile.industry || null,
          first_calc_at: profile.first_calc_at || null,
          quotesGenerated: profile.quotes_generated || 0,
          lastActive: new Date().toISOString(),
        };
        if (profile.profile_data && Object.keys(profile.profile_data).length > 0) {
            const merged = { laborRate: "", crewSize: "2", targetMargin: "40", targetDollar: "50", marginMode: "pct", zipCode: "", vehicles: "1", fuelType: "gas", overheadMode: "none", overheadPct: "15", overheadFlat: "10", includeOneTime: true, ...profile.profile_data };
            LS.set("lb_profile", merged); setProfile(merged);
          }
          if (profile.jobs_data && Object.keys(profile.jobs_data).length > 0) {
            LS.set("lb_all_jobs", profile.jobs_data); setAllJobsRaw(profile.jobs_data);
          }
          if (user.industry) { LS.set("lb_industry", user.industry); setIndustry(user.industry); }
        LS.set("lb_current_user", user);
        setCurrentUser(user);
        const l = LS.get("lb_lang", null);
        if (l && user.industry) setRoute("app");
        else if (l) setRoute("industry");
        setSbLoading(false);
      });
    });
    sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { LS.del("lb_current_user"); setCurrentUser(null); setRoute("landing"); }
    });
  }, []);

  // ── Send day-11 trial reminder email ──
  useEffect(() => {
    if (!currentUser || currentUser.accountType !== "trial") return;
    const days = Math.floor((Date.now() - new Date(currentUser.signupDate)) / 86400000);
    if (days >= 5 && !LS.get("lb_trial_reminder_sent", false)) {
      sb.functions.invoke("send-trial-reminder", {
        body: { email: currentUser.email, daysLeft: TRIAL_DAYS - days, lang }
      }).then(() => { LS.set("lb_trial_reminder_sent", true); }).catch(() => {});
    }
  }, [currentUser]);

  // ── Trial reminders ──
  useEffect(() => {
    if (!currentUser || currentUser.accountType !== "trial") return;
    const d = Math.floor((Date.now() - new Date(currentUser.signupDate)) / 86400000);
    if (d >= 6 && !reminderShown.d6) setShowReminder("d6");
    else if (d >= 4 && !reminderShown.d4) setShowReminder("d4");
  }, [currentUser, reminderShown]);

  // ── Trial ──
  const trialInfo = useCallback(() => {
    if (!currentUser || currentUser.accountType === "free" || currentUser.accountType === "paid")
      return { daysLeft: TRIAL_DAYS, expired: false, softLock: false, hardLock: false, pct: 100, daysAfter: 0 };
    const d = Math.floor((Date.now() - new Date(currentUser.signupDate)) / 86400000);
    const daysLeft = Math.max(0, TRIAL_DAYS - d);
    const daysAfter = Math.max(0, d - TRIAL_DAYS);
    return { daysLeft, expired: daysLeft === 0, softLock: daysLeft === 0 && daysAfter <= SOFT_LOCK_DAYS, hardLock: daysLeft === 0 && daysAfter > SOFT_LOCK_DAYS, pct: Math.round((daysLeft / TRIAL_DAYS) * 100), daysAfter };
  }, [currentUser]);
  const trial = trialInfo();

  // ── Auth ──
  const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleRegister = async () => {
    setAuthErr("");
    if (!regForm.firstName.trim()) return setAuthErr("Please enter your first name");
    // Clear any leftover data from previous user
    ["lb_current_user","lb_profile","lb_all_jobs","lb_industry","lb_quote_log","lb_gas_price","lb_reminder_shown"].forEach(k => LS.del(k));
    if (!validateEmail(regForm.email)) return setAuthErr(t.emailInvalid);
    if (regForm.password.length < 8)  return setAuthErr(t.passMin);
    if (regForm.password !== regForm.confirm) return setAuthErr(t.passMismatch);
    try {
      const { data, error } = await sb.auth.signUp({
        email: regForm.email.toLowerCase().trim(),
        password: regForm.password,
        options: {
          data: { first_name: regForm.firstName.trim() },
          emailRedirectTo: null,
        }
      });
      if (error) {
        if (error.message.includes("already registered")) return setAuthErr(t.emailTaken);
        return setAuthErr(error.message);
      }
      const user = {
        id: data.user.id,
        firstName: regForm.firstName.trim(),
        email: regForm.email.toLowerCase().trim(),
        signupDate: new Date().toISOString(),
        accountType: "trial",
        industry: null,
        quotesGenerated: 0,
        lastActive: new Date().toISOString(),
      };
      // Save profile to Supabase
      await sb.from("profiles").insert({
        id: data.user.id,
        first_name: user.firstName,
        email: user.email,
        account_type: "trial",
        signup_date: user.signupDate,
        profile_data: LS.get("lb_profile", {}),
        jobs_data: allJobs,
      });
      // Also cache locally for fast access
      LS.set("lb_current_user", user);
      setCurrentUser(user);
            setRoute(!lang ? "welcome" : "industry");
    } catch (e) {
      setAuthErr(e.message || "Registration failed. Please check your connection and try again.");
    }
  };

  const handleLogin = async () => {
    setAuthErr("");
    if (!validateEmail(loginForm.email)) return setAuthErr(t.emailInvalid);
    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: loginForm.email.toLowerCase().trim(),
        password: loginForm.password,
      });
      if (error) return setAuthErr(t.invalidCreds);
      // Clear old user data before loading new user
      ["lb_current_user","lb_profile","lb_all_jobs","lb_industry","lb_quote_log","lb_gas_price","lb_reminder_shown"].forEach(k => LS.del(k));
      // Load profile from Supabase
      const { data: profile } = await sb.from("profiles").select("*").eq("id", data.user.id).single();
      const user = {
        id: data.user.id,
        firstName: profile?.first_name || "User",
        email: data.user.email,
        signupDate: profile?.signup_date || new Date().toISOString(),
        accountType: profile?.account_type || "trial",
        industry: profile?.industry || null,
        first_calc_at: profile?.first_calc_at || null,
        quotesGenerated: profile?.quotes_generated || 0,
        lastActive: new Date().toISOString(),
      };
      // Restore profile settings and jobs from Supabase
      if (profile?.profile_data) LS.set("lb_profile", profile.profile_data);
      if (profile?.jobs_data)    LS.set("lb_all_jobs", profile.jobs_data);
      if (user.industry)         LS.set("lb_industry", user.industry);
      // Update last active in Supabase
      await sb.from("profiles").update({ last_active: new Date().toISOString() }).eq("id", data.user.id);
      // Load quotes from Supabase
      const { data: remoteQuotes } = await sb.from("quotes").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false });
      if (remoteQuotes && remoteQuotes.length > 0) {
        const mapped = remoteQuotes.map(q => ({
          id: q.id, name: q.name, address: q.address || "", notes: q.notes || "",
          price: q.price, margin: q.margin, profit: q.profit,
          date: new Date(q.created_at).toLocaleDateString(),
          jobType: q.job_type, industry: q.industry, converted: q.converted || false,
        }));
        LS.set("lb_quote_log", mapped);
        setLog(mapped);
      }
      LS.set("lb_current_user", user);
      setCurrentUser(user);
      const savedInd = user.industry;
      setIndustry(savedInd);
      setTab("quote");
      setRoute(!lang ? "welcome" : !savedInd ? "industry" : "app");
    } catch (e) {
      setAuthErr(e.message || "Login failed. Please check your connection and try again.");
    }
  };

  const handleLogout = async () => {
    await sb.auth.signOut();
    // Clear ALL local data so next user starts fresh
    const keysToKeep = ["lb_lang"]; // keep language preference only
    Object.keys(localStorage).forEach(k => {
      if (!keysToKeep.includes(k)) localStorage.removeItem(k);
    });
    setCurrentUser(null);
    setIndustry(null);
    setProfile({ laborRate: "", crewSize: "2", targetMargin: "40", targetDollar: "50", marginMode: "pct", zipCode: "", vehicles: "1", fuelType: "gas", overheadMode: "none", overheadPct: "15", overheadFlat: "10", includeOneTime: true });
    setLog([]);
    setStep(0);
    setRoute("login");
  };

  const handleResetPass = async () => {
    if (!validateEmail(resetEmail)) return setAuthErr(t.emailInvalid);
    try {
      const { error } = await sb.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: "https://listobid.com/reset",
      });
      if (error) return setAuthErr(error.message);
      setResetSent(true); setAuthErr("");
    } catch (e) {
      setAuthErr("Could not send reset email. Try again.");
    }
  };

  const incrementQuotes = useCallback(() => {
    if (!currentUser) return;
    const key = `lb_user_${currentUser.email.replace(/[^a-z0-9]/gi, "_")}`;
    const updated = { ...currentUser, quotesGenerated: (currentUser.quotesGenerated || 0) + 1, lastActive: new Date().toISOString() };
    LS.set(key, updated); LS.set("lb_current_user", updated); setCurrentUser(updated);
    LS.set("lb_all_users", LS.get("lb_all_users", []).map(u => u.email === currentUser.email ? updated : u));
  }, [currentUser]);

  // ── Quote ──
  const canCalc = !!hours && pf(hours) > 0 && !!gasPrice && pf(gasPrice) > 0 && pf(profile.laborRate) > 0;
  const [showRequired, setShowRequired] = useState(false);
  const buildP = (mg = margin) => ({ laborRate: profile.laborRate, crewSize: profile.crewSize, hours, materials: mats, exactMiles: exactMi, tier, vehicles: vehs, gasPrice, margin: mg, marginMode: qMarginMode, targetDollar: qTargetDollar, overheadMode: qOverheadMode, overheadPct: qOverheadPct, overheadFlat: qOverheadFlat });

  const doCalc = (mg = margin) => {
    if (!canCalc) return;
    const r = calcQuote(buildP(mg));
    setMargin(Math.round(r.margin)); setResult(r); setShowAct(false); incrementQuotes();
    // Log calculation to Supabase
    if (currentUser?.id) {
      const jobName = jobs.find(j => String(j.id) === String(selJob))?.name || "Unknown";
      sb.from("quote_events").insert({
        user_id: currentUser.id,
        job_type: jobName,
        industry: currentUser.industry || industry,
        price: r.price,
        cost: Math.round(r.cost),
        profit: Math.round(r.profit),
        margin: Math.round(r.margin),
        crew_size: parseInt(profile.crewSize) || parseInt(crewSize) || 1,
        hours: parseFloat(hours) || 0,
        saved: false,
      }).then(() => {}).catch(() => {});
      // Track first calc timestamp
      if (!currentUser.first_calc_at) {
        sb.from("profiles").update({ first_calc_at: new Date().toISOString() }).eq("id", currentUser.id)
          .then(() => { setCurrentUser(u => ({...u, first_calc_at: new Date().toISOString()})); })
          .catch(() => {});
      }
    }
  };

  const onSlider = (val) => { setMargin(val); if (canCalc) setResult(calcQuote(buildP(val))); };

  useEffect(() => {
    if (!result || !canCalc) return;
    const timer = setTimeout(() => {
      const r = calcQuote(buildP(margin));
      setResult(r);
    }, 250);
    return () => clearTimeout(timer);
  }, [hours, mats, gasPrice, crewSize, selJob]);

  const selectJob = (id) => {
    setSelJob(id); setResult(null); setShowAct(false);
    const j = jobs.find(j => String(j.id) === String(id));
    if (j) { setHours(String(j.hours)); setMats(String(j.materials)); }
  };

  const reset = () => { setSelJob(""); setHours(""); setMats(""); setMatsRaw(""); setMarkupPct("20"); setTier("short"); setExactMi(""); setVehs(profile.vehicles); setMargin(pf(profile.targetMargin, 40)); setResult(null); setShowAct(false); setCadence("once"); setCustomCadence(""); setResultView("single"); };

  const saveQuote = async () => {
    if (!saveName.trim() || !result) return;
    const entry = {
      id: Date.now(), name: saveName.trim(), notes: saveNotes.trim(),
      address: saveAddress.trim(), price: result.price, margin: result.margin,
      profit: result.profit, date: new Date().toLocaleDateString(),
      jobType: jobs.find(j => String(j.id) === String(selJob))?.name || "-",
      industry: industry || "landscaping", converted: false,
      cadence, customCadence,
    };
    // Save to local log immediately for fast UI
    const nl = [entry, ...log]; setLog(nl); LS.set("lb_quote_log", nl);
    // Save to Supabase in background
    if (currentUser?.id) {
      try {
        const { error: qErr } = await sb.from("quotes").insert({
          user_id: currentUser.id,
          name: entry.name,
          address: entry.address || "",
          notes: entry.notes || "",
          price: entry.price,
          cost: result.cost,
          profit: entry.profit,
          margin: entry.margin,
          job_type: entry.jobType,
          industry: entry.industry,
          converted: false,
        });
        if (qErr) console.error("Quote save error:", qErr);
        await sb.from("profiles").update({
          quotes_generated: (currentUser.quotesGenerated || 0) + 1
        }).eq("id", currentUser.id);
        const updatedUser = { ...currentUser, quotesGenerated: (currentUser.quotesGenerated || 0) + 1 };
        LS.set("lb_current_user", updatedUser);
        setCurrentUser(updatedUser);
      } catch (e) { console.error("Quote save exception:", e); }
    }
    setShowSave(false); setSaveName(""); setSaveNotes(""); setSaveAddress(""); setShowAct(false);
    setSaveSuccess({ price: entry.price, profit: Math.round(entry.profit), margin: Math.round(entry.margin) });
    reset();
    setTimeout(() => setSaveSuccess(null), 4000);
  };

  const updateQuote = (id, updates) => { const nl = log.map(q => q.id === id ? { ...q, ...updates } : q); setLog(nl); LS.set("lb_quote_log", nl); };
  const deleteQuote = (id) => { const nl = log.filter(q => q.id !== id); setLog(nl); LS.set("lb_quote_log", nl); };
  const dismissReminder = () => { const u = { ...reminderShown, [showReminder]: true }; setReminderShown(u); LS.set("lb_reminder_shown", u); setShowReminder(false); };

  // ─── SCREENS ──────────────────────────────────────────────────────────────

  if (route === "admin") return (<><style>{CSS}</style><AdminDashboard onClose={() => setRoute(currentUser ? "app" : "welcome")} /></>);

  if (route === "welcome") return (
    <><style>{CSS}</style>
    <div className="wlc">
      <div style={{marginBottom:20,marginTop:8,background:"#fff",borderRadius:20,padding:"16px 24px",display:"inline-block"}}><LogoImg width={180}/></div>
      <p className="wsub" style={{marginBottom:42}}>Ready to Bid.</p>
      <div className="ls">
        <button className="lbtn len" onClick={() => { setLang("en"); LS.set("lb_lang", "en"); setRoute("register"); }}>English</button>
        <button className="lbtn les" onClick={() => { setLang("es"); LS.set("lb_lang", "es"); setRoute("register"); }}>Español</button>
      </div>
    </div></>
  );

  // ── Landing Page ──
  if (route === "landing") return (
    <><style>{CSS}</style>
    <style>{`
      .lb-lang-btn{background:none;border:1.5px solid rgba(255,255,255,.4);border-radius:6px;padding:4px 10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:color .15s,border-color .15s}
      .lb-lang-btn:hover{color:var(--green);border-color:var(--green)}
      .lb-signin-btn{background:none;border:none;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:color .15s}
      .lb-signin-btn:hover{color:var(--green)}
    `}</style>
    <div style={{minHeight:"100dvh",background:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",overflowX:"hidden"}}>

      {/* Nav */}
      <div style={{background:"var(--navy)",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <img src="/logo.PNG" alt="ListoBid" style={{height:32,objectFit:"contain"}}/>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button className="lb-lang-btn" onClick={()=>setLang(lang==="en"?"es":"en")}>
            {lang==="en"?"Español":"English"}
          </button>
          <button className="lb-signin-btn" onClick={()=>setRoute("login")}>
            {lang==="es"?"Iniciar Sesión":"Sign In"}
          </button>
        </div>
      </div>

      {/* Hero */}
      <div style={{background:"var(--navy)",padding:"48px 24px 56px",textAlign:"center",position:"relative",overflow:"hidden"}}>
        {/* Beams */}
        {[...Array(4)].map((_,i)=>(
          <div key={i} style={{position:"absolute",top:`${15+i*20}%`,left:"-20%",width:"60%",height:"2px",background:`linear-gradient(90deg,transparent,rgba(61,196,60,${0.07+i*0.03}),transparent)`,transform:"rotate(25deg)",animation:`beamMove ${3+i*0.7}s linear ${i*0.6}s infinite`,pointerEvents:"none"}}/>
        ))}
        <div style={{position:"relative",zIndex:1}}>
          <div style={{display:"inline-block",background:"rgba(61,196,60,.15)",border:"1px solid rgba(61,196,60,.3)",borderRadius:20,padding:"4px 14px",fontSize:11,fontWeight:700,color:"var(--green)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:20}}>
            {lang==="es"?"Para Jardineros y Técnicos de Oficio":"For Landscapers and Trade Operators"}
          </div>
          <h1 style={{fontSize:32,fontWeight:800,color:"#fff",lineHeight:1.15,margin:"0 0 32px",maxWidth:340,marginLeft:"auto",marginRight:"auto"}}>
            {lang==="es"?"Conoce tu precio. Conoce tu ganancia.":"Know your price. Know your profit."}
          </h1>

          {/* Animated mockup */}
          <div style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:16,padding:"20px",maxWidth:320,margin:"0 auto 32px",textAlign:"left"}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"rgba(255,255,255,.4)",marginBottom:8}}>
              {lang==="es"?"Precio Recomendado":"Recommended Price"}
            </div>
            <div style={{display:"flex",alignItems:"baseline",gap:2,marginBottom:12}}>
              <span style={{fontSize:22,fontWeight:800,color:"rgba(255,255,255,.6)"}}>$</span>
              <span style={{fontSize:52,fontWeight:800,color:"#fff",lineHeight:1,animation:"countUp .9s ease-out both"}}>185</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div style={{background:"rgba(255,255,255,.07)",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:16,fontWeight:800,color:"var(--green)"}}>+$74</div>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:".6px",textTransform:"uppercase",color:"rgba(255,255,255,.3)",marginTop:2}}>{lang==="es"?"Ganancia":"Profit"}</div>
              </div>
              <div style={{background:"rgba(255,255,255,.07)",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>40%</div>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:".6px",textTransform:"uppercase",color:"rgba(255,255,255,.3)",marginTop:2}}>{lang==="es"?"Margen":"Margin"}</div>
              </div>
            </div>
            <div style={{marginTop:10,fontSize:11,color:"rgba(255,255,255,.3)"}}>Weekly Maintenance · 1.5 hrs · 2 crew</div>
          </div>

          <button onClick={()=>setRoute("register")} style={{background:"var(--green)",color:"#fff",border:"none",borderRadius:12,padding:"16px 32px",fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:"inherit",width:"100%",maxWidth:320}}>
            {lang==="es"?"Cotiza tu Primer Trabajo":"Price Your First Job"}
          </button>

        </div>
      </div>

      {/* How It Works */}
      <div style={{padding:"48px 24px",maxWidth:480,margin:"0 auto"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"var(--g400)",textAlign:"center",marginBottom:8}}>
          {lang==="es"?"Cómo Funciona":"How It Works"}
        </div>
        <h2 style={{fontSize:22,fontWeight:800,color:"var(--navy)",textAlign:"center",marginBottom:32,lineHeight:1.25}}>
          {lang==="es"?"Cotiza cualquier trabajo en 30 segundos":"Price any job in 30 seconds"}
        </h2>
        {[
          {n:"1",en:"Pick your job type",es:"Elige el tipo de trabajo",sub_en:"Weekly maintenance, cleanup, tree trimming and more.",sub_es:"Mantenimiento semanal, limpieza, poda y más."},
          {n:"2",en:"Enter your hours and crew",es:"Ingresa horas y cuadrilla",sub_en:"Tell ListoBid your labor rate, hours on site, and crew size.",sub_es:"Ingresa tu tarifa, horas en sitio y tamaño de cuadrilla."},
          {n:"3",en:"Get your price and profit",es:"Obtén tu precio y ganancia",sub_en:"See exactly what to charge and what you keep on every job.",sub_es:"Ve exactamente qué cobrar y qué te queda en cada trabajo."},
        ].map(s=>(
          <div key={s.n} style={{display:"flex",gap:16,marginBottom:28}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:"var(--navy)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff",flexShrink:0,marginTop:2}}>{s.n}</div>
            <div>
              <div style={{fontSize:16,fontWeight:700,color:"var(--navy)",marginBottom:4}}>{lang==="es"?s.es:s.en}</div>
              <div style={{fontSize:13,color:"var(--g400)",lineHeight:1.5}}>{lang==="es"?s.sub_es:s.sub_en}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div style={{background:"var(--navy)",padding:"48px 24px",textAlign:"center"}}>
        <div style={{fontSize:22,fontWeight:800,color:"#fff",marginBottom:8,lineHeight:1.25}}>
          {lang==="es"?"Listo para cotizar.":"Ready to bid."}
        </div>
        <div style={{fontSize:14,color:"rgba(255,255,255,.5)",marginBottom:24}}>
          {lang==="es"?"$9.99/mes después de tu prueba.":"$9.99/month after your trial."}
        </div>
        <button onClick={()=>setRoute("register")} style={{background:"var(--green)",color:"#fff",border:"none",borderRadius:12,padding:"16px 32px",fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:"inherit",width:"100%",maxWidth:320}}>
          {lang==="es"?"Cotiza tu Primer Trabajo":"Price Your First Job"}
        </button>
      </div>

      {/* Footer */}
      <div style={{padding:"20px 24px",textAlign:"center",background:"#fff"}}>
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:20,marginBottom:10}}>
          <a href="https://www.facebook.com/profile.php?id=61590502810704" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,borderRadius:8,background:"var(--g100)",color:"var(--g600)",textDecoration:"none"}}>
            <IcoFacebook size={18} color="var(--g600)"/>
          </a>
          <a href="https://instagram.com/listobid" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,borderRadius:8,background:"var(--g100)",color:"var(--g600)",textDecoration:"none"}}>
            <IcoInstagram size={18} color="var(--g600)"/>
          </a>
        </div>
        <div style={{fontSize:11,color:"var(--g400)"}}>© 2026 ListoBid · listobid.com</div>
      </div>

    </div></>
  );


  // ── Set New Password screen (from email reset link) ──
  if (route === "resetNewPass") return (
    <><style>{CSS}</style>
    <div style={{minHeight:"100dvh",background:"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px"}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <LogoImg width={140}/>
        </div>
        <div style={{fontWeight:800,fontSize:22,color:"var(--navy)",marginBottom:6,textAlign:"center"}}>
          {lang==="es"?"Nueva Contrasena":"Set New Password"}
        </div>
        <div style={{fontSize:14,color:"var(--g400)",marginBottom:24,textAlign:"center"}}>
          {lang==="es"?"Ingresa tu nueva contrasena.":"Enter your new password below."}
        </div>
        {authErr&&<div className="auth-err">{authErr}</div>}
        {resetSuccess?(
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:15,color:"var(--gdk)",fontWeight:600,marginBottom:20}}>
              {lang==="es"?"Contrasena actualizada. Inicia sesion.":"Password updated. Please sign in."}
            </div>
            <button className="btn bp" onClick={()=>{setRoute("login");window.history.replaceState(null,"","/");}}>
              {lang==="es"?"Iniciar Sesion":"Sign In"}
            </button>
          </div>
        ):(
          <>
            <div className="fi"><label className="lb">{lang==="es"?"Nueva Contrasena":"New Password"}</label>
              <input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="Min 8 characters"/>
            </div>
            <div className="fi"><label className="lb">{lang==="es"?"Confirmar Contrasena":"Confirm Password"}</label>
              <input type="password" value={newPassConf} onChange={e=>setNewPassConf(e.target.value)} placeholder="Repeat password"/>
            </div>
            <button className="btn bp" onClick={async()=>{
              setAuthErr("");
              if(newPass.length<8) return setAuthErr(t.passMin);
              if(newPass!==newPassConf) return setAuthErr(t.passMismatch);
              const {error}=await sb.auth.updateUser({password:newPass});
              if(error) return setAuthErr(error.message);
              setResetSuccess(true);
            }}>{lang==="es"?"Guardar Contrasena":"Save Password"}</button>
          </>
        )}
      </div>
    </div></> 
  );

  if (route === "register") return (
    <><style>{CSS}</style>
    <div className="auth">
      <div className="auth-box">
        <div className="auth-logo"><LogoImg width={160}/></div>
        <div className="auth-title">{t.register}</div>
        <div className="auth-sub">{t.welcomeSub}</div>
        <div className="fi"><label className="lb">{t.firstName}</label><input type="text" value={regForm.firstName} onChange={e => setRegForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Carlos" autoFocus /></div>
        <div className="fi"><label className="lb">{t.email}</label><input type="email" value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} placeholder="you@email.com" /></div>
        <div className="fi"><label className="lb">{t.password}</label><input type="password" value={regForm.password} onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" /></div>
        <div className="fi"><label className="lb">{t.confirmPass}</label><input type="password" value={regForm.confirm} onChange={e => setRegForm(f => ({ ...f, confirm: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleRegister()} placeholder="Repeat password" /></div>
        {authErr && <div className="auth-err">{authErr}</div>}
        <button className="btn bp mt8" onClick={handleRegister}>{t.signUp}</button>
        <div className="auth-link" onClick={() => { setAuthErr(""); setRoute("login"); }}>{t.hasAccount} {t.signIn}</div>
        <div style={{display:"flex",justifyContent:"center",gap:10,marginTop:16,paddingTop:14,borderTop:"1px solid var(--g200)"}}>
          <button className={`tb ${lang==="en"?"on":""}`} style={{flex:"none",padding:"5px 14px",fontSize:13}} onClick={()=>{setLang("en");LS.set("lb_lang","en");}}>English</button>
          <button className={`tb ${lang==="es"?"on":""}`} style={{flex:"none",padding:"5px 14px",fontSize:13}} onClick={()=>{setLang("es");LS.set("lb_lang","es");}}>Español</button>
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:14}}>
          <a href="https://instagram.com/listobid" target="_blank" rel="noopener noreferrer"
            style={{display:"flex",alignItems:"center",gap:6,color:"var(--g400)",textDecoration:"none",fontSize:12,fontWeight:600}}>
            <IcoInstagram size={16} color="var(--g400)"/>
            @listobid
          </a>
          <a href="https://www.facebook.com/profile.php?id=61590502810704" target="_blank" rel="noopener noreferrer"
            style={{display:"flex",alignItems:"center",gap:6,color:"var(--g400)",textDecoration:"none",fontSize:12,fontWeight:600}}>
            <IcoFacebook size={16} color="var(--g400)"/>
            ListoBid
          </a>
        </div>
      </div>
    </div></>
  );

  if (route === "login") return (
    <><style>{CSS}</style>
    <div className="auth">
      <div className="auth-box">
        <div className="auth-logo"><LogoImg width={160}/></div>
        <div className="auth-title">{t.login}</div>
        <div className="auth-sub">{t.welcomeSub}</div>
        <div className="fi"><label className="lb">{t.email}</label><input type="email" value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))} placeholder="you@email.com" autoFocus /></div>
        <div className="fi"><label className="lb">{t.password}</label><input type="password" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Your password" /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 4px" }}>
          <input type="checkbox" id="rm" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--green)", cursor: "pointer" }} />
          <label htmlFor="rm" style={{ fontSize: 13, color: "var(--g600)", cursor: "pointer", fontWeight: 600 }}>{t.rememberMe}</label>
        </div>
        <div style={{ fontSize: 11, color: "var(--g400)", marginBottom: 8, lineHeight: 1.4 }}>{t.privateWarn}</div>
        {authErr && <div className="auth-err">{authErr}</div>}
        <button className="btn bp" onClick={handleLogin}>{t.signIn}</button>
        <div className="auth-link" onClick={() => { setAuthErr(""); setRoute("resetPass"); }}>{t.forgotPass}</div>
        <div className="auth-link" onClick={() => { setAuthErr(""); setRoute("register"); }}>{t.noAccount} {t.signUp}</div>
      </div>
    </div></>
  );

  if (route === "resetPass") return (
    <><style>{CSS}</style>
    <div className="auth">
      <div className="auth-box">
        <div className="auth-logo"><LogoImg width={160}/></div>
        <div className="auth-title">{t.resetPass}</div>
        {resetSent
          ? <><div style={{ fontSize: 14, color: "var(--gdk)", textAlign: "center", padding: "16px 0", lineHeight: 1.6 }}>{t.resetSent}</div><button className="btn bp" onClick={() => { setResetSent(false); setRoute("login"); }}>{t.signIn}</button></>
          : <><div className="fi"><label className="lb">{t.email}</label><input type="email" value={resetEmail} onChange={e => { setResetEmail(e.target.value); setAuthErr(""); }} autoFocus /></div>
              {authErr && <div className="auth-err">{authErr}</div>}
              <button className="btn bp mt8" onClick={handleResetPass}>{t.resetPass}</button>
              <div className="auth-link" onClick={() => { setAuthErr(""); setRoute("login"); }}>← {t.signIn}</div>
            </>
        }
      </div>
    </div></>
  );

  if (!currentUser) return (<><style>{CSS}</style><div className="auth"><div className="auth-box"><div className="auth-logo"><LogoImg width={160}/></div><div className="auth-title">{t.login}</div><button className="btn bp mt8" onClick={()=>setRoute("login")}>{t.signIn}</button><button className="btn bg mt8" onClick={()=>setRoute("register")}>{t.signUp}</button></div></div></>);

  if (trial.hardLock) return (
    <><style>{CSS}</style>
    <div className="wlc">
      
      <p style={{ fontSize: 22, color: "#fff", fontWeight: 700, marginBottom: 10 }}>{t.trialExpiredTitle}</p>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,.5)", marginBottom: 32, maxWidth: 280, lineHeight: 1.6 }}>{t.trialExpiredBody}</p>
      <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: "18px 22px", marginBottom: 24, width: "100%", maxWidth: 300 }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 40, color: "var(--green)" }}>$9.99<span style={{ fontSize: 18, color: "rgba(255,255,255,.4)" }}>/mo</span></div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 5 }}>Cancel anytime · Autopay</div>
      </div>
      <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer" style={{ width: "100%", maxWidth: 300, display: "block", padding: 14, background: "linear-gradient(135deg,var(--green),var(--gdk))", color: "#fff", borderRadius: 12, fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 15, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>{t.subscribeNow}</a>
      <button style={{ marginTop: 16, background: "none", border: "none", color: "rgba(255,255,255,.3)", fontSize: 12, cursor: "pointer", fontFamily: "'Plus Jakarta Sans',sans-serif" }} onClick={handleLogout}>{t.logout}</button>
    </div></>
  );

  if (!industry || route === "industry") return (
    <><style>{CSS}</style>
    <div className="app">
      <div className="hdr"><div className="hdr-logo"><LogoWordmark size={22}/></div></div>
      <div className="ct" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70dvh", textAlign: "center" }}>
        
        <div className="st" style={{ marginBottom: 4 }}>{lang === "es" ? `Hola, ${currentUser.firstName}!` : `Hi, ${currentUser.firstName}!`}</div>
        <div className="st" style={{ marginBottom: 6 }}>{t.chooseIndustry}</div>
        <p style={{ fontSize: 13, color: "var(--g400)", marginBottom: 28 }}>{t.industrySubtitle}</p>
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          {Object.entries(INDUSTRY_TEMPLATES).map(([key, tmpl]) => (
            <button key={key}
              style={{ flex: 1, padding: "18px 6px", background: "var(--w)", border: "2px solid var(--g200)", borderRadius: "var(--rad)", cursor: "pointer", fontFamily: "'Plus Jakarta Sans',sans-serif", boxShadow: "var(--sh)", transition: "all .15s" }}
              onClick={() => {
                const uk = `lb_user_${currentUser.email.replace(/[^a-z0-9]/gi, "_")}`;
                const upd = { ...currentUser, industry: key };
                LS.set("lb_industry", key); LS.set(uk, upd); LS.set("lb_current_user", upd);
                setCurrentUser(upd); setIndustry(key);
                // Initialize job library in correct language if not already set
                const existing = LS.get("lb_all_jobs", null);
                if (!existing || !existing[key] || existing[key].length === 0) {
                  const newJobs = { ...(existing || {}), [key]: getJobs(INDUSTRY_TEMPLATES[key], lang || "en") };
                  LS.set("lb_all_jobs", newJobs); setAllJobsRaw(newJobs);
                }
                // Save industry to Supabase
                if (upd.id) sb.from("profiles").update({ industry: key }).eq("id", upd.id).then(() => {});

                // Smart defaults if no labor rate set
                const needsDefaults = !profile.laborRate;
                if (needsDefaults) {
                  const defaultJobs = getJobs(INDUSTRY_TEMPLATES[key], lang || "en");
                  const firstJob = defaultJobs[0];
                  const smartProfile = {
                    laborRate: "18", crewSize: "2", gasPrice: "4.00",
                    vehicles: "1", marginMode: "pct", targetMargin: "40",
                    overheadMode: "none", overheadPct: "15", overheadFlat: "10",
                    targetDollar: "50", businessName: "", zipCode: "",
                    fuelType: "gas", includeOneTime: true
                  };
                  setProfile(p => ({...p, ...smartProfile}));
                  // Persist to Supabase
                  if (upd.id) {
                    sb.from("profiles").update({
                      profile_data: {...(profile || {}), ...smartProfile}
                    }).eq("id", upd.id).then(() => {}).catch(() => {});
                  }
                  // Pre-select first job
                  if (firstJob) {
                    setSelJob(String(firstJob.id));
                    setHours(String(firstJob.hours || "1"));
                    // Auto-set cadence for weekly jobs
                    const jname = (firstJob.name || "").toLowerCase();
                    if (jname.includes("weekly") || jname.includes("semanal")) {
                      setCadence("weekly");
                    }
                  }
                }
                setStep(0); setTab("quote"); setRoute("app");
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--green)"; e.currentTarget.style.background = "var(--glt)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--g200)"; e.currentTarget.style.background = "var(--w)"; }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{tmpl[lang]?.icon || tmpl.en.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{tmpl[lang]?.name || tmpl.en.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div></>
  );

  if ((step >= 1 && step <= TOTAL_STEPS) || route === "setup") {
    const stepContent = [
      // Step 1: Labor, Margin, Overhead
      <div key="s1">
        <div className="st">{t.setup}</div><div className="ss">{t.step} 1 {t.of} {TOTAL_STEPS} - Labor, Margin & Overhead</div>
        <div className="fi"><label className="lb">Business Name <span style={{fontSize:11,color:"var(--g400)",fontWeight:400}}>(optional)</span></label><input type="text" value={profile.businessName||""} onChange={e=>ps("businessName",e.target.value)} placeholder="e.g. Garcia Landscaping"/></div>
        <div className="fi"><label className="lb">{t.laborRate}</label><div className="px"><span className="pxs">$</span><input type="number" min="0" value={profile.laborRate} onChange={e => ps("laborRate", e.target.value)} placeholder="18.00" /></div><div className="ht">{t.laborHint}</div></div>
        <div className="fi"><label className="lb">{t.crewSize}</label><div className="tg">{[1,2,3,4,5,6,7,8,9,10].map(x => <button key={x} className={`tb ${profile.crewSize===String(x)?"on":""}`} style={{flex:"0 0 calc(20% - 6px)",minWidth:36}} onClick={()=>ps("crewSize",String(x))}>{x}</button>)}</div></div>
        <div className="fi"><label className="lb">{t.marginMode}</label>
          <div className="tg">
            <button className={`tb ${profile.marginMode!=="dollar"?"on":""}`} onClick={()=>ps("marginMode","pct")}>% {t.marginPct}</button>
            <button className={`tb ${profile.marginMode==="dollar"?"on":""}`} onClick={()=>ps("marginMode","dollar")}>$ {t.marginDollar}</button>
          </div>
        </div>
        {profile.marginMode !== "dollar"
          ? <div className="fi"><label className="lb">{t.targetMargin}</label><div className="sx"><input type="number" min="1" max="99" value={profile.targetMargin} onChange={e=>ps("targetMargin",e.target.value)} placeholder="40"/><span className="sxs">%</span></div><div className="ht">{t.marginHint}</div></div>
          : <div className="fi"><label className="lb">{t.targetDollar}</label><div className="px"><span className="pxs">$</span><input type="number" min="0" value={profile.targetDollar} onChange={e=>ps("targetDollar",e.target.value)} placeholder="50"/></div><div className="ht">{t.marginHint}</div></div>
        }
        <div className="fi"><label className="lb">{t.overheadLabel}</label>
          <div className="tg">
            <button className={`tb ${profile.overheadMode==="none"?"on":""}`} onClick={()=>ps("overheadMode","none")}>{t.overheadNone}</button>
            <button className={`tb ${profile.overheadMode==="pct"?"on":""}`} onClick={()=>ps("overheadMode","pct")}>{t.overheadPctLabel}</button>
            <button className={`tb ${profile.overheadMode==="flat"?"on":""}`} onClick={()=>ps("overheadMode","flat")}>{t.overheadFlatLabel}</button>
          </div>
        </div>
        {profile.overheadMode==="pct" && <div className="fi"><label className="lb">Overhead %</label><div className="sx"><input type="number" min="0" max="100" value={profile.overheadPct} onChange={e=>ps("overheadPct",e.target.value)} placeholder="15"/><span className="sxs">%</span></div><div className="ht">{t.overheadHint}</div></div>}
        {profile.overheadMode==="flat" && <div className="fi"><label className="lb">Overhead per Job</label><div className="px"><span className="pxs">$</span><input type="number" min="0" value={profile.overheadFlat} onChange={e=>ps("overheadFlat",e.target.value)} placeholder="10"/></div></div>}
      </div>,
      // Step 2: Fuel Cost
      <div key="s2">
        <div className="st">{t.setup}</div><div className="ss">{t.step} 2 {t.of} {TOTAL_STEPS} - Fuel Cost</div>
        <div className="fi">
          <label className="lb">{t.gasPriceLabel}</label>
          <div className="px"><span className="pxs">$</span>
            <input type="number" step="0.01" min="0" value={gasPrice} onChange={e=>setGasPrice(e.target.value)} placeholder="3.42"/>
          </div>
        </div>
      </div>,
      // Step 3: Vehicles
      <div key="s3">
        <div className="st">{t.setup}</div><div className="ss">{t.step} 3 {t.of} {TOTAL_STEPS} - Vehicles</div>
        <div className="fi"><label className="lb">{t.vehicles}</label><div className="tg">{[1,2,3,4,5].map(x=><button key={x} className={`tb ${profile.vehicles===String(x)?"on":""}`} onClick={()=>ps("vehicles",String(x))}>{x}</button>)}</div></div>
      </div>,
      // Step 4: Job Library
      <div key="s4">
        <div className="st">{t.setup}</div><div className="ss">{t.step} 4 {t.of} {TOTAL_STEPS} - {t.jobLibrary}</div>
        <p style={{fontSize:13,color:"var(--g400)",marginBottom:14}}>{t.preloaded}</p>
        <JobLibrary jobs={jobs} setJobs={setJobs} t={t} showHeading={false}/>
      </div>,

    ];

    return (
      <><style>{CSS}</style>
      <div className="app">
        <div className="hdr"><div className="hdr-logo"><LogoWordmark size={22}/></div></div>
        <div className="ct">
          <div className="steps">{Array.from({length:TOTAL_STEPS},(_,i)=>i+1).map(i=><div key={i} className={`sd ${i<step?"done":i===step?"active":""}`}/>)}</div>
          {stepContent[step-1]}
          <div style={{height:20}}/>
          <button className="btn bp" onClick={async ()=>{
              if(step<TOTAL_STEPS){
                setStep(s=>s+1);
              } else {
                // Final sync of all profile data to Supabase on setup completion
                if(currentUser?.id) {
                  await sb.from("profiles").update({
                    profile_data: profile,
                    jobs_data: allJobs,
                    industry: industry,
                  }).eq("id", currentUser.id);
                }
                setStep(0); setTab("quote"); setRoute("app");
              }
            }}>
            {step===TOTAL_STEPS?t.saveProfile:t.continue}
          </button>
          <button className="btn bg mt8" onClick={()=>{ if(step>1){setStep(s=>s-1);}else{setRoute("industry");setStep(0);} }}>{t.back}</button>
        </div>
      </div>
      
      </>
    );
  }

  // ─── MAIN APP ───────────────────────────────────────────────────────────────
  const mc = result ? marginMeta(result.margin) : null;

  return (
    <><style>{CSS}</style>
    <div className="app">
      <div className="hdr">
        <div className="hdr-logo"><LogoWordmark size={22}/></div>
        <div className="hdr-user" style={{cursor:"pointer",display:"flex",alignItems:"center",gap:6}} onClick={()=>{setTab("settings");setSettView("main");}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"var(--green)",flexShrink:0}}/>
          <span>{currentUser?.firstName}</span>
        </div>
      </div>

      {trial.softLock && (
        <div className="soft-banner">
          <div className="soft-banner-text">{t.softLockTitle} - {SOFT_LOCK_DAYS - trial.daysAfter} {t.softLockDays}. {t.softLockBody}</div>
          <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer" className="soft-banner-btn">{t.subscribeNow}</a>
        </div>
      )}

      {showReminder && (
        <div className="reminder-ov">
          <div className="reminder-box">
            
            <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:22,color:"var(--navy)",marginBottom:8}}>{showReminder==="d6"?t.reminderDay6Title:t.reminderDay4Title}</div>
            <div style={{fontSize:14,color:"var(--g600)",marginBottom:20,lineHeight:1.5}}>{showReminder==="d6"?t.reminderDay6Body:t.reminderDay4Body}</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer" style={{display:"block",padding:13,background:"linear-gradient(135deg,var(--green),var(--gdk))",color:"#fff",borderRadius:12,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15,fontWeight:700,textDecoration:"none",textAlign:"center"}} onClick={dismissReminder}>{t.subscribeBtn}</a>
              <button className="btn bg" onClick={dismissReminder}>{t.remindLater}</button>
            </div>
          </div>
        </div>
      )}

      <div className="ct">

        {/* ══ QUOTE ══ */}
        {tab==="quote" && <div className="tab-fade" key="quote">
          <div className="st">{t.priceJob}</div>
          <div className="ss"></div>

          {trial.softLock && <div style={{background:"var(--ylt)",border:"1px solid #FCD34D",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:13,color:"var(--yellow)",lineHeight:1.5}}>{t.softLockBody}</div>}

          {!trial.softLock && <>
            {/* Defaults banner */}
            {!defaultsBannerDismissed && !currentUser?.first_calc_at && (
              <div style={{background:"var(--g50)",border:"1.5px solid var(--g200)",borderRadius:10,padding:"10px 14px",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <div style={{fontSize:12,color:"var(--g600)",fontWeight:500,flex:1}}>
                  {lang==="es"?"Estos son valores predeterminados. Actualízalos en Configuración.":"These are defaults. Update them in Settings anytime."}
                </div>
                <button onClick={()=>setDefaultsBannerDismissed(true)} style={{background:"none",border:"none",color:"var(--g400)",fontSize:18,cursor:"pointer",flexShrink:0,lineHeight:1,padding:"0 4px"}}>×</button>
              </div>
            )}

            {/* 1 Job Type */}
            <div className="card">
              <div className="ct2">{t.jobType}</div>
              <div className="fi" style={{marginBottom:0}}><select value={selJob} onChange={e=>selectJob(e.target.value)}><option value="">{t.selectJob}</option>{jobs.map(j=><option key={j.id} value={String(j.id)}>{j.name}</option>)}</select></div>
            </div>

            {/* 2 Crew & Wage */}
            <div className="card">
              <div className="ct2">{t.crewWage}</div>
              <div className="fi">
                <label className="lb">{t.crewSize}</label>
                <div className="tg">{[1,2,3,4,5,6,7,8,9,10].map(x=><button key={x} className={`tb ${profile.crewSize===String(x)?"on":""}`} style={{flex:"0 0 calc(20% - 6px)",minWidth:36}} onClick={()=>{ps("crewSize",String(x));setResult(null);}}>{x}</button>)}</div>
              </div>
              <div className="fi" style={{marginBottom:0}}>
                <label className="lb">{t.laborRate}</label>
                <div className="px" style={{borderColor:showRequired&&!pf(profile.laborRate)?"var(--red)":undefined}}><span className="pxs">$</span><input type="number" min="0" value={profile.laborRate} onChange={e=>{ps("laborRate",e.target.value);setResult(null);setShowRequired(false);}} placeholder="18.00"/></div>
                {showRequired&&!pf(profile.laborRate)&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>Hourly rate required</div>}
                <div className="ht">{t.perPerson}</div>
              </div>
            </div>

            {/* 3 Job Details */}
            <div className="card">
              <div className="ct2">{t.jobDetails}</div>
              <div className="r2">
                <div className="fi" style={{marginBottom:0}}><label className="lb">{t.hoursOnSite}</label><input type="number" min="0" step="0.5" value={hours} onChange={e=>{setHours(e.target.value);setResult(null);}} placeholder="2"/></div>
                <div className="fi" style={{marginBottom:0}}>
                  <label className="lb">{t.matsLabel}</label>
                  <div className="px"><span className="pxs">$</span><input type="number" min="0" value={mats} onChange={e=>{setMats(e.target.value);setResult(null);}} placeholder="0"/></div>
                </div>
              </div>
            </div>

            {/* Adjust Details Accordion */}
            <div style={{marginBottom:8}}>
              <button onClick={()=>setShowAdjust(a=>!a)} style={{width:"100%",background:"var(--g50)",border:"1.5px solid var(--g200)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",fontFamily:"inherit"}}>
                <span style={{fontSize:13,fontWeight:700,color:"var(--g800)"}}>{lang==="es"?"Ajustar Detalles":"Adjust Details"}</span>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11,color:"var(--g400)",fontWeight:500}}>{lang==="es"?"Combustible · Gastos · Frecuencia":"Fuel · Overhead · Frequency"}</span>
                  <span style={{fontSize:14,color:"var(--g400)",transform:showAdjust?"rotate(180deg)":"none",transition:"transform .2s"}}>▾</span>
                </div>
              </button>
              {showAdjust&&(
                <div style={{border:"1.5px solid var(--g200)",borderTop:"none",borderRadius:"0 0 10px 10px",padding:"12px 0 0"}}>

            {/* 4 Distance */}
            <div className="card">
              <div className="ct2">{t.driveDistance}</div>
              <div className="tg" style={{marginBottom:11}}>
                {[{k:"short",l:t.short},{k:"medium",l:t.medium},{k:"long",l:t.long}].map(d=>(
                  <button key={d.k} className={`tb ${tier===d.k?"on":""}`} onClick={()=>{setTier(d.k);setExactMi("");setResult(null);}}>{d.l}</button>
                ))}
              </div>
              <div className="fi" style={{marginBottom:0}}>
                <label className="lb" style={{fontSize:12}}>{t.exactMiles}</label>
                <input type="number" min="0" value={exactMi} onChange={e=>{setExactMi(e.target.value);setResult(null);}} placeholder={lang==="es"?`Por defecto: ${TIER_ONE_WAY[tier]} mi de ida`:`Default: ${TIER_ONE_WAY[tier]} mi one-way`}/>
                <div className="ht">{t.exactHint}</div>
              </div>
            </div>

            {/* 5 Vehicles */}
            <div className="card">
              <div className="ct2">{t.vehiclesOnJob}</div>
              <div className="tg">{[1,2,3,4,5].map(x=><button key={x} className={`tb ${vehs===String(x)?"on":""}`} onClick={()=>{setVehs(String(x));setResult(null);}}>{x}</button>)}</div>
            </div>

            {/* 5b Overhead */}
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div className="ct2" style={{marginBottom:0}}>{t.overheadLabel}</div>
                <div className="tg" style={{width:"auto",gap:5}}>
                  <button className={`tb ${qOverheadMode==="none"?"on":""}`} style={{padding:"4px 10px",flex:"none",fontSize:11}} onClick={()=>{setQOverheadMode("none");setResult(null);}}>{t.overheadNone}</button>
                  <button className={`tb ${qOverheadMode==="pct"?"on":""}`} style={{padding:"4px 10px",flex:"none",fontSize:11}} onClick={()=>{setQOverheadMode("pct");setResult(null);}}>%</button>
                  <button className={`tb ${qOverheadMode==="flat"?"on":""}`} style={{padding:"4px 10px",flex:"none",fontSize:11}} onClick={()=>{setQOverheadMode("flat");setResult(null);}}>$</button>
                </div>
              </div>
              {qOverheadMode==="pct" && <div className="fi" style={{marginBottom:0}}><div className="sx"><input type="number" min="0" max="100" value={qOverheadPct} onChange={e=>{setQOverheadPct(e.target.value);setResult(null);}}/><span className="sxs">%</span></div><div className="ht">{t.overheadHint}</div></div>}
              {qOverheadMode==="flat" && <div className="fi" style={{marginBottom:0}}><div className="px"><span className="pxs">$</span><input type="number" min="0" value={qOverheadFlat} onChange={e=>{setQOverheadFlat(e.target.value);setResult(null);}}/></div><div className="ht">Flat overhead per job</div></div>}
            </div>

              {/* 5c Job Cadence */}
              <div className="card">
                <div className="ct2">{lang==="es"?"Frecuencia del Trabajo":"Job Frequency"}</div>
                <div className="tg" style={{flexWrap:"wrap"}}>
                  {[{k:"once",l:lang==="es"?"Una Vez":"One-Time"},{k:"weekly",l:lang==="es"?"Semanal":"Weekly"},{k:"biweekly",l:lang==="es"?"Quincenal":"Bi-Weekly"},{k:"monthly",l:lang==="es"?"Mensual":"Monthly"},{k:"custom",l:lang==="es"?"Personalizado":"Custom"}].map(c=>(
                    <button key={c.k} className={`tb ${cadence===c.k?"on":""}`} style={{flex:"0 0 calc(33% - 4px)",fontSize:12,marginBottom:4}} onClick={()=>{setCadence(c.k);setResult(null);}}>
                      {c.l}
                    </button>
                  ))}
                </div>
                {cadence==="custom"&&<div className="fi" style={{marginBottom:0,marginTop:10}}><input type="text" value={customCadence} onChange={e=>{setCustomCadence(e.target.value);setResult(null);}} placeholder={lang==="es"?"ej. Cada 3 semanas":"e.g. Every 3 weeks"}/></div>}
              </div>

            {/* 6 Gas */}
            <div className="card">
              <div className="ct2">{t.gasPriceLabel}</div>
              <div className="px" style={{borderColor:showRequired&&!pf(gasPrice)?"var(--red)":undefined}}>
                <span className="pxs">$</span>
                <input type="number" step="0.01" min="0" value={gasPrice} onChange={e=>{setGasPrice(e.target.value);setResult(null);setShowRequired(false);}} placeholder={t.enterManual}/>
              </div>
              {showRequired&&!pf(gasPrice)&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>{lang==="es"?"Precio de combustible requerido":"Fuel price required"}</div>}

            </div>

                </div>
              )}
            </div>

            {/* Calculate */}
            <button className="btn bn" onClick={()=>{ if(!canCalc){ setShowRequired(true); if(!gasPrice||pf(gasPrice)<=0) setShowAdjust(true); return; } setShowRequired(false); doCalc(); setTimeout(()=>{document.getElementById("quote-result")?.scrollIntoView({behavior:"smooth",block:"start"})},150); }}>{t.calculate}</button>

            {result && <>
              <div id="quote-result" style={{height:6}}/>
              {currentUser?.first_calc_at && !currentUser?._shownFirstMoment && (
                <div style={{padding:"14px 16px",marginBottom:10,borderRadius:10,background:"var(--navy)"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:4,lineHeight:1.4}}>
                    {lang==="es"?"La mayoría hubiera cobrado menos. Esa diferencia es tu ganancia.":"Most new operators would have guessed lower. That gap is your profit."}
                  </div>
                </div>
              )}
              <div style={{background:"var(--green)",borderRadius:10,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
                <span style={{color:"#fff",fontWeight:700,fontSize:14}}>{lang==="es"?"Tu cotización lista. Ver abajo.":"Your quote is ready. See below."}</span>
              </div>

              {/* Price card */}
              {cadence !== "once" && (
                <div className="tg" style={{marginBottom:8,gap:6}}>
                  <button className={`tb ${resultView==="single"?"on":""}`} style={{fontSize:12}} onClick={()=>setResultView("single")}>{lang==="es"?"Trabajo Unico":"Single Job"}</button>
                  <button className={`tb ${resultView==="recurring"?"on":""}`} style={{fontSize:12}} onClick={()=>setResultView("recurring")}>
                    {cadence==="weekly"?(lang==="es"?"Semanal":"Weekly"):cadence==="biweekly"?(lang==="es"?"Quincenal":"Bi-Weekly"):cadence==="monthly"?(lang==="es"?"Mensual":"Monthly"):customCadence||(lang==="es"?"Recurrente":"Recurring")}
                  </button>
                </div>
              )}
              <div className="rc" style={{position:"relative"}}>
                <div style={{position:"absolute",top:14,right:14,display:"flex",alignItems:"baseline",gap:0,opacity:.5}}>
                  <span style={{fontWeight:800,fontSize:18,color:"#fff"}}>Listo</span>
                  <span style={{fontWeight:800,fontSize:18,color:"var(--green)"}}>Bid</span>
                </div>
                {resultView==="recurring"&&cadence!=="once"?(()=>{
                  const mult=cadence==="weekly"?52:cadence==="biweekly"?26:cadence==="monthly"?12:1;
                  const period=cadence==="weekly"?lang==="es"?"Anual (Semanal)":lang==="es"?"Valor Anual (Semanal)":"52-Week Value":cadence==="biweekly"?lang==="es"?"Anual (Quincenal)":lang==="es"?"Valor Anual (Quincenal)":"26-Week Value":cadence==="monthly"?lang==="es"?"Anual (Mensual)":lang==="es"?"Valor Anual (Mensual)":"12-Month Value":(customCadence||"Recurring").toUpperCase();
                  return(<>
                    <div className="rl">PROJECTED {period.toUpperCase()}</div>
                    <div className="rp"><span className="rp-dollar">$</span>{Math.round(result.price*mult).toLocaleString()}</div>
                    <div className="rrow">
                      <div className="ri"><div className="ri-l">Per Job</div><div className="ri-v">${result.price}</div></div>
                      <div className="ri"><div className="ri-l">Annual Profit</div><div className="ri-v" style={{color:"var(--green)"}}>${Math.round(result.profit*mult).toLocaleString()}</div></div>
                    </div>
                  </>);
                })():(<>
                  <div className="rl">{t.yourPrice}</div>
                  <div className="rp"><span className="rp-dollar">$</span><AnimatedNumber value={Math.round(parseFloat(result.price)||0)} duration={900}/></div>
                  <div className="rrow">
                    <div className="ri"><div className="ri-l">{t.yourCost}</div><div className="ri-v">${Math.round(result.cost)}</div></div>
                    <div className="ri">
                      <div className="ri-l" style={{color:"var(--green)",fontWeight:700}}>{t.yourProfit}</div>
                      <div className="ri-v" style={{color:"#3DC43C",fontWeight:800,fontSize:20}}>
                        $<AnimatedNumber value={Math.round(result.profit||0)} duration={900}/>
                      </div>
                    </div>
                  </div>
                </>)}
                <div className="mpill" style={{background:mc.bg}}>
                  <div className="mdot" style={{background:mc.fg}}/>
                  <span style={{color:mc.fg}}>{roundPct(margin)}% {t.marginLabel} - {lang==="es"?mc.es:mc.en}</span>
                </div>
              </div>

              {/* Margin Slider */}
              <div className="card">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div className="ct2" style={{marginBottom:0}}>{t.adjustMargin}</div>
                  <div className="tg" style={{width:"auto",gap:5}}>
                    <button className={`tb ${qMarginMode==="pct"?"on":""}`} style={{padding:"4px 10px",flex:"none",fontSize:11}} onClick={()=>{
                      setQMarginMode("pct");
                      const curMargin = result ? Math.round(result.margin) : margin;
                      setMargin(curMargin);
                      const newP = {...buildP(curMargin), marginMode:"pct"};
                      if(canCalc){const r=calcQuote(newP);setResult(r);setMargin(Math.round(r.margin));}
                    }}> % </button>
                    <button className={`tb ${qMarginMode==="dollar"?"on":""}`} style={{padding:"4px 10px",flex:"none",fontSize:11}} onClick={()=>{
                      setQMarginMode("dollar");
                      const newP = {...buildP(margin), marginMode:"dollar", targetDollar:qTargetDollar};
                      if(canCalc){const r=calcQuote(newP);setResult(r);setMargin(Math.round(r.margin));}
                    }}> $ </button>
                  </div>
                </div>
                {qMarginMode==="pct"
                  ? <><div className="sl-pct">{roundPct(margin)}%</div><input type="range" min="1" max="99" step="0.5" value={margin} onChange={e=>onSlider(parseFloat(e.target.value))}/><div className="sl-ends"><span>1%</span><span>99%</span></div><div className="sl-hint">{t.slideHint}</div></>
                  : <><label className="lb">{t.targetDollar}</label><div className="px"><span className="pxs">$</span><input type="number" min="0" value={qTargetDollar} onChange={e=>{
                      const v=e.target.value;
                      setQTargetDollar(v);
                      if(canCalc){
                        const r=calcQuote({...buildP(margin),marginMode:"dollar",targetDollar:v});
                        setResult({...r,profit:parseFloat(v)||0});
                        setMargin(Math.round(r.margin));
                      }
                    }}/></div><div className="ht" style={{marginTop:6}}>{t.slideHint}</div></>
                }
              </div>

              {/* Breakdown */}
              <div className="card">
                <div className="ct2">{t.breakdown}</div>
                <div className="bk"><span className="bk-l">{t.laborCost}</span><span className="bk-v">{$v(result.labor)}</span></div>
                <div className="bk">
                  <span className="bk-l">{t.fuelCost} </span>
                  <span className="bk-v">{$v(result.fuel)}</span>
                </div>
                <div className="bk"><span className="bk-l">{t.matsLabel}</span><span className="bk-v">{$v(result.mats)}</span></div>
                {result.overhead > 0 && <div className="bk"><span className="bk-l">{t.overheadCost} {qOverheadMode==="pct"?`(${qOverheadPct}% of labor)`:"(flat)"}</span><span className="bk-v">{$v(result.overhead)}</span></div>}
                <div className="bk bk-tot"><span className="bk-l">{t.totalCost}</span><span className="bk-v">{$v(result.cost)}</span></div>
              </div>

              {/* Post-result */}
              {!showAct
                ? <button className="btn bp" onClick={()=>setShowSave(true)}>{lang==="es"?"Guardar en Registro":"Save to Log"}</button>
                : null
              }
            </>}
          {trial.softLock && <button className="btn bn mt8" onClick={()=>setTab("log")}>{t.viewLog}</button>}

          {/* Post-save success message */}
          {saveSuccess && (
            <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"var(--navy)",borderRadius:14,padding:"16px 20px",boxShadow:"0 8px 32px rgba(0,0,0,.25)",zIndex:400,minWidth:280,maxWidth:360}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <div style={{width:36,height:36,background:"var(--green)",borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{fontWeight:700,fontSize:14,color:"#fff"}}>{lang==="es"?"Cotización guardada.":"Quote saved."}</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn bp" style={{flex:1,fontSize:12,padding:"8px 10px"}} onClick={()=>{setSaveSuccess(null);reset();setTab("quote");}}>
                  {lang==="es"?"Nueva Cotización":"Price Another Job"}
                </button>
                <button className="btn bg" style={{flex:1,fontSize:12,padding:"8px 10px",borderColor:"rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)"}} onClick={()=>{setSaveSuccess(null);setTab("log");}}>
                  {lang==="es"?"Ver Registro":"View My Log"}
                </button>
              </div>
            </div>
          )}
          </>}
        </div>}

        {/* ══ LOG ══ */}
        {tab==="log" && <div className="tab-fade" key="log">
          <div className="st">{t.quoteLog}</div>

          {/* Booked jobs summary */}
          {(() => {
            const booked = log.filter(q => q.converted);
            if (booked.length === 0) return null;
            const now = new Date();
            const weekStart  = new Date(now - 7*24*60*60*1000);
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const inclOne    = profile.includeOneTime !== false;
            const filterJobs = (arr) => inclOne ? arr : arr.filter(q => q.cadence && q.cadence !== "once");
            const weekJobs   = filterJobs(booked.filter(q => new Date(q.date) >= weekStart));
            const monthJobs  = filterJobs(booked.filter(q => new Date(q.date) >= monthStart));
            const isWeek     = statPeriod === "weekly";
            const jobs       = isWeek ? weekJobs : monthJobs;
            const rev        = jobs.reduce((s,q) => s + (q.price||0), 0);
            const profit     = jobs.reduce((s,q) => s + (q.profit||0), 0);
            return (
              <div style={{background:"var(--navy)",borderRadius:14,padding:"16px",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"rgba(255,255,255,.45)"}}>{lang==="es"?"Trabajos Confirmados":"Booked Jobs"}</div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>setStatPeriod("weekly")} style={{padding:"4px 10px",borderRadius:6,border:"none",background:isWeek?"var(--green)":"rgba(255,255,255,.1)",color:isWeek?"#fff":"rgba(255,255,255,.45)",fontFamily:"inherit",fontSize:11,fontWeight:700,cursor:"pointer"}}>{lang==="es"?"Semana":"Week"}</button>
                    <button onClick={()=>setStatPeriod("monthly")} style={{padding:"4px 10px",borderRadius:6,border:"none",background:!isWeek?"var(--green)":"rgba(255,255,255,.1)",color:!isWeek?"#fff":"rgba(255,255,255,.45)",fontFamily:"inherit",fontSize:11,fontWeight:700,cursor:"pointer"}}>{lang==="es"?"Mes":"Month"}</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <div style={{background:"rgba(255,255,255,.07)",borderRadius:10,padding:"12px"}}>
                    <div style={{fontWeight:800,fontSize:22,color:"#fff",lineHeight:1}}>${Math.round(rev).toLocaleString()}</div>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:".8px",textTransform:"uppercase",color:"rgba(255,255,255,.35)",marginTop:3}}>{lang==="es"?"Ingresos":"Revenue"}</div>
                  </div>
                  <div style={{background:"rgba(255,255,255,.07)",borderRadius:10,padding:"12px"}}>
                    <div style={{fontWeight:800,fontSize:22,color:"var(--green)",lineHeight:1}}>${Math.round(profit).toLocaleString()}</div>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:".8px",textTransform:"uppercase",color:"rgba(255,255,255,.35)",marginTop:3}}>{lang==="es"?"Ganancia":"Profit"}</div>
                  </div>
                </div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.3)",textAlign:"right"}}>
                  {jobs.length} booked job{jobs.length!==1?"s":""}
                  {!inclOne&&" (recurring only)"}
                </div>
              </div>
            );
          })()}

          <div className="ss" style={{marginBottom:10}}>{log.length} saved</div>
          {/* Job history insight card */}
          {historyJobType&&(()=>{
            const jobQ  = log.filter(q=>q.jobType===historyJobType);
            const bookQ = jobQ.filter(q=>q.converted);
            const avg   = (arr,k) => arr.length ? Math.round(arr.reduce((s,q)=>s+(q[k]||0),0)/arr.length) : 0;
            return (
              <div style={{background:"var(--navy)",borderRadius:12,padding:"14px",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#fff"}}>{historyJobType}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,.35)"}}>avg of {jobQ.length} quote{jobQ.length!==1?"s":""} · <span style={{color:"var(--green)"}}>{bookQ.length} booked</span></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {[
                    {val:`$${avg(jobQ,"price")}`,label:lang==="es"?"Precio Prom.":"Avg Price"},
                    {val:`$${avg(jobQ,"profit")}`,label:lang==="es"?"Ganancia Prom.":"Avg Profit",green:true},
                    {val:`${avg(jobQ,"margin")}%`,label:lang==="es"?"Margen Prom.":"Avg Margin"},
                  ].map((s,i)=>(
                    <div key={i} style={{background:"rgba(255,255,255,.07)",borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
                      <div style={{fontWeight:800,fontSize:18,color:s.green?"var(--green)":"#fff",lineHeight:1}}>{s.val}</div>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:".6px",textTransform:"uppercase",color:"rgba(255,255,255,.35)",marginTop:3}}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {[{k:"all",l:"All"},{k:"converted",l:"Booked"},{k:"notConverted",l:"Pending"},{k:"byDate",l:"By Date"}].map(f=>(
              <button key={f.k} className={`tb ${logFilter===f.k?"on":""}`} style={{flex:"none",padding:"6px 12px",fontSize:12}} onClick={()=>setLogFilter(f.k)}>{f.l}</button>
            ))}
            {/* Job Type dropdown */}
            {[...new Set(log.map(q=>q.jobType).filter(Boolean))].length>0&&(
              <select value={historyJobType||""} onChange={e=>setHistoryJobType(e.target.value||null)}
                style={{flex:"none",padding:"6px 10px",fontSize:12,border:"1.5px solid var(--g200)",borderRadius:8,background:historyJobType?"var(--navy)":"var(--g50)",color:historyJobType?"#fff":"var(--g600)",fontFamily:"inherit",fontWeight:600,cursor:"pointer"}}>
                <option value="">{lang==="es"?"Tipo de Trabajo":"Job Type"}</option>
                {[...new Set(log.map(q=>q.jobType).filter(Boolean))].map(jt=>(
                  <option key={jt} value={jt}>{jt}</option>
                ))}
              </select>
            )}
          </div>
          {log.length===0
            ? <div className="empty"><div style={{fontSize:38,marginBottom:10}}></div><div>{t.noQuotes}</div></div>
            : [...log]
                .filter(q=>{
                    if(logFilter==="converted") return q.converted;
                    if(logFilter==="notConverted") return !q.converted;
                    return true;
                  })
                  .sort((a,b)=>logFilter==="byDate"?new Date(b.date)-new Date(a.date):b.id-a.id)
                .map(q=>{
                  const qm=marginMeta(q.margin);
                  return (
                    <div className="li" key={q.id} style={{border:q.converted?"2px solid var(--green)":"1px solid var(--g200)",background:q.converted?"var(--glt)":"var(--g50)"}}>
                      <div className="li-hdr">
                        <div style={{flex:1,minWidth:0}}>
                          <div className="li-name">{q.name}</div>
                          <div className="li-meta">{q.jobType} · {q.date}</div>
                          {q.address&&<div style={{fontSize:11,color:"var(--g400)",marginTop:2}}>📍 {q.address}</div>}
                          {q.industry&&q.industry!=="landscaping"&&<div style={{fontSize:11,color:"var(--g400)",marginTop:2}}>{INDUSTRY_TEMPLATES[q.industry]?.en.name}</div>}
                        </div>
                        <div className="li-price">${q.price}</div>
                      </div>
                      <div className="li-pills" style={{marginBottom:8}}>
                        <span className="pill" style={{background:qm.bg,color:qm.fg}}>{roundPct(q.margin)}% margin</span>
                        <span style={{fontSize:12,color:"var(--g400)"}}>${Math.round(q.profit)} profit</span>
                        {q.converted&&<span className="pill" style={{background:"var(--green)",color:"#fff",fontSize:11}}>Converted</span>}
                      </div>
                      {q.notes&&<div className="li-notes">{q.notes}</div>}
                      <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                        <button className="btn bsm bg" style={{fontSize:11}} onClick={()=>setEditingQuote({...q})}>{t.editQuote}</button>
                        <button className="btn bsm" style={{fontSize:11,background:q.converted?"var(--g100)":"var(--green)",color:q.converted?"var(--g600)":"#fff",border:"none"}} onClick={()=>updateQuote(q.id,{converted:!q.converted})}>{q.converted?t.unmarkConverted:t.markConverted}</button>
                        <button className="btn bsm bg" style={{fontSize:11}} onClick={()=>setSharingQuote(q)}>{lang==="es"?"Compartir":"Share"}</button>
                        <button className="btn bsm bd" style={{fontSize:11}} onClick={()=>deleteQuote(q.id)}>{t.deleteQuote}</button>
                      </div>
                    </div>
                  );
                })
          }
          {editingQuote&&(
            <div className="ov" onClick={()=>setEditingQuote(null)}>
              <div className="mo" onClick={e=>e.stopPropagation()} style={{maxHeight:"85dvh",overflowY:"auto"}}>
                <div className="mo-t">Edit Quote</div>
                <div className="fi"><label className="lb">{t.jobLabel}</label><input type="text" value={editingQuote.name} onChange={e=>setEditingQuote(q=>({...q,name:e.target.value}))}/></div>
                <div className="fi"><label className="lb">{t.addressLabel} <span style={{color:"var(--g400)",fontWeight:400}}>{t.addressOpt}</span></label><AddressInput value={editingQuote.address||""} onChange={v=>setEditingQuote(q=>({...q,address:v}))}/></div>
                <div className="fi" style={{marginBottom:0}}><label className="lb">{t.notes} <span style={{color:"var(--g400)",fontWeight:400}}>{t.notesOpt}</span></label><textarea rows={3} value={editingQuote.notes||""} onChange={e=>setEditingQuote(q=>({...q,notes:e.target.value}))}/></div>
                <div className="mo-b">
                  <button className="btn bg" onClick={()=>setEditingQuote(null)}>{t.cancel}</button>
                  <button className="btn bp" onClick={()=>{updateQuote(editingQuote.id,{name:editingQuote.name,notes:editingQuote.notes,address:editingQuote.address});setEditingQuote(null);}}>{t.save}</button>
                </div>
              </div>
            </div>
          )}
        </div>}

        {/* ══ SETTINGS ══ */}
        {tab==="settings" && <div className="tab-fade" key="settings">
          {settView==="main" && <>
            <div className="st">{t.settings}</div>
            <div className="ss">{t.version}</div>
            {(!profile.businessName||!profile.laborRate)&&(
              <div style={{background:"var(--navy)",borderRadius:14,padding:"18px",marginBottom:14}}>
                <div style={{fontWeight:800,fontSize:15,color:"#fff",marginBottom:6}}>{lang==="es"?"Completa tu Perfil":"Complete Your Profile"}</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:14,lineHeight:1.4}}>{lang==="es"?"Agrega tu nombre y tarifa para cotizaciones más precisas.":"Add your business name and rate for more accurate quotes."}</div>
                <button className="btn bp" style={{fontSize:13}} onClick={()=>setSettView("profile")}>{lang==="es"?"Configurar Ahora":"Set Up Now"} ›</button>
              </div>
            )}

            {currentUser.accountType==="paid"&&<div style={{background:"var(--glt)",border:"1px solid #A7F3D0",borderRadius:10,padding:"12px 16px",marginBottom:12,fontSize:13,color:"var(--gdk)",fontWeight:600}}>Active Subscriber</div>}
            {currentUser.accountType !== "paid" && (
              <div style={{background:"var(--glt)",border:"1px solid #A7F3D0",borderRadius:10,padding:"12px 16px",marginBottom:12,fontSize:13,color:"var(--gdk)",fontWeight:600}}>{lang==="es"?"Acceso Gratuito":"Free Access"}</div>
            )}
            <div className="card">
              <div className="sr" style={{cursor:"pointer"}} onClick={()=>setSettView("account")}><span className="sr-l">{lang==="es"?"Cuenta":"Account"}</span><span className="sr-v">›</span></div>
              <div className="sr" style={{cursor:"pointer"}} onClick={()=>setSettView("profile")}><span className="sr-l">{t.editProfile}</span><span className="sr-v">›</span></div>
              <div className="sr" style={{cursor:"pointer"}} onClick={()=>setSettView("jobs")}><span className="sr-l">{t.manageJobs}</span><span className="sr-v">{lang==="es"?`${jobs.length} tipos`:`${jobs.length} types`} ›</span></div>
              <div className="sr" style={{cursor:"pointer"}} onClick={()=>setSettView("industry")}><span className="sr-l">{t.industryLabel}</span><span className="sr-v">{INDUSTRY_TEMPLATES[industry]?.[lang]?.name||INDUSTRY_TEMPLATES[industry]?.en.name} ›</span></div>
              <div className="sr" style={{cursor:"default"}}>
                <span className="sr-l">{t.language}</span>
                <div className="tg" style={{width:"auto",gap:5}}>
                  <button className={`tb ${lang==="en"?"on":""}`} style={{padding:"5px 10px",flex:"none",fontSize:12}} onClick={()=>{setLang("en");LS.set("lb_lang","en");}}>English</button>
                  <button className={`tb ${lang==="es"?"on":""}`} style={{padding:"5px 10px",flex:"none",fontSize:12}} onClick={()=>{setLang("es");LS.set("lb_lang","es");}}>Español</button>
                </div>
              </div>
              <div className="sr" style={{cursor:"default"}}><span className="sr-l">{t.support}</span><span style={{fontSize:12,color:"var(--g400)",userSelect:"text"}}>{t.supportEmail}</span></div>
              <div className="sr" style={{cursor:"pointer"}} onClick={()=>window.open("https://www.facebook.com/profile.php?id=61590502810704","_blank")}>
                <span className="sr-l" style={{display:"flex",alignItems:"center",gap:6}}><IcoFacebook size={15} color="var(--g600)"/>Facebook</span>
                <span className="sr-v" style={{fontSize:12,color:"var(--g400)"}}>ListoBid ›</span>
              </div>
              <div className="sr" style={{cursor:"pointer"}} onClick={()=>window.open("https://instagram.com/listobid","_blank")}>
                <span className="sr-l" style={{display:"flex",alignItems:"center",gap:6}}><IcoInstagram size={15} color="var(--g600)"/>Instagram</span>
                <span className="sr-v" style={{fontSize:12,color:"var(--g400)"}}>@listobid ›</span>
              </div>
              <div className="sr" style={{cursor:"pointer"}} onClick={()=>setShowLegal(true)}><span className="sr-l">Legal</span><span className="sr-v">›</span></div>

            </div>
            {currentUser.email === ADMIN_EMAIL && (
              <button className="btn bg mt8" style={{fontSize:12,color:"var(--g400)"}} onClick={()=>setRoute("admin")}>Admin Portal</button>
            )}
            <button className="btn bg mt8" style={{color:"var(--red)",borderColor:"#FECACA"}} onClick={handleLogout}>{t.logout}</button>
          </>}

          {settView==="profile" && <>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:17}}>
              <button className="btn bsm bg" onClick={()=>setSettView("main")}>← {t.back}</button>
              <div className="st" style={{margin:0}}>{t.editProfile}</div>
            </div>
            <div className="card">
              <div className="fi"><label className="lb">Business Name <span style={{fontSize:11,color:"var(--g400)",fontWeight:400}}>(optional)</span></label><input type="text" value={profile.businessName||""} onChange={e=>ps("businessName",e.target.value)} placeholder="e.g. Garcia Landscaping"/></div>
              <div className="fi"><label className="lb">{t.laborRate}</label><div className="px"><span className="pxs">$</span><input type="number" min="0" value={profile.laborRate} onChange={e=>ps("laborRate",e.target.value)}/></div></div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderTop:"1px solid var(--g100)",marginTop:4}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--g800)"}}>Include one-time jobs in summary</div>
                  <div style={{fontSize:12,color:"var(--g400)",marginTop:2}}>Adds one-time booked jobs to your revenue and profit totals</div>
                </div>
                <div onClick={()=>ps("includeOneTime",!profile.includeOneTime)} style={{width:44,height:26,borderRadius:13,background:profile.includeOneTime?"var(--green)":"var(--g200)",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:3,left:profile.includeOneTime?21:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
                </div>
              </div>
              <div className="fi"><label className="lb">{t.crewSize}</label><div className="tg">{[1,2,3,4,5,6,7,8,9,10].map(x=><button key={x} className={`tb ${profile.crewSize===String(x)?"on":""}`} style={{flex:"0 0 calc(20% - 6px)",minWidth:36}} onClick={()=>ps("crewSize",String(x))}>{x}</button>)}</div></div>
              <div className="fi"><label className="lb">{t.marginMode}</label>
                <div className="tg">
                  <button className={`tb ${profile.marginMode!=="dollar"?"on":""}`} onClick={()=>ps("marginMode","pct")}>% {t.marginPct}</button>
                  <button className={`tb ${profile.marginMode==="dollar"?"on":""}`} onClick={()=>ps("marginMode","dollar")}>$ {t.marginDollar}</button>
                </div>
              </div>
              {profile.marginMode!=="dollar"?<div className="fi"><label className="lb">{t.targetMargin}</label><div className="sx"><input type="number" min="1" max="99" value={profile.targetMargin} onChange={e=>ps("targetMargin",e.target.value)}/><span className="sxs">%</span></div></div>:<div className="fi"><label className="lb">{t.targetDollar}</label><div className="px"><span className="pxs">$</span><input type="number" min="0" value={profile.targetDollar} onChange={e=>ps("targetDollar",e.target.value)}/></div></div>}
              <div className="fi"><label className="lb">{t.overheadLabel}</label>
                <div className="tg">
                  <button className={`tb ${profile.overheadMode==="none"?"on":""}`} onClick={()=>ps("overheadMode","none")}>{t.overheadNone}</button>
                  <button className={`tb ${profile.overheadMode==="pct"?"on":""}`} onClick={()=>ps("overheadMode","pct")}>{t.overheadPctLabel}</button>
                  <button className={`tb ${profile.overheadMode==="flat"?"on":""}`} onClick={()=>ps("overheadMode","flat")}>{t.overheadFlatLabel}</button>
                </div>
              </div>
              {profile.overheadMode==="pct"&&<div className="fi"><div className="sx"><input type="number" min="0" max="100" value={profile.overheadPct} onChange={e=>ps("overheadPct",e.target.value)}/><span className="sxs">%</span></div><div className="ht">{t.overheadHint}</div></div>}
              {profile.overheadMode==="flat"&&<div className="fi"><div className="px"><span className="pxs">$</span><input type="number" min="0" value={profile.overheadFlat} onChange={e=>ps("overheadFlat",e.target.value)}/></div></div>}


              <div className="fi" style={{marginBottom:0}}><label className="lb">{t.vehicles}</label><div className="tg">{[1,2,3,4,5].map(x=><button key={x} className={`tb ${profile.vehicles===String(x)?"on":""}`} onClick={()=>ps("vehicles",String(x))}>{x}</button>)}</div></div>
            </div>
            <button className="btn bp" onClick={()=>setSettView("main")}>{t.saveProfile}</button>
          </>}

          {settView==="jobs" && <JobLibrary jobs={jobs} setJobs={setJobs} t={t} onBack={()=>setSettView("main")} backLabel={t.back}/>}

          {settView==="account"&&(
            <div>
              <button className="btn bsm bg" style={{marginBottom:16}} onClick={()=>setSettView("main")}>← {t.back}</button>
              <div className="st">{lang==="es"?"Cuenta":"Account"}</div>
              <div style={{background:"var(--navy)",borderRadius:14,padding:"18px",marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"rgba(255,255,255,.4)",marginBottom:12}}>{lang==="es"?"Estado de Cuenta":"Account Status"}</div>
                {currentUser.accountType==="paid"?(
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:"var(--green)",flexShrink:0}}/>
                      <div style={{fontWeight:700,fontSize:15,color:"#fff"}}>{lang==="es"?"Suscriptor Activo":"Active Subscriber"}</div>
                    </div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginBottom:16}}>{lang==="es"?"Suscripcion activa a $9.99/mes.":"Active subscription at $9.99/month."}</div>
                    <a href={STRIPE_PORTAL_LINK} target="_blank" rel="noopener noreferrer"
                      style={{display:"block",padding:"11px",background:"rgba(255,255,255,.1)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:10,color:"#fff",textAlign:"center",fontWeight:700,fontSize:13,textDecoration:"none"}}>
                      {lang==="es"?"Administrar Suscripcion":"Manage Subscription"}
                    </a>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.2)",textAlign:"center",marginTop:6}}>{lang==="es"?"Actualiza tarjeta o cancela aqui.":"Update card or cancel here."}</div>
                  </div>
                ):(
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:"var(--g400)",flexShrink:0}}/>
                      <div style={{fontWeight:700,fontSize:15,color:"#fff"}}>
                        {currentUser.accountType==="trial"
                          ?`${lang==="es"?"Prueba Gratis":"Free Trial"} - ${Math.max(0,TRIAL_DAYS-Math.floor((Date.now()-new Date(currentUser.signupDate))/86400000))} ${lang==="es"?"dias restantes":"days remaining"}`
                          :lang==="es"?"Acceso Gratuito":"Free Access"}
                      </div>
                    </div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginBottom:16}}>{lang==="es"?"Suscribete por $9.99/mes.":"Subscribe for $9.99/month."}</div>
                    <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer"
                      style={{display:"block",padding:"13px",background:"var(--green)",borderRadius:10,color:"#fff",textAlign:"center",fontWeight:800,fontSize:14,textDecoration:"none"}}>
                      {lang==="es"?"Suscribirse - $9.99/mes":"Subscribe - $9.99/mo"}
                    </a>
                  </div>
                )}
              </div>
              <div className="card" style={{marginBottom:12}}>
                <div className="ct2">{lang==="es"?"Correo":"Email"}</div>
                <div style={{fontSize:14,color:"var(--g600)",padding:"2px 0"}}>{currentUser.email}</div>
              </div>
              <button className="btn bg" style={{marginBottom:24}} onClick={async()=>{
                const {error}=await sb.auth.resetPasswordForEmail(currentUser.email,{redirectTo:"https://listobid.com/reset"});
                if(!error) alert(lang==="es"?"Revisa tu correo.":"Check your email for a reset link.");
                else alert("Error. Please try again.");
              }}>{lang==="es"?"Cambiar Contrasena":"Change Password"}</button>
              <div style={{marginTop:8,paddingTop:16,borderTop:"1px solid var(--g200)"}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--g800)",marginBottom:10}}>{lang==="es"?"Administrar Cuenta":"Manage Account"}</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {currentUser.accountType==="paid"?(
                    <>
                      <a href={STRIPE_PORTAL_LINK} target="_blank" rel="noopener noreferrer"
                        style={{display:"block",padding:"11px 14px",background:"var(--g50)",border:"1.5px solid var(--g200)",borderRadius:10,color:"var(--g800)",textDecoration:"none",fontSize:13,fontWeight:600}}>
                        {lang==="es"?"Actualizar Metodo de Pago":"Update Payment Method"} ›
                      </a>
                      <a href={STRIPE_PORTAL_LINK} target="_blank" rel="noopener noreferrer"
                        style={{display:"block",padding:"11px 14px",background:"var(--g50)",border:"1.5px solid var(--g200)",borderRadius:10,color:"var(--g800)",textDecoration:"none",fontSize:13,fontWeight:600}}>
                        {lang==="es"?"Cancelar Suscripcion":"Cancel Subscription"} ›
                      </a>
                    </>
                  ):(
                    <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer"
                      style={{display:"block",padding:"13px 14px",background:"var(--green)",borderRadius:10,color:"#fff",textDecoration:"none",fontSize:13,fontWeight:800,textAlign:"center"}}>
                      {lang==="es"?"Suscribirse - $9.99/mes":"Subscribe - $9.99/mo"}
                    </a>
                  )}
                  <a href="mailto:support@listobid.com?subject=Feedback%20-%20ListoBid"
                    style={{display:"block",padding:"11px 14px",background:"var(--g50)",border:"1.5px solid var(--g200)",borderRadius:10,color:"var(--g800)",textDecoration:"none",fontSize:13,fontWeight:600}}>
                    {lang==="es"?"Enviar Comentarios":"Send Feedback"} ›
                  </a>
                  <button className="btn bd" style={{marginTop:4}} onClick={()=>{
                    const c=window.prompt(lang==="es"?"Escribe ELIMINAR para confirmar:":"Type DELETE to confirm:");
                    if(c==="DELETE"||c==="ELIMINAR"){
                      sb.auth.signOut().then(()=>{
                        sb.from("quotes").delete().eq("user_id",currentUser.id);
                        sb.from("profiles").delete().eq("id",currentUser.id);
                        Object.keys(localStorage).forEach(k=>localStorage.removeItem(k));
                        setCurrentUser(null);setRoute("register");
                      });
                    }
                  }}>{lang==="es"?"Eliminar Cuenta":"Delete Account"}</button>
                  <div style={{fontSize:11,color:"var(--g400)",textAlign:"center"}}>{lang==="es"?"Esta accion no se puede deshacer.":"This action cannot be undone."}</div>
                </div>
              </div>
            </div>
          )}

                    {settView==="industry" && <>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:17}}>
              <button className="btn bsm bg" onClick={()=>setSettView("main")}>← {t.back}</button>
              <div className="st" style={{margin:0}}>{t.industryLabel}</div>
            </div>
            <p style={{fontSize:13,color:"var(--g400)",marginBottom:20}}>{lang==="es"?"Tu biblioteca de cada industria se guarda por separado.":"Each industry's job library is saved separately."}</p>
            <div style={{display:"flex",gap:10}}>
              {Object.entries(INDUSTRY_TEMPLATES).map(([key,tmpl])=>(
                <button key={key} style={{flex:1,padding:"18px 6px",background:industry===key?"var(--glt)":"var(--w)",border:`2px solid ${industry===key?"var(--green)":"var(--g200)"}`,borderRadius:"var(--rad)",cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:"var(--sh)"}}
                  onClick={()=>{setIndustry(key);LS.set("lb_industry",key);setSelJob("");setResult(null);setSettView("main");}}>
                  <div style={{fontSize:26,marginBottom:6}}>{tmpl.en.icon}</div>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--navy)"}}>{tmpl[lang]?.name||tmpl.en.name}</div>
                </button>
              ))}
            </div>
          </>}
        </div>}
      </div>

      <div className="nav">
        <button className={`nb ${tab==="quote"?"on":""}`} onClick={()=>setTab("quote")}><IcoCalc/>{t.nav_quote}</button>
        <button className={`nb ${tab==="log"?"on":""}`} onClick={()=>setTab("log")}><IcoList/>{t.nav_log}</button>
        <button className={`nb ${tab==="settings"?"on":""}`} onClick={()=>{setTab("settings");setSettView("main");}}><IcoGear/>{t.nav_settings}</button>
      </div>
    </div>

    {/* Save Modal */}
    {showSave&&(
      <div className="ov" onClick={()=>setShowSave(false)}>
        <div className="mo" onClick={e=>e.stopPropagation()}>
          <div className="mo-t">{t.saveQuote}</div>
          <div className="fi"><label className="lb">{t.jobLabel}</label><input type="text" value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder={t.jobPlaceholder} autoFocus/></div>
          <div className="fi"><label className="lb">{t.addressLabel} <span style={{color:"var(--g400)",fontWeight:400}}>{t.addressOpt}</span></label><AddressInput value={saveAddress} onChange={setSaveAddress}/></div>
          <div className="fi" style={{marginBottom:0}}><label className="lb">{t.notes} <span style={{color:"var(--g400)",fontWeight:400}}>{t.notesOpt}</span></label><textarea rows={3} value={saveNotes} onChange={e=>setSaveNotes(e.target.value)} placeholder={t.notesPlaceholder}/></div>
          <div className="mo-b">
            <button className="btn bg" onClick={()=>{setShowSave(false);setSaveNotes("");setSaveAddress("");}}>{lang==="es"?"Volver a Editar":"Back to Editing"}</button>
            <button className="btn bp" style={{opacity:saveName.trim()?1:.45}} onClick={saveQuote}>{t.save}</button>
          </div>
        </div>
      </div>
    )}

    {/* Share Quote Modal */}
    {sharingQuote && (
      <div className="ov" onClick={()=>setSharingQuote(null)}>
        <div className="mo" onClick={e=>e.stopPropagation()} style={{background:"#f0f4f8",borderRadius:"20px 20px 0 0",padding:"20px 20px 36px"}}>
          <div style={{background:"var(--navy)",borderRadius:16,padding:"24px 20px",marginBottom:16,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",background:"rgba(61,196,60,.08)"}}/>
            {profile.businessName&&<div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.45)",marginBottom:4}}>{profile.businessName}</div>}
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:14,lineHeight:1.3}}>{sharingQuote.name}</div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"rgba(255,255,255,.35)",marginBottom:3}}>{lang==="es"?"Precio Recomendado":"Recommended Price"}</div>
              <div style={{fontWeight:800,fontSize:48,color:"#fff",lineHeight:1}}>
                <span style={{fontSize:22,verticalAlign:"top",marginTop:7,display:"inline-block"}}>$</span>{sharingQuote.price}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
              {[
                {label:lang==="es"?"Ganancia":"Profit",val:`+$${Math.round(sharingQuote.profit)}`,green:true},
                {label:lang==="es"?"Margen":"Margin",val:`${Math.round(sharingQuote.margin)}%`,green:false},
                {label:lang==="es"?"Fecha":"Date",val:sharingQuote.date,green:false},
              ].map((s,i)=>(
                <div key={i} style={{background:"rgba(255,255,255,.07)",borderRadius:10,padding:"9px 7px",textAlign:"center"}}>
                  <div style={{fontWeight:800,fontSize:14,color:s.green?"var(--green)":"#fff",lineHeight:1}}>{s.val}</div>
                  <div style={{fontSize:9,fontWeight:700,letterSpacing:".5px",textTransform:"uppercase",color:"rgba(255,255,255,.3)",marginTop:3}}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid rgba(255,255,255,.1)"}}>
              <div style={{display:"flex",alignItems:"baseline"}}>
                <span style={{fontWeight:800,fontSize:12,color:"#fff"}}>Listo</span>
                <span style={{fontWeight:800,fontSize:12,color:"var(--green)"}}>Bid</span>
              </div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.3)"}}>listobid.com</div>
            </div>
          </div>
          <button className="btn bp" onClick={()=>{
            const text = `${profile.businessName?profile.businessName+" - ":""}${sharingQuote.name}\nPrice: $${sharingQuote.price} | Profit: +$${Math.round(sharingQuote.profit)} | Margin: ${Math.round(sharingQuote.margin)}%\nDate: ${sharingQuote.date}\nPriced with ListoBid - listobid.com`;
            if(navigator.share){navigator.share({title:"ListoBid Quote",text}).catch(()=>{});}
            else{navigator.clipboard.writeText(text).then(()=>{setSharingQuote(null);});}
          }}>{lang==="es"?"Compartir Cotización":"Share Quote"}</button>
          <button className="btn bg mt8" style={{color:"var(--g600)"}} onClick={()=>setSharingQuote(null)}>{lang==="es"?"Cerrar":"Close"}</button>
        </div>
      </div>
    )}

    {/* Legal Modal */}
    {showLegal&&(
      <div className="ov" onClick={()=>setShowLegal(false)}>
        <div className="mo" onClick={e=>e.stopPropagation()} style={{maxHeight:"85dvh",overflowY:"auto"}}>
          <div className="mo-t">{lang==="es"?"Aviso Legal":"Legal Disclaimer"}</div>
          {lang==="es" ? (
            <>
              <p style={{fontSize:13,color:"var(--g600)",lineHeight:1.7,marginBottom:14}}>ListoBid es una herramienta de estimación de precios diseñada para ayudar a operadores de servicios independientes a calcular cotizaciones sugeridas. Los cálculos son únicamente estimaciones basadas en los datos ingresados y no constituyen asesoramiento financiero, legal ni comercial.</p>
              <p style={{fontSize:13,color:"var(--g600)",lineHeight:1.7,marginBottom:14}}>ListoBid no garantiza la exactitud ni idoneidad de ningún precio calculado. Los precios reales pueden variar según las condiciones del mercado, requisitos legales y otros factores fuera del control de esta aplicación.</p>
              <p style={{fontSize:13,color:"var(--g600)",lineHeight:1.7,marginBottom:14}}>El usuario acepta toda la responsabilidad por los precios que establezca con sus clientes. ListoBid no será responsable de ninguna pérdida, disputa o daño que surja del uso de esta aplicación.</p>
              <p style={{fontSize:13,color:"var(--g600)",lineHeight:1.7,marginBottom:20}}>Al usar ListoBid, usted reconoce haber leído y aceptado estos términos. ListoBid · {new Date().getFullYear()}</p>
            </>
          ) : (
            <>
              <p style={{fontSize:13,color:"var(--g600)",lineHeight:1.7,marginBottom:14}}>ListoBid is a pricing estimation tool designed to help independent field service operators calculate suggested job quotes. All calculations are estimates only, based on user-entered data, and do not constitute financial, legal, or professional advice.</p>
              <p style={{fontSize:13,color:"var(--g600)",lineHeight:1.7,marginBottom:14}}>ListoBid makes no warranty regarding the accuracy, completeness, or suitability of any calculated price for any specific job or market. Actual costs and profitability may vary based on local conditions, regulations, fuel prices, and other factors outside the control of this application.</p>
              <p style={{fontSize:13,color:"var(--g600)",lineHeight:1.7,marginBottom:14}}>The user assumes full responsibility for all pricing decisions made with their clients. ListoBid shall not be liable for any financial loss, dispute, or damages arising from use of this application.</p>
              <p style={{fontSize:13,color:"var(--g600)",lineHeight:1.7,marginBottom:20}}>By using ListoBid, you acknowledge that you have read and agree to these terms. ListoBid · {new Date().getFullYear()}</p>
            </>
          )}
          <button className="btn bp" onClick={()=>setShowLegal(false)}>{lang==="es"?"De Acuerdo":"I Agree"}</button>
        </div>
      </div>
    )}




    </>
  );
}