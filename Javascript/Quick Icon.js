// Quick Icon: how each home screen icon looks (Quick Budget, Quick Calendar, and Snapshot's no-login icon). Each icon keeps
// its own look with its key on the server (the API's icons.js): { colors (a theme's name, or "custom" for this device's
// Custom theme), icon (one of ICONS), emoji, picture (the finished icon as a PNG's data address, "" for the site's own) }.
// The Customize window (openEditor) picks it: first when an icon is made (Home's Quick Budget and Quick Calendar buttons,
// Snapshot's Add To Home Screen), then from the Customize button at the bottom of the icon's own page. That page puts the
// picture in its icon links (apply), so a phone saves it when the page is added to its home screen; an icon that's already
// there keeps the look it was added with.

(function () {
  const SIZE = 180; // Pixels on a side: what a phone's home screen asks for
  const ICONS = ["prismal", "minimal", "calendar", "blank", "emoji", "image"];
  const ICON_LABELS = { prismal: "Prismal", minimal: "Minimal", calendar: "Calendar", blank: "Blank", emoji: "Emoji", image: "Image" };
  // Each kind of icon: its name and the icon it starts with
  const KINDS = {
    quick: { name: "Quick Budget", icon: "prismal" },
    calendar: { name: "Quick Calendar", icon: "calendar" },
    snapshot: { name: "Snapshot", icon: "prismal" }
  };
  const PRISM_PICTURE = "/Favicon/apple-touch-icon.png";
  const IMAGE_DATA = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  const MAX_IMAGE_FILE = LIMITS.imageFile; // The biggest image it reads (it's cut down to the icon's size)

  // The look a new icon of this kind starts with
  function defaultLook(kind) {
    return { colors: "prismal", icon: (KINDS[kind] || KINDS.quick).icon, emoji: "", picture: "" };
  }

  // A look with every part as it should be (one that's missing or broken is the kind's own)
  function tidy(look, kind) {
    const given = look && typeof look === "object" ? look : null;
    if (!given) return defaultLook(kind);
    const colors = window.Themes && Themes.list.includes(given.colors) ? given.colors : "prismal";
    return {
      colors: colors === "custom" && window.Themes && !Themes.custom() && !given.picture ? "prismal" : colors,
      icon: ICONS.includes(given.icon) ? given.icon : defaultLook(kind).icon,
      emoji: typeof given.emoji === "string" ? firstCharacter(given.emoji) : "",
      picture: IMAGE_DATA.test(given.picture || "") ? given.picture : ""
    };
  }

  // The first character typed, whole: an emoji can be several code points (a flag, a family, a skin tone)
  function firstCharacter(text) {
    const trimmed = String(text).trim();
    if (!trimmed) return "";
    if (typeof Intl !== "undefined" && Intl.Segmenter) return new Intl.Segmenter().segment(trimmed)[Symbol.iterator]().next().value.segment;
    return Array.from(trimmed)[0];
  }

  // A theme's five colors (Custom's are the ones this device keeps)
  function palette(colors) {
    if (colors === "custom") return Themes.custom() || Themes.palettes.prismal;
    return Themes.palettes[colors] || Themes.palettes.prismal;
  }

  // An image from its address, once it's loaded
  function loadImage(address) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("That image couldn't be read."));
      image.src = address;
    });
  }

  // The tile: the theme's page color into its card color, with its glow in the top left corner
  function paintBackground(c, colors) {
    const fill = c.createLinearGradient(0, 0, SIZE, SIZE);
    fill.addColorStop(0, colors.background);
    fill.addColorStop(1, colors.cards);
    c.fillStyle = fill;
    c.fillRect(0, 0, SIZE, SIZE);
    const glow = c.createRadialGradient(SIZE * 0.2, SIZE * 0.15, 0, SIZE * 0.2, SIZE * 0.15, SIZE * 0.9);
    glow.addColorStop(0, `${colors.glow}66`);
    glow.addColorStop(1, `${colors.glow}00`);
    c.fillStyle = glow;
    c.fillRect(0, 0, SIZE, SIZE);
  }

  // The site's usual icon, in the theme's colors (Prismal's own are the picture as it is)
  async function paintPrism(c, look, colors) {
    const picture = await loadImage(PRISM_PICTURE);
    c.drawImage(picture, 0, 0, SIZE, SIZE);
    if (look.colors === "prismal") return;
    const tint = c.createLinearGradient(0, 0, SIZE, SIZE);
    tint.addColorStop(0, colors.background);
    tint.addColorStop(0.5, colors.glow);
    tint.addColorStop(1, colors.chosen);
    c.globalCompositeOperation = "color";
    c.fillStyle = tint;
    c.fillRect(0, 0, SIZE, SIZE);
    c.globalCompositeOperation = "source-over";
  }

  // A plain prism: its outline in the theme's words color, a beam of light going in, and the glow and chosen colors coming out
  function paintMinimal(c, colors) {
    const at = (share) => SIZE * share;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = colors.words;
    c.lineWidth = at(0.028);
    c.beginPath();
    c.moveTo(at(0.08), at(0.62));
    c.lineTo(at(0.44), at(0.48));
    c.stroke();
    c.lineWidth = at(0.034);
    [[colors.chosen, 0.34], [colors.words, 0.48], [colors.glow, 0.62]].forEach(([color, y]) => {
      c.strokeStyle = color;
      c.beginPath();
      c.moveTo(at(0.56), at(0.48));
      c.lineTo(at(0.92), at(y));
      c.stroke();
    });
    c.strokeStyle = colors.words;
    c.lineWidth = at(0.05);
    c.beginPath();
    c.moveTo(at(0.5), at(0.16));
    c.lineTo(at(0.8), at(0.76));
    c.lineTo(at(0.2), at(0.76));
    c.closePath();
    c.stroke();
  }

  // A rounded rectangle's path (canvas's own roundRect is too new for some phones)
  function roundedRect(c, x, y, width, height, radius) {
    c.beginPath();
    c.moveTo(x + radius, y);
    c.arcTo(x + width, y, x + width, y + height, radius);
    c.arcTo(x + width, y + height, x, y + height, radius);
    c.arcTo(x, y + height, x, y, radius);
    c.arcTo(x, y, x + width, y, radius);
    c.closePath();
  }

  // A calendar page: its outline in the theme's words color, a band across the top in its glow, two rings holding it, and
  // a grid of days, with one day marked in the chosen color
  function paintCalendar(c, colors) {
    const at = (share) => SIZE * share;
    const [left, top, width, height] = [at(0.19), at(0.22), at(0.62), at(0.58)];
    c.lineJoin = "round";
    c.lineCap = "round";
    roundedRect(c, left, top, width, height, at(0.07));
    c.fillStyle = `${colors.cards}cc`;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = colors.glow;
    c.fillRect(left, top, width, at(0.15));
    c.restore();
    roundedRect(c, left, top, width, height, at(0.07));
    c.strokeStyle = colors.words;
    c.lineWidth = at(0.035);
    c.stroke();
    c.lineWidth = at(0.045);
    [0.36, 0.64].forEach((x) => {
      c.beginPath();
      c.moveTo(at(x), at(0.16));
      c.lineTo(at(x), at(0.28));
      c.stroke();
    });
    const dot = at(0.055);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 4; column++) {
        const x = at(0.285 + column * 0.143);
        const y = at(0.48 + row * 0.11);
        c.fillStyle = row === 1 && column === 2 ? colors.chosen : colors.words;
        roundedRect(c, x - dot / 2, y - dot / 2, dot, dot, dot * 0.25);
        c.fill();
      }
    }
  }

  // An emoji, big, in the middle (drawn with the device's own emoji)
  function paintEmoji(c, emoji) {
    c.font = `${SIZE * 0.62}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(emoji, SIZE / 2, SIZE * 0.54);
  }

  // The finished icon for a look, as a PNG's data address ("" when it's the site's own: Prismal's colors and icon). An
  // image is drawn from image (an upload just read) or, when the look already has one, its own picture.
  async function draw(look, image = "") {
    if (look.colors === "prismal" && look.icon === "prismal") return "";
    if (look.icon === "image" && !image) return look.picture;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const c = canvas.getContext("2d");
    const colors = palette(look.colors);
    paintBackground(c, colors);
    if (look.icon === "prismal") await paintPrism(c, look, colors);
    if (look.icon === "minimal") paintMinimal(c, colors);
    if (look.icon === "calendar") paintCalendar(c, colors);
    if (look.icon === "emoji" && look.emoji) paintEmoji(c, look.emoji);
    if (look.icon === "image" && image) c.drawImage(await loadImage(image), 0, 0, SIZE, SIZE);
    return canvas.toDataURL("image/png");
  }

  // An image file picked to upload, cut to a square from its middle, as a PNG's data address
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("That file couldn't be read."));
      reader.onload = async () => {
        try {
          const image = await loadImage(reader.result);
          const side = Math.min(image.naturalWidth, image.naturalHeight);
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = SIZE;
          canvas.getContext("2d").drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
          resolve(canvas.toDataURL("image/png"));
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // The page's own icon links, as it came (apply("") puts them back)
  const SITE_LINKS = Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')).map(link => ({ rel: link.rel, type: link.type, sizes: link.getAttribute("sizes"), href: link.getAttribute("href") }));

  // On an icon's page: its picture, in the links a phone reads when the page is added to its home screen ("" puts the
  // site's own back)
  function apply(picture) {
    document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(link => link.remove());
    const links = picture
      ? [{ rel: "apple-touch-icon", sizes: "180x180", href: picture }, { rel: "icon", type: "image/png", href: picture }]
      : SITE_LINKS;
    links.forEach((given) => {
      const link = document.createElement("link");
      link.rel = given.rel;
      if (given.type) link.type = given.type;
      if (given.sizes) link.setAttribute("sizes", given.sizes);
      link.href = given.href;
      document.head.appendChild(link);
    });
  }

  // The look an icon's page has, drawn when it has none saved (a Quick Calendar icon's calendar), then put in its links
  async function show(look, kind) {
    const tidied = tidy(look, kind);
    if (!tidied.picture && !(tidied.colors === "prismal" && tidied.icon === "prismal")) {
      try { tidied.picture = await draw(tidied); } catch (e) {}
    }
    apply(tidied.picture);
    return tidied;
  }

  // The Customize window: a preview of the icon beside a few words, then its Colors (one for each theme, and this device's
  // Custom one) and its Icon (with the emoji's box or the image's button while one of those is picked). saveLabel's button
  // calls onSave(look), which resolves to { ok, message }; the window closes once it's ok. Starts from look, or the kind's
  // own, so a new icon can be accepted as it is.
  function openEditor({ origin, kind = "quick", look = null, title = "Customize", intro = "", saveLabel = "Save", onSave }) {
    const name = (KINDS[kind] || KINDS.quick).name;
    let chosen = tidy(look, kind);
    let image = chosen.icon === "image" ? chosen.picture : "";
    BudgetUI.openPanel({
      origin,
      size: "large",
      title,
      build(form, panel) {
        const preview = BudgetUI.element("img", "quickIconPreview");
        preview.alt = `How the ${name} icon will look`;
        preview.src = chosen.picture || PRISM_PICTURE;

        // Draws what's picked and shows it (only the latest of several quick changes counts)
        let latest = 0;
        async function redraw() {
          const mine = ++latest;
          let picture = "";
          try {
            picture = await draw({ ...chosen, picture: chosen.icon === "image" ? image : "" }, chosen.icon === "image" ? image : "");
          } catch (error) {
            panel.setError("That icon couldn't be drawn. Please try another one.");
            return;
          }
          if (mine !== latest) return;
          panel.setError("");
          chosen.picture = picture;
          preview.src = picture || PRISM_PICTURE;
        }

        // Colors: a button for each theme (Custom's once this device has one), its swatch over its name
        const custom = window.Themes ? Themes.custom() : null;
        const lostCustom = chosen.colors === "custom" && !custom; // (Drawn in another device's Custom colors)
        if (lostCustom) chosen.colors = "prismal";
        const colorChoices = BudgetUI.element("div", "choiceList themeChoices quickIconColors");
        colorChoices.setAttribute("role", "radiogroup");
        colorChoices.setAttribute("aria-label", "The icon's colors");
        colorChoices.append(...Themes.list.filter(theme => theme !== "custom" || custom).map((theme) => {
          const button = BudgetUI.element("button", "budgetButton choice themeChoice");
          button.type = "button";
          button.setAttribute("role", "radio");
          button.setAttribute("aria-checked", String(theme === chosen.colors));
          const swatch = BudgetUI.element("span", "themeSwatch");
          swatch.dataset.swatch = theme;
          if (theme === "custom") swatch.style.background = `linear-gradient(135deg, ${custom.background} 0%, ${custom.cards} 40%, ${custom.glow} 75%, ${custom.chosen} 100%)`;
          button.append(swatch, BudgetUI.element("span", "choiceName", theme.charAt(0).toUpperCase() + theme.slice(1)));
          button.addEventListener("click", () => {
            chosen.colors = theme;
            colorChoices.querySelectorAll(".themeChoice").forEach(other => other.setAttribute("aria-checked", String(other === button)));
            redraw();
          });
          return button;
        }));

        // Icon: what's on it
        const emoji = BudgetUI.textField({ label: "Emoji", value: chosen.emoji, placeholder: "Type one, like 🍕", maxLength: LIMITS.emoji });
        emoji.input.addEventListener("input", () => {
          chosen.emoji = firstCharacter(emoji.input.value);
          redraw();
        });
        const file = BudgetUI.element("input", "quickIconFile");
        file.type = "file";
        file.accept = "image/png,image/jpeg,image/webp,image/gif";
        file.setAttribute("aria-label", "Upload an image for the icon");
        const upload = BudgetUI.element("div", "quickIconUpload");
        upload.append(file, BudgetUI.element("p", "panelHint", "It's cut to a square from its middle, and a small copy is kept with this icon."));
        file.addEventListener("change", async () => {
          const picked = file.files[0];
          if (!picked) return;
          if (picked.size > MAX_IMAGE_FILE) return panel.setError("That image is too big. Pick one under 15 MB.");
          try {
            image = await readImage(picked);
          } catch (error) {
            return panel.setError("That image couldn't be read. Pick a PNG or JPEG.");
          }
          redraw();
        });
        const showIconParts = () => {
          emoji.el.hidden = chosen.icon !== "emoji";
          upload.hidden = chosen.icon !== "image";
          colorField.hidden = chosen.icon === "image"; // (An image covers the whole tile)
        };
        const icons = BudgetUI.segmented(ICONS.map(key => ({ key, label: ICON_LABELS[key] })), chosen.icon, (key) => {
          chosen.icon = key;
          showIconParts();
          redraw();
        });

        const colorField = BudgetUI.field("Colors", colorChoices);
        const top = BudgetUI.element("div", "quickIconTop");
        const words = BudgetUI.element("div", "quickIconWords");
        words.append(BudgetUI.element("p", "panelHint", intro || `How this ${name} icon looks on a home screen. It's kept with this icon, so each icon you make can look different. An icon already on a home screen keeps the look it had when it was added: add it again for the new one.`));
        top.append(preview, words);
        form.append(top, BudgetUI.field("Icon", icons.el), colorField, emoji.el, upload, BudgetUI.buttonRow([
          { label: saveLabel, kind: "primary", type: "submit" },
          { label: "Cancel", onClick: () => panel.close() }
        ]));
        showIconParts();
        if (lostCustom || (!chosen.picture && !(chosen.colors === "prismal" && chosen.icon === "prismal"))) redraw();

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (chosen.icon === "image" && !image) return panel.setError("Pick an image to upload, or another icon.");
          if (chosen.icon === "emoji" && !chosen.emoji) return panel.setError("Type an emoji, or pick another icon.");
          panel.setError("");
          panel.setBusy(true);
          const result = await onSave({ ...chosen });
          panel.setBusy(false);
          if (!result || !result.ok) return panel.setError((result && result.message) || "That didn't work. Please try again.");
          if (!result.keepOpen) panel.close();
        });
      }
    });
  }

  let pageLook = null; // (The look the icon's page has now, for its Customize window)

  // An icon's own page, once its key checks out: its look in its links, and its Customize button (#customizeIcon) shown.
  // The button opens the window and saves with send(look), a request with the icon's key that resolves to { ok, status,
  // data: { look } or { error } }. Called again (the page checked its key again), it only takes the newer look.
  async function wirePage({ kind, look, send }) {
    pageLook = await show(look, kind);
    const button = document.getElementById("customizeIcon");
    if (!button || !button.hidden) return;
    button.hidden = false;
    button.addEventListener("click", () => openEditor({
      origin: button,
      kind,
      look: pageLook,
      title: "Customize This Icon",
      saveLabel: "Save",
      onSave: async (chosen) => {
        const result = await send(chosen);
        if (!result.ok) {
          const message = result.status === 0 ? "Couldn't reach the server. Please try again." : (result.data && result.data.error) || "Couldn't save it. Please try again.";
          return { ok: false, message };
        }
        pageLook = await show(result.data && result.data.look ? result.data.look : chosen, kind);
        BudgetUI.showToast("Saved with this icon. One already on your home screen keeps its old look until it's added again.");
        return { ok: true };
      }
    }));
  }

  window.QuickIcon = { ICONS, KINDS, defaultLook, tidy, draw, readImage, apply, show, openEditor, wirePage, firstCharacter };
})();
