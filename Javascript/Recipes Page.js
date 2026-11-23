// Recipes Page: the Recipes tab (menu/recipes.html). Three cards that open and close by their headings (each stays as it
// was left, on this device):
//   - Pantry: each food's name, amount, unit, and expiration, with a checkbox at its left that puts it on the shopping
//     list (red); Edit adds sections, moves foods, and deletes, like Recurring Entries'
//   - Recipes: a list with a search box as its first line (tap one to open it, its + to put it on the calendar as a meal)
//   - Your Foods: each food used, with the unit used last and its other names; Edit moves and deletes, with Select All
// The tables and their Edit mode are Budget Pages.js's (buildRowTable), which draws this page like the menu data pages
// (PAGE_RENDERERS.recipes). Undo and Redo are Home's (Budget UI.js: the same steps). The windows are Kitchen UI.js's, and
// the changes Kitchen.js's. With Settings' switches on, the Pantry's foods the calendar's meals run short of glow orange,
// and so do the recipes the Pantry can't make now.

(() => {
  "use strict";

  const OPEN_KEY = "prismal_recipes_open"; // The cards open on this device: { pantry, recipes, foods }
  const CARDS = ["pantry", "recipes", "foods"];
  const el = (tag, className = "", text = "") => BudgetUI.element(tag, className, text);
  const toast = (message, warning = false) => BudgetUI.showToast(message, warning);
  let editing = null;  // The table in Edit mode ("pantry" or "foods"), or null
  let recipes = null;  // The recipe list (made once, so what's typed in its search box stays)
  let drawn = false;   // The page was drawn once

  // =====================================================================
  // #region THE CARDS
  // =====================================================================

  // Which cards are open on this device (closed to start)
  function openCards() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(OPEN_KEY) || "null"); } catch {}
    return Object.fromEntries(CARDS.map(card => [card, !!(stored && stored[card] === true)]));
  }

  // Open or close a card (kept on this device), and draw it
  function setOpen(card, open) {
    const next = { ...openCards(), [card]: open };
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch {}
    if (!open && editing === card) stopEditing();
    renderRecipesPage();
  }

  // Draw the page: each card's heading with its count, and the open ones' contents
  function renderRecipesPage() {
    drawn = true;
    const kitchen = Kitchen.data();
    const open = openCards();
    const counts = {
      pantry: kitchen.pantry.filter(row => !isSeparatorRow(row)).length,
      recipes: kitchen.recipes.length,
      foods: kitchen.foods.length
    };
    for (const card of CARDS) {
      document.getElementById(`${card}Card`).hidden = false;
      document.getElementById(`${card}Toggle`).setAttribute("aria-expanded", String(open[card]));
      document.getElementById(`${card}Body`).hidden = !open[card];
      document.getElementById(`${card}Card`).classList.toggle("isOpen", open[card]);
      document.getElementById(`${card}Count`).textContent = counts[card] > 0 ? String(counts[card]) : "";
    }
    if (open.pantry) drawPantry();
    if (open.recipes) drawRecipes();
    if (open.foods) drawFoods();
    BudgetUI.renderUndoButtons();
  }
  PAGE_RENDERERS.recipes = renderRecipesPage;
  // (Budget Pages.js draws the page once the budget is in, with the renderer it finds then. This script can arrive after
  // that, when the budget loads before the scripts ahead of this one do: then it draws the page itself)
  window.workspaceReady.then((loaded) => { if (loaded && !drawn) renderRecipesPage(); });

  // A card's toolbar: its add button and Edit, or in Edit, Select All, Delete Selected, and Done
  function toolbar(name, addLabel, add) {
    const bar = document.getElementById(`${name}Toolbar`);
    bar.replaceChildren();
    if (editing !== name) {
      bar.append(toolbarButton(addLabel, "primary", (event) => add(event.currentTarget)));
      if (name !== "recipes") bar.append(toolbarButton("Edit", "", () => startEditing(name)));
      return;
    }
    const selectAll = toolbarButton("Select All", "", () => {
      const rows = ROW_TABLES[name].get();
      if (allSelected(name)) selectedRows.clear();
      else rows.forEach((row, index) => selectedRows.add(index));
      renderRecipesPage();
    });
    selectAll.id = "selectAllButton";
    const remove = toolbarButton("Delete Selected", "danger", () => deleteSelected(name));
    remove.id = "deleteSelectedButton";
    bar.append(selectAll, remove, toolbarButton("Done", "primary", stopEditing));
    showSelection(name);
  }

  // Is every row checked?
  const allSelected = (name) => {
    const rows = ROW_TABLES[name].get();
    return rows.length > 0 && rows.every((row, index) => selectedRows.has(index));
  };

  // Select All says Select None once every row is checked, and Delete Selected how many are
  function showSelection(name) {
    const button = document.getElementById("selectAllButton");
    if (button) button.textContent = allSelected(name) ? "Select None" : "Select All";
    updateDeleteButton();
  }

  // (Budget Pages.js's editMode says a page is in Edit: a cut-short title's tap checks its row then, instead of opening
  // the title)
  function startEditing(name) {
    editing = name;
    editMode = true;
    selectedRows.clear();
    BudgetUI.closeAllPanels(true);
    renderRecipesPage();
  }

  // Done: out of Edit, with nothing checked
  function stopEditing() {
    editing = null;
    editMode = false;
    selectedRows.clear();
    BudgetUI.closeAllPanels(true);
    renderRecipesPage();
  }

  //#endregion

  // =====================================================================
  // #region THE PANTRY
  // =====================================================================

  function drawPantry() {
    toolbar("pantry", "+ Food", (origin) => openPantryFood(origin, null));
    const view = document.getElementById("pantryView");
    const rows = indexedRows(kitchenData.pantry, 0);
    if (rows.length === 0 && editing !== "pantry") {
      view.replaceChildren(emptyMessage("Nothing in the Pantry yet. Tap + Food to add what you have."));
      return;
    }
    // (With Settings' switch on: the foods the meals on the calendar's five weeks run short of)
    const glow = Kitchen.settings().glowPantry;
    const short = glow ? Kitchen.shortFoods(formatToYMD(gridEndDate)) : new Map();
    const table = buildRowTable({
      tableName: "pantry",
      columns: [{ label: "Buy", className: "shopHead" }, { label: "Food", className: "titleHead" }, "Amount", "Unit", "Expires"],
      rows,
      extraClass: "pantryTable",
      editing: editing === "pantry",
      renderEntry(tr, row, index) {
        const isShort = short.has(Kitchen.foodKey(row[0]));
        tr.classList.toggle("isShopping", row[4] === "1");
        tr.classList.toggle("isShort", isShort);
        tr.append(shopCell(row, index));
        const title = noTranslate(clippedCell(row[0], "titleCell"));
        if (isShort) title.append(el("span", "srOnly", ", not enough for the calendar's meals"));
        tr.append(title, noTranslate(cell(Kitchen.showAmount(row[1]), "kitchenAmountCell")), noTranslate(cell(row[2], "unitCell")), row[3] ? noTranslate(dateCell(row[3])) : cell("", "dateCell"));
      },
      onEntryClick: (index, origin) => openPantryFood(origin, index)
    });
    table.addEventListener("click", () => showSelection("pantry"));
    const parts = [wrapScroll(table)];
    // The calendar's meals need some foods the Pantry doesn't have at all
    if (glow) {
      const have = new Set(kitchenData.pantry.filter(row => !isSeparatorRow(row)).map(row => Kitchen.foodKey(row[0])));
      const missing = [...short].filter(([key]) => !have.has(key)).map(([, food]) => food.name);
      if (missing.length > 0) parts.push(noTranslate(el("p", "panelHint kitchenShortNote", `The meals on your calendar's five weeks need these too, which aren't in the Pantry: ${missing.join(", ")}.`)));
    }
    view.replaceChildren(...parts);
    markClipped(table);
  }

  // A food's checkbox at its left: on the shopping list or not (everyone the budget is shared with sees it)
  function shopCell(row, index) {
    const td = el("td", "shopCell");
    const box = el("input", "shopBox");
    box.type = "checkbox";
    box.checked = row[4] === "1";
    box.disabled = editing === "pantry";
    box.setAttribute("aria-label", `${row[0]} on the shopping list`);
    // (Checking it isn't tapping the row, which opens the food)
    box.addEventListener("click", (event) => event.stopPropagation());
    box.addEventListener("change", async () => {
      box.disabled = true;
      const result = await Kitchen.setShopping(index, box.checked);
      if (!result.ok) {
        box.checked = !box.checked;
        box.disabled = false;
        return toast(result.message || "That didn't work. Please try again.", true);
      }
      BudgetUI.warnIfUnsaved(result);
    });
    td.append(box);
    return td;
  }

  // A Pantry food's window (index null: a new one): its name, amount, unit, and expiration. Only the name has to be
  // filled in.
  function openPantryFood(origin, index) {
    const row = index === null ? null : kitchenData.pantry[index];
    BudgetUI.openPanel({
      origin,
      size: "large",
      title: row ? "Pantry Food" : "New Pantry Food",
      build(form, panel) {
        panel.panel.classList.add("kitchenPanel");
        KitchenUI.foodNames();
        const unit = KitchenUI.unitBox(row ? row[2] : "");
        const name = KitchenUI.foodNameBox(row ? row[0] : "", unit, "Food");
        const amount = KitchenUI.amountBox(row ? row[1] : null);
        const expires = BudgetUI.dateField({ label: "Expires", date: row && row[3] ? createSafeMidnight(row[3], true) : null, optional: true, hint: "Only for its reminder (Settings' Recipes card). Nothing else goes by it." });
        const buttons = [{ label: row ? "Save" : "Add Food", kind: "primary", type: "submit" }];
        if (row) {
          buttons.push({ label: "Delete", kind: "danger", onClick: () => {
            if (!window.confirm(`Take ${row[0]} out of the Pantry?`)) return;
            BudgetUI.submit(panel, () => deleteBudgetRows("pantry", [index]));
          } });
        }
        buttons.push({ label: "Cancel", onClick: () => panel.close() });
        form.append(
          BudgetUI.field("Food", noTranslate(name)),
          BudgetUI.field("Amount", noTranslate(amount), { optional: true }),
          BudgetUI.field("Unit", noTranslate(unit), { optional: true, hint: "Like lbs, g, cups, or cans." }),
          expires.el,
          BudgetUI.buttonRow(buttons)
        );
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!name.value.trim()) return panel.setError("Give the food a name.");
          const day = expires.value();
          if (day === undefined) return panel.setError("Expires isn't a date. Clear it, or pick a day.");
          BudgetUI.submit(panel, () => Kitchen.savePantryFood({ name: name.value, amount: amount.value, unit: unit.value, expires: day }, index));
        });
      }
    });
  }

  //#endregion

  // =====================================================================
  // #region RECIPES
  // =====================================================================

  function drawRecipes() {
    toolbar("recipes", "New Recipe", (origin) => KitchenUI.openRecipe(origin, null));
    if (recipes) return recipes.draw();
    recipes = KitchenUI.recipeList({
      onOpen: (recipe, button) => KitchenUI.openRecipe(button, Kitchen.recipeById(recipe.id)),
      onAdd: (recipe, button) => KitchenUI.addRecipeAsMeal(button, Kitchen.recipeById(recipe.id))
    });
    document.getElementById("recipesView").replaceChildren(recipes.el);
  }

  //#endregion

  // =====================================================================
  // #region YOUR FOODS
  // =====================================================================

  // What Your Foods drew last, out of Edit: { key (the foods as JSON), el }. A change it doesn't show (the shopping list,
  // a recipe) leaves its table as it is: at 2,000 foods it's most of the page's drawing.
  let foodsShown = null;

  // Your Foods' card: its table (Edit's when it's in Edit), or a note while it has none
  function drawFoods() {
    toolbar("foods", "+ Food", (origin) => openFood(origin, null));
    const view = document.getElementById("foodsView");
    const key = editing === "foods" ? null : JSON.stringify(kitchenData.foods);
    if (key !== null && foodsShown && foodsShown.key === key && view.contains(foodsShown.el)) return;
    const rows = indexedRows(kitchenData.foods, 0);
    if (rows.length === 0) {
      const empty = emptyMessage("No foods yet. Each food you use is added here, or tap + Food.");
      view.replaceChildren(empty);
      foodsShown = key === null ? null : { key, el: empty };
      return;
    }
    const table = buildRowTable({
      tableName: "foods",
      columns: [{ label: "Food", className: "titleHead" }, "Unit", "Other Names"],
      rows,
      extraClass: "foodsTable",
      sections: false,
      editing: editing === "foods",
      renderEntry(tr, row) {
        tr.append(noTranslate(clippedCell(row[0], "titleCell")), noTranslate(cell(row[1], "unitCell")), noTranslate(cell((row[2] || []).join(", "), "aliasesCell")));
      },
      onEntryClick: (index, origin) => openFood(origin, index)
    });
    table.addEventListener("click", () => showSelection("foods"));
    const shown = wrapScroll(table);
    view.replaceChildren(shown);
    markClipped(table);
    foodsShown = key === null ? null : { key, el: shown };
  }

  // A food in the list (index null: a new one): its name, the unit it's used with, and other names that count as it
  function openFood(origin, index) {
    const row = index === null ? null : kitchenData.foods[index];
    BudgetUI.openPanel({
      origin,
      size: "large",
      title: row ? "Food" : "New Food",
      build(form, panel) {
        panel.panel.classList.add("kitchenPanel");
        const name = BudgetUI.textField({ label: "Food", value: row ? row[0] : "", placeholder: "Like Eggs or Flour", maxLength: MAX_FOOD_NAME });
        const unit = BudgetUI.textField({ label: "Unit", value: row ? row[1] : "", placeholder: "Like lbs or g", optional: true, maxLength: MAX_FOOD_UNIT, hint: "Filled in for it wherever it's added. Using it with another unit makes that one its unit." });
        const aliases = BudgetUI.textField({ label: "Other Names", value: row ? (row[2] || []).join(", ") : "", placeholder: "Like chicken breast, chicken thighs", optional: true, maxLength: (MAX_FOOD_NAME + 2) * MAX_FOOD_ALIASES, hint: "Separated by commas. In the Pantry, a recipe, or a meal, each counts as this food." });
        for (const field of [name, unit, aliases]) noTranslate(field.input);
        const buttons = [{ label: row ? "Save" : "Add Food", kind: "primary", type: "submit" }];
        if (row) {
          buttons.push({ label: "Delete", kind: "danger", onClick: () => {
            if (!window.confirm(`Take ${row[0]} out of your foods? Your recipes, meals, and Pantry keep it.`)) return;
            BudgetUI.submit(panel, () => deleteBudgetRows("foods", [index]));
          } });
        }
        buttons.push({ label: "Cancel", onClick: () => panel.close() });
        form.append(name.el, unit.el, aliases.el, BudgetUI.buttonRow(buttons));
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!name.value()) return panel.setError("Give the food a name.");
          BudgetUI.submit(panel, () => Kitchen.saveFood({ name: name.value(), unit: unit.value(), aliases: aliases.value().split(",") }, index));
        });
      }
    });
  }

  //#endregion

  // =====================================================================
  // #region START
  // =====================================================================

  // Each card's heading opens and closes it
  for (const card of CARDS) {
    document.getElementById(`${card}Toggle`).addEventListener("click", () => setOpen(card, !openCards()[card]));
  }
  BudgetUI.wireUndoButtons();
  // (Settings' switches, on this device or another tab, change what glows)
  document.addEventListener("kitchen:settings", () => { if (workspaceLoaded) renderRecipesPage(); });

  // A link to a card (Change Logs' Go To) opens it and goes there
  window.workspaceReady.then((loaded) => {
    const card = CARDS.find(name => location.hash === `#${name}Card`);
    if (!loaded || !card) return;
    if (!openCards()[card]) setOpen(card, true);
    requestAnimationFrame(() => document.getElementById(`${card}Card`).scrollIntoView({ block: "start", behavior: window.lessMotion() ? "auto" : "smooth" }));
  });

  //#endregion
})();
