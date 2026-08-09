-- TenantPro database schema.
-- Every table is created WITH its primary key (and foreign keys) inline, so it
-- satisfies strict providers that enforce sql_require_primary_key (e.g. Aiven).
-- Uses CREATE TABLE IF NOT EXISTS + dependency ordering, so it is safe to run
-- repeatedly. Foreign keys are inline, so re-runs never duplicate constraints.

SET NAMES utf8mb4;

-- 1. owners (no dependencies)
CREATE TABLE IF NOT EXISTS `owners` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `phone` varchar(15) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `profile_pic` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. properties (-> owners)
CREATE TABLE IF NOT EXISTS `properties` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `owner_id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `property_type` enum('PG','Apartment','Independent House','Hostel') NOT NULL,
  `address` text NOT NULL,
  `locality` varchar(100) DEFAULT NULL,
  `city` varchar(100) DEFAULT 'Bengaluru',
  `pincode` varchar(10) DEFAULT NULL,
  -- Where the property actually IS, as a pin the landlord placed on a map.
  --
  -- Nullable, and stays null for every property added before this existed and for
  -- any the landlord has not pinned: an address alone does not give coordinates,
  -- and guessing them would send a tenant to the wrong street with confidence.
  -- Everything that reads these must therefore handle "not pinned yet".
  --
  -- decimal(10,7) rather than a float: 7 decimal places is about 11mm, floats lose
  -- precision at the 6th, and a coordinate that drifts when you read it back is a
  -- building that moves.
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `upi_id` varchar(50) DEFAULT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `owner_id` (`owner_id`),
  CONSTRAINT `properties_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `owners` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. units (-> properties)
CREATE TABLE IF NOT EXISTS `units` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `property_id` int(11) NOT NULL,
  `unit_number` varchar(50) NOT NULL,
  `room_type` varchar(50) DEFAULT 'Standard',
  `capacity` int(11) DEFAULT 1,
  `rent_split_type` enum('Equal','Custom') DEFAULT 'Equal',
  `base_rent` decimal(10,2) NOT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `status` enum('Vacant','Occupied','Maintenance') DEFAULT 'Vacant',
  `notify_email` tinyint(1) DEFAULT 1,
  `notify_sms` tinyint(1) DEFAULT 1,
  `notify_whatsapp` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `property_id` (`property_id`),
  CONSTRAINT `units_ibfk_1` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4. tenants (-> owners)
CREATE TABLE IF NOT EXISTS `tenants` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `owner_id` int(11) NOT NULL,
  `unit_id` int(11) DEFAULT NULL,
  `status` enum('Active','Inactive') DEFAULT 'Active',
  `name` varchar(100) NOT NULL,
  `phone` varchar(15) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `aadhar` varchar(20) DEFAULT NULL,
  `company` varchar(150) DEFAULT NULL,
  `emergency_phone` varchar(15) DEFAULT NULL,
  `deposit` decimal(10,2) DEFAULT 0.00,
  `rent_share` decimal(10,2) DEFAULT 0.00,
  `image_url` varchar(255) DEFAULT NULL,
  `id_proof_url` varchar(255) DEFAULT NULL,
  `credit_score` int(11) DEFAULT 100,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `move_in_date` date DEFAULT NULL,
  `billing_cycle` varchar(20) DEFAULT 'Anniversary',
  `next_rent_due` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `owner_id` (`owner_id`),
  CONSTRAINT `tenants_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `owners` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 5. leases (-> tenants, units)
CREATE TABLE IF NOT EXISTS `leases` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` int(11) NOT NULL,
  `unit_id` int(11) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `deposit_amount` decimal(10,2) NOT NULL,
  `monthly_rent` decimal(10,2) NOT NULL,
  `status` enum('Active','Notice Period','Moved Out') DEFAULT 'Active',
  PRIMARY KEY (`id`),
  KEY `tenant_id` (`tenant_id`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `leases_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `leases_ibfk_2` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 6. expenses (-> properties)
CREATE TABLE IF NOT EXISTS `expenses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `property_id` int(11) NOT NULL,
  `expense_category` varchar(50) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `expense_date` date NOT NULL,
  `description` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `property_id` (`property_id`),
  CONSTRAINT `expenses_ibfk_1` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 7. payment_settings (-> owners)
CREATE TABLE IF NOT EXISTS `payment_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `owner_id` int(11) NOT NULL,
  `upi_id` varchar(100) DEFAULT NULL,
  `upi_number` varchar(15) DEFAULT NULL,
  `qr_code_url` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `owner_id` (`owner_id`),
  CONSTRAINT `payment_settings_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `owners` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 8. rent_invoices (-> leases)
CREATE TABLE IF NOT EXISTS `rent_invoices` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lease_id` int(11) NOT NULL,
  `invoice_month` varchar(7) NOT NULL,
  `base_amount` decimal(10,2) NOT NULL,
  `late_fee` decimal(10,2) DEFAULT 0.00,
  `total_due` decimal(10,2) NOT NULL,
  `due_date` date NOT NULL,
  `status` enum('Unpaid','Partial','Paid') DEFAULT 'Unpaid',
  PRIMARY KEY (`id`),
  KEY `lease_id` (`lease_id`),
  CONSTRAINT `rent_invoices_ibfk_1` FOREIGN KEY (`lease_id`) REFERENCES `leases` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 9. tenant_users (login accounts for tenants — separate from owner-created `tenants` records)
--
-- Two kinds of account live here, and `is_guest` is the difference.
--
--   * A FULL account: name, email and a password. Signs in from anywhere, can
--     reset its own password, gets email.
--   * A GUEST: a phone number and a photograph of a government ID, nothing else.
--     Someone standing in the building today who needs to be let in now and has
--     no reason to invent a password first. `email` and `password_hash` are
--     therefore NULL for a guest -- which is why both are nullable here, and why
--     nothing may assume an account has either.
--
-- `guest_code` is the randomised ID a guest is known by until they fill in a
-- profile: their display name, and (with their phone number) their credential,
-- since they have no password. It is UNIQUE because it is used to look an account
-- up. It is cleared the moment the tenancy ends, so a guest identity cannot
-- outlive the stay it was issued for.
--
-- MySQL permits many NULLs in a UNIQUE index, so a thousand guests with no email
-- and a thousand full accounts with no guest code coexist under both keys.
CREATE TABLE IF NOT EXISTS `tenant_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `phone` varchar(15) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `tenant_id` int(11) DEFAULT NULL,
  `status` enum('Unlinked','Pending','Linked') DEFAULT 'Unlinked',
  `is_guest` tinyint(1) NOT NULL DEFAULT 0,
  `guest_code` varchar(16) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `guest_code` (`guest_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 10. payments (-> tenants, tenant_users)
--
-- Sits after tenant_users rather than beside the other money tables because
-- `declared_by` points at it, and this file creates tables in dependency order.
--
-- A row here is not automatically money in hand. There are two ways one appears:
--
--   * The landlord records it themselves, because they watched it arrive. That is
--     their own statement, so it is born 'Confirmed'.
--   * The tenant says in the app that they have paid. That is a claim about money
--     the landlord has not acknowledged yet, so it is born 'Declared' and counts
--     for nothing until the landlord agrees.
--
-- The distinction is not cosmetic: confirming a payment advances the tenant's
-- `next_rent_due`, which is what clears the month. If a Declared row counted, a
-- tenant could settle their own dues by typing a number, so every total --
-- rent collected, the six-month chart, the transaction ledger -- filters on
-- status = 'Confirmed'. 'Declared' is deliberately NOT the column default:
-- every INSERT that predates this column came from the landlord.
CREATE TABLE IF NOT EXISTS `payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` int(11) NOT NULL,
  `amount_paid` decimal(10,2) NOT NULL,
  `payment_date` date NOT NULL,
  `payment_method` varchar(50) NOT NULL,
  `reference_id` varchar(100) DEFAULT NULL,
  `status` enum('Declared','Confirmed','Rejected') NOT NULL DEFAULT 'Confirmed',
  -- Which tenant_users account claimed it. NULL means the landlord entered the
  -- row, which is also how a Confirmed payment with no claim behind it reads.
  `declared_by` int(11) DEFAULT NULL,
  `decided_at` timestamp NULL DEFAULT NULL,
  -- The landlord's reason when they reject, shown to the tenant so a refusal is
  -- answerable rather than mysterious.
  `decision_note` varchar(300) DEFAULT NULL,
  -- WHO decided, as opposed to what they decided. 'landlord' is a person tapping
  -- Confirm; 'gateway' is a payment provider's webhook vouching for the money;
  -- 'bank' is a future account feed.
  --
  -- ONLY MEANINGFUL ONCE `status` IS NOT 'Declared'. An undecided row carries the
  -- default and nobody has confirmed anything — read this together with status, never
  -- on its own. The default is 'landlord' rather than NULL because every row that
  -- predates this column WAS a landlord's own entry, and a nullable column would have
  -- thrown that history away to make the undecided case tidier.
  `confirmation_source` enum('landlord','gateway','bank') NOT NULL DEFAULT 'landlord',
  -- The provider's own id for the transaction, so a disputed payment can be looked
  -- up on their side. NULL for anything a human confirmed.
  `gateway_ref` varchar(120) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `tenant_id` (`tenant_id`),
  KEY `declared_by` (`declared_by`),
  -- A gateway retries a webhook it thinks failed, so the same reference must be
  -- findable to avoid settling one payment twice.
  KEY `gateway_ref` (`gateway_ref`),
  -- Every dashboard query is "this tenant's payments in this state", and the
  -- declared queue is "anything still waiting", so both live on one index.
  KEY `status_tenant` (`status`, `tenant_id`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`declared_by`) REFERENCES `tenant_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 11. password_resets (email verification codes for "forgot password")
-- `role` scopes a code to the account type it was issued for. Owners and tenants
-- are separate tables and the same person may legitimately hold both with one
-- email address, so without this a code emailed for one could reset the other.
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(100) NOT NULL,
  `role` varchar(10) NOT NULL DEFAULT 'owner',
  `code` varchar(10) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 12. settlements (-> leases)
CREATE TABLE IF NOT EXISTS `settlements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lease_id` int(11) NOT NULL,
  `move_out_date` date NOT NULL,
  `total_deposit` decimal(10,2) NOT NULL,
  `damage_deductions` decimal(10,2) DEFAULT 0.00,
  `pending_rent_deductions` decimal(10,2) DEFAULT 0.00,
  `final_refund_amount` decimal(10,2) NOT NULL,
  `status` enum('Pending','Settled') DEFAULT 'Pending',
  PRIMARY KEY (`id`),
  KEY `lease_id` (`lease_id`),
  CONSTRAINT `settlements_ibfk_1` FOREIGN KEY (`lease_id`) REFERENCES `leases` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 13. maintenance_requests (tenant-raised service requests -> tenants, owners)
-- Powers the tenant portal's "Raise a request" feature and the landlord's queue.
CREATE TABLE IF NOT EXISTS `maintenance_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` int(11) NOT NULL,
  `owner_id` int(11) NOT NULL,
  `category` varchar(50) NOT NULL DEFAULT 'General',
  `title` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `priority` enum('Low','Medium','High') DEFAULT 'Medium',
  `status` enum('Open','In Progress','Resolved','Closed') DEFAULT 'Open',
  -- One optional photo of the problem, uploaded with the request. A picture of
  -- the leak settles what three messages of description cannot.
  `image_url` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `tenant_id` (`tenant_id`),
  KEY `owner_id` (`owner_id`),
  CONSTRAINT `maintenance_requests_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `maintenance_requests_ibfk_2` FOREIGN KEY (`owner_id`) REFERENCES `owners` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 14. maintenance_messages (one request's TIMELINE -> maintenance_requests)
-- Despite the name this is not only the chat: it is the ordered record of
-- everything that happened to a request. `kind` separates the two sorts of entry —
-- 'message' is something a person typed, 'status' is the landlord moving the
-- ticket along ("Open" -> "In Progress"), which previously left no trace at all.
--
-- Status events live HERE rather than in a history table of their own because the
-- only thing anyone ever wants is the two interleaved: a single ordered read gives
-- the tenant and the landlord the identical story ("you replied, then I started
-- work, then you asked when"). Two tables would mean two queries and a merge in
-- every client, and a merge is exactly where the two sides start disagreeing.
--
-- The sender is stored as a ROLE, not a user id, because the two participants of
-- a thread are already fixed by maintenance_requests.tenant_id / owner_id — so a
-- role is all the client needs to place a bubble left or right, and the thread
-- stays readable even if the tenant's login account is later re-created.
-- 'system' exists for entries no human authored (future automated events); a
-- status change is NOT one of those — the landlord chose it, so it is stored as
-- sender_role='owner' and reads as an action by them.
CREATE TABLE IF NOT EXISTS `maintenance_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `sender_role` enum('tenant','owner','system') NOT NULL,
  `kind` enum('message','status') NOT NULL DEFAULT 'message',
  `body` text NOT NULL,
  -- Both endpoints of the transition are kept so a client can render the event
  -- without re-deriving it from the row before it — which is impossible anyway
  -- once messages are interleaved between two status changes.
  `status_from` varchar(20) DEFAULT NULL,
  `status_to` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `request_id` (`request_id`),
  CONSTRAINT `maintenance_messages_ibfk_1` FOREIGN KEY (`request_id`) REFERENCES `maintenance_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 15. join_requests (a tenant asking a landlord to be let into a property)
-- The missing first step of a tenancy: until now a landlord had to create the
-- `tenants` row before the tenant's own login could see anything, and a tenant who
-- had the property's code had no way to raise their hand. This table is that
-- handshake, and accepting one is what finally sets tenant_users.status='Linked'
-- (the 'Pending' value that enum has always carried was meant for exactly this).
--
-- owner_id is denormalised alongside property_id so the landlord's inbox is one
-- indexed read instead of a join through properties on every poll.
--
-- unit_id is filled in ON ACCEPT, not on request: the tenant asks to join a
-- PROPERTY (that is all the code identifies), and which room they end up in is the
-- landlord's decision at the moment they accept. ON DELETE SET NULL because a room
-- being deleted later must not erase the record that someone was admitted.
--
-- Deliberately NO unique key on (tenant_user_id, property_id, status): it would
-- read as "one request per state" but actually forbids a second Rejected row,
-- so a tenant rejected once could never re-apply after sorting things out with the
-- landlord. Duplicates are prevented in joinController instead, which refuses a new
-- request while a Pending one exists for that property — the only overlap that is
-- genuinely wrong. Decided rows are history and may repeat.
CREATE TABLE IF NOT EXISTS `join_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_user_id` int(11) NOT NULL,
  `owner_id` int(11) NOT NULL,
  `property_id` int(11) NOT NULL,
  `unit_id` int(11) DEFAULT NULL,
  `status` enum('Pending','Accepted','Rejected') NOT NULL DEFAULT 'Pending',
  `note` varchar(300) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  -- NULL for as long as the request is Pending, which is what makes "how long has
  -- this been waiting" answerable without a separate event log.
  `decided_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `tenant_user_id` (`tenant_user_id`),
  KEY `owner_id` (`owner_id`),
  KEY `property_id` (`property_id`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `join_requests_ibfk_1` FOREIGN KEY (`tenant_user_id`) REFERENCES `tenant_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `join_requests_ibfk_2` FOREIGN KEY (`owner_id`) REFERENCES `owners` (`id`) ON DELETE CASCADE,
  CONSTRAINT `join_requests_ibfk_3` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `join_requests_ibfk_4` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 16. tenant_documents (-> tenant_users, owners)
-- The ID proofs a tenant uploads on their own profile, and the landlord's verdict
-- on each. Keyed on tenant_users (the portal account) rather than tenants (the
-- landlord's record), because the whole point is that a landlord can look at a
-- stranger's ID *before* accepting them into a property — at which moment no
-- tenants row exists yet.
--
-- `tenants.id_proof_url` and `tenants.aadhar` stay where they are: those are what
-- the landlord typed in themselves, which is a different claim from a document
-- the tenant supplied and someone checked.
CREATE TABLE IF NOT EXISTS `tenant_documents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_user_id` int(11) NOT NULL,
  `doc_type` varchar(20) NOT NULL,
  -- Optional: many people will not want to type the number, and a photo of the
  -- card is the thing being verified either way.
  `doc_number` varchar(64) DEFAULT NULL,
  `file_url` varchar(500) NOT NULL,
  `status` enum('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending',
  -- Who decided, and when. NULL for as long as nobody has looked.
  `verified_by` int(11) DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `note` varchar(300) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `tenant_user_id` (`tenant_user_id`),
  KEY `verified_by` (`verified_by`),
  CONSTRAINT `tenant_documents_ibfk_1` FOREIGN KEY (`tenant_user_id`) REFERENCES `tenant_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tenant_documents_ibfk_2` FOREIGN KEY (`verified_by`) REFERENCES `owners` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 17. demo_state (-> owners)
-- One row, id = 1. Records when the demo account's data was last rebuilt, so the app
-- can say "last reset 3 days ago" and so a landlord can tell a stale demo from a
-- fresh one before they put it in front of a client.
--
-- Deliberately NOT a flag that boot reads to decide whether to reseed: boot decides
-- that by looking at whether the account has any properties, which cannot get out of
-- step with reality the way a stored flag can.
CREATE TABLE IF NOT EXISTS `demo_state` (
  `id` tinyint(4) NOT NULL DEFAULT 1,
  `owner_id` int(11) DEFAULT NULL,
  `last_reset_at` timestamp NULL DEFAULT NULL,
  `reset_count` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `owner_id` (`owner_id`),
  CONSTRAINT `demo_state_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `owners` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
