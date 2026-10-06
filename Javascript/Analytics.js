/* ===========================================
 * Analytics.js - Google Analytics 4 (GA4)
 * ===========================================
 * Loads only when this device hasn't turned analytics off (Settings) and the browser doesn't ask sites
 * not to track it (Global Privacy Control or Do Not Track). Pages are reported without their ?query
 * and #hash, so private codes in links (like a password reset link's) never leave the site.
 * window.ANALYTICS_STATUS tells Settings which applies: "on", "off" (this device), or "browser".
 * Signing out keeps the device's choice (see clearSignedInData in Layout.js).
 */

(function analytics() {
  const MEASUREMENT_ID = 'G-KD7WLLVTWC';
  window.ANALYTICS_ID = MEASUREMENT_ID; // Settings uses it to stop analytics on the page right away

  let deviceOff = false;
  try { deviceOff = localStorage.getItem('prismal_analytics') === 'off'; } catch (e) {}
  const browserSaysNo = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  window.ANALYTICS_STATUS = deviceOff ? 'off' : (browserSaysNo ? 'browser' : 'on');
  if (window.ANALYTICS_STATUS !== 'on') return;

  // 1. Initialize dataLayer and assign gtag to window scope
  window.dataLayer = window.dataLayer || [];

  if (typeof window.gtag !== 'function') {
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
  }

  // Just the page's address: no ?query (reset links, keys) and no #hash
  const bare = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.origin + parsed.pathname;
    } catch (e) {
      return '';
    }
  };

  // 2. Prevent duplicate script insertion if Analytics.js runs again
  if (document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) return;

  // 3. The page view, queued now; Google's script reads the queue when it arrives
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { page_location: bare(location.href), page_referrer: bare(document.referrer) });

  // 4. Google's script loads after the page has (a script added before then would hold up the page's
  //    load, and with it the page sliding in)
  const loadGtag = () => {
    const gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(gtagScript);
  };
  if (document.readyState === 'complete') loadGtag();
  else window.addEventListener('load', loadGtag, { once: true });
})();
