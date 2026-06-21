-- =============================================================================
-- o.company · database schema
-- =============================================================================
-- Each migration is delimited by:
--   -- === NAME: NNN_description ===
-- followed by the SQL. The migrate runner tracks applied migrations
-- in a `__migrations` table.
--
-- Conventions:
--   - Every table has id (UUID primary key), orgId (UUID), createdAt, updatedAt
--   - Soft deletes use deletedAt IS NULL
--   - Monetary values are stored as integer cents, never floats
--   - Free-form JSON uses jsonb with explicit type guards in the app
--   - Indexes are declared inline so they're versioned with the table
-- =============================================================================

-- === NAME: 001_initial ===

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE role AS ENUM ('owner', 'admin', 'manager', 'operator', 'client', 'guest');
CREATE TYPE department AS ENUM ('engineering', 'operations', 'sales', 'creative', 'finance', 'people', 'other');
CREATE TYPE person_status AS ENUM ('active', 'invited', 'suspended', 'on_leave', 'deactivated');

CREATE TYPE contact_status AS ENUM ('lead', 'active', 'customer', 'churned');
CREATE TYPE contact_lifecycle AS ENUM ('subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist');
CREATE TYPE lead_tier AS ENUM ('cold', 'warm', 'hot', 'qualified');

CREATE TYPE deal_stage AS ENUM ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost');
CREATE TYPE deal_status AS ENUM ('open', 'closed');

CREATE TYPE project_status AS ENUM ('scoping', 'proposed', 'active', 'review', 'delivered', 'completed', 'archived');
CREATE TYPE service_kind AS ENUM ('websites', 'lead_forms', 'automation', 'crm_setup', 'photo_pipeline', 'creative');
CREATE TYPE milestone_status AS ENUM ('pending', 'in_progress', 'blocked', 'complete', 'canceled');

CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'void', 'uncollectible');
CREATE TYPE payment_method AS ENUM ('card', 'ach', 'sepa', 'wire', 'crypto', 'cash', 'other');
CREATE TYPE crypto_chain AS ENUM ('ethereum', 'base', 'polygon', 'arbitrum', 'optimism');
CREATE TYPE crypto_token AS ENUM ('usdc', 'usdt', 'dai');

CREATE TYPE ticket_status AS ENUM ('open', 'waiting_customer', 'waiting_internal', 'in_progress', 'resolved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TYPE file_status AS ENUM ('uploading', 'available', 'deleted', 'failed');

CREATE TYPE audit_event_type AS ENUM (
  'auth.login', 'auth.logout', 'auth.register', 'auth.failed',
  'org.create', 'org.update', 'org.transfer_ownership',
  'person.invite', 'person.role_change', 'person.deactivate',
  'contact.create', 'contact.update', 'contact.delete',
  'deal.create', 'deal.update', 'deal.stage_change',
  'invoice.create', 'invoice.send', 'invoice.pay', 'invoice.refund',
  'operator.draft_created', 'operator.draft_approved', 'operator.draft_rejected', 'operator.draft_sent',
  'photo.upload', 'photo.process', 'photo.deliver',
  'security.2fa_enabled', 'security.api_key_created'
);

CREATE TYPE notification_kind AS ENUM (
  'deal_assigned', 'mention', 'invoice_paid', 'invoice_overdue',
  'ticket_assigned', 'ticket_reply', 'project_update',
  'photo_ready', 'operator_draft_ready', 'operator_draft_approved'
);

-- Photo pipeline
CREATE TYPE photo_job_status AS ENUM ('queued', 'processing', 'ready', 'failed', 'canceled');
CREATE TYPE photo_variation_kind AS ENUM (
  'original', 'upscaled-2x', 'upscaled-4x', 'color-noira',
  'no-bg', 'restored', 'crop-square', 'crop-portrait', 'denoised'
);

-- Operator
CREATE TYPE operator_draft_status AS ENUM ('pending', 'approved', 'edited', 'rejected', 'sent', 'skipped', 'failed');
CREATE TYPE operator_draft_channel AS ENUM ('email', 'sms', 'in_app', 'task', 'score', 'route');
CREATE TYPE operator_draft_kind AS ENUM (
  'morning_briefing', 'deal_followup_draft', 'lead_score',
  'invoice_reminder', 'photo_progress_ping', 'client_brief_summary'
);

-- Brief inbox
CREATE TYPE brief_entry_kind AS ENUM (
  'photo_ready', 'invoice_sent', 'invoice_paid', 'invoice_overdue',
  'milestone_complete', 'milestone_started', 'file_shared',
  'time_logged', 'message_received', 'project_started',
  'project_completed', 'lead_update', 'system'
);
CREATE TYPE brief_entry_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- =============================================================================
-- Core tables
-- =============================================================================

CREATE TABLE orgs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT NOT NULL,
  subdomain           TEXT NOT NULL UNIQUE,
  default_currency    CHAR(3) NOT NULL DEFAULT 'USD',
  default_timezone    TEXT NOT NULL DEFAULT 'UTC',
  logo_url            TEXT,
  brand_color         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE people (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  name                TEXT NOT NULL,
  password_hash       TEXT,
  role                role NOT NULL,
  department          department,
  status              person_status NOT NULL DEFAULT 'active',
  two_factor_secret   TEXT,
  two_factor_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE(org_id, email)
);
CREATE INDEX people_org_idx ON people(org_id);
CREATE INDEX people_role_idx ON people(role);

CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id       UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  refresh_token   TEXT NOT NULL UNIQUE,
  user_agent      TEXT,
  ip              INET,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_person_idx ON sessions(person_id);

CREATE TABLE invitations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            role NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  invited_by      UUID REFERENCES people(id),
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX invitations_org_idx ON invitations(org_id);
CREATE INDEX invitations_token_idx ON invitations(token);

-- =============================================================================
-- CRM
-- =============================================================================

CREATE TABLE companies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  domain          TEXT,
  industry        TEXT,
  size            TEXT,
  notes           TEXT,
  owner_id        UUID REFERENCES people(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX companies_org_idx ON companies(org_id);

CREATE TABLE contacts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT,
  title               TEXT,
  company_id          UUID REFERENCES companies(id),
  owner_id            UUID REFERENCES people(id),
  status              contact_status NOT NULL DEFAULT 'lead',
  lifecycle           contact_lifecycle NOT NULL DEFAULT 'lead',
  source              TEXT,
  notes               TEXT,
  wallet_address      TEXT,
  lead_score          INTEGER,
  lead_tier           lead_tier,
  scored_at           TIMESTAMPTZ,
  scored_by_draft_id  TEXT,
  routed_at           TIMESTAMPTZ,
  routed_by_draft_id  TEXT,
  last_contacted_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE(org_id, email)
);
CREATE INDEX contacts_org_idx ON contacts(org_id);
CREATE INDEX contacts_company_idx ON contacts(company_id);
CREATE INDEX contacts_owner_idx ON contacts(owner_id);
CREATE INDEX contacts_status_idx ON contacts(status);

CREATE TABLE deals (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  contact_id          UUID REFERENCES contacts(id),
  company_id          UUID REFERENCES companies(id),
  owner_id            UUID REFERENCES people(id),
  stage               deal_stage NOT NULL DEFAULT 'lead',
  amount              BIGINT NOT NULL DEFAULT 0,   -- cents
  currency            CHAR(3) NOT NULL DEFAULT 'USD',
  probability         REAL NOT NULL DEFAULT 0.5,
  expected_close_date DATE,
  status              deal_status NOT NULL DEFAULT 'open',
  position            INTEGER NOT NULL DEFAULT 0,  -- for kanban ordering
  last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX deals_org_stage_idx ON deals(org_id, stage);
CREATE INDEX deals_contact_idx ON deals(contact_id);
CREATE INDEX deals_owner_idx ON deals(owner_id);

CREATE TABLE activities (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id         UUID REFERENCES deals(id) ON DELETE CASCADE,
  person_id       UUID REFERENCES people(id),
  kind            TEXT NOT NULL,    -- 'note' | 'email' | 'call' | 'meeting' | 'task'
  subject         TEXT,
  body            TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX activities_org_idx ON activities(org_id);
CREATE INDEX activities_contact_idx ON activities(contact_id);
CREATE INDEX activities_deal_idx ON activities(deal_id);

-- =============================================================================
-- Projects
-- =============================================================================

CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  client_id       UUID REFERENCES contacts(id),
  owner_id        UUID REFERENCES people(id),
  service         service_kind NOT NULL,
  status          project_status NOT NULL DEFAULT 'scoping',
  value           BIGINT NOT NULL DEFAULT 0,
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  start_date      DATE,
  due_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX projects_org_idx ON projects(org_id);
CREATE INDEX projects_client_idx ON projects(client_id);

CREATE TABLE project_team (
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id       UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, person_id)
);

CREATE TABLE milestones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  due_date        DATE,
  status          milestone_status NOT NULL DEFAULT 'pending',
  completed_at    TIMESTAMPTZ,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX milestones_project_idx ON milestones(project_id);

CREATE TABLE time_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id    UUID REFERENCES milestones(id),
  person_id       UUID NOT NULL REFERENCES people(id),
  description     TEXT,
  hours           REAL NOT NULL,
  billable        BOOLEAN NOT NULL DEFAULT TRUE,
  rate_cents      INTEGER,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX time_entries_org_idx ON time_entries(org_id);
CREATE INDEX time_entries_project_idx ON time_entries(project_id);
CREATE INDEX time_entries_person_idx ON time_entries(person_id);

-- =============================================================================
-- Invoices & payments
-- =============================================================================

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  number          TEXT NOT NULL,
  contact_id      UUID REFERENCES contacts(id),
  project_id      UUID REFERENCES projects(id),
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  subtotal        BIGINT NOT NULL DEFAULT 0,
  tax             BIGINT NOT NULL DEFAULT 0,
  total           BIGINT NOT NULL DEFAULT 0,
  amount_paid     BIGINT NOT NULL DEFAULT 0,
  status          invoice_status NOT NULL DEFAULT 'draft',
  due_date        DATE,
  sent_at         TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  notes           TEXT,
  terms           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE(org_id, number)
);
CREATE INDEX invoices_org_idx ON invoices(org_id);
CREATE INDEX invoices_contact_idx ON invoices(contact_id);
CREATE INDEX invoices_status_idx ON invoices(status);

CREATE TABLE invoice_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  quantity        REAL NOT NULL DEFAULT 1,
  unit_price      BIGINT NOT NULL,    -- cents
  amount          BIGINT NOT NULL,
  position        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX invoice_lines_invoice_idx ON invoice_lines(invoice_id);

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invoice_id      UUID REFERENCES invoices(id),
  contact_id      UUID REFERENCES contacts(id),
  amount          BIGINT NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  method          payment_method NOT NULL,
  -- Stripe
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id         TEXT,
  -- Crypto
  crypto_chain     crypto_chain,
  crypto_token     crypto_token,
  crypto_tx_hash   TEXT,
  crypto_from      TEXT,
  crypto_to        TEXT,
  -- Reference
  reference       TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX payments_org_idx ON payments(org_id);
CREATE INDEX payments_invoice_idx ON payments(invoice_id);
CREATE INDEX payments_stripe_idx ON payments(stripe_payment_intent_id);

-- =============================================================================
-- Tickets
-- =============================================================================

CREATE TABLE tickets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  number          INTEGER NOT NULL,
  subject         TEXT NOT NULL,
  description     TEXT,
  requester_id    UUID REFERENCES people(id),
  contact_id      UUID REFERENCES contacts(id),
  assignee_id     UUID REFERENCES people(id),
  project_id      UUID REFERENCES projects(id),
  priority        ticket_priority NOT NULL DEFAULT 'normal',
  status          ticket_status NOT NULL DEFAULT 'open',
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, number)
);
CREATE INDEX tickets_org_status_idx ON tickets(org_id, status);
CREATE INDEX tickets_requester_idx ON tickets(requester_id);
CREATE INDEX tickets_assignee_idx ON tickets(assignee_id);

CREATE TABLE ticket_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id       UUID REFERENCES people(id),
  body            TEXT NOT NULL,
  is_internal     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ticket_messages_ticket_idx ON ticket_messages(ticket_id);

-- =============================================================================
-- Files
-- =============================================================================

CREATE TABLE files (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  content_type    TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  storage_key     TEXT NOT NULL,
  storage_backend TEXT NOT NULL DEFAULT 'r2',
  status          file_status NOT NULL DEFAULT 'available',
  uploaded_by     UUID REFERENCES people(id),
  contact_id      UUID REFERENCES contacts(id),
  project_id      UUID REFERENCES projects(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX files_org_idx ON files(org_id);
CREATE INDEX files_contact_idx ON files(contact_id);

-- =============================================================================
-- Audit log
-- =============================================================================

CREATE TABLE audit_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES people(id),
  type            audit_event_type NOT NULL,
  subject_type    TEXT,
  subject_id      TEXT,
  payload         JSONB,
  ip              INET,
  user_agent      TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_events_org_occurred_idx ON audit_events(org_id, occurred_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events(actor_id);
CREATE INDEX audit_events_type_idx ON audit_events(type);

-- =============================================================================
-- Notifications
-- =============================================================================

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  person_id       UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind            notification_kind NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  href            TEXT,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX notifications_person_unread_idx ON notifications(person_id, read_at, created_at DESC);

-- =============================================================================
-- Photo pipeline
-- =============================================================================

CREATE TABLE photo_jobs (
  id                      TEXT PRIMARY KEY,
  org_id                  UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  uploaded_by             UUID NOT NULL REFERENCES people(id),
  tenant                  TEXT NOT NULL,
  original_key            TEXT NOT NULL,
  original_url            TEXT NOT NULL,
  filename                TEXT NOT NULL,
  content_type            TEXT NOT NULL,
  size_bytes              INTEGER NOT NULL,
  width                   INTEGER,
  height                  INTEGER,
  requested_variations    JSONB NOT NULL,
  status                  photo_job_status NOT NULL DEFAULT 'queued',
  total_cost_usd          REAL NOT NULL DEFAULT 0,
  caption                 TEXT,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at             TIMESTAMPTZ
);
CREATE INDEX photo_jobs_org_idx ON photo_jobs(org_id);
CREATE INDEX photo_jobs_status_idx ON photo_jobs(status);
CREATE INDEX photo_jobs_created_idx ON photo_jobs(created_at);

CREATE TABLE photo_variations (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL REFERENCES photo_jobs(id) ON DELETE CASCADE,
  kind            photo_variation_kind NOT NULL,
  key             TEXT,
  url             TEXT,
  size_bytes      INTEGER,
  width           INTEGER,
  height          INTEGER,
  cost_usd        REAL,
  duration_ms     INTEGER,
  error           TEXT,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, kind)
);
CREATE INDEX photo_variations_job_idx ON photo_variations(job_id);

-- =============================================================================
-- Operator
-- =============================================================================

CREATE TABLE operator_drafts (
  id                  TEXT PRIMARY KEY,
  org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind                operator_draft_kind NOT NULL,
  channel             operator_draft_channel NOT NULL,
  status              operator_draft_status NOT NULL DEFAULT 'pending',
  subject_type        TEXT NOT NULL,
  subject_id          TEXT NOT NULL,
  assignee_id         UUID NOT NULL REFERENCES people(id),
  approver_id         UUID REFERENCES people(id),
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  context             JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasoning           TEXT NOT NULL,
  model_used          TEXT NOT NULL,
  prompt_tokens       INTEGER NOT NULL DEFAULT 0,
  completion_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd            REAL NOT NULL DEFAULT 0,
  approved_at         TIMESTAMPTZ,
  approved_by         UUID REFERENCES people(id),
  edited_body         TEXT,
  sent_at             TIMESTAMPTZ,
  send_error          TEXT,
  feedback_score      INTEGER,
  feedback_note       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ
);
CREATE INDEX operator_drafts_org_idx ON operator_drafts(org_id);
CREATE INDEX operator_drafts_status_idx ON operator_drafts(status);
CREATE INDEX operator_drafts_assignee_idx ON operator_drafts(assignee_id);
CREATE INDEX operator_drafts_subject_idx ON operator_drafts(subject_type, subject_id);
CREATE INDEX operator_drafts_kind_idx ON operator_drafts(kind);
CREATE INDEX operator_drafts_created_idx ON operator_drafts(created_at);

CREATE TABLE operator_feedback (
  id                TEXT PRIMARY KEY,
  org_id            UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  draft_id          TEXT NOT NULL REFERENCES operator_drafts(id) ON DELETE CASCADE,
  kind              operator_draft_kind NOT NULL,
  decision          TEXT NOT NULL,
  original_body     TEXT NOT NULL,
  final_body        TEXT,
  reason            TEXT,
  prompt_embedding  JSONB,
  decided_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX operator_feedback_org_idx ON operator_feedback(org_id);
CREATE INDEX operator_feedback_kind_idx ON operator_feedback(kind);
CREATE INDEX operator_feedback_decided_idx ON operator_feedback(decided_at);

-- =============================================================================
-- Brief inbox
-- =============================================================================

CREATE TABLE brief_entries (
  id              TEXT PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind            brief_entry_kind NOT NULL,
  priority        brief_entry_priority NOT NULL DEFAULT 'normal',
  subject_type    TEXT NOT NULL,
  subject_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  action_label    TEXT,
  action_href     TEXT,
  day_bucket      TEXT NOT NULL,
  group_id        TEXT,
  read_at         TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX brief_entries_org_idx ON brief_entries(org_id);
CREATE INDEX brief_entries_contact_idx ON brief_entries(contact_id);
CREATE INDEX brief_entries_created_idx ON brief_entries(created_at);
CREATE INDEX brief_entries_day_bucket_idx ON brief_entries(day_bucket);
CREATE INDEX brief_entries_feed_idx ON brief_entries(contact_id, archived_at, created_at);

-- =============================================================================
-- Background jobs
-- =============================================================================

CREATE TABLE jobs (
  id              TEXT PRIMARY KEY,
  org_id          UUID REFERENCES orgs(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'succeeded' | 'failed'
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  error           TEXT,
  result          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX jobs_status_scheduled_idx ON jobs(status, scheduled_at);
CREATE INDEX jobs_org_idx ON jobs(org_id);

-- =============================================================================
-- Updated-at triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to every table that has updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'updated_at' AND table_schema = 'public'
  LOOP
    EXECUTE format('
      CREATE TRIGGER %I_set_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t);
  END LOOP;
END $$;

-- === NAME: 002_rate_limit ===

-- Rate limit hits, scoped by a key (route:userId or route:ip).
-- The sliding-window limiter counts rows in the last N seconds for the
-- given key. Rows older than 1 hour are periodically deleted.

CREATE TABLE rate_limit_hits (
  key         TEXT NOT NULL,
  hit_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX rate_limit_hits_key_idx ON rate_limit_hits(key, hit_at DESC);

-- === NAME: 003_payments_hardening ===

-- Idempotency: a given Stripe PaymentIntent can only result in one
-- payment row, even if Stripe sends the same webhook event multiple
-- times. The unique index makes the constraint a database invariant
-- rather than a race-prone SELECT-then-INSERT in application code.
-- The application still does the SELECT first for cleaner error
-- messages, but the constraint is the source of truth.
--
-- We use a partial unique index because crypto payments don't have
-- a Stripe PI id. NULL values don't conflict in PostgreSQL.
CREATE UNIQUE INDEX payments_stripe_pi_unique
  ON payments(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- The status column already has 'overdue' as a valid value, but
-- nothing in the app ever sets it. The operator's invoice reminder
-- action depends on this. Add an index on (status, due_date) so the
-- cron job that flips sent→overdue is fast.
CREATE INDEX invoices_status_due_date_idx ON invoices(status, due_date)
  WHERE status = 'sent';

-- === NAME: 004_gdpr_and_pci ===

-- GDPR right-to-erasure: people.deleted_at
-- Tracks when a person was soft-deleted via the GDPR endpoint.
-- Combined with status='deactivated', this is the source of truth
-- for "this person exists in the audit log but is anonymized in
-- the application tables."
ALTER TABLE people ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX people_deleted_at_idx ON people(deleted_at) WHERE deleted_at IS NOT NULL;

-- The contacts table already has owner_id. The GDPR endpoint
-- nulls the owner_id on the contact when its owner is deleted.
-- This is the cascade. The contact itself is not deleted (the
-- contact is its own data subject).
-- No schema change needed; the existing FK to people(id) becomes
-- a soft reference after the null.

-- === NAME: 005_operator_actions ===

-- The 5 missing actions (lead_reengagement, project_kickoff,
-- ticket_acknowledgement, project_closeout, weekly_client_digest)
-- are added to the operator_draft_kind enum. Postgres requires
-- ALTER TYPE ... ADD VALUE for each. New values must be committed
-- before they can be used in the same transaction.

ALTER TYPE operator_draft_kind ADD VALUE IF NOT EXISTS 'lead_reengagement';
ALTER TYPE operator_draft_kind ADD VALUE IF NOT EXISTS 'project_kickoff';
ALTER TYPE operator_draft_kind ADD VALUE IF NOT EXISTS 'ticket_acknowledgement';
ALTER TYPE operator_draft_kind ADD VALUE IF NOT EXISTS 'project_closeout';
ALTER TYPE operator_draft_kind ADD VALUE IF NOT EXISTS 'weekly_client_digest';

-- === NAME: 006_lead_forms ===

-- The lead forms service: when a public form on a customer's
-- landing page submits, we record the submission here with the
-- formId as the dedup key. The contact row is the source of truth;
-- this table is the submission log.
CREATE TABLE lead_form_submissions (
  id              TEXT PRIMARY KEY,                                  -- lfs_<uuid>
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  form_id         TEXT NOT NULL,                                    -- client-generated
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  payload         JSONB NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, form_id)                                            -- dedup key
);
CREATE INDEX lead_form_submissions_org_idx ON lead_form_submissions(org_id, received_at DESC);
CREATE INDEX lead_form_submissions_contact_idx ON lead_form_submissions(contact_id);
