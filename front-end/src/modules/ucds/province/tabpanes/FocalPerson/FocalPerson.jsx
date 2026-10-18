import { useEffect } from "react";
import { Input, Select } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import "./focalperson.css";
import { Columns, Field, Section, Stack, Value } from "../RecordForm";
import SuggestInput from "../SuggestInput";
import { isRawLayout, isYes, iisNumbersOf, iisTrackerUrl } from "../registerLayout";
import { FullDate, MonthOnly, MonthRange, IisInput, IisEntries, IisAllYearsList } from "../DateInputs";
import SectionInCharged from "../../../../../components/Autocomplete/SectionInCharge";
import Inspector from "../../../../../components/Autocomplete/Inspectors";
import ReportType from "../../../../../components/Autocomplete/ReportType";
import InspectionType from "../../../../../components/Autocomplete/InspectionType";
import WWTFType from "../../../../../components/Autocomplete/WWTFType";
import ProjectStatus from "../../../../../components/Autocomplete/ProjectStatus";


function calculateWeekdayDiff(startDate, endDate) {
  const startDayjs = dayjs(startDate);
  const endDayjs = dayjs(endDate);
  const totalDays = endDayjs.diff(startDayjs, "day");
  let weekendDays = 0;

  for (let i = 0; i < totalDays; i++) {
    const day = startDayjs.add(i, "day");
    const dayOfWeek = day.day(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Sunday or Saturday
      weekendDays++;
    }
  }

  const weekdayDiff = Math.max(1, totalDays - weekendDays);
  const dayString = weekdayDiff === 1 ? " day" : " days";
  return `${weekdayDiff}${dayString}`;
}

const padZero = (num) => (num < 10 ? "0" : "") + num;

const convertToMMDDYYYY = (dateString) => {
  if (typeof dateString === "number") {
    // Handle Excel date numeric value
    const date = new Date(Math.round((dateString - 25569) * 86400 * 1000));
    return `${padZero(date.getMonth() + 1)}/${padZero(date.getDate())}/${date.getFullYear()}`;
  }
  // Handle string date formats
  const date = dayjs(dateString, ["MM/DD/YYYY", "M/D/YYYY", "YYYY-MM-DD", "YYYY/MM/DD", "@", "MMM D, YYYY", "MMMM DD, YYYY"], true);
  return date.isValid() ? date.format("MM/DD/YYYY") : null;
};

const calculateBOD = (empNoTotal, wwtfType) => {
  const wwtfTypeValues = {
    WWTF: 0.6,
    "SEPTIC TANK": 0.25,
    "DIRECT DISCHARGE": 1,
    "N/A": 0, // assuming N/A means 0
  };
  const v1 = wwtfTypeValues[wwtfType.toUpperCase()];
  const v2 = Number(empNoTotal);
  let bod;
  if (v2 === 0) bod = "";
  else if (wwtfType.toUpperCase() === "DIRECT DISCHARGE") bod = (v2 * 0.0378).toFixed(4);
  else bod = (v2 * 0.0378 * (1 - v1)).toFixed(4);
  return bod + " kg/day";
};

// "Reported to CO": a month or a quarter, as the RAW workbooks write it.
const REPORTED_TO_CO = ["1ST QUARTER", "2ND QUARTER", "3RD QUARTER", "4TH QUARTER", "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// The RAW workbooks' Planning Unit lists, spelled as they are there (no
// "Mr."/"Ms.": the names were not matching the file's). The values already
// in the register are suggested too (SuggestInput).
const PISMU_STAFF = ["Marshalle Julluice V. Catua", "Alyanna Y. Patdu", "Christian M. Abad"];
const RECOMMENDATIONS = ["FFM", "For Issuance of NOV", "For Issuance of ORDER/RESO", "For Appropriate Action of Legal Unit"];

/** IIS numbers as a list, each one a link to its page in the IIS document tracker. */
const IisList = ({ value }) => {
  const nos = iisNumbersOf(value);
  if (!nos.length) return <Value />;
  return (
    <ul className="rf-iis-list">
      {nos.map((no) => (
        <li key={no}>
          <a href={iisTrackerUrl(no)} target="_blank" rel="noopener noreferrer" title="Open in the IIS document tracker">
            <LinkOutlined /> {no}
          </a>
        </li>
      ))}
    </ul>
  );
};

// ---------------------------------------------------------------------------
// The record view's "Concerned Unit / Focal Person": who monitors the
// establishment and when, its IIS reference numbers, its wastewater and the
// Planning Unit's own box — two columns (RecordForm.jsx). A 2027 record shows
// the fields of the RAW workbooks it was loaded from (registerLayout.js).
// ---------------------------------------------------------------------------

const FocalPerson = ({ editedRecord, handleChange, isEditing, currentUser }) => {
  const raw = isRawLayout(editedRecord);

  // Every value is read from the record itself — no copy kept here — so
  // Cancel, which puts the record back, puts the cards back too.
  const formattedDateMonitored = convertToMMDDYYYY(editedRecord.date_monitored);
  const formattedDateRouted = convertToMMDDYYYY(editedRecord.date_routed);
  const formattedDateSigned = convertToMMDDYYYY(editedRecord.date_signed);
  const daysDmds = editedRecord?.days_dmds;
  // The register's field is days_drds (it used to be saved as days_dsdrs, which nothing read).
  const daysDrds = editedRecord?.days_drds ?? editedRecord?.days_dsdrs;

  // The day counts follow the dates — while editing only: opening a record
  // to read it no longer changes it.
  useEffect(() => {
    if (!isEditing) return;
    const next = formattedDateMonitored && formattedDateRouted ? calculateWeekdayDiff(formattedDateMonitored, formattedDateRouted) : "";
    if ((editedRecord?.days_dmds ?? "") !== next) handleChange("days_dmds", next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, formattedDateMonitored, formattedDateRouted]);

  useEffect(() => {
    if (!isEditing) return;
    const next = formattedDateRouted && formattedDateSigned ? calculateWeekdayDiff(formattedDateRouted, formattedDateSigned) : "";
    if ((editedRecord?.days_drds ?? "") !== next) handleChange("days_drds", next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, formattedDateRouted, formattedDateSigned]);

  // Wastewater, up to 2026: the BOD worked out from the employees and the WWTF.
  const empNoTotal = editedRecord?.emp_total ?? "";
  const wwtftype = editedRecord?.wwtf_type ?? editedRecord?.wwtftype ?? "";
  const bod = editedRecord?.bod ?? "";

  const handleEmpNoTotalChange = (e) => {
    const value = e.target.value;
    handleChange("emp_total", value);
    if (wwtftype) handleChange("bod", calculateBOD(value, wwtftype));
  };

  const handleWwtftypeChange = (value) => {
    handleChange("wwtf_type", value);
    if (empNoTotal) handleChange("bod", value ? calculateBOD(empNoTotal, value) : 0);
  };

  // Named capability flags from GET /api/auth/me
  const capabilities = currentUser?.capabilities || {};
  const isCardDisabled = capabilities.canManageData !== true;
  const planningEditable = isEditing && !isCardDisabled;
  // The Planning Unit's remarks: `remarks` up to 2026, the RAW workbooks' Remarks/Recommendations column from 2027.
  const remarksField = raw ? "recommendations" : "remarks";

  const pick = (node, value) => (isEditing ? node : <Value>{value}</Value>);
  // A day: a date picker, saved m/d/yyyy as the register writes it (DateInputs.jsx).
  const dateField = (label, field, formatted) => (
    <Field key={field} label={label} hint="full date" md={8}>
      {isEditing ? <FullDate value={editedRecord?.[field]} onChange={(v) => handleChange(field, v)} /> : <Value mono>{formatted}</Value>}
    </Field>
  );
  // IIS numbers: a list of links; while editing, one box taking several — one per line.
  const iisField = (field, label, md = 12) => (
    <Field key={field} label={label} hint={isEditing ? "one per line" : undefined} md={md}>
      {isEditing ? <IisInput value={editedRecord?.[field] || ""} onChange={(v) => handleChange(field, v)} /> : <IisList value={editedRecord?.[field]} />}
    </Field>
  );

  // "With previously issued NOV?": YES / NO in the RAW workbooks, ✔ / ✘ in the register before them.
  const novValue = editedRecord?.with_nov ? (isYes(editedRecord.with_nov) ? "yes" : "no") : undefined;
  const setNov = (v) => handleChange("with_nov", v === "yes" ? (raw ? "YES" : "✔") : v === "no" ? (raw ? "NO" : "✘") : "");

  return (
    <div className={`rf rf-roomy ${isEditing ? "is-editing" : "is-viewing"}`}>
      <Columns>
        <Stack>
          <Section title="Monitoring">
            <Field label="Section in charge" md={12}>
              {pick(<SectionInCharged value={editedRecord ? editedRecord.section_incharged : ""} onChange={(value) => handleChange("section_incharged", value)} readOnly={!isEditing} />, editedRecord?.section_incharged)}
            </Field>
            <Field label="Inspector / handler" md={12}>
              {pick(<Inspector value={editedRecord ? editedRecord.handler : ""} onChange={(value) => handleChange("handler", value)} readOnly={!isEditing} placeholder="No data" />, editedRecord?.handler)}
            </Field>
            <Field label="Schedule of monitoring" hint="month" md={12}>
              {pick(<MonthOnly value={editedRecord?.monitoring_sched} onChange={(value) => handleChange("monitoring_sched", value)} />, editedRecord?.monitoring_sched)}
            </Field>
            <Field label="Type of inspection" md={12}>
              {pick(<InspectionType value={editedRecord ? editedRecord.insp_type : ""} onChange={(value) => handleChange("insp_type", value)} readOnly={!isEditing} placeholder="No data" />, editedRecord?.insp_type)}
            </Field>
            <Field label="Project status" md={12}>
              {pick(<ProjectStatus value={editedRecord ? editedRecord.title_status : ""} onChange={(value) => handleChange("title_status", value)} readOnly={!isEditing} placeholder="No data" />, editedRecord?.title_status)}
            </Field>
            <Field label="Type of report submitted" md={12}>
              {pick(<ReportType value={editedRecord ? editedRecord.report_type : ""} onChange={(value) => handleChange("report_type", value)} readOnly={!isEditing} placeholder="No data" />, editedRecord?.report_type)}
            </Field>
          </Section>

          {/* The Planning Unit's columns, as the RAW workbooks have them:
              Tracking_of_Reports (the PISMU staff receiving), ACCOMPLISHMENT
              COUNT (the month received), Remarks/Recommendations, With
              previously issued NOV?, and REPORTED TO CO (Manila Bay area). */}
          <Section title="Planning Unit" className="rf-fill" tone={isCardDisabled ? "is-locked" : undefined} extra={isCardDisabled && <span className="rf-hint">Planning Unit only</span>}>
            <Field label="Received by (PISMU)" hint="staff receiving the report" md={12}>
              {planningEditable ? (
                <SuggestInput field="pismu_tracking" base={PISMU_STAFF} value={editedRecord?.pismu_tracking || ""} onChange={(v) => handleChange("pismu_tracking", v)} placeholder="Name of the PISMU staff" />
              ) : (
                <Value>{editedRecord?.pismu_tracking}</Value>
              )}
            </Field>
            <Field label="Accomplishment count" hint={raw ? "month received by PISMU" : "month, or from–to"} md={12}>
              {planningEditable ? (
                raw ? (
                  <MonthOnly value={editedRecord?.pismu_count_month} onChange={(v) => handleChange("pismu_count_month", v)} />
                ) : (
                  <MonthRange value={editedRecord?.pismu_count_month} onChange={(v) => handleChange("pismu_count_month", v)} />
                )
              ) : (
                <Value>{editedRecord?.pismu_count_month}</Value>
              )}
            </Field>
            <Field label="Remarks / recommendations">
              {planningEditable ? (
                <SuggestInput field={remarksField} base={RECOMMENDATIONS} value={editedRecord ? editedRecord[remarksField] || "" : ""} onChange={(v) => handleChange(remarksField, v)} placeholder="e.g. FFM, For Issuance of NOV" />
              ) : (
                <Value>{editedRecord?.[remarksField]}</Value>
              )}
            </Field>
            <Field label="Previously issued NOV?" md={12}>
              {planningEditable ? (
                <Select value={novValue} onChange={setNov} allowClear placeholder="Yes or no" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} style={{ width: "100%" }} />
              ) : (
                <Value>{novValue === "yes" ? "Yes" : novValue === "no" ? "No" : ""}</Value>
              )}
            </Field>
            {raw && (
              <Field label="Reported to CO" hint="Manila Bay area" md={12}>
                {planningEditable ? (
                  <SuggestInput field="reported_to_co" base={REPORTED_TO_CO} value={editedRecord?.reported_to_co || ""} onChange={(v) => handleChange("reported_to_co", v)} placeholder="e.g. 2ND QUARTER" />
                ) : (
                  <Value>{editedRecord?.reported_to_co}</Value>
                )}
              </Field>
            )}
          </Section>
        </Stack>

        <Stack>
          <Section title="Dates">
            {dateField("Date monitored", "date_monitored", formattedDateMonitored)}
            {dateField("Date routed (IIS)", "date_routed", formattedDateRouted)}
            {dateField("Date signed", "date_signed", formattedDateSigned)}
            <Field label="Days: monitored → routed" hint="weekdays" md={12}>
              <Value auto>{daysDmds}</Value>
            </Field>
            <Field label="Days: routed → signed" hint="weekdays" md={12}>
              <Value auto>{daysDrds}</Value>
            </Field>
          </Section>

          <Section title="IIS reference numbers" extra={!isEditing && <span className="rf-hint">click a number to open it in IIS</span>}>
            {/* Every monitoring year's IIS numbers in one field: each line is filed
                a reference no. and the year it is filed under (DateInputs.jsx IisEntries). */}
            <Field label="Monitoring IIS no." hint={isEditing ? "a reference no. and its year, per entry" : "by year"} box>
              {isEditing ? (
                <IisEntries record={editedRecord} onChange={(patch) => Object.entries(patch).forEach(([f, v]) => handleChange(f, v))} />
              ) : (
                <IisAllYearsList record={editedRecord} />
              )}
            </Field>
            {raw && iisField("iis_no_nov", "Notice of Violation", 12)}
            {raw && iisField("iis_survey", "Survey report", 12)}
          </Section>

          <Section title="Wastewater" className="rf-fill">
            {raw ? (
              <Field label="BOD" hint="kg/day">
                {isEditing ? (
                  <Input value={editedRecord?.bod ?? ""} onChange={(e) => handleChange("bod", e.target.value)} placeholder="0.0000" inputMode="decimal" />
                ) : (
                  <Value mono>{editedRecord?.bod}</Value>
                )}
              </Field>
            ) : (
              <>
                <Field label="Number of employees" md={8}>
                  {isEditing ? <Input type="number" min="0" name="emp_total" value={empNoTotal} onChange={handleEmpNoTotalChange} placeholder="0" /> : <Value mono>{empNoTotal}</Value>}
                </Field>
                <Field label="Type of WWTF" md={8}>
                  {pick(<WWTFType value={wwtftype} onChange={handleWwtftypeChange} readOnly={!isEditing} placeholder="No data" />, wwtftype)}
                </Field>
                <Field label="BOD" hint="kg/day, worked out" md={8}>
                  <Value auto mono>{bod}</Value>
                </Field>
              </>
            )}
          </Section>
        </Stack>
      </Columns>
    </div>
  );
};

export default FocalPerson;
