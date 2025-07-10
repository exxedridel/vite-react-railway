import GoBack from "@/components/Navigation/GoBack";
import FormRegistrarSiniestro from "@/components/RegistrarSiniestro/FormRegistrarSiniestro";

const RegistrarSiniestro = () => {
  return (
    <div>
      <GoBack />
      <div className="md:container mt-5 w-full p-2 flex flex-col md:flex-row justify-between gap-5 items-center md:items-start">
        <FormRegistrarSiniestro />
      </div>
    </div>
  );
};

export default RegistrarSiniestro;
