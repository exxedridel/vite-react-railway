// src/api/elegirClienteApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { ClientResult } from '@/slices/interfaces/clientResult-response.interface'
import { VentaPayload } from '@/slices/interfaces/ventaPayload.interface';
import { CalcPrimaPayload, PrimaResponse } from '@/slices/interfaces/calcularPrima.interface';

const baseUrl = import.meta.env.VITE_BASE_MIDDLEWARE;
const path = "/api/v1/aramis";

export interface ClientePayload {
  fc_clave_asegurado?: string;
  name?: string;
  rfc?: string;
  tipo_asegurado?: string;
  id?: string;
  user_id?: number;
  asegurado_id?: string;
  validado?: number;
  personales?: {};
}


export const elegirClienteApi = createApi({
  reducerPath: 'elegirClienteApi',
  baseQuery: fetchBaseQuery({
    baseUrl: baseUrl + path, prepareHeaders: (headers) => {
      const token = localStorage.getItem("bearer_token");
      // const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI3IiwianRpIjoiZmQxYzAxNjYzZjUwM2MzZjE5ZTE0MzQ5OTUyMzEzZDViNjkxZjZmOTg3NzUyODk2OWMxNTIyNzNlMTBjZGRmODg3YjAxY2Q3MDVkMTBkODgiLCJpYXQiOjE3NDY2NDU2NDAuOTcwNzAxLCJuYmYiOjE3NDY2NDU2NDAuOTcwNzA0LCJleHAiOjE3NzgxODE2NDAuOTUyOTQsInN1YiI6IjYiLCJzY29wZXMiOltdfQ.dgFWQb7VYOgFRI8QBqL1RbKQwJwliGs0i2qK3R3HhbZxmMwnxdjskuumq_qw7Nb0XFLVj92nm4FVRY3c901ppUxmux0zJBtCL97z3JWMtL6DVaOeih3nKD4XsD98bMKegjOAUwEY98QvgEDrH3javv_quie4Ro5brMs9NYpOBELmmkJ0tFUeReHBqXynX9jBRB6T4PGRzClvngsa1bJ1usr1oXDT3CBzq7A6lp0WUfL13wTYaFAi5o_JnuwLyp6uW1oa4PsquusvnPCDPDjAcenQic8Gk5uF7dU6rdOyj59WfITj3HLdyGeJsEcF-grMS9OLIzQSmAlC2KKQj6lmczBlklIWk_bfqTCnfJEtIXtGFiEvBjl7MPbLKH1W2H3gIqrlHFko1JYdJHy9VgldCxLk66GsskLNjKgs5s9r6zWaWNCGUnQYtbAclZ9gPWmZ8EnEZzeOB7gAHiXyS1zugMtt5AIyF6IIs4o57C72k0pJ2f-kLFOspNfHH6GH0FfnL0nVmiylAPSEWfC0GOZH1rzkO7ki5lMFbvpekc887-QRQhKPqNXiddqfFBFrsivCeJpE3ddqIsjqxyRABhgKOop_sHeb0WyqQ-FSeEkSk1AcH4jNS5DV-xdiqSx5t59ub_7VEsLUfp9HCsasJxp1t56SXpWiAjmSkkUm5l30lr4";
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return headers
    },
  }),
  endpoints: (builder) => ({
    // buscarClientes: builder.query<ClientSearchResult, { criterio: string; valor: string }>({
    //   query: ({ criterio, valor }) => `/clientes/search?criterio=${criterio}&valor=${valor}`,
    // }),
    traerCliente: builder.mutation<ClientResult, ClientePayload>({
      query: (body) => ({
        url: `/insured-by-key`,
        method: "POST",
        body,
      }),
    }),
    calcularPrima: builder.mutation<PrimaResponse, CalcPrimaPayload>({
      query: (body) => ({
        url: `/ventas/calculo-prima`,
        method: "POST",
        body,
      }),
    }),
    calcularFechaFinViaje: builder.query<any, any>({
      query: (arg) => `/ventas/calculate-travel-validity-dates/${arg.numero_producto}/${arg.numero_plan}/${arg.fecha_inicio_vigencia}`,
    }),
    // no se va a usar, usado en aramis
    // traerCoberturas: builder.query<any, any>({
    //   query: (arg) => `/products/plan-coberts/${arg.clave_asegurado}/${arg.numero_asegurado}/${arg.numero_producto}/${arg.numero_plan}`,
    // }),
    traerCoberturas: builder.query<any, any>({
      query: (arg) => `/products/plan-coberts/${arg.numero_producto}/${arg.numero_plan}`,
    }),
    // no se va a usar, usado en aramis
    traerPolizas: builder.query<any[], number | undefined>({
      query: (id_asegurado) => `/products/insured/${id_asegurado}`,
    }),
    traerProductosVendibles: builder.query<any, void>({
      query: () => `/products/marketable`,
    }),
    // no se vaa a usar, usado en aramis
    traerProductosDisponibles: builder.query<any, { fc_clave_asegurado: any, fi_numero_asegurado: any }>({
      query: (arg) => `/products/insured/${arg.fc_clave_asegurado}/${arg.fi_numero_asegurado}/avaliable-products`,
    }),
    traerPlanes: builder.query<any, { numero_producto: number }>({
      query: (arg) => `/products/info/plans/${arg.numero_producto}`,
      transformResponse: (response:any) => response.data,
    }),
    // no se usa, usado en config de productos
    traerCoberturasProducto: builder.query<any, { numero_producto: number }>({
      query: (arg) => `/products/details/${arg.numero_producto}`,
      transformResponse: (response:any) => response.data,
    }),
    
    traerTiposAsegurado: builder.query<any, void>({
      query: () => `insured-types`,
    }),

    traerEstadosCiviles: builder.query<any, void>({
      query: () => `marital-status`,
    }),

    traerEstadosRepublica: builder.query<any, void>({
      query: () => `republic-states`,
    }),
    traerParentescos: builder.query<any, void>({
      query: () => `/poliza/beneficiarios/parentescos`,
    }),

    traerRegimenesFiscales: builder.query<any, void>({
      query: () => `endosos/regimenes-fiscales`,
    }),

    guardarVenta: builder.mutation<any, VentaPayload>({
      query: (data) => ({
        url: `/ventas/create`,
        method: 'POST',
        body: data,
      }),
    }),
    guardarVentaTravel: builder.mutation<any, VentaPayload>({
      query: (data) => ({
        url: `/ventas/travel`,
        method: 'POST',
        body: data,
      }),
    }),

    validarVenta: builder.mutation<any, { venta_id: number; data: any }>({
      query: ({ venta_id, data }) => ({
        url: `/ventas/validacion/${venta_id}`,
        method: 'PUT',
        body: data,
      }),
    }),
    validarVentaTravel: builder.mutation<any, { venta_id: number; data: any }>({
      query: ({ venta_id, data }) => ({
        url: `/ventas/travel/validacion/${venta_id}`,
        method: 'PUT',
        body: data,
      }),
    }),
    checarDuplicidad: builder.mutation<any, any>({
      query: ( body ) => ({
        url: `/duplicados`,
        method: 'POST',
        body,
      }),
    }),
  }),
})

export const {
  // useBuscarClientesQuery, 
  useTraerClienteMutation,
  useCalcularPrimaMutation,
  useLazyCalcularFechaFinViajeQuery,
  useLazyTraerCoberturasQuery,
  useLazyTraerCoberturasProductoQuery,
  useTraerPolizasQuery,
  useTraerProductosVendiblesQuery,
  useTraerProductosDisponiblesQuery,
  useLazyTraerPlanesQuery,
  useTraerTiposAseguradoQuery,
  useTraerEstadosCivilesQuery,
  useTraerEstadosRepublicaQuery,
  useTraerParentescosQuery,
  useTraerRegimenesFiscalesQuery,
  useGuardarVentaMutation,
  useGuardarVentaTravelMutation,
  useValidarVentaMutation,
  useValidarVentaTravelMutation,
  useChecarDuplicidadMutation,
} = elegirClienteApi
