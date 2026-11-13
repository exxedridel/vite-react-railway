import { Route, Routes } from "react-router-dom";
import ProtectedRoutes from "./components/Navigation/ProtectedRoutes";
import IdleTimer from "@/components/Navigation/IdleTimer";
import Login from "./pages/Login";
import AppExperience from "@/components/admin/AppExperience";
import AppRoutes from "./components/Navigation/AppRoutes";
import Logout from "./components/Navigation/Logout";
import NotFound from "./pages/NotFound";
import TestMessagesPage from "./pages/TestMessagesPage";
import UsersPage from "./pages/UsersPage";
import AdminRoutes from "./components/Navigation/AdminRoutes";
import BackOfficePage from "./pages/BackOfficePage";

function App() {
  return (
    <Routes>
      <Route index element={<Login />} />
      <Route
        path="/back-office"
        element={
          <ProtectedRoutes>
            <AdminRoutes>
              <IdleTimer>
                <BackOfficePage />
              </IdleTimer>
            </AdminRoutes>
          </ProtectedRoutes>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoutes>
            <AdminRoutes>
              <IdleTimer>
                <UsersPage />
              </IdleTimer>
            </AdminRoutes>
          </ProtectedRoutes>
        }
      />
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
      <Route path="/logout" element={<Logout />} />
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
