export interface CalcPrimaPayload {
    fi_numero_cliente?:        string;
    fi_numero_producto?:       number;
    fi_numero_plan_campania?:  string;
    fd_fecha_inicio_vigencia?: string;
    asegurados?:               Asegurado[];
}

export interface Asegurado {
    fi_tipo_asegurado?:   number;
    fd_fecha_nacimiento?: string;
}

export interface PrimaResponse {
    message?: string;
    data?:    DataResponse;
}

export interface DataResponse {
    prima_calculada?: string;
}