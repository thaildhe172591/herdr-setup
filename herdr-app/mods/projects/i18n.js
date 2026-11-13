// The UI language: shared "lang", "vi" (default) or "en" (docs/i18n-glossary.md). main.js calls
// setLang(shared("lang")) at the top of init and render; everything in this mod writes L(vi, en).
// Pure (no herdr import), so model code and its tests can use it too.
let lang = "vi";
export const setLang = (l) => { lang = l === "en" ? "en" : "vi"; };
export const L = (vi, en) => (lang === "en" ? en : vi);
