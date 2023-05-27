import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import TaskForm from "./pages/TaskForm";
import EmployeeForm from "./pages/EmployeeForm";
import NotFound from "./pages/NotFound";
import Navbar from "./components/Navbar";

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new-task" element={<TaskForm />} />
        <Route path="/new-employee" element={<EmployeeForm />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;
