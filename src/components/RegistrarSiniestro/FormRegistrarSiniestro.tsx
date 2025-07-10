import { useAppContext } from "@/context/AppContext";
import AppLoader from "@/components/AppLoader/AppLoader";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "@/components/ui/use-toast";
import { Separator } from "../ui/separator";
import { polizas } from "@/services/objetosBackend";
import { CheckCircle2 } from "lucide-react";
import { Textarea } from "../ui/textarea";

const FormSchema = z.object({
  fecha_ocurrencia: z.string().min(1, {
    message: "Campo requerido",
  }),
  hora_ocurrencia: z.string().min(1, {
    message: "Campo requerido",
  }),
  lugar_ocurrencia: z.string().min(1, {
    message: "Campo requerido",
  }),
  nombre_reportador: z.string().min(1, {
    message: "Campo requerido",
  }),
  telefono_reportador: z.string().min(1, {
    message: "Campo requerido",
  }),
  email_reportador: z.string().min(1, {
    message: "Campo requerido",
  }),
  descripcion_siniestro: z.string().min(1, {
    message: "Campo requerido",
  }),
  placas: z.string().min(1, {
    message: "Campo requerido",
  }),
  color: z.string().min(1, {
    message: "Campo requerido",
  }),
  observaciones: z.any(),
  fecha_registro_ocurrencia: z.string().min(1, {
    message: "Campo requerido",
  }),
  numero_siniestro: z.string().min(1, {
    message: "Campo requerido",
  }),
  nombre_ajustador: z.string().min(1, {
    message: "Campo requerido",
  }),
});

const FormRegistrarSiniestro = () => {
  const { navigate, loading, setLoading, currentPoliza } = useAppContext();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      fecha_ocurrencia: "",
      hora_ocurrencia: "",
      lugar_ocurrencia: "",
      nombre_reportador: "",
      telefono_reportador: "",
      email_reportador: "",
      descripcion_siniestro: "",
      placas: "",
      color: "",
      observaciones: "",
      fecha_registro_ocurrencia: "",
      numero_siniestro: "",
      nombre_ajustador: "",
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    try {
      setLoading(true);
      await setTimeout(() => {
        setLoading(false);
        toast({
          description: (
            <p className="flex flex-row items-center gap-3">
              <CheckCircle2 className="h-5 w-5" />
              Siniestro registrado exitosamente
            </p>
          ),
        });
        navigate("/dashboard")
      }, 1000);
    } catch (error) {
      console.log(error);
    }
  }

  return (
    <div className="md:container w-full p-2 flex flex-col md:flex-row justify-between gap-5 items-center md:items-start">
      {loading && <AppLoader />}
      <div
        className="h-full bg-white rounded p-4 shadow w-full sm:w-[625px] space-y-2"
      >
        <span className="text-xl">Póliza Seleccionada</span>
        <Separator />
        {/* <pre>{JSON.stringify(currentPoliza, null, 2)}</pre> */}
        <div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <span className="text-sm font-bold">Nombre asegurado</span>
              <span>{currentPoliza?.nombre_contratante_asegurado}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Nombre beneficiario</span>
              <span>{currentPoliza?.nombre_beneficiario}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Sucursal</span>
              <span>{currentPoliza?.oficina_emision}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Número póliza PK</span>
              <span>
                {currentPoliza?.id_oficina_emision}-
                {currentPoliza?.numero_poliza}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Linea negocio</span>
              <span>{currentPoliza?.linea_negocio}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Fecha emisión</span>
              <span>{currentPoliza?.fecha_emision}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Fecha inicio vigencia</span>
              <span>{currentPoliza?.fecha_inicio_vigencia}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Fecha fin vigencia</span>
              <span>{currentPoliza?.fecha_fin_vigencia}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Vigencia</span>
              <span>{currentPoliza?.estado_vigencia_id}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Estado del pago</span>
              <span>{currentPoliza?.estado_pago_id}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Estado del pago</span>
              <span>{currentPoliza?.periodicidad_pago}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Siniestros reportados</span>
              <span>{currentPoliza?.siniestros.length}</span>
            </div>
          </div>
          <div className="flex flex-col mt-3">
            <div className="grid grid-cols-2 gap-4">
              <span className="text-sm font-bold">Información vehículo:</span>
              {currentPoliza?.info_vehiculo?.tipo === "N/A" ? (
                "No aplica"
              ) : (
                <span className="flex flex-col">
                  <span>Tipo: {currentPoliza?.info_vehiculo?.tipo}</span>
                  <span>Marca: {currentPoliza?.info_vehiculo?.marca}</span>
                  <span>Modelo: {currentPoliza?.info_vehiculo?.modelo}</span>
                  <span>Color: {currentPoliza?.info_vehiculo?.color}</span>
                  <span>Placas: {currentPoliza?.info_vehiculo?.placas}</span>
                </span>
              )}
            </div>
          </div>
          <Separator className="my-3" />
        </div>
      </div>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          autoComplete="off"
          className="bg-white rounded p-4 shadow w-full sm:w-[625px] space-y-3"
        >
          <div className="flex flex-col items-centerr">
            <span className="text-2xl font">Registrar Siniestro</span>
            <Separator className="my-1" />
            <span className="text-[14px]">
              Registra los datos para hacer válido el siniestro en el caso de
              póliza vigente.
            </span>
          </div>
          <FormField
            control={form.control}
            name="fecha_ocurrencia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de ocurrencia</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hora_ocurrencia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hora de ocurrencia</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lugar_ocurrencia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lugar de ocurrencia</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="nombre_reportador"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre de quien reporta</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="telefono_reportador"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono de quien reporta</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email_reportador"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Correo de quien reporta</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="descripcion_siniestro"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción del siniestro</FormLabel>
                <FormControl>
                  <Textarea autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="placas"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Placas del vehículo</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color del vehículo</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="observaciones"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observaciones</FormLabel>
                <FormControl>
                  <Textarea autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <Separator/>
          <div className="text-xl pt-1">Confirmación del asegurado</div>
          <FormField
            control={form.control}
            name="fecha_registro_ocurrencia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha registro de ocurrencia</FormLabel>
                <FormControl>
                <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="numero_siniestro"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número del siniestro</FormLabel>
                <FormControl>
                <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="nombre_ajustador"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del ajustador</FormLabel>
                <FormControl>
                <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <Button type="submit" variant="default" className="w-full">
            Registrar
          </Button>
        </form>
      </Form>
    </div>
  );
};

export default FormRegistrarSiniestro;
