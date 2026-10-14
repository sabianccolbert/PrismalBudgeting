// Spreadsheets: reading connected spreadsheets (set up on the Spreadsheets page, in the menu; CONNECTED SPREADSHEETS in Process Budget.js
// says what happens to their entries). The API downloads one by its link (its sheets.js), and it's read here:
// Excel's .xlsx (Google Sheets downloads as one too), OpenDocument's .ods (LibreOffice), or .csv.
//   - readSheetFile(link): the file's tabs and cells, its name, and how it's shared
//   - readConnection(fields, workbook): the entries its cells make, and what's wrong with any of them
//   - Cells are picked as columns and rows ("column B row 2 to column B row 50"), kept as "B2:B50"
//   - Home and the Spreadsheets page read every spreadsheet that's on again when they open (Home at most every minute and
//     a half per spreadsheet, on this device), and the budget only changes when something in them did

const Spreadsheets = (() => {

  // =====================================================================
  // #region READING A FILE
  // =====================================================================

  const MAX_TABS = 200;
  const MAX_ROWS = 100000;
  const MAX_COLUMNS = 16384; // Column XFD, the last one Excel has
  const MAX_UNZIPPED = 80000000; // A file inside the spreadsheet that would unzip bigger than this isn't read
  const MAX_TOTAL_UNZIPPED = 160000000; // ...and the files read from one spreadsheet, all together
  const TOO_BIG_TO_READ = "That spreadsheet is too big to read. Connect a smaller one, like a new spreadsheet with just the cells for Prismal Budget.";

  // A problem reading a spreadsheet. lasting: the server answered (like "not shared", or the account's email
  // isn't verified yet), so it's worth showing on the Spreadsheets page; a dropped connection isn't (the next read tries again).
  class SheetReadError extends Error {
    constructor(message, lasting = false) {
      super(message);
      this.lasting = lasting;
    }
  }

  // The spreadsheet behind a link: { workbook, name, access: "public" | "shared" }. Throws SheetReadError.
  async function readSheetFile(link) {
    let token = null;
    try { token = localStorage.getItem("prismal_jwt"); } catch (e) {}
    if (!token) throw new SheetReadError("You've been signed out. Please log in again.");
    let response;
    try {
      response = await fetch(`${window.API_BASE_URL}/api/sheets/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ link })
      });
    } catch (err) {
      throw new SheetReadError("Couldn't reach the server. Please try again.");
    }
    if (response.status === 401) {
      signedOutElsewhere();
      throw new SheetReadError("You've been signed out. Please log in again.");
    }
    if (!response.ok) {
      let message = "";
      try { message = (await response.json()).error || ""; } catch (e) {}
      const lasting = response.status === 400 || response.status === 403 || response.status === 413;
      throw new SheetReadError(message || "Couldn't read that spreadsheet just now. Please try again.", lasting);
    }
    const format = response.headers.get("X-Sheet-Format") || "";
    let name = "";
    try { name = decodeURIComponent(response.headers.get("X-Sheet-Name") || ""); } catch (e) {}
    const access = response.headers.get("X-Sheet-Access") === "shared" ? "shared" : "public";
    const bytes = new Uint8Array(await response.arrayBuffer());
    try {
      return { workbook: await readWorkbook(bytes, format, name), name, access };
    } catch (err) {
      if (err instanceof SheetReadError) throw err;
      console.error("Couldn't read the spreadsheet file:", err);
      throw new SheetReadError("That spreadsheet's file couldn't be read. Save it again as .xlsx, and try again.", true);
    }
  }

  // A file's tabs: { tabs: [{ name, hidden, cells: Map(row -> Map(column -> cell)) }] }, rows and columns from 1.
  // A cell is { t: "n" (number) | "s" (text) | "d" (a date, as local midnight) | "b" | "e" (an error), v }.
  async function readWorkbook(bytes, format, name = "") {
    if (format === "csv") return readCsv(bytes, name);
    if (typeof DecompressionStream !== "function") {
      throw new SheetReadError("This browser is too old to read spreadsheets. Update it, or try another browser.");
    }
    const zip = readZip(bytes);
    if (format === "ods") return readOds(zip);
    return readXlsx(zip);
  }

  // The files inside a zip (a .xlsx or .ods is one): { has(path), text(path) }. A file is unzipped a piece at a
  // time and stopped past MAX_UNZIPPED (and all of them past MAX_TOTAL_UNZIPPED), since a zip can say a file is
  // small and still unzip into gigabytes (a "zip bomb"), which would freeze the page each time it's read.
  function readZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error("No zip directory");
    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    const files = new Map();
    const names = new TextDecoder();
    for (let n = 0; n < count && at + 46 <= bytes.length; n++) {
      if (view.getUint32(at, true) !== 0x02014b50) throw new Error("Broken zip directory");
      const nameLength = view.getUint16(at + 28, true);
      files.set(names.decode(bytes.subarray(at + 46, at + 46 + nameLength)), {
        method: view.getUint16(at + 10, true),
        compressedSize: view.getUint32(at + 20, true),
        size: view.getUint32(at + 24, true),
        offset: view.getUint32(at + 42, true)
      });
      at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    let unzipped = 0; // Bytes unzipped from this spreadsheet so far
    const tooBig = () => new SheetReadError(TOO_BIG_TO_READ, true);
    return {
      has: (path) => files.has(path),
      async text(path) {
        const file = files.get(path);
        if (!file) throw new Error(`No ${path} in the zip`);
        if (file.size > MAX_UNZIPPED || file.compressedSize === 0xFFFFFFFF) throw tooBig();
        if (view.getUint32(file.offset, true) !== 0x04034b50) throw new Error("Broken zip file");
        const start = file.offset + 30 + view.getUint16(file.offset + 26, true) + view.getUint16(file.offset + 28, true);
        const data = bytes.subarray(start, start + file.compressedSize);
        if (file.method !== 0 && file.method !== 8) throw new Error("Unknown zip compression");
        if (file.method === 0) {
          unzipped += data.byteLength;
          if (unzipped > MAX_TOTAL_UNZIPPED) throw tooBig();
          return new TextDecoder().decode(data);
        }
        const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
        const pieces = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          unzipped += value.byteLength;
          if (size > MAX_UNZIPPED || unzipped > MAX_TOTAL_UNZIPPED) {
            reader.cancel().catch(() => {});
            throw tooBig();
          }
          pieces.push(value);
        }
        const unpacked = new Uint8Array(size);
        let at = 0;
        for (const piece of pieces) {
          unpacked.set(piece, at);
          at += piece.byteLength;
        }
        return new TextDecoder().decode(unpacked);
      }
    };
  }

  // A spreadsheet's XML never declares a DOCTYPE or entities, and one that does could expand into far more than
  // it is ("billion laughs"), so it isn't read
  const parseXml = (text) => {
    if (/<!(DOCTYPE|ENTITY)/i.test(text)) throw new SheetReadError("That spreadsheet's file couldn't be read. Save it again as .xlsx, and try again.", true);
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("Broken XML in the spreadsheet");
    return doc;
  };
  const elements = (node, name) => (node ? [...node.getElementsByTagNameNS("*", name)] : []);
  const childElements = (node, name) => (node ? [...node.children].filter(child => child.localName === name) : []);
  // A cell's or shared string's text: its <t> pieces, leaving out the pronunciation guides some languages add
  const runText = (node) => elements(node, "t").filter(t => t.parentNode.localName !== "rPh").map(t => t.textContent).join("");

  // "../worksheets/sheet1.xml" from "xl/" -> "xl/worksheets/sheet1.xml"
  function resolvePath(base, target) {
    const parts = (target.startsWith("/") ? target.slice(1) : base + target).split("/");
    const path = [];
    for (const part of parts) {
      if (part === "..") path.pop();
      else if (part && part !== ".") path.push(part);
    }
    return path.join("/");
  }

  // Each relationship in a .rels file: Id -> { type, target }
  async function readRels(zip, path) {
    const rels = new Map();
    if (!zip.has(path)) return rels;
    for (const rel of elements(parseXml(await zip.text(path)), "Relationship")) {
      rels.set(rel.getAttribute("Id"), { type: rel.getAttribute("Type") || "", target: rel.getAttribute("Target") || "" });
    }
    return rels;
  }

  // Excel number formats that are dates, by their built-in IDs
  const BUILT_IN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  // Does an Excel number format show a date? (outside quotes and brackets: d or y, or m without h or s)
  function isDateFormat(code) {
    const plain = String(code || "").replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[[^\]]*\]/g, "").replace(/[_*]./g, "");
    if (/^\s*general\s*$/i.test(plain)) return false;
    return /[dy]/i.test(plain) || (/m/i.test(plain) && !/[hs]/i.test(plain));
  }

  // A date's serial number (days since 1899-12-30, or 1904-01-01 in a workbook that counts from 1904) as
  // local midnight; the time of day is left out
  function serialDate(serial, from1904 = false) {
    if (!Number.isFinite(serial)) return null;
    const days = Math.floor(serial + 1e-9);
    return from1904 ? new Date(1904, 0, 1 + days) : new Date(1899, 11, 30 + days);
  }

  // "AB12" -> { col: 28, row: 12 }
  function cellAddress(text) {
    const match = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(String(text || ""));
    return match ? { col: columnNumber(match[1]), row: Number(match[2]) } : null;
  }

  // An .xlsx file's tabs (see readWorkbook): its shared strings, which styles are dates, and each sheet's cells
  async function readXlsx(zip) {
    // The workbook is where the package's relationships say (almost always xl/workbook.xml)
    const rootRels = await readRels(zip, "_rels/.rels");
    const main = [...rootRels.values()].find(rel => /\/officeDocument$/.test(rel.type));
    const workbookPath = main ? resolvePath("", main.target) : "xl/workbook.xml";
    const base = workbookPath.includes("/") ? workbookPath.slice(0, workbookPath.lastIndexOf("/") + 1) : "";
    const workbook = parseXml(await zip.text(workbookPath));
    const rels = await readRels(zip, `${base}_rels/${workbookPath.slice(base.length)}.rels`);
    const relOfType = (type) => [...rels.values()].find(rel => rel.type.endsWith(`/${type}`));
    const from1904 = elements(workbook, "workbookPr").some(pr => /^(1|true)$/i.test(pr.getAttribute("date1904") || ""));

    const stringsRel = relOfType("sharedStrings");
    const stringsPath = stringsRel ? resolvePath(base, stringsRel.target) : `${base}sharedStrings.xml`;
    const strings = zip.has(stringsPath) ? elements(parseXml(await zip.text(stringsPath)), "si").map(runText) : [];

    // Which cell styles show a date
    const dateStyles = new Set();
    const stylesRel = relOfType("styles");
    const stylesPath = stylesRel ? resolvePath(base, stylesRel.target) : `${base}styles.xml`;
    if (zip.has(stylesPath)) {
      const styles = parseXml(await zip.text(stylesPath));
      const customDates = new Set(elements(styles, "numFmt").filter(format => isDateFormat(format.getAttribute("formatCode"))).map(format => Number(format.getAttribute("numFmtId"))));
      childElements(elements(styles, "cellXfs")[0], "xf").forEach((xf, index) => {
        const id = Number(xf.getAttribute("numFmtId") || 0);
        if (BUILT_IN_DATES.has(id) || customDates.has(id)) dateStyles.add(index);
      });
    }

    const tabs = [];
    for (const sheet of elements(workbook, "sheet").slice(0, MAX_TABS)) {
      const idAttribute = [...sheet.attributes].find(attribute => attribute.localName === "id" && /relationships/.test(attribute.namespaceURI || ""));
      const rel = idAttribute ? rels.get(idAttribute.value) : null;
      const path = rel ? resolvePath(base, rel.target) : null;
      const tab = { name: sheet.getAttribute("name") || `Sheet${tabs.length + 1}`, hidden: !!sheet.getAttribute("state") && sheet.getAttribute("state") !== "visible", cells: new Map() };
      tabs.push(tab);
      if (!path || !zip.has(path)) continue;
      const doc = parseXml(await zip.text(path));
      let rowNumber = 0;
      for (const row of elements(doc, "row")) {
        rowNumber = Number(row.getAttribute("r")) || rowNumber + 1;
        if (rowNumber > MAX_ROWS) break;
        let colNumber = 0;
        for (const c of childElements(row, "c")) {
          const address = cellAddress(c.getAttribute("r"));
          colNumber = address ? address.col : colNumber + 1;
          const cell = xlsxCell(c, strings, dateStyles, from1904);
          if (cell) setCell(tab, rowNumber, colNumber, cell);
        }
      }
    }
    return { tabs };
  }

  // One <c> of an .xlsx sheet -> a cell (see readWorkbook), or null when it's empty
  function xlsxCell(c, strings, dateStyles, from1904) {
    const type = c.getAttribute("t") || "n";
    if (type === "inlineStr") {
      const text = runText(childElements(c, "is")[0]);
      return text === "" ? null : { t: "s", v: text };
    }
    const value = childElements(c, "v")[0]?.textContent;
    if (value === undefined || value === "") return null;
    if (type === "s") {
      const text = strings[Number(value)] ?? "";
      return text === "" ? null : { t: "s", v: text };
    }
    if (type === "str") return { t: "s", v: value };
    if (type === "b") return { t: "b", v: value === "1" };
    if (type === "e") return { t: "e", v: value };
    if (type === "d") {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      return match ? { t: "d", v: new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) } : { t: "s", v: value };
    }
    const number = Number(value);
    if (!Number.isFinite(number)) return { t: "s", v: value };
    if (dateStyles.has(Number(c.getAttribute("s") || 0))) {
      const date = serialDate(number, from1904);
      if (date) return { t: "d", v: date };
    }
    return { t: "n", v: number };
  }

  // An .ods file's tabs (see readWorkbook), from content.xml; repeated rows and cells are spread out
  async function readOds(zip) {
    const TABLE = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
    const OFFICE = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
    const doc = parseXml(await zip.text("content.xml"));
    const tabs = [];
    for (const table of [...doc.getElementsByTagNameNS(TABLE, "table")].slice(0, MAX_TABS)) {
      if (table.parentElement && ownerTable(table.parentElement, TABLE)) continue; // A table inside a cell
      const tab = { name: table.getAttributeNS(TABLE, "name") || `Sheet${tabs.length + 1}`, hidden: false, cells: new Map() };
      tabs.push(tab);
      let rowNumber = 1;
      for (const row of table.getElementsByTagNameNS(TABLE, "table-row")) {
        if (ownerTable(row, TABLE) !== table) continue;
        const rowRepeat = Math.max(1, Number(row.getAttributeNS(TABLE, "number-rows-repeated")) || 1);
        const cells = [];
        let colNumber = 1;
        for (const cell of row.children) {
          if (cell.localName !== "table-cell" && cell.localName !== "covered-table-cell") continue;
          const colRepeat = Math.max(1, Number(cell.getAttributeNS(TABLE, "number-columns-repeated")) || 1);
          const value = odsCell(cell, OFFICE);
          if (value) {
            for (let k = 0; k < colRepeat && colNumber + k <= MAX_COLUMNS; k++) cells.push([colNumber + k, value]);
          }
          colNumber += colRepeat;
          if (colNumber > MAX_COLUMNS) break;
        }
        if (cells.length > 0) {
          for (let k = 0; k < rowRepeat && rowNumber + k <= MAX_ROWS; k++) {
            for (const [col, value] of cells) setCell(tab, rowNumber + k, col, value);
          }
        }
        rowNumber += rowRepeat;
        if (rowNumber > MAX_ROWS) break;
      }
    }
    return { tabs };
  }

  // The table a node is in (the nearest one around it), or null
  function ownerTable(node, TABLE) {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.namespaceURI === TABLE && parent.localName === "table") return parent;
    }
    return null;
  }

  // One OpenDocument cell -> a cell (see readWorkbook), or null when it's empty
  function odsCell(cell, OFFICE) {
    const type = cell.getAttributeNS(OFFICE, "value-type");
    if (type === "float" || type === "currency" || type === "percentage") {
      const number = Number(cell.getAttributeNS(OFFICE, "value"));
      return Number.isFinite(number) ? { t: "n", v: number } : null;
    }
    if (type === "date") {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(cell.getAttributeNS(OFFICE, "date-value") || "");
      return match ? { t: "d", v: new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) } : null;
    }
    if (type === "boolean") return { t: "b", v: cell.getAttributeNS(OFFICE, "boolean-value") === "true" };
    const text = [...cell.children].filter(child => child.localName === "p").map(p => p.textContent).join("\n");
    return text === "" ? null : { t: "s", v: text };
  }

  // A .csv (or tab-separated) file: one tab, every cell text. The separator is whichever of comma, tab, or
  // semicolon (Europe's spreadsheets use it) the first line has most of. Like the other formats, only the first
  // MAX_ROWS rows and MAX_COLUMNS columns are read.
  function readCsv(bytes, name) {
    const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
    const firstLine = text.slice(0, text.search(/\r?\n|$/));
    const counts = [",", "\t", ";"].map(separator => [separator, firstLine.split(separator).length]);
    const separator = counts.sort((a, b) => b[1] - a[1])[0][1] > 1 ? counts[0][0] : ",";
    const tab = { name: name || "Sheet1", hidden: false, cells: new Map() };
    let row = 1;
    let col = 1;
    let cell = "";
    let quoted = false;
    // The cell that just ended goes in its tab (empty ones and ones past the last column don't)
    const finishCell = () => {
      if (cell !== "" && col <= MAX_COLUMNS) setCell(tab, row, col, { t: "s", v: cell });
      cell = "";
      col++;
    };
    for (let i = 0; i < text.length && row <= MAX_ROWS; i++) {
      const char = text[i];
      if (quoted) {
        if (char !== '"') cell += char;
        else if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else if (char === '"' && cell === "") {
        quoted = true;
      } else if (char === separator) {
        finishCell();
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        finishCell();
        row++;
        col = 1;
      } else {
        cell += char;
      }
    }
    if (cell !== "") finishCell();
    return { tabs: [tab] };
  }

  // Put a cell in its tab (rows and columns from 1)
  function setCell(tab, row, col, cell) {
    if (!tab.cells.has(row)) tab.cells.set(row, new Map());
    tab.cells.get(row).set(col, cell);
  }

  //#endregion

  // =====================================================================
  // #region CELLS AND RANGES
  // =====================================================================

  // A column as letters ("AB") or a number ("28") -> 28; NaN when it isn't one
  function columnNumber(text) {
    const value = String(text ?? "").trim().toUpperCase();
    let number = NaN;
    if (/^\d{1,5}$/.test(value)) number = Number(value);
    else if (/^[A-Z]{1,3}$/.test(value)) number = [...value].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
    return number >= 1 && number <= MAX_COLUMNS ? number : NaN;
  }

  // 28 -> "AB"
  function columnLetters(number) {
    let letters = "";
    for (let n = number; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    return letters;
  }

  const MAX_ROW_NUMBER = 1048576; // Excel's last row
  const MAX_RANGE_CELLS = 5000;

  // The ➕ window's boxes -> { range: "B2:B50" } (just "B2" for one cell), or { error }. "To" is optional, and
  // its column or row alone means the same as the first one's.
  function rangeFromParts({ fromCol, fromRow, toCol = "", toRow = "" }) {
    const startCol = columnNumber(fromCol);
    const startRow = Number(String(fromRow ?? "").trim());
    if (!startCol) return { error: "Type the first cell's column, like B (or 2)." };
    if (!Number.isInteger(startRow) || startRow < 1 || startRow > MAX_ROW_NUMBER) return { error: "Type the first cell's row, like 2." };
    const hasTo = String(toCol ?? "").trim() !== "" || String(toRow ?? "").trim() !== "";
    if (!hasTo) return { range: columnLetters(startCol) + startRow };
    const endCol = String(toCol ?? "").trim() === "" ? startCol : columnNumber(toCol);
    const endRow = String(toRow ?? "").trim() === "" ? startRow : Number(String(toRow).trim());
    if (!endCol) return { error: "Type the last cell's column, like B (or 2), or leave both \"to\" boxes empty for one cell." };
    if (!Number.isInteger(endRow) || endRow < 1 || endRow > MAX_ROW_NUMBER) return { error: "Type the last cell's row, like 50, or leave both \"to\" boxes empty for one cell." };
    const [c1, c2] = [Math.min(startCol, endCol), Math.max(startCol, endCol)];
    const [r1, r2] = [Math.min(startRow, endRow), Math.max(startRow, endRow)];
    if ((c2 - c1 + 1) * (r2 - r1 + 1) > MAX_RANGE_CELLS) return { error: `That's more than ${MAX_RANGE_CELLS.toLocaleString()} cells. Pick fewer.` };
    const one = c1 === c2 && r1 === r2;
    return { range: one ? columnLetters(c1) + r1 : `${columnLetters(c1)}${r1}:${columnLetters(c2)}${r2}` };
  }

  // "B2:C9" (or "B2") -> { fromCol, fromRow, toCol, toRow } as numbers; null when it isn't a range
  function parseRange(range) {
    const [first, last = first] = String(range || "").split(":");
    const start = cellAddress(first);
    const end = cellAddress(last);
    if (!start || !end) return null;
    return {
      fromCol: Math.min(start.col, end.col), fromRow: Math.min(start.row, end.row),
      toCol: Math.max(start.col, end.col), toRow: Math.max(start.row, end.row)
    };
  }

  // The cells of a range, row by row: [{ row, col, ref: "B2" }]
  function rangeCells(range) {
    const parts = parseRange(range);
    if (!parts) return [];
    const cells = [];
    for (let row = parts.fromRow; row <= parts.toRow; row++) {
      for (let col = parts.fromCol; col <= parts.toCol; col++) {
        cells.push({ row, col, ref: columnLetters(col) + row });
        if (cells.length >= MAX_RANGE_CELLS) return cells;
      }
    }
    return cells;
  }

  // Tab names match without regard to capitals or extra spaces
  const tabKey = (name) => String(name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  // The tab with this name (exactly, then without regard to capitals or spaces), or null
  function findTab(workbook, name) {
    return workbook.tabs.find(tab => tab.name === name) || workbook.tabs.find(tab => tabKey(tab.name) === tabKey(name)) || null;
  }

  // What a field's cells hold: { cells: [{ ref, cell (null when empty) }] } or { error }
  function fieldCells(field, workbook, label) {
    const tab = findTab(workbook, field.tab);
    if (!tab) return { error: `There's no tab called "${field.tab}" in the spreadsheet anymore. Tap ➕ next to ${label} and pick its tab again.` };
    const cells = rangeCells(field.range).map(({ row, col, ref }) => ({ ref: `${tab.name}!${ref}`, cell: tab.cells.get(row)?.get(col) || null }));
    if (cells.length === 0) return { error: `The cells for ${label} aren't set. Tap ➕ next to ${label} to pick them.` };
    return { cells };
  }

  // A cell's text, as people would see it (numbers plainly, dates in this device's format)
  function cellText(cell) {
    if (!cell) return "";
    if (cell.t === "d") return showDate(cell.v);
    if (cell.t === "b") return cell.v ? "TRUE" : "FALSE";
    return String(cell.v).replace(/\s+/g, " ").trim();
  }

  // A date cell -> local midnight, or null when it isn't a date. Numbers in a date column are dates' serial
  // numbers (a date without a date format), and text is read like a typed date (this device's date order, or
  // words like Oct 20, 2026).
  function cellDate(cell) {
    if (!cell) return null;
    if (cell.t === "d") return createSafeMidnight(cell.v);
    if (cell.t === "n") return cell.v >= 20000 && cell.v <= 80000 ? serialDate(cell.v) : null;
    if (cell.t !== "s") return null;
    const text = String(cell.v).trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i, "");
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
    const date = iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : parseTypedDate(text);
    if (isNaN(date.getTime())) return null;
    if (iso && (date.getMonth() !== Number(iso[2]) - 1 || date.getDate() !== Number(iso[3]))) return null;
    return createSafeMidnight(date);
  }

  // An amount cell -> a number, or NaN. Text can have a currency sign or code, thousands separators, a
  // minus sign before or after, or parentheses (accountants' way of writing a cost).
  function cellAmount(cell) {
    if (!cell) return NaN;
    if (cell.t === "n") return cell.v;
    if (cell.t !== "s") return NaN;
    let text = String(cell.v).replace(/[−‒–—]/g, "-").replace(/\s+/g, "").replace(/\p{Sc}/gu, "").replace(/^[A-Za-z]{3}(?=[-+(\d.,])|(?<=[\d.)])[A-Za-z]{3}$/g, "");
    let negative = false;
    const parenthesized = /^\((.*)\)$/.exec(text);
    if (parenthesized) {
      negative = true;
      text = parenthesized[1];
    }
    if (/^[\d.,]+-$/.test(text)) {
      negative = true;
      text = text.slice(0, -1);
    }
    const number = readMoneyInput(text);
    return Number.isFinite(number) ? (negative ? -Math.abs(number) : number) : NaN;
  }

  // A refraction type cell -> "❗️" | "✖️" | "⭕️"; "" when it's empty (Regular), null when it isn't one
  function cellType(cell) {
    const text = cellText(cell).toLowerCase().replace(/\uFE0F/g, "");
    if (text === "") return "";
    if (["regular", "r", "❗", "!"].includes(text)) return "❗️";
    if (["hidden", "h", "✖", "x"].includes(text)) return "✖️";
    if (["transfer", "t", "⭕", "o"].includes(text)) return "⭕️";
    return null;
  }

  //#endregion

  // =====================================================================
  // #region ENTRIES
  // =====================================================================

  const LABELS = { date: "Date", title: "Title", amount: "Amount", type: "Refraction Type", account: "Other Account" };
  const KEEP_DAYS_BEFORE = 100; // Entries kept from before today (Dave's savings tip looks for ones like them)
  const KEEP_DAYS_AFTER = 800;
  const MAX_ENTRIES = 3000;
  const MAX_DETAILED_PROBLEMS = 6;

  const isLinked = (field) => !!field && typeof field === "object" && typeof field.range === "string";

  // The entries a connection's fields make from a workbook: { entries: [[MM/DD/YYYY, type, amount, title]],
  // problems: [text], tabs: [names], upcoming (how many from today on) }. A problem that stops everything (like
  // a missing tab, or ranges that don't line up) leaves no entries; one cell's problem only leaves out its own.
  function readConnection(fields, workbook) {
    const tabs = workbook.tabs.map(tab => tab.name);
    const stop = (problem) => ({ entries: [], problems: [problem], tabs, upcoming: 0 });
    fields = fields || {};
    if (!isLinked(fields.date)) return stop("Pick the cells with the dates: tap ➕ next to Date.");

    // Each field: cells (one per date, or one for all), or a typed value
    const read = {};
    let size = 0;
    for (const key of Object.keys(LABELS)) {
      const field = fields[key];
      if (!isLinked(field)) continue;
      const found = fieldCells(field, workbook, LABELS[key]);
      if (found.error) return stop(found.error);
      read[key] = found.cells;
      if (key === "date") size = found.cells.length;
    }
    for (const key of Object.keys(read)) {
      if (key === "date" || read[key].length === 1 || read[key].length === size) continue;
      return stop(`The ${LABELS[key]} cells (${read[key].length}) and the Date cells (${size}) aren't the same size. Pick as many ${LABELS[key]} cells as Date cells, or just one for all of them.`);
    }
    const valueAt = (key, i) => (read[key] ? read[key][read[key].length === 1 ? 0 : i] : null);

    const accounts = new Map(accountRows().map(account => [account.clean, account.name]));
    const typedType = !isLinked(fields.type) && ["❗️", "✖️", "⭕️"].includes(fields.type?.value) ? fields.type.value : "❗️";
    const typedAccount = !isLinked(fields.account) ? String(fields.account?.value || "").trim() : "";
    const typedTitle = !isLinked(fields.title) ? String(fields.title?.value || "").replace(/\s+/g, " ").trim() : "";
    const typedAmount = !isLinked(fields.amount) ? Number(fields.amount?.value) : NaN;
    const sign = isLinked(fields.amount) ? fields.amount.sign : "written";
    if (!isLinked(fields.amount) && !Number.isFinite(typedAmount)) return stop("Type the amount, or tap ➕ next to Amount to pick its cells.");
    if (!isLinked(fields.amount) && Math.abs(typedAmount) > MAX_AMOUNT) return stop(AMOUNT_TOO_BIG);
    if (typedAccount && !accounts.has(cleanString(typedAccount))) return stop(`The Other Account "${typedAccount}" isn't one of yours anymore. Pick another, or add it on the Other Accounts page.`);
    if (!isLinked(fields.title) && !typedTitle && !typedAccount) return stop("Type a title, or tap ➕ next to Title to pick its cells.");

    const entries = [];
    const details = [];
    let moreProblems = 0;
    const problem = (text) => {
      if (details.length < MAX_DETAILED_PROBLEMS) details.push(text);
      else moreProblems++;
    };
    const keepFrom = addDays(today, -KEEP_DAYS_BEFORE);
    const keepTo = addDays(today, KEEP_DAYS_AFTER);

    for (let i = 0; i < size; i++) {
      const dateCell = read.date[i];
      if (!dateCell.cell || cellText(dateCell.cell) === "") continue; // An empty row (room to grow)
      const date = cellDate(dateCell.cell);
      if (!date) {
        problem(`${dateCell.ref} ("${cellText(dateCell.cell)}") isn't a date. Make it a date, like ${showDate(today)}.`);
        continue;
      }

      let amount = typedAmount;
      if (read.amount) {
        const amountCell = valueAt("amount", i);
        amount = cellAmount(amountCell.cell);
        if (!Number.isFinite(amount)) {
          problem(amountCell.cell ? `${amountCell.ref} ("${cellText(amountCell.cell)}") isn't an amount. Make it a number, like 25.00.` : `${amountCell.ref} has no amount. Fill it in, or clear its date.`);
          continue;
        }
        if (Math.abs(amount) > MAX_AMOUNT) {
          problem(`${amountCell.ref} ("${cellText(amountCell.cell)}") is more than $1,000,000,000, the most an entry can be.`);
          continue;
        }
        if (sign === "costs") amount = -Math.abs(amount);
        else if (sign === "gains") amount = Math.abs(amount);
      }

      let type = typedType;
      if (read.type) {
        const typeCell = valueAt("type", i);
        type = cellType(typeCell.cell);
        if (type === null) {
          problem(`${typeCell.ref} says "${cellText(typeCell.cell)}", which isn't a refraction type. Use Regular, Hidden, or Transfer (empty is Regular).`);
          continue;
        }
        type = type || "❗️";
      }

      // The account's name as it's written on Other Accounts, so the entry reads "Title → Savings" (any capitals typed)
      let account = typedAccount ? accounts.get(cleanString(typedAccount)) : "";
      if (read.account) {
        const accountCell = valueAt("account", i);
        const name = cellText(accountCell.cell);
        account = name ? accounts.get(cleanString(name)) : "";
        if (account === undefined) {
          problem(`${accountCell.ref} names an Other Account, "${name}", that you don't have. Add it on the Other Accounts page, or fix the cell.`);
          continue;
        }
      }
      if (account && type === "❗️") {
        problem(`${read.account ? valueAt("account", i).ref : dateCell.ref}'s entry goes to ${account}, but it's Regular. Make it Hidden or Transfer, so it can change the account.`);
        continue;
      }

      // The entry keeps its own title, with its Other Account after it ("Payday → Savings"); with no title, it's
      // the account's name
      let title = typedTitle;
      if (read.title) {
        const titleCell = valueAt("title", i);
        title = cellText(titleCell.cell);
        if (!cleanString(title) && !account) {
          problem(`${titleCell.ref} has no title. Fill it in, or clear its date.`);
          continue;
        }
      }

      if (date < keepFrom || date > keepTo) continue;
      const ownTitle = capitalize(splitAccount(title.replace(/\s+/g, " ").trim()).title).slice(0, MAX_TITLE);
      entries.push([formatToMMDDYYYY(date), type, Math.round(amount * 100) / 100, withAccount(ownTitle, account)]);
    }

    entries.sort((a, b) => createSafeMidnight(a[0], true) - createSafeMidnight(b[0], true));
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    const problems = [...details];
    if (moreProblems > 0) problems.push(`And ${moreProblems} more cell${moreProblems === 1 ? "" : "s"} like ${moreProblems === 1 ? "that" : "those"}.`);
    const upcoming = entries.filter(entry => createSafeMidnight(entry[0], true) >= today).length;
    return { entries, problems, tabs, upcoming };
  }

  //#endregion

  // =====================================================================
  // #region STAYING UP TO DATE
  // =====================================================================

  const READ_GAP_MS = 90 * 1000;
  const READS_KEY = "prismal_sheet_reads"; // When this device last read each spreadsheet: { id: time }

  // { connection id: when this device last read it (ms) }
  function lastReads() {
    try { return JSON.parse(localStorage.getItem(READS_KEY) || "{}") || {}; } catch (e) { return {}; }
  }

  // Read the spreadsheets that are on again (all of them with force, or only those this device hasn't read in
  // the last minute and a half), and update the budget when anything in them changed. Resolves to the
  // budget's result, or null when nothing changed (or nothing was read).
  let refreshing = null;
  function refresh({ force = false } = {}) {
    if (refreshing) return refreshing;
    refreshing = refreshNow(force).finally(() => { refreshing = null; });
    return refreshing;
  }

  // The reading itself (see refresh)
  async function refreshNow(force) {
    if (typeof workspaceLoaded === "undefined" || !workspaceLoaded || !sheetsData) return null;
    const reads = lastReads();
    const now = Date.now();
    const due = sheetsData.list.filter(connection => connection.on && (force || !(now - (reads[connection.id] || 0) < READ_GAP_MS)));
    if (due.length === 0) return null;
    const results = await Promise.all(due.map(async (connection) => {
      try {
        const file = await readSheetFile(connection.link);
        return { id: connection.id, ...readConnection(connection.fields, file.workbook), access: file.access };
      } catch (err) {
        return err instanceof SheetReadError && err.lasting ? { id: connection.id, failed: err.message } : null;
      }
    }));
    const kept = lastReads();
    for (const connection of due) kept[connection.id] = now;
    try { localStorage.setItem(READS_KEY, JSON.stringify(kept)); } catch (e) {}

    // Only what's different changes the budget
    const changed = results.filter(Boolean).filter(result => {
      const connection = sheetConnectionById(result.id);
      if (!connection) return false;
      if (result.failed) return !(connection.problems.length === 1 && connection.problems[0] === result.failed);
      const updated = normalizeSheetConnection({ ...connection, entries: result.entries, problems: result.problems, tabs: result.tabs, access: result.access });
      return JSON.stringify(updated) !== JSON.stringify(connection);
    });
    if (changed.length === 0) return null;
    return updateSheetReads(changed);
  }

  // Home and the Spreadsheets page keep them up to date: when they open, and when they come back into view
  const KEEPS_UP = ["home", "spreadsheets"];
  if (KEEPS_UP.includes(window.PAGE) && window.workspaceReady) {
    window.workspaceReady.then((loaded) => {
      if (loaded) refresh({ force: window.PAGE === "spreadsheets" });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
  }

  //#endregion

  return {
    SheetReadError,
    readSheetFile,
    readWorkbook,
    readConnection,
    refresh,
    columnNumber,
    columnLetters,
    rangeFromParts,
    parseRange,
    rangeCells,
    findTab,
    cellText,
    isLinked,
    LABELS
  };
})();
