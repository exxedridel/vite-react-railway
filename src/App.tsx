import { Route, Routes } from "react-router-dom";
import ProtectedRoutes from "./components/Navigation/ProtectedRoutes";
import IdleTimer from "@/components/Navigation/IdleTimer";
import Login from "./pages/Login";
import AppExperience from "@/components/admin/AppExperience";
import AppRoutes from "./components/Navigation/AppRoutes";
import Logout from "./components/Navigation/Logout";
import NotFound from "./pages/NotFound";
import TestMessagesPage from "./pages/TestMessagesPage";

function App() {
  return (
    <Routes>
      <Route index element={<Login />} />
      <Route
        path="/mensajes-prueba"
        element={
          <ProtectedRoutes>
            <IdleTimer>
              <TestMessagesPage />
            </IdleTimer>
          </ProtectedRoutes>
        }
      />
      {AppRoutes.map((route, index) => (
        <Route
          key={index}
          path={route.path}
          element={
            <ProtectedRoutes>
              <IdleTimer>
                <AppExperience>
                  <route.component />
                </AppExperience>
              </IdleTimer>
            </ProtectedRoutes>
          }
        />
      ))}
      <Route
        path="/logout"
        element={
          <ProtectedRoutes>
            <Logout />
          </ProtectedRoutes>
        }
      />
      <Route
        path="*"
        element={
          <IdleTimer>
            <NotFound />
          </IdleTimer>
        }
      />
    </Routes>
  );
}
export default App;
