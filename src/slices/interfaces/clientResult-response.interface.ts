export interface ClientResult {
    personales?:         Personales;
    verbal_data?:        VerbalData;
    verbal_id?:          VerbalID;
    informacion_fiscal?: InformacionFiscal;
}

export interface InformacionFiscal {
    fc_rfc_fiscal?:                 null;
    fc_clave_asegurado?:            string;
    fc_nacionalidad?:               null;
    fc_tipo_persona?:               string;
    fc_email?:                      null;
    fc_nombre_fiscal?:              null;
    fc_apellido_paterno_fiscal?:    null;
    fc_apellido_materno_fiscal?:    null;
}

export interface Personales {
    id?:                          number;
    fi_numero_cliente?:           string;
    fc_clave_asegurado?:          string;
    fi_numero_asegurado?:         string;
    fc_nombre_asegurado?:         string;
    fc_email?:                    string;
    fc_rfc?:                      string;
    fc_sexo?:                     string;
    fi_fecha_nacimiento?:         string;
    fi_estado_civil?:             string;
    fc_direccion?:                string;
    fc_complemento?:              string;
    fc_colonia?:                  string;
    fc_numero?:                   string;
    fc_ciudad?:                   string;
    fi_estado?:                   string;
    fc_codigo_postal?:            string;
    fc_profesion?:                string;
    fc_codarea_telefono_casa?:    string;
    fc_telefono_casa?:            string;
    fc_ext_telefono_casa?:        string;
    fc_codarea_telefono_comp?:    string;
    fc_telefono_comp?:            string;
    fc_ext_telefono_comp?:        string;
    fc_codarea_tel_celular_fax?:  string;
    fc_telefono_celular_fax?:     string;
    fc_ext_telefono_celular_fax?: string;
    fi_fecha_inclusion?:          string;
    fi_file_id?:                  string;
    fi_numero_producto?:          string;
    fc_nombres_asegurado?:        string;
    fc_apellido_paterno?:         string;
    fc_apellido_materno?:         string;
    fc_mgm?:                      string;
    fc_curp?:                     string;
    fi_edad?:                     number;
}

export interface VerbalData {
    asegurado_id?:           number;
    user_id?:                number;
    llamada_id?:             string;
    vid?:                    string;
    nombre_completo?:        string;
    celular?:                string;
    casa_tel?:               string;
    tel_oficina?:            string;
    direccion?:              string;
    codigo_postal_alcaldia?: string;
    nombre_estado?:          string;
    rfc?:                    string;
    fecha_nacimiento?:       Date;
    fecha_ultimo_cargo?:     Date;
    colonia?:                string;
    ciudad?:                 string;
    updated_at?:             Date;
    created_at?:             Date;
    id?:                     number;
}

export interface VerbalID {
    questions?: Questions;
}

export interface Questions {
    respuesta_nombre_completo?:  null;
    respuesta_celular?:          null;
    respuesta_casa_tel?:         null;
    respuesta_postal_alcaldia?:  null;
    respuesta_estado?:           null;
    respuesta_rfc?:              null;
    respuesta_fecha_nacimiento?: null;
    rfc?:                        string;
    phones?:                     Phones;
    adress?:                     Adress;
    dates?:                      Dates;
}

export interface Adress {
    direccion?:     string;
    codigo_postal?: string;
    direccion_a?:   string;
    direccion_b?:   string;
}

export interface Dates {
    fecha_nacimiento?: Date;
}

export interface Phones {
    casa?: string;
    cel?:  string;
}