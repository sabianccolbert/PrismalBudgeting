// Passkeys: signing in with Face ID, Touch ID, Windows Hello, a fingerprint, or a device PIN (WebAuthn).
// Shared by the login page (signing in, and turning passkeys on right after a password sign-in) and
// Settings (adding and removing passkeys, and turning passkey sign-in on or off). The API (passkey.js)
// makes every challenge and checks every answer; the browser and the device do the rest, and a face or
// fingerprint never leaves the device.

window.Passkeys = (() => {
  "use strict";

  const supported = !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
  // Browsers only allow passkeys on a web address (localhost counts), never on an IP like 127.0.0.1
  const onIpAddress = /^(\d{1,3}\.){3}\d{1,3}$|^\[.*\]$/.test(location.hostname);
  const IP_ADDRESS_TEXT = `Passkeys only work at a web address, not an IP address like ${location.hostname}. Open this page at localhost${location.port ? ":" + location.port : ""} instead.`;

  // A challenge from the API stays good for 5 to 10 minutes; this one is fresh enough to use right
  // away (Safari wants the device's check to start right after the tap, before any server call)
  const FRESH_MS = 4 * 60000;

  const appleMobile = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // What this device calls the check that unlocks a passkey, for labels like "Turn on passkey
  // sign-in (Face ID or Touch ID)". Empty when it isn't known.
  function unlockName() {
    const agent = navigator.userAgent;
    if (appleMobile()) return "Face ID or Touch ID";
    if (/Macintosh/.test(agent)) return "Touch ID";
    if (/Windows/.test(agent)) return "Windows Hello";
    if (/Android/.test(agent)) return "fingerprint or face";
    return "";
  }

  // A starting name for a new passkey, so the list in Settings says which device made it
  function deviceName() {
    const agent = navigator.userAgent;
    if (/iPhone/.test(agent)) return "iPhone";
    if (appleMobile()) return "iPad";
    if (/Android/.test(agent)) return "Android";
    if (/Macintosh/.test(agent)) return "Mac";
    if (/Windows/.test(agent)) return "Windows";
    if (/CrOS/.test(agent)) return "Chromebook";
    if (/Linux/.test(agent)) return "Linux";
    return "Passkey";
  }

  // Does the browser list passkeys under the username box (passkey autofill)?
  async function autofillAvailable() {
    try {
      return supported && !onIpAddress && typeof PublicKeyCredential.isConditionalMediationAvailable === "function"
        && await PublicKeyCredential.isConditionalMediationAvailable();
    } catch {
      return false;
    }
  }

  // ---------- The API's options -> what the browser takes ----------

  function signInRequest(options) {
    return {
      challenge: toBytes(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification,
      allowCredentials: []
    };
  }

  function addRequest(options) {
    return {
      ...options,
      challenge: toBytes(options.challenge),
      user: { ...options.user, id: toBytes(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map(credential => ({ ...credential, id: toBytes(credential.id) }))
    };
  }

  // ---------- The device's answer -> what the API takes ----------

  function signInAnswer(credential) {
    const response = credential.response;
    return {
      id: credential.id,
      response: {
        clientDataJSON: toBase64Url(response.clientDataJSON),
        authenticatorData: toBase64Url(response.authenticatorData),
        signature: toBase64Url(response.signature),
        userHandle: response.userHandle ? toBase64Url(response.userHandle) : null
      }
    };
  }

  function addAnswer(credential) {
    const response = credential.response;
    let transports = [];
    try { transports = typeof response.getTransports === "function" ? response.getTransports() : []; } catch {}
    return {
      id: credential.id,
      response: {
        clientDataJSON: toBase64Url(response.clientDataJSON),
        attestationObject: toBase64Url(response.attestationObject),
        transports
      }
    };
  }

  // What to tell the person when the browser or device said no. adding: making a passkey (not
  // signing in). Empty for AbortError, which only means the page cancelled the request itself.
  function problem(error, adding = false) {
    switch (error && error.name) {
      case "NotAllowedError":
        return adding ? "The passkey wasn't made (it was cancelled, or it timed out)." : "Passkey sign-in was cancelled, or it timed out. Tap Sign In With A Passkey to try again.";
      case "InvalidStateError":
        return "This device already has a passkey for your account.";
      case "SecurityError":
        return onIpAddress ? IP_ADDRESS_TEXT : "Passkeys don't work at this web address.";
      case "NotSupportedError":
        return "This device can't make a passkey Prismal Budget can use.";
      case "AbortError":
        return "";
      default:
        return adding ? "Couldn't make the passkey. Please try again." : "Couldn't use the passkey. Please try again.";
    }
  }

  // ---------- Telling the device's password manager (where the browser supports it) ----------

  // This passkey isn't on any account anymore, so the device can stop offering it
  function forget(credentialId) {
    try {
      if (typeof PublicKeyCredential.signalUnknownCredential === "function") {
        PublicKeyCredential.signalUnknownCredential({ rpId: location.hostname, credentialId }).catch(() => {});
      }
    } catch {}
  }

  // These are all the passkeys the account still has here (after one was removed in Settings)
  function syncList(userHandle, passkeys) {
    try {
      if (userHandle && typeof PublicKeyCredential.signalAllAcceptedCredentials === "function") {
        const allAcceptedCredentialIds = passkeys.filter(passkey => passkey.site === location.hostname).map(passkey => passkey.id);
        PublicKeyCredential.signalAllAcceptedCredentials({ rpId: location.hostname, userId: userHandle, allAcceptedCredentialIds }).catch(() => {});
      }
    } catch {}
  }

  // ---------- Bytes ----------

  function toBytes(base64Url) {
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function toBase64Url(buffer) {
    let binary = "";
    for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  return {
    supported,
    onIpAddress,
    usable: supported && !onIpAddress,
    IP_ADDRESS_TEXT,
    FRESH_MS,
    unlockName,
    deviceName,
    autofillAvailable,
    signInRequest,
    addRequest,
    signInAnswer,
    addAnswer,
    problem,
    forget,
    syncList
  };
})();
