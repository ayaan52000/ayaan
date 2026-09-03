# FMS Project Analysis aur User Guide

## 1. Aap ne kya banaya hai?

Aap ne **FMS (Finance Management System / Petty Cash Management System)** naam ka full-stack web application banaya hai. Yeh organization ki branches mein cash advance, expenses, approvals, receipts, ledger, reconciliation, audit aur reporting manage karta hai.

Yeh sirf frontend design nahi hai. Is mein working backend API, PostgreSQL database, authentication, permissions, file uploads, business rules aur Docker deployment configuration bhi hai.

### Main features

- 6 roles ke liye role-based login aur dashboards
- Cash advance request aur 2-level approval
- Approved cash ko disburse karna aur ledger mein entry banana
- Expense entry ke saath receipt image/PDF upload
- Expense ka 2-level approval
- Category-wise monthly budget cap (warn, block ya off mode)
- Cash advance reconciliation aur settlement
- Branch-wise live ledger aur running balance chart
- In-app notifications
- Har important action ka audit log
- CSV reports aur PDF branch summary/voucher
- Branch aur user management
- Ocean, Sunset aur Slate UI themes
- Docker Compose ke through frontend, backend aur PostgreSQL ko ek saath run karna

## 2. Technology stack

| Layer | Technology | Kaam |
|---|---|---|
| Frontend | Next.js 14, React 18, TypeScript | Screens, dashboards, forms aur navigation |
| Charts | Recharts | Cash-flow aur ledger charts |
| Backend | Node.js, Express | API aur business logic |
| Database layer | Prisma ORM | Backend aur database ke darmiyan queries/migrations |
| Database | PostgreSQL 16 | Users, branches, advances, expenses, ledger waghera store karta hai |
| Security | JWT, httpOnly cookie, bcrypt, Helmet, rate limiting | Login, password hashing aur API protection |
| Validation/uploads | Zod, Multer | Input validation aur receipts upload |
| Documents | PDFKit | PDF voucher aur branch summary |
| Deployment | Docker, Docker Compose | Puri application ko containers mein chalata hai |

## 3. Project structure

```text
fms-monorepo/
|-- frontend/                 Next.js web application
|   |-- app/                  Login aur role/section pages
|   |-- components/           Dashboard aur business modules
|   `-- lib/api.ts            Backend ko request bhejne ka common client
|-- backend/                  Express API
|   |-- src/server.js         Backend ka starting point
|   |-- src/routes/           Auth, advances, expenses, reports waghera
|   |-- src/lib/              Permissions, audit, notifications aur policies
|   |-- prisma/schema.prisma  Database models
|   |-- prisma/migrations/    Database version changes
|   |-- prisma/seed.js        Demo branches, categories aur users
|   `-- uploads/              Local receipt files
|-- docs/                     Phase 0 se Phase 5 ki documentation
`-- docker-compose.yml        Database + API + frontend stack
```

## 4. System technically kaise kaam karta hai?

```text
User ka Browser
      |
      v
Next.js Frontend (localhost:3000)
      |
      | HTTP API request + httpOnly session cookie
      v
Express Backend (localhost:4000)
      |
      | Authentication -> Permission -> Validation -> Business Rule
      v
Prisma ORM
      |
      v
PostgreSQL Database
```

1. User frontend par form ya button use karta hai.
2. `frontend/lib/api.ts` backend ko HTTP request bhejta hai. Browser signed `fms_session` cookie automatically bhejta hai.
3. Express route request receive karta hai.
4. Authentication middleware JWT cookie verify karke user ID, role aur branch identify karta hai.
5. Permission middleware check karta hai ke is role ko action allowed hai ya nahi.
6. Zod request data validate karta hai; receipt ho to Multer file validate/store karta hai.
7. Route business rules lagata hai, jaise approval ka sahi level, branch scope, current status aur budget limit.
8. Prisma PostgreSQL mein data read/write karta hai.
9. Important multi-step changes database transaction mein hote hain. Failure par poora transaction rollback hota hai.
10. API JSON, CSV ya PDF response deti hai aur frontend updated result dikhata hai.

## 5. Login aur security flow

1. User `/login` par email/username aur password deta hai.
2. Backend password ko database ke bcrypt hash se compare karta hai.
3. Correct login par 8-hour JWT banta hai aur `fms_session` naam ki **httpOnly cookie** mein save hota hai.
4. JavaScript JWT ko read nahi kar sakti; localStorage mein sirf non-secret user profile hoti hai.
5. Har protected API request par cookie verify hoti hai.
6. Wrong role ko `403`, missing/invalid login ko `401` milta hai.
7. Login par per-IP 15 minutes mein 10 attempts ki rate limit hai.
8. Logout cookie clear kar deta hai.

## 6. Roles aur permissions

| Role | Main kaam |
|---|---|
| Finance Head | Final cash approval, disbursement/ledger, users/branches, reports aur audit |
| Accounts Head | Cash level-1 approval, expense final approval, disbursement/settlement, ledger aur reports |
| Branch Manager | Apni branch ka cash request, expense entry aur expense level-1 approval |
| Data Entry Operator | Apni branch ke expenses aur receipts enter karna |
| Program Officer | Apni assigned branch ka cash advance request karna |
| Auditor | Organization ledger, reports aur read-only audit log dekhna |

Branch roles ko aam tor par sirf unki assigned branch ka data milta hai. Finance Head, Accounts Head aur Auditor organization-level data dekh sakte hain.

## 7. Main business pipeline

### A. Cash advance pipeline

```text
Branch Manager / Program Officer
        |
        | Cash request create
        v
REQUESTED
        |
        | Level 1: Accounts Head approve/reject
        v
REQUESTED (level 1 complete)
        |
        | Level 2: Finance Head approve/reject
        v
APPROVED ya REJECTED
        |
        | Finance/Accounts cash disburse
        v
DISBURSED + Ledger DISBURSEMENT entry
```

- Har approval mein approver, level, comment aur time store hota hai.
- Wrong role ya wrong sequence approval nahi kar sakta.
- Disbursement aur ledger entry ek serializable transaction mein bante hain, is liye double-disbursement se protection hai.
- Request, approval, rejection aur disbursement par relevant users ko notification milti hai.

### B. Expense pipeline

```text
Data Entry Operator / Branch Manager
        |
        | Amount + category + description + receipt
        v
PENDING
        |
        | Level 1: us branch ka Branch Manager
        v
PENDING (level 1 complete)
        |
        | Level 2: Accounts Head
        v
APPROVED ya REJECTED
```

- Expense optionally kisi `DISBURSED` cash advance ke saath link hota hai.
- Receipt required hai; JPG, PNG, WebP ya PDF local `backend/uploads` mein store hota hai (max 5 MB).
- Final approval se pehle branch + category + current UTC month ka approved total calculate hota hai.
- `BUDGET_ENFORCEMENT=warn`: approval hoti hai magar warning milti hai.
- `BUDGET_ENFORCEMENT=block`: cap cross ho to final approval reject hoti hai.
- `BUDGET_ENFORCEMENT=off`: budget check skip hota hai.

### C. Reconciliation aur settlement pipeline

```text
Disbursed advance
      +
Us se linked tamam approved/rejected expenses
      |
      v
Variance = Disbursed Amount - Approved Expenses
      |
      |-- Positive variance -> REFUND ledger entry
      |-- Negative variance -> ADJUSTMENT ledger entry
      `-- Zero variance     -> Extra ledger entry nahi
      |
      v
SETTLED
```

Jab tak koi linked expense `PENDING` ho, settlement nahi ho sakti. Settlement status, optional refund/adjustment ledger entry, audit record aur notifications ek hi database transaction mein bante hain.

### D. Ledger pipeline

- Cash disbursement par branch ledger mein `DISBURSEMENT` entry banti hai.
- Settlement ke difference par `REFUND` ya `ADJUSTMENT` banta hai.
- Har entry previous latest balance se naya `runningBalance` calculate karti hai.
- Finance Head, Accounts Head aur Auditor branch summary, entries aur animated running-balance chart dekhte hain.

## 8. Database mein kya store hota hai?

- `Branch`: branch name, code aur active status
- `User`: name, email, hashed password, role aur optional branch
- `ExpenseCategory`: category aur budget cap
- `CashAdvance`: amount, purpose, requester, branch aur workflow status
- `Expense`: amount, category, creator, receipt, linked advance aur status
- `ApprovalStep`: level, approver, comments aur decision
- `LedgerEntry`: debit/credit/disbursement/refund/adjustment aur running balance
- `AuditLog`: kis user ne kis entity par kya action kiya
- `Notification`: recipient, message, type aur read/unread status

## 9. Application kaise use karein? (Recommended: Docker)

### Requirements

- Docker Desktop installed aur running ho
- Terminal/PowerShell project ke `fms-monorepo` folder mein open ho

### Start

```powershell
cd C:\Users\sk\Desktop\fms\fms-monorepo
docker compose up --build -d
docker compose ps
```

PostgreSQL healthy aur backend/frontend running nazar aane ke baad browser mein kholen:

```text
http://localhost:3000
```

Demo Finance Head login:

```text
Username: admin
Password: admin
```

Health check:

```text
http://localhost:4000/health
```

Logs dekhne ke liye:

```powershell
docker compose logs -f backend frontend
```

Application stop karne ke liye:

```powershell
docker compose down
```

Is se database aur uploads ke named volumes preserve rehte hain. `docker compose down --volumes` data delete karta hai, is liye sirf jaan-boojh kar use karein.

### Dusre demo accounts

In sab ka password `Password123!` hai:

| Role | Email |
|---|---|
| Accounts Head | accounts.head@fms.local |
| Branch Manager | branch.manager@fms.local |
| Data Entry Operator | data.entry@fms.local |
| Program Officer | program.officer@fms.local |
| Auditor | auditor@fms.local |

Finance Head email `finance.head@fms.local` ka password `admin` hai; `admin` username bhi isi account par map hota hai.

## 10. Recommended demo/test sequence

1. `admin / admin` se login karke branches aur dashboards check karein.
2. Program Officer ya Branch Manager se cash advance request banayein.
3. Accounts Head se level-1 approve karein.
4. Finance Head se final approve karein.
5. Accounts Head ya Finance Head se advance disburse karein.
6. Data Entry account se isi advance ke against expense aur receipt upload karein.
7. Branch Manager se expense level-1 approve karein.
8. Accounts Head se expense final approve/reject karein.
9. Accounts Head se reconciliation preview aur settlement complete karein.
10. Finance Head/Auditor se ledger, audit log, CSV reports aur PDF summary check karein.

## 11. Frontend pages

- `/login` — authentication
- `/finance-head`, `/accounts-head`, `/branch-manager`, `/data-entry`, `/program-officer`, `/auditor` — role dashboards
- `/{role}/cash-advances` — cash workflow
- `/{role}/expenses` — expense workflow
- `/{role}/approvals` — pending decisions
- `/{role}/ledger` — ledger (authorized roles)
- `/{role}/branches` — branch directory
- `/{role}/reports` — downloads
- `/{role}/audit` — Finance Head/Auditor audit view
- `/register` — Finance Head ke liye user creation

Notification bell har 30 seconds baad recent notifications check karti hai aur click par related cash advance/expense section kholti hai.

## 12. Important API groups

- `/api/auth` — login, logout, user register
- `/api/branches` — branches
- `/api/cash-advance` — create/list/detail/approve/reject/disburse/reconcile/settle/voucher
- `/api/expenses` — expense + receipt + approvals
- `/api/categories` — expense categories
- `/api/ledger` — branch balances aur entries
- `/api/audit` — filtered/paginated activity
- `/api/reports` — CSV aur PDF exports
- `/api/notifications` — inbox aur mark-as-read

## 13. Current strengths

- Clear frontend/backend separation; frontend direct database access nahi karta.
- Role aur branch-level authorization implemented hai.
- Critical money/status changes atomic database transactions mein hain.
- Approval sequence backend enforce karta hai, sirf UI par depend nahi karta.
- Audit aur notifications important mutations ke saath create hote hain.
- Receipt validation, input validation, rate limiting aur secure cookie use hoti hai.
- Docker, migrations, idempotent seed aur CI configuration deployment ko repeatable banate hain.

## 14. Current limitations / production se pehle

- Demo `admin/admin` production mein bilkul na rakhein.
- Strong unique `JWT_SECRET` aur PostgreSQL password set karein.
- HTTPS ke saath `COOKIE_SECURE=true` karein aur exact production URLs set karein.
- Receipts abhi local/public uploads mein hain; cloud/private object storage, signed URLs aur malware scan nahi hain.
- Email notifications nahi; sirf in-app notifications hain.
- Opening funds/deposits ka workflow nahi, is liye ledger ka initial funding model add karna par sakta hai.
- Approval chain code mein fixed hai; admin UI/database se configure nahi hoti.
- SSO/2FA, multi-currency, mobile app aur horizontal scaling included nahi hain.
- Real production mein development seed users automatically create karna reconsider karein.

## 15. Short summary

Yeh system branch petty-cash lifecycle ko end-to-end manage karta hai: **request -> staged approvals -> disbursement -> receipt-based expenses -> staged approvals -> reconciliation -> settlement -> ledger/report/audit**. Frontend user experience deta hai, Express permissions aur business rules enforce karta hai, Prisma transactions data consistency rakhti hain, aur PostgreSQL permanent records store karta hai.

