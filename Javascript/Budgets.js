// Budgets: which budget a page opens, and the budget picker above the header's buttons on every signed-in page. The
// picker shows the budget that's open; tapping it drops down the account's budgets and the ones shared with it (each opens
// with a tap), its invitations (Join or Decline), and New Budget. Each budget the account owns has a small Share beside
// it; one shared with the account doesn't (only its owner can share it, and the API refuses anyone else too). Settings'
// Budgets card does the rest: rename, delete, and leave (renderManager).
//   - A tab keeps the budget it has open (sessionStorage, for the account signed in), so two tabs can each have their own.
//     A new tab opens the one the account opened last (the API's ?budget=last), and a reminder's notification can name
//     one (?budget=<id> in its link).
//   - Every request about the budget says which one (query(): Process Budget.js adds it to the address). Once the page has
//     loaded its budget, that's the one it saves to until it's opened again, whatever another tab picks.
//   - Picking another budget makes it the one the account opened last (POST /api/budgets/open), then opens this page again
//     with it.

window.Budgets = (() => {
  "use strict";

  const TAB_KEY = "prismal_budget"; // This tab's budget: { user, id, name }

  // The account signed in here (a tab's budget is only for the account it was opened by)
  function username() {
    try { return localStorage.getItem("prismal_username") || ""; } catch { return ""; }
  }

  // The budget this tab has open (for the account signed in now), or null
  function readTab() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(TAB_KEY) || "null");
      return stored && stored.user === username() && Number.isSafeInteger(stored.id) && stored.id > 0 ? stored : null;
    } catch {
      return null;
    }
  }

  // Keep the budget this tab has open (id null: none, so the tab opens the account's last one next)
  function writeTab(id, name) {
    try {
      if (id) sessionStorage.setItem(TAB_KEY, JSON.stringify({ user: username(), id, name: String(name || "") }));
      else sessionStorage.removeItem(TAB_KEY);
    } catch {}
  }

  // A link that names a budget (a reminder's notification) opens it in this tab, and the address loses it
  (function budgetFromLink() {
    const params = new URLSearchParams(location.search);
    const named = params.get("budget");
    if (named === null) return;
    if (/^\d{1,15}$/.test(named) && Number(named) > 0) writeTab(Number(named), "");
    params.delete("budget");
    const rest = params.toString();
    try { history.replaceState(history.state, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`); } catch {}
  })();

  const tabBudget = readTab(); // As this page opened
  let opened = null;           // The budget this page loaded ({ id, name, first, owned, owner, shared }), once it has
  let listed = null;           // GET /api/budgets ({ current, budgets, invitations }), once it's in
  let listing = null;          // That request, while it's on its way

  // ---------- Which budget ----------

  // What a request about the budget says: ?budget= the one this page loaded, or before it has, the one this tab has open,
  // or the one the account opened last
  function query() {
    return `budget=${opened ? opened.id : tabBudget ? tabBudget.id : "last"}`;
  }

  // The budget's number this page is on (null before it's known)
  function id() {
    return opened ? opened.id : tabBudget ? tabBudget.id : listed ? listed.current : null;
  }

  // Process Budget.js loaded the budget: it's this tab's from now on
  function loaded(budget) {
    if (!budget || !Number.isSafeInteger(budget.id)) return;
    if (!opened) opened = { ...budget };
    else Object.assign(opened, { name: budget.name, shared: budget.shared });
    writeTab(opened.id, opened.name);
    showPicker();
  }

  // Whether anyone has joined the open budget, as the page's last check saw it (see LIVE UPDATES in Process Budget.js)
  function sharedNow(shared) {
    if (opened && typeof shared === "boolean") opened.shared = shared;
  }

  let leaving = false; // The page is opening another budget (see gone)

  // This page opens again, with the budget this tab has now (writeTab): fresh from its top, sliding down into view, like
  // a page opened from the header. (A reload puts the page back where it was scrolled to while the new budget draws,
  // which jumps around until it settles; and with a #spot in its address, the same address only scrolls to it.) Nothing
  // more saves to the budget that was open.
  function reopenPage() {
    if (typeof workspaceLoaded !== "undefined") workspaceLoaded = false;
    if (typeof leaveNote === "function") leaveNote(window.PAGE, "down");
    window.location.replace(window.location.pathname + window.location.search);
  }

  // The budget this page asked for isn't the account's to open anymore (it was deleted, or isn't shared with it): the page
  // opens the account's last (or first) budget instead, and says why
  function gone() {
    if (leaving) return;
    leaving = true;
    writeTab(null);
    try { sessionStorage.setItem("prismal_budget_notice", "gone"); } catch {}
    reopenPage();
  }

  // ---------- The API ----------

  // One request (a POST of JSON with a body, a GET without): { ok, status, data }, never throwing (status 0: no answer)
  async function call(path, body) {
    let token = null;
    try { token = localStorage.getItem("prismal_jwt"); } catch {}
    if (!token) return { ok: false, status: 401, data: null };
    try {
      const response = await fetch(`${window.API_BASE_URL}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      let data = null;
      try { data = await response.json(); } catch {}
      if (response.status === 401 && typeof signedOutElsewhere === "function") signedOutElsewhere();
      return { ok: response.ok, status: response.status, data };
    } catch {
      return { ok: false, status: 0, data: null };
    }
  }

  // The list, from the API (again, when fresh); resolves to it, or null when it couldn't load
  function list(fresh = false) {
    if (listed && !fresh) return Promise.resolve(listed);
    if (listing) return listing;
    listing = call("/api/budgets").then((result) => {
      if (result.ok && result.data && Array.isArray(result.data.budgets)) took(result.data);
      return listed;
    }).finally(() => { listing = null; });
    return listing;
  }

  // A new list from the API (any route under /api/budgets answers with one)
  function took(data) {
    listed = { current: data.current, budgets: data.budgets, invitations: Array.isArray(data.invitations) ? data.invitations : [] };
    const shown = listed.budgets.find(budget => budget.id === id());
    if (shown && opened && shown.id === opened.id) opened.name = shown.name;
    if (shown && (opened || tabBudget)) writeTab(shown.id, shown.name);
    showPicker();
    document.dispatchEvent(new CustomEvent("budgets:changed"));
  }

  // What went wrong with a request, in words
  function problem(result, fallback) {
    if (result.status === 0) return "Couldn't reach the server. Please check your connection and try again.";
    return (result.data && result.data.error) || fallback;
  }

  const toast = (message, warning = false) => {
    if (typeof BudgetUI !== "undefined") BudgetUI.showToast(message, warning);
    else window.alert(message);
  };

  // ---------- Opening one ----------

  // Open another budget: it's the account's last one from now on, and this page opens again with it
  async function switchTo(budget) {
    if (!budget) return;
    if (opened && budget.id === opened.id) {
      if (typeof BudgetUI !== "undefined") BudgetUI.closeAllPanels();
      return;
    }
    if (typeof hasChangesToSave === "function" && hasChangesToSave() && !window.confirm("Some of your changes haven't been saved yet (they'll save once you're back online). Open the other budget anyway and lose them?")) return;
    const result = await call("/api/budgets/open", { budget: budget.id });
    if (!result.ok) {
      toast(problem(result, "Couldn't open that budget. Please try again."), true);
      list(true);
      return;
    }
    writeTab(budget.id, budget.name);
    reopenPage();
  }

  // ---------- The picker ----------

  let picker = null;

  // Above the header's buttons (signed-in pages)
  function placePicker() {
    const nav = document.querySelector("#transitionContainer > header .navButtons");
    if (!nav || picker) return;
    const side = document.createElement("div");
    side.className = "headerSide";
    picker = document.createElement("button");
    picker.type = "button";
    picker.id = "budgetPicker";
    picker.className = "budgetPicker";
    picker.setAttribute("aria-haspopup", "dialog");
    picker.setAttribute("aria-expanded", "false");
    picker.innerHTML = '<span class="budgetPickerName" translate="no"></span><span class="budgetPickerDot" hidden></span><span class="budgetPickerArrow" aria-hidden="true">▾</span>';
    picker.addEventListener("click", openList);
    nav.replaceWith(side);
    side.append(picker, nav);
    showPicker();
  }

  // The open budget's name (or, before it's known, "Budgets"), and a dot while invitations wait
  function showPicker() {
    if (!picker) return;
    const shownId = id();
    const known = listed && listed.budgets.find(budget => budget.id === shownId);
    const name = (known && known.name) || (opened && opened.name) || (tabBudget && tabBudget.name) || "";
    const invitations = listed ? listed.invitations.length : 0;
    picker.querySelector(".budgetPickerName").textContent = name || "Budgets";
    picker.querySelector(".budgetPickerDot").hidden = invitations === 0;
    picker.setAttribute("aria-label", `${name ? `Budget: ${name}.` : "Budgets."}${invitations > 0 ? ` ${invitations} invitation${invitations === 1 ? "" : "s"}.` : ""} Switch budgets`);
  }

  // ---------- The list that drops down ----------

  const el = (tag, className = "", text = "") => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  // A small button
  function button(label, kind, onClick, ariaLabel = "") {
    const node = el("button", `budgetButton ${kind}`.trim(), label);
    node.type = "button";
    if (ariaLabel) node.setAttribute("aria-label", ariaLabel);
    node.addEventListener("click", onClick);
    return node;
  }

  // Who a budget is shared with, in a few words: "Shared with Ben", "Shared with 3 people", "Invited: ben@example.com",
  // "From Ana" (one shared with the account), or "" (just the account's)
  function sharedWords(budget) {
    if (!budget.owned) return `From ${budget.owner}`;
    const joined = budget.people.filter(person => person.joined);
    const invited = budget.people.filter(person => !person.joined);
    if (joined.length === 1) return `Shared with ${joined[0].name}${invited.length > 0 ? `, ${invited.length} invited` : ""}`;
    if (joined.length > 1) return `Shared with ${joined.length} people${invited.length > 0 ? `, ${invited.length} invited` : ""}`;
    if (invited.length === 1) return `Invited: ${invited[0].name}`;
    if (invited.length > 1) return `${invited.length} invited`;
    return "";
  }

  // One budget in the list: its name (a tap opens it) and what it's shared as, with Share beside one of the account's own
  function budgetItem(budget) {
    const item = el("li", "budgetItem");
    const isOpen = budget.id === id();
    if (isOpen) item.classList.add("isOpen");
    const open = el("button", "budgetOpen");
    open.type = "button";
    if (isOpen) open.setAttribute("aria-current", "true");
    const name = el("span", "budgetName", budget.name);
    name.translate = false;
    open.append(name);
    const words = [isOpen ? "Open now" : "", sharedWords(budget)].filter(Boolean).join(" · ");
    if (words) open.append(el("span", "budgetDetail", words));
    open.addEventListener("click", () => switchTo(budget));
    item.append(open);
    if (budget.owned) item.append(button("Share", "budgetShare", (event) => openShare(budget, event.currentTarget), `Share ${budget.name}`));
    return item;
  }

  // An invitation: whose budget, and Join or Decline
  function invitationItem(invitation) {
    const item = el("li", "budgetItem isInvitation");
    const about = el("div", "budgetOpen");
    const name = el("span", "budgetName", invitation.name);
    name.translate = false;
    about.append(name, el("span", "budgetDetail", `From ${invitation.owner}, for you to join`));
    const buttons = el("div", "budgetInvitationButtons");
    buttons.append(
      button("Join", "primary", () => answerInvitation(invitation, "join"), `Join ${invitation.name}`),
      button("Decline", "", () => answerInvitation(invitation, "decline"), `Decline ${invitation.name}`)
    );
    item.append(about, buttons);
    return item;
  }

  // The list's sections (the account's own, the ones shared with it, invitations), into a box
  function fillList(box) {
    box.replaceChildren();
    if (!listed) {
      box.append(el("p", "panelHint", "Loading your budgets..."));
      return;
    }
    const section = (heading, items) => {
      if (items.length === 0) return;
      box.append(el("h4", "budgetListHeading", heading));
      const ul = el("ul", "budgetList");
      ul.append(...items);
      box.append(ul);
    };
    section("Yours", listed.budgets.filter(budget => budget.owned).map(budgetItem));
    section("Shared With You", listed.budgets.filter(budget => !budget.owned).map(budgetItem));
    section("Invitations", listed.invitations.map(invitationItem));
  }

  let listPanel = null;

  // The picker's list: it drops down under the picker (a small panel, Budget UI.js)
  function openList() {
    if (typeof BudgetUI === "undefined") {
      window.location.href = "/settings.html#budgets";
      return;
    }
    if (listPanel && listPanel.panel.isConnected && !listPanel.panel.classList.contains("isClosing")) {
      BudgetUI.closeAllPanels();
      return;
    }
    let refill = null;
    listPanel = BudgetUI.openPanel({
      origin: picker,
      size: "small",
      title: "Budgets",
      build(form, panel) {
        panel.panel.classList.add("budgetsPanel");
        const box = el("div", "budgetLists");
        fillList(box);
        form.append(box, BudgetUI.buttonRow([
          { label: "New Budget", kind: "primary", onClick: (event) => openNewBudget(event.currentTarget) },
          { label: "Manage", onClick: () => { window.location.href = "/settings.html#budgets"; } }
        ]));
        refill = () => fillList(box);
        document.addEventListener("budgets:changed", refill);
      }
    });
    picker.setAttribute("aria-expanded", "true");
    watchClosed(listPanel, () => {
      picker.setAttribute("aria-expanded", "false");
      document.removeEventListener("budgets:changed", refill);
    });
    list(true); // (Shown as it was, then as it is now)
  }

  // Run done once the panel has closed (Budget UI.js takes it off the page)
  function watchClosed(panelApi, done) {
    const watcher = new MutationObserver(() => {
      if (panelApi.panel.isConnected && !panelApi.panel.classList.contains("isClosing")) return;
      watcher.disconnect();
      done();
    });
    watcher.observe(panelApi.panel, { attributes: true, attributeFilter: ["class"] });
    if (panelApi.panel.parentNode) watcher.observe(panelApi.panel.parentNode, { childList: true });
  }

  // Join (it's in the list from now on, ready to open) or Decline an invitation
  async function answerInvitation(invitation, answer) {
    const result = await call(`/api/budgets/${answer}`, { budget: invitation.id });
    if (!result.ok || !result.data) return toast(problem(result, "That didn't work. Please try again."), true);
    took(result.data);
    if (result.data.error) return toast(result.data.error, true);
    toast(answer === "join" ? `You joined ${invitation.name}. Tap it in the list to open it.` : `You declined ${invitation.name}.`);
  }

  // ---------- Sharing ----------

  // Share one of the account's budgets: their username or email, and everyone it's shared with (each with Stop Sharing)
  function openShare(budget, origin) {
    if (typeof BudgetUI === "undefined") return;
    let refresh = null;
    const sharePanel = BudgetUI.openPanel({
      origin,
      size: "small",
      stacked: !!origin.closest(".budgetPanel"),
      title: `Share ${budget.name}`,
      build(form, panel) {
        panel.panel.classList.add("budgetsPanel");
        form.append(el("p", "panelText", "Type the username or email of their Prismal Planning account. Once they join, they can open this budget and see and change anything in it, like you can, its connected spreadsheets and calendars too. Only you can share it, rename it, or delete it."));
        const to = BudgetUI.textField({ label: "Username or email", placeholder: "Their username or email" });
        to.input.maxLength = 254;
        to.input.autocomplete = "off";
        to.input.spellcheck = false;
        to.input.setAttribute("autocapitalize", "none");
        const people = el("ul", "budgetList budgetPeople");
        const showPeople = () => {
          const now = listed && listed.budgets.find(item => item.id === budget.id);
          people.replaceChildren(...(now ? now.people : []).map(person => personItem(budget, person, panel)));
          people.hidden = people.childElementCount === 0;
        };
        showPeople();
        form.append(to.el, BudgetUI.buttonRow([
          { label: "Share", kind: "primary", type: "submit" },
          { label: "Done", onClick: () => panel.close() }
        ]), people);
        refresh = showPeople;
        document.addEventListener("budgets:changed", refresh);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          panel.setError("");
          const typed = to.value();
          if (!typed) return panel.setError("Type their username or email.");
          panel.setBusy(true);
          const result = await call("/api/budgets/share", { budget: budget.id, to: typed });
          panel.setBusy(false);
          if (!result.ok || !result.data) return panel.setError(problem(result, "Couldn't share it. Please try again."));
          took(result.data);
          to.input.value = "";
          if (result.data.already === "joined") toast("It's already shared with them.");
          else if (result.data.already === "invited") toast("They're already invited. It's in their budget list for them to join.");
          else toast(`Invited ${result.data.invited}. It shows in their budget list for them to join.`);
        });
      }
    });
    watchClosed(sharePanel, () => document.removeEventListener("budgets:changed", refresh));
  }

  // Someone a budget is shared with (or invited to it), with Stop Sharing
  function personItem(budget, person, panel) {
    const item = el("li", "budgetItem");
    const about = el("div", "budgetOpen");
    const name = el("span", "budgetName", person.name);
    name.translate = false;
    about.append(name, el("span", "budgetDetail", person.joined ? "Joined" : "Invited, hasn't joined yet"));
    item.append(about, button(person.joined ? "Stop Sharing" : "Cancel Invite", "danger budgetShare", async (event) => {
      const what = person.joined ? `Stop sharing ${budget.name} with ${person.name}? They won't be able to open it anymore. What they added stays in it.` : `Take back the invitation to ${person.name}?`;
      if (!window.confirm(what)) return;
      const target = event.currentTarget;
      target.disabled = true;
      const result = await call("/api/budgets/unshare", { budget: budget.id, person: person.id });
      if (target.isConnected) target.disabled = false;
      if (!result.ok || !result.data) return panel.setError(problem(result, "That didn't work. Please try again."));
      took(result.data);
    }, `${person.joined ? "Stop sharing with" : "Cancel the invitation to"} ${person.name}`));
    return item;
  }

  // ---------- New, rename, delete, leave ----------

  // New Budget: its name, then it opens
  function openNewBudget(origin) {
    if (typeof BudgetUI === "undefined") return;
    BudgetUI.openPanel({
      origin,
      size: "small",
      stacked: !!(listPanel && listPanel.panel.isConnected && !listPanel.panel.classList.contains("isClosing")),
      title: "New Budget",
      build(form, panel) {
        form.append(el("p", "panelText", "It starts empty, with its own calendar, entries, Equity, and Bob. You can share it once it's made."));
        const name = BudgetUI.textField({ label: "Name", placeholder: "Like Household or Vacation" });
        name.input.maxLength = 30;
        form.append(name.el, BudgetUI.buttonRow([
          { label: "Make It", kind: "primary", type: "submit" },
          { label: "Cancel", onClick: () => panel.close() }
        ]));
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          panel.setError("");
          if (!name.value()) return panel.setError("Give the budget a name.");
          panel.setBusy(true);
          const result = await call("/api/budgets/new", { name: name.value() });
          if (!result.ok || !result.data) {
            panel.setBusy(false);
            return panel.setError(problem(result, "Couldn't make it. Please try again."));
          }
          took(result.data);
          const made = listed.budgets.find(budget => budget.id === result.data.made);
          if (made) await switchTo(made);
          panel.setBusy(false);
        });
      }
    });
  }

  // Rename one of the account's budgets
  function openRename(budget, origin) {
    BudgetUI.openPanel({
      origin,
      size: "small",
      title: `Rename ${budget.name}`,
      build(form, panel) {
        const name = BudgetUI.textField({ label: "Name", value: budget.name });
        name.input.maxLength = 30;
        form.append(name.el, BudgetUI.buttonRow([
          { label: "Rename", kind: "primary", type: "submit" },
          { label: "Cancel", onClick: () => panel.close() }
        ]));
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          panel.setError("");
          if (!name.value()) return panel.setError("Give the budget a name.");
          panel.setBusy(true);
          const result = await call("/api/budgets/rename", { budget: budget.id, name: name.value() });
          panel.setBusy(false);
          if (!result.ok || !result.data) return panel.setError(problem(result, "Couldn't rename it. Please try again."));
          took(result.data);
          panel.close();
          toast(`It's called ${name.value()} now.`);
        });
      }
    });
  }

  // Delete one of the account's budgets (never its first) after asking, or leave one shared with it: either way, a page that
  // has it open opens another
  async function deleteOrLeave(budget, target) {
    const question = budget.owned
      ? `Delete ${budget.name} and everything in it${budget.people.some(person => person.joined) ? ", for you and everyone it's shared with" : ""}? This can't be undone. To keep a copy, use Download My Data first.`
      : `Leave ${budget.name}? You won't be able to open it unless ${budget.owner} shares it with you again. What you added stays in it.`;
    if (!window.confirm(question)) return;
    target.disabled = true;
    const result = await call(budget.owned ? "/api/budgets/delete" : "/api/budgets/leave", { budget: budget.id });
    if (target.isConnected) target.disabled = false;
    if (!result.ok || !result.data) return toast(problem(result, "That didn't work. Please try again."), true);
    took(result.data);
    if (result.data.error) return toast(result.data.error, true);
    if (budget.id === id()) {
      writeTab(null);
      reopenPage();
      return;
    }
    toast(budget.owned ? `${budget.name} was deleted.` : `You left ${budget.name}.`);
  }

  // Settings' Budgets card: every budget with what can be done to it (Open, Share, Rename, Delete, Leave), invitations,
  // and New Budget. container: the card's list; it's drawn again whenever the list changes.
  function renderManager(container) {
    const draw = () => {
      container.replaceChildren();
      if (!listed) {
        container.append(el("p", "panelHint", "Couldn't load your budgets. Please refresh to try again."));
        return;
      }
      const ul = el("ul", "budgetList budgetManager");
      for (const budget of listed.budgets) {
        const item = el("li", "budgetItem");
        const about = el("div", "budgetOpen");
        const name = el("span", "budgetName", budget.name);
        name.translate = false;
        const words = [budget.id === id() ? "Open now" : "", budget.first ? "Your first budget" : "", sharedWords(budget)].filter(Boolean).join(" · ");
        about.append(name);
        if (words) about.append(el("span", "budgetDetail", words));
        const buttons = el("div", "budgetInvitationButtons");
        if (budget.id !== id()) buttons.append(button("Open", "", () => switchTo(budget), `Open ${budget.name}`));
        if (budget.owned) {
          buttons.append(button("Share", "", (event) => openShare(budget, event.currentTarget), `Share ${budget.name}`));
          buttons.append(button("Rename", "", (event) => openRename(budget, event.currentTarget), `Rename ${budget.name}`));
          if (!budget.first) buttons.append(button("Delete", "danger", (event) => deleteOrLeave(budget, event.currentTarget), `Delete ${budget.name}`));
        } else {
          buttons.append(button("Leave", "danger", (event) => deleteOrLeave(budget, event.currentTarget), `Leave ${budget.name}`));
        }
        item.append(about, buttons);
        ul.append(item);
      }
      for (const invitation of listed.invitations) ul.append(invitationItem(invitation));
      container.append(ul);
    };
    draw();
    document.addEventListener("budgets:changed", draw);
  }

  // ---------- Start ----------

  placePicker();
  list();

  return {
    TAB_KEY,
    query,
    id,
    info: () => opened,
    loaded,
    sharedNow,
    gone,
    list,
    switchTo,
    openNewBudget,
    renderManager,
    sharedWords
  };
})();
