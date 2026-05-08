# 🏢 TenantPro

A comprehensive full-stack mobile application designed to streamline property management operations for landlords and tenants.

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/expo-1C1E24?style=for-the-badge&logo=expo&logoColor=#D04A37)
![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![MySQL](https://img.shields.io/badge/mysql-4479A1.svg?style=for-the-badge&logo=mysql&logoColor=white)

## 📖 About

TenantPro is a mobile-first property management solution built to simplify the complex relationship between landlords and tenants. The app provides an intuitive platform for managing rental properties, tracking transactions, handling tenant records, and maintaining clear communication between all parties involved.

## ✨ Features

- 🏠 **Property Management** — Add, edit, and manage multiple rental properties
- 👥 **Tenant Records** — Maintain detailed tenant information and lease history
- 💰 **Recent Transactions** — Track rent payments and financial history
- 📊 **Dashboard Analytics** — View occupancy rates and revenue insights
- 🔔 **Notifications** — Stay updated on payments, maintenance requests, and lease renewals
- 🔐 **Secure Authentication** — Protected user accounts with role-based access

## 🛠️ Tech Stack

**Frontend (Mobile):**
- React Native
- Expo

**Backend:**
- Node.js
- Express.js

**Database:**
- MySQL

## 📁 Project Structure
Tenant-Pro/
├── backend/          # Node.js + Express.js API server
├── mobile/           # React Native + Expo mobile app
├── tenantpro_db.sql  # MySQL database schema
└── README.md

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed:
- [Node.js](https://nodejs.org/) (v14 or higher)
- [MySQL](https://www.mysql.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Expo Go](https://expo.dev/client) app on your mobile device (for testing)

### Installation

1. **Clone the repository**
```bash
   git clone https://github.com/AnushKulal/Tenant-Pro.git
   cd Tenant-Pro
```

2. **Set up the database**
   - Open MySQL and create a database
   - Import the schema:
```bash
     mysql -u your_username -p your_database < tenantpro_db.sql
```

3. **Set up the backend**
```bash
   cd backend
   npm install
   npm start
```

4. **Set up the mobile app**
```bash
   cd ../mobile
   npm install
   npx expo start
```

5. **Run the app**
   - Scan the QR code with the Expo Go app on your phone
   - Or run on an emulator using the Expo dev tools

## 📱 Screenshots

*(Add screenshots of your app here once available)*

## 🤝 Contributing

This is an academic project. Suggestions and feedback are welcome!

## 👨‍💻 Author

**Anush Kulal**
- GitHub: [@AnushKulal](https://github.com/AnushKulal)

## 📝 License

This project is created for educational purposes.

---

⭐ If you find this project helpful, please consider giving it a star!
