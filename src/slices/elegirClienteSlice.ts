// src/slices/cotizacionSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { ClientSearchResult } from './interfaces/clientSearch-response.interface'
import { ClientResult } from './interfaces/clientResult-response.interface';

export interface FormData {
  is_new: boolean;
  criterio: "nombre" | "rfc" | "poliza";
  nombre?: string | undefined;
  rfc?: string | undefined;
  poliza?: string | undefined;
}

export interface ClientToSend {
  clave_asegurado?: string;
  name?: string;
  rfc?: string;
  tipo_asegurado?: string;
  id?: string;
}

interface elegirClienteState {
  formData: FormData
  searchResult: ClientSearchResult
  cliente: ClientResult
}

const initialState: elegirClienteState = {
  formData: {
    is_new: true,
    criterio: "nombre",
    nombre: "",
    rfc: "",
    poliza: ""
  },
  searchResult: {
    current_page: 1
  },
  cliente: {}
}

const elegirClienteSlice = createSlice({
  name: 'elegirCliente',
  initialState,
  reducers: {
    setFormData: (state, action: PayloadAction<FormData>) => {
      state.formData = action.payload
    },
    resetFormData: (state) => {
      state.formData = {
        is_new: true,
        criterio: "nombre",
        nombre: "",
        rfc: "",
        poliza: ""
      }
    },
    setSearchResult: (state, action: PayloadAction<ClientSearchResult>) => {
      state.searchResult = action.payload
    },
    resetSearchResult: (state) => {
      state.searchResult = {
        current_page: 1
      }
    },
    prevPage: (state) => {
      state.searchResult.current_page -= 1
    },
    nextPage: (state) => {
    state.searchResult.current_page += 1
    },
    setCliente: (state, action: PayloadAction<ClientResult>) => {
      state.cliente = action.payload
    },
    resetElegirCliente: () => initialState
  },
})

export const {
  setFormData,
  resetFormData,
  setSearchResult,
  resetSearchResult,
  prevPage,
  nextPage,
  setCliente,
  resetElegirCliente,
} = elegirClienteSlice.actions

export default elegirClienteSlice.reducer
