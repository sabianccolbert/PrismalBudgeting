// Kitchen: the budget's recipes, Pantry, meals, and foods (kitchenData, kept and checked by Process Budget.js's THE
// KITCHEN), worked with on every signed-in budget page, and on the Quick Calendar page from its icon's answer:
//   - Foods by name: a name, one of a food's other names (its row in the foods list), and a plural ("eggs" and "egg") are
//     one food (foodKey)
//   - Units: grams, ounces, pounds, and the rest of mass go together, cups, spoons, liters, and the rest of volume, and a
//     count (blank, each, dozen); any other unit only with itself (unitOf)
//   - The Pantry against the meals: the meals from today on (after the last day that already came out of it) use it up in
//     order, and a day whose meals it doesn't have enough for is short (walk), which glows orange on Home while this
//     device's switch is on (Settings' Kitchen card)
//   - A meal's day: with Use Meals From The Pantry on (this device), its foods come out of the Pantry (useMeals)
//   - Every change runs like any change to the budget (runBudgetAction), and Home's Undo (and the Kitchen tab's, the same
//     steps) can take it back
// Kitchen UI.js has the windows, and Recipes Page.js the page.

window.Kitchen = (() => {
  "use strict";

  const MEALS_ID = "meals";          // The Meals fractal's id on the calendar (Fractals.js)
  const SETTINGS_KEY = "prismal_kitchen"; // This device's Kitchen settings (kept through a sign-out: Layout.js DEVICE_SETTINGS)
  const SETTING_NAMES = ["glowDays", "glowRecipes", "glowPantry", "useMeals"];
  const WALK_AHEAD_DAYS = 120;       // The fewest days the Pantry is walked ahead (more when a later day is asked about)
  const KITCHEN_FULL = "Your recipes, Pantry, and meals are full (about 1.9 MB together). Delete some, or make some notes shorter, first.";

  // =====================================================================
  // #region THE KITCHEN'S DATA
  // =====================================================================

  let given = null;  // The Quick Calendar page's kitchen (from its icon's answer), which has no budget
  let version = 0;   // Moves on with every change, so what's worked out from the kitchen is worked out again
  let kept = { version: -1 };

  // The kitchen this page has: the budget's, or the Quick Calendar page's (an empty one until either is in)
  let empty = null;
  const data = () => given || (typeof kitchenData !== "undefined" && kitchenData) || (empty = empty || emptyKitchen());

  // The Quick Calendar page's kitchen, as its icon's answer has it (checked like a load's), with the meals the icon queued
  // that haven't joined the budget yet (waiting: [meals, each with its id "waiting" and its number, and waiting: its number])
  function useData(stored, waiting = []) {
    const kept = stored && typeof stored === "object" ? stored : {};
    given = normalizeApiKitchen({ ...kept, meals: [...(Array.isArray(kept.meals) ? kept.meals : []), ...waiting] });
    changed();
  }

  // Is this a meal a Quick Calendar icon queued that hasn't joined the budget yet (on the Quick Calendar page)?
  const isWaiting = (meal) => !!given && String(meal.id).startsWith("waiting");

  // Something in the kitchen (or the day) changed: work it out again the next time it's asked. A budget change that says
  // which of its tables changed (processBudgetAction's) counts only when the kitchen is one of them, so the Pantry's walk
  // isn't done again for a change elsewhere in the budget.
  function changed(event) {
    const tables = event && event.detail && event.detail.tables;
    if (tables && !tables.has("kitchen")) return;
    version++;
  }
  document.addEventListener("budget:updated", changed);

  // What's worked out once per change (and again for another kitchen: the budget's once it's in, or one an Undo put back):
  // the foods' names (name, other names -> the food's key), each name's food (foodKey), the Pantry as amounts (stock), and
  // the Pantry's walk
  function index() {
    if (kept.version === version && kept.source === data()) return kept;
    const keys = new Map();
    const foods = data().foods;
    for (const row of foods) {
      const key = nameKey(row[0]);
      if (key && !keys.has(key)) keys.set(key, key);
    }
    for (const row of foods) {
      for (const alias of row[2] || []) {
        const key = nameKey(alias);
        if (key && !keys.has(key)) keys.set(key, nameKey(row[0]));
      }
    }
    kept = { version, source: data(), keys, foodKeys: new Map(), stock: null, walk: null };
    return kept;
  }

  const recipeById = (id) => data().recipes.find(recipe => recipe.id === id) || null;

  // (One collator for every comparison: localeCompare with options makes one each time it's called, which held up each
  // key typed in the recipes' search)
  const TITLE_ORDER = new Intl.Collator(undefined, { sensitivity: "base" });

  // Recipes in order by title
  function recipesInOrder() {
    return [...data().recipes].sort((a, b) => TITLE_ORDER.compare(a.title, b.title));
  }

  // What a meal shows: its own title, foods, and notes, or (while it follows one) its recipe's as the recipe is now.
  // { title, foods, notes, recipe (the recipe it follows, or null) }
  function mealView(meal) {
    const recipe = meal.recipe ? recipeById(meal.recipe) : null;
    const from = recipe || meal;
    return { title: from.title || "Meal", foods: from.foods || [], notes: from.notes || "", recipe };
  }

  // A meal's days, the way Dates.js's Repeats reads them
  const mealDays = (meal) => ({ start: meal.start, end: meal.start, repeat: meal.repeat || null, until: meal.until || null, skip: meal.skip || [] });

  // Every meal on the days from one through another (YYYY-MM-DD), in order: [{ meal, day }] (one day's in the meals' order)
  function mealsBetween(from, to) {
    const list = [];
    data().meals.forEach((meal, order) => {
      for (const { day } of Repeats.occurrences(mealDays(meal), from, to)) list.push({ meal, day, order });
    });
    return list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.order - b.order));
  }

  //#endregion

  // =====================================================================
  // #region FOODS AND UNITS
  // =====================================================================

  // Each unit people write, by the kind of amount it is and how many of that kind's smallest unit it is (grams,
  // milliliters, or one)
  const UNITS = new Map();
  const units = (group, factor, names) => names.forEach(name => UNITS.set(name, { group, factor }));
  units("mass", 1, ["g", "gs", "gram", "grams", "gr", "grs"]);
  units("mass", 1000, ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"]);
  units("mass", 0.001, ["mg", "mgs", "milligram", "milligrams"]);
  units("mass", 28.349523125, ["oz", "ozs", "ounce", "ounces"]);
  units("mass", 453.59237, ["lb", "lbs", "pound", "pounds"]);
  units("volume", 1, ["ml", "mls", "milliliter", "milliliters", "millilitre", "millilitres", "cc"]);
  units("volume", 1000, ["l", "ls", "liter", "liters", "litre", "litres", "ltr"]);
  units("volume", 4.92892159375, ["tsp", "tsps", "teaspoon", "teaspoons"]);
  units("volume", 14.78676478125, ["tbsp", "tbsps", "tbs", "tablespoon", "tablespoons"]);
  units("volume", 29.5735295625, ["fl oz", "floz", "fluid ounce", "fluid ounces", "fl ounce", "fl ounces"]);
  units("volume", 236.5882365, ["c", "cup", "cups"]);
  units("volume", 473.176473, ["pt", "pts", "pint", "pints"]);
  units("volume", 946.352946, ["qt", "qts", "quart", "quarts"]);
  units("volume", 3785.411784, ["gal", "gals", "gallon", "gallons"]);
  units("count", 1, ["", "each", "ea", "count", "ct", "item", "items", "piece", "pieces", "pc", "pcs", "whole"]);
  units("count", 12, ["dozen", "dozens", "doz"]);

  // A word without a plural's ending ("berries" berry, "tomatoes" tomato, "boxes" box, "eggs" egg; "hummus" stays)
  function singular(word) {
    if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
    if (word.length > 4 && /(ss|x|z|ch|sh|o)es$/.test(word)) return word.slice(0, -2);
    if (word.length > 2 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
    return word;
  }

  // A food's name as names are compared: like titles (cleanString), with its last word without a plural's ending
  function nameKey(name) {
    const words = cleanString(name).split(" ");
    words[words.length - 1] = singular(words[words.length - 1]);
    return words.join(" ");
  }

  // Which food a name is: the foods list's row it's the name or one of the other names of, or else its own (each name
  // worked out once per change)
  function foodKey(name) {
    const known = index();
    const text = String(name ?? "");
    let key = known.foodKeys.get(text);
    if (key === undefined) {
      const own = nameKey(text);
      key = known.keys.get(own) || own;
      known.foodKeys.set(text, key);
    }
    return key;
  }

  // A unit: { group ("mass", "volume", "count", or "unit:" and itself), factor (how many of its group's smallest) }, each
  // worked out once
  const unitsRead = new Map();
  function unitOf(unit) {
    const typed = String(unit ?? "");
    if (unitsRead.has(typed)) return unitsRead.get(typed);
    const text = typed.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
    const read = UNITS.get(text) || UNITS.get(singular(text)) || { group: `unit:${singular(text)}`, factor: 1 };
    if (unitsRead.size < 5000) unitsRead.set(typed, read);
    return read;
  }

  // An amount as it's shown: up to three decimal places, without trailing zeros
  function showAmount(amount) {
    if (amount === null || amount === undefined) return "";
    return String(Math.round(amount * 1000) / 1000);
  }

  // A food's amount and unit as words ("2 lbs", "3"), or "" for neither
  const amountWords = (amount, unit) => [showAmount(amount), unit || ""].filter(Boolean).join(" ");

  //#endregion

  // =====================================================================
  // #region THE PANTRY AGAINST THE MEALS
  // =====================================================================

  // Less than this much of a food (a millionth of a gram, a milliliter, or one) is none: what's left of a food used up
  // exactly can come out a hair over 0
  const NONE_LEFT = 1e-6;

  // The Pantry as amounts to use: Map(a food's key -> [{ unit, amount (in its group's smallest unit; null for one without
  // an amount, which is never used up), row (its index in the Pantry) }], each food's in the Pantry's order)
  function stockOf(pantry) {
    const stock = new Map();
    pantry.forEach((row, at) => {
      if (String(row[0]).trim() === "-" || !row[0]) return;
      const unit = unitOf(row[2]);
      const key = foodKey(row[0]);
      if (!stock.has(key)) stock.set(key, []);
      stock.get(key).push({ unit, amount: row[1] === null ? null : row[1] * unit.factor, row: at });
    });
    return stock;
  }

  // The Pantry as it is now, to use up: a copy of each food's amounts, made as the food is first asked for (base: the
  // stock to copy; to start, the kitchen's, worked out once per change). lots(key) is a food's; all() every one copied.
  function stockToUse(base = null) {
    const known = index();
    const from = base || (known.stock = known.stock || stockOf(data().pantry));
    const copied = new Map();
    return {
      lots(key) {
        if (!copied.has(key)) copied.set(key, (from.get(key) || []).map(lot => ({ ...lot })));
        return copied.get(key);
      },
      all: () => copied
    };
  }

  // Take a food ([name, amount, unit]) from what's left, in order (what's there is used even when it isn't enough): true
  // when there was enough. One without an amount only has to be there. Amounts in another kind of unit (grams against
  // cups) don't count; one without an amount covers any.
  function take(stock, food) {
    const lots = stock.lots(foodKey(food[0]));
    if (!food[1]) return lots.some(lot => lot.amount === null || lot.amount > NONE_LEFT);
    const unit = unitOf(food[2]);
    const same = lots.filter(lot => lot.unit.group === unit.group);
    if (same.some(lot => lot.amount === null)) return true;
    const need = food[1] * unit.factor;
    let left = need;
    for (const lot of same) {
      const used = Math.min(lot.amount, left);
      lot.amount -= used;
      left -= used;
      if (left <= need * 1e-9) return true;
    }
    return false;
  }

  // The first day whose meals the Pantry still has to cover: today, or tomorrow once today's came out of it
  function walkStart() {
    const first = formatToYMD(today);
    const used = data().usedThrough;
    return used && used >= first ? Repeats.plusDays(first, 1) : first;
  }

  // The Pantry against the meals from walkStart through a day (at least WALK_AHEAD_DAYS): { start, through, short (a Set
  // of the days without enough), foods (Map: a food's key -> { day: the first day it runs short, name }), stock (what it
  // left in the Pantry) }. Worked out once per change of the kitchen. A later day asked about goes on from where the walk
  // stopped, with what it left (the meals are walked in their days' order, so that's the same as walking it all again).
  function walk(through = formatToYMD(today)) {
    const known = index();
    if (known.walk && known.walk.through >= through) return known.walk;
    const start = walkStart();
    const least = Repeats.plusDays(start, WALK_AHEAD_DAYS);
    // (Past that, as far again as the least, so the days drawn after it don't each walk it again)
    const end = through > least ? Repeats.plusDays(through, WALK_AHEAD_DAYS) : least;
    const kept = known.walk && known.walk.start === start ? known.walk : null;
    const stock = kept ? kept.stock : stockToUse();
    const short = new Set(kept ? kept.short : []);
    const foods = new Map(kept ? kept.foods : []);
    // (Each recipe found by its id once, not by looking through the recipes for every meal's day)
    const recipes = new Map();
    for (const recipe of data().recipes) if (!recipes.has(recipe.id)) recipes.set(recipe.id, recipe);
    const foodsOf = (meal) => ((meal.recipe && recipes.get(meal.recipe)) || meal).foods || [];
    for (const { meal, day } of mealsBetween(kept ? Repeats.plusDays(kept.through, 1) : start, end)) {
      for (const food of foodsOf(meal)) {
        if (take(stock, food)) continue;
        short.add(day);
        const key = foodKey(food[0]);
        if (!foods.has(key)) foods.set(key, { day, name: food[0] });
      }
    }
    known.walk = { start, through: end, short, foods, stock };
    return known.walk;
  }

  // Is a day (a Date) one the Pantry doesn't have enough for?
  function shortOn(date) {
    const ymd = formatToYMD(date);
    return ymd >= walkStart() && walk(ymd).short.has(ymd);
  }

  // The foods the meals from today through a day (YYYY-MM-DD) run short of: Map(a food's key -> { day, name })
  function shortFoods(through) {
    return new Map([...walk(through).foods].filter(([, food]) => food.day <= through));
  }

  // Could the Pantry as it is now make these foods ([[name, amount, unit]])?
  function canMake(foods) {
    const stock = stockToUse();
    return foods.every(food => take(stock, food));
  }

  // The reminders' plan's days from one day through another (YYYY-MM-DD): { day: { meals (true: the Pantry is short
  // that day), expired (how many of the Pantry's foods expire that day) } }, only the days with either
  function planDays(from, to) {
    const days = {};
    const day = (ymd) => (days[ymd] = days[ymd] || {});
    for (const ymd of walk(to).short) if (ymd >= from && ymd <= to) day(ymd).meals = true;
    for (const row of data().pantry) {
      if (String(row[0]).trim() === "-" || !row[3]) continue;
      const ymd = formatToYMD(createSafeMidnight(row[3], true));
      if (ymd >= from && ymd <= to) day(ymd).expired = (day(ymd).expired || 0) + 1;
    }
    return days;
  }

  //#endregion

  // =====================================================================
  // #region THIS DEVICE'S SETTINGS
  // =====================================================================
  // Settings' Kitchen card (each off to start): glowDays (Home's days the Pantry is short on glow orange, while Meals
  // shows), glowRecipes (recipes the Pantry can't make glow on the Kitchen tab), glowPantry (the Pantry's foods the
  // calendar's meals run short of glow), and useMeals (a meal's foods come out of the Pantry on its day, from useSince: the
  // day it was turned on). Its two reminders are the account's (Settings Page.js), like the Reminders card's.

  let settingsRead = null;

  function settings() {
    if (settingsRead) return settingsRead;
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch {}
    const read = {};
    for (const name of SETTING_NAMES) read[name] = !!(stored && stored[name] === true);
    read.useSince = stored && read.useMeals ? kitchenDay(stored.useSince) || formatToYMD(today) : "";
    settingsRead = read;
    return read;
  }

  // Turn one on or off (this device), and draw again
  function setSetting(name, on) {
    if (!SETTING_NAMES.includes(name)) return;
    const next = { ...settings(), [name]: !!on };
    if (name === "useMeals") next.useSince = on ? formatToYMD(today) : "";
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    settingsRead = null;
    document.dispatchEvent(new CustomEvent("kitchen:settings"));
    if (name === "useMeals" && on) useMeals();
  }

  // (Another tab changed them)
  window.addEventListener("storage", (event) => {
    if (event.key !== SETTINGS_KEY) return;
    settingsRead = null;
    document.dispatchEvent(new CustomEvent("kitchen:settings"));
  });

  // Does a day of Home's calendar glow orange? (The switch is on, the calendar shows Meals, and the Pantry is short then.
  // Never on the Quick Calendar page, which doesn't see the Pantry.) Whether Meals shows is read once, until what the
  // calendar shows changes, not for every day drawn.
  let mealsShown = null;
  document.addEventListener("fractals:changed", () => { mealsShown = null; });
  function dayGlows(date) {
    if (given || !settings().glowDays || !window.Fractals) return false;
    if (mealsShown === null) mealsShown = window.Fractals.view() !== "budget" && window.Fractals.isShown(MEALS_ID);
    return mealsShown && shortOn(date);
  }

  //#endregion

  // =====================================================================
  // #region CHANGES
  // =====================================================================
  // Each runs like any change to the budget (logged, saved, and drawn again), and can be undone with Home's Undo and the
  // Kitchen tab's (the same steps). Each resolves to { ok, message, ... }.

  const run = (logType, label, work) => runBudgetAction(logType, work, { label, dates: [] });

  // Everything in the kitchen has to fit in one part of the budget
  function fits() {
    if (new TextEncoder().encode(JSON.stringify(kitchenData)).length > MAX_TABLE_BYTES) throw new BudgetInputError(KITCHEN_FULL);
  }

  // The foods list learns the foods a change used: a new name goes at its end with its unit, and one it has keeps the
  // unit used last (a blank one leaves it as it was)
  function learnFoods(foods) {
    const list = kitchenData.foods;
    for (const [name, , unit] of foods) {
      const key = nameKey(name);
      if (!key) continue;
      const found = list.find(row => nameKey(row[0]) === key || (row[2] || []).some(alias => nameKey(alias) === key));
      if (found) {
        if (unit) found[1] = unit;
      } else if (list.length < MAX_FOOD_ROWS) {
        list.push([kitchenText(name, MAX_FOOD_NAME), kitchenText(unit, MAX_FOOD_UNIT), []]);
      }
    }
  }

  // A food's name, checked
  function foodName(value) {
    const name = kitchenText(value, MAX_FOOD_NAME);
    if (!name) throw new BudgetInputError("Give the food a name.");
    if (name === "-") throw new BudgetInputError("A food's name can't be only a dash.");
    return name;
  }

  // A typed amount, checked: a number from 0 up, or null for none
  function foodAmount(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const amount = kitchenAmount(value);
    if (amount === null) throw new BudgetInputError("An amount is a number from 0 up, like 2 or 0.5.");
    return amount;
  }

  // A recipe's or a meal's food rows as typed ([[name, amount, unit]]), checked (rows without a name are left out)
  function foodRows(rows) {
    const list = (rows || []).filter(row => kitchenText(row[0], MAX_FOOD_NAME))
      .map(row => [foodName(row[0]), foodAmount(row[1]), kitchenText(row[2], MAX_FOOD_UNIT)]);
    if (list.length > MAX_RECIPE_FOODS) throw new BudgetInputError(`A recipe or a meal can have up to ${MAX_RECIPE_FOODS} foods.`);
    return list;
  }

  /* ---------- Recipes ---------- */

  // A new recipe (id null) or a changed one: fields { title, foods ([[name, amount, unit]]), notes }
  function saveRecipe(fields, id = null) {
    const title = kitchenText(fields.title, MAX_TITLE);
    return run("🍳 Recipes", `${id ? "changed" : "added"} the recipe ${title}`, () => {
      if (!title) throw new BudgetInputError("Give the recipe a title.");
      const list = kitchenData.recipes;
      const at = id ? list.findIndex(recipe => recipe.id === id) : -1;
      if (id && at === -1) throw new BudgetInputError("That recipe isn't there anymore.");
      if (!id && list.length >= MAX_RECIPES) throw new BudgetInputError(`You can keep up to ${MAX_RECIPES} recipes. Delete one first.`);
      const recipe = { id: id || newKitchenId(), title, foods: foodRows(fields.foods), notes: String(fields.notes ?? "").slice(0, MAX_KITCHEN_NOTES) };
      if (at === -1) list.push(recipe);
      else list[at] = recipe;
      learnFoods(recipe.foods);
      fits();
      formEntryRow[3] = `${id ? "Changed" : "Added"}: ${title}`;
      formEntryRow[4] = `Foods: ${recipe.foods.length}`;
      return { recipe: recipe.id };
    });
  }

  // Delete a recipe. The meals that follow it keep what it has, as meals of their own.
  function deleteRecipe(id) {
    const recipe = recipeById(id);
    return run("🍳 Recipes", `deleted the recipe ${recipe ? recipe.title : ""}`, () => {
      const at = kitchenData.recipes.findIndex(item => item.id === id);
      if (at === -1) throw new BudgetInputError("That recipe isn't there anymore.");
      const gone = kitchenData.recipes[at];
      kitchenData.meals = kitchenData.meals.map((meal) => {
        if (meal.recipe !== id) return meal;
        const own = { ...meal, title: gone.title, foods: JSON.parse(JSON.stringify(gone.foods)), notes: gone.notes };
        delete own.recipe;
        return own;
      });
      kitchenData.recipes.splice(at, 1);
      formEntryRow[3] = `Deleted: ${gone.title}`;
      return {};
    });
  }

  /* ---------- The Pantry ---------- */

  // A new food in the Pantry (index null: at its end) or a changed one: fields { name, amount, unit, expires (a Date, or
  // null for none) }
  function savePantryFood(fields, index = null) {
    const name = kitchenText(fields.name, MAX_FOOD_NAME);
    return run("🥫 Pantry", `${index === null ? "added" : "changed"} ${name} in the Pantry`, () => {
      const rows = kitchenData.pantry;
      const was = index === null ? null : rows[index];
      if (index !== null && (!was || String(was[0]).trim() === "-")) throw new BudgetInputError("That food isn't in the Pantry anymore.");
      if (index === null && rows.filter(row => String(row[0]).trim() !== "-").length >= MAX_PANTRY_ROWS) {
        throw new BudgetInputError(`The Pantry can hold up to ${MAX_PANTRY_ROWS} foods. Delete some first.`);
      }
      const row = [foodName(fields.name), foodAmount(fields.amount), kitchenText(fields.unit, MAX_FOOD_UNIT), kitchenExpires(fields.expires), was ? was[4] : ""];
      if (was) rows[index] = row;
      else rows.push(row);
      learnFoods([[row[0], row[1], row[2]]]);
      fits();
      formEntryRow[3] = `${was ? "Changed" : "Added"}: ${row[0]}`;
      formEntryRow[4] = amountWords(row[1], row[2]) ? `Amount: ${amountWords(row[1], row[2])}` : "";
      formEntryRow[5] = row[3] ? `Expires: ${showStoredDate(row[3])}` : "";
      return {};
    });
  }

  // Check or uncheck a Pantry food as on the shopping list (everyone the budget is shared with sees it)
  function setShopping(index, on) {
    const row = data().pantry[index];
    const name = row ? row[0] : "";
    return run("🥫 Pantry", `${on ? "checked" : "unchecked"} ${name} on the shopping list`, () => {
      const now = kitchenData.pantry[index];
      if (!now || String(now[0]).trim() === "-" || now[0] !== name) throw new BudgetInputError("That food isn't in the Pantry anymore.");
      now[4] = on ? "1" : "";
      formEntryRow[3] = `${on ? "On" : "Off"} The Shopping List: ${name}`;
      return {};
    });
  }

  /* ---------- Your foods ---------- */

  // A new food in the list (index null) or a changed one: fields { name, unit, aliases ([other names]) }. A name (or
  // other name) another food in the list has already is refused.
  function saveFood(fields, index = null) {
    const name = kitchenText(fields.name, MAX_FOOD_NAME);
    return run("🧺 Foods", `${index === null ? "added" : "changed"} ${name} in your foods`, () => {
      const list = kitchenData.foods;
      if (index !== null && !list[index]) throw new BudgetInputError("That food isn't in your list anymore.");
      if (index === null && list.length >= MAX_FOOD_ROWS) throw new BudgetInputError(`Your list can have up to ${MAX_FOOD_ROWS} foods. Delete some first.`);
      const row = [foodName(fields.name), kitchenText(fields.unit, MAX_FOOD_UNIT), []];
      const own = nameKey(row[0]);
      for (const alias of fields.aliases || []) {
        const text = kitchenText(alias, MAX_FOOD_NAME);
        const key = nameKey(text);
        if (!text || key === own || row[2].some(known => nameKey(known) === key)) continue;
        row[2].push(text);
      }
      if (row[2].length > MAX_FOOD_ALIASES) throw new BudgetInputError(`A food can have up to ${MAX_FOOD_ALIASES} other names.`);
      for (const key of [own, ...row[2].map(nameKey)]) {
        const other = list.find((item, at) => at !== index && (nameKey(item[0]) === key || (item[2] || []).some(alias => nameKey(alias) === key)));
        if (other) throw new BudgetInputError(`${other[0]} in your list has that name already. Change that one instead, or give this one another name.`);
      }
      if (index === null) list.push(row);
      else list[index] = row;
      fits();
      formEntryRow[3] = `${index === null ? "Added" : "Changed"}: ${row[0]}`;
      formEntryRow[4] = row[1] ? `Unit: ${row[1]}` : "";
      formEntryRow[5] = row[2].length > 0 ? `Other Names: ${row[2].join(", ")}` : "";
      return {};
    });
  }

  /* ---------- Meals ---------- */

  // A meal as it's kept, from what a form has: fields { title, foods, notes, recipe (the recipe it was filled in from, or
  // null), start (YYYY-MM-DD), repeat ({ count, unit } or null), until (YYYY-MM-DD or null) }. It follows the recipe
  // while its title, foods, and notes are the recipe's; changed at all, they're its own from then on. keep: { id, skip,
  // waiting } to keep.
  function mealFrom(fields, keep = {}) {
    const start = kitchenDay(fields.start);
    if (!start) throw new BudgetInputError("Pick the day it's on.");
    const recipe = fields.recipe ? recipeById(fields.recipe) : null;
    const title = kitchenText(fields.title, MAX_TITLE);
    if (!title) throw new BudgetInputError("Give the meal a title.");
    const foods = foodRows(fields.foods);
    const notes = String(fields.notes ?? "").slice(0, MAX_KITCHEN_NOTES);
    const meal = { id: keep.id || newKitchenId(), start };
    if (fields.repeat) {
      meal.repeat = kitchenRepeat(fields.repeat);
      if (!meal.repeat) throw new BudgetInputError(`Pick how often it repeats: every 1 to ${LIMITS.frequencyCount} days, weeks, or months.`);
      const until = fields.until ? kitchenDay(fields.until) : "";
      if (fields.until && (!until || until < start)) throw new BudgetInputError("It can stop repeating on its first day or any day after.");
      if (until) meal.until = until;
      const skip = (keep.skip || []).filter(day => day >= start && (!until || day <= until));
      if (skip.length > 0) meal.skip = skip;
    }
    const same = recipe && title === recipe.title && JSON.stringify(foods) === JSON.stringify(recipe.foods) && notes.trim() === recipe.notes.trim();
    if (same) {
      meal.recipe = recipe.id;
    } else {
      meal.title = title;
      meal.foods = foods;
      meal.notes = notes;
    }
    if (keep.waiting) meal.waiting = keep.waiting;
    return meal;
  }

  // Past MAX_MEALS, the oldest meals that happened once, more than a year ago, are let go first
  function roomForMeals() {
    if (kitchenData.meals.length <= MAX_MEALS) return;
    const yearAgo = formatToYMD(addDays(today, -365));
    const old = kitchenData.meals.filter(meal => !meal.repeat && meal.start < yearAgo).sort((a, b) => (a.start < b.start ? -1 : 1));
    const drop = new Set(old.slice(0, kitchenData.meals.length - MAX_MEALS).map(meal => meal.id));
    kitchenData.meals = kitchenData.meals.filter(meal => !drop.has(meal.id));
    if (kitchenData.meals.length > MAX_MEALS) throw new BudgetInputError(`You can have up to ${MAX_MEALS} meal entries. Delete some first.`);
  }

  // A new meal (id null), or a changed one. A repeating one's change is for every time (scope "all"), or for just the day
  // tapped (scope "one", day: YYYY-MM-DD), which leaves that day out of it and puts it on its own as the form has it. For
  // every time, the form shows the tapped day: the days it moved by move the whole meal.
  function saveMeal(fields, { id = null, day = null, scope = "all" } = {}) {
    const title = kitchenText(fields.title, MAX_TITLE);
    const on = kitchenDay(fields.start) ? showDate(createSafeMidnight(fields.start, true)) : "";
    return run("🍽️ Meal Entries", `${id ? "changed" : "added"} ${title}${on ? ` on ${on}` : ""}`, () => {
      const meals = kitchenData.meals;
      if (!id) {
        meals.push(mealFrom(fields));
      } else {
        const at = meals.findIndex(meal => meal.id === id);
        if (at === -1) throw new BudgetInputError("That meal isn't there anymore.");
        const old = meals[at];
        if (old.repeat && scope === "one" && day) {
          old.skip = [...new Set([...(old.skip || []), day])].sort().slice(-MAX_MEAL_SKIPS);
          meals.push(mealFrom({ ...fields, repeat: null, until: null }));
        } else if (old.repeat && fields.repeat) {
          // (Opened from the Recurring page, the form shows its first day)
          const moved = Repeats.daysBetween(day || old.start, fields.start);
          const start = Repeats.plusDays(old.start, moved);
          const skip = (old.skip || []).map(skipped => Repeats.plusDays(skipped, moved));
          meals[at] = mealFrom({ ...fields, start }, { id, skip, waiting: old.waiting });
        } else {
          meals[at] = mealFrom(fields, { id, waiting: old.waiting });
        }
      }
      roomForMeals();
      learnFoods(foodRows(fields.foods));
      fits();
      formEntryRow[3] = `${id ? "Changed" : "Added"}: ${title}`;
      formEntryRow[4] = on ? `${fields.repeat ? "From" : "On"}: ${on}` : "";
      formEntryRow[5] = fields.repeat ? `Repeats: ${repeatWords(fields.repeat)}` : "";
      return {};
    });
  }

  // Delete a meal: every time (scope "all"), or just one day of a repeating one (that day's left out; one with no days left
  // goes)
  function deleteMeal(id, { day = null, scope = "all" } = {}) {
    const meal = data().meals.find(item => item.id === id);
    const title = meal ? mealView(meal).title : "";
    const one = !!(meal && meal.repeat && scope === "one" && day);
    return run("🍽️ Meal Entries", `deleted ${title}${one ? ` on ${showDate(createSafeMidnight(day, true))}` : ""}`, () => {
      const at = kitchenData.meals.findIndex(item => item.id === id);
      if (at === -1) throw new BudgetInputError("That meal isn't there anymore.");
      const now = kitchenData.meals[at];
      if (one) {
        now.skip = [...new Set([...(now.skip || []), day])].sort().slice(-MAX_MEAL_SKIPS);
        if (Repeats.nextDay(mealDays(now), now.start) === null) kitchenData.meals.splice(at, 1);
      } else {
        kitchenData.meals.splice(at, 1);
      }
      formEntryRow[3] = `Deleted: ${title}`;
      formEntryRow[4] = one ? `On: ${showDate(createSafeMidnight(day, true))}` : "";
      return {};
    });
  }

  // "Every 2 Weeks"
  function repeatWords(repeat) {
    const unit = repeat.unit.slice(0, -1);
    return repeat.count === 1 ? `Every ${capitalize(unit)}` : `Every ${repeat.count} ${capitalize(repeat.unit)}`;
  }

  // The Meals fractal's color (the budget's, like Holidays')
  function saveColor(color) {
    return runBudgetAction("🍽️ Meals", () => {
      const picked = String(color ?? "").toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(picked)) throw new BudgetInputError("Pick a color for it.");
      kitchenData.color = picked;
      formEntryRow[3] = "New color";
      return {};
    });
  }

  // Meals Quick Calendar icons queued (the API's fractal_waiting: [{ id, meal }]) join the budget's Meals. One already in it
  // (a meal keeps the number it waited under) isn't added again. Resolves to { ok }.
  function takeWaitingMeals(items) {
    const fresh = items.filter(item => !data().meals.some(meal => meal.waiting === item.id));
    if (fresh.length === 0) return Promise.resolve({ ok: true });
    const named = fresh.length === 1 ? kitchenText(fresh[0].meal.title, MAX_TITLE) : `${fresh.length} meals`;
    return run("🍽️ Meal Entries", `added ${named} from Quick Calendar`, () => {
      const adding = fresh.filter(item => !kitchenData.meals.some(meal => meal.waiting === item.id));
      for (const item of adding) kitchenData.meals.push(mealFrom(item.meal, { waiting: item.id }));
      roomForMeals();
      learnFoods(adding.flatMap(item => foodRows(item.meal.foods)));
      fits();
      formEntryRow[3] = `Added From Quick Calendar: ${adding.map(item => kitchenText(item.meal.title, MAX_TITLE)).join(", ")}`;
      return {};
    });
  }

  /* ---------- A meal's day: its foods come out of the Pantry ---------- */

  // The meals whose foods are due to come out of the Pantry: from the day after the last day that did (or the day this
  // device turned Use Meals From The Pantry on, when that's later) through today, each once
  function dueMeals() {
    const set = settings();
    if (!set.useMeals) return [];
    const last = formatToYMD(today);
    const used = data().usedThrough;
    let from = set.useSince || last;
    if (used && Repeats.plusDays(used, 1) > from) from = Repeats.plusDays(used, 1);
    if (from > last) return [];
    return mealsBetween(from, last).filter(item => mealView(item.meal).foods.length > 0);
  }

  // Take the meals that are due out of the Pantry (with this device's switch on): each food from the Pantry's foods in
  // order, as far as there's any, never below 0. Logged as a change of its own.
  let using = null;
  function useMeals() {
    if (using) return using;
    if (typeof workspaceLoaded === "undefined" || !workspaceLoaded || SNAPSHOT_KEY || given || dueMeals().length === 0) return Promise.resolve(null);
    using = runBudgetAction("🍽️ Meals From The Pantry", () => {
      const due = dueMeals();
      if (due.length === 0) throw new BudgetInputError("");
      const stock = stockToUse(stockOf(kitchenData.pantry));
      for (const { meal } of due) for (const food of mealView(meal).foods) take(stock, food);
      for (const lots of stock.all().values()) {
        for (const lot of lots) {
          if (lot.amount === null) continue;
          const row = kitchenData.pantry[lot.row];
          const left = lot.amount > NONE_LEFT ? Math.round((lot.amount / lot.unit.factor) * 1000) / 1000 : 0;
          if (left !== row[1]) row[1] = left;
        }
      }
      kitchenData.usedThrough = formatToYMD(today);
      const days = [...new Set(due.map(item => item.day))];
      formEntryRow[3] = `Meals: ${due.length}`;
      formEntryRow[4] = `Days: ${days.slice(0, 7).map(ymd => showDay(createSafeMidnight(ymd, true))).join(", ")}${days.length > 7 ? ", ..." : ""}`;
      return {};
    }).finally(() => { using = null; });
    return using;
  }

  // Once the budget's in (and on the day it changes), the meals that are due come out of the Pantry
  if (window.workspaceReady) window.workspaceReady.then((loaded) => { if (loaded) useMeals(); });

  //#endregion

  return {
    MEALS_ID,
    data,
    useData,
    isWaiting,
    checkMeal: (fields) => mealFrom(fields),
    takeWaitingMeals,
    changed,
    recipeById,
    recipesInOrder,
    mealView,
    mealDays,
    mealsBetween,
    nameKey,
    foodKey,
    unitOf,
    showAmount,
    amountWords,
    walkStart,
    shortOn,
    shortFoods,
    canMake,
    planDays,
    settings,
    setSetting,
    dayGlows,
    saveRecipe,
    deleteRecipe,
    savePantryFood,
    setShopping,
    saveFood,
    saveMeal,
    deleteMeal,
    repeatWords,
    saveColor,
    useMeals
  };
})();
