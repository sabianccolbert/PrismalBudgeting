/* ===========================================
 * Analytics.js - Google Analytics 4 (GA4)
 * =========================================== */

// 1. Initialize dataLayer and assign gtag to window scope
window.dataLayer = window.dataLayer || [];

if (typeof window.gtag !== 'function') {
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
}

// 2. Prevent duplicate script insertion if Analytics.js runs again
if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
  const gtagScript = document.createElement('script');
  gtagScript.async = true;
  gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-KD7WLLVTWC';
  document.head.appendChild(gtagScript);

  // 3. Send initial pageview configuration
  window.gtag('js', new Date());
  window.gtag('config', 'G-KD7WLLVTWC');
}