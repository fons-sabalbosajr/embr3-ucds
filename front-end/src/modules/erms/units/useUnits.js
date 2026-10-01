import { useQuery } from "@tanstack/react-query";
import { fetchUnits } from "../api/ermsService";

/** The units this person may see, with their document types, from the server. */
export function useUnits() {
  const query = useQuery({
    queryKey: ["erms", "units"],
    queryFn: fetchUnits,
    staleTime: 5 * 60 * 1000,
  });
  const units = query.data?.units || [];
  return {
    ...query,
    units,
    home: query.data?.home || null,
    upload: query.data?.upload || null,
    unit: (key) => units.find((u) => u.key === key) || null,
  };
}
