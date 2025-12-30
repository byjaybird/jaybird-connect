-- Daily Smart Journal Packet support
-- Creates tables for business day tracking, uploads, mappings, packet snapshots, and derived aggregates.

CREATE TABLE IF NOT EXISTS business_days (
    business_date date PRIMARY KEY,
    status text NOT NULL DEFAULT 'open',
    has_sales boolean DEFAULT false,
    has_tax boolean DEFAULT false,
    has_tips boolean DEFAULT false,
    has_giftcards boolean DEFAULT false,
    has_fees boolean DEFAULT false,
    source_window text,
    locked_at timestamptz,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_packets (
    business_date date PRIMARY KEY REFERENCES business_days(business_date),
    status text NOT NULL,
    packet jsonb NOT NULL,
    warnings jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_uploads (
    id bigserial PRIMARY KEY,
    upload_type text NOT NULL,
    business_date date NOT NULL,
    source_filename text,
    file_sha256 text,
    raw_text text,
    parsed_json jsonb,
    warnings jsonb,
    row_count integer,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_uploads_date_type ON journal_uploads (business_date, upload_type);

CREATE TABLE IF NOT EXISTS sales_category_mappings (
    mapping_id serial PRIMARY KEY,
    source_category text UNIQUE,
    mapped_category text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_item_category_overrides (
    override_id serial PRIMARY KEY,
    item_id integer NOT NULL REFERENCES items(item_id),
    mapped_category text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (item_id)
);

CREATE TABLE IF NOT EXISTS sales_category_summary (
    id bigserial PRIMARY KEY,
    business_date date NOT NULL,
    category text NOT NULL,
    gross_sales numeric(12,2),
    discounts numeric(12,2),
    net_sales numeric(12,2),
    tax numeric(12,2),
    tips numeric(12,2),
    giftcard_redemptions numeric(12,2),
    auto_gratuity numeric(12,2),
    refunds numeric(12,2),
    voids numeric(12,2),
    data_source text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (business_date, category)
);

CREATE TABLE IF NOT EXISTS cogs_estimates (
    id bigserial PRIMARY KEY,
    business_date date NOT NULL,
    category text NOT NULL,
    estimated_cogs numeric(12,2),
    source text,
    calc_method text,
    issues jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (business_date, category)
);

CREATE TABLE IF NOT EXISTS liabilities_daily (
    id bigserial PRIMARY KEY,
    business_date date UNIQUE NOT NULL,
    tips_incurred numeric(12,2),
    tips_paid numeric(12,2),
    auto_grat_incurred numeric(12,2),
    tax_collected numeric(12,2),
    giftcard_sold numeric(12,2),
    giftcard_redeemed numeric(12,2),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deposits_expected (
    id bigserial PRIMARY KEY,
    business_date date NOT NULL,
    tender text NOT NULL,
    gross numeric(12,2),
    less_tips numeric(12,2),
    less_tax numeric(12,2),
    less_giftcard_liab numeric(12,2),
    fees numeric(12,2),
    expected_net_deposit numeric(12,2),
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (business_date, tender)
);

CREATE TABLE IF NOT EXISTS processing_fees_detail (
    id bigserial PRIMARY KEY,
    business_date date NOT NULL,
    provider text,
    amount numeric(12,2),
    basis text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_processing_fees_detail_date ON processing_fees_detail (business_date);

CREATE TABLE IF NOT EXISTS journal_warnings (
    id bigserial PRIMARY KEY,
    business_date date NOT NULL,
    code text NOT NULL,
    severity text NOT NULL DEFAULT 'warn',
    message text,
    context jsonb,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_warnings_date ON journal_warnings (business_date);
