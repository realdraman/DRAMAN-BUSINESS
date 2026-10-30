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
              <div className="compact muted">{payment.payment_code} · {payment.payment_method}</div>
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
              <div className="compact muted">{loan.loan_code} · Due {formatDate(loan.due_date)}</div>
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
                        <div className="compact muted">{customer.customer_code} · ID {customer.national_id}</div>
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
                  <div className="compact muted">{loan?.customer_name || "Customer"} · {loan?.loan_code || "Installment agreement"}</div>
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
