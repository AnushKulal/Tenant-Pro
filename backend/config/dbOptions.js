// Shared SSL options for all MySQL connections (pool + schema init).
//
// Cloud MySQL providers (Aiven, PlanetScale, Railway, TiDB, …) require TLS.
//   • DB_SSL=true            → connect over TLS.
//   • DB_CA_CERT (optional)  → the provider's CA cert for strict verification.
//     If not supplied, we still use TLS but skip CA verification, which is what
//     Aiven needs out of the box (it uses a self-signed project CA).
// Left unset for local development (plain connection).
const sslOption = () => {
    if (process.env.DB_SSL !== 'true') return undefined;
    if (process.env.DB_CA_CERT) {
        return { ca: process.env.DB_CA_CERT.replace(/\\n/g, '\n'), rejectUnauthorized: true };
    }
    return { rejectUnauthorized: false };
};

module.exports = { sslOption };
