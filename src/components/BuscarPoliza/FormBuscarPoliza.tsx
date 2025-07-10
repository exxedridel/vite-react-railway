import React, { useRef, RefObject } from "react";
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

const FormSchema = z.object({
  nombre_completo: z.any(),
  numero_poliza: z.any(),
});

const FormBuscarPoliza = () => {
  const { navigate, loading, setLoading, polizasData, setPolizasData, setCurrentPoliza } =
    useAppContext();
  const polizasEncontradasRef: RefObject<HTMLDivElement> = useRef(null);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      nombre_completo: "",
      numero_poliza: "",
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
              Polizas encontradas
            </p>
          ),
        });
        setPolizasData(polizas);
        if (polizasEncontradasRef.current) {
          polizasEncontradasRef.current.focus();
        }
      }, 1000);
    } catch (error) {
      console.log(error);
    }
  }

  function handleClick (poliza:any) {
    console.log(poliza)
    setCurrentPoliza(poliza)
    navigate("/registrar-siniestro")
  }

  return (
    <div className="md:container mt-5 w-full p-2 flex flex-col md:flex-row justify-between gap-5 items-center md:items-start">
      {loading && <AppLoader />}
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          autoComplete="off"
          className="max-h-[365px] bg-white rounded p-4 shadow w-full sm:w-[625px] space-y-5"
        >
          <div className="flex flex-col items-centerr">
            <span className="text-2xl">Busca una póliza</span>
            <Separator className="my-1" />
            <span className="text-[14px]">
              Por nombre del asegurado o número de póliza y elige una para
              reportar el siniestro.
            </span>
          </div>
          <FormField
            control={form.control}
            name="nombre_completo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del asegurado</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="numero_poliza"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de la póliza</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <Button type="submit" variant="default" className="w-full">
            Buscar
          </Button>
        </form>
      </Form>
      <div
        ref={polizasEncontradasRef}
        tabIndex={-1}
        className="bg-white rounded p-4 shadow w-full sm:w-[625px] space-y-2"
      >
        <span className="text-lg">Pólizas encontradas:</span>
        {"  "}
        <b className="text-md">
          {polizasData?.length ? polizasData?.length : "No hay resultados"}
        </b>
        <Separator />
        {/* <pre>{JSON.stringify(polizasData, null, 2)}</pre> */}
        {polizasData?.length &&
          polizasData?.map((poliza: any, i: number) => (
            <div>
              <div key={i} className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold">Nombre asegurado</span>
                  <span>{poliza.nombre_contratante_asegurado}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold">Nombre beneficiario</span>
                  <span>{poliza.nombre_beneficiario}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold">Sucursal</span>
                  <span>{poliza.oficina_emision}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold">Número póliza PK</span>
                  <span>{poliza.id_oficina_emision}-{poliza.numero_poliza}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold">Linea negocio</span>
                  <span>{poliza.linea_negocio}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold">Fecha fin vigencia</span>
                  <span>{poliza.fecha_fin_vigencia}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold">Vigencia</span>
                  <span>{poliza.estado_vigencia_id}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold">Estado del pago</span>
                  <span>{poliza.estado_pago_id}</span>
                </div>
              </div>
              <div className="flex flex-col mt-3">
                <Button variant="secondary" onClick={()=> handleClick(poliza)}>Reportar Siniestro</Button>
              </div>
              <Separator className="my-3"/>
            </div>
          ))}
      </div>
    </div>
  );
};

export default FormBuscarPoliza;
