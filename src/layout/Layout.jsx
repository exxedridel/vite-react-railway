import Navbar from "./Navbar/Navbar";
import AddPokemonDialog from "@/components/pokemon/AddPokemonDialog";

function Layout({ children }) {
  return (
    <div>
      <Navbar />

      <div className="w-full mx-auto col-span-5 lg:p-12 py-2">
        {children}
      </div>

      <AddPokemonDialog />
    </div>
  );
}

export default Layout;