# Daily Journal Packet – Design

Design for generating a cash-basis daily “smart journal packet” that Jaybird Connect users can key into Xero to see revenue, COGS, gross margin, liabilities (tips/tax/gift cards), and expected deposits by business day.

## Data model additions
- `business_days (business_date pk)`: status (`open|locked`), completeness flags (`has_sales`, `has_tax`, `has_tips`, `has_giftcards`, `has_fees`), source window (Toast cutoff), `locked_at`, `notes`.
- `sales_category_summary`: `business_date`, `category (enum food|liquor|beer|wine|misc)`, `gross_sales`, `discounts`, `net_sales`, `tax`, `tips`, `giftcard_redemptions`, `auto_gratuity`, `refunds`, `voids`, `data_source`.
- `cogs_estimates`: `business_date`, `category`, `estimated_cogs`, `source (theoretical|trueup_pending)`, `calc_method`, `issues jsonb`.
- `liabilities_daily`: `business_date`, `tips_incurred`, `tips_paid (for payout next day)`, `auto_grat_incurred`, `tax_collected`, `giftcard_sold`, `giftcard_redeemed`.
- `deposits_expected`: `business_date`, `tender (card|cash|other)`, `gross`, `less_tips`, `less_tax`, `less_giftcard_liab`, `fees`, `expected_net_deposit`, `notes`.
- `processing_fees_detail` (optional feed): `business_date`, `provider`, `amount`, `basis (per_day|per_batch)`.
- `journal_warnings`: `business_date`, `code`, `severity (error|warn|info)`, `message`, `context jsonb`.
- Keep existing `sales_daily_lines` as raw facts; add `sales_item_category_map` (or reuse current mappings) to coerce to Food/Liquor/Beer/Wine with `misc` fallback and `unmapped_count` warning.

### Mapping rules
- Enforce top-level enum: Food, Liquor, Beer, Wine, Misc.
- Allow configurable mapping for Toast sales categories and for specific items (overrides category).
- When unmapped, drop into Misc and emit `warn_unmapped_category` with counts and dollars.

## Derived aggregates
- Build per-day aggregates from `sales_daily_lines` joined to category mapping:
  - `gross_sales`, `discounts/refunds/voids`, `net_sales`.
  - Gift card redemption: reduce liability, increase category sales.
  - Tax and tip totals (from dedicated CSVs).
  - Expected deposits: `net_sales - tips - tax - giftcard_sold + giftcard_redeemed - fees` per tender.
- COGS estimate: sum `qty_sold * recipe cost` per item using `resolve_item_cost`; roll up to category; mark source `theoretical`.

## Journal packet structure (human readable, not posted)
- Header: business_date, lock status, completeness flags, warning summary.
- Revenue (credits): Food/Liquor/Beer/Wine net sales; Gift card redemption allocated into revenue; Misc shown with warning.
- COGS (debits): Food/Liquor/Beer/Wine estimated COGS.
- Gross margin: subtotal only (no posting line).
- Liabilities:
  - Tips/auto-grat: credit liability for incurred; debit liability when paid next day (informational if paid in cash).
  - Sales tax: credit tax payable.
  - Gift cards: credit for sold, debit for redeemed.
- Fees: debit processing fees (if available) or present as pending.
- Expected deposit: net of tips/tax/gift cards/fees per tender, plus total.
- Notes/warnings: missing files, unmapped categories, missing gift card feed, negative days (refund-heavy), inventory true-up pending.

### Sample JSON payload
```json
{
  "business_date": "2024-05-10",
  "status": "locked",
  "completeness": { "sales": true, "tax": true, "tips": true, "giftcards": false, "fees": false },
  "warnings": [
    { "code": "warn_missing_giftcard_feed", "message": "Gift card sales not uploaded; liability may be understated." }
  ],
  "revenue": [
    { "category": "food", "net_sales": 8200.50 },
    { "category": "liquor", "net_sales": 4100.75 },
    { "category": "beer", "net_sales": 950.00 },
    { "category": "wine", "net_sales": 600.00 }
  ],
  "cogs": [
    { "category": "food", "estimated_cogs": 2750.12, "source": "theoretical" },
    { "category": "liquor", "estimated_cogs": 1100.22, "source": "theoretical" }
  ],
  "gross_margin": { "net_sales": 13851.25, "cogs": 3850.34, "margin": 10000.91 },
  "liabilities": {
    "tips_incurred": 1800.00,
    "tips_paid": 1800.00,
    "auto_grat": 220.00,
    "tax_collected": 1050.00,
    "giftcard_sold": 300.00,
    "giftcard_redeemed": 250.00
  },
  "fees": { "processing_fees": 210.35, "source": "square_daily" },
  "expected_deposits": [
    { "tender": "card", "expected": 10840.90 },
    { "tender": "cash", "expected": 960.00 }
  ],
  "journal_lines_ready_for_xero": [
    { "account": "Food Sales", "type": "credit", "amount": 8200.50 },
    { "account": "Food COGS", "type": "debit", "amount": 2750.12 },
    { "account": "Tips Payable", "type": "credit", "amount": 2020.00 },
    { "account": "Sales Tax Payable", "type": "credit", "amount": 1050.00 },
    { "account": "Gift Card Liability", "type": "credit", "amount": 300.00 },
    { "account": "Gift Card Liability", "type": "debit", "amount": 250.00 },
    { "account": "Processing Fees", "type": "debit", "amount": 210.35 }
  ]
}
```

## Validation rules
- Blocking (prevent lock): missing required sales CSV; missing tax or tip summary; business_date mismatch; corrupted CSV (headers missing); duplicate upload for same file hash without override; COGS calc failure rate > threshold (e.g., >10% of sales dollars with missing costs).
- Warnings (allow lock with note): unmapped categories (fallback to Misc); missing gift card feed; missing processing fees feed; refunds/voids cause negative net in category; mixed tax rates not split; inventory true-up pending; late uploads after lock.
- Reconciliation checks: sum(product mix) == revenue summary within tolerance; net_sales + discounts == gross_sales; tips + tax + gift card + net_sales matches expected deposit by tender; sales_daily_lines row counts match upload counts.

## Edge cases
- All-refund/negative day (still produce packet with negative revenue and margin).
- Tax-exempt day (tax liability zero, flagged informationally).
- Partial gift card data (sales only or redemption only) with warnings.
- Auto-grat as tips payable; service charge treated as income line (not a liability).
- Late upload after lock triggers `warn_needs_regeneration`.

## Implementation outline
- API: add `/api/journal/daily` GET to fetch packet (compute or read cached); `/api/journal/lock` POST to lock day and persist packet + warnings; `/api/journal/validate` to preview issues.
- Services:
  - Aggregator: reads sales_daily_lines + mapping to build category summary and deposits.
  - COGS estimator: uses resolve_item_cost; caches per item per day; reports missing cost issues.
  - Validation engine: produces blocking/warning lists and completeness flags.
  - Packet formatter: renders JSON plus human-readable text for Xero entry.
- Persistence: store packet snapshot per day for audit; recompute on unlock/upload and refresh snapshot.
- UI hooks (later): show completeness, warnings, expected deposit, and journal lines ready for manual entry.
