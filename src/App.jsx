import { Route, Routes } from "react-router-dom";
import { TasksContextProvider } from "./context/TasksContext";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Register from "./pages/Register";
import TaskForm from "./pages/TaskForm";
import EmployeeForm from "./pages/EmployeeForm";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <div>
      <Navbar />
      <div className="container mx-auto">
        <TasksContextProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/register" element={<Register />} />
            <Route path="/new-task" element={<TaskForm />} />
            <Route path="/new-employee" element={<EmployeeForm />} />
            <Route path="/edit/:id" element={<TaskForm />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TasksContextProvider>
      </div>
    </div>
  );
}

export default App;
