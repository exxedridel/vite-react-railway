export interface VentaPayload {
    llamada_id?:            string;
    user_id?:               number;
    titular?:               PersonaObject;
    contratante?:           PersonaObject;
    fc_clave_asegurado?:    string;
    producto_actual_id?:    number;
    plan_actual_id?:        string;
    comentarios?:           string;
    prima?:                 string;
    identificador_guard?:   string;
    token_card?:            string;
    beneficiario_heredero?: null;
    fi_numero_cliente?:     string;
    datos_fiscales?:        PersonaObject;
    tipo_venta?:            number;
    fc_pregunta?:           null;
    campana?:               string;
    fecha_inicio_viaje?:    string; // poner en un nuevo tipo de objeto
    fecha_fin_viaje?:       string; // junto con esta
    bien_asegurado?:        PersonaObject;
    beneficiarios?:          PersonaObject[];
    dependientes?:          PersonaObject[];
}

export interface PersonaObject {
    nombre?:                string;
    apellido_paterno?:      string;
    apellido_materno?:      string;
    fecha_nacimiento?:      string;
    rfc?:                   string;
    curp?:                  string;
    genero?:                string;
    estado_civil?:          string;
    telefono_uno?:          string;
    telefono_dos?:          string;
    correo?:                string;
    calle?:                 string;
    numero_exterior?:       string;
    numero_interior?:       string;
    complemento_domicilio?: string;
    colonia?:               string;
    municipio_alcaldia?:    string;
    estado?:                string;
    codigo_postal?:         string;
    regimen_fiscal?:        string;
    direccion?:             string | null;
    parentesco?:            string;
    porcentaje?:            string;
    ascendent?:             boolean;
    descendent?:            boolean;
}