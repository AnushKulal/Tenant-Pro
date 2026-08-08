// File: backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key'); // Use your actual secret
            
            req.user = decoded; // Attach the decoded payload (like { id: 1 }) to req
            next();
        } catch (error) {
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

// Rejects a tenant's token on a landlord's route.
//
// This is not belt-and-braces, it closes a real hole. `protect` only proves the token
// is signed by us; it does not say which KIND of account it belongs to. The landlord
// handlers then read `req.user.id` and use it as an owners.id -- so a tenant whose
// tenant_users.id happened to equal a real owners.id was reading that landlord's
// dashboard, transactions, tenant list, properties and payment settings. The two
// tables have independent AUTO_INCREMENTs, so the collision is not exotic: the first
// tenant to register collides with the first landlord to register.
//
// Applied once per owner-facing router in server.js rather than handler by handler,
// because the handler-by-handler version is the one that already went wrong -- a new
// endpoint gets written, the check is forgotten, and nothing fails visibly.
//
// Tenant tokens are identified by role === 'tenant' rather than by REQUIRING
// role === 'owner': owner tokens issued before roles existed carry no role at all and
// stay valid for seven days, and locking those people out on deploy would be a worse
// bug than the one being fixed.
const requireOwner = (req, res, next) => {
    if (req.user?.role === 'tenant') {
        return res.status(403).json({ message: 'This is a landlord endpoint. Sign in with your landlord account.' });
    }
    next();
};

module.exports = { protect, requireOwner };