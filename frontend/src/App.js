import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Configurator from "@/pages/Configurator";

function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Configurator />} />
            <Route path="/:productType" element={<Configurator />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </div>
    </TooltipProvider>
  );
}

export default App;
