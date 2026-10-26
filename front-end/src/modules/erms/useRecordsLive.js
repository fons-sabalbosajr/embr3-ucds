import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket, initializeSocket } from "../../api/socketService";

// ---------------------------------------------------------------------------
// The Records Unit's screens follow each other's writes.
//
// The server announces "erms:records" whenever a record is filed, edited,
// put right or marked reviewed (recordService.recordsChanged). The notice
// carries no data: the dashboard's counts — "Needs review" among them — the
// library and the review list ask the API again, each with its own scope.
// ---------------------------------------------------------------------------

export function useRecordsLive() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const socket = getSocket() || initializeSocket();
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["erms", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["erms", "records"] });
    };
    socket.on("erms:records", refresh);
    return () => socket.off("erms:records", refresh);
  }, [queryClient]);
}
