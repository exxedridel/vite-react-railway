import { Route, Routes } from "react-router-dom";
import EmployeesPage from "./pages/EmployeesPage";
import EmployeeForm from "./pages/EmployeeForm";
import NotFound from "./pages/NotFound";
import Navbar from "./components/Navbar";

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<EmployeesPage />} />
        <Route path="/new" element={<EmployeeForm />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;
