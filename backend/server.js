require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path'); 
const db = require('./config/db');

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json()); 

// --- Serve Static Files (Images & Documents) ---
// This exposes your 'uploads' folder to the web. 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Route Imports ---
const authRoutes = require('./routes/authRoutes');
const ownerRoutes = require('./routes/ownerRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const unitRoutes = require('./routes/unitRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { initCronJobs, checkAndSendRentReminders } = require('./services/cronService');

// --- Mount Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/payments', paymentRoutes);

// --- Basic Health Check ---
app.get('/', (req, res) => {
    res.send('TenantPro Backend is running!');
});

// --- 🚨 SECRET TEST ROUTE (Remove before production!) ---
app.get('/api/test-cron', async (req, res) => {
    console.log("🛠️ Manual Cron Triggered via /api/test-cron");
    await checkAndSendRentReminders();
    res.send("Cron job executed! Check your backend terminal.");
});

// --- Start Automation Engine ---
initCronJobs();

// --- Boot Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});