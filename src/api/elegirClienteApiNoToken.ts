// src/api/elegirClienteApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { VentaPayload } from '@/slices/interfaces/ventaPayload.interface';

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


export const elegirClienteApiNoToken = createApi({
  reducerPath: 'elegirClienteApiNoToken',
  baseQuery: fetchBaseQuery({
  baseUrl: baseUrl + path, 
  prepareHeaders: (headers) => {
    return headers;
  },
}),
  endpoints: (builder) => ({
   
    guardarVenta: builder.mutation<any, VentaPayload >({
      query: ( data ) => ({
        url: `/ventas/externas/store`,
        method: 'POST',
        body: data,
      }),
    }),
    guardarVentaTravel: builder.mutation<any, VentaPayload>({
      query: ( data ) => ({
        url: `/ventas/externas/store-travel`,
        method: 'POST',
        body: data,
      }),
    }),
  
    validarVenta: builder.mutation<any, { venta_id: number; data: any }>({
      query: ({ venta_id, data }) => ({
        url: `/ventas/externas/validate/${venta_id}`,
        method: 'PUT',
        body: data,
      }),
    }),
    validarVentaTravel: builder.mutation<any, { venta_id: number; data: any }>({
      query: ({ venta_id, data }) => ({
        url: `/ventas/externas/validate-travel/${venta_id}`,
        method: 'PUT',
        body: data,
      }),
    }),
  }),
})

export const {
  useGuardarVentaMutation,
  useGuardarVentaTravelMutation,
  useValidarVentaMutation,
  useValidarVentaTravelMutation,
} = elegirClienteApiNoToken
