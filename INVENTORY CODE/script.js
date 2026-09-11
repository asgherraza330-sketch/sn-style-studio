// ===========================================================
// SN Style Studio - Shared Application Script
// This single file powers dashboard.html, inventory.html,
// add-product.html, categories.html, AND reports.html. Product
// data lives in localStorage under STORAGE_KEY, so any add/edit/
// delete/import/restore/reset on any page is immediately reflected
// everywhere else the next time that page loads.
//
// Structure:
//   1. Shared state & data helpers   (used by all pages)
//   2. Shared UI helpers             (used by all pages)
//   3. Inventory page logic          (only runs if inventory DOM exists)
//      3.1 CSV bulk import           (part of Inventory page logic)
//   4. Dashboard page logic          (only runs if dashboard DOM exists)
//      4.1 Backup / Restore / Reset Demo Data (part of Dashboard logic)
//   5. Add Product page logic        (only runs if add-product DOM exists)
//   5.5 Categories page logic        (only runs if categories DOM exists)
//   5.6 Reports page logic           (only runs if reports DOM exists)
//   6. Init                          (detects which page we're on)
// ===========================================================

const STORAGE_KEY = "sn_style_studio_inventory";
const LAST_UPDATED_KEY = STORAGE_KEY + "_lastUpdated";
const NOTE_PRESETS = ["New Arrival", "Bestseller", "Reorder Soon", "Damaged", "Photos Needed", "Clearance", "Limited Stock"];
const CATEGORY_LIST = ["Dress", "Suit", "Lawn", "Khussa", "Jewelry", "Accessories", "Other"];

// Default starting products (used the very first time the page loads,
// AND reused by "Reset Demo Data" whenever the admin wants to start over).
const defaultProducts = [
  { id: "SN001", name: "Afrozeh - Rawayaat Dress", category: "Dress", size: "M", color: "Red", costPrice: 220.00, price: 320.00, qty: 0, dateAdded: "2026-06-01", image: "", note: "Reorder Soon", description: "" },
  { id: "SN002", name: "Afrozeh - Samarqand Dress", category: "Dress", size: "S", color: "Blue", costPrice: 100.00, price: 150.00, qty: 5, dateAdded: "2026-06-02", image: "", note: "New Arrival", description: "" },
  { id: "SN003", name: "Afrozeh - Zareenah Dress", category: "Dress", size: "L", color: "Green", costPrice: 230.00, price: 336.00, qty: 0, dateAdded: "2026-06-03", image: "", note: "Damaged", description: "" },
  { id: "SN004", name: "Afrozeh - Zaviyah Luxury Dress", category: "Dress", size: "M", color: "Maroon", costPrice: 170.00, price: 252.00, qty: 3, dateAdded: "2026-06-04", image: "", note: "", description: "" },
  { id: "SN005", name: "Asim Jofa - Bekhudi Dress", category: "Dress", size: "S", color: "Black", costPrice: 70.00, price: 105.00, qty: 8, dateAdded: "2026-06-05", image: "", note: "Bestseller", description: "" },
  { id: "SN006", name: "Asim Jofa - Black Printed Suit", category: "Suit", size: "M", color: "Black", costPrice: 25.00, price: 38.50, qty: 12, dateAdded: "2026-06-06", image: "", note: "", description: "" },
  { id: "SN007", name: "Asim Jofa - Blue Printed Lawn", category: "Lawn", size: "L", color: "Blue", costPrice: 25.00, price: 38.50, qty: 6, dateAdded: "2026-06-07", image: "", note: "", description: "" },
  { id: "SN008", name: "Asim Jofa - Chiffon Dress", category: "Dress", size: "M", color: "Pink", costPrice: 68.00, price: 105.00, qty: 4, dateAdded: "2026-06-08", image: "", note: "Photos Needed", description: "" },
  { id: "SN009", name: "Asim Jofa - Embroidered Suit", category: "Suit", size: "S", color: "Beige", costPrice: 35.00, price: 55.00, qty: 10, dateAdded: "2026-06-09", image: "", note: "", description: "" },
  { id: "SN010", name: "Asim Jofa - Luxury Suit", category: "Suit", size: "M", color: "Gold", costPrice: 75.00, price: 112.00, qty: 2, dateAdded: "2026-06-10", image: "", note: "Reorder Soon", description: "" }
];

// ---------- 1. Persistence: load from / save to local storage ----------
function loadProducts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // fall through to defaults if storage is corrupted
    }
  }
  return JSON.parse(JSON.stringify(defaultProducts));
}

// Saves the product list AND stamps the "last updated" time, so the
// Dashboard's "Last updated" text always reflects the most recent
// add / edit / delete / import / restore / reset, no matter which
// page performed it.
function saveProducts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  localStorage.setItem(LAST_UPDATED_KEY, new Date().toISOString());
}

// The single in-memory source of truth for whichever page is currently loaded.
// Every page calls loadProducts() fresh on load, so no page can ever show
// stale data left over from another page.
let products = loadProducts();

// ---------- Placeholder image generator (used only when no image is set) ----------
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function placeholderImage(name) {
  const initials = name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const colors = ["#C9A24B", "#B38F3C", "#3B2F26", "#8A7B6C", "#D9C8AC"];
  const hex = colors[Math.abs(hashCode(name)) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${hex}"/><text x="50" y="58" font-family="Georgia, serif" font-size="34" fill="#FAF3EA" text-anchor="middle">${initials}</text></svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

// ---------- Stock status logic (shared math used by every page) ----------
function getStockStatus(qty) {
  if (qty <= 0) return "Out of Stock";
  if (qty <= 5) return "Low Stock";
  return "In Stock";
}

function getStockStatusClass(status) {
  if (status === "In Stock") return "status-in-stock";
  if (status === "Low Stock") return "status-low-stock";
  return "status-out-stock";
}

// Reads a product's cost price safely, falling back to selling price
// for any older saved data that predates the costPrice field.
function getCostPrice(p) {
  return typeof p.costPrice === "number" && !isNaN(p.costPrice) ? p.costPrice : p.price;
}

// ---------- Duplicate SKU / Product ID check ----------
// Used by the Add Product page, the Inventory Edit modal, and the CSV
// import validator. Comparison is trimmed and case-insensitive, so
// "SN001" and "sn001" are correctly treated as the same SKU. Pass
// excludeIndex when editing an existing product so it doesn't flag
// itself as a duplicate of its own unchanged ID.
function isDuplicateSku(id, excludeIndex = -1) {
  const normalized = id.trim().toLowerCase();
  return products.some((p, idx) => idx !== excludeIndex && p.id.trim().toLowerCase() === normalized);
}

// Shared inventory totals — the Inventory stat cards, the Dashboard
// summary cards, and the Reports summary cards all derive their
// numbers from this one function, so the pages can never disagree
// about what the totals are.
function computeInventoryTotals(list) {
  const costValue = list.reduce((sum, p) => sum + getCostPrice(p) * p.qty, 0);
  const retailValue = list.reduce((sum, p) => sum + p.price * p.qty, 0);
  return {
    totalProducts: list.length,
    costValue,
    retailValue,
    inStock: list.filter(p => getStockStatus(p.qty) === "In Stock").length,
    lowStock: list.filter(p => getStockStatus(p.qty) === "Low Stock").length,
    outOfStock: list.filter(p => getStockStatus(p.qty) === "Out of Stock").length
  };
}

// Category-level totals, computed from the SAME product list every other
// page uses, so numbers always match Inventory/Dashboard/Reports exactly.
// Accepts any list, so Reports can pass a filtered subset when its own
// filters are active.
function computeCategoryStats(list) {
  return CATEGORY_LIST.map(category => {
    const items = list.filter(p => p.category === category);
    const totalQty = items.reduce((sum, p) => sum + p.qty, 0);
    const totalCostValue = items.reduce((sum, p) => sum + getCostPrice(p) * p.qty, 0);
    const totalRetailValue = items.reduce((sum, p) => sum + p.price * p.qty, 0);
    const lowStock = items.filter(p => getStockStatus(p.qty) === "Low Stock").length;
    const outOfStock = items.filter(p => getStockStatus(p.qty) === "Out of Stock").length;
    return {
      category,
      totalProducts: items.length,
      totalQty,
      totalCostValue,
      totalRetailValue,
      lowStock,
      outOfStock
    };
  });
}

// ---------- Shared CSV export (used by Inventory's/Dashboard's/Reports' Export buttons) ----------
function buildInventoryCSV(list) {
  const headers = ["Product ID", "Product Name", "Category", "Size", "Color", "Cost Price", "Selling Price", "Quantity", "Total Value", "Stock Status", "Notes", "Description", "Date Added"];
  const rows = list.map(p => [
    p.id,
    `"${p.name.replace(/"/g, '""')}"`,
    p.category,
    p.size,
    p.color,
    getCostPrice(p).toFixed(2),
    p.price.toFixed(2),
    p.qty,
    (p.price * p.qty).toFixed(2),
    getStockStatus(p.qty),
    `"${(p.note || "").replace(/"/g, '""')}"`,
    `"${(p.description || "").replace(/"/g, '""')}"`,
    p.dateAdded
  ]);
  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

function downloadInventoryCSV(list) {
  const csvContent = buildInventoryCSV(list);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `SN-Style-Studio-Inventory-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Same as downloadInventoryCSV, but with a custom filename label — used
// by the Reports page's "Export Low Stock CSV" / "Export Out of Stock
// CSV" buttons so each download is clearly named instead of reusing the
// generic "Inventory" filename.
function downloadNamedCSV(list, labelSlug) {
  const csvContent = buildInventoryCSV(list);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `SN-Style-Studio-${labelSlug}-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------- Sample CSV Template (for bulk import) ----------
// Column order matches exactly what the CSV importer expects, so a
// person can download this, fill it in, and re-upload it without any
// column-mapping guesswork.
function buildSampleCSVTemplate() {
  const headers = ["SKU", "Product Name", "Category", "Size", "Color", "Cost Price", "Selling Price", "Quantity", "Date Added", "Notes", "Description", "Image URL"];
  const sampleRows = [
    ["SN101", "Sana Safinaz - Embroidered Lawn", "Lawn", "M", "Turquoise", "40.00", "62.00", "10", "2026-08-01", "New Arrival", "3-piece lawn suit with embroidered dupatta", ""],
    ["SN102", "Khaadi - Printed Suit", "Suit", "L", "Mustard", "30.00", "48.00", "0", "2026-08-02", "Reorder Soon", "", ""]
  ];
  const escapeField = (field) => {
    const str = String(field);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const rows = [headers, ...sampleRows].map(r => r.map(escapeField).join(","));
  return rows.join("\n");
}

function downloadSampleCSVTemplate() {
  const csvContent = buildSampleCSVTemplate();
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "SN-Style-Studio-Import-Template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------- CSV parsing (for bulk import) ----------
// A small hand-written CSV parser (RFC 4180-style): handles quoted
// fields, embedded commas, embedded newlines inside quotes, and
// doubled "" escaped quotes — enough to read files exported from
// Excel, Google Sheets, or Numbers.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const str = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (inQuotes) {
      if (char === '"') {
        if (str[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Push the last field/row for files that don't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully blank trailing lines (common at the end of exported files).
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ""));
}

// Matches a CSV header row against a list of accepted column-name
// aliases (case-insensitive, trimmed), so a template exported from
// Excel with slightly different header wording ("Price" instead of
// "Selling Price", for example) still maps to the right field.
function findColumnIndex(headers, aliases) {
  const normalizedHeaders = headers.map(h => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalizedHeaders.indexOf(alias.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

// Validates one parsed CSV row against the required import rules:
// missing SKU, duplicate SKU (against existing inventory AND against
// the rest of the current file), missing Product Name, missing
// Category, invalid Cost Price, invalid Selling Price, invalid
// Quantity. Returns an array of human-readable error messages — an
// empty array means the row is valid and ready to import.
function validateImportRow(productData, existingSkuSet, seenSkusInBatch) {
  const errors = [];
  const normalizedSku = productData.id.trim().toLowerCase();

  if (!productData.id.trim()) {
    errors.push("Missing SKU");
  } else if (existingSkuSet.has(normalizedSku)) {
    errors.push("Duplicate SKU (already in inventory)");
  } else if (seenSkusInBatch.has(normalizedSku)) {
    errors.push("Duplicate SKU (repeated in file)");
  }

  if (!productData.name.trim()) errors.push("Missing Product Name");
  if (!productData.category.trim()) errors.push("Missing Category");
  if (isNaN(productData.costPrice) || productData.costPrice < 0) errors.push("Invalid Cost Price");
  if (isNaN(productData.price) || productData.price < 0) errors.push("Invalid Selling Price");
  if (isNaN(productData.qty) || productData.qty < 0 || !Number.isInteger(productData.qty)) errors.push("Invalid Quantity");

  return errors;
}

// ---------- 2. Shared UI helpers ----------
function setHeaderDate() {
  const headerDateEl = document.getElementById("headerDate");
  if (headerDateEl) {
    headerDateEl.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  }
}

// Marks the current page's link as active in the shared nav bar.
// Reads data-page off <body> (set in each HTML file) and matches it
// against each nav link's data-page attribute.
function highlightActiveNavLink() {
  const currentPage = document.body.dataset.page;
  document.querySelectorAll(".nav-link[data-page]").forEach(link => {
    link.classList.toggle("nav-link-active", link.dataset.page === currentPage);
  });
}

function productThumb(p) {
  return p.image && p.image.trim() ? p.image : placeholderImage(p.name);
}

// Formats the LAST_UPDATED_KEY timestamp into something like:
// "Last updated: August 5, 2026, 9:00 AM"
function getLastUpdatedText() {
  const raw = localStorage.getItem(LAST_UPDATED_KEY);
  if (!raw) return "Last updated: —";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return "Last updated: —";
  const formatted = date.toLocaleString(undefined, {
    month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
  });
  return `Last updated: ${formatted}`;
}

// Generic toast helper — shared so add-product.html and reports.html
// (which have no inventory/dashboard DOM around them) can show a
// success message too.
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2500);
}

// Generic image-preview + note-preset wiring shared by the Inventory
// Edit modal and the standalone Add Product page, so both behave
// identically without duplicating the same event-handling code twice.
function wireImageAndNoteControls({ previewBox, fileInput, urlInput, notePresetSelect, noteCustomInput, getImageData, setImageData }) {
  function setImagePreview(src) {
    if (src && src.trim()) {
      previewBox.innerHTML = `<img src="${src}" alt="Preview">`;
    } else {
      previewBox.innerHTML = `<span>No Image</span>`;
    }
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageData(reader.result);
      setImagePreview(reader.result);
      urlInput.value = "";
    };
    reader.readAsDataURL(file);
  });

  urlInput.addEventListener("input", () => {
    const url = urlInput.value.trim();
    setImageData(url);
    setImagePreview(url);
    if (url) fileInput.value = "";
  });

  notePresetSelect.addEventListener("change", () => {
    const val = notePresetSelect.value;
    if (val === "custom") {
      noteCustomInput.hidden = false;
      noteCustomInput.value = "";
      noteCustomInput.focus();
    } else if (val === "") {
      noteCustomInput.hidden = true;
      noteCustomInput.value = "";
    } else {
      noteCustomInput.hidden = true;
      noteCustomInput.value = val;
    }
  });

  return { setImagePreview };
}

// ===========================================================
// 3. INVENTORY PAGE LOGIC
// Everything in this block only runs if the inventory table exists
// on the current page, so it's completely inert elsewhere.
// ===========================================================
function initInventoryPage() {
  const tableBody = document.getElementById("inventoryTableBody");
  const noResults = document.getElementById("noResults");
  const totalProductsEl = document.getElementById("totalProducts");
  const visibleCountEl = document.getElementById("visibleCount");
  const searchInput = document.getElementById("searchInput");
  const filterStatus = document.getElementById("filterStatus");
  const filterSize = document.getElementById("filterSize");
  const filterCategory = document.getElementById("filterCategory");
  const exportBtn = document.getElementById("exportBtn");

  const statTotalProducts = document.getElementById("statTotalProducts");
  const statTotalValue = document.getElementById("statTotalValue");
  const statInStock = document.getElementById("statInStock");
  const statLowStock = document.getElementById("statLowStock");
  const statOutStock = document.getElementById("statOutStock");

  const productModal = document.getElementById("productModal");
  const productForm = document.getElementById("productForm");
  const formError = document.getElementById("formError");
  const cancelBtn = document.getElementById("cancelBtn");

  const productNotePreset = document.getElementById("productNotePreset");
  const productNoteCustom = document.getElementById("productNoteCustom");
  const productDescription = document.getElementById("productDescription");

  const imagePreviewBox = document.getElementById("imagePreviewBox");
  const productImageFile = document.getElementById("productImageFile");
  const productImageUrl = document.getElementById("productImage");

  const deleteModal = document.getElementById("deleteModal");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

  let editIndex = null;   // index of product currently being edited
  let deleteIndex = null; // index of product pending deletion
  let sortKey = null;
  let sortDir = "asc";
  let currentImageData = ""; // holds the base64 or URL for the image currently in the form

  // ---------- Dashboard-style stat cards on the Inventory page ----------
  function renderStats() {
    const totals = computeInventoryTotals(products);
    statTotalProducts.textContent = totals.totalProducts;
    statTotalValue.textContent = `$${totals.retailValue.toFixed(2)}`;
    statInStock.textContent = totals.inStock;
    statLowStock.textContent = totals.lowStock;
    statOutStock.textContent = totals.outOfStock;
  }

  // ---------- Sorting ----------
  function applySort(list) {
    if (!sortKey) return list;

    const sorted = [...list].sort((a, b) => {
      let valA, valB;

      if (sortKey === "total") {
        valA = a.price * a.qty;
        valB = b.price * b.qty;
      } else {
        valA = a[sortKey];
        valB = b[sortKey];
      }

      if (typeof valA === "string") {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }

  function updateSortHeaders() {
    document.querySelectorAll("th[data-sort]").forEach(th => {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.sort === sortKey) {
        th.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
      }
    });
  }

  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = "asc";
      }
      renderTable();
    });
  });

  // ---------- Render ----------
  function renderTable() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    const statusFilterVal = filterStatus.value;
    const sizeFilterVal = filterSize.value;
    const categoryFilterVal = filterCategory.value;

    updateCategoryOptions();
    renderStats();

    let filtered = products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm);
      const status = getStockStatus(p.qty);
      const matchesStatus = statusFilterVal === "all" || status === statusFilterVal;
      const matchesSize = sizeFilterVal === "all" || String(p.size) === sizeFilterVal;
      const matchesCategory = categoryFilterVal === "all" || p.category === categoryFilterVal;
      return matchesSearch && matchesStatus && matchesSize && matchesCategory;
    });

    filtered = applySort(filtered);
    updateSortHeaders();

    tableBody.innerHTML = "";
    noResults.hidden = filtered.length !== 0;

    filtered.forEach(p => {
      const realIndex = products.indexOf(p);
      const totalValue = (p.price * p.qty).toFixed(2);
      const status = getStockStatus(p.qty);
      const statusClass = getStockStatusClass(status);
      const qtyClass = status === "Low Stock" ? "qty-low" : "";
      const imgSrc = productThumb(p);
      const notesHtml = p.note
        ? `<span class="note-pill">${p.note}</span>`
        : `<span class="note-empty">&mdash;</span>`;

      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Image"><img class="prod-thumb" src="${imgSrc}" alt="${p.name}"></td>
        <td data-label="Product ID">${p.id}</td>
        <td data-label="Product Name">${p.name}</td>
        <td data-label="Category">${p.category}</td>
        <td data-label="Size">${p.size}</td>
        <td data-label="Color">${p.color}</td>
        <td data-label="Selling Price">$${p.price.toFixed(2)}</td>
        <td data-label="Quantity" class="${qtyClass}">${p.qty}</td>
        <td data-label="Total Value">$${totalValue}</td>
        <td data-label="Stock Status"><span class="status-badge ${statusClass}">${status}</span></td>
        <td data-label="Notes">${notesHtml}</td>
        <td data-label="Date Added">${p.dateAdded}</td>
        <td data-label="Actions">
          <button class="btn-edit" data-index="${realIndex}">Edit</button>
          <button class="btn-delete" data-index="${realIndex}">Delete</button>
        </td>
      `;
      tableBody.appendChild(row);
    });

    totalProductsEl.textContent = products.length;
    visibleCountEl.textContent = filtered.length;
    attachRowButtonEvents();
  }

  // Populate category dropdown from the fixed CATEGORY_LIST (not just
  // categories that currently have products), so filtering/linking from
  // the Categories page always works, even for an empty category.
  function updateCategoryOptions() {
    const currentValue = filterCategory.value;

    filterCategory.innerHTML = `<option value="all">All Categories</option>`;
    CATEGORY_LIST.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      filterCategory.appendChild(opt);
    });

    if (currentValue === "all" || CATEGORY_LIST.includes(currentValue)) {
      filterCategory.value = currentValue;
    }
  }

  function attachRowButtonEvents() {
    document.querySelectorAll(".btn-edit").forEach(btn => {
      btn.addEventListener("click", () => openEditModal(Number(btn.dataset.index)));
    });
    document.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", () => openDeleteModal(Number(btn.dataset.index)));
    });
  }

  // ---------- Image upload / preview + notes wiring (shared helper) ----------
  const imageControls = wireImageAndNoteControls({
    previewBox: imagePreviewBox,
    fileInput: productImageFile,
    urlInput: productImageUrl,
    notePresetSelect: productNotePreset,
    noteCustomInput: productNoteCustom,
    getImageData: () => currentImageData,
    setImageData: (val) => { currentImageData = val; }
  });

  // ---------- Edit Modal ----------
  function openEditModal(index) {
    editIndex = index;
    const p = products[index];
    formError.hidden = true;

    document.getElementById("productId").value = p.id;
    document.getElementById("productName").value = p.name;
    document.getElementById("productCategory").value = p.category;
    document.getElementById("productSize").value = p.size;
    document.getElementById("productColor").value = p.color;
    document.getElementById("productCostPrice").value = getCostPrice(p);
    document.getElementById("productPrice").value = p.price;
    document.getElementById("productQty").value = p.qty;
    document.getElementById("productDate").value = p.dateAdded;
    productDescription.value = p.description || "";

    currentImageData = p.image || "";
    productImageUrl.value = p.image || "";
    productImageFile.value = "";
    imageControls.setImagePreview(currentImageData);

    if (p.note && NOTE_PRESETS.includes(p.note)) {
      productNotePreset.value = p.note;
      productNoteCustom.hidden = true;
      productNoteCustom.value = "";
    } else if (p.note) {
      productNotePreset.value = "custom";
      productNoteCustom.hidden = false;
      productNoteCustom.value = p.note;
    } else {
      productNotePreset.value = "";
      productNoteCustom.hidden = true;
      productNoteCustom.value = "";
    }

    productModal.hidden = false;
    document.getElementById("productName").focus();
  }

  function closeProductModal() {
    productModal.hidden = true;
    editIndex = null;
  }

  productForm.addEventListener("submit", function (e) {
    e.preventDefault();

    if (editIndex === null) return; // safety guard — modal is edit-only

    const id = document.getElementById("productId").value.trim();
    const name = document.getElementById("productName").value.trim();
    const category = document.getElementById("productCategory").value.trim();
    const size = document.getElementById("productSize").value.trim();
    const color = document.getElementById("productColor").value.trim();
    const costPrice = parseFloat(document.getElementById("productCostPrice").value);
    const price = parseFloat(document.getElementById("productPrice").value);
    const qty = parseInt(document.getElementById("productQty").value, 10);
    let dateAdded = document.getElementById("productDate").value;
    const image = currentImageData;
    const description = productDescription.value.trim();

    const notePresetVal = productNotePreset.value;
    const note = notePresetVal === "custom" ? productNoteCustom.value.trim() : notePresetVal;

    // Required: Product Name, SKU, Category, Selling Price, Cost Price, Quantity
    if (!id || !name || !category || isNaN(price) || isNaN(costPrice) || isNaN(qty)) {
      formError.textContent = "Please fill all required fields.";
      formError.hidden = false;
      formError.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Duplicate SKU / Product ID check — excludes the product
    // currently being edited so saving without changing the ID doesn't
    // falsely flag itself as a duplicate.
    if (isDuplicateSku(id, editIndex)) {
      formError.textContent = "This SKU / Product ID already exists. Please use a different one.";
      formError.hidden = false;
      formError.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    formError.hidden = true;

    if (!dateAdded) {
      dateAdded = products[editIndex].dateAdded || new Date().toISOString().split("T")[0];
    }

    products[editIndex] = { id, name, category, size, color, costPrice, price, qty, dateAdded, image, note, description };
    saveProducts();
    showToast(`"${name}" updated.`);

    closeProductModal();
    renderTable();
  });

  cancelBtn.addEventListener("click", closeProductModal);

  // Close modal when clicking the dark overlay itself
  productModal.addEventListener("click", (e) => {
    if (e.target === productModal) closeProductModal();
  });

  // ---------- Delete Modal ----------
  function openDeleteModal(index) {
    deleteIndex = index;
    const p = products[index];
    document.getElementById("deleteMessage").textContent =
      `Are you sure you want to delete "${p.name}"?`;
    deleteModal.hidden = false;
  }

  function closeDeleteModal() {
    deleteModal.hidden = true;
    deleteIndex = null;
  }

  cancelDeleteBtn.addEventListener("click", closeDeleteModal);

  deleteModal.addEventListener("click", (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });

  confirmDeleteBtn.addEventListener("click", function () {
    if (deleteIndex !== null) {
      const name = products[deleteIndex].name;
      products.splice(deleteIndex, 1);
      saveProducts();
      closeDeleteModal();
      renderTable();
      showToast(`"${name}" deleted.`);
    }
  });

  // Close any open modal with the Escape key (Edit / Delete). The
  // Import modal has its own Escape handler further down, defined once
  // the import DOM elements exist.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!productModal.hidden) closeProductModal();
      if (!deleteModal.hidden) closeDeleteModal();
    }
  });

  // ---------- CSV Export ----------
  exportBtn.addEventListener("click", () => {
    downloadInventoryCSV(products);
    showToast("Inventory exported to CSV.");
  });

  // ===========================================================
  // 3.1 CSV BULK IMPORT
  // "Import CSV" lets an admin upload many products at once. The flow
  // is: pick a file -> parse + validate every row -> show a preview
  // table (valid rows highlighted normally, invalid rows flagged with
  // the reason, and a "Row N: reason" error report above the table) ->
  // "Confirm Import" saves only the valid rows.
  // ===========================================================
  const importCsvBtn = document.getElementById("importCsvBtn");
  const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
  const importCsvFileInput = document.getElementById("importCsvFileInput");

  const importModal = document.getElementById("importModal");
  const importSummary = document.getElementById("importSummary");
  const importPreviewBody = document.getElementById("importPreviewBody");
  const importCancelBtn = document.getElementById("importCancelBtn");
  const importConfirmBtn = document.getElementById("importConfirmBtn");

  let pendingImportRows = []; // validated, import-ready product objects

  downloadTemplateBtn.addEventListener("click", () => {
    downloadSampleCSVTemplate();
    showToast("Sample CSV template downloaded.");
  });

  importCsvBtn.addEventListener("click", () => {
    importCsvFileInput.value = ""; // reset so re-selecting the same file still fires "change"
    importCsvFileInput.click();
  });

  importCsvFileInput.addEventListener("change", () => {
    const file = importCsvFileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      handleImportFile(String(reader.result));
    };
    reader.onerror = () => {
      showToast("Could not read that file. Please try again.");
    };
    reader.readAsText(file);
  });

  function handleImportFile(csvText) {
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      showToast("That CSV file has no product rows to import.");
      return;
    }

    const headers = rows[0];
    // Keep track of each data row's ORIGINAL position in the file (row 1
    // is the header row, so the first product row is Row 2 — matching
    // what the admin sees if they open the file in Excel/Sheets). We
    // filter out fully-blank lines but must do so BEFORE assigning row
    // numbers so numbering still matches the real file.
    const dataRowsWithNumbers = rows
      .map((row, idx) => ({ row, rowNumber: idx + 1 }))
      .slice(1)
      .filter(r => r.row.some(cell => cell.trim() !== ""));

    if (dataRowsWithNumbers.length === 0) {
      showToast("That CSV file has no product rows to import.");
      return;
    }

    const colIndex = {
      id: findColumnIndex(headers, ["SKU", "Product ID", "Product ID / SKU"]),
      name: findColumnIndex(headers, ["Product Name", "Name"]),
      category: findColumnIndex(headers, ["Category"]),
      size: findColumnIndex(headers, ["Size"]),
      color: findColumnIndex(headers, ["Color"]),
      costPrice: findColumnIndex(headers, ["Cost Price"]),
      price: findColumnIndex(headers, ["Selling Price", "Price"]),
      qty: findColumnIndex(headers, ["Quantity", "Qty"]),
      dateAdded: findColumnIndex(headers, ["Date Added", "Date"]),
      note: findColumnIndex(headers, ["Notes", "Note"]),
      description: findColumnIndex(headers, ["Description"]),
      image: findColumnIndex(headers, ["Image URL", "Image"])
    };

    if (colIndex.id === -1 || colIndex.name === -1 || colIndex.category === -1) {
      showToast("This file is missing required columns (SKU, Product Name, Category). Please use the sample template.");
      return;
    }

    const getCell = (row, idx) => (idx !== -1 && row[idx] !== undefined ? row[idx].trim() : "");

    const existingSkuSet = new Set(products.map(p => p.id.trim().toLowerCase()));
    const seenSkusInBatch = new Set();

    const parsedRows = dataRowsWithNumbers.map(({ row, rowNumber }) => {
      const id = getCell(row, colIndex.id);
      const name = getCell(row, colIndex.name);
      const category = getCell(row, colIndex.category);
      const size = getCell(row, colIndex.size);
      const color = getCell(row, colIndex.color);
      const costPrice = parseFloat(getCell(row, colIndex.costPrice));
      const price = parseFloat(getCell(row, colIndex.price));
      const qty = parseInt(getCell(row, colIndex.qty), 10);
      let dateAdded = getCell(row, colIndex.dateAdded);
      if (!dateAdded) dateAdded = new Date().toISOString().split("T")[0];
      const note = getCell(row, colIndex.note);
      const description = getCell(row, colIndex.description);
      const image = getCell(row, colIndex.image);

      const productData = { id, name, category, size, color, costPrice, price, qty, dateAdded, note, description, image };
      const errors = validateImportRow(productData, existingSkuSet, seenSkusInBatch);

      if (errors.length === 0) {
        seenSkusInBatch.add(id.trim().toLowerCase());
      }

      return { productData, errors, valid: errors.length === 0, rowNumber };
    });

    renderImportPreview(parsedRows);
    importModal.hidden = false;
  }

  function renderImportPreview(parsedRows) {
    pendingImportRows = parsedRows.filter(r => r.valid).map(r => r.productData);

    const validCount = pendingImportRows.length;
    const errorRows = parsedRows.filter(r => !r.valid);
    const errorCount = errorRows.length;

    // ---- Summary line ----
    let summaryHtml = `
      <p>
        <strong>${validCount}</strong> of <strong>${parsedRows.length}</strong> row${parsedRows.length === 1 ? "" : "s"}
        ${validCount === 1 ? "is" : "are"} ready to import.
        ${errorCount > 0 ? ` <strong>${errorCount}</strong> row${errorCount === 1 ? "" : "s"} will be skipped due to errors.` : ""}
      </p>
    `;

    // ---- Explicit "Row N: issue" error report ----
    if (errorCount > 0) {
      const errorListItems = errorRows
        .map(r => `<li>Row ${r.rowNumber}: ${r.errors.join("; ")}</li>`)
        .join("");
      summaryHtml += `
        <p class="import-error-report-title">Import Error Report:</p>
        <ul class="import-error-list">${errorListItems}</ul>
      `;
    }

    importSummary.innerHTML = summaryHtml;
    importPreviewBody.innerHTML = "";

    parsedRows.forEach(r => {
      const p = r.productData;
      const statusHtml = r.valid
        ? `<span class="status-badge status-in-stock">Valid</span>`
        : `<span class="status-badge status-out-stock">Error</span><p class="import-error-text">${r.errors.join("; ")}</p>`;

      const row = document.createElement("tr");
      row.className = r.valid ? "" : "import-row-error";
      row.innerHTML = `
        <td data-label="Row">${r.rowNumber}</td>
        <td data-label="Status">${statusHtml}</td>
        <td data-label="SKU">${p.id || "&mdash;"}</td>
        <td data-label="Product Name">${p.name || "&mdash;"}</td>
        <td data-label="Category">${p.category || "&mdash;"}</td>
        <td data-label="Size">${p.size || "&mdash;"}</td>
        <td data-label="Color">${p.color || "&mdash;"}</td>
        <td data-label="Cost Price">${isNaN(p.costPrice) ? "&mdash;" : "$" + p.costPrice.toFixed(2)}</td>
        <td data-label="Selling Price">${isNaN(p.price) ? "&mdash;" : "$" + p.price.toFixed(2)}</td>
        <td data-label="Quantity">${isNaN(p.qty) ? "&mdash;" : p.qty}</td>
        <td data-label="Date Added">${p.dateAdded}</td>
      `;
      importPreviewBody.appendChild(row);
    });

    importConfirmBtn.disabled = validCount === 0;
  }

  function closeImportModal() {
    importModal.hidden = true;
    pendingImportRows = [];
    importPreviewBody.innerHTML = "";
    importSummary.innerHTML = "";
  }

  importCancelBtn.addEventListener("click", closeImportModal);

  importModal.addEventListener("click", (e) => {
    if (e.target === importModal) closeImportModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !importModal.hidden) closeImportModal();
  });

  importConfirmBtn.addEventListener("click", () => {
    if (pendingImportRows.length === 0) return;

    pendingImportRows.forEach(p => {
      products.push({
        id: p.id,
        name: p.name,
        category: p.category,
        size: p.size,
        color: p.color,
        costPrice: p.costPrice,
        price: p.price,
        qty: p.qty,
        dateAdded: p.dateAdded,
        image: p.image || "",
        note: p.note || "",
        description: p.description || ""
      });
    });

    saveProducts();
    const importedCount = pendingImportRows.length;
    closeImportModal();
    renderTable();
    showToast(`${importedCount} product${importedCount === 1 ? "" : "s"} imported successfully.`);
  });

  // ---------- Search & Filter ----------
  searchInput.addEventListener("input", renderTable);
  filterStatus.addEventListener("change", renderTable);
  filterSize.addEventListener("change", renderTable);
  filterCategory.addEventListener("change", renderTable);

  // ---------- URL params from Dashboard / Categories / Reports (e.g.
  // inventory.html?filter=Low%20Stock, ?category=Dress, or
  // ?edit=SN004 to jump straight into editing one product) ----------
  function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const filterParam = params.get("filter");
    const validFilters = ["all", "In Stock", "Low Stock", "Out of Stock"];
    if (filterParam && validFilters.includes(filterParam)) {
      filterStatus.value = filterParam;
    }
    const categoryParam = params.get("category");
    if (categoryParam && CATEGORY_LIST.includes(categoryParam)) {
      filterCategory.value = categoryParam;
    }
    if (params.get("added") === "1") {
      setTimeout(() => showToast("Product added successfully."), 150);
    }
  }

  // ---------- Init ----------
  updateCategoryOptions();
  applyUrlParams();
  renderTable();

  // Opens the Edit modal directly for a specific product when arriving
  // from the Reports page's "View / Edit" links (inventory.html?edit=SKU).
  const editParam = new URLSearchParams(window.location.search).get("edit");
  if (editParam) {
    const editTargetIndex = products.findIndex(
      p => p.id.trim().toLowerCase() === editParam.trim().toLowerCase()
    );
    if (editTargetIndex !== -1) {
      openEditModal(editTargetIndex);
    }
  }
}

// ===========================================================
// 4. DASHBOARD PAGE LOGIC
// Everything in this block only runs if the dashboard summary
// element exists on the current page, so it's inert elsewhere.
// ===========================================================
function initDashboardPage() {
  const statTotalProducts = document.getElementById("dashStatTotalProducts");
  const statCostValue = document.getElementById("dashStatCostValue");
  const statRetailValue = document.getElementById("dashStatRetailValue");
  const statInStock = document.getElementById("dashStatInStock");
  const statLowStock = document.getElementById("dashStatLowStock");
  const statOutStock = document.getElementById("dashStatOutStock");

  const recentBody = document.getElementById("recentProductsBody");
  const recentEmpty = document.getElementById("recentProductsEmpty");

  const lowStockList = document.getElementById("lowStockList");
  const lowStockEmpty = document.getElementById("lowStockEmpty");
  const lowStockCount = document.getElementById("lowStockCount");

  const outStockList = document.getElementById("outStockList");
  const outStockEmpty = document.getElementById("outStockEmpty");
  const outStockCount = document.getElementById("outStockCount");

  const categoryStockList = document.getElementById("categoryStockList");
  const categoryStockEmpty = document.getElementById("categoryStockEmpty");

  const lastUpdatedText = document.getElementById("lastUpdatedText");
  const dashExportBtn = document.getElementById("dashExportBtn");

  const healthPanel = document.getElementById("healthPanel");
  const healthBadge = document.getElementById("healthBadge");
  const healthMessage = document.getElementById("healthMessage");

  const breakdownIn = document.getElementById("breakdownIn");
  const breakdownLow = document.getElementById("breakdownLow");
  const breakdownOut = document.getElementById("breakdownOut");
  const legendInCount = document.getElementById("legendInCount");
  const legendLowCount = document.getElementById("legendLowCount");
  const legendOutCount = document.getElementById("legendOutCount");

  function renderSummaryCards() {
    const totals = computeInventoryTotals(products);
    statTotalProducts.textContent = totals.totalProducts;
    statCostValue.textContent = `$${totals.costValue.toFixed(2)}`;
    statRetailValue.textContent = `$${totals.retailValue.toFixed(2)}`;
    statInStock.textContent = totals.inStock;
    statLowStock.textContent = totals.lowStock;
    statOutStock.textContent = totals.outOfStock;
  }

  function renderRecentProducts() {
    const recent = [...products]
      .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
      .slice(0, 5);

    recentBody.innerHTML = "";
    recentEmpty.hidden = recent.length !== 0;

    recent.forEach(p => {
      const status = getStockStatus(p.qty);
      const statusClass = getStockStatusClass(status);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Image"><img class="prod-thumb" src="${productThumb(p)}" alt="${p.name}"></td>
        <td data-label="Product Name">${p.name}</td>
        <td data-label="Category">${p.category}</td>
        <td data-label="Quantity">${p.qty}</td>
        <td data-label="Status"><span class="status-badge ${statusClass}">${status}</span></td>
        <td data-label="Date Added">${p.dateAdded}</td>
      `;
      recentBody.appendChild(row);
    });
  }

  function renderAlertList(container, emptyEl, countEl, renderedList, badgeCount) {
    container.innerHTML = "";
    emptyEl.hidden = renderedList.length !== 0;
    countEl.textContent = badgeCount;

    renderedList.forEach(p => {
      const item = document.createElement("li");
      item.className = "alert-item";
      item.innerHTML = `
        <img class="prod-thumb" src="${productThumb(p)}" alt="${p.name}">
        <div class="alert-item-info">
          <p class="alert-item-name">${p.name}</p>
          <p class="alert-item-meta">${p.category} &middot; ${p.size} &middot; ${p.color}</p>
        </div>
        <span class="alert-item-qty">Qty: ${p.qty}</span>
      `;
      container.appendChild(item);
    });
  }

  function renderCategoryStock() {
    const totalsByCategory = {};
    products.forEach(p => {
      totalsByCategory[p.category] = (totalsByCategory[p.category] || 0) + p.qty;
    });

    const entries = Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1]);
    const maxQty = entries.length ? entries[0][1] : 0;

    categoryStockList.innerHTML = "";
    categoryStockEmpty.hidden = entries.length !== 0;

    entries.forEach(([category, qty]) => {
      const barWidth = maxQty > 0 ? Math.round((qty / maxQty) * 100) : 0;
      const item = document.createElement("li");
      item.className = "category-stock-item";
      item.innerHTML = `
        <span class="category-stock-name">${category}</span>
        <span class="category-stock-bar-track">
          <span class="category-stock-bar-fill" style="width:${barWidth}%"></span>
        </span>
        <span class="category-stock-qty">${qty} in stock</span>
      `;
      categoryStockList.appendChild(item);
    });
  }

  function renderInventoryHealth() {
    if (!healthPanel) return;
    healthPanel.classList.remove("health-good", "health-warning", "health-critical");

    const total = products.length;
    if (total === 0) {
      healthBadge.textContent = "No Data";
      healthMessage.textContent = "Add products to see your inventory health.";
      healthPanel.classList.add("health-good");
      return;
    }

    const outCount = products.filter(p => getStockStatus(p.qty) === "Out of Stock").length;
    const lowCount = products.filter(p => getStockStatus(p.qty) === "Low Stock").length;
    const outPct = outCount / total;
    const lowPct = lowCount / total;

    if (outPct > 0.2) {
      healthBadge.textContent = "Critical";
      healthMessage.textContent = `Critical: ${outCount} product${outCount === 1 ? "" : "s"} (${Math.round(outPct * 100)}%) are out of stock. Restock as soon as possible.`;
      healthPanel.classList.add("health-critical");
    } else if (lowPct > 0.3) {
      healthBadge.textContent = "Warning";
      healthMessage.textContent = `Warning: ${lowCount} product${lowCount === 1 ? "" : "s"} (${Math.round(lowPct * 100)}%) are running low on stock. Consider reordering soon.`;
      healthPanel.classList.add("health-warning");
    } else {
      healthBadge.textContent = "Good";
      healthMessage.textContent = "Good: most products are in stock and healthy.";
      healthPanel.classList.add("health-good");
    }
  }

  function renderStockBreakdown() {
    if (!breakdownIn) return;
    const totals = computeInventoryTotals(products);
    const total = totals.totalProducts;

    const inPct = total ? (totals.inStock / total) * 100 : 0;
    const lowPct = total ? (totals.lowStock / total) * 100 : 0;
    const outPct = total ? (totals.outOfStock / total) * 100 : 0;

    breakdownIn.style.width = `${inPct}%`;
    breakdownLow.style.width = `${lowPct}%`;
    breakdownOut.style.width = `${outPct}%`;

    legendInCount.textContent = totals.inStock;
    legendLowCount.textContent = totals.lowStock;
    legendOutCount.textContent = totals.outOfStock;
  }

  function renderDashboard() {
    renderSummaryCards();
    renderRecentProducts();
    renderCategoryStock();
    renderInventoryHealth();
    renderStockBreakdown();

    if (lastUpdatedText) {
      lastUpdatedText.textContent = getLastUpdatedText();
    }

    const outStockAll = products.filter(p => getStockStatus(p.qty) === "Out of Stock");
    renderAlertList(outStockList, outStockEmpty, outStockCount, outStockAll, outStockAll.length);

    const lowStockAll = products
      .filter(p => getStockStatus(p.qty) === "Low Stock")
      .sort((a, b) => a.qty - b.qty);
    renderAlertList(lowStockList, lowStockEmpty, lowStockCount, lowStockAll.slice(0, 2), lowStockAll.length);
  }

  if (dashExportBtn) {
    dashExportBtn.addEventListener("click", () => {
      downloadInventoryCSV(products);
      showToast("Inventory exported to CSV.");
    });
  }

  // ===========================================================
  // 4.1 BACKUP / RESTORE / RESET DEMO DATA
  // Three admin safety tools that live on the Dashboard's Quick
  // Actions panel. All three read/write the same shared `products`
  // array and localStorage, so every other page reflects the change
  // the next time it loads.
  // ===========================================================
  const backupDataBtn = document.getElementById("backupDataBtn");
  const restoreDataBtn = document.getElementById("restoreDataBtn");
  const restoreFileInput = document.getElementById("restoreFileInput");
  const resetDemoBtn = document.getElementById("resetDemoBtn");
  const resetDemoModal = document.getElementById("resetDemoModal");
  const cancelResetBtn = document.getElementById("cancelResetBtn");
  const confirmResetBtn = document.getElementById("confirmResetBtn");

  // ---- Backup: download all current inventory data as a JSON file ----
  function backupInventoryData() {
    const backupPayload = {
      appName: "SN Style Studio Inventory Backup",
      exportedAt: new Date().toISOString(),
      productCount: products.length,
      products: products
    };
    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SN-Style-Studio-Backup-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ---- Restore: upload a previously saved JSON backup and replace inventory ----
  function isValidRestoredProduct(p) {
    return p && typeof p === "object" &&
      typeof p.id === "string" && p.id.trim() !== "" &&
      typeof p.name === "string" && p.name.trim() !== "" &&
      typeof p.category === "string" &&
      typeof p.price === "number" && !isNaN(p.price) &&
      typeof p.qty === "number" && !isNaN(p.qty);
  }

  function restoreInventoryData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (e) {
        showToast("That file isn't valid JSON. Restore cancelled.");
        return;
      }

      const restoredProducts = Array.isArray(parsed) ? parsed : parsed.products;

      if (!Array.isArray(restoredProducts)) {
        showToast("That backup file doesn't contain a valid product list.");
        return;
      }

      if (!restoredProducts.every(isValidRestoredProduct)) {
        showToast("That backup file has missing or invalid product fields. Restore cancelled.");
        return;
      }

      const confirmed = window.confirm(
        `This will replace all ${products.length} current product(s) with ${restoredProducts.length} product(s) from the backup file. This cannot be undone. Continue?`
      );
      if (!confirmed) return;

      // Normalize restored records so every field the app expects exists,
      // even if the backup came from an older/partial export.
      products = restoredProducts.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category || "Other",
        size: p.size || "",
        color: p.color || "",
        costPrice: typeof p.costPrice === "number" && !isNaN(p.costPrice) ? p.costPrice : p.price,
        price: p.price,
        qty: p.qty,
        dateAdded: p.dateAdded || new Date().toISOString().split("T")[0],
        image: p.image || "",
        note: p.note || "",
        description: p.description || ""
      }));

      saveProducts();
      showToast(`Inventory restored from backup (${products.length} products).`);
      renderDashboard();
    };
    reader.onerror = () => {
      showToast("Could not read that file. Please try again.");
    };
    reader.readAsText(file);
  }

  // ---- Reset Demo Data: reload the original sample products ----
  function resetDemoData() {
    products = JSON.parse(JSON.stringify(defaultProducts));
    saveProducts();
    showToast("Demo data has been restored.");
    renderDashboard();
  }

  if (backupDataBtn) {
    backupDataBtn.addEventListener("click", () => {
      backupInventoryData();
      showToast("Inventory backup downloaded.");
    });
  }

  if (restoreDataBtn && restoreFileInput) {
    restoreDataBtn.addEventListener("click", () => {
      restoreFileInput.value = ""; // reset so re-selecting the same file still fires "change"
      restoreFileInput.click();
    });
    restoreFileInput.addEventListener("change", () => {
      const file = restoreFileInput.files[0];
      if (file) restoreInventoryData(file);
    });
  }

  if (resetDemoBtn && resetDemoModal) {
    resetDemoBtn.addEventListener("click", () => {
      resetDemoModal.hidden = false;
    });
    cancelResetBtn.addEventListener("click", () => {
      resetDemoModal.hidden = true;
    });
    resetDemoModal.addEventListener("click", (e) => {
      if (e.target === resetDemoModal) resetDemoModal.hidden = true;
    });
    confirmResetBtn.addEventListener("click", () => {
      resetDemoData();
      resetDemoModal.hidden = true;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !resetDemoModal.hidden) resetDemoModal.hidden = true;
    });
  }

  renderDashboard();
}

// ===========================================================
// 5. ADD PRODUCT PAGE LOGIC
// Everything in this block only runs if the addProductForm exists
// on the current page (add-product.html), so it's inert elsewhere.
// ===========================================================
function initAddProductPage() {
  const form = document.getElementById("addProductForm");
  const formError = document.getElementById("apFormError");

  const imagePreviewBox = document.getElementById("apImagePreviewBox");
  const imageFile = document.getElementById("apImageFile");
  const imageUrl = document.getElementById("apImageUrl");
  const notePreset = document.getElementById("apNotePreset");
  const noteCustom = document.getElementById("apNoteCustom");
  const dateInput = document.getElementById("apDate");
  const descriptionInput = document.getElementById("apDescription");

  let currentImageData = "";

  // Default the date field to today so it's rarely left blank.
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  wireImageAndNoteControls({
    previewBox: imagePreviewBox,
    fileInput: imageFile,
    urlInput: imageUrl,
    notePresetSelect: notePreset,
    noteCustomInput: noteCustom,
    getImageData: () => currentImageData,
    setImageData: (val) => { currentImageData = val; }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const id = document.getElementById("apProductId").value.trim();
    const name = document.getElementById("apProductName").value.trim();
    const category = document.getElementById("apCategory").value.trim();
    const size = document.getElementById("apSize").value.trim();
    const color = document.getElementById("apColor").value.trim();
    const costPrice = parseFloat(document.getElementById("apCostPrice").value);
    const price = parseFloat(document.getElementById("apSellingPrice").value);
    const qty = parseInt(document.getElementById("apQty").value, 10);
    let dateAdded = dateInput.value;
    const image = currentImageData;
    const description = descriptionInput.value.trim();

    const notePresetVal = notePreset.value;
    const note = notePresetVal === "custom" ? noteCustom.value.trim() : notePresetVal;

    // Required: Product Name, SKU, Category, Selling Price, Cost Price, Quantity
    if (!id || !name || !category || isNaN(price) || isNaN(costPrice) || isNaN(qty)) {
      formError.textContent = "Please fill all required fields.";
      formError.hidden = false;
      formError.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Duplicate SKU / Product ID check — this is a brand new
    // product, so no index is excluded; ANY existing match blocks it.
    if (isDuplicateSku(id)) {
      formError.textContent = "This SKU / Product ID already exists. Please use a different one.";
      formError.hidden = false;
      formError.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    formError.hidden = true;

    if (!dateAdded) {
      dateAdded = new Date().toISOString().split("T")[0];
    }

    const newProduct = { id, name, category, size, color, costPrice, price, qty, dateAdded, image, note, description };
    products.push(newProduct);
    saveProducts();

    // Send the admin to the Inventory list so they immediately see the
    // new product and get a "Product added successfully." toast (the
    // Dashboard and Reports pages pick up the change automatically the
    // next time they load).
    window.location.href = "inventory.html?added=1";
  });
}

// ===========================================================
// 5.5 CATEGORIES PAGE LOGIC
// Everything in this block only runs if the categories table exists
// on the current page (categories.html), so it's inert elsewhere.
// ===========================================================
function initCategoriesPage() {
  const tableBody = document.getElementById("categoryTableBody");
  const noResults = document.getElementById("categoryNoResults");
  const searchInput = document.getElementById("categorySearchInput");
  const sortSelect = document.getElementById("categorySortSelect");

  const totalCategoriesEl = document.getElementById("catStatTotalCategories");
  const totalCostValueEl = document.getElementById("catStatTotalCostValue");
  const totalRetailValueEl = document.getElementById("catStatTotalRetailValue");
  const totalProfitEl = document.getElementById("catStatPotentialProfit");

  function render() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    const stats = computeCategoryStats(products);

    // Summary always reflects ALL categories, unaffected by search.
    const grandTotalQty = stats.reduce((sum, c) => sum + c.totalQty, 0);
    const grandTotalCostValue = stats.reduce((sum, c) => sum + c.totalCostValue, 0);
    const grandTotalRetailValue = stats.reduce((sum, c) => sum + c.totalRetailValue, 0);
    const potentialProfit = grandTotalRetailValue - grandTotalCostValue;

    totalCategoriesEl.textContent = CATEGORY_LIST.length;
    totalCostValueEl.textContent = `$${grandTotalCostValue.toFixed(2)}`;
    totalRetailValueEl.textContent = `$${grandTotalRetailValue.toFixed(2)}`;
    totalProfitEl.textContent = `$${potentialProfit.toFixed(2)}`;

    let filtered = stats.filter(c => c.category.toLowerCase().includes(searchTerm));

    const sortVal = sortSelect.value;
    filtered = [...filtered].sort((a, b) => {
      if (sortVal === "name-asc") return a.category.localeCompare(b.category);
      if (sortVal === "name-desc") return b.category.localeCompare(a.category);
      if (sortVal === "qty-desc") return b.totalQty - a.totalQty;
      if (sortVal === "qty-asc") return a.totalQty - b.totalQty;
      return 0;
    });

    tableBody.innerHTML = "";
    noResults.hidden = filtered.length !== 0;

    filtered.forEach(c => {
      // Share of the WHOLE inventory's quantity this category holds —
      // always measured against the full, unfiltered grand total so the
      // bar/percentage stays meaningful no matter what's typed in search.
      const sharePct = grandTotalQty > 0 ? Math.round((c.totalQty / grandTotalQty) * 100) : 0;
      const isEmpty = c.totalProducts === 0;

      const row = document.createElement("tr");
      row.className = isEmpty ? "category-row-empty" : "";
      row.innerHTML = `
        <td data-label="Category Name">
          <span class="category-name-cell">${c.category}</span>
          ${isEmpty ? '<span class="category-empty-note">No products yet.</span>' : ""}
        </td>
        <td data-label="Total Products">${c.totalProducts}</td>
        <td data-label="Total Quantity">
          <div class="qty-cell">
            <span class="qty-cell-value">${c.totalQty}</span>
            <span class="qty-bar-track"><span class="qty-bar-fill" style="width:${sharePct}%"></span></span>
            <span class="qty-cell-pct">${sharePct}%</span>
          </div>
        </td>
        <td data-label="Total Inventory Cost Value">$${c.totalCostValue.toFixed(2)}</td>
        <td data-label="Total Retail Value">$${c.totalRetailValue.toFixed(2)}</td>
        <td data-label="Low Stock Products">${c.lowStock > 0 ? `<span class="status-badge status-low-stock">${c.lowStock}</span>` : c.lowStock}</td>
        <td data-label="Out of Stock Products">${c.outOfStock > 0 ? `<span class="status-badge status-out-stock">${c.outOfStock}</span>` : c.outOfStock}</td>
        <td data-label="Actions"><a class="btn-view-products" href="inventory.html?category=${encodeURIComponent(c.category)}">View Products</a></td>
      `;
      tableBody.appendChild(row);
    });
  }

  searchInput.addEventListener("input", render);
  sortSelect.addEventListener("change", render);

  render();
}

// ===========================================================
// 5.6 REPORTS PAGE LOGIC
// Everything in this block only runs if the reports category table
// exists on the current page (reports.html), so it's inert elsewhere.
// ===========================================================
function initReportsPage() {
  const repFilterCategory = document.getElementById("repFilterCategory");
  const repFilterStatus = document.getElementById("repFilterStatus");
  const repFilterNotes = document.getElementById("repFilterNotes");

  const repStatTotalProducts = document.getElementById("repStatTotalProducts");
  const repStatCostValue = document.getElementById("repStatCostValue");
  const repStatRetailValue = document.getElementById("repStatRetailValue");
  const repStatPotentialProfit = document.getElementById("repStatPotentialProfit");
  const repStatLowStock = document.getElementById("repStatLowStock");
  const repStatOutStock = document.getElementById("repStatOutStock");

  const repCategoryBody = document.getElementById("repCategoryBody");

  const repLowStockBody = document.getElementById("repLowStockBody");
  const repLowStockEmpty = document.getElementById("repLowStockEmpty");
  const repLowStockCount = document.getElementById("repLowStockCount");

  const repOutStockBody = document.getElementById("repOutStockBody");
  const repOutStockEmpty = document.getElementById("repOutStockEmpty");
  const repOutStockCount = document.getElementById("repOutStockCount");

  const repNotesContainer = document.getElementById("repNotesContainer");
  const repNotesEmpty = document.getElementById("repNotesEmpty");

  const repExportFullBtn = document.getElementById("repExportFullBtn");
  const repExportLowBtn = document.getElementById("repExportLowBtn");
  const repExportOutBtn = document.getElementById("repExportOutBtn");

  // Populate the Category and Notes filter dropdowns from the same
  // fixed lists every other page uses, so options never drift out of
  // sync with what's actually selectable when adding/editing a product.
  CATEGORY_LIST.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    repFilterCategory.appendChild(opt);
  });

  NOTE_PRESETS.forEach(note => {
    const opt = document.createElement("option");
    opt.value = note;
    opt.textContent = note;
    repFilterNotes.appendChild(opt);
  });

  function matchesFilters(p) {
    const categoryVal = repFilterCategory.value;
    const statusVal = repFilterStatus.value;
    const notesVal = repFilterNotes.value;
    const matchesCategory = categoryVal === "all" || p.category === categoryVal;
    const matchesStatus = statusVal === "all" || getStockStatus(p.qty) === statusVal;
    const matchesNotes = notesVal === "all" || p.note === notesVal;
    return matchesCategory && matchesStatus && matchesNotes;
  }

  // Summary cards always reflect the FULL, unfiltered inventory — the
  // same pattern used on the Categories page — so the top-line numbers
  // stay a trustworthy "whole picture" no matter what filters are set
  // below them.
  function renderSummaryCards() {
    const totals = computeInventoryTotals(products);
    const potentialProfit = totals.retailValue - totals.costValue;
    repStatTotalProducts.textContent = totals.totalProducts;
    repStatCostValue.textContent = `$${totals.costValue.toFixed(2)}`;
    repStatRetailValue.textContent = `$${totals.retailValue.toFixed(2)}`;
    repStatPotentialProfit.textContent = `$${potentialProfit.toFixed(2)}`;
    repStatLowStock.textContent = totals.lowStock;
    repStatOutStock.textContent = totals.outOfStock;
  }

  function renderCategoryReport(filteredList) {
    const stats = computeCategoryStats(filteredList);
    repCategoryBody.innerHTML = "";

    stats.forEach(c => {
      const potentialProfit = c.totalRetailValue - c.totalCostValue;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Category">${c.category}</td>
        <td data-label="Total Products">${c.totalProducts}</td>
        <td data-label="Total Quantity">${c.totalQty}</td>
        <td data-label="Inventory Cost Value">$${c.totalCostValue.toFixed(2)}</td>
        <td data-label="Retail Value">$${c.totalRetailValue.toFixed(2)}</td>
        <td data-label="Potential Profit" class="profit-cell">$${potentialProfit.toFixed(2)}</td>
      `;
      repCategoryBody.appendChild(row);
    });
  }

  function renderStockTable(tbody, emptyEl, countEl, list) {
    tbody.innerHTML = "";
    if (countEl) countEl.textContent = list.length;
    emptyEl.hidden = list.length !== 0;

    list.forEach(p => {
      const notesHtml = p.note
        ? `<span class="note-pill">${p.note}</span>`
        : `<span class="note-empty">&mdash;</span>`;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Image"><img class="prod-thumb" src="${productThumb(p)}" alt="${p.name}"></td>
        <td data-label="SKU">${p.id}</td>
        <td data-label="Product Name">${p.name}</td>
        <td data-label="Category">${p.category}</td>
        <td data-label="Size">${p.size}</td>
        <td data-label="Color">${p.color}</td>
        <td data-label="Quantity">${p.qty}</td>
        <td data-label="Notes">${notesHtml}</td>
        <td data-label="Actions"><a class="btn-view-products" href="inventory.html?edit=${encodeURIComponent(p.id)}">View / Edit</a></td>
      `;
      tbody.appendChild(row);
    });
  }

  function renderNotesReport(filteredList) {
    repNotesContainer.innerHTML = "";
    let anyGroupHasProducts = false;

    NOTE_PRESETS.forEach(note => {
      const items = filteredList.filter(p => p.note === note);
      if (items.length === 0) return;
      anyGroupHasProducts = true;

      const group = document.createElement("div");
      group.className = "notes-group";

      const header = document.createElement("div");
      header.className = "dashboard-panel-header notes-group-header";
      header.innerHTML = `
        <h4 class="notes-group-title">${note}</h4>
        <span class="alert-count-badge">${items.length}</span>
      `;
      group.appendChild(header);

      const tableWrapper = document.createElement("div");
      tableWrapper.className = "table-wrapper";
      const table = document.createElement("table");
      table.className = "inventory-table compact-table";
      table.innerHTML = `
        <thead>
          <tr>
            <th class="no-sort">Image</th>
            <th>SKU</th>
            <th>Product Name</th>
            <th>Category</th>
            <th>Quantity</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector("tbody");

      items.forEach(p => {
        const status = getStockStatus(p.qty);
        const statusClass = getStockStatusClass(status);
        const row = document.createElement("tr");
        row.innerHTML = `
          <td data-label="Image"><img class="prod-thumb" src="${productThumb(p)}" alt="${p.name}"></td>
          <td data-label="SKU">${p.id}</td>
          <td data-label="Product Name">${p.name}</td>
          <td data-label="Category">${p.category}</td>
          <td data-label="Quantity">${p.qty}</td>
          <td data-label="Status"><span class="status-badge ${statusClass}">${status}</span></td>
        `;
        tbody.appendChild(row);
      });

      tableWrapper.appendChild(table);
      group.appendChild(tableWrapper);
      repNotesContainer.appendChild(group);
    });

    repNotesEmpty.hidden = anyGroupHasProducts;
  }

  function renderAll() {
    renderSummaryCards();

    const filtered = products.filter(matchesFilters);

    renderCategoryReport(filtered);

    const lowStockFiltered = filtered.filter(p => getStockStatus(p.qty) === "Low Stock");
    renderStockTable(repLowStockBody, repLowStockEmpty, repLowStockCount, lowStockFiltered);

    const outStockFiltered = filtered.filter(p => getStockStatus(p.qty) === "Out of Stock");
    renderStockTable(repOutStockBody, repOutStockEmpty, repOutStockCount, outStockFiltered);

    renderNotesReport(filtered);
  }

  repFilterCategory.addEventListener("change", renderAll);
  repFilterStatus.addEventListener("change", renderAll);
  repFilterNotes.addEventListener("change", renderAll);

  repExportFullBtn.addEventListener("click", () => {
    downloadInventoryCSV(products);
    showToast("Full inventory exported to CSV.");
  });

  repExportLowBtn.addEventListener("click", () => {
    const lowStockAll = products.filter(p => getStockStatus(p.qty) === "Low Stock");
    downloadNamedCSV(lowStockAll, "Low-Stock");
    showToast("Low stock report exported to CSV.");
  });

  repExportOutBtn.addEventListener("click", () => {
    const outStockAll = products.filter(p => getStockStatus(p.qty) === "Out of Stock");
    downloadNamedCSV(outStockAll, "Out-of-Stock");
    showToast("Out of stock report exported to CSV.");
  });

  renderAll();
}

// ===========================================================
// 6. INIT — detect which page we're on and wire it up
// ===========================================================
setHeaderDate();
highlightActiveNavLink();

if (document.getElementById("inventoryTableBody")) {
  initInventoryPage();
}

if (document.getElementById("dashStatTotalProducts")) {
  initDashboardPage();
}

if (document.getElementById("addProductForm")) {
  initAddProductPage();
}

if (document.getElementById("categoryTableBody")) {
  initCategoriesPage();
}

if (document.getElementById("repCategoryBody")) {
  initReportsPage();
}