# 🏢 TenantPro

A full-stack, mobile-first **property management platform** that helps landlords manage rental properties, tenants, rent collection, and financials — with automated rent reminders over Email, SMS, and WhatsApp.

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/expo-1C1E24?style=for-the-badge&logo=expo&logoColor=#D04A37)
![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![MySQL](https://img.shields.io/badge/mysql-4479A1.svg?style=for-the-badge&logo=mysql&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=JSON%20web%20tokens)

---

## 📖 About

**TenantPro** is a property management solution built for landlords who rent out **PGs, apartments, independent houses, and hostels**. It replaces the usual mess of spreadsheets, paper receipts, and manual follow-ups with a single mobile app.

A landlord (owner) signs in, adds their properties, splits each property into **units/rooms**, and assigns **tenants** to those units. From there, TenantPro handles the day-to-day work of running rentals — tracking who has paid, calculating each tenant's next rent-due date, recording payments, managing security deposits and move-out settlements, logging expenses, and **automatically nudging tenants when rent is due**.

The app is tailored for the Indian rental market: amounts are in **₹ (INR)**, payments are collected via **UPI ID / UPI number / QR code**, tenant identity is stored via **Aadhaar**, and phone numbers default to **+91**.

> 🎓 This is an academic project and a work in progress — see the [Roadmap](#-roadmap--future-enhancements) for what's planned next.

---

## ✨ Key Features

### 🏠 Property & Unit Management
- Manage multiple properties (PG / Apartment / Independent House / Hostel) with address, locality, city, and pincode.
- Break each property into **units (rooms)** with room type, capacity, base rent, and a `Vacant / Occupied / Maintenance` status.
- Per-unit notification toggles for Email, SMS, and WhatsApp.

### 👥 Tenant Management
- Detailed tenant records — contact info, Aadhaar, company, emergency contact, deposit, rent share, and ID-proof uploads.
- **Assign / reassign** tenants to units and **change rooms**.
- **Soft move-out** — a tenant is marked `Inactive` instead of being deleted, so their full history is preserved.
- Per-tenant **credit score** (used to gauge payment reliability).

### 💰 Rent, Payments & Financials
- **Smart Billing Engine** — automatically calculates each tenant's `next_rent_due` date based on their move-in date and billing cycle (*Anniversary* or *1st of month*).
- Record payments with amount, date, method, and reference ID.
- **Rent invoices** with base amount, late fees, due dates, and `Unpaid / Partial / Paid` status.
- **Deposit settlements** on move-out — computes the final refund after damage and pending-rent deductions.
- **Expense tracking** per property for accurate profit/loss.
- Configurable **UPI ID, UPI number, and QR code** for collecting rent.

### 🔔 Automated Reminders (Automation Engine)
- A daily **cron job (8:00 AM IST)** finds every tenant whose rent is due that day and sends reminders automatically.
- Multi-channel delivery via **Email (Nodemailer)**, **SMS**, and **WhatsApp** (Twilio) — respecting each unit's notification toggles.
- Reminders include the amount due and the owner's UPI / QR payment details.

### 🔐 Authentication & Security
- Owner registration and login secured with **JWT** and **bcrypt**-hashed passwords.
- Protected API routes via auth middleware; file uploads handled with **Multer**.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Mobile App** | React Native, Expo |
| **Backend API** | Node.js, Express.js |
| **Database** | MySQL (MariaDB compatible) |
| **Auth** | JSON Web Tokens (JWT), bcryptjs |
| **File Uploads** | Multer |
| **Notifications** | Nodemailer (Email), Twilio (SMS & WhatsApp) |
| **Scheduling** | node-cron |

---

## 📁 Project Structure

```
Tenant-Pro/
├── backend/                  # Node.js + Express REST API
│   ├── config/               # Database connection
│   ├── controllers/          # Route logic (auth, owner, property, unit, tenant, payment)
│   ├── middleware/           # Auth + file-upload middleware
│   ├── routes/               # API route definitions
│   ├── services/             # cronService.js — automated rent reminders
│   └── server.js             # App entry point
│
├── mobile/                   # React Native + Expo app
│   ├── src/
│   │   ├── api/              # Axios client (SERVER_URL config)
│   │   ├── components/       # Tabs, modals, nav (Home, Tenants, Rooms, Payments…)
│   │   └── screens/          # Splash, Login, Register, Home
│   └── App.js
│
├── tenantpro_db.sql          # MySQL database schema
└── README.md
```

### 🗄️ Data Model (overview)

`owners` → `properties` → `units` → `tenants` → `leases` → `rent_invoices` / `payments` / `settlements`, plus `expenses` (per property) and `payment_settings` (per owner).

---

## 🔌 API Overview

Base URL: `http://<your-ip>:5000/api`

| Resource | Endpoints |
|----------|-----------|
| **Auth** | `POST /auth/register`, `POST /auth/login` |
| **Owner** | `GET /owner/dashboard`, `GET /owner/transactions`, `PUT /owner/profile` |
| **Properties** | `GET /properties`, `POST /properties`, `PUT /properties/:id`, `DELETE /properties/:id` |
| **Units** | `GET /units`, `GET /units/available`, `POST /units`, `PUT /units/:id`, `PUT /units/:id/settings`, `DELETE /units/:id` |
| **Tenants** | `GET /tenants`, `POST /tenants`, `PUT /tenants/:id`, `PUT /tenants/:id/assign`, `PUT /tenants/:id/move-out`, `PUT /tenants/:id/financials`, `GET /tenants/unassigned` |
| **Payments** | `GET /payments/settings`, `POST /payments/settings`, `POST /payments/:id/payments` |

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed:
- [Node.js](https://nodejs.org/) (v14 or higher)
- [MySQL](https://www.mysql.com/) (or MariaDB)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Expo Go](https://expo.dev/client) app on your phone (for testing on a real device)

### 1. Clone the repository
```bash
git clone https://github.com/AnushKulal/Tenant-Pro.git
cd Tenant-Pro
```

### 2. Set up the database
```bash
mysql -u your_username -p your_database < tenantpro_db.sql
```

### 3. Configure the backend
Create a `.env` file inside the `backend/` folder:

```env
# Server
PORT=5000
BASE_URL=http://localhost:5000

# Database
DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=tenantpro_db

# Auth
JWT_SECRET=your_super_secret_key

# Email (Nodemailer / Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# Twilio (SMS & WhatsApp) — optional; runs in mock mode if omitted
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=+14155238886
```

> 💡 If Twilio credentials are left blank, the automation engine still runs and logs SMS/WhatsApp messages in **mock mode**, so you can develop without a paid account.

Then start the server:
```bash
cd backend
npm install
npm start          # or: npm run dev  (nodemon)
```

### 4. Configure & run the mobile app
Set your computer's local IP address in `mobile/src/api/client.js` (so your phone can reach the backend), then:

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go**, or run it on an Android/iOS emulator.

---

## 🗺️ Roadmap / Future Enhancements

TenantPro is actively being developed. Planned enhancements include:

- 🤖 **AI Assistant** — an in-app agentic assistant that answers questions about your properties, tenants, and finances using live data.
- 📈 **Credit Score System** — automatically raise/lower each tenant's score based on on-time vs. late payments, with score history.
- 💳 **Online Rent Payments** — integrated UPI/Razorpay so tenants can pay directly through the app.
- 🧾 **Auto-generated PDF Receipts & Invoices**.
- 🛠️ **Maintenance / Complaint Tickets** — tenants raise requests with photos; owners track and resolve them.
- 📊 **Advanced Dashboard Analytics** — occupancy rate, collection rate, and revenue trends.
- 📲 **Push Notifications** via Expo.
- 👤 **Tenant-facing App** — a separate login where tenants can view dues, pay rent, and see their credit score.

---

## 🤝 Contributing

This is an academic project. Suggestions, issues, and feedback are welcome!

## 👨‍💻 Author

**Anush Kulal**
- GitHub: [@AnushKulal](https://github.com/AnushKulal)

## 📝 License

This project is created for educational purposes.

---

⭐ If you find this project helpful, please consider giving it a star!
