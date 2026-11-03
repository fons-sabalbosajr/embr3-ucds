import { useEffect, useState } from "react";
import { Tabs } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import RecordFormModal from "./RecordFormModal";
import UnitUploadModal from "../units/UnitUploadModal";
import { useUnits } from "../units/useUnits";
import { unitTheme } from "../units/unitTheme";
import { fetchFilterOptions } from "../api/ermsService";

// ---------------------------------------------------------------------------
// Upload record / Upload document, for whoever files in more than one unit
// (the Developer, an Administrator): one window with a tab per unit —
// Records, Legal Services, Laboratory — each its own form, as the unit's
// staff see it. Someone who files in one unit gets that unit's form alone.
//
// Switching tabs stays on the page. A document filed in another unit than
// the page's opens where it lives.
// ---------------------------------------------------------------------------

const ORDER = ["records", "legal", "laboratory"];
const pathOf = (unit, serialNo) =>
  unit === "records" ? `/e-universe/erms/records/${encodeURIComponent(serialNo)}` : `/e-universe/erms/${unit}/documents?open=${encodeURIComponent(serialNo)}`;

/**
 * @param open     whether the window is open
 * @param start    the page's unit, the tab it opens on
 * @param onClose  (saved | null) — `saved` only when it was filed in `start`
 */
export default function UploadHub({ open, start, onClose }) {
  const navigate = useNavigate();
  const { units, unit: unitOf } = useUnits();
  const fileable = ORDER.filter((k) => units.some((u) => u.key === k && u.canFile));
  const [active, setActive] = useState(start);
  useEffect(() => {
    if (open) setActive(start);
  }, [open, start]);

  // The provinces Records may file in — the Records page's own query, so usually cached.
  const { data: options } = useQuery({
    queryKey: ["erms", "filter-options"],
    queryFn: fetchFilterOptions,
    staleTime: 60 * 1000,
    enabled: open && active === "records",
  });

  const close = (saved) => {
    if (saved && active !== start) {
      onClose(null);
      navigate(pathOf(active, saved.serialNo));
      return;
    }
    onClose(saved || null);
  };

  const switcher =
    fileable.length > 1 ? (
      <Tabs
        type="card"
        size="small"
        activeKey={active}
        onChange={setActive}
        style={{ marginBottom: 8 }}
        items={fileable.map((k) => {
          const t = unitTheme(k);
          return {
            key: k,
            label: (
              <span>
                <span style={{ color: t.accent, marginInlineEnd: 6 }}>{t.icon}</span>
                {t.label}
              </span>
            ),
          };
        })}
      />
    ) : null;

  return (
    <>
      <RecordFormModal open={open && active === "records"} record={null} writableProvinces={options?.writableProvinces} unitSwitch={switcher} onClose={close} />
      {active !== "records" && (
        <UnitUploadModal key={active} unit={active} unitConfig={unitOf(active)} open={open} unitSwitch={switcher} onClose={close} />
      )}
    </>
  );
}
