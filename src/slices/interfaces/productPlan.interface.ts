export interface Product {
  id: number;
  fc_descripcion_producto?: string;
  fc_descripcion_aseguradora?: string;
  moneda?: string;
}

export interface Plan {
    fi_id_plan?:                string;
    fc_descripcion_plan?:       string;
}