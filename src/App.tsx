import { Route, Routes } from "react-router-dom";
import ProtectedRoutes from "./components/Navigation/ProtectedRoutes";
import IdleTimer from "@/components/Navigation/IdleTimer";
import Login from "./pages/Login";
import Layout from "./layout/Layout";
import AppRoutes from "./components/Navigation/AppRoutes";
import Logout from "./components/Navigation/Logout";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <Routes>
      <Route index element={<Login />} />

      {AppRoutes.map((route, index) => (
        <Route
          key={index}
          path={route.path}
          element={
            <ProtectedRoutes>
              <IdleTimer>
                <Layout>
                  <route.component />
                </Layout>
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
