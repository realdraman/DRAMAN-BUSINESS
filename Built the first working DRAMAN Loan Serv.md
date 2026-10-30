Built the first working DRAMAN Loan Services Management System slice and left it running here:

[http://localhost:4173](http://localhost:4173)

Use `admin@draman.co.ke` / `admin123` to log in, or pick any demo role on the login screen.

Key files:
- [server.js](<C:/Users/real_draman/Documents/Codex/2026-05-09/draman-loan-services-management-system-complete/server.js>) - local API/static server
- [app.jsx](<C:/Users/real_draman/Documents/Codex/2026-05-09/draman-loan-services-management-system-complete/public/app.jsx>) - React UI
- [styles.css](<C:/Users/real_draman/Documents/Codex/2026-05-09/draman-loan-services-management-system-complete/public/styles.css>) - dashboard styling
- [schema.sql](<C:/Users/real_draman/Documents/Codex/2026-05-09/draman-loan-services-management-system-complete/database/schema.sql>) - PostgreSQL structure
- [README.md](<C:/Users/real_draman/Documents/Codex/2026-05-09/draman-loan-services-management-system-complete/README.md>) - run notes and demo accounts

Verified: `server.js` syntax, API health/summary, customer/loan/payment write endpoints, and browser rendering for login, dashboard, customers, loans, and payments. `npm` is not available on PATH in this environment, so I made this prototype run with plain `node server.js` and CDN-loaded React/Tailwind/Chart.js.