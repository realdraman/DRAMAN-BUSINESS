const { useEffect, useMemo, useRef, useState } = React;

function apiError(error) {
  if (error.response && error.response.status === 401) {
    api.handleUnauthorized();
  }
  const message = error.response && error.response.data && error.response.data.message;
  return new Error(message || error.message || "Request failed");
}

function handleApiResponseError(response, data) {
  if (response.status === 401) api.handleUnauthorized();
  throw new Error(data.message || "Request failed");
}

const api = {
  authHeaders() {
    try {
      const savedSession = window.sessionStorage.getItem("draman-session");
      const token = savedSession ? JSON.parse(savedSession).token : "";
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch (error) {
      console.error("Could not read the saved session:", error);
      return {};
    }
  },
  handleUnauthorized() {
    if (!window.sessionStorage.getItem("draman-session")) return;
    window.sessionStorage.removeItem("draman-session");
    window.dispatchEvent(new Event("draman-session-expired"));
  },
  async get(url) {
    if (window.axios) {
      try {
        return await window.axios.get(url, { headers: this.authHeaders() });
      } catch (error) {
        throw apiError(error);
      }
    }
    const response = await fetch(url, { headers: this.authHeaders() });
    const data = await response.json();
    if (!response.ok) handleApiResponseError(response, data);
    return { data };
  },
  async post(url, payload) {
    if (window.axios) {
      try {
        return await window.axios.post(url, payload, { headers: this.authHeaders() });
      } catch (error) {
        throw apiError(error);
      }
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) handleApiResponseError(response, data);
    return { data };
  },
  async put(url, payload) {
    if (window.axios) {
      try {
        return await window.axios.put(url, payload, { headers: this.authHeaders() });
      } catch (error) {
        throw apiError(error);
      }
    }
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) handleApiResponseError(response, data);
    return { data };
  },
  async delete(url) {
    if (window.axios) {
      try {
        return await window.axios.delete(url, { headers: this.authHeaders() });
      } catch (error) {
        throw apiError(error);
      }
    }
    const response = await fetch(url, {
      method: "DELETE",
      headers: this.authHeaders()
    });
    const data = await response.json();
    if (!response.ok) handleApiResponseError(response, data);
    return { data };
  }
};

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard", roles: ["Super Admin", "Loan Officer", "Cashier", "Inventory Manager"] },
  { id: "customers", label: "Customers", icon: "users", roles: ["Super Admin", "Loan Officer"] },
  { id: "loans", label: "Loans", icon: "landmark", roles: ["Super Admin", "Loan Officer"] },
  { id: "payments", label: "Payments", icon: "receipt", roles: ["Super Admin", "Loan Officer", "Cashier"] },
  { id: "inventory", label: "Inventory", icon: "warehouse", roles: ["Super Admin", "Inventory Manager"] },
  { id: "reports", label: "Reports", icon: "chart-no-axes-combined", roles: ["Super Admin", "Loan Officer", "Cashier", "Inventory Manager"] },
  { id: "agreements", label: "Agreements", icon: "file-signature", roles: ["Super Admin", "Loan Officer"] },
  { id: "team", label: "Team Access", icon: "user-round-plus", roles: ["Super Admin"] },
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

const initialSettings = {
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

function useDraftState(name, initialValue, userId) {
  const key = `draman-draft:${userId}:${name}`;
  const [value, setValue] = useState(() => {
    try {
      const saved = window.sessionStorage.getItem(key);
      if (!saved) return initialValue;
      return JSON.parse(saved);
    } catch (error) {
      console.error(`Could not restore ${name} draft:`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Could not save ${name} draft:`, error);
    }
  }, [key, name, value]);

  return [value, setValue];
}

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
  const iconName = name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const icon = window.lucide && window.lucide.icons[iconName];
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon ? icon.map(([tag, attributes], index) => React.createElement(tag, { ...attributes, key: index })) : null}
    </svg>
  );
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

function ImagePreview({ src, label, compact = false }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <>
      <div className={`image-preview ${src ? "has-image" : "empty"} ${compact ? "image-preview--compact" : ""}`}>
        {src ? (
          <button
            className="image-preview__view"
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label={`View ${label} full size`}
          >
            <img src={src} alt={label} />
            <span className="image-preview__hint"><Icon name="maximize-2" /> Click to enlarge</span>
          </button>
        ) : (
          <Icon name="image-plus" />
        )}
        <span>{src ? label : "Image preview appears here after upload"}</span>
      </div>
      {isOpen ? (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={label} onClick={() => setIsOpen(false)}>
          <div className="image-lightbox__content" onClick={(event) => event.stopPropagation()}>
            <button className="image-lightbox__close" type="button" onClick={() => setIsOpen(false)} aria-label="Close image preview">
              <Icon name="x" />
            </button>
            <img src={src} alt={label} />
            <span>{label}</span>
          </div>
        </div>
      ) : null}
    </>
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

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <Icon name={isDark ? "sun" : "moon"} />
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

function LoginScreen({ onLogin, theme, onToggleTheme, initialMessage = "" }) {
  const queryResetToken = new URLSearchParams(window.location.search).get("reset_token") || "";
  const [mode, setMode] = useState(queryResetToken ? "reset" : "login");
  const [resetToken] = useState(queryResetToken);
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [registration, setRegistration] = useState({
    full_name: "",
    email: "",
    password: "",
    employee_id: "",
    invitation_code: ""
  });
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (queryResetToken) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/login", credentials);
      onLogin(data);
    } catch (requestError) {
      setError(requestError.message || "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  async function submitRegistration(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.post("/api/register", registration);
      setCredentials({ email: registration.email, password: "" });
      setMode("login");
      setMessage(data.message);
    } catch (requestError) {
      setError(requestError.message || "Unable to create account");
    } finally {
      setLoading(false);
    }
  }

  async function submitForgotPassword(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.post("/api/password/forgot", { email: resetEmail });
      setMessage(data.message);
    } catch (requestError) {
      setError(requestError.message || "Unable to start password reset.");
    } finally {
      setLoading(false);
    }
  }

  async function submitResetPassword(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    if (resetPassword !== resetPasswordConfirmation) {
      setError("The new passwords do not match.");
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.post("/api/password/reset", { token: resetToken, password: resetPassword });
      window.history.replaceState({}, "", window.location.pathname);
      setMode("login");
      setCredentials({ ...credentials, password: "" });
      setResetPassword("");
      setResetPasswordConfirmation("");
      setMessage(data.message);
    } catch (requestError) {
      setError(requestError.message || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-visual">
        <div className="brand-lockup">
          <img src="/draman-logo.svg" alt="DRAMAN Loan Services logo" />
          <div>
            <div className="brand-title">DRAMAN Loan Services</div>
            <div className="brand-subtitle">A clearer way to move money</div>
          </div>
        </div>
        <div className="login-story">
          <span className="login-eyebrow"><span></span> TEAM WORKSPACE / 01</span>
          <h1>Every detail.<br />In good hands.</h1>
          <p>Loans, repayments and daily operations, brought together for the people who keep your business moving.</p>
        </div>
        <div className="login-metrics">
          <div className="login-metric">
            <strong>01</strong>
            <span className="compact">One secure workspace</span>
          </div>
          <div className="login-metric">
            <strong>02</strong>
            <span className="compact">Your team, your roles</span>
          </div>
          <div className="login-metric">
            <strong>03</strong>
            <span className="compact">Every balance in view</span>
          </div>
        </div>
        <span className="login-visual__index">DRAMAN / EST. FOR YOUR TEAM</span>
      </section>
      <section className="login-form-wrap">
        <div className="auth-theme-row">
          <span>FINANCE, WITH A HUMAN TOUCH</span>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <div className="login-card">
          <div className="auth-mode-tabs" role="tablist" aria-label="Account options">
            <button className={mode === "login" ? "active" : ""} type="button" role="tab" aria-selected={mode === "login"} onClick={() => changeMode("login")}>Sign in</button>
            <button className={mode === "register" ? "active" : ""} type="button" role="tab" aria-selected={mode === "register"} onClick={() => changeMode("register")}>Create account</button>
          </div>
          {mode === "login" ? (
            <form onSubmit={submitLogin}>
              <span className="auth-eyebrow">WELCOME BACK</span>
              <h2>Good to see you.</h2>
              <p>Sign in with the personal email and password on your account.</p>
              <div className="form-grid single auth-fields">
                <Field label="Email">
                  <input type="email" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} autoComplete="username" required />
                </Field>
                <Field label="Password">
                  <input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} autoComplete="current-password" required />
                </Field>
              </div>
              <button className="primary-button auth-submit" type="submit" disabled={loading}>
                <Icon name="arrow-right" />{loading ? "Signing in..." : "Sign in securely"}
              </button>
              <button className="auth-text-button" type="button" onClick={() => changeMode("forgot")}>Forgot your password?</button>
              <div className="auth-footnote"><Icon name="lock-keyhole" /> Your workspace is protected by role-based access.</div>
            </form>
          ) : mode === "register" ? (
            <form onSubmit={submitRegistration}>
              <span className="auth-eyebrow">CREATE YOUR ACCOUNT</span>
              <h2>Join the team.</h2>
              <p>Use your personal email. An administrator must approve uninvited account requests.</p>
              <div className="form-grid single auth-fields">
                <Field label="Full name">
                  <input value={registration.full_name} onChange={(event) => setRegistration({ ...registration, full_name: event.target.value })} autoComplete="name" minLength="2" maxLength="100" required />
                </Field>
                <Field label="Personal email">
                  <input type="email" value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} autoComplete="email" required />
                </Field>
                <Field label="Staff ID (optional)">
                  <input value={registration.employee_id} onChange={(event) => setRegistration({ ...registration, employee_id: event.target.value })} placeholder="May be assigned later" maxLength="32" />
                </Field>
                <Field label="Create password">
                  <input type="password" value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })} autoComplete="new-password" minLength="10" required />
                </Field>
                <Field label="Invitation code (optional)">
                  <input value={registration.invitation_code} onChange={(event) => setRegistration({ ...registration, invitation_code: event.target.value })} placeholder="DRM-..." autoComplete="off" />
                </Field>
              </div>
              <div className="auth-note"><Icon name="shield-check" /> Uninvited accounts stay pending until an administrator assigns a role and approves them.</div>
              <button className="primary-button auth-submit" type="submit" disabled={loading}>
                <Icon name="user-round-plus" />{loading ? "Creating account..." : "Create account"}
              </button>
            </form>
          ) : mode === "forgot" ? (
            <form onSubmit={submitForgotPassword}>
              <span className="auth-eyebrow">ACCOUNT RECOVERY</span>
              <h2>Reset your password.</h2>
              <p>Enter your account email. If it is registered, reset instructions will be provided.</p>
              <div className="form-grid single auth-fields">
                <Field label="Email">
                  <input type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} autoComplete="email" required />
                </Field>
              </div>
              <div className="auth-note"><Icon name="lock-keyhole" /> In local development, reset links are written to the private data folder when email delivery is not configured.</div>
              <button className="primary-button auth-submit" type="submit" disabled={loading}>
                <Icon name="mail" />{loading ? "Sending..." : "Send reset instructions"}
              </button>
              <button className="auth-text-button" type="button" onClick={() => changeMode("login")}>Back to sign in</button>
            </form>
          ) : (
            <form onSubmit={submitResetPassword}>
              <span className="auth-eyebrow">ACCOUNT RECOVERY</span>
              <h2>Choose a new password.</h2>
              <p>Reset links expire after one hour and can only be used once.</p>
              <div className="form-grid single auth-fields">
                <Field label="New password">
                  <input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} autoComplete="new-password" minLength="10" required />
                </Field>
                <Field label="Confirm new password">
                  <input type="password" value={resetPasswordConfirmation} onChange={(event) => setResetPasswordConfirmation(event.target.value)} autoComplete="new-password" minLength="10" required />
                </Field>
              </div>
              <button className="primary-button auth-submit" type="submit" disabled={loading || !resetToken}>
                <Icon name="key-round" />{loading ? "Updating..." : "Reset password"}
              </button>
              {!resetToken ? <div className="error-box" role="alert">This reset link is missing its token. Request another link.</div> : null}
            </form>
          )}
          {error ? <div className="error-box" role="alert">{error}</div> : null}
          {message ? <div className="success-box" role="status">{message}</div> : null}
        </div>
        <div className="auth-copyright">DRAMAN LOAN SERVICES <span>•</span> PEOPLE FIRST. ALWAYS.</div>
      </section>
    </main>
  );
}

function Sidebar({ activeView, setActiveView, user, permissions }) {
  const allowedNav = navItems.filter((item) =>
    user.role === "Super Admin"
      ? item.roles.includes(user.role)
      : item.id === "dashboard" || permissions.includes(item.id)
  );

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <img src="/draman-logo.svg" alt="DRAMAN Loan Services logo" />
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

function AccountSettings({ user, onAccountUpdated }) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState(user.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.put("/api/account", {
        email,
        current_password: currentPassword,
        new_password: newPassword
      });
      onAccountUpdated(data.user);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Account details updated.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update account details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="ghost-button" type="button" onClick={() => { setIsOpen(true); setEmail(user.email || ""); setError(""); setMessage(""); }}>
        <Icon name="user-round-cog" />My account
      </button>
      {isOpen ? (
        <div className="account-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsOpen(false);
        }}>
          <section className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
            <div className="account-modal__header">
              <div>
                <span className="auth-eyebrow">PERSONAL ACCOUNT</span>
                <h2 id="account-modal-title">Change email or password</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close account settings" onClick={() => setIsOpen(false)}>
                <Icon name="x" />
              </button>
            </div>
            <form className="account-modal__form" onSubmit={submit}>
              <Field label="Personal email">
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              </Field>
              <Field label="Current password">
                <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
              </Field>
              <Field label="New password (leave blank to keep current)">
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength="10" />
              </Field>
              <div className="compact muted">Your current password is required to save account changes.</div>
              {error ? <div className="error-box" role="alert">{error}</div> : null}
              {message ? <div className="success-box" role="status">{message}</div> : null}
              <div className="button-row">
                <button className="primary-button" type="submit" disabled={saving}>
                  <Icon name="save" />{saving ? "Saving..." : "Save account changes"}
                </button>
                <button className="ghost-button" type="button" onClick={() => setIsOpen(false)}>Close</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Topbar({ user, search, setSearch, onLogout, theme, onToggleTheme, onAccountUpdated }) {
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
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <NotificationCenter />
        <SystemBackup isAdmin={user.role === "Super Admin"} />
        <AccountSettings user={user} onAccountUpdated={onAccountUpdated} />
        <div className="text-right">
          <div className="topbar-user-name font-bold leading-tight">{user.full_name}</div>
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

function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadNotifications() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/api/notifications");
      setNotifications(data.notifications);
    } catch (requestError) {
      setError(requestError.message || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  function toggleNotifications() {
    const shouldOpen = !isOpen;
    setIsOpen(shouldOpen);
    if (shouldOpen) loadNotifications();
  }

  return (
    <div className="topbar-popover-wrap">
      <button
        className="icon-button notification-button"
        type="button"
        title="Notifications"
        aria-label={`Notifications${notifications.length ? `, ${notifications.length} items` : ""}`}
        aria-expanded={isOpen}
        onClick={toggleNotifications}
      >
        <Icon name="bell" />
        {notifications.length ? <span className="notification-count">{notifications.length > 9 ? "9+" : notifications.length}</span> : null}
      </button>
      {isOpen ? (
        <section className="topbar-popover notification-popover" aria-label="Notifications">
          <div className="topbar-popover__heading">
            <strong>Notifications</strong>
            <button type="button" className="popover-refresh" onClick={loadNotifications} disabled={loading} aria-label="Refresh notifications">
              <Icon name="refresh-cw" />
            </button>
          </div>
          {loading ? <p className="popover-message">Checking for updates...</p> : null}
          {error ? <p className="popover-message error-text" role="alert">{error}</p> : null}
          {!loading && !error ? (
            <div className="notification-list">
              {notifications.length ? notifications.map((item) => (
                <article className={`notification-item ${item.level || "info"}`} key={item.id}>
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  {item.created_at ? <time>{formatDate(item.created_at)}</time> : null}
                </article>
              )) : <p className="popover-message">You’re all caught up.</p>}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function SystemBackup({ isAdmin }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function downloadBackup() {
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const { data } = await api.post("/api/system-backup", {});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.file_name;
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        link.remove();
      }, 1000);
      setStatus(`Backup downloaded at ${new Date(data.created_at).toLocaleTimeString()}.`);
    } catch (backupError) {
      setError(backupError.message || "Unable to create the system backup.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="topbar-popover-wrap">
      <button
        className="icon-button"
        type="button"
        title={isAdmin ? "Download system backup" : "System backup requires administrator access"}
        aria-label="System backup"
        onClick={downloadBackup}
        disabled={!isAdmin || loading}
      >
        <Icon name="database-backup" />
      </button>
      {(status || error) ? (
        <div className={`backup-status ${error ? "error-text" : ""}`} role={error ? "alert" : "status"}>
          {error || status}
        </div>
      ) : null}
    </div>
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

function RepaymentChart({ summary, theme }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!window.Chart || !canvasRef.current || !summary) return undefined;
    const tickColor = theme === "dark" ? "#a4b2be" : "#65758b";
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
              color: tickColor,
              callback: (value) => `KES ${Number(value) / 1000}k`
            },
            grid: { color: theme === "dark" ? "#33434e" : "#E6EDF6" }
          },
          x: {
            ticks: { color: tickColor },
            grid: { display: false }
          }
        }
      }
    });
    return () => chart.destroy();
  }, [summary, theme]);

  return <canvas ref={canvasRef} aria-label="Repayment chart"></canvas>;
}

function LoanTrendChart({ summary, theme }) {
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
              boxWidth: 8,
              color: theme === "dark" ? "#dbe5ed" : "#334155"
            }
          }
        }
      }
    });
    return () => chart.destroy();
  }, [summary, theme]);

  return <canvas ref={canvasRef} aria-label="Loan trend graph"></canvas>;
}

function Dashboard({ summary, theme }) {
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
            <RepaymentChart summary={summary} theme={theme} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2>Loan Trend</h2>
            <span className="muted compact">By status</span>
          </div>
          <div className="panel-body chart-wrap">
            <LoanTrendChart summary={summary} theme={theme} />
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
  const [form, setForm] = useDraftState("customer", emptyCustomerForm, user.id);
  const [selectedTab, setSelectedTab] = useState("Personal details");
  const [message, setMessage] = useState("");
  const isSuperAdmin = user.role === "Super Admin";

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
            <button className="secondary-button" type="button" onClick={() => document.getElementById("customer-document-input")?.click()}>
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
            <div className="section-title" id="customer-upload-section">Upload Section</div>
            <Field label="ID front image">
              <input id="customer-document-input" type="file" accept="image/*" onChange={(event) => setCustomerImage("id_front", event)} />
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
                          <ImagePreview src={customer.id_front} label="Front" compact />
                          <ImagePreview src={customer.id_back} label="Back" compact />
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

function LoanManagement({ customers, loans, refreshData, globalSearch, user, settings }) {
  const [form, setForm] = useDraftState("loan", {
    ...initialLoanForm,
    interest_rate: settings.loan.default_interest_rate,
    processing_fee: settings.loan.processing_fee
  }, user.id);
  const [message, setMessage] = useState("");
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  const filteredLoans = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    return loans.filter((loan) =>
      (!showPendingOnly || loan.status === "Pending") &&
      (!query ||
        [loan.loan_code, loan.customer_name, loan.status, loan.assigned_officer]
          .join(" ")
          .toLowerCase()
          .includes(query))
    );
  }, [loans, globalSearch, showPendingOnly]);

  const loanPreview = useMemo(() => {
    const principal = Number(form.principal_amount || 0);
    const interest = Math.round(principal * (Number(form.interest_rate || 0) / 100));
    const fee = Number(form.processing_fee || 0);
    const total = principal + interest + fee;
    const enteredPeriods = Number(form.duration);
    const periods = Number.isFinite(enteredPeriods) && enteredPeriods > 0 ? Math.ceil(enteredPeriods) : 0;
    return {
      principal,
      interest,
      fee,
      total,
      periods,
      installment: periods ? Math.ceil(total / periods) : 0,
      penalty: Math.ceil(total * (Number(settings.loan.late_penalty_rate || 0) / 100))
    };
  }, [form, settings.loan.late_penalty_rate]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveLoan(event) {
    event.preventDefault();
    const { data } = await api.post("/api/loans", form);
    setMessage(`${data.loan_code} created for ${data.customer_name}`);
    setForm({
      ...initialLoanForm,
      interest_rate: settings.loan.default_interest_rate,
      processing_fee: settings.loan.processing_fee
    });
    await refreshData();
  }

  async function approveLoan(loan) {
    const { data } = await api.post(`/api/loans/${loan.id}/approve`, {});
    setMessage(`${data.loan_code} approved.`);
    await refreshData();
  }

  return (
    <>
      <SectionHeading
        title="Loan Management"
        description="Create loans, preview calculations, approve applications, and track balances by officer and due date."
        action={
          <div className="button-row mt-0">
            <button className="ghost-button" type="button" onClick={() => setShowPendingOnly((current) => !current)}>
              <Icon name="file-check-2" />
              {showPendingOnly ? "All Loans" : "Approvals"}
            </button>
            <button className="secondary-button" type="button" onClick={() => document.getElementById("loan-issuance")?.scrollIntoView({ behavior: "smooth" })}>
              <Icon name="plus" />New Loan
            </button>
          </div>
        }
      />
      <section className="two-column">
        <div className="panel" id="loan-issuance">
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
            <Field label="Number of installments">
              <input type="number" min="1" step="1" value={form.duration} onChange={(event) => setField("duration", event.target.value)} required />
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
            <div className="compact muted full">
              Loans of {formatCurrency(settings.loan.approval_threshold)} or more require administrator approval.
            </div>
            <div className="section-title">Automatic Calculations</div>
            <div className="loan-calculator full" aria-live="polite">
              <div className="loan-calculator__heading">
                <div>
                  <h3>Live loan estimate</h3>
                  <p>Updates automatically as you change the loan details.</p>
                </div>
                <Badge tone="active">Estimate</Badge>
              </div>
              <div className="loan-calculator__content">
                <div className="loan-breakdown">
                  <div className="loan-breakdown__row">
                    <span>Principal</span>
                    <strong>{formatCurrency(loanPreview.principal)}</strong>
                  </div>
                  <div className="loan-breakdown__row">
                    <span>Interest ({Number(form.interest_rate || 0)}% one-time)</span>
                    <strong>+ {formatCurrency(loanPreview.interest)}</strong>
                  </div>
                  <div className="loan-breakdown__row">
                    <span>Processing fee</span>
                    <strong>+ {formatCurrency(loanPreview.fee)}</strong>
                  </div>
                  <div className="loan-breakdown__row loan-breakdown__total">
                    <span>Total payable</span>
                    <strong>{formatCurrency(loanPreview.total)}</strong>
                  </div>
                  <p className="loan-breakdown__formula">
                    Interest = principal × rate. Total payable = principal + interest + fee.
                  </p>
                </div>
                <div className="loan-installment">
                  <span className="loan-installment__label">Estimated installment</span>
                  <strong>{formatCurrency(loanPreview.installment)}</strong>
                  <span>per {form.repayment_frequency.toLowerCase()} payment</span>
                  <span className="loan-installment__periods">
                    {loanPreview.periods
                      ? `Divided across ${loanPreview.periods} ${loanPreview.periods === 1 ? "installment" : "installments"}`
                      : "Enter at least 1 installment"}
                  </span>
                  <div className="loan-penalty">
                    <span>Late penalty estimate ({settings.loan.late_penalty_rate}% after {settings.loan.grace_period_days} grace days)</span>
                    <strong>{formatCurrency(loanPreview.penalty)}</strong>
                  </div>
                </div>
              </div>
            </div>
            <div className="button-row full">
              <button className="primary-button" type="submit">
                <Icon name="circle-dollar-sign" />
                Create Loan
              </button>
              <button className="ghost-button" type="button" onClick={() => setForm({
                ...initialLoanForm,
                interest_rate: settings.loan.default_interest_rate,
                processing_fee: settings.loan.processing_fee
              })}>
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
                  {user.role === "Super Admin" ? <th>Action</th> : null}
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
                    {user.role === "Super Admin" ? (
                      <td>{loan.status === "Pending" ? (
                        <button className="secondary-button" type="button" onClick={() => approveLoan(loan)}>Approve</button>
                      ) : <span className="compact muted">—</span>}</td>
                    ) : null}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={user.role === "Super Admin" ? "8" : "7"}>
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

function PaymentManagement({ loans, payments, refreshData, user, settings }) {
  const payableLoans = loans.filter((loan) => Number(loan.balance) > 0 && loan.status !== "Pending");
  const [form, setForm] = useDraftState("payment", initialPaymentForm, user.id);
  const [lastReceipt, setLastReceipt] = useDraftState("payment-receipt", null, user.id);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedLoan = loans.find((loan) => loan.id === Number(form.loan_id));

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function savePayment(event) {
    event.preventDefault();
    setError("");
    const { data } = await api.post("/api/payments", {
      ...form,
      received_by: user.id
    });
    setMessage(`${data.payment_code} received from ${data.customer_name}`);
    setLastReceipt({
      ...data,
      balance_after: Math.max(0, Number(selectedLoan.balance) - Number(form.amount_paid))
    });
    setForm(initialPaymentForm);
    await refreshData();
  }

  function printReceipt() {
    if (!lastReceipt) return;
    window.print();
  }

  function sendSmsConfirmation() {
    setError("");
    if (!lastReceipt) {
      setError("Record a payment before sending its SMS confirmation.");
      return;
    }
    const phoneNumber = String(lastReceipt.customer_phone || "").trim().replace(/[^\d+]/g, "");
    if (!phoneNumber) {
      setError("This customer does not have a phone number on file.");
      return;
    }
    if (!settings.business.sms_enabled) {
      setError("SMS confirmations are disabled in Business Settings.");
      return;
    }
    const prefix = settings.business.sms_sender_id ? `${settings.business.sms_sender_id}: ` : "";
    const smsBody = `${prefix}Payment of ${formatCurrency(lastReceipt.amount_paid)} received for ${lastReceipt.loan_code}. Remaining balance: ${formatCurrency(lastReceipt.balance_after)}. Receipt ${lastReceipt.payment_code}.`;
    window.location.href = `sms:${phoneNumber}?body=${encodeURIComponent(smsBody)}`;
    setMessage("Opening your messaging app with the payment confirmation ready to send.");
  }

  return (
    <>
      <SectionHeading
        title="Payment Management"
        description="Receive repayments, support partial payments, update balances, add transaction references, and prepare receipts."
        action={
          <button className="secondary-button" type="button" onClick={printReceipt} disabled={!lastReceipt || Boolean(form.loan_id)}>
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
              <div className="payment-calculator full" aria-live="polite">
                <div className="payment-calculator__heading">
                  <div>
                    <h3>Balance update</h3>
                    <p>Remaining balance is recalculated as you enter a payment.</p>
                  </div>
                </div>
                <div className="payment-calculator__details">
                  <div className="payment-calculator__identity">
                    <span>{selectedLoan.customer_name}</span>
                    <strong>{selectedLoan.loan_code}</strong>
                  </div>
                  <div className="payment-calculator__row">
                    <span>Current balance</span>
                    <strong>{formatCurrency(selectedLoan.balance)}</strong>
                  </div>
                  <div className="payment-calculator__row">
                    <span>Payment entered</span>
                    <strong>− {formatCurrency(form.amount_paid)}</strong>
                  </div>
                  <div className="payment-calculator__result">
                    <span>Balance after payment</span>
                    <strong>{formatCurrency(Math.max(0, Number(selectedLoan.balance) - Number(form.amount_paid || 0)))}</strong>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="button-row full">
              <button className="primary-button" type="submit">
                <Icon name="banknote" />
                Receive Payment
              </button>
              <button className="ghost-button" type="button" onClick={sendSmsConfirmation} disabled={!settings.business.sms_enabled}>
                <Icon name="message-square-text" />
                SMS Confirmation
              </button>
            </div>
            <p className="compact muted full">SMS opens the device messaging app with the receipt details ready to send.</p>
            {message ? <div className="success-box full">{message}</div> : null}
            {error ? <div className="error-box full" role="alert">{error}</div> : null}
          </form>
        </div>
        <ReceiptPreview selectedLoan={selectedLoan} amount={form.amount_paid} user={user} receipt={selectedLoan ? null : lastReceipt} settings={settings} />
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

function ReceiptPreview({ selectedLoan, amount, user, receipt, settings }) {
  const receiptLoan = selectedLoan || (receipt && {
    customer_name: receipt.customer_name,
    loan_code: receipt.loan_code
  });
  const paid = receipt ? Number(receipt.amount_paid) : Number(amount || 0);
  const balance = receipt ? Number(receipt.balance_after) : selectedLoan ? Math.max(0, Number(selectedLoan.balance) - paid) : 0;
  return (
    <div className="panel receipt-panel">
      <div className="panel-header receipt-panel__header">
        <div>
          <h2>Receipt Layout</h2>
          <span className="compact muted">Preview of the payment receipt</span>
        </div>
        <Icon name="badge-check" />
      </div>
      <div className="panel-body">
        <div className="receipt-printable">
          <div className="receipt-paper">
            <div className="receipt-brand">
              <img src={settings.business.logo_data || "/draman-logo.svg"} alt={`${settings.business.company_name} logo`} />
              <div>
                <div className="brand-title receipt-brand-title">{settings.business.company_name}</div>
                <div className="brand-subtitle receipt-brand-subtitle">Payment receipt</div>
                {settings.business.contact_phone ? <span>{settings.business.contact_phone}</span> : null}
                {settings.business.contact_email ? <span>{settings.business.contact_email}</span> : null}
              </div>
            </div>
            <div className="receipt-paper__title">
              <span>OFFICIAL RECEIPT</span>
              <strong>{receipt ? receipt.payment_code : "Pending payment"}</strong>
            </div>
            <div className="receipt-details">
              <div><span>Customer</span><strong>{receiptLoan ? receiptLoan.customer_name : "Select loan"}</strong></div>
              <div><span>Loan number</span><strong>{receiptLoan ? receiptLoan.loan_code : "Pending"}</strong></div>
              <div><span>Payment date</span><strong>{receipt ? formatDate(receipt.payment_date) : formatDate(new Date())}</strong></div>
              <div><span>Received by</span><strong>{receipt ? receipt.received_by_name : user.full_name}</strong></div>
              <div className="receipt-details__amount"><span>Amount paid</span><strong>{formatCurrency(paid)}</strong></div>
              <div><span>Remaining balance</span><strong>{formatCurrency(balance)}</strong></div>
              <div><span>Payment method</span><strong>{receipt ? receipt.payment_method : "Pending"}</strong></div>
              {receipt && receipt.transaction_code ? <div><span>Transaction reference</span><strong>{receipt.transaction_code}</strong></div> : null}
            </div>
            <div className="receipt-footer">
              <span>{settings.business.receipt_footer}</span>
              <strong>{receipt ? receipt.received_by_name : user.full_name}</strong>
              <small>Authorized officer</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryManagement({ inventory, refreshData, user, settings }) {
  const [productForm, setProductForm] = useDraftState("product", emptyProductForm, user.id);
  const [message, setMessage] = useState("");
  const isSuperAdmin = user.role === "Super Admin";
  const canManageInventory = isSuperAdmin || (settings.security.permissions[user.role] || []).includes("inventory");
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
    if (!canManageInventory) return;
    const { data } = await api.post("/api/inventory", productForm);
    setMessage(`${data.product_name} added to inventory`);
    setProductForm(emptyProductForm);
    await refreshData();
  }

  async function deleteProduct(product) {
    if (!canManageInventory) return;
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
      {canManageInventory ? (
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
                {canManageInventory ? <th>Control</th> : null}
              </tr>
            </thead>
            <tbody>
              {inventory.length ? inventory.map((item) => (
                <tr key={item.id}>
                  <td><ImagePreview src={item.image} label={item.product_name} compact /></td>
                  <td><strong>{item.product_name}</strong></td>
                  <td>{item.description}</td>
                  <td>{item.category}</td>
                  <td><Badge tone={item.quantity <= 2 ? "pending" : "active"}>{item.quantity}</Badge></td>
                  <td>{formatCurrency(item.buying_price)}</td>
                  <td className="money">{formatCurrency(item.selling_price)}</td>
                  <td>{item.condition}</td>
                  <td>{item.serial_number}</td>
                  {canManageInventory ? (
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
                  <td colSpan={canManageInventory ? "10" : "9"}>
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
  const outstanding = summary?.cards.outstandingBalance ?? loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
  const defaulted = summary?.cards.defaultedLoans ?? loans.filter((loan) => loan.status === "Defaulted").length;
  const rows = [
    ["Daily collections", summary?.cards.amountCollectedToday || 0],
    ["Outstanding balances", outstanding],
    ["Default reports", defaulted],
    ["Stock value", summary?.cards.inventoryStockValue || 0]
  ];

  function downloadReport(format) {
    let content;
    let mimeType;
    let extension;
    if (format === "csv") {
      content = [["Report", "Value"], ...rows]
        .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
        .join("\r\n");
      mimeType = "text/csv;charset=utf-8";
      extension = "csv";
    } else {
      const tableRows = [["Report", "Value"], ...rows]
        .map((row) => `<tr>${row.map((value) => `<td>${String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character])}</td>`).join("")}</tr>`)
        .join("");
      content = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${tableRows}</table></body></html>`;
      mimeType = "application/vnd.ms-excel";
      extension = "xls";
    }
    const blob = new Blob(["\ufeff", content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `draman-report-${new Date().toISOString().slice(0, 10)}.${extension}`;
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 1000);
  }

  return (
    <div className="reports-printable">
      <SectionHeading
        title="Reports"
        description="Financial and inventory reporting with export-ready summaries for PDF, Excel, and CSV output."
        action={
          <div className="button-row mt-0">
            <button className="ghost-button" type="button" onClick={() => downloadReport("excel")}><Icon name="file-spreadsheet" />Excel</button>
            <button className="ghost-button" type="button" onClick={() => downloadReport("csv")}><Icon name="file-text" />CSV</button>
            <button className="secondary-button" type="button" onClick={() => window.print()}><Icon name="file-down" />PDF</button>
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
    </div>
  );
}

function Agreements({ agreements, loans }) {
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

function Settings({ settings, onSettingsChanged }) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setDraft(settings), [settings]);

  function changeSetting(section, key, value) {
    setDraft((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value }
    }));
  }

  async function saveSection(section, event) {
    event.preventDefault();
    setSaving(section);
    setError("");
    setMessage("");
    try {
      const { data } = await api.put(`/api/settings/${section}`, draft[section]);
      onSettingsChanged(data);
      setMessage(`${section.charAt(0).toUpperCase()}${section.slice(1)} settings saved.`);
    } catch (saveError) {
      setError(saveError.message || "Unable to save settings.");
    } finally {
      setSaving("");
    }
  }

  async function uploadLogo(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 1024 * 1024) {
      setError("Choose a PNG, JPEG, WebP, or GIF image smaller than 1 MB.");
      event.target.value = "";
      return;
    }
    try {
      changeSetting("business", "logo_data", await fileToDataUrl(file));
    } catch (uploadError) {
      setError(uploadError.message || "Unable to read the logo file.");
    }
  }

  const sections = [
    {
      title: "Business Settings",
      icon: "building-2",
      section: "business",
      fields: [
        { key: "company_name", label: "Company name" },
        { key: "logo_data", label: "Logo upload", type: "image" },
        { key: "contact_phone", label: "Contact phone", type: "tel" },
        { key: "contact_email", label: "Contact email", type: "email" },
        { key: "receipt_footer", label: "Receipt footer", type: "textarea" },
        { key: "sms_enabled", label: "Enable SMS confirmation", type: "checkbox" },
        { key: "sms_sender_id", label: "SMS message prefix" }
      ]
    },
    {
      title: "Loan Settings",
      icon: "badge-percent",
      section: "loan",
      fields: [
        { key: "default_interest_rate", label: "Default interest rate (%)", type: "number", min: 0, max: 100, step: 0.1 },
        { key: "late_penalty_rate", label: "Late penalty (%)", type: "number", min: 0, max: 100, step: 0.1 },
        { key: "grace_period_days", label: "Grace period (days)", type: "number", min: 0, max: 365 },
        { key: "processing_fee", label: "Default processing fee (KES)", type: "number", min: 0 },
        { key: "approval_threshold", label: "Auto-approval limit (KES)", type: "number", min: 0 }
      ]
    },
    {
      title: "Security Settings",
      icon: "shield-check",
      section: "security",
      fields: [
        { key: "minimum_password_length", label: "Minimum password length", type: "number", min: 10, max: 128 },
        { key: "session_timeout_hours", label: "Session timeout (hours)", type: "number", min: 1, max: 168 },
        { key: "require_unique_staff_ids", label: "Require unique staff IDs", type: "checkbox" },
        { key: "audit_logging_enabled", label: "Enable activity logging", type: "checkbox" },
        { key: "backup_schedule", label: "Backup schedule", type: "select", options: ["Daily", "Weekly", "Monthly", "Disabled"] },
        { key: "permissions", label: "Staff menu permissions", type: "permissions" }
      ]
    }
  ];

  return (
    <>
      <SectionHeading title="Settings" description="Update business identity and receipts, loan defaults and approvals, and account security policies." />
      {message ? <div className="success-box settings-notice" role="status">{message}</div> : null}
      {error ? <div className="error-box settings-notice" role="alert">{error}</div> : null}
      <section className="three-column settings-grid">
        {sections.map((group) => (
          <SettingsPanel
            {...group}
            key={group.section}
            values={draft[group.section]}
            onChange={changeSetting}
            onSave={saveSection}
            onUploadLogo={uploadLogo}
            saving={saving === group.section}
          />
        ))}
      </section>
    </>
  );
}

function TeamAccess() {
  const [role, setRole] = useState("Cashier");
  const [count, setCount] = useState(1);
  const [team, setTeam] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [issuedCodes, setIssuedCodes] = useState([]);
  const [approvalRoles, setApprovalRoles] = useState({});
  const [approvingId, setApprovingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function refreshAccess() {
    const [teamResult, inviteResult] = await Promise.all([
      api.get("/api/team"),
      api.get("/api/invitations")
    ]);
    setTeam(teamResult.data);
    setInvitations(inviteResult.data);
  }

  useEffect(() => {
    refreshAccess().catch((requestError) => setError(requestError.message || "Unable to load team access."));
  }, []);

  async function createInvitation(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setIssuedCodes([]);
    try {
      const { data } = await api.post("/api/invitations", { role, count: Number(count) });
      setIssuedCodes(data.invitations.map((item) => item.code));
      setMessage(`${data.invitations.length} invitation code${data.invitations.length === 1 ? "" : "s"} created for ${role}.`);
      await refreshAccess();
    } catch (requestError) {
      setError(requestError.message || "Unable to create invitation.");
    } finally {
      setLoading(false);
    }
  }

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(issuedCodes.join("\n"));
      setMessage("Invitation codes copied.");
    } catch (copyError) {
      setError("Could not copy the code automatically. Select and copy it manually.");
    }
  }

  async function approveAccount(memberId) {
    setApprovingId(memberId);
    setError("");
    setMessage("");
    try {
      const { data } = await api.post(`/api/team/${memberId}/approve`, {
        role: approvalRoles[memberId] || "Cashier"
      });
      setMessage(`${data.user.full_name} approved as ${data.user.role}.`);
      await refreshAccess();
    } catch (requestError) {
      setError(requestError.message || "Unable to approve account.");
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <>
      <SectionHeading
        title="Team Access"
        description="Invite staff, approve account requests, and manage role-based access."
      />
      <section className="team-access-layout">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Issue an invitation</h2>
              <span className="compact muted">Codes are role-specific and expire in 24 hours.</span>
            </div>
            <Badge tone="active">Admin only</Badge>
          </div>
          <form className="panel-body" onSubmit={createInvitation}>
            <div className="form-grid single">
              <Field label="Account role">
                <select value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="Cashier">Cashier</option>
                  <option value="Loan Officer">Loan Officer</option>
                  <option value="Inventory Manager">Inventory Manager</option>
                  <option value="Super Admin">Administrator</option>
                </select>
              </Field>
              <Field label="Number of codes (1–50)">
                <input type="number" min="1" max="50" value={count} onChange={(event) => setCount(event.target.value)} required />
              </Field>
            </div>
            <div className="button-row">
              <button className="primary-button" type="submit" disabled={loading}>
                <Icon name="key-round" />{loading ? "Creating..." : "Create invitation codes"}
              </button>
            </div>
            {issuedCodes.length ? (
              <div className="issued-code" role="status">
                <div>
                  <span className="compact muted">Share each single-use code with its invited person. Codes expire in 24 hours and are shown only once.</span>
                  <ul className="issued-code__list">{issuedCodes.map((code) => <li key={code}><strong>{code}</strong></li>)}</ul>
                </div>
                <button className="ghost-button" type="button" onClick={copyInvitation}>
                  <Icon name="copy" />Copy all codes
                </button>
              </div>
            ) : null}
            {error ? <div className="error-box" role="alert">{error}</div> : null}
            {message ? <div className="success-box" role="status">{message}</div> : null}
          </form>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2>Pending invitations</h2>
            <Badge tone="pending">{invitations.length} available</Badge>
          </div>
          {invitations.length ? (
            <div className="panel-body invitation-list">
              {invitations.map((invitation) => (
                <div className="invitation-row" key={invitation.id}>
                  <div><strong>{invitation.role === "Super Admin" ? "Administrator" : invitation.role}</strong><span>Expires {formatDate(invitation.expires_at)}</span></div>
                  <Badge tone="pending">Unused</Badge>
                </div>
              ))}
            </div>
          ) : <div className="empty-state">No pending invitations.</div>}
        </div>
        <div className="panel team-access-layout__team">
          <div className="panel-header">
            <h2>Registered team</h2>
            <Badge tone="active">{team.length} accounts</Badge>
          </div>
          <div className="panel-body table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Staff ID</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {team.map((member) => (
                  <tr key={member.id}>
                    <td><strong>{member.full_name}</strong></td>
                    <td><span className="team-id">{member.employee_id || "Not assigned"}</span></td>
                    <td>{member.email}</td>
                    <td>{member.role === "Super Admin" ? "Administrator" : member.role}</td>
                    <td><Badge tone={member.status}>{member.status}</Badge></td>
                    <td>
                      {member.status === "Pending" ? (
                        <div className="team-approval-actions">
                          <select
                            aria-label={`Role for ${member.full_name}`}
                            value={approvalRoles[member.id] || "Cashier"}
                            onChange={(event) => setApprovalRoles({ ...approvalRoles, [member.id]: event.target.value })}
                          >
                            <option value="Cashier">Cashier</option>
                            <option value="Loan Officer">Loan Officer</option>
                            <option value="Inventory Manager">Inventory Manager</option>
                          </select>
                          <button className="primary-button" type="button" disabled={approvingId === member.id} onClick={() => approveAccount(member.id)}>
                            {approvingId === member.id ? "Approving..." : "Approve"}
                          </button>
                        </div>
                      ) : <span className="compact muted">—</span>}
                    </td>
                  </tr>
                ))}
                {!team.length ? <tr><td colSpan="6">No team accounts found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function SettingsPanel({ title, icon, section, values, fields, onChange, onSave, onUploadLogo, saving }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <Icon name={icon} />
      </div>
      <form className="panel-body settings-form" onSubmit={(event) => onSave(section, event)}>
        {fields.map((field) => (
          <Field label={field.label} key={field.key}>
            {field.type === "checkbox" ? (
              <input type="checkbox" checked={Boolean(values[field.key])} onChange={(event) => onChange(section, field.key, event.target.checked)} />
            ) : field.type === "textarea" ? (
              <textarea value={values[field.key] || ""} onChange={(event) => onChange(section, field.key, event.target.value)} />
            ) : field.type === "image" ? (
              <>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onUploadLogo} />
                <ImagePreview src={values[field.key]} label="Business logo preview" compact />
              </>
            ) : field.type === "select" ? (
              <select value={values[field.key]} onChange={(event) => onChange(section, field.key, event.target.value)}>
                {field.options.map((option) => <option key={option}>{option}</option>)}
              </select>
            ) : field.type === "permissions" ? (
              <div className="settings-permissions">
                {[
                  ["Loan Officer", ["dashboard", "customers", "loans", "payments", "inventory", "reports", "agreements"]],
                  ["Cashier", ["dashboard", "customers", "loans", "payments", "inventory", "reports", "agreements"]],
                  ["Inventory Manager", ["dashboard", "customers", "loans", "payments", "inventory", "reports", "agreements"]]
                ].map(([role, modules]) => (
                  <fieldset key={role}>
                    <legend>{role}</legend>
                    <div className="settings-permissions__options">
                      {modules.map((module) => (
                        <label key={module}>
                          <input
                            type="checkbox"
                            checked={values.permissions[role].includes(module)}
                            onChange={(event) => {
                              const currentModules = values.permissions[role];
                              const nextModules = event.target.checked
                                ? [...currentModules, module]
                                : currentModules.filter((item) => item !== module);
                              onChange(section, "permissions", { ...values.permissions, [role]: nextModules });
                            }}
                          />
                          {module.charAt(0).toUpperCase() + module.slice(1)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            ) : (
              <input
                type={field.type || "text"}
                min={field.min}
                max={field.max}
                step={field.step}
                value={values[field.key] ?? ""}
                onChange={(event) => onChange(section, field.key, event.target.value)}
              />
            )}
          </Field>
        ))}
        {section === "security" ? <p className="settings-help">Session-timeout changes apply on the next sign-in. Backup scheduling is saved as a preference; automated backups require a persistent production data store.</p> : null}
        <button className="primary-button" type="submit" disabled={saving}>
          <Icon name="save" />{saving ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function AppShell({ session, onLogout, onAccountUpdated, theme, onToggleTheme }) {
  const [activeView, setActiveView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [settings, setSettings] = useState(initialSettings);

  async function refreshData() {
    const settingsResult = await api.get("/api/settings");
    const modules = settingsResult.data.security.permissions[session.user.role] || [];
    const canAccess = (moduleName) => session.user.role === "Super Admin" || modules.includes(moduleName);
    const [summaryResult, customersResult, loansResult, paymentsResult, inventoryResult, agreementsResult] = await Promise.all([
      api.get("/api/summary"),
      canAccess("customers") ? api.get("/api/customers") : Promise.resolve({ data: [] }),
      canAccess("loans") ? api.get("/api/loans") : Promise.resolve({ data: [] }),
      canAccess("payments") ? api.get("/api/payments") : Promise.resolve({ data: [] }),
      canAccess("inventory") ? api.get("/api/inventory") : Promise.resolve({ data: [] }),
      canAccess("agreements") ? api.get("/api/agreements") : Promise.resolve({ data: [] })
    ]);
    setSummary(summaryResult.data);
    setCustomers(customersResult.data);
    setLoans(loansResult.data);
    setPayments(paymentsResult.data);
    setInventory(inventoryResult.data);
    setAgreements(agreementsResult.data);
    setSettings(settingsResult.data);
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
    user: session.user,
    theme,
    settings
  };

  const permissions = settings.security.permissions[session.user.role] || [];
  const visibleNav = navItems.filter((item) =>
    session.user.role === "Super Admin"
      ? item.roles.includes(session.user.role)
      : item.id === "dashboard" || permissions.includes(item.id)
  );
  useEffect(() => {
    if (!visibleNav.some((item) => item.id === activeView)) {
      setActiveView("dashboard");
    }
  }, [session.user.role, settings.security.permissions]);

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} setActiveView={setActiveView} user={session.user} permissions={permissions} />
      <div className="workspace">
        <Topbar user={session.user} search={search} setSearch={setSearch} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} onAccountUpdated={onAccountUpdated} />
        <main className="main-content">
          {activeView === "dashboard" ? <Dashboard {...viewProps} /> : null}
          {activeView === "customers" ? <CustomerManagement {...viewProps} /> : null}
          {activeView === "loans" ? <LoanManagement {...viewProps} /> : null}
          {activeView === "payments" ? <PaymentManagement {...viewProps} /> : null}
          {activeView === "inventory" ? <InventoryManagement {...viewProps} /> : null}
          {activeView === "reports" ? <Reports {...viewProps} /> : null}
          {activeView === "agreements" ? <Agreements {...viewProps} /> : null}
          {activeView === "team" ? <TeamAccess /> : null}
          {activeView === "settings" ? <Settings {...viewProps} onSettingsChanged={setSettings} /> : null}
        </main>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(() => {
    const saved = window.sessionStorage.getItem("draman-session");
    if (!saved) return null;
    try {
      const restored = JSON.parse(saved);
      return restored.expires_at && new Date(restored.expires_at).getTime() <= Date.now() ? null : restored;
    } catch (error) {
      console.error("Could not restore the saved session:", error);
      return null;
    }
  });
  const [sessionReady, setSessionReady] = useState(false);
  const [theme, setTheme] = useState(() => window.localStorage.getItem("draman-theme") === "dark" ? "dark" : "light");
  const [authNotice, setAuthNotice] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("draman-theme", theme);
  }, [theme]);

  useEffect(() => {
    function handleSessionExpired() {
      setAuthNotice("Your session expired or the server restarted. Sign in again to continue.");
      setSession(null);
    }
    window.addEventListener("draman-session-expired", handleSessionExpired);
    return () => window.removeEventListener("draman-session-expired", handleSessionExpired);
  }, []);

  useEffect(() => {
    if (!session) {
      setSessionReady(true);
      return undefined;
    }
    let active = true;
    api.get("/api/session")
      .then(({ data }) => {
        if (!active) return;
        const restoredSession = { ...session, user: data.user, expires_at: data.expires_at };
        window.sessionStorage.setItem("draman-session", JSON.stringify(restoredSession));
        setSession(restoredSession);
      })
      .catch(() => {
        if (!active) return;
        window.sessionStorage.removeItem("draman-session");
        setAuthNotice("Your session expired or the server restarted. Sign in again to continue.");
        setSession(null);
      })
      .finally(() => {
        if (active) setSessionReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session || !session.expires_at) return undefined;
    const remaining = new Date(session.expires_at).getTime() - Date.now();
    if (remaining <= 0) {
      window.sessionStorage.removeItem("draman-session");
      setAuthNotice("Your session expired. Sign in again to continue.");
      setSession(null);
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      window.sessionStorage.removeItem("draman-session");
      setAuthNotice("Your session expired. Sign in again to continue.");
      setSession(null);
    }, Math.min(remaining, 2147483647));
    return () => window.clearTimeout(timeout);
  }, [session]);

  function handleLogin(nextSession) {
    window.sessionStorage.setItem("draman-session", JSON.stringify(nextSession));
    setAuthNotice("");
    setSession(nextSession);
  }

  function handleAccountUpdated(user) {
    if (!session) return;
    const updatedSession = { ...session, user };
    window.sessionStorage.setItem("draman-session", JSON.stringify(updatedSession));
    setSession(updatedSession);
  }

  async function handleLogout() {
    try {
      await api.post("/api/logout", {});
    } catch (logoutError) {
      console.error("Could not revoke the current session:", logoutError);
    } finally {
      window.sessionStorage.removeItem("draman-session");
      setSession(null);
    }
  }

  function toggleTheme() {
    setTheme((current) => current === "dark" ? "light" : "dark");
  }

  if (!sessionReady) return <main className="session-loading">Restoring your secure session...</main>;

  if (!session) {
    return <LoginScreen onLogin={handleLogin} theme={theme} onToggleTheme={toggleTheme} initialMessage={authNotice} />;
  }

  return <AppShell session={session} onLogout={handleLogout} onAccountUpdated={handleAccountUpdated} theme={theme} onToggleTheme={toggleTheme} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
