// Kitchen UI: the kitchen's windows and fields (Kitchen.js has the data and the changes): a recipe's window, a meal's (New
// Entry's Meal, a Meals entry tapped on the calendar, and a recipe's + on the Recipes page), the rows of foods a recipe or a
// meal has (amount, unit, and name: the name offers the foods list's names, and a known one fills in the unit it was used
// with last), and the list of recipes with a search box as its first line. Home, the Recipes page, Recurring, and the
// Quick Calendar page use it.

window.KitchenUI = (() => {
  "use strict";

  const el = (tag, className = "", text = "") => BudgetUI.element(tag, className, text);
  const own = (node) => BudgetUI.noTranslate(node);
  const toast = (message, warning = false) => BudgetUI.showToast(message, warning);
  const NAMES_LIST = "kitchenFoodNames";
  const REPEAT_UNITS = [{ value: "days", label: "Days" }, { value: "weeks", label: "Weeks" }, { value: "months", label: "Months" }];

  // How meals are saved: the budget's (Kitchen.js), or the Quick Calendar page's own (its icon's key: they wait there)
  let store = null;
  const useStore = (given) => { store = given; };

  // =====================================================================
  // #region FOODS
  // =====================================================================

  // The foods list's names (and other names), for any food box to offer as it's typed in (a datalist, made once a page)
  function foodNames() {
    let list = document.getElementById(NAMES_LIST);
    if (!list) {
      list = el("datalist");
      list.id = NAMES_LIST;
      document.body.append(list);
    }
    const names = Kitchen.data().foods.flatMap(row => [row[0], ...(row[2] || [])]);
    list.replaceChildren(...names.map((name) => {
      const option = el("option");
      option.value = name;
      return option;
    }));
    return list;
  }
  document.addEventListener("budget:updated", () => { if (document.getElementById(NAMES_LIST)) foodNames(); });

  // The unit a food was used with last, from the foods list ("" when it isn't there, or has none)
  function unitFor(name) {
    const key = Kitchen.nameKey(name);
    if (!key) return "";
    const row = Kitchen.data().foods.find(item => Kitchen.nameKey(item[0]) === key || (item[2] || []).some(alias => Kitchen.nameKey(alias) === key));
    return row ? row[1] : "";
  }

  // A food's name box: it offers the foods list's names, and a name it knows fills in an empty unit box with the unit used
  // last
  function foodNameBox(value, unitBox, label = "Food") {
    const box = el("input", "textInput foodName");
    box.type = "text";
    box.value = value || "";
    box.placeholder = label;
    box.maxLength = MAX_FOOD_NAME;
    box.autocomplete = "off";
    box.setAttribute("list", NAMES_LIST);
    box.setAttribute("aria-label", label);
    const fill = () => {
      if (unitBox.value.trim()) return;
      const unit = unitFor(box.value);
      if (unit) unitBox.value = unit;
    };
    box.addEventListener("change", fill);
    box.addEventListener("input", () => { if (Kitchen.data().foods.some(row => row[0] === box.value)) fill(); });
    return box;
  }

  // An amount box (a number, like 2 or 0.5) and a unit box (like lbs or g)
  function amountBox(value, label = "Amount") {
    const box = el("input", "textInput foodAmount");
    box.type = "text";
    box.inputMode = "decimal";
    box.autocomplete = "off";
    box.placeholder = "0";
    box.maxLength = 12;
    box.value = value === null || value === undefined ? "" : Kitchen.showAmount(value);
    box.setAttribute("aria-label", label);
    return box;
  }
  function unitBox(value, label = "Unit, like lbs or g") {
    const box = el("input", "textInput foodUnit");
    box.type = "text";
    box.autocomplete = "off";
    box.placeholder = "Unit";
    box.maxLength = MAX_FOOD_UNIT;
    box.value = value || "";
    box.setAttribute("aria-label", label);
    return box;
  }

  // A recipe's or a meal's foods: a row for each (amount, unit, name, and × to take it off), and + Food. value(): the rows
  // as typed, [[name, amount, unit]]; set(rows) puts others in.
  function foodRowsField({ rows = [], label = "Foods", hint = "Each one's amount, its unit (like lbs, g, or cups), and the food. A row without a food is left out." } = {}) {
    foodNames();
    const list = el("div", "foodRows");
    const line = (food = ["", null, ""]) => {
      const row = own(el("div", "foodRow"));
      const amount = amountBox(food[1]);
      const unit = unitBox(food[2]);
      const name = foodNameBox(food[0], unit);
      const remove = el("button", "foodRemove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", "Take this food off");
      remove.addEventListener("click", () => {
        const next = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        (next ? next.querySelector(".foodAmount") : add).focus();
      });
      row.append(amount, unit, name, remove);
      return row;
    };
    const add = el("button", "budgetButton foodAdd", "+ Food");
    add.type = "button";
    add.addEventListener("click", () => {
      const row = line();
      list.append(row);
      row.querySelector(".foodAmount").focus();
    });
    rows.forEach(food => list.append(line(food)));
    const box = el("div", "foodRowsBox");
    box.append(list, add);
    return {
      el: BudgetUI.field(label, box, { optional: true, hint }),
      value: () => [...list.children].map(row => [row.querySelector(".foodName").value, row.querySelector(".foodAmount").value, row.querySelector(".foodUnit").value]),
      set: (foods) => list.replaceChildren(...foods.map(line))
    };
  }

  // A food as words: "2 lbs Chicken"
  const foodWords = (food) => [Kitchen.amountWords(food[1], food[2]), food[0]].filter(Boolean).join(" ");

  //#endregion

  // =====================================================================
  // #region THE RECIPE LIST (a search box as its first line)
  // =====================================================================

  // The recipes in order, under a box that searches their titles. onOpen(recipe, button): a recipe's row was tapped;
  // onAdd(recipe, button), when given: its + (on the row's right). With Settings' Glow Recipes switch on, a recipe the
  // Pantry can't make now glows orange. draw() draws it again (after a change).
  function recipeList({ onOpen, onAdd = null, label = "Recipes" }) {
    const box = el("div", "recipeSearch");
    const search = el("input", "textInput recipeSearchBox");
    search.type = "search";
    search.placeholder = "Search recipes";
    search.autocomplete = "off";
    search.setAttribute("aria-label", "Search recipes");
    const list = el("ul", "recipeList");
    list.setAttribute("aria-label", label);
    const empty = el("p", "panelHint recipeListEmpty");
    function draw() {
      const words = cleanString(search.value);
      const glow = Kitchen.settings().glowRecipes;
      const recipes = Kitchen.recipesInOrder().filter(recipe => !words || cleanString(recipe.title).includes(words));
      list.replaceChildren(...recipes.map((recipe) => {
        const item = el("li", "recipeItem");
        const short = glow && !Kitchen.canMake(recipe.foods);
        item.classList.toggle("isShort", short);
        const open = el("button", "recipeOpen");
        open.type = "button";
        const count = recipe.foods.length;
        open.append(own(el("span", "recipeTitle", recipe.title)), el("span", "recipeDetail", `${count === 0 ? "No" : count} food${count === 1 ? "" : "s"}${short ? ", not enough in the Pantry" : ""}`));
        open.addEventListener("click", (event) => onOpen(recipe, event.currentTarget));
        item.append(open);
        if (onAdd) {
          const add = el("button", "budgetButton recipeAdd", "+");
          add.type = "button";
          add.setAttribute("aria-label", `Add ${recipe.title} to the calendar as a meal entry`);
          add.addEventListener("click", (event) => onAdd(recipe, event.currentTarget));
          item.append(add);
        }
        return item;
      }));
      empty.hidden = recipes.length > 0;
      empty.textContent = Kitchen.data().recipes.length === 0 ? "No recipes yet." : "No recipe's title has that in it.";
    }
    search.addEventListener("input", draw);
    box.append(search, list, empty);
    draw();
    return { el: box, draw, search };
  }

  //#endregion

  // =====================================================================
  // #region A RECIPE'S WINDOW
  // =====================================================================

  // A recipe (null for a new one): its title, its foods, and its notes at the bottom. Only the title has to be filled in.
  function openRecipe(origin, recipe = null) {
    return BudgetUI.openPanel({
      origin,
      size: "large",
      stacked: !!(origin && origin.closest && origin.closest(".budgetPanel")),
      title: recipe ? "Recipe" : "New Recipe",
      build(form, panel) {
        panel.panel.classList.add("kitchenPanel");
        const title = BudgetUI.textField({ label: "Title", value: recipe ? recipe.title : "", placeholder: "Like Pancakes or Chili", maxLength: MAX_TITLE });
        const foods = foodRowsField({ rows: recipe ? recipe.foods : [] });
        const notes = BudgetUI.textField({ label: "Notes", value: recipe ? recipe.notes : "", multiline: true, optional: true, placeholder: "Steps, the oven's heat, where it's from...", maxLength: MAX_KITCHEN_NOTES });
        notes.input.rows = 6;
        own(notes.input);
        const parts = [title.el, foods.el, notes.el];
        // (With Settings' Glow Recipes switch on: what the Pantry doesn't have enough of now)
        if (recipe && Kitchen.settings().glowRecipes && !Kitchen.canMake(recipe.foods)) {
          const missing = recipe.foods.filter(food => !Kitchen.canMake([food])).map(foodWords);
          parts.push(own(el("p", "panelHint kitchenShortNote", `The Pantry doesn't have enough ${missing.length > 0 ? `of: ${missing.join(", ")}` : "for all of it together"}.`)));
        }
        const buttons = [{ label: recipe ? "Save" : "Add Recipe", kind: "primary", type: "submit" }];
        if (recipe) {
          buttons.push({ label: "Delete", kind: "danger", onClick: () => {
            if (!window.confirm(`Delete ${recipe.title}? Meal entries filled in from it keep what it has now, as their own.`)) return;
            BudgetUI.submit(panel, () => Kitchen.deleteRecipe(recipe.id)).then((result) => { if (result.ok) toast(`Deleted ${recipe.title}.`); });
          } });
        }
        buttons.push({ label: "Cancel", onClick: () => panel.close() });
        form.append(...parts, BudgetUI.buttonRow(buttons));
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!title.value()) return panel.setError("Give the recipe a title.");
          BudgetUI.submit(panel, () => Kitchen.saveRecipe({ title: title.value(), foods: foods.value(), notes: notes.input.value }, recipe ? recipe.id : null))
            .then((result) => { if (result.ok) toast(recipe ? `Saved ${title.value()}.` : `${title.value()} is in your recipes.`); });
        });
      }
    });
  }

  //#endregion

  // =====================================================================
  // #region A MEAL'S WINDOW
  // =====================================================================

  // How often a meal repeats, and its last day: the Repeat switch, Every [number] [Days / Weeks / Months], and End repeat.
  // read(): { repeat, until } or { error }
  function repeatFields(meal, on = false) {
    const repeats = BudgetUI.checkboxField({ label: "Repeat", checked: meal ? !!meal.repeat : on });
    const count = el("input", "frequencyCount");
    count.type = "text";
    count.inputMode = "numeric";
    count.maxLength = 3;
    count.value = String(meal && meal.repeat ? meal.repeat.count : 1);
    count.setAttribute("aria-label", "How many days, weeks, or months");
    const unit = el("select", "selectInput frequencyUnit");
    for (const option of REPEAT_UNITS) unit.appendChild(new Option(option.label, option.value));
    unit.value = meal && meal.repeat ? meal.repeat.unit : "weeks";
    unit.setAttribute("aria-label", "Days, weeks, or months");
    const every = el("div", "frequencyRow");
    every.append(el("span", "frequencyEvery", "Every"), count, unit);
    const everyField = BudgetUI.field("Frequency", every, { hint: "Like every day, every week, or every 2 weeks." });
    const until = BudgetUI.dateField({ label: "End repeat", date: meal && meal.until ? createSafeMidnight(meal.until, true) : null, optional: true, hint: "The last day it can land on. Blank: it keeps repeating." });
    const box = el("div", "repeatBox");
    box.append(everyField, until.el);
    const show = () => { box.hidden = !repeats.input.checked; };
    repeats.input.addEventListener("change", show);
    show();
    return {
      els: [repeats.el, box],
      read() {
        if (!repeats.input.checked) return { repeat: null, until: null };
        const number = Number(count.value.trim());
        if (!Number.isInteger(number) || number < 1 || number > 999) return { error: "Pick how often it repeats: every 1 to 999 days, weeks, or months." };
        const stop = until.value();
        if (stop === undefined) return { error: "End repeat isn't a date. Clear it, or pick a day." };
        return { repeat: { count: number, unit: unit.value }, until: stop ? formatToYMD(stop) : null };
      }
    };
  }

  // A meal's window. options: meal (one already there, or null for a new one), day (the day of it tapped, YYYY-MM-DD),
  // date (a new one's day, a Date), recipe (a recipe to fill a new one in from), repeat (a new one starts repeating),
  // title (what was typed in another kind of New Entry), kinds (New Entry's three buttons: a budget entry, a calendar
  // entry, or a meal). A meal filled in from a recipe follows it (it changes when the recipe does) until its title, foods,
  // or notes are changed here; then they're its own. Only the title has to be filled in.
  function openMeal(origin, { meal = null, day = null, date = today, recipe = null, repeat = false, title = "", kinds = false } = {}) {
    const view = meal ? Kitchen.mealView(meal) : null;
    const locked = !!(meal && store && store.locked && store.locked(meal));
    const panelApi = BudgetUI.openPanel({
      origin,
      size: "large",
      stacked: !!(origin && origin.closest && origin.closest(".budgetPanel")),
      title: kinds ? "New Entry" : meal ? "Meal Entry" : "New Meal Entry",
      build(form, panel) {
        panel.panel.classList.add("kitchenPanel", "mealPanel");
        if (meal) {
          const heading = own(el("p", "panelText eventHeading", view.title));
          const color = Kitchen.data().color;
          heading.style.background = color;
          if (window.Fractals) heading.style.color = window.Fractals.textOn(color);
          form.append(heading);
        }
        if (locked) return lockedMeal(form, panel, meal, view, day);

        let followed = meal ? meal.recipe || null : recipe ? recipe.id : null;
        const start = meal ? (day || meal.start) : formatToYMD(date);
        const titleField = BudgetUI.textField({ label: "Title", value: view ? view.title : recipe ? recipe.title : title, placeholder: "Like Breakfast or Chili", maxLength: MAX_TITLE });
        const dayField = BudgetUI.dateField({ label: "Day", date: createSafeMidnight(start, true) });
        const repeatParts = repeatFields(meal, repeat);
        const foods = foodRowsField({ rows: view ? view.foods : recipe ? recipe.foods : [] });
        const notes = BudgetUI.noteField({ note: view ? view.notes : recipe ? recipe.notes : "", maxLength: MAX_KITCHEN_NOTES });

        // Fill In From A Recipe: a list under its button, with a search box as its first line
        const follows = own(el("p", "panelHint mealFollows"));
        const showFollows = () => {
          const from = followed ? Kitchen.recipeById(followed) : null;
          follows.hidden = !from;
          follows.textContent = from ? `Filled in from ${from.title}: while you leave its title, foods, and notes as they are, it changes when the recipe does. Change any of them, and they're this meal's own.` : "";
        };
        const pickBox = el("div", "recipePick");
        pickBox.hidden = true;
        const pickButton = el("button", "budgetButton recipePickButton", "Fill In From A Recipe ▾");
        pickButton.type = "button";
        pickButton.setAttribute("aria-expanded", "false");
        const picker = recipeList({
          label: "Recipes to fill it in from",
          onOpen: (picked) => {
            followed = picked.id;
            titleField.input.value = picked.title;
            foods.set(picked.foods);
            notes.set(picked.notes);
            showFollows();
            setPicking(false);
            titleField.input.focus();
          }
        });
        pickBox.append(picker.el);
        const setPicking = (open) => {
          pickBox.hidden = !open;
          pickButton.setAttribute("aria-expanded", String(open));
          pickButton.textContent = open ? "Fill In From A Recipe ▴" : "Fill In From A Recipe ▾";
          if (open) {
            picker.draw();
            picker.search.focus();
          }
        };
        pickButton.addEventListener("click", () => setPicking(pickBox.hidden));
        const pickControl = el("div", "recipePickControl");
        pickControl.append(pickButton, pickBox, follows);
        const pickField = BudgetUI.field("Recipe", pickControl, { optional: true });
        showFollows();

        // (A repeating one: just this day, or every time; changing how it repeats is about every time)
        const repeating = !!(meal && meal.repeat);
        const scope = BudgetUI.segmented([{ key: "one", label: "Just this day" }, { key: "all", label: "Every time" }], "one");
        const scopeField = BudgetUI.field("Change or delete", scope.el, { hint: repeating ? `It repeats (${Kitchen.repeatWords(meal.repeat).toLowerCase()}). Just this day leaves the rest as they are; changing how it repeats changes every time.` : "" });
        scopeField.hidden = !repeating || !day || !!store;
        if (repeating) {
          for (const part of repeatParts.els) for (const type of ["input", "change"]) part.addEventListener(type, () => scope.set("all"));
        }

        const kindPicker = kinds && window.Fractals ? [window.Fractals.kindSwitch("meal", (picked) => {
          const typed = { date: dayField.value() || date, title: titleField.value() };
          if (picked === "budget") BudgetUI.openNewEntry(origin, { date: typed.date, kind: "budget" });
          if (picked === "calendar") window.Fractals.openNewEvent(origin, { date: typed.date, title: typed.title });
        })] : [];
        const buttons = [{ label: meal ? "Save" : "Add Meal", kind: "primary", type: "submit" }];
        if (meal) buttons.push({ label: "Delete", kind: "danger", onClick: () => removeMeal(panel, meal, view, day, !!(repeating && day && !store && scope.value() === "one")) });
        buttons.push({ label: "Cancel", onClick: () => panel.close() });
        form.append(...kindPicker, pickField, titleField.el, dayField.el, ...repeatParts.els, foods.el, scopeField, BudgetUI.buttonRow(buttons), notes.el);

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          panel.setError("");
          if (!titleField.value()) return panel.setError("Give the meal a title.");
          const picked = dayField.value();
          if (!picked) return panel.setError(picked === undefined ? "That day isn't a date. Type one, or pick one." : "Pick the day it's on.");
          const repeatRead = repeatParts.read();
          if (repeatRead.error) return panel.setError(repeatRead.error);
          const fields = { title: titleField.value(), foods: foods.value(), notes: notes.value(), recipe: followed, start: formatToYMD(picked), repeat: repeatRead.repeat, until: repeatRead.until };
          const options = { id: meal ? meal.id : null, day, scope: repeating && day && !store ? scope.value() : "all" };
          panel.setBusy(true);
          const result = store ? await store.save(fields, options, meal) : await Kitchen.saveMeal(fields, options);
          panel.setBusy(false);
          if (!result.ok) return panel.setError(result.message || "Couldn't save it. Please try again.");
          panel.close();
          BudgetUI.warnIfUnsaved(result);
          toast(result.toast || (meal ? `Saved ${fields.title}.` : `Added ${fields.title} to your calendar.`));
        });
      }
    });
    if (meal) document.dispatchEvent(new CustomEvent("entry:opened", { detail: { panel: panelApi, kind: "event", id: `meal:${meal.id}`, day } }));
    return panelApi;
  }

  // A meal's Delete: every time, or just the day tapped of a repeating one
  async function removeMeal(panel, meal, view, day, one) {
    const on = day ? showDate(createSafeMidnight(day, true)) : "";
    if (!window.confirm(one ? `Delete ${view.title} on ${on} only?` : `Delete ${view.title}${meal.repeat ? ", every time it repeats" : ""}?`)) return;
    panel.setError("");
    panel.setBusy(true);
    const options = { day, scope: one ? "one" : "all" };
    const result = store ? await store.remove(meal, options) : await Kitchen.deleteMeal(meal.id, options);
    panel.setBusy(false);
    if (!result.ok) return panel.setError(result.message || "Couldn't delete it. Please try again.");
    panel.close();
    toast(`Deleted ${view.title}${one ? ` on ${on}` : ""}.`);
  }

  // A meal that only shows here (the Quick Calendar page's, once it's on the calendar): what it has, and Close
  function lockedMeal(form, panel, meal, view, day) {
    const when = day ? showDate(createSafeMidnight(day, true)) : showDate(createSafeMidnight(meal.start, true));
    const lines = [when, meal.repeat ? Kitchen.repeatWords(meal.repeat) : "", ...view.foods.map(foodWords)];
    for (const line of lines.filter(Boolean)) form.append(own(el("p", "panelText", line)));
    if (view.notes) form.append(own(el("p", "panelText eventNotes", view.notes)));
    form.append(el("p", "panelHint", "Sign in to Prismal Planning to change it."), BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
  }

  // New Entry as a meal (Home's and the Quick Calendar page's, with its three buttons across the top)
  function openNewMeal(origin, { date = today, title = "" } = {}) {
    return openMeal(origin, { date, title, kinds: !!window.Fractals });
  }

  // A recipe's + on the Recipes page: once, or repeating (also on the Recurring page's Recurring Meal Entries), then the
  // meal's window filled in from it
  function addRecipeAsMeal(origin, recipe) {
    BudgetUI.openPanel({
      origin,
      size: "small",
      title: `Add ${recipe.title}`,
      build(form, panel) {
        form.append(
          own(el("p", "panelText", `Put ${recipe.title} on your calendar as a meal entry, in the Meals fractal.`)),
          BudgetUI.buttonRow([
            { label: "A Meal Entry", kind: "primary", onClick: () => { panel.close(); openMeal(origin, { recipe }); } },
            { label: "A Recurring Meal Entry", onClick: () => { panel.close(); openMeal(origin, { recipe, repeat: true }); } },
            { label: "Cancel", onClick: () => panel.close() }
          ])
        );
      }
    });
  }

  //#endregion

  return {
    useStore,
    foodNames,
    foodRowsField,
    foodNameBox,
    amountBox,
    unitBox,
    foodWords,
    recipeList,
    openRecipe,
    openMeal,
    openNewMeal,
    addRecipeAsMeal
  };
})();
