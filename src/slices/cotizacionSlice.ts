// src/slices/cotizacionSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { PersonaObject, VentaPayload } from './interfaces/ventaPayload.interface'
import { Product, Plan } from './interfaces/productPlan.interface'
import { Cobertura } from './interfaces/cobertura.interface';


interface ChecarDuplicidadData {
  rfc?: string;
  nombre?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  fecha_nacimiento?: string;
  numero_producto?: number;
  tipo_plan?: string;
}

interface FechasVigencia {
  fecha_inicio_vigencia?: string;
  fecha_fin_vigencia?: string;
}
interface VentaProceso {
  producto_plan: boolean;
  checar_duplicidad: boolean;
  datos_poliza: boolean;
  resumen_pago: boolean;
  ventaExitosa: boolean;
}
interface FormulariosValidados {
  titularValido: boolean;
  contratanteValido: boolean;
  datosFiscalesValidos: boolean;
  fechasViajeValidas: boolean;
}

interface CotizacionState {
  steps: string[];
  step: string;
  product: Product;
  plan: Plan;
  checarDuplicidadData: ChecarDuplicidadData;
  coberturas: Cobertura[];
  fechas_vigencia: FechasVigencia;
  validForms: Record<string, boolean>;
  ventaPayload: VentaPayload;
  ventaProceso: VentaProceso;
  formulariosValidados: FormulariosValidados;
  polizaVentaResponse: any;
  paymentMethod?: any;
}

const initialState: CotizacionState = {
  steps: ["producto_plan", "checar_duplicidad", "datos_poliza", "resumen_pago"],
  step: "producto_plan",
  product: { id: 0 },
  plan: {},
  checarDuplicidadData: {},
  coberturas: [],
  fechas_vigencia: {},
  validForms: {},
  ventaPayload: {},
  ventaProceso: {
    producto_plan: false,
    checar_duplicidad: false,
    datos_poliza: false,
    resumen_pago: false,
    ventaExitosa: false,
  },
  formulariosValidados: {
    titularValido: false,
    contratanteValido: false,
    datosFiscalesValidos: false,
    fechasViajeValidas: false,
  },
  polizaVentaResponse: {},
  paymentMethod: null,
}

const cotizacionSlice = createSlice({
  name: 'cotizacion',
  initialState,
  reducers: {
    setStep: (state, action: PayloadAction<string>) => {
      state.step = action.payload;
    },
    setProduct: (state, action: PayloadAction<Product>) => {
      state.product = action.payload
    },
    setPlan: (state, action: PayloadAction<Plan>) => {
      state.plan = action.payload
    },
    setCheckDuplicateData: (state, action: PayloadAction<any>) => {
      state.checarDuplicidadData = action.payload
    },
    setCoberturas: (state, action: PayloadAction<Cobertura[]>) => {
      state.coberturas = action.payload
    },
    addCobertura: (state, action: PayloadAction<Cobertura>) => {
      const exists = state.coberturas.some(c => c.id === action.payload.id)
      if (!exists) {
        state.coberturas.push(action.payload)
      }
    },
    resetCoberturas: (state) => {
      state.coberturas = []
    },
    setBeneficiarios: (state) => {
      state.ventaPayload.beneficiarios = []
    },
    addBeneficiario: (state, action: PayloadAction<{ beneficiario: PersonaObject, index: number }>) => {
      const { beneficiario, index } = action.payload;
      // verificar si el índice esta dentro del rango actual del array
      const isIndexInBounds = state.ventaPayload.beneficiarios && index >= 0 && index < state.ventaPayload.beneficiarios.length;

      if (isIndexInBounds && state.ventaPayload.beneficiarios) {
        // si ya existe en ese indice se actualiza
        state.ventaPayload.beneficiarios[index] = beneficiario;
        console.log(`se actualizó en el índice ${index}`);
      } else if (state.ventaPayload.beneficiarios) {
        // si el indice esta fuera de rango se agrega al final
        state.ventaPayload.beneficiarios.push(beneficiario);
        console.log("se guardó al final");
      } else {
        console.log("error al guardar")
      }
    },
    removeBeneficiario: (state, action: PayloadAction<number>) => {
      const index = action.payload;
      if (state.ventaPayload.beneficiarios && index >= 0 && index < state.ventaPayload.beneficiarios.length) {
        state.ventaPayload.beneficiarios.splice(index, 1); // elimina el objeto
        console.log(`Se eliminó el beneficiario en el índice ${index}`);
      }
    },
    setDependientes: (state) => {
      state.ventaPayload.dependientes = []
    },
    addDependiente: (state, action: PayloadAction<{ dependiente: PersonaObject, index: number }>) => {
      const { dependiente, index } = action.payload;
      // verificar si el índice esta dentro del rango actual del array
      const isIndexInBounds = state.ventaPayload.dependientes && index >= 0 && index < state.ventaPayload.dependientes.length;

      if (isIndexInBounds && state.ventaPayload.dependientes) {
        // si ya existe en ese indice se actualiza
        state.ventaPayload.dependientes[index] = dependiente;
        console.log(`se actualizó en el índice ${index}`);
      } else if (state.ventaPayload.dependientes) {
        // si el indice esta fuera de rango se agrega al final
        state.ventaPayload.dependientes.push(dependiente);
        console.log("se guardó al final");
      } else {
        console.log("error al guardar dependiente")
      }
    },
    removeDependiente: (state, action: PayloadAction<number>) => {
      const index = action.payload;
      if (state.ventaPayload.dependientes && index >= 0 && index < state.ventaPayload.dependientes.length) {
        state.ventaPayload.dependientes.splice(index, 1); // elimina el objeto
        console.log(`Se eliminó el beneficiario en el índice ${index}`);
      }
    },
    setFechasVigencia: (state, action: PayloadAction<FechasVigencia>) => {
      state.fechas_vigencia = action.payload
    },
    setFormValid: (
      state,
      action: PayloadAction<{ form: string; valid: boolean }>
    ) => {
      state.validForms[action.payload.form] = action.payload.valid;
    },
    setProductoPlan: (state, action: PayloadAction<VentaPayload>) => {
      state.ventaPayload.producto_actual_id = action.payload.producto_actual_id
      state.ventaPayload.plan_actual_id = action.payload.plan_actual_id
    },
    setVentaData: (state, action: PayloadAction<VentaPayload>) => {
      state.ventaPayload.llamada_id = action.payload.llamada_id
      state.ventaPayload.user_id = action.payload.user_id
      state.ventaPayload.fc_clave_asegurado = action.payload.fc_clave_asegurado
      // state.ventaPayload.producto_actual_id = action.payload.producto_actual_id
      // state.ventaPayload.plan_actual_id = action.payload.plan_actual_id
      state.ventaPayload.comentarios = action.payload.comentarios
      // state.ventaPayload.prima = action.payload.prima
      // state.ventaPayload.identificador_guard = action.payload.identificador_guard
      state.ventaPayload.token_card = action.payload.token_card
      state.ventaPayload.beneficiario_heredero = action.payload.beneficiario_heredero
      state.ventaPayload.fi_numero_cliente = action.payload.fi_numero_cliente
      state.ventaPayload.tipo_venta = action.payload.tipo_venta
      // state.ventaPayload.fc_pregunta = action.payload.fc_pregunta
      state.ventaPayload.campana = action.payload.campana
    },
    resetVentaPayload: (state) => {
      state.ventaPayload = {}
    },
    setFechaInicioViaje: (state, action: PayloadAction<any>) => {
      state.ventaPayload.fecha_inicio_viaje = action.payload
    },
    setFechaFinViaje: (state, action: PayloadAction<any>) => {
      state.ventaPayload.fecha_fin_viaje = action.payload
    },
    setContratante: (state, action: PayloadAction<PersonaObject>) => {
      state.ventaPayload.contratante = action.payload
    },
    setTitular: (state, action: PayloadAction<PersonaObject>) => {
      state.ventaPayload.titular = action.payload
    },
    setDatosFiscales: (state, action: PayloadAction<PersonaObject>) => {
      state.ventaPayload.datos_fiscales = action.payload
    },
    setBienAsegurado: (state, action: PayloadAction<PersonaObject>) => {
      state.ventaPayload.bien_asegurado = action.payload
    },
    setProductoSuccess: (state, action: PayloadAction<boolean>) => {
      state.ventaProceso.producto_plan = action.payload
    },
    setDuplicidadSuccess: (state, action: PayloadAction<boolean>) => {
      state.ventaProceso.checar_duplicidad = action.payload
    },
    setDatosSuccess: (state, action: PayloadAction<boolean>) => {
      state.ventaProceso.datos_poliza = action.payload
    },
    setResumenSuccess: (state, action: PayloadAction<boolean>) => {
      state.ventaProceso.resumen_pago = action.payload
    },
    setVentaExitosa: (state, action: PayloadAction<boolean>) => {
      state.ventaProceso.ventaExitosa = action.payload
    },

    setValidarTitular: (state, action: PayloadAction<boolean>) => {
      state.formulariosValidados.titularValido = action.payload
    },
    setValidarContratante: (state, action: PayloadAction<boolean>) => {
      state.formulariosValidados.contratanteValido = action.payload
    },
    setValidarDatosFiscales: (state, action: PayloadAction<boolean>) => {
      state.formulariosValidados.datosFiscalesValidos = action.payload
    },
    setValidarFechasViaje: (state, action: PayloadAction<boolean>) => {
      state.formulariosValidados.fechasViajeValidas = action.payload
    },
    resetFormularios: (state) => {
      state.formulariosValidados = {
        titularValido: false,
        contratanteValido: false,
        datosFiscalesValidos: false,
        fechasViajeValidas: false,
      }
    },
    resetVentaProceso: (state) => {
      state.ventaProceso = {
        producto_plan: false,
        checar_duplicidad: false,
        datos_poliza: false,
        resumen_pago: false,
        ventaExitosa: false,
      }
    },
    resetChecarDuplicidad: (state) => {
      state.checarDuplicidadData = {}
    },
    setPrima: (state, action: PayloadAction<string | undefined>) => {
      state.ventaPayload.prima = action.payload
    },
    setTokenCard: (state, action: PayloadAction<string | undefined>) => {
      state.ventaPayload.token_card = action.payload
    },
    setClaveAsegurado: (state, action: PayloadAction<string | undefined>) => {
      state.ventaPayload.fc_clave_asegurado = action.payload
    },
    setIdentificadorGuard: (state, action: PayloadAction<string | undefined>) => {
      state.ventaPayload.identificador_guard = action.payload
    },
    setPolizaVentaResponse: (state, action: PayloadAction<any>) => {
      state.polizaVentaResponse = action.payload
    },
    setPaymentMethod: (state, action: PayloadAction<number>) => {
      state.paymentMethod = action.payload;
    },
    resetCotizacion: () => initialState,
  },
})

export const {
  setStep,
  setProduct,
  setPlan,
  setCheckDuplicateData,
  setCoberturas,
  addCobertura,
  resetCoberturas,
  setBeneficiarios,
  addBeneficiario,
  removeBeneficiario,
  setDependientes,
  addDependiente,
  removeDependiente,
  setFechasVigencia,
  setFormValid,
  resetVentaPayload,
  setProductoPlan,
  setVentaData,
  setContratante,
  setTitular,
  setDatosFiscales,
  setBienAsegurado,
  setProductoSuccess,
  setDuplicidadSuccess,
  setResumenSuccess,
  setDatosSuccess,
  setVentaExitosa,
  setValidarTitular,
  setValidarContratante,
  setValidarDatosFiscales,
  setValidarFechasViaje,
  resetFormularios,
  resetVentaProceso,
  resetChecarDuplicidad,
  setPrima,
  setTokenCard,
  setClaveAsegurado,
  setIdentificadorGuard,
  setPolizaVentaResponse,
  setFechaInicioViaje,
  setFechaFinViaje,
  setPaymentMethod,
  resetCotizacion,
} = cotizacionSlice.actions

export default cotizacionSlice.reducer
