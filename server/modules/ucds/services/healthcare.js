// ---------------------------------------------------------------------------
// Healthcare Industries: the Monitoring Plan's healthcare list.
//
// From 2027 each year has its own register (yearScope.registerOf), loaded
// from the Planning Unit's RAW workbooks — the healthcare and clustered-firm
// lists among them, under serials of their own: HC-<province>-n (hospitals,
// clinics, laboratories, dialysis and diagnostic centres, dental clinics)
// and HCCL-<province>-n (clustered firms). They are one list across the
// provinces, so they get one screen, "Healthcare Industries" under the
// Monitoring Plan, instead of being scattered through the province pages.
//
// The register up to 2026 (the shared ucds-data) has no such serials, and
// its province pages are left as they are.
// ---------------------------------------------------------------------------

const HEALTHCARE_SERIAL = /^HC(CL)?-/i;

/** The pseudo-province the Healthcare Industries screen asks for. */
const isHealthcare = (province) => /^health[\s_]*care([\s_]*industries)?$/i.test(String(province || '').trim());

/** Whether the request's year has its own register, which is where the list lives. */
const hasOwnRegister = (req) => /^ucds-data-\d{4}$/.test(String(req?.yearContainer?.register || ''));

/** The healthcare list. */
const healthcareFilter = () => ({ sort_key: HEALTHCARE_SERIAL });

/** A province page without the healthcare list, in a year that has its own register. */
const provinceFilter = (req, provinceMatch) =>
  hasOwnRegister(req) ? { province: provinceMatch, sort_key: { $not: HEALTHCARE_SERIAL } } : { province: provinceMatch };

module.exports = { HEALTHCARE_SERIAL, isHealthcare, hasOwnRegister, healthcareFilter, provinceFilter };
