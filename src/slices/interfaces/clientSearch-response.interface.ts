export interface ClientSearchResult {
    current_page:    number;
    data?:           Datum[];
    first_page_url?: string;
    from?:           number;
    last_page?:      number;
    last_page_url?:  string;
    links?:          Link[];
    next_page_url?:  string | null;
    path?:           string;
    per_page?:       number;
    prev_page_url?:  string | null;
    to?:             number;
    total?:          number;
    message?:        string;
}

export interface Datum {
    clave_asegurado: string;
    name:            string;
    rfc:             string;
    tipo_asegurado:  string;
    id:              string;
}

export interface Link {
    url:    null | string;
    label:  string;
    active: boolean;
}
