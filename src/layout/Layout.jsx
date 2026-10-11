import Navbar from "./Navbar/Navbar";
import AddPokemonDialog from "@/components/pokemon/AddPokemonDialog";
import { BattleMusicProvider } from "@/context/BattleMusicContext";

function Layout({ children }) {
  return (
    <BattleMusicProvider>
      <div>
        <Navbar />

        <div className="mx-auto w-full pt-1 pb-4">
          {children}
        </div>

        <AddPokemonDialog />
      </div>
    </BattleMusicProvider>
  );
}

export default Layout;