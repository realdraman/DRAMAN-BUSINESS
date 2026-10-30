# DRAMAN Loan Services Web App - Copyable Code

Copy each section into a file with the matching path.

## package.json

`$lang
{
  "name": "draman-loan-services-management-system",
  "version": "0.1.0",
  "private": true,
  "description": "Starter implementation for the DRAMAN Loan Services Management System.",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "engines": {
    "node": ">=20"
  },
  "notes": {
    "runtime": "This prototype runs without npm install because this Codex shell has Node but no npm on PATH. Browser libraries are loaded from CDNs.",
    "productionStack": "The blueprint target remains React, Tailwind CSS, Chart.js, Axios, Express.js, PostgreSQL, JWT, and bcrypt."
  }
}
```

## server.js

`$lang
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 4173);
const publicDir = path.join(__dirname, "public");

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
  users: [
    {
      id: 1,
      full_name: "Charles Muhoni",
      email: "admin@draman.co.ke",
      phone: "+254 700 100 001",
      role: "Super Admin",
      status: "Active",
      created_at: "2026-01-12T08:00:00.000Z"
    },
    {
      id: 2,
      full_name: "Mercy Atieno",
      email: "officer@draman.co.ke",
      phone: "+254 700 100 002",
      role: "Loan Officer",
      status: "Active",
      created_at: "2026-02-03T08:00:00.000Z"
    },
    {
      id: 3,
      full_name: "Peter Maina",
      email: "cashier@draman.co.ke",
      phone: "+254 700 100 003",
      role: "Cashier",
      status: "Active",
      created_at: "2026-02-10T08:00:00.000Z"
    },
    {
      id: 4,
      full_name: "Amina Hassan",
      email: "inventory@draman.co.ke",
      phone: "+254 700 100 004",
      role: "Inventory Manager",
      status: "Active",
      created_at: "2026-03-01T08:00:00.000Z"
    }
  ],
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
  activity_logs: []
};

function nextId(collection) {
  return collection.reduce((max, row) => Math.max(max, row.id), 0) + 1;
}

function nextCode(prefix, collection, field) {
  const year = new Date().getFullYear();
  const count = collection.length + 1;
  return `${prefix}-${year}-${String(count).padStart(3, "0")}`;
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  response.end(JSON.stringify(data));
}

function isSuperAdminRequest(request) {
  return request.headers["x-user-role"] === "Super Admin";
}

function requireSuperAdmin(request, response) {
  if (isSuperAdminRequest(request)) return true;
  sendJson(response, 403, { message: "Super Admin permission required" });
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

function publicCustomer(customerId) {
  return db.customers.find((customer) => customer.id === Number(customerId));
}

function decoratedLoan(loan) {
  const customer = publicCustomer(loan.customer_id);
  return {
    ...loan,
    customer_name: customer ? customer.full_name : "Unknown customer"
  };
}

function decoratedPayment(payment) {
  const customer = publicCustomer(payment.customer_id);
  const loan = db.loans.find((item) => item.id === Number(payment.loan_id));
  const receiver = db.users.find((item) => item.id === Number(payment.received_by));
  return {
    ...payment,
    customer_name: customer ? customer.full_name : "Unknown customer",
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
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const requestedPath = path.normalize(decodeURIComponent(normalized)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, requestedPath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch (error) {
    const fallback = await fs.readFile(path.join(publicDir, "index.html"));
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(fallback);
  }
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

  if (request.method === "POST" && pathname === "/api/login") {
    const body = await parseBody(request);
    const user = db.users.find((item) => item.email.toLowerCase() === String(body.email || "").toLowerCase());
    if (!user || body.password !== "admin123") {
      sendJson(response, 401, { message: "Invalid email or password" });
      return;
    }
    db.activity_logs.unshift({
      id: nextId(db.activity_logs),
      user_id: user.id,
      action: `${user.full_name} logged in`,
      created_at: todayIso()
    });
    sendJson(response, 200, {
      token: "demo-jwt-token",
      user
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/summary") {
    sendJson(response, 200, buildSummary());
    return;
  }

  if (request.method === "GET" && pathname === "/api/customers") {
    sendJson(response, 200, db.customers);
    return;
  }

  if (request.method === "POST" && pathname === "/api/customers") {
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
    sendJson(response, 200, db.guarantors);
    return;
  }

  if (request.method === "GET" && pathname === "/api/loans") {
    sendJson(response, 200, db.loans.map(decoratedLoan));
    return;
  }

  if (request.method === "POST" && pathname === "/api/loans") {
    const body = await parseBody(request);
    const principal = money(body.principal_amount);
    const interestRate = money(body.interest_rate);
    const processingFee = money(body.processing_fee);
    const totalInterest = Math.round(principal * (interestRate / 100));
    const totalPayable = principal + totalInterest + processingFee;
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
      status: body.status || "Pending",
      assigned_officer: body.assigned_officer || "Mercy Atieno",
      approved_by: body.approved_by || 1,
      created_at: todayIso()
    };
    db.loans.unshift(loan);
    sendJson(response, 201, decoratedLoan(loan));
    return;
  }

  if (request.method === "GET" && pathname === "/api/payments") {
    sendJson(response, 200, db.payments.map(decoratedPayment));
    return;
  }

  if (request.method === "POST" && pathname === "/api/payments") {
    const body = await parseBody(request);
    const loan = db.loans.find((item) => item.id === Number(body.loan_id));
    if (!loan) {
      sendJson(response, 404, { message: "Loan not found" });
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
    sendJson(response, 200, db.inventory);
    return;
  }

  if (request.method === "POST" && pathname === "/api/inventory") {
    if (!requireSuperAdmin(request, response)) return;
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
    if (!requireSuperAdmin(request, response)) return;
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
      await handleApi(request, response, url.pathname);
      return;
    }
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { message: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`DRAMAN Loan Services app running at http://localhost:${PORT}`);
});
```

## public/index.html

`$lang
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DRAMAN Loan Services Management System</title>
    <link rel="icon" href="/assets/draman-logo.svg" />
    <link rel="preconnect" href="https://cdn.tailwindcss.com" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            fontFamily: {
              sans: ["Inter", "Segoe UI", "Arial", "sans-serif"]
            },
            colors: {
              ink: "#0B1F3A",
              harbor: "#12385F",
              brass: "#D9A441",
              mist: "#F4F7FB"
            }
          }
        }
      };
    </script>
    <link rel="stylesheet" href="/styles.css?v=20260511-images" />
  </head>
  <body>
    <div id="root"></div>
    <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <script type="text/babel" src="/app.jsx?v=20260511-images"></script>
  </body>
</html>
```

## public/app.jsx

`$lang
const { useEffect, useMemo, useRef, useState } = React;

const api = {
  authHeaders() {
    return { "X-User-Role": window.__DRAMAN_ROLE__ || "" };
  },
  async get(url) {
    if (window.axios) return window.axios.get(url);
    const response = await fetch(url);
    return { data: await response.json() };
  },
  async post(url, payload) {
    if (window.axios) return window.axios.post(url, payload, { headers: this.authHeaders() });
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Request failed");
    return { data };
  },
  async delete(url) {
    if (window.axios) return window.axios.delete(url, { headers: this.authHeaders() });
    const response = await fetch(url, {
      method: "DELETE",
      headers: this.authHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Request failed");
    return { data };
  }
};

const demoAccounts = [
  { role: "Charles Muhoni", email: "admin@draman.co.ke" },
  { role: "Loan Officer", email: "officer@draman.co.ke" },
  { role: "Cashier", email: "cashier@draman.co.ke" },
  { role: "Inventory Manager", email: "inventory@draman.co.ke" }
];

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard", roles: ["Super Admin", "Loan Officer", "Cashier", "Inventory Manager"] },
  { id: "customers", label: "Customers", icon: "users", roles: ["Super Admin", "Loan Officer"] },
  { id: "loans", label: "Loans", icon: "landmark", roles: ["Super Admin", "Loan Officer"] },
  { id: "payments", label: "Payments", icon: "receipt", roles: ["Super Admin", "Loan Officer", "Cashier"] },
  { id: "inventory", label: "Inventory", icon: "warehouse", roles: ["Super Admin", "Inventory Manager"] },
  { id: "reports", label: "Reports", icon: "chart-no-axes-combined", roles: ["Super Admin", "Loan Officer", "Cashier", "Inventory Manager"] },
  { id: "agreements", label: "Agreements", icon: "file-signature", roles: ["Super Admin", "Loan Officer"] },
  { id: "settings", label: "Settings", icon: "settings", roles: ["Super Admin"] }
];

const emptyCustomerForm = {
  full_name: "",
  national_id: "",
  phone: "",
  alt_phone: "",
  email: "",
  gender: "",
  dob: "",
  occupation: "",
  monthly_income: "",
  county: "",
  estate: "",
  address: "",
  guarantor_name: "",
  guarantor_phone: "",
  relationship: "",
  guarantor_id: "",
  guarantor_address: "",
  id_front: "",
  id_back: "",
  photo: "",
  signature: ""
};

const initialLoanForm = {
  customer_id: "",
  principal_amount: 25000,
  interest_rate: 12,
  duration: 2,
  processing_fee: 1000,
  due_date: "",
  repayment_frequency: "Monthly",
  status: "Pending"
};

const initialPaymentForm = {
  loan_id: "",
  amount_paid: "",
  payment_method: "Cash",
  transaction_code: "",
  notes: ""
};

const emptyProductForm = {
  product_name: "",
  category: "Furniture",
  quantity: 1,
  buying_price: "",
  selling_price: "",
  description: "",
  condition: "Second-hand good",
  serial_number: "",
  image: ""
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

async function readImageInput(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return "";
  if (!file.type.startsWith("image/")) {
    window.alert("Please upload an image file.");
    event.target.value = "";
    return "";
  }
  return fileToDataUrl(file);
}

function statusClass(status) {
  return String(status || "").toLowerCase().replace(/\s+/g, "-");
}

function Icon({ name, className = "icon" }) {
  return <i data-lucide={name} className={className} aria-hidden="true"></i>;
}

function useLucideIcons(dependency) {
  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons({
        attrs: {
          "stroke-width": 1.8
        }
      });
    }
  }, [dependency]);
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="view-heading">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function Badge({ children, tone }) {
  return <span className={`badge ${statusClass(tone || children)}`}>{children}</span>;
}

function ImagePreview({ src, label }) {
  return (
    <div className={`image-preview ${src ? "" : "empty"}`}>
      {src ? <img src={src} alt={label} /> : <Icon name="image-plus" />}
      <span>{label}</span>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [credentials, setCredentials] = useState({
    email: "admin@draman.co.ke",
    password: "admin123"
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useLucideIcons(credentials.email);

  async function submitLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/login", credentials);
      onLogin(data);
    } catch (requestError) {
      setError(requestError.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-visual">
        <div className="brand-lockup">
          <img src="/assets/draman-logo.svg" alt="DRAMAN Loan Services logo" />
          <div>
            <div className="brand-title">DRAMAN Loan Services</div>
            <div className="brand-subtitle">Management System</div>
          </div>
        </div>
        <div>
          <h1>Loans, repayments, stock, and agreements in one controlled workspace.</h1>
          <p>Role-based operations for lending teams handling customers, guarantors, cash collections, inventory sales, and printable documents.</p>
        </div>
        <div className="login-metrics">
          <div className="login-metric">
            <strong>JWT</strong>
            <span className="compact">Auth-ready flow</span>
          </div>
          <div className="login-metric">
            <strong>PostgreSQL</strong>
            <span className="compact">Schema included</span>
          </div>
          <div className="login-metric">
            <strong>M-Pesa</strong>
            <span className="compact">Future-ready fields</span>
          </div>
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-card" onSubmit={submitLogin}>
          <h2>Sign in</h2>
          <p>Use one of the demo accounts to open the system.</p>
          <div className="form-grid single">
            <Field label="Email or username">
              <input
                value={credentials.email}
                onChange={(event) => setCredentials({ ...credentials, email: event.target.value })}
                autoComplete="username"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={credentials.password}
                onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}
                autoComplete="current-password"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 mt-4 text-sm text-slate-600">
            <input type="checkbox" defaultChecked />
            Remember me on this device
          </label>
          <div className="button-row">
            <button className="primary-button" type="submit" disabled={loading}>
              <Icon name="log-in" />
              {loading ? "Signing in" : "Login"}
            </button>
            <button className="ghost-button" type="button">
              <Icon name="key-round" />
              Forgot password
            </button>
          </div>
          <div className="quick-roles" aria-label="Demo role shortcuts">
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                className="quick-role"
                type="button"
                onClick={() => setCredentials({ email: account.email, password: "admin123" })}
              >
                {account.role}
              </button>
            ))}
          </div>
          {error ? <div className="error-box">{error}</div> : null}
        </form>
      </section>
    </main>
  );
}

function Sidebar({ activeView, setActiveView, user }) {
  const allowedNav = navItems.filter((item) => item.roles.includes(user.role));
  useLucideIcons(activeView);

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <img src="/assets/draman-logo.svg" alt="DRAMAN Loan Services logo" />
        <div>
          <div className="brand-title">DRAMAN</div>
          <div className="brand-subtitle">Loan Services</div>
        </div>
      </div>
      <nav className="nav-stack" aria-label="Primary navigation">
        {allowedNav.map((item) => (
          <button
            key={item.id}
            className={`nav-button ${activeView === item.id ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="role-panel">
        <div className="compact muted">Signed in as</div>
        <strong>{user.full_name}</strong>
        <div className="compact">{user.role}</div>
      </div>
    </aside>
  );
}

function Topbar({ user, search, setSearch, onLogout }) {
  useLucideIcons(search);
  return (
    <header className="topbar">
      <div className="search-field">
        <Icon name="search" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customers, loans, receipts, or inventory"
        />
      </div>
      <div className="topbar-actions">
        <button className="icon-button" type="button" title="Notifications">
          <Icon name="bell" />
        </button>
        <button className="icon-button" type="button" title="System backup">
          <Icon name="database-backup" />
        </button>
        <div className="text-right">
          <div className="font-bold text-ink leading-tight">{user.full_name}</div>
          <div className="compact muted">{user.role}</div>
        </div>
        <button className="ghost-button" type="button" onClick={onLogout}>
          <Icon name="log-out" />
          Logout
        </button>
      </div>
    </header>
  );
}

function StatCard({ title, value, icon, note, tone }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between gap-3">
        <div className="icon-wrap" style={{ background: tone || "#f7edcf" }}>
          <Icon name={icon} />
        </div>
      </div>
      <div>
        <h3>{title}</h3>
        <strong>{value}</strong>
        <div className="status-line">{note}</div>
      </div>
    </div>
  );
}

function RepaymentChart({ summary }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!window.Chart || !canvasRef.current || !summary) return undefined;
    const chart = new window.Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: summary.repaymentSeries.map((item) => item.label),
        datasets: [
          {
            label: "Collections",
            data: summary.repaymentSeries.map((item) => item.amount),
            backgroundColor: "#12385F",
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => `KES ${Number(value) / 1000}k`
            },
            grid: { color: "#E6EDF6" }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
    return () => chart.destroy();
  }, [summary]);

  return <canvas ref={canvasRef} aria-label="Repayment chart"></canvas>;
}

function LoanTrendChart({ summary }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!window.Chart || !canvasRef.current || !summary) return undefined;
    const chart = new window.Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: summary.loanTrend.map((item) => item.label),
        datasets: [
          {
            data: summary.loanTrend.map((item) => item.count),
            backgroundColor: ["#D9A441", "#1F8A70", "#087F8C", "#BF3B45"],
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              boxWidth: 8
            }
          }
        }
      }
    });
    return () => chart.destroy();
  }, [summary]);

  return <canvas ref={canvasRef} aria-label="Loan trend graph"></canvas>;
}

function Dashboard({ summary }) {
  useLucideIcons(summary);
  if (!summary) {
    return <div className="empty-state">Loading dashboard</div>;
  }

  const cards = summary.cards;
  return (
    <>
      <SectionHeading
        title="Dashboard"
        description="Daily operating view for loans, collections, customers, stock value, and profit signals."
        action={
          <button className="primary-button" type="button">
            <Icon name="plus" />
            New Loan
          </button>
        }
      />
      <section className="stat-grid">
        <StatCard title="Total Active Loans" value={cards.totalActiveLoans} icon="landmark" note="Approved, active, and defaulted" />
        <StatCard title="Collected Today" value={formatCurrency(cards.amountCollectedToday)} icon="wallet-cards" note="Cash, M-Pesa, bank, card" tone="#dff7ef" />
        <StatCard title="Overdue Loans" value={cards.overdueLoans} icon="triangle-alert" note="Needs follow-up" tone="#ffe1e6" />
        <StatCard title="Total Customers" value={cards.totalCustomers} icon="users" note="Registered profiles" tone="#e2f4f6" />
        <StatCard title="Stock Value" value={formatCurrency(cards.inventoryStockValue)} icon="warehouse" note="Buying price basis" tone="#eef2ff" />
        <StatCard title="Monthly Profit" value={formatCurrency(cards.monthlyProfit)} icon="chart-spline" note="Estimated margin" tone="#fff2c6" />
      </section>
      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <h2>Repayment Chart</h2>
            <Badge tone="active">Live</Badge>
          </div>
          <div className="panel-body chart-wrap">
            <RepaymentChart summary={summary} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2>Loan Trend</h2>
            <span className="muted compact">By status</span>
          </div>
          <div className="panel-body chart-wrap">
            <LoanTrendChart summary={summary} />
          </div>
        </div>
      </section>
      <section className="three-column">
        <RecentTransactions payments={summary.recentTransactions} />
        <DuePayments loans={summary.duePayments} />
        <LowStockAlerts items={summary.lowStockAlerts} />
      </section>
    </>
  );
}

function RecentTransactions({ payments }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Recent Transactions</h3>
        <Icon name="receipt" />
      </div>
      <div className="panel-body activity-list">
        {payments.length ? payments.map((payment) => (
          <div className="activity-row" key={payment.id}>
            <div>
              <strong>{payment.customer_name}</strong>
              <div className="compact muted">{payment.payment_code} Â· {payment.payment_method}</div>
            </div>
            <span className="money">{formatCurrency(payment.amount_paid)}</span>
          </div>
        )) : <div className="empty-state">No transactions yet.</div>}
      </div>
    </div>
  );
}

function DuePayments({ loans }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Due Payments</h3>
        <Icon name="calendar-clock" />
      </div>
      <div className="panel-body activity-list">
        {loans.length ? loans.map((loan) => (
          <div className="activity-row" key={loan.id}>
            <div>
              <strong>{loan.customer_name}</strong>
              <div className="compact muted">{loan.loan_code} Â· Due {formatDate(loan.due_date)}</div>
            </div>
            <span className="money">{formatCurrency(loan.balance)}</span>
          </div>
        )) : <div className="empty-state">No due payments yet.</div>}
      </div>
    </div>
  );
}

function LowStockAlerts({ items }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Low Stock Alerts</h3>
        <Icon name="package-search" />
      </div>
      <div className="panel-body alert-list">
        {items.length ? items.map((item) => (
          <div className="alert-row" key={item.id}>
            <div>
              <strong>{item.product_name}</strong>
              <div className="compact muted">{item.category}</div>
            </div>
            <Badge tone={item.quantity <= 1 ? "defaulted" : "pending"}>{item.quantity} left</Badge>
          </div>
        )) : <div className="empty-state">No low stock items</div>}
      </div>
    </div>
  );
}

function CustomerManagement({ customers, refreshData, globalSearch, user }) {
  const [form, setForm] = useState(emptyCustomerForm);
  const [selectedTab, setSelectedTab] = useState("Personal details");
  const [message, setMessage] = useState("");
  const isSuperAdmin = user.role === "Super Admin";
  useLucideIcons(selectedTab);

  const filteredCustomers = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) =>
      [customer.full_name, customer.customer_code, customer.national_id, customer.phone, customer.county]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [customers, globalSearch]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function setCustomerImage(field, event) {
    const image = await readImageInput(event);
    if (image) setField(field, image);
  }

  async function saveCustomer(event) {
    event.preventDefault();
    const { data } = await api.post("/api/customers", form);
    setMessage(`${data.full_name} registered as ${data.customer_code}`);
    setForm(emptyCustomerForm);
    await refreshData();
  }

  async function deleteCustomer(customer) {
    if (!isSuperAdmin) return;
    if (!window.confirm(`Delete ${customer.full_name} and all linked records?`)) return;
    const { data } = await api.delete(`/api/customers/${customer.id}`);
    setMessage(data.message);
    await refreshData();
  }

  async function clearCustomers() {
    if (!isSuperAdmin || customers.length === 0) return;
    if (!window.confirm("Clear all customers, guarantors, loans, payments, sales, and agreements?")) return;
    const { data } = await api.delete("/api/customers");
    setMessage(data.message);
    await refreshData();
  }

  return (
    <>
      <SectionHeading
        title="Customer Management"
        description="Register customers, capture guarantor details, upload required documents, and review customer history."
        action={
          <div className="button-row mt-0">
            <button className="secondary-button" type="button">
              <Icon name="upload" />
              Upload Documents
            </button>
            {isSuperAdmin ? (
              <button className="ghost-button" type="button" onClick={clearCustomers} disabled={customers.length === 0}>
                <Icon name="trash-2" />
                Clear Customers
              </button>
            ) : null}
          </div>
        }
      />
      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <h2>Customer Registration</h2>
            <Badge tone="active">KYC</Badge>
          </div>
          <form className="panel-body form-grid" onSubmit={saveCustomer}>
            <div className="section-title">Personal Information</div>
            <Field label="Full name">
              <input value={form.full_name} onChange={(event) => setField("full_name", event.target.value)} required />
            </Field>
            <Field label="National ID number">
              <input value={form.national_id} onChange={(event) => setField("national_id", event.target.value)} required />
            </Field>
            <Field label="Phone number">
              <input value={form.phone} onChange={(event) => setField("phone", event.target.value)} required />
            </Field>
            <Field label="Alternative phone">
              <input value={form.alt_phone} onChange={(event) => setField("alt_phone", event.target.value)} />
            </Field>
            <Field label="Email address">
              <input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} />
            </Field>
            <Field label="Gender">
              <select value={form.gender} onChange={(event) => setField("gender", event.target.value)}>
                <option value="">Select gender</option>
                <option>Female</option>
                <option>Male</option>
                <option>Prefer not to say</option>
              </select>
            </Field>
            <Field label="Date of birth">
              <input type="date" value={form.dob} onChange={(event) => setField("dob", event.target.value)} />
            </Field>
            <Field label="Occupation">
              <input value={form.occupation} onChange={(event) => setField("occupation", event.target.value)} />
            </Field>
            <Field label="Monthly income">
              <input type="number" value={form.monthly_income} onChange={(event) => setField("monthly_income", event.target.value)} />
            </Field>
            <Field label="County">
              <input value={form.county} onChange={(event) => setField("county", event.target.value)} />
            </Field>
            <Field label="Estate/location">
              <input value={form.estate} onChange={(event) => setField("estate", event.target.value)} />
            </Field>
            <Field label="Physical address" full>
              <textarea value={form.address} onChange={(event) => setField("address", event.target.value)}></textarea>
            </Field>
            <div className="section-title">Next of Kin / Guarantor</div>
            <Field label="Guarantor name">
              <input value={form.guarantor_name} onChange={(event) => setField("guarantor_name", event.target.value)} />
            </Field>
            <Field label="Guarantor phone">
              <input value={form.guarantor_phone} onChange={(event) => setField("guarantor_phone", event.target.value)} />
            </Field>
            <Field label="Relationship">
              <input value={form.relationship} onChange={(event) => setField("relationship", event.target.value)} />
            </Field>
            <Field label="Guarantor ID number">
              <input value={form.guarantor_id} onChange={(event) => setField("guarantor_id", event.target.value)} />
            </Field>
            <div className="section-title">Upload Section</div>
            <Field label="ID front image">
              <input type="file" accept="image/*" onChange={(event) => setCustomerImage("id_front", event)} />
              <ImagePreview src={form.id_front} label="ID front preview" />
            </Field>
            <Field label="ID back image">
              <input type="file" accept="image/*" onChange={(event) => setCustomerImage("id_back", event)} />
              <ImagePreview src={form.id_back} label="ID back preview" />
            </Field>
            <Field label="Passport photo">
              <input type="file" accept="image/*" onChange={(event) => setCustomerImage("photo", event)} />
              <ImagePreview src={form.photo} label="Passport preview" />
            </Field>
            <Field label="Signature">
              <input type="file" accept="image/*" onChange={(event) => setCustomerImage("signature", event)} />
              <ImagePreview src={form.signature} label="Signature preview" />
            </Field>
            <div className="button-row full">
              <button className="primary-button" type="submit">
                <Icon name="user-plus" />
                Save Customer
              </button>
              <button className="ghost-button" type="button" onClick={() => setForm(emptyCustomerForm)}>
                <Icon name="rotate-ccw" />
                Clear
              </button>
            </div>
            {message ? <div className="success-box full">{message}</div> : null}
          </form>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2>Customer Profile</h2>
            <Badge tone="active">{filteredCustomers.length} records</Badge>
          </div>
          <div className="tabs">
            {["Personal details", "Loan history", "Payment history", "Agreements", "Notes"].map((tab) => (
              <button
                key={tab}
                className={`tab-button ${selectedTab === tab ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="panel-body">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>County</th>
                    <th>ID Images</th>
                    <th>Status</th>
                    {isSuperAdmin ? <th>Control</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length ? filteredCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <strong>{customer.full_name}</strong>
                        <div className="compact muted">{customer.customer_code} Â· ID {customer.national_id}</div>
                      </td>
                      <td>{customer.phone}</td>
                      <td>{customer.county || "Not set"}</td>
                      <td>
                        <div className="thumb-row">
                          <ImagePreview src={customer.id_front} label="Front" />
                          <ImagePreview src={customer.id_back} label="Back" />
                        </div>
                      </td>
                      <td>
                        <Badge tone={customer.blacklist_status ? "blacklisted" : "active"}>
                          {customer.blacklist_status ? "Blacklisted" : "Clear"}
                        </Badge>
                      </td>
                      {isSuperAdmin ? (
                        <td>
                          <button className="ghost-button" type="button" onClick={() => deleteCustomer(customer)}>
                            <Icon name="trash-2" />
                            Delete
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={isSuperAdmin ? "6" : "5"}>
                        <div className="empty-state">No customers registered yet.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function LoanManagement({ customers, loans, refreshData, globalSearch }) {
  const [form, setForm] = useState(initialLoanForm);
  const [message, setMessage] = useState("");
  useLucideIcons(form);

  const filteredLoans = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return loans;
    return loans.filter((loan) =>
      [loan.loan_code, loan.customer_name, loan.status, loan.assigned_officer]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [loans, globalSearch]);

  const loanPreview = useMemo(() => {
    const principal = Number(form.principal_amount || 0);
    const interest = Math.round(principal * (Number(form.interest_rate || 0) / 100));
    const fee = Number(form.processing_fee || 0);
    const total = principal + interest + fee;
    const duration = Math.max(1, Number(form.duration || 1));
    return {
      interest,
      total,
      installment: Math.ceil(total / duration),
      penalty: Math.ceil(total * 0.03)
    };
  }, [form]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveLoan(event) {
    event.preventDefault();
    const { data } = await api.post("/api/loans", form);
    setMessage(`${data.loan_code} created for ${data.customer_name}`);
    setForm(initialLoanForm);
    await refreshData();
  }

  return (
    <>
      <SectionHeading
        title="Loan Management"
        description="Create loans, preview calculations, approve applications, and track balances by officer and due date."
        action={
          <button className="secondary-button" type="button">
            <Icon name="file-check-2" />
            Approvals
          </button>
        }
      />
      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <h2>Loan Issuance</h2>
            <Badge tone="pending">Approval flow</Badge>
          </div>
          <form className="panel-body form-grid" onSubmit={saveLoan}>
            <div className="section-title">Loan Details</div>
            <Field label="Customer selection" full>
              <select value={form.customer_id} onChange={(event) => setField("customer_id", event.target.value)} required>
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.full_name} - {customer.customer_code}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Loan type">
              <select>
                <option>Business Loan</option>
                <option>Emergency Loan</option>
                <option>Salary Advance</option>
                <option>Asset Finance</option>
              </select>
            </Field>
            <Field label="Principal amount">
              <input type="number" value={form.principal_amount} onChange={(event) => setField("principal_amount", event.target.value)} required />
            </Field>
            <Field label="Interest rate (%)">
              <input type="number" value={form.interest_rate} onChange={(event) => setField("interest_rate", event.target.value)} required />
            </Field>
            <Field label="Duration">
              <input type="number" value={form.duration} onChange={(event) => setField("duration", event.target.value)} required />
            </Field>
            <Field label="Processing fee">
              <input type="number" value={form.processing_fee} onChange={(event) => setField("processing_fee", event.target.value)} />
            </Field>
            <Field label="Due date">
              <input type="date" value={form.due_date} onChange={(event) => setField("due_date", event.target.value)} required />
            </Field>
            <Field label="Repayment frequency">
              <select value={form.repayment_frequency} onChange={(event) => setField("repayment_frequency", event.target.value)}>
                <option>Daily</option>
                <option>Weekly</option>
                <option>Monthly</option>
              </select>
            </Field>
            <Field label="Loan status">
              <select value={form.status} onChange={(event) => setField("status", event.target.value)}>
                <option>Pending</option>
                <option>Approved</option>
                <option>Active</option>
              </select>
            </Field>
            <div className="section-title">Automatic Calculations</div>
            <div className="profile-strip full">
              <div>
                <span className="compact muted">Interest</span>
                <strong>{formatCurrency(loanPreview.interest)}</strong>
              </div>
              <div>
                <span className="compact muted">Total payable</span>
                <strong>{formatCurrency(loanPreview.total)}</strong>
              </div>
              <div>
                <span className="compact muted">Installment</span>
                <strong>{formatCurrency(loanPreview.installment)}</strong>
              </div>
              <div>
                <span className="compact muted">Penalty preview</span>
                <strong>{formatCurrency(loanPreview.penalty)}</strong>
              </div>
            </div>
            <div className="button-row full">
              <button className="primary-button" type="submit">
                <Icon name="circle-dollar-sign" />
                Create Loan
              </button>
              <button className="ghost-button" type="button" onClick={() => setForm(initialLoanForm)}>
                <Icon name="rotate-ccw" />
                Reset
              </button>
            </div>
            {message ? <div className="success-box full">{message}</div> : null}
          </form>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2>Loan Register</h2>
            <Badge tone="active">{filteredLoans.length} loans</Badge>
          </div>
          <div className="panel-body table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Loan ID</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th>Officer</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoans.length ? filteredLoans.map((loan) => (
                  <tr key={loan.id}>
                    <td><strong>{loan.loan_code}</strong></td>
                    <td>{loan.customer_name}</td>
                    <td>{formatCurrency(loan.principal_amount)}</td>
                    <td className="money">{formatCurrency(loan.balance)}</td>
                    <td>{formatDate(loan.due_date)}</td>
                    <td><Badge tone={loan.status}>{loan.status}</Badge></td>
                    <td>{loan.assigned_officer}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="7">
                      <div className="empty-state">No loans issued yet.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function PaymentManagement({ loans, payments, refreshData, user }) {
  const payableLoans = loans.filter((loan) => Number(loan.balance) > 0);
  const [form, setForm] = useState(initialPaymentForm);
  const [message, setMessage] = useState("");
  const selectedLoan = loans.find((loan) => loan.id === Number(form.loan_id));
  useLucideIcons(form);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function savePayment(event) {
    event.preventDefault();
    const { data } = await api.post("/api/payments", {
      ...form,
      received_by: user.id
    });
    setMessage(`${data.payment_code} received from ${data.customer_name}`);
    setForm(initialPaymentForm);
    await refreshData();
  }

  return (
    <>
      <SectionHeading
        title="Payment Management"
        description="Receive repayments, support partial payments, update balances, add transaction references, and prepare receipts."
        action={
          <button className="secondary-button" type="button">
            <Icon name="printer" />
            Print Receipt
          </button>
        }
      />
      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <h2>Payment Form</h2>
            <Badge tone="active">Auto-balance</Badge>
          </div>
          <form className="panel-body form-grid" onSubmit={savePayment}>
            <Field label="Customer / loan selection" full>
              <select value={form.loan_id} onChange={(event) => setField("loan_id", event.target.value)} required>
                <option value="">Select active loan</option>
                {payableLoans.map((loan) => (
                  <option key={loan.id} value={loan.id}>
                    {loan.customer_name} - {loan.loan_code} - Balance {formatCurrency(loan.balance)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount paid">
              <input type="number" value={form.amount_paid} onChange={(event) => setField("amount_paid", event.target.value)} required />
            </Field>
            <Field label="Payment method">
              <select value={form.payment_method} onChange={(event) => setField("payment_method", event.target.value)}>
                <option>Cash</option>
                <option>M-Pesa</option>
                <option>Bank Transfer</option>
                <option>Card</option>
              </select>
            </Field>
            <Field label="Transaction code">
              <input value={form.transaction_code} onChange={(event) => setField("transaction_code", event.target.value)} placeholder="M-Pesa or bank reference" />
            </Field>
            <Field label="Notes">
              <input value={form.notes} onChange={(event) => setField("notes", event.target.value)} />
            </Field>
            {selectedLoan ? (
              <div className="profile-strip full">
                <div>
                  <span className="compact muted">Customer</span>
                  <strong>{selectedLoan.customer_name}</strong>
                </div>
                <div>
                  <span className="compact muted">Loan number</span>
                  <strong>{selectedLoan.loan_code}</strong>
                </div>
                <div>
                  <span className="compact muted">Current balance</span>
                  <strong>{formatCurrency(selectedLoan.balance)}</strong>
                </div>
                <div>
                  <span className="compact muted">After payment</span>
                  <strong>{formatCurrency(Math.max(0, Number(selectedLoan.balance) - Number(form.amount_paid || 0)))}</strong>
                </div>
              </div>
            ) : null}
            <div className="button-row full">
              <button className="primary-button" type="submit">
                <Icon name="banknote" />
                Receive Payment
              </button>
              <button className="ghost-button" type="button">
                <Icon name="message-square-text" />
                SMS Confirmation
              </button>
            </div>
            {message ? <div className="success-box full">{message}</div> : null}
          </form>
        </div>
        <ReceiptPreview selectedLoan={selectedLoan} amount={form.amount_paid} user={user} />
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Payment Records</h2>
          <Badge tone="active">{payments.length} receipts</Badge>
        </div>
        <div className="panel-body table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Customer</th>
                <th>Loan</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Received by</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.length ? payments.map((payment) => (
                <tr key={payment.id}>
                  <td><strong>{payment.payment_code}</strong></td>
                  <td>{payment.customer_name}</td>
                  <td>{payment.loan_code}</td>
                  <td className="money">{formatCurrency(payment.amount_paid)}</td>
                  <td>{payment.payment_method}</td>
                  <td>{payment.received_by_name}</td>
                  <td>{formatDate(payment.payment_date)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7">
                    <div className="empty-state">No payment records yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ReceiptPreview({ selectedLoan, amount, user }) {
  const paid = Number(amount || 0);
  const balance = selectedLoan ? Math.max(0, Number(selectedLoan.balance) - paid) : 0;
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Receipt Layout</h2>
        <Icon name="badge-check" />
      </div>
      <div className="panel-body">
        <div className="brand-lockup mb-5">
          <img src="/assets/draman-logo.svg" alt="DRAMAN Loan Services logo" />
          <div>
            <div className="brand-title text-ink">DRAMAN Loan Services</div>
            <div className="brand-subtitle text-slate-500">Receipts and agreements desk</div>
          </div>
        </div>
        <div className="profile-strip">
          <div>
            <span className="compact muted">Receipt number</span>
            <strong>Auto-generated</strong>
          </div>
          <div>
            <span className="compact muted">Customer name</span>
            <strong>{selectedLoan ? selectedLoan.customer_name : "Select loan"}</strong>
          </div>
          <div>
            <span className="compact muted">Loan number</span>
            <strong>{selectedLoan ? selectedLoan.loan_code : "Pending"}</strong>
          </div>
          <div>
            <span className="compact muted">Amount paid</span>
            <strong>{formatCurrency(paid)}</strong>
          </div>
          <div>
            <span className="compact muted">Remaining balance</span>
            <strong>{formatCurrency(balance)}</strong>
          </div>
          <div>
            <span className="compact muted">Payment date</span>
            <strong>{formatDate(new Date())}</strong>
          </div>
          <div>
            <span className="compact muted">Officer signature</span>
            <strong>{user.full_name}</strong>
          </div>
          <div>
            <span className="compact muted">Footer</span>
            <strong>Thank you</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryManagement({ inventory, refreshData, user }) {
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [message, setMessage] = useState("");
  const isSuperAdmin = user.role === "Super Admin";
  useLucideIcons(productForm);
  const stockValue = inventory.reduce((sum, item) => sum + Number(item.quantity) * Number(item.buying_price), 0);
  const retailValue = inventory.reduce((sum, item) => sum + Number(item.quantity) * Number(item.selling_price), 0);

  function setProductField(field, value) {
    setProductForm((current) => ({ ...current, [field]: value }));
  }

  async function setProductImage(event) {
    const image = await readImageInput(event);
    if (image) setProductField("image", image);
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!isSuperAdmin) return;
    const { data } = await api.post("/api/inventory", productForm);
    setMessage(`${data.product_name} added to inventory`);
    setProductForm(emptyProductForm);
    await refreshData();
  }

  async function deleteProduct(product) {
    if (!isSuperAdmin) return;
    if (!window.confirm(`Delete ${product.product_name} from inventory?`)) return;
    const { data } = await api.delete(`/api/inventory/${product.id}`);
    setMessage(data.message);
    await refreshData();
  }

  async function clearProducts() {
    if (!isSuperAdmin || inventory.length === 0) return;
    if (!window.confirm("Clear all product records and linked sales?")) return;
    const { data } = await api.delete("/api/inventory");
    setMessage(data.message);
    await refreshData();
  }

  return (
    <>
      <SectionHeading
        title="Inventory & Sales"
        description="Manage second-hand stock, furniture sales, product categories, and installment ownership records."
        action={
          isSuperAdmin ? (
            <button className="ghost-button" type="button" onClick={clearProducts} disabled={inventory.length === 0}>
              <Icon name="trash-2" />
              Clear Products
            </button>
          ) : null
        }
      />
      <section className="metric-band">
        <div className="metric-cell"><span className="compact muted">Stock value</span><strong>{formatCurrency(stockValue)}</strong></div>
        <div className="metric-cell"><span className="compact muted">Retail value</span><strong>{formatCurrency(retailValue)}</strong></div>
        <div className="metric-cell"><span className="compact muted">Products</span><strong>{inventory.length}</strong></div>
        <div className="metric-cell"><span className="compact muted">Low stock</span><strong>{inventory.filter((item) => item.quantity <= 2).length}</strong></div>
      </section>
      {isSuperAdmin ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Add Product</h2>
            <Badge tone="active">Super Admin</Badge>
          </div>
          <form className="panel-body form-grid" onSubmit={saveProduct}>
            <Field label="Product name">
              <input value={productForm.product_name} onChange={(event) => setProductField("product_name", event.target.value)} required />
            </Field>
            <Field label="Category">
              <select value={productForm.category} onChange={(event) => setProductField("category", event.target.value)}>
                <option>Furniture</option>
                <option>Electronics</option>
                <option>Phones</option>
                <option>TVs</option>
                <option>Woofers</option>
                <option>Gas cylinders</option>
                <option>Household items</option>
                <option>Office furniture</option>
              </select>
            </Field>
            <Field label="Quantity">
              <input type="number" min="0" value={productForm.quantity} onChange={(event) => setProductField("quantity", event.target.value)} required />
            </Field>
            <Field label="Buying price">
              <input type="number" min="0" value={productForm.buying_price} onChange={(event) => setProductField("buying_price", event.target.value)} required />
            </Field>
            <Field label="Selling price">
              <input type="number" min="0" value={productForm.selling_price} onChange={(event) => setProductField("selling_price", event.target.value)} required />
            </Field>
            <Field label="Condition">
              <input value={productForm.condition} onChange={(event) => setProductField("condition", event.target.value)} />
            </Field>
            <Field label="Serial number">
              <input value={productForm.serial_number} onChange={(event) => setProductField("serial_number", event.target.value)} />
            </Field>
            <Field label="Product image">
              <input type="file" accept="image/*" onChange={setProductImage} />
              <ImagePreview src={productForm.image} label="Product image preview" />
            </Field>
            <Field label="Product description" full>
              <textarea value={productForm.description} onChange={(event) => setProductField("description", event.target.value)} required></textarea>
            </Field>
            <div className="button-row full">
              <button className="primary-button" type="submit">
                <Icon name="package-plus" />
                Save Product
              </button>
              <button className="ghost-button" type="button" onClick={() => setProductForm(emptyProductForm)}>
                <Icon name="rotate-ccw" />
                Clear Form
              </button>
            </div>
            {message ? <div className="success-box full">{message}</div> : null}
          </form>
        </section>
      ) : null}
      <section className="panel">
        <div className="panel-header">
          <h2>Product Register</h2>
          <Badge tone="active">Installments ready</Badge>
        </div>
        <div className="panel-body table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Product</th>
                <th>Description</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Buying price</th>
                <th>Selling price</th>
                <th>Condition</th>
                <th>Serial number</th>
                {isSuperAdmin ? <th>Control</th> : null}
              </tr>
            </thead>
            <tbody>
              {inventory.length ? inventory.map((item) => (
                <tr key={item.id}>
                  <td><ImagePreview src={item.image} label={item.product_name} /></td>
                  <td><strong>{item.product_name}</strong></td>
                  <td>{item.description}</td>
                  <td>{item.category}</td>
                  <td><Badge tone={item.quantity <= 2 ? "pending" : "active"}>{item.quantity}</Badge></td>
                  <td>{formatCurrency(item.buying_price)}</td>
                  <td className="money">{formatCurrency(item.selling_price)}</td>
                  <td>{item.condition}</td>
                  <td>{item.serial_number}</td>
                  {isSuperAdmin ? (
                    <td>
                      <button className="ghost-button" type="button" onClick={() => deleteProduct(item)}>
                        <Icon name="trash-2" />
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              )) : (
                <tr>
                  <td colSpan={isSuperAdmin ? "10" : "9"}>
                    <div className="empty-state">No products registered yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Reports({ summary, loans, inventory }) {
  useLucideIcons(summary);
  const outstanding = loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
  const defaulted = loans.filter((loan) => loan.status === "Defaulted").length;

  return (
    <>
      <SectionHeading
        title="Reports"
        description="Financial and inventory reporting with export-ready summaries for PDF, Excel, and CSV output."
        action={
          <div className="button-row mt-0">
            <button className="ghost-button" type="button"><Icon name="file-spreadsheet" />Excel</button>
            <button className="ghost-button" type="button"><Icon name="file-text" />CSV</button>
            <button className="secondary-button" type="button"><Icon name="file-down" />PDF</button>
          </div>
        }
      />
      <section className="metric-band">
        <div className="metric-cell"><span className="compact muted">Daily collections</span><strong>{formatCurrency(summary?.cards.amountCollectedToday)}</strong></div>
        <div className="metric-cell"><span className="compact muted">Outstanding balances</span><strong>{formatCurrency(outstanding)}</strong></div>
        <div className="metric-cell"><span className="compact muted">Default reports</span><strong>{defaulted}</strong></div>
        <div className="metric-cell"><span className="compact muted">Stock value</span><strong>{formatCurrency(summary?.cards.inventoryStockValue)}</strong></div>
      </section>
      <section className="three-column">
        {["Daily collections", "Profit analysis", "Fast-selling products"].map((title, index) => (
          <div className="panel" key={title}>
            <div className="panel-header">
              <h2>{title}</h2>
              <Icon name={index === 0 ? "coins" : index === 1 ? "chart-line" : "trending-up"} />
            </div>
            <div className="panel-body">
              <p className="muted">Report filters, date ranges, and export jobs are ready to connect to PostgreSQL queries.</p>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function Agreements({ agreements, loans }) {
  useLucideIcons(agreements);
  return (
    <>
      <SectionHeading
        title="Agreements & Documents"
        description="Generate loan agreements, guarantor forms, receipts, clearance certificates, and installment agreements."
        action={<button className="primary-button" type="button"><Icon name="file-plus-2" />Generate Document</button>}
      />
      <section className="panel">
        <div className="panel-header">
          <h2>Document Register</h2>
          <Badge tone="active">QR-ready</Badge>
        </div>
        <div className="panel-body document-list">
          {agreements.length ? agreements.map((agreement) => {
            const loan = loans.find((item) => item.id === agreement.loan_id);
            return (
              <div className="document-row" key={agreement.id}>
                <div>
                  <strong>{agreement.agreement_type}</strong>
                  <div className="compact muted">{loan?.customer_name || "Customer"} Â· {loan?.loan_code || "Installment agreement"}</div>
                </div>
                <div className="button-row mt-0">
                  <button className="ghost-button" type="button"><Icon name="qr-code" />Verify</button>
                  <button className="secondary-button" type="button"><Icon name="printer" />Print</button>
                </div>
              </div>
            );
          }) : <div className="empty-state">No documents generated yet.</div>}
        </div>
      </section>
    </>
  );
}

function Settings() {
  useLucideIcons("settings");
  return (
    <>
      <SectionHeading
        title="Settings"
        description="Configure business details, loan rules, penalty settings, backup schedules, SMS, and user permissions."
      />
      <section className="three-column">
        <SettingsPanel
          title="Business Settings"
          icon="building-2"
          fields={["Company name", "Logo upload", "Contact details", "Receipt footer", "SMS settings"]}
        />
        <SettingsPanel
          title="Loan Settings"
          icon="badge-percent"
          fields={["Default interest rate", "Penalty rules", "Grace periods", "Processing fee", "Approval thresholds"]}
        />
        <SettingsPanel
          title="Security Settings"
          icon="shield-check"
          fields={["Password rules", "Backup schedules", "User permissions", "Session timeout", "Activity logs"]}
        />
      </section>
    </>
  );
}

function SettingsPanel({ title, icon, fields }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <Icon name={icon} />
      </div>
      <div className="panel-body activity-list">
        {fields.map((field) => (
          <div className="activity-row" key={field}>
            <strong>{field}</strong>
            <button className="icon-button" type="button" title={`Edit ${field}`}>
              <Icon name="pencil" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppShell({ session, onLogout }) {
  const [activeView, setActiveView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [agreements, setAgreements] = useState([]);

  useEffect(() => {
    window.__DRAMAN_ROLE__ = session.user.role;
    return () => {
      window.__DRAMAN_ROLE__ = "";
    };
  }, [session.user.role]);

  async function refreshData() {
    const [summaryResult, customersResult, loansResult, paymentsResult, inventoryResult, agreementsResult] = await Promise.all([
      api.get("/api/summary"),
      api.get("/api/customers"),
      api.get("/api/loans"),
      api.get("/api/payments"),
      api.get("/api/inventory"),
      api.get("/api/agreements")
    ]);
    setSummary(summaryResult.data);
    setCustomers(customersResult.data);
    setLoans(loansResult.data);
    setPayments(paymentsResult.data);
    setInventory(inventoryResult.data);
    setAgreements(agreementsResult.data);
  }

  useEffect(() => {
    refreshData();
  }, []);

  const viewProps = {
    summary,
    customers,
    loans,
    payments,
    inventory,
    agreements,
    refreshData,
    globalSearch: search,
    user: session.user
  };

  const visibleNav = navItems.filter((item) => item.roles.includes(session.user.role));
  useEffect(() => {
    if (!visibleNav.some((item) => item.id === activeView)) {
      setActiveView("dashboard");
    }
  }, [session.user.role]);

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} setActiveView={setActiveView} user={session.user} />
      <div className="workspace">
        <Topbar user={session.user} search={search} setSearch={setSearch} onLogout={onLogout} />
        <main className="main-content">
          {activeView === "dashboard" ? <Dashboard {...viewProps} /> : null}
          {activeView === "customers" ? <CustomerManagement {...viewProps} /> : null}
          {activeView === "loans" ? <LoanManagement {...viewProps} /> : null}
          {activeView === "payments" ? <PaymentManagement {...viewProps} /> : null}
          {activeView === "inventory" ? <InventoryManagement {...viewProps} /> : null}
          {activeView === "reports" ? <Reports {...viewProps} /> : null}
          {activeView === "agreements" ? <Agreements {...viewProps} /> : null}
          {activeView === "settings" ? <Settings {...viewProps} /> : null}
        </main>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(() => {
    const saved = window.localStorage.getItem("draman-session");
    return saved ? JSON.parse(saved) : null;
  });

  function handleLogin(nextSession) {
    window.localStorage.setItem("draman-session", JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function handleLogout() {
    window.localStorage.removeItem("draman-session");
    setSession(null);
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <AppShell session={session} onLogout={handleLogout} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
```

## public/styles.css

`$lang
:root {
  --ink: #0b1f3a;
  --harbor: #12385f;
  --brass: #d9a441;
  --paper: #ffffff;
  --mist: #f4f7fb;
  --line: #d9e2ee;
  --muted: #65758b;
  --success: #1f8a70;
  --danger: #bf3b45;
  --warning: #b97808;
  --teal: #087f8c;
  --violet: #6750a4;
  --radius: 8px;
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  color: #172033;
  background: var(--mist);
  font-family: Inter, "Segoe UI", Arial, sans-serif;
  letter-spacing: 0;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  border: 0;
}

.app-shell {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 20px 16px;
  background: var(--ink);
  color: #eaf0f8;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.brand-lockup img {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
}

.brand-title {
  font-size: 15px;
  line-height: 1.15;
  font-weight: 800;
}

.brand-subtitle {
  color: #b5c6db;
  font-size: 12px;
}

.nav-stack {
  display: grid;
  gap: 6px;
}

.nav-button {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  color: #dbe6f5;
  background: transparent;
  border-radius: var(--radius);
  text-align: left;
  transition: background 160ms ease, color 160ms ease;
}

.nav-button:hover,
.nav-button.active {
  background: #173d68;
  color: #ffffff;
}

.nav-button.active {
  box-shadow: inset 3px 0 0 var(--brass);
}

.role-panel {
  margin-top: auto;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.06);
}

.workspace {
  min-width: 0;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 72px;
  padding: 14px 28px;
  background: rgba(255, 255, 255, 0.94);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(12px);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-field {
  position: relative;
  width: min(520px, 48vw);
}

.search-field input {
  width: 100%;
  min-height: 42px;
  padding: 0 14px 0 42px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #f8fafc;
  color: #172033;
  outline: none;
}

.search-field .icon {
  position: absolute;
  left: 13px;
  top: 50%;
  width: 18px;
  height: 18px;
  transform: translateY(-50%);
  color: var(--muted);
}

.main-content {
  display: grid;
  gap: 22px;
  padding: 26px 28px 40px;
}

.view-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.view-heading h1 {
  margin: 0;
  color: var(--ink);
  font-size: 28px;
  line-height: 1.15;
  font-weight: 800;
}

.view-heading p {
  margin: 6px 0 0;
  color: var(--muted);
  max-width: 780px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(205px, 1fr));
  gap: 14px;
}

.stat-card,
.panel,
.login-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: 0 10px 22px rgba(14, 37, 68, 0.05);
}

.stat-card {
  min-height: 134px;
  padding: 16px;
  display: grid;
  align-content: space-between;
  gap: 14px;
}

.stat-card .icon-wrap,
.icon-button,
.action-button .icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.stat-card .icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  color: var(--ink);
  background: #f7edcf;
}

.stat-card h3 {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.stat-card strong {
  display: block;
  color: var(--ink);
  font-size: 22px;
  line-height: 1.15;
  overflow-wrap: normal;
  word-break: normal;
}

.status-line {
  color: var(--muted);
  font-size: 12px;
}

.two-column {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
  gap: 18px;
}

.three-column {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.panel {
  min-width: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 58px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}

.panel-header h2,
.panel-header h3 {
  margin: 0;
  color: var(--ink);
  font-size: 17px;
  font-weight: 800;
}

.panel-body {
  padding: 18px;
}

.chart-wrap {
  height: 292px;
}

.chart-wrap canvas {
  width: 100%;
  height: 100%;
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
}

.data-table th,
.data-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

.data-table th {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  white-space: nowrap;
}

.data-table td {
  color: #1e293b;
  font-size: 14px;
}

.money {
  font-weight: 800;
  color: var(--ink);
  white-space: nowrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.badge.active,
.badge.approved,
.badge.completed {
  color: #0b5c49;
  background: #dff7ef;
}

.badge.pending {
  color: #705107;
  background: #fff2c6;
}

.badge.defaulted,
.badge.overdue {
  color: #8b1e2c;
  background: #ffe1e6;
}

.badge.cancelled,
.badge.blacklisted {
  color: #4b5563;
  background: #eef2f7;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.form-grid.single {
  grid-template-columns: 1fr;
}

.field {
  display: grid;
  gap: 7px;
}

.field label {
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #ffffff;
  color: #172033;
  padding: 9px 11px;
  outline: none;
}

.field textarea {
  min-height: 84px;
  resize: vertical;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--harbor);
  box-shadow: 0 0 0 3px rgba(18, 56, 95, 0.11);
}

.field.full {
  grid-column: 1 / -1;
}

.section-title {
  grid-column: 1 / -1;
  margin: 10px 0 0;
  color: var(--harbor);
  font-size: 13px;
  font-weight: 900;
  text-transform: uppercase;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.primary-button,
.secondary-button,
.ghost-button,
.icon-button {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: var(--radius);
  font-weight: 850;
  transition: transform 120ms ease, background 160ms ease, color 160ms ease;
}

.primary-button {
  padding: 0 16px;
  color: #10233d;
  background: var(--brass);
}

.primary-button:hover {
  background: #e4b85b;
}

.secondary-button {
  padding: 0 16px;
  color: #ffffff;
  background: var(--harbor);
}

.secondary-button:hover {
  background: #0d2f53;
}

.ghost-button {
  padding: 0 14px;
  color: var(--harbor);
  background: #ecf3fb;
}

.ghost-button:hover {
  background: #dce9f6;
}

.icon-button {
  width: 42px;
  color: var(--ink);
  border: 1px solid var(--line);
  background: #ffffff;
}

.icon-button:hover {
  background: #f8fafc;
}

.primary-button:active,
.secondary-button:active,
.ghost-button:active,
.icon-button:active {
  transform: translateY(1px);
}

.icon,
.nav-button svg,
.icon-button svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.activity-list,
.alert-list,
.document-list {
  display: grid;
  gap: 10px;
}

.activity-row,
.alert-row,
.document-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}

.activity-row:last-child,
.alert-row:last-child,
.document-row:last-child {
  border-bottom: 0;
}

.muted {
  color: var(--muted);
}

.compact {
  font-size: 13px;
}

.login-screen {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(320px, 0.8fr) minmax(420px, 1.2fr);
  background: #f8fafc;
}

.login-visual {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 28px;
  padding: 36px;
  color: #ffffff;
  background:
    linear-gradient(rgba(11, 31, 58, 0.94), rgba(11, 31, 58, 0.9)),
    url("/assets/draman-logo.svg") center 18% / 280px 280px no-repeat,
    var(--ink);
}

.login-visual h1 {
  max-width: 520px;
  margin: 36px 0 0;
  font-size: 38px;
  line-height: 1.05;
  font-weight: 900;
}

.login-visual p {
  max-width: 520px;
  margin: 12px 0 0;
  color: #c9d8ea;
}

.login-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.login-metric {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.08);
}

.login-metric strong {
  display: block;
  font-size: 19px;
}

.login-form-wrap {
  display: grid;
  place-items: center;
  padding: 28px;
}

.login-card {
  width: min(440px, 100%);
  padding: 26px;
}

.login-card h2 {
  margin: 0;
  color: var(--ink);
  font-size: 24px;
  font-weight: 900;
}

.login-card p {
  margin: 8px 0 22px;
  color: var(--muted);
}

.quick-roles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.quick-role {
  min-height: 38px;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--harbor);
  background: #ffffff;
  font-size: 13px;
  font-weight: 800;
}

.quick-role:hover {
  background: #ecf3fb;
}

.error-box,
.success-box {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 750;
}

.error-box {
  color: #8b1e2c;
  background: #ffe1e6;
}

.success-box {
  color: #0b5c49;
  background: #dff7ef;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-bottom: 1px solid var(--line);
  padding: 0 18px;
}

.tab-button {
  min-height: 44px;
  color: var(--muted);
  background: transparent;
  font-weight: 850;
  border-bottom: 3px solid transparent;
}

.tab-button.active {
  color: var(--harbor);
  border-color: var(--brass);
}

.profile-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.profile-strip div {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #f8fafc;
}

.image-preview {
  width: min(100%, 180px);
  min-height: 94px;
  display: grid;
  place-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px dashed #b9c7d8;
  border-radius: var(--radius);
  background: #f8fafc;
  color: var(--muted);
  font-size: 12px;
  font-weight: 750;
  text-align: center;
}

.image-preview img {
  width: 100%;
  height: 72px;
  object-fit: cover;
  border-radius: 6px;
  background: #ffffff;
}

.image-preview.empty svg {
  width: 22px;
  height: 22px;
  color: #8798ad;
}

.thumb-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.thumb-row .image-preview {
  width: 78px;
  min-height: 66px;
  padding: 5px;
}

.thumb-row .image-preview img {
  height: 42px;
}

.thumb-row .image-preview span {
  font-size: 11px;
}

.metric-band {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.metric-cell {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #ffffff;
}

.metric-cell strong {
  display: block;
  margin-top: 5px;
  color: var(--ink);
  font-size: 22px;
}

.empty-state {
  display: grid;
  place-items: center;
  min-height: 180px;
  color: var(--muted);
  text-align: center;
}

@media (max-width: 1180px) {
  .stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .two-column,
  .three-column {
    grid-template-columns: 1fr;
  }

  .metric-band,
  .profile-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
    height: auto;
  }

  .nav-stack {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .topbar {
    align-items: stretch;
    flex-direction: column;
    padding: 14px 18px;
  }

  .search-field {
    width: 100%;
  }

  .main-content {
    padding: 22px 18px 34px;
  }

  .login-screen {
    grid-template-columns: 1fr;
  }

  .login-visual {
    min-height: 360px;
  }
}

@media (max-width: 620px) {
  .stat-grid,
  .form-grid,
  .metric-band,
  .profile-strip,
  .login-metrics,
  .quick-roles,
  .nav-stack {
    grid-template-columns: 1fr;
  }

  .view-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .topbar-actions {
    justify-content: space-between;
  }

  .login-visual,
  .login-form-wrap {
    padding: 22px;
  }

  .login-visual h1 {
    font-size: 30px;
  }
}
```

## public/assets/draman-logo.svg

`$lang
<svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">DRAMAN Loan Services logo</title>
  <desc id="desc">A dark blue shield with gold DLS lettering.</desc>
  <rect width="160" height="160" rx="32" fill="#0B1F3A"/>
  <path d="M80 20L124 36V72C124 102 105 130 80 140C55 130 36 102 36 72V36L80 20Z" fill="#102B4F" stroke="#D9A441" stroke-width="6"/>
  <path d="M55 101V55H76C90 55 100 64 100 78C100 92 90 101 76 101H55Z" fill="#D9A441"/>
  <path d="M70 88H76C83 88 88 84 88 78C88 72 83 68 76 68H70V88Z" fill="#0B1F3A"/>
  <path d="M105 58V101H94V58H105Z" fill="#F7F4EC"/>
  <path d="M50 113H110" stroke="#F7F4EC" stroke-width="7" stroke-linecap="round"/>
</svg>
```

## database/schema.sql

`$lang
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  phone VARCHAR(40),
  password_hash TEXT NOT NULL,
  role VARCHAR(40) NOT NULL CHECK (role IN ('Super Admin', 'Loan Officer', 'Cashier', 'Inventory Manager')),
  status VARCHAR(30) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
  id BIGSERIAL PRIMARY KEY,
  customer_code VARCHAR(40) NOT NULL UNIQUE,
  full_name VARCHAR(180) NOT NULL,
  national_id VARCHAR(40) NOT NULL UNIQUE,
  phone VARCHAR(40) NOT NULL,
  alt_phone VARCHAR(40),
  email VARCHAR(180),
  gender VARCHAR(40),
  dob DATE,
  occupation VARCHAR(140),
  monthly_income NUMERIC(14, 2) DEFAULT 0,
  county VARCHAR(80),
  estate VARCHAR(140),
  address TEXT,
  photo TEXT,
  id_front TEXT,
  id_back TEXT,
  signature TEXT,
  blacklist_status BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE guarantors (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  full_name VARCHAR(180) NOT NULL,
  national_id VARCHAR(40),
  phone VARCHAR(40) NOT NULL,
  relationship VARCHAR(80),
  address TEXT
);

CREATE TABLE loans (
  id BIGSERIAL PRIMARY KEY,
  loan_code VARCHAR(40) NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  principal_amount NUMERIC(14, 2) NOT NULL CHECK (principal_amount > 0),
  interest_rate NUMERIC(6, 2) NOT NULL DEFAULT 0,
  processing_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_payable NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  repayment_frequency VARCHAR(40) NOT NULL CHECK (repayment_frequency IN ('Daily', 'Weekly', 'Monthly')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Active', 'Completed', 'Defaulted', 'Cancelled')),
  assigned_officer BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loan_schedule (
  id BIGSERIAL PRIMARY KEY,
  loan_id BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  expected_amount NUMERIC(14, 2) NOT NULL,
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Partially Paid', 'Paid', 'Overdue')),
  UNIQUE (loan_id, installment_number)
);

CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  payment_code VARCHAR(40) NOT NULL UNIQUE,
  loan_id BIGINT NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount_paid NUMERIC(14, 2) NOT NULL CHECK (amount_paid > 0),
  payment_method VARCHAR(40) NOT NULL CHECK (payment_method IN ('Cash', 'M-Pesa', 'Bank Transfer', 'Card')),
  transaction_code VARCHAR(120),
  notes TEXT,
  received_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE penalties (
  id BIGSERIAL PRIMARY KEY,
  loan_id BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  reason TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid', 'Waived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory (
  id BIGSERIAL PRIMARY KEY,
  product_name VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL CHECK (category IN ('Furniture', 'Electronics', 'Phones', 'TVs', 'Woofers', 'Gas cylinders', 'Household items', 'Office furniture')),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  buying_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description TEXT,
  condition VARCHAR(80),
  serial_number VARCHAR(120),
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sales (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  selling_price NUMERIC(14, 2) NOT NULL CHECK (selling_price >= 0),
  payment_type VARCHAR(40) NOT NULL CHECK (payment_type IN ('Cash', 'Installment')),
  down_payment NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE installment_payments (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount_paid NUMERIC(14, 2) NOT NULL CHECK (amount_paid > 0),
  payment_method VARCHAR(40) NOT NULL CHECK (payment_method IN ('Cash', 'M-Pesa', 'Bank Transfer', 'Card')),
  transaction_code VARCHAR(120),
  received_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agreements (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  loan_id BIGINT REFERENCES loans(id) ON DELETE CASCADE,
  sale_id BIGINT REFERENCES sales(id) ON DELETE CASCADE,
  agreement_type VARCHAR(80) NOT NULL CHECK (agreement_type IN ('Loan Agreement', 'Guarantor Form', 'Payment Receipt', 'Clearance Certificate', 'Installment Agreement')),
  document_path TEXT NOT NULL,
  qr_verification_code VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE business_settings (
  id BIGSERIAL PRIMARY KEY,
  company_name VARCHAR(180) NOT NULL DEFAULT 'DRAMAN Loan Services',
  logo_path TEXT,
  contact_phone VARCHAR(40),
  contact_email VARCHAR(180),
  address TEXT,
  receipt_footer TEXT,
  sms_provider VARCHAR(80),
  mpesa_shortcode VARCHAR(80),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loan_settings (
  id BIGSERIAL PRIMARY KEY,
  default_interest_rate NUMERIC(6, 2) NOT NULL DEFAULT 12,
  penalty_rate NUMERIC(6, 2) NOT NULL DEFAULT 3,
  grace_period_days INTEGER NOT NULL DEFAULT 3,
  max_auto_approval_amount NUMERIC(14, 2) NOT NULL DEFAULT 50000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_name ON customers USING gin (to_tsvector('english', full_name));
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_loans_customer_id ON loans(customer_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_loans_due_date ON loans(due_date);
CREATE INDEX idx_payments_loan_id ON payments(loan_id);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);
CREATE INDEX idx_inventory_category ON inventory(category);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
```

## database/seed.sql

`$lang
INSERT INTO users (full_name, email, phone, password_hash, role, status) VALUES
('Charles Muhoni', 'admin@draman.co.ke', '+254 700 100 001', '$2b$12$replace_with_real_bcrypt_hash', 'Super Admin', 'Active'),
('Mercy Atieno', 'officer@draman.co.ke', '+254 700 100 002', '$2b$12$replace_with_real_bcrypt_hash', 'Loan Officer', 'Active'),
('Peter Maina', 'cashier@draman.co.ke', '+254 700 100 003', '$2b$12$replace_with_real_bcrypt_hash', 'Cashier', 'Active'),
('Amina Hassan', 'inventory@draman.co.ke', '+254 700 100 004', '$2b$12$replace_with_real_bcrypt_hash', 'Inventory Manager', 'Active');

INSERT INTO inventory (product_name, category, quantity, buying_price, selling_price, description, condition, serial_number) VALUES
('Office Desk', 'Office furniture', 8, 9000, 13500, 'Sturdy office desk suitable for home offices, loan offices, or small retail counters.', 'Second-hand good', 'FUR-OD-001'),
('Samsung 43 inch TV', 'TVs', 2, 21000, 29500, 'Clear display television with tested ports, remote support, and installment-sale potential.', 'Used excellent', 'TV-SAM-043'),
('Gas Cylinder 13kg', 'Gas cylinders', 1, 5200, 7600, 'Refurbished 13kg gas cylinder inspected for household resale and quick turnover.', 'Refurbished', 'GAS-13-091'),
('Three-Seater Sofa', 'Furniture', 5, 18000, 26500, 'Comfortable three-seater sofa for living rooms, staged for direct or installment purchase.', 'Second-hand good', 'SOFA-3S-022');

INSERT INTO business_settings (company_name, contact_phone, contact_email, address, receipt_footer) VALUES
('DRAMAN Loan Services', '+254 700 100 000', 'info@draman.co.ke', 'Nairobi, Kenya', 'Thank you for choosing DRAMAN Loan Services.');

INSERT INTO loan_settings (default_interest_rate, penalty_rate, grace_period_days, max_auto_approval_amount) VALUES
(12, 3, 3, 50000);
```

## README.md

`$lang
# DRAMAN Loan Services Management System

Starter implementation for the DRAMAN Loan Services Management System blueprint.

## What Is Included

- Login screen with demo roles
- Dashboard with financial cards, repayment charts, recent transactions, due payments, and low-stock alerts
- Customer registration and customer profile table
- Loan issuance form with automatic interest, fee, installment, and balance preview
- Payment recording form with automatic balance update
- Inventory, reports, agreements, and settings screens
- Local API server with in-memory demo data
- PostgreSQL schema and seed data for the production database

## Run Locally

This workspace currently has Node available, but `npm` is not on PATH. The app is therefore built to run immediately without installing packages.

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Charles Muhoni (Super Admin) | admin@draman.co.ke | admin123 |
| Loan Officer | officer@draman.co.ke | admin123 |
| Cashier | cashier@draman.co.ke | admin123 |
| Inventory Manager | inventory@draman.co.ke | admin123 |

## Production Path

When npm is available, the next step is to split this prototype into a standard stack:

- `client/`: Vite React app with Tailwind CSS, Chart.js, Axios, and lucide-react
- `server/`: Express.js API with JWT, bcrypt, pg, and multer
- `database/`: PostgreSQL migrations and seed scripts

The database foundation is already in [database/schema.sql](database/schema.sql).
```

