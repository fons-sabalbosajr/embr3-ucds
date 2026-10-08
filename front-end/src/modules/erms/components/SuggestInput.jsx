import { useEffect, useState } from "react";
import { AutoComplete, Input, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// A text field that offers the values already on file — the docket, the
// company, the proponent — as it is typed, most used first.
//
// Free text underneath: a new value is typed and saved like any other. When
// the chosen suggestion carries companion values (a docket's company and
// address), `onPick` receives them so the form can fill what is still empty.
//
// Used inside a Form.Item, which supplies the id (so its label points at
// the input), the value and onChange.
// ---------------------------------------------------------------------------

const SuggestInput = ({ id, value, onChange, fetcher, queryKey, onPick, placeholder, textarea = false, disabled }) => {
  const [text, setText] = useState(value || "");
  const [debounced, setDebounced] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => setText(value || ""), [value]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(String(text || "").trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const { data: items = [] } = useQuery({
    queryKey: ["erms", "suggest", ...queryKey, debounced],
    queryFn: () => fetcher(debounced),
    enabled: focused && !disabled,
    staleTime: 60 * 1000,
  });

  const options = items
    .filter((it) => it.value !== text)
    .map((it) => ({
      value: it.value,
      item: it,
      label: (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{it.value}</span>
          {it.count > 1 && <Typography.Text type="secondary" style={{ fontSize: 12, flex: "none" }}>{it.count}×</Typography.Text>}
        </div>
      ),
    }));

  return (
    <AutoComplete
      id={id}
      value={text}
      options={options}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(v) => {
        setText(v);
        onChange?.(v);
      }}
      onSelect={(v, option) => {
        setText(v);
        onChange?.(v);
        if (option?.item?.fill) onPick?.(option.item.fill);
      }}
      popupMatchSelectWidth={textarea ? true : 360}
      style={{ width: "100%" }}
    >
      {textarea ? <Input.TextArea rows={2} placeholder={placeholder} /> : <Input placeholder={placeholder} allowClear />}
    </AutoComplete>
  );
};

export default SuggestInput;
