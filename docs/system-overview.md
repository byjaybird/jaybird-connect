# Jaybird Connect – Data Structure and System Overview

This document serves as a living, centralized explanation of how data is structured, interconnected, and consumed in the Jaybird Connect project. This information is designed to provide deep context to any future contributor or assistant and will include space for release notes appended over time.

---

## CORE DATABASE STRUCTURE

The backend is built with **Flask** and uses a **PostgreSQL** database. It is designed to track food cost, recipes, ingredients, and menu items for a restaurant setting. Here's how the data is organized:

### ITEMS TABLE

* Represents any discrete product or prep.
* Fields:

  * `item_id`: Primary key
  * `name`: Name of the item
  * `category`: Used for organizing items
  * `is_prep`: TRUE if this is a prep recipe used in other recipes
  * `is_for_sale`: TRUE if this is a menu item sold to customers
  * `price`: Selling price if `is_for_sale` is TRUE
  * `description`: Display description for menus
  * `process_notes`: Internal notes or SOPs for prep
  * `is_archived`: If TRUE, item is hidden from menus and editing UIs
  * `yield_qty`, `yield_unit`: Only relevant if `is_prep = TRUE`. Specifies how much the prep yields (e.g. 1 quart, 12 each)

### INGREDIENTS TABLE

* Represents basic inventory items (e.g., flour, cheese, chicken).
* Fields:

  * `ingredient_id`: Primary key
  * `name`, `category`, `unit`, `notes`, `is_archived`

### RECIPES TABLE

* Connects an `item_id` to its components. Components can be either ingredients or prep items.
* Fields:

  * `item_id`: FK to `items`
  * `source_type`: 'ingredient' or 'item'
  * `source_id`: FK to either `ingredients` or `items`, depending on `source_type`
  * `quantity`: How much is used
  * `unit`: Unit used in the recipe (e.g., oz, cup)
  * `instructions`: Optional prep-specific instruction

This model allows **recursive nesting of items** — prep items can contain other prep items, forming a tree.

### PRICE\_QUOTES TABLE

* Contains pricing data (often pulled manually from invoices).
* Fields:

  * `ingredient_id`: FK to `ingredients`
  * `source`: e.g., Sysco, US Foods
  * `size`: Human-readable size descriptor (e.g., 5 lb bag)
  * `price`: Numeric
  * `date_found`: Timestamp
  * `is_purchase`: Indicates if this is an actual purchase or just a quote

### INGREDIENT\_CONVERSIONS TABLE

* Resolves conversions between purchased sizes and recipe usage.
* Fields:

  * `ingredient_id`: FK to `ingredients`
  * `from_unit`: e.g., "lb"
  * `to_unit`: e.g., "oz"
  * `conversion_factor`: e.g., 16

This enables the backend to compute cost per recipe unit even when prices are logged using different units.

## COST RESOLUTION

Cost resolution for a given `source_type`, `source_id`, `unit`, and `quantity` happens through the `resolve_item_cost()` or `resolve_ingredient_cost()` utilities in the backend. These functions:

* Look up the most recent price quote
* Convert the price into the recipe unit using the `ingredient_conversions` table (if needed)
* Multiply by quantity
* Return a structured response like `{ status: 'ok', total_cost: 0.87 }` or `{ status: 'error', missing: { from_unit, to_unit }, message }`

CostCell in the frontend displays the results and shows a ⚠️ warning icon if a conversion or price is missing.

## FRONTEND LOGIC

* Ingredients and Prep Items are selected using `<select>` menus.
* Each dropdown is populated using two fetch calls:

  * `GET /ingredients` (filtered for `!is_archived`)
  * `GET /items` (filtered for `is_prep && !is_archived`)
* Entries are formatted as `source_type:source_id` (e.g. `ingredient:12`, `item:99`).
* When creating or editing an item, the UI tracks each ingredient/prep added to a recipe.
* The app supports both creating **new ingredients** (with name only) and selecting existing ones.
* The Edit and New Item forms both now support **filtering/search** for ingredients.

## SPECIAL CASES

* `CostCell` can return invalid data (non-JSON or HTML) if the backend API is misconfigured.
* `FixData` allows user to input missing conversion info directly into the UI.
* Duplicate recipe entries are prevented using a `Set` check on `${source_type}:${source_id}`.

## APPENDIX: URL ROUTES (SELECTED)

* `GET /api/items`, `POST /api/items/new`, `PUT /api/items/:id`, `DELETE /api/recipes/:id`
* `GET /api/ingredients`, `POST /api/ingredients`
* `GET /api/ingredient_cost/:id`, `GET /api/item_cost/:id`
* `POST /api/ingredient_conversions`

## RELEASE NOTES

* **2025-06-04:** Added ingredient filtering to EditItem and NewItem pages. Improved `CostCell` diagnostics for non-JSON API responses. Confirmed recursive prep item nesting is stable.
* **2025-06-04:** Expanded documentation on how `source_type` and `source_id` work together to allow flexible sourcing of ingredients from either purchased inventory or in-house prep items:

  * Each line in the `recipes` table defines one component of a dish. That component is either a raw ingredient (e.g., flour) or another item (e.g., chili, cheese sauce, grilled chicken).
  * This is specified via the `source_type` field — either `'ingredient'` or `'item'` — and paired with a `source_id` from the corresponding table.
  * Example: a burger might include `ingredient:5` (lettuce), `item:12` (house chili), and `item:27` (cheese sauce).
  * The system uses this distinction to calculate costs and build prep dependencies. If the source is an `ingredient`, the system looks for price quotes and conversions. If the source is an `item`, it recursively resolves its ingredients and costs.
  * In the frontend, dropdowns are built with `<optgroup>` sections to visually separate raw ingredients (🧂) and prep items (🛠️), and the selected value is saved as a joined string `source_type:source_id`.
  * This logic underpins the ability to calculate total cost, detect missing data, and allow prep items to be nested arbitrarily deep.
