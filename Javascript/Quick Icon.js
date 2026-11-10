// Quick Icon: how a Quick Entry icon looks on this device's home screen. Settings makes it (under Theme: its Colors and its Icon,
// or an uploaded image), and this device keeps it with the theme (prismal_quick_icon, kept when signing out: Layout.js
// DEVICE_SETTINGS). The Quick Entry page puts the picture in its icon links (apply), so a phone saves it when the page is
// added to its home screen; an icon that's already there keeps the look it was added with.

(function () {
  const KEY = "prismal_quick_icon";
  const SIZE = 180; // Pixels on a side: what a phone's home screen asks for
  const ICONS = ["prismal", "minimal", "blank", "emoji", "image"];
  const PRISM_PICTURE = "/Favicon/apple-touch-icon.png";
  const DEFAULTS = { colors: "prismal", icon: "prismal", emoji: "", image: "", picture: "" };
  const IMAGE_DATA = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

  // What this device keeps, with every part as it should be: { colors (a theme's name), icon (one of ICONS), emoji, image
  // (an uploaded image, as a square PNG), picture (the finished icon, "" for the site's own) }
  function settings() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    const given = stored && typeof stored === "object" ? stored : {};
    return {
      colors: window.Themes && Themes.list.includes(given.colors) ? given.colors : DEFAULTS.colors,
      icon: ICONS.includes(given.icon) ? given.icon : DEFAULTS.icon,
      emoji: typeof given.emoji === "string" ? firstCharacter(given.emoji) : "",
      image: IMAGE_DATA.test(given.image || "") ? given.image : "",
      picture: IMAGE_DATA.test(given.picture || "") ? given.picture : ""
    };
  }

  // Keeps it on this device (false when this browser won't)
  function save(chosen) {
    try {
      localStorage.setItem(KEY, JSON.stringify(chosen));
      return true;
    } catch (e) {
      return false;
    }
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
  async function paintPrism(c, chosen, colors) {
    const picture = await loadImage(PRISM_PICTURE);
    c.drawImage(picture, 0, 0, SIZE, SIZE);
    if (chosen.colors === "prismal") return;
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

  function paintEmoji(c, emoji) {
    c.font = `${SIZE * 0.62}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(emoji, SIZE / 2, SIZE * 0.54);
  }

  // The finished icon for these choices, as a PNG's data address ("" when it's the site's own: Prismal's colors and icon)
  async function draw(chosen) {
    if (chosen.colors === "prismal" && chosen.icon === "prismal") return "";
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const c = canvas.getContext("2d");
    const colors = palette(chosen.colors);
    paintBackground(c, colors);
    if (chosen.icon === "prismal") await paintPrism(c, chosen, colors);
    if (chosen.icon === "minimal") paintMinimal(c, colors);
    if (chosen.icon === "emoji" && chosen.emoji) paintEmoji(c, chosen.emoji);
    if (chosen.icon === "image" && chosen.image) c.drawImage(await loadImage(chosen.image), 0, 0, SIZE, SIZE);
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

  // On the Quick Entry page: this device's icon, in the links a phone reads when the page is added to its home screen
  function apply() {
    const { picture } = settings();
    if (!picture) return;
    document.querySelectorAll('link[rel~="icon"]').forEach(link => link.remove());
    const touch = document.querySelector('link[rel="apple-touch-icon"]');
    if (touch) touch.href = picture;
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/png";
    icon.href = picture;
    document.head.appendChild(icon);
  }

  window.QuickIcon = { ICONS, settings, save, draw, readImage, apply, firstCharacter };
})();
