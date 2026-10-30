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
