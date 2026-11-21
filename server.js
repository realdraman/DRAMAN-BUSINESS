const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");
const { promisify } = require("node:util");
const os = require("node:os");

const PORT = Number(process.env.PORT || 4173);
const scrypt = promisify(crypto.scrypt);
const defaultDataDir = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "DRAMAN Loan Services")
  : process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support", "DRAMAN Loan Services")
    : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "draman-loan-services");
const privateDataDir = path.resolve(process.env.DRAMAN_DATA_DIR || defaultDataDir);
const sessionStorePath = path.join(privateDataDir, "sessions.json");
const authStorePath = path.join(privateDataDir, "auth-store.json");
const businessDataPath = path.join(privateDataDir, "business-data.json");
const bootstrapCredentialsPath = path.join(privateDataDir, "first-admin-credentials.txt");
const passwordResetOutboxPath = path.join(privateDataDir, "password-reset-outbox");
const publicFiles = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app.jsx": "app.jsx",
  "/styles.css": "styles.css",
  "/draman-logo.svg": "draman-logo.svg"
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/babel; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const todayIso = () => new Date().toISOString();
const dateOnly = (date) => new Date(date).toISOString().slice(0, 10);
const money = (value) => Number.parseFloat(value || 0);

const db = {
  users: [],
  customers: [],
  guarantors: [],
  loans: [],
  payments: [],
  penalties: [],
  inventory: [
    {
      id: 1,
      product_name: "Office Desk",
      category: "Office furniture",
      quantity: 8,
      buying_price: 9000,
      selling_price: 13500,
      description: "Sturdy office desk suitable for home offices, loan offices, or small retail counters.",
      condition: "Second-hand good",
      serial_number: "FUR-OD-001",
      image: "",
      created_at: "2026-03-14T08:00:00.000Z"
    },
    {
      id: 2,
      product_name: "Samsung 43 inch TV",
      category: "TVs",
      quantity: 2,
      buying_price: 21000,
      selling_price: 29500,
      description: "Clear display television with tested ports, remote support, and installment-sale potential.",
      condition: "Used excellent",
      serial_number: "TV-SAM-043",
      image: "",
      created_at: "2026-04-02T08:00:00.000Z"
    },
    {
      id: 3,
      product_name: "Gas Cylinder 13kg",
      category: "Gas cylinders",
      quantity: 1,
      buying_price: 5200,
      selling_price: 7600,
      description: "Refurbished 13kg gas cylinder inspected for household resale and quick turnover.",
      condition: "Refurbished",
      serial_number: "GAS-13-091",
      image: "",
      created_at: "2026-04-10T08:00:00.000Z"
    },
    {
      id: 4,
      product_name: "Three-Seater Sofa",
      category: "Furniture",
      quantity: 5,
      buying_price: 18000,
      selling_price: 26500,
      description: "Comfortable three-seater sofa for living rooms, staged for direct or installment purchase.",
      condition: "Second-hand good",
      serial_number: "SOFA-3S-022",
      image: "",
      created_at: "2026-04-16T08:00:00.000Z"
    }
  ],
  sales: [],
  agreements: [],
  activity_logs: [],
  settings: {
    business: {
      company_name: "DRAMAN Loan Services",
      logo_data: "",
      contact_phone: "",
      contact_email: "",
      receipt_footer: "Thank you for your payment.",
      sms_enabled: true,
      sms_sender_id: ""
    },
    loan: {
      default_interest_rate: 12,
      processing_fee: 1000,
      grace_period_days: 0,
      late_penalty_rate: 3,
      approval_threshold: 100000
    },
    security: {
      session_timeout_hours: 24,
      minimum_password_length: 10,
      require_unique_staff_ids: true,
      backup_schedule: "Daily",
      audit_logging_enabled: true,
      permissions: {
        "Loan Officer": ["dashboard", "customers", "loans", "payments", "reports", "agreements"],
        Cashier: ["dashboard", "payments", "reports"],
        "Inventory Manager": ["dashboard", "inventory", "reports"]
      }
    }
  }
};

const allowedRoles = ["Super Admin", "Cashier", "Loan Officer", "Inventory Manager"];
const sessions = new Map();
let sessionWrite = Promise.resolve();
let authStoreWrite = Promise.resolve();
let businessDataWrite = Promise.resolve();
let passwordResetTokens = [];
db.invitations = [];

function sessionKey(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function loadSessions() {
  try {
    const stored = JSON.parse(await fs.readFile(sessionStorePath, "utf8"));
    if (!Array.isArray(stored)) throw new Error("Session store must contain a list.");
    stored.forEach(([key, session]) => {
      if (/^[a-f0-9]{64}$/.test(key) && Number.isInteger(session.user_id) &&
        Number.isFinite(session.expires_at) && session.expires_at > Date.now()) {
        sessions.set(key, session);
      }
    });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw new Error(`Could not load saved sessions: ${error.message}`);
  }
}

function saveSessions() {
  sessionWrite = sessionWrite.catch(() => {}).then(async () => {
    await ensurePrivateDataDir();
    await writePrivateFile(sessionStorePath, JSON.stringify(Array.from(sessions.entries())));
  });
  return sessionWrite;
}

async function ensurePrivateDataDir() {
  await fs.mkdir(privateDataDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await fs.chmod(privateDataDir, 0o700);
}

async function writePrivateFile(filePath, contents) {
  await ensurePrivateDataDir();
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await fs.chmod(path.dirname(filePath), 0o700);
  await fs.writeFile(filePath, contents, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") await fs.chmod(filePath, 0o600);
}

function saveAuthStore() {
  authStoreWrite = authStoreWrite.catch(() => {}).then(async () => {
    await writePrivateFile(authStorePath, JSON.stringify({
      users: db.users,
      invitations: db.invitations,
      password_reset_tokens: passwordResetTokens
    }));
  });
  return authStoreWrite;
}

function saveBusinessData() {
  businessDataWrite = businessDataWrite.catch(() => {}).then(async () => {
    const data = { ...db, users: undefined, invitations: undefined };
    await writePrivateFile(businessDataPath, JSON.stringify(data));
  });
  return businessDataWrite;
}

async function loadPrivateData() {
  await ensurePrivateDataDir();
  try {
    const savedBusinessData = JSON.parse(await fs.readFile(businessDataPath, "utf8"));
    for (const [key, value] of Object.entries(savedBusinessData)) {
      if (key !== "users" && key !== "invitations" && Object.prototype.hasOwnProperty.call(db, key)) {
        db[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`Could not load private business data: ${error.message}`);
  }

  try {
    const savedAuthData = JSON.parse(await fs.readFile(authStorePath, "utf8"));
    if (!Array.isArray(savedAuthData.users) || !Array.isArray(savedAuthData.invitations) ||
      !Array.isArray(savedAuthData.password_reset_tokens)) {
      throw new Error("Private account data has an invalid format.");
    }
    db.users = savedAuthData.users;
    db.invitations = savedAuthData.invitations;
    passwordResetTokens = savedAuthData.password_reset_tokens;
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`Could not load private account data: ${error.message}`);
  }

  const initialPassword = crypto.randomBytes(24).toString("base64url");
  db.users = [{
    id: 1,
    full_name: "Administrator",
    email: String(process.env.DRAMAN_ADMIN_EMAIL || "admin@draman.co.ke").trim().toLowerCase(),
    employee_id: "ADM-001",
    phone: "",
    role: "Super Admin",
    status: "Active",
    password_hash: await hashPassword(initialPassword),
    created_at: todayIso()
  }];
  passwordResetTokens = [];
  await saveAuthStore();
  await writePrivateFile(
    bootstrapCredentialsPath,
    `Initial administrator sign-in\nEmail: ${db.users[0].email}\nPassword: ${initialPassword}\n\nChange this password and email after signing in. This file is stored outside the project folder and should be deleted after use.\n`
  );
  console.log(`Created the initial administrator account. Read credentials from: ${bootstrapCredentialsPath}`);
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  return `${salt}:${hash}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await scrypt(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function publicUser(user) {
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

function publicInvitation(invitation) {
  const { code_hash, ...safeInvitation } = invitation;
  return safeInvitation;
}

function sessionUser(request) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const key = sessionKey(token);
  const session = sessions.get(key);
  if (!session) return null;
  if (session.expires_at <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  const userId = session.user_id;
  const user = db.users.find((item) => item.id === userId && item.status === "Active");
  if (user) request.authUser = user;
  return user;
}

function nextId(collection) {
  return collection.reduce((max, row) => Math.max(max, row.id), 0) + 1;
}

function nextCode(prefix, collection, field) {
  const year = new Date().getFullYear();
  const count = collection.length + 1;
  return `${prefix}-${year}-${String(count).padStart(3, "0")}`;
}

function sendJson(response, status, data) {
  const finish = (responseStatus, responseData) => {
    response.writeHead(responseStatus, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS"
    });
    response.end(JSON.stringify(responseData));
  };
  if (response.persistData && status >= 200 && status < 300) {
    saveBusinessData()
      .then(() => finish(status, data))
      .catch((error) => {
        console.error("Could not save private business data:", error);
        finish(500, { message: "Could not securely save the latest data. Check server storage permissions." });
      });
    return;
  }
  finish(status, data);
}

function isSuperAdminRequest(request) {
  return request.authUser && request.authUser.role === "Super Admin";
}

function requireSuperAdmin(request, response) {
  if (isSuperAdminRequest(request)) return true;
  sendJson(response, 403, { message: "Super Admin permission required" });
  return false;
}

function requireModule(request, response, moduleName) {
  if (request.authUser && (request.authUser.role === "Super Admin" ||
    (db.settings.security.permissions[request.authUser.role] || []).includes(moduleName))) return true;
  sendJson(response, 403, { message: "Your account does not have permission for this section" });
  return false;
}

function removeCustomerLinks(customerId) {
  const linkedLoanIds = db.loans
    .filter((loan) => loan.customer_id === customerId)
    .map((loan) => loan.id);
  db.customers = db.customers.filter((customer) => customer.id !== customerId);
  db.guarantors = db.guarantors.filter((guarantor) => guarantor.customer_id !== customerId);
  db.loans = db.loans.filter((loan) => loan.customer_id !== customerId);
  db.payments = db.payments.filter((payment) => payment.customer_id !== customerId);
  db.penalties = db.penalties.filter((penalty) => !linkedLoanIds.includes(penalty.loan_id));
  db.sales = db.sales.filter((sale) => sale.customer_id !== customerId);
  db.agreements = db.agreements.filter((agreement) => agreement.customer_id !== customerId);
}

function clearCustomerData() {
  db.customers = [];
  db.guarantors = [];
  db.loans = [];
  db.payments = [];
  db.penalties = [];
  db.sales = [];
  db.agreements = [];
}

function buildNotifications(user) {
  const notifications = [];
  const isAdmin = user.role === "Super Admin";
  const permissions = db.settings.security.permissions[user.role] || [];
  const canSeeLoans = isAdmin || permissions.includes("loans");
  const canSeeInventory = isAdmin || permissions.includes("inventory");

  if (isAdmin) {
    const pendingAccounts = db.users.filter((item) => item.status === "Pending");
    if (pendingAccounts.length) {
      notifications.push({
        id: "pending-accounts",
        title: "Account requests",
        message: `${pendingAccounts.length} account request${pendingAccounts.length === 1 ? "" : "s"} waiting for a role and approval.`,
        level: "warning"
      });
    }
    const pendingLoans = db.loans.filter((loan) => loan.status === "Pending");
    if (pendingLoans.length) {
      notifications.push({
        id: "pending-loans",
        title: "Loan approvals needed",
        message: `${pendingLoans.length} loan application${pendingLoans.length === 1 ? "" : "s"} waiting for review.`,
        level: "warning"
      });
    }
  }

  if (canSeeLoans) {
    const overdueLoans = db.loans.filter((loan) => loan.balance > 0 && new Date(loan.due_date) < new Date());
    if (overdueLoans.length) {
      notifications.push({
        id: "overdue-loans",
        title: "Overdue loans",
        message: `${overdueLoans.length} loan${overdueLoans.length === 1 ? "" : "s"} need follow-up.`,
        level: "warning"
      });
    }
  }

  if (canSeeInventory) {
    const lowStock = db.inventory.filter((item) => item.quantity <= 2);
    if (lowStock.length) {
      notifications.push({
        id: "low-stock",
        title: "Low stock alert",
        message: `${lowStock.length} product${lowStock.length === 1 ? "" : "s"} have 2 or fewer items remaining.`,
        level: "warning"
      });
    }
  }

  db.activity_logs.slice(0, 5).forEach((item) => {
    notifications.push({
      id: `activity-${item.id}`,
      title: "Recent activity",
      message: item.action,
      level: "info",
      created_at: item.created_at
    });
  });

  return notifications.slice(0, 12);
}

async function parseBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function resetTokenKey(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function sendPasswordResetInstructions(user, resetToken, resetRecord) {
  const publicUrl = String(process.env.DRAMAN_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
  const resetUrl = new URL("/", publicUrl);
  resetUrl.searchParams.set("reset_token", resetToken);
  const message = `Reset your DRAMAN account password using this one-time link. It expires in one hour:\n\n${resetUrl.toString()}\n`;
  if (process.env.RESEND_API_KEY && process.env.DRAMAN_EMAIL_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.DRAMAN_EMAIL_FROM,
        to: [user.email],
        subject: "Reset your DRAMAN account password",
        text: message
      })
    });
    if (!response.ok) throw new Error("The configured email provider could not send the reset message.");
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Password reset email delivery is not configured.");
  }
  const fileName = `reset-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.txt`;
  resetRecord.outbox_file = fileName;
  await writePrivateFile(path.join(passwordResetOutboxPath, fileName), `To: ${user.email}\n\n${message}`);
}

async function revokeUserSessions(userId, exceptSessionKey = "") {
  for (const [key, session] of sessions.entries()) {
    if (session.user_id === userId && key !== exceptSessionKey) sessions.delete(key);
  }
  await saveSessions();
}

function publicCustomer(customerId) {
  return db.customers.find((customer) => customer.id === Number(customerId));
}

function decoratedLoan(loan) {
  const customer = publicCustomer(loan.customer_id);
  return {
    ...loan,
    customer_name: customer ? customer.full_name : "Unknown customer",
    customer_phone: customer ? customer.phone : ""
  };
}

function decoratedPayment(payment) {
  const customer = publicCustomer(payment.customer_id);
  const loan = db.loans.find((item) => item.id === Number(payment.loan_id));
  const receiver = db.users.find((item) => item.id === Number(payment.received_by));
  return {
    ...payment,
    customer_name: customer ? customer.full_name : "Unknown customer",
    customer_phone: customer ? customer.phone : "",
    loan_code: loan ? loan.loan_code : "Unknown loan",
    received_by_name: receiver ? receiver.full_name : "System"
  };
}

function buildSummary() {
  const now = new Date();
  const currentDay = dateOnly(now);
  const currentMonth = now.toISOString().slice(0, 7);
  const activeLoans = db.loans.filter((loan) => ["Approved", "Active", "Defaulted"].includes(loan.status));
  const collectedToday = db.payments
    .filter((payment) => dateOnly(payment.payment_date) === currentDay)
    .reduce((sum, payment) => sum + money(payment.amount_paid), 0);
  const overdueLoans = db.loans.filter((loan) => loan.balance > 0 && new Date(loan.due_date) < now);
  const inventoryStockValue = db.inventory.reduce(
    (sum, item) => sum + money(item.quantity) * money(item.buying_price),
    0
  );
  const monthlyCollections = db.payments
    .filter((payment) => payment.payment_date.slice(0, 7) === currentMonth)
    .reduce((sum, payment) => sum + money(payment.amount_paid), 0);
  const monthlyFees = db.loans
    .filter((loan) => loan.created_at.slice(0, 7) === currentMonth)
    .reduce((sum, loan) => sum + money(loan.processing_fee), 0);
  const repaymentSeries = Array.from({ length: 5 }, (_, index) => {
    const monthDate = new Date(now.getFullYear(), index, 1);
    const monthKey = `${now.getFullYear()}-${String(index + 1).padStart(2, "0")}`;
    return {
      label: monthDate.toLocaleString("en", { month: "short" }),
      amount: db.payments
        .filter((payment) => payment.payment_date.slice(0, 7) === monthKey)
        .reduce((sum, payment) => sum + money(payment.amount_paid), 0)
    };
  });

  return {
    cards: {
      totalActiveLoans: activeLoans.length,
      amountCollectedToday: collectedToday,
      overdueLoans: overdueLoans.length,
      totalCustomers: db.customers.length,
      inventoryStockValue,
      outstandingBalance: db.loans.reduce((sum, loan) => sum + money(loan.balance), 0),
      defaultedLoans: db.loans.filter((loan) => loan.status === "Defaulted").length,
      monthlyProfit: Math.round(monthlyCollections * 0.18 + monthlyFees)
    },
    repaymentSeries,
    loanTrend: [
      { label: "Pending", count: db.loans.filter((loan) => loan.status === "Pending").length },
      { label: "Active", count: db.loans.filter((loan) => loan.status === "Active").length },
      { label: "Completed", count: db.loans.filter((loan) => loan.status === "Completed").length },
      { label: "Defaulted", count: db.loans.filter((loan) => loan.status === "Defaulted").length }
    ],
    recentTransactions: db.payments
      .slice()
      .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
      .slice(0, 6)
      .map(decoratedPayment),
    duePayments: db.loans
      .filter((loan) => loan.balance > 0)
      .slice()
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 6)
      .map(decoratedLoan),
    lowStockAlerts: db.inventory.filter((item) => item.quantity <= 2)
  };
}

async function serveStatic(request, response, pathname) {
  const relativePath = publicFiles[pathname];
  if (!relativePath) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const filePath = path.join(__dirname, relativePath);
  let content;
  try {
    content = await fs.readFile(filePath);
  } catch (error) {
    console.error(`Failed to serve ${relativePath}:`, error);
    response.writeHead(500);
    response.end("Internal server error");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  response.end(content);
}

async function handleApi(request, response, pathname) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "DRAMAN LMS API", timestamp: todayIso() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/password/forgot") {
    const body = await parseBody(request);
    const email = String(body.email || "").trim().toLowerCase();
    const user = db.users.find((item) => item.email.toLowerCase() === email && item.status === "Active");
    if (user) {
      const token = crypto.randomBytes(32).toString("base64url");
      const record = {
        token_hash: resetTokenKey(token),
        user_id: user.id,
        expires_at: Date.now() + 60 * 60 * 1000,
        outbox_file: ""
      };
      passwordResetTokens = passwordResetTokens.filter((item) => item.expires_at > Date.now());
      passwordResetTokens.push(record);
      try {
        await sendPasswordResetInstructions(user, token, record);
        await saveAuthStore();
      } catch (error) {
        passwordResetTokens = passwordResetTokens.filter((item) => item !== record);
        await saveAuthStore();
        console.error("Could not deliver password reset instructions:", error.message);
        sendJson(response, 503, {
          message: process.env.NODE_ENV === "production"
            ? "Password reset email is temporarily unavailable. Contact your administrator."
            : "Could not create password reset instructions. Check the private data folder permissions."
        });
        return;
      }
    }
    sendJson(response, 200, { message: "If an active account uses that email, password reset instructions are available." });
    return;
  }

  if (request.method === "POST" && pathname === "/api/password/reset") {
    const body = await parseBody(request);
    const token = String(body.token || "");
    const password = String(body.password || "");
    const minimumPasswordLength = db.settings.security.minimum_password_length;
    if (password.length < minimumPasswordLength || password.length > 128) {
      sendJson(response, 400, { message: `Choose a password with at least ${minimumPasswordLength} characters.` });
      return;
    }
    const tokenHash = resetTokenKey(token);
    const resetRecord = passwordResetTokens.find((item) => item.token_hash === tokenHash);
    if (!resetRecord || resetRecord.expires_at <= Date.now()) {
      passwordResetTokens = passwordResetTokens.filter((item) => item.expires_at > Date.now());
      await saveAuthStore();
      sendJson(response, 400, { message: "That password reset link is invalid or expired. Request a new one." });
      return;
    }
    const user = db.users.find((item) => item.id === resetRecord.user_id && item.status === "Active");
    if (!user) {
      passwordResetTokens = passwordResetTokens.filter((item) => item !== resetRecord);
      await saveAuthStore();
      sendJson(response, 400, { message: "That password reset link is invalid or expired. Request a new one." });
      return;
    }
    user.password_hash = await hashPassword(password);
    passwordResetTokens = passwordResetTokens.filter((item) => item.user_id !== user.id);
    if (resetRecord.outbox_file) {
      try {
        await fs.unlink(path.join(passwordResetOutboxPath, resetRecord.outbox_file));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await saveAuthStore();
    await revokeUserSessions(user.id);
    sendJson(response, 200, { message: "Password changed. Sign in with your new password." });
    return;
  }

  if (request.method === "POST" && pathname === "/api/login") {
    const body = await parseBody(request);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = db.users.find((item) => item.email.toLowerCase() === email);
    const passwordValid = user ? await verifyPassword(password, user.password_hash) : false;
    if (!user || !passwordValid) {
      sendJson(response, 401, { message: "The email or password is incorrect." });
      return;
    }
    if (user.status !== "Active") {
      sendJson(response, 403, { message: "Your account is awaiting administrator approval." });
      return;
    }
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + db.settings.security.session_timeout_hours * 60 * 60 * 1000;
    const key = sessionKey(token);
    sessions.set(key, { user_id: user.id, expires_at: expiresAt });
    try {
      await saveSessions();
      if (user.role === "Super Admin") {
        try {
          await fs.unlink(bootstrapCredentialsPath);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
    } catch (error) {
      sessions.delete(key);
      throw error;
    }
    if (db.settings.security.audit_logging_enabled) {
      db.activity_logs.unshift({
        id: nextId(db.activity_logs),
        user_id: user.id,
        action: `${user.full_name} logged in`,
        created_at: todayIso()
      });
    }
    sendJson(response, 200, {
      token,
      expires_at: new Date(expiresAt).toISOString(),
      user: publicUser(user)
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/register") {
    const body = await parseBody(request);
    const fullName = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const employeeId = String(body.employee_id || "").trim().toUpperCase();
    const password = String(body.password || "");
    const invitationCode = String(body.invitation_code || "").trim().toUpperCase();

    if (fullName.length < 2 || fullName.length > 100 || !validEmail(email)) {
      sendJson(response, 400, { message: "Enter a valid name and personal email address." });
      return;
    }
    if (employeeId && (employeeId.length < 3 || employeeId.length > 32 || !/^[A-Z0-9-]+$/.test(employeeId))) {
      sendJson(response, 400, { message: "Staff IDs must contain 3 to 32 letters, numbers, or hyphens." });
      return;
    }
    const minimumPasswordLength = db.settings.security.minimum_password_length;
    if (password.length < minimumPasswordLength || password.length > 128) {
      sendJson(response, 400, { message: `Choose a password with at least ${minimumPasswordLength} characters.` });
      return;
    }

    let invitation = null;
    if (invitationCode) {
      const codeHash = crypto.createHash("sha256").update(invitationCode).digest();
      invitation = db.invitations.find((item) => {
        const expectedHash = Buffer.from(item.code_hash, "hex");
        return !item.used_at && new Date(item.expires_at) > new Date() &&
          expectedHash.length === codeHash.length && crypto.timingSafeEqual(expectedHash, codeHash);
      });
      if (!invitation) {
        sendJson(response, 403, { message: "That invitation code is invalid, expired, or already used." });
        return;
      }
    }
    if (db.users.some((item) => item.email.toLowerCase() === email)) {
      sendJson(response, 409, { message: "An account already uses that email address." });
      return;
    }
    if (employeeId && db.settings.security.require_unique_staff_ids &&
      db.users.some((item) => item.employee_id && item.employee_id.toUpperCase() === employeeId)) {
      sendJson(response, 409, { message: "That staff ID is already registered." });
      return;
    }

    const user = {
      id: nextId(db.users),
      full_name: fullName,
      email,
      employee_id: employeeId,
      phone: "",
      role: invitation ? invitation.role : "Cashier",
      status: invitation ? "Active" : "Pending",
      password_hash: await hashPassword(password),
      created_at: todayIso()
    };
    db.users.push(user);
    if (invitation) {
      invitation.used_at = todayIso();
      invitation.used_by = user.id;
    }
    await saveAuthStore();
    if (db.settings.security.audit_logging_enabled) {
      db.activity_logs.unshift({
        id: nextId(db.activity_logs),
        user_id: invitation ? invitation.created_by : user.id,
        action: invitation
          ? `${user.full_name} registered as ${user.role}`
          : `${user.full_name} requested a team account`,
        created_at: todayIso()
      });
    }
    sendJson(response, 201, {
      message: invitation
        ? "Account created. Sign in with your personal email."
        : "Account request submitted. An administrator must approve it before you can sign in.",
      user: publicUser(user)
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    const authorization = request.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    sessions.delete(sessionKey(token));
    await saveSessions();
    sendJson(response, 200, { message: "Signed out" });
    return;
  }

  if (!sessionUser(request)) {
    sendJson(response, 401, { message: "Your session has expired. Please sign in again." });
    return;
  }

  if (request.method === "GET" && pathname === "/api/session") {
    const authorization = request.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    sendJson(response, 200, {
      user: publicUser(request.authUser),
      expires_at: new Date(sessions.get(sessionKey(token)).expires_at).toISOString()
    });
    return;
  }

  if (request.method === "PUT" && pathname === "/api/account") {
    const body = await parseBody(request);
    const currentPassword = String(body.current_password || "");
    const nextEmail = String(body.email || "").trim().toLowerCase();
    const nextPassword = String(body.new_password || "");
    if (!await verifyPassword(currentPassword, request.authUser.password_hash)) {
      sendJson(response, 400, { message: "Current password is incorrect." });
      return;
    }
    if (!validEmail(nextEmail)) {
      sendJson(response, 400, { message: "Enter a valid email address." });
      return;
    }
    if (db.users.some((user) => user.id !== request.authUser.id && user.email.toLowerCase() === nextEmail)) {
      sendJson(response, 409, { message: "That email address is already associated with an account." });
      return;
    }
    if (nextPassword) {
      const minimumPasswordLength = db.settings.security.minimum_password_length;
      if (nextPassword.length < minimumPasswordLength || nextPassword.length > 128) {
        sendJson(response, 400, { message: `Choose a password with at least ${minimumPasswordLength} characters.` });
        return;
      }
    }

    request.authUser.email = nextEmail;
    if (nextPassword) request.authUser.password_hash = await hashPassword(nextPassword);
    await saveAuthStore();
    if (nextPassword) {
      const authorization = request.headers.authorization || "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      await revokeUserSessions(request.authUser.id, sessionKey(token));
    }
    sendJson(response, 200, { user: publicUser(request.authUser) });
    return;
  }

  if (request.method === "GET" && pathname === "/api/settings") {
    sendJson(response, 200, db.settings);
    return;
  }

  if (request.method === "GET" && pathname === "/api/notifications") {
    sendJson(response, 200, { notifications: buildNotifications(request.authUser) });
    return;
  }

  if (request.method === "POST" && pathname === "/api/system-backup") {
    if (!requireSuperAdmin(request, response)) return;
    const createdAt = todayIso();
    const fileName = `draman-backup-${createdAt.replace(/[:.]/g, "-")}.json`;
    sendJson(response, 200, {
      format_version: 1,
      application: "DRAMAN Loan Services Management System",
      created_at: createdAt,
      file_name: fileName,
      data: {
        ...JSON.parse(JSON.stringify(db)),
        users: db.users.map(publicUser),
        invitations: db.invitations.map(publicInvitation)
      }
    });
    return;
  }

  const settingsMatch = pathname.match(/^\/api\/settings\/(business|loan|security)$/);
  if (request.method === "PUT" && settingsMatch) {
    if (!requireSuperAdmin(request, response)) return;
    const section = settingsMatch[1];
    const body = await parseBody(request);
    const current = db.settings[section];
    const numericRanges = {
      default_interest_rate: [0, 100],
      processing_fee: [0, 100000000],
      grace_period_days: [0, 365],
      late_penalty_rate: [0, 100],
      approval_threshold: [0, 1000000000],
      session_timeout_hours: [1, 168],
      minimum_password_length: [10, 128]
    };
    const booleanFields = ["sms_enabled", "require_unique_staff_ids", "audit_logging_enabled"];
    for (const [key, value] of Object.entries(body)) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        sendJson(response, 400, { message: `Unknown ${section} setting: ${key}` });
        return;
      }
      if (numericRanges[key]) {
        const [minimum, maximum] = numericRanges[key];
        if (!Number.isFinite(Number(value)) || Number(value) < minimum || Number(value) > maximum) {
          sendJson(response, 400, { message: `${key} must be between ${minimum} and ${maximum}.` });
          return;
        }
        body[key] = Number(value);
      } else if (booleanFields.includes(key)) {
        if (typeof value !== "boolean") {
          sendJson(response, 400, { message: `${key} must be true or false.` });
          return;
        }
      } else if (key === "logo_data") {
        if (typeof value !== "string" || value.length > 1500000 ||
          (value !== "" && !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value))) {
          sendJson(response, 400, { message: "Choose a supported image no larger than 1 MB for the business logo." });
          return;
        }
      } else if (key === "backup_schedule") {
        if (!["Daily", "Weekly", "Monthly", "Disabled"].includes(value)) {
          sendJson(response, 400, { message: "Choose a valid backup schedule." });
          return;
        }
      } else if (key === "permissions") {
        const validModules = ["dashboard", "customers", "loans", "payments", "inventory", "reports", "agreements"];
        const validRoles = ["Loan Officer", "Cashier", "Inventory Manager"];
        if (!value || typeof value !== "object" || Array.isArray(value) ||
          Object.keys(value).length !== validRoles.length ||
          validRoles.some((role) => !Array.isArray(value[role]) ||
            value[role].some((moduleName) => !validModules.includes(moduleName)))) {
          sendJson(response, 400, { message: "Choose valid menu permissions for each staff role." });
          return;
        }
      } else if (typeof value !== "string" || value.length > 500) {
        sendJson(response, 400, { message: `${key} must be a text value of 500 characters or fewer.` });
        return;
      }
    }
    db.settings[section] = { ...current, ...body };
    sendJson(response, 200, db.settings);
    return;
  }

  if (request.method === "GET" && pathname === "/api/team") {
    if (!requireSuperAdmin(request, response)) return;
    sendJson(response, 200, db.users.map(publicUser));
    return;
  }

  const teamApprovalMatch = pathname.match(/^\/api\/team\/(\d+)\/approve$/);
  if (request.method === "POST" && teamApprovalMatch) {
    if (!requireSuperAdmin(request, response)) return;
    const body = await parseBody(request);
    const role = String(body.role || "");
    if (!allowedRoles.includes(role) || role === "Super Admin") {
      sendJson(response, 400, { message: "Choose an approved staff role." });
      return;
    }
    const member = db.users.find((user) => user.id === Number(teamApprovalMatch[1]));
    if (!member) {
      sendJson(response, 404, { message: "Account request not found." });
      return;
    }
    if (member.status !== "Pending") {
      sendJson(response, 409, { message: "Only pending account requests can be approved." });
      return;
    }
    member.role = role;
    member.status = "Active";
    await saveAuthStore();
    db.activity_logs.unshift({
      id: nextId(db.activity_logs),
      user_id: request.authUser.id,
      action: `${member.full_name} approved as ${role}`,
      created_at: todayIso()
    });
    sendJson(response, 200, { user: publicUser(member) });
    return;
  }

  if (request.method === "GET" && pathname === "/api/invitations") {
    if (!requireSuperAdmin(request, response)) return;
    const pending = db.invitations.filter((item) => !item.used_at && new Date(item.expires_at) > new Date());
    sendJson(response, 200, pending.map(publicInvitation));
    return;
  }

  if (request.method === "POST" && pathname === "/api/invitations") {
    if (!requireSuperAdmin(request, response)) return;
    const body = await parseBody(request);
    if (!allowedRoles.includes(body.role)) {
      sendJson(response, 400, { message: "Choose a valid team role." });
      return;
    }
    const count = body.count === undefined ? 1 : Number(body.count);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      sendJson(response, 400, { message: "Create between 1 and 50 invitation codes at a time." });
      return;
    }
    const createdInvitations = Array.from({ length: count }, () => {
      const code = `DRM-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
      const invitation = {
        id: nextId(db.invitations),
        role: body.role,
        code_hash: crypto.createHash("sha256").update(code).digest("hex"),
        created_by: request.authUser.id,
        created_at: todayIso(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        used_at: null,
        used_by: null
      };
      db.invitations.unshift(invitation);
      return { invitation: publicInvitation(invitation), code };
    });
    await saveAuthStore();
    sendJson(response, 201, {
      invitations: createdInvitations,
      invitation: createdInvitations[0].invitation,
      code: createdInvitations[0].code
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/summary") {
    sendJson(response, 200, buildSummary());
    return;
  }

  if (request.method === "GET" && pathname === "/api/customers") {
    if (!requireModule(request, response, "customers")) return;
    sendJson(response, 200, db.customers);
    return;
  }

  if (request.method === "POST" && pathname === "/api/customers") {
    if (!requireModule(request, response, "customers")) return;
    const body = await parseBody(request);
    const customer = {
      id: nextId(db.customers),
      customer_code: nextCode("CUS", db.customers, "customer_code"),
      full_name: body.full_name || "Unnamed Customer",
      national_id: body.national_id || "",
      phone: body.phone || "",
      alt_phone: body.alt_phone || "",
      email: body.email || "",
      gender: body.gender || "",
      dob: body.dob || "",
      occupation: body.occupation || "",
      monthly_income: money(body.monthly_income),
      county: body.county || "",
      estate: body.estate || "",
      address: body.address || "",
      photo: body.photo || "",
      id_front: body.id_front || "",
      id_back: body.id_back || "",
      signature: body.signature || "",
      blacklist_status: Boolean(body.blacklist_status),
      created_at: todayIso()
    };
    db.customers.unshift(customer);

    if (body.guarantor_name || body.guarantor_phone) {
      db.guarantors.unshift({
        id: nextId(db.guarantors),
        customer_id: customer.id,
        full_name: body.guarantor_name || "",
        national_id: body.guarantor_id || "",
        phone: body.guarantor_phone || "",
        relationship: body.relationship || "",
        address: body.guarantor_address || ""
      });
    }

    sendJson(response, 201, customer);
    return;
  }

  if (request.method === "DELETE" && pathname === "/api/customers") {
    if (!requireSuperAdmin(request, response)) return;
    clearCustomerData();
    sendJson(response, 200, { message: "All customer records cleared" });
    return;
  }

  const customerDeleteMatch = pathname.match(/^\/api\/customers\/(\d+)$/);
  if (request.method === "DELETE" && customerDeleteMatch) {
    if (!requireSuperAdmin(request, response)) return;
    const customerId = Number(customerDeleteMatch[1]);
    const existingCustomer = db.customers.find((customer) => customer.id === customerId);
    if (!existingCustomer) {
      sendJson(response, 404, { message: "Customer not found" });
      return;
    }
    removeCustomerLinks(customerId);
    sendJson(response, 200, { message: `${existingCustomer.full_name} deleted` });
    return;
  }

  if (request.method === "GET" && pathname === "/api/guarantors") {
    if (!requireModule(request, response, "customers")) return;
    sendJson(response, 200, db.guarantors);
    return;
  }

  if (request.method === "GET" && pathname === "/api/loans") {
    if (!requireModule(request, response, "loans")) return;
    sendJson(response, 200, db.loans.map(decoratedLoan));
    return;
  }

  if (request.method === "POST" && pathname === "/api/loans") {
    if (!requireModule(request, response, "loans")) return;
    const body = await parseBody(request);
    const principal = money(body.principal_amount);
    const interestRate = money(body.interest_rate);
    const processingFee = money(body.processing_fee);
    const totalInterest = Math.round(principal * (interestRate / 100));
    const totalPayable = principal + totalInterest + processingFee;
    const loanRequiresApproval = principal >= db.settings.loan.approval_threshold;
    const loan = {
      id: nextId(db.loans),
      loan_code: nextCode("LOAN", db.loans, "loan_code"),
      customer_id: Number(body.customer_id),
      principal_amount: principal,
      interest_rate: interestRate,
      processing_fee: processingFee,
      total_payable: totalPayable,
      total_paid: 0,
      balance: totalPayable,
      repayment_frequency: body.repayment_frequency || "Monthly",
      start_date: body.start_date || dateOnly(new Date()),
      due_date: body.due_date || dateOnly(new Date()),
      status: loanRequiresApproval ? "Pending" : "Approved",
      assigned_officer: body.assigned_officer || "Unassigned",
      approved_by: loanRequiresApproval ? null : request.authUser.id,
      created_at: todayIso()
    };
    db.loans.unshift(loan);
    sendJson(response, 201, decoratedLoan(loan));
    return;
  }

  const loanApprovalMatch = pathname.match(/^\/api\/loans\/(\d+)\/approve$/);
  if (request.method === "POST" && loanApprovalMatch) {
    if (!requireSuperAdmin(request, response)) return;
    const loan = db.loans.find((item) => item.id === Number(loanApprovalMatch[1]));
    if (!loan) {
      sendJson(response, 404, { message: "Loan not found" });
      return;
    }
    if (loan.status !== "Pending") {
      sendJson(response, 409, { message: "Only pending loans can be approved." });
      return;
    }
    loan.status = "Approved";
    loan.approved_by = request.authUser.id;
    if (db.settings.security.audit_logging_enabled) {
      db.activity_logs.unshift({
        id: nextId(db.activity_logs),
        user_id: request.authUser.id,
        action: `${request.authUser.full_name} approved ${loan.loan_code}`,
        created_at: todayIso()
      });
    }
    sendJson(response, 200, decoratedLoan(loan));
    return;
  }

  if (request.method === "GET" && pathname === "/api/payments") {
    if (!requireModule(request, response, "payments")) return;
    sendJson(response, 200, db.payments.map(decoratedPayment));
    return;
  }

  if (request.method === "POST" && pathname === "/api/payments") {
    if (!requireModule(request, response, "payments")) return;
    const body = await parseBody(request);
    const loan = db.loans.find((item) => item.id === Number(body.loan_id));
    if (!loan) {
      sendJson(response, 404, { message: "Loan not found" });
      return;
    }
    if (loan.status === "Pending") {
      sendJson(response, 409, { message: "This loan must be approved before accepting payment." });
      return;
    }
    const amount = money(body.amount_paid);
    const payment = {
      id: nextId(db.payments),
      payment_code: nextCode("PAY", db.payments, "payment_code"),
      loan_id: loan.id,
      customer_id: loan.customer_id,
      amount_paid: amount,
      payment_method: body.payment_method || "Cash",
      transaction_code: body.transaction_code || "",
      received_by: Number(body.received_by || 3),
      notes: body.notes || "",
      payment_date: todayIso()
    };

    loan.total_paid = money(loan.total_paid) + amount;
    loan.balance = Math.max(0, money(loan.balance) - amount);
    if (loan.balance === 0) {
      loan.status = "Completed";
    } else if (loan.status === "Pending" || loan.status === "Approved") {
      loan.status = "Active";
    }

    db.payments.unshift(payment);
    sendJson(response, 201, decoratedPayment(payment));
    return;
  }

  if (request.method === "GET" && pathname === "/api/inventory") {
    if (!requireModule(request, response, "inventory")) return;
    sendJson(response, 200, db.inventory);
    return;
  }

  if (request.method === "POST" && pathname === "/api/inventory") {
    if (!requireModule(request, response, "inventory")) return;
    const body = await parseBody(request);
    const product = {
      id: nextId(db.inventory),
      product_name: body.product_name || "Unnamed Product",
      category: body.category || "Household items",
      quantity: Number.parseInt(body.quantity || 0, 10),
      buying_price: money(body.buying_price),
      selling_price: money(body.selling_price),
      description: body.description || "",
      condition: body.condition || "",
      serial_number: body.serial_number || "",
      image: body.image || "",
      created_at: todayIso()
    };
    db.inventory.unshift(product);
    sendJson(response, 201, product);
    return;
  }

  if (request.method === "DELETE" && pathname === "/api/inventory") {
    if (!requireSuperAdmin(request, response)) return;
    db.inventory = [];
    db.sales = [];
    sendJson(response, 200, { message: "All product records cleared" });
    return;
  }

  const inventoryDeleteMatch = pathname.match(/^\/api\/inventory\/(\d+)$/);
  if (request.method === "DELETE" && inventoryDeleteMatch) {
    if (!requireModule(request, response, "inventory")) return;
    const productId = Number(inventoryDeleteMatch[1]);
    const existingProduct = db.inventory.find((product) => product.id === productId);
    if (!existingProduct) {
      sendJson(response, 404, { message: "Product not found" });
      return;
    }
    db.inventory = db.inventory.filter((product) => product.id !== productId);
    db.sales = db.sales.filter((sale) => sale.inventory_id !== productId);
    sendJson(response, 200, { message: `${existingProduct.product_name} deleted` });
    return;
  }

  if (request.method === "GET" && pathname === "/api/sales") {
    sendJson(response, 200, db.sales);
    return;
  }

  if (request.method === "GET" && pathname === "/api/agreements") {
    if (!requireModule(request, response, "agreements")) return;
    sendJson(response, 200, db.agreements);
    return;
  }

  if (request.method === "GET" && pathname === "/api/activity-logs") {
    sendJson(response, 200, db.activity_logs);
    return;
  }

  sendJson(response, 404, { message: "API route not found" });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      response.persistData = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
      await handleApi(request, response, url.pathname);
      return;
    }
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { message: "Internal server error" });
  }
});

loadPrivateData()
  .then(async () => {
    await saveBusinessData();
    await loadSessions();
    server.listen(PORT, () => {
      console.log(`DRAMAN Loan Services app running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Could not initialize private application data:", error);
    process.exitCode = 1;
  });
