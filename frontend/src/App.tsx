import { useEffect, useState, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { fetchServices, type ServicesResponse } from "./api";
import { TopologyCanvas } from "./TopologyCanvas";

export default function App() {
  const [data, setData] = useState<ServicesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchServices()
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (error) return <div style={{ padding: 20, color: "red" }}>Ошибка: {error}</div>;
  if (!data) return <div style={{ padding: 20 }}>Загрузка...</div>;

  return (
    <ReactFlowProvider>
      <TopologyCanvas data={data} onRefresh={refresh} />
    </ReactFlowProvider>
  );
}
