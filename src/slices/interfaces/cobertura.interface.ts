export interface Cobertura {
    id?:                               number;
    fi_id_cliente?:                    string;
    fi_id_producto?:                   string;
    fi_id_plan?:                       string;
    fc_descripcion_plan?:              string;
    fc_modalidad?:                     string;
    fi_edad_minima?:                   string;
    fi_edad_maxima?:                   string;
    fi_id_cobertura?:                  string;
    fc_cobertura?:                     string;
    fn_sa?:                            string;
    fc_deducible?:                     string;
    fi_periodo_hospitalizacion_horas?: string;
    fi_periodo_maximo_beneficio_dias?: string;
    fc_periodo_espera_indemnizacion?:  string;
    fc_observaciones?:                 string;
    fn_sa_anterior?:                   string;
    fc_deducible_anterior?:            string;
    fd_inicio_index?:                  string;
    fd_fin_index?:                     string;
    fi_inc_index?:                     string | number;
}