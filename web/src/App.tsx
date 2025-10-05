import { Tldraw } from "tldraw";
import { useRebootStore } from "./RebootStore.tsx";
import "tldraw/tldraw.css";

function App() {
  const store = useRebootStore({ persistenceKey: "example" });

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw store={store} />
    </div>
  );
}

export default App;
