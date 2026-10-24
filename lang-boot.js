/*
 * Sets the page language before anything is painted.
 *
 * The document ships as lang="ar" dir="rtl" because Arabic is the shop's
 * primary language. For an English or Turkish visitor i18n.js used to flip the
 * direction after the first paint, and on a throttled connection that landed
 * about 0.4s late: the whole page mirrored horizontally in front of the
 * visitor, measured at a cumulative layout shift of 0.89 on desktop against a
 * budget of 0.05.
 *
 * This runs in the <head> without defer, so the correct direction is in place
 * before the first pixel. It repeats i18n.js's rules exactly — ?lang= wins,
 * then a saved choice, then the device, then Arabic — and i18n.js writing the
 * same values later is then a no-op rather than a reflow.
 */
(function () {
  var DIRS = { ar: "rtl", en: "ltr", tr: "ltr" };
  var KEY = "smarttech_lang";

  function normalize(value) {
    var code = String(value || "").toLowerCase().slice(0, 2);
    return DIRS[code] ? code : "";
  }

  function pick() {
    try {
      var asked = normalize(new URLSearchParams(location.search).get("lang"));
      if (asked) return asked;
    } catch (e) { /* URLSearchParams is missing on very old browsers */ }

    try {
      var saved = normalize(localStorage.getItem(KEY));
      if (saved) return saved;
    } catch (e) { /* private mode can throw on read */ }

    // A page may pin its own default; the admin panel is Arabic-first.
    var pinned = normalize(document.documentElement.getAttribute("data-default-lang"));
    if (pinned) return pinned;

    var list = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language];
    for (var i = 0; i < list.length; i++) {
      var code = normalize(list[i]);
      if (code) return code;
    }
    return "ar";
  }

  var lang = pick();
  document.documentElement.lang = lang;
  document.documentElement.dir = DIRS[lang];
})();
