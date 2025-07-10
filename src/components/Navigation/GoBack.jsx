import { useAppContext } from "@/context/AppContext";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const GoBack = () => {
  const { navigate } = useAppContext();
  return (
    <div className="md:container w-full">
      <div className="flex justify-end bg-secondary border">
        <Button variant="link" onClick={() => navigate(-1)}>
          <ChevronLeft />
          Regresar
        </Button>
      </div>
    </div>
  );
};

export default GoBack;
